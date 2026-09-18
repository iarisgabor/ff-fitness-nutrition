// Orbul: cercul care respiră și reacționează la voce, desenat în canvas pe tot fundalul.
//
// Reacționează la DOUĂ surse separate, nu la una singură:
//   - `user`  — nivelul microfonului tău (de pe `micContext`)
//   - `bot`   — nivelul vocii asistentului (de pe `playContext`, înainte de difuzor)
// Fiecare are culoarea ei, așa că se vede dintr-o privire cine vorbește — inclusiv când vă
// suprapuneți, caz în care orbul virează spre cine e mai tare.
//
// De ce canvas și nu o animație CSS: forma trebuie recalculată din eșantioane audio la fiecare
// cadru. O animație CSS are o curbă fixă, dinainte stabilită — n-ar putea urmări vocea.

const Orb = (() => {
  const canvas = document.getElementById('orb');
  const ctx = canvas.getContext('2d');

  const CULORI = {
    // Inactiv: aproape stins, doar cât să se vadă că aplicația e vie.
    idle: { r: 78, g: 110, b: 130 },
    user: { r: 110, g: 168, b: 255 },
    bot: { r: 78, g: 201, b: 160 },
  };

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
  let activ = false;
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

  function deseneaza(acum) {
    requestAnimationFrame(deseneaza);

    if (canvas.width !== Math.round(canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2))) {
      dimensioneaza();
    }

    nivelUser = neteziti(nivelUser, activ ? citesteNivel(analyserUser, bufUser) : 0);
    nivelBot = neteziti(nivelBot, activ ? citesteNivel(analyserBot, bufBot) : 0);

    const t = (acum - inceput) / 1000;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    // Puțin deasupra centrului: partea de jos a ecranului e ocupată de panou și de butoane.
    const cy = h * 0.42;

    ctx.clearRect(0, 0, w, h);

    const nivel = Math.max(nivelUser, nivelBot);
    // Cine vorbește mai tare dă culoarea. La egalitate (sau tăcere) rămâne culoarea inactivă.
    const dominant = nivelBot >= nivelUser ? CULORI.bot : CULORI.user;
    const culoare = amesteca(CULORI.idle, dominant, Math.min(1, nivel * 1.6));

    // Respirația de fond: există și în tăcere, ca orbul să pară viu, nu înghețat.
    const respiratie = miscareRedusa ? 0 : Math.sin(t * 0.9) * 0.02;
    const razaBaza = Math.min(w, h) * 0.17;
    const raza = razaBaza * (1 + respiratie + nivel * 0.42);

    // Halo: un gradient larg în spatele formei. Face lumina, nu conturul.
    const halo = ctx.createRadialGradient(cx, cy, raza * 0.25, cx, cy, raza * 3.2);
    halo.addColorStop(0, rgba(culoare, 0.3 + nivel * 0.28));
    halo.addColorStop(0.45, rgba(culoare, 0.07 + nivel * 0.08));
    halo.addColorStop(1, rgba(culoare, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    // Trei straturi concentrice, ușor defazate — de aproape se vede că „materialul" se mișcă,
    // nu doar că se scalează un cerc.
    for (let strat = 0; strat < 3; strat += 1) {
      const scara = 1 - strat * 0.16;
      const faza = t * (0.7 + strat * 0.25) + strat * 1.7;
      const alfa = strat === 0 ? 0.16 + nivel * 0.2 : 0.1 + nivel * 0.12;

      ctx.beginPath();
      const pasi = 96;
      for (let i = 0; i <= pasi; i += 1) {
        const unghi = (i / pasi) * Math.PI * 2;
        // Armonice pe rază: forma nu e cerc perfect, ci un balon care se deformează lent.
        const val = miscareRedusa
          ? 0
          : Math.sin(unghi * 3 + faza) * 0.05 +
            Math.sin(unghi * 5 - faza * 0.6) * 0.03 +
            Math.sin(unghi * 2 + faza * 1.4) * nivel * 0.14;
        const rr = raza * scara * (1 + val);
        const x = cx + Math.cos(unghi) * rr;
        const y = cy + Math.sin(unghi) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      const umplere = ctx.createRadialGradient(cx, cy - raza * 0.3, 0, cx, cy, raza * scara * 1.3);
      umplere.addColorStop(0, rgba(culoare, alfa * 2.1));
      umplere.addColorStop(1, rgba(culoare, alfa * 0.35));
      ctx.fillStyle = umplere;
      ctx.fill();

      if (strat === 0) {
        ctx.strokeStyle = rgba(culoare, 0.32 + nivel * 0.4);
        ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.0018);
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
      activ = true;
    },
    opreste() {
      activ = false;
      analyserUser = null;
      analyserBot = null;
    },
  };
})();
