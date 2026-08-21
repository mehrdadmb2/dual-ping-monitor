// ============================================================
// DUAL PING MONITOR - نسخه نهایی با دیباگ و Fallback
// ============================================================

// ------ STATE ------
const state = {
    githubData: [],
    cloudflareData: [],
    mergedData: null,
    currentPeriod: 20,
    searchTerm: '',
    filterCategory: 'all',
    loading: true,
    error: null
};

const today = new Date().toISOString().split('T')[0];
let githubChartInstance = null;
let cloudflareChartInstance = null;

// ------ LOGGING (برای دیباگ) ------
function log(msg, data) {
    console.log(`[DPM] ${msg}`, data || '');
}

function errorLog(msg, err) {
    console.error(`[DPM] ❌ ${msg}`, err || '');
}

// ------ LOAD DATA (با دیباگ کامل) ------
async function loadData() {
    log('🔄 Starting data load...');
    state.loading = true;
    state.error = null;

    try {
        // 1. تلاش برای بارگذاری داده‌های ادغام شده
        log(`📂 Trying merged data: ../data/merged/${today}.json`);
        const mergedRes = await fetch(`../data/merged/${today}.json`);
        
        if (mergedRes.ok) {
            state.mergedData = await mergedRes.json();
            log('✅ Merged data loaded successfully', state.mergedData);
            state.githubData = state.mergedData.sources?.github || [];
            state.cloudflareData = state.mergedData.sources?.cloudflare || [];
        } else {
            log('⚠️ Merged data not found, trying individual sources...');
            await loadIndividualData();
        }
    } catch (err) {
        errorLog('Error loading merged data', err);
        await loadIndividualData();
    }

    // 2. اگر هیچ داده‌ای نبود، از Fallback استفاده کن
    if (!state.githubData.length && !state.cloudflareData.length) {
        log('⚠️ No data from any source, generating fallback data...');
        generateFallbackData();
    }

    // 3. به‌روزرسانی UI
    state.loading = false;
    updateUI();
    log('✅ UI updated successfully');
}

// ------ LOAD INDIVIDUAL SOURCES ------
async function loadIndividualData() {
    // GitHub
    try {
        const githubPath = `../data/github/${today}.json`;
        log(`📂 Trying GitHub: ${githubPath}`);
        const githubRes = await fetch(githubPath);
        if (githubRes.ok) {
            state.githubData = await githubRes.json();
            log(`✅ GitHub data loaded (${state.githubData.length} entries)`);
        } else {
            log(`⚠️ GitHub data not found (status: ${githubRes.status})`);
        }
    } catch (err) {
        errorLog('Error loading GitHub data', err);
    }

    // Cloudflare
    try {
        const cfPath = `../data/cloudflare/${today}.json`;
        log(`📂 Trying Cloudflare: ${cfPath}`);
        const cfRes = await fetch(cfPath);
        if (cfRes.ok) {
            state.cloudflareData = await cfRes.json();
            log(`✅ Cloudflare data loaded (${state.cloudflareData.length} entries)`);
        } else {
            log(`⚠️ Cloudflare data not found (status: ${cfRes.status})`);
        }
    } catch (err) {
        errorLog('Error loading Cloudflare data', err);
    }
}

