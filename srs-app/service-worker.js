importScripts('./version.js'); // provides APP_VERSION — bump it in version.js only
const CACHE_NAME = 'on-tap-cache-' + APP_VERSION;
const SHELL = [
  './index.html',
  './style.css',
  './app.js',
  './version.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Page can tell a waiting worker to activate immediately (used by the update banner)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Incoming scheduled reminder from the push server, delivered even when the app is closed
const ICON_URL = new URL('icon-512.png', self.location).href;

self.addEventListener('push', (event) => {
  let data = { title: 'Ôn Tập', body: 'Đến giờ ôn bài rồi!', tag: 'daily-reminder' };
  try { if (event.data) data = Object.assign(data, event.data.json()); } catch (e) { /* use defaults */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: ICON_URL,
      tag: data.tag || 'daily-reminder'
    })
  );
});

// Tapping the notification opens (or focuses) the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
      for (const client of all) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const isShellFile = event.request.mode === 'navigate' ||
    SHELL.some((f) => event.request.url.endsWith(f.replace('./', '')));

  if (isShellFile) {
    // network-first so users get new content as soon as it's deployed,
    // falling back to cache when offline
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // cache-first for static assets
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});