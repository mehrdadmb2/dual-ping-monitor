// تاریخ امروز رو به‌صورت خودکار می‌گیره
const today = new Date().toISOString().split('T')[0];
const dataUrl = `../data/logs/${today}.json`;

fetch(dataUrl)
  .then(res => {
    if (!res.ok) throw new Error('داده‌ای برای امروز وجود ندارد');
    return res.json();
  })
  .then(data => {
    const lastEntry = data[data.length - 1];
    renderStatus(lastEntry.results);
    renderHistory(data);
  })
  .catch(err => {
    document.getElementById('status').innerHTML = `<p style="color:#f85149;">❌ ${err.message}</p>`;
  });

function renderStatus(results) {
  const container = document.getElementById('status');
  let html = '<h2>🟢 آخرین وضعیت پینگ</h2><ul>';
  for (const item of results) {
    const statusClass = item.status === 'up' ? 'up' : 'down';
    html += `<li class="${statusClass}">
      <span class="status-badge">${item.status === 'up' ? '✅ آنلاین' : '❌ آفلاین'}</span>
      <strong>${item.name}</strong>
      ${item.latency ? `<span class="latency">⏱ ${item.latency} ms</span>` : ''}
      <span style="font-size:0.8rem;color:#8b949e;display:block;">⏰ ${new Date(item.timestamp).toLocaleTimeString('fa-IR')}</span>
    </li>`;
  }
  html += '</ul>';
  container.innerHTML = html;
}

function renderHistory(allData) {
  const container = document.getElementById('history');
  if (!allData || allData.length < 2) return;
  
  const last = allData[allData.length - 1];
  const prev = allData[allData.length - 2];
  
  let html = '<h2>📊 مقایسه دو پینگ آخر</h2><ul>';
  for (const item of last.results) {
    const prevItem = prev.results.find(p => p.name === item.name);
    const statusChanged = prevItem && prevItem.status !== item.status;
    const color = statusChanged ? '#f0883e' : (item.status === 'up' ? '#2ea043' : '#f85149');
    
    html += `<li style="border-right-color:${color};">
      <strong>${item.name}</strong>
      ${item.status === 'up' ? `✅ ${item.latency}ms` : '❌'}
      ${prevItem ? `(قبلی: ${prevItem.status === 'up' ? prevItem.latency+'ms' : '❌'})` : ''}
      ${statusChanged ? '🔔 تغییر وضعیت!' : ''}
    </li>`;
  }
  html += '</ul>';
  container.innerHTML = html;
}
