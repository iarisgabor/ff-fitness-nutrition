import HOME_TEMPLATE from './home.html';
import DAYS_TEMPLATE from './days.html';
import DAY_TEMPLATE from './day.html';
import CATEGORIES_TEMPLATE from './categories.html';
import CATEGORY_TEMPLATE from './category.html';
import PREACHERS_TEMPLATE from './predicatori.html';
import PREACHER_TEMPLATE from './predicator.html';
import LOGIN_TEMPLATE from './login.html';
import PROGRAM_LIST_TEMPLATE from './program-list.html';
import PROGRAM_EDIT_TEMPLATE from './program-edit.html';
import ACCOUNTS_TEMPLATE from './admin-accounts.html';
import SHARED_HEAD from './head.html';
import SHARED_CSS from './shared.css';
import SHARED_JS from './shared.txt';
import { getAccessToken, fetchSheetValues } from './sheets.js';
import {
  buildColumnMap, rowsToResponses, buildData, summarizeByDate, dateToSlug, slugToDate,
  dimensionStats, categoryWeeklySeries, pickQuotes, perResponseAverage,
} from './transform.js';
import { getCachedAiSummary, generateAndCacheAiSummary } from './aiSummary.js';
import { RANGE_PRESETS, weeksForPreset, getCachedTrendSummary, generateAndCacheTrendSummary } from './aiTrendSummary.js';
import { SHEET_RANGE, PREACHERS_SHEET_RANGE, DIMENSIONS } from './config.js';
import { buildPreacherColumnMap, rowsToSchedule, preacherSlug } from './preachers.js';
import { listSundays, planPayload, attendanceRows, todayRo } from './program.js';
import { listAccounts } from './accounts.js';
import { publicUser } from './session.js';

const PAYLOAD_KEY = 'sheet_payload';
const PAYLOAD_LAST_GOOD_KEY = 'sheet_payload:last_good';
const PAYLOAD_TTL_SECONDS = 10 * 60;

