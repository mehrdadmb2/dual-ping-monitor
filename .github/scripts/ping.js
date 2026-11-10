'use strict';

/**
 * Dual Ping Monitor v4 — GitHub Actions vantage point.
 *
 * The archive uses compact v4 snapshots to keep GitHub Contents API and Pages
 * files small. The live Worker API returns expanded records for diagnostics.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http2 = require('node:http2');
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');

const SOURCE = process.env.SOURCE || 'github';
const TARGETS_FILE = process.env.TARGETS_FILE || 'targets.json';
const DEFAULTS = {
  timeout_ms: 6500,
  icmp_timeout_sec: 2,
  icmp_samples: 3,
  concurrency: 7,
  dns_test_name: 'example.com',
  history_limit: 320
};

function positiveNumber(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

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
  return parts.join(' <- ').slice(0, 420);
}

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function hostFromTarget(target) {
  try { return new URL(normalizeUrl(target) || '').hostname; } catch { return null; }
}

function pingHost(host, timeoutSeconds) {
  return new Promise(resolve => {
    if (!host) {
      resolve({ supported: true, ok: false, latency: null, error: 'Invalid host name' });
      return;
    }

    const args = process.platform === 'win32'
      ? ['-n', '1', '-w', String(timeoutSeconds * 1000), host]
      : ['-c', '1', '-W', String(timeoutSeconds), host];
    const started = performance.now();
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;
    let child;

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

    child.stdout?.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-4000); });
    child.stderr?.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-2000); });
    child.once('error', error => {
      finish({ supported: error.code !== 'ENOENT', ok: false, latency: null, error: formatError(error) });
    });
    child.once('close', code => {
      const output = `${stdout}\n${stderr}`;
      const match = output.match(/time[=<]\s*([\d.]+)\s*ms/i)
        || output.match(/Average =\s*([\d.]+)\s*ms/i);
      const ok = code === 0;
      finish({
        supported: true,
        ok,
        latency: ok ? (match ? Number(match[1]) : Math.round(performance.now() - started)) : null,
        error: ok ? null : (output.trim().split('\n').filter(Boolean).pop() || `ping exit ${code}`)
      });
    });

    timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      finish({ supported: true, ok: false, latency: null, error: `ICMP timeout after ${timeoutSeconds}s` });
    }, (timeoutSeconds + 1) * 1000);
  });
}

async function probeIcmp(host, defaults) {
  if (!host) return { status: 'unsupported', samples: [], avg: null, jitter: null, packetLoss: null, error: 'Invalid host' };
  const samples = [];
  const errors = [];
  let supported = true;
  for (let i = 0; i < defaults.icmp_samples; i += 1) {
    const result = await pingHost(host, defaults.icmp_timeout_sec);
    supported = supported && result.supported;
    if (result.ok && Number.isFinite(result.latency)) samples.push(result.latency);
    else if (result.error) errors.push(result.error);
    if (i < defaults.icmp_samples - 1) await sleep(80);
  }

  if (!supported) {
    return { status: 'unsupported', samples, avg: null, jitter: null, packetLoss: null, error: errors[0] || 'ICMP is not available on this runner' };
  }

  const packetLoss = Math.round((1 - samples.length / defaults.icmp_samples) * 100);
  const avg = samples.length ? Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length) : null;
  const jitter = samples.length > 1
    ? Math.round(samples.slice(1).reduce((sum, value, index) => sum + Math.abs(value - samples[index]), 0) / (samples.length - 1))
    : null;
  return {
    status: samples.length ? (samples.length === defaults.icmp_samples ? 'up' : 'degraded') : 'down',
    samples, avg, jitter, packetLoss,
    error: samples.length === defaults.icmp_samples ? null : (errors[0] || null)
  };
}

function classifyHttp(status) {
  if (status >= 200 && status < 400) return 'up';
  if (status >= 400 && status < 500) return 'degraded';
  return 'down';
}

async function fetchHttpOnce(url, method, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'DualPingMonitor/4.0 (+https://github.com/mehrdadmb2/dual-ping-monitor)',
        accept: '*/*',
        'cache-control': 'no-cache',
        ...(method === 'GET' ? { range: 'bytes=0-0' } : {})
      }
    });
    const latency = Math.round(performance.now() - started);
    const result = {
      status: response.status,
      ok: response.status >= 200 && response.status < 400,
      latency,
      method,
      finalUrl: response.url,
      headers: {
        server: response.headers.get('server'),
        contentType: response.headers.get('content-type'),
        cache: response.headers.get('cf-cache-status') || response.headers.get('x-cache')
      }
    };
    try { await response.body?.cancel(); } catch {}
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function probeHttp(target, defaults) {
  const url = normalizeUrl(target.probe_url || target.url);
  if (!url) return { status: 'down', latency: null, httpLatency: null, httpStatus: null, method: null, finalUrl: null, retryCount: 0, error: 'Invalid or unsupported HTTP URL', headers: {} };

  let lastError = null;
  let finalResult = null;
  let retryCount = 0;
  const maxAttempts = 2;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      let result = await fetchHttpOnce(url, 'HEAD', defaults.timeout_ms);
      if ([405, 501].includes(result.status)) {
        result = await fetchHttpOnce(url, 'GET', defaults.timeout_ms);
      }
      finalResult = result;
      if (result.status < 500 || attempt === maxAttempts - 1) break;
      retryCount += 1;
      await sleep(220);
    } catch (error) {
      lastError = formatError(error);
      if (attempt === maxAttempts - 1) break;
      retryCount += 1;
      await sleep(220);
    }
  }

  if (!finalResult) {
    return {
      status: 'down', latency: null, httpLatency: null, httpStatus: null,
      method: 'HEAD', finalUrl: url, retryCount, error: lastError || 'HTTP request failed', headers: {}
    };
  }

  return {
    status: classifyHttp(finalResult.status),
    latency: finalResult.latency,
    httpLatency: finalResult.latency,
    httpStatus: finalResult.status,
    method: finalResult.method,
    finalUrl: finalResult.finalUrl,
    retryCount,
    error: finalResult.status >= 500 ? `HTTP ${finalResult.status}` : null,
    headers: finalResult.headers
  };
}

