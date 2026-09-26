// Parsare + citire pentru al TREILEA Sheet — "Participare parteneri": prezența
// (parteneri + musafiri) la fiecare duminică, completată acum într-un Sheet separat,
// nu mai manual în Program duminică (înlocuiește vechiul câmp `sundays.attendance`
// editabil de admin — vezi CLAUDE.md).
//
// Sheet-ul are o coloană per membru (0/1, prezent sau nu) — nu ne interesează
// individual, citim doar coloanele agregate: Data, Total parteneri, Musafiri, Total.
// Match EXACT pe header (nu containsAny ca la celelalte Sheet-uri): "Total" și
// "Total parteneri" conțin amândouă cuvântul "total", iar o potrivire pe cuvânt-cheie
// ar lua-o pe prima găsită (greșit) în loc de coloana chiar numită "Total".
//
// Fetch-ul + cache-ul stau AICI, nu în render.js ca la getSchedule — program.js
// (rutele de scriere ale Programului) au nevoie de prezență ca să răspundă cu date
// proaspete după fiecare salvare, și un import din render.js ar crea un ciclu
// (render.js importă deja din program.js).

import { getAccessToken, fetchSheetValues } from './sheets.js';
import { normalizeText, dateToSlug } from './transform.js';
import { ATTENDANCE_SHEET_RANGE } from './config.js';

export function buildAttendanceColumnMap(headerRow) {
  const normalized = headerRow.map(normalizeText);
  const findExact = (label) => {
    const idx = normalized.findIndex((h) => h === label);
    return idx === -1 ? null : idx;
  };
  return {
    dateCol: findExact('data') ?? 1,
    membersCol: findExact('total parteneri'),
    guestsCol: findExact('musafiri'),
    totalCol: findExact('total'),
  };
}

// "4.1.2026" / "04.01.2026" -> "04.01.2026" — la fel ca preachers.js.
function toInternalDate(raw) {
  const m = String(raw || '').trim().match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})/);
  if (!m) return '';
  const [, d, mo, y] = m;
  const yyyy = y.length === 2 ? `20${y}` : y;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d)}.${pad(mo)}.${yyyy}`;
}

function toInt(raw) {
  const n = Number(String(raw ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function rowsToAttendance(rows, columnMap) {
  return rows
    .map((row) => ({
      date: toInternalDate(row[columnMap.dateCol]),
      members: columnMap.membersCol != null ? toInt(row[columnMap.membersCol]) : null,
      guests: columnMap.guestsCol != null ? toInt(row[columnMap.guestsCol]) : null,
      total: columnMap.totalCol != null ? toInt(row[columnMap.totalCol]) : null,
    }))
    // O dată neparsabilă sau fără total nu poate fi folosită — restul rândului
    // (checkbox-urile per membru) nu ne interesează, așa că nu blocăm pe ele.
    .filter((r) => r.date && r.total != null);
}

const ATTENDANCE_KEY = 'attendance_sheet';
const ATTENDANCE_LAST_GOOD_KEY = 'attendance_sheet:last_good';
const ATTENDANCE_TTL_SECONDS = 10 * 60;

async function fetchAndTransformAttendance(env) {
  const accessToken = await getAccessToken(env);
  const rows = await fetchSheetValues(env, accessToken, env.ATTENDANCE_SHEET_ID, ATTENDANCE_SHEET_RANGE);
  if (!rows.length) return [];
  const [headerRow, ...dataRows] = rows;
  const columnMap = buildAttendanceColumnMap(headerRow);
  return rowsToAttendance(dataRows, columnMap);
}

// Fail-soft ca getSchedule din render.js: fără ATTENDANCE_SHEET_ID, sau la eroare de
// fetch fără nicio versiune bună în cache, întoarce rows: [] + error — nicio pagină
// nu depinde strict de acest Sheet.
//
// `ctx` e opțional: cu el (paginile randate, care au ExecutionContext), scrierea în
// cache e fire-and-forget prin ctx.waitUntil, ca la celelalte Sheet-uri. Fără el
// (apelat din program.js, la fiecare salvare din editorul de Program), se scrie
// sincron — un singur put în KV, cost neglijabil pe o cerere care oricum scrie în D1.
export async function getAttendance(env, ctx) {
  if (!env.ATTENDANCE_SHEET_ID) {
    return { rows: [], stale: false, error: 'ATTENDANCE_SHEET_ID nu e setat în wrangler.toml.' };
  }
  if (env.PULSUL_KV) {
    const cached = await env.PULSUL_KV.get(ATTENDANCE_KEY, 'json');
    if (cached) return { rows: cached, stale: false, error: null };
  }
  try {
    const rows = await fetchAndTransformAttendance(env);
    if (env.PULSUL_KV) {
      const write = Promise.all([
        env.PULSUL_KV.put(ATTENDANCE_KEY, JSON.stringify(rows), { expirationTtl: ATTENDANCE_TTL_SECONDS }),
        env.PULSUL_KV.put(ATTENDANCE_LAST_GOOD_KEY, JSON.stringify(rows)),
      ]);
      if (ctx) ctx.waitUntil(write); else await write;
    }
    return { rows, stale: false, error: null };
  } catch (err) {
    console.error('fetchAndTransformAttendance a eșuat:', err);
    const lastGood = env.PULSUL_KV ? await env.PULSUL_KV.get(ATTENDANCE_LAST_GOOD_KEY, 'json') : null;
    if (lastGood) return { rows: lastGood, stale: true, error: null };
    return { rows: [], stale: false, error: 'Nu am putut citi prezența — verifică accesul service account-ului pe Sheet-ul de prezență.' };
  }
}

// Rândul de prezență pentru o dată "YYYY-MM-DD" (slug, ca sundays.date) — alătură pe
// dateToSlug(rândului), fiindcă Sheet-ul ține data ca "DD.MM.AAAA".
export function attendanceForSlug(rows, slug) {
  return rows.find((r) => dateToSlug(r.date) === slug) || null;
}
