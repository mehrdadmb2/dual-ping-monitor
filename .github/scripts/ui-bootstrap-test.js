'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const script = fs.readFileSync(path.join(root, 'docs/script.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'docs/index.html'), 'utf8');

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.className = '';
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.attributes = {};
    this.handlers = new Map();
    this.classList = {
      values: new Set(),
      add: (...items) => items.forEach(item => this.classList.values.add(item)),
      remove: (...items) => items.forEach(item => this.classList.values.delete(item)),
      contains: item => this.classList.values.has(item),
      toggle: (item, force) => {
        const shouldAdd = force === undefined ? !this.classList.values.has(item) : Boolean(force);
        if (shouldAdd) this.classList.values.add(item); else this.classList.values.delete(item);
        return shouldAdd;
      }
    };
  }
  addEventListener(type, callback) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(callback);
  }
  querySelectorAll() { return []; }
  querySelector() { return new FakeElement(`${this.id}-child`); }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  close() { this.open = false; }
  showModal() { this.open = true; }
  appendChild() {}
  remove() {}
  click() {}
}

function makeContext({ offline = false, coldOffline = false, workerOffline = false, historyOffline = false, malformedCatalog = false } = {}) {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const elements = new Map(ids.map(id => [id, new FakeElement(id)]));
  const document = {
    readyState: 'complete',
    documentElement: new FakeElement('documentElement'),
    body: new FakeElement('body'),
    activeElement: new FakeElement('activeElement'),
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new FakeElement(id));
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    querySelector() { return new FakeElement('query-result'); },
    addEventListener() {},
    createElement() { return new FakeElement('created'); },
    createElementNS(_ns, tag) { return new FakeElement(tag); }
  };
  const stored = new Map();
  const localStorage = {
    getItem: key => stored.has(key) ? stored.get(key) : null,
    setItem: (key, value) => stored.set(key, String(value)),
    removeItem: key => stored.delete(key)
  };
  const timers = new Set();
  const window = {
    DPM_CONFIG: {
      version: '4.0.1', dataBase: 'data/', targetCatalog: 'targets.json',
      workerUrl: 'https://worker.example.test', autoRefreshMs: 60000,
      staleAfterMs: 1500000, defaultTheme: 'aurora', maxHistoryDays: 7
    },
    addEventListener() {},
    setTimeout(callback, delay) { const id = setTimeout(callback, delay); timers.add(id); return id; },
    clearTimeout(id) { clearTimeout(id); timers.delete(id); },
    setInterval() { return 777; },
    clearInterval() {},
    __DPM_BOOT_GUARD__: { dismiss() {} }
  };

  const today = new Date().toISOString().slice(0, 10);
  const sample = {
    timestamp: new Date().toISOString(), source: 'github', total: 1, up: 1, degraded: 0, down: 0,
    results: [{ id: 'sample-site', name: 'Sample Site', url: 'https://example.test', type: 'site', status: 'up', latency: 42, http_status: 200 }]
  };
  const catalog = {
    sites: [{ id: 'sample-site', name: 'Sample Site', url: 'https://example.test', category: 'ایرانی', group: 'آزمایشی', criticality: 'normal', tags: [] }],
    dns: []
  };
  if (offline && !coldOffline) stored.set('dpm-target-catalog-v4', JSON.stringify(catalog));
  async function fetch(url) {
    if (offline) throw new TypeError('Network unavailable (test scenario)');
    const value = String(url);
    if (value.startsWith('targets.json')) return response(malformedCatalog ? { sites: 'broken', dns: [] } : catalog);
    if (value.startsWith('data/index.json') || value.includes('/data/merged/')) {
      if (historyOffline) throw new TypeError('History unavailable (test scenario)');
      if (value.startsWith('data/index.json')) return response({ dates: [today], latest: today });
      return response({ sources: { github: [sample], cloudflare: [] } });
    }
    if (value.startsWith('https://worker.example.test/api/latest')) {
      if (workerOffline) throw new TypeError('Worker unavailable (test scenario)');
      return response({ ...sample, source: 'cloudflare' });
    }
    if (value.startsWith('https://worker.example.test/api/config')) {
      if (workerOffline) throw new TypeError('Worker unavailable (test scenario)');
      return response(catalog);
    }
    throw new Error(`Unexpected URL in UI test: ${value}`);
  }
  function response(data) {
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(data)) };
  }

  const context = {
    window, document, localStorage, fetch, console,
    URL, URLSearchParams, AbortController, Blob,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Date, Map, Set, Promise, Math, Number, String, Array, Object, JSON, RegExp,
    encodeURIComponent, decodeURIComponent
  };
  vm.createContext(context);
  return { context, elements, timers };
}


function testIndependentBootGuard() {
  const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(code => code.trim());
  assert.ok(inlineScripts.length >= 2, 'HTML must contain the independent boot guard and service-worker registration');
  const listeners = new Map();
  const boot = new FakeElement('bootScreen');
  const notice = new FakeElement('bootRecovery');
  notice.hidden = true;
  const window = {
    addEventListener: (name, callback) => listeners.set(name, callback),
    setTimeout: () => 1,
    clearTimeout: () => {}
  };
  const document = { getElementById: id => id === 'bootScreen' ? boot : id === 'bootRecovery' ? notice : null };
  vm.runInNewContext(inlineScripts[0], { window, document }, { filename: 'docs/index.html:boot-guard', timeout: 1000 });
  listeners.get('error')({ error: new Error('simulated fatal app script error'), message: 'simulated fatal app script error' });
  assert.ok(boot.classList.contains('is-hidden'), 'independent boot guard must uncover the dashboard after a fatal JS error');
  assert.equal(notice.hidden, false, 'independent boot guard must display a recovery notice');
}

async function runScenario(options) {
  const { context, elements, timers } = makeContext(options);
  vm.runInContext(script, context, { filename: 'docs/script.js', timeout: 3000 });
  await new Promise(resolve => setTimeout(resolve, 500));
  const boot = elements.get('bootScreen');
  assert.ok(boot?.classList.contains('is-hidden'), 'boot screen must be dismissed');
  const expectedTargets = options.coldOffline ? '۰' : '۱';
  assert.equal(elements.get('totalMetric')?.textContent, expectedTargets, 'dashboard target metrics should match available catalog');
  if (options.coldOffline) assert.equal(elements.get('bootRecovery')?.hidden, false, 'first-visit offline mode must show a clear recovery notice');
  for (const timer of timers) clearTimeout(timer);
}

(async () => {
  await runScenario({});
  console.log('✅ UI bootstrap test passed: normal catalog/history/Worker path.');
  await runScenario({ workerOffline: true });
  console.log('✅ UI fallback test passed: Worker outage does not block GitHub Pages/history.');
  await runScenario({ historyOffline: true });
  console.log('✅ UI fallback test passed: history outage does not block live Worker/catalog.');
  await runScenario({ malformedCatalog: true });
  console.log('✅ UI fallback test passed: malformed static catalog falls back to Worker config.');
  await runScenario({ offline: true });
  console.log('✅ UI recovery test passed: complete network outage uses cached catalog and never traps the loader.');
  await runScenario({ offline: true, coldOffline: true });
  console.log('✅ UI recovery test passed: first visit offline shows an explicit missing-catalog notice instead of a misleading empty list.');
  testIndependentBootGuard();
  console.log('✅ Boot watchdog test passed: a fatal frontend script error reveals the app and a recovery notice.');
})().catch(error => {
  console.error('❌ UI bootstrap test failed:', error);
  process.exitCode = 1;
});
