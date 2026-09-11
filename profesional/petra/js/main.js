/* Orchestrator. Celelalte module (reduced-motion, lenis-init, reveal,
   gallery, lightbox, sticky-cta) sunt IIFE-uri care se execută singure la
   încărcare — script-urile stau la finalul <body>, deci DOM-ul e deja gata.
   Doar contact-links.js expune funcții simple, apelate explicit aici. */

document.addEventListener('DOMContentLoaded', () => {
  initContactLinks();
  initAn();
  verifyConfig();
});
