const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// لیست هدف‌ها (همین اول با ۳ تا شروع کن)
const targets = [
  { name: 'Snapp', url: 'snapp.ir' },
  { name: 'Divar', url: 'divar.ir' },
  { name: 'Soft98', url: 'soft98.ir' }
];

const results = [];
const timestamp = new Date().toISOString();

for (const target of targets) {
  try {
    const start = Date.now();
    execSync(`ping -c 4 -W 2 ${target.url}`, { stdio: 'pipe' });
    const latency = Date.now() - start;
    results.push({
      name: target.name,
      url: target.url,
      status: 'up',
      latency: Math.round(latency / 4), // میانگین تقریبی
      timestamp: timestamp
    });
  } catch (error) {
    results.push({
      name: target.name,
      url: target.url,
      status: 'down',
      latency: null,
      timestamp: timestamp
    });
  }
}

// ذخیره در فایل JSON با نام تاریخ
const dateStr = new Date().toISOString().split('T')[0];
const filePath = path.join(__dirname, '../../data/logs', `${dateStr}.json`);

let allData = [];
if (fs.existsSync(filePath)) {
  allData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
allData.push({ timestamp, results });

fs.writeFileSync(filePath, JSON.stringify(allData, null, 2));
console.log(`✅ Data saved to ${filePath}`);
