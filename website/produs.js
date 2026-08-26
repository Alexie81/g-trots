const products = {
  "anvelopa-g10-all-terrain": {
    name: "Anvelopă G10 All-Terrain",
    category: "Anvelope · 10 inch",
    description: "Aderență bună pe asfalt și drum mixt, cu profil anti-alunecare și construcție pregătită pentru utilizare zilnică.",
    price: "149,00 lei",
    badge: "Recomandat",
    stock: "În stoc",
    image: 1,
    brands: ["Universal", "KuKirin", "Xiaomi", "Ninebot"],
    specs: [["Tip", "All-terrain"], ["Diametru", "10 inch"], ["Utilizare", "Asfalt + mixt"]]
  },
  "display-smart-ride-s3": {
    name: "Display Smart Ride S3",
    category: "Electronică · Display",
    description: "Ecran clar, lizibilitate ridicată și comenzi intuitive pentru informațiile importante din timpul deplasării.",
    price: "349,00 lei",
    badge: "Nou",
    stock: "În stoc",
    image: 2,
    brands: ["KuKirin", "Xiaomi", "Ninebot"],
    specs: [["Afișaj", "Digital"], ["Control", "Integrat"], ["Montaj", "Verificabil"]]
  },
  "incarcator-fastcharge-54-6v": {
    name: "Încărcător FastCharge 54.6V",
    category: "Alimentare · 54.6V",
    description: "Protecție la supratensiune și răcire eficientă pentru o încărcare sigură și constantă.",
    price: "189,00 lei",
    badge: "Testat G-Trots",
    stock: "În stoc",
    image: 3,
    brands: ["Universal", "KuKirin", "Xiaomi"],
    specs: [["Tensiune", "54.6V"], ["Protecție", "Integrată"], ["Răcire", "Eficientă"]]
  },
  "motor-dualhub-x2-2000w": {
    name: "Motor DualHub X2 2000W",
    category: "Motoare · 2000W",
    description: "Cuplu ridicat, construcție robustă și răspuns prompt la accelerație pentru configurații compatibile.",
    price: "1.899,00 lei",
    badge: "Performance",
    stock: "Stoc limitat",
    image: 4,
    brands: ["KuKirin", "G2 Master"],
    specs: [["Putere", "2000W"], ["Tip", "Dual hub"], ["Montaj", "În service"]]
  },
  "baterie-powercore-52v-23ah": {
    name: "Baterie PowerCore 52V 23Ah",
    category: "Alimentare · 52V 23Ah",
    description: "Celule echilibrate, BMS protejat și autonomie proiectată pentru trasee lungi și utilizare constantă.",
    price: "2.499,00 lei",
    badge: "Autonomie+",
    stock: "În stoc",
    image: 5,
    brands: ["KuKirin", "G2 Pro", "G3"],
    specs: [["Tensiune", "52V"], ["Capacitate", "23Ah"], ["Protecție", "BMS"]]
  },
  "kit-frana-hydrostop-pro": {
    name: "Kit frână HydroStop Pro",
    category: "Frânare · Hidraulic",
    description: "Dozaj precis și putere constantă de oprire pentru control mai bun și frânare predictibilă.",
    price: "399,00 lei",
    badge: "Siguranță",
    stock: "În stoc",
    image: 6,
    brands: ["Universal", "KuKirin", "Xiaomi", "Ninebot"],
    specs: [["Sistem", "Hidraulic"], ["Disc", "Inclus"], ["Montaj", "Disponibil"]]
  }
};

const params = new URLSearchParams(window.location.search);
const pathMatch = window.location.pathname.match(/\/magazin\/produs\/([^/]+)\/?$/i);
const productId = (pathMatch ? decodeURIComponent(pathMatch[1]) : null) || params.get("slug") || params.get("id") || document.body.dataset.productId || "anvelopa-g10-all-terrain";
const product = products[productId] || products["anvelopa-g10-all-terrain"];

const setText = (selector, value) => {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
};

setText("[data-product-breadcrumb]", product.name);
setText("[data-product-badge]", product.badge);
setText("[data-product-stock]", product.stock);
setText("[data-product-category]", product.category);
setText("[data-product-title]", product.name);
setText("[data-product-description]", product.description);
setText("[data-product-price]", product.price);

document.title = `${product.name} | Magazin G-Trots`;
document.querySelector('meta[name="description"]')?.setAttribute("content", product.description);

const image = document.querySelector("[data-product-image]");
if (image) {
  image.className = `product-detail-image product-image-${product.image}`;
  image.setAttribute("aria-label", product.name);
}

const stock = document.querySelector(".product-detail-stock");
stock?.classList.toggle("is-low", product.stock === "Stoc limitat");

const brands = document.querySelector("[data-product-brands]");
if (brands) {
  brands.innerHTML = product.brands.map(brand => `<b>${brand}</b>`).join("");
}

const specs = document.querySelector("[data-product-specs]");
if (specs) {
  specs.innerHTML = product.specs.map(([label, value]) => `<div><small>${label}</small><strong>${value}</strong></div>`).join("");
}

const whatsapp = document.querySelector("[data-product-whatsapp]");
if (whatsapp) {
  const message = `Bună, mă interesează ${product.name}. Vreau să verific compatibilitatea înainte de comandă.`;
  whatsapp.href = `https://wa.me/40762093915?text=${encodeURIComponent(message)}`;
}

const menuToggle = document.querySelector(".menu-toggle");
const mainNav = document.querySelector(".main-nav");
menuToggle?.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!open));
  mainNav?.classList.toggle("open", !open);
  document.body.classList.toggle("menu-open", !open);
});

