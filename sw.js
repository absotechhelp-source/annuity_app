// ================================================================
//  VLA Annuity App — Service Worker v5
//  Single file app: only index.html + manifest + icons to cache.
//  Network-first for HTML (always fresh), cache-first for images.
//  Auto-update: skipWaiting + clients.claim on activate.
//  To trigger update on all devices: bump CACHE_VERSION below.
// ================================================================

const CACHE_VERSION = 'vla-annuity-v44';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ── Install ───────────────────────────────────────────────────
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function(c) { return c.addAll(CORE_ASSETS); })
      .then(function() { return self.skipWaiting(); })
  );
});

// ── Activate: purge old caches, claim all tabs ────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
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
self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;

  var url = e.request.url;
  var isImage = /\.(png|jpg|jpeg|svg|ico|gif|webp)(\?.*)?$/.test(url);
  var isExternal = url.indexOf('script.google.com') > -1 ||
                   url.indexOf('googleapis.com') > -1;

  // Never cache Apps Script calls — always network, no fallback
  if (isExternal) return;

  if (isImage) {
    // Cache-first for icons
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return cached || fetch(e.request).then(function(res) {
          if (res && res.status === 200) {
            caches.open(CACHE_VERSION).then(function(c) {
              c.put(e.request, res.clone());
            });
          }
          return res;
        });
      })
    );
  } else {
    // Network-first for HTML and everything else
    e.respondWith(
      fetch(e.request)
        .then(function(res) {
          if (res && res.status === 200) {
            caches.open(CACHE_VERSION).then(function(c) {
              c.put(e.request, res.clone());
            });
          }
          return res;
        })
        .catch(function() {
          return caches.match(e.request).then(function(cached) {
            return cached || new Response('Offline', { status: 503 });
          });
        })
    );
  }
});

// ── Message: tab asks SW to skip waiting ─────────────────────
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
