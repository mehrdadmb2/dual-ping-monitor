(() => {
  'use strict';

  const C = window.DPM_CONFIG || {};
  const state = {
    source: 'github', date: 'latest', history: 12, issuesOnly: false,
    category: 'all', search: '', view: 'grid', autoRefresh: true, loading: false,
    githubLatest: null, githubHistory: [], cloudflareLatest: null,
    allResults: [], filteredResults: [], nextRefreshAt: 0
  };

  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const isNum = Number.isFinite;
  const percent = (n,d) => d ? Math.round((n/d)*100) : 0;
  const ms = n => isNum(n) ? `${Math.round(n)} ms` : '—';
  const time = iso => iso ? new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit'}).format(new Date(iso)) : '—';
  const dateTime = iso => iso ? new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(iso)) : '—';
  const statusName = s => ({up:'UP',degraded:'DEGRADED',down:'DOWN'})[s] || 'UNKNOWN';

  function toast(msg, type='ok') {
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = msg;
    $('toastStack').appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function banner(title, message, stateName='ok') {
    $('bannerTitle').textContent = title;
    $('bannerMessage').textContent = message;
    $('dataBanner').dataset.state = stateName;
    $('heroSignal').textContent = stateName === 'ok' ? 'NOMINAL' : stateName === 'warn' ? 'DEGRADED' : 'NO DATA';
  }

  async function getJson(url, timeout=10000) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`, {cache:'no-store',signal:ctl.signal,headers:{Accept:'application/json'}});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } finally { clearTimeout(timer); }
  }

  function normalizeSample(s, fallbackSource) {
    if (!s || !Array.isArray(s.results)) return null;
    return {...s,source:s.source || fallbackSource};
  }

  async function loadGithub() {
    let latest;
    try { latest = await getJson(C.githubLatest || 'data/latest.json'); }
    catch {
      const d = new Date().toISOString().slice(0,10);
      const samples = await getJson(`${C.githubRoot || 'data/github/'}${d}.json`);
      latest = {date:d,sources:{github:Array.isArray(samples)&&samples.length?samples[samples.length-1]:null}};
    }
    state.githubLatest = normalizeSample(latest?.sources?.github,'github');

    const index = await getJson(C.dataIndex || 'data/index.json').catch(() => ({dates:[]}));
    const dates = Array.isArray(index.dates) && index.dates.length ? index.dates : (latest?.date ? [latest.date] : []);
    const select = $('dateSelect');
    const before = state.date;
    select.innerHTML = `<option value="latest">آخرین داده</option>${dates.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('')}`;
    state.date = dates.includes(before) ? before : 'latest';
    select.value = state.date;

    const selectedDate = state.date === 'latest' ? latest?.date : state.date;
    if (!selectedDate) { state.githubHistory=[]; return; }
    const data = await getJson(`${C.githubRoot || 'data/github/'}${selectedDate}.json`);
    state.githubHistory = Array.isArray(data) ? data.map(x=>normalizeSample(x,'github')).filter(Boolean) : [];
  }

  async function loadCloudflare() {
    const endpoint = String(C.cloudflareApiUrl || '').trim();
    if (!endpoint) { state.cloudflareLatest=null; return; }
    const data = await getJson(endpoint,15000);
    state.cloudflareLatest = normalizeSample(data?.latest || data?.sample || data,'cloudflare');
  }

  function latest(source) {
    if (source === 'cloudflare') return normalizeSample(state.cloudflareLatest,'cloudflare');
    return state.date === 'latest' ? state.githubLatest : state.githubHistory[state.githubHistory.length-1] || null;
  }

  function results(source) { return latest(source)?.results || []; }

  function combineCompare() {
    const gh = results('github'), cf = results('cloudflare');
    const map = new Map();
    gh.forEach(r => map.set(r.target || r.name, {key:r.target || r.name,github:r}));
    cf.forEach(r => {
      const key = r.target || r.name;
      const row = map.get(key) || {key};
      row.cloudflare = r; map.set(key,row);
    });
    return [...map.values()];
  }

  async function reload() {
    if (state.loading) return;
    state.loading=true; $('refreshBtn').classList.add('busy'); $('refreshBtn').disabled=true;
    try {
      await loadGithub();
      await loadCloudflare().catch(err => { console.warn('[DPM] Cloudflare unavailable:',err); state.cloudflareLatest=null; });
      applySource();
      const live = latest(state.source === 'compare' ? 'github' : state.source);
      const stale = live?.timestamp && C.staleAfterMs && (Date.now()-new Date(live.timestamp).getTime() > C.staleAfterMs);
      banner(stale ? 'داده قدیمی است' : 'Telemetry آماده است', stale ? `آخرین snapshot در ${dateTime(live.timestamp)} ثبت شده؛ مانیتور احتمالاً موقتاً متوقف است.` : `${state.allResults.length} هدف از منبع ${state.source === 'github' ? 'GitHub' : state.source === 'cloudflare' ? 'Cloudflare' : 'هر دو'} بارگذاری شد.`, stale ? 'warn':'ok');
      $('connectionPill').classList.remove('offline');
      if (!stale) toast('داده‌های واقعی با موفقیت بروزرسانی شدند.');
    } catch(err) {
      console.error('[DPM]',err);
      banner('دریافت دیتا ناموفق بود',`خطا: ${err.message}. آخرین وضعیت معتبر در حافظه نگه داشته شد.`,'err');
      $('connectionPill').classList.add('offline');
      toast('منبع دیتا پاسخ نداد.','err');
    } finally {
      state.loading=false; $('refreshBtn').classList.remove('busy'); $('refreshBtn').disabled=false; schedule();
    }
  }

  function applySource() {
    if (state.source === 'compare') state.allResults = combineCompare();
    else state.allResults = results(state.source);
    renderAll();
  }

  function filtered() {
    const q=state.search.trim().toLowerCase();
    return state.allResults.filter(r => {
      const candidates = [r.name,r.target,r.category,r.type,r.protocol];
      const qok = !q || candidates.filter(Boolean).some(v=>String(v).toLowerCase().includes(q));
      const cok = state.category==='all' || r.category===state.category;
      const sok = !state.issuesOnly || r.status!=='up';
      return qok && cok && sok;
    });
  }

  function renderMetrics() {
    const a=state.allResults, total=a.length, up=a.filter(r=>r.status==='up').length, dg=a.filter(r=>r.status==='degraded').length, down=a.filter(r=>r.status==='down').length;
    const lat=a.map(r=>r.latency).filter(isNum), avg=lat.length ? lat.reduce((x,y)=>x+y,0)/lat.length : null;
    $('metricTotal').textContent=total||'—'; $('metricUp').textContent=total?up:'—'; $('metricDegraded').textContent=total?dg:'—'; $('metricDown').textContent=total?down:'—'; $('metricLatency').textContent=avg==null?'—':Math.round(avg);
    $('metricUpPct').textContent=total?`${percent(up,total)}% availability`:'—'; $('metricDownPct').textContent=total?`${percent(down,total)}% unavailable`:'—';
    $('latencyBadge').textContent=avg==null?'NO DATA':avg<80?'FAST':avg<180?'NORMAL':avg<350?'SLOW':'HIGH';
    $('meterTotal').style.width=total?'100%':'0%'; $('meterUp').style.width=`${percent(up,total)}%`; $('meterDegraded').style.width=`${percent(dg,total)}%`; $('meterDown').style.width=`${percent(down,total)}%`;
  }

  function renderCard(r) {
    const latency=ms(r.latency), metric=latency==='—'?'NO SIGNAL':latency;
    const proto=r.type==='dns' ? `${r.protocol||'DNS'} · loss ${r.packet_loss==null?'—':`${r.packet_loss}%`}` : `${r.protocol||'HTTP'} · ${r.http_status??'—'}`;
    return `<article class="target-card ${esc(r.status)}"><div class="t-top"><div class="target-name">${esc(r.name)}</div><span class="target-badge ${esc(r.status)}">${esc(statusName(r.status))}</span></div><div class="target-meta"><div><div class="target-latency">${esc(metric)}</div><div class="target-type">${esc(proto)}</div></div><div class="target-category">${esc(r.category||'—')}</div></div><div class="target-spark"></div><div class="target-footer"><span>${esc(time(r.timestamp))}</span><span>${esc(r.error||'')}</span></div></article>`;
  }

  function renderTargets() {
    const rows=filtered(); state.filteredResults=rows; $('resultCount').textContent=`${rows.length} / ${state.allResults.length} targets`;
    $('targetsGrid').innerHTML=rows.length?rows.map(renderCard).join(''):'<div class="target-card" style="grid-column:1/-1;color:var(--muted)">نتیجه‌ای با این فیلترها پیدا نشد.</div>';
    $('targetsTable').innerHTML=rows.length?rows.map(r=>`<tr><td class="cell-name">${esc(r.name)}</td><td>${esc(r.category||'—')}</td><td class="cell-status">${esc(statusName(r.status))}</td><td>${esc(ms(r.latency))}</td><td>${esc(r.http_status??r.protocol??'—')}</td><td>${r.packet_loss==null?'—':esc(`${r.packet_loss}%`)}</td><td>${esc(time(r.timestamp))}</td></tr>`).join(''):'<tr><td colspan="7">No results</td></tr>';
  }

  function renderHistory() {
    const list=(state.source==='github'||state.source==='compare')?state.githubHistory.slice(-state.history).reverse():[];
    $('historyList').innerHTML=list.length?list.map(r=>`<div class="history-row"><div class="history-time">${esc(dateTime(r.timestamp))}</div><div class="history-cell"><small>UP</small><strong style="color:var(--green)">${r.up??'—'}</strong></div><div class="history-cell"><small>DEGRADED</small><strong style="color:var(--amber)">${r.degraded??0}</strong></div><div class="history-cell"><small>DOWN</small><strong style="color:var(--red)">${r.down??'—'}</strong></div><div class="history-cell"><small>AVG</small><strong>${esc(ms(r.avg_latency))}</strong></div><div class="history-cell"><small>MEASURED</small><strong>${r.measured??'—'}</strong></div><div><span class="target-badge ${r.down?'down':'up'}">${r.down?'ISSUES':'HEALTHY'}</span></div></div>`).join(''):'<div class="history-row"><div class="history-time">No history</div></div>';
  }

  let chart=null;
  function renderChart() {
    if (!window.Chart) return;
    const canvas=$('latencyChart'), data=state.githubHistory.slice(-state.history), labels=data.map(x=>time(x.timestamp)), avg=data.map(x=>isNum(x.avg_latency)?x.avg_latency:null), av=data.map(x=>x.total?percent(x.up||0,x.total):null);
    if(chart)chart.destroy();
    chart=new Chart(canvas,{data:{labels,datasets:[{type:'line',label:'Latency',data:avg,borderColor:'#62e9ff',backgroundColor:'rgba(98,233,255,.08)',fill:true,tension:.34,spanGaps:true,pointRadius:2,yAxisID:'y'},{type:'line',label:'Availability',data:av,borderColor:'#62f19a',backgroundColor:'transparent',borderDash:[6,5],tension:.34,spanGaps:true,pointRadius:0,yAxisID:'y2'}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#69758a',maxTicksLimit:8,font:{size:9}}},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,.045)'},ticks:{color:'#69758a',font:{size:9}}},y2:{beginAtZero:true,max:100,position:'right',grid:{drawOnChartArea:false},ticks:{color:'#69758a',font:{size:9},callback:v=>`${v}%`}}}}});
    const vals=avg.filter(isNum); $('chartBest').textContent=vals.length?`Best ${Math.min(...vals)}ms`:'Best —'; $('chartWorst').textContent=vals.length?`Worst ${Math.max(...vals)}ms`:'Worst —';
  }

  function renderSources() {
    const gh=latest('github'), cf=latest('cloudflare'), gs=gh?percent(gh.up||0,gh.total||0):null, cs=cf?percent(cf.up||0,cf.total||0):null;
    $('githubSourceScore').textContent=gs==null?'—':`${gs}%`; $('githubSourceTime').textContent=gh?dateTime(gh.timestamp):'No snapshot'; $('cloudflareSourceScore').textContent=cs==null?'—':`${cs}%`; $('cloudflareSourceTime').textContent=cf?dateTime(cf.timestamp):'Not connected'; $('cloudflareSourceScore').classList.toggle('off',!cf); $('sourceState').textContent=cf?'DUAL LINK':'GITHUB ONLY';
    $('sourceNote').textContent=cf?'هر دو منبع حاضرند؛ Compare اختلاف‌ها را از روی target کنار هم قرار می‌دهد.':'Cloudflare endpoint در docs/config.js تنظیم نشده است؛ سیستم عمداً دیتای ساختگی تولید نمی‌کند.';
  }

  function renderLastUpdate(){ const x=latest(state.source==='compare'?'github':state.source); $('lastUpdated').textContent=x?.timestamp?`Updated ${dateTime(x.timestamp)}`:'No live snapshot'; }
  function renderAll(){ renderMetrics(); renderTargets(); renderHistory(); renderSources(); renderChart(); renderLastUpdate(); }

  function exportCsv(){
    const rows=state.filteredResults.length?state.filteredResults:state.allResults, fields=['name','target','category','type','status','latency','packet_loss','jitter','http_status','protocol','timestamp','error'];
    const csv=[fields.join(','),...rows.map(r=>fields.map(k=>JSON.stringify(r[k]??'')).join(','))].join('\n');
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([`\ufeff${csv}`],{type:'text/csv;charset=utf-8'})); a.download=`dual-ping-${new Date().toISOString().slice(0,10)}.csv`; a.click(); toast('CSV آماده شد.');
  }

  function diagnostics(){
    const gh=latest('github');
    const rows=[['Browser',navigator.userAgent],['Online',navigator.onLine?'true':'false'],['Source',state.source],['Snapshot',gh?.timestamp||'none'],['Targets',String(state.allResults.length)],['Chart.js',window.Chart?'loaded':'missing'],['Cloudflare endpoint',C.cloudflareApiUrl||'not configured'],['Service Worker','serviceWorker' in navigator?'supported':'unsupported']];
    $('diagnosticsBody').innerHTML=rows.map(([a,b])=>`<div class="diag"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`).join(''); $('diagnosticModal').showModal();
  }

  function schedule(){ state.nextRefreshAt=Date.now()+Number(C.autoRefreshMs||120000); }
  function tick(){ if(state.autoRefresh){$('nextRefresh').textContent=`Auto ${Math.max(0,Math.ceil((state.nextRefreshAt-Date.now())/1000))}s`; if(Date.now()>=state.nextRefreshAt&&!state.loading)reload();} }

  function events(){
    $('refreshBtn').addEventListener('click',reload); $('sourceSelect').addEventListener('change',e=>{state.source=e.target.value;applySource();}); $('dateSelect').addEventListener('change',e=>{state.date=e.target.value;reload();}); $('searchInput').addEventListener('input',e=>{state.search=e.target.value;renderTargets();}); $('categorySelect').addEventListener('change',e=>{state.category=e.target.value;renderTargets();});
    $('issuesOnly').addEventListener('click',e=>{state.issuesOnly=!state.issuesOnly;e.currentTarget.classList.toggle('active',state.issuesOnly);e.currentTarget.setAttribute('aria-pressed',String(state.issuesOnly));renderTargets();});
    $('autoRefresh').addEventListener('click',e=>{state.autoRefresh=!state.autoRefresh;e.currentTarget.classList.toggle('active',state.autoRefresh);e.currentTarget.setAttribute('aria-pressed',String(state.autoRefresh));schedule();});
    $('viewToggle').addEventListener('click',()=>{state.view=state.view==='grid'?'table':'grid';$('targetsGrid').classList.toggle('hidden',state.view==='table');$('targetsTableWrap').classList.toggle('hidden',state.view!=='table');$('viewToggle').textContent=state.view==='grid'?'TABLE':'GRID';});
    $('chartPeriod').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;state.history=Number(b.dataset.period);document.querySelectorAll('#chartPeriod button').forEach(x=>x.classList.toggle('active',x===b));renderChart();renderHistory();});
    $('exportBtn').addEventListener('click',exportCsv); $('diagnosticsBtn').addEventListener('click',diagnostics); $('closeModal').addEventListener('click',()=>$('diagnosticModal').close()); $('jumpTargets').addEventListener('click',()=>document.querySelector('.targets-grid')?.scrollIntoView({behavior:'smooth',block:'center'}));
    $('themeBtn').addEventListener('click',()=>{document.body.dataset.theme=document.body.dataset.theme==='alt'?'':'alt';toast('تنظیم ظاهری بروزرسانی شد.');});
    window.addEventListener('online',()=>{$('connectionPill').classList.remove('offline');toast('اتصال مرورگر برقرار شد.');}); window.addEventListener('offline',()=>{$('connectionPill').classList.add('offline');toast('مرورگر آفلاین شد.','err');});
  }

  async function boot(){ events(); if('serviceWorker'in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{}); if(!navigator.onLine)$('connectionPill').classList.add('offline'); banner('در حال بارگذاری telemetry…','در حال دریافت snapshot واقعی.','warn'); await reload(); setInterval(tick,1000); }
  boot();
})();
