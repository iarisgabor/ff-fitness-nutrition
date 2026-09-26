// Date sintetice pentru teste — calculate RELATIV LA AZI, ca testele să nu „expire" când
// trec duminicile. Nimic de aici nu atinge Sheet-urile reale: rândurile ajung direct în
// KV-ul local (sheet_payload / preacher_schedule), exact forma pe care o cache-uiește render.js.
import { buildData } from '../src/transform.js';
import { DIMENSIONS } from '../src/config.js';

export const ADMIN = { username: 'BisericaLogos', password: 'test-admin-parola' };
export const MARIUS = { username: 'marius', password: 'parola-marius-test', preacher: 'Marius' };

const pad = (n) => String(n).padStart(2, '0');
export const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' });
export function addDays(slug, n) {
  const d = new Date(`${slug}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dow = (slug) => new Date(`${slug}T12:00:00Z`).getUTCDay();
const toDMY = (slug) => slug.split('-').reverse().join('.');

// ultima duminică trecută (strict înainte de azi) și duminicile care urmează (azi inclus, dacă e duminică)
export const LAST_SUNDAY = addDays(TODAY, -(dow(TODAY) || 7));
const FIRST_UPCOMING = addDays(TODAY, (7 - dow(TODAY)) % 7);
export const UPCOMING = Array.from({ length: 12 }, (_, i) => addDays(FIRST_UPCOMING, i * 7));

const ROTATION = ['Laviniu', 'Marius', 'Beni I', 'Beni Oz'];
// calendar de predicare: 5 duminici trecute + 12 viitoare
const PAST_SPEAKERS = { 0: 'Beni Oz', 1: 'Marius', 2: 'Beni I', 3: 'Laviniu', 4: 'Beni Oz' }; // săptămâni în urmă de la LAST_SUNDAY
export const SCHEDULE = [
  ...Object.entries(PAST_SPEAKERS).map(([w, speaker]) => ({ date: toDMY(addDays(LAST_SUNDAY, -7 * w)), speaker })),
  ...UPCOMING.map((d, i) => ({ date: toDMY(d), speaker: ROTATION[i % 4] })),
];

export const DAY_WITH_FEEDBACK = LAST_SUNDAY;           // /zile/:slug — predică Beni Oz
export const MARIUS_SUNDAY = UPCOMING[1];               // duminica lui Marius, cu program creat
export const OTHER_UPCOMING = UPCOMING[2];              // program creat, dar nevizitat în testul PWA
// programe create de run.mjs: [data, predicator]
export const PROGRAMS = [
  [LAST_SUNDAY, 'Beni Oz'],
  [UPCOMING[0], 'Laviniu'],
  [MARIUS_SUNDAY, 'Marius'],
  [OTHER_UPCOMING, 'Beni I'],
];

// Al treilea Sheet ("Participare parteneri") — prezența nu mai vine din PATCH pe Program
// (vezi CLAUDE.md, regula 19), ci din `attendance_sheet` în KV, la fel ca `preacher_schedule`.
// Independentă de PROGRAMS (Sheet-ul se completează pentru fiecare duminică, nu doar
// pentru cele cu Program creat) — 8 duminici trecute, ca /prezenta să aibă ce desena.
export const ATTENDANCE = Array.from({ length: 8 }, (_, i) => {
  const w = 7 - i; // 7..0 săptămâni în urmă de la LAST_SUNDAY -> cronologic ascendent
  const members = 58 + (w * 3) % 18;
  const guests = 6 + (w % 6);
  return { date: toDMY(addDays(LAST_SUNDAY, -7 * w)), members, guests, total: members + guests, percent: Math.round(members / 80 * 100) };
});

// ---- răspunsurile la formular: 28 de duminici, până la LAST_SUNDAY inclusiv
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const TEXTS = [
  'M-am simțit foarte bine primit, cineva a venit să vorbească cu mine înainte de întâlnire.',
  'Închinarea a fost autentică, dar volumul a fost puțin prea tare în primele rânduri.',
  'Predica a fost clară și foarte practică pentru săptămâna care urmează, mulțumesc!',
  'Rugăciunea în grup mic m-a ajutat să mă deschid, deși la început a fost ciudat.',
  'Cina Domnului a fost un moment profund, aș vrea puțin mai mult timp de liniște.',
  'Încheierea a fost cam grăbită, anunțurile au durat prea mult.',
  'Sigur voi reveni și o să aduc și un prieten data viitoare.',
  '', '', '',
];
const AGES = ['sub 20 ani', 'intre 20 si 35 ani', 'intre 35 si 50 ani', 'intre 50 si 65 ani', 'peste 65 ani', ''];

export function buildPayload() {
  const responses = [];
  for (let w = 27; w >= 0; w--) {
    const slug = addDays(LAST_SUNDAY, -7 * w);
    const complete = w === 0; // ultima duminică: 6 răspunsuri, toate categoriile notate (testele de slideshow)
    const n = complete ? 6 : 3 + Math.floor(rnd() * 7);
    for (let i = 0; i < n; i++) {
      const r = {
        date: toDMY(slug), time: `${pad(12 + Math.floor(rnd() * 10))}:${pad(Math.floor(rnd() * 60))}`,
        age: AGES[Math.floor(rnd() * AGES.length)], name: rnd() < 0.3 ? ['Ana', 'Mihai', 'Ioana', 'Dan'][Math.floor(rnd() * 4)] : '',
      };
      for (const dim of DIMENSIONS) {
        const skip = !complete && rnd() < 0.12;
        r[dim.key] = {
          r: skip ? '' : String(Math.min(5, Math.max(1, Math.round(3.2 + rnd() * 1.8)))),
          t: rnd() < 0.45 ? TEXTS[Math.floor(rnd() * TEXTS.length)] : '',
        };
      }
      responses.push(r);
    }
  }
  return { responses, data: buildData(responses) };
}
