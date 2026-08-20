const fs = require('fs');
const path = require('path');

const today = new Date().toISOString().split('T')[0];
const sources = ['github', 'cloudflare'];
const mergedData = { date: today, sources: {} };

for (const source of sources) {
  const filePath = path.join('data', source, `${today}.json`);
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    mergedData.sources[source] = data;
  } else {
    mergedData.sources[source] = [];
  }
}

// محاسبه آمار کلی
const allResults = [];
for (const source of sources) {
  const entries = mergedData.sources[source] || [];
  if (entries.length > 0) {
    const last = entries[entries.length - 1];
    if (last.results) {
      allResults.push({
        source,
        timestamp: last.timestamp,
        total: last.total,
        up: last.up,
        down: last.down
      });
    }
  }
}
mergedData.summary = allResults;

// ذخیره فایل ادغام شده
const mergedPath = path.join('data', 'merged', `${today}.json`);
fs.writeFileSync(mergedPath, JSON.stringify(mergedData, null, 2));
console.log(`✅ Merged data saved to ${mergedPath}`);
