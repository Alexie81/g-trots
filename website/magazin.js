const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".main-nav");

function closeMenu() {
  if (!menuButton || !navigation) return;
  navigation.classList.remove("open");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Deschide meniul");
  document.body.classList.remove("menu-open");
}

if (menuButton && navigation) {
  menuButton.addEventListener("click", () => {
    const isOpen = navigation.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
    menuButton.setAttribute("aria-label", isOpen ? "Închide meniul" : "Deschide meniul");
    document.body.classList.toggle("menu-open", isOpen);
  });

  navigation.addEventListener("click", event => {
    if (event.target.closest("a")) closeMenu();
  });

  document.addEventListener("click", event => {
    if (!navigation.classList.contains("open")) return;
    if (navigation.contains(event.target) || menuButton.contains(event.target)) return;
    closeMenu();
  });
}

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealElements = document.querySelectorAll(".reveal");

if (prefersReducedMotion || !("IntersectionObserver" in window)) {
  revealElements.forEach(element => element.classList.add("visible"));
} else {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("visible");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.08 });

  revealElements.forEach(element => revealObserver.observe(element));
}

const shopTitleTypewriter = document.querySelector(".shop-title-typewriter");
const shopTitleTypewriterText = document.querySelector(".shop-title-typewriter-text");

if (shopTitleTypewriter && shopTitleTypewriterText) {
  const phrase = shopTitleTypewriterText.dataset.text || shopTitleTypewriterText.textContent;

  if (prefersReducedMotion) {
    shopTitleTypewriterText.textContent = phrase;
  } else {
    const characters = Array.from(phrase);
    let characterIndex = 0;
    let isDeleting = false;
    shopTitleTypewriterText.textContent = "";
    shopTitleTypewriter.classList.add("is-typing");

    const runShopTitleTypewriter = () => {
      shopTitleTypewriterText.textContent = characters.slice(0, characterIndex).join("");

      if (!isDeleting && characterIndex === characters.length) {
        isDeleting = true;
        shopTitleTypewriter.classList.remove("is-typing");
        shopTitleTypewriter.classList.add("is-complete");
        window.setTimeout(() => {
          shopTitleTypewriter.classList.remove("is-complete");
          shopTitleTypewriter.classList.add("is-typing");
          runShopTitleTypewriter();
        }, 2300);
        return;
      }

      if (isDeleting && characterIndex === 0) {
        isDeleting = false;
        window.setTimeout(runShopTitleTypewriter, 480);
        return;
      }

      characterIndex += isDeleting ? -1 : 1;
      window.setTimeout(runShopTitleTypewriter, isDeleting ? 54 : 92);
    };

    window.setTimeout(runShopTitleTypewriter, 520);
  }
}

const catalogTypewriter = document.querySelector(".catalog-typewriter");
const catalogTypewriterText = document.querySelector(".catalog-typewriter-text");

if (catalogTypewriter && catalogTypewriterText) {
  const phrases = (catalogTypewriterText.dataset.phrases || catalogTypewriterText.textContent)
    .split("|")
    .map(phrase => phrase.trim())
    .filter(Boolean);

  if (prefersReducedMotion || phrases.length === 0) {
    catalogTypewriterText.textContent = phrases[0] || catalogTypewriterText.textContent;
  } else {
    let phraseIndex = 0;
    let characterIndex = 0;
    let isDeleting = false;
    let hasStarted = false;

    const runCatalogTypewriter = () => {
      const phrase = Array.from(phrases[phraseIndex]);
      catalogTypewriterText.textContent = phrase.slice(0, characterIndex).join("");

      if (!isDeleting && characterIndex === phrase.length) {
        isDeleting = true;
        window.setTimeout(runCatalogTypewriter, 1900);
        return;
      }

      if (isDeleting && characterIndex === 0) {
        isDeleting = false;
        phraseIndex = (phraseIndex + 1) % phrases.length;
        window.setTimeout(runCatalogTypewriter, 360);
        return;
      }

      characterIndex += isDeleting ? -1 : 1;
      window.setTimeout(runCatalogTypewriter, isDeleting ? 38 : 72);
    };

    const startCatalogTypewriter = () => {
      if (hasStarted) return;
      hasStarted = true;
      catalogTypewriterText.textContent = "";
      window.setTimeout(runCatalogTypewriter, 320);
    };

    if ("IntersectionObserver" in window) {
      const catalogTypeObserver = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        startCatalogTypewriter();
        catalogTypeObserver.disconnect();
      }, { threshold: 0.22 });
      catalogTypeObserver.observe(catalogTypewriter);
    } else {
      startCatalogTypewriter();
    }
  }
}

