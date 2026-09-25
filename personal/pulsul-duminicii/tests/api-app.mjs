// API-ul aplicației native (/api/app/…): login cu token, permisiuni, și — cel mai important —
// că fiecare rută întoarce EXACT datele pe care le primește pagina corespunzătoare (PAYLOAD).
import { ADMIN, MARIUS, MARIUS_SUNDAY, DAY_WITH_FEEDBACK, LAST_SUNDAY, addDays } from './fixtures.mjs';

const MARIUS_PAST_DAY = addDays(LAST_SUNDAY, -7); // în calendarul de test predică Marius

export default async function apiApp(t, { B }) {
  const post = (path, body, headers = {}) => fetch(B + path, {
    method: 'POST',
    headers: { origin: B, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const login = async (user) => (await post('/api/app/login', { username: user.username, password: user.password })).json();

  // ---- login
  const bad = await post('/api/app/login', { username: ADMIN.username, password: 'nu-e-parola' });
  t.ok(bad.status === 401 && (await bad.json()).error === 'Utilizator sau parolă greșită.', 'login greșit → 401 cu mesajul site-ului');
  const noOrigin = await fetch(`${B}/api/app/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: ADMIN.username, password: ADMIN.password }),
  });
  t.ok(noOrigin.status === 403, `login fără Origin → 403 (${noOrigin.status})`);

  const admin = await login(ADMIN);
  const marius = await login(MARIUS);
  t.ok(/^[0-9a-f]{64}$/.test(admin.token || '') && admin.user?.role === 'admin', 'login admin → token + rol');
  t.ok(/^[0-9a-f]{64}$/.test(marius.token || '') && marius.user?.preacherName === 'Marius', 'login predicator → token + nume');

  const auth = (s) => ({ authorization: `Bearer ${s.token}` });
  const getJson = async (s, path) => {
    const r = await fetch(`${B}/api/app${path}`, { headers: auth(s) });
    return { status: r.status, body: await r.json() };
  };
  const pagePayload = async (s, path) => {
    const html = await (await fetch(B + path, { headers: auth(s) })).text();
    const m = html.match(/const PAYLOAD = (.+);$/m);
    return m ? JSON.parse(m[1]) : null;
  };
  // generatedAtLabel e ora randării — singurul câmp care diferă legitim între două cereri
  const normalize = (p) => {
    const copy = structuredClone(p);
    if (copy?.meta) delete copy.meta.generatedAtLabel;
    return JSON.stringify(copy);
  };

  const sesiune = await getJson(admin, '/sesiune');
  t.ok(sesiune.status === 200 && sesiune.body.user.username === ADMIN.username, 'GET /api/app/sesiune');

  // ---- fiecare rută = PAYLOAD-ul paginii
  const routes = [
    [admin, '/'], [admin, '/zile'], [admin, `/zile/${DAY_WITH_FEEDBACK}`], [admin, '/categorii'],
    [admin, '/categorii/q5'], [admin, '/predicatori'], [admin, '/predicatori/marius'],
    [admin, '/program'], [admin, `/program/${MARIUS_SUNDAY}`], [admin, '/admin/conturi'],
    [marius, '/eu'], [marius, '/program'], [marius, `/program/${MARIUS_SUNDAY}`], [marius, `/zile/${MARIUS_PAST_DAY}`],
  ];
  for (const [s, path] of routes) {
    const [api, page] = await Promise.all([getJson(s, path === '/' ? '' : path), pagePayload(s, path)]);
    const who = s === admin ? 'admin' : 'predicator';
    t.ok(api.status === 200 && page !== null && normalize(api.body.data) === normalize(page),
      `${who} ${path}: JSON identic cu pagina`);
  }

  // ---- permisiuni
  for (const path of ['', '/categorii', `/zile/${DAY_WITH_FEEDBACK}`, '/admin/conturi', '/predicatori']) {
    const r = await getJson(marius, path);
    t.ok(r.status === 403 && r.body.error, `predicator ${path || '/'} → 403 JSON`);
  }
  t.ok((await getJson(admin, '/eu')).status === 403, 'admin /eu → 403 JSON');
  t.ok((await getJson(admin, '/zile/1999-01-03')).status === 404, 'zi inexistentă → 404 JSON');
  const anon = await fetch(`${B}/api/app/zile`);
  t.ok(anon.status === 401, `fără token → 401 (${anon.status})`);

  // ---- scrieri existente + descărcare, cu Bearer
  const up = await fetch(`${B}/api/program/${MARIUS_SUNDAY}/resurse?item=&name=api-app.txt`, {
    method: 'POST', headers: { ...auth(admin), origin: B, 'content-type': 'text/plain' }, body: 'continut-api-app',
  });
  if (up.status === 503) {
    t.note('urcare: R2 lipsește local, descărcarea cu Bearer nu se poate verifica');
  } else {
    const plan = await up.json();
    const res = plan.resources?.find((r) => r.name === 'api-app.txt');
    t.ok(up.status === 201 && res, `urcare cu Bearer (${up.status})`);
    const dl = res && await fetch(B + res.url, { headers: auth(marius) });
    t.ok(dl?.status === 200 && (await dl.text()) === 'continut-api-app', 'descărcare /resurse/:id cu Bearer (predicator)');
    // curățenie: suitele de după (telefon, aspect) pornesc de la o duminică fără resurse
    const del = res && await fetch(`${B}/api/resurse/${res.id}`, { method: 'DELETE', headers: { ...auth(admin), origin: B } });
    t.ok(del?.status === 200, 'ștergere resursă cu Bearer');
  }

  // ---- logout invalidează tokenul
  const out = await post('/api/app/logout', {}, auth(marius));
  t.ok(out.status === 200, 'logout');
  t.ok((await getJson(marius, '/eu')).status === 401, 'după logout tokenul nu mai merge');
}
