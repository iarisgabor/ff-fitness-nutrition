// Conturile predicatorilor (D1, tabelul `users`) — create și administrate doar de
// contul general din /admin/conturi. Predicatorul își poate schimba singur parola.

import { hashPassword, adminUsername, attemptLogin } from './session.js';

const USERNAME_RE = /^[A-Za-z0-9._-]{3,40}$/;
const MIN_PASSWORD = 8;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
function fail(status, message) {
  return json({ error: message }, status);
}
function str(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

export async function listAccounts(env) {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(
    'SELECT id, username, display_name, preacher_name, created_at FROM users ORDER BY display_name COLLATE NOCASE'
  ).all();
  return results;
}

async function createAccount(env, body) {
  const username = str(body.username, 40);
  const preacherName = str(body.preacher_name, 100);
  const displayName = str(body.display_name, 100) || preacherName;
  const password = String(body.password || '');
  if (!USERNAME_RE.test(username)) return fail(400, 'Numele de utilizator: 3–40 caractere, doar litere, cifre, punct, cratimă.');
  if (username.toLowerCase() === adminUsername(env).toLowerCase()) return fail(400, 'Acest nume e rezervat contului general.');
  if (!preacherName) return fail(400, 'Alege predicatorul din calendar.');
  if (password.length < MIN_PASSWORD) return fail(400, `Parola trebuie să aibă cel puțin ${MIN_PASSWORD} caractere.`);

  const exists = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (exists) return fail(409, 'Există deja un cont cu acest nume de utilizator.');

  const { hash, salt } = await hashPassword(password);
  await env.DB.prepare(
    'INSERT INTO users (username, display_name, preacher_name, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)'
  ).bind(username, displayName, preacherName, hash, salt).run();
  return json({ accounts: await listAccounts(env) }, 201);
}

async function updateAccount(env, id, body) {
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!row) return fail(404, 'Contul nu există.');
  const stmts = [];
  if (body.password !== undefined) {
    const password = String(body.password || '');
    if (password.length < MIN_PASSWORD) return fail(400, `Parola trebuie să aibă cel puțin ${MIN_PASSWORD} caractere.`);
    const { hash, salt } = await hashPassword(password);
    // session_gen + 1 -> predicatorul e delogat de peste tot
    stmts.push(env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, session_gen = session_gen + 1 WHERE id = ?').bind(hash, salt, id));
  }
  if (body.display_name !== undefined || body.preacher_name !== undefined) {
    const displayName = str(body.display_name ?? row.display_name, 100) || row.display_name;
    const preacherName = str(body.preacher_name ?? row.preacher_name, 100) || row.preacher_name;
    stmts.push(env.DB.prepare('UPDATE users SET display_name = ?, preacher_name = ? WHERE id = ?').bind(displayName, preacherName, id));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ accounts: await listAccounts(env) });
}

async function deleteAccount(env, id) {
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return json({ accounts: await listAccounts(env) });
}

// Predicatorul își schimbă singur parola (are nevoie de cea curentă).
async function changeOwnPassword(env, request, user, body) {
  if (user.role !== 'preacher') return fail(400, 'Parola contului general se schimbă din configurare (ADMIN_PASSWORD_HASH în wrangler.toml sau secretul ADMIN_PASSWORD).');
  const check = await attemptLogin(env, request, user.username, String(body.current || ''));
  if (!check.user) return fail(403, 'Parola curentă e greșită.');
  const password = String(body.password || '');
  if (password.length < MIN_PASSWORD) return fail(400, `Parola nouă trebuie să aibă cel puțin ${MIN_PASSWORD} caractere.`);
  const { hash, salt } = await hashPassword(password);
  // Nu creștem session_gen aici — ar deloga și sesiunea curentă, din care tocmai s-a schimbat parola.
  await env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').bind(hash, salt, user.id).run();
  return json({ ok: true });
}

export async function handleAccountsApi(request, env, user, path) {
  if (!env.DB) return fail(503, 'Baza de date (D1) nu e configurată.');
  const body = request.method === 'GET' || request.method === 'DELETE' ? {} : await request.json().catch(() => ({}));

  if (path === '/api/parola' && request.method === 'POST') return changeOwnPassword(env, request, user, body);

  if (user.role !== 'admin') return fail(403, 'Doar contul general administrează conturile.');
  if (path === '/api/conturi' && request.method === 'GET') return json({ accounts: await listAccounts(env) });
  if (path === '/api/conturi' && request.method === 'POST') return createAccount(env, body);
  const m = path.match(/^\/api\/conturi\/(\d+)$/);
  if (m && request.method === 'PATCH') return updateAccount(env, Number(m[1]), body);
  if (m && request.method === 'DELETE') return deleteAccount(env, Number(m[1]));
  return fail(404, 'Rută necunoscută.');
}
