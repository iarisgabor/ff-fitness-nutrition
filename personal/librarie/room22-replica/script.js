(() => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- scroll progress bar ---------- */
  const progressBar = document.querySelector('.scroll-progress span');
  const updateProgress = () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    progressBar.style.width = `${docHeight > 0 ? (scrollTop / docHeight) * 100 : 0}%`;
  };

  /* ---------- header shrink/blur + active link ---------- */
  const header = document.getElementById('site-header');
  const navLinks = document.querySelectorAll('[data-nav]');
  const sections = ['viziune', 'cantece', 'resurse'].map(id => document.getElementById(id));

  const updateHeader = () => {
    header.classList.toggle('scrolled', window.scrollY > 40);
    let current = null;
    sections.forEach(section => {
      if (!section) return;
      const rect = section.getBoundingClientRect();
      if (rect.top <= 140 && rect.bottom >= 140) current = section.id;
    });
    navLinks.forEach(link => {
      link.classList.toggle('active-link', link.getAttribute('href') === `#${current}`);
    });
  };

  /* ---------- back to top ---------- */
  const backToTop = document.querySelector('.back-to-top');
  const updateBackToTop = () => backToTop.classList.toggle('show', window.scrollY > 700);
  backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' }));

  const onScroll = () => { updateProgress(); updateHeader(); updateBackToTop(); };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- mobile menu ---------- */
  const menuToggle = document.querySelector('.menu-toggle');
  const mainNav = document.querySelector('.main-nav');
  menuToggle.addEventListener('click', () => {
    const open = mainNav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(open));
  });
  mainNav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    mainNav.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }));

  /* ---------- scroll reveal ---------- */
  const revealEls = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !prefersReducedMotion) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const delay = el.dataset.revealDelay || 0;
        setTimeout(() => el.classList.add('in-view'), Number(delay));
        io.unobserve(el);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('in-view'));
  }

  /* ---------- cursor glow ---------- */
  const cursorGlow = document.querySelector('.cursor-glow');
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    window.addEventListener('mousemove', event => {
      cursorGlow.classList.add('active');
      cursorGlow.style.transform = `translate(${event.clientX}px, ${event.clientY}px) translate(-50%, -50%)`;
    });
    window.addEventListener('mouseleave', () => cursorGlow.classList.remove('active'));
  }

  /* ---------- hero parallax on mouse move ---------- */
  const heroArt = document.querySelector('.hero-art');
  const parallaxEls = document.querySelectorAll('[data-parallax]');
  const hero = document.querySelector('.hero');
  if (hero && !prefersReducedMotion) {
    hero.addEventListener('mousemove', event => {
      const rect = hero.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      parallaxEls.forEach(el => {
        const strength = Number(el.dataset.parallax) * 100;
        el.style.transform = `${el.classList.contains('sun') ? 'translateX(-50%) ' : ''}translate(${x * strength}px, ${y * strength}px)`;
      });
    });
    hero.addEventListener('mouseleave', () => {
      parallaxEls.forEach(el => {
        el.style.transform = el.classList.contains('sun') ? 'translateX(-50%)' : '';
      });
    });
  }

  /* ---------- magnetic buttons ---------- */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !prefersReducedMotion) {
    document.querySelectorAll('.magnetic').forEach(button => {
      button.addEventListener('mousemove', event => {
        const rect = button.getBoundingClientRect();
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;
        button.style.transform = `translate(${x * 0.18}px, ${y * 0.35}px)`;
      });
      button.addEventListener('mouseleave', () => { button.style.transform = ''; });
    });
  }

  /* ---------- magnifying-glass reveal on the hero heading ---------- */
  const magnifyHeading = document.querySelector('[data-magnify]');
  if (magnifyHeading && window.matchMedia('(hover: hover) and (pointer: fine)').matches && !prefersReducedMotion) {
    const magnifyLayer = magnifyHeading.querySelector('.magnify-layer');
    const lensRing = magnifyHeading.querySelector('.lens-ring');
    const radius = 95;
    const moveLens = event => {
      const rect = magnifyHeading.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      magnifyLayer.style.clipPath = `circle(${radius}px at ${x}px ${y}px)`;
      lensRing.style.left = `${x}px`;
      lensRing.style.top = `${y}px`;
    };
    magnifyHeading.addEventListener('mouseenter', event => {
      magnifyHeading.classList.add('lens-active');
      lensRing.classList.add('active');
      moveLens(event);
    });
    magnifyHeading.addEventListener('mousemove', moveLens);
    magnifyHeading.addEventListener('mouseleave', () => {
      magnifyHeading.classList.remove('lens-active');
      lensRing.classList.remove('active');
      magnifyLayer.style.clipPath = 'circle(0px at 50% 50%)';
    });
  }

  /* ---------- rectangular magnifying-glass reveal on the vision label ---------- */
  const magnifyRectHost = document.querySelector('[data-magnify-rect]');
  if (magnifyRectHost && window.matchMedia('(hover: hover) and (pointer: fine)').matches && !prefersReducedMotion) {
    const panel = magnifyRectHost.querySelector('.magnify-rect-panel');
    const lens = magnifyRectHost.querySelector('.lens-rect');
    const updateLens = event => {
      const panelRect = panel.getBoundingClientRect();
      const hostRect = magnifyRectHost.getBoundingClientRect();
      const panelWidth = panel.offsetWidth;
      const panelHeight = panel.offsetHeight;
      const lensWidth = panelWidth * 0.82;
      const lensHeight = panelHeight * 0.8;
      let left = (event.clientX - panelRect.left) - lensWidth / 2;
      let top = (event.clientY - panelRect.top) - lensHeight / 2;
      left = Math.min(Math.max(left, 0), panelWidth - lensWidth);
      top = Math.min(Math.max(top, 0), panelHeight - lensHeight);
      const right = panelWidth - left - lensWidth;
      const bottom = panelHeight - top - lensHeight;
      panel.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px round 14px)`;
      lens.style.width = `${lensWidth}px`;
      lens.style.height = `${lensHeight}px`;
      lens.style.left = `${(panelRect.left - hostRect.left) + left}px`;
      lens.style.top = `${(panelRect.top - hostRect.top) + top}px`;
    };
    magnifyRectHost.addEventListener('mouseenter', event => {
      magnifyRectHost.classList.add('magnify-active');
      updateLens(event);
    });
    magnifyRectHost.addEventListener('mousemove', updateLens);
    magnifyRectHost.addEventListener('mouseleave', () => {
      magnifyRectHost.classList.remove('magnify-active');
    });
  }

  /* ---------- song card tilt ---------- */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !prefersReducedMotion) {
    document.querySelectorAll('.song-card.tilt').forEach(card => {
      card.addEventListener('mousemove', event => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = `perspective(900px) rotateX(${y * -6}deg) rotateY(${x * 8}deg) translateY(-4px)`;
      });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
  }

  /* ---------- song carousel ---------- */
  const carousel = document.querySelector('.song-carousel');
  if (carousel) {
    const track = carousel.querySelector('.song-track');
    const prev = carousel.querySelector('.carousel-prev');
    const next = carousel.querySelector('.carousel-next');
    const move = direction => track.scrollBy({ left: direction * (track.clientWidth * 0.9), behavior: 'smooth' });
    prev.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
  }

  /* ---------- resources accordion ---------- */
  document.querySelectorAll('.resource-song-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const options = toggle.nextElementSibling;
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      document.querySelectorAll('.resource-song-toggle').forEach(other => {
        if (other === toggle) return;
        other.setAttribute('aria-expanded', 'false');
        other.nextElementSibling.classList.remove('open');
        setTimeout(() => { other.nextElementSibling.hidden = true; }, 300);
      });
      if (isOpen) {
        toggle.setAttribute('aria-expanded', 'false');
        options.classList.remove('open');
        setTimeout(() => { options.hidden = true; }, 300);
      } else {
        options.hidden = false;
        requestAnimationFrame(() => options.classList.add('open'));
        toggle.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ---------- toast ---------- */
  const toast = document.querySelector('.toast');
  let toastTimer;
  const showToast = message => {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  };

  /* ---------- modals ---------- */
  const setupModal = (modal, triggers, closeSelector) => {
    const open = () => {
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    };
    const close = () => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    };
    triggers.forEach(trigger => trigger.addEventListener('click', open));
    modal.querySelectorAll(closeSelector).forEach(button => button.addEventListener('click', close));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modal.classList.contains('open')) close();
    });
    return close;
  };

  setupModal(
    document.querySelector('.contact-modal'),
    document.querySelectorAll('.contact-trigger'),
    '[data-close-contact]'
  );
  const closeCommunity = setupModal(
    document.querySelector('.community-modal'),
    document.querySelectorAll('.community-trigger'),
    '[data-close-community]'
  );

  /* ---------- demo forms (no real network submission) ---------- */
  document.querySelectorAll('[data-demo-form]').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();
      const submitButton = form.querySelector('button[type="submit"]');
      const status = form.querySelector('.contact-status, .community-status');
      submitButton.disabled = true;
      if (status) status.textContent = 'Se trimite…';
      setTimeout(() => {
        form.reset();
        submitButton.disabled = false;
        if (status) status.textContent = 'Mulțumim! Mesajul tău a fost trimis (demo).';
        showToast('Mesaj trimis — mulțumim!');
      }, 700);
    });
  });

  /* ---------- smooth-scroll anchors ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      const id = link.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    });
  });
})();