const productBackLink = document.querySelector(".product-back-link");
const productBreadcrumb = document.querySelector(".product-detail-breadcrumb");
if (productBackLink && productBreadcrumb) {
  const backRow = document.createElement("div");
  backRow.className = "product-back-row shell";
  backRow.append(productBackLink);
  productBreadcrumb.insertAdjacentElement("afterend", backRow);
}

const productVisual = document.querySelector(".product-detail-visual");
const galleryButtons = [...document.querySelectorAll("[data-gallery-view]")];
const galleryViews = galleryButtons.length
  ? galleryButtons.map(button => button.dataset.galleryView)
  : ["full"];
let activeGalleryIndex = 0;
let productGalleryDots = null;

if (productVisual && galleryViews.length > 1) {
  productGalleryDots = document.createElement("nav");
  productGalleryDots.className = "product-gallery-dots";
  productGalleryDots.setAttribute("aria-label", "Alege imaginea produsului");
  galleryViews.forEach((view, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("aria-label", `Imaginea ${index + 1}`);
    dot.addEventListener("click", () => showGalleryView(index));
    productGalleryDots.append(dot);
  });
  productVisual.append(productGalleryDots);
}

function showGalleryView(index) {
  if (!productVisual || galleryViews.length === 0) return;
  activeGalleryIndex = (index + galleryViews.length) % galleryViews.length;
  const view = galleryViews[activeGalleryIndex];
  productVisual.classList.remove("gallery-view-profile", "gallery-view-tread");
  if (view !== "full") productVisual.classList.add(`gallery-view-${view}`);
  galleryButtons.forEach((button, buttonIndex) => {
    const active = buttonIndex === activeGalleryIndex;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  [...(productGalleryDots?.children || [])].forEach((dot, dotIndex) => {
    const active = dotIndex === activeGalleryIndex;
    dot.classList.toggle("active", active);
    dot.setAttribute("aria-current", active ? "true" : "false");
  });
}

galleryButtons.forEach((button, index) => {
  button.addEventListener("click", () => showGalleryView(index));
});

document.querySelector("[data-gallery-previous]")?.addEventListener("click", () => showGalleryView(activeGalleryIndex - 1));
document.querySelector("[data-gallery-next]")?.addEventListener("click", () => showGalleryView(activeGalleryIndex + 1));

function initializeProductImageViewer() {
  if (!productVisual || !image) return;

  const openButton = document.createElement("button");
  openButton.className = "product-gallery-open";
  openButton.type = "button";
  openButton.setAttribute("aria-label", `Mărește imaginea pentru ${product.name}`);
  openButton.innerHTML = '<span aria-hidden="true"></span>';
  productVisual.append(openButton);

  const viewer = document.createElement("div");
  viewer.className = "product-image-viewer";
  viewer.hidden = true;
  viewer.innerHTML = `
    <div class="product-image-viewer__scrim" data-viewer-close></div>
    <section class="product-image-viewer__dialog" role="dialog" aria-modal="true" aria-labelledby="product-image-viewer-title">
      <header class="product-image-viewer__toolbar">
        <div class="product-image-viewer__heading">
          <small>Galerie produs</small>
          <strong id="product-image-viewer-title">${product.name}</strong>
          <span><b data-viewer-index>1</b> / <b data-viewer-total>${galleryViews.length}</b></span>
        </div>
        <div class="product-image-viewer__tools" aria-label="Comenzi zoom">
          <button type="button" data-viewer-zoom-out aria-label="Micșorează imaginea">−</button>
          <button class="product-image-viewer__zoom-value" type="button" data-viewer-reset aria-label="Resetează mărirea"><span data-viewer-zoom>100%</span></button>
          <button type="button" data-viewer-zoom-in aria-label="Mărește imaginea">+</button>
          <button class="product-image-viewer__close" type="button" data-viewer-close aria-label="Închide galeria"><span aria-hidden="true"></span></button>
        </div>
      </header>
      <div class="product-image-viewer__stage">
        <button class="product-image-viewer__arrow is-previous" type="button" data-viewer-previous aria-label="Imaginea anterioară">‹</button>
        <div class="product-image-viewer__viewport" data-viewer-viewport>
          <div class="product-image-viewer__transform" data-viewer-transform>
            <div class="product-image-viewer__art product-image-${product.image}" data-viewer-art role="img" aria-label="${product.name}"></div>
          </div>
        </div>
        <button class="product-image-viewer__arrow is-next" type="button" data-viewer-next aria-label="Imaginea următoare">›</button>
      </div>
      <footer class="product-image-viewer__footer">
        <div class="product-image-viewer__dots" data-viewer-dots aria-label="Imaginile galeriei"></div>
        <p><span class="desktop-viewer-hint">Rotește rotița pentru zoom · trage pentru deplasare</span><span class="mobile-viewer-hint">Glisează pentru galerie · apropie două degete pentru zoom</span></p>
      </footer>
    </section>`;
  document.body.append(viewer);

  const dialog = viewer.querySelector(".product-image-viewer__dialog");
  const viewport = viewer.querySelector("[data-viewer-viewport]");
  const transformLayer = viewer.querySelector("[data-viewer-transform]");
  const viewerArt = viewer.querySelector("[data-viewer-art]");
  const indexLabel = viewer.querySelector("[data-viewer-index]");
  const zoomLabel = viewer.querySelector("[data-viewer-zoom]");
  const dots = viewer.querySelector("[data-viewer-dots]");
  const previousButton = viewer.querySelector("[data-viewer-previous]");
  const nextButton = viewer.querySelector("[data-viewer-next]");
  const zoomOutButton = viewer.querySelector("[data-viewer-zoom-out]");
  const zoomInButton = viewer.querySelector("[data-viewer-zoom-in]");
  const resetButton = viewer.querySelector("[data-viewer-reset]");
  const closeButton = viewer.querySelector(".product-image-viewer__close");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobileViewer = window.matchMedia("(max-width: 700px)");
  const pointers = new Map();
  let viewerIndex = 0;
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let gesture = null;
  let lastTap = 0;
  let returnFocus = null;
  let closeTimer = 0;

  galleryViews.forEach((view, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("aria-label", `Arată imaginea ${index + 1}`);
    dot.dataset.viewerDot = String(index);
    dot.addEventListener("click", () => setViewerSlide(index));
    dots.append(dot);
  });

  viewer.classList.toggle("has-single-image", galleryViews.length < 2);

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function clampPan() {
    const rect = viewport.getBoundingClientRect();
    const maxX = Math.max(0, rect.width * (scale - 1) * 0.5);
    const maxY = Math.max(0, rect.height * (scale - 1) * 0.5);
    panX = clamp(panX, -maxX, maxX);
    panY = clamp(panY, -maxY, maxY);
  }

  function renderTransform(animate = false) {
    clampPan();
    transformLayer.classList.toggle("is-animated", animate && !reduceMotion.matches);
    transformLayer.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`;
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    zoomOutButton.disabled = scale <= 1;
    zoomInButton.disabled = scale >= 4;
    viewport.classList.toggle("is-zoomed", scale > 1.01);
  }

  function resetZoom(animate = true) {
    scale = 1;
    panX = 0;
    panY = 0;
    renderTransform(animate);
  }

  function changeZoom(nextScale, animate = true) {
    scale = clamp(nextScale, 1, 4);
    if (scale === 1) {
      panX = 0;
      panY = 0;
    }
    renderTransform(animate);
  }

  function setViewerSlide(index) {
    viewerIndex = (index + galleryViews.length) % galleryViews.length;
    const view = galleryViews[viewerIndex];
    viewerArt.classList.remove("gallery-view-profile", "gallery-view-tread");
    if (view !== "full") viewerArt.classList.add(`gallery-view-${view}`);
    indexLabel.textContent = String(viewerIndex + 1);
    [...dots.children].forEach((dot, dotIndex) => {
      const active = dotIndex === viewerIndex;
      dot.classList.toggle("active", active);
      dot.setAttribute("aria-current", active ? "true" : "false");
    });
    showGalleryView(viewerIndex);
    resetZoom(false);
  }

  function openViewer(trigger) {
    window.clearTimeout(closeTimer);
    returnFocus = trigger;
    viewer.hidden = false;
    document.body.classList.add("image-viewer-open");
    setViewerSlide(activeGalleryIndex);
    requestAnimationFrame(() => viewer.classList.add("is-open"));
    closeButton.focus({ preventScroll: true });
  }

  function closeViewer() {
    if (viewer.hidden) return;
    viewer.classList.remove("is-open");
    document.body.classList.remove("image-viewer-open");
    pointers.clear();
    resetZoom(false);
    const finish = () => {
      viewer.hidden = true;
      returnFocus?.focus?.({ preventScroll: true });
    };
    if (reduceMotion.matches) finish();
    else closeTimer = window.setTimeout(finish, 190);
  }

  function midpoint(first, second) {
    return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  }

  function distance(first, second) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function beginGesture() {
    const points = [...pointers.values()];
    if (points.length === 1) {
      gesture = {
        type: "single",
        startX: points[0].x,
        startY: points[0].y,
        panX,
        panY,
        moved: false
      };
    } else if (points.length >= 2) {
      const center = midpoint(points[0], points[1]);
      gesture = {
        type: "pinch",
        distance: Math.max(1, distance(points[0], points[1])),
        center,
        scale,
        panX,
        panY
      };
    }
  }

  viewport.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    viewport.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    beginGesture();
  });

  viewport.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.values()];

    if (points.length >= 2) {
      if (gesture?.type !== "pinch") beginGesture();
      const center = midpoint(points[0], points[1]);
      const nextScale = clamp(gesture.scale * (distance(points[0], points[1]) / gesture.distance), 1, 4);
      scale = nextScale;
      panX = gesture.panX + center.x - gesture.center.x;
      panY = gesture.panY + center.y - gesture.center.y;
      renderTransform(false);
      return;
    }

    if (!gesture || gesture.type !== "single") beginGesture();
    const deltaX = points[0].x - gesture.startX;
    const deltaY = points[0].y - gesture.startY;
    gesture.moved = Math.abs(deltaX) > 7 || Math.abs(deltaY) > 7;
    if (scale > 1.01) {
      panX = gesture.panX + deltaX;
      panY = gesture.panY + deltaY;
      renderTransform(false);
    }
  });

  function finishPointer(event) {
    if (!pointers.has(event.pointerId)) return;
    const point = pointers.get(event.pointerId);
    const endedGesture = gesture;
    const pointerCount = pointers.size;
    pointers.delete(event.pointerId);

    if (pointerCount === 1 && endedGesture?.type === "single") {
      const deltaX = point.x - endedGesture.startX;
      const deltaY = point.y - endedGesture.startY;
      if (scale <= 1.01 && galleryViews.length > 1 && Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
        setViewerSlide(viewerIndex + (deltaX < 0 ? 1 : -1));
      } else if (!endedGesture.moved) {
        const now = Date.now();
        if (now - lastTap < 300) changeZoom(scale > 1.01 ? 1 : 2);
        lastTap = now;
      }
    }

    if (pointers.size) beginGesture();
    else gesture = null;
  }

  viewport.addEventListener("pointerup", finishPointer);
  viewport.addEventListener("pointercancel", finishPointer);
  viewport.addEventListener("wheel", event => {
    event.preventDefault();
    changeZoom(scale + (event.deltaY < 0 ? 0.25 : -0.25), false);
  }, { passive: false });

  openButton.addEventListener("click", () => openViewer(openButton));
  image.addEventListener("click", () => {
    if (mobileViewer.matches) openViewer(image);
  });
  previousButton.addEventListener("click", () => setViewerSlide(viewerIndex - 1));
  nextButton.addEventListener("click", () => setViewerSlide(viewerIndex + 1));
  zoomOutButton.addEventListener("click", () => changeZoom(scale - 0.5));
  zoomInButton.addEventListener("click", () => changeZoom(scale + 0.5));
  resetButton.addEventListener("click", () => resetZoom());
  viewer.querySelectorAll("[data-viewer-close]").forEach(button => button.addEventListener("click", closeViewer));

  document.addEventListener("keydown", event => {
    if (viewer.hidden) return;
    if (event.key === "Escape") closeViewer();
    else if (event.key === "ArrowLeft") setViewerSlide(viewerIndex - 1);
    else if (event.key === "ArrowRight") setViewerSlide(viewerIndex + 1);
    else if (event.key === "+" || event.key === "=") changeZoom(scale + 0.5);
    else if (event.key === "-") changeZoom(scale - 0.5);
    else return;
    event.preventDefault();
  });

  window.addEventListener("resize", () => {
    if (!viewer.hidden) renderTransform(false);
  });

  dialog.addEventListener("click", event => event.stopPropagation());
  renderTransform(false);
}

initializeProductImageViewer();

const quantityInput = document.querySelector("[data-product-quantity]");
const quantityMinus = document.querySelector("[data-quantity-minus]");
const quantityPlus = document.querySelector("[data-quantity-plus]");
const productAddCart = document.querySelector("[data-product-add-cart]");
const cartFeedback = document.querySelector("[data-cart-feedback]");

function normalizeQuantity(value) {
  const min = Number(quantityInput?.min || 1);
  const max = Number(quantityInput?.max || 10);
  return Math.min(max, Math.max(min, Number.parseInt(value, 10) || min));
}

function setQuantity(value) {
  if (quantityInput) quantityInput.value = String(normalizeQuantity(value));
}

quantityMinus?.addEventListener("click", () => setQuantity(Number(quantityInput?.value || 1) - 1));
quantityPlus?.addEventListener("click", () => setQuantity(Number(quantityInput?.value || 1) + 1));
quantityInput?.addEventListener("change", () => setQuantity(quantityInput.value));

productAddCart?.addEventListener("click", () => {
  const cartApi = window.GTrotsCart;
  if (!cartApi) return;
  const quantity = normalizeQuantity(quantityInput?.value || 1);
  const existing = cartApi.get().find(item => item.id === productId);
  if (existing) cartApi.changeQuantity(productId, quantity);
  else {
    cartApi.add(productId);
    if (quantity > 1) cartApi.changeQuantity(productId, quantity - 1);
  }

  const buttonText = productAddCart.querySelector("strong");
  productAddCart.classList.add("is-confirmed");
  if (buttonText) buttonText.textContent = "Adăugat în coș";
  if (cartFeedback) cartFeedback.textContent = `${quantity} ${quantity === 1 ? "produs a fost adăugat" : "produse au fost adăugate"} în coș.`;

  window.setTimeout(() => {
    productAddCart.classList.remove("is-confirmed");
    if (buttonText) buttonText.textContent = "Adaugă în coș";
  }, 1800);
});

const productTabs = [...document.querySelectorAll("[data-product-tab]")];
const productSections = productTabs
  .map(tab => document.querySelector(tab.getAttribute("href")))
  .filter(Boolean);

document.querySelectorAll('a[href^="#"]:not([data-product-tab])').forEach(link => {
  link.addEventListener("click", event => {
    const selector = link.getAttribute("href");
    const target = selector && selector.length > 1 ? document.querySelector(selector) : null;
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start"
    });
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}${selector}`);
  });
});

