'use strict';

/**
 * Offline smoke test for the GitHub Actions probe engine.
 * It uses only loopback HTTP endpoints, so it does not depend on external DNS,
 * the public internet, or the live target catalog.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dpm-smoke-'));
const server = http.createServer((request, response) => {
  const routes = { '/ok': 204, '/restricted': 403, '/failure': 503 };
  const status = routes[new URL(request.url, 'http://localhost').pathname] || 404;
  response.writeHead(status, { 'Cache-Control': 'no-store', 'Content-Length': '0' });
  response.end();
});

function cleanup() {
  try { server.close(); } catch {}
  try { fs.rmSync(temp, { recursive: true, force: true }); } catch {}
}

server.listen(0, '127.0.0.1', async () => {
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const config = {
    version: 4,
    schema: 'dual-ping-targets/4',
    probe_defaults: { timeout_ms: 2000, icmp_timeout_sec: 1, icmp_samples: 1, concurrency: 3, history_limit: 48 },
    sites: [
      { id: 'smoke-ok', name: 'Smoke OK', url: `${origin}/ok`, category: 'test', group: 'loopback', criticality: 'high' },
      { id: 'smoke-restricted', name: 'Smoke Restricted', url: `${origin}/restricted`, category: 'test', group: 'loopback', criticality: 'normal' },
      { id: 'smoke-failure', name: 'Smoke Failure', url: `${origin}/failure`, category: 'test', group: 'loopback', criticality: 'low' }
    ],
    dns: []
  };
  const targetsPath = path.join(temp, 'targets.json');
  fs.writeFileSync(targetsPath, JSON.stringify(config), 'utf8');

  const child = spawn(process.execPath, [path.join(root, '.github/scripts/ping.js')], {
    cwd: temp,
    env: {
      ...process.env,
      SOURCE: 'smoke',
      TARGETS_FILE: targetsPath,
      TIMEOUT_MS: '2000',
      ICMP_TIMEOUT_SEC: '1',
      ICMP_SAMPLES: '1',
      CONCURRENCY: '3'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  const run = await new Promise(resolve => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve({ status: null, error: new Error('Probe smoke test exceeded 20 seconds'), stdout, stderr });
    }, 20000);
    child.once('error', error => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      resolve({ status: null, error, stdout, stderr });
    });
    child.once('close', status => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      resolve({ status, error: null, stdout, stderr });
    });
  });

  if (run.error) {
    console.error('❌ Probe smoke test could not complete:', run.error.message);
    console.error(run.stdout || ''); console.error(run.stderr || '');
    cleanup(); process.exitCode = 1; return;
  }
  if (run.status !== 0) {
    console.error('❌ Probe smoke test failed.');
    console.error(run.stdout || ''); console.error(run.stderr || '');
    cleanup(); process.exitCode = 1; return;
  }

  try {
    const date = new Date().toISOString().slice(0, 10);
    const outputPath = path.join(temp, 'data', 'smoke', `${date}.json`);
    const history = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    const snapshot = history.at(-1);
    const actual = new Map(snapshot.r.map(row => [row.i, row.s]));
    const expected = new Map([['smoke-ok', 'up'], ['smoke-restricted', 'degraded'], ['smoke-failure', 'down']]);
    for (const [id, status] of expected) {
      if (actual.get(id) !== status) throw new Error(`${id}: expected ${status}, received ${actual.get(id) || 'missing'}`);
    }
    if (snapshot.n !== 3 || snapshot.u !== 1 || snapshot.g !== 1 || snapshot.d !== 1) {
      throw new Error(`Unexpected counters: total=${snapshot.n}, up=${snapshot.u}, degraded=${snapshot.g}, down=${snapshot.d}`);
    }
    console.log('✅ Probe smoke test passed: HTTP 204 → up, HTTP 403 → degraded, HTTP 503 → down.');
    console.log('   ICMP is collected independently and does not override successful HTTP classification.');
  } catch (error) {
    console.error('❌ Probe smoke test assertion failed:', error.message);
    console.error(run.stdout || ''); console.error(run.stderr || '');
    process.exitCode = 1;
  } finally {
    cleanup();
  }
});

server.on('error', error => {
  console.error('❌ Probe smoke-test server error:', error.message);
  cleanup(); process.exitCode = 1;
});
