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
const searchDeck = document.querySelector(".shop-search-deck");
const smartSearchPanel = document.querySelector("#smart-search-panel");
const smartSearchContent = document.querySelector("[data-smart-search-content]");
const smartSearchOverlay = document.querySelector("[data-smart-search-overlay]");
const smartSearchClose = document.querySelector("[data-smart-search-close]");
const smartSearchBack = document.querySelector("[data-smart-search-back]");
const smartSearchSubmit = document.querySelector("[data-smart-search-submit]");
const smartSearchMobileBack = document.querySelector("[data-smart-search-mobile-back]");
let smartSearchActiveIndex = -1;
let smartSearchClosingTimer = 0;
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
const collapsibleFilterGroups = [...document.querySelectorAll("[data-collapsible-filter]")];
const productPagination = document.querySelector("#product-pagination");
const productsPerPage = document.querySelector("#products-per-page");
const pageSizeControl = document.querySelector(".pagination-select-wrap");
const pageSizeTrigger = document.querySelector(".pagination-select-trigger");
const pageSizeValue = document.querySelector(".pagination-select-value");
const pageSizeMenu = document.querySelector(".pagination-select-menu");
const pageSizeOptions = [...document.querySelectorAll(".pagination-select-menu [data-value]")];
const paginationRange = document.querySelector("#pagination-range");
const paginationPages = document.querySelector("#pagination-pages");
let isCatalogLoading = Boolean(productGrid?.classList.contains("is-catalog-loading"));

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

