/* site.js — comportamentele comune tuturor paginilor. */
(function () {
  'use strict';

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = !!(window.gsap && window.ScrollTrigger);
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  // anul din subsol
  var an = document.querySelector('[data-an]');
  if (an) an.textContent = new Date().getFullYear();

  // antetul se așază pe fundal după ce pleci de sus
  var antet = document.querySelector('[data-antet]');
  if (antet) {
    var onScroll = function () {
      antet.classList.toggle('antet--fixat', window.scrollY > 40);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // titlul se ridică literă cu literă; NFC ca ș/ț/ă/â/î să rămână un singur glif
  var intro = null;
  var titlu = document.querySelector('[data-split]');
  if (titlu) {
    var text = titlu.textContent.normalize('NFC').trim();
    titlu.textContent = '';
    var glifuri = [];
    text.split(' ').forEach(function (cuvant, ci, toate) {
      var w = document.createElement('span');
      w.className = 'cuv';
      Array.from(cuvant).forEach(function (ch) {
        var s = document.createElement('span');
        s.className = 'glif';
        s.textContent = ch;
        w.appendChild(s);
        glifuri.push(s);
      });
      titlu.appendChild(w);
      if (ci < toate.length - 1) titlu.appendChild(document.createTextNode(' '));
    });

    if (hasGsap) {
      intro = gsap.timeline({ delay: 0.15 });
      intro.from(glifuri, {
        yPercent: 125,
        duration: 1.15,
        ease: 'power4.out',
        stagger: 0.035
      });
      intro.from('.erou-supra, .erou-sub, .erou-fir', {
        opacity: 0, y: 14, duration: 0.8, ease: 'power2.out', stagger: 0.1
      }, '-=0.75');
    }
  }

  // aparițiile de la scroll
  function porneșteReveal() {
    if (!hasGsap) {
      document.querySelectorAll('.reveal').forEach(function (el) {
        el.style.opacity = 1; el.style.transform = 'none';
      });
      return;
    }
    document.querySelectorAll('.reveal').forEach(function (el) {
      gsap.to(el, {
        opacity: 1, y: 0, duration: 0.85, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });

    document.querySelectorAll('[data-numar]').forEach(function (el) {
      var tinta = parseFloat(el.dataset.numar);
      gsap.to(el, {
        textContent: tinta,
        duration: 1.4,
        ease: 'power2.out',
        snap: { textContent: 1 },
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });
  }

  if (reduced) {
    document.querySelectorAll('.reveal').forEach(function (el) {
      el.style.opacity = 1; el.style.transform = 'none';
    });
    document.querySelectorAll('[data-numar]').forEach(function (el) {
      el.textContent = el.dataset.numar;
    });
    if (intro) intro.progress(1);
  } else {
    porneșteReveal();
  }

  // pentru harnașamentul de verificare: totul așezat, instantaneu
  window.IA_SETTLE = function () {
    if (intro) intro.progress(1);
    if (hasGsap) {
      ScrollTrigger.refresh();
      ScrollTrigger.getAll().forEach(function (st) {
        if (st.trigger && st.trigger.getBoundingClientRect().top < window.innerHeight) {
          var tw = st.animation;
          if (tw && tw.progress() < 1) tw.progress(1);
        }
      });
    }
  };
})();
