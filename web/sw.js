// Pokt Pal service worker.
// App shell: served from cache instantly, refreshed in the background, so the
// app opens offline and picks up new releases on the next launch.
// API calls (/api/) and other origins are never cached: prices, balances and
// transactions must always come from the network.
const CACHE = 'pokt-pal-v2';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'wallets.js', 'config.js', 'manifest.webmanifest',
  'icons/app.svg', 'icons/app-192.png', 'pals/nodus.svg', 'pals/pip.svg', 'pals.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  if (req.mode === 'navigate') {
    // Pages: network first so a deploy shows up immediately; cached shell when offline.
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('index.html'))));
    return;
  }
  // Static files: stale-while-revalidate.
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req);
    const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