function liveProductRecord(product, index) {
  const slug = String(product.slug || product.id || "");
  const imageUrl = product.images?.[0]?.sprite_index ? "" : safePublicImageUrl(product.images?.[0]?.url);
  const categorySlug = String(product.category_slug || "produse");
  const categoryName = String(product.category_name || "Produs");
  const manufacturerSlug = String(product.manufacturer_slug || "");
  const manufacturerName = String(product.manufacturer_name || "").trim();
  const brands = Array.isArray(product.brands) ? product.brands : [];
  const brandSlugs = brands.map(brand => String(brand.slug || "")).filter(Boolean);
  const brandNames = brands.map(brand => String(brand.name || "")).filter(Boolean);
  const basePrice = product.sale_price == null ? Number(product.price || 0) : Number(product.sale_price || 0);
  const currentPrice = product.promotion_price == null ? basePrice : Number(product.promotion_price || 0);
  const stockLabel = productStockLabel(product);
  const stockRank = stockLabel === "Stoc epuizat" ? 2 : stockLabel === "Stoc limitat" ? 1 : 0;
  const stockKey = product.stock_mode === "unlimited" || Number(product.stock_quantity || 0) > 0 ? "in-stock" : "out-of-stock";
  const shortDescription = String(product.short_description || "Produs disponibil în magazinul G-Trots.");
  const specificationText = (() => {
    try {
      return JSON.stringify(product.specifications || product.specifications_json || "").replace(/[{}\[\]":,]/g, " ");
    } catch {
      return "";
    }
  })();

  return {
    product,
    dataset: {
      productId: slug,
      apiProductId: String(product.id || ""),
      category: categorySlug,
      taxonomy: `produse ${categorySlug}`,
      brand: brandSlugs.join(" "),
      stock: stockKey,
      stockRank: String(stockRank),
      featuredRank: product.is_featured && Number.isFinite(Number(product.featured_rank)) ? String(product.featured_rank) : "",
      manufacturer: manufacturerSlug,
      price: String(currentPrice),
      name: String(product.name || "Produs G-Trots"),
      identifiers: `${product.sku || ""} ${product.ean || ""} ${product.id || ""}`,
      search: `${product.name || ""} ${categoryName} ${manufacturerName} ${shortDescription} ${brandNames.join(" ")} ${product.sku || ""} ${product.ean || ""} ${specificationText}`,
      route: `/magazin/produs/${encodeURIComponent(slug)}/`,
      image: imageUrl || "assets/logo.png",
      categoryName,
      manufacturerName,
      brandNames: brandNames.join(", "),
      stockLabel,
      shortDescription,
      index: String(index)
    }
  };
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
  const basePrice = product.sale_price == null ? Number(product.price || 0) : Number(product.sale_price || 0);
  const currentPrice = product.promotion_price == null ? basePrice : Number(product.promotion_price || 0);
  const standardPrice = product.promotion_price == null ? Number(product.price || 0) : Number(product.price_before_promotion ?? basePrice);
  const hasDiscount = product.promotion_price != null || product.sale_price != null;
  const stockLabel = productStockLabel(product);
  const stockRank = stockLabel === "Stoc epuizat" ? 2 : stockLabel === "Stoc limitat" ? 1 : 0;
  const stockKey = product.stock_mode === "unlimited" || Number(product.stock_quantity || 0) > 0 ? "in-stock" : "out-of-stock";
  const stockClass = stockKey === "out-of-stock" ? " is-out" : stockLabel === "Stoc limitat" ? " is-low" : "";
  const shortDescription = String(product.short_description || "Produs disponibil în magazinul G-Trots.");
  const route = `/magazin/produs/${encodeURIComponent(slug)}/`;
  const specificationText = (() => {
    try {
      return JSON.stringify(product.specifications || product.specifications_json || "").replace(/[{}\[\]":,]/g, " ");
    } catch {
      return "";
    }
  })();
  const brandBadges = brandNames
    .slice(0, 4)
    .map(name => `<span>${escapeCatalogHtml(name)}</span>`)
    .join("");
  const brandSection = brandBadges
    ? `<div class="product-fit" aria-label="Mărci compatibile">${brandBadges}</div>`
    : "";
  const oldPrice = !hasDiscount
    ? ""
    : `<del>${new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(standardPrice)} lei</del>`;
  const discountPercent = !hasDiscount || standardPrice <= 0
    ? 0
    : Math.max(0, Math.round((1 - currentPrice / standardPrice) * 100));
  const discountBadge = discountPercent > 0 ? `<em class="product-discount">-${discountPercent}%</em>` : "";
  const featuredBadge = product.is_featured
    ? `<span class="product-badge">Recomandat</span>`
    : "";

  const article = document.createElement("article");
  article.className = "product-card reveal visible live-product-card";
  article.dataset.productId = slug;
  article.dataset.apiProductId = String(product.id || "");
  article.dataset.category = categorySlug;
  article.dataset.taxonomy = `produse ${categorySlug}`;
  article.dataset.brand = brandSlugs.join(" ");
  article.dataset.stock = stockKey;
  article.dataset.stockRank = String(stockRank);
  article.dataset.featuredRank = product.is_featured && Number.isFinite(Number(product.featured_rank))
    ? String(product.featured_rank)
    : "";
  article.dataset.manufacturer = manufacturerSlug;
  article.dataset.price = String(currentPrice);
  article.dataset.name = String(product.name || "Produs G-Trots");
  article.dataset.identifiers = `${product.sku || ""} ${product.ean || ""} ${product.id || ""}`;
  article.dataset.search = `${product.name || ""} ${categoryName} ${manufacturerName} ${shortDescription} ${brandNames.join(" ")} ${product.sku || ""} ${product.ean || ""} ${specificationText}`;
  article.dataset.route = route;
  article.dataset.image = imageUrl || "assets/logo.png";
  article.dataset.categoryName = categoryName;
  article.dataset.manufacturerName = manufacturerName;
  article.dataset.brandNames = brandNames.join(", ");
  article.dataset.stockLabel = stockLabel;
  article.dataset.shortDescription = shortDescription;
  article.dataset.index = String(index);
  article.innerHTML = `
    <div class="product-stage">
      ${featuredBadge}
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
      <div class="product-summary" tabindex="0" aria-label="Pe scurt: ${escapeCatalogHtml(shortDescription)}">
        <span class="product-summary-badge"><i aria-hidden="true"></i>Pe scurt</span>
        <p>${escapeCatalogHtml(shortDescription)}</p>
        <span class="product-summary-tooltip" aria-hidden="true">${escapeCatalogHtml(shortDescription)}</span>
      </div>
      ${brandSection}
    </div>
    <div class="product-bottom">
      <div class="product-price"><small>${hasDiscount ? "Preț promoțional" : "Preț"}</small><strong>${new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(currentPrice)} <span>lei</span></strong>${oldPrice}</div>
      <div class="product-bottom-action">${discountBadge}<span class="product-open-hint" aria-hidden="true">›</span></div>
    </div>
    <a class="product-card-link" href="${route}" aria-label="Deschide pagina produsului ${escapeCatalogHtml(product.name)}"></a>`;
  return article;
}

function renderLiveProducts(products) {
  if (!productGrid || !Array.isArray(products)) return false;
  isCatalogLoading = false;
  const normalizeIdentity = value => String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const productFamily = product => {
    const tokens = normalizeIdentity(product.slug).split(" ").filter(Boolean);
    if (tokens.length > 2 && /^(?:varianta|variant)$/.test(tokens.at(-2)) && /^\d+$/.test(tokens.at(-1))) tokens.splice(-2);
    while (tokens.length > 3 && !/^\d+$/.test(tokens.at(-1)) && tokens.slice(0, -1).includes(tokens.at(-1))) tokens.pop();
    return tokens.join("-");
  };
  const keyIndexes = new Map();
  const uniqueProducts = [];
  products.forEach(product => {
    const normalizedName = String(product.name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const keys = [
      ["id", product.id],
      ["slug", product.slug],
      ["sku", product.sku],
      ["ean", product.ean],
      ["name", normalizedName],
      ["family", productFamily(product)]
    ]
      .filter(([, value]) => String(value ?? "").trim() !== "")
      .map(([type, value]) => `${type}:${String(value).trim().toLowerCase()}`);
    const duplicateIndex = keys.map(key => keyIndexes.get(key)).find(index => index !== undefined);
    if (duplicateIndex !== undefined) {
      const currentSlugLength = String(uniqueProducts[duplicateIndex]?.slug || "").length || Number.MAX_SAFE_INTEGER;
      const nextSlugLength = String(product.slug || "").length || Number.MAX_SAFE_INTEGER;
      if (nextSlugLength < currentSlugLength) uniqueProducts[duplicateIndex] = product;
      keys.forEach(key => keyIndexes.set(key, duplicateIndex));
      return;
    }
    const index = uniqueProducts.length;
    uniqueProducts.push(product);
    keys.forEach(key => keyIndexes.set(key, index));
  });
  const records = uniqueProducts.map(liveProductRecord);
  productGrid.replaceChildren();
  productGrid.classList.remove("is-catalog-loading", "has-catalog-error");
  productGrid.setAttribute("aria-busy", "false");
  productCards = records;
  if (uniqueProducts.length) {
    const oldMaximum = Number(priceRange?.max || 0);
    const maximumPrice = Math.max(...uniqueProducts.map(product => Number(product.promotion_price ?? product.sale_price ?? product.price ?? 0)), oldMaximum, 1);
    if (priceRange && maximumPrice > oldMaximum) {
      const wasAtMaximum = Number(priceRange.value) >= oldMaximum;
      priceRange.max = String(Math.ceil(maximumPrice / 100) * 100);
      if (wasAtMaximum) priceRange.value = priceRange.max;
      updateRangeAppearance();
    }
  }
  currentPage = 1;
  applyFilters();
  if (searchDeck?.classList.contains("is-search-open")) renderSmartSearch();
  productGrid.dataset.catalogSource = "shop-api";
  return true;
}

function showCatalogError() {
  if (!productGrid || !isCatalogLoading) return;
  isCatalogLoading = false;
  productCards = [];
  productGrid.classList.remove("is-catalog-loading");
  productGrid.classList.add("has-catalog-error");
  productGrid.setAttribute("aria-busy", "false");
  productGrid.innerHTML = `
    <section class="catalog-load-error" role="alert">
      <span class="catalog-load-error-icon" aria-hidden="true">!</span>
      <div>
        <span>Catalog indisponibil momentan</span>
        <h3>Produsele nu s-au putut încărca</h3>
        <p>Conexiunea poate fi temporar întreruptă. Reîncearcă fără să pierzi filtrele selectate.</p>
      </div>
      <button class="button" type="button" data-retry-catalog>Reîncearcă <b aria-hidden="true">↻</b></button>
    </section>`;
  resultsCount && (resultsCount.textContent = "Catalog indisponibil");
  searchCount && (searchCount.textContent = "0 produse");
  if (noResults) noResults.hidden = true;
  if (productPagination) productPagination.hidden = true;
  productGrid.querySelector("[data-retry-catalog]")?.addEventListener("click", () => window.location.reload());
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
let activeCategoryScope = new Set();
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
  refreshCategoryScopes(root);
}

function refreshCategoryScopes(root = document) {
  [...root.querySelectorAll(".category-filter")].forEach(button => {
    const category = String(button.dataset.category || "all");
    if (category === "all") {
      button.dataset.categoryScope = "all";
      return;
    }
    const node = button.closest(".category-tree-node");
    const scope = node
      ? [...node.querySelectorAll(".category-filter")]
          .map(item => String(item.dataset.category || "").trim())
          .filter(value => value && value !== "all")
      : [category];
    button.dataset.categoryScope = [...new Set([category, ...scope])].join(" ");
  });
}

const SHOP_PUBLIC_FILTERS_URL = "https://g-trots.ro/shop-api/api-v2.php?action=publicCatalogFilters";

function safePublicImageUrl(value) {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return "";
  try {
    const url = new URL(rawValue, window.location.origin);
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

  return null;
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
  if (children.length === 0) button.classList.add(depth === 1 ? "category-filter-root-leaf" : "category-filter-leaf");
  button.type = "button";
  button.dataset.category = String(category.slug || category.id);
  button.dataset.categoryId = String(category.id);
  if (category.system_key) button.dataset.categoryKey = String(category.system_key);

  const visual = createCategoryVisual(category, depth);
  if (visual) button.append(visual);
  const label = document.createElement("span");
  label.textContent = String(category.name || "Categorie");
  button.append(label);
  if (depth === 1 && children.length === 0) {
    const arrow = document.createElement("i");
    arrow.className = "category-root-link-arrow";
    arrow.setAttribute("aria-hidden", "true");
    button.append(arrow);
  }
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
  const activeCategories = categories
    .filter(category => category && category.is_active !== false && category.id)
    .map((category, index) => ({ category, index }))
    .sort((left, right) => {
      const leftPriority = left.category.system_key === "second_hand_scooters" ? 0 : 1;
      const rightPriority = right.category.system_key === "second_hand_scooters" ? 0 : 1;
      return leftPriority - rightPriority || left.index - right.index;
    })
    .map(({ category }) => category);
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
  return String(value ?? "")
    .toLocaleLowerCase("ro-RO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const smartSearchPopularTerms = [
  ["cauciuc trotineta", "Cauciucuri și anvelope"],
  ["camera trotineta", "Camere pentru roți"],
  ["controller", "Controlere"],
  ["display", "Display-uri"],
  ["frana", "Sisteme de frânare"],
  ["disc frana", "Discuri de frână"],
  ["cablu frana", "Cabluri de frână"],
  ["sonerie", "Sonerii"],
  ["casca", "Căști de protecție"],
  ["incarcator", "Încărcătoare"]
];

const smartSearchSynonymGroups = [
  ["cauciuc", "anvelopa", "pneu", "roata"],
  ["camera", "tub", "inner tube"],
  ["frana", "franare", "etrier", "placute", "sabot"],
  ["disc", "rotor"],
  ["cablu", "cablaj", "fir"],
  ["controller", "controler", "unitate control"],
  ["display", "ecran", "bord", "dashboard"],
  ["incarcator", "charger", "alimentator"],
  ["baterie", "acumulator"],
  ["sonerie", "claxon", "avertizor"],
  ["casca", "helmet", "protectie cap"],
  ["aripa", "aparatoare", "mudguard"],
  ["acceleratie", "accelerator", "maneta"],
  ["lumina", "far", "stop", "semnalizare", "led"],
  ["pliere", "folding", "balama", "mecanism pliere"],
  ["rulment", "bearing"],
  ["surub", "piulita", "bolt"],
  ["motor", "hub", "butuc motor"],
  ["suport", "prindere", "bracket"],
  ["ghidon", "handlebar"],
  ["amortizor", "suspensie", "shock"],
  ["electric", "electrica", "trotineta"]
].map(group => group.map(normalizeText));

const semanticSearchCache = new WeakMap();
const smartSearchStopWords = new Set(["vreau", "caut", "cauta", "pentru", "trotineta", "trotinete", "electrica", "electric", "piesa", "piese", "produs", "produse", "un", "una", "unei", "de", "la", "cu", "si", "sau", "din"]);

function semanticTermsForToken(token) {
  const matchingGroup = smartSearchSynonymGroups.find(group => group.some(term => term === token));
  if (matchingGroup) return matchingGroup;
  if (token.length < 4) return [token];

  // Corectam mai intai termenul fata de vocabularul magazinului. Astfel
  // „cxontroller” devine „controller” si primeste aceleasi sinonime, in loc
  // sa potriveasca orice descriere care mentioneaza vag un controller.
  const distanceLimit = token.length >= 8 ? 2 : 1;
  let closestGroup = null;
  let closestDistance = distanceLimit + 1;
  smartSearchSynonymGroups.forEach(group => {
    group.forEach(term => {
      if (term.includes(" ")) return;
      const distance = smartSearchWordDistance(token, term, distanceLimit);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestGroup = group;
      }
    });
  });
  return closestGroup && closestDistance <= distanceLimit ? closestGroup : [token];
}

function smartSearchWordDistance(first, second, limit = 1) {
  if (Math.abs(first.length - second.length) > limit) return limit + 1;
  let previousPrevious = null;
  let previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    const current = [firstIndex];
    let rowMinimum = current[0];
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const cost = first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1;
      current[secondIndex] = Math.min(
        current[secondIndex - 1] + 1,
        previous[secondIndex] + 1,
        previous[secondIndex - 1] + cost
      );
      if (
        previousPrevious
        && firstIndex > 1
        && secondIndex > 1
        && first[firstIndex - 1] === second[secondIndex - 2]
        && first[firstIndex - 2] === second[secondIndex - 1]
      ) {
        current[secondIndex] = Math.min(current[secondIndex], previousPrevious[secondIndex - 2] + 1);
      }
      rowMinimum = Math.min(rowMinimum, current[secondIndex]);
    }
    if (rowMinimum > limit) return limit + 1;
    previousPrevious = previous;
    previous = current;
  }
  return previous[second.length];
}

function semanticCardData(card) {
  if (semanticSearchCache.has(card)) return semanticSearchCache.get(card);
  const title = normalizeText(card.dataset.name || "");
  const search = normalizeText(`${card.dataset.name || ""} ${card.dataset.search || ""}`);
  const taxonomy = normalizeText(`${card.dataset.categoryName || ""} ${card.dataset.manufacturerName || ""} ${card.dataset.brandNames || ""} ${card.dataset.category || ""} ${card.dataset.manufacturer || ""} ${card.dataset.brand || ""}`);
  const identifiers = normalizeText(card.dataset.identifiers || "");
  const titleWords = [...new Set(title.split(" ").filter(Boolean))];
  const taxonomyWords = [...new Set(taxonomy.split(" ").filter(Boolean))];
  const identifierWords = [...new Set(identifiers.split(" ").filter(Boolean))];
  const words = [...new Set(search.split(" ").filter(Boolean))].slice(0, 260);
  const data = { title, search, titleWords, taxonomyWords, identifierWords, words };
  semanticSearchCache.set(card, data);
  return data;
}

function semanticSearchScore(card, rawQuery) {
  const query = normalizeText(rawQuery);
  if (!query) return 0;
  const { title, search, titleWords, taxonomyWords, identifierWords, words } = semanticCardData(card);
  const queryTokens = [...new Set(query.split(" ").filter(token => token.length > 1 && !smartSearchStopWords.has(token)))];
  let score = 0;
  let matchedTokens = 0;
  let strongMatchedTokens = 0;

  if (title === query) score += 240;
  else if (title.startsWith(query)) score += 130;
  else if (title.includes(query)) score += 90;
  else if (search.includes(query)) score += 52;

  queryTokens.forEach(token => {
    const terms = semanticTermsForToken(token);
    let tokenScore = 0;
    terms.forEach((term, termIndex) => {
      const directWeight = termIndex === 0 ? 1 : 0.78;
      if (titleWords.includes(term)) tokenScore = Math.max(tokenScore, 40 * directWeight);
      else if (titleWords.some(word => word.startsWith(term) || term.startsWith(word))) tokenScore = Math.max(tokenScore, 32 * directWeight);
      else if (title.includes(term)) tokenScore = Math.max(tokenScore, 28 * directWeight);
      else if (identifierWords.includes(term)) tokenScore = Math.max(tokenScore, 38 * directWeight);
      else if (taxonomyWords.includes(term)) tokenScore = Math.max(tokenScore, 30 * directWeight);
      else if (taxonomyWords.some(word => word.startsWith(term) || term.startsWith(word))) tokenScore = Math.max(tokenScore, 24 * directWeight);
      else if (words.includes(term)) tokenScore = Math.max(tokenScore, 14 * directWeight);
      else if (search.includes(term)) tokenScore = Math.max(tokenScore, 9 * directWeight);
    });

    if (tokenScore === 0 && token.length >= 4) {
      const distanceLimit = token.length >= 8 ? 2 : 1;
      const fuzzyTitle = titleWords.some(word => word.length >= 4 && smartSearchWordDistance(token, word, distanceLimit) <= distanceLimit);
      const fuzzyTaxonomy = !fuzzyTitle && taxonomyWords.some(word => word.length >= 4 && smartSearchWordDistance(token, word, distanceLimit) <= distanceLimit);
      const fuzzyIdentifier = !fuzzyTitle && !fuzzyTaxonomy && identifierWords.some(word => word.length >= 4 && smartSearchWordDistance(token, word, 1) <= 1);
      const fuzzyBody = !fuzzyTitle && !fuzzyTaxonomy && !fuzzyIdentifier && words.some(word => word.length >= 4 && smartSearchWordDistance(token, word, 1) <= 1);
      if (fuzzyTitle) tokenScore = 26;
      else if (fuzzyTaxonomy) tokenScore = 22;
      else if (fuzzyIdentifier) tokenScore = 20;
      else if (fuzzyBody) tokenScore = 7;
    }

    if (tokenScore > 0) {
      matchedTokens += 1;
      if (tokenScore >= 20) strongMatchedTokens += 1;
      score += tokenScore;
    }
  });

  // Pentru o cautare dintr-un singur cuvant cerem o potrivire clara in titlu,
  // categorie, marca, producator sau cod. O mentiune izolata in descriere nu
  // mai umple panoul cu produse fara legatura directa.
  if (queryTokens.length === 1 && strongMatchedTokens === 0) return 0;
  if (queryTokens.length && matchedTokens === queryTokens.length) score += 55 + queryTokens.length * 5;
  else if (queryTokens.length <= 3) return 0;
  else if (matchedTokens / queryTokens.length >= 0.7) score += 18;
  else return 0;

  const stockRank = Number(card.dataset.stockRank || 0);
  if (stockRank === 0) score += 5;
  else if (stockRank === 2) score -= 3;
  return Math.max(0, Math.round(score * 10) / 10);
}

function smartSearchCards(query) {
  return productCards
    .map(card => ({ card, score: semanticSearchScore(card, query) }))
    .filter(result => result.score >= 8)
    .sort((first, second) => {
      if (second.score !== first.score) return second.score - first.score;
      const stockDifference = Number(first.card.dataset.stockRank || 0) - Number(second.card.dataset.stockRank || 0);
      if (stockDifference !== 0) return stockDifference;
      return Number(first.card.dataset.index || 0) - Number(second.card.dataset.index || 0);
    });
}

function formatSmartSearchPrice(value) {
  return new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}

function smartSearchStockClass(card) {
  const label = normalizeText(card.dataset.stockLabel || "");
  if (label.includes("epuizat")) return " is-out";
  if (label.includes("limitat")) return " is-low";
  return "";
}

function smartSearchResultMarkup(card) {
  const name = card.dataset.name || "Produs G-Trots";
  const route = card.dataset.route || card.querySelector(".product-card-link")?.getAttribute("href") || "#catalog";
  const image = card.dataset.image || "assets/logo.png";
  const category = card.dataset.categoryName || "Produs";
  const compatibility = card.dataset.brandNames || card.dataset.manufacturerName || card.dataset.shortDescription || "Disponibil în catalog";
  const stockLabel = card.dataset.stockLabel || "În stoc";
  return `<a class="smart-search-result" href="${escapeCatalogHtml(route)}" data-search-choice>
    <span class="smart-search-result-image" style="background-image:url(&quot;${escapeCatalogHtml(image)}&quot;)" aria-hidden="true"></span>
    <span class="smart-search-result-copy"><small>${escapeCatalogHtml(category)}</small><strong>${escapeCatalogHtml(name)}</strong><span>${escapeCatalogHtml(compatibility)}</span></span>
    <span class="smart-search-result-stock${smartSearchStockClass(card)}">${escapeCatalogHtml(stockLabel)}</span>
    <span class="smart-search-result-price"><strong>${formatSmartSearchPrice(card.dataset.price)} lei</strong><small>Vezi produsul</small></span>
  </a>`;
}

function renderSmartSearch(rawQuery = searchInput?.value || "") {
  if (!smartSearchContent) return null;
  const query = normalizeText(rawQuery);
  smartSearchActiveIndex = -1;

  if (!query) {
    if (searchCount) searchCount.textContent = `${productCards.length} ${productCards.length === 1 ? "produs" : "produse"}`;
    smartSearchContent.innerHTML = `
      <div class="smart-search-section-head"><span><strong>Căutări populare în G-Trots</strong><small>Alege rapid piesa de care ai nevoie</small></span><b class="smart-search-count">Sugestii</b></div>
      <div class="smart-search-popular">
        ${smartSearchPopularTerms.map(([term, label], index) => `<button type="button" data-popular-search="${escapeCatalogHtml(term)}" data-search-choice><i aria-hidden="true">${String(index + 1).padStart(2, "0")}</i><span><strong>${escapeCatalogHtml(label)}</strong><small>Caută în catalog</small></span><b aria-hidden="true">›</b></button>`).join("")}
      </div>`;
    return null;
  }

  const results = smartSearchCards(query);
  if (searchCount) searchCount.textContent = `${results.length} ${results.length === 1 ? "produs" : "produse"}`;
  if (!results.length) {
    smartSearchContent.innerHTML = `<div class="smart-search-empty"><i aria-hidden="true">⌕</i><strong>Nu am găsit încă produsul.</strong><p>Încearcă denumirea componentei, modelul trotinetei sau marca. Poți scrie și aproximativ — căutarea corectează greșelile mici.</p></div>`;
    return 0;
  }

  smartSearchContent.innerHTML = `
    <div class="smart-search-section-head"><span><strong>Rezultate potrivite</strong><small>Ordonate după relevanță și disponibilitate</small></span><b class="smart-search-count">${results.length} ${results.length === 1 ? "produs" : "produse"}</b></div>
    <div class="smart-search-results">${results.slice(0, 6).map(result => smartSearchResultMarkup(result.card)).join("")}</div>
    <button class="smart-search-all" type="button" data-smart-search-all data-search-choice>Vezi toate cele ${results.length} rezultate în catalog <span aria-hidden="true">↓</span></button>`;
  return results.length;
}

function updateSmartSearchCollapseTarget() {
  if (!searchDeck || !smartSearchMobileBack) return;
  const deckRect = searchDeck.getBoundingClientRect();
  const targetRect = smartSearchMobileBack.getBoundingClientRect();
  searchDeck.style.setProperty("--smart-search-collapse-x", `${targetRect.left + targetRect.width / 2 - deckRect.left}px`);
  searchDeck.style.setProperty("--smart-search-collapse-y", `${targetRect.top + targetRect.height / 2 - deckRect.top}px`);
}

function openSmartSearch() {
  if (!smartSearchPanel || !searchDeck) return;
  // Focus, click si input se pot declansa unul dupa altul pentru aceeasi
  // interactiune. Dupa deschidere nu mai recalculam pozitia si nu mai
  // redesenam panoul inca o data, astfel pagina ramane stabila.
  const wasOpen = searchDeck.classList.contains("is-search-open");
  const wasClosing = searchDeck.classList.contains("is-search-closing");
  window.clearTimeout(smartSearchClosingTimer);
  smartSearchClosingTimer = 0;
  if (wasOpen && !wasClosing) return;
  searchDeck.classList.remove("is-search-closing");
  document.body.classList.remove("smart-search-closing");
  const isMobileSearch = window.matchMedia("(max-width: 700px)").matches;
  const promotionHeight = document.querySelector(".gt-promotion-bar")?.getBoundingClientRect().height || 0;
  if (!isMobileSearch && !wasOpen) {
    const deckRect = searchDeck.getBoundingClientRect();
    const targetTop = promotionHeight + 10;
    searchDeck.style.setProperty("--smart-search-open-left", `${deckRect.left}px`);
    searchDeck.style.setProperty("--smart-search-open-width", `${deckRect.width}px`);
    searchDeck.style.setProperty("--smart-search-open-top", `${targetTop}px`);
  }

  searchDeck.classList.add("is-search-open");
  document.body.classList.add("smart-search-open");
  smartSearchPanel.hidden = false;
  if (smartSearchOverlay) smartSearchOverlay.hidden = false;
  renderSmartSearch();
  window.requestAnimationFrame(updateSmartSearchCollapseTarget);
}

function clearSmartSearchQuery() {
  if (searchInput) searchInput.value = "";
  if (searchClear) searchClear.hidden = true;
  smartSearchActiveIndex = -1;
  applyFilters({ resetPage: false });
}

function closeSmartSearch({ restoreFocus = false, clearQuery = false } = {}) {
  if (!smartSearchPanel || !searchDeck) return;
  if (clearQuery) clearSmartSearchQuery();
  const finishClose = () => {
    window.clearTimeout(smartSearchClosingTimer);
    searchDeck.classList.remove("is-search-open", "is-search-closing");
    document.body.classList.remove("smart-search-open", "smart-search-closing");
    smartSearchPanel.hidden = true;
    if (smartSearchOverlay) smartSearchOverlay.hidden = true;
    smartSearchActiveIndex = -1;
    if (restoreFocus) searchInput?.focus();
  };
  if (!prefersReducedMotion && searchDeck.classList.contains("is-search-open")) {
    updateSmartSearchCollapseTarget();
    searchDeck.classList.add("is-search-closing");
    document.body.classList.add("smart-search-closing");
    smartSearchClosingTimer = window.setTimeout(finishClose, 230);
    return;
  }
  finishClose();
}

function showSmartSearchCatalogResults() {
  applyFilters();
  closeSmartSearch();
  searchInput?.blur();
  window.setTimeout(() => {
    document.querySelector("#catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 30);
}

function smartSearchChoices() {
  return [...(smartSearchContent?.querySelectorAll("[data-search-choice]") || [])];
}

function setSmartSearchActive(index) {
  const choices = smartSearchChoices();
  if (!choices.length) return;
  smartSearchActiveIndex = (index + choices.length) % choices.length;
  choices.forEach((choice, choiceIndex) => choice.classList.toggle("is-active", choiceIndex === smartSearchActiveIndex));
  choices[smartSearchActiveIndex].scrollIntoView({ block: "nearest" });
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

function updateCollapsibleFilterBadges() {
  collapsibleFilterGroups.forEach(group => {
    const toggle = group.querySelector(".filter-collapse-toggle");
    const badge = group.querySelector(".filter-selected-count");
    if (!toggle || !badge) return;
    const selectedCount = group.querySelectorAll('input[type="checkbox"]:checked').length;
    const isCollapsed = toggle.getAttribute("aria-expanded") === "false";
    badge.textContent = `${selectedCount} ${selectedCount === 1 ? "selectat" : "selectate"}`;
    badge.hidden = !isCollapsed || selectedCount === 0;
  });
}

function setCollapsibleFilterState(group, collapsed) {
  const toggle = group.querySelector(".filter-collapse-toggle");
  const body = group.querySelector(".filter-collapse-body");
  const options = group.querySelector(".filter-options-scroll");
  if (!toggle || !body) return;
  group.classList.toggle("is-collapsed", collapsed);
  toggle.setAttribute("aria-expanded", String(!collapsed));
  body.setAttribute("aria-hidden", String(collapsed));
  body.inert = collapsed;
  if (options) options.tabIndex = collapsed ? -1 : 0;
  updateCollapsibleFilterBadges();
}

collapsibleFilterGroups.forEach(group => {
  const toggle = group.querySelector(".filter-collapse-toggle");
  if (!toggle) return;
  toggle.addEventListener("click", () => {
    setCollapsibleFilterState(group, toggle.getAttribute("aria-expanded") === "true");
  });
});

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
  const activeSearchQuery = normalizeText(searchInput?.value || "");
  return [...cards].sort((first, second) => {
    const stockRank = card => {
      const explicitRank = Number(card.dataset.stockRank);
      if (Number.isFinite(explicitRank)) return explicitRank;
      const label = normalizeText(card.querySelector(".product-quick-note")?.textContent || "");
      if (label.includes("epuizat")) return 2;
      if (label.includes("limitat")) return 1;
      return 0;
    };
    if (activeSearchQuery) {
      const searchDifference = Number(second.dataset.searchScore || 0) - Number(first.dataset.searchScore || 0);
      if (searchDifference !== 0) return searchDifference;
    }
    if (mode === "featured") {
      const featuredRank = card => {
        const rank = Number(card.dataset.featuredRank);
        return Number.isFinite(rank) && rank > 0 ? rank : Number.POSITIVE_INFINITY;
      };
      const firstRank = featuredRank(first);
      const secondRank = featuredRank(second);
      const firstIsStorefrontPick = firstRank <= 10;
      const secondIsStorefrontPick = secondRank <= 10;
      if (firstIsStorefrontPick !== secondIsStorefrontPick) return firstIsStorefrontPick ? -1 : 1;
      if (firstIsStorefrontPick && secondIsStorefrontPick && firstRank !== secondRank) {
        return firstRank - secondRank;
      }
    }
    const stockDifference = stockRank(first) - stockRank(second);
    if (stockDifference !== 0) return stockDifference;
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
  if (isCatalogLoading) {
    if (resultsCount) resultsCount.textContent = "Se încarcă produsele…";
    if (searchCount) searchCount.textContent = "catalogul";
    if (noResults) noResults.hidden = true;
    if (productPagination) productPagination.hidden = true;
    return;
  }
  if (resetPage) currentPage = 1;
  const query = normalizeText(searchInput?.value || "");
  const selectedBrands = getSelectedBrands();
  const selectedStocks = getSelectedStocks();
  const selectedManufacturers = getSelectedManufacturers();
  const maxPrice = Number(priceRange?.value || Infinity);
  const visibleCards = [];

  productCards.forEach(card => {
    const cardBrands = (card.dataset.brand || "").split(" ");
    const cardTaxonomy = `${card.dataset.category || ""} ${card.dataset.taxonomy || ""}`.split(" ").filter(Boolean);
    const searchScore = query ? semanticSearchScore(card, query) : 0;
    card.dataset.searchScore = String(searchScore);
    const matchesSearch = !query || searchScore >= 8;
    const matchesCategory = activeCategory === "all"
      || cardTaxonomy.some(category => activeCategoryScope.has(category));
    const matchesBrand = selectedBrands.length === 0 || selectedBrands.some(brand => cardBrands.includes(brand));
    const matchesStock = selectedStocks.length === 0 || selectedStocks.includes(card.dataset.stock);
    const matchesManufacturer = selectedManufacturers.length === 0 || selectedManufacturers.includes(card.dataset.manufacturer);
    const matchesPrice = Number(card.dataset.price) <= maxPrice;
    const isVisible = matchesSearch && matchesCategory && matchesBrand && matchesStock && matchesManufacturer && matchesPrice;

    if (isVisible) visibleCards.push(card);
  });

  const sortedVisibleCards = sortCards(visibleCards);
  const pageSize = Number(productsPerPage?.value || 10);
  const totalPages = Math.max(1, Math.ceil(sortedVisibleCards.length / pageSize));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageEnd = pageStart + pageSize;

  if (productGrid) {
    const pageCards = sortedVisibleCards.slice(pageStart, pageEnd).map(card => {
      if (card instanceof Element) {
        card.hidden = false;
        return card;
      }
      return liveProductCard(card.product, Number(card.dataset.index || 0));
    });
    productGrid.replaceChildren(...pageCards);
    document.dispatchEvent(new CustomEvent("g-trots:live-products"));
  }

  const count = visibleCards.length;
  const countLabel = `${count} ${count === 1 ? "produs" : "produse"}`;
  if (resultsCount) resultsCount.textContent = countLabel;
  if (searchCount) searchCount.textContent = countLabel;
  if (noResults) noResults.hidden = count !== 0;
  renderPagination(count);
  updateMobileFilterCount();
  updateCollapsibleFilterBadges();
}

function resetFilters() {
  activeCategory = "all";
  activeCategoryScope = new Set();
  if (searchInput) searchInput.value = "";
  if (searchClear) searchClear.hidden = true;
  if (priceRange) priceRange.value = priceRange.max;
  brandInputs.forEach(input => { input.checked = false; });
  stockInputs.forEach(input => { input.checked = false; });
  manufacturerInputs.forEach(input => { input.checked = false; });
  categoryButtons.forEach(button => {
    const isActive = button.dataset.category === "all";
    button.classList.toggle("active", isActive);
    if (isActive) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
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
      activeCategoryScope = activeCategory === "all"
        ? new Set()
        : new Set(String(button.dataset.categoryScope || activeCategory).split(" ").filter(Boolean));
      categoryButtons.forEach(item => {
        const isActive = item === button;
        item.classList.toggle("active", isActive);
        if (isActive) item.setAttribute("aria-current", "true");
        else item.removeAttribute("aria-current");
      });
      applyFilters();
    });
  });

  [...brandInputs, ...stockInputs, ...manufacturerInputs].forEach(input => {
    if (input.dataset.filterBound === "true") return;
    input.dataset.filterBound = "true";
    input.addEventListener("change", applyFilters);
  });
}

function applyCatalogDeepLink(categories = []) {
  const params = new URLSearchParams(window.location.search);
  const requestedKey = String(params.get("category_key") || "").trim();
  const requestedCategory = String(params.get("category") || "").trim();
  if (!requestedKey && !requestedCategory) return false;

  const category = categories.find(item => (
    (requestedKey && String(item?.system_key || "") === requestedKey)
    || (requestedCategory && [item?.slug, item?.id].map(String).includes(requestedCategory))
  ));
  const target = categoryButtons.find(button => (
    (requestedKey && button.dataset.categoryKey === requestedKey)
    || (category && button.dataset.categoryId === String(category.id))
    || (requestedCategory && button.dataset.category === requestedCategory)
  ));
  if (!target) return false;

  let treeNode = target.closest(".category-tree-node");
  while (treeNode) {
    if (directTreeChild(treeNode, ".category-tree-children")) setTreeNodeExpanded(treeNode, true, false);
    treeNode = treeNode.parentElement?.closest(".category-tree-node") || null;
  }

  activeCategory = target.dataset.category || "all";
  activeCategoryScope = activeCategory === "all"
    ? new Set()
    : new Set(String(target.dataset.categoryScope || activeCategory).split(" ").filter(Boolean));
  categoryButtons.forEach(button => {
    const isActive = button === target;
    button.classList.toggle("active", isActive);
    if (isActive) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
  applyFilters();

  if (window.location.hash === "#catalog") {
    window.requestAnimationFrame(() => document.querySelector("#catalog")?.scrollIntoView({ block: "start" }));
  }
  if (params.get("filters") === "open" && window.matchMedia("(max-width: 900px)").matches) {
    window.requestAnimationFrame(() => {
      openFilters();
      window.requestAnimationFrame(() => target.scrollIntoView({ block: "center", inline: "nearest" }));
    });
  }
  return true;
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

    const categoryRows = payload.categories;

    renderCategoryFilters(categoryRows);
    renderChoiceFilters(compatibilityOptions, payload.brands, "Nu există mărci active.");
    renderChoiceFilters(manufacturerOptions, payload.manufacturers, "Nu există producători activi.");
    activeCategory = "all";
    activeCategoryScope = new Set();
    bindFilterControls();
    if (!applyCatalogDeepLink(categoryRows)) applyFilters();
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
    openSmartSearch();
    renderSmartSearch();
  });
  searchInput.addEventListener("click", openSmartSearch);
  searchInput.addEventListener("keydown", event => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSmartSearchActive(smartSearchActiveIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSmartSearchActive(smartSearchActiveIndex - 1);
    } else if (event.key === "Enter") {
      const activeChoice = smartSearchChoices()[smartSearchActiveIndex];
      if (activeChoice) {
        event.preventDefault();
        activeChoice.click();
      } else if (normalizeText(searchInput.value)) {
        event.preventDefault();
        showSmartSearchCatalogResults();
      }
    }
  });
}

searchClear?.addEventListener("click", event => {
  event.preventDefault();
  event.stopPropagation();
  searchInput?.blur();
  closeSmartSearch({ clearQuery: true });
});

smartSearchContent?.addEventListener("click", event => {
  const popularButton = event.target.closest("[data-popular-search]");
  if (popularButton && searchInput) {
    searchInput.value = popularButton.dataset.popularSearch || "";
    if (searchClear) searchClear.hidden = false;
    renderSmartSearch();
    searchInput.focus();
    return;
  }

  const showAllButton = event.target.closest("[data-smart-search-all]");
  if (showAllButton) {
    showSmartSearchCatalogResults();
  }
});

smartSearchClose?.addEventListener("click", event => {
  event.preventDefault();
  event.stopPropagation();
  searchInput?.blur();
  closeSmartSearch({ clearQuery: true });
});
smartSearchBack?.addEventListener("click", event => {
  event.preventDefault();
  event.stopPropagation();
  searchInput?.blur();
  closeSmartSearch();
});
smartSearchMobileBack?.addEventListener("click", event => {
  event.preventDefault();
  event.stopPropagation();
  if (searchDeck?.classList.contains("is-search-open")) {
    searchInput?.blur();
    closeSmartSearch();
  } else {
    openSmartSearch();
    searchInput?.focus();
  }
});
smartSearchSubmit?.addEventListener("click", event => {
  event.preventDefault();
  event.stopPropagation();
  showSmartSearchCatalogResults();
});
smartSearchOverlay?.addEventListener("click", event => {
  event.preventDefault();
  searchInput?.blur();
  closeSmartSearch();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && searchDeck?.classList.contains("is-search-open")) {
    event.preventDefault();
    searchInput?.blur();
    closeSmartSearch({ clearQuery: true });
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase("ro-RO") === "k") {
    event.preventDefault();
    openSmartSearch();
    searchInput?.focus();
  }
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
  renderLiveProducts,
  showCatalogError
};

document.addEventListener("g-trots:catalog-error", showCatalogError);
