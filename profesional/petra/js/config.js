/* ═══════════════════════════════════════════════════════════════════════════
   DATELE PETREI — SINGURUL FIȘIER PE CARE ÎL EDITEZI PENTRU IDENTITATE/CONTACT

   Ca la profesional/instalatii: acest fișier NU alimentează textul vizibil de
   pe pagină (nume, oraș, titlurile proiectelor rămân scrise literal în
   index.html, ca WhatsApp/Facebook să aibă ce arăta într-un preview de link
   fără să execute JS). Alimentează doar ATRIBUTE — href-urile de telefon,
   WhatsApp, email, Instagram — și anul din subsol.

   Fiecare loc din HTML care repetă o valoare de aici e marcat cu
   data-cfg="cheia". La încărcare, verifyConfig() din contact-links.js
   compară și scrie în consola browserului (F12) ce ai uitat să schimbi.
   ═══════════════════════════════════════════════════════════════════════════ */

window.SITE = {
  nume: 'Petra Butincu',
  monograma: 'PB',
  oras: 'Oradea',

  // ⚠️ Alegere deliberată, nu scăpare: "fotografă" (feminin), nu "Fotograf".
  // Site-ul CAMERA OBSCURĂ (profesional/petra-butincu-film/) foloseşte deja
  // "fotografă" live, în timp ce site-ul React (petra-butincu-portofoliu/)
  // a ales "Fotograf" ca titlu neutru — cele două nu sunt sincronizate.
  // Verifică cu Petra dacă preferă altfel înainte de lansare.
  profesie: 'Fotografă',
  specialitati: ['beauty', 'fashion', 'produs'],

  contact: {
    // Sursa unică, format E.164. wa.me se derivă din el în contact-links.js
    // (fără "+", fără spații — altfel butonul WhatsApp se deschide gol).
    telefon: '+40732002029',
    telefonAfisat: '0732 002 029',
    email: 'Petra.g.photography@gmail.com'
  },

  instagram: {
    // ⚠️ NECONFIRMAT. Dedus din adresa de email, nu verificat prin deschiderea
    // profilului — există un cont omonim (@petra.photography) care aparține
    // altcuiva. contact-links.js scrie un avertisment în consolă la fiecare
    // încărcare de pagină cât timp `confirmat` rămâne `false`. Verifică manual
    // profilul, apoi schimbă doar valoarea de mai jos.
    handle: 'petra.g.photography',
    confirmat: false
  },

  mesaje: {
    whatsappImplicit: 'Bună ziua! Aș vrea o ofertă pentru o ședință foto. ',
    emailSubiect: 'Cerere de ofertă — ședință foto',
    emailCorp: 'Bună ziua,\n\nAș vrea o ofertă pentru:\nTip ședință:\nData dorită:\n\nMulțumesc!'
  },

  online: {
    // Cât timp nu există domeniu propriu, rămâne URL-ul de Vercel odată lansat
    // — niciodată un domeniu inventat, ca Google să nu indexeze o adresă goală.
    domeniu: null
  }
};
