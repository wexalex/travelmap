/* Service Worker — App komplett offline nutzbar (Karten-Geocoding braucht Netz). */
const CACHE = 'travelmap-v4';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/db.js',
  'js/geo.js',
  'js/stats.js',
  'js/globe.js',
  'js/map.js',
  'js/export.js',
  'js/app.js',
  'vendor/globe.gl.min.js',
  'vendor/maplibre-gl.js',
  'vendor/maplibre-gl.css',
  'assets/earth-dark.jpg',
  'assets/earth-topology.png',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  // Frisch aus dem Netz vorladen (cache:'reload'), damit nie eine veraltete
  // Datei aus dem HTTP-Cache in die neue Cache-Version gerät.
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(ASSETS.map(async (u) => {
      try { const res = await fetch(u, { cache: 'reload' }); if (res && res.ok) await c.put(u, res); } catch (e) { /* offline ok */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  // Fremd-Origin (z.B. Nominatim) -> immer Netz
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('index.html'))
    )
  );
});