const scooterStage = document.querySelector("[data-scooter-stage]");

if (scooterStage && !prefersReducedMotion) {
  const resetScooterStage = () => {
    scooterStage.classList.remove("is-3d-active");
    scooterStage.style.setProperty("--shop-rx", "0deg");
    scooterStage.style.setProperty("--shop-ry", "0deg");
    scooterStage.style.setProperty("--shop-tx", "0px");
    scooterStage.style.setProperty("--shop-ty", "0px");
    scooterStage.style.setProperty("--shop-mx", "50%");
    scooterStage.style.setProperty("--shop-my", "46%");
  };

  const moveScooterStage = event => {
    if (event.pointerType !== "mouse") return;

    const bounds = scooterStage.getBoundingClientRect();
    const normalizedX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    const normalizedY = ((event.clientY - bounds.top) / bounds.height) * 2 - 1;
    const isInsideCircle = Math.hypot(normalizedX, normalizedY) <= 1;

    if (!isInsideCircle) {
      resetScooterStage();
      return;
    }

    scooterStage.classList.add("is-3d-active");
    scooterStage.style.setProperty("--shop-rx", `${(-normalizedY * 8).toFixed(2)}deg`);
    scooterStage.style.setProperty("--shop-ry", `${(normalizedX * 11).toFixed(2)}deg`);
    scooterStage.style.setProperty("--shop-tx", `${(normalizedX * 7).toFixed(2)}px`);
    scooterStage.style.setProperty("--shop-ty", `${(normalizedY * 4).toFixed(2)}px`);
    scooterStage.style.setProperty("--shop-mx", `${((normalizedX + 1) * 50).toFixed(1)}%`);
    scooterStage.style.setProperty("--shop-my", `${((normalizedY + 1) * 50).toFixed(1)}%`);
  };

  scooterStage.addEventListener("pointerenter", moveScooterStage);
  scooterStage.addEventListener("pointermove", moveScooterStage);
  scooterStage.addEventListener("pointerleave", resetScooterStage);
}

const productGrid = document.querySelector("#product-grid");
const productCards = [...document.querySelectorAll(".product-card")];
const searchInput = document.querySelector("#product-search");
const searchClear = document.querySelector(".shop-search-clear");
const categoryButtons = [...document.querySelectorAll(".category-filter")];
const brandInputs = [...document.querySelectorAll(".brand-filter input")];
const priceRange = document.querySelector("#price-range");
const priceOutput = document.querySelector("#price-output");
const resultsCount = document.querySelector("#results-count");
const searchCount = document.querySelector("#search-hint strong");
const sortSelect = document.querySelector("#sort-products");
const sortControl = document.querySelector(".sort-select-wrap");
const sortTrigger = document.querySelector(".sort-select-trigger");
const sortValue = document.querySelector(".sort-select-value");
const sortMenu = document.querySelector(".sort-select-menu");
const sortOptions = [...document.querySelectorAll(".sort-select-menu [data-value]")];
const noResults = document.querySelector("#no-results");
const clearButtons = [...document.querySelectorAll(".clear-filters")];
const viewButtons = [...document.querySelectorAll(".view-switch button")];
const mobileFilterButton = document.querySelector(".mobile-filter-button");
const mobileFilterCount = document.querySelector(".mobile-filter-button b");
const filtersPanel = document.querySelector("#shop-filters");
const filtersStickyColumn = document.querySelector(".filters-sticky-column");
const filtersOverlay = document.querySelector(".filters-overlay");
const filtersClose = document.querySelector(".filters-close");
const applyMobileFilters = document.querySelector(".apply-mobile-filters");
const productPagination = document.querySelector("#product-pagination");
const productsPerPage = document.querySelector("#products-per-page");
const pageSizeControl = document.querySelector(".pagination-select-wrap");
const pageSizeTrigger = document.querySelector(".pagination-select-trigger");
const pageSizeValue = document.querySelector(".pagination-select-value");
const pageSizeMenu = document.querySelector(".pagination-select-menu");
const pageSizeOptions = [...document.querySelectorAll(".pagination-select-menu [data-value]")];
const paginationRange = document.querySelector("#pagination-range");
const paginationPages = document.querySelector("#pagination-pages");

