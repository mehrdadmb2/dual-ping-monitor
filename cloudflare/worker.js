const VERSION = '4.0.0';
const SCHEMA_VERSION = '4.0';
const DEFAULT_SITES = [{"id":"mci","name":"Hamrah Aval","url":"https://mci.ir/","category":"ایرانی","group":"اپراتور و اینترنت","region":"IR","criticality":"high","tags":["telecom","mobile"]},{"id":"irancell","name":"Irancell","url":"https://irancell.ir/","category":"ایرانی","group":"اپراتور و اینترنت","region":"IR","criticality":"high","tags":["telecom","mobile"]},{"id":"shatel","name":"Shatel","url":"https://www.shatel.ir/","category":"ایرانی","group":"اپراتور و اینترنت","region":"IR","criticality":"normal","tags":["isp","internet"]},{"id":"digikala","name":"Digikala","url":"https://www.digikala.com/","category":"ایرانی","group":"بازار آنلاین","region":"IR","criticality":"high","tags":["shopping","e-commerce"]},{"id":"divar","name":"Divar","url":"https://divar.ir/","category":"ایرانی","group":"بازار آنلاین","region":"IR","criticality":"high","tags":["marketplace","classifieds"]},{"id":"torob","name":"Torob","url":"https://torob.com/","category":"ایرانی","group":"بازار آنلاین","region":"IR","criticality":"normal","tags":["shopping","price-comparison"]},{"id":"snapp","name":"Snapp","url":"https://snapp.ir/","category":"ایرانی","group":"خدمات روزمره","region":"IR","criticality":"high","tags":["transport","ride-hailing"]},{"id":"tapsi","name":"Tapsi","url":"https://tapsi.ir/","category":"ایرانی","group":"خدمات روزمره","region":"IR","criticality":"normal","tags":["transport","ride-hailing"]},{"id":"aparat","name":"Aparat","url":"https://www.aparat.com/","category":"ایرانی","group":"رسانه و محتوا","region":"IR","criticality":"normal","tags":["video","media"]},{"id":"digiato","name":"Digiato","url":"https://digiato.com/","category":"ایرانی","group":"رسانه و محتوا","region":"IR","criticality":"low","tags":["technology","news"]},{"id":"varzesh3","name":"Varzesh3","url":"https://www.varzesh3.com/","category":"ایرانی","group":"رسانه و محتوا","region":"IR","criticality":"normal","tags":["sports","news"]},{"id":"cafebazaar","name":"Cafe Bazaar","url":"https://cafebazaar.ir/","category":"ایرانی","group":"نرم‌افزار و اپلیکیشن","region":"IR","criticality":"normal","tags":["android","apps"]},{"id":"myket","name":"Myket","url":"https://myket.ir/","category":"ایرانی","group":"نرم‌افزار و اپلیکیشن","region":"IR","criticality":"normal","tags":["android","apps"]},{"id":"balad","name":"Balad","url":"https://balad.ir/","category":"ایرانی","group":"نقشه و مسیریابی","region":"IR","criticality":"normal","tags":["maps","navigation"]},{"id":"neshan","name":"Neshan","url":"https://neshan.org/","category":"ایرانی","group":"نقشه و مسیریابی","region":"IR","criticality":"normal","tags":["maps","navigation"]},{"id":"bankmellat","name":"Bank Mellat","url":"https://bankmellat.ir/","category":"ایرانی","group":"پرداخت و بانکداری","region":"IR","criticality":"high","tags":["banking","finance"]},{"id":"bmi","name":"Bank Melli Iran","url":"https://bmi.ir/","category":"ایرانی","group":"پرداخت و بانکداری","region":"IR","criticality":"high","tags":["banking","finance"]},{"id":"shaparak","name":"Shaparak","url":"https://shaparak.ir/","category":"ایرانی","group":"پرداخت و بانکداری","region":"IR","criticality":"high","tags":["payment","banking"]},{"id":"zarinpal","name":"Zarinpal","url":"https://www.zarinpal.com/","category":"ایرانی","group":"پرداخت و بانکداری","region":"IR","criticality":"high","tags":["payment","fintech"]},{"id":"bale","name":"Bale","url":"https://bale.ai/","category":"ایرانی","group":"پیام‌رسان و شبکه اجتماعی","region":"IR","criticality":"normal","tags":["messaging","social"]},{"id":"eitaa","name":"Eitaa","url":"https://eitaa.com/","category":"ایرانی","group":"پیام‌رسان و شبکه اجتماعی","region":"IR","criticality":"normal","tags":["messaging","social"]},{"id":"rubika","name":"Rubika","url":"https://rubika.ir/","category":"ایرانی","group":"پیام‌رسان و شبکه اجتماعی","region":"IR","criticality":"normal","tags":["messaging","social"]},{"id":"cloudflare","name":"Cloudflare","url":"https://www.cloudflare.com/","probe_url":"https://www.cloudflare.com/cdn-cgi/trace","category":"جهانی","group":"توسعه و زیرساخت","region":"GLOBAL","criticality":"high","tags":["cdn","dns","edge"]},{"id":"github","name":"GitHub","url":"https://github.com/","category":"جهانی","group":"توسعه و زیرساخت","region":"GLOBAL","criticality":"high","tags":["git","development"]},{"id":"github-api","name":"GitHub API","url":"https://api.github.com/","category":"جهانی","group":"توسعه و زیرساخت","region":"GLOBAL","criticality":"high","tags":["api","development"]},{"id":"npm-registry","name":"npm Registry","url":"https://registry.npmjs.org/","probe_url":"https://registry.npmjs.org/-/ping","category":"جهانی","group":"توسعه و زیرساخت","region":"GLOBAL","criticality":"high","tags":["npm","packages"]},{"id":"wikipedia","name":"Wikipedia","url":"https://www.wikipedia.org/","category":"جهانی","group":"رسانه و محتوا","region":"GLOBAL","criticality":"low","tags":["knowledge","media"]},{"id":"youtube","name":"YouTube","url":"https://www.youtube.com/","probe_url":"https://www.youtube.com/generate_204","category":"جهانی","group":"رسانه و محتوا","region":"GLOBAL","criticality":"normal","tags":["video","media"]},{"id":"chatgpt","name":"ChatGPT","url":"https://chatgpt.com/","category":"جهانی","group":"هوش مصنوعی","region":"GLOBAL","criticality":"normal","tags":["ai","productivity"]},{"id":"google","name":"Google","url":"https://www.google.com/","probe_url":"https://www.google.com/generate_204","category":"جهانی","group":"وب و جستجو","region":"GLOBAL","criticality":"high","tags":["search","web"]},{"id":"telegram","name":"Telegram","url":"https://telegram.org/","category":"جهانی","group":"پیام‌رسان و شبکه اجتماعی","region":"GLOBAL","criticality":"normal","tags":["messaging","social"]},{"id":"dual-ping-pages","name":"Dual Ping Dashboard","url":"https://mehrdadmb2.github.io/dual-ping-monitor/","category":"پروژه‌های شخصی","group":"GitHub Pages","region":"PERSONAL","criticality":"high","tags":["monitoring","github-pages","self-check"]},{"id":"github-page-insights","name":"GitHub Page Insights","url":"https://mehrdadmb2.github.io/github-page-insights/","category":"پروژه‌های شخصی","group":"GitHub Pages","region":"PERSONAL","criticality":"normal","tags":["analytics","github-pages"]},{"id":"githuby-card","name":"GitHuby Card Studio","url":"https://mehrdadmb2.github.io/githuby-card-studio/","category":"پروژه‌های شخصی","group":"GitHub Pages","region":"PERSONAL","criticality":"normal","tags":["personal","github-pages"]},{"id":"imdb-showcase","name":"IMDb Showcase","url":"https://mehrdadmb2.github.io/imdb-showcase/","category":"پروژه‌های شخصی","group":"GitHub Pages","region":"PERSONAL","criticality":"low","tags":["personal","github-pages"]},{"id":"mehrdad-dev","name":"Mehrdad Dev","url":"https://mehrdadmb2.github.io/mehrdad-dev/","category":"پروژه‌های شخصی","group":"GitHub Pages","region":"PERSONAL","criticality":"high","tags":["portfolio","github-pages"]},{"id":"pysmart-home","name":"PySmartHome PC","url":"https://mehrdadmb2.github.io/PySmartHome-PC/","category":"پروژه‌های شخصی","group":"GitHub Pages","region":"PERSONAL","criticality":"normal","tags":["personal","github-pages"]},{"id":"v2ray-sub","name":"V2ray Sub","url":"https://mehrdadmb2.github.io/V2ray_Sub/","category":"پروژه‌های شخصی","group":"GitHub Pages","region":"PERSONAL","criticality":"normal","tags":["personal","github-pages"]}];
const DEFAULT_DNS = [{"id":"cloudflare-dns","name":"Cloudflare DNS","ip":"1.1.1.1","doh_url":"https://cloudflare-dns.com/dns-query","category":"DNS","group":"جهانی","region":"GLOBAL","tags":["privacy","dns-over-https"]},{"id":"google-dns","name":"Google DNS","ip":"8.8.8.8","doh_url":"https://dns.google/dns-query","category":"DNS","group":"جهانی","region":"GLOBAL","tags":["public-resolver","dns-over-https"]},{"id":"quad9","name":"Quad9","ip":"9.9.9.9","doh_url":"https://dns.quad9.net/dns-query","category":"DNS","group":"جهانی","region":"GLOBAL","tags":["security","dns-over-https"]},{"id":"adguard-dns","name":"AdGuard DNS","ip":"94.140.14.14","doh_url":"https://dns.adguard-dns.com/dns-query","category":"DNS","group":"جهانی","region":"GLOBAL","tags":["privacy","filtering"]},{"id":"alidns","name":"AliDNS","ip":"223.5.5.5","doh_url":"https://dns.alidns.com/dns-query","category":"DNS","group":"منطقه‌ای","region":"ASIA","tags":["regional","dns-over-https"]},{"id":"dnspod","name":"DNSPod","ip":"119.29.29.29","doh_url":"https://doh.pub/dns-query","category":"DNS","group":"منطقه‌ای","region":"ASIA","tags":["regional","dns-over-https"]}];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Monitor-Token',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Vary': 'Origin'
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
});