productTabs.forEach(tab => {
  tab.addEventListener("click", event => {
    const target = document.querySelector(tab.getAttribute("href"));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}${tab.getAttribute("href")}`);
  });
});

if ("IntersectionObserver" in window && productSections.length) {
  const sectionObserver = new IntersectionObserver(entries => {
    const visible = entries
      .filter(entry => entry.isIntersecting)
      .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];
    if (!visible) return;
    productTabs.forEach(tab => tab.classList.toggle("active", tab.getAttribute("href") === `#${visible.target.id}`));
  }, { rootMargin: "-28% 0px -58%", threshold: [0.05, 0.25, 0.5] });
  productSections.forEach(section => sectionObserver.observe(section));
}

const expandableSections = [...document.querySelectorAll("[data-expand-section]")];

function syncExpandableSection(section) {
  const shell = section.querySelector("[data-expand-shell]");
  const content = section.querySelector("[data-expand-content]");
  const toggle = section.querySelector("[data-expand-toggle]");
  if (!shell || !content || !toggle) return;

  shell.style.setProperty("--product-expanded-height", `${content.scrollHeight}px`);
  const isSpecifications = section.id === "specificatii" && content.querySelector(".product-spec-groups dl > div");
  const isCollapsible = content.scrollHeight > shell.clientHeight + 2 || Boolean(isSpecifications && content.scrollHeight >= shell.clientHeight - 4) || section.classList.contains("is-expanded");
  section.classList.toggle("is-not-collapsible", !isCollapsible);
  toggle.hidden = !isCollapsible;
}

