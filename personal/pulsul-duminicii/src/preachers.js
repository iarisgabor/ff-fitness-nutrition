// Parsare pentru al doilea Sheet — "Calendar predicare": cine predică în
// fiecare duminică. Complet separat de transform.js (acela e pentru Sheet-ul
// de feedback) — singurul lucru comun e formatul de dată intern "DD.MM.AAAA",
// ca cele două seturi de date să se poată alătura pe `date`.

import { PREACHER_COLUMNS } from './config.js';
import { normalizeText, containsAny } from './transform.js';

export function buildPreacherColumnMap(headerRow) {
  const normalized = headerRow.map(normalizeText);
  const find = (keywords) => {
    const idx = normalized.findIndex((h) => containsAny(h, keywords));
    return idx === -1 ? null : idx;
  };
  return {
    dateCol: find(PREACHER_COLUMNS.date.keywords) ?? 0,
    speakerCol: find(PREACHER_COLUMNS.speaker.keywords),
  };
}

// "30/08/2026" -> "30.08.2026" (zi-lună-an, ca în transform.js — Sheet-ul de
// predicare nu are ambiguitate: zilele din calendar sunt deja duminici reale,
// nu trebuie "prinse" de cea mai apropiată duminică ca la formularul de feedback.
function toInternalDate(raw) {
  const m = String(raw || '').trim().match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})/);
  if (!m) return '';
  const [, d, mo, y] = m;
  const yyyy = y.length === 2 ? `20${y}` : y;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d)}.${pad(mo)}.${yyyy}`;
}

export function rowsToSchedule(rows, columnMap) {
  return rows
    .map((row) => ({
      date: toInternalDate(row[columnMap.dateCol]),
      speaker: columnMap.speakerCol != null ? String(row[columnMap.speakerCol] || '').trim() : '',
    }))
    .filter((r) => r.date && r.speaker);
}

// Nume -> slug de URL. "Beni I" și "Beni Oz" sunt doi predicatori diferiți
// (confirmat), deci slug-urile lor trebuie să rămână distincte.
export function preacherSlug(name) {
  return normalizeText(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
