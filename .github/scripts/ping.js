const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');
const { spawnSync } = require('child_process');

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

async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
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

function pingHost(host) {
  if (!host) return { supported: true, ok: false, latency: null, error: 'invalid host' };
  const args = process.platform === 'win32'
    ? ['-n', '1', '-w', String(ICMP_TIMEOUT_SEC * 1000), host]
    : ['-c', '1', '-W', String(ICMP_TIMEOUT_SEC), host];
  const started = performance.now();
  const result = spawnSync('ping', args, {
    encoding: 'utf8',
    timeout: (ICMP_TIMEOUT_SEC + 1) * 1000,
    windowsHide: true
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const match = output.match(/time[=<]\s*([\d.]+)\s*ms/i) || output.match(/Average =\s*(\d+)ms/i);
  return {
    supported: !result.error || result.error.code !== 'ENOENT',
    ok: result.status === 0,
    latency: match ? Number(match[1]) : (result.status === 0 ? Math.round(performance.now() - started) : null),
    error: result.status === 0 ? null : (output.trim().split('\n').pop() || `ping exit ${result.status}`)
  };
}

function probeIcmp(host) {
  if (!host) return { status: 'unsupported', samples: [], avg: null, jitter: null, packetLoss: 100 };
  const samples = [];
  let supported = true;
  for (let i = 0; i < ICMP_SAMPLES; i += 1) {
    const result = pingHost(host);
    supported = result.supported;
    if (result.ok && Number.isFinite(result.latency)) samples.push(result.latency);
    if (i < ICMP_SAMPLES - 1) sleep(50);
  }
  if (!supported) return { status: 'unsupported', samples, avg: null, jitter: null, packetLoss: 100 };
  const packetLoss = Math.round((1 - samples.length / ICMP_SAMPLES) * 100);
  const avg = samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : null;
  const jitter = samples.length > 1
    ? Math.round(samples.slice(1).reduce((sum, value, index) => sum + Math.abs(value - samples[index]), 0) / (samples.length - 1))
    : null;
  return { status: samples.length ? 'up' : 'down', samples, avg, jitter, packetLoss };
}

async function probeHttp(target) {
  const started = performance.now();
  const url = normalizeSiteUrl(target);
  if (!url) return { ok: false, latency: null, httpStatus: null, method: 'HEAD', finalUrl: null, error: 'invalid URL' };
  try {
    let method = 'HEAD';
    let response = await withTimeout(fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'user-agent': 'DualPingMonitor/2.0' }
    }), TIMEOUT_MS);
    if (response.status === 405 || response.status === 501) {
      method = 'GET';
      response = await withTimeout(fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'user-agent': 'DualPingMonitor/2.0', range: 'bytes=0-0' }
      }), TIMEOUT_MS);
    }
    return {
      ok: response.ok || (response.status >= 200 && response.status < 500),
      latency: Math.round(performance.now() - started),
      httpStatus: response.status,
      method,
      finalUrl: response.url,
      error: (response.ok || (response.status >= 200 && response.status < 500)) ? null : `HTTP ${response.status}`
    };
  } catch (error) {
    return { ok: false, latency: null, httpStatus: null, method: 'HEAD', finalUrl: url, error: error.message };
  }
}

async function probeDnsServer(ip) {
  const resolver = new dns.Resolver();
  resolver.setServers([ip]);
  const started = performance.now();
  try {
    const addresses = await withTimeout(resolver.resolve4(DNS_TEST_NAME), TIMEOUT_MS);
    return {
      ok: Array.isArray(addresses) && addresses.length > 0,
      latency: Math.round(performance.now() - started),
      resolved: addresses.slice(0, 3),
      error: null
    };
  } catch (error) {
    return { ok: false, latency: null, resolved: [], error: error.message };
  }
}

async function probeTcp53(ip) {
  const started = performance.now();
  return new Promise(resolve => {
    let settled = false;
    const socket = net.createConnection({ host: ip, port: 53 });
    const finish = payload => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(payload);
    };
    socket.setTimeout(TIMEOUT_MS);
    socket.once('connect', () => finish({ ok: true, latency: Math.round(performance.now() - started), error: null }));
    socket.once('timeout', () => finish({ ok: false, latency: null, error: `timeout after ${TIMEOUT_MS}ms` }));
    socket.once('error', error => finish({ ok: false, latency: null, error: error.message }));
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
      icmp: { status: icmp.status, samples: icmp.samples }
    }
  };
}

function makeDnsRecord(target, timestamp, dnsResult, tcpResult, icmp) {
  const status = dnsResult.ok || tcpResult.ok || icmp.status === 'up' ? 'up' : 'down';
  const basis = dnsResult.ok ? 'dns' : (tcpResult.ok ? 'tcp:53' : (icmp.status === 'up' ? 'icmp' : 'none'));
  return {
    id: target.id,
    name: target.name,
    target: target.ip,
    category: target.category || 'DNS',
    type: 'dns',
    status,
    availability_basis: basis,
    latency: dnsResult.latency ?? tcpResult.latency ?? icmp.avg,
    dns_latency: dnsResult.latency,
    tcp53_latency: tcpResult.latency,
    icmp_latency: icmp.avg,
    icmp_status: icmp.status,
    packet_loss: icmp.packetLoss,
    jitter: icmp.jitter,
    resolved: dnsResult.resolved,
    timestamp,
    checks: {
      dns: { ok: dnsResult.ok, test: DNS_TEST_NAME, error: dnsResult.error },
      tcp53: { ok: tcpResult.ok, error: tcpResult.error },
      icmp: { status: icmp.status, samples: icmp.samples }
    }
  };
}

async function main() {
  const started = performance.now();
  const timestamp = nowIso();
  const config = JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf8'));
  const sites = Array.isArray(config.sites) ? config.sites : [];
  const dnsTargets = Array.isArray(config.dns) ? config.dns : [];
  log(`starting resilient probes: ${sites.length} sites + ${dnsTargets.length} DNS`);

  const siteResults = await mapWithConcurrency(sites, async target => {
    const [http, icmp] = await Promise.all([
      probeHttp(target.url),
      Promise.resolve().then(() => probeIcmp(hostFromTarget(target.url)))
    ]);
    const record = makeSiteRecord(target, timestamp, http, icmp);
    console.log(`${record.status === 'up' ? '✅' : '❌'} ${record.name}: ${record.status.toUpperCase()} (${record.latency ?? '-'}ms via ${record.availability_basis})`);
    return record;
  }, CONCURRENCY);

  const dnsResults = await mapWithConcurrency(dnsTargets, async target => {
    const [dnsResult, tcpResult, icmp] = await Promise.all([
      probeDnsServer(target.ip),
      probeTcp53(target.ip),
      Promise.resolve().then(() => probeIcmp(target.ip))
    ]);
    const record = makeDnsRecord(target, timestamp, dnsResult, tcpResult, icmp);
    console.log(`${record.status === 'up' ? '✅' : '❌'} ${record.name}: ${record.status.toUpperCase()} (${record.latency ?? '-'}ms via ${record.availability_basis})`);
    return record;
  }, CONCURRENCY);

  const results = [...siteResults, ...dnsResults];
  const payload = {
    timestamp,
    source: SOURCE,
    version: 2,
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
      log(`warning: invalid existing data file, rebuilding: ${error.message}`);
    }
  }
  history.push(payload);
  fs.writeFileSync(filePath, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
  log(`saved ${history.length} snapshots to ${filePath}; ${payload.up}/${payload.total} up in ${payload.duration_ms}ms`);
}

main().catch(error => {
  console.error('❌ Fatal monitor error:', error);
  process.exitCode = 1;
});
