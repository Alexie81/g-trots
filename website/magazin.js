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
let productCards = [...document.querySelectorAll(".product-card")];
const searchInput = document.querySelector("#product-search");
const searchClear = document.querySelector(".shop-search-clear");
const categoryTree = document.querySelector(".category-tree");
const compatibilityOptions = document.querySelector(".compatibility-filter .filter-options-scroll");
const manufacturerOptions = document.querySelector(".manufacturer-filter .filter-options-scroll");
let categoryButtons = [...document.querySelectorAll(".category-filter")];
let brandInputs = [...document.querySelectorAll(".compatibility-filter input")];
let stockInputs = [...document.querySelectorAll(".stock-filter input")];
let manufacturerInputs = [...document.querySelectorAll(".manufacturer-filter input")];
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

const legacyProductImages = {
  "anvelopa-g10-all-terrain": 1,
  "display-smart-ride-s3": 2,
  "incarcator-fastcharge-54-6v": 3,
  "motor-dualhub-x2-2000w": 4,
  "baterie-powercore-52v-23ah": 5,
  "kit-frana-hydrostop-pro": 6
};

function escapeCatalogHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function productStockLabel(product) {
  if (product.stock_mode === "unlimited") return "În stoc";
  const quantity = Number(product.stock_quantity || 0);
  if (quantity <= 0) return "Stoc epuizat";
  if (quantity <= Number(product.low_stock_threshold || 3)) return "Stoc limitat";
  return "În stoc";
}

function liveProductCard(product, index) {
  const slug = String(product.slug || product.id || "");
  const legacyImage = Number(product.images?.[0]?.sprite_index || legacyProductImages[slug] || 0);
  const imageUrl = product.images?.[0]?.sprite_index ? "" : safePublicImageUrl(product.images?.[0]?.url);
  const imageClasses = `product-image${legacyImage ? ` product-image-${legacyImage}` : ""}${imageUrl ? " product-image-live" : ""}`;
  const imageStyle = imageUrl ? ` style="background-image:url('${escapeCatalogHtml(imageUrl)}')"` : "";
  const categorySlug = String(product.category_slug || "produse");
  const categoryName = String(product.category_name || "Produs");
  const manufacturerSlug = String(product.manufacturer_slug || "");
  const brands = Array.isArray(product.brands) ? product.brands : [];
  const brandSlugs = brands.map(brand => String(brand.slug || "")).filter(Boolean);
  const brandNames = brands.map(brand => String(brand.name || "")).filter(Boolean);
  const manufacturerName = String(product.manufacturer_name || "").trim();
  const cardLabel = brandNames[0] || manufacturerName || categoryName;
  const currentPrice = product.sale_price == null ? Number(product.price || 0) : Number(product.sale_price || 0);
  const standardPrice = Number(product.price || 0);
  const stockLabel = productStockLabel(product);
  const stockKey = product.stock_mode === "unlimited" || Number(product.stock_quantity || 0) > 0 ? "in-stock" : "out-of-stock";
  const stockClass = stockKey === "out-of-stock" ? " is-out" : stockLabel === "Stoc limitat" ? " is-low" : "";
  const shortDescription = String(product.short_description || "Produs disponibil în magazinul G-Trots.");
  const route = `/magazin/produs/${encodeURIComponent(slug)}/`;
  const brandBadges = brandNames
    .slice(0, 4)
    .map(name => `<span>${escapeCatalogHtml(name)}</span>`)
    .join("");
  const brandSection = brandBadges
    ? `<div class="product-fit" aria-label="Mărci compatibile">${brandBadges}</div>`
    : "";
  const oldPrice = product.sale_price == null
    ? ""
    : `<del>${new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(standardPrice)} lei</del>`;
  const discountPercent = product.sale_price == null || standardPrice <= 0
    ? 0
    : Math.max(0, Math.round((1 - currentPrice / standardPrice) * 100));
  const discountBadge = discountPercent > 0 ? `<em class="product-discount">-${discountPercent}%</em>` : "";

  const article = document.createElement("article");
  article.className = "product-card reveal visible live-product-card";
  article.dataset.productId = slug;
  article.dataset.apiProductId = String(product.id || "");
  article.dataset.category = categorySlug;
  article.dataset.taxonomy = `produse ${categorySlug}`;
  article.dataset.brand = brandSlugs.join(" ");
  article.dataset.stock = stockKey;
  article.dataset.manufacturer = manufacturerSlug;
  article.dataset.price = String(currentPrice);
  article.dataset.name = String(product.name || "Produs G-Trots");
  article.dataset.search = `${product.name || ""} ${shortDescription} ${brandNames.join(" ")} ${product.sku || ""}`;
  article.dataset.index = String(index);
  article.innerHTML = `
    <div class="product-stage">
      <div class="product-card-actions">
        <button class="cart-button" type="button" data-add-cart aria-label="Adaugă ${escapeCatalogHtml(product.name)} în coș"><span class="global-cart-icon" aria-hidden="true"><i></i><i></i></span><b aria-hidden="true">+</b></button>
        <button class="favorite-button" type="button" aria-label="Adaugă ${escapeCatalogHtml(product.name)} la favorite" aria-pressed="false">♡</button>
      </div>
      <div class="${imageClasses}"${imageStyle} role="img" aria-label="${escapeCatalogHtml(product.name)}"></div>
      <span class="product-quick-note${stockClass}"><i></i>${stockLabel}</span>
    </div>
    <div class="product-info">
      <span class="product-category"><i></i>${escapeCatalogHtml(cardLabel)}</span>
      <h3>${escapeCatalogHtml(product.name)}</h3>
      <p>${escapeCatalogHtml(shortDescription)}</p>
      ${brandSection}
    </div>
    <div class="product-bottom">
      <div class="product-price"><small>${product.sale_price == null ? "Preț" : "Preț promoțional"}</small><strong>${new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(currentPrice)} <span>lei</span></strong>${oldPrice}</div>
      <div class="product-bottom-action">${discountBadge}<span class="product-open-hint" aria-hidden="true">›</span></div>
    </div>
    <a class="product-card-link" href="${route}" aria-label="Deschide pagina produsului ${escapeCatalogHtml(product.name)}"></a>`;
  return article;
}

