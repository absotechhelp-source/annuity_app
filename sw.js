// ================================================================
//  VLA Annuity App — Service Worker v4
//  JS is inlined in index.html so only 3 core assets to cache.
//  Strategy:
//    index.html → network-first (always fresh)
//    icons/images → cache-first (stable)
//  Auto-update: skipWaiting + clients.claim so all tabs update
//  immediately. Bump CACHE_VERSION on every deploy.
// ================================================================

const CACHE_VERSION = 'vla-annuity-v4';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ── Install ───────────────────────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function(cache) { return cache.addAll(CORE_ASSETS); })
      .then(function() { return self.skipWaiting(); })
  );
});

// ── Activate: delete old caches, claim all tabs ───────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys.filter(function(k) { return k !== CACHE_VERSION; })
              .map(function(k) { return caches.delete(k); })
        );
      })
      .then(function() { return self.clients.claim(); })
      .then(function() { return self.clients.matchAll({ type: 'window' }); })
      .then(function(clients) {
        clients.forEach(function(c) {
          c.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
        });
      })
  );
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  var url = event.request.url;
  var isImage = /\.(png|jpg|jpeg|svg|ico|gif|webp)(\?.*)?$/.test(url);

  if (isImage) {
    // Cache-first for icons and images
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        return cached || fetch(event.request).then(function(res) {
          if (res && res.status === 200) {
            caches.open(CACHE_VERSION).then(function(c) { c.put(event.request, res.clone()); });
          }
          return res;
        });
      })
    );
  } else {
    // Network-first for HTML and everything else
    event.respondWith(
      fetch(event.request)
        .then(function(res) {
          if (res && res.status === 200) {
            caches.open(CACHE_VERSION).then(function(c) { c.put(event.request, res.clone()); });
          }
          return res;
        })
        .catch(function() {
          return caches.match(event.request).then(function(cached) {
            return cached || new Response('Offline', { status: 503 });
          });
        })
    );
  }
});

// ── Message: tab tells SW to skip waiting ─────────────────────
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