function isAllowedUrl(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === 'metadata.google.internal') return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return false;
    const private172 = host.match(/^172\.(\d+)\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
    if (host === '::' || host === '::1' || /^(fc|fd|fe80:)/i.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function parseSiteOverrides(env) {
  if (!env.TARGETS_JSON) return DEFAULT_SITES;
  try {
    const rows = JSON.parse(env.TARGETS_JSON);
    if (!Array.isArray(rows) || !rows.length || rows.length > 42) return DEFAULT_SITES;
    return rows.filter(row => row && typeof row.url === 'string' && isAllowedUrl(row.url) && isAllowedUrl(row.probe_url || row.url))
      .map((row, index) => ({
        id: String(row.id || `site-${index + 1}`),
        name: String(row.name || row.url),
        url: row.url,
        probe_url: row.probe_url || row.url,
        category: String(row.category || 'سایر'),
        group: String(row.group || 'سایر'),
        region: String(row.region || 'GLOBAL'),
        criticality: String(row.criticality || 'normal'),
        tags: Array.isArray(row.tags) ? row.tags.slice(0, 12) : []
      }));
  } catch {
    return DEFAULT_SITES;
  }
}

function parseDnsOverrides(env) {
  if (!env.DNS_TARGETS_JSON) return DEFAULT_DNS;
  try {
    const rows = JSON.parse(env.DNS_TARGETS_JSON);
    if (!Array.isArray(rows) || !rows.length || rows.length > 10) return DEFAULT_DNS;
    return rows.filter(row => row && typeof row.doh_url === 'string' && isAllowedUrl(row.doh_url))
      .map((row, index) => ({
        id: String(row.id || `dns-${index + 1}`),
        name: String(row.name || row.doh_url),
        ip: String(row.ip || ''),
        doh_url: row.doh_url,
        group: String(row.group || 'جهانی'),
        region: String(row.region || 'GLOBAL'),
        tags: Array.isArray(row.tags) ? row.tags.slice(0, 12) : []
      }));
  } catch {
    return DEFAULT_DNS;
  }
}

function classifyHttp(status) {
  if (status >= 200 && status < 400) return 'up';
  if (status >= 400 && status < 500) return 'degraded';
  return 'down';
}

async function requestTarget(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: 'GET',
      // Redirects are treated as reachable 3xx responses. Manual handling keeps
      // each target to one outbound request and protects the Workers subrequest budget.
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': `DualPingMonitor/${VERSION} (+https://github.com/mehrdadmb2/dual-ping-monitor)`,
        'Accept': '*/*',
        'Cache-Control': 'no-cache',
        'Range': 'bytes=0-0'
      }
    });
    const latency = Date.now() - started;
    const result = {
      status: response.status,
      latency,
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

async function probeHttp(target, timeoutMs) {
  const checked = new Date().toISOString();
  const url = target.probe_url || target.url;
  let response = null;
  let error = null;
  try {
    response = await requestTarget(url, timeoutMs);
  } catch (err) {
    error = err?.name === 'AbortError' || String(err).includes('timeout')
      ? `Timed out after ${timeoutMs} ms`
      : String(err?.message || err).slice(0, 240);
  }
  const code = response?.status ?? null;
  const status = response ? classifyHttp(code) : 'down';
  return {
    id: target.id,
    name: target.name,
    target: target.url,
    probe_url: url,
    category: target.category || 'سایر',
    group: target.group || 'سایر',
    region: target.region || 'GLOBAL',
    criticality: target.criticality || 'normal',
    tags: target.tags || [],
    type: 'site',
    status,
    reachability: response ? 'reachable' : 'unreachable',
    health_score: status === 'up' ? 100 : status === 'degraded' ? 55 : 0,
    availability_basis: response ? 'https' : 'none',
    latency: response?.latency ?? null,
    http_latency: response?.latency ?? null,
    http_status: code,
    http_method: 'GET',
    final_url: response?.finalUrl || url,
    http_headers: response?.headers || {},
    icmp_status: 'unsupported',
    icmp_latency: null,
    packet_loss: null,
    jitter: null,
    error: error || (code != null && code >= 500 ? `HTTP ${code}` : null),
    timestamp: checked,
    checks: {
      http: { ok: code != null && code >= 200 && code < 400, status: code, method: 'GET', latency_ms: response?.latency ?? null, final_url: response?.finalUrl || url, headers: response?.headers || {}, error },
      icmp: { status: 'unsupported', note: 'Raw ICMP sockets are not available in Cloudflare Workers.' }
    }
  };
}

function createDnsQuery(name) {
  const clean = String(name || '').trim().replace(/\.$/, '');
  const labels = clean.split('.');
  if (!clean || clean.length > 253 || labels.some(label => !label.length || new TextEncoder().encode(label).length > 63)) {
    throw new Error(`Invalid DNS test name: ${name}`);
  }
  const idBytes = new Uint8Array(2);
  crypto.getRandomValues(idBytes);
  const id = (idBytes[0] << 8) | idBytes[1];
  const bytes = [idBytes[0], idBytes[1], 1, 0, 0, 1, 0, 0, 0, 0, 0, 0];
  const encoder = new TextEncoder();
  for (const label of labels) {
    const encoded = [...encoder.encode(label)];
    bytes.push(encoded.length, ...encoded);
  }
  bytes.push(0, 0, 1, 0, 1);
  return { id, packet: new Uint8Array(bytes) };
}

function base64Url(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function skipDnsName(bytes, start) {
  let offset = start;
  let hops = 0;
  while (offset < bytes.length && hops++ < 128) {
    const length = bytes[offset];
    if (length === 0) return offset + 1;
    if ((length & 0xc0) === 0xc0) {
      if (offset + 1 >= bytes.length) throw new Error('Truncated DNS compression pointer');
      return offset + 2;
    }
    if (length & 0xc0) throw new Error('Invalid DNS label encoding');
    offset += length + 1;
  }
  throw new Error('Malformed DNS name');
}

function parseDnsResponse(buffer, expectedId) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 12) throw new Error('DNS response is shorter than its header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const id = view.getUint16(0);
  const flags = view.getUint16(2);
  const questions = view.getUint16(4);
  const answers = view.getUint16(6);
  const rcode = flags & 0x000f;
  if (id !== expectedId) throw new Error('DNS response ID mismatch');
  if ((flags & 0x8000) === 0) throw new Error('DNS response flag is missing');
  if (flags & 0x0200) throw new Error('DNS response was truncated');
  if (rcode !== 0) throw new Error(`DNS response code ${rcode}`);
  let offset = 12;
  for (let index = 0; index < questions; index += 1) {
    offset = skipDnsName(bytes, offset) + 4;
    if (offset > bytes.length) throw new Error('Truncated DNS question');
  }
  const addresses = [];
  for (let index = 0; index < answers; index += 1) {
    offset = skipDnsName(bytes, offset);
    if (offset + 10 > bytes.length) throw new Error('Truncated DNS answer');
    const type = view.getUint16(offset);
    const recordClass = view.getUint16(offset + 2);
    const dataLength = view.getUint16(offset + 8);
    offset += 10;
    if (offset + dataLength > bytes.length) throw new Error('Truncated DNS record data');
    if (type === 1 && recordClass === 1 && dataLength === 4) {
      addresses.push(`${bytes[offset]}.${bytes[offset + 1]}.${bytes[offset + 2]}.${bytes[offset + 3]}`);
    }
    offset += dataLength;
  }
  return { answers, addresses, rcode };
}

async function probeDns(target, timeoutMs, testName) {
  const started = Date.now();
  const queryName = target.test_name || testName;
  const endpoint = new URL(target.doh_url);
  const query = createDnsQuery(queryName);
  endpoint.searchParams.set('dns', base64Url(query.packet));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const response = await fetch(endpoint.toString(), {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/dns-message',
        'User-Agent': `DualPingMonitor/${VERSION}`
      }
    });
    if (!response.ok) {
      try { await response.body?.cancel(); } catch {}
      throw new Error(`DoH HTTP ${response.status}`);
    }
    const packet = await response.arrayBuffer();
    const parsed = parseDnsResponse(packet, query.id);
    const ok = parsed.rcode === 0 && parsed.answers > 0;
    return {
      id: target.id,
      name: target.name,
      target: target.ip || '',
      doh_url: target.doh_url,
      category: 'DNS',
      group: target.group || 'جهانی',
      region: target.region || 'GLOBAL',
      tags: target.tags || ['dns-over-https'],
      type: 'dns',
      status: ok ? 'up' : 'down',
      reachability: ok ? 'reachable' : 'unreachable',
      health_score: ok ? 100 : 0,
      availability_basis: ok ? 'dns' : 'none',
      dns_transport: 'DoH/HTTP GET',
      dns_test_name: queryName,
      latency: Date.now() - started,
      dns_latency: Date.now() - started,
      packet_loss: ok ? 0 : 100,
      jitter: null,
      resolved: parsed.addresses.slice(0, 3),
      answer_count: parsed.answers,
      error: ok ? null : `No DNS answers for ${queryName}`,
      timestamp: new Date().toISOString(),
      checks: { dns: { ok, test: queryName, endpoint: target.doh_url, answers: parsed.answers, resolved: parsed.addresses.slice(0, 3), error: null } }
    };
  } catch (error) {
    const message = error?.name === 'AbortError' || String(error).includes('timeout')
      ? `DoH timeout after ${timeoutMs}ms`
      : String(error?.message || error).slice(0, 240);
    return {
      id: target.id,
      name: target.name,
      target: target.ip || '',
      doh_url: target.doh_url,
      category: 'DNS',
      group: target.group || 'جهانی',
      region: target.region || 'GLOBAL',
      tags: target.tags || ['dns-over-https'],
      type: 'dns',
      status: 'down',
      reachability: 'unreachable',
      health_score: 0,
      availability_basis: 'none',
      dns_transport: 'DoH/HTTP GET',
      dns_test_name: queryName,
      latency: null,
      dns_latency: null,
      packet_loss: 100,
      jitter: null,
      resolved: [],
      answer_count: 0,
      error: message,
      timestamp: new Date().toISOString(),
      checks: { dns: { ok: false, test: queryName, endpoint: target.doh_url, answers: 0, resolved: [], error: message } }
    };
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimited(items, concurrency, handler) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try { results[index] = await handler(items[index], index); }
      catch (error) { results[index] = { id: items[index]?.id, status: 'down', error: String(error?.message || error) }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runner));
  return results;
}