function setSortMenuOpen(isOpen, focusSelected = false) {
  if (!sortTrigger || !sortMenu) return;
  sortTrigger.setAttribute("aria-expanded", String(isOpen));
  sortMenu.hidden = !isOpen;
  if (isOpen && focusSelected) {
    (sortOptions.find(option => option.getAttribute("aria-selected") === "true") || sortOptions[0])?.focus();
  }
}

function syncSortControl() {
  if (!sortSelect) return;
  const value = sortSelect.value;
  const selectedOption = sortOptions.find(option => option.dataset.value === value);
  if (sortValue) sortValue.textContent = selectedOption?.textContent || "Recomandate";
  sortOptions.forEach(option => {
    option.setAttribute("aria-selected", String(option.dataset.value === value));
  });
}

function setPageSizeMenuOpen(isOpen, focusSelected = false) {
  if (!pageSizeTrigger || !pageSizeMenu) return;
  pageSizeTrigger.setAttribute("aria-expanded", String(isOpen));
  pageSizeMenu.hidden = !isOpen;
  if (isOpen && focusSelected) {
    (pageSizeOptions.find(option => option.getAttribute("aria-selected") === "true") || pageSizeOptions[0])?.focus();
  }
}

function syncPageSizeControl() {
  if (!productsPerPage) return;
  const value = productsPerPage.value;
  if (pageSizeValue) pageSizeValue.textContent = value;
  pageSizeOptions.forEach(option => {
    option.setAttribute("aria-selected", String(option.dataset.value === value));
  });
}

function updateFiltersStickyPosition() {
  if (!filtersPanel || !filtersStickyColumn) return;

  if (window.innerWidth <= 1000) {
    filtersStickyColumn.style.removeProperty("--filters-sticky-top");
    return;
  }

  const headerHeight = document.querySelector(".site-header")?.getBoundingClientRect().height || 72;
  const safeTop = headerHeight + 12;
  const centeredTop = (window.innerHeight - filtersPanel.getBoundingClientRect().height) / 2;
  filtersStickyColumn.style.setProperty("--filters-sticky-top", `${Math.max(safeTop, centeredTop)}px`);
}

if (filtersPanel && filtersStickyColumn) {
  window.addEventListener("resize", updateFiltersStickyPosition);
  window.addEventListener("load", updateFiltersStickyPosition, { once: true });
  new ResizeObserver(updateFiltersStickyPosition).observe(filtersPanel);
  document.fonts?.ready.then(updateFiltersStickyPosition);
  window.requestAnimationFrame(updateFiltersStickyPosition);
}

let activeCategory = "all";
let currentPage = 1;

