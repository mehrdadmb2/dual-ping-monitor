// ============================================================
// DUAL PING MONITOR - نسخه با پشتیبانی از هر دو ساختار داده
// ============================================================

// STATE
var state = {
    githubData: [],
    cloudflareData: [],
    mergedData: null,
    currentPeriod: 20,
    searchTerm: '',
    filterCategory: 'all'
};

var today = new Date().toISOString().split('T')[0];
var githubChartInstance = null;
var cloudflareChartInstance = null;

// LOGGING
function log(msg, data) {
    console.log('[DPM] ' + msg, data || '');
}

function errorLog(msg, err) {
    console.error('[DPM] ❌ ' + msg, err || '');
}

// NORMALIZE DATA (تبدیل ساختار قدیمی به جدید)
function normalizeEntry(entry) {
    if (!entry) return null;
    
    // اگر ساختار جدید باشد، همان را برمی‌گردانیم
    if (entry.source === 'github' || entry.source === 'cloudflare') {
        return entry;
    }
    
    // ساختار قدیمی (github-actions یا cloudflare-worker)
    var results = (entry.results || []).map(function(r) {
        return {
            name: r.name || r.title || 'Unknown',
            target: r.url || r.target || r.ip || '',
            category: r.category || (r.type === 'dns' ? 'DNS' : 'سایر'),
            type: r.type || 'site',
            status: r.status || 'down',
            latency: r.latency || null,
            packet_loss: r.packet_loss !== undefined ? r.packet_loss : 0,
            jitter: r.jitter || 0,
            timestamp: r.timestamp || entry.timestamp
        };
    });
    
    return {
        timestamp: entry.timestamp || new Date().toISOString(),
        source: entry.source === 'cloudflare-worker' ? 'cloudflare' : 'github',
        total: results.length,
        up: results.filter(function(r) { return r.status === 'up'; }).length,
        down: results.filter(function(r) { return r.status === 'down'; }).length,
        results: results
    };
}

// LOAD DATA
async function loadData() {
    log('🔄 Starting data load...');
    try {
        var mergedRes = await fetch('../data/merged/' + today + '.json');
        if (mergedRes.ok) {
            var rawData = await mergedRes.json();
            state.mergedData = rawData;
            
            // نرمال‌سازی داده‌ها
            if (rawData.sources) {
                state.githubData = (rawData.sources.github || []).map(normalizeEntry).filter(function(e) { return e; });
                state.cloudflareData = (rawData.sources.cloudflare || []).map(normalizeEntry).filter(function(e) { return e; });
            } else {
                // اگر ساختار merged قدیمی بود
                state.githubData = [];
                state.cloudflareData = [];
            }
            log('✅ Merged data loaded');
        } else {
            log('⚠️ Merged data not found, trying individual...');
            await loadIndividualData();
        }
    } catch (err) {
        errorLog('Error in loadData', err);
        await loadIndividualData();
    }

    // اگر داده‌ای نبود یا خالی بود، از Fallback استفاده کن
    var hasData = false;
    if (state.githubData.length > 0 || state.cloudflareData.length > 0) {
        hasData = true;
        // بررسی کنید که داده‌ها خالی نباشند
        var lastG = state.githubData.length ? state.githubData[state.githubData.length - 1] : null;
        var lastC = state.cloudflareData.length ? state.cloudflareData[state.cloudflareData.length - 1] : null;
        if ((lastG && (!lastG.results || !lastG.results.length)) && 
            (lastC && (!lastC.results || !lastC.results.length))) {
            hasData = false;
        }
    }
    
    if (!hasData) {
        log('⚠️ No valid data found, generating fallback...');
        generateFallbackData();
    }

    updateUI();
    log('✅ UI updated successfully');
}

