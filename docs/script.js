(() => {
"use strict";

const C = window.DPM_CONFIG;
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

const state = {
  latest:null,index:null,github:null,cloudflare:null,
  selectedSource:"github",selectedRange:24,selectedDate:"",
  query:"",category:"all",status:"all",table:false,
  lang:C.defaultLanguage||"en",theme:C.defaultTheme||"midnight",
  history:{github:[],cloudflare:[]},chartPoints:[],lastFetch:null
};

const I18N = {
  en:{overview:"Overview",targets:"Targets",analytics:"Analytics",diagnostics:"Diagnostics"},
  fa:{overview:"نمای کلی",targets:"سرویس‌ها",analytics:"تحلیل",diagnostics:"عیب‌یابی"}
};

function esc(v){
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function finite(v){return Number.isFinite(Number(v));}
function num(v,s=""){return finite(v)?`${Math.round(Number(v))}${s}`:"—";}
function dateObj(ts){const d=new Date(ts);return Number.isNaN(d.getTime())?null:d;}
function time(ts){
  const d=dateObj(ts); if(!d)return "—";
  return d.toLocaleTimeString(state.lang==="fa"?"fa-IR":"en-US",{hour:"2-digit",minute:"2-digit"});
}
function dateText(ts){
  const d=dateObj(ts); if(!d)return "—";
  return d.toLocaleDateString(state.lang==="fa"?"fa-IR":"en-US",{month:"short",day:"numeric",year:"numeric"});
}
function age(ts){
  const d=dateObj(ts); if(!d)return "—";
  const s=Math.max(0,Math.floor((Date.now()-d.getTime())/1000));
  if(s<60)return `${s}s ago`; const m=Math.floor(s/60); if(m<60)return `${m}m ago`;
  const h=Math.floor(m/60); return `${h}h ago`;
}
function pct(a,b){return b?Math.round(a/b*100):0;}
function toast(msg,type="info"){
  const n=document.createElement("div");n.className=`toast ${type}`;n.textContent=msg;$("#toast").append(n);
  setTimeout(()=>n.remove(),3800);
}
async function fetchJson(url,ms=10000){
  const ac=new AbortController();const t=setTimeout(()=>ac.abort(),ms);
  try{
    const u=url+(url.includes("?")?"&":"?")+"t="+Date.now();
    const r=await fetch(u,{cache:"no-store",signal:ac.signal,headers:{Accept:"application/json"}});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }finally{clearTimeout(t);}
}
function setConnection(text,kind=""){
  const b=$("#connectionBadge");b.className=`connection-badge ${kind}`;b.innerHTML=`<i></i> ${esc(text)}`;
}
function normalize(r){
  if(!r)return null;
  return {...r,results:Array.isArray(r.results)?r.results:[]};
}
function current(source=state.selectedSource){
  return normalize(source==="cloudflare"?state.cloudflare:state.github);
}
function allTargets(){
  const map=new Map();
  for(const source of ["github","cloudflare"]){
    const rec=current(source); if(!rec)continue;
    for(const item of rec.results){
      const key=item.id||item.name||item.target;
      const merged=map.get(key);
      const x={...item,source};
      if(!merged){map.set(key,x);continue;}
      if(source===state.selectedSource || (!finite(merged.latency)&&finite(item.latency)))map.set(key,x);
    }
  }
  return [...map.values()];
}
function summary(){
  const a=current("github"),b=current("cloudflare");
  const base=a||b;
  if(!base)return null;
  return {
    total:Number(base.total||base.results.length||0),
    up:Number(base.up||0),degraded:Number(base.degraded||0),down:Number(base.down||0),
    avg:Number(base.avg_latency),min:Number(base.min_latency),max:Number(base.max_latency)
  };
}

async function loadData(showToast=false){
  const started=performance.now();setConnection("SYNCING");
  try{
    const [latest,index,gh,cf]=await Promise.all([
      fetchJson(`${C.dataRoot}/latest.json`),
      fetchJson(`${C.dataRoot}/index.json`),
      fetchJson(`${C.dataRoot}/github/latest.json`).catch(()=>null),
      fetchJson(`${C.dataRoot}/cloudflare/latest.json`).catch(()=>null)
    ]);
    state.latest=latest;state.index=index;state.github=normalize(gh||latest?.sources?.github);state.cloudflare=normalize(cf||latest?.sources?.cloudflare);
    state.lastFetch=new Date().toISOString();
    localStorage.setItem("dpm-v4-cache",JSON.stringify({latest,index,gh,cf,savedAt:state.lastFetch}));
    $("#fetchLatency").textContent=`${Math.round(performance.now()-started)} ms`;
    $("#lastFetch").textContent=state.lastFetch;
    setConnection("LIVE","ok");
    if(showToast)toast("Telemetry refreshed.","ok");
    render();
    await loadHistory(state.selectedDate||index.latest);
  }catch(err){
    console.error(err);
    const cached=localStorage.getItem("dpm-v4-cache");
    if(cached){
      const c=JSON.parse(cached);state.latest=c.latest;state.index=c.index;state.github=normalize(c.gh||c.latest?.sources?.github);state.cloudflare=normalize(c.cf||c.latest?.sources?.cloudflare);
      setConnection("CACHED","");render();
      await loadHistory(state.selectedDate||state.index?.latest);
      toast("Live data unavailable — showing the last valid snapshot.","warn");
    }else{
      setConnection("OFFLINE","err");renderEmpty();toast(`Data load failed: ${err.message}`,"err");
    }
  }
}
async function loadHistory(date){
  if(!date)return;
  state.selectedDate=date;
  const [gh,cf]=await Promise.all([
    fetchJson(`${C.dataRoot}/github/${date}.json`).catch(()=>[]),
    fetchJson(`${C.dataRoot}/cloudflare/${date}.json`).catch(()=>[])
  ]);
  state.history.github=Array.isArray(gh)?gh:(gh?[gh]:[]);
  state.history.cloudflare=Array.isArray(cf)?cf:(cf?[cf]:[]);
  renderHistory();drawChart();
}

function render(){
  const s=summary();if(!s)return renderEmpty();
  $("#lastSample").textContent=age(current()?.timestamp);
  $("#sourceSummary").textContent=`${[state.github,state.cloudflare].filter(Boolean).length}/2`;
  $("#refreshValue").textContent=`${Math.round(C.refreshMs/1000)}s`;
  $("#mTotal").textContent=s.total;$("#mUp").textContent=s.up;$("#mDeg").textContent=s.degraded;$("#mDown").textContent=s.down;
  $("#mAvg").innerHTML=finite(s.avg)?`${Math.round(s.avg)}<small>ms</small>`:"—<small>ms</small>";
  $("#mTotalMeta").textContent=`${s.total} tracked`;$("#mUpMeta").textContent=`${pct(s.up,s.total)}%`;
  $("#mDegMeta").textContent=`${pct(s.degraded,s.total)}%`;$("#mDownMeta").textContent=`${pct(s.down,s.total)}%`;
  $("#mAvgMeta").textContent=finite(s.min)&&finite(s.max)?`${Math.round(s.min)}–${Math.round(s.max)} ms`:"—";
  $("#mTotalBar").style.width="100%";$("#mUpBar").style.width=`${pct(s.up,s.total)}%`;$("#mDegBar").style.width=`${pct(s.degraded,s.total)}%`;$("#mDownBar").style.width=`${pct(s.down,s.total)}%`;
  $("#mAvgBar").style.width=finite(s.avg)&&finite(s.max)?`${Math.min(100,s.avg/Math.max(1,s.max)*100)}%`:"0%";
  const health=pct(s.up,s.total);$("#signalHeadline").textContent=health>=99?"Network is healthy":health>=90?"Network needs attention":"Network is unstable";
  const chip=$("#signalChip");chip.textContent=`${health}% HEALTHY`;chip.className=`state-chip ${health>=99?"ok":health>=90?"warn":"err"}`;
  $("#radarUp").textContent=s.up;$("#radarDegraded").textContent=s.degraded;$("#radarDown").textContent=s.down;
  renderSources();renderCategories();renderTargets();renderIncidents();renderSla();renderDiagnostics();renderRadar();renderHistoryDates();drawChart();
}
function renderEmpty(){
  $("#targetsGrid").innerHTML=`<div class="empty-inline">No telemetry available yet.</div>`;
  $("#signalHeadline").textContent="Waiting for telemetry";$("#signalChip").textContent="NO DATA";
}
function renderSources(){
  const gh=state.github,cf=state.cloudflare;
  $("#ghAge").textContent=gh?age(gh.timestamp):"No sample";$("#cfAge").textContent=cf?age(cf.timestamp):"No sample";
  $("#ghScore").textContent=gh?`${pct(gh.up||0,gh.total||0)}%`:"—";$("#cfScore").textContent=cf?`${pct(cf.up||0,cf.total||0)}%`:"—";
  $("#ghState").textContent=gh?"READY":"NO DATA";$("#cfState").textContent=cf?"READY":"NO DATA";
  $("#ghUpdated").textContent=gh?age(gh.timestamp):"—";$("#cfUpdated").textContent=cf?age(cf.timestamp):"—";
  $$(".source-tile").forEach(x=>x.classList.toggle("selected",x.dataset.source===state.selectedSource));
  const a=gh?.results||[],b=cf?.results||[];
  if(a.length&&b.length){
    const bm=new Map(b.map(x=>[x.id||x.name,x.status]));let same=0;
    for(const x of a){if(bm.has(x.id||x.name)&&bm.get(x.id||x.name)===x.status)same++;}
    const denom=Math.max(1,[...new Set([...a.map(x=>x.id),...b.map(x=>x.id)])].length);
    const agreement=Math.round(same/denom*100);
    $("#agreeValue").textContent=`${agreement}%`;$("#agreeBar").style.width=`${agreement}%`;
    const av=finite(gh.avg_latency)?gh.avg_latency:null,bv=finite(cf.avg_latency)?cf.avg_latency:null;
    const delta=finite(av)&&finite(bv)?Math.abs(av-bv):null;
    $("#deltaValue").textContent=finite(delta)?`${Math.round(delta)} ms`:"—";
    $("#deltaBar").style.width=finite(delta)?`${Math.min(100,delta/Math.max(1,(av||1))*100)}%`:"0%";
    $("#compareNote").textContent=`${same} target states agree across both measurement planes.`;
  }else{
    $("#agreeValue").textContent="—";$("#deltaValue").textContent="—";$("#agreeBar").style.width="0%";$("#deltaBar").style.width="0%";
    $("#compareNote").textContent="Waiting for both telemetry planes to publish a current sample.";
  }
}
function renderCategories(){
  const vals=[...new Set(allTargets().map(x=>x.category).filter(Boolean))].sort();
  const sel=$("#category"),old=sel.value;
  sel.innerHTML=`<option value="all">All categories</option>`+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
  sel.value=vals.includes(old)?old:(state.category==="all"?"all":state.category);
  state.category=sel.value;
}
function filterTargets(){
  return allTargets().filter(r=>{
    const q=state.query.toLowerCase();
    return (!q||`${r.name} ${r.target} ${r.category}`.toLowerCase().includes(q))
      &&(state.category==="all"||r.category===state.category)
      &&(state.status==="all"||r.status===state.status);
  });
}
function spark(value,status){
  const n=finite(value)?Number(value):0;let pts="";
  for(let i=0;i<18;i++){const y=22-((n%60)/5)-Math.sin(i*.8+n)*2.1;pts+=`${i*5.7},${Math.max(3,Math.min(23,y))} `;}
  return `<svg viewBox="0 0 100 26" preserveAspectRatio="none"><polyline points="${pts.trim()}"/></svg>`;
}
function card(r){
  return `<button class="target-card ${esc(r.status||"unknown")} tilt-card" data-id="${esc(r.id||r.name)}">
    <div class="tc-top"><span class="tc-name">${esc(r.name||"Unknown")}</span><span class="pill ${esc(r.status)}">${esc(String(r.status||"unknown").toUpperCase())}</span></div>
    <div class="tc-latency">${num(r.latency)} <small>ms</small></div>
    <div class="tc-meta"><span>${esc(r.category||"Other")}</span><span>${esc(r.source||state.selectedSource)}</span></div>
    <div class="spark">${spark(r.latency,r.status)}</div>
  </button>`;
}
function row(r){
  return `<tr class="table-row" data-id="${esc(r.id||r.name)}"><td><strong>${esc(r.name)}</strong><small>${esc(r.target)}</small></td><td><span class="pill ${esc(r.status)}">${esc(String(r.status).toUpperCase())}</span></td><td>${num(r.latency," ms")}</td><td>${r.http_status??"—"}</td><td>${esc(r.source||state.selectedSource)}</td><td>${age(r.timestamp)}</td></tr>`;
}
function renderTargets(){
  const list=filterTargets();$("#resultCount").textContent=`${list.length} targets`;
  $("#targetsGrid").innerHTML=list.length?list.map(card).join(""):`<div class="empty-inline">No targets match the current filters.</div>`;
  $("#tableBody").innerHTML=list.map(row).join("");
  $("#targetsTable").classList.toggle("hidden",!state.table);$("#targetsGrid").classList.toggle("hidden",state.table);
  $("#gridMode").classList.toggle("active",!state.table);$("#tableMode").classList.toggle("active",state.table);
  $$(".target-card,.table-row").forEach(n=>n.addEventListener("click",()=>openModal(n.dataset.id)));
  applyTilt($$(".tilt-card"));
}
function renderIncidents(){
  const problems=allTargets().filter(x=>x.status==="down"||x.status==="degraded");
  $("#problemsBtn").textContent=problems.length?`${problems.length} problems`:"All clear";
  $("#incidentList").innerHTML=problems.length?problems.slice(0,10).map(x=>`<button class="incident ${x.status}" data-id="${esc(x.id||x.name)}"><i></i><span><b>${esc(x.name)}</b><small>${esc(x.error||`${x.status} • ${num(x.latency," ms")}`)}</small></span><strong>${esc(String(x.status).toUpperCase())}</strong></button>`).join(""):`<div class="empty-inline">No incidents detected in the current sample.</div>`;
  $$(".incident").forEach(n=>n.addEventListener("click",()=>openModal(n.dataset.id)));
}
function renderSla(){
  const s=summary();if(!s)return;
  const score=s.total?pct(s.up,s.total):0;$("#slaScore").textContent=`${score}%`;$("#healthUp").textContent=s.up;$("#healthDeg").textContent=s.degraded;$("#healthDown").textContent=s.down;
  $("#slaState").textContent=score>=99?"HEALTHY":score>=90?"WATCH":"CRITICAL";$("#slaState").className=`state-chip ${score>=99?"ok":score>=90?"warn":"err"}`;
  $("#slaRing").style.strokeDashoffset=String(295.3-(295.3*score/100));
  const avg=s.avg;if(!finite(avg))$("#latencyPosture").textContent="NO SAMPLE";else $("#latencyPosture").textContent=avg<100?"EXCELLENT":avg<250?"GOOD":avg<500?"ELEVATED":"HIGH";
}
function renderRadar(){
  const list=allTargets();const wrap=$("#signalNodes");wrap.innerHTML="";
  const positions=[[18,29],[31,72],[52,18],[69,69],[84,35],[77,14],[22,52],[56,83],[90,57]];
  positions.slice(0,Math.max(5,Math.min(9,list.length))).forEach((p,i)=>{
    const r=list[i%Math.max(1,list.length)],n=document.createElement("i");n.className=`n-${r?.status||"up"}`;n.style.left=`${p[0]}%`;n.style.top=`${p[1]}%`;wrap.appendChild(n);
  });
}
function renderDiagnostics(){
  $("#workerUrl").textContent=C.workerUrl;$("#schema").textContent=state.latest?.schema_version||current()?.schema_version||"—";$("#lastFetch").textContent=state.lastFetch||"—";
  $("#infraChip").textContent=state.github&&state.cloudflare?"DUAL SOURCE":state.github||state.cloudflare?"SINGLE SOURCE":"NO DATA";
  $("#infraChip").className=`state-chip ${state.github&&state.cloudflare?"ok":state.github||state.cloudflare?"warn":"err"}`;
}
function renderHistoryDates(){
  const dates=Array.isArray(state.index?.dates)?state.index.dates:[];
  const sel=$("#historyDate"),old=state.selectedDate||dates[0]||"";
  sel.innerHTML=dates.map(d=>`<option value="${d}">${d}</option>`).join("")||`<option value="">No history</option>`;
  sel.value=dates.includes(old)?old:(dates[0]||"");
}
function renderHistory(){
  const rows=[...(state.history[state.selectedSource]||[])].sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  const av=rows.map(x=>Number(x.avg_latency)).filter(Number.isFinite);
  const total=rows.reduce((a,x)=>a+Number(x.total||0),0),up=rows.reduce((a,x)=>a+Number(x.up||0),0);
  $("#histRuns").textContent=rows.length;$("#histBest").textContent=av.length?`${Math.round(Math.min(...av))} ms`:"—";$("#histWorst").textContent=av.length?`${Math.round(Math.max(...av))} ms`:"—";$("#histUptime").textContent=total?`${(up/total*100).toFixed(2)}%`:"—";
  $("#historyList").innerHTML=rows.length?rows.slice(0,60).map(x=>`<div class="history-row"><div class="history-time">${time(x.timestamp)}<small>${dateText(x.timestamp)}</small></div><div><span>UP</span><b class="up">${x.up??"—"}</b></div><div><span>WARN</span><b class="warn">${x.degraded??"—"}</b></div><div><span>DOWN</span><b class="down">${x.down??"—"}</b></div><div><span>AVG</span><b>${num(x.avg_latency," ms")}</b></div><div><span>RUN</span><b>${num(x.duration_ms," ms")}</b></div></div>`).join(""):`<div class="empty-inline">No historical records for this source/day.</div>`;
}
function drawChart(){
  const canvas=$("#chart"),ctx=canvas.getContext("2d"),dpr=window.devicePixelRatio||1,w=canvas.clientWidth,h=canvas.clientHeight;
  canvas.width=Math.max(1,Math.floor(w*dpr));canvas.height=Math.max(1,Math.floor(h*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  ctx.strokeStyle="rgba(255,255,255,.045)";ctx.lineWidth=1;
  for(let x=0;x<=w;x+=42){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for(let y=0;y<=h;y+=34){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  const raw=[...(state.history[state.selectedSource]||[])].sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
  const data=state.selectedRange==="all"?raw:raw.slice(-Number(state.selectedRange));state.chartPoints=data;
  const vals=data.map(x=>Number(x.avg_latency)).filter(Number.isFinite);
  $("#chartSamples").textContent=data.length;
  if(!vals.length){$("#chartAvg").textContent="—";$("#chartTrend").textContent="No trend data";return;}
  const max=Math.max(100,...vals),pad={l:32,r:14,t:18,b:25},cw=w-pad.l-pad.r,ch=h-pad.t-pad.b;
  ctx.fillStyle="rgba(104,233,255,.12)";ctx.beginPath();
  const pts=data.map((r,i)=>{const x=pad.l+(data.length===1?cw/2:i/(data.length-1)*cw);const v=finite(r.avg_latency)?Number(r.avg_latency):0;const y=pad.t+ch-(v/max)*ch;return{x,y,v};});
  pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.lineTo(pts.at(-1).x,pad.t+ch);ctx.lineTo(pts[0].x,pad.t+ch);ctx.closePath();ctx.fill();
  ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle="#68e9ff";ctx.lineWidth=2.6;ctx.shadowColor="rgba(104,233,255,.4)";ctx.shadowBlur=10;ctx.stroke();ctx.shadowBlur=0;
  pts.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fillStyle="#07111c";ctx.fill();ctx.strokeStyle="#a18cff";ctx.lineWidth=1.5;ctx.stroke();});
  const avg=vals.reduce((a,b)=>a+b,0)/vals.length;$("#chartAvg").textContent=`${Math.round(avg)} ms`;
  const half=Math.max(1,Math.floor(vals.length/2)),a=vals.slice(0,half).reduce((x,y)=>x+y,0)/half,b=vals.slice(half).reduce((x,y)=>x+y,0)/Math.max(1,vals.length-half),d=b-a;
  $("#chartTrend").textContent=Math.abs(d)<2?"Stable":d>0?`↑ ${Math.round(d)} ms`:`↓ ${Math.round(Math.abs(d))} ms`;
}
function openModal(id){
  const t=allTargets().find(x=>(x.id||x.name)===id);if(!t)return;
  $("#modalName").textContent=t.name||"Target";$("#modalUrl").textContent=t.target||"—";$("#modalStatus").textContent=String(t.status||"unknown").toUpperCase();$("#modalStatus").className=`pill ${t.status||"unknown"}`;
  $("#modalLatency").textContent=num(t.latency," ms");$("#modalHttp").textContent=t.http_status??"—";$("#modalProtocol").textContent=t.protocol||"—";$("#modalMethod").textContent=t.method||"—";$("#modalLoss").textContent=finite(t.packet_loss)?`${t.packet_loss}%`:"—";$("#modalJitter").textContent=num(t.jitter," ms");$("#modalAge").textContent=age(t.timestamp);$("#modalResolved").textContent=t.resolved_url||"—";$("#modalError").textContent=t.error||"None";
  $("#modal").showModal();
}
function exportJSON(name,data){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);
}
function applyTilt(nodes){
  nodes.forEach(card=>{
    if(card.dataset.tiltBound)return;card.dataset.tiltBound="1";
    card.addEventListener("pointermove",e=>{const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;card.style.setProperty("--rx",`${(0.5-y)*5}deg`);card.style.setProperty("--ry",`${(x-.5)*6}deg`);});
    card.addEventListener("pointerleave",()=>{card.style.setProperty("--rx","0deg");card.style.setProperty("--ry","0deg");});
  });
}
function setupTilt(){applyTilt($$(".tilt"));}
function setupPointer(){
  window.addEventListener("pointermove",e=>{document.documentElement.style.setProperty("--mx",`${e.clientX}px`);document.documentElement.style.setProperty("--my",`${e.clientY}px`);},{passive:true});
  window.addEventListener("scroll",()=>document.documentElement.style.setProperty("--scroll",`${window.scrollY}px`),{passive:true});
}
function setupParticles(){
  const wrap=$("#particleField");for(let i=0;i<34;i++){const p=document.createElement("i");p.style.left=`${Math.random()*100}%`;p.style.top=`${Math.random()*100}%`;p.style.setProperty("--s",`${1+Math.random()*2.4}px`);p.style.animationDelay=`${-Math.random()*18}s`;p.style.animationDuration=`${12+Math.random()*18}s`;wrap.appendChild(p);}
}
function localize(){
  const d=I18N[state.lang];$$(".nav-item").forEach(x=>{const key=x.getAttribute("href").slice(1);if(d[key])x.textContent=d[key];});
  document.documentElement.lang=state.lang;document.documentElement.dir=state.lang==="fa"?"rtl":"ltr";$("#langBtn").textContent=state.lang.toUpperCase();
}
function setupNav(){
  const links=$$(".nav-item"),sections=links.map(x=>document.querySelector(x.getAttribute("href"))).filter(Boolean);
  const io=new IntersectionObserver(es=>{const v=es.filter(x=>x.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(v)links.forEach(l=>l.classList.toggle("active",l.getAttribute("href")===`#${v.target.id}`));},{threshold:[.2,.5,.75]});
  sections.forEach(s=>io.observe(s));
}
function setup(){
  $("#refreshBtn").addEventListener("click",()=>loadData(true));$("#refreshHero").addEventListener("click",()=>loadData(true));
  $("#search").addEventListener("input",e=>{state.query=e.target.value;renderTargets();});
  $("#category").addEventListener("change",e=>{state.category=e.target.value;renderTargets();});
  $("#status").addEventListener("change",e=>{state.status=e.target.value;renderTargets();});
  $("#clearFilters").addEventListener("click",()=>{$("#search").value="";$("#status").value="all";$("#category").value="all";state.query="";state.status="all";state.category="all";renderTargets();});
  $("#gridMode").addEventListener("click",()=>{state.table=false;renderTargets()});$("#tableMode").addEventListener("click",()=>{state.table=true;renderTargets()});
  $$(".source-tile").forEach(b=>b.addEventListener("click",()=>{state.selectedSource=b.dataset.source;renderSources();renderHistory();drawChart();}));
  $$(".range-tabs button").forEach(b=>b.addEventListener("click",()=>{$$(".range-tabs button").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.selectedRange=b.dataset.range==="all"?"all":Number(b.dataset.range);drawChart();}));
  $("#historyDate").addEventListener("change",e=>loadHistory(e.target.value));
  $("#exportHistory").addEventListener("click",()=>exportJSON(`dual-ping-${state.selectedSource}-${state.selectedDate||"history"}.json`,state.history[state.selectedSource]||[]));
  $("#healthBtn").addEventListener("click",checkWorker);
  $("#problemsBtn").addEventListener("click",()=>{$("#status").value="all";state.status="all";state.query="";$("#search").value="";const down=allTargets().some(x=>x.status==="down"),degraded=allTargets().some(x=>x.status==="degraded");if(down)state.status="down";else if(degraded)state.status="degraded";$("#status").value=state.status;renderTargets();document.querySelector("#targets").scrollIntoView({behavior:"smooth"});});
  $("#langBtn").addEventListener("click",()=>{state.lang=state.lang==="en"?"fa":"en";localize();render();});
  $("#themeBtn").addEventListener("click",()=>{state.theme=state.theme==="midnight"?"aurora":"midnight";document.documentElement.dataset.theme=state.theme;});
  $("#modalClose").addEventListener("click",()=>$("#modal").close());$("#modal").addEventListener("click",e=>{if(e.target===$("#modal"))$("#modal").close()});
  setupPointer();setupParticles();setupTilt();setupNav();localize();
}
async function checkWorker(){
  try{const r=await fetchJson(`${C.workerUrl}${C.workerHealthPath}`,7000);toast(r.ok?`Worker healthy • v${r.version||"?"}`:"Worker responded with an error",r.ok?"ok":"err");}
  catch(e){toast(`Worker health failed: ${e.message}`,"err");}
}
setup();loadData();setInterval(()=>loadData(false),C.refreshMs);
window.addEventListener("resize",()=>drawChart());
})();
