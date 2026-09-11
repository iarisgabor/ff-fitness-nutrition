/* Lightbox fullscreen: dialog modal, focus trap, Escape/săgeți/swipe, morph
   cu View Transitions (feature-detected, fallback la fade simplu). Oprește
   explicit Lenis la deschidere — overflow:hidden pe <body> nu ajunge, Lenis
   își interceptează singur evenimentul de scroll și tot mișcă pagina sub
   lightbox la rotița de mouse/swipe. */

window.Petra = window.Petra || {};

(function () {
  const el = document.querySelector('[data-lightbox]');
  if (!el) return;

  const img = el.querySelector('[data-lightbox-img]');
  const caption = el.querySelector('[data-lightbox-caption]');
  const btnClose = el.querySelector('[data-lightbox-close]');
  const btnPrev = el.querySelector('[data-lightbox-prev]');
  const btnNext = el.querySelector('[data-lightbox-next]');
  const scrim = el.querySelector('[data-lightbox-scrim]');

  let cadre = [];
  let index = 0;
  let titluCurent = '';
  let elementDeclansator = null;

  function srcsetPentru(manifestIntrare) {
    if (!manifestIntrare) return null;
    const srcset = manifestIntrare.variante.map((v) => `assets/foto/${v.fisier} ${v.latime}w`).join(', ');
    const ultima = manifestIntrare.variante[manifestIntrare.variante.length - 1];
    return { srcset, src: `assets/foto/${ultima.fisier}` };
  }

  function randeaza() {
    const id = cadre[index];
    const manifestMap = window.Petra.manifestFoto;
    const varianta = manifestMap ? srcsetPentru(manifestMap.get(id)) : null;
    if (varianta) {
      img.srcset = varianta.srcset;
      img.src = varianta.src;
    }
    const text = cadre.length > 1 ? `${titluCurent} — cadrul ${index + 1} din ${cadre.length}` : titluCurent;
    img.alt = text;
    caption.textContent = text;
    btnPrev.hidden = btnNext.hidden = cadre.length < 2;
  }

  function schimba(delta) {
    index = (index + delta + cadre.length) % cadre.length;
    randeaza();
  }

  function tineFocusul(e) {
    if (e.key !== 'Tab') return;
    const focusabile = Array.from(el.querySelectorAll('button')).filter((b) => !b.hidden);
    const prim = focusabile[0];
    const ultim = focusabile[focusabile.length - 1];
    if (e.shiftKey && document.activeElement === prim) {
      e.preventDefault();
      ultim.focus();
    } else if (!e.shiftKey && document.activeElement === ultim) {
      e.preventDefault();
      prim.focus();
    }
  }

  function peTastatura(e) {
    if (e.key === 'Escape') inchide();
    else if (e.key === 'ArrowRight') schimba(1);
    else if (e.key === 'ArrowLeft') schimba(-1);
    else tineFocusul(e);
  }

  function deschideInterior(proiectId, indexStart) {
    const proiect = (window.PROIECTE || []).find((p) => p.id === proiectId);
    if (!proiect) return;
    cadre = proiect.cadre;
    titluCurent = proiect.titlu;
    index = Math.min(indexStart || 0, cadre.length - 1);
    randeaza();

    elementDeclansator = document.activeElement;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('is-deschis'));
    document.body.classList.add('lightbox-deschis');
    if (window.Petra.lenis) window.Petra.lenis.stop();
    btnClose.focus();
    document.addEventListener('keydown', peTastatura);
  }

  function inchide() {
    el.classList.remove('is-deschis');
    document.body.classList.remove('lightbox-deschis');
    if (window.Petra.lenis) window.Petra.lenis.start();
    document.removeEventListener('keydown', peTastatura);
    const intarziere = window.Petra.prefersReducedMotion() ? 0 : 260;
    window.setTimeout(() => {
      el.hidden = true;
      img.style.viewTransitionName = '';
    }, intarziere);
    if (elementDeclansator) elementDeclansator.focus();
  }

  window.Petra.lightbox = {
    deschide(proiectId, indexStart, cardSursa) {
      const gata = window.Petra.manifestGata || Promise.resolve();
      gata.then(() => {
        const imgSursa = cardSursa ? cardSursa.querySelector('[data-proiect-cadru] img') : null;
        const suportaViewTransitions =
          typeof document.startViewTransition === 'function' && imgSursa && !window.Petra.prefersReducedMotion();

        const aplicaSchimbarea = () => {
          deschideInterior(proiectId, indexStart);
          if (imgSursa) {
            img.style.viewTransitionName = 'petra-lightbox';
            imgSursa.style.viewTransitionName = '';
          }
        };

        if (suportaViewTransitions) {
          imgSursa.style.viewTransitionName = 'petra-lightbox';
          document.startViewTransition(aplicaSchimbarea);
        } else {
          aplicaSchimbarea();
        }
      });
    }
  };

  btnClose.addEventListener('click', inchide);
  scrim.addEventListener('click', inchide);
  btnPrev.addEventListener('click', () => schimba(-1));
  btnNext.addEventListener('click', () => schimba(1));

  // Swipe simplu, fără librărie de gesturi.
  let xStart = null;
  el.addEventListener('pointerdown', (e) => {
    xStart = e.clientX;
  });
  el.addEventListener('pointerup', (e) => {
    if (xStart == null) return;
    const delta = e.clientX - xStart;
    if (Math.abs(delta) > 40) schimba(delta > 0 ? -1 : 1);
    xStart = null;
  });
})();
