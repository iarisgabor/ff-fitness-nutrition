// Program duminică: acces la D1 + R2, permisiuni și API-ul JSON (/api/program/...).
// Paginile HTML propriu-zise (lista, editorul) sunt randate în render.js, care
// folosește funcțiile de citire de aici.
//
// Permisiunile se verifică AICI, pe server, la fiecare cerere — pagina doar ascunde
// butoanele pe care oricum nu le-ai putea folosi.

import { DEFAULT_PROGRAM, PREACHER_PLACEHOLDER } from './programTemplate.js';
import { preacherSlug } from './preachers.js';
import { normalizeText } from './transform.js';
import { getAttendance, attendanceForSlug } from './attendance.js';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
// Fără html/svg/js — un fișier servit de pe domeniul nostru nu are voie să poată rula cod.
const ALLOWED_EXTENSIONS = new Set([
  'ppt', 'pptx', 'key', 'odp', 'pdf', 'doc', 'docx', 'odt', 'txt', 'pro',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic',
  'mp3', 'm4a', 'wav', 'aac', 'mp4', 'mov', 'm4v',
]);
// Tipuri pe care browserul le poate arăta direct (restul se descarcă).
const INLINE_TYPES = /^(application\/pdf|image\/(jpeg|png|gif|webp)|audio\/|video\/)/;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------- utilitare

export function todayRo() {
  // 'sv-SE' formatează direct ca YYYY-MM-DD
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' });
}

