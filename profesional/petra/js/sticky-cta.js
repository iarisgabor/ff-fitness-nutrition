/* Bară sticky cu WhatsApp, doar pe mobil (pragul e din CSS, nu de aici).
   Apare după ce hero-ul a trecut de ecran, dispare când se ajunge la subsol
   — ca să nu dubleze butonul de WhatsApp de-acolo — și rămâne ascunsă cât
   timp lightbox-ul e deschis. */

window.Petra = window.Petra || {};

(function () {
  const bara = document.querySelector('[data-cta-sticky]');
  const hero = document.querySelector('[data-hero]');
  const subsol = document.querySelector('[data-subsol]');
  if (!bara || !hero || !subsol || !('IntersectionObserver' in window)) return;

  let trecutDeHero = false;
  let laSubsol = false;

  function actualizeaza() {
    const lightboxDeschis = document.body.classList.contains('lightbox-deschis');
    const arataBara = trecutDeHero && !laSubsol && !lightboxDeschis;
    bara.classList.toggle('is-vizibila', arataBara);
  }

  new IntersectionObserver(
    (entries) => {
      trecutDeHero = !entries[0].isIntersecting;
      actualizeaza();
    },
    { threshold: 0 }
  ).observe(hero);

  new IntersectionObserver(
    (entries) => {
      laSubsol = entries[0].isIntersecting;
      actualizeaza();
    },
    { threshold: 0, rootMargin: '0px 0px -20% 0px' }
  ).observe(subsol);

  // Lightbox-ul comută body.lightbox-deschis — verificăm din nou la fiecare
  // deschidere/închidere ca bara să nu rămână vizibilă în spatele lui.
  new MutationObserver(actualizeaza).observe(document.body, {
    attributes: true,
    attributeFilter: ['class']
  });
})();
