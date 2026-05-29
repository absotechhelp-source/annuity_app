// ================================================================
//  VLA Annuity App — Service Worker v3
//  Strategy: Network-first for HTML/JS (always fresh), 
//  cache-first for images/icons (stable assets).
//  Auto-update: new SW activates immediately and notifies all
//  open tabs so they can reload to get the latest version.
// ================================================================

const CACHE_VERSION = 'vla-annuity-v3';   // ← bump this on every deploy

const CORE_ASSETS = [
  './',
  './index.html',
  './engine.js',
  './mortality.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ── INSTALL: cache core assets ────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function(cache) { return cache.addAll(CORE_ASSETS); })
      .then(function() {
        // Skip waiting — activate the new SW immediately
        // (don't wait for all tabs to close)
        return self.skipWaiting();
      })
  );
});

// ── ACTIVATE: delete old caches + claim all clients ──────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys
            .filter(function(key) { return key !== CACHE_VERSION; })
            .map(function(key) { return caches.delete(key); })
        );
      })
      .then(function() {
        // Take control of all open tabs immediately
        return self.clients.claim();
      })
      .then(function() {
        // Notify every open tab: "new version is ready — please reload"
        return self.clients.matchAll({ type: 'window' });
      })
      .then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
        });
      })
  );
});

// ── FETCH: network-first for app files, cache-first for images ─
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  var url = event.request.url;
  var isImage = /\.(png|jpg|jpeg|svg|ico|gif|webp)(\?.*)?$/.test(url);

  if (isImage) {
    // Cache-first: icons and images rarely change
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        return cached || fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE_VERSION).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      })
    );
  } else {
    // Network-first: always try to get the freshest JS/HTML
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE_VERSION).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(function() {
          // Offline fallback: serve from cache
          return caches.match(event.request)
            .then(function(cached) {
              return cached || new Response(
                'You are offline and this resource is not cached.',
                { status: 503, statusText: 'Offline' }
              );
            });
        })
    );
  }
});

// ── MESSAGE: tab tells SW to skip waiting and take over ───────
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
