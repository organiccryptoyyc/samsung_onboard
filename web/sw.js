// Caches the app shell for fast loads. API calls always go to the network:
// prices, balances and transactions must never come from a cache.
const CACHE = 'pokt-onboard-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'wallets.js', 'config.js', 'manifest.webmanifest', 'icons/app.svg'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL))));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
