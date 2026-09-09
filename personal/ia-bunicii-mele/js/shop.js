/* shop.js — iile: citite din Supabase, desenate în aceeași lume ca filmul.
   Cât timp config.js e gol (înainte să existe proiectul), se arată exemple locale,
   marcate ca atare. Dacă baza e configurată dar cade, spunem asta — nu inventăm ii. */
(function (g) {
  'use strict';

  var CFG = g.IA_CONFIG || {};
  var configurat = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  var client = null;

  function db() {
    if (!configurat) return null;
    if (!client && g.supabase) {
      client = g.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    }
    return client;
  }

  var EXEMPLE = [
    { id: -1, slug: 'ie-cu-altita-neagra', name: 'Ie cu altiță neagră', description: 'Bumbac alb, altiță bătută des în negru și roșu, râuri oblice pe mânecă.', price_cents: 89000, currency: 'RON', size: 'M', status: 'disponibila' },
    { id: -2, slug: 'ie-cu-rauri-rosii', name: 'Ie cu râuri roșii', description: 'Model mai deschis, cu râurile în roșu de garanță și încrețul în fir de aur.', price_cents: 76000, currency: 'RON', size: 'S', status: 'disponibila' },
    { id: -3, slug: 'ie-de-sarbatoare', name: 'Ie de sărbătoare', description: 'Cea mai încărcată: altiță pe toată lățimea mânecii, cu fir auriu între registre.', price_cents: 120000, currency: 'RON', size: 'L', status: 'disponibila' },
    { id: -4, slug: 'ie-simpla-de-vara', name: 'Ie simplă de vară', description: 'Pânză subțire, doar altița și tivul cusute — se poartă ușor pe căldură.', price_cents: 62000, currency: 'RON', size: 'M', status: 'vanduta' }
  ];

  function pret(p) {
    return (p.price_cents / 100).toLocaleString('ro-RO', { maximumFractionDigits: 0 }) + ' ' + (p.currency || 'RON');
  }

  function pretHtml(p) {
    return (p.price_cents / 100).toLocaleString('ro-RO', { maximumFractionDigits: 0 }) +
           ' <small>' + escapeHtml(p.currency || 'RON') + '</small>';
  }

  function pozaUrl(p) {
    if (!p.image_path) return null;
    if (/^https?:/.test(p.image_path)) return p.image_path;
    return CFG.SUPABASE_URL + '/storage/v1/object/public/ii/' + p.image_path;
  }

  // când nu e poză, punem un model cusut — generat din numele iei, deci mereu același
  function motiv(slug) {
    var h = 0;
    for (var i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
    var culori = ['#A81E12', '#2A2018', '#B0872F', '#2B3A57'];
    var c1 = culori[h % 4], c2 = culori[(h >> 3) % 4];
    if (c1 === c2) c2 = culori[(h >> 5) % 4] === c1 ? '#B0872F' : culori[(h >> 5) % 4];
    var r = 4 + (h >> 7) % 2;
    var cells = [], i2, dx, dy, k;

    for (dx = -r; dx <= r; dx++) {
      dy = r - Math.abs(dx);
      cells.push([dx, dy, c1]);
      if (dy) cells.push([dx, -dy, c1]);
    }
    for (dx = -(r - 2); dx <= r - 2; dx++) {
      dy = (r - 2) - Math.abs(dx);
      cells.push([dx, dy, c2]);
      if (dy) cells.push([dx, -dy, c2]);
    }
    cells.push([0, 0, c2]);
    for (k = 1; k <= 2; k++) {
      cells.push([r + k, 0, c1]); cells.push([-r - k, 0, c1]);
      cells.push([0, r + k, c1]); cells.push([0, -r - k, c1]);
    }
    if ((h >> 9) % 2) {
      for (k = 0; k < 4; k++) {
        var sx = k < 2 ? 1 : -1, sy = k % 2 ? 1 : -1;
        cells.push([sx * (r - 1), sy * (r - 1), c2]);
        cells.push([sx * r, sy * r, c2]);
      }
    }

    var span = r + 3, size = span * 2 + 1, out = '';
    for (i2 = 0; i2 < cells.length; i2++) {
      var x = cells[i2][0] + span, y = cells[i2][1] + span;
      out += '<path d="M' + (x + 0.18) + ' ' + (y + 0.18) + 'L' + (x + 0.82) + ' ' + (y + 0.82) +
             'M' + (x + 0.82) + ' ' + (y + 0.18) + 'L' + (x + 0.18) + ' ' + (y + 0.82) +
             '" stroke="' + cells[i2][2] + '"/>';
    }
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" fill="none" stroke-width="0.3" ' +
           'stroke-linecap="round" aria-hidden="true">' + out + '</svg>';
  }

  function card(p) {
    var url = pozaUrl(p);
    var vanduta = p.status === 'vanduta';
    var el = document.createElement('article');
    el.className = 'ie-card' + (vanduta ? ' ie-card--luata' : '');
    el.innerHTML =
      '<div class="ie-card__poza">' +
        (url ? '<img src="' + url + '" alt="' + escapeAttr(p.name) + '" loading="lazy">' : motiv(p.slug || p.name)) +
      '</div>' +
      '<div class="ie-card__corp">' +
        '<h3 class="ie-card__nume"></h3>' +
        '<p class="ie-card__desc"></p>' +
        '<p class="ie-card__meta"></p>' +
        '<div class="ie-card__jos">' +
          '<span class="pret"></span>' +
          (vanduta
            ? '<span class="stare stare--luata">S-a dus</span>'
            : '<button class="buton buton--mic" type="button" data-adauga>Pune în coș</button>') +
        '</div>' +
      '</div>';

    el.querySelector('.ie-card__nume').textContent = p.name;
    el.querySelector('.ie-card__desc').textContent = p.description || '';
    el.querySelector('.ie-card__meta').textContent =
      (p.size ? 'mărimea ' + p.size : 'un singur exemplar') + (vanduta ? ' · s-a dus' : '');
    el.querySelector('.pret').innerHTML = pretHtml(p);

    var btn = el.querySelector('[data-adauga]');
    if (btn) {
      var starea = function () {
        var inCos = window.IA_COS && IA_COS.contine(p.id);
        btn.textContent = inCos ? 'E în coș' : 'Pune în coș';
        btn.classList.toggle('buton--gol', !!inCos);
      };
      btn.addEventListener('click', function () {
        if (window.IA_COS) IA_COS.adauga(p);
      });
      document.addEventListener('cos:schimbat', starea);
      starea();
    }
    return el;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function mesaj(el, text, fel) {
    var d = document.createElement('p');
    d.className = 'mesaj mesaj--' + (fel || 'rau');
    d.textContent = text;
    el.appendChild(d);
  }

  function incarca(el) {
    var limita = parseInt(el.dataset.limita || '0', 10);
    el.innerHTML = '';

    if (!configurat) {
      var demo = EXEMPLE.slice(0, limita || EXEMPLE.length);
      demo.forEach(function (p) { el.appendChild(card(p)); });
      var nota = document.createElement('p');
      nota.className = 'mesaj mesaj--bun';
      nota.style.gridColumn = '1 / -1';
      nota.textContent = 'Exemple. Iile adevărate apar aici imediat ce se leagă baza de date.';
      el.appendChild(nota);
      return;
    }

    var c = db();
    var q = c.from('products').select('*').eq('active', true).order('sort').order('id');
    if (limita) q = q.limit(limita);

    q.then(function (res) {
      el.innerHTML = '';
      if (res.error) { mesaj(el, 'Nu s-au putut încărca iile acum. Încearcă din nou peste puțin.'); return; }
      if (!res.data.length) { mesaj(el, 'Momentan nu e nicio ie gata. Revino în curând.', 'bun'); return; }
      res.data.forEach(function (p) { el.appendChild(card(p)); });
    });
  }

  document.querySelectorAll('[data-ii-teaser], [data-ii-toate]').forEach(incarca);

  g.IA_SHOP = { card: card, motiv: motiv, pret: pret, pozaUrl: pozaUrl, db: db, configurat: configurat };
})(window);
