const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// خواندن لیست هدف‌ها
const targetsData = JSON.parse(fs.readFileSync('targets.json', 'utf8'));
const allTargets = [...targetsData.sites, ...targetsData.dns];

const results = [];
const timestamp = new Date().toISOString();

for (const target of allTargets) {
  const pingTarget = target.url || target.ip;
  try {
    const output = execSync(`ping -c 4 -W 2 ${pingTarget}`, { 
      stdio: 'pipe',
      encoding: 'utf8'
    });
    
    // استخراج آمار از خروجی ping
    const lines = output.split('\n');
    const statsLine = lines.find(line => line.includes('rtt') || line.includes('round-trip'));
    let latency = null, packetLoss = 0, jitter = 0;
    
    if (statsLine) {
      // مثال: rtt min/avg/max/mdev = 12.345/15.678/20.123/2.456 ms
      const matches = statsLine.match(/([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)/);
      if (matches) {
        latency = Math.round(parseFloat(matches[2])); // avg
        jitter = Math.round(parseFloat(matches[4])); // mdev
      }
    }
    
    // محاسبه درصد packet loss
    const lossMatch = output.match(/(\d+)%\s+packet loss/);
    if (lossMatch) packetLoss = parseInt(lossMatch[1]);
    
    results.push({
      name: target.name,
      target: pingTarget,
      type: target.type || 'unknown',
      status: 'up',
      latency,
      packet_loss: packetLoss,
      jitter,
      timestamp
    });
  } catch (error) {
    results.push({
      name: target.name,
      target: pingTarget,
      type: target.type || 'unknown',
      status: 'down',
      latency: null,
      packet_loss: 100,
      jitter: null,
      timestamp
    });
  }
}

// ذخیره در فایل JSON با نام تاریخ
const dateStr = new Date().toISOString().split('T')[0];
const filePath = path.join(__dirname, '../../data/logs', `github-${dateStr}.json`);

let allData = [];
if (fs.existsSync(filePath)) {
  allData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
allData.push({ timestamp, source: 'github-actions', results });

fs.writeFileSync(filePath, JSON.stringify(allData, null, 2));
console.log(`✅ GitHub data saved to ${filePath}`);
console.log(`📊 Checked ${results.length} targets`);