function safeJsonForScript(value) {
  // JSON.stringify nu scapă niciodată "<", deci un text liber care conține
  // "</script" ar putea rupe pagina — îl neutralizăm explicit.
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

// `user` ajunge în pagină ca global PULS_USER (folosit de initNav pentru meniul pe
// roluri). Se injectează ÎNAINTE de __PULS_DATA_JSON__, deci niciun text venit din
// Sheet nu poate conține markerul înlocuit aici.
function injectShared(template, user) {
  const userJs = `const PULS_USER = ${safeJsonForScript(publicUser(user))};\n`;
  return template
    .replace('__SHARED_HEAD__', () => SHARED_HEAD)
    .replace('__SHARED_CSS__', () => SHARED_CSS)
    .replace('__SHARED_JS__', () => userJs + SHARED_JS)
    // marker după scripturi: <link rel="expect" href="#randat" blocking="render"> din head.html
    // ține afișarea până aici, ca prima imagine a paginii să fie deja completă (barele, conținutul)
    .replace('</body>', () => '<div id="randat" hidden></div>\n</body>');
}

// Funcție ca al doilea argument la replace(): un text de la membri care conține
// "$&" sau "$'" ar fi interpretat altfel ca tipar special de înlocuire.
function fillPage(template, user, payload) {
  const data = safeJsonForScript(payload);
  return injectShared(template, user).replace('__PULS_DATA_JSON__', () => data);
}

function formatDateLabel(dmy) {
  const [dd, mm, yyyy] = dmy.split('.');
  return `${dd}.${mm}.${yyyy}`;
}

// ---- pas 1: date brute din Sheet -> {responses, data}, cache-uite ca JSON (nu HTML) ----

async function fetchAndTransform(env) {
  const accessToken = await getAccessToken(env);
  const rows = await fetchSheetValues(env, accessToken, env.GOOGLE_SHEET_ID, SHEET_RANGE);
  if (!rows.length) throw new Error('Sheet-ul nu are niciun rând.');
  const [headerRow, ...dataRows] = rows;
  const columnMap = buildColumnMap(headerRow, dataRows);
  const responses = rowsToResponses(dataRows, columnMap);
  const data = buildData(responses);
  return { responses, data };
}

// Stale-while-revalidate: la eșec de fetch live, întoarce ultima versiune bună
// cunoscută din KV în loc de eroare — fail-open, ca rate-limiter-ul din FF Fitness.
async function getComputedPayload(env, ctx) {
  if (env.PULSUL_KV) {
    const cached = await env.PULSUL_KV.get(PAYLOAD_KEY, 'json');
    if (cached) return { ...cached, stale: false };
  }
  try {
    const payload = await fetchAndTransform(env);
    if (env.PULSUL_KV) {
      ctx.waitUntil(Promise.all([
        env.PULSUL_KV.put(PAYLOAD_KEY, JSON.stringify(payload), { expirationTtl: PAYLOAD_TTL_SECONDS }),
        env.PULSUL_KV.put(PAYLOAD_LAST_GOOD_KEY, JSON.stringify(payload)),
      ]));
    }
    return { ...payload, stale: false };
  } catch (err) {
    console.error('fetchAndTransform a eșuat:', err);
    const lastGood = env.PULSUL_KV ? await env.PULSUL_KV.get(PAYLOAD_LAST_GOOD_KEY, 'json') : null;
    if (lastGood) return { ...lastGood, stale: true };
    throw err;
  }
}

// Pentru un eventual Cron Trigger de pre-încălzire (neactivat implicit — vezi
// README) — forțează un fetch proaspăt și rescrie cache-ul, indiferent dacă mai
// era încă valid.
export async function refreshPayloadCache(env) {
  const payload = await fetchAndTransform(env);
  if (env.PULSUL_KV) {
    await Promise.all([
      env.PULSUL_KV.put(PAYLOAD_KEY, JSON.stringify(payload), { expirationTtl: PAYLOAD_TTL_SECONDS }),
      env.PULSUL_KV.put(PAYLOAD_LAST_GOOD_KEY, JSON.stringify(payload)),
    ]);
  }
  return payload;
}

// ---- pas 1b: calendarul de predicare, al doilea Sheet — cache separat, fail-soft ----
//
// Spre deosebire de getComputedPayload, o eroare aici NU trebuie să dărâme restul
// site-ului (paginile de feedback existau dinainte de acest Sheet) — dacă
// service account-ul încă n-a fost adăugat Viewer pe "Calendar predicare", sau
// GOOGLE_SHEET_ID-ul lui lipsește din config, /predicatori arată o stare goală
// cu explicație, nu 503.

const SCHEDULE_KEY = 'preacher_schedule';
const SCHEDULE_LAST_GOOD_KEY = 'preacher_schedule:last_good';
const SCHEDULE_TTL_SECONDS = 10 * 60;

async function fetchAndTransformSchedule(env) {
  const accessToken = await getAccessToken(env);
  const rows = await fetchSheetValues(env, accessToken, env.PREACHERS_SHEET_ID, PREACHERS_SHEET_RANGE);
  if (!rows.length) return [];
  const [headerRow, ...dataRows] = rows;
  const columnMap = buildPreacherColumnMap(headerRow);
  return rowsToSchedule(dataRows, columnMap);
}

export async function getSchedule(env, ctx) {
  if (!env.PREACHERS_SHEET_ID) {
    return { schedule: [], stale: false, error: 'PREACHERS_SHEET_ID nu e setat în wrangler.toml.' };
  }
  if (env.PULSUL_KV) {
    const cached = await env.PULSUL_KV.get(SCHEDULE_KEY, 'json');
    if (cached) return { schedule: cached, stale: false, error: null };
  }
  try {
    const schedule = await fetchAndTransformSchedule(env);
    if (env.PULSUL_KV) {
      ctx.waitUntil(Promise.all([
        env.PULSUL_KV.put(SCHEDULE_KEY, JSON.stringify(schedule), { expirationTtl: SCHEDULE_TTL_SECONDS }),
        env.PULSUL_KV.put(SCHEDULE_LAST_GOOD_KEY, JSON.stringify(schedule)),
      ]));
    }
    return { schedule, stale: false, error: null };
  } catch (err) {
    console.error('fetchAndTransformSchedule a eșuat:', err);
    const lastGood = env.PULSUL_KV ? await env.PULSUL_KV.get(SCHEDULE_LAST_GOOD_KEY, 'json') : null;
    if (lastGood) return { schedule: lastGood, stale: true, error: null };
    return { schedule: [], stale: false, error: 'Nu am putut citi calendarul de predicare — verifică accesul service account-ului pe acel Sheet.' };
  }
}

function baseMeta(responses, stale) {
  const dates = [...new Set(responses.map((r) => r.date))].sort((a, b) => {
    const [da, ma, ya] = a.split('.').map(Number);
    const [db, mb, yb] = b.split('.').map(Number);
    return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
  });
  return {
    stale,
    totalResponses: responses.length,
    dateRangeLabel: dates.length ? `${formatDateLabel(dates[0])}–${formatDateLabel(dates[dates.length - 1])}` : '',
    generatedAtLabel: new Date().toISOString(),
    _dates: dates,
  };
}

// ---- pagina Acasă ----

export async function renderHome(env, ctx, user) {
  const { responses, data, stale } = await getComputedPayload(env, ctx);
  const meta = baseMeta(responses, stale);
  delete meta._dates;

  const answeredDims = data.dims.filter((d) => d.n > 0);
  const topDim = answeredDims.slice().sort((a, b) => b.avg - a.avg)[0];
  const worstDim = answeredDims.slice().sort((a, b) => a.avg - b.avg)[0];
  const topAge = data.ages.slice().sort((a, b) => b.n - a.n)[0];
  const totalRatings = data.dims.reduce((sum, d) => sum + d.n, 0);
  const totalAge = data.ages.reduce((sum, a) => sum + a.n, 0) || 1;
  const pct5 = (dim) => (dim && dim.n ? Math.round((dim.dist[4] / dim.n) * 100) : 0);

  const heroKpis = [];
  if (topDim) {
    heroKpis.push({ value: topDim.avg.toFixed(2), label: `cea mai puternică · ${topDim.label}`, color: 'var(--accent)' });
    heroKpis.push({ value: `${pct5(topDim)}%`, label: 'au dat nota maximă la această dimensiune', color: 'var(--accent2)' });
  }
  heroKpis.push({ value: String(totalRatings), label: 'note individuale colectate' });

  const dates = [...new Set(responses.map((r) => r.date))];
  const overviewCards = [];
  if (dates.length) {
    const sorted = dates.sort((a, b) => {
      const [da, ma, ya] = a.split('.').map(Number);
      const [db, mb, yb] = b.split('.').map(Number);
      return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
    });
    overviewCards.push({
      tag: 'Perioadă acoperită',
      val: `${formatDateLabel(sorted[0])} – ${formatDateLabel(sorted[sorted.length - 1])}`,
      sub: `${sorted.length} ${sorted.length === 1 ? 'zi distinctă' : 'zile distincte'} cu răspunsuri primite`,
      big: true,
    });
  }
  if (topDim) {
    overviewCards.push({ tag: 'Punct forte', dot: 'var(--accent-mark)', val: topDim.label, sub: `medie ${topDim.avg.toFixed(2)} · ${pct5(topDim)}% note de 5` });
  }
  if (worstDim && worstDim.key !== topDim?.key) {
    overviewCards.push({ tag: 'Zonă de creștere', dot: 'var(--accent2-mark)', val: worstDim.label, sub: `medie ${worstDim.avg.toFixed(2)} · cea mai scăzută dintre toate` });
  }
  if (topAge) {
    overviewCards.push({ tag: 'Vârstă dominantă', val: topAge.label, sub: `${topAge.n} din ${totalAge} răspunsuri (${Math.round((topAge.n / totalAge) * 100)}%)` });
  }

  const payload = { DATA: data, meta: { ...meta, heroKpis, overviewCards } };
  const html = fillPage(HOME_TEMPLATE, user, payload);
  return html;
}

// ---- pagina /zile ----

export async function renderDaysList(env, ctx, user) {
  const { responses, stale } = await getComputedPayload(env, ctx);
  const meta = baseMeta(responses, stale);
  delete meta._dates;
  const days = summarizeByDate(responses);
  const payload = { days, meta };
  return fillPage(DAYS_TEMPLATE, user, payload);
}

// ---- pagina /zile/:slug ----

export async function renderDay(env, ctx, slug, user) {
  const { responses, data, stale } = await getComputedPayload(env, ctx);
  const date = slugToDate(slug);
  const items = responses.filter((r) => r.date === date);
  if (!items.length) return null; // 404 — nicio duminică cu acest slug

  const days = summarizeByDate(responses); // sortat descrescător (cel mai recent primul)
  const idx = days.findIndex((d) => d.slug === slug);
  const prevSlug = idx >= 0 && idx < days.length - 1 ? days[idx + 1].slug : null; // mai vechi
  const nextSlug = idx > 0 ? days[idx - 1].slug : null; // mai nou

  // Rapid, niciun apel către Claude aici — pagina nu așteaptă după AI. Dacă
  // rezumatul nu e încă în cache, îl generăm în fundal (ctx.waitUntil), fără să
  // întârziem răspunsul trimis acum; apare la vizita următoare pe aceeași zi.
  const aiSummary = await getCachedAiSummary(env, date, items);
  if (aiSummary === null && env.ANTHROPIC_API_KEY) {
    ctx.waitUntil(generateAndCacheAiSummary(env, date, items));
  }

  const { schedule, stale: scheduleStale } = await getSchedule(env, ctx);
  const scheduleEntry = schedule.find((s) => s.date === date);
  const preacher = scheduleEntry ? { name: scheduleEntry.speaker, slug: preacherSlug(scheduleEntry.speaker) } : null;

  const meta = baseMeta(responses, stale || scheduleStale);
  delete meta._dates;
  // Predicatorul vede doar duminicile lui — fără săgeți spre ziua de dinainte/după.
  meta.prevSlug = user?.role === 'preacher' ? null : prevSlug;
  meta.nextSlug = user?.role === 'preacher' ? null : nextSlug;
  meta.overallAvg = data.overallAvg;

  const dimLabels = DIMENSIONS.map((d) => ({ key: d.key, label: d.label, full: d.full }));
  const payload = { date, items, dimLabels, aiSummary, preacher, meta };
  return fillPage(DAY_TEMPLATE, user, payload);
}

// ---- pagina /categorii ----

export async function renderCategoriesIndex(env, ctx, user) {
  const { responses, data, stale } = await getComputedPayload(env, ctx);
  const meta = baseMeta(responses, stale);
  delete meta._dates;
  const allKeys = DIMENSIONS.map((d) => ({ key: d.key, label: d.label }));
  const payload = { dims: data.dims, correlations: data.categoryCorrelations, allKeys, meta };
  return fillPage(CATEGORIES_TEMPLATE, user, payload);
}

// ---- pagina /categorii/:key ----

export async function renderCategoryDetail(env, ctx, key, user) {
  const dim = DIMENSIONS.find((d) => d.key === key);
  if (!dim) return null; // 404 — cheie de categorie necunoscută

  const { responses, data, stale } = await getComputedPayload(env, ctx);
  const series = data.categorySeries[key] || [];
  const allKeys = DIMENSIONS.map((d) => ({ key: d.key, label: d.label }));
  const globalAvg = data.dims.find((d) => d.key === key)?.avg || 0;

  // Analiză AI de tendință, doar pentru presetup-urile de interval (nu "Personalizat" —
  // ar fi imposibil de cache-uit). Rapid: doar KV.get; generarea lipsă pornește în fundal.
  // Cele 5 citiri din KV pornesc în paralel, nu una după alta.
  const trendSummaries = Object.fromEntries(await Promise.all(RANGE_PRESETS.map(async (preset) => {
    const weeks = weeksForPreset(series, preset.months);
    if (weeks.length < 2) return [preset.key, null];
    const cached = await getCachedTrendSummary(env, key, preset.key, weeks);
    if (cached === null && env.ANTHROPIC_API_KEY) {
      ctx.waitUntil(generateAndCacheTrendSummary(env, dim, preset, weeks, series, globalAvg));
    }
    return [preset.key, cached];
  })));

  const meta = baseMeta(responses, stale);
  delete meta._dates;

  const payload = { key, label: dim.label, full: dim.full, series, allKeys, trendSummaries, meta };
  return fillPage(CATEGORY_TEMPLATE, user, payload);
}

// ---- pagina /predicatori ----

function compositeAvg(responses) {
  const averages = responses.map(perResponseAverage).filter((v) => v != null);
  return averages.length ? averages.reduce((a, b) => a + b, 0) / averages.length : null;
}

export async function renderPreachersIndex(env, ctx, user) {
  const { responses, stale } = await getComputedPayload(env, ctx);
  const { schedule, stale: scheduleStale, error: scheduleError } = await getSchedule(env, ctx);
  const meta = baseMeta(responses, stale || scheduleStale);
  delete meta._dates;

  const names = [...new Set(schedule.map((s) => s.speaker))];
  const byPreacher = names
    .map((name) => {
      const dates = new Set(schedule.filter((s) => s.speaker === name).map((s) => s.date));
      const theirResponses = responses.filter((r) => dates.has(r.date));
      return { name, slug: preacherSlug(name), theirResponses };
    })
    .filter((p) => p.theirResponses.length > 0);

  const preachers = byPreacher
    .map(({ name, slug, theirResponses }) => {
      const sundayCount = new Set(theirResponses.map((r) => r.date)).size;
      const q5 = dimensionStats(theirResponses).find((d) => d.key === 'q5');
      return {
        name, slug, sundayCount,
        avgQ5: q5.n ? q5.avg : null, nQ5: q5.n,
        avgOverall: compositeAvg(theirResponses),
      };
    })
    .sort((a, b) => (b.avgOverall || 0) - (a.avgOverall || 0));

  const comparisonRows = DIMENSIONS.map((dim) => ({
    key: dim.key,
    label: dim.label,
    perPreacher: byPreacher.map(({ name, slug, theirResponses }) => {
      const d = dimensionStats(theirResponses).find((x) => x.key === dim.key);
      return { name, slug, avg: d.n ? d.avg : null, n: d.n };
    }),
  }));

  const payload = { preachers, comparisonRows, scheduleError: scheduleError || null, meta };
  return fillPage(PREACHERS_TEMPLATE, user, payload);
}

// ---- statisticile unui predicator: /predicatori/:slug (admin) și /eu (predicatorul) ----

function samePreacher(a, b) {
  const sa = preacherSlug(a || '');
  return sa !== '' && sa === preacherSlug(b || '');
}

function average(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

// Datele (DD.MM.AAAA) la care a predicat, după „Calendar predicare".
export async function preacherDates(env, ctx, name) {
  const { schedule } = await getSchedule(env, ctx);
  return new Set(schedule.filter((s) => samePreacher(s.speaker, name)).map((s) => s.date));
}

async function buildPreacherStats(env, ctx, name) {
  const { responses, data, stale } = await getComputedPayload(env, ctx);
  const { schedule, stale: scheduleStale, error: scheduleError } = await getSchedule(env, ctx);

  const dates = new Set(schedule.filter((s) => samePreacher(s.speaker, name)).map((s) => s.date));
  const theirResponses = responses.filter((r) => dates.has(r.date));
  const restResponses = responses.filter((r) => !dates.has(r.date));

  const theirStats = dimensionStats(theirResponses);
  const restStats = dimensionStats(restResponses);
  const comparison = DIMENSIONS.map((dim) => {
    const t = theirStats.find((d) => d.key === dim.key);
    const r = restStats.find((d) => d.key === dim.key);
    return {
      key: dim.key, label: dim.label,
      theirAvg: t.n ? t.avg : null, theirN: t.n,
      restAvg: r.n ? r.avg : null, restN: r.n,
      delta: (t.n && r.n) ? t.avg - r.avg : null,
    };
  });

  const q5Series = categoryWeeklySeries(theirResponses).q5 || [];
  const quotes = pickQuotes(theirResponses).q5 || [];
  const sundayCount = new Set(theirResponses.map((r) => r.date)).size;

  // Prezența — trecută manual în Program duminică (D1), nu vine din Sheet.
  const attendance = await attendanceRows(env);
  const theirAttendance = attendance.filter((a) => samePreacher(a.preacher_name, name));
  const restAttendance = attendance.filter((a) => !samePreacher(a.preacher_name, name));
  const attendanceStats = {
    theirAvg: average(theirAttendance.map((a) => a.attendance)),
    restAvg: average(restAttendance.map((a) => a.attendance)),
    allAvg: average(attendance.map((a) => a.attendance)),
    perSunday: theirAttendance.map((a) => ({ date: a.date, attendance: a.attendance })),
  };

  // Duminicile următoare: din Program (dacă e deja creat) + din calendar (dacă nu).
  const today = todayRo();
  const planned = (await listSundays(env)).filter((s) => s.date >= today && samePreacher(s.preacher_name, name));
  const plannedDates = new Set(planned.map((s) => s.date));
  const upcoming = [
    ...planned.map((s) => ({ date: s.date, planned: true, resourceCount: s.resource_count, totalSec: s.total_sec })),
    ...schedule
      .filter((s) => samePreacher(s.speaker, name))
      .map((s) => dateToSlug(s.date))
      .filter((d) => d >= today && !plannedDates.has(d))
      .map((d) => ({ date: d, planned: false })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const meta = baseMeta(responses, stale || scheduleStale);
  delete meta._dates;
  meta.globalOverallAvg = data.overallAvg;

  return {
    name, slug: preacherSlug(name), sundayCount,
    avgOverall: compositeAvg(theirResponses),
    q5Series, comparison, quotes, attendance: attendanceStats, upcoming,
    feedbackDates: [...dates].filter((d) => responses.some((r) => r.date === d)).map(dateToSlug),
    scheduleError: scheduleError || null, meta,
  };
}

export async function renderPreacherDetail(env, ctx, slug, user) {
  const { schedule } = await getSchedule(env, ctx);
  const name = [...new Set(schedule.map((s) => s.speaker))].find((n) => preacherSlug(n) === slug);
  if (!name) return null; // 404 — predicator necunoscut sau calendar indisponibil
  const payload = await buildPreacherStats(env, ctx, name);
  return fillPage(PREACHER_TEMPLATE, user, { ...payload, self: false });
}

export async function renderMe(env, ctx, user) {
  const payload = await buildPreacherStats(env, ctx, user.preacherName);
  return fillPage(PREACHER_TEMPLATE, user, { ...payload, self: true });
}

// ---- /login și /cont (schimbare parolă) — același șablon, fără date din Sheet ----

export function renderLogin({ mode = 'login', error = null, next = '', username = '' }, user) {
  return fillPage(LOGIN_TEMPLATE, user, { mode, error, next, username });
}

// ---- Program duminică ----

function nextSundays(fromDate, count) {
  const d = new Date(`${fromDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

export async function renderProgramList(env, ctx, user) {
  const today = todayRo();
  const isAdmin = user.role === 'admin';
  const [sundays, { schedule }] = await Promise.all([listSundays(env), getSchedule(env, ctx)]);
  const mine = (name) => user.role === 'preacher' && samePreacher(name, user.preacherName);

  const visible = sundays
    .filter((s) => isAdmin || s.date >= today || mine(s.preacher_name))
    .map((s) => ({
      date: s.date, preacher_name: s.preacher_name, start_time: s.start_time,
      attendance: s.attendance, total_sec: s.total_sec, resource_count: s.resource_count,
      isPast: s.date < today, mine: mine(s.preacher_name),
    }));

  const plannedDates = new Set(sundays.map((s) => s.date));
  const scheduleBySlug = schedule.map((s) => ({ date: dateToSlug(s.date), speaker: s.speaker }));
  // Duminici din calendar fără program încă — adminul le poate crea dintr-un click.
  const unplanned = scheduleBySlug
    .filter((s) => s.date >= today && !plannedDates.has(s.date))
    .filter((s) => isAdmin || mine(s.speaker));

  const payload = {
    today,
    sundays: visible,
    unplanned,
    schedule: isAdmin ? scheduleBySlug.filter((s) => s.date >= today) : [],
    nextFreeSunday: nextSundays(today, 60).find((d) => !plannedDates.has(d)) || null,
    copySources: isAdmin ? sundays.slice(-12).reverse().map((s) => ({ date: s.date, preacher_name: s.preacher_name })) : [],
    dbReady: !!env.DB,
  };
  return fillPage(PROGRAM_LIST_TEMPLATE, user, payload);
}

export async function renderProgramEdit(env, ctx, user, date) {
  if (!env.DB) return null;
  const plan = await planPayload(env, user, date);
  if (!plan) return null;

  let preachers = [];
  let hasFeedback = false;
  if (plan.perms.admin) {
    const { schedule } = await getSchedule(env, ctx);
    preachers = [...new Set(schedule.map((s) => s.speaker))];
    try {
      const { responses } = await getComputedPayload(env, ctx);
      hasFeedback = responses.some((r) => r.date === slugToDate(date));
    } catch { /* fără Sheet nu arătăm linkul spre feedback, restul merge */ }
  } else if (plan.isPast) {
    // pentru predicator: linkul spre feedback apare doar pe duminicile lui (singurele trecute pe care le vede)
    try {
      const { responses } = await getComputedPayload(env, ctx);
      hasFeedback = responses.some((r) => r.date === slugToDate(date));
    } catch { /* idem */ }
  }
  return fillPage(PROGRAM_EDIT_TEMPLATE, user, { plan, preachers, hasFeedback });
}

export async function renderAccounts(env, ctx, user) {
  const [accounts, { schedule, error }] = await Promise.all([listAccounts(env), getSchedule(env, ctx)]);
  const preachers = [...new Set(schedule.map((s) => s.speaker))];
  return fillPage(ACCOUNTS_TEMPLATE, user, { accounts, preachers, scheduleError: error || null, dbReady: !!env.DB });
}