async function runProbe(env) {
  const started = Date.now();
  const sites = parseSiteOverrides(env);
  const dnsTargets = parseDnsOverrides(env);
  if (!sites.length || sites.length + dnsTargets.length > 44) {
    throw new Error(`Target set exceeds reserved Cloudflare subrequest budget: ${sites.length} sites + ${dnsTargets.length} DNS (maximum 44)`);
  }
  const timeoutMs = Math.min(12000, Math.max(2000, Number(env.PROBE_TIMEOUT_MS) || 6500));
  // Cloudflare currently allows six simultaneous outgoing connections per request.
  // Five workers leave headroom for platform/runtime activity.
  const concurrency = Math.min(5, Math.max(1, Number(env.PROBE_CONCURRENCY) || 5));
  const testName = env.DNS_TEST_NAME || 'example.com';

  const siteResults = await mapLimited(sites, concurrency, target => probeHttp(target, timeoutMs));
  const dnsResults = await mapLimited(dnsTargets, concurrency, target => probeDns(target, timeoutMs, testName));
  const results = [...siteResults, ...dnsResults];
  const up = results.filter(row => row.status === 'up').length;
  const degraded = results.filter(row => row.status === 'degraded').length;
  const down = results.filter(row => row.status === 'down').length;
  const snapshot = {
    timestamp: new Date().toISOString(),
    source: 'cloudflare',
    version: 4,
    schema_version: SCHEMA_VERSION,
    total: results.length,
    up,
    degraded,
    down,
    duration_ms: Date.now() - started,
    platform: 'Cloudflare Workers',
    probe_type: 'HTTP(S) + DNS-over-HTTPS',
    probe_concurrency: concurrency,
    notes: [
      'Cloudflare Workers cannot open raw ICMP sockets; this edge vantage uses HTTP and DNS-over-HTTPS.',
      'HTTP 4xx means reachable but restricted/degraded; HTTP 5xx is an application failure.'
    ],
    results
  };
  return snapshot;
}

