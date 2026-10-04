/* ============================================================
   PIXORA TOOLS — Service Worker
   ============================================================ */

const CACHE_VERSION = 'pixora-tools-v2.0.1';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_DYNAMIC = `${CACHE_VERSION}-dynamic`;

const STATIC_ASSETS = [
  './',
  './index.html',
  './Pixora.encode.html',
  './offline.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

const CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
];

/* INSTALL */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_STATIC);
      try { await cache.addAll(STATIC_ASSETS); } catch (e) { console.warn('[SW] Static:', e); }
      try { await cache.addAll(CDN_ASSETS); } catch (e) { console.warn('[SW] CDN:', e); }
      await self.skipWaiting();
    })()
  );
});

/* ACTIVATE */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith('pixora-tools-') && n !== CACHE_STATIC && n !== CACHE_DYNAMIC)
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

/* FETCH */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Skip APIs
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('remove.bg') ||
    url.hostname.includes('api.imgbb.com')
  ) return;

  // HTML pages
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(request);
          const cache = await caches.open(CACHE_DYNAMIC);
          cache.put(request, net.clone());
          return net;
        } catch (err) {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match('./offline.html');
        }
      })()
    );
    return;
  }

  // CDN assets
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('cdn.jsdelivr.net') ||
    url.hostname.includes('unpkg.com')
  ) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const net = await fetch(request);
          const cache = await caches.open(CACHE_STATIC);
          cache.put(request, net.clone());
          return net;
        } catch (err) {
          return new Response('', { status: 408, statusText: 'Offline' });
        }
      })()
    );
    return;
  }

  // Images
  if (request.destination === 'image') {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const net = await fetch(request);
          const cache = await caches.open(CACHE_DYNAMIC);
          cache.put(request, net.clone());
          return net;
        } catch (err) {
          return new Response('', { status: 404 });
        }
      })()
    );
    return;
  }

  // Default
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const fetchPromise = fetch(request)
        .then((net) => {
          caches.open(CACHE_DYNAMIC).then((c) => c.put(request, net.clone()));
          return net;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});