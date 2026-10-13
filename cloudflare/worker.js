const VERSION = '3.0.0';
const TARGETS = [
  ['snapp', 'Snapp', 'https://snapp.ir/', 'ایرانی'],
  ['divar', 'Divar', 'https://divar.ir/', 'ایرانی'],
  ['soft98', 'Soft98', 'https://soft98.ir/', 'ایرانی'],
  ['google', 'Google', 'https://www.google.com/generate_204', 'جهانی'],
  ['github', 'GitHub', 'https://github.com/', 'جهانی'],
  ['cloudflare', 'Cloudflare', 'https://www.cloudflare.com/cdn-cgi/trace', 'جهانی'],
  ['wikipedia', 'Wikipedia', 'https://www.wikipedia.org/', 'جهانی'],
  ['chatgpt', 'ChatGPT', 'https://chatgpt.com/', 'جهانی'],
  ['pysmart-home', 'PySmartHome-PC', 'https://mehrdadmb2.github.io/PySmartHome-PC/', 'پروژه‌های شخصی']
];
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Monitor-Token',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Vary': 'Origin'
};
const json = (data, status = 200) => new Response(JSON.stringify(data, null, 2), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
});

function parseTargetOverrides(env) {
  if (!env.TARGETS_JSON) return TARGETS;
  try {
    const rows = JSON.parse(env.TARGETS_JSON);
    if (!Array.isArray(rows) || !rows.length || rows.length > 30) return TARGETS;
    const valid = rows.filter(t => t && typeof t.url === 'string' && isAllowedUrl(t.url));
    return valid.map((t, i) => [String(t.id || `target-${i + 1}`), String(t.name || t.url), t.url, String(t.category || 'custom')]);
  } catch { return TARGETS; }
}
function isAllowedUrl(value) {
  try {
    const u = new URL(value);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return false;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.localhost') || h === 'metadata.google.internal' ||
      /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80:')) return false;
    return true;
  } catch { return false; }
}
async function requestOnce(url, method, signal) {
  return fetch(url, { method, redirect: 'follow', signal, headers: {
    'User-Agent': `DualPingMonitor/${VERSION} (+https://github.com/mehrdadmb2/dual-ping-monitor)`,
    'Accept': '*/*', 'Cache-Control': 'no-cache'
  }});
}
async function probeHttp(target, timeoutMs) {
  const [id, name, url, category] = target;
  const checked = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  const started = Date.now();
  let response = null, error = null, method = 'HEAD', headLatency = null;
  try {
    try {
      response = await requestOnce(url, 'HEAD', controller.signal);
      headLatency = Date.now() - started;
      // A number of hosts reject HEAD. Retry with a tiny ranged GET instead of calling them down.
      if ([400, 403, 405, 501].includes(response.status)) {
        try { await response.body?.cancel(); } catch {}
        method = 'GET';
        response = await requestOnce(url, 'GET', controller.signal);
      }
      try { await response.body?.cancel(); } catch {}
    } catch (e) {
      error = e?.name === 'AbortError' ? `Timed out after ${timeoutMs} ms` : String(e?.message || e).slice(0, 240);
    }
  } finally { clearTimeout(timer); }
  const latency = Date.now() - started;
  const code = response?.status ?? null;
  // Any HTTP response below 500 proves the origin answered; 4xx is not a network outage.
  const status = !response ? 'down' : code >= 500 ? 'down' : 'up';
  return {
    id, name, target: url, category, type: 'site', status,
    availability_basis: response ? 'http-response' : 'none',
    latency: response ? latency : null, http_latency: response ? latency : null,
    http_status: code, packet_loss: response ? 0 : 100, jitter: null,
    timestamp: checked, method, final_url: response?.url || null,
    checks: {
      http: { ok: !!response && code < 500, status: code, method, latency_ms: response ? latency : null,
        head_latency_ms: headLatency, error }
    }, error
  };
}
async function runProbe(env) {
  const started = Date.now();
  const targets = parseTargetOverrides(env);
  const timeout = Math.min(15000, Math.max(2000, Number(env.PROBE_TIMEOUT_MS) || 9000));
  const results = await Promise.all(targets.map(t => probeHttp(t, timeout)));
  const up = results.filter(r => r.status === 'up').length;
  return {
    timestamp: new Date().toISOString(), source: 'cloudflare', version: 3, schema_version: '3.0',
    total: results.length, up, down: results.length - up, duration_ms: Date.now() - started,
    platform: 'Cloudflare Workers', probe_type: 'HTTP/HTTPS', results,
    note: 'Cloudflare Workers do not expose raw ICMP sockets. This source reports real HTTP response checks, not ICMP ping.'
  };
}
async function maybeStore(env, snapshot) {
  // Optional KV binding: use it for the latest snapshot only. No fake history is generated.
  if (env.MONITOR_KV) {
    try { await env.MONITOR_KV.put('latest', JSON.stringify(snapshot), { expirationTtl: 604800 }); } catch (e) { console.error('KV write failed', e); }
  }
  // Optional GitHub persistence. Configure GH_TOKEN as a Worker secret and GH_REPO/GH_BRANCH as vars.
  if (!env.GH_TOKEN || !env.GH_REPO) return;
  const branch = env.GH_BRANCH || 'main';
  const day = snapshot.timestamp.slice(0, 10);
  const path = `data/cloudflare/${day}.json`;
  const api = `https://api.github.com/repos/${env.GH_REPO}/contents/${path}`;
  const headers = { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'DualPingMonitor-Worker' };
  try {
    let sha, history = [];
    const existing = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
    if (existing.ok) {
      const oldFile = await existing.json(); sha = oldFile.sha;
      try {
        const decoded = decodeURIComponent(escape(atob(String(oldFile.content || '').replace(/\s/g, ''))));
        const parsed = JSON.parse(decoded);
        history = Array.isArray(parsed) ? parsed : (parsed && parsed.timestamp ? [parsed] : []);
      } catch { history = []; }
    } else if (existing.status !== 404) throw new Error(`GitHub read failed: ${existing.status}`);
    // Preserve same-day time series for the dashboard. Keep at most 400 samples per day.
    history.push(snapshot);
    history = history.slice(-400);
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(history, null, 2) + '\n')));
    const write = await fetch(api, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `chore(monitor): Cloudflare snapshot ${snapshot.timestamp}`, content, branch, ...(sha ? { sha } : {}) }) });
    if (!write.ok) throw new Error(`GitHub write failed: ${write.status} ${(await write.text()).slice(0, 200)}`);
  } catch (e) { console.error('GitHub snapshot persistence failed', String(e)); }
}
async function latestFromKV(env) {
  if (!env.MONITOR_KV) return null;
  try { return await env.MONITOR_KV.get('latest', 'json'); } catch { return null; }
}
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    const url = new URL(request.url), path = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'GET' && ['/health', '/api/health'].includes(path)) {
      return json({ ok: true, service: 'dual-ping-monitor-edge', version: VERSION, now: new Date().toISOString(), routes: ['/', '/health', '/api/status', '/api/probe'] });
    }
    if (request.method === 'GET' && ['/api/status', '/api/latest'].includes(path)) {
      const cached = await latestFromKV(env);
      if (cached) return json({ ...cached, served_at: new Date().toISOString(), cached: true });
    }
    if (request.method === 'POST' && path === '/api/probe') {
      if (!env.PROBE_TOKEN) return json({ ok: false, error: 'POST probe is disabled until PROBE_TOKEN is configured.' }, 503);
      const token = request.headers.get('X-Monitor-Token') || request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
      if (token !== env.PROBE_TOKEN) return json({ ok: false, error: 'Unauthorized' }, 401);
    }
    if (request.method === 'GET' && ['/','/api/status','/api/latest'].includes(path) || request.method === 'POST' && path === '/api/probe') {
      const snapshot = await runProbe(env);
      ctx.waitUntil(maybeStore(env, snapshot));
      return json(snapshot);
    }
    if (request.method === 'GET' && path === '/api/config') {
      return json({ ok: true, version: VERSION, targets: parseTargetOverrides(env).map(([id,name,url,category]) => ({id,name,url,category})) });
    }
    return json({ ok: false, error: 'Not found', routes: ['GET /health','GET /api/status','GET /api/config','POST /api/probe'] }, 404);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => { const snapshot = await runProbe(env); await maybeStore(env, snapshot); })());
  }
};
