const CACHE = 'vinayak-offline-v1';
const OFFLINE = '/offline.html';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([OFFLINE, '/app-icon-192.png'])));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('vinayak-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
// Only navigations receive an offline fallback. Accounts, APIs, bookings and
// gallery media are never cached or replayed by this worker.
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method === 'GET' && url.origin === self.location.origin && !url.search && [OFFLINE, '/app-icon-192.png'].includes(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then(cached => cached || fetch(request)));
    return;
  }
  if (request.method !== 'GET' || request.mode !== 'navigate' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request, {cache: 'no-store'}).catch(() => caches.match(OFFLINE)));
});
