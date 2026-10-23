/* Road Cost 4. Explicit app-shell cache; APIs and map tiles never enter it. */
const CACHE_NAME = 'road-cost-offline-v10';
const URLS = [
  './',
  './index.html',
  './styles.css?v=10',
  './core.js?v=10',
  './app.js?v=10',
  './map.js?v=10',
  './manifest.webmanifest?v=10',
  './fonts/alexandria.woff2',
  './icons/road-cost.svg?v=5',
  './icons/road-cost-180.png?v=6',
  './icons/road-cost-192.png?v=6',
  './icons/road-cost-512.png?v=6',
  './vendor/leaflet.css',
  './vendor/leaflet.js',
  './vendor/images/layers.png',
  './vendor/images/layers-2x.png',
];
const absolute = (path) => new URL(path, self.registration.scope).href;
const SHELL = new Set(URLS.map(absolute));
self.addEventListener('install', (event) => {
  // A partial shell must never replace the last working installation.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll([...SHELL])));
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                (name.startsWith('road-cost-offline-') || name.startsWith('taxi-fuel-offline-')) &&
                name !== CACHE_NAME
            )
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url),
    scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (request.mode === 'navigate') {
    // Serve the matching installed shell atomically; reg.update() checks for releases.
    // Query strings (old ?fresh= links) cannot create unbounded cache entries.
    event.respondWith(
      caches
        .open(CACHE_NAME)
        .then(async (cache) => (await cache.match(absolute('./index.html'))) || fetch(request))
    );
    return;
  }
  if (!SHELL.has(url.href)) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => (await cache.match(request)) || fetch(request))
  );
});
