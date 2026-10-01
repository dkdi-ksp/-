/* 离线缓存。装上主屏幕之后，没网也能打开课表。
   注意：Service Worker 只在安全上下文（https 或 localhost）里能注册，
   直接双击 index.html 用 file:// 打开是不行的 —— 那种情况下这段代码不会被加载。 */
const CACHE = 'claudeword-v1';

const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/weeks.js',
  'js/ics.js',
  'js/store.js',
  'js/conflicts.js',
  'js/nextclass.js',
  'js/notify.js',
  'js/ui.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(names.map(function (name) {
          return name === CACHE ? null : caches.delete(name);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return; // 绝不缓存自身，否则永远更新不了

  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;

      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () {
        // 断网时：导航请求回退到缓存的首页，其余资源老实报错
        if (req.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      });
    })
  );
});
