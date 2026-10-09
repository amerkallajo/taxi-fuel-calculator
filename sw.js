const CACHE = 'taxi-fuel-offline-v1';
const BASE = self.registration.scope;
const ASSETS = ['', 'index.html', 'manifest.webmanifest', 'icons/apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(ASSETS.map(path => new URL(path, BASE).toString()))
  ).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('taxi-fuel-offline-') && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => {
    if (response.ok) {
      const cloned = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, cloned)).catch(() => {});
    }
    return response;
  }).catch(() => request.mode === 'navigate' ?
    caches.match(new URL('index.html', BASE).toString()) : Response.error())));
});