function isValidDate(s) {
  if (!DATE_RE.test(s || '')) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

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

function samePerson(a, b) {
  const sa = preacherSlug(a || '');
  return sa !== '' && sa === preacherSlug(b || '');
}

function isPredicaSection(title) {
  return normalizeText(title || '').includes('predic');
}

// ---------------------------------------------------------------- citire

export async function listSundays(env) {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(`
    SELECT s.*,
      (SELECT COALESCE(SUM(length_sec), 0) FROM items i WHERE i.sunday_id = s.id AND i.kind != 'header') AS total_sec,
      (SELECT COUNT(*) FROM resources r WHERE r.sunday_id = s.id) AS resource_count
    FROM sundays s ORDER BY s.date
  `).all();
  return results;
}

async function loadRaw(env, date) {
  const sunday = await env.DB.prepare('SELECT * FROM sundays WHERE date = ?').bind(date).first();
  if (!sunday) return null;
  const [items, resources] = await Promise.all([
    env.DB.prepare('SELECT * FROM items WHERE sunday_id = ? ORDER BY position, id').bind(sunday.id).all(),
    env.DB.prepare('SELECT * FROM resources WHERE sunday_id = ? ORDER BY created_at, id').bind(sunday.id).all(),
  ]);
  const withSection = [];
  let section = '';
  for (const item of items.results) {
    if (item.kind === 'header') section = item.title;
    withSection.push({ ...item, section });
  }
  return { sunday, items: withSection, resources: resources.results };
}

// ---------------------------------------------------------------- permisiuni

function isAdmin(user) {
  return user?.role === 'admin';
}
function ownsSunday(user, sunday) {
  return user?.role === 'preacher' && samePerson(sunday.preacher_name, user.preacherName);
}

// Predicatorul vede toate duminicile următoare și, din cele trecute, doar pe ale lui.
export function canViewSunday(user, sunday) {
  if (isAdmin(user)) return true;
  if (user?.role !== 'preacher') return false;
  return sunday.date >= todayRo() || ownsSunday(user, sunday);
}

function canEditItem(user, sunday, item) {
  if (isAdmin(user)) return true;
  if (user?.role !== 'preacher' || item.kind === 'header') return false;
  if (ownsSunday(user, sunday) && isPredicaSection(item.section)) return true;
  return samePerson(item.person, user.preacherName);
}

// Predicatorul poate adăuga/șterge elemente doar în secțiunea PREDICA a duminicii lui.
function canAddAfter(user, sunday, item) {
  if (isAdmin(user)) return true;
  return ownsSunday(user, sunday) && isPredicaSection(item.section);
}
function canDeleteItem(user, sunday, item) {
  if (isAdmin(user)) return true;
  return item.kind !== 'header' && ownsSunday(user, sunday) && isPredicaSection(item.section);
}

function canAddResource(user, sunday, item) {
  if (isAdmin(user)) return true;
  if (user?.role !== 'preacher') return false;
  if (ownsSunday(user, sunday)) return true;
  return !!item && samePerson(item.person, user.preacherName);
}
function canDeleteResource(user, resource) {
  return isAdmin(user) || resource.uploaded_by === user?.username;
}

// Forma trimisă în pagină: datele + ce are voie utilizatorul curent pe fiecare rând.
export async function planPayload(env, user, date) {
  const raw = await loadRaw(env, date);
  if (!raw || !canViewSunday(user, raw.sunday)) return null;
  const { sunday, items, resources } = raw;
  const { rows: attendanceRows } = await getAttendance(env);
  const att = attendanceForSlug(attendanceRows, sunday.date);
  return {
    sunday: {
      date: sunday.date, preacher_name: sunday.preacher_name, start_time: sunday.start_time,
      attendance: att?.total ?? null, attendance_members: att?.members ?? null, attendance_guests: att?.guests ?? null,
      notes: sunday.notes,
      updated_at: sunday.updated_at, updated_by: sunday.updated_by,
    },
    items: items.map((item) => ({
      id: item.id, kind: item.kind, length_sec: item.length_sec, title: item.title,
      person: item.person, song_key: item.song_key, notes: item.notes, section: item.section,
      canEdit: canEditItem(user, sunday, item),
      canDelete: canDeleteItem(user, sunday, item),
      canAddAfter: canAddAfter(user, sunday, item),
      canAddResource: canAddResource(user, sunday, item),
    })),
    resources: resources.map((r) => ({
      id: r.id, item_id: r.item_id, kind: r.kind, name: r.name,
      url: r.kind === 'link' ? r.url : `/resurse/${r.id}`,
      size: r.size, content_type: r.content_type, uploaded_by: r.uploaded_by, created_at: r.created_at,
      canDelete: canDeleteResource(user, r),
    })),
    perms: {
      admin: isAdmin(user),
      ownSunday: ownsSunday(user, sunday),
      canAddResource: canAddResource(user, sunday, null),
      uploadsEnabled: !!env.RESURSE,
    },
    isPast: sunday.date < todayRo(),
  };
}

// ---------------------------------------------------------------- scriere

async function touch(env, sundayId, user) {
  await env.DB.prepare("UPDATE sundays SET updated_at = datetime('now'), updated_by = ? WHERE id = ?")
    .bind(user.displayName || user.username, sundayId).run();
}

async function createSunday(env, user, body) {
  if (!isAdmin(user)) return fail(403, 'Doar contul general poate crea duminici.');
  const date = str(body.date, 10);
  if (!isValidDate(date)) return fail(400, 'Dată invalidă.');
  const existing = await env.DB.prepare('SELECT id FROM sundays WHERE date = ?').bind(date).first();
  if (existing) return fail(409, 'Există deja un program pentru această dată.');

  const preacher = str(body.preacher_name, 100);
  const startTime = /^\d{2}:\d{2}$/.test(body.start_time || '') ? body.start_time : '10:00';

  // Pornește fie de la șablonul standard, fie de la o copie a altei duminici
  // (fără resurse — acelea țin de duminica lor).
  let source = DEFAULT_PROGRAM;
  if (body.from && body.from !== 'template') {
    const copy = await loadRaw(env, str(body.from, 10));
    if (!copy) return fail(400, 'Duminica de copiat nu există.');
    const oldPreacher = copy.sunday.preacher_name;
    source = copy.items.map((i) => ({
      kind: i.kind, title: i.title, length_sec: i.length_sec, song_key: i.song_key, notes: i.notes,
      person: oldPreacher && samePerson(i.person, oldPreacher) ? PREACHER_PLACEHOLDER : i.person,
    }));
  }

  const inserted = await env.DB.prepare(
    "INSERT INTO sundays (date, preacher_name, start_time, updated_at, updated_by) VALUES (?, ?, ?, datetime('now'), ?) RETURNING id"
  ).bind(date, preacher, startTime, user.displayName || user.username).first();

  const insertItem = env.DB.prepare(
    'INSERT INTO items (sunday_id, position, kind, length_sec, title, person, song_key, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  if (source.length) {
    await env.DB.batch(source.map((i, idx) => insertItem.bind(
      inserted.id, idx, i.kind, i.length_sec || 0, i.title || '',
      i.person === PREACHER_PLACEHOLDER ? preacher : (i.person || ''),
      i.song_key || '', i.notes || '',
    )));
  }
  return json(await planPayload(env, user, date), 201);
}

async function updateSunday(env, user, raw, body) {
  if (!isAdmin(user)) return fail(403, 'Doar contul general poate modifica datele duminicii.');
  const s = raw.sunday;
  const preacher = body.preacher_name !== undefined ? str(body.preacher_name, 100) : s.preacher_name;
  const startTime = body.start_time !== undefined
    ? (/^\d{2}:\d{2}$/.test(body.start_time) ? body.start_time : s.start_time)
    : s.start_time;
  const notes = body.notes !== undefined ? str(body.notes, 4000) : s.notes;

  // Dacă se schimbă predicatorul, elementele trecute pe numele vechiului predicator
  // (Predică, Cina Domnului) trec pe numele celui nou.
  const stmts = [
    env.DB.prepare('UPDATE sundays SET preacher_name = ?, start_time = ?, notes = ? WHERE id = ?')
      .bind(preacher, startTime, notes, s.id),
  ];
  if (preacher !== s.preacher_name && s.preacher_name) {
    for (const item of raw.items) {
      if (samePerson(item.person, s.preacher_name)) {
        stmts.push(env.DB.prepare('UPDATE items SET person = ? WHERE id = ?').bind(preacher, item.id));
      }
    }
  }
  await env.DB.batch(stmts);
  await touch(env, s.id, user);
  return json(await planPayload(env, user, s.date));
}

async function deleteSunday(env, user, raw) {
  if (!isAdmin(user)) return fail(403, 'Doar contul general poate șterge o duminică.');
  const keys = raw.resources.filter((r) => r.r2_key).map((r) => r.r2_key);
  if (keys.length && env.RESURSE) await env.RESURSE.delete(keys);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM resources WHERE sunday_id = ?').bind(raw.sunday.id),
    env.DB.prepare('DELETE FROM items WHERE sunday_id = ?').bind(raw.sunday.id),
    env.DB.prepare('DELETE FROM sundays WHERE id = ?').bind(raw.sunday.id),
  ]);
  return json({ ok: true });
}

