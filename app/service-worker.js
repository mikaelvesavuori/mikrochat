const CACHE_NAME = 'mikrochat-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/mikrochat.min.js',
  '/mikrosafe.min.js',
  '/manifest.json',
  '/offline.html'
];

const API_CACHE_URLS = ['/server/settings', '/channels', '/auth/me'];

// Matches pattern: /channels/{CHANNEL_ID}/messages/image/{ANYTHING}
function isMessageImage(url) {
  return url.pathname.match(/\/channels\/.*\/messages\/image\/.*/);
}

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  // Skip SSE events
  if (url.pathname === '/events') return;

  if (
    url.origin === location.origin &&
    (API_CACHE_URLS.some((endpoint) => url.pathname.includes(endpoint)) ||
      isMessageImage(url))
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200) return response;

          // Clone and cache the response
          const clonedResponse = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, clonedResponse));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // For everything else, try cache first, then network
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request)
        .then((response) => {
          if (
            STATIC_ASSETS.includes(url.pathname) ||
            url.pathname.startsWith('/icons/')
          ) {
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() => {
          // If requesting HTML, show the offline page
          if (event.request.headers.get('Accept')?.includes('text/html'))
            return caches.match('/offline.html');

          return new Response('Offline', { status: 503 });
        });
    })
  );
});
