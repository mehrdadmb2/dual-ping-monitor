const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http2 = require('http2');
const { spawn } = require('child_process');

const SOURCE = process.env.SOURCE || 'github';
const TARGETS_FILE = process.env.TARGETS_FILE || 'targets.json';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 5000);
const ICMP_TIMEOUT_SEC = Number(process.env.ICMP_TIMEOUT_SEC || 2);
const ICMP_SAMPLES = Math.max(1, Number(process.env.ICMP_SAMPLES || 2));
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 8));
const DNS_TEST_NAME = process.env.DNS_TEST_NAME || 'example.com';

function log(message) { console.log(`[DPM:${SOURCE}] ${message}`); }
function nowIso() { return new Date().toISOString(); }
function dateKey(date = new Date()) { return date.toISOString().slice(0, 10); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function formatError(error) {
  if (!error) return null;
  const parts = [];
  let current = error;
  for (let depth = 0; current && depth < 3; depth += 1, current = current.cause) {
    const code = current.code ? ` [${current.code}]` : '';
    const text = `${current.name || 'Error'}${code}: ${current.message || String(current)}`;
    if (!parts.includes(text)) parts.push(text);
  }
  return parts.join(' <- ').slice(0, 500);
}

function normalizeSiteUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function hostFromTarget(target) {
  const value = normalizeSiteUrl(target);
  try { return value ? new URL(value).hostname : null; } catch { return null; }
}

// Asynchronous child process: spawnSync blocks Node's event loop and can delay
// every HTTP request/timeout while dozens of ICMP pings run one after another.
function pingHost(host) {
  return new Promise(resolve => {
    if (!host) {
      resolve({ supported: true, ok: false, latency: null, error: 'invalid host' });
      return;
    }

    const args = process.platform === 'win32'
      ? ['-n', '1', '-w', String(ICMP_TIMEOUT_SEC * 1000), host]
      : ['-c', '1', '-W', String(ICMP_TIMEOUT_SEC), host];
    const started = performance.now();
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    let child;
    let timer;

    const finish = result => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    try {
      child = spawn('ping', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (error) {
      finish({ supported: false, ok: false, latency: null, error: formatError(error) });
      return;
    }

    child.stdout?.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-6000); });
    child.stderr?.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-3000); });
    child.once('error', error => {
      finish({
        supported: error.code !== 'ENOENT',
        ok: false,
        latency: null,
        error: formatError(error)
      });
    });
    child.once('close', code => {
      const output = `${stdout}\n${stderr}`;
      const match = output.match(/time[=<]\s*([\d.]+)\s*ms/i) || output.match(/Average =\s*(\d+)ms/i);
      const ok = code === 0 && !timedOut;
      finish({
        supported: true,
        ok,
        latency: ok ? (match ? Number(match[1]) : Math.round(performance.now() - started)) : null,
        error: ok ? null : (timedOut ? `ping timeout after ${ICMP_TIMEOUT_SEC + 1}s` : (output.trim().split('\n').filter(Boolean).pop() || `ping exit ${code}`))
      });
    });

    timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch {}
      finish({ supported: true, ok: false, latency: null, error: `ping timeout after ${ICMP_TIMEOUT_SEC + 1}s` });
    }, (ICMP_TIMEOUT_SEC + 1) * 1000);
  });
}

async function probeIcmp(host) {
  if (!host) return { status: 'unsupported', samples: [], avg: null, jitter: null, packetLoss: 100, error: 'invalid host' };
  const samples = [];
  const errors = [];
  let supported = true;
  for (let i = 0; i < ICMP_SAMPLES; i += 1) {
    const result = await pingHost(host);
    supported = result.supported;
    if (result.ok && Number.isFinite(result.latency)) samples.push(result.latency);
    else if (result.error) errors.push(result.error);
    if (i < ICMP_SAMPLES - 1) await sleep(50);
  }
  if (!supported) return { status: 'unsupported', samples, avg: null, jitter: null, packetLoss: 100, error: errors[0] || 'ICMP unavailable' };
  const packetLoss = Math.round((1 - samples.length / ICMP_SAMPLES) * 100);
  const avg = samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : null;
  const jitter = samples.length > 1
    ? Math.round(samples.slice(1).reduce((sum, value, index) => sum + Math.abs(value - samples[index]), 0) / (samples.length - 1))
    : null;
  return { status: samples.length ? 'up' : 'down', samples, avg, jitter, packetLoss, error: samples.length === ICMP_SAMPLES ? null : (errors[0] || null) };
}

