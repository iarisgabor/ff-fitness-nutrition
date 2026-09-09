import { DIMENSIONS, META_COLUMNS, AGE_BUCKETS, AGE_FALLBACK_LABEL, MAX_QUOTES_PER_DIMENSION } from './config.js';

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // scoate diacriticele
    .trim();
}

// Potrivire pe "început de cuvânt", nu substring oarecare: "nume" nu trebuie să
// bifeze "anume", dar "inchei" trebuie să bifeze atât "incheiere" cât și "incheiata"
// (forme diferite ale aceluiași cuvânt). Cuvântul-cheie trebuie să apară imediat
// după începutul textului sau după un caracter care nu e literă/cifră.
function containsAny(normalizedHeader, keywords) {
  return keywords.some((kw) => {
    const escaped = normalizeText(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}`).test(normalizedHeader);
  });
}

function isRatingLike(value) {
  return /^[1-5]$/.test(String(value || '').trim());
}

// Dintre coloanele care conțin cuvântul-cheie al unei dimensiuni, alege ca "rating"
// pe cea ale cărei valori sunt aproape toate cifre 1-5. Coloana de text a aceleiași
// dimensiuni NU se caută independent după cuvinte-cheie (headerul ei explică de obicei
// altceva, ex. "Ce a facilitat sau a împiedicat deschiderea ta în grup?" pentru
// dimensiunea Rugăciune — fără niciun cuvânt comun cu "rugăciune") — se ia pur și
// simplu coloana imediat următoare, așa cum e structurat formularul real (rating,
// apoi explicația lui, mereu adiacente).
function findRatingColumn(candidateIndexes, rows) {
  let ratingCol = null;
  let bestScore = -1;
  for (const idx of candidateIndexes) {
    let filled = 0;
    let ratingLike = 0;
    for (const row of rows) {
      const v = row[idx];
      if (v === undefined || v === '') continue;
      filled++;
      if (isRatingLike(v)) ratingLike++;
    }
    const score = filled ? ratingLike / filled : 0;
    if (score > bestScore) {
      bestScore = score;
      ratingCol = idx;
    }
  }
  return bestScore > 0.5 ? ratingCol : null;
}

export function buildColumnMap(headerRow, dataRows) {
  const normalizedHeaders = headerRow.map(normalizeText);

  const dimensionColumns = {};
  for (const dim of DIMENSIONS) {
    const candidates = normalizedHeaders
      .map((h, idx) => (containsAny(h, dim.keywords) ? idx : -1))
      .filter((idx) => idx !== -1);
    const ratingCol = candidates.length ? findRatingColumn(candidates, dataRows) : null;
    dimensionColumns[dim.key] = {
      ratingCol,
      textCol: ratingCol != null ? ratingCol + 1 : null,
    };
  }

  const findMeta = (keywords) => {
    const idx = normalizedHeaders.findIndex((h) => containsAny(h, keywords));
    return idx === -1 ? null : idx;
  };

  return {
    timestampCol: findMeta(META_COLUMNS.timestamp.keywords) ?? 0, // implicit prima coloană
    ageCol: findMeta(META_COLUMNS.age.keywords),
    nameCol: findMeta(META_COLUMNS.name.keywords),
    dimensionColumns,
  };
}

// Formularul se completează despre întâlnirea de duminică, dar răspunsurile mai
// vin și luni/marți (rar, și cu o zi-două înainte) — trebuie atribuite tot
// duminicii la care se referă, nu zilei calendaristice în care a fost trimis
// răspunsul. Alegem duminica cea mai apropiată de data trimiterii (înainte SAU
// după); când distanța e egală n-are cum să fie (o săptămână are 7 zile, nu se
// poate ajunge la egalitate), deci nu e nevoie de o regulă de egalitate.
function snapToNearestSunday(day, month, year) {
  const d = new Date(year, month - 1, day);
  const dow = d.getDay(); // 0=duminică ... 6=sâmbătă
  if (dow !== 0) {
    const back = dow;
    const forward = 7 - dow;
    d.setDate(d.getDate() + (back <= forward ? -back : forward));
  }
  return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
}

// Acceptă "17/05/2026 23:44:15", "17.05.2026 23:44:15" sau variante cu lună/zi
// inversate; implicit zi-lună-an când e ambiguu (potrivit cu formatul RO existent).
export function parseTimestamp(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{1,4})[.\/\-](\d{1,2})[.\/\-](\d{1,4})[ ,T]+(\d{1,2}):(\d{2})/);
  if (!m) return { date: '', time: '' };
  let [, a, b, c, hh, mm] = m;
  let day, month, year;
  if (a.length === 4) {
    // AAAA-LL-ZZ
    year = a; month = b; day = c;
  } else if (Number(a) > 12) {
    day = a; month = b; year = c;
  } else if (Number(b) > 12) {
    month = a; day = b; year = c;
  } else {
    day = a; month = b; year = c; // implicit zi-lună-an
  }
  const yyyy = Number(year.length === 2 ? `20${year}` : year);
  const sunday = snapToNearestSunday(Number(day), Number(month), yyyy);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${pad(sunday.day)}.${pad(sunday.month)}.${sunday.year}`,
    time: `${pad(hh)}:${mm}`,
  };
}

export function rowsToResponses(rows, columnMap) {
  return rows.map((row) => {
    const { date, time } = parseTimestamp(row[columnMap.timestampCol]);
    const response = {
      date,
      time,
      age: columnMap.ageCol != null ? String(row[columnMap.ageCol] || '').trim() : '',
      name: columnMap.nameCol != null ? String(row[columnMap.nameCol] || '').trim() : '',
    };
    for (const dim of DIMENSIONS) {
      const cols = columnMap.dimensionColumns[dim.key];
      const r = cols.ratingCol != null ? String(row[cols.ratingCol] || '').trim() : '';
      const t = cols.textCol != null ? String(row[cols.textCol] || '').trim() : '';
      response[dim.key] = { r: isRatingLike(r) ? r : '', t };
    }
    return response;
  }).filter((r) => r.date); // ignoră rânduri fără dată validă (ex. rând gol la final)
}

function dimensionStats(responses) {
  return DIMENSIONS.map((dim) => {
    const dist = [0, 0, 0, 0, 0];
    let sum = 0;
    let n = 0;
    for (const r of responses) {
      const v = Number(r[dim.key]?.r);
      if (v >= 1 && v <= 5) {
        dist[v - 1]++;
        sum += v;
        n++;
      }
    }
    return { key: dim.key, label: dim.label, full: dim.full, avg: n ? sum / n : 0, n, dist };
  });
}

// "06.09.2026" -> "2026-09-06", pentru URL-uri (/zile/2026-09-06).
export function dateToSlug(dmy) {
  const [dd, mm, yyyy] = (dmy || '').split('.');
  return yyyy ? `${yyyy}-${mm}-${dd}` : '';
}

// "2026-09-06" -> "06.09.2026", ca să regăsim ziua cerută în URL printre RESPONSES.
export function slugToDate(slug) {
  const [yyyy, mm, dd] = (slug || '').split('-');
  return yyyy ? `${dd}.${mm}.${yyyy}` : '';
}

export function perResponseAverage(response) {
  let sum = 0;
  let n = 0;
  for (const dim of DIMENSIONS) {
    const v = Number(response[dim.key]?.r);
    if (v >= 1 && v <= 5) { sum += v; n++; }
  }
  return n ? sum / n : null;
}

const MONTHS_RO_FULL = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const MONTHS_RO_SHORT = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'noi', 'dec'];