function cleanItemFields(body, current) {
  const out = {};
  if (body.title !== undefined) out.title = str(body.title, 200);
  if (body.person !== undefined) out.person = str(body.person, 120);
  if (body.song_key !== undefined) out.song_key = str(body.song_key, 8);
  if (body.notes !== undefined) out.notes = str(body.notes, 4000);
  if (body.length_sec !== undefined) {
    const n = Math.round(Number(body.length_sec));
    out.length_sec = Number.isFinite(n) ? Math.min(Math.max(n, 0), 6 * 3600) : current.length_sec;
  }
  if (body.kind !== undefined && current.kind !== 'header' && (body.kind === 'song' || body.kind === 'item')) {
    out.kind = body.kind;
  }
  return out;
}

async function addItem(env, user, raw, body) {
  const kind = ['header', 'item', 'song'].includes(body.kind) ? body.kind : 'item';
  const after = body.after_id != null ? raw.items.find((i) => i.id === Number(body.after_id)) : null;
  if (body.after_id != null && !after) return fail(400, 'Elementul de referință nu există.');

  if (!isAdmin(user)) {
    if (!after || kind === 'header' || !canAddAfter(user, raw.sunday, after)) {
      return fail(403, 'Poți adăuga elemente doar în secțiunea PREDICA a duminicii tale.');
    }
  }

  const position = after ? after.position + 1 : (raw.items.length ? raw.items[raw.items.length - 1].position + 1 : 0);
  const fields = cleanItemFields(body, { length_sec: 0, kind });
  await env.DB.batch([
    env.DB.prepare('UPDATE items SET position = position + 1 WHERE sunday_id = ? AND position >= ?').bind(raw.sunday.id, position),
    env.DB.prepare('INSERT INTO items (sunday_id, position, kind, length_sec, title, person, song_key, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(raw.sunday.id, position, kind, fields.length_sec || 0, fields.title ?? (kind === 'header' ? 'SECȚIUNE NOUĂ' : ''),
        fields.person || '', fields.song_key || '', fields.notes || ''),
  ]);
  await touch(env, raw.sunday.id, user);
  return json(await planPayload(env, user, raw.sunday.date), 201);
}

