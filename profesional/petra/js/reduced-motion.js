/* Sursă unică pentru prefers-reduced-motion. Orice alt modul verifică
   Petra.prefersReducedMotion() ÎNAINTE să pornească ceva animat — Lenis,
   reveal-urile GSAP, titlul literă-cu-literă, morph-ul de View Transitions.
   Starea implicită din CSS e mereu varianta finală, vizibilă — dacă un
   modul JS pică, conținutul tot arată corect, nu rămâne ascuns. */

window.Petra = window.Petra || {};

(function () {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');

  function aplica() {
    document.documentElement.classList.toggle('reduce-motion', query.matches);
  }

  aplica();
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', aplica);
  }

  window.Petra.prefersReducedMotion = function () {
    return query.matches;
  };
})();
