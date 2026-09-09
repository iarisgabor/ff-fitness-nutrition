// Analiză AI a tendinței, per categorie și interval — modelată după aiSummary.js, dar pe
// cifre agregate (medii, evoluție lunară, cel mai bun/slab moment), nu pe text liber.
// Doar pentru presetup-urile de interval (1/3/6/12 luni, Tot) — "Personalizat" ar însemna
// un număr nelimitat de combinații, deci imposibil de cache-uit eficient; acolo nu apare.
//
// Non-blocant, la fel ca aiSummary.js: (1) verifică rapid cache-ul KV, (2) dacă lipsește,
// pornește generarea în fundal cu ctx.waitUntil() — apare la vizita următoare.

const MONTHS_RO_FULL = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

export const RANGE_PRESETS = [
  { key: '1', months: 1, label: 'ultima lună' },
  { key: '3', months: 3, label: 'ultimele 3 luni' },
  { key: '6', months: 6, label: 'ultimele 6 luni' },
  { key: '12', months: 12, label: 'ultimele 12 luni' },
  { key: 'all', months: null, label: 'tot istoricul' },
];

function toDate(dmy) {
  const [dd, mm, yyyy] = dmy.split('.').map(Number);
  return new Date(yyyy, mm - 1, dd);
}

// Aceeași logică "acum minus N luni" ca `currentBounds()` din category.html — ca textul
// AI să descrie exact fereastra de date care e desenată pe grafic.
export function weeksForPreset(series, months) {
  const withData = series.filter((w) => w.n > 0);
  if (months == null) return withData;
  const until = new Date();
  const since = new Date(until);
  since.setMonth(since.getMonth() - months);
  return withData.filter((w) => {
    const d = toDate(w.date);
    return d >= since && d <= until;
  });
}

function aggregate(weeks) {
  const dist = [0, 0, 0, 0, 0];
  weeks.forEach((w) => w.dist.forEach((c, i) => (dist[i] += c)));
  const n = dist.reduce((a, b) => a + b, 0);
  const sum = dist.reduce((s, c, i) => s + c * (i + 1), 0);
  return { n, avg: n ? sum / n : 0 };
}

function monthlySeriesFromWeeks(weeks) {
  const byMonth = new Map();
  for (const w of weeks) {
    const [, mm, yyyy] = w.date.split('.');
    const key = `${yyyy}-${mm}`;
    if (!byMonth.has(key)) byMonth.set(key, { dist: [0, 0, 0, 0, 0], mm: Number(mm), yyyy });
    const acc = byMonth.get(key);
    w.dist.forEach((c, i) => (acc.dist[i] += c));
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, acc]) => {
      const n = acc.dist.reduce((a, b) => a + b, 0);
      const sum = acc.dist.reduce((s, c, i) => s + c * (i + 1), 0);
      return { label: `${MONTHS_RO_FULL[acc.mm - 1]} ${acc.yyyy}`, avg: n ? sum / n : 0, n };
    });
}

// Perioada anterioară echivalentă (aceeași lungime, imediat înainte de fereastra curentă) —
// pentru "Tot" nu există noțiune de "perioadă anterioară", se omite.
function previousWeeks(series, months) {
  if (months == null) return [];
  const withData = series.filter((w) => w.n > 0);
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const prevUntil = new Date(since.getTime() - 86400000);
  const prevSince = new Date(since);
  prevSince.setMonth(prevSince.getMonth() - months);
  return withData.filter((w) => {
    const d = toDate(w.date);
    return d >= prevSince && d <= prevUntil;
  });
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function kvKeyFor(dimKey, rangeKey, weeks) {
  const hash = await sha256Hex(JSON.stringify(weeks.map((w) => ({ date: w.date, n: w.n, avg: w.avg }))));
  return `trend_summary:${dimKey}:${rangeKey}:${hash}`;
}

async function summarizeWithClaude(env, dim, preset, weeks, series, globalAvg) {
  const agg = aggregate(weeks);
  const sorted = weeks.slice().sort((a, b) => b.avg - a.avg);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const prev = previousWeeks(series, preset.months);
  const prevAgg = prev.length ? aggregate(prev) : null;
  const monthly = monthlySeriesFromWeeks(weeks);

  const lines = [
    `Categorie: ${dim.label} — "${dim.full}"`,
    `Interval analizat: ${preset.label}`,
    `Medie pe interval: ${agg.avg.toFixed(2)} din 5 (${agg.n} răspunsuri)`,
    `Medie generală a categoriei (tot istoricul): ${globalAvg.toFixed(2)}`,
  ];
  if (prevAgg) {
    const delta = agg.avg - prevAgg.avg;
    lines.push(`Față de perioada anterioară echivalentă: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} (era ${prevAgg.avg.toFixed(2)})`);
  }
  lines.push(`Cel mai bun moment: ${best.date} (medie ${best.avg.toFixed(2)})`);
  if (worst.date !== best.date) lines.push(`Cel mai slab moment: ${worst.date} (medie ${worst.avg.toFixed(2)})`);
  lines.push('Evoluție lunară în acest interval:');
  monthly.forEach((m) => lines.push(`- ${m.label}: ${m.avg.toFixed(2)} (${m.n} răspunsuri)`));

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: 'Ești un asistent care analizează evoluția în timp a unei categorii din feedback-ul de duminică al unei biserici, pentru echipa de conducere. Ai la dispoziție doar cifre agregate (medii, evoluție lunară, cel mai bun/slab moment) — NU ai acces la comentariile text ale respondenților. Scrie în română, un singur paragraf scurt (2-3 propoziții), concret: spune clar dacă tendința e crescătoare, descrescătoare sau stabilă, și menționează un moment notabil dacă există. Nu specula cauze pe care nu le poți deduce din cifre. Nu folosi marcaje de listă, introduceri sau concluzii generice. Răspunde DOAR cu paragraful.',
      messages: [{ role: 'user', content: lines.join('\n') }],
    }),
  });
  if (!resp.ok) {
    throw new Error(`Anthropic API error (${resp.status}): ${await resp.text()}`);
  }
  const data = await resp.json();
  return (data.content || []).map((b) => b.text || '').join('\n').trim();
}

// Rapid — un singur KV.get, niciun apel către Claude. Sigur de folosit sincron în render.
export async function getCachedTrendSummary(env, dimKey, rangeKey, weeks) {
  if (!env.ANTHROPIC_API_KEY || !env.PULSUL_KV) return null;
  const kvKey = await kvKeyFor(dimKey, rangeKey, weeks);
  return env.PULSUL_KV.get(kvKey);
}

// Lent (apel real către Claude) — NU se așteaptă în calea de randare, se pornește prin
// ctx.waitUntil(...) după ce pagina a fost deja trimisă.
export async function generateAndCacheTrendSummary(env, dim, preset, weeks, series, globalAvg) {
  if (!env.ANTHROPIC_API_KEY || !env.PULSUL_KV) return;
  const kvKey = await kvKeyFor(dim.key, preset.key, weeks);
  const existing = await env.PULSUL_KV.get(kvKey);
  if (existing) return; // altă cerere concurentă a apucat deja să-l genereze
  try {
    const text = await summarizeWithClaude(env, dim, preset, weeks, series, globalAvg);
    if (text) await env.PULSUL_KV.put(kvKey, text);
  } catch (err) {
    console.error('Analiză AI de tendință eșuată pentru', dim.key, preset.key, err);
    // fail-open: pagina funcționează normal, doar fără analiză pentru acea combinație
  }
}
