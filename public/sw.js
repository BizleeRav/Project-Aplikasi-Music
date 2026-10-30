const CACHE_NAME = 'aurasound-v56';

const IMAGE_CACHE = 'aurasound-images-v2';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME && key !== IMAGE_CACHE) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Cache images (YouTube thumbnails and local images) using Cache-First strategy for 0ms instant loading
  if (url.hostname.includes('ytimg.com') || url.pathname.startsWith('/images/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => cachedResponse);
        });
      })
    );
    return;
  }

  // API calls & app assets: Network-first
  event.respondWith(
    fetch(event.request)
      .then(response => response)
      .catch(() => caches.match(event.request))
  );
});
