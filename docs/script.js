// ============================================
// 1. STATE & CONFIG
// ============================================
const state = {
    data: null,
    githubData: [],
    cloudflareData: [],
    mergedData: null,
    currentPeriod: 20,
    searchTerm: '',
    filterCategory: 'all'
};

const today = new Date().toISOString().split('T')[0];
let githubChartInstance = null;
let cloudflareChartInstance = null;

// ============================================
// 2. LOAD DATA (با fallback و خطایابی)
// ============================================
async function loadData() {
    try {
        // تلاش برای بارگذاری داده‌های ادغام شده
        const mergedRes = await fetch(`../data/merged/${today}.json`);
        if (mergedRes.ok) {
            state.mergedData = await mergedRes.json();
            state.githubData = state.mergedData.sources?.github || [];
            state.cloudflareData = state.mergedData.sources?.cloudflare || [];
        } else {
            // اگر داده‌های ادغام شده نبود، تک تک تلاش کن
            await loadIndividualData();
        }
    } catch (error) {
        console.warn('⚠️ Could not load merged data, trying individual sources...', error);
        await loadIndividualData();
    }

    // اگر هیچ داده‌ای نبود، از داده‌های آزمایشی استفاده کن
    if (!state.githubData.length && !state.cloudflareData.length) {
        console.warn('⚠️ No data found, using fallback sample data');
        generateFallbackData();
    }

    updateUI();
}

// بارگذاری داده‌های جداگانه از GitHub و Cloudflare
async function loadIndividualData() {
    try {
        const githubRes = await fetch(`../data/github/${today}.json`);
        if (githubRes.ok) {
            state.githubData = await githubRes.json();
        }
    } catch (e) { /* ignored */ }

    try {
        const cloudflareRes = await fetch(`../data/cloudflare/${today}.json`);
        if (cloudflareRes.ok) {
            state.cloudflareData = await cloudflareRes.json();
        }
    } catch (e) { /* ignored */ }
}

// ============================================
// 3. FALLBACK DATA (برای زمانی که داده‌ای وجود ندارد)
// ============================================
function generateFallbackData() {
    const now = new Date();
    const sampleTargets = [
        { name: 'Snapp', category: 'ایرانی', type: 'site' },
        { name: 'Divar', category: 'ایرانی', type: 'site' },
        { name: 'Google', category: 'جهانی', type: 'site' },
        { name: 'GitHub', category: 'جهانی', type: 'site' },
        { name: 'Cloudflare DNS', category: 'DNS', type: 'dns' },
        { name: 'PySmartHome-PC', category: 'پروژه‌های شخصی', type: 'site' },
        { name: 'IMDB Showcase', category: 'پروژه‌های شخصی', type: 'site' }
    ];

    const entries = [];
    for (let i = 0; i < 5; i++) {
        const ts = new Date(now.getTime() - (i * 15 * 60 * 1000)).toISOString();
        const results = sampleTargets.map(t => ({
            name: t.name,
            target: t.name.toLowerCase().replace(/\s+/g, ''),
            category: t.category,
            type: t.type,
            status: Math.random() > 0.15 ? 'up' : 'down',
            latency: Math.floor(Math.random() * 150) + 20,
            packet_loss: Math.floor(Math.random() * 5),
            jitter: Math.floor(Math.random() * 20),
            timestamp: ts
        }));
        entries.push({
            timestamp: ts,
            source: i % 2 === 0 ? 'github' : 'cloudflare',
            total: results.length,
            up: results.filter(r => r.status === 'up').length,
            down: results.filter(r => r.status === 'down').length,
            results
        });
    }

    // تقسیم بین دو منبع
    state.githubData = entries.filter((_, i) => i % 2 === 0);
    state.cloudflareData = entries.filter((_, i) => i % 2 === 1);
    
    // ساخت mergedData
    state.mergedData = {
        date: today,
        sources: {
            github: state.githubData,
            cloudflare: state.cloudflareData
        }
    };
}

// ============================================
// 4. UPDATE UI
// ============================================
function updateUI() {
    updateStats();
    updateCharts();
    renderStatusList();
    renderComparisonTable();
    updateLastUpdate();
}

