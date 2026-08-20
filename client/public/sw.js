// EMERGENCY: Self-destruct Service Worker
console.log('[SW] EMERGENCY MODE: Self-destructing...');

self.addEventListener('install', (event) => {
  console.log('[SW] Installing self-destruct version');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] EMERGENCY: Activating self-destruct');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('[SW] EMERGENCY: Deleting cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      console.log('[SW] EMERGENCY: Unregistering self');
      return self.registration.unregister();
    }).then(() => {
      console.log('[SW] EMERGENCY: Notifying clients to reload');
      return self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_UNREGISTERED' });
        });
      });
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // EMERGENCY: Don't cache anything, just pass through
  event.respondWith(fetch(event.request));
});

self.addEventListener('message', (event) => {
  console.log('[SW] EMERGENCY: Message received, force unregister');
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
