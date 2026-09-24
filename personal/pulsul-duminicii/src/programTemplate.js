// Șablonul unei duminici noi — copiat după planul standard din Planning Center.
// Duratele sunt în secunde. Dacă se schimbă formatul standard al întâlnirii, doar
// aici se schimbă; duminicile deja create nu sunt atinse.
//
// `person: '__PREACHER__'` se înlocuiește la creare cu predicatorul ales pentru
// acea duminică (precompletat din „Calendar predicare").

export const PREACHER_PLACEHOLDER = '__PREACHER__';

export const DEFAULT_PROGRAM = [
  { kind: 'header', title: 'INTRO' },
  { kind: 'item', title: 'Anunțuri generale - loop', length_sec: 30 * 60 },
  { kind: 'item', title: 'Welcome', person: 'Beni sau Bea', length_sec: 3 * 60 },

  { kind: 'header', title: 'WORSHIP' },
  { kind: 'song', title: '', length_sec: 5 * 60 },
  { kind: 'song', title: '', length_sec: 5 * 60 },
  { kind: 'song', title: '', length_sec: 5 * 60 },

  { kind: 'header', title: 'PREDICA' },
  { kind: 'item', title: 'Intervenție rugăciune', length_sec: 5 * 60 },
  { kind: 'item', title: 'Colectă', length_sec: 3 * 60 },
  { kind: 'item', title: 'Predică', person: PREACHER_PLACEHOLDER, length_sec: 35 * 60 },
  { kind: 'item', title: 'Cina Domnului', person: PREACHER_PLACEHOLDER, length_sec: 10 * 60 },

  { kind: 'header', title: 'ÎNCHEIERE' },
  { kind: 'song', title: '', length_sec: 5 * 60 + 30 },
  { kind: 'item', title: 'Anunțuri', notes: 'Cine face și introducerea', length_sec: 5 * 60 },
  { kind: 'item', title: 'Încheiere', notes: 'Cine face și introducerea', length_sec: 2 * 60 },
];
