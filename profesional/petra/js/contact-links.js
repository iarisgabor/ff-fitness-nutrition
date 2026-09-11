/* Leagă butoanele [data-contact] la datele din js/config.js și verifică
   sincronizarea HTML ↔ config (vezi explicația din config.js). Adaugă și un
   avertisment separat, care nu poate fi uitat într-un comentariu: cât timp
   Instagram-ul nu e confirmat manual, consola îl repetă la fiecare încărcare. */

function telefonCurat(e164) {
  return String(e164 || '').replace(/[^\d]/g, '');
}

function initContactLinks() {
  const SITE = window.SITE;
  if (!SITE) {
    console.warn('[petra] window.SITE lipsește — js/config.js nu s-a încărcat înaintea js/contact-links.js.');
    return;
  }

  const telefon = SITE.contact && SITE.contact.telefon;
  const telefonWa = telefonCurat(telefon);
  const email = SITE.contact && SITE.contact.email;
  const instagram = SITE.instagram && SITE.instagram.handle;

  document.querySelectorAll('[data-contact="tel"]').forEach((el) => {
    if (telefon) el.setAttribute('href', 'tel:' + telefon);
  });

  document.querySelectorAll('[data-contact="whatsapp"]').forEach((el) => {
    if (!telefonWa) return;
    const mesaj = (SITE.mesaje && SITE.mesaje.whatsappImplicit) || '';
    el.setAttribute('href', 'https://wa.me/' + telefonWa + '?text=' + encodeURIComponent(mesaj));
  });

  document.querySelectorAll('[data-contact="email"]').forEach((el) => {
    if (!email) return;
    const subiect = (SITE.mesaje && SITE.mesaje.emailSubiect) || '';
    const corp = (SITE.mesaje && SITE.mesaje.emailCorp) || '';
    el.setAttribute(
      'href',
      'mailto:' + email + '?subject=' + encodeURIComponent(subiect) + '&body=' + encodeURIComponent(corp)
    );
  });

  document.querySelectorAll('[data-contact="instagram"]').forEach((el) => {
    if (!instagram) return;
    el.setAttribute('href', 'https://instagram.com/' + instagram);
  });

  if (SITE.instagram && SITE.instagram.confirmat === false) {
    console.warn(
      '[petra] Linkul de Instagram (@' +
        instagram +
        ') e NECONFIRMAT — dedus din adresa de email, nu verificat prin deschiderea profilului. ' +
        'Există un cont omonim al altcuiva. Verifică manual, apoi setează SITE.instagram.confirmat = true în js/config.js.'
    );
  }
}

function citesteCale(obj, cale) {
  return cale.split('.').reduce((acc, cheie) => (acc == null ? acc : acc[cheie]), obj);
}

function verifyConfig() {
  const SITE = window.SITE;
  if (!SITE) return;

  const noduri = document.querySelectorAll('[data-cfg]');
  const nesincronizate = [];

  noduri.forEach((el) => {
    const cale = el.getAttribute('data-cfg');
    const valoare = citesteCale(SITE, cale);
    if (valoare == null) return;

    const text = el.textContent.trim();
    if (text && String(valoare).trim() !== text && !text.startsWith('[COMPLETEAZĂ')) {
      nesincronizate.push({ cale, config: valoare, html: text, element: el });
    }
  });

  if (nesincronizate.length) {
    console.warn(
      '[petra] ' + nesincronizate.length + ' loc(uri) din HTML nu sunt sincronizate cu js/config.js:',
      nesincronizate
    );
  }
}

function initAn() {
  const el = document.querySelector('[data-year]');
  if (el) el.textContent = new Date().getFullYear();
}
