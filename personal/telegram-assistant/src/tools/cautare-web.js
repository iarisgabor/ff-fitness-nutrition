// Căutare pe internet.
//
// Nu folosim un API de căutare separat (Brave, Google CSE, Serper) — ar însemna încă o cheie,
// încă un furnizor, și tot ar trebui citite și rezumate paginile. În schimb, punem o întrebare
// unui Claude care are unealta de căutare RULATĂ DE ANTHROPIC (server-side): el caută, deschide
// ce trebuie și întoarce un răspuns gata rezumat, cu surse.
//
// Costul e al căutării (~10 $ / 1000 de căutări) plus tokenii cererii. De-aia `max_uses` e mic:
// la o întrebare de genul „ce s-a mai întâmplat în lume", trei-patru căutări sunt de ajuns, iar
// un plafon ține și latența în frâu — în voce, omul așteaptă cu telefonul la ureche.

import { ANTHROPIC_API_URL, ANTHROPIC_MODEL } from '../anthropic.js';
import { buildDateContext } from '../prompt.js';

export const CAUTA_PE_NET_TOOL = {
  name: 'cauta_pe_net',
  description:
    'Caută pe internet și întoarce un răspuns scurt, cu surse. Folosește-o pentru orice ' +
    'depinde de informații de ACUM sau pe care nu le știi sigur: știri și ce s-a întâmplat ' +
    'în lume, vremea, rezultate sportive, prețuri, cursuri valutare, programul unui loc, ' +
    'noutăți despre o firmă sau o persoană publică, verificarea unui fapt. NU o folosi pentru ' +
    'lucruri din calendar, Planning Center, aerul condiționat sau conversațiile voastre — ' +
    'alea au uneltele lor.',
  input_schema: {
    type: 'object',
    properties: {
      intrebare: {
        type: 'string',
        description:
          'Întrebarea, formulată complet și de sine stătător, în română. Scrie-o ca și cum ' +
          'ai întreba pe cineva care nu a auzit conversația: "ce s-a întâmplat în Ucraina în ' +
          'ultimele zile", nu "și acolo ce mai e".',
      },
    },
    required: ['intrebare'],
    additionalProperties: false,
  },
};

// Câte căutări și câte pagini deschise are voie într-o singură întrebare.
const MAX_CAUTARI = 6;
const MAX_PAGINI = 3;
// Bucla server-side a lui Anthropic se poate opri cu `pause_turn` dacă atinge limita ei internă
// de iterații; se reia retrimițând conversația. Două reluări sunt suficiente pentru plafonul de
// mai sus — mai multe ar însemna oricum un răspuns prea lung pentru voce.
const MAX_RELUARI = 2;
const TIMP_MAXIM_MS = 45000;

const SYSTEM = `Ești partea care caută pe internet pentru un asistent personal care vorbește
românește, adesea prin voce.

- Răspunde ÎNTOTDEAUNA în română, chiar dacă sursele sunt în altă limbă.
- Scurt: 2-5 propoziții. Dacă sunt mai multe lucruri de spus, spune-le legat, în frază, nu ca listă.
- Fără markdown, fără bulinuțe, fără linkuri în text — răspunsul poate fi citit cu voce tare.
- Spune datele concrete (cifre, date calendaristice, nume) și CÂND s-a întâmplat, nu doar "recent".
- Dacă sursele se contrazic sau informația e nesigură, spune asta explicit.
- Dacă nu găsești nimic relevant, spune limpede că nu ai găsit — nu inventa.

PROSPEȚIMEA, când întrebarea e despre "ultimul", "cel mai recent", "acum", "azi":
- Fragmentele din rezultatele căutării sunt adesea VECHI: un articol popular de acum o
  săptămână iese înaintea unuia de ieri. Nu te lua după ele. DESCHIDE pagina care ține
  evidența la zi (rezultate oficiale, clasament, pagina echipei, site-ul instituției) și
  citește de acolo rândul cel mai recent.
- Compară ÎNTOTDEAUNA data a ceea ce ai găsit cu data de azi, care ți se dă în întrebare.
  Dacă ce ai găsit e mai vechi de câteva zile și subiectul se schimbă des (sport, știri,
  prețuri), mai caută o dată, altfel riști să dai drept "ultimul" ceva depășit.
- Spune data a ceea ce raportezi ("pe 16 septembrie"), ca omul să poată judeca singur dacă
  e proaspăt. Asta e mai important decât să pari sigur.`;