function renderLiveProducts(products) {
  if (!productGrid || !Array.isArray(products) || products.length === 0) return false;
  const cards = products.map(liveProductCard);
  productGrid.replaceChildren(...cards);
  productCards = cards;
  const oldMaximum = Number(priceRange?.max || 0);
  const maximumPrice = Math.max(...products.map(product => Number(product.sale_price ?? product.price ?? 0)), oldMaximum, 1);
  if (priceRange && maximumPrice > oldMaximum) {
    const wasAtMaximum = Number(priceRange.value) >= oldMaximum;
    priceRange.max = String(Math.ceil(maximumPrice / 100) * 100);
    if (wasAtMaximum) priceRange.value = priceRange.max;
    updateRangeAppearance();
  }
  currentPage = 1;
  applyFilters();
  productGrid.dataset.catalogSource = "shop-api";
  return true;
}

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

function directTreeChild(node, selector) {
  return [...node.children].find(child => child.matches(selector)) || null;
}

function updateTreeToggleLabel(node, expanded) {
  const toggle = directTreeChild(node, ".category-tree-toggle");
  const filter = directTreeChild(node, ".category-filter");
  if (!toggle || !filter) return;
  const label = filter.querySelector("span")?.textContent?.trim() || "categoria";
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.setAttribute("aria-label", `${expanded ? "Restrânge" : "Extinde"} subcategoriile pentru ${label}`);
}

function setTreeNodeExpanded(node, expanded, animate = true) {
  const children = directTreeChild(node, ".category-tree-children");
  if (!children) return;
  window.clearTimeout(children._treeAnimationTimer);
  updateTreeToggleLabel(node, expanded);

  if (!animate || prefersReducedMotion) {
    node.classList.toggle("is-collapsed", !expanded);
    children.style.height = expanded ? "auto" : "0px";
    return;
  }

  if (expanded) {
    children.style.height = "0px";
    node.classList.remove("is-collapsed");
    children.getBoundingClientRect();
    children.style.height = `${children.scrollHeight}px`;
    children._treeAnimationTimer = window.setTimeout(() => {
      if (!node.classList.contains("is-collapsed")) children.style.height = "auto";
    }, 380);
    return;
  }

  children.style.height = `${children.getBoundingClientRect().height}px`;
  children.getBoundingClientRect();
  node.classList.add("is-collapsed");
  window.requestAnimationFrame(() => { children.style.height = "0px"; });
}

