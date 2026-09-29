// Offline cache. The build script rewrites VERSION so a new build refreshes it.
const VERSION = 'dev';
const CACHE = 'black-folk-' + VERSION;
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'data/content.js',
  'js/content.js',
  'js/mastery.js',
  'js/graph.js',
  'js/notes.js',
  'js/session.js',
  'js/store.js',
  'js/encounters.js',
  'js/map.js',
  'js/explore.js',
  'js/app.js',
  'fonts/instrument-serif-latin-400-normal.woff2',
  'fonts/instrument-serif-latin-400-italic.woff2',
  'fonts/inter-latin-wght-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('black-folk-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (so edits show up during development), cache as offline fallback.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
