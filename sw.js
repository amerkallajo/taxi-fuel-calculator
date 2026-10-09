/* RoadCost v6 — offline cache, versioned assets, iOS + Android */
const CACHE_NAME = 'road-cost-offline-v6';
const CACHE_PREFIX = 'road-cost-offline-';
const OLD_CACHE_PREFIX = 'taxi-fuel-offline-';
const URLS = [
  './',
  './index.html',
  './styles.css?v=5',
  './app.js?v=5',
  './manifest.webmanifest?v=6',
  './icons/road-cost.svg?v=5',
  './icons/road-cost-180.png?v=6',
  './icons/road-cost-192.png?v=6',
  './icons/road-cost-512.png?v=6'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(URLS.map(path => new URL(path, self.registration.scope).toString())))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names
        .filter(name => (name.startsWith(CACHE_PREFIX) || name.startsWith(OLD_CACHE_PREFIX)) && name !== CACHE_NAME)
        .map(name => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {}));
          }
          return response;
        })
        .catch(() => caches.match(request).then(hit =>
          hit || caches.match(new URL('./index.html', self.registration.scope).toString())
        ))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(hit => hit || fetch(request).then(response => {
      if (response.ok) {
        const clone = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {}));
      }
      return response;
    }))
  );
});