async function probeHttp(target) {
  const url = normalizeSiteUrl(target);
  if (!url) return { ok: false, latency: null, httpStatus: null, method: 'HEAD', finalUrl: null, error: 'invalid URL' };

  const started = performance.now();
  let method = 'HEAD';
  let response = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);

  try {
    response = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'DualPingMonitor/3.1 (+https://github.com/mehrdadmb2/dual-ping-monitor)' }
    });
    if (response.status === 405 || response.status === 501) {
      try { await response.body?.cancel(); } catch {}
      method = 'GET';
      response = await fetch(url, {
        method,
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': 'DualPingMonitor/3.1 (+https://github.com/mehrdadmb2/dual-ping-monitor)', range: 'bytes=0-0' }
      });
    }

    const ok = response.status >= 200 && response.status < 500;
    const result = {
      ok,
      latency: Math.round(performance.now() - started),
      httpStatus: response.status,
      method,
      finalUrl: response.url,
      error: ok ? null : `HTTP ${response.status}`
    };
    try { await response.body?.cancel(); } catch {}
    return result;
  } catch (error) {
    return {
      ok: false,
      latency: null,
      httpStatus: null,
      method,
      finalUrl: url,
      error: formatError(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

function makeDnsQuery(name, type = 1) {
  const cleanName = String(name || '').replace(/\.$/, '');
  const labels = cleanName.split('.');
  if (!cleanName || labels.some(label => !label.length || Buffer.byteLength(label) > 63)) {
    throw new Error(`invalid DNS test name: ${name}`);
  }
  const id = crypto.randomBytes(2).readUInt16BE(0);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x0100, 2); // recursion desired
  header.writeUInt16BE(1, 4); // one question
  const qnameParts = [];
  for (const label of labels) {
    const bytes = Buffer.from(label, 'utf8');
    qnameParts.push(Buffer.from([bytes.length]), bytes);
  }
  qnameParts.push(Buffer.from([0]));
  const questionTail = Buffer.alloc(4);
  questionTail.writeUInt16BE(type, 0); // A record
  questionTail.writeUInt16BE(1, 2); // IN class
  return { id, packet: Buffer.concat([header, ...qnameParts, questionTail]) };
}

function skipDnsName(packet, initialOffset) {
  let offset = initialOffset;
  while (offset < packet.length) {
    const length = packet[offset];
    if (length === 0) return offset + 1;
    if ((length & 0xc0) === 0xc0) return offset + 2; // compressed name pointer
    if (length & 0xc0) throw new Error('invalid DNS label encoding');
    offset += length + 1;
  }
  throw new Error('truncated DNS name');
}

function parseDnsResponse(packet, expectedId) {
  if (packet.length < 12) throw new Error('DNS response is shorter than its header');
  const id = packet.readUInt16BE(0);
  const flags = packet.readUInt16BE(2);
  const questions = packet.readUInt16BE(4);
  const answers = packet.readUInt16BE(6);
  const rcode = flags & 0x000f;
  if (id !== expectedId) throw new Error('DNS response ID mismatch');
  if ((flags & 0x8000) === 0) throw new Error('response was not marked as a DNS response');
  if (rcode !== 0) throw new Error(`DNS response code ${rcode}`);

  let offset = 12;
  for (let i = 0; i < questions; i += 1) {
    offset = skipDnsName(packet, offset);
    offset += 4;
    if (offset > packet.length) throw new Error('truncated DNS question');
  }

  const addresses = [];
  for (let i = 0; i < answers; i += 1) {
    offset = skipDnsName(packet, offset);
    if (offset + 10 > packet.length) throw new Error('truncated DNS answer');
    const type = packet.readUInt16BE(offset);
    const recordClass = packet.readUInt16BE(offset + 2);
    const dataLength = packet.readUInt16BE(offset + 8);
    offset += 10;
    if (offset + dataLength > packet.length) throw new Error('truncated DNS answer data');
    if (type === 1 && recordClass === 1 && dataLength === 4) {
      addresses.push([...packet.subarray(offset, offset + 4)].join('.'));
    }
    offset += dataLength;
  }
  return { answers, addresses, rcode };
}

// DNS-over-HTTPS (wire format) is tested over HTTP/2 on port 443. This avoids
// treating restrictions on ICMP or outbound UDP/TCP port 53 as resolver outages.
function probeDnsServer(target) {
  return new Promise(resolve => {
    const started = performance.now();
    let endpoint;
    let query;
    try {
      endpoint = new URL(target.doh_url);
      query = makeDnsQuery(DNS_TEST_NAME, 1);
      if (endpoint.protocol !== 'https:') throw new Error('DoH endpoint must use HTTPS');
    } catch (error) {
      resolve({ ok: false, latency: null, resolved: [], answers: 0, error: formatError(error), transport: 'DoH/HTTP2' });
      return;
    }

    const dnsParam = query.packet.toString('base64url');
    const pathname = `${endpoint.pathname || '/dns-query'}${endpoint.search ? `${endpoint.search}&` : '?'}dns=${encodeURIComponent(dnsParam)}`;
    let session;
    let request;
    let settled = false;
    let responseStatus = null;
    const chunks = [];
    let responseSize = 0;
    let timer;

    const finish = result => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { request?.close(); } catch {}
      try { session?.close(); } catch {}
      resolve(result);
    };

    try {
      session = http2.connect(endpoint.origin, { timeout: TIMEOUT_MS });
      session.once('error', error => finish({ ok: false, latency: null, resolved: [], answers: 0, error: formatError(error), transport: 'DoH/HTTP2' }));
      session.once('timeout', () => finish({ ok: false, latency: null, resolved: [], answers: 0, error: `DoH connect timeout after ${TIMEOUT_MS}ms`, transport: 'DoH/HTTP2' }));
      request = session.request({
        ':method': 'GET',
        ':path': pathname,
        'accept': 'application/dns-message',
        'user-agent': 'DualPingMonitor/3.1 (+https://github.com/mehrdadmb2/dual-ping-monitor)'
      });
      request.on('response', headers => { responseStatus = Number(headers[':status']); });
      request.on('data', chunk => {
        responseSize += chunk.length;
        if (responseSize <= 1024 * 1024) chunks.push(chunk);
        else finish({ ok: false, latency: null, resolved: [], answers: 0, error: 'DNS response exceeded 1 MiB', transport: 'DoH/HTTP2' });
      });
      request.once('error', error => finish({ ok: false, latency: null, resolved: [], answers: 0, error: formatError(error), transport: 'DoH/HTTP2' }));
      request.once('end', () => {
        if (responseStatus < 200 || responseStatus >= 300) {
          finish({ ok: false, latency: null, resolved: [], answers: 0, error: `DoH HTTP ${responseStatus ?? 'unknown'}`, transport: 'DoH/HTTP2' });
          return;
        }
        try {
          const parsed = parseDnsResponse(Buffer.concat(chunks), query.id);
          const ok = parsed.rcode === 0 && parsed.answers > 0;
          finish({
            ok,
            latency: Math.round(performance.now() - started),
            resolved: parsed.addresses.slice(0, 3),
            answers: parsed.answers,
            error: ok ? null : `DNS returned NOERROR but no answer records for ${DNS_TEST_NAME}`,
            transport: 'DoH/HTTP2'
          });
        } catch (error) {
          finish({ ok: false, latency: null, resolved: [], answers: 0, error: formatError(error), transport: 'DoH/HTTP2' });
        }
      });
      timer = setTimeout(() => finish({ ok: false, latency: null, resolved: [], answers: 0, error: `DoH query timeout after ${TIMEOUT_MS}ms`, transport: 'DoH/HTTP2' }), TIMEOUT_MS);
      request.end();
    } catch (error) {
      finish({ ok: false, latency: null, resolved: [], answers: 0, error: formatError(error), transport: 'DoH/HTTP2' });
    }
  });
}

async function mapWithConcurrency(items, worker, limit) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

function makeSiteRecord(target, timestamp, http, icmp) {
  const status = http.ok ? 'up' : (icmp.status === 'up' ? 'up' : 'down');
  const basis = http.ok ? 'https' : (icmp.status === 'up' ? 'icmp' : 'none');
  return {
    id: target.id,
    name: target.name,
    target: target.url,
    category: target.category || 'سایر',
    type: 'site',
    status,
    availability_basis: basis,
    latency: http.ok ? http.latency : icmp.avg,
    http_latency: http.latency,
    http_status: http.httpStatus,
    icmp_latency: icmp.avg,
    icmp_status: icmp.status,
    packet_loss: icmp.packetLoss,
    jitter: icmp.jitter,
    timestamp,
    checks: {
      https: { ok: http.ok, method: http.method, status: http.httpStatus, error: http.error },
      icmp: { status: icmp.status, samples: icmp.samples, error: icmp.error }
    }
  };
}

function makeDnsRecord(target, timestamp, dnsResult) {
  const status = dnsResult.ok ? 'up' : 'down';
  return {
    id: target.id,
    name: target.name,
    target: target.ip,
    category: target.category || 'DNS',
    type: 'dns',
    status,
    availability_basis: dnsResult.ok ? 'dns' : 'none',
    dns_transport: dnsResult.transport || 'DoH/HTTP2',
    latency: dnsResult.latency,
    dns_latency: dnsResult.latency,
    tcp53_latency: null,
    icmp_latency: null,
    icmp_status: 'unsupported',
    packet_loss: dnsResult.ok ? 0 : 100,
    jitter: null,
    resolved: dnsResult.resolved || [],
    answer_count: dnsResult.answers || 0,
    timestamp,
    checks: {
      dns: { ok: dnsResult.ok, test: DNS_TEST_NAME, transport: dnsResult.transport || 'DoH/HTTP2', endpoint: target.doh_url, answers: dnsResult.answers || 0, error: dnsResult.error },
      tcp53: { ok: null, skipped: true, note: 'Not tested; resolver tested using DNS-over-HTTPS over HTTP/2' },
      icmp: { status: 'unsupported', samples: [], error: null, note: 'Not used for DNS endpoint checks' }
    }
  };
}

function diagnosticSuffix(record) {
  if (record.status === 'up') return '';
  const checks = record.checks || {};
  const errors = [];
  for (const [name, check] of Object.entries(checks)) {
    if (!check) continue;
    if (check.error) errors.push(`${name}: ${check.error}`);
  }
  return errors.length ? ` | ${errors.join(' | ').slice(0, 800)}` : '';
}

async function main() {
  const started = performance.now();
  const timestamp = nowIso();
  const config = JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf8'));
  const sites = Array.isArray(config.sites) ? config.sites : [];
  const dnsTargets = Array.isArray(config.dns) ? config.dns : [];
  log(`starting async resilient probes: ${sites.length} sites + ${dnsTargets.length} DNS`);

  const siteResults = await mapWithConcurrency(sites, async target => {
    const [http, icmp] = await Promise.all([
      probeHttp(target.url),
      probeIcmp(hostFromTarget(target.url))
    ]);
    const record = makeSiteRecord(target, timestamp, http, icmp);
    console.log(`${record.status === 'up' ? '✅' : '❌'} ${record.name}: ${record.status.toUpperCase()} (${record.latency ?? '-'}ms via ${record.availability_basis})${diagnosticSuffix(record)}`);
    return record;
  }, CONCURRENCY);

  const dnsResults = await mapWithConcurrency(dnsTargets, async target => {
    const dnsResult = await probeDnsServer(target);
    const record = makeDnsRecord(target, timestamp, dnsResult);
    console.log(`${record.status === 'up' ? '✅' : '❌'} ${record.name}: ${record.status.toUpperCase()} (${record.latency ?? '-'}ms via ${record.availability_basis}/${record.dns_transport})${diagnosticSuffix(record)}`);
    return record;
  }, CONCURRENCY);

  const results = [...siteResults, ...dnsResults];
  const payload = {
    timestamp,
    source: SOURCE,
    version: 3,
    total: results.length,
    up: results.filter(r => r.status === 'up').length,
    down: results.filter(r => r.status === 'down').length,
    duration_ms: Math.round(performance.now() - started),
    results
  };

  const date = dateKey();
  const dataDir = path.join('data', SOURCE);
  const filePath = path.join(dataDir, `${date}.json`);
  fs.mkdirSync(dataDir, { recursive: true });

  let history = [];
  if (fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      history = Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      log(`warning: invalid existing data file, rebuilding: ${formatError(error)}`);
    }
  }
  history.push(payload);
  history = history.slice(-400);
  fs.writeFileSync(filePath, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
  log(`saved ${history.length} snapshots to ${filePath}; ${payload.up}/${payload.total} up in ${payload.duration_ms}ms`);
}

main().catch(error => {
  console.error('❌ Fatal monitor error:', formatError(error));
  process.exitCode = 1;
});
