import { checkAccess } from './auth.js';
import { renderHome, renderDaysList, renderDay, renderCategoriesIndex, renderCategoryDetail, refreshPayloadCache } from './render.js';

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'x-robots-tag': 'noindex, nofollow', // link neafișat public — nu trebuie indexat
};

export default {
  async fetch(request, env, ctx) {
    const denied = checkAccess(request, env);
    if (denied) return denied;

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (path === '/') {
        return new Response(await renderHome(env, ctx), { headers: HTML_HEADERS });
      }
      if (path === '/zile') {
        return new Response(await renderDaysList(env, ctx), { headers: HTML_HEADERS });
      }
      const dayMatch = path.match(/^\/zile\/([0-9]{4}-[0-9]{2}-[0-9]{2})$/);
      if (dayMatch) {
        const html = await renderDay(env, ctx, dayMatch[1]);
        if (html === null) {
          return new Response('Nicio duminică găsită la această dată.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
        }
        return new Response(html, { headers: HTML_HEADERS });
      }
      if (path === '/categorii') {
        return new Response(await renderCategoriesIndex(env, ctx), { headers: HTML_HEADERS });
      }
      const categoryMatch = path.match(/^\/categorii\/([a-z0-9]+)$/);
      if (categoryMatch) {
        const html = await renderCategoryDetail(env, ctx, categoryMatch[1]);
        if (html === null) {
          return new Response('Categoria nu există.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
        }
        return new Response(html, { headers: HTML_HEADERS });
      }
      return new Response('Pagina nu există.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    } catch (err) {
      console.error(err);
      return new Response(
        'Nu am putut încărca datele momentan și nu există nicio versiune anterioară salvată. Încearcă din nou în câteva minute.',
        { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }
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
