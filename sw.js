// =========================================================
// Service worker: permite abrir la app sin conexión
// Sube el número de CACHE cuando publiques cambios importantes
// =========================================================
const CACHE = 'gymfit-v9';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/utils.js',
  './js/db.js',
  './js/sheet.js',
  './js/charts.js',
  './js/calendar.js',
  './js/routines.js',
  './js/bodymap.js',
  './js/exercises.js',
  './js/workout.js',
  './js/stats.js',
  './js/nutrition.js',
  './js/settings.js',
  './js/api.js',
  './js/barcode.js',
  './js/weight.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primero la caché (rápido) y en segundo plano se actualiza desde internet
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Librería del lector de códigos (CDN): se guarda la primera vez para usarla sin conexión
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(CACHE).then(async cache =>
      (await cache.match(req)) || fetch(req).then(res => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; })
    ));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
