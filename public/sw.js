/* sw.js — service worker for CareTrack (PWA install + offline launch).
 *
 * NETWORK-FIRST for the app shell: always try the network so new builds take
 * effect immediately when online; fall back to the cache only when offline.
 * The API is never cached (the gateway has its own offline queue).
 *
 * The cache name is versioned; bumping it makes `activate` purge older caches.
 */
const CACHE = 'caretrack-v2';
const SHELL = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/manifest.json',
  '/icons/icon.svg',
  '/js/app.js',
  '/js/api.js',
  '/js/i18n.js',
  '/js/ui.js',
  '/js/charts.js',
  '/js/views/login.js',
  '/js/views/dashboard.js',
  '/js/views/patients.js',
  '/js/views/patient_detail.js',
  '/js/views/alerts.js',
  '/js/views/audit.js',
  '/js/views/my_data.js',
  '/js/views/gateway.js',
];

self.addEventListener('install', (e) => {
  // pre-cache the shell so the app can still launch offline, then activate now
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  // delete any previous-version caches, then take control of open pages
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;          // never cache writes
  if (url.pathname.startsWith('/api/')) return;    // API always goes to the network

  // network-first: fetch fresh, update the cache, fall back to cache when offline
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('/index.html')))
  );
});
