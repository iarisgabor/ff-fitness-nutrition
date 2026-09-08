/* film.js — un singur cadru continuu: camera stă pe pânză și urmărește acul
   de la primul punct al altiței până la ultimul punct din tiv.

   Fără Lenis aici, intenționat: filmul e legat direct de scroll (un singur strat de
   netezire, altfel „filmul fuge după deget"). Netezirea rămâne doar pe paginile fără film. */
(function () {
  'use strict';

  var P = window.IA_PATTERN;
  var driver = document.getElementById('film');
  var canvas = document.getElementById('panza');
  if (!P || !driver || !canvas) return;

  var ctx = canvas.getContext('2d', { alpha: false });
  var W = 0, H = 0, DPR = 1;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var CLOTH = '#F0E4CE';   // pânza iei
  var TABLE = '#C8B79C';   // masa de sub ea
  var N = P.stitches.length;

  // punctele grupate pe culoare, ca desenul să se facă din câteva treceri
  var buckets = (function () {
    var map = {}, order = [];
    for (var i = 0; i < N; i++) {
      var c = P.stitches[i].c;
      if (!map[c]) { map[c] = []; order.push(c); }
      map[c].push(i);
    }
    return order.map(function (c) { return { color: c, idx: Int32Array.from(map[c]) }; });
  })();

  // ---------------------------------------------------------------- texturi
  function weaveTile() {
    var t = document.createElement('canvas'), s = 16;
    t.width = t.height = s;
    var c = t.getContext('2d');
    c.clearRect(0, 0, s, s);
    for (var i = 0; i < s; i += 4) {
      c.fillStyle = 'rgba(90,66,38,0.055)';
      c.fillRect(i, 0, 2, s);
      c.fillStyle = 'rgba(255,248,232,0.10)';
      c.fillRect(i + 2, 0, 2, s);
      c.fillStyle = 'rgba(90,66,38,0.045)';
      c.fillRect(0, i + 2, s, 2);
      c.fillStyle = 'rgba(255,248,232,0.08)';
      c.fillRect(0, i, s, 2);
    }
    return t;
  }

  function noiseTile() {
    var t = document.createElement('canvas'), s = 128;
    t.width = t.height = s;
    var c = t.getContext('2d'), img = c.createImageData(s, s), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 12;
    }
    c.putImageData(img, 0, 0);
    return t;
  }

  var weavePat = null;

  // -------------------------------------------------------------- camera
  var ZOOM_KEYS = [
    [0.00, 6.4], [0.05, 4.2], [0.18, 2.5], [0.34, 2.0],
    [0.50, 2.3], [0.64, 1.7], [0.80, 1.15], [0.90, 1.0], [1.00, 0.96]
  ];

  function zoomAt(p) {
    for (var i = 0; i < ZOOM_KEYS.length - 1; i++) {
      var a = ZOOM_KEYS[i], b = ZOOM_KEYS[i + 1];
      if (p <= b[0]) {
        var t = (p - a[0]) / (b[0] - a[0]);
        t = t * t * (3 - 2 * t);
        return a[1] + (b[1] - a[1]) * t;
      }
    }
    return ZOOM_KEYS[ZOOM_KEYS.length - 1][1];
  }

  function fitZoom() {
    // pe ecran îngust ia umple mai mult din lățime, altfel tot filmul rămâne prea depărtat
    var b = P.bounds, umple = W < 700 ? 0.92 : 0.66;
    return Math.min(W * umple / (b.x1 - b.x0), H * 0.80 / (b.y1 - b.y0));
  }

  // ---------------------------------------------------------------- desen
  // totul e ținut între cadre: gradientul, matricile și transformarea camerei.
  // Alocările din buclă erau singura sursă de vârfuri de peste 50ms.
  var velum = document.createElement('canvas');
  var mWeave = new DOMMatrix();
  var curZ = 1, curTx = 0, curTy = 0;

  function SX(x) { return x * curZ + curTx; }
  function SY(y) { return y * curZ + curTy; }

  function draw(p) {
    var z = zoomAt(p) * fitZoom();
    var sp = Math.max(0, Math.min(1, (p - 0.035) / 0.825));
    var fIdx = sp * (N - 1);
    var iCur = Math.min(N - 1, Math.floor(fIdx));

    // centrul camerei: unde lucrează acul, apoi alunecă spre ia întreagă
    var i0 = Math.floor(fIdx), i1 = Math.min(N - 1, i0 + 1), ft = fIdx - i0;
    var cx = P.camX[i0] + (P.camX[i1] - P.camX[i0]) * ft;
    var cy = P.camY[i0] + (P.camY[i1] - P.camY[i0]) * ft;
    var wide = Math.max(0, Math.min(1, (p - 0.82) / 0.14));
    wide = wide * wide * (3 - 2 * wide);
    // pe ecran îngust ia urcă în cadru, ca textul final să nu cadă peste poale
    var cyFinal = W < 700 ? 128 : 105;
    cx += (80 - cx) * wide;
    cy += (cyFinal - cy) * wide;

    curZ = z;
    curTx = W / 2 - cx * z;
    curTy = H / 2 - cy * z;

    // masa
    ctx.fillStyle = TABLE;
    ctx.fillRect(0, 0, W, H);
    mWeave.a = mWeave.d = z / 8;
    mWeave.e = curTx; mWeave.f = curTy;
    weavePat.setTransform(mWeave);
    ctx.fillStyle = weavePat;
    ctx.fillRect(0, 0, W, H);

    // pânza iei
    var sil = P.silhouette;
    ctx.beginPath();
    ctx.moveTo(SX(sil[0][0]), SY(sil[0][1]));
    for (var i = 1; i < sil.length; i++) ctx.lineTo(SX(sil[i][0]), SY(sil[i][1]));
    ctx.closePath();
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,20,0.30)';
    ctx.shadowBlur = Math.max(8, z * 3);
    ctx.shadowOffsetY = Math.max(4, z * 1.2);
    ctx.fillStyle = CLOTH;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = weavePat;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // punctele cusute până acum
    var lw = Math.max(0.9, z * 0.20);
    ctx.lineCap = 'round';
    ctx.lineWidth = lw;
    var arm = 0.40 * z, pad = arm + lw + 2;
    for (var b = 0; b < buckets.length; b++) {
      var bk = buckets[b], idx = bk.idx, drew = false;
      ctx.beginPath();
      for (var k = 0; k < idx.length; k++) {
        var si = idx[k];
        if (si > iCur) break;
        var s = P.stitches[si];
        var x = SX(s.x), y = SY(s.y);
        if (x < -pad || x > W + pad || y < -pad || y > H + pad) continue;
        if (s.k === 'r') {
          var px = s.dx * arm * 0.9, py = s.dy * arm * 0.9;
          ctx.moveTo(x - px, y - py); ctx.lineTo(x + px, y + py);
        } else {
          ctx.moveTo(x - arm, y - arm); ctx.lineTo(x + arm, y + arm);
          ctx.moveTo(x - arm, y + arm); ctx.lineTo(x + arm, y - arm);
        }
        drew = true;
      }
      if (drew) { ctx.strokeStyle = bk.color; ctx.stroke(); }
    }

    // acul și firul
    var needleA = 1 - Math.max(0, Math.min(1, (p - 0.86) / 0.08));
    if (needleA > 0.01 && iCur < N - 1) {
      var s0 = P.stitches[iCur];
      var nx = SX(s0.x), ny = SY(s0.y);
      var punch = Math.sin(ft * Math.PI);
      drawThread(nx, ny, iCur, needleA);
      drawNeedle(nx, ny, punch, z, needleA);
    }

    // lumina + granulația vin gata compuse, dintr-o singură trecere
    ctx.drawImage(velum, 0, 0, W, H);
  }

  function drawThread(nx, ny, iCur, alpha) {
    // firul e mereu roșu — e semnul mărcii, nu culoarea punctului curent
    ctx.save();
    ctx.strokeStyle = P.colors.r;
    ctx.lineCap = 'round';
    ctx.globalAlpha = alpha * 0.85;
    ctx.lineWidth = Math.max(1.1, ctx.lineWidth * 0.85);
    ctx.beginPath();
    var start = Math.max(0, iCur - 7);
    ctx.moveTo(SX(P.stitches[start].x), SY(P.stitches[start].y));
    for (var i = start + 1; i <= iCur; i++) {
      ctx.lineTo(SX(P.stitches[i].x), SY(P.stitches[i].y));
    }
    ctx.stroke();
    // firul slăbit care urcă spre mână, undeva peste marginea cadrului
    ctx.globalAlpha = alpha * 0.42;
    ctx.lineWidth = Math.max(1, ctx.lineWidth * 0.8);
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.bezierCurveTo(nx + 210, ny - 40, W * 0.82, -30, W + 80, -180);
    ctx.stroke();
    ctx.restore();
  }

  function drawNeedle(x, y, punch, z, alpha) {
    var len = Math.max(70, Math.min(210, z * 7));
    var ang = -0.62;
    var lift = punch * Math.max(6, z * 0.5);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x + Math.cos(ang) * lift, y + Math.sin(ang) * lift);
    ctx.rotate(ang);
    var g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, '#F7F3EA');
    g.addColorStop(0.45, '#C9C4B6');
    g.addColorStop(1, '#8C8779');
    ctx.strokeStyle = 'rgba(40,28,14,0.28)';
    ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(1.5, 1.5); ctx.lineTo(len, 1.5); ctx.stroke();
    ctx.strokeStyle = g;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
    ctx.strokeStyle = 'rgba(30,22,12,0.55)';
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.ellipse(len * 0.86, 0, len * 0.055, 2.2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // ----------------------------------------------------------- praf de in
  var motes = [];
  function initMotes() {
    motes = [];
    if (reduced) return;
    for (var i = 0; i < 46; i++) {
      motes.push({
        x: Math.random(), y: Math.random(),
        r: 0.6 + Math.random() * 2.2,
        s: 0.12 + Math.random() * 0.5,
        ph: Math.random() * 6.28
      });
    }
  }

  function drawMotes(p, t) {
    var a = 1 - Math.max(0, Math.min(1, p / 0.075));
    if (a <= 0.01 || !motes.length) return;
    ctx.save();
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      var y = (m.y - (t * 0.00002 * m.s)) % 1;
      if (y < 0) y += 1;
      var tw = 0.45 + 0.55 * Math.sin(t * 0.0011 + m.ph);
      ctx.globalAlpha = a * 0.5 * tw;
      ctx.fillStyle = '#FFF6E2';
      ctx.beginPath();
      ctx.arc(m.x * W, y * H, m.r, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
  }

  // -------------------------------------------------------------- overlay
  var beats = [].slice.call(document.querySelectorAll('.beat')).map(function (el) {
    return {
      el: el,
      "in": parseFloat(el.dataset["in"]),
      peak: parseFloat(el.dataset.peak),
      out: parseFloat(el.dataset.out)
    };
  });

  function beatAlpha(b, p) {
    if (p < b["in"] || p > b.out) return 0;
    if (p < b.peak) return (p - b["in"]) / Math.max(1e-4, b.peak - b["in"]);
    if (b.out > 1.5) return 1;
    return 1 - (p - b.peak) / Math.max(1e-4, b.out - b.peak);
  }

  var readoutLabel = document.querySelector('[data-readout-label]');
  var readoutBar = document.querySelector('[data-readout-bar]');
  var lastLabel = '';

  function updateOverlay(p) {
    for (var i = 0; i < beats.length; i++) {
      var b = beats[i], a = beatAlpha(b, p);
      b.el.style.opacity = a;
      b.el.style.visibility = a < 0.01 ? 'hidden' : 'visible';
      // prin variabilă, nu direct pe transform: eroul își păstrează centrarea
      b.el.style.setProperty('--beat-y', ((1 - a) * 26).toFixed(2) + 'px');
    }
    var sp = Math.max(0, Math.min(1, (p - 0.035) / 0.825));
    var idx = sp * (N - 1), label = '';
    for (var r = 0; r < P.regions.length; r++) {
      if (idx >= P.regions[r].start) label = P.regions[r].name;
    }
    if (label !== lastLabel && readoutLabel) { readoutLabel.textContent = label; lastLabel = label; }
    if (readoutBar) readoutBar.style.transform = 'scaleX(' + sp.toFixed(4) + ')';
  }

  // ------------------------------------------------------------- ciclul
  function progress() {
    var r = driver.getBoundingClientRect();
    var span = r.height - window.innerHeight;
    if (span <= 0) return 0;
    return Math.max(0, Math.min(1, -r.top / span));
  }

  function resize() {
    DPR = Math.min(1.5, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    weavePat = ctx.createPattern(weaveTile(), 'repeat');

    velum.width = Math.round(W); velum.height = Math.round(H);
    var vc = velum.getContext('2d');
    var lumina = vc.createRadialGradient(W * 0.28, H * 0.12, 0, W * 0.28, H * 0.12, Math.max(W, H) * 1.05);
    lumina.addColorStop(0, 'rgba(255,246,225,0.30)');
    lumina.addColorStop(0.5, 'rgba(255,240,214,0.05)');
    lumina.addColorStop(1, 'rgba(60,38,16,0.20)');
    vc.clearRect(0, 0, W, H);
    vc.fillStyle = lumina;
    vc.fillRect(0, 0, W, H);
    vc.fillStyle = vc.createPattern(noiseTile(), 'repeat');
    vc.fillRect(0, 0, W, H);

    initMotes();
  }

  var jankMax = 0, jankLast = 0, jankAt = 0;

  function tick(t) {
    try {
      var p = progress();
      draw(p);
      drawMotes(p, t || 0);
      updateOverlay(p);
      document.documentElement.style.setProperty('--film-p', p.toFixed(4));
    } catch (e) {
      console.warn('[film]', e);
    }
    if (t) {
      if (jankLast) jankMax = Math.max(jankMax, t - jankLast);
      jankLast = t;
      if (t - jankAt > 2000) { window.__jankMax = jankMax; jankMax = 0; jankAt = t; }
    }
    requestAnimationFrame(tick);
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { resize(); }, 120);
  });

  // ---------------------------------------------------- contractul de dev
  var JUMP = new URLSearchParams(location.search).get('jump');
  if (JUMP !== null) history.scrollRestoration = 'manual';

  resize();
  requestAnimationFrame(tick);

  window.addEventListener('load', function () {
    resize();
    if (JUMP !== null) window.scrollTo(0, +JUMP || 0);
    if (window.ScrollTrigger) { window.ScrollTrigger.refresh(); }
    if (JUMP !== null) window.scrollTo(0, +JUMP || 0);
    var p = progress();
    draw(p); updateOverlay(p);
    if (window.IA_SETTLE) window.IA_SETTLE();
    window.__ready = true;
  });
})();