function initializeCategoryTree(root = document) {
  const nodes = [...root.querySelectorAll(".category-tree-node")];
  nodes.forEach((node, index) => {
    const children = directTreeChild(node, ".category-tree-children");
    const filter = directTreeChild(node, ".category-filter");
    if (!children || !filter) return;
    if (directTreeChild(node, ".category-tree-toggle")) return;

    node.classList.add("has-children");
    children.id ||= `category-children-${index + 1}`;
    const toggle = document.createElement("button");
    toggle.className = "category-tree-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-controls", children.id);
    toggle.innerHTML = '<span aria-hidden="true"></span>';
    node.insertBefore(toggle, children);

    const expanded = node.hasAttribute("data-tree-open");
    setTreeNodeExpanded(node, expanded, false);
    toggle.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      setTreeNodeExpanded(node, toggle.getAttribute("aria-expanded") !== "true");
    });
  });
}

const SHOP_PUBLIC_FILTERS_URL = "https://g-trots.ro/shop-api/api-v2.php?action=publicCatalogFilters";

function safePublicImageUrl(value) {
  try {
    const url = new URL(String(value || ""), window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function createCategoryVisual(category, depth) {
  const thumbnailUrl = safePublicImageUrl(category.thumbnail_url);
  if (thumbnailUrl) {
    const thumbnail = document.createElement("i");
    thumbnail.className = "category-thumb category-thumb-api";
    thumbnail.setAttribute("aria-hidden", "true");
    thumbnail.style.backgroundImage = `url(${JSON.stringify(thumbnailUrl)})`;
    return thumbnail;
  }

  if (depth !== 1) return null;
  const marker = document.createElement("i");
  marker.className = "category-tree-marker";
  marker.setAttribute("aria-hidden", "true");
  return marker;
}

function createCategoryNode(category, childMap, depth, openRoot, ancestry = new Set()) {
  if (ancestry.has(category.id)) return null;
  const nextAncestry = new Set(ancestry).add(category.id);
  const children = (childMap.get(category.id) || []).filter(child => !nextAncestry.has(child.id));
  const node = document.createElement("div");
  node.className = `category-tree-node category-tree-level-${Math.min(depth, 3)}`;
  if (depth === 1 && openRoot) node.setAttribute("data-tree-open", "");

  const button = document.createElement("button");
  button.className = "category-filter";
  if (depth === 1) button.classList.add("category-filter-parent");
  if (children.length === 0) button.classList.add("category-filter-leaf");
  button.type = "button";
  button.dataset.category = String(category.slug || category.id);

  const visual = createCategoryVisual(category, depth);
  if (visual) button.append(visual);
  const label = document.createElement("span");
  label.textContent = String(category.name || "Categorie");
  button.append(label);
  node.append(button);

  if (children.length > 0) {
    const childrenContainer = document.createElement("div");
    childrenContainer.className = "category-tree-children";
    children.forEach(child => {
      const childNode = createCategoryNode(child, childMap, depth + 1, false, nextAncestry);
      if (childNode) childrenContainer.append(childNode);
    });
    if (childrenContainer.childElementCount > 0) node.append(childrenContainer);
  }

  return node;
}

function renderCategoryFilters(categories) {
  if (!categoryTree) return;
  const activeCategories = categories.filter(category => category && category.is_active !== false && category.id);
  const includedIds = new Set(activeCategories.map(category => String(category.id)));
  const childMap = new Map();
  activeCategories.forEach(category => {
    const parentId = category.parent_id && includedIds.has(String(category.parent_id))
      ? String(category.parent_id)
      : "root";
    if (!childMap.has(parentId)) childMap.set(parentId, []);
    childMap.get(parentId).push(category);
  });

  const fragment = document.createDocumentFragment();
  const allButton = document.createElement("button");
  allButton.className = "category-filter active";
  allButton.type = "button";
  allButton.dataset.category = "all";
  const allLabel = document.createElement("span");
  allLabel.textContent = "Toate produsele";
  allButton.append(allLabel);
  fragment.append(allButton);

  (childMap.get("root") || []).forEach((category, index) => {
    const node = createCategoryNode(category, childMap, 1, index === 0);
    if (node) fragment.append(node);
  });

  categoryTree.replaceChildren(fragment);
  initializeCategoryTree(categoryTree);
}

function renderChoiceFilters(container, rows, emptyLabel) {
  if (!container) return;
  const fragment = document.createDocumentFragment();
  rows.filter(row => row && row.is_active !== false && row.slug).forEach(row => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = String(row.slug);
    const text = document.createElement("span");
    text.textContent = String(row.name || row.slug);
    label.append(input, text);
    fragment.append(label);
  });

  if (fragment.childNodes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "filter-empty";
    empty.textContent = emptyLabel;
    fragment.append(empty);
  }
  container.replaceChildren(fragment);
}

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

function getSelectedStocks() {
  return stockInputs.filter(input => input.checked).map(input => input.value);
}

function getSelectedManufacturers() {
  return manufacturerInputs.filter(input => input.checked).map(input => input.value);
}

function updateMobileFilterCount() {
  if (!mobileFilterCount) return;
  const brandCount = getSelectedBrands().length;
  const stockCount = getSelectedStocks().length;
  const manufacturerCount = getSelectedManufacturers().length;
  const categoryCount = activeCategory === "all" ? 0 : 1;
  const priceCount = priceRange && priceRange.value !== priceRange.max ? 1 : 0;
  mobileFilterCount.textContent = String(brandCount + stockCount + manufacturerCount + categoryCount + priceCount);
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
  const selectedStocks = getSelectedStocks();
  const selectedManufacturers = getSelectedManufacturers();
  const maxPrice = Number(priceRange?.value || Infinity);
  const visibleCards = [];
  const hiddenCards = [];

  productCards.forEach(card => {
    const searchableText = normalizeText(`${card.dataset.name} ${card.dataset.search}`);
    const cardBrands = (card.dataset.brand || "").split(" ");
    const cardTaxonomy = `${card.dataset.category || ""} ${card.dataset.taxonomy || ""}`.split(" ").filter(Boolean);
    const matchesSearch = !query || searchableText.includes(query);
    const matchesCategory = activeCategory === "all" || cardTaxonomy.includes(activeCategory);
    const matchesBrand = selectedBrands.length === 0 || selectedBrands.some(brand => cardBrands.includes(brand));
    const matchesStock = selectedStocks.length === 0 || selectedStocks.includes(card.dataset.stock);
    const matchesManufacturer = selectedManufacturers.length === 0 || selectedManufacturers.includes(card.dataset.manufacturer);
    const matchesPrice = Number(card.dataset.price) <= maxPrice;
    const isVisible = matchesSearch && matchesCategory && matchesBrand && matchesStock && matchesManufacturer && matchesPrice;

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
  stockInputs.forEach(input => { input.checked = false; });
  manufacturerInputs.forEach(input => { input.checked = false; });
  categoryButtons.forEach(button => button.classList.toggle("active", button.dataset.category === "all"));
  updateRangeAppearance();
  applyFilters();
}

function refreshFilterReferences() {
  categoryButtons = [...document.querySelectorAll(".category-filter")];
  brandInputs = [...document.querySelectorAll(".compatibility-filter input")];
  stockInputs = [...document.querySelectorAll(".stock-filter input")];
  manufacturerInputs = [...document.querySelectorAll(".manufacturer-filter input")];
}

function bindFilterControls() {
  refreshFilterReferences();
  categoryButtons.forEach(button => {
    if (button.dataset.filterBound === "true") return;
    button.dataset.filterBound = "true";
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category || "all";
      categoryButtons.forEach(item => item.classList.toggle("active", item === button));
      applyFilters();
    });
  });

  [...brandInputs, ...stockInputs, ...manufacturerInputs].forEach(input => {
    if (input.dataset.filterBound === "true") return;
    input.dataset.filterBound = "true";
    input.addEventListener("change", applyFilters);
  });
}

async function loadCatalogFilters() {
  const loadingTargets = [categoryTree, compatibilityOptions, manufacturerOptions].filter(Boolean);
  loadingTargets.forEach(element => element.setAttribute("aria-busy", "true"));
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(SHOP_PUBLIC_FILTERS_URL, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`SHOP API ${response.status}`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.categories) || !Array.isArray(payload.brands) || !Array.isArray(payload.manufacturers)) {
      throw new Error("Răspuns SHOP invalid");
    }

    renderCategoryFilters(payload.categories);
    renderChoiceFilters(compatibilityOptions, payload.brands, "Nu există mărci active.");
    renderChoiceFilters(manufacturerOptions, payload.manufacturers, "Nu există producători activi.");
    activeCategory = "all";
    bindFilterControls();
    applyFilters();
    filtersPanel?.setAttribute("data-catalog-source", "shop-api");
  } catch {
    filtersPanel?.setAttribute("data-catalog-source", "fallback");
  } finally {
    window.clearTimeout(timeout);
    loadingTargets.forEach(element => element.removeAttribute("aria-busy"));
  }
}

initializeCategoryTree();
bindFilterControls();

productCards.forEach((card, index) => {
  card.dataset.index = String(index);
});

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
if (productsPerPage) {
  productsPerPage.value = window.matchMedia("(max-width: 700px)").matches ? "10" : "15";
}
syncPageSizeControl();
applyFilters();
loadCatalogFilters();

window.GTrotsShopCatalog = {
  renderLiveProducts
};