expandableSections.forEach(section => {
  const toggle = section.querySelector("[data-expand-toggle]");
  const label = toggle?.querySelector("span");
  if (!toggle) return;

  toggle.addEventListener("click", () => {
    const expanded = !section.classList.contains("is-expanded");
    syncExpandableSection(section);
    section.classList.toggle("is-expanded", expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
    if (label) label.textContent = expanded ? "Vezi mai puțin" : "Vezi mai mult";

    if (!expanded) {
      window.setTimeout(() => {
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!reducedMotion && section.getBoundingClientRect().top < 0) {
          section.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 180);
    }
  });

  syncExpandableSection(section);
});

window.GTrotsSyncExpandableSections = () => expandableSections.forEach(syncExpandableSection);

if ("ResizeObserver" in window && expandableSections.length) {
  const expandResizeObserver = new ResizeObserver(() => expandableSections.forEach(syncExpandableSection));
  expandableSections.forEach(section => {
    const content = section.querySelector("[data-expand-content]");
    if (content) expandResizeObserver.observe(content);
  });
}

function productRoute(id) {
  return `/magazin/produs/${id}/`;
}

function escapeRelatedHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function relatedImageUrl(value) {
  try {
    const url = new URL(String(value || ""), window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function relatedMoney(value) {
  return new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function relatedProductCard([id, item]) {
  const favorites = new Set(window.GTrotsFavorites?.get?.() || []);
  const cart = new Set((window.GTrotsCart?.get?.() || []).map(entry => entry.id));
  const isFavorite = favorites.has(id);
  const isInCart = cart.has(id);
  const badge = item.badge === "Recomandat" ? '<span class="product-badge">Recomandat</span>' : "";
  const brands = item.brands.slice(0, 3).map(brand => `<span>${brand}</span>`).join("");
  const description = escapeRelatedHtml(item.description);

  return `<article class="product-card related-product-card" data-product-id="${id}">
    <div class="product-stage">
      ${badge}
      <div class="product-card-actions">
        <button class="cart-button${isInCart ? " is-added" : ""}" type="button" data-add-cart aria-label="${isInCart ? "Elimină" : "Adaugă"} ${item.name} ${isInCart ? "din" : "în"} coș"><span class="global-cart-icon" aria-hidden="true"><i></i><i></i></span><b aria-hidden="true">${isInCart ? "✓" : "+"}</b></button>
        <button class="favorite-button" type="button" aria-label="${isFavorite ? "Elimină" : "Adaugă"} ${item.name} ${isFavorite ? "din" : "la"} favorite" aria-pressed="${isFavorite}">${isFavorite ? "♥" : "♡"}</button>
      </div>
      <div class="product-image product-image-${item.image}" role="img" aria-label="${item.name}"></div>
      <span class="product-quick-note"><i></i>${item.stock}</span>
    </div>
    <div class="product-info">
      <span class="product-category"><i></i>${escapeRelatedHtml(item.category)}</span>
      <h3>${escapeRelatedHtml(item.name)}</h3>
      <div class="product-summary" tabindex="0" aria-label="Pe scurt: ${description}">
        <span class="product-summary-badge"><i aria-hidden="true"></i>Pe scurt</span>
        <p>${description}</p>
        <span class="product-summary-tooltip" aria-hidden="true">${description}</span>
      </div>
      <div class="product-fit">${brands}</div>
    </div>
    <div class="product-bottom">
      <div class="product-price"><small>Preț</small><strong>${item.price.replace(" lei", "")} <span>lei</span></strong></div>
      <span class="product-open-hint" aria-hidden="true">›</span>
    </div>
    <a class="product-card-link" href="${productRoute(id)}" aria-label="Deschide pagina produsului ${item.name}"></a>
  </article>`;
}

function relatedLiveProductCard(product) {
  const id = String(product.slug || product.id || "");
  const favorites = new Set(window.GTrotsFavorites?.get?.() || []);
  const cart = new Set((window.GTrotsCart?.get?.() || []).map(entry => entry.id));
  const isFavorite = favorites.has(id);
  const isInCart = cart.has(id);
  const legacyImage = Number(product.images?.[0]?.sprite_index || ({
    "anvelopa-g10-all-terrain": 1,
    "display-smart-ride-s3": 2,
    "incarcator-fastcharge-54-6v": 3,
    "motor-dualhub-x2-2000w": 4,
    "baterie-powercore-52v-23ah": 5,
    "kit-frana-hydrostop-pro": 6
  })[id] || 0);
  const imageUrl = product.images?.[0]?.sprite_index ? "" : relatedImageUrl(product.images?.[0]?.url);
  const imageClasses = `product-image${legacyImage ? ` product-image-${legacyImage}` : ""}${imageUrl ? " product-image-live" : ""}`;
  const imageStyle = imageUrl ? ` style="background-image:url('${escapeRelatedHtml(imageUrl)}')"` : "";
  const brands = Array.isArray(product.brands) ? product.brands.map(brand => String(brand.name || "")).filter(Boolean) : [];
  const label = brands[0] || String(product.manufacturer_name || "").trim() || String(product.category_name || "Produs G-Trots");
  const brandBadges = brands.slice(0, 4).map(brand => `<span>${escapeRelatedHtml(brand)}</span>`).join("");
  const description = escapeRelatedHtml(product.short_description || "Produs disponibil în magazinul G-Trots.");
  const standardPrice = Number(product.price || 0);
  const currentPrice = product.sale_price == null ? standardPrice : Number(product.sale_price || 0);
  const oldPrice = product.sale_price == null ? "" : `<del>${relatedMoney(standardPrice)} lei</del>`;
  const discount = product.sale_price == null || standardPrice <= 0 ? 0 : Math.max(0, Math.round((1 - currentPrice / standardPrice) * 100));
  const discountBadge = discount ? `<em class="product-discount">-${discount}%</em>` : "";
  const stockQuantity = Number(product.stock_quantity || 0);
  const stockLabel = product.stock_mode === "unlimited" ? "În stoc" : stockQuantity <= 0 ? "Stoc epuizat" : stockQuantity <= Number(product.low_stock_threshold || 3) ? "Stoc limitat" : "În stoc";
  const stockClass = stockLabel === "Stoc epuizat" ? " is-out" : stockLabel === "Stoc limitat" ? " is-low" : "";

  return `<article class="product-card related-product-card live-product-card" data-product-id="${escapeRelatedHtml(id)}" data-api-product-id="${escapeRelatedHtml(product.id)}">
    <div class="product-stage">
      <div class="product-card-actions">
        <button class="cart-button${isInCart ? " is-added" : ""}" type="button" data-add-cart aria-label="${isInCart ? "Elimină" : "Adaugă"} ${escapeRelatedHtml(product.name)} ${isInCart ? "din" : "în"} coș"><span class="global-cart-icon" aria-hidden="true"><i></i><i></i></span><b aria-hidden="true">${isInCart ? "✓" : "+"}</b></button>
        <button class="favorite-button" type="button" aria-label="${isFavorite ? "Elimină" : "Adaugă"} ${escapeRelatedHtml(product.name)} ${isFavorite ? "din" : "la"} favorite" aria-pressed="${isFavorite}">${isFavorite ? "♥" : "♡"}</button>
      </div>
      <div class="${imageClasses}"${imageStyle} role="img" aria-label="${escapeRelatedHtml(product.name)}"></div>
      <span class="product-quick-note${stockClass}"><i></i>${stockLabel}</span>
    </div>
    <div class="product-info">
      <span class="product-category"><i></i>${escapeRelatedHtml(label)}</span>
      <h3>${escapeRelatedHtml(product.name)}</h3>
      <div class="product-summary" tabindex="0" aria-label="Pe scurt: ${description}">
        <span class="product-summary-badge"><i aria-hidden="true"></i>Pe scurt</span>
        <p>${description}</p>
        <span class="product-summary-tooltip" aria-hidden="true">${description}</span>
      </div>
      ${brandBadges ? `<div class="product-fit" aria-label="Mărci compatibile">${brandBadges}</div>` : ""}
    </div>
    <div class="product-bottom">
      <div class="product-price"><small>${product.sale_price == null ? "Preț" : "Preț promoțional"}</small><strong>${relatedMoney(currentPrice)} <span>lei</span></strong>${oldPrice}</div>
      <div class="product-bottom-action">${discountBadge}<span class="product-open-hint" aria-hidden="true">›</span></div>
    </div>
    <a class="product-card-link" href="${productRoute(encodeURIComponent(id))}" aria-label="Deschide pagina produsului ${escapeRelatedHtml(product.name)}"></a>
  </article>`;
}

function renderRelatedProducts() {
  if (document.querySelector("[data-related-products]")) return;
  const entries = Object.entries(products);
  const currentIndex = Math.max(0, entries.findIndex(([id]) => id === productId));
  const recommendations = [];
  for (let offset = 1; offset < entries.length && recommendations.length < 3; offset += 1) {
    recommendations.push(entries[(currentIndex + offset) % entries.length]);
  }
  if (!recommendations.length) return;

  const section = document.createElement("section");
  section.className = "related-products-section shell";
  section.dataset.relatedProducts = "";
  section.setAttribute("aria-labelledby", "related-products-title");
  section.innerHTML = `<div class="related-products-heading"><div><span>Recomandări G-Trots</span><h2 id="related-products-title">S-ar putea să îți placă și…</h2></div><a href="/magazin.html#catalog">Vezi toate produsele <b aria-hidden="true">›</b></a></div><div class="related-products-grid" data-related-track>${recommendations.map(relatedProductCard).join("")}</div><nav class="related-carousel-controls" aria-label="Navigare produse recomandate"><button type="button" data-related-previous aria-label="Produsul recomandat anterior">‹</button><div class="related-carousel-dots" data-related-dots></div><button type="button" data-related-next aria-label="Următorul produs recomandat">›</button></nav>`;

  const questions = document.querySelector("#intrebari");
  if (questions) questions.insertAdjacentElement("afterend", section);
  else document.querySelector("main")?.append(section);

  initializeRelatedCarousel(section);
}

function updateRelatedProductsFromLive(liveProducts) {
  const section = document.querySelector("[data-related-products]");
  if (!section || !Array.isArray(liveProducts)) return;
  const rows = liveProducts.map(item => item?.raw || item).filter(item => item && (item.slug || item.id));
  const current = rows.find(item => String(item.slug || item.id) === productId);
  const currentBrands = new Set((current?.brands || []).map(brand => String(brand.id || brand.slug || brand.name || "")).filter(Boolean));
  const recommendations = rows
    .filter(item => String(item.slug || item.id) !== productId)
    .map((item, index) => {
      const brands = (item.brands || []).map(brand => String(brand.id || brand.slug || brand.name || "")).filter(Boolean);
      const sharedBrand = brands.some(brand => currentBrands.has(brand));
      const sameCategory = current?.category_id && item.category_id === current.category_id;
      return { item, index, score: (sameCategory ? 6 : 0) + (sharedBrand ? 3 : 0) + (item.is_featured ? 1 : 0) };
    })
    .sort((first, second) => second.score - first.score || first.index - second.index)
    .slice(0, 3)
    .map(entry => entry.item);
  if (!recommendations.length) return;

  const oldTrack = section.querySelector("[data-related-track]");
  const track = document.createElement("div");
  track.className = "related-products-grid";
  track.dataset.relatedTrack = "";
  track.innerHTML = recommendations.map(relatedLiveProductCard).join("");
  oldTrack?.replaceWith(track);

  const oldControls = section.querySelector(".related-carousel-controls");
  const controls = document.createElement("nav");
  controls.className = "related-carousel-controls";
  controls.setAttribute("aria-label", "Navigare produse recomandate");
  controls.innerHTML = '<button type="button" data-related-previous aria-label="Produsul recomandat anterior">‹</button><div class="related-carousel-dots" data-related-dots></div><button type="button" data-related-next aria-label="Următorul produs recomandat">›</button>';
  oldControls?.replaceWith(controls);
  initializeRelatedCarousel(section);
}

function initializeRelatedCarousel(section) {
  const track = section.querySelector("[data-related-track]");
  const cards = [...section.querySelectorAll(".related-product-card")];
  const previous = section.querySelector("[data-related-previous]");
  const next = section.querySelector("[data-related-next]");
  const dotsContainer = section.querySelector("[data-related-dots]");
  if (!track || !cards.length || !dotsContainer) return;

  let activeIndex = 0;
  let scrollFrame = 0;
  const dots = cards.map((_, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("aria-label", `Vezi recomandarea ${index + 1}`);
    dot.addEventListener("click", () => goToRelatedProduct(index));
    return dot;
  });
  dotsContainer.replaceChildren(...dots);

  function updateRelatedControls(index) {
    activeIndex = Math.max(0, Math.min(index, cards.length - 1));
    dots.forEach((dot, dotIndex) => dot.setAttribute("aria-current", dotIndex === activeIndex ? "true" : "false"));
    if (previous) previous.disabled = activeIndex === 0;
    if (next) next.disabled = activeIndex === cards.length - 1;
  }

  function goToRelatedProduct(index) {
    const targetIndex = Math.max(0, Math.min(index, cards.length - 1));
    const target = cards[targetIndex];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior: reducedMotion ? "auto" : "smooth" });
    updateRelatedControls(targetIndex);
  }

  previous?.addEventListener("click", () => goToRelatedProduct(activeIndex - 1));
  next?.addEventListener("click", () => goToRelatedProduct(activeIndex + 1));
  track.addEventListener("scroll", () => {
    window.cancelAnimationFrame(scrollFrame);
    scrollFrame = window.requestAnimationFrame(() => {
      const trackLeft = track.getBoundingClientRect().left;
      const nearest = cards.reduce((best, card, index) => {
        const distance = Math.abs(card.getBoundingClientRect().left - trackLeft);
        return distance < best.distance ? { index, distance } : best;
      }, { index: 0, distance: Number.POSITIVE_INFINITY });
      updateRelatedControls(nearest.index);
    });
  }, { passive: true });

  updateRelatedControls(0);
}

renderRelatedProducts();
document.addEventListener("g-trots:live-products", event => updateRelatedProductsFromLive(event.detail));

const productTabsBar = document.querySelector(".product-content-tabs");
const relatedProductsSection = document.querySelector("[data-related-products]");
let tabsScrollFrame = 0;

function updateProductTabsRange() {
  if (!productTabsBar || !relatedProductsSection) return;
  const relatedTop = relatedProductsSection.getBoundingClientRect().top;
  const stickyTop = Number.parseFloat(getComputedStyle(productTabsBar).top) || 0;
  const desktopLimit = stickyTop + productTabsBar.offsetHeight;
  const mobileLimit = window.innerHeight * 0.58;
  const isPastProductContent = relatedTop <= (window.innerWidth <= 700 ? mobileLimit : desktopLimit);
  productTabsBar.classList.toggle("is-past-product-content", isPastProductContent);
  productTabsBar.setAttribute("aria-hidden", String(isPastProductContent));
  productTabsBar.toggleAttribute("inert", isPastProductContent);
}

if (productTabsBar && relatedProductsSection) {
  const scheduleTabsRangeUpdate = () => {
    window.cancelAnimationFrame(tabsScrollFrame);
    tabsScrollFrame = window.requestAnimationFrame(updateProductTabsRange);
  };
  window.addEventListener("scroll", scheduleTabsRangeUpdate, { passive: true });
  window.addEventListener("resize", scheduleTabsRangeUpdate);
  updateProductTabsRange();
}

const REVIEW_STORAGE_KEY = "g-trots-product-reviews-v1";
const reviewForm = document.querySelector("[data-review-form]");
const reviewList = document.querySelector("[data-review-list]");
const reviewsEmpty = document.querySelector("[data-reviews-empty]");
const reviewCompose = document.querySelector("[data-review-compose]");
const reviewClose = document.querySelector("[data-review-close]");
const reviewPagination = document.querySelector("[data-review-pagination]");
const reviewPrevious = document.querySelector("[data-review-previous]");
const reviewNext = document.querySelector("[data-review-next]");
const reviewDots = document.querySelector("[data-review-dots]");
const ratingChoice = reviewForm?.querySelector(".rating-choice");
const ratingInputs = ratingChoice ? [...ratingChoice.querySelectorAll('input[name="rating"]')] : [];
const REVIEWS_PER_PAGE = 2;
let currentReviewPage = 1;

function paintRatingChoice(value) {
  const selectedValue = Number(value) || 0;
  ratingInputs.forEach(input => {
    input.closest("label")?.classList.toggle("is-active", Number(input.value) <= selectedValue);
  });
}

function syncRatingChoice() {
  paintRatingChoice(ratingInputs.find(input => input.checked)?.value || 0);
}

ratingInputs.forEach(input => {
  const label = input.closest("label");
  input.addEventListener("change", syncRatingChoice);
  input.addEventListener("focus", () => paintRatingChoice(input.value));
  label?.addEventListener("mouseenter", () => paintRatingChoice(input.value));
});

ratingChoice?.addEventListener("mouseleave", syncRatingChoice);
ratingChoice?.addEventListener("focusout", () => {
  window.setTimeout(() => {
    if (!ratingChoice.contains(document.activeElement)) syncRatingChoice();
  }, 0);
});

function readAllReviews() {
  try {
    const saved = JSON.parse(localStorage.getItem(REVIEW_STORAGE_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

function readProductReviews() {
  const reviews = readAllReviews()[productId];
  return Array.isArray(reviews) ? reviews : [];
}

function writeProductReviews(reviews) {
  const allReviews = readAllReviews();
  allReviews[productId] = reviews;
  try {
    localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(allReviews));
  } catch {
    // Pagina rămâne funcțională și când stocarea locală este blocată.
  }
}

function createReviewElement(review) {
  const article = document.createElement("article");
  article.className = "review-item";
  const header = document.createElement("header");
  const name = document.createElement("strong");
  const stars = document.createElement("span");
  const message = document.createElement("p");
  const date = document.createElement("small");
  name.textContent = review.name;
  stars.textContent = `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}`;
  message.textContent = review.message;
  date.textContent = `Salvat pe acest dispozitiv · ${new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "long", year: "numeric" }).format(new Date(review.date))}`;
  header.append(name, stars);
  article.append(header, message, date);
  return article;
}

function reviewPageWindow(totalPages) {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const start = Math.max(1, Math.min(currentReviewPage - 2, totalPages - 4));
  return Array.from({ length: 5 }, (_, index) => start + index);
}

function renderReviewPagination(totalReviews) {
  if (!reviewPagination || !reviewDots) return;
  const totalPages = Math.max(1, Math.ceil(totalReviews / REVIEWS_PER_PAGE));
  currentReviewPage = Math.min(Math.max(1, currentReviewPage), totalPages);
  reviewPagination.hidden = totalPages <= 1;
  if (reviewPrevious) reviewPrevious.disabled = currentReviewPage === 1;
  if (reviewNext) reviewNext.disabled = currentReviewPage === totalPages;

  const dots = reviewPageWindow(totalPages).map(page => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "review-page-dot";
    dot.setAttribute("aria-label", `Pagina ${page} de recenzii`);
    dot.setAttribute("aria-current", page === currentReviewPage ? "page" : "false");
    dot.addEventListener("click", () => {
      currentReviewPage = page;
      renderReviews();
    });
    return dot;
  });
  reviewDots.replaceChildren(...dots);
}

function renderReviews() {
  const reviews = readProductReviews();
  const count = reviews.length;
  const average = count ? reviews.reduce((sum, review) => sum + review.rating, 0) / count : 0;
  const countLabel = count === 1 ? "1 recenzie" : `${count} recenzii`;

  document.querySelectorAll("[data-review-count]").forEach(element => { element.textContent = `(${count})`; });
  document.querySelectorAll("[data-review-average]").forEach(element => { element.textContent = count ? average.toFixed(1).replace(".", ",") : "—"; });
  document.querySelectorAll("[data-review-stars], [data-review-meta] > span").forEach(element => {
    const stars = Array.from({ length: 5 }, (_, index) => {
      const star = document.createElement("i");
      const fill = count ? Math.min(1, Math.max(0, average - index)) * 100 : 0;
      star.textContent = "★";
      star.style.setProperty("--review-star-fill", `${fill}%`);
      return star;
    });
    element.classList.add("review-stars-meter");
    element.replaceChildren(...stars);
  });
  document.querySelectorAll("[data-review-summary-text]").forEach(element => { element.textContent = count ? countLabel : "Nicio recenzie încă"; });
  document.querySelectorAll("[data-review-link-text]").forEach(element => { element.textContent = count ? countLabel : "Fii primul care scrie o recenzie"; });
  document.querySelectorAll("[data-review-meta]").forEach(element => { element.hidden = count === 0; });

  for (let rating = 1; rating <= 5; rating += 1) {
    const ratingCount = reviews.filter(review => review.rating === rating).length;
    const percentage = count ? (ratingCount / count) * 100 : 0;
    const bar = document.querySelector(`[data-rating-bar="${rating}"]`);
    const label = document.querySelector(`[data-rating-count="${rating}"]`);
    if (bar) bar.style.width = `${percentage}%`;
    if (label) label.textContent = String(ratingCount);
  }

  const orderedReviews = reviews.slice().reverse();
  const totalPages = Math.max(1, Math.ceil(count / REVIEWS_PER_PAGE));
  currentReviewPage = Math.min(Math.max(1, currentReviewPage), totalPages);
  const firstReview = (currentReviewPage - 1) * REVIEWS_PER_PAGE;
  const pageReviews = orderedReviews.slice(firstReview, firstReview + REVIEWS_PER_PAGE);
  if (reviewList) reviewList.replaceChildren(...pageReviews.map(createReviewElement));
  if (reviewsEmpty) reviewsEmpty.hidden = count > 0;
  renderReviewPagination(count);
}

function setReviewFormOpen(open) {
  if (!reviewForm) return;
  reviewForm.hidden = !open;
  if (open) reviewForm.querySelector('input[name="rating"]')?.focus();
}

reviewCompose?.addEventListener("click", () => setReviewFormOpen(true));
reviewClose?.addEventListener("click", () => setReviewFormOpen(false));
reviewPrevious?.addEventListener("click", () => {
  if (currentReviewPage <= 1) return;
  currentReviewPage -= 1;
  renderReviews();
});
reviewNext?.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(readProductReviews().length / REVIEWS_PER_PAGE));
  if (currentReviewPage >= totalPages) return;
  currentReviewPage += 1;
  renderReviews();
});

reviewForm?.addEventListener("submit", event => {
  event.preventDefault();
  const formData = new FormData(reviewForm);
  const rating = Math.min(5, Math.max(1, Number.parseInt(formData.get("rating"), 10) || 0));
  const name = String(formData.get("name") || "").trim();
  const message = String(formData.get("message") || "").trim();
  if (!name || message.length < 20 || rating > 5) return;
  const reviews = readProductReviews();
  reviews.push({ name, message, rating, date: new Date().toISOString() });
  writeProductReviews(reviews);
  currentReviewPage = 1;
  reviewForm.reset();
  syncRatingChoice();
  setReviewFormOpen(false);
  renderReviews();
});

showGalleryView(0);
syncRatingChoice();
renderReviews();
