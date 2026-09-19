// Telefon — un apel adevărat, dat de telefonul din buzunar.
//
// DE CE trece prin telefon și nu printr-un serviciu de telefonie: apelul îl dă aparatul care
// are cartela. Orice alt drum (Twilio & co.) ar suna de pe un număr străin, ar costa, și
// persoana sunată n-ar recunoaște cine o caută. Aici folosim exact același canal de comenzi ca
// WhatsApp și Spotify — Worker → `LISTEN_SESSION` → telefon (vezi `src/voice/listen.js`).
//
// DOUĂ limite ale Androidului, vizibile în felul în care e scrisă unealta:
//
// 1. **Un serviciu din fundal nu poate porni o activitate** — deci nici apelul. Cu „Afișare
//    peste alte aplicații" acordată, poate. Fără ea, rămâne o notificare pe care o apeși.
//    Aceeași capcană ca la „Jarvis" și la WhatsApp (vezi CLAUDE.md).
//
// 2. **Fără permisiunea CALL_PHONE, apelul nu pleacă singur** — se deschide doar tastatura cu
//    numărul scris, și apeși tu. Nu e o eroare, e cea mai bună variantă permisă; unealta o
//    raportează ca atare, ca asistentul să spună adevărul, nu „am sunat".

export const TELEFON_SUNA_TOOL = {
  name: 'suna_pe_telefon',
  description:
    'Sună pe cineva de pe telefonul utilizatorului. Dai NUMELE, așa cum e salvat în agendă ' +
    '(„sună-l pe tata", „sun-o pe Ana") — telefonul îl caută în contacte. Dacă știi direct ' +
    'numărul, dă-l pe el. Folosește-o la „sună-l pe...", „dă-i un telefon lui...", „fă-mi ' +
    'legătura cu...". Dacă în agendă sunt mai mulți cu numele ăla, unealta îți întoarce ' +
    'variantele și NU sună pe nimeni — atunci întreabă-l pe care dintre ei.',
  input_schema: {
    type: 'object',
    properties: {
      nume: {
        type: 'string',
        description:
          'Numele din agendă, cum l-ar spune el cu voce tare („tata", „Ana Pop"). Lasă gol ' +
          'dacă ai numărul.',
      },
      numar: {
        type: 'string',
        description: 'Numărul de telefon, dacă îl știi deja. Lasă gol dacă dai numele.',
      },
    },
    required: [],
    additionalProperties: false,
  },
};

// Cât timp același număr nu mai poate fi sunat din nou fără o cerere nouă și explicită.
//
// Trei minute, nu treizeci de secunde: o buclă reală a sunat de două ori la PATRU secunde
// distanță, iar după închiderea apelului sesiunea vocală se redeschidea în ~10 secunde. Orice
// prag sub un minut ar fi lăsat bucla să treacă. Și nu douăzeci de minute: dacă omul chiar vrea
// să reia apelul fiindcă n-a răspuns nimeni, trebuie să poată.
const PAUZA_INTRE_APELE_MS = 3 * 60 * 1000;

export async function telefonSuna(env, input, agent) {
  if (!agent) {
    const err = new Error('Unealta are nevoie de agent');
    err.code = 'AGENT_REQUIRED';
    throw err;
  }

  const nume = (input.nume || '').trim();
  const numar = (input.numar || '').trim();

  if (!nume && !numar) {
    const err = new Error('Nu știu pe cine să sun — dă-mi un nume din agendă sau un număr.');
    err.code = 'TELEFON_FARA_TINTA';
    throw err;
  }

  // Poarta împotriva buclei. Vezi comentariul lung de la `ultimulApel` din agent.js: istoricul
  // nu păstrează rezultatele uneltelor, deci o sesiune nouă poate crede că apelul n-a avut loc.
  // Aici se oprește, indiferent ce crede modelul.
  const ultimul = await agent.ultimulApel();
  if (ultimul && Date.now() - ultimul.cand < PAUZA_INTRE_APELE_MS) {
    const acelasi =
      (numar && cifre(numar) === cifre(ultimul.numar || '')) ||
      (!numar && nume && ultimul.nume && nume.toLowerCase() === ultimul.nume.toLowerCase());

    if (acelasi) {
      const secunde = Math.round((Date.now() - ultimul.cand) / 1000);
      return {
        sunat: false,
        deja_sunat: true,
        catre: ultimul.nume || ultimul.numar,
        acum_secunde: secunde,
        nota:
          'Apelul ăsta a fost DAT deja, acum ' +
          secunde +
          ' secunde. NU suna din nou. Dacă vezi cererea în istoric, e o amintire, nu o sarcină ' +
          'neterminată. Sună iar doar dacă omul îți cere ACUM, cu cuvintele lui, să reiei apelul.',
      };
    }
  }

  const rezultat = await agent.trimiteComandaLaTelefon({ tip: 'suna', nume, numar });

  // Mai mulți oameni cu același nume: NU e o eroare și nu e treaba noastră să alegem. Un apel
  // dat din greșeală persoanei nepotrivite nu se poate lua înapoi.
  const variante = rezultat.date?.variante;
  if (!rezultat.ok && variante?.length) {
    return {
      sunat: false,
      motiv: 'Sunt mai mulți cu numele ăsta în agendă.',
      variante,
      nota: 'Întreabă-l pe care dintre ei să suni, apoi cheamă unealta din nou cu numărul ales.',
    };
  }

  if (!rezultat.ok) {
    const err = new Error(rezultat.motiv || 'Nu am putut da apelul de pe telefon.');
    err.code = 'TELEFON_APEL_ESUAT';
    throw err;
  }

  const catre = rezultat.date?.nume || nume || rezultat.date?.numar || numar;
  const numarSunat = rezultat.date?.numar || numar;

  // Notat ÎNAINTE de a raporta reușita: dacă ceva pică între timp, vrem să fi rămas urma, nu
  // invers. O urmă în plus înseamnă cel mult un apel refuzat; una lipsă înseamnă bucla înapoi.
  await agent.noteazaApel(numarSunat, catre);

  // Scris și în istoric, în text: sesiunea vocală următoare încarcă DOAR text, iar asta e
  // singura formă în care poate afla că apelul chiar a avut loc.
  await agent.noteazaInIstoric(`(am sunat pe ${catre}${numarSunat ? ` la ${numarSunat}` : ''})`);

  if (rezultat.date && rezultat.date.pornit === false) {
    return {
      sunat: false,
      pregatit: true,
      catre,
      numar: numarSunat || undefined,
      nota:
        'Am deschis tastatura telefonului cu numărul scris — apasă tu pe butonul de apel. ' +
        'Spune-i asta clar: apelul NU a plecat încă.',
    };
  }

  return {
    sunat: true,
    catre,
    numar: numarSunat || undefined,
  };
}

function cifre(text) {
  return String(text || '').replace(/[^0-9]/g, '');
}