async function updateItem(env, user, raw, itemId, body) {
  const item = raw.items.find((i) => i.id === itemId);
  if (!item) return fail(404, 'Elementul nu există.');
  if (!canEditItem(user, raw.sunday, item)) return fail(403, 'Nu poți modifica acest element.');
  const fields = cleanItemFields(body, item);
  const cols = Object.keys(fields);
  if (cols.length) {
    await env.DB.prepare(`UPDATE items SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .bind(...cols.map((c) => fields[c]), item.id).run();
    await touch(env, raw.sunday.id, user);
  }
  return json(await planPayload(env, user, raw.sunday.date));
}

async function deleteItem(env, user, raw, itemId) {
  const item = raw.items.find((i) => i.id === itemId);
  if (!item) return fail(404, 'Elementul nu există.');
  if (!canDeleteItem(user, raw.sunday, item)) return fail(403, 'Nu poți șterge acest element.');
  // Resursele elementului nu se pierd — trec la nivelul duminicii.
  await env.DB.batch([
    env.DB.prepare('UPDATE resources SET item_id = NULL WHERE item_id = ?').bind(item.id),
    env.DB.prepare('DELETE FROM items WHERE id = ?').bind(item.id),
  ]);
  await touch(env, raw.sunday.id, user);
  return json(await planPayload(env, user, raw.sunday.date));
}

async function reorderItems(env, user, raw, body) {
  if (!isAdmin(user)) return fail(403, 'Doar contul general poate reordona programul.');
  const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
  const current = new Set(raw.items.map((i) => i.id));
  if (ids.length !== current.size || new Set(ids).size !== ids.length || !ids.every((id) => current.has(id))) {
    return fail(400, 'Ordinea trimisă nu corespunde programului — reîncarcă pagina.');
  }
  const stmt = env.DB.prepare('UPDATE items SET position = ? WHERE id = ? AND sunday_id = ?');
  await env.DB.batch(ids.map((id, idx) => stmt.bind(idx, id, raw.sunday.id)));
  await touch(env, raw.sunday.id, user);
  return json(await planPayload(env, user, raw.sunday.date));
}

function resolveTargetItem(raw, itemParam) {
  if (itemParam == null || itemParam === '' || itemParam === 'null') return { item: null };
  const item = raw.items.find((i) => i.id === Number(itemParam));
  return item ? { item } : { error: fail(400, 'Elementul nu există.') };
}

async function uploadFile(env, user, raw, request, url) {
  if (!env.RESURSE) return fail(503, 'Încărcarea de fișiere nu e activată încă (lipsește bucket-ul R2). Poți adăuga un link între timp.');
  const { item, error } = resolveTargetItem(raw, url.searchParams.get('item'));
  if (error) return error;
  if (!canAddResource(user, raw.sunday, item)) return fail(403, 'Nu poți adăuga resurse aici.');

  const name = str(url.searchParams.get('name'), 180).replace(/[\\/\u0000-\u001f]/g, '_');
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (!name || !ALLOWED_EXTENSIONS.has(ext)) {
    return fail(415, 'Tip de fișier neacceptat. Merg: PowerPoint/Keynote, PDF, Word, imagini, audio, video.');
  }
  const size = Number(request.headers.get('content-length'));
  if (!size) return fail(411, 'Fișier gol sau dimensiune necunoscută.');
  if (size > MAX_UPLOAD_BYTES) return fail(413, 'Fișierul depășește 50 MB.');

  const contentType = str(request.headers.get('content-type'), 120) || 'application/octet-stream';
  const key = `duminici/${raw.sunday.date}/${crypto.randomUUID()}.${ext}`;
  await env.RESURSE.put(key, request.body, { httpMetadata: { contentType } });
  await env.DB.prepare(
    'INSERT INTO resources (sunday_id, item_id, kind, name, r2_key, size, content_type, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(raw.sunday.id, item ? item.id : null, 'file', name, key, size, contentType, user.username).run();
  await touch(env, raw.sunday.id, user);
  return json(await planPayload(env, user, raw.sunday.date), 201);
}

async function addLink(env, user, raw, body) {
  const { item, error } = resolveTargetItem(raw, body.item_id);
  if (error) return error;
  if (!canAddResource(user, raw.sunday, item)) return fail(403, 'Nu poți adăuga resurse aici.');
  let link;
  try { link = new URL(str(body.url, 2000)); } catch { return fail(400, 'Link invalid.'); }
  if (link.protocol !== 'https:' && link.protocol !== 'http:') return fail(400, 'Link invalid — trebuie să înceapă cu https://');
  const name = str(body.name, 180) || link.hostname;
  await env.DB.prepare(
    'INSERT INTO resources (sunday_id, item_id, kind, name, url, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(raw.sunday.id, item ? item.id : null, 'link', name, link.toString(), user.username).run();
  await touch(env, raw.sunday.id, user);
  return json(await planPayload(env, user, raw.sunday.date), 201);
}

async function getResourceWithSunday(env, id) {
  return env.DB.prepare(
    'SELECT r.*, s.date AS sunday_date, s.preacher_name AS sunday_preacher FROM resources r JOIN sundays s ON s.id = r.sunday_id WHERE r.id = ?'
  ).bind(id).first();
}

async function deleteResource(env, user, id) {
  const res = await getResourceWithSunday(env, id);
  if (!res) return fail(404, 'Resursa nu există.');
  if (!canViewSunday(user, { date: res.sunday_date, preacher_name: res.sunday_preacher })) return fail(404, 'Resursa nu există.');
  if (!canDeleteResource(user, res)) return fail(403, 'Doar cine a urcat resursa (sau contul general) o poate șterge.');
  if (res.r2_key && env.RESURSE) await env.RESURSE.delete(res.r2_key);
  await env.DB.prepare('DELETE FROM resources WHERE id = ?').bind(id).run();
  await touch(env, res.sunday_id, user);
  return json(await planPayload(env, user, res.sunday_date));
}

// GET /resurse/:id — descărcare prin Worker; bucket-ul R2 rămâne privat.
export async function serveResource(env, user, id) {
  const res = await getResourceWithSunday(env, id);
  if (!res || !canViewSunday(user, { date: res.sunday_date, preacher_name: res.sunday_preacher })) {
    return new Response('Resursa nu există.', { status: 404 });
  }
  if (res.kind === 'link') return Response.redirect(res.url, 302);
  if (!env.RESURSE) return new Response('Stocarea de fișiere nu e configurată.', { status: 503 });
  const obj = await env.RESURSE.get(res.r2_key);
  if (!obj) return new Response('Fișierul lipsește din stocare.', { status: 404 });

  const type = res.content_type || 'application/octet-stream';
  const disposition = INLINE_TYPES.test(type) ? 'inline' : 'attachment';
  return new Response(obj.body, {
    headers: {
      'content-type': type,
      'content-length': String(obj.size),
      'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(res.name)}`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': 'sandbox',
      'cache-control': 'private, max-age=300',
    },
  });
}

