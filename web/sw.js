// Pokt Pal service worker.
// App files come from the network when online and from the cache when offline.
// API calls (/api/) and other origins are never cached: prices, balances and
// transactions must always come from the network.
const CACHE = 'pokt-pal-v3';
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
  // Network first for every app file, revalidated against the server (cheap
  // 304s), so a deploy shows up whole on the next load and pages never mix
  // new HTML with old scripts. The cache is only the offline fallback.
  e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