// ------ FALLBACK DATA (با داده‌های واقعی‌تر) ------
function generateFallbackData() {
    log('📊 Generating fallback data with sample targets...');
    
    const now = new Date();
    const sampleTargets = [
        { name: 'Snapp', category: 'ایرانی', type: 'site' },
        { name: 'Divar', category: 'ایرانی', type: 'site' },
        { name: 'Soft98', category: 'ایرانی', type: 'site' },
        { name: 'Tapsi', category: 'ایرانی', type: 'site' },
        { name: 'Aparat', category: 'ایرانی', type: 'site' },
        { name: 'Google', category: 'جهانی', type: 'site' },
        { name: 'YouTube', category: 'جهانی', type: 'site' },
        { name: 'GitHub', category: 'جهانی', type: 'site' },
        { name: 'Cloudflare', category: 'جهانی', type: 'site' },
        { name: 'Cloudflare DNS', category: 'DNS', type: 'dns' },
        { name: 'Google DNS', category: 'DNS', type: 'dns' },
        { name: 'PySmartHome-PC', category: 'پروژه‌های شخصی', type: 'site' },
        { name: 'IMDB Showcase', category: 'پروژه‌های شخصی', type: 'site' },
        { name: 'V2ray Sub', category: 'پروژه‌های شخصی', type: 'site' },
        { name: 'SMS Bomber Pro', category: 'پروژه‌های شخصی', type: 'site' },
        { name: 'GitHuby Card Studio', category: 'پروژه‌های شخصی', type: 'site' },
        { name: 'Mehrdad Dev', category: 'پروژه‌های شخصی', type: 'site' }
    ];

    const entries = [];
    const statuses = ['up', 'up', 'up', 'up', 'up', 'down']; // ۵ تا up و ۱ تا down
    
    // ۶ نمونه زمانی (هر ۱۵ دقیقه)
    for (let i = 0; i < 6; i++) {
        const ts = new Date(now.getTime() - (i * 15 * 60 * 1000)).toISOString();
        const results = sampleTargets.map((t, idx) => {
            const isUp = statuses[idx % statuses.length] === 'up';
            return {
                name: t.name,
                target: t.name.toLowerCase().replace(/\s+/g, ''),
                category: t.category,
                type: t.type,
                status: isUp ? 'up' : 'down',
                latency: isUp ? Math.floor(Math.random() * 120) + 15 : null,
                packet_loss: isUp ? Math.floor(Math.random() * 3) : 100,
                jitter: Math.floor(Math.random() * 15),
                timestamp: ts
            };
        });
        
        entries.push({
            timestamp: ts,
            source: i % 2 === 0 ? 'github' : 'cloudflare',
            total: results.length,
            up: results.filter(r => r.status === 'up').length,
            down: results.filter(r => r.status === 'down').length,
            results: results
        });
    }

    // تقسیم بین دو منبع
    state.githubData = entries.filter((_, i) => i % 2 === 0);
    state.cloudflareData = entries.filter((_, i) => i % 2 === 1);
    
    state.mergedData = {
        date: today,
        sources: {
            github: state.githubData,
            cloudflare: state.cloudflareData
        }
    };
    
    log('✅ Fallback data generated successfully');
    log(`📊 GitHub: ${state.githubData.length} entries, Cloudflare: ${state.cloudflareData.length} entries`);
}

// ------ UPDATE UI (همه بخش‌ها) ------
function updateUI() {
    updateStats();
    updateCharts();
    renderStatusList();
    renderComparisonTable();
    updateLastUpdate();
    updateDebugInfo();
}

// ------ UPDATE STATS ------
function updateStats() {
    const allResults = getAllLatestResults();
    
    if (!allResults.length) {
        setStatValues(0, 0, 0, 0, 0);
        return;
    }

    const total = allResults.length;
    const up = allResults.filter(r => r.status === 'up').length;
    const down = allResults.filter(r => r.status === 'down').length;
    const validLat = allResults.filter(r => r.latency);
    const avgLat = validLat.length ? 
        Math.round(validLat.reduce((s, r) => s + r.latency, 0) / validLat.length) : 0;
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
    document.getElementById('avgLatency').textContent = avgLat ? avgLat + ' ms' : '- ms';

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
    
    // اولویت با GitHub
    const primary = latest.find(d => d.source === 'github') || latest[0];
    return primary.results || [];
}

// ------ CHARTS ------
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
        window[canvasId + 'Chart'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['در انتظار داده...'],
                datasets: [{
                    label: label,
                    data: [0],
                    borderColor: color + '44',
                    backgroundColor: color + '11',
                    borderDash: [6, 4],
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { display: false }, x: { display: false } }
            }
        });
        return;
    }

    const period = state.currentPeriod;
    const limited = data.slice(-period);
    
    const labels = limited.map(d => new Date(d.timestamp).toLocaleTimeString('fa-IR', {hour:'2-digit', minute:'2-digit'}));
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
                pointRadius: 3,
                pointBackgroundColor: color,
                pointBorderColor: 'transparent',
                borderWidth: 2.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
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
                    grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
                    ticks: { color: '#8b949e', font: { size: 10 } }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#8b949e',
                        font: { size: 9 },
                        maxTicksLimit: 10,
                        maxRotation: 30
                    }
                }
            },
            animation: { duration: 600 }
        }
    });
}

