const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const source = process.env.SOURCE || 'github';
const targetsFile = 'targets.json';
const targetsData = JSON.parse(fs.readFileSync(targetsFile, 'utf8'));
const allTargets = [...targetsData.sites, ...targetsData.dns];

const results = [];
const timestamp = new Date().toISOString();

console.log(`🔄 Starting ping from ${source} at ${timestamp}`);

for (const target of allTargets) {
  const pingTarget = target.url || target.ip;
  try {
    const output = execSync(`ping -c 4 -W 2 ${pingTarget}`, { 
      stdio: 'pipe',
      encoding: 'utf8'
    });
    
    const statsLine = output.split('\n').find(line => 
      line.includes('rtt') || line.includes('round-trip')
    );
    
    let latency = null, jitter = 0, packetLoss = 0;
    
    if (statsLine) {
      const matches = statsLine.match(/([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)/);
      if (matches) {
        latency = Math.round(parseFloat(matches[2]));
        jitter = Math.round(parseFloat(matches[4]));
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
    
    console.log(`✅ ${target.name}: UP (${latency}ms)`);
    
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
      timestamp
    });
    console.log(`❌ ${target.name}: DOWN`);
  }
}

const dateStr = new Date().toISOString().split('T')[0];
const dataDir = path.join('data', source);
const filePath = path.join(dataDir, `${dateStr}.json`);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let allData = [];
if (fs.existsSync(filePath)) {
  allData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

allData.push({ 
  timestamp, 
  source, 
  total: results.length,
  up: results.filter(r => r.status === 'up').length,
  down: results.filter(r => r.status === 'down').length,
  results 
});

fs.writeFileSync(filePath, JSON.stringify(allData, null, 2));
console.log(`💾 Data saved to ${filePath}`);
