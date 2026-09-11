/* Dezvăluiri la scroll (GSAP ScrollTrigger) + animația titlului din hero,
   literă cu literă. Sub prefers-reduced-motion, sau dacă GSAP n-a încărcat,
   totul rămâne pe starea finală definită în CSS ([data-reveal] e vizibil
   implicit) — nu se ascunde nimic din JS ca fallback. */

window.Petra = window.Petra || {};

(function () {
  const reduceMotion = window.Petra.prefersReducedMotion();
  const items = document.querySelectorAll('[data-reveal]');

  if (!reduceMotion && window.gsap && window.ScrollTrigger) {
    window.gsap.registerPlugin(window.ScrollTrigger);

    window.gsap.set(items, { opacity: 0, y: 24 });

    window.ScrollTrigger.batch(items, {
      start: 'top 88%',
      once: true,
      onEnter: (batch) =>
        window.gsap.to(batch, {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power2.out',
          stagger: 0.08
        })
    });
  }

  // Titlul din hero, literă cu literă — pe grafeme NFC (Array.from, nu
  // .split('')), ca diacriticele (ă â î ș ț) să nu se despartă de litera lor
  // de bază la un cod-point compus greșit.
  const titlu = document.querySelector('[data-hero-titlu]');
  if (!titlu) return;

  const text = titlu.textContent.normalize('NFC');
  const litere = Array.from(text);
  titlu.textContent = '';
  titlu.setAttribute('aria-label', text);

  const spans = litere.map((litera) => {
    const span = document.createElement('span');
    span.className = 'litera';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = litera === ' ' ? ' ' : litera;
    titlu.appendChild(span);
    return span;
  });

  if (reduceMotion || !window.gsap) {
    spans.forEach((s) => (s.style.opacity = '1'));
    return;
  }

  window.gsap.set(spans, { opacity: 0, y: '0.6em' });
  window.gsap.to(spans, {
    opacity: 1,
    y: 0,
    duration: 0.7,
    ease: 'power3.out',
    stagger: 0.025,
    delay: 0.1
  });
})();