function compactRecord(row) {
  const result = { i: row.id, s: row.status, l: row.latency, b: row.availability_basis };
  if (row.http_status != null) result.h = row.http_status;
  if (row.http_latency != null) result.hl = row.http_latency;
  if (row.dns_latency != null) result.dl = row.dns_latency;
  if (row.packet_loss != null) result.pl = row.packet_loss;
  if (row.error) result.e = String(row.error).slice(0, 150);
  if (row.resolved?.length) result.a = row.resolved.slice(0, 2);
  if (row.answer_count != null) result.ac = row.answer_count;
  return result;
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

function encodeUtf8Base64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64Utf8(value) {
  const binary = atob(String(value || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function readGithubHistory(api, rawUrl, headers) {
  const response = await fetch(api, { headers });
  if (response.status === 404) return { sha: null, history: [] };
  if (!response.ok) throw new Error(`GitHub read failed: HTTP ${response.status} ${(await response.text()).slice(0, 250)}`);
  const file = await response.json();
  let content = file.content ? decodeBase64Utf8(file.content) : '';
  // Contents API omits inline file bodies for large files. Read the raw file
  // instead while retaining the API SHA for the optimistic write.
  if (!content) {
    const rawResponse = await fetch(rawUrl, { headers: { 'User-Agent': 'DualPingMonitor-Worker', 'Cache-Control': 'no-cache' } });
    if (!rawResponse.ok) throw new Error(`GitHub raw history read failed: HTTP ${rawResponse.status}`);
    content = await rawResponse.text();
  }
  let history;
  try { history = JSON.parse(content); }
  catch { throw new Error('GitHub history file contains invalid JSON; refusing to overwrite it'); }
  return { sha: file.sha, history: Array.isArray(history) ? history : (history ? [history] : []) };
}

async function maybeStore(env, snapshot) {
  if (!env.GH_TOKEN || !env.GH_REPO) {
    return { ok: false, configured: false, reason: 'Set GH_TOKEN as a Worker secret and GH_REPO as a variable.' };
  }
  const branch = env.GH_BRANCH || 'main';
  const day = snapshot.timestamp.slice(0, 10);
  const path = `docs/data/cloudflare/${day}.json`;
  const encodedRepo = String(env.GH_REPO).split('/').map(encodeURIComponent).join('/');
  const api = `https://api.github.com/repos/${encodedRepo}/contents/${path}`;
  const rawUrl = `https://raw.githubusercontent.com/${env.GH_REPO}/${encodeURIComponent(branch)}/${path}`;
  const headers = {
    Authorization: `Bearer ${env.GH_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'DualPingMonitor-Worker'
  };
  const compact = compactSnapshot(snapshot);

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const { sha, history: previous } = await readGithubHistory(`${api}?ref=${encodeURIComponent(branch)}`, rawUrl, headers);
      const filtered = previous.filter(row => (row?.t || row?.timestamp) !== snapshot.timestamp);
      filtered.push(compact);
      const safeHistory = filtered.slice(-320);
      const content = encodeUtf8Base64(`${JSON.stringify(safeHistory)}\n`);
      const write = await fetch(api, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `chore(monitor): Cloudflare v4 snapshot ${snapshot.timestamp}`,
          content,
          branch,
          ...(sha ? { sha } : {})
        })
      });
      if (write.ok) {
        return { ok: true, configured: true, path, samples: safeHistory.length, branch, attempts: attempt };
      }
      const details = (await write.text()).slice(0, 250);
      if (![409, 422, 502, 503].includes(write.status) || attempt === 2) {
        throw new Error(`GitHub write failed: HTTP ${write.status} ${details}`);
      }
      console.warn(`[DPM] GitHub contents conflict (attempt ${attempt}/2); re-reading the latest file.`);
      await new Promise(resolve => setTimeout(resolve, attempt * 350));
    } catch (error) {
      if (attempt === 2) throw error;
      console.warn(`[DPM] History persistence attempt ${attempt}/2 failed: ${String(error?.message || error)}`);
      await new Promise(resolve => setTimeout(resolve, attempt * 400));
    }
  }
  return { ok: false, configured: true, path, error: 'History write retry limit reached.' };
}

async function latestFromKV(env) {
  if (!env.MONITOR_KV) return null;
  try { return await env.MONITOR_KV.get('latest', 'json'); } catch { return null; }
}

async function latestFromGithub(env) {
  if (!env.GH_REPO) return null;
  try {
    const [owner, repo] = String(env.GH_REPO).split('/');
    if (!owner || !repo) return null;
    const branch = env.GH_BRANCH || 'main';
    const day = new Date().toISOString().slice(0, 10);
    const url = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/docs/data/cloudflare/${day}.json`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache', 'User-Agent': 'DualPingMonitor-Worker' }
    });
    if (!response.ok) return null;
    const history = await response.json();
    if (Array.isArray(history)) return history.length ? history[history.length - 1] : null;
    return history && typeof history === 'object' ? history : null;
  } catch (error) {
    console.warn('[DPM] Could not read latest public history:', String(error?.message || error));
    return null;
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    const url = new URL(request.url);
    const route = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'GET' && ['/health', '/api/health'].includes(route)) {
      const sites = parseSiteOverrides(env);
      const dns = parseDnsOverrides(env);
      return json({
        ok: true,
        service: 'dual-ping-monitor-edge',
        version: VERSION,
        schema_version: SCHEMA_VERSION,
        now: new Date().toISOString(),
        publisherConfigured: Boolean(env.GH_TOKEN && env.GH_REPO),
        publisher: 'github-contents-api-with-retry',
        targets: { sites: sites.length, dns: dns.length, total: sites.length + dns.length },
        routes: ['/', '/health', '/api/health', '/api/status', '/api/latest', '/api/config', '/api/probe']
      });
    }

    if (request.method === 'GET' && route === '/api/config') {
      return json({
        ok: true,
        version: VERSION,
        schema_version: SCHEMA_VERSION,
        sites: parseSiteOverrides(env),
        dns: parseDnsOverrides(env)
      });
    }

    if (request.method === 'GET' && route === '/api/latest') {
      const cached = await latestFromKV(env) || await latestFromGithub(env);
      if (cached) return json({ ...cached, served_at: new Date().toISOString(), cached: true, cache_source: env.MONITOR_KV ? 'kv-or-github-history' : 'github-history' });
      // First boot / missing history fallback: run a fresh probe once so the
      // dashboard is useful before the first scheduled Cloudflare snapshot.
    }

    if (request.method === 'POST' && route === '/api/probe') {
      if (!env.PROBE_TOKEN) return json({ ok: false, error: 'POST probe is disabled until PROBE_TOKEN is configured.' }, 503);
      const token = request.headers.get('X-Monitor-Token') || request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
      if (token !== env.PROBE_TOKEN) return json({ ok: false, error: 'Unauthorized' }, 401);
    }

    if ((request.method === 'GET' && ['/', '/api/status', '/api/latest'].includes(route)) || (request.method === 'POST' && route === '/api/probe')) {
      try {
        const snapshot = await runProbe(env);
        return json(snapshot);
      } catch (error) {
        console.error('[DPM] Probe execution failed:', error);
        return json({ ok: false, error: String(error?.message || error), source: 'cloudflare', version: VERSION }, 502);
      }
    }

    return json({ ok: false, error: 'Not found', routes: ['GET /health', 'GET /api/health', 'GET /api/status', 'GET /api/config', 'POST /api/probe'] }, 404);
  },

  async scheduled(event, env, ctx) {
    try {
      const snapshot = await runProbe(env);
      if (env.MONITOR_KV) {
        try { await env.MONITOR_KV.put('latest', JSON.stringify(snapshot), { expirationTtl: 900 }); }
        catch (error) { console.warn('[DPM] KV latest snapshot write failed:', String(error?.message || error)); }
      }
      const result = await maybeStore(env, snapshot);
      if (!result.ok) console.error('[DPM] Scheduled history write was not successful:', JSON.stringify(result));
      else console.log(`[DPM] Scheduled snapshot stored: ${result.path} (${result.samples} samples, attempt ${result.attempts})`);
    } catch (error) {
      console.error('[DPM] Scheduled monitoring run failed:', error);
    }
  }
};