function makeDnsQuery(name) {
  const cleanName = String(name || '').trim().replace(/\.$/, '');
  const labels = cleanName.split('.');
  if (!cleanName || cleanName.length > 253 || labels.some(label => !label.length || Buffer.byteLength(label) > 63)) {
    throw new Error(`Invalid DNS test name: ${name}`);
  }
  const id = crypto.randomBytes(2).readUInt16BE(0);
  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(0x0100, 2);
  header.writeUInt16BE(1, 4);
  const parts = [];
  for (const label of labels) {
    const bytes = Buffer.from(label, 'utf8');
    parts.push(Buffer.from([bytes.length]), bytes);
  }
  parts.push(Buffer.from([0]));
  const tail = Buffer.alloc(4);
  tail.writeUInt16BE(1, 0);
  tail.writeUInt16BE(1, 2);
  return { id, packet: Buffer.concat([header, ...parts, tail]) };
}

function skipDnsName(packet, initialOffset) {
  let offset = initialOffset;
  let hops = 0;
  while (offset < packet.length && hops++ < 128) {
    const length = packet[offset];
    if (length === 0) return offset + 1;
    if ((length & 0xc0) === 0xc0) {
      if (offset + 1 >= packet.length) throw new Error('Truncated DNS compression pointer');
      return offset + 2;
    }
    if (length & 0xc0) throw new Error('Invalid DNS label encoding');
    offset += length + 1;
  }
  throw new Error('Malformed or truncated DNS name');
}

function parseDnsResponse(packet, expectedId) {
  if (packet.length < 12) throw new Error('DNS response is shorter than its header');
  const id = packet.readUInt16BE(0);
  const flags = packet.readUInt16BE(2);
  const questions = packet.readUInt16BE(4);
  const answers = packet.readUInt16BE(6);
  const rcode = flags & 0x000f;
  if (id !== expectedId) throw new Error('DNS response ID mismatch');
  if ((flags & 0x8000) === 0) throw new Error('Response is not marked as DNS response');
  if (flags & 0x0200) throw new Error('DNS response was truncated');
  if (rcode !== 0) throw new Error(`DNS response code ${rcode}`);

  let offset = 12;
  for (let i = 0; i < questions; i += 1) {
    offset = skipDnsName(packet, offset) + 4;
    if (offset > packet.length) throw new Error('Truncated DNS question');
  }

  const addresses = [];
  let answerCount = 0;
  for (let i = 0; i < answers; i += 1) {
    offset = skipDnsName(packet, offset);
    if (offset + 10 > packet.length) throw new Error('Truncated DNS answer');
    const type = packet.readUInt16BE(offset);
    const recordClass = packet.readUInt16BE(offset + 2);
    const dataLength = packet.readUInt16BE(offset + 8);
    offset += 10;
    if (offset + dataLength > packet.length) throw new Error('Truncated DNS answer data');
    answerCount += 1;
    if (type === 1 && recordClass === 1 && dataLength === 4) {
      addresses.push([...packet.subarray(offset, offset + 4)].join('.'));
    }
    offset += dataLength;
  }
  return { answerCount, addresses, rcode };
}

