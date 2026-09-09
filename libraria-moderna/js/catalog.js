// Filtrare + sortare client-side pentru magazin.html

function initCatalog() {
  const grid = document.querySelector("[data-catalog-grid]");
  const catList = document.querySelector("[data-filter-categories]");
  const authorSelect = document.querySelector("[data-filter-author]");
  const minInput = document.querySelector("[data-filter-min]");
  const maxInput = document.querySelector("[data-filter-max]");
  const sortSelect = document.querySelector("[data-sort]");
  const countEl = document.querySelector("[data-results-count]");
  const resetBtn = document.querySelector("[data-filter-reset]");
  if (!grid) return;

  const params = new URLSearchParams(window.location.search);
  const preselectedCategory = params.get("categorie");
  const preselectedAuthor = params.get("autor");

  catList.innerHTML = CATEGORIES.map(
    (c) => `
      <label class="filter-check">
        <input type="checkbox" value="${c.slug}" ${c.slug === preselectedCategory ? "checked" : ""} />
        <span>${c.name}</span>
      </label>
    `
  ).join("");

  const usedAuthorIds = [...new Set(BOOKS.map((b) => b.authorId))];
  authorSelect.innerHTML =
    `<option value="">Toți autorii</option>` +
    usedAuthorIds
      .map((id) => getAuthor(id))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => `<option value="${a.id}" ${a.id === preselectedAuthor ? "selected" : ""}>${a.name}</option>`)
      .join("");

  function readState() {
    const checked = [...catList.querySelectorAll("input:checked")].map((i) => i.value);
    return {
      categories: checked,
      author: authorSelect.value,
      min: minInput.value ? Number(minInput.value) : null,
      max: maxInput.value ? Number(maxInput.value) : null,
      sort: sortSelect.value,
    };
  }

  function applyFilters() {
    const state = readState();
    let result = BOOKS.filter((b) => {
      if (state.categories.length && !state.categories.includes(b.category)) return false;
      if (state.author && b.authorId !== state.author) return false;
      if (state.min !== null && b.price < state.min) return false;
      if (state.max !== null && b.price > state.max) return false;
      return true;
    });

    switch (state.sort) {
      case "pret-asc":
        result.sort((a, b) => a.price - b.price);
        break;
      case "pret-desc":
        result.sort((a, b) => b.price - a.price);
        break;
      case "nume":
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "noutati":
      default:
        result.sort((a, b) => b.year - a.year || b.id - a.id);
        break;
    }

    renderBookGrid(grid, result);
    if (countEl) {
      countEl.textContent = `${result.length} ${result.length === 1 ? "carte găsită" : "cărți găsite"}`;
    }
    initReveal();
  }

  [catList, authorSelect, minInput, maxInput, sortSelect].forEach((el) => {
    el.addEventListener("change", applyFilters);
    el.addEventListener("input", applyFilters);
  });

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      catList.querySelectorAll("input").forEach((i) => (i.checked = false));
      authorSelect.value = "";
      minInput.value = "";
      maxInput.value = "";
      sortSelect.value = "noutati";
      applyFilters();
    });
  }

  applyFilters();
}

document.addEventListener("DOMContentLoaded", initCatalog);
