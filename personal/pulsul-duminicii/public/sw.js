// Service worker — Pulsul Duminicii.
//
// Ce face, și doar atât:
// 1. Fonturile, iconițele și pagina offline stau în cache (se schimbă rar; STATIC_VERSION
//    se crește când se schimbă lista de mai jos).
// 2. Paginile: ÎNTÂI REȚEAUA, mereu. Cât timp e conexiune, vezi exact ce trimite serverul
//    — cache-ul nu servește niciodată o pagină veche. Fiecare pagină primită cu succes se
//    salvează pe dispozitiv; fără semnal (duminică dimineața, în sală) se arată ultima
//    versiune salvată, cu o bandă „offline — salvată la HH:MM".
// 3. Paginile conțin nume și reflecții personale, deci copiile salvate se ȘTERG la
//    Ieșire și ori de câte ori se ajunge la /login (sesiune expirată, parolă resetată) —
//    pe un telefon împrumutat nu rămâne nimic al altcuiva.
//
// Nu atinge niciodată /api/… și /resurse/… (modificări și descărcări merg direct la
// server) și nu salvează /login, /logout, /cont, /admin/… .

const STATIC_VERSION = 'v1';
const STATIC_CACHE = `puls-static-${STATIC_VERSION}`;
const PAGES_CACHE = 'puls-pages';
const MAX_PAGES = 40;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [
  OFFLINE_URL,
  '/favicon.svg',
  '/icons/icon-192.png',
  '/fonts/manrope-latin.woff2', '/fonts/manrope-ro.woff2',
  '/fonts/sora-latin.woff2', '/fonts/sora-ro.woff2',
  '/fonts/plex-mono-500-latin.woff2', '/fonts/plex-mono-500-ro.woff2',
  '/fonts/plex-mono-600-latin.woff2', '/fonts/plex-mono-600-ro.woff2',
];
const NEVER_SAVE = /^\/(login|logout|cont|admin)(\/|$)/;
const PASS_THROUGH = /^\/(api|resurse)\//;
const STATIC_PATH = /^\/(fonts|icons)\/|^\/favicon\.svg$|^\/manifest\.webmanifest$/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('puls-static-') && k !== STATIC_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || PASS_THROUGH.test(url.pathname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigation(event, req, url));
    return;
  }
  if (STATIC_PATH.test(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});

async function handleNavigation(event, req, url) {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/logout' || path === '/login') await caches.delete(PAGES_CACHE);

  try {
    const res = await fetch(req);
    // doar pagini primite direct (nu redirecționări) și care au voie să fie salvate
    if (res.ok && res.type === 'basic' && !NEVER_SAVE.test(path) && (res.headers.get('content-type') || '').includes('text/html')) {
      event.waitUntil(savePage(url, res.clone())); // salvarea continuă și după ce pagina a fost trimisă
    }
    return res;
  } catch (err) {
    const saved = await findSaved(url, path);
    if (saved) return markOffline(saved);
    return (await caches.match(OFFLINE_URL)) || new Response('Ești offline.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
}

async function savePage(url, res) {
  const cache = await caches.open(PAGES_CACHE);
  const headers = new Headers(res.headers);
  // corpul se salvează decomprimat (res.text()), deci antetele de transport nu mai sunt valabile
  ['content-encoding', 'content-length', 'transfer-encoding'].forEach((h) => headers.delete(h));
  headers.set('x-puls-saved-at', new Date().toISOString());
  await cache.put(pageKey(url), new Response(await res.text(), { status: 200, headers }));
  const keys = await cache.keys();
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(old);
}

function pageKey(url) {
  return url.origin + url.pathname + url.search;
}

async function findSaved(url, path) {
  const cache = await caches.open(PAGES_CACHE);
  const hit = await cache.match(pageKey(url));
  if (hit || path !== '/') return hit;
  // „/" (adresa de pornire a aplicației) e o redirecționare pentru predicatori → /eu
  return (await cache.match(url.origin + '/eu')) || (await cache.match(url.origin + '/program'));
}

// Pagina salvată primește o notă (ora salvării), din care shared.txt face banda offline.
async function markOffline(res) {
  const savedAt = res.headers.get('x-puls-saved-at') || '';
  const html = (await res.text()).replace('</head>', () => `<script>window.PULS_SAVED_AT=${JSON.stringify(savedAt)};</script></head>`);
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
