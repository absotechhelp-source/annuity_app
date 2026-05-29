/**
 * sw.js — VLA Annuity Quotation Tool
 * Service worker: cache-first strategy for full offline operation.
 * All actuarial calculations happen client-side so offline is fully functional.
 */

const CACHE_NAME = 'vla-annuity-v1';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './mortality.js',
  './engine.js',
  './manifest.json'
];

// ── Install: pre-cache all app shell assets ───────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: delete old caches ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: cache-first, network fallback ─────────────────────────────────────
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Cache successful responses for app assets
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline and not in cache — return nothing (graceful)
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
