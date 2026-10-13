(() => {
  'use strict';

  const CONFIG = {
    refreshMs: 30000,
    historyDays: 14,
    dataBase: '../data/',
    cloudflareEndpoint: localStorage.getItem('dpm-cloudflare-endpoint') || '',
    storageKey: 'dpm-ui-v2'
  };

  const state = {
    date: null,
    index: null,
    merged: null,
    github: [],
    cloudflare: [],
    sourceLatest: { github: null, cloudflare: null },
    category: 'all',
    search: '',
    sort: 'status',
    period: 24,
    autoRefresh: true,
    refreshing: false,
    timer: null,
    selectedId: null,
    theme: localStorage.getItem(CONFIG.storageKey) || 'aurora'
  };

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const num = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const fmtMs = value => num(value) == null ? '—' : `${Math.round(value)} ms`;
  const pct = (a, b) => b ? `${Math.round((a / b) * 100)}%` : '—';
  const faTime = iso => iso ? new Date(iso).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const faClock = iso => iso ? new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) : '—';
  const statusRank = { down: 0, up: 1 };

  function normalizeSnapshot(snapshot, fallbackSource) {
    if (!snapshot) return null;
    if (Array.isArray(snapshot)) return snapshot.map(x => normalizeSnapshot(x, fallbackSource)).filter(Boolean);
    const source = snapshot.source || fallbackSource;
    const results = Array.isArray(snapshot.results) ? snapshot.results : [];
    return {
      timestamp: snapshot.timestamp || new Date().toISOString(),
      source,
      total: num(snapshot.total) ?? results.length,
      up: num(snapshot.up) ?? results.filter(r => r.status === 'up').length,
      down: num(snapshot.down) ?? results.filter(r => r.status === 'down').length,
      duration_ms: snapshot.duration_ms ?? null,
      results: results.map((r, i) => ({
        id: r.id || `${source}-${i}-${r.name || 'target'}`,
        name: r.name || r.title || 'Unknown',
        target: r.target || r.url || r.ip || '',
        category: r.category || (r.type === 'dns' ? 'DNS' : 'سایر'),
        type: r.type || 'site',
        status: r.status === 'up' ? 'up' : 'down',
        availability_basis: r.availability_basis || 'unknown',
        latency: num(r.latency),
        http_latency: num(r.http_latency),
        http_status: r.http_status ?? null,
        dns_latency: num(r.dns_latency),
        tcp53_latency: num(r.tcp53_latency),
        icmp_latency: num(r.icmp_latency),
        icmp_status: r.icmp_status || 'unknown',
        packet_loss: num(r.packet_loss) ?? null,
        jitter: num(r.jitter),
        resolved: Array.isArray(r.resolved) ? r.resolved : [],
        checks: r.checks || {},
        timestamp: r.timestamp || snapshot.timestamp
      }))
    };
  }

  function latestSnapshot(raw, source) {
    const list = normalizeSnapshot(raw, source);
    if (!list) return null;
    const arr = Array.isArray(list) ? list : [list];
    return arr.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0] || null;
  }

  async function fetchJson(url, timeout = 7000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function discoverDate() {
    try {
      const index = await fetchJson(`${CONFIG.dataBase}index.json`);
      state.index = index;
      if (index?.latest) return index.latest;
    } catch (_) {}

    const base = new Date();
    for (let offset = 0; offset < CONFIG.historyDays; offset += 1) {
      const date = new Date(base);
      date.setUTCDate(base.getUTCDate() - offset);
      const key = date.toISOString().slice(0, 10);
      try {
        await fetchJson(`${CONFIG.dataBase}merged/${key}.json`, 3500);
        return key;
      } catch (_) {}
    }
    return null;
  }

  async function loadData() {
    state.refreshing = true;
    updateSystem('loading', 'در حال دریافت');
    try {
      const date = await discoverDate();
      if (!date) throw new Error('No dataset found');
      state.date = date;
      const mergedRaw = await fetchJson(`${CONFIG.dataBase}merged/${date}.json`);
      state.merged = mergedRaw;
      state.github = Array.isArray(mergedRaw?.sources?.github)
        ? mergedRaw.sources.github.map(x => normalizeSnapshot(x, 'github')).filter(Boolean)
        : [];
      state.cloudflare = Array.isArray(mergedRaw?.sources?.cloudflare)
        ? mergedRaw.sources.cloudflare.map(x => normalizeSnapshot(x, 'cloudflare')).filter(Boolean)
        : [];

      state.github = state.github.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      state.cloudflare = state.cloudflare.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      state.sourceLatest.github = latestSnapshot(state.github, 'github');
      state.sourceLatest.cloudflare = latestSnapshot(state.cloudflare, 'cloudflare');

      await tryCloudflareEdge();
      render();
      updateSystem(state.github.length ? 'ok' : 'warn', state.github.length ? 'اتصال برقرار' : 'داده محدود');
    } catch (error) {
      console.error('[DPM] load failed', error);
      updateSystem('error', 'دریافت ناموفق');
      renderEmpty(`داده‌ها قابل دریافت نیستند: ${error.message}`);
    } finally {
      state.refreshing = false;
    }
  }

  async function tryCloudflareEdge() {
    if (!CONFIG.cloudflareEndpoint) return;
    try {
      const raw = await fetchJson(CONFIG.cloudflareEndpoint, 6500);
      const edge = normalizeSnapshot(raw, 'cloudflare');
      if (edge) {
        state.sourceLatest.cloudflare = edge;
        state.cloudflare.push(edge);
        state.cloudflare.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      }
    } catch (error) {
      console.info('[DPM] Cloudflare edge unavailable', error.message);
    }
  }

  function getPrimaryResults() {
    const snap = state.sourceLatest.github || state.sourceLatest.cloudflare;
    return snap?.results || [];
  }

  function getFilteredResults() {
    let results = getPrimaryResults().slice();
    const q = state.search.trim().toLowerCase();
    if (state.category !== 'all') results = results.filter(r => r.category === state.category);
    if (q) results = results.filter(r => [r.name, r.target, r.category, r.type].some(v => String(v || '').toLowerCase().includes(q)));
    if (state.sort === 'name') results.sort((a, b) => a.name.localeCompare(b.name));
    if (state.sort === 'category') results.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    if (state.sort === 'latency') results.sort((a, b) => (a.latency ?? 999999) - (b.latency ?? 999999));
    if (state.sort === 'status') results.sort((a, b) => (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) || (a.latency ?? 999999) - (b.latency ?? 999999));
    return results;
  }

  function render() {
    const latest = state.sourceLatest.github || state.sourceLatest.cloudflare;
    const results = latest?.results || [];
    const up = results.filter(r => r.status === 'up').length;
    const down = results.length - up;
    const latencies = results.map(r => r.latency).filter(v => v != null);
    const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
    const losses = results.map(r => r.packet_loss).filter(v => v != null);
    const loss = losses.length ? Math.round(losses.reduce((a, b) => a + b, 0) / losses.length) : null;

    $('totalMetric').textContent = results.length || '—';
    $('upMetric').textContent = results.length ? up : '—';
    $('downMetric').textContent = results.length ? down : '—';
    $('avgMetric').textContent = avg == null ? '—' : `${avg}ms`;
    $('uptimeMetric').textContent = results.length ? pct(up, results.length) : '—';
    $('lossMetric').textContent = loss == null ? '—' : `${loss}%`;
    $('upRatio').textContent = results.length ? pct(up, results.length) : 'Current';
    $('downRatio').textContent = results.length ? pct(down, results.length) : 'Current';
    $('dataDate').textContent = state.date || '—';
    $('lastUpdate').textContent = latest ? faTime(latest.timestamp) : '—';
    $('historyCount').textContent = `${Math.max(state.github.length, state.cloudflare.length)} snaps`;
    $('githubSourceMeta').textContent = state.sourceLatest.github ? `${state.sourceLatest.github.results.length} هدف • ${faTime(state.sourceLatest.github.timestamp)}` : 'بدون snapshot';
    $('cfSourceMeta').textContent = CONFIG.cloudflareEndpoint ? 'Edge endpoint فعال' : 'Endpoint اختیاری / غیرفعال';
    $('githubState').textContent = state.sourceLatest.github ? `${state.sourceLatest.github.up}/${state.sourceLatest.github.total}` : '—';
    $('cfState').textContent = state.sourceLatest.cloudflare ? `${state.sourceLatest.cloudflare.up}/${state.sourceLatest.cloudflare.total}` : '—';

    renderTargets();
    renderChart();
    renderCompare();
    renderResilience(results);
    $('footerDataInfo').textContent = `Dataset ${state.date || '—'} • refresh ${CONFIG.refreshMs / 1000}s`;
  }

  function renderTargets() {
    const data = getFilteredResults();
    $('visibleCount').textContent = `${data.length} / ${getPrimaryResults().length}`;
    if (!data.length) { $('targetGrid').innerHTML = `<div class="empty-state">${getPrimaryResults().length ? 'نتیجه‌ای برای فیلتر فعلی پیدا نشد.' : 'هیچ داده‌ای برای نمایش وجود ندارد.'}</div>`; return; }
    $('targetGrid').innerHTML = data.map((r, index) => `
      <button class="target-card ${r.status}" data-id="${esc(r.id)}" style="--i:${index}">
        <span class="target-index">${String(index + 1).padStart(2, '0')}</span>
        <span class="target-icon">${r.type === 'dns' ? 'DNS' : '↯'}</span>
        <span class="target-copy"><strong>${esc(r.name)}</strong><small>${esc(r.target)}</small></span>
        <span class="target-meta"><b>${fmtMs(r.latency)}</b><em>${esc(r.availability_basis)}</em></span>
        <span class="status-light"></span>
      </button>`).join('');
    document.querySelectorAll('.target-card').forEach(card => card.addEventListener('click', () => openDetails(card.dataset.id)));
  }

  function renderChart() {
    const svg = $('latencyChart');
    const width = 640; const height = 300; const pad = 28;
    const githubSeries = seriesFor(state.github, state.period);
    const cfSeries = seriesFor(state.cloudflare, state.period);
    const allValues = [...githubSeries.values, ...cfSeries.values].filter(v => v != null);
    if (!allValues.length) { svg.innerHTML = `<text x="320" y="150" text-anchor="middle" fill="currentColor" opacity=".55">داده‌ی نموداری موجود نیست</text>`; return; }
    const max = Math.max(100, Math.ceil(Math.max(...allValues) / 10) * 10);
    const min = 0;
    const points = arr => arr.map((v, i) => v == null ? null : `${pad + (i * (width - 2 * pad)) / Math.max(1, arr.length - 1)},${height - pad - ((v - min) / (max - min)) * (height - 2 * pad)}`).filter(Boolean).join(' ');
    const pathFrom = arr => {
      let out = ''; let started = false;
      arr.forEach((v, i) => { if (v == null) { started = false; return; } const x = pad + (i * (width - 2 * pad)) / Math.max(1, arr.length - 1); const y = height - pad - ((v - min) / (max - min)) * (height - 2 * pad); out += `${started ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)} `; started = true; });
      return out.trim();
    };
    const grid = [0, .25, .5, .75, 1].map(t => { const y = height - pad - t * (height - 2 * pad); return `<line x1="${pad}" x2="${width-pad}" y1="${y}" y2="${y}" class="chart-grid"/><text x="${pad-8}" y="${y+4}" text-anchor="end" class="chart-label">${Math.round(max*t)}ms</text>`; }).join('');
    svg.innerHTML = `${grid}<path d="${pathFrom(githubSeries.values)}" class="chart-line github-line"/><path d="${pathFrom(cfSeries.values)}" class="chart-line cf-line"/>${seriesDots(githubSeries.values, 'github', max)}${seriesDots(cfSeries.values, 'cf', max)}`;
  }

  function seriesDots(values, cls, max) {
    const width = 640, height = 300, pad = 28;
    return values.map((v, i) => {
      if (v == null) return '';
      const x = pad + (i * (width - 2*pad)) / Math.max(1, values.length - 1);
      const y = height - pad - (v / max) * (height - 2*pad);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" class="chart-dot ${cls}"/>`;
    }).join('');
  }

  function seriesFor(snapshots, period) {
    const sliced = snapshots.slice(-period);
    return { labels: sliced.map(s => faClock(s.timestamp)), values: sliced.map(s => averageLatency(s.results)) };
  }

  function averageLatency(results = []) {
    const values = results.map(r => r.latency).filter(v => v != null);
    return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  }

  function renderCompare() {
    const body = $('compareBody');
    const github = state.sourceLatest.github?.results || [];
    const cf = state.sourceLatest.cloudflare?.results || [];
    if (!github.length && !cf.length) { body.innerHTML = `<tr><td colspan="6" class="empty-cell">مقایسه‌ای موجود نیست.</td></tr>`; return; }
    const map = new Map();
    [...github.map(r => ['github', r]), ...cf.map(r => ['cloudflare', r])].forEach(([source, row]) => {
      if (!map.has(row.id)) map.set(row.id, { name: row.name, category: row.category, github: null, cloudflare: null });
      map.get(row.id)[source] = row;
    });
    body.innerHTML = [...map.values()].slice(0, 50).map(row => {
      const g = row.github, c = row.cloudflare;
      const diff = g?.latency != null && c?.latency != null ? Math.abs(g.latency - c.latency) : null;
      return `<tr><td><strong>${esc(row.name)}</strong></td><td>${esc(row.category)}</td><td>${cellFor(g)}</td><td>${cellFor(c)}</td><td>${diff == null ? '—' : `<span class="diff-pill ${diff > 80 ? 'high' : diff > 30 ? 'mid' : ''}">${diff}ms</span>`}</td><td><code>${esc(g?.availability_basis || c?.availability_basis || '—')}</code></td></tr>`;
    }).join('');
  }

  function cellFor(row) {
    if (!row) return `<span class="muted">بدون داده</span>`;
    return `<span class="table-status ${row.status}"><i></i>${row.status === 'up' ? 'UP' : 'DOWN'} <b>${fmtMs(row.latency)}</b></span>`;
  }

  function renderResilience(results) {
    const total = results.length || 1;
    const up = results.filter(r => r.status === 'up').length;
    const hasLatency = results.filter(r => r.latency != null).length;
    const httpBacked = results.filter(r => r.availability_basis === 'https').length;
    const dnsBacked = results.filter(r => r.availability_basis === 'dns').length;
    const score = Math.round(((up / total) * 60) + ((hasLatency / total) * 20) + (((httpBacked + dnsBacked) / total) * 20));
    $('resilienceScore').textContent = `${score}/100`;
    $('resilienceBar').style.width = `${score}%`;
    $('resilienceList').innerHTML = [
      `<li><span class="ok">✓</span> لایه‌ی جایگزین برای ICMP فعال است</li>`,
      `<li><span class="ok">✓</span> داده‌ی خام همراه با جزئیات probe ذخیره می‌شود</li>`,
      `<li><span class="ok">✓</span> خرابی یک منبع، کل داشبورد را نمی‌خواباند</li>`,
      `<li><span class="warn">•</span> Cloudflare ${CONFIG.cloudflareEndpoint ? 'فعال' : 'اختیاری'}</li>`
    ].join('');
  }

  function openDetails(id) {
    state.selectedId = id;
    const row = getPrimaryResults().find(x => x.id === id);
    if (!row) return;
    $('dialogTitle').textContent = row.name;
    $('dialogContent').innerHTML = `
      <div class="detail-grid">
        <div><span>Target</span><b>${esc(row.target)}</b></div>
        <div><span>Status</span><b class="${row.status}">${row.status === 'up' ? 'ONLINE' : 'OFFLINE'}</b></div>
        <div><span>Latency</span><b>${fmtMs(row.latency)}</b></div>
        <div><span>Basis</span><b>${esc(row.availability_basis)}</b></div>
        <div><span>HTTP</span><b>${row.http_status || '—'} ${fmtMs(row.http_latency)}</b></div>
        <div><span>DNS</span><b>${fmtMs(row.dns_latency)}</b></div>
        <div><span>ICMP</span><b>${esc(row.icmp_status)} ${fmtMs(row.icmp_latency)}</b></div>
        <div><span>Packet Loss</span><b>${row.packet_loss == null ? '—' : `${row.packet_loss}%`}</b></div>
        <div><span>Jitter</span><b>${fmtMs(row.jitter)}</b></div>
        <div><span>Last Check</span><b>${faTime(row.timestamp)}</b></div>
      </div>
      <pre>${esc(JSON.stringify(row.checks || {}, null, 2))}</pre>`;
    $('detailDialog').showModal();
  }

  function renderEmpty(message) {
    $('targetGrid').innerHTML = `<div class="empty-state">${esc(message)}</div>`;
    $('compareBody').innerHTML = `<tr><td colspan="6" class="empty-cell">${esc(message)}</td></tr>`;
    $('historyCount').textContent = '0 snaps';
    $('visibleCount').textContent = '0';
  }

  function updateSystem(kind, text) {
    const el = $('systemBadge');
    el.className = `system-badge ${kind}`;
    el.innerHTML = `<span class="pulse"></span><strong>${esc(text)}</strong>`;
  }

  function exportData(format) {
    const payload = state.merged || { date: state.date, sources: { github: state.github, cloudflare: state.cloudflare } };
    const content = format === 'json' ? JSON.stringify(payload, null, 2) : toCsv();
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `dual-ping-${state.date || 'data'}.${format}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toCsv() {
    const rows = [['source','timestamp','name','target','category','status','latency_ms','availability_basis','packet_loss','jitter']];
    for (const snap of [...state.github, ...state.cloudflare]) for (const r of snap.results) rows.push([snap.source,snap.timestamp,r.name,r.target,r.category,r.status,r.latency ?? '',r.availability_basis,r.packet_loss ?? '',r.jitter ?? '']);
    return rows.map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  }

  function setAutoRefresh(enabled) {
    state.autoRefresh = enabled;
    $('autoRefreshBtn').textContent = `⏱ خودکار: ${enabled ? 'روشن' : 'خاموش'}`;
    clearInterval(state.timer);
    if (enabled) state.timer = setInterval(loadData, CONFIG.refreshMs);
  }

  function setTheme(theme) {
    state.theme = theme;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(CONFIG.storageKey, theme);
  }

  function bind() {
    $('refreshBtn').addEventListener('click', loadData);
    $('themeBtn').addEventListener('click', () => setTheme(state.theme === 'aurora' ? 'midnight' : 'aurora'));
    $('autoRefreshBtn').addEventListener('click', () => setAutoRefresh(!state.autoRefresh));
    $('exportJsonBtn').addEventListener('click', () => exportData('json'));
    $('exportCsvBtn').addEventListener('click', () => exportData('csv'));
    $('searchInput').addEventListener('input', e => { state.search = e.target.value; renderTargets(); });
    $('sortSelect').addEventListener('change', e => { state.sort = e.target.value; renderTargets(); });
    $('categoryTabs').addEventListener('click', e => {
      const button = e.target.closest('button[data-category]'); if (!button) return;
      document.querySelectorAll('#categoryTabs button').forEach(x => x.classList.remove('active')); button.classList.add('active');
      state.category = button.dataset.category; renderTargets();
    });
    $('chartTabs').addEventListener('click', e => {
      const button = e.target.closest('button[data-period]'); if (!button) return;
      document.querySelectorAll('#chartTabs button').forEach(x => x.classList.remove('active')); button.classList.add('active'); state.period = Number(button.dataset.period); renderChart();
    });
    $('closeDialog').addEventListener('click', () => $('detailDialog').close());
    $('detailsBtn').addEventListener('click', () => $('shortcutsDialog').showModal());
    $('closeShortcuts').addEventListener('click', () => $('shortcutsDialog').close());
    $('clearCacheBtn').addEventListener('click', () => { localStorage.removeItem(CONFIG.storageKey); localStorage.removeItem('dpm-cloudflare-endpoint'); location.reload(); });
    $('edgeConfigBtn').addEventListener('click', () => {
      const value = prompt('آدرس Cloudflare Worker را وارد کنید:', CONFIG.cloudflareEndpoint);
      if (value == null) return;
      if (value.trim()) localStorage.setItem('dpm-cloudflare-endpoint', value.trim()); else localStorage.removeItem('dpm-cloudflare-endpoint');
      location.reload();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { $('detailDialog').open && $('detailDialog').close(); $('shortcutsDialog').open && $('shortcutsDialog').close(); }
      if (e.target.matches('input,textarea,select')) return;
      if (e.key.toLowerCase() === 'r') loadData();
      if (e.key === '/') { e.preventDefault(); $('searchInput').focus(); }
      if (e.key.toLowerCase() === 't') setTheme(state.theme === 'aurora' ? 'midnight' : 'aurora');
    });
  }

  setTheme(state.theme);
  bind();
  setAutoRefresh(true);
  loadData();
})();
