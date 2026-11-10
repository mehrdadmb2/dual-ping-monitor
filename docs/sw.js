'use strict';
const CACHE_NAME = 'dpm-shell-v4';
const SHELL = ['./', './index.html', './style.css', './script.js', './config.js', './manifest.webmanifest', './targets.json', './icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/data/')) {
    // History is network-first so new snapshots win; a cached copy keeps the
    // dashboard usable when the origin is temporarily unreachable.
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch {
        return (await caches.match(request)) || Response.error();
      }
    })());
    return;
  }

  // App shell: network-first for updates, cache fallback for offline visits.
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch {
      return (await caches.match(request)) || (await caches.match('./index.html')) || Response.error();
    }
  })());
});
