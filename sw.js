/* ═══════════════════════════════════════════════════════
   VLA Sales App — Service Worker v2.7
═══════════════════════════════════════════════════════ */

const CACHE_VERSION = 'vla-v7.63';
const CACHE_NAME    = CACHE_VERSION;

// Only cache static assets — NEVER index.html
const PRECACHE_URLS = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// ── Install: take over immediately, don't wait ──
self.addEventListener('install', event => {
  self.skipWaiting(); // Always activate new SW immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(PRECACHE_URLS).catch(() => {}) // Fail silently if icons missing
    )
  );
});

// ── Activate: delete all old caches, claim all tabs immediately ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // Take control of all open tabs now
  );
});

// ── Fetch strategy ──
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // ── licence.json: NEVER cache — always fetch fresh, no offline fallback ──
  if(url.pathname.endsWith('licence.json')){
    event.respondWith(
      fetch(event.request, {cache:'no-store', redirect:'follow'})
        .catch(() => new Response('{"expiry":"2026-06-30"}', {
          headers: {'Content-Type': 'application/json'}
        }))
    );
    return;
  }

  // ── index.html: ALWAYS network-first, never serve stale cached version ──
  // If offline, serve cached copy as fallback only
  if(event.request.mode === 'navigate' ||
     url.pathname.endsWith('index.html') ||
     url.pathname === '/' ||
     url.pathname.endsWith('/')){
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' }) // Force revalidate from server
        .then(res => {
          // Only cache successful responses
          if(res.ok){
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html')) // Offline fallback only
    );
    return;
  }

  // ── Everything else (icons, manifest): cache-first ──
  event.respondWith(
    caches.match(event.request).then(cached => {
      if(cached) return cached;
      return fetch(event.request).then(res => {
        if(res.ok){
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
        }
        return res;
      });
    }).catch(() => new Response('Offline', { status: 503 }))
  );
});

// ── External reload trigger (kept for compatibility) ──
self.addEventListener('message', event => {
  if(event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
