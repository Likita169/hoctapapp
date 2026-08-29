importScripts('./version.js'); // provides APP_VERSION — bump it in version.js only
const CACHE_NAME = 'on-tap-cache-' + APP_VERSION;
const SHELL = [
  './index.html',
  './style.css',
  './version.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './js/01-trang-thai-toan-cuc.js',
  './js/02-du-lieu-luu-tru.js',
  './js/03-thuat-toan-on-tap.js',
  './js/04-khung-giao-dien.js',
  './js/05-trang-chu-bo-the.js',
  './js/06-cong-thuc-toan.js',
  './js/07-them-the-va-bo-the.js',
  './js/08-hen-gio-va-on-tap.js',
  './js/09-quan-ly-va-thong-ke.js',
  './js/10-dong-bo-va-dang-nhap.js',
  './js/11-giao-dien-cai-dat.js',
  './js/12-api-tai-khoan-dong-bo.js',
  './js/13-lop-hoc.js',
  './js/14-thong-bao.js',
  './js/15-quan-ly-bai-kiem-tra.js',
  './js/16-dan-nhap-cau-hoi.js',
  './js/17-soan-bai-kiem-tra.js',
  './js/18-xem-de-bai-dinh-kem.js',
  './js/19-cham-bai-giao-vien.js',
  './js/20-danh-sach-bai-kiem-tra.js',
  './js/21-lam-bai-kiem-tra.js',
  './js/22-nhac-nho-day-hoc.js',
  './js/23-cap-nhat-va-giao-dien.js',
  './js/24-tro-choi-ghep-the.js',
  './js/25-khoi-dong.js',
  './katex/katex.min.css',
  './katex/katex.min.js',
  './katex/auto-render.min.js',
  './katex/fonts/KaTeX_AMS-Regular.woff2',
  './katex/fonts/KaTeX_Caligraphic-Bold.woff2',
  './katex/fonts/KaTeX_Caligraphic-Regular.woff2',
  './katex/fonts/KaTeX_Fraktur-Bold.woff2',
  './katex/fonts/KaTeX_Fraktur-Regular.woff2',
  './katex/fonts/KaTeX_Main-Bold.woff2',
  './katex/fonts/KaTeX_Main-BoldItalic.woff2',
  './katex/fonts/KaTeX_Main-Italic.woff2',
  './katex/fonts/KaTeX_Main-Regular.woff2',
  './katex/fonts/KaTeX_Math-BoldItalic.woff2',
  './katex/fonts/KaTeX_Math-Italic.woff2',
  './katex/fonts/KaTeX_SansSerif-Bold.woff2',
  './katex/fonts/KaTeX_SansSerif-Italic.woff2',
  './katex/fonts/KaTeX_SansSerif-Regular.woff2',
  './katex/fonts/KaTeX_Script-Regular.woff2',
  './katex/fonts/KaTeX_Size1-Regular.woff2',
  './katex/fonts/KaTeX_Size2-Regular.woff2',
  './katex/fonts/KaTeX_Size3-Regular.woff2',
  './katex/fonts/KaTeX_Size4-Regular.woff2',
  './katex/fonts/KaTeX_Typewriter-Regular.woff2'
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