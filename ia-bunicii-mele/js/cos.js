/* cos.js — coșul și plata pe loc, în aceeași pagină.
   Fiecare ie e unică, deci nu există cantitate: o ie e ori în coș, ori nu.
   Prețurile de aici sunt doar de afișat — suma reală o calculează funcția
   „checkout" pe server, din baza de date, ca să nu poată fi umblată din browser. */
(function (g) {
  'use strict';

  var CHEIE = 'ia-bunicii-cos';
  var CFG = g.IA_CONFIG || {};
  var items = [];      // iile din coș, cu tot cu date de afișat
  var checkout = null; // instanța Stripe, cât timp e deschisă

  function idsSalvate() {
    try {
      var v = JSON.parse(localStorage.getItem(CHEIE) || '[]');
      return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'number'; }) : [];
    } catch (e) { return []; }
  }

  function salveaza() {
    try {
      localStorage.setItem(CHEIE, JSON.stringify(items.map(function (p) { return p.id; })));
    } catch (e) { /* navigare privată — coșul trăiește doar în pagina asta */ }
  }

  // ------------------------------------------------------------------ schelet
  var radacina = document.createElement('div');
  radacina.className = 'cos';
  radacina.innerHTML =
    '<div class="cos__valu" data-inchide></div>' +
    '<aside class="cos__panou" role="dialog" aria-modal="true" aria-label="Coșul tău" tabindex="-1">' +
      '<header class="cos__sus">' +
        '<h2 class="serif">Coșul tău</h2>' +
        '<button class="cos__x" data-inchide aria-label="Închide coșul">&times;</button>' +
      '</header>' +
      '<div class="cos__corp" data-corp></div>' +
      '<footer class="cos__jos" data-jos></footer>' +
    '</aside>';
  document.body.appendChild(radacina);

  var corp = radacina.querySelector('[data-corp]');
  var jos = radacina.querySelector('[data-jos]');
  var panou = radacina.querySelector('.cos__panou');

  radacina.addEventListener('click', function (e) {
    if (e.target.closest('[data-inchide]')) inchide();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && radacina.classList.contains('cos--deschis')) inchide();
  });

  function deschide() {
    radacina.classList.add('cos--deschis');
    document.body.style.overflow = 'hidden';
    panou.focus();
    deseneaza();
  }

  function inchide() {
    radacina.classList.remove('cos--deschis');
    document.body.style.overflow = '';
    distrugeCheckout();
    deseneaza();
  }

  function distrugeCheckout() {
    if (checkout) { try { checkout.destroy(); } catch (e) {} checkout = null; }
  }

  // ------------------------------------------------------------------ butonul
  var butonCos = null;
  function montButon() {
    var nav = document.querySelector('.antet .nav');
    if (!nav) return;
    butonCos = document.createElement('button');
    butonCos.className = 'cos-buton';
    butonCos.type = 'button';
    butonCos.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M4 6h16l-1.4 10.2a2 2 0 0 1-2 1.8H7.4a2 2 0 0 1-2-1.8L4 6Z"/><path d="M9 6a3 3 0 0 1 6 0"/></svg>' +
      '<span data-numar>0</span>';
    butonCos.addEventListener('click', deschide);
    nav.appendChild(butonCos);
    actualizeazaNumar();
  }

  function actualizeazaNumar() {
    if (!butonCos) return;
    var n = items.length;
    butonCos.querySelector('[data-numar]').textContent = n;
    butonCos.classList.toggle('cos-buton--plin', n > 0);
    butonCos.setAttribute('aria-label', n ? 'Coșul tău, ' + n + ' ii' : 'Coșul tău e gol');
  }

  // ------------------------------------------------------------------ desenat
  function lei(bani, moneda) {
    return (bani / 100).toLocaleString('ro-RO', { maximumFractionDigits: 0 }) + ' ' + (moneda || 'RON');
  }

  function deseneaza() {
    actualizeazaNumar();
    if (checkout) return;   // cât timp e plata deschisă, nu redesenăm sub ea

    if (!items.length) {
      corp.innerHTML = '<p class="cos__gol">Încă n-ai pus nimic în coș.</p>';
      jos.innerHTML = '<a class="buton buton--gol" href="magazin.html">Vezi iile</a>';
      return;
    }

    corp.innerHTML = '';
    items.forEach(function (p) {
      var url = g.IA_SHOP ? IA_SHOP.pozaUrl(p) : null;
      var rand = document.createElement('div');
      rand.className = 'cos__rand';
      rand.innerHTML =
        '<div class="cos__poza">' + (url ? '<img src="' + url + '" alt="">' : (g.IA_SHOP ? IA_SHOP.motiv(p.slug || String(p.id)) : '')) + '</div>' +
        '<div class="cos__text"><b></b><small></small></div>' +
        '<div class="cos__pret"><span></span><button class="cos__scoate" type="button">scoate</button></div>';
      rand.querySelector('b').textContent = p.name;
      rand.querySelector('small').textContent = p.size ? 'mărimea ' + p.size : 'o singură bucată';
      rand.querySelector('.cos__pret span').textContent = lei(p.price_cents, p.currency);
      rand.querySelector('.cos__scoate').addEventListener('click', function () { scoate(p.id); });
      corp.appendChild(rand);
    });

    var total = items.reduce(function (s, p) { return s + p.price_cents; }, 0);
    jos.innerHTML =
      '<div class="cos__total"><span>Total</span><b>' + lei(total, items[0].currency) + '</b></div>' +
      '<p class="cos__nota">Livrarea se adaugă la pasul următor.</p>' +
      '<button class="buton cos__plateste" type="button" data-plateste>Plătește</button>';
    jos.querySelector('[data-plateste]').addEventListener('click', platesteAcum);
  }

  // ------------------------------------------------------------------ acțiuni
  function contine(id) { return items.some(function (p) { return p.id === id; }); }

  function adauga(produs) {
    if (contine(produs.id)) { deschide(); return; }
    items.push(produs);
    salveaza();
    deseneaza();
    deschide();
    document.dispatchEvent(new CustomEvent('cos:schimbat'));
  }

  function scoate(id) {
    items = items.filter(function (p) { return p.id !== id; });
    salveaza();
    deseneaza();
    document.dispatchEvent(new CustomEvent('cos:schimbat'));
  }

  function goleste() {
    items = [];
    salveaza();
    document.dispatchEvent(new CustomEvent('cos:schimbat'));
  }

  // --------------------------------------------------------------- plata
  function stripeJs() {
    if (g.Stripe) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://js.stripe.com/v3/';
      s.onload = res;
      s.onerror = function () { rej(new Error('nu s-a putut încărca Stripe')); };
      document.head.appendChild(s);
    });
  }

  function platesteAcum() {
    var btn = jos.querySelector('[data-plateste]');
    btn.disabled = true;
    btn.textContent = 'Se pregătește…';

    fetch(CFG.SUPABASE_URL + '/functions/v1/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CFG.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ ids: items.map(function (p) { return p.id; }) })
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, b: b }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.b && res.b.error ? res.b.error : 'plata nu a putut porni');
        return stripeJs().then(function () { return res.b; });
      })
      .then(function (b) {
        corp.innerHTML = '<div id="plata-stripe"></div>';
        jos.innerHTML = '<button class="buton buton--gol" type="button" data-inapoi>Înapoi la coș</button>';
        jos.querySelector('[data-inapoi]').addEventListener('click', function () {
          distrugeCheckout();
          deseneaza();
        });
        return g.Stripe(b.publishableKey).initEmbeddedCheckout({
          clientSecret: b.clientSecret,
          onComplete: multumim
        });
      })
      .then(function (c) {
        checkout = c;
        c.mount('#plata-stripe');
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.textContent = 'Plătește';
        var m = jos.querySelector('.mesaj');
        if (m) m.remove();
        var p = document.createElement('p');
        p.className = 'mesaj mesaj--rau';
        p.textContent = err.message;
        jos.appendChild(p);
      });
  }

  function multumim() {
    goleste();
    distrugeCheckout();
    corp.innerHTML =
      '<div class="cos__gata">' +
        // rozeta mărcii, nu un X singur: un X roșu în cerc se citește „a eșuat"
        '<span class="cos__bifa" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-width="1.8">' +
            '<g stroke="#A81E12">' +
              '<path d="M10 2.5l4 4M14 2.5l-4 4"/><path d="M2.5 10l4 4M6.5 10l-4 4"/>' +
              '<path d="M17.5 10l4 4M21.5 10l-4 4"/><path d="M10 17.5l4 4M14 17.5l-4 4"/>' +
            '</g>' +
            '<g stroke="#2A2018"><path d="M10 10l4 4M14 10l-4 4"/></g>' +
          '</svg>' +
        '</span>' +
        '<h3 class="serif">Mulțumim.</h3>' +
        '<p>Comanda a intrat. Primești un email de la Stripe cu bonul, iar de la mine unul cu ziua în care pleacă pachetul.</p>' +
      '</div>';
    jos.innerHTML = '<button class="buton" type="button" data-inchide>Închide</button>';
    actualizeazaNumar();
  }

  // ------------------------------------------------------------------ pornire
  // iile din coș se recitesc din bază la fiecare încărcare: dacă una s-a vândut
  // sau a fost ascunsă între timp, iese singură din coș
  function porneste() {
    montButon();
    var ids = idsSalvate();
    if (!ids.length || !g.IA_SHOP || !IA_SHOP.configurat) { deseneaza(); return; }
    IA_SHOP.db().from('products').select('*').in('id', ids).eq('active', true)
      .then(function (r) {
        if (!r.error && r.data) {
          items = r.data.filter(function (p) { return p.status !== 'vanduta'; });
          salveaza();
        }
        deseneaza();
      });
  }

  g.IA_COS = { adauga: adauga, scoate: scoate, contine: contine, deschide: deschide };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', porneste);
  else porneste();
})(window);
