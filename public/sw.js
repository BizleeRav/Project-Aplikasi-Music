const CACHE_NAME = 'aurasound-v101';

const IMAGE_CACHE = 'aurasound-images-v4';

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

  // Cache images (YouTube thumbnails, google CDN, and local images) using Cache-First strategy for 0ms instant loading
  if (url.hostname.includes('ytimg.com') || url.hostname.includes('googleusercontent.com') || url.pathname.startsWith('/images/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
              return networkResponse;
            }
            if (url.hostname.includes('ytimg.com') && url.pathname.includes('/vi_webp/') && (!networkResponse || networkResponse.status === 404)) {
              const fallbackUrl = event.request.url.replace('/vi_webp/', '/vi/').replace('.webp', '.jpg');
              return fetch(fallbackUrl).then(fbRes => {
                if (fbRes && fbRes.status === 200) {
                  cache.put(event.request, fbRes.clone());
                }
                return fbRes;
              }).catch(() => networkResponse);
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