function monthlyTrend(responses) {
  const byMonth = new Map(); // "YYYY-MM" -> {sum, n}
  for (const r of responses) {
    const [dd, mm, yyyy] = (r.date || '').split('.');
    if (!yyyy) continue;
    const avg = perResponseAverage(r);
    if (avg == null) continue;
    const key = `${yyyy}-${mm}`;
    if (!byMonth.has(key)) byMonth.set(key, { sum: 0, n: 0, mm: Number(mm) });
    const acc = byMonth.get(key);
    acc.sum += avg;
    acc.n += 1;
  }
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, acc]) => {
      const yyyy = key.split('-')[0];
      return {
        label: `${capitalize(MONTHS_RO_FULL[acc.mm - 1])} ${yyyy}`,
        short: capitalize(MONTHS_RO_SHORT[acc.mm - 1]),
        n: acc.n,
        avg: acc.sum / acc.n,
      };
    });
}

function ageBucketsFrom(responses) {
  const counts = new Map();
  for (const bucket of AGE_BUCKETS) counts.set(bucket.label, 0);
  counts.set(AGE_FALLBACK_LABEL, 0);
  for (const r of responses) {
    const norm = normalizeText(r.age);
    if (!norm) { counts.set(AGE_FALLBACK_LABEL, counts.get(AGE_FALLBACK_LABEL) + 1); continue; }
    const bucket = AGE_BUCKETS.find((b) => norm.includes(normalizeText(b.match)));
    const label = bucket ? bucket.label : AGE_FALLBACK_LABEL;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n > 0)
    .map(([label, n]) => ({ label, n }));
}

function pickQuotes(responses) {
  const quotes = {};
  const sorted = responses.slice().sort((a, b) => (a.date < b.date ? 1 : -1)); // cele mai recente primele
  for (const dim of DIMENSIONS) {
    const candidates = sorted
      .map((r) => r[dim.key]?.t)
      .filter((t) => t && t.trim().length >= 15);
    quotes[dim.key] = candidates.slice(0, MAX_QUOTES_PER_DIMENSION);
  }
  return quotes;
}

