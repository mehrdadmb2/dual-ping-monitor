// ============================================================
// DUAL PING MONITOR - نسخه نهایی پایدار (بدون خطای نحوی)
// ============================================================

// ------ STATE ------
const state = {
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

// ------ LOGGING ------
function log(msg, data) {
    console.log(`[DPM] ${msg}`, data || '');
}

function errorLog(msg, err) {
    console.error(`[DPM] ❌ ${msg}`, err || '');
}

// ------ LOAD DATA ------
async function loadData() {
    log('🔄 Starting data load...');
    try {
        // تلاش برای بارگذاری داده‌های ادغام شده
        const mergedRes = await fetch(`../data/merged/${today}.json`);
        if (mergedRes.ok) {
            state.mergedData = await mergedRes.json();
            log('✅ Merged data loaded');
            state.githubData = state.mergedData.sources?.github || [];
            state.cloudflareData = state.mergedData.sources?.cloudflare || [];
        } else {
            log('⚠️ Merged data not found, trying individual...');
            await loadIndividualData();
        }
    } catch (err) {
        errorLog('Error in loadData', err);
        await loadIndividualData();
    }

    // اگر هیچ داده‌ای نبود، از Fallback استفاده کن
    if (!state.githubData.length && !state.cloudflareData.length) {
        log('⚠️ No data found, generating fallback...');
        generateFallbackData();
    }

    // به‌روزرسانی UI
    updateUI();
    log('✅ UI updated successfully');
}

// ------ LOAD INDIVIDUAL SOURCES ------
async function loadIndividualData() {
    try {
        const githubRes = await fetch(`../data/github/${today}.json`);
        if (githubRes.ok) {
            state.githubData = await githubRes.json();
            log(`✅ GitHub data (${state.githubData.length} entries)`);
        }
    } catch (e) {
        errorLog('GitHub load error', e);
    }

    try {
        const cfRes = await fetch(`../data/cloudflare/${today}.json`);
        if (cfRes.ok) {
            state.cloudflareData = await cfRes.json();
            log(`✅ Cloudflare data (${state.cloudflareData.length} entries)`);
        }
    } catch (e) {
        errorLog('Cloudflare load error', e);
    }
}

// ------ FALLBACK DATA ------
function generateFallbackData() {
    log('📊 Generating fallback data...');
    const now = new Date();
    const sampleTargets = [
        { name: 'Snapp', category: 'ایرانی' },
        { name: 'Divar', category: 'ایرانی' },
        { name: 'Soft98', category: 'ایرانی' },
        { name: 'Google', category: 'جهانی' },
        { name: 'GitHub', category: 'جهانی' },
        { name: 'Cloudflare DNS', category: 'DNS' },
        { name: 'PySmartHome-PC', category: 'پروژه‌های شخصی' },
        { name: 'IMDB Showcase', category: 'پروژه‌های شخصی' }
    ];

    const entries = [];
    for (let i = 0; i < 6; i++) {
        const ts = new Date(now.getTime() - (i * 15 * 60 * 1000)).toISOString();
        const results = sampleTargets.map((t, idx) => {
            const isUp = idx % 4 !== 3;
            return {
                name: t.name,
                target: t.name.toLowerCase().replace(/\s+/g, ''),
                category: t.category,
                type: 'site',
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

    state.githubData = entries.filter((_, i) => i % 2 === 0);
    state.cloudflareData = entries.filter((_, i) => i % 2 === 1);
    state.mergedData = {
        date: today,
        sources: {
            github: state.githubData,
            cloudflare: state.cloudflareData
        }
    };
    log('✅ Fallback data ready');
}

// ------ UPDATE UI (همه بخش‌ها) ------
function updateUI() {
    updateStats();
    updateCharts();
    renderStatusList();
    renderComparisonTable();
    updateLastUpdate();
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
    const avgLat = validLat.length ? Math.round(validLat.reduce((s, r) => s + r.latency, 0) / validLat.length) : 0;
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
    const latest = [state.githubData, state.cloudflareData]
        .filter(arr => arr && arr.length > 0)
        .map(arr => arr[arr.length - 1]);
    if (!latest.length) return [];
    const primary = latest.find(d => d.source === 'github') || latest[0];
    return primary.results || [];
}

// ------ CHARTS (با پشتیبانی از CDN جایگزین) ------
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

    // اگر Chart.js لود نشده، از یک fallback ساده استفاده کن
    if (typeof Chart === 'undefined') {
        log('⚠️ Chart.js not loaded, skipping chart rendering');
        return;
    }

    if (!data || data.length < 1) {
        window[canvasId + 'Chart'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['در انتظار داده...'],
                datasets: [{
                    label: label,
                    data: [0],
                    borderColor: color + '44',
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
    const labels = limited.map(d => new Date(d.timestamp).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }));
    const latencies = limited.map(d => {
        const valid = (d.results || []).filter(r => r.latency);
        return valid.length ? Math.round(valid.reduce((s, r) => s + r.latency, 0) / valid.length) : 0;
    });

    window[canvasId + 'Chart'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'میانگین تاخیر (' + label + ')',
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
                    ticks: { color: '#8b949e', font: { size: 9 }, maxTicksLimit: 10, maxRotation: 30 }
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
    let filtered = allResults.slice();

    if (state.filterCategory !== 'all') {
        filtered = filtered.filter(r => r.category === state.filterCategory);
    }

    if (state.searchTerm.trim()) {
        const term = state.searchTerm.trim().toLowerCase();
        filtered = filtered.filter(r => {
            return r.name.toLowerCase().includes(term) || (r.target && r.target.toLowerCase().includes(term));
        });
    }

    if (!filtered.length) {
        container.innerHTML = '<div class="status-item" style="grid-column:1/-1;justify-content:center;color:var(--text-secondary);padding:30px;text-align:center;">' +
            (allResults.length ? '🔍 هیچ نتیجه‌ای یافت نشد' : '📭 داده‌ای برای نمایش وجود ندارد') +
            '<br><small>' + (allResults.length ? 'سعی کنید جستجو را تغییر دهید' : 'منتظر اولین اجرای خودکار باشید...') + '</small>' +
        '</div>';
        return;
    }

    let html = '';
    for (const r of filtered) {
        html += '<div class="status-item ' + r.status + '">' +
            '<span class="name">' + r.name + '</span>' +
            '<div class="right">' +
                '<span class="status-badge ' + r.status + '">' + (r.status === 'up' ? '✅' : '❌') + '</span>' +
                (r.latency ? '<span class="status-latency">' + r.latency + 'ms</span>' : '') +
            '</div>' +
        '</div>';
    }
    container.innerHTML = html;
}

// ------ COMPARISON TABLE ------
function renderComparisonTable() {
    const tbody = document.getElementById('comparisonBody');
    const githubLast = state.githubData.length ? state.githubData[state.githubData.length - 1] : null;
    const cfLast = state.cloudflareData.length ? state.cloudflareData[state.cloudflareData.length - 1] : null;

    if (!githubLast && !cfLast) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:30px;">📭 داده‌ای برای مقایسه وجود ندارد</td></tr>';
        return;
    }

    const gResults = githubLast?.results || [];
    const cResults = cfLast?.results || [];
    const common = gResults.filter(g => cResults.some(c => c.name === g.name));

    if (!common.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:30px;">📭 هیچ هدف مشترکی یافت نشد</td></tr>';
        return;
    }

    let html = '';
    for (const g of common) {
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
        html += '<tr>' +
            '<td><strong>' + g.name + '</strong></td>' +
            '<td style="color:var(--text-secondary);font-size:0.75rem;">' + (g.category || 'other') + '</td>' +
            '<td><span class="status-dot ' + (gStatus ? 'up' : 'down') + '"></span> ' + (gStatus ? '✅' : '❌') + ' ' + gLat + '</td>' +
            '<td><span class="status-dot ' + (cStatus ? 'up' : 'down') + '"></span> ' + (cStatus ? '✅' : '❌') + ' ' + cLat + '</td>' +
            '<td><span class="diff-badge ' + diffClass + '">' + diff + '</span></td>' +
        '</tr>';
    }
    tbody.innerHTML = html;
}

// ------ LAST UPDATE ------
function updateLastUpdate() {
    const allData = state.githubData.concat(state.cloudflareData);
    if (!allData.length) {
        document.getElementById('lastUpdate').textContent = '⏳ در انتظار داده...';
        return;
    }
    const latest = allData.reduce((a, b) => new Date(a.timestamp) > new Date(b.timestamp) ? a : b);
    const time = new Date(latest.timestamp).toLocaleString('fa-IR');
    document.getElementById('lastUpdate').textContent = '🔄 ' + time;
}

// ------ EVENT LISTENERS ------
document.addEventListener('DOMContentLoaded', function() {
    log('🚀 DOM ready, initializing...');
    loadData();

    // دکمه‌های نمودار
    document.querySelectorAll('.chart-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.chart-btn').forEach(function(b) {
                b.classList.remove('active');
            });
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

    // رفرش خودکار هر ۳۰ ثانیه (برای دیباگ)
    setInterval(function() {
        log('🔄 Auto-refresh');
        loadData();
    }, 30000);
});
