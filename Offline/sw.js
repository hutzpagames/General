const CACHE_NAME = 'ktze-halashon-cache-v1';
const URLS_TO_CACHE = [
  '.', // This caches the index.html
  'manifest.json',
  'success.mp3',
  'lose.mp3',
  'victory.mp3',
  'ticking.mp3',
  'icon-192x192.png',
  'icon-512x512.png'
  // Note: The external Google Fonts and Tailwind CSS will not be cached for offline use with this simple setup.
  // The game will still function offline, but might use default fonts.
];

// Install the service worker and cache the app's assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(URLS_TO_CACHE);
      })
  );
});

// Serve cached content when offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});

// Clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
