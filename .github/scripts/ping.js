const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// دریافت پارامترها از محیط
const source = process.env.SOURCE || 'github'; // github یا cloudflare
const baseDir = process.env.BASE_DIR || '.';
const targetsFile = path.join(baseDir, 'targets.json');

// خواندن لیست هدف‌ها
const targetsData = JSON.parse(fs.readFileSync(targetsFile, 'utf8'));
const allTargets = [...targetsData.sites, ...targetsData.dns];

const results = [];
const timestamp = new Date().toISOString();

console.log(`🔄 Starting ping from ${source} at ${timestamp}`);

for (const target of allTargets) {
  const pingTarget = target.url || target.ip;
  try {
    // اجرای پینگ با ۴ بار ارسال
    const output = execSync(`ping -c 4 -W 2 ${pingTarget}`, { 
      stdio: 'pipe',
      encoding: 'utf8'
    });
    
    // استخراج آمار
    const statsLine = output.split('\n').find(line => 
      line.includes('rtt') || line.includes('round-trip')
    );
    
    let latency = null, jitter = 0, packetLoss = 0;
    
    if (statsLine) {
      const matches = statsLine.match(/([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)/);
      if (matches) {
        latency = Math.round(parseFloat(matches[2])); // avg
        jitter = Math.round(parseFloat(matches[4])); // mdev
      }
    }
    
    const lossMatch = output.match(/(\d+)%\s+packet loss/);
    if (lossMatch) packetLoss = parseInt(lossMatch[1]);
    
    results.push({
      name: target.name,
      target: pingTarget,
      category: target.category || 'other',
      type: target.url ? 'site' : 'dns',
      status: 'up',
      latency,
      packet_loss: packetLoss,
      jitter,
      timestamp
    });
    
    console.log(`✅ ${target.name}: UP (${latency}ms, loss: ${packetLoss}%)`);
    
  } catch (error) {
    results.push({
      name: target.name,
      target: pingTarget,
      category: target.category || 'other',
      type: target.url ? 'site' : 'dns',
      status: 'down',
      latency: null,
      packet_loss: 100,
      jitter: null,
      timestamp,
      error: error.message
    });
    console.log(`❌ ${target.name}: DOWN`);
  }
}

// ذخیره داده‌ها
const dateStr = new Date().toISOString().split('T')[0];
const dataDir = path.join(baseDir, 'data', source);
const filePath = path.join(dataDir, `${dateStr}.json`);

// اطمینان از وجود پوشه
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// خواندن داده‌های قبلی
let allData = [];
if (fs.existsSync(filePath)) {
  allData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// اضافه کردن داده جدید
allData.push({ 
  timestamp, 
  source, 
  total: results.length,
  up: results.filter(r => r.status === 'up').length,
  down: results.filter(r => r.status === 'down').length,
  results 
});

// نوشتن فایل
fs.writeFileSync(filePath, JSON.stringify(allData, null, 2));
console.log(`💾 Data saved to ${filePath}`);
console.log(`📊 Summary: ${results.length} targets, ${results.filter(r => r.status === 'up').length} up, ${results.filter(r => r.status === 'down').length} down`);
