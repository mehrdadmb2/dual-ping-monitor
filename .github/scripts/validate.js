'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const targetsPath = path.join(root, 'targets.json');
const targets = JSON.parse(fs.readFileSync(targetsPath, 'utf8'));
const errors = [];
const warnings = [];
const ids = new Set();

function fail(message) { errors.push(message); }
function checkHttps(value, label) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') fail(`${label} must use HTTPS: ${value}`);
    if (url.username || url.password) fail(`${label} must not embed credentials`);
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname)) fail(`${label} must not point to localhost`);
  } catch { fail(`${label} is not a valid URL: ${value}`); }
}

if (targets.version !== 4 || targets.schema !== 'dual-ping-targets/4') fail('targets.json must use schema version 4');
if (!Array.isArray(targets.sites) || !targets.sites.length) fail('At least one website target is required');
if (!Array.isArray(targets.dns) || !targets.dns.length) fail('At least one DNS target is required');
if ((targets.sites?.length || 0) + (targets.dns?.length || 0) > 44) fail('Cloudflare target count must not exceed 44 to reserve API persistence budget');

for (const [kind, collection] of [['site', targets.sites || []], ['dns', targets.dns || []]]) {
  for (const [index, row] of collection.entries()) {
    const label = `${kind}[${index}]`;
    if (!row || typeof row !== 'object') { fail(`${label} must be an object`); continue; }
    if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(String(row.id || ''))) fail(`${label} has an invalid id`);
    if (ids.has(row.id)) fail(`Duplicate target id: ${row.id}`); else ids.add(row.id);
    if (!String(row.name || '').trim()) fail(`${label} is missing a name`);
    if (kind === 'site') {
      checkHttps(row.url, `${label}.url`);
      if (row.probe_url) checkHttps(row.probe_url, `${label}.probe_url`);
      if (!row.category || !row.group) fail(`${label} should include category and group`);
      if (!['critical', 'high', 'normal', 'low'].includes(row.criticality || 'normal')) warnings.push(`${label} uses non-standard criticality`);
    } else {
      checkHttps(row.doh_url, `${label}.doh_url`);
      if (!row.ip) warnings.push(`${label} does not include resolver IP metadata`);
    }
  }
}

const requiredFiles = [
  '.github/scripts/ping.js', '.github/scripts/merge.js', '.github/scripts/validate.js', '.github/scripts/smoke-test.js',
  '.github/workflows/monitor.yml', '.github/scripts/ui-bootstrap-test.js', '.github/scripts/service-worker-test.js', 'cloudflare/worker.js', 'cloudflare/wrangler.toml',
  'docs/index.html', 'docs/style.css', 'docs/script.js', 'docs/config.js', 'docs/sw.js', 'docs/targets.json'
];
for (const relative of requiredFiles) if (!fs.existsSync(path.join(root, relative))) fail(`Required project file is missing: ${relative}`);

// Keep HTML IDs and JavaScript selectors synchronized; a missing node can break init().
const htmlPath = path.join(root, 'docs', 'index.html');
const appScriptPath = path.join(root, 'docs', 'script.js');
if (fs.existsSync(htmlPath) && fs.existsSync(appScriptPath)) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const appScript = fs.readFileSync(appScriptPath, 'utf8');
  const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const idSet = new Set(htmlIds);
  if (idSet.size !== htmlIds.length) fail('docs/index.html contains duplicate element IDs');
  for (const match of appScript.matchAll(/\$\(['"]([^'"]+)['"]\)/g)) {
    if (!idSet.has(match[1])) fail(`docs/script.js references missing HTML id: ${match[1]}`);
  }
  if (!html.includes('__DPM_BOOT_GUARD__')) fail('Independent boot recovery guard is missing from docs/index.html');
  if (!html.includes('script.js?v=4.0.1')) fail('Dashboard script cache-busting version is missing');
  for (const [index, match] of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].entries()) {
    try { new vm.Script(match[1], { filename: `docs/index.html:inline-script-${index + 1}` }); }
    catch (error) { fail(`Inline HTML script ${index + 1} has a syntax error: ${error.message}`); }
  }
}

const workerPath = path.join(root, 'cloudflare', 'worker.js');
if (fs.existsSync(workerPath)) {
  const workerText = fs.readFileSync(workerPath, 'utf8');
  const sitesMatch = workerText.match(/const DEFAULT_SITES = (\[.*?\]);\nconst DEFAULT_DNS =/s);
  const dnsMatch = workerText.match(/const DEFAULT_DNS = (\[.*?\]);\n\nconst corsHeaders =/s);
  try {
    if (!sitesMatch || !dnsMatch) fail('Cloudflare Worker default catalog could not be parsed');
    else {
      const workerSites = JSON.parse(sitesMatch[1]);
      const workerDns = JSON.parse(dnsMatch[1]);
      const idsOf = rows => rows.map(row => row.id).sort().join('|');
      if (idsOf(workerSites) !== idsOf(targets.sites || [])) fail('Worker website catalog does not match targets.json');
      if (idsOf(workerDns) !== idsOf(targets.dns || [])) fail('Worker DNS catalog does not match targets.json');
    }
  } catch (error) { fail(`Worker target catalog validation error: ${error.message}`); }
}

if (errors.length) {
  console.error('❌ Dual Ping Monitor validation failed:');
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log(`✅ Validated ${targets.sites.length} websites + ${targets.dns.length} DNS resolvers (${ids.size} unique targets).`);
if (warnings.length) for (const warning of warnings) console.warn(`⚠ ${warning}`);
