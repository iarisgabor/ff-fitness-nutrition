// API-ul aplicației Android native: aceleași date ca paginile, ca JSON.
//
// GET /api/app/<calea paginii> întoarce { user, data }, unde `data` e EXACT obiectul pe care
// pagina îl primește ca PAYLOAD (vezi build…Payload din render.js) — testul tests/api-app.mjs
// verifică asta pe fiecare rută. Permisiunile sunt aceleași ca în index.js, dar răspunsul e
// 403 JSON în loc de redirect. Scrierile nu au rute separate: aplicația folosește direct
// /api/program…, /api/resurse…, /api/conturi…, /api/parola.

import { attemptLogin, createSession, destroySession, isSameOrigin, publicUser } from './session.js';
import {
  buildHomePayload, buildDaysListPayload, buildDayPayload, buildCategoriesIndexPayload,
  buildCategoryDetailPayload, buildPreachersIndexPayload, buildPreacherDetailPayload, buildMePayload,
  buildProgramListPayload, buildProgramEditPayload, buildAccountsPayload, preacherDates,
} from './render.js';
import { slugToDate } from './transform.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const FORBIDDEN = 'Nu ai acces la această pagină.';

// Public (înainte de verificarea sesiunii). Aceeași limită de încercări ca /login.
export async function handleAppLogin(request, env) {
  if (request.method !== 'POST') return json({ error: 'Metodă nepermisă.' }, 405);
  if (!isSameOrigin(request)) return json({ error: 'Cerere respinsă.' }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cerere invalidă.' }, 400);
  }
  const result = await attemptLogin(env, request, String(body?.username || ''), String(body?.password || ''));
  if (result.error) return json({ error: result.error }, 401);
  const token = await createSession(env, result.user);
  return json({ token, user: publicUser(result.user) });
}

export async function handleAppApi(request, env, ctx, user, path) {
  const sub = path.slice('/api/app'.length) || '/';

  if (sub === '/logout') {
    if (request.method !== 'POST') return json({ error: 'Metodă nepermisă.' }, 405);
    await destroySession(env, request);
    return json({ ok: true });
  }
  if (request.method !== 'GET') return json({ error: 'Metodă nepermisă.' }, 405);

  const isAdmin = user.role === 'admin';
  const reply = (data, missing = 'Pagina nu există.') =>
    data === null ? json({ error: missing }, 404) : json({ user: publicUser(user), data });

  if (sub === '/sesiune') return json({ user: publicUser(user) });

  // ---- Program duminică (ambele roluri; permisiunile fine sunt în program.js) ----
  if (sub === '/program') {
    if (!env.DB) return json({ error: 'Programul de duminică nu e activat încă.' }, 503);
    return reply(await buildProgramListPayload(env, ctx, user));
  }
  const programMatch = sub.match(/^\/program\/(\d{4}-\d{2}-\d{2})$/);
  if (programMatch) {
    return reply(await buildProgramEditPayload(env, ctx, user, programMatch[1]), 'Nu există program pentru această dată.');
  }

  // ---- predicator ----
  if (sub === '/eu') {
    if (isAdmin) return json({ error: FORBIDDEN }, 403);
    return reply(await buildMePayload(env, ctx, user));
  }

  // ---- admin ----
  if (sub === '/admin/conturi') {
    if (!isAdmin) return json({ error: FORBIDDEN }, 403);
    return reply(await buildAccountsPayload(env, ctx));
  }

  // ---- Analiză: tot pentru admin; predicatorul vede doar feedback-ul duminicilor lui ----
  const dayMatch = sub.match(/^\/zile\/([0-9]{4}-[0-9]{2}-[0-9]{2})$/);
  if (!isAdmin) {
    const ownDay = dayMatch && (await preacherDates(env, ctx, user.preacherName)).has(slugToDate(dayMatch[1]));
    if (!ownDay) return json({ error: FORBIDDEN }, 403);
  }

  if (sub === '/') return reply(await buildHomePayload(env, ctx));
  if (sub === '/zile') return reply(await buildDaysListPayload(env, ctx));
  if (dayMatch) return reply(await buildDayPayload(env, ctx, dayMatch[1], user), 'Nicio duminică găsită la această dată.');
  if (sub === '/categorii') return reply(await buildCategoriesIndexPayload(env, ctx));
  const categoryMatch = sub.match(/^\/categorii\/([a-z0-9]+)$/);
  if (categoryMatch) return reply(await buildCategoryDetailPayload(env, ctx, categoryMatch[1]), 'Categoria nu există.');
  if (sub === '/predicatori') return reply(await buildPreachersIndexPayload(env, ctx));
  const preacherMatch = sub.match(/^\/predicatori\/([a-z0-9-]+)$/);
  if (preacherMatch) return reply(await buildPreacherDetailPayload(env, ctx, preacherMatch[1]), 'Predicatorul nu a fost găsit.');

  return json({ error: 'Pagina nu există.' }, 404);
}