function probeDnsServer(target, defaults) {
  return new Promise(resolve => {
    const started = performance.now();
    let endpoint;
    let query;
    const testName = target.test_name || defaults.dns_test_name;
    try {
      endpoint = new URL(target.doh_url);
      query = makeDnsQuery(testName);
      if (endpoint.protocol !== 'https:') throw new Error('DNS-over-HTTPS endpoint must use HTTPS');
    } catch (error) {
      resolve({ ok: false, latency: null, resolved: [], answers: 0, error: formatError(error), transport: 'DoH/HTTP2', testName });
      return;
    }

    const dnsParam = query.packet.toString('base64url');
    endpoint.searchParams.set('dns', dnsParam);
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
      session = http2.connect(endpoint.origin, { timeout: defaults.timeout_ms });
      session.once('error', error => finish({ ok: false, latency: null, resolved: [], answers: 0, error: formatError(error), transport: 'DoH/HTTP2', testName }));
      session.once('timeout', () => finish({ ok: false, latency: null, resolved: [], answers: 0, error: `DoH connection timeout after ${defaults.timeout_ms}ms`, transport: 'DoH/HTTP2', testName }));
      request = session.request({
        ':method': 'GET',
        ':path': `${endpoint.pathname || '/dns-query'}${endpoint.search}`,
        accept: 'application/dns-message',
        'user-agent': 'DualPingMonitor/4.0 (+https://github.com/mehrdadmb2/dual-ping-monitor)'
      });
      request.on('response', headers => { responseStatus = Number(headers[':status']); });
      request.on('data', chunk => {
        responseSize += chunk.length;
        if (responseSize <= 65536) chunks.push(chunk);
        else finish({ ok: false, latency: null, resolved: [], answers: 0, error: 'DNS response exceeded 64 KiB', transport: 'DoH/HTTP2', testName });
      });
      request.once('error', error => finish({ ok: false, latency: null, resolved: [], answers: 0, error: formatError(error), transport: 'DoH/HTTP2', testName }));
      request.once('end', () => {
        if (responseStatus < 200 || responseStatus >= 300) {
          finish({ ok: false, latency: null, resolved: [], answers: 0, error: `DoH HTTP ${responseStatus ?? 'unknown'}`, transport: 'DoH/HTTP2', testName });
          return;
        }
        try {
          const parsed = parseDnsResponse(Buffer.concat(chunks), query.id);
          const ok = parsed.rcode === 0 && parsed.answerCount > 0;
          finish({
            ok,
            latency: Math.round(performance.now() - started),
            resolved: parsed.addresses.slice(0, 3),
            answers: parsed.answerCount,
            error: ok ? null : `DNS returned no answer records for ${testName}`,
            transport: 'DoH/HTTP2',
            testName
          });
        } catch (error) {
          finish({ ok: false, latency: null, resolved: [], answers: 0, error: formatError(error), transport: 'DoH/HTTP2', testName });
        }
      });
      timer = setTimeout(() => finish({ ok: false, latency: null, resolved: [], answers: 0, error: `DoH query timeout after ${defaults.timeout_ms}ms`, transport: 'DoH/HTTP2', testName }), defaults.timeout_ms);
      request.end();
    } catch (error) {
      finish({ ok: false, latency: null, resolved: [], answers: 0, error: formatError(error), transport: 'DoH/HTTP2', testName });
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
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { __error: formatError(error) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

function makeSiteRecord(target, timestamp, http, icmp) {
  let status = http.status;
  let basis = http.httpStatus != null ? 'https' : 'none';
  if (http.httpStatus == null && icmp.status === 'up') {
    status = 'degraded';
    basis = 'icmp';
  }
  const latency = http.httpStatus != null ? http.latency : icmp.avg;
  const healthScore = status === 'up' ? 100 : status === 'degraded' ? 55 : 0;
  return {
    id: target.id,
    name: target.name,
    target: target.url,
    probe_url: target.probe_url || target.url,
    category: target.category || 'سایر',
    group: target.group || 'سایر',
    region: target.region || 'GLOBAL',
    criticality: target.criticality || 'normal',
    tags: target.tags || [],
    type: 'site',
    status,
    reachability: http.httpStatus != null ? 'reachable' : (icmp.status === 'up' ? 'host-reachable' : 'unreachable'),
    health_score: healthScore,
    availability_basis: basis,
    latency,
    http_latency: http.httpLatency,
    http_status: http.httpStatus,
    http_method: http.method,
    final_url: http.finalUrl,
    retry_count: http.retryCount,
    http_headers: http.headers,
    icmp_latency: icmp.avg,
    icmp_status: icmp.status,
    icmp_samples: icmp.samples,
    packet_loss: icmp.packetLoss,
    jitter: icmp.jitter,
    error: http.error || (status === 'down' ? icmp.error : null),
    timestamp,
    checks: {
      http: { ok: http.httpStatus != null && http.httpStatus < 400, status: http.httpStatus, method: http.method, latency_ms: http.httpLatency, retries: http.retryCount, final_url: http.finalUrl, headers: http.headers, error: http.error },
      icmp: { status: icmp.status, samples: icmp.samples, avg_ms: icmp.avg, packet_loss: icmp.packetLoss, jitter_ms: icmp.jitter, error: icmp.error }
    }
  };
}

function makeDnsRecord(target, timestamp, dnsResult) {
  const status = dnsResult.ok ? 'up' : 'down';
  return {
    id: target.id,
    name: target.name,
    target: target.ip,
    doh_url: target.doh_url,
    category: 'DNS',
    group: target.group || 'جهانی',
    region: target.region || 'GLOBAL',
    criticality: 'normal',
    tags: target.tags || ['dns-over-https'],
    type: 'dns',
    status,
    reachability: dnsResult.ok ? 'reachable' : 'unreachable',
    health_score: dnsResult.ok ? 100 : 0,
    availability_basis: dnsResult.ok ? 'dns' : 'none',
    dns_transport: dnsResult.transport || 'DoH/HTTP2',
    dns_test_name: dnsResult.testName || DNS_TEST_NAME,
    latency: dnsResult.latency,
    dns_latency: dnsResult.latency,
    packet_loss: dnsResult.ok ? 0 : 100,
    jitter: null,
    resolved: dnsResult.resolved || [],
    answer_count: dnsResult.answers || 0,
    error: dnsResult.error || null,
    timestamp,
    checks: {
      dns: { ok: dnsResult.ok, test: dnsResult.testName || DNS_TEST_NAME, transport: dnsResult.transport || 'DoH/HTTP2', endpoint: target.doh_url, answers: dnsResult.answers || 0, resolved: dnsResult.resolved || [], error: dnsResult.error }
    }
  };
}

function compactRecord(record) {
  // Compact one-character property names are intentional: 300+ daily snapshots
  // remain comfortably below GitHub Contents API payload limits.
  const row = { i: record.id, s: record.status, l: record.latency, b: record.availability_basis };
  if (record.http_status != null) row.h = record.http_status;
  if (record.http_latency != null) row.hl = record.http_latency;
  if (record.icmp_latency != null) row.il = record.icmp_latency;
  if (record.icmp_status) row.is = record.icmp_status;
  if (record.dns_latency != null) row.dl = record.dns_latency;
  if (record.packet_loss != null) row.pl = record.packet_loss;
  if (record.jitter != null) row.j = record.jitter;
  if (record.error) row.e = String(record.error).slice(0, 150);
  if (record.resolved?.length) row.a = record.resolved.slice(0, 2);
  if (record.answer_count != null) row.ac = record.answer_count;
  if (record.retry_count) row.rt = record.retry_count;
  return row;
}

function compactSnapshot(snapshot) {
  return {
    t: snapshot.timestamp,
    s: snapshot.source,
    v: 4,
    n: snapshot.total,
    u: snapshot.up,
    g: snapshot.degraded,
    d: snapshot.down,
    ms: snapshot.duration_ms,
    r: snapshot.results.map(compactRecord)
  };
}

async function main() {
  const started = performance.now();
  const timestamp = nowIso();
  if (!fs.existsSync(TARGETS_FILE)) throw new Error(`Targets file not found: ${TARGETS_FILE}`);
  const config = JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf8'));
  const configuredDefaults = config.probe_defaults || {};
  const defaults = {
    timeout_ms: positiveNumber(process.env.TIMEOUT_MS || configuredDefaults.timeout_ms, DEFAULTS.timeout_ms, 2000, 15000),
    icmp_timeout_sec: positiveNumber(process.env.ICMP_TIMEOUT_SEC || configuredDefaults.icmp_timeout_sec, DEFAULTS.icmp_timeout_sec, 1, 5),
    icmp_samples: positiveNumber(process.env.ICMP_SAMPLES || configuredDefaults.icmp_samples, DEFAULTS.icmp_samples, 1, 5),
    concurrency: positiveNumber(process.env.CONCURRENCY || configuredDefaults.concurrency, DEFAULTS.concurrency, 1, 12),
    dns_test_name: process.env.DNS_TEST_NAME || configuredDefaults.dns_test_name || DEFAULTS.dns_test_name,
    history_limit: positiveNumber(configuredDefaults.history_limit, DEFAULTS.history_limit, 48, 500)
  };

  const sites = Array.isArray(config.sites) ? config.sites : [];
  const dnsTargets = Array.isArray(config.dns) ? config.dns : [];
  const totalTargets = sites.length + dnsTargets.length;
  if (!sites.length || totalTargets > 50) throw new Error(`Invalid target count: ${sites.length} sites + ${dnsTargets.length} DNS (maximum 50)`);
  log(`v4 starting: ${sites.length} sites + ${dnsTargets.length} DNS | ${defaults.timeout_ms}ms timeout | concurrency ${defaults.concurrency}`);

  const siteResults = await mapWithConcurrency(sites, async target => {
    const [http, icmp] = await Promise.all([
      probeHttp(target, defaults),
      probeIcmp(hostFromTarget(target.url), defaults)
    ]);
    const record = makeSiteRecord(target, timestamp, http, icmp);
    const icon = record.status === 'up' ? '✓' : record.status === 'degraded' ? '!' : '×';
    console.log(`${icon} ${record.name}: ${record.status.toUpperCase()} (${record.latency ?? '-'}ms | HTTP ${record.http_status ?? '—'} | ICMP ${record.icmp_status})${record.error ? ` | ${record.error}` : ''}`);
    return record;
  }, defaults.concurrency);

  const dnsResults = await mapWithConcurrency(dnsTargets, async target => {
    const dnsResult = await probeDnsServer(target, defaults);
    const record = makeDnsRecord(target, timestamp, dnsResult);
    console.log(`${record.status === 'up' ? '✓' : '×'} ${record.name}: ${record.status.toUpperCase()} (${record.latency ?? '-'}ms via DoH)${record.error ? ` | ${record.error}` : ''}`);
    return record;
  }, defaults.concurrency);

  const results = [...siteResults, ...dnsResults].filter(row => !row.__error);
  const payload = {
    timestamp,
    source: SOURCE,
    version: 4,
    schema_version: '4.0',
    total: results.length,
    up: results.filter(row => row.status === 'up').length,
    degraded: results.filter(row => row.status === 'degraded').length,
    down: results.filter(row => row.status === 'down').length,
    duration_ms: Math.round(performance.now() - started),
    platform: 'GitHub Actions / ubuntu-latest',
    probe_type: 'HTTP(S) + ICMP + DNS-over-HTTPS',
    results
  };

  const fileDate = dateKey();
  const dataDir = path.join('data', SOURCE);
  const filePath = path.join(dataDir, `${fileDate}.json`);
  fs.mkdirSync(dataDir, { recursive: true });
  let history = [];
  if (fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      history = Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      log(`warning: invalid existing history will be rebuilt: ${formatError(error)}`);
    }
  }
  history.push(compactSnapshot(payload));
  history = history.slice(-defaults.history_limit);
  fs.writeFileSync(filePath, `${JSON.stringify(history)}\n`, 'utf8');
  log(`saved ${history.length}/${defaults.history_limit} compact snapshots to ${filePath}; UP ${payload.up}, DEGRADED ${payload.degraded}, DOWN ${payload.down} in ${payload.duration_ms}ms`);
}

main().catch(error => {
  console.error('❌ Fatal monitor error:', formatError(error));
  process.exitCode = 1;
});
