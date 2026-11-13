/* Forever Priests app helper (service worker).
   - Pages: always try the internet first, so updates show right away. Offline, the saved copy opens.
   - Images, fonts and styles: show the saved copy instantly and refresh it in the background.
   - Articles: internet first, saved copy when offline.
   - Wowhead tooltips, Twitch status and anything else: never cached, passed straight through. */
const VERSION = 'fp-v1';
const PAGE_CACHE = VERSION + '-pages';
const ASSET_CACHE = VERSION + '-assets';
const DATA_CACHE = VERSION + '-data';
const PRECACHE = ['/', '/manifest.webmanifest', '/WandTrackerSite.png', '/PriestClassIcon.png', '/Discipline.png', '/Holy.png', '/Shadow.png', '/ForeverPriestsFav.png'];
const ASSET_HOSTS = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'wow.zamimg.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(PAGE_CACHE).then(c => c.addAll(PRECACHE)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(req, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(fallbackUrl || req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(fallbackUrl || req)) || (await caches.match('/')) || Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(req);
  const fresh = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => hit);
  return hit || fresh;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Every page address (/, /pvp, /articles/...) is the same app page.
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    e.respondWith(networkFirst(req, PAGE_CACHE, '/'));
    return;
  }
  // Articles (GitHub, jsDelivr or this site).
  if (url.pathname.endsWith('/articles.json')) {
    const key = url.origin + url.pathname;
    e.respondWith(networkFirst(req, DATA_CACHE, key));
    return;
  }
  // This site's images and files, plus fonts, icons and styles.
  if ((url.origin === self.location.origin && /\.(png|jpe?g|webp|gif|svg|ico|webmanifest)$/i.test(url.pathname)) || ASSET_HOSTS.includes(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }
  // Everything else (Wowhead tooltips, Twitch, newsletter...) goes straight to the internet.
});