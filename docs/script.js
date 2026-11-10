(() => {
  'use strict';

  const CONFIG = window.DPM_CONFIG || {
    version: '4.0.0', dataBase: 'data/', targetCatalog: 'targets.json',
    workerUrl: 'https://dual-ping-worker.game-developer-mb.workers.dev',
    autoRefreshMs: 60000, staleAfterMs: 25 * 60 * 1000, defaultTheme: 'aurora', maxHistoryDays: 7
  };
  const STORAGE_THEME = 'dpm-theme-v4';
  const STATUS = {
    up: { label: 'سالم', short: 'UP', rank: 2 },
    degraded: { label: 'محدود', short: 'WARN', rank: 1 },
    down: { label: 'قطع', short: 'DOWN', rank: 0 },
    unknown: { label: 'بدون داده', short: 'N/A', rank: 3 }
  };
  const state = {
    catalog: [], catalogMap: new Map(), dnsCatalog: [], index: null,
    history: { github: [], cloudflare: [] }, sourceLatest: { github: null, cloudflare: null },
    liveEdge: null, currentById: new Map(), latestSnapshot: null,
    category: 'all', search: '', group: 'all', sort: 'status', period: '24h',
    autoRefresh: true, refreshingLive: false, refreshTimer: null, selectedId: null,
    theme: safeStorageGet(STORAGE_THEME) || CONFIG.defaultTheme,
    loading: true, lastRefresh: null, extraDaysLoaded: false, lastError: null
  };

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const asNumber = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  const timestampOf = row => row?.timestamp || row?.t || null;
  const toDate = value => { const date = value ? new Date(value) : null; return date && Number.isFinite(date.getTime()) ? date : null; };
  const faNumber = value => value == null ? '—' : Number(value).toLocaleString('fa-IR', { maximumFractionDigits: 1 });
  const faDateTime = value => { const date = toDate(value); return date ? date.toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' }) : '—'; };
  const faTime = value => { const date = toDate(value); return date ? date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '—'; };
  const fmtMs = value => asNumber(value) == null ? '—' : `${faNumber(Math.round(Number(value)))} ms`;
  const percent = (part, total) => total ? `${Math.round(part / total * 100)}٪` : '—';
  const statusInfo = status => STATUS[status] || STATUS.unknown;
  const statusClass = status => STATUS[status] ? status : 'unknown';
  const safeStorageGet = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const safeStorageSet = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
  const safeStorageRemove = key => { try { localStorage.removeItem(key); } catch {} };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const isoDay = date => date.toISOString().slice(0, 10);
  const nowIso = () => new Date().toISOString();
  const hostname = value => { try { return new URL(value).hostname; } catch { return String(value || ''); } };
  const snapshotSource = snapshot => snapshot?.source || snapshot?.s || 'unknown';
  const snapshotRows = snapshot => Array.isArray(snapshot?.results) ? snapshot.results : Array.isArray(snapshot?.r) ? snapshot.r : [];

  function showToast(message, type = '') {
    let region = $('toastRegion');
    if (!region) {
      region = document.createElement('div');
      region.id = 'toastRegion'; region.className = 'toast-region'; region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    const item = document.createElement('div');
    item.className = `toast ${type}`.trim(); item.textContent = message; region.appendChild(item);
    window.setTimeout(() => item.remove(), 3600);
  }

  async function fetchJson(url, { timeoutMs = 12000, cache = 'no-store' } = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { cache, signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status} · ${url}`);
      return await response.json();
    } finally { window.clearTimeout(timer); }
  }

  function deriveStatus(row) {
    const explicit = String(row?.status || row?.s || '').toLowerCase();
    if (['up', 'ok', 'healthy', 'online'].includes(explicit)) {
      const code = asNumber(row?.http_status ?? row?.h);
      if (code != null && code >= 400 && code < 500) return 'degraded';
      return 'up';
    }
    if (['degraded', 'warn', 'warning', 'limited'].includes(explicit)) return 'degraded';
    if (['down', 'offline', 'failed', 'error'].includes(explicit)) return 'down';
    const code = asNumber(row?.http_status ?? row?.h);
    if (code != null) return code >= 200 && code < 400 ? 'up' : code < 500 ? 'degraded' : 'down';
    const dnsOk = row?.checks?.dns?.ok;
    if (dnsOk === true) return 'up';
    if (row?.icmp_status === 'up' || row?.is === 'up') return 'degraded';
    return 'unknown';
  }

  function normalizeRecord(raw, source = 'unknown', timestamp = null) {
    if (!raw || typeof raw !== 'object') return null;
    const compact = Object.prototype.hasOwnProperty.call(raw, 'i');
    const id = String(compact ? raw.i : (raw.id || raw.key || ''));
    if (!id) return null;
    const catalog = state.catalogMap.get(id) || state.dnsCatalog.find(row => row.id === id) || {};
    const isDns = compact ? Boolean(state.dnsCatalog.find(row => row.id === id)) : (raw.type === 'dns' || raw.category === 'DNS' || id.includes('dns'));
    const category = raw.category || catalog.category || (isDns ? 'DNS' : 'سایر');
    const status = deriveStatus(raw);
    const latency = asNumber(compact ? raw.l : (raw.latency ?? raw.http_latency ?? raw.dns_latency ?? raw.icmp_latency));
    return {
      ...catalog,
      ...(!compact ? raw : {}),
      id,
      name: String(compact ? (catalog.name || id) : (raw.name || raw.title || catalog.name || id)),
      target: String(compact ? (catalog.url || catalog.ip || '') : (raw.target || raw.url || raw.ip || catalog.url || catalog.ip || '')),
      url: String(catalog.url || raw.url || raw.target || ''),
      doh_url: raw.doh_url || catalog.doh_url || '',
      type: isDns ? 'dns' : (raw.type || 'site'),
      category,
      group: raw.group || catalog.group || 'سایر',
      region: raw.region || catalog.region || '',
      criticality: raw.criticality || catalog.criticality || 'normal',
      tags: Array.isArray(raw.tags) ? raw.tags : (catalog.tags || []),
      status,
      latency,
      http_status: asNumber(compact ? raw.h : raw.http_status),
      http_latency: asNumber(compact ? raw.hl : raw.http_latency),
      icmp_latency: asNumber(compact ? raw.il : raw.icmp_latency),
      icmp_status: compact ? (raw.is || null) : (raw.icmp_status || null),
      dns_latency: asNumber(compact ? raw.dl : raw.dns_latency),
      packet_loss: asNumber(compact ? raw.pl : raw.packet_loss),
      jitter: asNumber(compact ? raw.j : raw.jitter),
      resolved: Array.isArray(compact ? raw.a : raw.resolved) ? (compact ? raw.a : raw.resolved) : [],
      answer_count: asNumber(compact ? raw.ac : raw.answer_count),
      retry_count: asNumber(compact ? raw.rt : raw.retry_count),
      error: compact ? (raw.e || null) : (raw.error || null),
      availability_basis: compact ? (raw.b || null) : (raw.availability_basis || null),
      timestamp: timestamp || raw.timestamp || null,
      checks: raw.checks || null,
      reachability: raw.reachability || (status === 'up' || status === 'degraded' ? 'reachable' : status === 'down' ? 'unreachable' : 'unknown'),
      health_score: asNumber(raw.health_score) ?? (status === 'up' ? 100 : status === 'degraded' ? 55 : status === 'down' ? 0 : null)
    };
  }

  function normalizeSnapshot(raw, fallbackSource = 'unknown') {
    if (!raw || typeof raw !== 'object') return null;
    if (Array.isArray(raw)) return raw.map(row => normalizeSnapshot(row, fallbackSource)).filter(Boolean);
    const compact = Object.prototype.hasOwnProperty.call(raw, 't') || Object.prototype.hasOwnProperty.call(raw, 'r');
    const timestamp = raw.timestamp || raw.t || nowIso();
    const source = raw.source || raw.s || fallbackSource;
    const rawRows = snapshotRows(raw);
    const results = rawRows.map(row => normalizeRecord(row, source, timestamp)).filter(Boolean);
    const up = asNumber(raw.up ?? raw.u) ?? results.filter(row => row.status === 'up').length;
    const degraded = asNumber(raw.degraded ?? raw.g) ?? results.filter(row => row.status === 'degraded').length;
    const down = asNumber(raw.down ?? raw.d) ?? results.filter(row => row.status === 'down').length;
    return {
      timestamp, source, version: asNumber(raw.version ?? raw.v) ?? 4,
      total: asNumber(raw.total ?? raw.n) ?? results.length,
      up, degraded, down,
      duration_ms: asNumber(raw.duration_ms ?? raw.ms),
      platform: raw.platform || (source === 'cloudflare' ? 'Cloudflare Workers' : 'GitHub Actions'),
      probe_type: raw.probe_type || '', results,
      raw, compact
    };
  }

  function normalizeSourcePayload(payload, source) {
    let rows = [];
    if (Array.isArray(payload)) rows = payload;
    else if (payload && Array.isArray(payload.sources?.[source])) rows = payload.sources[source];
    else if (payload && Array.isArray(payload.results)) rows = [payload];
    else if (payload && (payload.t || payload.timestamp)) rows = [payload];
    return rows.map(row => normalizeSnapshot(row, source)).filter(Boolean).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  function mergeByTimestamp(rows) {
    const unique = new Map();
    for (const row of rows) {
      if (!row?.timestamp) continue;
      unique.set(`${row.source}:${row.timestamp}`, row);
    }
    return [...unique.values()].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  function latestOf(rows) { return rows?.length ? rows[rows.length - 1] : null; }

  async function loadCatalog() {
    const catalog = await fetchJson(`${CONFIG.targetCatalog}?v=${encodeURIComponent(CONFIG.version)}`);
    state.catalog = Array.isArray(catalog.sites) ? catalog.sites : [];
    state.dnsCatalog = Array.isArray(catalog.dns) ? catalog.dns : [];
    state.catalogMap = new Map(state.catalog.map(row => [row.id, row]));
    for (const row of state.dnsCatalog) state.catalogMap.set(row.id, row);
    populateGroupOptions();
    return catalog;
  }

  function populateGroupOptions() {
    const select = $('groupSelect');
    if (!select) return;
    const current = select.value || 'all';
    const groups = [...new Set([...state.catalog, ...state.dnsCatalog].map(row => row.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fa'));
    select.innerHTML = '<option value="all">همه‌ی گروه‌ها</option>' + groups.map(group => `<option value="${esc(group)}">${esc(group)}</option>`).join('');
    select.value = groups.includes(current) ? current : 'all';
  }

  function dateList() {
    const dates = Array.isArray(state.index?.dates) ? state.index.dates : [];
    const clean = dates.filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date));
    const today = isoDay(new Date());
    if (!clean.includes(today)) clean.unshift(today);
    return [...new Set(clean)].sort().reverse();
  }

  async function loadHistoryDay(day) {
    const mergedUrl = `${CONFIG.dataBase}merged/${day}.json?dpm=${CONFIG.version}`;
    try {
      const merged = await fetchJson(mergedUrl, { timeoutMs: 10000, cache: 'no-cache' });
      return {
        github: normalizeSourcePayload(merged, 'github'),
        cloudflare: normalizeSourcePayload(merged, 'cloudflare')
      };
    } catch {
      const [github, cloudflare] = await Promise.allSettled([
        fetchJson(`${CONFIG.dataBase}github/${day}.json`, { timeoutMs: 9000, cache: 'no-cache' }),
        fetchJson(`${CONFIG.dataBase}cloudflare/${day}.json`, { timeoutMs: 9000, cache: 'no-cache' })
      ]);
      return {
        github: github.status === 'fulfilled' ? normalizeSourcePayload(github.value, 'github') : [],
        cloudflare: cloudflare.status === 'fulfilled' ? normalizeSourcePayload(cloudflare.value, 'cloudflare') : []
      };
    }
  }

  async function loadHistorical({ days = 2, append = false } = {}) {
    try {
      if (!state.index) state.index = await fetchJson(`${CONFIG.dataBase}index.json?v=${CONFIG.version}`, { timeoutMs: 9000, cache: 'no-cache' });
    } catch (error) {
      state.lastError = error;
      state.index = { dates: [isoDay(new Date())], latest: isoDay(new Date()) };
    }
    const dates = dateList().slice(0, Math.min(CONFIG.maxHistoryDays || 7, days));
    const loaded = await Promise.all(dates.map(loadHistoryDay));
    const github = loaded.flatMap(row => row.github);
    const cloudflare = loaded.flatMap(row => row.cloudflare);
    if (append) {
      state.history.github = mergeByTimestamp([...state.history.github, ...github]);
      state.history.cloudflare = mergeByTimestamp([...state.history.cloudflare, ...cloudflare]);
    } else {
      state.history.github = mergeByTimestamp(github);
      state.history.cloudflare = mergeByTimestamp(cloudflare);
    }
    state.sourceLatest.github = latestOf(state.history.github);
    state.sourceLatest.cloudflare = latestOf(state.history.cloudflare);
    state.extraDaysLoaded = days >= 7;
    return { dates: dates.length, github: state.history.github.length, cloudflare: state.history.cloudflare.length };
  }

  async function refreshLive({ quiet = false, fresh = false } = {}) {
    if (state.refreshingLive) return null;
    state.refreshingLive = true;
    const button = $('refreshBtn');
    button?.classList.add('is-loading');
    if (!state.liveEdge && !quiet) setSystemBadge('در حال بررسی زنده', 'loading');
    try {
      const endpoint = fresh ? '/api/status' : '/api/latest';
      const snapshot = await fetchJson(`${CONFIG.workerUrl.replace(/\/$/, '')}${endpoint}`, { timeoutMs: fresh ? 68000 : 10000, cache: 'no-store' });
      const normalized = normalizeSnapshot(snapshot, 'cloudflare');
      if (!normalized?.results?.length) throw new Error('Worker responded without probe results');
      adoptTargetsFromSnapshot(normalized);
      state.liveEdge = normalized;
      state.sourceLatest.cloudflare = normalized;
      state.lastRefresh = nowIso();
      renderAll();
      if (!quiet) showToast(fresh ? 'Probe کامل از Cloudflare اجرا شد.' : 'آخرین نمونه‌ی زمان‌بندی‌شده دریافت شد.', 'success');
      return normalized;
    } catch (error) {
      state.lastError = error;
      if (!quiet) showToast(`ارتباط زنده برقرار نشد؛ تاریخچه همچنان در دسترس است. (${error.message || 'Network error'})`, 'error');
      updateSourceStatus();
      return null;
    } finally {
      state.refreshingLive = false;
      button?.classList.remove('is-loading');
      hideBootScreen();
    }
  }

  function hideBootScreen(message) {
    if (message && $('bootMessage')) $('bootMessage').textContent = message;
    window.setTimeout(() => {
      $('bootScreen')?.classList.add('is-hidden');
      state.loading = false;
    }, 180);
  }

  function setSystemBadge(label, mode = 'loading') {
    const badge = $('systemBadge');
    if (!badge) return;
    badge.className = `system-badge ${mode}`;
    badge.innerHTML = `<span class="pulse-dot"></span><strong>${esc(label)}</strong>`;
  }

  function adoptTargetsFromSnapshot(snapshot) {
    if (!snapshot?.results?.length) return;
    let changed = false;
    for (const row of snapshot.results) {
      if (!row.id || state.catalogMap.has(row.id)) continue;
      const inferred = {
        id: row.id, name: row.name || row.id, url: row.type === 'dns' ? '' : (row.url || row.target || ''),
        ip: row.type === 'dns' ? (row.target || '') : '', doh_url: row.doh_url || '',
        category: row.category || (row.type === 'dns' ? 'DNS' : 'سایر'), group: row.group || 'سایر',
        region: row.region || '', criticality: row.criticality || 'normal', tags: row.tags || []
      };
      if (row.type === 'dns' || inferred.category === 'DNS') state.dnsCatalog.push(inferred);
      else state.catalog.push(inferred);
      state.catalogMap.set(row.id, inferred);
      changed = true;
    }
    if (changed) populateGroupOptions();
  }

  function snapshotForDisplay() {
    const candidates = [state.sourceLatest.github, state.liveEdge || state.sourceLatest.cloudflare].filter(Boolean);
    if (!candidates.length) return null;
    candidates.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return candidates[0];
  }

  function buildCurrentMap() {
    const map = new Map();
    const snapshots = [state.sourceLatest.github, state.sourceLatest.cloudflare, state.liveEdge].filter(Boolean);
    for (const snapshot of snapshots) {
      for (const row of snapshot.results || []) {
        const previous = map.get(row.id);
        if (!previous || new Date(row.timestamp || snapshot.timestamp) >= new Date(previous.timestamp || '1970-01-01')) {
          map.set(row.id, { ...row, timestamp: row.timestamp || snapshot.timestamp, source: snapshot.source });
        }
      }
    }
    state.currentById = map;
    return map;
  }

  function visibleTargets() {
    const catalog = [...state.catalog, ...state.dnsCatalog];
    const query = state.search.trim().toLocaleLowerCase('fa');
    return catalog.map(target => {
      const latest = state.currentById.get(target.id);
      return { ...target, ...(latest || {}), id: target.id, name: target.name, url: target.url || '', group: target.group || 'سایر', category: target.category || 'DNS', status: latest?.status || 'unknown', latency: latest?.latency ?? null };
    }).filter(target => {
      if (state.category !== 'all' && target.category !== state.category) return false;
      if (state.group !== 'all' && target.group !== state.group) return false;
      if (!query) return true;
      const bag = [target.name, target.id, target.url, target.group, target.category, target.region, ...(target.tags || [])].join(' ').toLocaleLowerCase('fa');
      return bag.includes(query);
    }).sort((a, b) => {
      if (state.sort === 'latency') return (a.latency ?? Infinity) - (b.latency ?? Infinity);
      if (state.sort === 'criticality') return ({ critical: 0, high: 1, normal: 2, low: 3 }[a.criticality] ?? 4) - ({ critical: 0, high: 1, normal: 2, low: 3 }[b.criticality] ?? 4);
      if (state.sort === 'name') return a.name.localeCompare(b.name, 'fa');
      if (state.sort === 'category') return a.category.localeCompare(b.category, 'fa') || a.name.localeCompare(b.name, 'fa');
      return statusInfo(a.status).rank - statusInfo(b.status).rank || (a.latency ?? Infinity) - (b.latency ?? Infinity);
    });
  }

  function targetInitial(target) {
    const pieces = String(target.name || target.id).replace(/[^A-Za-z0-9\u0600-\u06FF ]/g, ' ').trim().split(/\s+/).filter(Boolean);
    const latin = pieces.filter(part => /^[A-Za-z]/.test(part));
    if (latin.length) return latin.slice(0, 2).map(part => part[0]).join('').toUpperCase();
    return pieces.slice(0, 2).map(part => part[0]).join('') || '◎';
  }

  function renderTargets() {
    const rows = visibleTargets();
    $('allCount').textContent = faNumber(state.catalog.length + state.dnsCatalog.length);
    $('visibleCount').textContent = faNumber(rows.length);
    $('targetSummary').textContent = `${faNumber(rows.length)} هدف`;
    $('targetEmpty').hidden = rows.length > 0;
    $('targetGrid').innerHTML = rows.map((target, index) => {
      const status = statusClass(target.status);
      const info = statusInfo(status);
      const isCritical = ['critical', 'high'].includes(target.criticality);
      return `<button type="button" class="target-card status-${status}" data-target-id="${esc(target.id)}" style="animation-delay:${Math.min(index,18)*18}ms" aria-label="جزئیات ${esc(target.name)}">
        <span class="target-card-top"><span class="target-card-name"><span class="target-icon">${esc(targetInitial(target))}</span><strong>${esc(target.name)}</strong></span><span class="status-pill">${info.label}</span></span>
        <span class="target-card-domain" title="${esc(target.url || target.doh_url || '')}">${esc(hostname(target.url || target.doh_url || target.ip || '—'))}</span>
        <span class="target-card-bottom"><span class="target-card-group">${isCritical ? '<span class="critical-star">★ </span>' : ''}${esc(target.group)}</span><span class="target-latency">${target.latency == null ? '—' : `${faNumber(Math.round(target.latency))} <small>ms</small>`}</span></span>
      </button>`;
    }).join('');
    $('targetGrid').querySelectorAll('[data-target-id]').forEach(button => button.addEventListener('click', () => openTargetDetails(button.dataset.targetId)));
  }

  function renderMetrics() {
    const targets = [...state.catalog, ...state.dnsCatalog];
    const current = buildCurrentMap();
    let up = 0, degraded = 0, down = 0;
    const latencies = [];
    for (const target of targets) {
      const row = current.get(target.id);
      if (!row) continue;
      if (row.status === 'up') up++;
      else if (row.status === 'degraded') degraded++;
      else if (row.status === 'down') down++;
      if (row.status !== 'down' && asNumber(row.latency) != null) latencies.push(Number(row.latency));
    }
    const totalWithData = up + degraded + down;
    const average = latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : null;
    const latest = snapshotForDisplay();
    $('totalMetric').textContent = faNumber(targets.length);
    $('totalNote').textContent = `${faNumber(state.catalog.length)} سایت · ${faNumber(state.dnsCatalog.length)} سرویس DNS`;
    $('upMetric').textContent = faNumber(up);
    $('upNote').textContent = percent(up, totalWithData) + ' از داده‌های موجود';
    $('degradedMetric').textContent = faNumber(degraded);
    $('degradedNote').textContent = 'HTTP 4xx یا دسترسی محدود';
    $('downMetric').textContent = faNumber(down);
    $('downNote').textContent = totalWithData < targets.length ? `${faNumber(targets.length - totalWithData)} هدف هنوز داده ندارد` : 'خطای HTTP / DNS / اتصال';
    $('avgMetric').textContent = average == null ? '—' : faNumber(Math.round(average));
    $('avgNote').textContent = `از ${faNumber(latencies.length)} پاسخ قابل‌اندازه‌گیری`;
    const uptime = calculateUptime(24);
    $('uptimeMetric').textContent = uptime == null ? '—' : percent(uptime.ok, uptime.total);
    $('uptimeNote').textContent = uptime ? `${faNumber(uptime.total)} نمونه‌ی پایش در ۲۴ ساعت` : 'داده‌ی کافی در بازه‌ی ۲۴ ساعت وجود ندارد';
    $('heroLatency').textContent = average == null ? '— ms' : `${faNumber(Math.round(average))} ms`;
    $('heroTargets').textContent = faNumber(targets.length);
    $('probeDuration').textContent = latest?.duration_ms == null ? '—' : `${faNumber(latest.duration_ms)} ms`;
    $('lastUpdate').textContent = state.lastRefresh ? faTime(state.lastRefresh) : (latest ? faTime(latest.timestamp) : '—');
    $('dataDate').textContent = latest ? faDateTime(latest.timestamp) : '—';
    $('footerDataInfo').textContent = latest ? `آخرین داده: ${faDateTime(latest.timestamp)}` : 'تاریخچه‌ی GitHub Pages';
    renderResilience({ up, degraded, down, totalWithData, average });
  }

  function calculateUptime(hours) {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const snapshots = [...state.history.github, ...state.history.cloudflare, ...(state.liveEdge ? [state.liveEdge] : [])]
      .filter(snapshot => new Date(snapshot.timestamp).getTime() >= cutoff);
    let ok = 0, total = 0;
    for (const snapshot of snapshots) for (const row of snapshot.results || []) {
      if (row.status === 'unknown') continue;
      total++;
      if (row.status === 'up') ok++;
      else if (row.status === 'degraded') ok += .5;
    }
    return total ? { ok, total } : null;
  }

  function renderResilience(metrics) {
    if (!metrics.totalWithData) {
      $('resilienceScore').textContent = '—'; $('resilienceBar').style.width = '0%';
      $('resilienceList').innerHTML = '<div class="resilience-row"><span>در انتظار داده‌ی معتبر</span><b>—</b></div>';
      return;
    }
    // Critical infrastructure contributes more than low-priority editorial sites.
    const weightOf = level => ({ critical: 2.0, high: 1.5, normal: 1.0, low: .7 }[level] || 1.0);
    let weightedHealth = 0, weightTotal = 0;
    for (const target of [...state.catalog, ...state.dnsCatalog]) {
      const row = state.currentById.get(target.id);
      if (!row || !['up', 'degraded', 'down'].includes(row.status)) continue;
      const weight = weightOf(target.criticality);
      const health = row.status === 'up' ? 1 : row.status === 'degraded' ? .5 : 0;
      weightedHealth += health * weight;
      weightTotal += weight;
    }
    const serviceHealth = weightTotal ? weightedHealth / weightTotal : (metrics.up + metrics.degraded * .5) / metrics.totalWithData;
    const latencyHealth = metrics.average == null ? .65 : Math.max(.25, Math.min(1, 1 - Math.log10(Math.max(1, metrics.average)) / 4.3));
    const score = Math.round((serviceHealth * .88 + latencyHealth * .12) * 100);
    $('resilienceScore').textContent = faNumber(score);
    $('resilienceBar').style.width = `${score}%`;
    $('resilienceList').innerHTML = [
      ['دسترس‌پذیری با وزن اهمیت', `${Math.round(serviceHealth * 100)}٪`],
      ['کیفیت تأخیر میانگین', `${Math.round(latencyHealth * 100)}٪`],
      ['اهداف دارای داده', `${metrics.totalWithData} / ${state.catalog.length + state.dnsCatalog.length}`]
    ].map(([label, value]) => `<div class="resilience-row"><span>${label}</span><b>${value}</b></div>`).join('');
  }

  function updateSourceStatus() {
    const sources = [
      { key: 'github', state: latestOf(state.history.github), badge: $('githubState'), meta: $('githubSourceMeta') },
      { key: 'cloudflare', state: state.liveEdge || latestOf(state.history.cloudflare), badge: $('cfState'), meta: $('cfSourceMeta') }
    ];
    let healthy = 0, available = 0;
    for (const source of sources) {
      const snap = source.state;
      if (!snap) {
        source.badge.className = 'source-status pending'; source.badge.textContent = 'بدون داده';
        source.meta.textContent = source.key === 'cloudflare' ? 'اتصال زنده برقرار نشده' : 'داده‌ی آرشیوی موجود نیست';
        continue;
      }
      available++;
      const total = snap.total || snap.results.length || 0;
      const ratio = total ? (snap.up + snap.degraded * .5) / total : 0;
      const age = Date.now() - new Date(snap.timestamp).getTime();
      const stale = !Number.isFinite(age) || age > (CONFIG.staleAfterMs || 25 * 60 * 1000);
      const mode = stale ? 'warn' : ratio >= .8 ? 'ok' : ratio >= .45 ? 'warn' : 'bad';
      if (mode === 'ok') healthy++;
      source.badge.className = `source-status ${mode}`;
      source.badge.textContent = stale ? 'قدیمی' : mode === 'ok' ? 'فعال' : mode === 'warn' ? 'ناپایدار' : 'مشکل';
      source.meta.textContent = `${faNumber(snap.total)} هدف · ${faDateTime(snap.timestamp)}${stale ? ' · داده قدیمی' : ''}`;
    }
    const badgeMode = available === 0 ? 'bad' : healthy === available ? 'ok' : healthy ? 'warn' : 'bad';
    setSystemBadge(available === 0 ? 'بدون داده' : badgeMode === 'ok' ? 'سامانه پایدار' : badgeMode === 'warn' ? 'نیازمند بررسی' : 'اختلال در منابع', badgeMode);
    const sourceHealth = $('sourceHealth');
    sourceHealth.className = `source-health ${badgeMode}`;
    sourceHealth.querySelector('span:last-child').textContent = available === 0 ? 'هیچ منبع داده‌ای پاسخ نداده است' : healthy === available ? 'منابع پایش داده‌ی تازه و قابل‌استفاده دارند' : 'حداقل یک منبع قدیمی یا دارای اختلال است';
  }

  function renderComparison() {
    const github = state.sourceLatest.github;
    const cloudflare = state.liveEdge || state.sourceLatest.cloudflare;
    const body = $('compareBody');
    if (!github && !cloudflare) {
      body.innerHTML = '<tr><td colspan="6" class="empty-cell">در انتظار داده‌ی مقایسه‌ای…</td></tr>'; return;
    }
    const ghMap = new Map((github?.results || []).map(row => [row.id, row]));
    const cfMap = new Map((cloudflare?.results || []).map(row => [row.id, row]));
    const rows = [...state.catalog, ...state.dnsCatalog].map(target => ({ target, gh: ghMap.get(target.id), cf: cfMap.get(target.id) }))
      .filter(row => row.gh || row.cf)
      .sort((a, b) => {
        const ra = Math.min(a.gh ? statusInfo(a.gh.status).rank : 99, a.cf ? statusInfo(a.cf.status).rank : 99);
        const rb = Math.min(b.gh ? statusInfo(b.gh.status).rank : 99, b.cf ? statusInfo(b.cf.status).rank : 99);
        return ra - rb || a.target.name.localeCompare(b.target.name, 'fa');
      });
    const statusCell = row => row ? `<span class="table-status ${statusClass(row.status)}">${statusInfo(row.status).label}</span>` : '<span class="table-status unknown">—</span>';
    body.innerHTML = rows.slice(0, 24).map(({ target, gh, cf }) => {
      const delta = gh?.latency != null && cf?.latency != null ? Math.round(cf.latency - gh.latency) : null;
      const deltaText = delta == null ? '—' : `${delta > 0 ? '+' : ''}${faNumber(delta)} ms`;
      const deltaClass = delta == null ? '' : delta > 0 ? 'delta-bad' : 'delta-good';
      const basis = [gh?.availability_basis, cf?.availability_basis].filter(Boolean).join(' / ') || 'HTTP / DNS';
      return `<tr><td>${esc(target.name)}</td><td>${esc(target.category)}</td><td>${statusCell(gh)}</td><td>${statusCell(cf)}</td><td class="${deltaClass}">${deltaText}</td><td>${esc(basis)}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="empty-cell">داده‌ی مشترکی برای مقایسه وجود ندارد.</td></tr>';
  }

  function renderIncidents() {
    const rows = [...state.currentById.values()].filter(row => row.status === 'down' || row.status === 'degraded')
      .sort((a, b) => statusInfo(a.status).rank - statusInfo(b.status).rank || (b.timestamp || '').localeCompare(a.timestamp || ''));
    $('incidentCount').textContent = faNumber(rows.length);
    if (!rows.length) {
      $('incidentList').innerHTML = '<div class="incident-empty"><span>✓</span><strong>اختلال فعال شناسایی نشد</strong><small>وضعیت هدف‌ها در محدوده‌ی قابل‌قبول است.</small></div>';
      return;
    }
    $('incidentList').innerHTML = rows.slice(0, 8).map(row => {
      const down = row.status === 'down';
      const reason = row.error || (row.http_status ? `HTTP ${row.http_status}` : row.status === 'degraded' ? 'پاسخ محدود یا دسترسی محافظت‌شده' : 'پاسخی دریافت نشد');
      return `<article class="incident-item ${down ? 'down' : ''}"><span class="incident-icon">${down ? '×' : '!'}</span><div><strong>${esc(row.name)} · ${down ? 'قطع' : 'محدود'}</strong><p>${esc(reason)}</p><time>${esc(faDateTime(row.timestamp))} · ${esc(row.source === 'github' ? 'GitHub Actions' : 'Cloudflare Edge')}</time></div></article>`;
    }).join('');
  }

  function chartData(snapshots, periodMs) {
    const cutoff = Date.now() - periodMs;
    return snapshots.filter(row => new Date(row.timestamp).getTime() >= cutoff).map(snapshot => {
      const values = (snapshot.results || []).filter(row => row.status !== 'down' && asNumber(row.latency) != null).map(row => Number(row.latency));
      return values.length ? { time: new Date(snapshot.timestamp).getTime(), value: values.reduce((sum, item) => sum + item, 0) / values.length } : null;
    }).filter(Boolean);
  }

  function renderChart() {
    const svg = $('latencyChart');
    const ranges = { '1h': 60 * 60 * 1000, '6h': 6 * 60 * 60 * 1000, '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000 };
    const duration = ranges[state.period] || ranges['24h'];
    const gh = chartData(state.history.github, duration);
    const cf = chartData([...state.history.cloudflare.filter(row => !state.liveEdge || row.timestamp !== state.liveEdge.timestamp), ...(state.liveEdge ? [state.liveEdge] : [])], duration);
    const all = [...gh, ...cf];
    $('historyCount').textContent = `${faNumber(all.length)} نمونه`;
    $('chartRangeLabel').textContent = ({ '1h': '۱ ساعت اخیر', '6h': '۶ ساعت اخیر', '24h': '۲۴ ساعت اخیر', '7d': '۷ روز اخیر' })[state.period];
    svg.innerHTML = '';
    if (!all.length) {
      svg.innerHTML = '<text x="350" y="150" text-anchor="middle" class="chart-placeholder">داده‌ی تاریخی در این بازه وجود ندارد.</text>'; return;
    }
    const width = 700, height = 260, left = 48, right = 16, top = 18, bottom = 34;
    const plotW = width - left - right, plotH = height - top - bottom;
    const minTime = Date.now() - duration, maxTime = Date.now();
    const maxValue = Math.max(100, ...all.map(row => row.value));
    const yMax = Math.ceil(maxValue / 25) * 25;
    const x = time => left + ((time - minTime) / Math.max(1, duration)) * plotW;
    const y = value => top + plotH - (value / yMax) * plotH;
    const ns = 'http://www.w3.org/2000/svg';
    const add = (tag, attrs, text) => {
      const node = document.createElementNS(ns, tag);
      Object.entries(attrs || {}).forEach(([key, value]) => node.setAttribute(key, String(value)));
      if (text != null) node.textContent = text;
      svg.appendChild(node); return node;
    };
    for (let i = 0; i <= 4; i++) {
      const value = yMax * i / 4, py = y(value);
      add('line', { x1: left, y1: py, x2: width - right, y2: py, class: 'chart-grid-line' });
      add('text', { x: left - 9, y: py + 4, 'text-anchor': 'end', class: 'chart-axis-label' }, String(Math.round(value)));
    }
    for (let i = 0; i <= 4; i++) {
      const time = minTime + duration * i / 4, px = x(time);
      add('text', { x: px, y: height - 7, 'text-anchor': 'middle', class: 'chart-axis-label' }, new Date(time).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }));
    }
    const drawSeries = (points, cls, areaCls, dotCls) => {
      if (!points.length) return;
      const ordered = points.slice().sort((a, b) => a.time - b.time);
      const coords = ordered.map(row => [x(row.time), y(row.value)]);
      if (coords.length > 1) {
        const path = coords.map(([px, py], index) => `${index ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
        const area = `${path} L ${coords[coords.length - 1][0].toFixed(1)},${(top + plotH).toFixed(1)} L ${coords[0][0].toFixed(1)},${(top + plotH).toFixed(1)} Z`;
        add('path', { d: area, class: areaCls }); add('path', { d: path, class: cls });
      }
      const step = Math.max(1, Math.ceil(coords.length / 20));
      coords.filter((_, index) => index % step === 0 || index === coords.length - 1).forEach(([px, py]) => add('circle', { cx: px, cy: py, r: 3.4, class: dotCls }));
    };
    drawSeries(gh, 'chart-line-gh', 'chart-area-gh', 'chart-dot-gh');
    drawSeries(cf, 'chart-line-cf', 'chart-area-cf', 'chart-dot-cf');
    if (!gh.length && !cf.length) add('text', { x: 350, y: 150, 'text-anchor': 'middle', class: 'chart-placeholder' }, 'نمونه‌ی معتبر برای نمودار وجود ندارد.');
  }

  function openTargetDetails(id) {
    const target = [...state.catalog, ...state.dnsCatalog].find(row => row.id === id);
    const row = state.currentById.get(id);
    if (!target) return;
    state.selectedId = id;
    $('dialogTitle').textContent = target.name;
    $('dialogSubtitle').textContent = `${target.category || 'DNS'} · ${target.group || '—'} · ${row ? faDateTime(row.timestamp) : 'هنوز داده‌ای ثبت نشده'}`;
    const status = row?.status || 'unknown';
    const url = target.url || target.doh_url || '';
    const fields = [
      ['وضعیت فعلی', statusInfo(status).label], ['آخرین منبع', row?.source === 'github' ? 'GitHub Actions' : row?.source === 'cloudflare' ? 'Cloudflare Edge' : '—'],
      ['تأخیر پاسخ', fmtMs(row?.latency)], ['کد HTTP', row?.http_status ?? '—'],
      ['تأخیر ICMP', fmtMs(row?.icmp_latency)], ['وضعیت ICMP', row?.icmp_status || 'پشتیبانی‌نشده / نامشخص'],
      ['Packet loss', row?.packet_loss == null ? '—' : `${faNumber(row.packet_loss)}٪`], ['Jitter', fmtMs(row?.jitter)],
      ['DNS answers', row?.answer_count == null ? '—' : faNumber(row.answer_count)], ['Retry', row?.retry_count == null ? '—' : faNumber(row.retry_count)],
      ['منطقه', target.region || '—'], ['اهمیت هدف', target.criticality || 'normal']
    ];
    const error = row?.error || 'خطایی در آخرین نمونه ثبت نشده است.';
    const checks = row?.checks ? JSON.stringify(row.checks, null, 2) : JSON.stringify({ availability_basis: row?.availability_basis, http_status: row?.http_status, icmp_status: row?.icmp_status, resolved: row?.resolved, error: row?.error }, null, 2);
    $('dialogContent').innerHTML = `
      <div class="detail-hero"><span class="target-icon">${esc(targetInitial(target))}</span><div><strong>${esc(target.name)}</strong><div class="detail-domain">${esc(hostname(url || target.ip || ''))}</div></div><span class="status-pill ${statusClass(status)}">${statusInfo(status).label}</span></div>
      <div class="detail-grid">${fields.map(([label, value]) => `<div class="detail-field"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join('')}</div>
      <h3 class="detail-section-title">خطا / پیام آخرین بررسی</h3><pre class="detail-pre">${esc(error)}</pre>
      <h3 class="detail-section-title">سیگنال‌ها و جزئیات فنی</h3><pre class="detail-pre">${esc(checks)}</pre>
      <div class="detail-actions">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">باز کردن مقصد ↗</a>` : ''}<a href="${esc(`${CONFIG.workerUrl.replace(/\/$/, '')}/api/status`)}" target="_blank" rel="noopener noreferrer">API زنده ↗</a></div>`;
    const dialog = $('detailDialog');
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }

  function exportJson() {
    const rows = visibleTargets().map(target => ({ target, latest: state.currentById.get(target.id) || null }));
    downloadFile(`dual-ping-monitor-${isoDay(new Date())}.json`, JSON.stringify({ version: CONFIG.version, exported_at: nowIso(), sources: { github: state.sourceLatest.github?.timestamp || null, cloudflare: state.sourceLatest.cloudflare?.timestamp || null }, targets: rows }, null, 2), 'application/json;charset=utf-8');
    showToast('خروجی JSON آماده شد.', 'success');
  }

  function exportCsv() {
    const rows = visibleTargets();
    const columns = ['id', 'name', 'url', 'category', 'group', 'status', 'latency', 'http_status', 'icmp_status', 'packet_loss', 'jitter', 'error', 'timestamp'];
    const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [columns.map(quote).join(','), ...rows.map(target => {
      const row = state.currentById.get(target.id) || {};
      const values = { ...target, ...row };
      return columns.map(key => quote(Array.isArray(values[key]) ? values[key].join('; ') : values[key])).join(',');
    })];
    downloadFile(`dual-ping-monitor-${isoDay(new Date())}.csv`, '\ufeff' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    showToast('خروجی CSV آماده شد.', 'success');
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function setTheme(theme) {
    const allowed = ['aurora', 'obsidian', 'arctic', 'amethyst', 'ember'];
    state.theme = allowed.includes(theme) ? theme : CONFIG.defaultTheme;
    document.documentElement.dataset.theme = state.theme;
    $('themeSelect').value = state.theme;
    safeStorageSet(STORAGE_THEME, state.theme);
  }

  function setCategory(category) {
    state.category = category;
    $('categoryTabs').querySelectorAll('[data-category]').forEach(button => button.classList.toggle('active', button.dataset.category === category));
    renderTargets();
  }

  function renderAll() {
    buildCurrentMap();
    renderMetrics();
    renderTargets();
    renderComparison();
    renderIncidents();
    renderChart();
    updateSourceStatus();
  }

  async function loadSevenDays() {
    if (state.extraDaysLoaded) return;
    const button = document.querySelector('[data-period="7d"]');
    if (button) button.disabled = true;
    try { await loadHistorical({ days: 7, append: true }); renderAll(); }
    catch { showToast('بارگذاری بخشی از تاریخچه‌ی هفت‌روزه ممکن نشد.', 'error'); }
    finally { if (button) button.disabled = false; }
  }

  function installEvents() {
    $('refreshBtn').addEventListener('click', () => refreshLive({ fresh: true }));
    $('autoRefreshBtn').addEventListener('click', () => {
      state.autoRefresh = !state.autoRefresh;
      $('autoRefreshLabel').textContent = `بروزرسانی خودکار: ${state.autoRefresh ? 'روشن' : 'خاموش'}`;
      $('autoRefreshBtn').classList.toggle('is-off', !state.autoRefresh);
      showToast(state.autoRefresh ? 'بروزرسانی خودکار فعال شد.' : 'بروزرسانی خودکار متوقف شد.');
      scheduleAutoRefresh();
    });
    $('exportJsonBtn').addEventListener('click', exportJson);
    $('exportCsvBtn').addEventListener('click', exportCsv);
    $('themeSelect').addEventListener('change', event => setTheme(event.target.value));
    $('searchInput').addEventListener('input', event => { state.search = event.target.value || ''; renderTargets(); });
    $('groupSelect').addEventListener('change', event => { state.group = event.target.value; renderTargets(); });
    $('sortSelect').addEventListener('change', event => { state.sort = event.target.value; renderTargets(); });
    $('categoryTabs').querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => setCategory(button.dataset.category)));
    $('chartTabs').querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', async () => {
      state.period = button.dataset.period;
      $('chartTabs').querySelectorAll('[data-period]').forEach(item => item.classList.toggle('active', item === button));
      if (state.period === '7d') await loadSevenDays();
      renderChart();
    }));
    $('closeDialog').addEventListener('click', () => $('detailDialog').close());
    $('closeShortcuts').addEventListener('click', () => $('shortcutsDialog').close());
    $('detailDialog').addEventListener('click', event => { if (event.target === $('detailDialog')) $('detailDialog').close(); });
    $('shortcutsDialog').addEventListener('click', event => { if (event.target === $('shortcutsDialog')) $('shortcutsDialog').close(); });
    $('clearCacheBtn').addEventListener('click', async () => {
      safeStorageRemove(STORAGE_THEME);
      try { const keys = await caches.keys(); await Promise.all(keys.map(key => caches.delete(key))); } catch {}
      setTheme(CONFIG.defaultTheme);
      showToast('کش محلی پاک شد؛ برای دریافت نسخه‌ی تازه صفحه را بارگذاری کنید.', 'success');
    });
    document.addEventListener('keydown', event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const tag = event.target?.tagName?.toLowerCase();
      const typing = ['input', 'textarea', 'select'].includes(tag) || event.target?.isContentEditable;
      if (event.key === 'Escape') { $('detailDialog').close?.(); $('shortcutsDialog').close?.(); return; }
      if (typing) return;
      if (event.key.toLowerCase() === 'r') refreshLive({ quiet: false, fresh: true });
      if (event.key === '/') { event.preventDefault(); $('searchInput').focus(); }
      if (event.key.toLowerCase() === 't') {
        const themes = ['aurora', 'obsidian', 'arctic', 'amethyst', 'ember'];
        setTheme(themes[(themes.indexOf(state.theme) + 1) % themes.length]);
      }
      if (event.key === '?') { const dialog = $('shortcutsDialog'); if (!dialog.open) dialog.showModal(); }
      const periods = { '1': '1h', '2': '6h', '3': '24h', '4': '7d' };
      if (periods[event.key]) document.querySelector(`[data-period="${periods[event.key]}"]`)?.click();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && state.autoRefresh) refreshLive({ quiet: true });
    });
  }

  function scheduleAutoRefresh() {
    if (state.refreshTimer) window.clearInterval(state.refreshTimer);
    state.refreshTimer = null;
    if (state.autoRefresh) state.refreshTimer = window.setInterval(() => refreshLive({ quiet: true }), CONFIG.autoRefreshMs || 60000);
  }

  async function init() {
    setTheme(state.theme);
    installEvents();
    $('heroVersion').textContent = `DPM / ${CONFIG.version}`;
    let finished = false;
    const startup = (async () => {
      const errors = [];
      try { await loadCatalog(); } catch (error) { errors.push(error); }
      try { await loadHistorical({ days: 2 }); } catch (error) { errors.push(error); }
      finished = true;
      return errors;
    })();
    const errors = await Promise.race([startup, sleep(6000).then(() => null)]);
    if (errors?.length) {
      state.lastError = errors[0];
      showToast('بخشی از کاتالوگ یا تاریخچه در دسترس نبود؛ دریافت زنده همچنان فعال است.', 'error');
    }
    buildCurrentMap();
    renderAll();
    hideBootScreen();
    if (!finished) {
      startup.then(lateErrors => {
        if (lateErrors.length) state.lastError = lateErrors[0];
        buildCurrentMap(); renderAll();
      }).catch(() => {});
    }
    // The edge probe runs independently, so the dashboard does not wait for
    // a slow or unreachable target before becoming usable.
    refreshLive({ quiet: true });
    scheduleAutoRefresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