function normalizeText(value) {
  return value
    .toLocaleLowerCase("ro-RO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function formatPrice(value) {
  return new Intl.NumberFormat("ro-RO").format(Number(value));
}

function updateRangeAppearance() {
  if (!priceRange || !priceOutput) return;
  const min = Number(priceRange.min);
  const max = Number(priceRange.max);
  const value = Number(priceRange.value);
  const progress = ((value - min) / (max - min)) * 100;
  priceRange.style.setProperty("--range-progress", `${progress}%`);
  priceOutput.textContent = `${formatPrice(value)} lei`;
}

function getSelectedBrands() {
  return brandInputs.filter(input => input.checked).map(input => input.value);
}

function updateMobileFilterCount() {
  if (!mobileFilterCount) return;
  const brandCount = getSelectedBrands().length;
  const categoryCount = activeCategory === "all" ? 0 : 1;
  const priceCount = priceRange && priceRange.value !== priceRange.max ? 1 : 0;
  mobileFilterCount.textContent = String(brandCount + categoryCount + priceCount);
}

function sortCards(cards) {
  const mode = sortSelect?.value || "featured";
  return [...cards].sort((first, second) => {
    if (mode === "price-asc") return Number(first.dataset.price) - Number(second.dataset.price);
    if (mode === "price-desc") return Number(second.dataset.price) - Number(first.dataset.price);
    if (mode === "name") return first.dataset.name.localeCompare(second.dataset.name, "ro");
    return Number(first.dataset.index) - Number(second.dataset.index);
  });
}

function paginationSequence(totalPages) {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const importantPages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const pages = [...importantPages].filter(page => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const sequence = [];
  pages.forEach((page, index) => {
    if (index > 0 && page - pages[index - 1] > 1) sequence.push("ellipsis");
    sequence.push(page);
  });
  return sequence;
}

function renderPagination(totalProducts) {
  if (!productPagination || !paginationPages || !paginationRange) return;
  const pageSize = Number(productsPerPage?.value || 10);
  const totalPages = Math.max(1, Math.ceil(totalProducts / pageSize));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);
  const firstProduct = totalProducts === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastProduct = Math.min(currentPage * pageSize, totalProducts);

  productPagination.hidden = totalProducts === 0;
  paginationRange.textContent = `${firstProduct}–${lastProduct} din ${totalProducts}`;

  const pageButtons = paginationSequence(totalPages).map(page => {
    if (page === "ellipsis") return '<span class="pagination-ellipsis" aria-hidden="true">…</span>';
    const isCurrent = page === currentPage;
    return `<button class="pagination-button" type="button" data-page="${page}" aria-label="Pagina ${page}"${isCurrent ? ' aria-current="page"' : ""}>${page}</button>`;
  }).join("");

  paginationPages.innerHTML = `
    <button class="pagination-button pagination-nav" type="button" data-page="previous" aria-label="Pagina anterioară"${currentPage === 1 ? " disabled" : ""}>‹</button>
    ${pageButtons}
    <button class="pagination-button pagination-nav" type="button" data-page="next" aria-label="Pagina următoare"${currentPage === totalPages ? " disabled" : ""}>›</button>`;
}

function applyFilters({ resetPage = true } = {}) {
  if (resetPage) currentPage = 1;
  const query = normalizeText(searchInput?.value || "");
  const selectedBrands = getSelectedBrands();
  const maxPrice = Number(priceRange?.value || Infinity);
  const visibleCards = [];
  const hiddenCards = [];

  productCards.forEach(card => {
    const searchableText = normalizeText(`${card.dataset.name} ${card.dataset.search}`);
    const cardBrands = (card.dataset.brand || "").split(" ");
    const matchesSearch = !query || searchableText.includes(query);
    const matchesCategory = activeCategory === "all" || card.dataset.category === activeCategory;
    const matchesBrand = selectedBrands.length === 0 || selectedBrands.some(brand => cardBrands.includes(brand));
    const matchesPrice = Number(card.dataset.price) <= maxPrice;
    const isVisible = matchesSearch && matchesCategory && matchesBrand && matchesPrice;

    (isVisible ? visibleCards : hiddenCards).push(card);
  });

  const sortedVisibleCards = sortCards(visibleCards);
  const pageSize = Number(productsPerPage?.value || 10);
  const totalPages = Math.max(1, Math.ceil(sortedVisibleCards.length / pageSize));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageEnd = pageStart + pageSize;

  productCards.forEach(card => { card.hidden = true; });
  sortedVisibleCards.forEach((card, index) => {
    card.hidden = index < pageStart || index >= pageEnd;
  });

  if (productGrid) {
    [...sortedVisibleCards, ...hiddenCards].forEach(card => productGrid.append(card));
  }

  const count = visibleCards.length;
  const countLabel = `${count} ${count === 1 ? "produs" : "produse"}`;
  if (resultsCount) resultsCount.textContent = countLabel;
  if (searchCount) searchCount.textContent = countLabel;
  if (noResults) noResults.hidden = count !== 0;
  renderPagination(count);
  updateMobileFilterCount();
}

function resetFilters() {
  activeCategory = "all";
  if (searchInput) searchInput.value = "";
  if (searchClear) searchClear.hidden = true;
  if (priceRange) priceRange.value = priceRange.max;
  brandInputs.forEach(input => { input.checked = false; });
  categoryButtons.forEach(button => button.classList.toggle("active", button.dataset.category === "all"));
  updateRangeAppearance();
  applyFilters();
}

productCards.forEach((card, index) => {
  card.dataset.index = String(index);
});

categoryButtons.forEach(button => {
  button.addEventListener("click", () => {
    activeCategory = button.dataset.category;
    categoryButtons.forEach(item => item.classList.toggle("active", item === button));
    applyFilters();
  });
});

brandInputs.forEach(input => input.addEventListener("change", applyFilters));

if (searchInput) {
  searchInput.addEventListener("input", () => {
    if (searchClear) searchClear.hidden = searchInput.value.length === 0;
    applyFilters();
  });
}

searchClear?.addEventListener("click", event => {
  event.preventDefault();
  event.stopPropagation();
  if (!searchInput) return;
  searchInput.value = "";
  searchClear.hidden = true;
  applyFilters();
  searchInput.focus();
});

if (priceRange) {
  priceRange.addEventListener("input", () => {
    updateRangeAppearance();
    applyFilters();
  });
}

if (sortSelect) {
  sortSelect.addEventListener("change", () => {
    syncSortControl();
    applyFilters();
  });
}

sortTrigger?.addEventListener("click", () => {
  setSortMenuOpen(sortMenu?.hidden !== false);
  setPageSizeMenuOpen(false);
});

sortTrigger?.addEventListener("keydown", event => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  setSortMenuOpen(true, true);
  setPageSizeMenuOpen(false);
});

