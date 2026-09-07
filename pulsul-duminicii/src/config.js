// Mapare explicită coloană-Sheet -> categorie/dimensiune.
//
// Confirmat contra Sheet-ului real (2026-09-07, id 1NIRVF-Dfxbu3BweApf9eWhMW80ZLeXw6RGPAVAQieic):
// tab-ul cu răspunsurile brute se numește "Răspunsuri la formular 1" (numele implicit
// RO al Google Forms), header-ul e exact în ordinea de mai jos (rating urmat imediat
// de coloana lui de text, pentru fiecare din cele 7 dimensiuni — q4 lipsește real din
// formular), iar `keywords` de mai jos identifică fiecare coloană de RATING (nu și pe
// cea de text — vezi transform.js pentru de ce: coloana de text nu repetă tema
// dimensiunii în header, e luată automat ca "următoarea coloană").

export const SHEET_RANGE = "'Răspunsuri la formular 1'!A1:Z";

// Fiecare dimensiune are cuvinte-cheie (fără diacritice, minuscule) căutate în
// headerul coloanelor. Dintre coloanele care conțin cuvântul-cheie, cea ale cărei
// valori sunt aproape toate cifre 1-5 e tratată ca "rating"; cealaltă, ca "text".
export const DIMENSIONS = [
  {
    key: 'q1',
    label: 'Primire și conectare',
    full: 'Cât de bine te-ai simțit primit și conectat la începutul întâlnirii?',
    keywords: ['primi', 'conect', 'binevenit'], // 'primi' acoperă și "primire" și "primit"
  },
  {
    key: 'q2',
    label: 'Închinare',
    full: 'Cât de relevant și autentic a fost timpul de închinare?',
    keywords: ['inchina'], // stem scurt — acoperă și "închinării" (genitiv)
  },
  {
    key: 'q3',
    label: 'Rugăciune în grup mic',
    full: 'Cât de semnificativă a fost experiența rugăciunii în grup mic?',
    keywords: ['rugaciun'], // stem scurt — acoperă și "rugăciunii" (genitiv)
  },
  // q4 lipsește intenționat — formularul real sare peste el.
  {
    key: 'q5',
    label: 'Predică',
    full: 'Cât de clară și relevantă a fost predica pentru viața ta?',
    keywords: ['predic'],
  },
  {
    key: 'q6',
    label: 'Cina Domnului',
    full: 'Cât de profund ai experimentat momentul Cinei Domnului?',
    keywords: ['cina domnului', 'cina', 'cinei'], // "Cinei Domnului" (genitiv) nu începe cu "cina"
  },
  {
    key: 'q7',
    label: 'Încheierea întâlnirii',
    full: 'Cât de bine a fost încheiată întâlnirea?',
    keywords: ['inchei'], // acoperă "încheiere", "încheiată", "încheietor" etc.
  },
  {
    key: 'q8',
    label: 'Recomandare și revenire',
    full: 'Cât de probabil este să revii sau să recomanzi această întâlnire?',
    keywords: ['recoman', 'revin', 'reveni', 'revii'],
  },
];

export const META_COLUMNS = {
  timestamp: { keywords: ['marcaj de timp', 'timestamp'] },
  age: { keywords: ['varsta', 'vârst'] },
  name: { keywords: ['nume'] },
};

export const AGE_BUCKETS = [
  { match: 'sub 20', label: 'sub 20 ani' },
  { match: '20', label: '20–35 ani' }, // "intre 20 si 35 ani" conține "20"
  { match: '35', label: '35–50 ani' },
  { match: '50', label: '50–65 ani' },
  { match: '65', label: 'peste 65 ani' },
];
export const AGE_FALLBACK_LABEL = 'nespecificat';

export const MAX_QUOTES_PER_DIMENSION = 3;
