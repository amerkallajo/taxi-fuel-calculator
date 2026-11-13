/* Road Cost 4. Explicit app-shell cache; APIs and map tiles never enter it. */
const CACHE_NAME = 'road-cost-offline-v14';
const URLS = [
  './',
  './index.html',
  './styles.css?v=14',
  './core.js?v=12',
  './app.js?v=13',
  './map.js?v=11',
  './finance.css?v=12',
  './finance.js?v=12',
  './manifest.webmanifest?v=11',
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
  // Only take control after the entire new offline shell has cached successfully.
  // This rescues installed clients still controlled by v11/v12: their old
  // navigation handler otherwise keeps returning the old cached index.html.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([...SHELL]))
      .then(() => self.skipWaiting())
  );
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
