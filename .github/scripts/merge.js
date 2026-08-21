const fs = require('fs');
const path = require('path');

const today = new Date().toISOString().split('T')[0];
const sources = ['github', 'cloudflare'];
const mergedData = { date: today, sources: {} };

for (const source of sources) {
  const filePath = path.join('data', source, `${today}.json`);
  if (fs.existsSync(filePath)) {
    mergedData.sources[source] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } else {
    mergedData.sources[source] = [];
  }
}

const mergedPath = path.join('data', 'merged', `${today}.json`);
fs.writeFileSync(mergedPath, JSON.stringify(mergedData, null, 2));
console.log(`✅ Merged data saved to ${mergedPath}`);
