/* Plotline offline cache.
   The page (index.html) is fetched fresh whenever there is a signal, so an update only needs index.html uploaded.
   With no signal, or a very slow one, the saved copy is used. Icons and fonts use the saved copy and refresh quietly.
   Change CACHE only if the list of files below changes. */
const CACHE = 'plotline-v5';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
const SLOW_MS = 4000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function pageFirstFromNetwork(req, cache){
  try {
    const res = await Promise.race([
      fetch(req, { cache: 'no-cache' }),
      new Promise((_, no) => setTimeout(() => no(new Error('slow')), SLOW_MS))
    ]);
    if(res && res.ok){
      cache.put(req, res.clone());
      cache.put('index.html', res.clone());
      return res;
    }
  } catch(err){}
  return (await cache.match(req)) || (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const ours = url.origin === self.location.origin;
  const fonts = /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!ours && !fonts) return;
  const isPage = req.mode === 'navigate' || (ours && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')));
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      if (isPage) return pageFirstFromNetwork(req, cache);
      const hit = await cache.match(req);
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (hit) return hit;
      const fresh = await net;
      return fresh || Response.error();
    })
  );
});