// ============================================
// 5. STATS
// ============================================
function updateStats() {
    const allResults = getAllLatestResults();
    if (!allResults.length) {
        setStatValues(0, 0, 0, 0, 0);
        return;
    }

    const total = allResults.length;
    const up = allResults.filter(r => r.status === 'up').length;
    const down = allResults.filter(r => r.status === 'down').length;
    const avgLat = allResults.filter(r => r.latency)
        .reduce((s, r) => s + r.latency, 0) / (allResults.filter(r => r.latency).length || 1);
    const uptime = total > 0 ? Math.round((up / total) * 100) : 0;

    setStatValues(total, up, down, avgLat, uptime);
}

function setStatValues(total, up, down, avgLat, uptime) {
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statUp').textContent = up;
    document.getElementById('statDown').textContent = down;
    document.getElementById('statUptime').textContent = uptime + '%';
    
    document.getElementById('totalCount').textContent = total;
    document.getElementById('upCount').textContent = up;
    document.getElementById('downCount').textContent = down;
    document.getElementById('avgLatency').textContent = avgLat ? Math.round(avgLat) + ' ms' : '- ms';

    // Progress bars
    document.getElementById('upProgress').style.width = total > 0 ? (up / total) * 100 + '%';
    document.getElementById('downProgress').style.width = total > 0 ? (down / total) * 100 + '%';
    document.getElementById('uptimeProgress').style.width = uptime + '%';
}

function getAllLatestResults() {
    const sources = [state.githubData, state.cloudflareData];
    const latest = sources
        .filter(arr => arr && arr.length > 0)
        .map(arr => arr[arr.length - 1]);
    
    if (!latest.length) return [];
    
    // اولویت با داده‌های GitHub است
    const primary = latest.find(d => d.source === 'github') || latest[0];
    return primary.results || [];
}

// ============================================
// 6. CHARTS
// ============================================
function updateCharts() {
    drawChart('githubChart', state.githubData, '#58a6ff', 'GitHub');
    drawChart('cloudflareChart', state.cloudflareData, '#f0883e', 'Cloudflare');
}

function drawChart(canvasId, data, color, label) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const existing = window[canvasId + 'Chart'];
    if (existing) existing.destroy();

    if (!data || data.length < 1) {
        // نمایش پیام "No Data"
        window[canvasId + 'Chart'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['بدون داده'],
                datasets: [{
                    label: label,
                    data: [0],
                    borderColor: color,
                    backgroundColor: color + '22',
                    borderDash: [6, 4],
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { display: false },
                    x: { display: false }
                }
            }
        });
        return;
    }

    const period = state.currentPeriod;
    const limited = data.slice(-period);
    
    const labels = limited.map(d => new Date(d.timestamp).toLocaleTimeString('fa-IR'));
    const latencies = limited.map(d => {
        const results = d.results || [];
        const valid = results.filter(r => r.latency);
        if (!valid.length) return 0;
        return Math.round(valid.reduce((s, r) => s + r.latency, 0) / valid.length);
    });

    window[canvasId + 'Chart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: `میانگین تاخیر (${label})`,
                data: latencies,
                borderColor: color,
                backgroundColor: color + '22',
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: color,
                pointBorderColor: 'transparent',
                borderWidth: 2.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    titleColor: '#e6edf3',
                    bodyColor: '#e6edf3',
                    borderColor: 'rgba(255,255,255,0.05)',
                    borderWidth: 1,
                    cornerRadius: 12,
                    padding: 12
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { 
                        color: 'rgba(255,255,255,0.04)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#8b949e',
                        font: { size: 10 }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#8b949e',
                        font: { size: 9 },
                        maxTicksLimit: 10,
                        maxRotation: 40
                    }
                }
            },
            animation: {
                duration: 800
            }
        }
    });
}

