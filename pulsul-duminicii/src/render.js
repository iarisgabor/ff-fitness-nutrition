import HOME_TEMPLATE from './home.html';
import DAYS_TEMPLATE from './days.html';
import DAY_TEMPLATE from './day.html';
import CATEGORIES_TEMPLATE from './categories.html';
import CATEGORY_TEMPLATE from './category.html';
import SHARED_CSS from './shared.css';
import SHARED_JS from './shared.txt';
import { getAccessToken, fetchSheetValues } from './sheets.js';
import { buildColumnMap, rowsToResponses, buildData, summarizeByDate, dateToSlug, slugToDate } from './transform.js';
import { getCachedAiSummary, generateAndCacheAiSummary } from './aiSummary.js';
import { DIMENSIONS } from './config.js';

const PAYLOAD_KEY = 'sheet_payload';
const PAYLOAD_LAST_GOOD_KEY = 'sheet_payload:last_good';
const PAYLOAD_TTL_SECONDS = 10 * 60;

function safeJsonForScript(value) {
  // JSON.stringify nu scapă niciodată "<", deci un text liber care conține
  // "</script" ar putea rupe pagina — îl neutralizăm explicit.
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function injectShared(template) {
  return template.replace('__SHARED_CSS__', SHARED_CSS).replace('__SHARED_JS__', SHARED_JS);
}

function formatDateLabel(dmy) {
  const [dd, mm, yyyy] = dmy.split('.');
  return `${dd}.${mm}.${yyyy}`;
}

// ---- pas 1: date brute din Sheet -> {responses, data}, cache-uite ca JSON (nu HTML) ----

async function fetchAndTransform(env) {
  const accessToken = await getAccessToken(env);
  const rows = await fetchSheetValues(env, accessToken);
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

export async function renderHome(env, ctx) {
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
  const html = injectShared(HOME_TEMPLATE).replace('__PULS_DATA_JSON__', safeJsonForScript(payload));
  return html;
}

// ---- pagina /zile ----

export async function renderDaysList(env, ctx) {
  const { responses, stale } = await getComputedPayload(env, ctx);
  const meta = baseMeta(responses, stale);
  delete meta._dates;
  const days = summarizeByDate(responses);
  const payload = { days, meta };
  return injectShared(DAYS_TEMPLATE).replace('__PULS_DATA_JSON__', safeJsonForScript(payload));
}

// ---- pagina /zile/:slug ----

export async function renderDay(env, ctx, slug) {
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

  const meta = baseMeta(responses, stale);
  delete meta._dates;
  meta.prevSlug = prevSlug;
  meta.nextSlug = nextSlug;
  meta.overallAvg = data.overallAvg;

  const dimLabels = DIMENSIONS.map((d) => ({ key: d.key, label: d.label, full: d.full }));
  const payload = { date, items, dimLabels, aiSummary, meta };
  return injectShared(DAY_TEMPLATE).replace('__PULS_DATA_JSON__', safeJsonForScript(payload));
}

// ---- pagina /categorii ----

export async function renderCategoriesIndex(env, ctx) {
  const { responses, data, stale } = await getComputedPayload(env, ctx);
  const meta = baseMeta(responses, stale);
  delete meta._dates;
  const allKeys = DIMENSIONS.map((d) => ({ key: d.key, label: d.label }));
  const payload = { dims: data.dims, correlations: data.categoryCorrelations, allKeys, meta };
  return injectShared(CATEGORIES_TEMPLATE).replace('__PULS_DATA_JSON__', safeJsonForScript(payload));
}

// ---- pagina /categorii/:key ----

export async function renderCategoryDetail(env, ctx, key) {
  const dim = DIMENSIONS.find((d) => d.key === key);
  if (!dim) return null; // 404 — cheie de categorie necunoscută

  const { responses, data, stale } = await getComputedPayload(env, ctx);
  const series = data.categorySeries[key] || [];
  const allKeys = DIMENSIONS.map((d) => ({ key: d.key, label: d.label }));

  const meta = baseMeta(responses, stale);
  delete meta._dates;

  const payload = { key, label: dim.label, full: dim.full, series, allKeys, meta };
  return injectShared(CATEGORY_TEMPLATE).replace('__PULS_DATA_JSON__', safeJsonForScript(payload));
}