// Un rând per duminică, pentru pagina /zile — dată, slug (link), număr de
// răspunsuri, media compozită a acelei zile. Sortat cronologic descrescător
// (cea mai recentă duminică prima).
export function summarizeByDate(responses) {
  const byDate = new Map();
  for (const r of responses) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }
  return [...byDate.entries()]
    .map(([date, items]) => {
      const averages = items.map(perResponseAverage).filter((v) => v != null);
      return {
        date,
        slug: dateToSlug(date),
        count: items.length,
        avg: averages.length ? averages.reduce((a, b) => a + b, 0) / averages.length : null,
      };
    })
    .sort((a, b) => {
      const [da, ma, ya] = a.date.split('.').map(Number);
      const [db, mb, yb] = b.date.split('.').map(Number);
      return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da);
    });
}

// Pentru fiecare dimensiune, un punct per duminică (ordine cronologică ascendentă —
// invers față de summarizeByDate, care e descendent pentru listă) — folosit de pagina
// de analiză pe categorie pentru a filtra pe interval de timp complet client-side,
// fără alt fetch. dist[i] = câte note (i+1) s-au dat în acea dimensiune, în acea zi.
export function categoryWeeklySeries(responses) {
  const byDate = new Map();
  for (const r of responses) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push(r);
  }
  const dates = [...byDate.keys()].sort((a, b) => {
    const [da, ma, ya] = a.split('.').map(Number);
    const [db, mb, yb] = b.split('.').map(Number);
    return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
  });

  const series = {};
  for (const dim of DIMENSIONS) {
    series[dim.key] = dates.map((date) => {
      const items = byDate.get(date);
      const dist = [0, 0, 0, 0, 0];
      let sum = 0;
      let n = 0;
      for (const r of items) {
        const v = Number(r[dim.key]?.r);
        if (v >= 1 && v <= 5) {
          dist[v - 1]++;
          sum += v;
          n++;
        }
      }
      return { date, slug: dateToSlug(date), n, avg: n ? sum / n : 0, dist };
    });
  }
  return series;
}

// Sub acest număr de duminici cu date în AMBELE categorii, o corelație e prea
// zgomotoasă ca să fie de încredere — raportăm "date insuficiente" în loc de un r fals.
const MIN_CORRELATION_PAIRS = 6;

// Coeficient Pearson între mediile săptămânale a două categorii, calculat doar pe
// duminicile unde ambele au n>0 (altfel o zi cu 0 răspunsuri la una ar contamina media
// cu 0, nu cu "lipsă date"). Sub pragul minim de perechi -> null (date insuficiente).
function pearsonCorrelation(seriesA, seriesB) {
  const byDateB = new Map(seriesB.map((w) => [w.date, w]));
  const pairs = [];
  for (const wa of seriesA) {
    if (wa.n <= 0) continue;
    const wb = byDateB.get(wa.date);
    if (!wb || wb.n <= 0) continue;
    pairs.push([wa.avg, wb.avg]);
  }
  if (pairs.length < MIN_CORRELATION_PAIRS) return null;

  const n = pairs.length;
  const meanX = pairs.reduce((s, [x]) => s + x, 0) / n;
  const meanY = pairs.reduce((s, [, y]) => s + y, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (const [x, y] of pairs) {
    const dx = x - meanX, dy = y - meanY;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return { r: denom ? num / denom : 0, n };
}

// Toate perechile unice de categorii (21 pentru 7 dimensiuni, fără diagonală), cu
// coeficientul lor de corelație — folosit de heatmap-ul de pe /categorii.
export function categoryCorrelationMatrix(categorySeries) {
  const keys = DIMENSIONS.map((d) => d.key);
  const pairs = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i], b = keys[j];
      const result = pearsonCorrelation(categorySeries[a], categorySeries[b]);
      pairs.push({ a, b, r: result ? result.r : null, n: result ? result.n : 0 });
    }
  }
  return pairs;
}

export function buildData(responses) {
  const dims = dimensionStats(responses);
  const answeredDims = dims.filter((d) => d.n > 0);
  const overallAvg = answeredDims.length
    ? answeredDims.reduce((sum, d) => sum + d.avg, 0) / answeredDims.length
    : 0;
  const categorySeries = categoryWeeklySeries(responses);
  return {
    overallAvg,
    dims,
    months: monthlyTrend(responses),
    ages: ageBucketsFrom(responses),
    quotes: pickQuotes(responses),
    categorySeries,
    categoryCorrelations: categoryCorrelationMatrix(categorySeries),
  };
}
