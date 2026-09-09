// Inițializări comune: navigație mobilă, scroll state, reveal la scroll, randare carduri carte.

function initNav() {
  const toggle = document.querySelector("[data-nav-toggle]");
  const menu = document.querySelector("[data-nav-menu]");
  if (toggle && menu) {
    toggle.addEventListener("click", () => {
      const isOpen = menu.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  }

  const header = document.querySelector("[data-site-header]");
  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }
}

function initReveal() {
  const items = document.querySelectorAll("[data-reveal]");
  if (!items.length) return;

  if (!("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  items.forEach((el) => observer.observe(el));
}

// Coperta e generată din culoare + titlu, fără imagini externe.
const COVER_TONES = ["tone-yellow", "tone-ink", "tone-charcoal"];
function coverTone(id) {
  return COVER_TONES[id % COVER_TONES.length];
}

function bookCardHTML(book) {
  const author = getAuthor(book.authorId);
  return `
    <article class="book-card" data-reveal>
      <a class="book-cover ${coverTone(book.id)}" href="carte.html?slug=${book.slug}">
        ${book.isNew ? '<span class="book-badge">Noutate</span>' : ""}
        <span class="book-cover-category">${getCategoryName(book.category)}</span>
        <span class="book-cover-title">${book.title}</span>
        <span class="book-cover-author">${author ? author.name : ""}</span>
      </a>
      <div class="book-info">
        <h3><a href="carte.html?slug=${book.slug}">${book.title}</a></h3>
        <p class="book-author">${author ? author.name : ""}</p>
        <div class="book-row">
          <span class="book-price">${formatPrice(book.price)}</span>
          <button class="btn btn-small" data-add-to-cart="${book.slug}">Adaugă în coș</button>
        </div>
      </div>
    </article>
  `;
}

function renderBookGrid(container, books) {
  if (!container) return;
  if (!books.length) {
    container.innerHTML = `<p class="empty-state">Nicio carte nu corespunde filtrelor alese.</p>`;
    return;
  }
  container.innerHTML = books.map(bookCardHTML).join("");
}

function initAddToCartButtons(root = document) {
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add-to-cart]");
    if (!btn) return;
    addToCart(btn.getAttribute("data-add-to-cart"), 1);
    const original = btn.textContent;
    btn.textContent = "Adăugat ✓";
    btn.classList.add("is-added");
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove("is-added");
    }, 1200);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initReveal();
  initAddToCartButtons();
  const yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});
