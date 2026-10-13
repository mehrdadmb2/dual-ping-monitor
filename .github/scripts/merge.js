const fs = require('fs');
const path = require('path');

function dateKey(date = new Date()) { return date.toISOString().slice(0, 10); }
function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return fallback; }
}

const today = dateKey();
const sources = ['github', 'cloudflare'];
const mergedData = {
  date: today,
  generated_at: new Date().toISOString(),
  version: 2,
  sources: {}
};

for (const source of sources) {
  const filePath = path.join('data', source, `${today}.json`);
  mergedData.sources[source] = readJson(filePath, []);
}

const mergedDir = path.join('data', 'merged');
fs.mkdirSync(mergedDir, { recursive: true });
const mergedPath = path.join(mergedDir, `${today}.json`);
fs.writeFileSync(mergedPath, `${JSON.stringify(mergedData, null, 2)}\n`);

const dataRoot = 'data';
const dates = [];
for (const source of ['github', 'cloudflare', 'merged']) {
  const dir = path.join(dataRoot, source);
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir)) {
    const match = file.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
    if (match) dates.push(match[1]);
  }
}

const uniqueDates = [...new Set(dates)].sort().reverse();
const latestMerged = uniqueDates.find(date => fs.existsSync(path.join(mergedDir, `${date}.json`))) || today;
const indexPayload = {
  version: 2,
  latest: latestMerged,
  generated_at: new Date().toISOString(),
  dates: uniqueDates.slice(0, 90),
  sources: {
    github: fs.existsSync(path.join('data', 'github', `${latestMerged}.json`)),
    cloudflare: fs.existsSync(path.join('data', 'cloudflare', `${latestMerged}.json`))
  }
};
fs.writeFileSync(path.join(dataRoot, 'index.json'), `${JSON.stringify(indexPayload, null, 2)}\n`);
console.log(`✅ Merged data: ${mergedPath}`);
console.log(`✅ Data index updated: latest=${latestMerged}`);
