/**
 * sw.js — Service Worker BrasilCartaPro
 * Cache-first para tiles já baixados · Stale-while-revalidate para shell
 */

const CACHE_NAME  = 'cartapro-v5';
const SHELL_CACHE = 'cartapro-shell-v5';

const BASE = '/mapas-taticos-pwa';

const SHELL_ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/app.js`,
  `${BASE}/style.css`,
  `${BASE}/manifest.json`,
  `${BASE}/modules/grid.js`,
  `${BASE}/modules/compass.js`,
  `${BASE}/modules/layers.js`,
  `${BASE}/modules/print.js`,
  `${BASE}/modules/printframe.js`,
  `${BASE}/assets/icons/icon-192.png`,
  `${BASE}/assets/icons/icon-512.png`,
];

// ── Install ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== SHELL_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Tile requests → Cache-first (com fallback de rede e armazenamento)
  const isTile = (
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('opentopomap.org')       ||
    url.hostname.includes('arcgisonline.com')       ||
    url.hostname.includes('stadiamaps.com')
  );

  if (isTile) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        } catch {
          return new Response('', { status: 503, statusText: 'Offline' });
        }
      })
    );
    return;
  }

  // Shell assets → Network-first com fallback de cache
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          caches.open(SHELL_CACHE).then(c => c.put(event.request, response.clone()));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
