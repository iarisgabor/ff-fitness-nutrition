/* admin.js — panoul prin care se adaugă și se schimbă iile.
   Poarta de aici e doar pentru comoditate; zidul adevărat sunt politicile RLS
   din Supabase — fără JWT de admin, cheia publică nu poate scrie nimic. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var poarta = $('[data-poarta]'), consola = $('[data-consola]'), neconf = $('[data-neconfigurat]');

  if (!window.IA_SHOP || !IA_SHOP.configurat) {
    poarta.classList.add('ascuns');
    neconf.classList.remove('ascuns');
    window.__ready = true;
    return;
  }

  var db = IA_SHOP.db();
  var lista = $('[data-lista]'), form = $('[data-form]');
  var btnSalveaza = $('[data-btn-salveaza]'), btnRenunta = $('[data-btn-renunta]');
  var titluForm = $('[data-titlu-form]');

  function mesaj(unde, text, fel) {
    unde.innerHTML = '<p class="mesaj mesaj--' + (fel || 'rau') + '">' + text + '</p>';
  }

  function slugify(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/ș|ş/gi, 's').replace(/ț|ţ/gi, 't')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'ie';
  }

  // ------------------------------------------------------------------ auth
  function arata(sesiune) {
    poarta.classList.toggle('ascuns', !!sesiune);
    consola.classList.toggle('ascuns', !sesiune);
    $('[data-iesire]').classList.toggle('ascuns', !sesiune);
    if (sesiune) incarcaLista();
  }

  db.auth.getSession().then(function (r) { arata(r.data.session); });

  $('[data-login]').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('[data-btn-login]');
    btn.disabled = true;
    db.auth.signInWithPassword({ email: $('#email').value, password: $('#parola').value })
      .then(function (r) {
        btn.disabled = false;
        if (r.error) { mesaj($('[data-login-mesaj]'), 'Nu am putut intra: ' + r.error.message); return; }
        $('[data-login-mesaj]').innerHTML = '';
        arata(r.data.session);
      });
  });

  $('[data-iesire]').addEventListener('click', function (e) {
    e.preventDefault();
    db.auth.signOut().then(function () { arata(null); });
  });

  // ----------------------------------------------------------------- lista
  function incarcaLista() {
    lista.innerHTML = '<p style="color:var(--cerneala-moale)">Se încarcă…</p>';
    db.from('products').select('*').order('sort').order('id').then(function (r) {
      if (r.error) { mesaj(lista, 'Nu am putut citi iile: ' + r.error.message); return; }
      lista.innerHTML = '';
      if (!r.data.length) { lista.innerHTML = '<p style="color:var(--cerneala-moale)">Încă nicio ie.</p>'; return; }
      r.data.forEach(function (p) { lista.appendChild(rand(p)); });
    });
  }

  function rand(p) {
    var url = IA_SHOP.pozaUrl(p);
    var el = document.createElement('div');
    el.className = 'rand-ie';
    el.innerHTML =
      '<div class="rand-ie__poza">' + (url ? '<img src="' + url + '" alt="">' : IA_SHOP.motiv(p.slug)) + '</div>' +
      '<div><b></b><small></small></div>' +
      '<div class="rand-actiuni">' +
        '<button class="buton buton--gol mic" data-edit>Schimbă</button>' +
        '<button class="buton buton--gol mic" data-vizibil>' + (p.active ? 'Ascunde' : 'Arată') + '</button>' +
        '<button class="buton buton--gol mic" data-sterge>Șterge</button>' +
      '</div>';
    $('b', el).textContent = p.name;
    $('small', el).textContent = IA_SHOP.pret(p) +
      (p.size ? ' · mărimea ' + p.size : '') +
      (p.status === 'vanduta' ? ' · s-a dus' : '') +
      (p.active ? '' : ' · ascunsă');

    $('[data-edit]', el).addEventListener('click', function () { editeaza(p); });
    $('[data-vizibil]', el).addEventListener('click', function () {
      db.from('products').update({ active: !p.active }).eq('id', p.id).then(incarcaLista);
    });
    $('[data-sterge]', el).addEventListener('click', function () {
      if (!confirm('Ștergi „' + p.name + '"? Nu se mai poate întoarce.')) return;
      db.from('products').delete().eq('id', p.id).then(incarcaLista);
    });
    return el;
  }

  // ---------------------------------------------------------------- editare
  function editeaza(p) {
    $('[data-id]').value = p.id;
    $('[data-nume]').value = p.name || '';
    $('[data-pret]').value = Math.round((p.price_cents || 0) / 100);
    $('[data-marime]').value = p.size || '';
    $('[data-stare]').value = p.status || 'disponibila';
    $('[data-descriere]').value = p.description || '';
    $('[data-ordine]').value = p.sort || 0;
    titluForm.textContent = 'Schimbi „' + p.name + '"';
    btnRenunta.classList.remove('ascuns');
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  btnRenunta.addEventListener('click', reseteaza);

  function reseteaza() {
    form.reset();
    $('[data-id]').value = '';
    titluForm.textContent = 'Adaugă o ie';
    btnRenunta.classList.add('ascuns');
    $('[data-form-mesaj]').innerHTML = '';
  }

  // pozele generate ies uriașe; le micșorăm în browser înainte să plece spre depozit
  function micsoreaza(file) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        var max = 2200, s = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { b ? res(b) : rej(new Error('nu s-a putut converti poza')); }, 'image/jpeg', 0.84);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = function () { rej(new Error('poza nu s-a putut citi')); };
      img.src = URL.createObjectURL(file);
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    // butonul se blochează: două click-uri rapide altfel lovesc constrângerea de slug
    btnSalveaza.disabled = true;
    var raport = $('[data-form-mesaj]');
    raport.innerHTML = '';

    var id = $('[data-id]').value;
    var nume = $('[data-nume]').value.trim();
    var date = {
      name: nume,
      description: $('[data-descriere]').value.trim() || null,
      price_cents: Math.round(parseFloat($('[data-pret]').value || '0') * 100),
      size: $('[data-marime]').value.trim() || null,
      status: $('[data-stare]').value,
      sort: parseInt($('[data-ordine]').value || '0', 10)
    };

    var fisier = $('[data-poza]').files[0];
    var pas = fisier ? micsoreaza(fisier).then(urca) : Promise.resolve(null);

    function urca(blob) {
      // nume nou la fiecare încărcare: CDN-ul ține poza după cale, nu după conținut
      var cale = slugify(nume) + '-' + Date.now() + '.jpg';
      return db.storage.from('ii').upload(cale, blob, { contentType: 'image/jpeg' })
        .then(function (r) {
          if (r.error) throw new Error('poza nu s-a încărcat: ' + r.error.message);
          return cale;
        });
    }

    pas.then(function (cale) {
      if (cale) date.image_path = cale;
      if (id) return db.from('products').update(date).eq('id', id);
      return salveazaNou(date, slugify(nume), 0);
    }).then(function (r) {
      if (r && r.error) throw new Error(r.error.message);
      reseteaza();
      incarcaLista();
      mesaj(raport, 'Salvat.', 'bun');
    }).catch(function (err) {
      mesaj(raport, 'N-a mers: ' + err.message);
    }).then(function () {
      btnSalveaza.disabled = false;
    });
  });

  // slug ocupat? încearcă din nou cu un număr la coadă, nu arunca eroarea în față
  function salveazaNou(date, baza, n) {
    var slug = n ? baza + '-' + n : baza;
    return db.from('products').insert(Object.assign({ slug: slug, active: true }, date)).then(function (r) {
      if (r.error && r.error.code === '23505' && n < 20) return salveazaNou(date, baza, n + 1);
      return r;
    });
  }

  window.__ready = true;
})();
