// Orbul: singurul lucru de pe ecran. E și starea aplicației, și butonul.
//
// Trei stări, citibile de la distanță, fără niciun cuvânt:
//   inactiv    — mic și cenușiu. Nu e conectat. (Atinge-l, sau spune-i „Jarvis".)
//   conectare  — crește, se colorează, pulsează. Se leagă.
//   activ      — mare și colorat, reacționează la voce.
//
// Reacționează la DOUĂ surse separate, nu la una singură:
//   `user` — nivelul microfonului tău;  `bot` — vocea asistentului, înainte de difuzor.
// Fiecare are perechea ei de culori, așa că se vede dintr-o privire cine vorbește — inclusiv
// când vă suprapuneți, caz în care orbul virează spre cine e mai tare.
//
// De ce canvas și nu o animație CSS: forma se recalculează din eșantioane audio la fiecare
// cadru. O animație CSS are o curbă fixă, dinainte stabilită — n-ar putea urmări vocea.

const Orb = (() => {
  const canvas = document.getElementById('orb');
  const ctx = canvas.getContext('2d');

  // Fiecare stare are DOUĂ culori, nu una: umplerea e un gradient între ele, rotit lent. Cu o
  // singură culoare, un cerc mare pe ecran negru arată ca o pată; cu două, arată ca o materie.
  const PALETE = {
    idle: [{ r: 96, g: 106, b: 122 }, { r: 62, g: 70, b: 84 }],
    conectare: [{ r: 122, g: 148, b: 255 }, { r: 90, g: 214, b: 255 }],
    user: [{ r: 108, g: 150, b: 255 }, { r: 176, g: 108, b: 255 }],
    bot: [{ r: 47, g: 227, b: 192 }, { r: 53, g: 160, b: 255 }],
    // Chihlimbariu, depărtat de tot ce înseamnă „vorbește cineva" (albastru-violet la om,
    // turcoaz la asistent) — altfel starea de lucru s-ar citi ca o replică.
    lucreaza: [{ r: 255, g: 186, b: 92 }, { r: 255, g: 126, b: 74 }],
  };

  // Cât de mare e orbul în fiecare stare, ca fracțiune din latura mică a ecranului.
  //
  // „lucreaza" e MAI MIC decât „activ", și asta e chiar mesajul: orbul s-a retras din ascultare
  // ca să facă ceva. Scăderea de rază se vede și cu prefers-reduced-motion, unde pulsul și inelul
  // rotitor se opresc — deci starea rămâne lizibilă și acolo, nu doar ca o culoare nouă.
  //
  // ATENȚIE: obiectul ăsta e și lista stărilor valide. Orb.stare() ignoră TĂCUT orice nume care
  // nu e cheie aici — o stare nouă adăugată doar în PALETE n-ar face absolut nimic.
  const RAZE = { inactiv: 0.085, conectare: 0.17, lucreaza: 0.24, activ: 0.3 };

  const miscareRedusa =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let analyserUser = null;
  let analyserBot = null;
  let bufUser = null;
  let bufBot = null;

  // Nivelurile netezite. Atacul e rapid (vocea pornește brusc), revenirea lentă — altfel orbul
  // ar tremura pe fiecare pauză dintre silabe și ar arăta nervos, nu viu.
  let nivelUser = 0;
  let nivelBot = 0;

  let stare = 'inactiv';
  // Raza și intensitatea culorii se deplasează lin spre țintă, nu sar. Trecerea „mic și gri" →
  // „mare și colorat" E feedbackul că apelul a pornit; dacă ar fi instantanee, n-ai vedea-o.
  let razaAcum = RAZE.inactiv;
  let intensitate = 0;
  let inceput = performance.now();

  function dimensioneaza() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // peste 2 nu se vede, doar costă
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
  }

  // RMS-ul formei de undă: cât de tare se vorbește acum, între 0 și ~1.
  function citesteNivel(analyser, buffer) {
    if (!analyser) return 0;
    analyser.getByteTimeDomainData(buffer);
    let suma = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const v = (buffer[i] - 128) / 128;
      suma += v * v;
    }
    // Scalat: vocea normală stă pe la 0.05-0.2 RMS, iar fără amplificare orbul abia s-ar clinti.
    return Math.min(1, Math.sqrt(suma / buffer.length) * 4);
  }

  function neteziti(vechi, nou) {
    const atac = 0.45;
    const revenire = 0.12;
    return nou > vechi ? vechi + (nou - vechi) * atac : vechi + (nou - vechi) * revenire;
  }

  function spre(valoare, tinta, viteza) {
    return valoare + (tinta - valoare) * viteza;
  }

  function amesteca(a, b, t) {
    return {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t,
    };
  }

  function rgba({ r, g, b }, alfa) {
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alfa})`;
  }

  // Ce pereche de culori se vede acum. În apel, o dă cine vorbește mai tare; în rest, starea.
  function paletaCurenta(nivel) {
    if (stare === 'inactiv') return PALETE.idle;
    if (stare === 'conectare') return PALETE.conectare;
    if (stare === 'lucreaza') return PALETE.lucreaza;

    const vorbitor = nivelBot >= nivelUser ? PALETE.bot : PALETE.user;
    // În tăcere nu cădem complet în gri — apelul e deschis, iar orbul trebuie să arate asta.
    const t = Math.min(1, 0.45 + nivel * 1.4);
    return [amesteca(PALETE.idle[0], vorbitor[0], t), amesteca(PALETE.idle[1], vorbitor[1], t)];
  }

  function deseneaza(acum) {
    requestAnimationFrame(deseneaza);

    const dprAsteptat = Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2));
    if (canvas.width !== dprAsteptat) dimensioneaza();

    const activ = stare === 'activ';
    nivelUser = neteziti(nivelUser, activ ? citesteNivel(analyserUser, bufUser) : 0);
    nivelBot = neteziti(nivelBot, activ ? citesteNivel(analyserBot, bufBot) : 0);

    razaAcum = spre(razaAcum, RAZE[stare] ?? RAZE.inactiv, 0.075);
    intensitate = spre(intensitate, stare === 'inactiv' ? 0 : 1, 0.06);

    const t = (acum - inceput) / 1000;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    // Puțin deasupra centrului: sub orb stă linia de stare, iar centrul optic al unui ecran de
    // telefon e mai sus decât cel geometric.
    const cy = h * 0.44;

    ctx.clearRect(0, 0, w, h);

    const nivel = Math.max(nivelUser, nivelBot);
    const [culoareA, culoareB] = paletaCurenta(nivel);

    // Respirația de fond: există și în tăcere, ca orbul să pară viu, nu înghețat. La conectare
    // e mai apăsată — pulsul ăla E mesajul „lucrez, așteaptă".
    const amplitudine = stare === 'conectare' ? 0.06 : stare === 'lucreaza' ? 0.045 : 0.02;
    const ritm = stare === 'conectare' ? 2.4 : stare === 'lucreaza' ? 1.6 : 0.9;
    const respiratie = miscareRedusa ? 0 : Math.sin(t * ritm) * amplitudine;
    const raza = Math.min(w, h) * razaAcum * (1 + respiratie + nivel * 0.34);

    // Halo: un gradient larg în spatele formei. Face lumina, nu conturul.
    const halo = ctx.createRadialGradient(cx, cy, raza * 0.2, cx, cy, raza * 3);
    halo.addColorStop(0, rgba(culoareA, (0.14 + nivel * 0.26) * (0.25 + intensitate * 0.75)));
    halo.addColorStop(0.4, rgba(culoareB, (0.05 + nivel * 0.09) * intensitate));
    halo.addColorStop(1, rgba(culoareB, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    // Trei straturi concentrice, ușor defazate — de aproape se vede că „materialul" se mișcă,
    // nu doar că se scalează un cerc.
    for (let strat = 0; strat < 3; strat += 1) {
      const scara = 1 - strat * 0.15;
      const faza = t * (0.7 + strat * 0.25) + strat * 1.7;
      const alfa = (strat === 0 ? 0.2 + nivel * 0.26 : 0.12 + nivel * 0.14) * (0.5 + intensitate * 0.5);

      ctx.beginPath();
      const pasi = 108;
      for (let i = 0; i <= pasi; i += 1) {
        const unghi = (i / pasi) * Math.PI * 2;
        // Armonice pe rază: forma nu e cerc perfect, ci un balon care se deformează lent.
        const val = miscareRedusa
          ? 0
          : Math.sin(unghi * 3 + faza) * 0.05 +
            Math.sin(unghi * 5 - faza * 0.6) * 0.03 +
            Math.sin(unghi * 2 + faza * 1.4) * nivel * 0.16;
        const rr = raza * scara * (1 + val);
        const x = cx + Math.cos(unghi) * rr;
        const y = cy + Math.sin(unghi) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      // Gradientul care rotește cele două culori una peste alta. Axa se învârte lent, deci
      // culoarea „curge" prin orb în loc să stea lipită de o parte.
      const unghiGradient = t * 0.25 + strat * 0.8;
      const dx = Math.cos(unghiGradient) * raza * scara;
      const dy = Math.sin(unghiGradient) * raza * scara;
      const umplere = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      umplere.addColorStop(0, rgba(culoareA, alfa * 1.9));
      umplere.addColorStop(1, rgba(culoareB, alfa * 0.9));
      ctx.fillStyle = umplere;
      ctx.fill();

      if (strat === 0) {
        ctx.strokeStyle = rgba(culoareA, (0.3 + nivel * 0.45) * (0.4 + intensitate * 0.6));
        ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.0018);
        ctx.stroke();
      }
    }

    // Miezul: o lumină mică, offset spre stânga-sus, ca la o sferă luminată dintr-o parte.
    const miez = ctx.createRadialGradient(
      cx - raza * 0.25, cy - raza * 0.3, 0,
      cx - raza * 0.25, cy - raza * 0.3, raza * 0.9
    );
    miez.addColorStop(0, rgba(culoareA, (0.3 + nivel * 0.4) * (0.3 + intensitate * 0.7)));
    miez.addColorStop(1, rgba(culoareA, 0));
    ctx.fillStyle = miez;
    ctx.fill();

    // Inelul care se rotește: apare doar cât timp e conectat, și se strânge pe voce. E semnul
    // că mașina merge — un orb care doar respiră ar putea fi și o imagine.
    // Excepția pentru „lucreaza" e deliberată: în rest, cu prefers-reduced-motion inelul dispare
    // de tot, fiindcă e decor. Aici e informație — singura care spune „fac ceva, mai durează" —
    // iar fără rotație (rotatie = 0) rămâne un inel STATIC și vizibil incomplet. Forma spune
    // starea, nu culoarea, exact ca tăietura de pe iconița microfonului oprit.
    const lucreaza = stare === 'lucreaza';
    if ((!miscareRedusa || lucreaza) && intensitate > 0.05) {
      const razaInel = raza * (1.28 + nivel * 0.12);
      const lungime = Math.PI * (lucreaza ? 0.28 : 0.35 + nivel * 0.5);
      const rotatie = miscareRedusa ? 0 : t * (stare === 'conectare' ? 2.6 : lucreaza ? 1.4 : 0.6);
      // Trei arce în loc de două: se deosebește dintr-o privire de inelul de conectare, chiar
      // dacă cineva n-ar distinge chihlimbariul de albastru.
      const arce = lucreaza ? 3 : 2;
      ctx.lineWidth = Math.max(1.2, Math.min(w, h) * 0.0026);
      ctx.lineCap = 'round';
      for (let arc = 0; arc < arce; arc += 1) {
        ctx.beginPath();
        const start = rotatie + (arc * 2 * Math.PI) / arce;
        ctx.arc(cx, cy, razaInel, start, start + lungime);
        ctx.strokeStyle = rgba(arc % 2 === 0 ? culoareA : culoareB, 0.3 * intensitate);
        ctx.stroke();
      }
    }
  }

  dimensioneaza();
  window.addEventListener('resize', dimensioneaza);
  requestAnimationFrame(deseneaza);

  return {
    // Legat de app.js la începutul apelului, după ce contextele audio există.
    conecteaza({ user, bot }) {
      analyserUser = user || null;
      analyserBot = bot || null;
      bufUser = analyserUser ? new Uint8Array(analyserUser.fftSize) : null;
      bufBot = analyserBot ? new Uint8Array(analyserBot.fftSize) : null;
      stare = 'activ';
    },
    // 'inactiv' | 'conectare' | 'activ'
    stare(noua) {
      if (RAZE[noua] !== undefined) stare = noua;
    },
    opreste() {
      stare = 'inactiv';
      analyserUser = null;
      analyserBot = null;
    },
  };
})();
