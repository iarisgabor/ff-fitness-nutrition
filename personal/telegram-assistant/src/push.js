// Web Push: cum ajunge o notificare pe telefon când Worker-ul vrea, fără ca aplicația să fie
// deschisă. Serviciul de push al telefonului (Google, la Android) livrează, iar service
// worker-ul din PWA o afișează.
//
// DECIZIE: trimitem notificări **fără conținut**.
//
// Standardul permite și trimiterea textului odată cu notificarea, dar atunci textul trebuie
// criptat end-to-end (RFC 8291: ECDH cu cheia browserului, HKDF, AES-GCM) — cod dens, ușor de
// greșit într-un fel care eșuează tăcut. Fără conținut, e nevoie doar de o semnătură VAPID, iar
// service worker-ul cere textul de la Worker când primește semnalul. Un drum în plus la
// livrare, în schimbul unei bucăți de criptografie pe care n-o putem verifica ușor.

const b64url = (buffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

function base64urlToBytes(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

// Cheia privată VAPID e doar scalarul `d`; pentru import avem nevoie și de punctul public,
// pe care îl despicăm din cheia publică (0x04 || x || y).
async function importVapidKey(env) {
  const priv = (env.VAPID_PRIVATE_KEY || '').trim();
  const pub = (env.VAPID_PUBLIC_KEY || '').trim();
  if (!priv || !pub) {
    const err = new Error('Cheile VAPID lipsesc');
    err.code = 'PUSH_NOT_CONFIGURED';
    throw err;
  }

  const rawPub = base64urlToBytes(pub);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: priv,
    x: b64url(rawPub.slice(1, 33)),
    y: b64url(rawPub.slice(33, 65)),
    ext: true,
  };

  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);
}

// JWT-ul VAPID: dovedește serviciului de push (Google/Mozilla) că trimiterea vine de la
// proprietarul cheii pe care browserul a acceptat-o la abonare. `aud` trebuie să fie ORIGINEA
// endpoint-ului, nu tot URL-ul — altfel e respins cu 401.
async function buildVapidHeader(env, endpoint) {
  const key = await importVapidKey(env);
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // maximum acceptat: 24h

  const header = b64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64url(
    new TextEncoder().encode(
      JSON.stringify({ aud, exp, sub: `mailto:${(env.VAPID_SUBJECT || 'nobody@example.com').trim()}` })
    )
  );

  const semnatura = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(`${header}.${payload}`)
  );

  const jwt = `${header}.${payload}.${b64url(semnatura)}`;
  return `vapid t=${jwt}, k=${(env.VAPID_PUBLIC_KEY || '').trim()}`;
}

// Trimite semnalul. Întoarce { ok, status } — `410 Gone` sau `404` înseamnă că abonamentul nu
// mai e valid (aplicația dezinstalată, permisiune retrasă) și trebuie șters, nu reîncercat.
export async function sendPush(env, subscription) {
  const authorization = await buildVapidHeader(env, subscription.endpoint);

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      TTL: '86400', // o zi: dacă telefonul e închis, notificarea îl așteaptă
      'Content-Length': '0',
      Urgency: 'high',
    },
  });

  if (!res.ok) {
    const corp = await res.text().catch(() => '');
    console.error('PUSH_FAILED', res.status, corp.slice(0, 200));
  }

  return { ok: res.ok, status: res.status, expirat: res.status === 404 || res.status === 410 };
}
