// Poarta de confirmare pentru acțiunile care nu se pot lua înapoi.
//
// DE CE în cod și nu în prompt: regula 49f, scrisă după bugul apelurilor în buclă — „o acțiune
// care atinge lumea din afară are nevoie de o POARTĂ, nu de o rugăminte". Promptul cerea deja
// confirmare înainte de o ștergere sau un apel; promptul e respectat aproape mereu, iar
// „aproape" înseamnă, din când în când, un eveniment șters care nu se mai întoarce și un om
// sunat degeaba.
//
// Cum funcționează: primul apel al uneltei NU execută nimic — scrie cererea și întoarce un
// rezultat care îi spune modelului să ceară voie. Al doilea apel, cu ACELEAȘI argumente și după
// ce omul a apucat să răspundă, execută. Merge identic pe Telegram și în voce, fiindcă „a doua
// apăsare" nu e un buton, e a doua chemare a uneltei — adică un „da" tastat sau rostit.
//
// Nu se confundă cu paza din telefon.js: aia răspunde la „am făcut deja asta?" (anti-buclă, pe
// număr, 3 minute), asta la „a aprobat omul?". Se compun; contopite, un al doilea apel CONFIRMAT
// către același număr ar fi înghițit de pauza anti-buclă.

export const ACTIUNI_CU_POARTA = new Set([
  'delete_calendar_event',
  'suna_pe_telefon',
  'trimite_mesaj_whatsapp',
]);

// Cât timp rămâne valabilă o cerere de confirmare. Trei minute: destul cât să te uiți în calendar
// înainte să spui da, prea puțin cât un „da" de mâine să mai poată executa ceva uitat de ieri.
export const FEREASTRA_CONFIRMARE_MS = 3 * 60 * 1000;

function textNormalizat(valoare) {
  return String(valoare ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Amprenta unei acțiuni: ce anume trebuie să se repete identic ca să conteze drept confirmare.
 *
 * Cheile se sortează, iar valorile se normalizează la spații — altfel „+40 712 345 678" și
 * „+40712345678" ar fi două acțiuni diferite și omul ar fi întrebat de două ori.
 *
 * Nepotrivirea eșuează în direcția SIGURĂ: dacă modelul reformulează textul unui mesaj la a doua
 * chemare, amprenta diferă, nu se execută nimic și se întreabă din nou. A întreba de două ori e
 * supărător; a trimite altceva decât ce a aprobat omul, nu.
 */
export function amprentaActiunii(name, input) {
  const intrare = input && typeof input === 'object' ? input : {};
  const chei = Object.keys(intrare).sort();
  const perechi = chei.map((cheie) => `${cheie}=${textNormalizat(intrare[cheie])}`);
  return `${name}(${perechi.join('|')})`;
}

/**
 * Ce urmează să se întâmple, spus pentru MODEL, ca să poată cere voie cu datele pe masă.
 *
 * Aici textul mesajului de WhatsApp apare ÎNTREG, dinadins: promptul cere să i-l citească înapoi
 * înainte de trimitere. În jurnal, același mesaj e redactat — vezi `rezumatPentruJurnal`. Trei
 * audiențe, trei reguli: modelul vede tot, logul nu vede nimic, jurnalul vede doar cine și cât.
 */
export function descrieActiune(name, input) {
  const i = input && typeof input === 'object' ? input : {};
  switch (name) {
    case 'delete_calendar_event':
      return `ștergerea definitivă a evenimentului cu id ${textNormalizat(i.event_id)} din Google Calendar`;
    case 'suna_pe_telefon':
      return `un apel telefonic către ${textNormalizat(i.nume) || textNormalizat(i.numar) || 'destinatarul cerut'}`;
    case 'trimite_mesaj_whatsapp':
      return (
        `un mesaj pe WhatsApp către ${textNormalizat(i.destinatar) || textNormalizat(i.numar) || 'destinatarul cerut'}` +
        `, cu textul: „${textNormalizat(i.text)}"`
      );
    default:
      return `acțiunea ${name}`;
  }
}

/**
 * Ce se scrie în jurnal, pentru om.
 *
 * Textul mesajelor de WhatsApp NU intră aici. Jurnalul se citește cu `ce_ai_facut`, deci ajunge
 * în contextul modelului la cerere, iar corespondența cu alți oameni n-are de ce să stea într-un
 * tabel pe care îl răsfoiește cineva peste o lună. Cine și cât de lung — atât e nevoie ca să
 * recunoști acțiunea.
 */
export function rezumatPentruJurnal(name, input, rezultat) {
  const i = input && typeof input === 'object' ? input : {};
  switch (name) {
    case 'delete_calendar_event': {
      const titlu = rezultat?.sters?.summary;
      return titlu ? `Ai șters din calendar: „${titlu}"` : `Ai șters un eveniment din calendar`;
    }
    case 'suna_pe_telefon': {
      const catre = textNormalizat(i.nume) || textNormalizat(i.numar) || 'necunoscut';
      return rezultat?.sunat === false ? `Ai deschis tastatura pentru un apel către ${catre}` : `Ai sunat pe ${catre}`;
    }
    case 'trimite_mesaj_whatsapp': {
      const catre = textNormalizat(i.destinatar) || textNormalizat(i.numar) || 'necunoscut';
      const lungime = textNormalizat(i.text).length;
      return `Ai trimis un mesaj pe WhatsApp către ${catre} (${lungime} caractere)`;
    }
    default:
      return `Ai folosit ${name}`;
  }
}

/**
 * Ce se salvează ca să se poată REFACE acțiunea. `null` = nu se poate reface.
 *
 * Doar ștergerea din calendar are ce. Un apel dat a sunat deja un telefon; un mesaj citit de
 * celălalt nu se poate necitit. Uneltele alea rămân în jurnal ca urmă, nu ca buton de anulare —
 * iar `refa_actiunea` le spune asta cinstit în loc să se prefacă.
 */
export function dateDeRefacere(name, rezultat) {
  if (name === 'delete_calendar_event' && rezultat?.sters) return rezultat.sters;
  return null;
}
