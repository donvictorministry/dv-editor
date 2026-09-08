/* ===================== DV-EDITOR SERVICE WORKER ===================== */
const DV_CACHE_NAME = 'dv-editor-cache-v1.1';

const DV_APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './scripts.js',
  './manifest.json'
];

const DV_CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/material-darker.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/dialog/dialog.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/xml/xml.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/css/css.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/htmlmixed/htmlmixed.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/edit/closetag.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/edit/closebrackets.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/search/searchcursor.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/search/search.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/dialog/dialog.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/selection/active-line.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(DV_CACHE_NAME).then((cache) => {
      return cache.addAll(DV_APP_SHELL).then(() => {
        return Promise.allSettled(
          DV_CDN_ASSETS.map((url) =>
            fetch(url, { mode: 'cors' })
              .then((res) => { if (res && res.ok) return cache.put(url, res); })
              .catch(() => {})
          )
        );
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== DV_CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          if (res && res.ok && (req.url.startsWith(self.location.origin) || DV_CDN_ASSETS.includes(req.url))) {
            const resClone = res.clone();
            caches.open(DV_CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => {
          if (req.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
