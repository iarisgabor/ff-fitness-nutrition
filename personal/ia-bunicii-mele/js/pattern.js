/* pattern.js — ia, desenată ca broderie numărată.
   Tot ce se vede în film e generat aici: silueta cămășii și fiecare punct de cruce,
   în ordinea în care l-ar coase cineva cu mâna. Nicio imagine, niciun asset. */
(function (g) {
  'use strict';

  // fire de ață
  var C = {
    n: '#2A2018', // negru cald
    r: '#A81E12', // roșu de garanță
    R: '#78160C', // roșu adânc
    a: '#B0872F', // fir de aur
    i: '#2B3A57'  // indigo
  };

  // ---------------------------------------------------------------- silueta
  // Ia întinsă pe masă, văzută din față. Coordonate în celule de broderie.
  var SILHOUETTE = [
    [70, 34], [6, 34], [4, 118], [56, 110], [48, 176],
    [112, 176], [104, 110], [156, 118], [154, 34], [90, 34],
    [86, 42], [80, 46], [74, 42]
  ];

  function inside(x, y) {
    var n = SILHOUETTE.length, hit = false;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = SILHOUETTE[i][0], yi = SILHOUETTE[i][1];
      var xj = SILHOUETTE[j][0], yj = SILHOUETTE[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }

  // ------------------------------------------------------------- primitive
  function P(out, x, y, c, kind, dx, dy) {
    x = Math.round(x); y = Math.round(y);
    out.push({ x: x, y: y, c: c, k: kind || 'x', dx: dx || 0, dy: dy || 0 });
  }

  function rhomb(out, cx, cy, r, c) {          // ◇ contur
    for (var dx = -r; dx <= r; dx++) {
      var dy = r - Math.abs(dx);
      P(out, cx + dx, cy + dy, c);
      if (dy) P(out, cx + dx, cy - dy, c);
    }
  }

  function star(out, cx, cy, r, c1, c2) {      // steaua — rombul cu brațe
    rhomb(out, cx, cy, r, c1);
    if (r >= 4) rhomb(out, cx, cy, r - 2, c2);
    P(out, cx, cy, c2);
    for (var k = 1; k <= 2; k++) {
      P(out, cx + r + k, cy, c1); P(out, cx - r - k, cy, c1);
      P(out, cx, cy + r + k, c1); P(out, cx, cy - r - k, c1);
    }
  }

  function hook(out, cx, cy, sx, sy, c) {      // coarnele berbecului
    P(out, cx, cy, c);
    P(out, cx + sx, cy, c);
    P(out, cx + 2 * sx, cy, c);
    P(out, cx + 2 * sx, cy + sy, c);
    P(out, cx + 2 * sx, cy + 2 * sy, c);
    P(out, cx + sx, cy + 2 * sy, c);
  }

  function zig(out, x0, x1, y, amp, c) {
    var yy = y, dir = 1;
    for (var x = x0; x <= x1; x++) {
      P(out, x, yy, c);
      yy += dir;
      if (yy >= y + amp || yy <= y) dir *= -1;
    }
  }

  function line(out, x0, x1, y, c) {
    for (var x = x0; x <= x1; x++) P(out, x, y, c);
  }

  function flower(out, cx, cy, cp, cc) {       // floare mică, 4 petale
    P(out, cx, cy, cc);
    P(out, cx + 1, cy, cp); P(out, cx + 2, cy, cp);
    P(out, cx - 1, cy, cp); P(out, cx - 2, cy, cp);
    P(out, cx, cy + 1, cp); P(out, cx, cy + 2, cp);
    P(out, cx, cy - 1, cp); P(out, cx, cy - 2, cp);
    P(out, cx + 1, cy + 1, cc); P(out, cx - 1, cy - 1, cc);
    P(out, cx + 1, cy - 1, cc); P(out, cx - 1, cy + 1, cc);
  }

  // ------------------------------------------------------------- registrele
  // Fiecare registru al iei, în ordinea în care se coase.

  function altita(out, x0, x1, y0) {           // panoul de pe umăr — cel mai bogat
    var mid = y0 + 13, centre = [];
    line(out, x0, x1, y0, C.n);
    zig(out, x0, x1, y0 + 2, 3, C.r);
    for (var cx = x0 + 8; cx <= x1 - 7; cx += 13) {
      star(out, cx, mid, 5, C.n, C.r);
      centre.push(cx);
    }
    // cârligele stau doar în golurile dintre stele, ca să nu rămână puncte răzlețe
    for (var i = 0; i < centre.length - 1; i++) {
      var g = Math.round((centre[i] + centre[i + 1]) / 2);
      hook(out, g - 1, mid - 3, -1, 1, C.a);
      hook(out, g + 1, mid - 3, 1, 1, C.a);
    }
    zig(out, x0, x1, y0 + 21, 3, C.r);
    line(out, x0, x1, y0 + 26, C.n);
  }

  function increti(out, x0, x1, y0) {          // încrețul — banda de aur de sub altiță
    line(out, x0, x1, y0, C.a);
    for (var x = x0 + 2; x <= x1 - 2; x += 6) {
      rhomb(out, x, y0 + 4, 2, C.R);
      P(out, x, y0 + 4, C.a);
    }
    line(out, x0, x1, y0 + 8, C.a);
  }

  function rauri(out, x0, x1, y0, y1, dir) {   // râurile — dungile oblice de pe mânecă
    var lo = Math.min(x0, x1) + 1, hi = Math.max(x0, x1) - 1;
    for (var s = 0; s < 7; s++) {
      var sx = x0 + dir * s * 9;
      for (var t = 0; t <= y1 - y0; t += 3) {
        var x = sx + dir * t * 0.5, y = y0 + t;
        if (x < lo || x > hi) continue;    // râurile rămân pe mânecă, nu trec pe piept
        rhomb(out, x, y, 1, (t / 3) % 2 === 0 ? C.r : C.n);
      }
    }
  }

  function bust(out, cx, y0, y1) {             // șirul de flori de pe piept
    for (var y = y0; y <= y1; y += 12) {
      flower(out, cx, y, C.r, C.n);
      rhomb(out, cx, y + 6, 1, C.a);
    }
  }

  function poale(out, x0, x1, y0) {            // banda de la poale
    line(out, x0, x1, y0, C.n);
    zig(out, x0, x1, y0 + 2, 3, C.r);
    for (var cx = x0 + 8; cx <= x1 - 7; cx += 16) star(out, cx, y0 + 9, 4, C.n, C.a);
    line(out, x0, x1, y0 + 14, C.n);
  }

  function running(out, pts, c, step, closed) { // punct înaintea acului, de-a lungul unei linii
    var n = closed ? pts.length : pts.length - 1;
    for (var i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      var d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!d) continue;
      var ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d;
      for (var t = 0; t < d; t += step) {
        P(out, a[0] + ux * t, a[1] + uy * t, c, 'r', ux, uy);
      }
    }
  }

  function neckline(out) {                     // tivul de la gât
    running(out, [[68, 34], [72, 42], [80, 46], [88, 42], [92, 34]], C.R, 1.2, false);
  }

  function outline(out) {                      // conturul cămășii — ultimul lucru cusut
    running(out, SILHOUETTE, C.n, 1.6, true);
  }

  // ------------------------------------------------------------------ build
  function build() {
    var regions = [], stitches = [];

    function region(name, fn) {
      var buf = [];
      fn(buf);
      // nimic nu iese din pânză: punctele din afara siluetei se aruncă
      var seen = {}, kept = [];
      for (var i = 0; i < buf.length; i++) {
        var s = buf[i], key = s.x + ',' + s.y;
        if (s.k === 'x' && !inside(s.x, s.y)) continue;
        if (s.k === 'x' && seen[key]) continue;
        seen[key] = 1;
        kept.push(s);
      }
      regions.push({ name: name, start: stitches.length, end: stitches.length + kept.length });
      stitches = stitches.concat(kept);
    }

    region('altița stângă', function (o) { altita(o, 8, 52, 40); });
    region('încrețul', function (o) { increti(o, 8, 52, 70); });
    region('râurile', function (o) { rauri(o, 10, 52, 82, 106, 1); });
    region('pieptul', function (o) { bust(o, 66, 48, 96); neckline(o); bust(o, 94, 48, 96); });
    region('altița dreaptă', function (o) { altita(o, 108, 152, 40); });
    region('încrețul', function (o) { increti(o, 108, 152, 70); });
    region('râurile', function (o) { rauri(o, 150, 108, 82, 106, -1); });
    region('poalele', function (o) { poale(o, 50, 110, 156); });
    region('tivul', function (o) { outline(o); });

    // drumul camerei: media alunecătoare a punctelor din jur, ca să privească
    // mereu acolo unde lucrează acul
    var n = stitches.length, camX = new Float32Array(n), camY = new Float32Array(n);
    var BACK = 130, FWD = 60;
    for (var i = 0; i < n; i++) {
      var lo = Math.max(0, i - BACK), hi = Math.min(n - 1, i + FWD), sx = 0, sy = 0, k = 0;
      for (var j = lo; j <= hi; j++) { sx += stitches[j].x; sy += stitches[j].y; k++; }
      camX[i] = sx / k; camY[i] = sy / k;
    }

    return {
      colors: C,
      silhouette: SILHOUETTE,
      stitches: stitches,
      regions: regions,
      camX: camX,
      camY: camY,
      bounds: { x0: 0, y0: 30, x1: 160, y1: 180 }
    };
  }

  g.IA_PATTERN = build();
})(window);
