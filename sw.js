/** KINO SW — network-first per codice, cache-first immagini, offline sync. */
const CACHE = 'kino-v6';
const PRECACHE = ['./index.html', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks =>
      Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function netFirst(req) {
  return fetch(req).then(res => {
    if (res && res.status === 200 && res.type === 'basic') {
      const c = res.clone();
      caches.open(CACHE).then(ca => ca.put(req, c));
    }
    return res;
  }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')));
}

function staleWhileRevalidate(req) {
  return caches.open(CACHE).then(c =>
    c.match(req).then(cached => {
      const p = fetch(req)
        .then(res => { if (res && res.status === 200 && res.type === 'basic') c.put(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || p;
    })
  );
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  const url = new URL(e.request.url);
  if (e.request.mode === 'navigate' || /\.(?:html|css|js)$/i.test(url.pathname)) {
    e.respondWith(netFirst(e.request));
  } else {
    e.respondWith(staleWhileRevalidate(e.request));
  }
});

self.addEventListener('sync', e => {
  if (e.tag === 'kino-offline-sync') {
    e.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({ type: 'flush-offline' }));
      })
    );
  }
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
