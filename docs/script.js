const today = new Date().toISOString().split('T')[0];
let githubChart, cloudflareChart;

async function loadDashboard() {
    try {
        // بارگذاری داده‌های ادغام شده
        const mergedRes = await fetch(`../data/merged/${today}.json`);
        const mergedData = await mergedRes.json();
        
        // بروزرسانی آمار
        updateStats(mergedData);
        
        // رسم نمودارها
        drawCharts(mergedData);
        
        // نمایش وضعیت فعلی
        renderStatus(mergedData);
        
        // جدول مقایسه
        renderComparison(mergedData);
        
        // زمان آخرین بروزرسانی
        document.getElementById('lastUpdate').textContent = 
            `🔄 آخرین بروزرسانی: ${new Date().toLocaleString('fa-IR')}`;
            
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('statusList').innerHTML = 
            `<p style="color:#f85149;">❌ خطا در بارگذاری داده‌ها: ${error.message}</p>`;
    }
}

function updateStats(mergedData) {
    const sources = mergedData.sources || {};
    const github = sources.github || [];
    const cloudflare = sources.cloudflare || [];
    
    const latest = [...github, ...cloudflare].filter(a => a.length > 0);
    if (latest.length === 0) return;
    
    const last = latest[latest.length - 1];
    const results = last.results || [];
    
    document.getElementById('totalTargets').querySelector('.number').textContent = results.length;
    document.getElementById('upCount').querySelector('.number').textContent = 
        results.filter(r => r.status === 'up').length;
    document.getElementById('downCount').querySelector('.number').textContent = 
        results.filter(r => r.status === 'down').length;
    
    const avgLat = results.filter(r => r.latency)
        .reduce((sum, r) => sum + r.latency, 0) / results.filter(r => r.latency).length;
    document.getElementById('avgLatency').querySelector('.number').textContent = 
        avgLat ? Math.round(avgLat) + ' ms' : '-';
}

function drawCharts(mergedData) {
    const sources = mergedData.sources || {};
    
    // داده‌های GitHub
    const githubData = sources.github || [];
    drawSingleChart('githubChart', githubData, '#58a6ff', 'GitHub');
    
    // داده‌های Cloudflare
    const cloudflareData = sources.cloudflare || [];
    drawSingleChart('cloudflareChart', cloudflareData, '#f0883e', 'Cloudflare');
}

function drawSingleChart(canvasId, data, color, label) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    if (window[canvasId + 'Chart']) {
        window[canvasId + 'Chart'].destroy();
    }
    
    const timestamps = data.map(d => new Date(d.timestamp).toLocaleTimeString('fa-IR'));
    const latencies = data.map(d => {
        const results = d.results || [];
        const avg = results.filter(r => r.latency)
            .reduce((sum, r) => sum + r.latency, 0) / (results.filter(r => r.latency).length || 1);
        return Math.round(avg);
    });
    
    window[canvasId + 'Chart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timestamps.slice(-20),
            datasets: [{
                label: `میانگین تاخیر (${label})`,
                data: latencies.slice(-20),
                borderColor: color,
                backgroundColor: color + '33',
                fill: true,
                tension: 0.3,
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#21262d' }
                },
                x: {
                    grid: { display: false },
                    ticks: { maxTicksLimit: 10 }
                }
            }
        }
    });
}

function renderStatus(mergedData) {
    const sources = mergedData.sources || {};
    const github = sources.github || [];
    const cloudflare = sources.cloudflare || [];
    
    // آخرین داده از هر دو منبع
    const lastGithub = github[github.length - 1];
    const lastCloudflare = cloudflare[cloudflare.length - 1];
    
    // استفاده از داده‌های GitHub (یا Cloudflare به عنوان جایگزین)
    const data = lastGithub || lastCloudflare;
    if (!data) return;
    
    const results = data.results || [];
    const container = document.getElementById('statusList');
    
    container.innerHTML = results.map(r => `
        <div class="status-item ${r.status}">
            <span class="name">${r.name}</span>
            <span>
                <span class="badge ${r.status}">${r.status === 'up' ? '✅' : '❌'}</span>
                ${r.latency ? `<span class="latency">${r.latency}ms</span>` : ''}
            </span>
        </div>
    `).join('');
}

function renderComparison(mergedData) {
    const sources = mergedData.sources || {};
    const github = sources.github || [];
    const cloudflare = sources.cloudflare || [];
    
    const lastGithub = github[github.length - 1];
    const lastCloudflare = cloudflare[cloudflare.length - 1];
    
    if (!lastGithub || !lastCloudflare) return;
    
    const gResults = lastGithub.results || [];
    const cResults = lastCloudflare.results || [];
    
    // پیدا کردن هدف‌های مشترک
    const common = gResults.filter(g => 
        cResults.some(c => c.name === g.name)
    );
    
    const container = document.getElementById('comparisonTable');
    let html = `<table>
        <thead><tr><th>هدف</th><th>GitHub</th><th>Cloudflare</th><th>مقایسه</th></tr></thead>
        <tbody>`;
    
    for (const g of common) {
        const c = cResults.find(c => c.name === g.name);
        const gStatus = g.status === 'up' ? '✅' : '❌';
        const cStatus = c?.status === 'up' ? '✅' : '❌';
        const gLat = g.latency ? g.latency + 'ms' : '-';
        const cLat = c?.latency ? c.latency + 'ms' : '-';
        const diff = g.latency && c?.latency ? Math.abs(g.latency - c.latency) + 'ms' : '-';
        
        html += `<tr>
            <td><strong>${g.name}</strong></td>
            <td>${gStatus} ${gLat}</td>
            <td>${cStatus} ${cLat}</td>
            <td style="color:${diff !== '-' && parseInt(diff) < 50 ? '#3fb950' : '#f0883e'}">${diff}</td>
        </tr>`;
    }
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

// اجرای اصلی
loadDashboard();

// رفرش خودکار هر ۵ دقیقه
setInterval(loadDashboard, 300000);
