const TARGETS = [
  ['snapp', 'Snapp', 'https://snapp.ir', 'ایرانی'], ['divar', 'Divar', 'https://divar.ir', 'ایرانی'],
  ['soft98', 'Soft98', 'https://soft98.ir', 'ایرانی'], ['google', 'Google', 'https://google.com', 'جهانی'],
  ['github', 'GitHub', 'https://github.com', 'جهانی'], ['cloudflare', 'Cloudflare', 'https://cloudflare.com', 'جهانی'],
  ['wikipedia', 'Wikipedia', 'https://wikipedia.org', 'جهانی'], ['chatgpt', 'ChatGPT', 'https://chatgpt.com', 'جهانی'],
  ['pysmart-home', 'PySmartHome-PC', 'https://mehrdadmb2.github.io/PySmartHome-PC', 'پروژه‌های شخصی']
];

const DNS_TARGETS = [];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-store'
};

async function probeHttp(target) {
  const started = Date.now();
  try {
    const response = await fetch(target[2], { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': 'DualPingMonitor-Cloudflare/2.0' } });
    return { id: target[0], name: target[1], target: target[2], category: target[3], type: 'site', status: response.ok ? 'up' : 'down', availability_basis: 'https', latency: Date.now() - started, http_status: response.status, packet_loss: response.ok ? 0 : 100, jitter: null, timestamp: new Date().toISOString() };
  } catch (error) {
    return { id: target[0], name: target[1], target: target[2], category: target[3], type: 'site', status: 'down', availability_basis: 'none', latency: null, http_status: null, packet_loss: 100, jitter: null, timestamp: new Date().toISOString(), checks: { https: { ok: false, error: error.message } } };
  }
}

async function probeDns(target) {
  return { id: target[0], name: target[1], target: target[2], category: 'DNS', type: 'dns', status: 'down', availability_basis: 'unsupported', latency: null, packet_loss: null, jitter: null, timestamp: new Date().toISOString(), checks: { doh: { ok: false, error: 'Direct arbitrary-resolver probing is not available in Workers.' } } };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const started = Date.now();
    const results = await Promise.all([
      ...TARGETS.map(probeHttp),
      ...DNS_TARGETS.map(probeDns)
    ]);
    const payload = {
      timestamp: new Date().toISOString(),
      source: 'cloudflare',
      version: 2,
      total: results.length,
      up: results.filter(r => r.status === 'up').length,
      down: results.filter(r => r.status === 'down').length,
      duration_ms: Date.now() - started,
      results
    };
    return new Response(JSON.stringify(payload), { headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
  }
};