// ---------------------------------------------------------------- router API

// Toate rutele /api/program/... și /api/resurse/... . `user` e deja autentificat.
export async function handleProgramApi(request, env, user, path, url) {
  if (!env.DB) return fail(503, 'Baza de date a programului (D1) nu e configurată.');
  const method = request.method;
  const readJson = async () => {
    try { return await request.json(); } catch { return {}; }
  };

  if (path === '/api/program' && method === 'POST') return createSunday(env, user, await readJson());

  const resMatch = path.match(/^\/api\/resurse\/(\d+)$/);
  if (resMatch && method === 'DELETE') return deleteResource(env, user, Number(resMatch[1]));

  const m = path.match(/^\/api\/program\/(\d{4}-\d{2}-\d{2})(\/.*)?$/);
  if (!m) return fail(404, 'Rută necunoscută.');
  const [, date, rest = ''] = m;

  const raw = await loadRaw(env, date);
  if (!raw || !canViewSunday(user, raw.sunday)) return fail(404, 'Nu există program pentru această dată.');

  if (rest === '' && method === 'GET') return json(await planPayload(env, user, date));
  if (rest === '' && method === 'PATCH') return updateSunday(env, user, raw, await readJson());
  if (rest === '' && method === 'DELETE') return deleteSunday(env, user, raw);
  if (rest === '/items' && method === 'POST') return addItem(env, user, raw, await readJson());
  if (rest === '/ordine' && method === 'PUT') return reorderItems(env, user, raw, await readJson());
  if (rest === '/resurse' && method === 'POST') return uploadFile(env, user, raw, request, url);
  if (rest === '/linkuri' && method === 'POST') return addLink(env, user, raw, await readJson());

  const itemMatch = rest.match(/^\/items\/(\d+)$/);
  if (itemMatch && method === 'PATCH') return updateItem(env, user, raw, Number(itemMatch[1]), await readJson());
  if (itemMatch && method === 'DELETE') return deleteItem(env, user, raw, Number(itemMatch[1]));

  return fail(404, 'Rută necunoscută.');
}
