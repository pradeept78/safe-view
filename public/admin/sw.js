// Keeps only the app's design files on the phone, so it can show a friendly offline screen.
// Bills, payments and customer details are never stored here: /api and /print are left alone.

const CACHE = 'safe-view-shell-v2';
const SHELL = [
  '/admin/offline.html',
  '/admin/admin.css',
  '/admin/app.js',
  '/admin/icons/icon-192.png',
  '/img/word-t.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/admin/offline.html')));
    return;
  }

  // The network always wins, so updates reach phones at once. The saved copy is only for offline.
  if (SHELL.includes(url.pathname)) {
    event.respondWith(fetch(request).catch(() => caches.match(url.pathname)));
  }
});
