/* Scroll neted (Lenis) legat de bucla GSAP. Sub prefers-reduced-motion, Lenis
   nici nu se instanțiază — scroll-ul cu inerție e chiar genul de mișcare pe
   care reduced-motion cere s-o oprești, nu doar s-o atenuezi; scroll-ul nativ
   rămâne implicit dacă acest fișier nu rulează deloc. */

window.Petra = window.Petra || {};

(function () {
  if (window.Petra.prefersReducedMotion()) return;
  if (typeof window.Lenis !== 'function' || typeof window.gsap === 'undefined') return;

  const lenis = new window.Lenis({
    duration: 1.1,
    smoothWheel: true
  });

  lenis.on('scroll', window.ScrollTrigger ? window.ScrollTrigger.update : undefined);

  window.gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  window.gsap.ticker.lagSmoothing(0);

  window.Petra.lenis = lenis;
})();