// LOAD INDIVIDUAL SOURCES
async function loadIndividualData() {
    try {
        var githubRes = await fetch('../data/github/' + today + '.json');
        if (githubRes.ok) {
            var rawData = await githubRes.json();
            // اگر آرایه است، همه را نرمال‌سازی کن
            if (Array.isArray(rawData)) {
                state.githubData = rawData.map(normalizeEntry).filter(function(e) { return e; });
            } else {
                state.githubData = [normalizeEntry(rawData)].filter(function(e) { return e; });
            }
            log('✅ GitHub data (' + state.githubData.length + ' entries)');
        }
    } catch (e) {
        errorLog('GitHub load error', e);
    }

    try {
        var cfRes = await fetch('../data/cloudflare/' + today + '.json');
        if (cfRes.ok) {
            var rawData = await cfRes.json();
            if (Array.isArray(rawData)) {
                state.cloudflareData = rawData.map(normalizeEntry).filter(function(e) { return e; });
            } else {
                state.cloudflareData = [normalizeEntry(rawData)].filter(function(e) { return e; });
            }
            log('✅ Cloudflare data (' + state.cloudflareData.length + ' entries)');
        }
    } catch (e) {
        errorLog('Cloudflare load error', e);
    }
}

// FALLBACK DATA
function generateFallbackData() {
    log('📊 Generating fallback data...');
    var now = new Date();
    var sampleTargets = [
        { name: 'Snapp', category: 'ایرانی' },
        { name: 'Divar', category: 'ایرانی' },
        { name: 'Soft98', category: 'ایرانی' },
        { name: 'Google', category: 'جهانی' },
        { name: 'GitHub', category: 'جهانی' },
        { name: 'Cloudflare DNS', category: 'DNS' },
        { name: 'PySmartHome-PC', category: 'پروژه‌های شخصی' },
        { name: 'IMDB Showcase', category: 'پروژه‌های شخصی' }
    ];

    var entries = [];
    for (var i = 0; i < 6; i++) {
        var ts = new Date(now.getTime() - (i * 15 * 60 * 1000)).toISOString();
        var results = sampleTargets.map(function(t, idx) {
            var isUp = idx % 4 !== 3;
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
            up: results.filter(function(r) { return r.status === 'up'; }).length,
            down: results.filter(function(r) { return r.status === 'down'; }).length,
            results: results
        });
    }

    state.githubData = entries.filter(function(_, i) { return i % 2 === 0; });
    state.cloudflareData = entries.filter(function(_, i) { return i % 2 === 1; });
    state.mergedData = {
        date: today,
        sources: {
            github: state.githubData,
            cloudflare: state.cloudflareData
        }
    };
    log('✅ Fallback data ready');
}

// UPDATE UI
function updateUI() {
    updateStats();
    updateCharts();
    renderStatusList();
    renderComparisonTable();
    updateLastUpdate();
}

// UPDATE STATS
function updateStats() {
    var allResults = getAllLatestResults();
    if (!allResults.length) {
        setStatValues(0, 0, 0, 0, 0);
        return;
    }
    var total = allResults.length;
    var up = allResults.filter(function(r) { return r.status === 'up'; }).length;
    var down = allResults.filter(function(r) { return r.status === 'down'; }).length;
    var validLat = allResults.filter(function(r) { return r.latency; });
    var avgLat = validLat.length ? Math.round(validLat.reduce(function(s, r) { return s + r.latency; }, 0) / validLat.length) : 0;
    var uptime = total > 0 ? Math.round((up / total) * 100) : 0;
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
    document.getElementById('upProgress').style.width = total > 0 ? (up / total) * 100 + '%' : '0%';
    document.getElementById('downProgress').style.width = total > 0 ? (down / total) * 100 + '%' : '0%';
    document.getElementById('uptimeProgress').style.width = uptime + '%';
}

function getAllLatestResults() {
    var latest = [state.githubData, state.cloudflareData]
        .filter(function(arr) { return arr && arr.length > 0; })
        .map(function(arr) { return arr[arr.length - 1]; });
    if (!latest.length) return [];
    var primary = latest.find(function(d) { return d.source === 'github'; }) || latest[0];
    return primary.results || [];
}

// CHARTS
function updateCharts() {
    drawChart('githubChart', state.githubData, '#58a6ff', 'GitHub');
    drawChart('cloudflareChart', state.cloudflareData, '#f0883e', 'Cloudflare');
}

