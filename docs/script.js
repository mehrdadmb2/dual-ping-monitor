const today = new Date().toISOString().split('T')[0];
const sources = [
  { name: 'GitHub Actions', file: `../data/logs/github-${today}.json` },
  { name: 'Cloudflare Worker', file: `../data/logs/cloudflare-${today}.json` }
];

async function loadAllData() {
  const container = document.getElementById('status');
  let html = '<h2>📊 مقایسه دو پلتفرم</h2>';
  
  for (const source of sources) {
    try {
      const response = await fetch(source.file);
      if (!response.ok) throw new Error('No data');
      const data = await response.json();
      const lastEntry = data[data.length - 1];
      
      html += `<h3>${source.name}</h3><ul>`;
      for (const item of lastEntry.results.slice(0, 10)) { // فقط ۱۰ تا اول
        const statusClass = item.status === 'up' ? 'up' : 'down';
        html += `<li class="${statusClass}">
          <strong>${item.name}</strong>
          ${item.status === 'up' ? `✅ ${item.latency || 0}ms` : '❌'}
          ${item.packet_loss !== undefined ? `📉 ${item.packet_loss}% loss` : ''}
        </li>`;
      }
      html += '</ul>';
    } catch (error) {
      html += `<p style="color:#f85149;">❌ ${source.name}: ${error.message}</p>`;
    }
  }
  
  container.innerHTML = html;
}

loadAllData();