sortOptions.forEach(option => {
  option.addEventListener("click", () => {
    if (!sortSelect) return;
    sortSelect.value = option.dataset.value;
    sortSelect.dispatchEvent(new Event("change", { bubbles: true }));
    setSortMenuOpen(false);
    sortTrigger?.focus();
  });
});

sortMenu?.addEventListener("keydown", event => {
  const currentIndex = sortOptions.indexOf(document.activeElement);
  if (event.key === "Escape") {
    event.preventDefault();
    setSortMenuOpen(false);
    sortTrigger?.focus();
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  let nextIndex = currentIndex;
  if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = sortOptions.length - 1;
  else if (event.key === "ArrowDown") nextIndex = (currentIndex + 1 + sortOptions.length) % sortOptions.length;
  else nextIndex = (currentIndex - 1 + sortOptions.length) % sortOptions.length;
  sortOptions[nextIndex]?.focus();
});

document.addEventListener("click", event => {
  if (!sortControl?.contains(event.target)) setSortMenuOpen(false);
});
clearButtons.forEach(button => button.addEventListener("click", resetFilters));

productsPerPage?.addEventListener("change", () => {
  syncPageSizeControl();
  applyFilters();
});

pageSizeTrigger?.addEventListener("click", () => {
  setPageSizeMenuOpen(pageSizeMenu?.hidden !== false);
  setSortMenuOpen(false);
});

pageSizeTrigger?.addEventListener("keydown", event => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  setPageSizeMenuOpen(true, true);
});

