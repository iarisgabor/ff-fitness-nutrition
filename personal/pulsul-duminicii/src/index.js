import { authenticate } from './auth.js';
import { attemptLogin, createSession, destroySession, sessionCookie, clearSessionCookie, isSameOrigin } from './session.js';
import {
  renderHome, renderDaysList, renderDay, renderCategoriesIndex, renderCategoryDetail,
  renderPreachersIndex, renderPreacherDetail, renderMe, renderLogin, renderProgramList,
  renderProgramEdit, renderAccounts, preacherDates, refreshPayloadCache,
} from './render.js';
import { handleProgramApi, serveResource } from './program.js';
import { handleAccountsApi } from './accounts.js';
import { slugToDate } from './transform.js';

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'x-robots-tag': 'noindex, nofollow', // link neafișat public — nu trebuie indexat
  'cache-control': 'private, no-store', // pagini per utilizator — nimic în cache-uri intermediare
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
};

function html(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: { ...HTML_HEADERS, ...extra } });
}
function text(body, status) {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
function redirect(location, extra = {}) {
  return new Response(null, { status: 303, headers: { location, ...extra } });
}
function homeFor(user) {
  return user?.role === 'preacher' ? '/eu' : '/';
}
// Doar căi relative din propriul site — altfel ?next= ar fi un open redirect.
function safeNext(next) {
  return typeof next === 'string' && /^\/(?![\/\\])/.test(next) ? next : null;
}

async function handleLogin(request, env, url, user) {
  if (request.method === 'GET') {
    if (user) return redirect(homeFor(user));
    return html(renderLogin({ next: safeNext(url.searchParams.get('next')) || '' }, null));
  }
  if (request.method !== 'POST') return text('Metodă nepermisă.', 405);
  if (!isSameOrigin(request)) return text('Cerere respinsă.', 403);

  const form = await request.formData();
  const username = String(form.get('username') || '');
  const next = safeNext(String(form.get('next') || ''));
  const result = await attemptLogin(env, request, username, String(form.get('password') || ''));
  if (result.error) {
    return html(renderLogin({ error: result.error, next: next || '', username }, null), 401);
  }
  const token = await createSession(env, result.user);
  const target = next && (result.user.role === 'admin' || !isAnalysisPath(next)) ? next : homeFor(result.user);
  return redirect(target, { 'set-cookie': sessionCookie(token) });
}

function isAnalysisPath(path) {
  return path === '/' || /^\/(zile|categorii|predicatori)(\/|$)/.test(path);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const accountsMode = (env.AUTH_MODE || 'accounts') === 'accounts';

    const auth = await authenticate(request, env);
    if (auth.response) return auth.response;
    const user = auth.user;

    try {
      // ---- rute publice (doar în modul cu conturi) ----
      if (accountsMode && path === '/login') return await handleLogin(request, env, url, user);
      if (accountsMode && path === '/logout') {
        await destroySession(env, request);
        return redirect('/login', { 'set-cookie': clearSessionCookie() });
      }

      if (!user) {
        if (path.startsWith('/api/')) return new Response(JSON.stringify({ error: 'Sesiunea a expirat — autentifică-te din nou.' }), { status: 401, headers: { 'content-type': 'application/json; charset=utf-8' } });
        return redirect(`/login?next=${encodeURIComponent(path + url.search)}`);
      }

      // Tot ce modifică date trebuie să vină din propriul site (CSRF).
      if (!['GET', 'HEAD'].includes(request.method) && !isSameOrigin(request)) {
        return text('Cerere respinsă.', 403);
      }

      const isAdmin = user.role === 'admin';

      // ---- API ----
      if (path.startsWith('/api/program') || path.startsWith('/api/resurse')) {
        return await handleProgramApi(request, env, user, path, url);
      }
      if (path.startsWith('/api/conturi') || path === '/api/parola') {
        return await handleAccountsApi(request, env, user, path);
      }
      const resourceMatch = path.match(/^\/resurse\/(\d+)$/);
      if (resourceMatch) {
        if (!env.DB) return text('Baza de date nu e configurată.', 503);
        return await serveResource(env, user, Number(resourceMatch[1]));
      }

      // ---- Program duminică (ambele roluri) ----
      if (path === '/program') {
        if (!env.DB) return text('Programul de duminică nu e activat încă (lipsește baza de date D1 — vezi README).', 503);
        return html(await renderProgramList(env, ctx, user));
      }
      const programMatch = path.match(/^\/program\/(\d{4}-\d{2}-\d{2})$/);
      if (programMatch) {
        const body = await renderProgramEdit(env, ctx, user, programMatch[1]);
        return body === null ? text('Nu există program pentru această dată.', 404) : html(body);
      }

      // ---- predicator ----
      if (path === '/eu') {
        if (isAdmin) return redirect('/predicatori');
        return html(await renderMe(env, ctx, user));
      }
      if (path === '/cont') {
        if (isAdmin) return redirect('/');
        return html(renderLogin({ mode: 'password' }, user));
      }

      // ---- admin ----
      if (path === '/admin/conturi') {
        if (!isAdmin) return redirect(homeFor(user));
        return html(await renderAccounts(env, ctx, user));
      }

      // ---- Analiză: tot pentru admin; predicatorul vede doar feedback-ul duminicilor lui ----
      const dayMatch = path.match(/^\/zile\/([0-9]{4}-[0-9]{2}-[0-9]{2})$/);
      if (!isAdmin) {
        const ownDay = dayMatch && (await preacherDates(env, ctx, user.preacherName)).has(slugToDate(dayMatch[1]));
        if (!ownDay) return redirect('/eu');
      }

      if (path === '/') {
        return html(await renderHome(env, ctx, user));
      }
      if (path === '/zile') {
        return html(await renderDaysList(env, ctx, user));
      }
      if (dayMatch) {
        const body = await renderDay(env, ctx, dayMatch[1], user);
        return body === null ? text('Nicio duminică găsită la această dată.', 404) : html(body);
      }
      if (path === '/categorii') {
        return html(await renderCategoriesIndex(env, ctx, user));
      }
      const categoryMatch = path.match(/^\/categorii\/([a-z0-9]+)$/);
      if (categoryMatch) {
        const body = await renderCategoryDetail(env, ctx, categoryMatch[1], user);
        return body === null ? text('Categoria nu există.', 404) : html(body);
      }
      if (path === '/predicatori') {
        return html(await renderPreachersIndex(env, ctx, user));
      }
      const preacherMatch = path.match(/^\/predicatori\/([a-z0-9-]+)$/);
      if (preacherMatch) {
        const body = await renderPreacherDetail(env, ctx, preacherMatch[1], user);
        return body === null ? text('Predicatorul nu a fost găsit.', 404) : html(body);
      }
      return text('Pagina nu există.', 404);
    } catch (err) {
      console.error(err);
      return text(
        'Nu am putut încărca datele momentan și nu există nicio versiune anterioară salvată. Încearcă din nou în câteva minute.',
        503,
      );
    }
  },

  // Neactivat implicit (fără [triggers.crons] în wrangler.toml). Dacă la un
  // moment dat vreți pre-încălzire înainte de întâlnirea de luni, adăugați un
  // cron trigger — restul funcționează neschimbat, doar re-scrie același cache.
  async scheduled(_event, env, _ctx) {
    await refreshPayloadCache(env);
  },
};
