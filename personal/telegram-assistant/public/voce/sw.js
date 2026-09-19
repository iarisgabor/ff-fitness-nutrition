// Service worker minimal — există ca aplicația să se poată instala pe ecranul principal și să
// se deschidă instant. NU stochează nimic din conversație; pune în cache doar coaja paginii.
//
// Ridică VERSIUNE la fiecare schimbare din public/voce/, altfel telefonul rămâne cu varianta veche.

const VERSIUNE = 'voce-v17';
const COAJA = [
  './',
  './index.html',
  './app.js',
  './capture-worklet.js',
  './orb.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
  './icon-192.png',
  './icon-512.png',
  './badge-96.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSIUNE).then((cache) => cache.addAll(COAJA)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chei) => Promise.all(chei.filter((c) => c !== VERSIUNE).map((c) => caches.delete(c))))
  );
  self.clients.claim();
});

// ─── Notificări ──────────────────────────────────────────────────────────────────────────
//
// Semnalul de push vine GOL, intenționat (vezi src/push.js): textul nu călătorește cu el, ci
// se cere aici. Așa evităm criptarea end-to-end a conținutului, în schimbul unui drum în plus.
// Dacă cererea eșuează, tot afișăm o notificare generică — Android cere obligatoriu să afișezi
// ceva la fiecare push primit, altfel îți retrage dreptul de a mai trimite.

const TOKEN_CACHE = 'voce-token';

async function ceruteDeAfisat() {
  try {
    const cache = await caches.open(TOKEN_CACHE);
    const raspuns = await cache.match('token');
    const token = raspuns ? await raspuns.text() : '';
    if (!token) return null;

    const res = await fetch(`/voice-push/pending?token=${encodeURIComponent(token)}`, {
      method: 'POST',
    });
    if (!res.ok) return null;
    const date = await res.json();
    return date && date.text ? date : null;
  } catch {
    return null;
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    ceruteDeAfisat().then((date) =>
      self.registration.showNotification(date?.titlu || 'Jarvis', {
        body: date?.text || 'Te caut. Deschide ca să vorbim.',
        //  = poza mare din notificare (color).  = silueta din bara de stare, unde
        // Android păstrează DOAR canalul alfa — o imagine cu fundal iese ca un pătrat gri.
        icon: './icon-192.png',
        badge: './badge-96.png',
        tag: 'asistent', // una singură pe ecran: o notificare nouă o înlocuiește pe cea veche
        renotify: true,
        vibrate: [200, 100, 200],
        data: { url: './' },
      })
    )
  );
});

// Apăsare: aducem în față fereastra deja deschisă, dacă există, în loc să deschidem încă una.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ferestre) => {
      for (const fereastra of ferestre) {
        if (fereastra.url.includes('/voce/') && 'focus' in fereastra) return fereastra.focus();
      }
      return self.clients.openWindow('./');
    })
  );
});

// Rutele Worker-ului. Răspunsurile lor NU au voie în cache: tokenul de acces călătorește în
// adresă (pagina nu poate pune headere pe un WebSocket, iar restul rutelor au urmat aceeași
// formă), deci cheia de cache ar conține chiar cheia de acces, salvată pe disc. Iar `/voice-history`
// întoarce conversație — exact ce promite comentariul din capul fișierului că nu se stochează.
//
// Lista crește odată cu src/index.js. Excepția veche pentru `/voice-ws` n-a fost niciodată o
// regulă, ci un petic: handler-ul de mai jos prindea ORICE GET.
const RUTE_SERVER = [
  '/voice-ws',
  '/voice-history',
  '/voice-listen',
  '/voice-push/',
  '/whatsapp/',
  '/spotify/',
  '/internal/',
  '/telegram-webhook',
];

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  // În aplicația nativă pagina e servită la https://localhost, deci TOT ce merge spre Worker e
  // cross-origin. ATENȚIE la soluția care pare evidentă: o listă albă pe `/voce/` ar dezactiva
  // cache-ul complet în APK, fiindcă acolo coaja e servită din RĂDĂCINA lui localhost
  // (`webDir: "../public/voce"` din capacitor.config.json).
  if (url.origin !== self.location.origin) return;

  if (RUTE_SERVER.some((cale) => url.pathname.startsWith(cale))) return;

  // Rețeaua întâi (ca o modificare să se vadă imediat), cache doar ca plasă de siguranță.
  event.respondWith(
    fetch(event.request)
      .then((raspuns) => {
        const copie = raspuns.clone();
        caches.open(VERSIUNE).then((cache) => cache.put(event.request, copie)).catch(() => {});
        return raspuns;
      })
      .catch(() => caches.match(event.request))
  );
});