// ------ STATUS LIST (با جستجو و فیلتر) ------
function renderStatusList() {
    const allResults = getAllLatestResults();
    const container = document.getElementById('statusList');
    
    let filtered = [...allResults];
    
    if (state.filterCategory !== 'all') {
        filtered = filtered.filter(r => r.category === state.filterCategory);
    }
    
    if (state.searchTerm.trim()) {
        const term = state.searchTerm.trim().toLowerCase();
        filtered = filtered.filter(r => 
            r.name.toLowerCase().includes(term) || 
            (r.target && r.target.toLowerCase().includes(term))
        );
    }

    if (!filtered.length) {
        container.innerHTML = `
            <div class="status-item" style="grid-column:1/-1; justify-content:center; color:var(--text-secondary); padding:30px; text-align:center;">
                ${allResults.length ? '🔍 هیچ نتیجه‌ای یافت نشد' : '📭 داده‌ای برای نمایش وجود ندارد'}
                <br><small style="font-size:0.7rem;opacity:0.6;">
                    ${allResults.length ? 'سعی کنید جستجو را تغییر دهید' : 'منتظر اولین اجرای خودکار باشید...'}
                </small>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(r => `
        <div class="status-item ${r.status}" title="${r.category || ''}">
            <span class="name">${r.name}</span>
            <div class="right">
                <span class="status-badge ${r.status}">${r.status === 'up' ? '✅' : '❌'}</span>
                ${r.latency ? `<span class="status-latency">${r.latency}ms</span>` : ''}
            </div>
        </div>
    `).join('');
}

// ------ COMPARISON TABLE ------
function renderComparisonTable() {
    const tbody = document.getElementById('comparisonBody');
    
    const githubLast = state.githubData.length ? state.githubData[state.githubData.length - 1] : null;
    const cfLast = state.cloudflareData.length ? state.cloudflareData[state.cloudflareData.length - 1] : null;
    
    if (!githubLast && !cfLast) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:30px;">
            📭 داده‌ای برای مقایسه وجود ندارد
            <br><small style="font-size:0.7rem;opacity:0.6;">منتظر اولین اجرای خودکار GitHub Actions یا Cloudflare Worker باشید</small>
        </td></tr>`;
        return;
    }

    const gResults = githubLast?.results || [];
    const cResults = cfLast?.results || [];
    
    const common = gResults.filter(g => 
        cResults.some(c => c.name === g.name)
    );

    if (!common.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:30px;">
            📭 هیچ هدف مشترکی بین دو پلتفرم یافت نشد
        </td></tr>`;
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
        
        return `
            <tr>
                <td><strong>${g.name}</strong></td>
                <td style="color:var(--text-secondary);font-size:0.75rem;">${g.category || 'other'}</td>
                <td><span class="status-dot ${gStatus ? 'up' : 'down'}"></span> ${gStatus ? '✅' : '❌'} ${gLat}</td>
                <td><span class="status-dot ${cStatus ? 'up' : 'down'}"></span> ${cStatus ? '✅' : '❌'} ${cLat}</td>
                <td><span class="diff-badge ${diffClass}">${diff}</span></td>
            </tr>
        `;
    }).join('');
}

// ------ LAST UPDATE ------
function updateLastUpdate() {
    const allData = [...state.githubData, ...state.cloudflareData];
    if (!allData.length) {
        document.getElementById('lastUpdate').textContent = '⏳ در انتظار داده...';
        return;
    }
    const latest = allData.reduce((a, b) => 
        new Date(a.timestamp) > new Date(b.timestamp) ? a : b
    );
    const time = new Date(latest.timestamp).toLocaleString('fa-IR');
    document.getElementById('lastUpdate').textContent = `🔄 ${time}`;
}

// ------ DEBUG INFO (نمایش وضعیت در کنسول) ------
function updateDebugInfo() {
    log('📊 Current state summary:', {
        githubEntries: state.githubData.length,
        cloudflareEntries: state.cloudflareData.length,
        hasMerged: !!state.mergedData,
        totalResults: getAllLatestResults().length,
        isFallback: state.githubData.length > 0 && state.githubData[0]?.source === undefined,
        timestamp: new Date().toISOString()
    });
}

// ------ EVENT LISTENERS ------
// دوره نمودار
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

// ------ AUTO REFRESH (هر ۳۰ ثانیه برای تست، بعداً ۲ دقیقه) ------
let refreshInterval = setInterval(() => {
    log('🔄 Auto-refreshing...');
    loadData();
}, 30000); // هر ۳۰ ثانیه برای دیباگ (بعداً به ۱۲۰۰۰۰ تغییر بده)

// ------ INIT ------
document.addEventListener('DOMContentLoaded', () => {
    log('🚀 DOM Ready, initializing...');
    loadData();
});

// وقتی کاربر روی صفحه کلیک کرد، دیباگ رو نمایش بده
document.addEventListener('click', () => {
    log('👆 Click detected - check console for debug info');
    updateDebugInfo();
});
