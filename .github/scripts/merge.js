'use strict';

const fs = require('node:fs');
const path = require('node:path');

function dateKey(date = new Date()) { return date.toISOString().slice(0, 10); }
function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (error) {
    console.warn(`[DPM:merge] Could not read ${filePath}: ${error.message}`);
    return fallback;
  }
}
function snapshotsFrom(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && (value.timestamp || value.t)) return [value];
  return [];
}
function snapshotTime(row) { return row?.timestamp || row?.t || ''; }
function sourceFile(source, date) {
  const suffix = `${date}.json`;
  if (source === 'cloudflare') {
    const pagesFile = path.join('docs', 'data', source, suffix);
    if (fs.existsSync(pagesFile)) return pagesFile;
  }
  return path.join('data', source, suffix);
}

const today = dateKey();
const sources = ['github', 'cloudflare'];
const mergedData = {
  date: today,
  generated_at: new Date().toISOString(),
  version: 4,
  schema_version: '4.0',
  sources: {}
};

for (const source of sources) {
  const filePath = sourceFile(source, today);
  const rows = snapshotsFrom(readJson(filePath, []))
    .filter(row => row && typeof row === 'object' && snapshotTime(row))
    .sort((a, b) => new Date(snapshotTime(a)) - new Date(snapshotTime(b)));
  // Idempotency: retrying a workflow does not add duplicate chart samples.
  const unique = new Map();
  for (const row of rows) unique.set(`${row.s || row.source || source}:${snapshotTime(row)}`, row);
  mergedData.sources[source] = [...unique.values()].slice(-320);
}

const mergedDir = path.join('data', 'merged');
fs.mkdirSync(mergedDir, { recursive: true });
const mergedPath = path.join(mergedDir, `${today}.json`);
fs.writeFileSync(mergedPath, `${JSON.stringify(mergedData)}\n`, 'utf8');

const dateSet = new Set();
for (const source of ['github', 'merged']) {
  const dir = path.join('data', source);
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir)) {
    const match = file.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
    if (match) dateSet.add(match[1]);
  }
}
for (const dir of [path.join('docs', 'data', 'cloudflare'), path.join('data', 'cloudflare')]) {
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir)) {
    const match = file.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
    if (match) dateSet.add(match[1]);
  }
}
const uniqueDates = [...dateSet].sort().reverse();
const latestMerged = uniqueDates.find(date => fs.existsSync(path.join(mergedDir, `${date}.json`))) || today;
const cloudflareLatestFile = sourceFile('cloudflare', latestMerged);
const indexPayload = {
  version: 4,
  schema_version: '4.0',
  latest: latestMerged,
  generated_at: new Date().toISOString(),
  dates: uniqueDates.slice(0, 90),
  sources: {
    github: fs.existsSync(path.join('data', 'github', `${latestMerged}.json`)),
    cloudflare: fs.existsSync(cloudflareLatestFile)
  },
  snapshots: {
    github: mergedData.sources.github.length,
    cloudflare: mergedData.sources.cloudflare.length
  }
};
fs.writeFileSync(path.join('data', 'index.json'), `${JSON.stringify(indexPayload, null, 2)}\n`, 'utf8');
console.log(`✅ Merged v4 data: ${mergedPath}`);
console.log(`✅ Index updated: latest=${latestMerged}; GitHub=${indexPayload.snapshots.github}; Cloudflare=${indexPayload.snapshots.cloudflare}`);