function drawChart(canvasId, data, color, label) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var existing = window[canvasId + 'Chart'];
    if (existing) existing.destroy();

    if (typeof Chart === 'undefined') {
        log('⚠️ Chart.js not loaded, skipping chart');
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

    var period = state.currentPeriod;
    var limited = data.slice(-period);
    var labels = limited.map(function(d) {
        return new Date(d.timestamp).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    });
    var latencies = limited.map(function(d) {
        var valid = (d.results || []).filter(function(r) { return r.latency; });
        return valid.length ? Math.round(valid.reduce(function(s, r) { return s + r.latency; }, 0) / valid.length) : 0;
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

// STATUS LIST
function renderStatusList() {
    var allResults = getAllLatestResults();
    var container = document.getElementById('statusList');
    var filtered = allResults.slice();

    if (state.filterCategory !== 'all') {
        filtered = filtered.filter(function(r) { return r.category === state.filterCategory; });
    }

    if (state.searchTerm.trim()) {
        var term = state.searchTerm.trim().toLowerCase();
        filtered = filtered.filter(function(r) {
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

    var html = '';
    for (var i = 0; i < filtered.length; i++) {
        var r = filtered[i];
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

// COMPARISON TABLE
function renderComparisonTable() {
    var tbody = document.getElementById('comparisonBody');
    var githubLast = state.githubData.length ? state.githubData[state.githubData.length - 1] : null;
    var cfLast = state.cloudflareData.length ? state.cloudflareData[state.cloudflareData.length - 1] : null;

    if (!githubLast && !cfLast) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:30px;">📭 داده‌ای برای مقایسه وجود ندارد</td></tr>';
        return;
    }

    var gResults = githubLast?.results || [];
    var cResults = cfLast?.results || [];
    var common = gResults.filter(function(g) {
        return cResults.some(function(c) { return c.name === g.name; });
    });

    if (!common.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:30px;">📭 هیچ هدف مشترکی یافت نشد</td></tr>';
        return;
    }

    var html = '';
    for (var i = 0; i < common.length; i++) {
        var g = common[i];
        var c = cResults.find(function(c) { return c.name === g.name; });
        var gStatus = g.status === 'up';
        var cStatus = c?.status === 'up';
        var gLat = g.latency ? g.latency + 'ms' : '-';
        var cLat = c?.latency ? c.latency + 'ms' : '-';
        var diff = '-';
        var diffClass = 'low';
        if (g.latency && c?.latency) {
            var d = Math.abs(g.latency - c.latency);
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

// LAST UPDATE
function updateLastUpdate() {
    var allData = state.githubData.concat(state.cloudflareData);
    if (!allData.length) {
        document.getElementById('lastUpdate').textContent = '⏳ در انتظار داده...';
        return;
    }
    var latest = allData.reduce(function(a, b) {
        return new Date(a.timestamp) > new Date(b.timestamp) ? a : b;
    });
    var time = new Date(latest.timestamp).toLocaleString('fa-IR');
    document.getElementById('lastUpdate').textContent = '🔄 ' + time;
}

// EVENT LISTENERS
document.addEventListener('DOMContentLoaded', function() {
    log('🚀 DOM ready, initializing...');
    loadData();

    var chartBtns = document.querySelectorAll('.chart-btn');
    for (var i = 0; i < chartBtns.length; i++) {
        chartBtns[i].addEventListener('click', function() {
            var btns = document.querySelectorAll('.chart-btn');
            for (var j = 0; j < btns.length; j++) {
                btns[j].classList.remove('active');
            }
            this.classList.add('active');
            state.currentPeriod = parseInt(this.dataset.period);
            updateCharts();
        });
    }

    document.getElementById('searchInput').addEventListener('input', function() {
        state.searchTerm = this.value;
        renderStatusList();
    });

    document.getElementById('filterCategory').addEventListener('change', function() {
        state.filterCategory = this.value;
        renderStatusList();
    });

    setInterval(function() {
        log('🔄 Auto-refresh');
        loadData();
    }, 30000);
});
