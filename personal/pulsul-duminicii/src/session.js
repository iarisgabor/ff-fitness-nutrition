// Parole, sesiuni și limitarea încercărilor de login — tot ce ține de identitate,
// fără nicio dependență (doar crypto.subtle + KV + D1).
//
// Două tipuri de utilizator:
//   admin    — contul general (ADMIN_USERNAME, implicit "BisericaLogos"). Parola vine
//              fie din secretul ADMIN_PASSWORD, fie ca hash din ADMIN_PASSWORD_HASH
//              (wrangler.toml). Nu există în D1, intenționat.
//   preacher — rând în tabelul `users` din D1, creat de admin din /admin/conturi.

const SESSION_TTL_SECONDS = 30 * 24 * 3600;
const COOKIE_NAME = 'puls_session';
const LOGIN_FAIL_LIMIT = 10;
const LOGIN_LOCK_SECONDS = 15 * 60;
// 100k e plafonul PBKDF2 acceptat de Workers (peste asta crypto.subtle aruncă).
const PBKDF2_ITERATIONS = 100000;

const enc = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function randomHex(bytes) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

// Comparație în timp constant: comparăm SHA-256 ale celor două valori, ca lungimile
// să fie mereu egale și să nu scape nimic prin durată.
async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b))),
  ]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function hashPassword(password, saltHex = randomHex(16), iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations },
    key, 256,
  );
  return { hash: toHex(bits), salt: saltHex };
}

async function verifyPassword(password, hash, salt) {
  const computed = await hashPassword(password, salt);
  return safeEqual(computed.hash, hash);
}

// Parola contului general: secretul ADMIN_PASSWORD are prioritate; altfel
// ADMIN_PASSWORD_HASH = "pbkdf2$<iterații>$<salt hex>$<hash hex>" (generat cu
// scripts/admin-password.mjs). Hash-ul poate sta public în wrangler.toml doar
// pentru că parola generată e aleatoare și lungă — nu pune acolo o parolă aleasă de mână.
async function checkAdminPassword(env, password) {
  if (env.ADMIN_PASSWORD) return safeEqual(password, env.ADMIN_PASSWORD);
  const m = /^pbkdf2\$(\d+)\$([0-9a-f]{32})\$([0-9a-f]{64})$/.exec(env.ADMIN_PASSWORD_HASH || '');
  if (!m) return false;
  const { hash } = await hashPassword(String(password || ''), m[2], Number(m[1]));
  return safeEqual(hash, m[3]);
}

// Amprenta parolei de admin, ținută în sesiune: dacă se schimbă parola (secretul sau
// hash-ul), toate sesiunile de admin vechi devin invalide automat.
async function adminFingerprint(env) {
  const source = env.ADMIN_PASSWORD || env.ADMIN_PASSWORD_HASH || '';
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode('puls-admin:' + source))).slice(0, 16);
}

export function adminUsername(env) {
  return env.ADMIN_USERNAME || 'BisericaLogos';
}

// ---- login ----

// Întoarce { user } la succes, { error } altfel. `user` e forma ținută în sesiune.
export async function attemptLogin(env, request, username, password) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const failKey = `login_fail:${ip}`;
  const fails = Number(await env.PULSUL_KV.get(failKey)) || 0;
  if (fails >= LOGIN_FAIL_LIMIT) {
    return { error: 'Prea multe încercări greșite. Încearcă din nou peste 15 minute.' };
  }

  const name = String(username || '').trim();
  let user = null;

  if (name.toLowerCase() === adminUsername(env).toLowerCase()) {
    if (await checkAdminPassword(env, password)) {
      user = { role: 'admin', username: adminUsername(env), displayName: adminUsername(env), fp: await adminFingerprint(env) };
    }
  } else if (env.DB && name) {
    const row = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(name).first();
    if (row && await verifyPassword(String(password || ''), row.password_hash, row.password_salt)) {
      user = {
        role: 'preacher', id: row.id, username: row.username, displayName: row.display_name,
        preacherName: row.preacher_name, gen: row.session_gen,
      };
    }
  }

  if (!user) {
    await env.PULSUL_KV.put(failKey, String(fails + 1), { expirationTtl: LOGIN_LOCK_SECONDS });
    return { error: 'Utilizator sau parolă greșită.' };
  }
  return { user };
}

// ---- sesiuni ----

export async function createSession(env, user) {
  const token = randomHex(32);
  await env.PULSUL_KV.put(`session:${token}`, JSON.stringify(user), { expirationTtl: SESSION_TTL_SECONDS });
  return token;
}

function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

// Aplicația nativă trimite același token ca `Authorization: Bearer`; browserul, prin cookie.
function readToken(request) {
  const bearer = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('Authorization') || '');
  const token = bearer ? bearer[1] : readCookie(request, COOKIE_NAME);
  return token && /^[0-9a-f]{64}$/.test(token) ? token : null;
}

// Sesiunea curentă sau null. Pentru predicatori re-verifică în D1 că, între timp,
// contul n-a fost șters și parola n-a fost resetată (session_gen) — un singur SELECT
// pe cheie primară, ieftin.
export async function getSession(env, request) {
  const token = readToken(request);
  if (!token) return null;
  const user = await env.PULSUL_KV.get(`session:${token}`, 'json');
  if (!user) return null;

  if (user.role === 'admin') {
    return user.fp === await adminFingerprint(env) ? { ...user, token } : null;
  }
  if (user.role === 'preacher' && env.DB) {
    const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
    if (!row || row.session_gen !== user.gen) return null;
    return {
      ...user, token,
      username: row.username, displayName: row.display_name, preacherName: row.preacher_name,
    };
  }
  return null;
}

export async function destroySession(env, request) {
  const token = readToken(request);
  if (token) await env.PULSUL_KV.delete(`session:${token}`);
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}
export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// Cererile care modifică date trebuie să vină din propriul site (apărare CSRF,
// pe lângă SameSite=Lax). Browserele trimit mereu Origin la POST/PATCH/DELETE.
export function isSameOrigin(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin) return origin === url.origin;
  return request.headers.get('Sec-Fetch-Site') === 'same-origin';
}

// Forma trimisă în pagină (fără token, fără amprente interne).
export function publicUser(user) {
  if (!user) return null;
  return {
    role: user.role,
    username: user.username,
    displayName: user.displayName,
    preacherName: user.preacherName || null,
    legacy: !!user.legacy,
  };
}