function extrage(raspuns) {
  const text = [];
  const surse = [];
  let cautari = 0;

  for (const bloc of raspuns.content || []) {
    if (bloc.type === 'text' && bloc.text) text.push(bloc.text);

    if (bloc.type === 'server_tool_use' && bloc.name === 'web_search') cautari += 1;

    if (bloc.type === 'web_fetch_tool_result') {
      const adresa = bloc.content?.url;
      if (adresa && !surse.some((x) => x.url === adresa)) {
        surse.push({ titlu: bloc.content?.document?.title || adresa, url: adresa });
      }
    }

    if (bloc.type === 'web_search_tool_result') {
      // La succes `content` e o LISTĂ de rezultate; la eroare e un OBIECT ({error_code}).
      // Fără verificarea asta, un `.map` peste eroare ar arunca și ar masca motivul real.
      if (!Array.isArray(bloc.content)) {
        console.error('WEB_SEARCH_TOOL_ERROR', JSON.stringify(bloc.content).slice(0, 200));
        continue;
      }
      for (const rezultat of bloc.content) {
        if (rezultat?.url && !surse.some((s) => s.url === rezultat.url)) {
          surse.push({ titlu: rezultat.title || rezultat.url, url: rezultat.url });
        }
      }
    }
  }

  return { text: text.join('\n').trim(), surse, cautari };
}

export async function cautaPeNet(env, input) {
  const cheie = (env.ANTHROPIC_API_KEY || '').trim();
  if (!cheie) {
    const err = new Error('Căutarea pe net nu e configurată (lipsește ANTHROPIC_API_KEY).');
    err.code = 'WEB_SEARCH_NOT_CONFIGURED';
    throw err;
  }

  const intrebare = (input.intrebare || '').trim();
  if (!intrebare) {
    const err = new Error('Spune ce anume să caut.');
    err.code = 'WEB_SEARCH_NO_QUERY';
    throw err;
  }

  // Data curentă merge cu întrebarea: fără ea, "în ultimele zile" sau "azi" n-au reper, iar
  // modelul care caută ar putea întoarce ceva vechi de-o lună crezând că e proaspăt.
  const conversatie = [
    { role: 'user', content: `${buildDateContext(env)}\n\n${intrebare}` },
  ];

  let ultim = null;
  const surseTotale = [];
  let cautariTotale = 0;

  for (let runda = 0; runda <= MAX_RELUARI; runda += 1) {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMP_MAXIM_MS),
      headers: {
        'content-type': 'application/json',
        'x-api-key': cheie,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        system: SYSTEM,
        messages: conversatie,
        // Unealta rulează la Anthropic, nu aici: nu există nimic de executat în Worker, doar
        // de citit rezultatul. `_20260209` filtrează rezultatele înainte să intre în context.
        tools: [
          { type: 'web_search_20260209', name: 'web_search', max_uses: MAX_CAUTARI },
          // Căutarea singură dă doar fragmente. Fără asta, la "ultimul meci al Barcelonei" a
          // raportat un meci de acum trei zile: fragmentul cel mai vizibil era al lui. Cu
          // web_fetch poate deschide pagina de rezultate și citi rândul de sus.
          { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: MAX_PAGINI },
        ],
      }),
    });

    if (!res.ok) {
      const detaliu = await res.text().catch(() => '');
      console.error('WEB_SEARCH_API_ERROR', res.status, detaliu.slice(0, 500));
      const err = new Error(`Căutarea a eșuat (${res.status}).`);
      err.code = 'WEB_SEARCH_FAILED';
      throw err;
    }

    ultim = await res.json();
    const { text, surse, cautari } = extrage(ultim);
    cautariTotale += cautari;
    for (const s of surse) if (!surseTotale.some((x) => x.url === s.url)) surseTotale.push(s);

    // `pause_turn`: bucla de căutare a lui Anthropic s-a oprit la jumătate. Se reia retrimițând
    // exact ce am primit, FĂRĂ un mesaj nou de utilizator — serverul vede blocul de unealtă
    // în coadă și continuă singur de unde a rămas.
    if (ultim.stop_reason === 'pause_turn') {
      conversatie.push({ role: 'assistant', content: ultim.content });
      continue;
    }

    return {
      raspuns: text || 'Nu am găsit nimic relevant.',
      surse: surseTotale.slice(0, 6),
      cautari: cautariTotale,
    };
  }

  // S-a oprit de fiecare dată în pauză: întoarcem ce s-a adunat, ca să nu piardă omul tot.
  const { text } = extrage(ultim || { content: [] });
  return {
    raspuns: text || 'Căutarea a durat prea mult și nu am ajuns la un răspuns clar.',
    surse: surseTotale.slice(0, 6),
    cautari: cautariTotale,
    incomplet: true,
  };
}
