'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'docs/sw.js'), 'utf8');
const listeners = new Map();
const deleted = [];
let addedShell = [];
const cache = { addAll: async urls => { addedShell = urls; }, put: async () => {} };
const caches = {
  open: async () => cache,
  keys: async () => ['dpm-shell-v4', 'dpm-shell-v4.0.1', 'other-project-cache'],
  delete: async key => { deleted.push(key); return true; },
  match: async () => null
};
const self = {
  location: { origin: 'https://example.test' },
  addEventListener: (name, callback) => listeners.set(name, callback),
  skipWaiting: async () => {},
  clients: { claim: async () => {} }
};
const context = { self, caches, URL, Request, Response, fetch: async () => new Response('ok'), console };
vm.createContext(context);
vm.runInContext(source, context, { filename: 'docs/sw.js', timeout: 3000 });

(async () => {
  let activation;
  listeners.get('activate')({ waitUntil: promise => { activation = promise; } });
  await activation;
  assert.deepEqual(deleted, ['dpm-shell-v4'], 'activation may delete only previous Dual Ping cache namespaces');

  let installation;
  listeners.get('install')({ waitUntil: promise => { installation = promise; } });
  await installation;
  assert.ok(addedShell.some(url => url.includes('script.js?v=4.0.1')), 'current versioned app script must be precached');
  assert.ok(addedShell.some(url => url.includes('config.js?v=4.0.1')), 'current versioned config must be precached');
  console.log('✅ Service Worker test passed: only DPM cache is cleaned and v4.0.1 assets are precached.');
})().catch(error => {
  console.error('❌ Service Worker test failed:', error);
  process.exitCode = 1;
});