// ============================================
// 7. STATUS LIST (با جستجو و فیلتر)
// ============================================
function renderStatusList() {
    const allResults = getAllLatestResults();
    const container = document.getElementById('statusList');
    
    let filtered = allResults;
    
    // فیلتر دسته
    if (state.filterCategory !== 'all') {
        filtered = filtered.filter(r => r.category === state.filterCategory);
    }
    
    // جستجو
    if (state.searchTerm.trim()) {
        const term = state.searchTerm.trim().toLowerCase();
        filtered = filtered.filter(r => 
            r.name.toLowerCase().includes(term) || 
            r.target.toLowerCase().includes(term)
        );
    }

    if (!filtered.length) {
        container.innerHTML = `
            <div class="status-item" style="grid-column:1/-1; justify-content:center; color:var(--text-secondary); padding:30px;">
                🔍 هیچ نتیجه‌ای یافت نشد
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(r => `
        <div class="status-item ${r.status}">
            <span class="name" title="${r.name}">${r.name}</span>
            <div class="right">
                <span class="status-badge ${r.status}">${r.status === 'up' ? '✅' : '❌'}</span>
                ${r.latency ? `<span class="status-latency">${r.latency}ms</span>` : ''}
            </div>
        </div>
    `).join('');
}

// ============================================
// 8. COMPARISON TABLE
// ============================================
function renderComparisonTable() {
    const tbody = document.getElementById('comparisonBody');
    
    const githubLast = state.githubData.length ? state.githubData[state.githubData.length - 1] : null;
    const cfLast = state.cloudflareData.length ? state.cloudflareData[state.cloudflareData.length - 1] : null;
    
    if (!githubLast && !cfLast) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:30px;">📭 داده‌ای برای مقایسه وجود ندارد</td></tr>`;
        return;
    }

    const gResults = githubLast?.results || [];
    const cResults = cfLast?.results || [];
    
    // پیدا کردن هدف‌های مشترک
    const common = gResults.filter(g => 
        cResults.some(c => c.name === g.name)
    );

    if (!common.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:30px;">📭 هیچ هدف مشترکی بین دو پلتفرم یافت نشد</td></tr>`;
        return;
    }

    tbody.innerHTML = common.map(g => {
        const c = cResults.find(c => c.name === g.name);
        const gStatus = g.status === 'up';
        const cStatus = c?.status === 'up';
        const gLat = g.latency ? g.latency + 'ms' : '-';
        const cLat = c?.latency ? c.latency + 'ms' : '-';
        
        let diff = '-';
        let diffClass = 'low';
        if (g.latency && c?.latency) {
            const d = Math.abs(g.latency - c.latency);
            diff = d + 'ms';
            diffClass = d < 30 ? 'low' : (d < 80 ? 'medium' : 'high');
        }
        
        const category = g.category || 'other';
        const isGUp = gStatus;
        const isCUp = cStatus;

        return `
            <tr>
                <td><strong>${g.name}</strong></td>
                <td style="color:var(--text-secondary);font-size:0.75rem;">${category}</td>
                <td>
                    <span class="status-dot ${isGUp ? 'up' : 'down'}"></span>
                    ${isGUp ? '✅' : '❌'} ${gLat}
                </td>
                <td>
                    <span class="status-dot ${isCUp ? 'up' : 'down'}"></span>
                    ${isCUp ? '✅' : '❌'} ${cLat}
                </td>
                <td>
                    <span class="diff-badge ${diffClass}">${diff}</span>
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================
// 9. LAST UPDATE
// ============================================
function updateLastUpdate() {
    const allData = [...state.githubData, ...state.cloudflareData];
    if (!allData.length) {
        document.getElementById('lastUpdate').textContent = '⏳ داده‌ای موجود نیست';
        return;
    }
    const latest = allData.reduce((a, b) => 
        new Date(a.timestamp) > new Date(b.timestamp) ? a : b
    );
    const time = new Date(latest.timestamp).toLocaleString('fa-IR');
    document.getElementById('lastUpdate').textContent = `🔄 ${time}`;
}

// ============================================
// 10. EVENT LISTENERS
// ============================================
// تغییر دوره نمودار
document.querySelectorAll('.chart-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        state.currentPeriod = parseInt(this.dataset.period);
        updateCharts();
    });
});

// جستجو
document.getElementById('searchInput').addEventListener('input', function() {
    state.searchTerm = this.value;
    renderStatusList();
});

// فیلتر دسته
document.getElementById('filterCategory').addEventListener('change', function() {
    state.filterCategory = this.value;
    renderStatusList();
});

// ============================================
// 11. AUTO REFRESH (هر ۲ دقیقه)
// ============================================
setInterval(() => {
    loadData();
}, 120000);

// ============================================
// 12. INIT
// ============================================
document.addEventListener('DOMContentLoaded', loadData);
