'use strict';
/*
 * sw.js ― 電波が無くても開けるように、アプリの画面を端末に覚えておくファイル
 * 基づく仕様書：KEhoras 仕様書 v0.8
 * 新しい版は、更新ボタンが押されたときだけ切り替わります（勝手に切り替えません）。
 */
const CACHE_VERSION = 'keh-cache-v0.8';
const CACHE_PREFIX = 'keh-cache-';
const FILES = [
  './', 'index.html', 'manifest.json', 'css/style.css',
  'js/theme.js', 'js/store.js', 'js/drum.js', 'js/sync.js', 'js/app.js',
  'favicon.ico', 'icons/favicon-16.png', 'icons/favicon-32.png', 'icons/favicon-48.png',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', function (event) {
  // ブラウザの一時保存を飛ばして、いつも最新のファイルを取る
  event.waitUntil(caches.open(CACHE_VERSION).then(function (cache) {
    return Promise.all(FILES.map(function (f) {
      return cache.add(new Request(f, { cache: 'reload' }));
    }));
  }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE_VERSION; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// 自分のサイトの GET だけを扱う（GASなど外への通信には触らない）
self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(req);
  }));
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