pageSizeOptions.forEach(option => {
  option.addEventListener("click", () => {
    if (!productsPerPage) return;
    productsPerPage.value = option.dataset.value;
    productsPerPage.dispatchEvent(new Event("change", { bubbles: true }));
    setPageSizeMenuOpen(false);
    pageSizeTrigger?.focus();
  });
});

pageSizeMenu?.addEventListener("keydown", event => {
  const currentIndex = pageSizeOptions.indexOf(document.activeElement);
  if (event.key === "Escape") {
    event.preventDefault();
    setPageSizeMenuOpen(false);
    pageSizeTrigger?.focus();
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  let nextIndex = currentIndex;
  if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = pageSizeOptions.length - 1;
  else if (event.key === "ArrowDown") nextIndex = (currentIndex + 1 + pageSizeOptions.length) % pageSizeOptions.length;
  else nextIndex = (currentIndex - 1 + pageSizeOptions.length) % pageSizeOptions.length;
  pageSizeOptions[nextIndex]?.focus();
});

document.addEventListener("click", event => {
  if (!pageSizeControl?.contains(event.target)) setPageSizeMenuOpen(false);
});

paginationPages?.addEventListener("click", event => {
  const button = event.target.closest("[data-page]");
  if (!button || button.disabled) return;
  const requestedPage = button.dataset.page;
  if (requestedPage === "previous") currentPage -= 1;
  else if (requestedPage === "next") currentPage += 1;
  else currentPage = Number(requestedPage);
  applyFilters({ resetPage: false });
  document.querySelector(".catalog-toolbar")?.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "start"
  });
});

viewButtons.forEach(button => {
  button.addEventListener("click", () => {
    const isList = button.dataset.view === "list";
    productGrid?.classList.toggle("list-view", isList);
    viewButtons.forEach(item => {
      const isActive = item === button;
      item.classList.toggle("active", isActive);
      item.setAttribute("aria-pressed", String(isActive));
    });
  });
});

function openFilters() {
  if (!filtersPanel || !filtersOverlay || !mobileFilterButton) return;
  closeMenu();
  filtersPanel.classList.add("is-open");
  filtersOverlay.classList.add("is-open");
  mobileFilterButton.setAttribute("aria-expanded", "true");
  document.body.classList.add("filters-open");
  filtersClose?.focus();
}

function closeFilters() {
  if (!filtersPanel || !filtersOverlay || !mobileFilterButton) return;
  filtersPanel.classList.remove("is-open");
  filtersOverlay.classList.remove("is-open");
  mobileFilterButton.setAttribute("aria-expanded", "false");
  document.body.classList.remove("filters-open");
}

mobileFilterButton?.addEventListener("click", openFilters);
filtersClose?.addEventListener("click", closeFilters);
filtersOverlay?.addEventListener("click", closeFilters);
applyMobileFilters?.addEventListener("click", closeFilters);

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeMenu();
    closeFilters();
    setPageSizeMenuOpen(false);
    setSortMenuOpen(false);
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput?.focus();
  }
});

document.querySelectorAll("[data-direct-call]").forEach(link => {
  link.addEventListener("click", event => {
    if (event.defaultPrevented || event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const phoneTarget = link.getAttribute("href");
    if (!phoneTarget?.startsWith("tel:")) return;
    event.preventDefault();
    window.location.assign(phoneTarget);
  });
});

updateRangeAppearance();
syncSortControl();
syncPageSizeControl();
applyFilters();
