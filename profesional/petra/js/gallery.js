/* Grila „Lucrări". Baza (poza de copertă per proiect) e scrisă direct în
   index.html, cu srcset real — dacă fetch-ul de mai jos sau JS-ul eșuează,
   secțiunea cea mai puternică din site tot arată conținut real, nu gol.
   Acest fișier doar ÎMBUNĂTĂȚEȘTE acel grid: preview la hover/tap peste
   celelalte cadre ale proiectului, plus clasa .proiect--lat dedusă din
   orientarea reală a copertei (nu un flag ținut de mână care poate rămâne
   nesincronizat). */

window.Petra = window.Petra || {};

(function () {
  const carduri = document.querySelectorAll('[data-proiect]');
  if (!carduri.length) return;

  const poateHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const CICLU_MS = 900;

  // Expus și pe window.Petra, ca lightbox.js să nu mai facă un al doilea fetch.
  window.Petra.manifestGata = fetch('assets/foto/manifest.json')
    .then((r) => r.json())
    .then((manifest) => {
      const dupaId = new Map(manifest.map((m) => [m.id, m]));
      window.Petra.manifestFoto = dupaId;

      carduri.forEach((card) => initCard(card, dupaId));
      return dupaId;
    })
    .catch((eroare) => {
      console.warn('[petra] manifest.json indisponibil — grila rămâne pe pozele de copertă din HTML.', eroare);
    });

  function srcsetPentru(manifestIntrare) {
    if (!manifestIntrare) return null;
    const srcset = manifestIntrare.variante
      .map((v) => `assets/foto/${v.fisier} ${v.latime}w`)
      .join(', ');
    const ultima = manifestIntrare.variante[manifestIntrare.variante.length - 1];
    return { srcset, src: `assets/foto/${ultima.fisier}` };
  }

  function initCard(card, dupaId) {
    const proiectId = card.getAttribute('data-proiect');
    const proiect = (window.PROIECTE || []).find((p) => p.id === proiectId);
    if (!proiect) return;

    const copertaId = proiect.cadre[0];
    const copertaManifest = dupaId.get(copertaId);
    if (copertaManifest && copertaManifest.orientare === 'oriz') {
      card.classList.add('proiect--lat');
    }

    const img = card.querySelector('[data-proiect-cadru] img');
    let indexCurent = 0;
    let intervalId = null;

    function arataCadru(index) {
      indexCurent = index;
      if (!img) return;
      const id = proiect.cadre[index];
      const varianta = srcsetPentru(dupaId.get(id));
      if (!varianta) return;
      img.srcset = varianta.srcset;
      img.src = varianta.src;
    }

    if (poateHover && proiect.cadre.length > 1 && !window.Petra.prefersReducedMotion()) {
      card.addEventListener('mouseenter', () => {
        let i = 0;
        intervalId = window.setInterval(() => {
          i = (i + 1) % proiect.cadre.length;
          arataCadru(i);
        }, CICLU_MS);
      });
      card.addEventListener('mouseleave', () => {
        if (intervalId) window.clearInterval(intervalId);
        arataCadru(0);
      });
    }

    const trigger = card.querySelector('[data-proiect-trigger]');
    if (!trigger) return;

    const esteTouch = !poateHover;

    trigger.addEventListener('click', (e) => {
      const esteTastatura = e.detail === 0;
      if (esteTouch && !esteTastatura && !card.classList.contains('is-armat')) {
        e.preventDefault();
        document.querySelectorAll('.proiect.is-armat').forEach((c) => {
          if (c !== card) c.classList.remove('is-armat');
        });
        card.classList.add('is-armat');
        return;
      }
      if (window.Petra.lightbox) {
        window.Petra.lightbox.deschide(proiectId, indexCurent, card);
      }
    });
  }

  // Tap în afara oricărui card „armat" îl dezarmează.
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-proiect]')) return;
    document.querySelectorAll('.proiect.is-armat').forEach((c) => c.classList.remove('is-armat'));
  });
})();
