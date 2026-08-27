(() => {
  if (window.GTrotsFavorites) return;

  const STORAGE_KEY = "g-trots-favorite-products-v1";
  const CART_STORAGE_KEY = "g-trots-cart-products-v1";
  const CUSTOMER_TOKEN_KEY = "g-trots-customer-session-v1";
  const CUSTOMER_PROFILE_KEY = "g-trots-customer-profile-v1";
  const SHOP_API_URL = "https://g-trots.ro/shop-api/api-v2.php";
  // Catalogul real este singura sursă. Nu randăm produse demonstrative cât timp API-ul răspunde.
  const PRODUCTS = {};
  let catalogReady = false;
  let activeCartPromotionQuote = { subtotal: 0, discount_total: 0, promotion_code: "", promotion_title: "" };
  let cartPromotionQuoteSequence = 0;
  let cartPromotionSignature = "";

  function safeImageUrl(value) {
    try {
      const raw = String(value || "").trim();
      if (!raw) return "";
      const url = new URL(raw, window.location.origin);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function productImageMarkup(product, className = "favorite-product-image") {
    const imageUrl = safeImageUrl(product.imageUrl);
    const legacyClass = Number(product.image) > 0 ? ` favorite-product-image-${Number(product.image)}` : "";
    const style = imageUrl ? ` style="background-image:url('${escapeHtml(imageUrl)}')"` : "";
    return `<div class="${className}${legacyClass}${imageUrl ? " is-live-image" : ""}"${style} role="img" aria-label="${escapeHtml(product.name)}"></div>`;
  }

  function registerProducts(rows, options = {}) {
    if (!Array.isArray(rows)) return;
    if (options.authoritative) {
      Object.keys(PRODUCTS).forEach(id => delete PRODUCTS[id]);
      catalogReady = true;
    }
    rows.forEach(product => {
      const id = String(product?.id || product?.slug || "").trim();
      if (!id) return;
      PRODUCTS[id] = {
        ...PRODUCTS[id],
        ...product,
        id,
        name: String(product.name || PRODUCTS[id]?.name || "Produs G-Trots"),
        category: String(product.category || PRODUCTS[id]?.category || "Produs G-Trots"),
        description: String(product.description || PRODUCTS[id]?.description || ""),
        price: String(product.price || PRODUCTS[id]?.price || "0,00 lei"),
        stock: String(product.stock || PRODUCTS[id]?.stock || "În stoc"),
        url: String(product.url || PRODUCTS[id]?.url || `/magazin/produs/${encodeURIComponent(id)}/`),
        imageUrl: safeImageUrl(product.imageUrl || PRODUCTS[id]?.imageUrl)
      };
    });
    refresh();
  }

  function ensureStyles() {
    const version = "20260828-brand-final";
    const existing = document.querySelector('link[href*="favorites.css"]');
    if (existing) {
      const url = new URL(existing.href, window.location.href);
      if (url.searchParams.get("ui") !== version) {
        url.searchParams.set("ui", version);
        existing.href = url.toString();
      }
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `/favorites.css?v=20260828-global-cart-count&ui=${version}`;
    document.head.append(link);
  }

  function refreshArticleStyles() {
    document.querySelectorAll('link[rel="stylesheet"][href*="seo-pages-v6.css"]').forEach(link => {
      const url = new URL(link.href, window.location.href);
      const version = "20260828-article-layout-v2";
      if (url.searchParams.get("ui") === version) return;
      url.searchParams.set("ui", version);
      link.href = url.toString();
    });
  }

  function ensurePromotionLayer() {
    if (!document.querySelector('link[href*="promotions.css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/promotions.css?v=20260828-sticky-cart";
      document.head.append(link);
    }
    if (!document.querySelector('script[src*="promotions.js"]')) {
      const script = document.createElement("script");
      script.src = "/promotions.js?v=20260828-sticky-cart";
      script.defer = true;
      document.head.append(script);
    }
  }

  function ensureCabItCredit() {
    const footer = document.querySelector("footer .footer-inner");
    if (!footer || footer.querySelector(".cab-it-credit")) return;

    const credit = document.createElement("a");
    credit.className = "cab-it-credit";
    credit.href = "https://cab-it.ro/";
    credit.target = "_blank";
    credit.rel = "noopener";
    credit.setAttribute("aria-label", "Website realizat de CAB-IT Expert");
    credit.innerHTML = `<span>Designed by</span><img src="https://cab-it.ro/assets/img/brand/cab-it-header-symbol-clean.webp" width="44" height="44" alt="Sigla CAB-IT Expert"><strong>cab-it.ro</strong>`;
    footer.append(credit);
  }

  function readFavorites() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(value)) return [];
      return [...new Set(value.map(id => String(id || "").trim()))]
        .filter(id => id && (!catalogReady || PRODUCTS[id]));
    } catch {
      return [];
    }
  }

  function writeFavorites(ids) {
    const clean = [...new Set(ids.map(id => String(id || "").trim()))]
      .filter(id => id && (!catalogReady || PRODUCTS[id]));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // Pagina rămâne funcțională și atunci când stocarea este blocată.
    }
    document.dispatchEvent(new CustomEvent("g-trots:favorites-changed", { detail: clean }));
    return clean;
  }

  function toggleFavorite(id) {
    const ids = readFavorites();
    const next = ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id];
    writeFavorites(next);
    return next.includes(id);
  }

  function readCart() {
    try {
      const value = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
      if (!Array.isArray(value)) return [];
      const quantities = new Map();
      value.forEach(item => {
        const id = String(typeof item === "string" ? item : item?.id || "").trim();
        if (!id || (catalogReady && !PRODUCTS[id])) return;
        const quantity = typeof item === "string" ? 1 : Math.max(1, Number(item.quantity) || 1);
        quantities.set(id, (quantities.get(id) || 0) + quantity);
      });
      return [...quantities].map(([id, quantity]) => ({ id, quantity }));
    } catch {
      return [];
    }
  }

  function writeCart(items) {
    const clean = items
      .map(item => ({
        id: String(item?.id || "").trim(),
        quantity: Number(item?.quantity)
      }))
      .filter(item => item.id && item.quantity > 0 && (!catalogReady || PRODUCTS[item.id]))
      .map(item => ({ id: item.id, quantity: Math.max(1, item.quantity || 1) }));
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // Coșul rămâne utilizabil în sesiunea curentă dacă stocarea este blocată.
    }
    document.dispatchEvent(new CustomEvent("g-trots:cart-changed", { detail: clean }));
    return clean;
  }

  function addToCart(id) {
    if (!PRODUCTS[id]) return readCart();
    const cart = readCart();
    const existing = cart.find(item => item.id === id);
    if (existing) existing.quantity += 1;
    else cart.push({ id, quantity: 1 });
    return writeCart(cart);
  }

  function toggleCartProduct(id) {
    if (!PRODUCTS[id]) return readCart();
    const cart = readCart();
    const exists = cart.some(item => item.id === id);
    return exists
      ? writeCart(cart.filter(item => item.id !== id))
      : writeCart([...cart, { id, quantity: 1 }]);
  }

  function changeCartQuantity(id, change) {
    const cart = readCart();
    const item = cart.find(entry => entry.id === id);
    if (!item) return cart;
    item.quantity += change;
    return writeCart(cart.filter(entry => entry.quantity > 0));
  }

  function normalizeNavigation() {
    const phoneIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.7 3.3 3.3 4.9 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.4.6 3.6.6.6 0 .9.4.9.9V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.6c.5 0 .9.3.9.8.1 1.3.3 2.5.6 3.6.1.4 0 .8-.3 1.1l-2.2 2.3Z"/></svg>';
    const currentPath = window.location.pathname.toLowerCase();
    const cleanPath = currentPath.replace(/\/+$/, "").replace(/\.html$/, "");
    const favoritesActive = cleanPath.endsWith("/favorite");
    const cartActive = ["/cos", "/checkout", "/plata-finalizata", "/plata-esuata"].some(path => cleanPath.endsWith(path));
    const shopActive = !favoritesActive && !cartActive && /\/(magazin|produs)(?:\/|$)|anvelopa-g10|display-smart|incarcator-fastcharge|motor-dualhub|baterie-powercore|kit-frana/.test(cleanPath);
    const guidesActive = !shopActive && !favoritesActive && !cartActive && currentPath !== "/" && !currentPath.endsWith("/index.html");

    document.querySelectorAll(".main-nav").forEach(nav => {
      nav.setAttribute("aria-label", "Navigație principală");
      nav.innerHTML = `
        <div class="mobile-nav-heading" aria-hidden="true"><span>Meniu</span><small>G-Trots service</small></div>
        <a href="/#servicii">Servicii</a>
        <a class="nav-shop-link${shopActive ? " active" : ""}" href="/magazin.html"${shopActive ? ' aria-current="page"' : ""}><span class="nav-shop-icon" aria-hidden="true"></span><span>Shop</span></a>
        <a href="/ghiduri-service-trotinete-electrice.html"${guidesActive ? ' aria-current="page"' : ""}>Ghiduri</a>
        <a href="/#proces">Cum lucrăm</a>
        <a href="/#intrebari">Întrebări</a>
        <a href="/#contact">Contact</a>
        <a class="mobile-nav-account" href="/login.html" aria-label="Intră în cont sau creează un cont"><span class="mobile-nav-account-avatar" aria-hidden="true"><i></i></span><span class="mobile-nav-account-copy"><small>CONT CLIENT</small><strong>Login</strong></span><b aria-hidden="true">›</b></a>
        <a class="mobile-nav-call" href="tel:+40762093915"><span>${phoneIcon}</span><strong>Sună chiar acum</strong><small>+40 0762 093 915</small></a>`;
    });
  }

  function normalizeHeaderBrand() {
    document.querySelectorAll(".site-header .logo").forEach(logo => {
      logo.href = "/";
      logo.setAttribute("aria-label", "G-Trots, pagina principală");
      if (logo.querySelector("img")) return;
      logo.innerHTML = '<img src="/assets/logo.png" width="1024" height="1024" alt=""><b><span>G</span>-Trots</b>';
    });
  }

  function createFavoriteNav() {
    document.querySelectorAll(".site-header .header-inner").forEach(header => {
      const menuToggle = header.querySelector(".menu-toggle");
      let actions = header.querySelector(".global-shop-actions");
      if (!actions) {
        actions = document.createElement("div");
        actions.className = "global-shop-actions";
        header.insertBefore(actions, menuToggle || null);
      }

      if (!header.querySelector(".global-favorites-nav")) {
        const favoritesLink = document.createElement("a");
        favoritesLink.className = "global-favorites-nav";
        favoritesLink.href = "/favorite.html";
        favoritesLink.setAttribute("aria-label", "Produse favorite, 0 produse salvate");
        if (window.location.pathname.toLowerCase().replace(/\/+$/, "").replace(/\.html$/, "").endsWith("/favorite")) favoritesLink.setAttribute("aria-current", "page");
        favoritesLink.innerHTML = '<span class="global-favorites-heart" aria-hidden="true">♡</span><b data-global-favorites-count>0</b><span class="global-favorites-tooltip" role="tooltip">Produse favorite</span>';
        actions.append(favoritesLink);
      }

      if (!header.querySelector(".global-account-nav")) {
        const accountLink = document.createElement("a");
        accountLink.className = "global-account-nav";
        const activePath = window.location.pathname.toLowerCase().replace(/\/+$/, "").replace(/\.html$/, "");
        if (["/cont", "/login", "/cont-nou"].some(path => activePath.endsWith(path))) accountLink.setAttribute("aria-current", "page");
        actions.prepend(accountLink);
      }
      updateCustomerNavigation();

      if (!header.querySelector(".global-cart-nav")) {
        const cartLink = document.createElement("a");
        cartLink.className = "global-cart-nav";
        cartLink.href = "/cos.html";
        cartLink.setAttribute("aria-label", "Coș de cumpărături, 0 produse");
        const activePath = window.location.pathname.toLowerCase().replace(/\/+$/, "").replace(/\.html$/, "");
        if (["/cos", "/checkout", "/plata-finalizata", "/plata-esuata"].some(path => activePath.endsWith(path))) cartLink.setAttribute("aria-current", "page");
        cartLink.innerHTML = '<span class="global-cart-icon" aria-hidden="true"><i></i><i></i></span><b data-global-cart-count>0</b><span class="global-cart-tooltip" role="tooltip">Coș de cumpărături</span>';
        actions.append(cartLink);
      }
    });

    document.querySelectorAll(".mobile-favorites-link").forEach(link => link.remove());
  }

  function cachedCustomer() {
    try {
      if (!localStorage.getItem(CUSTOMER_TOKEN_KEY)) return null;
      const profile = JSON.parse(localStorage.getItem(CUSTOMER_PROFILE_KEY) || "null");
      return profile && typeof profile === "object" ? profile : null;
    } catch { return null; }
  }

  function updateCustomerNavigation(customer = cachedCustomer()) {
    const loggedIn = Boolean(customer && localStorage.getItem(CUSTOMER_TOKEN_KEY));
    const name = loggedIn ? String(customer.full_name || "Contul meu").trim().split(/\s+/)[0] : "Login";
    document.querySelectorAll(".global-account-nav").forEach(link => {
      link.href = loggedIn ? "/cont.html" : "/login.html";
      link.setAttribute("aria-label", loggedIn ? `Contul lui ${name}` : "Intră în cont sau creează un cont");
      link.innerHTML = `<span class="global-account-avatar" aria-hidden="true"><i></i></span><span class="global-account-copy"><small>${loggedIn ? "Bun venit" : "Cont G-Trots"}</small><strong>${escapeHtml(name)}</strong></span>`;
      link.classList.toggle("is-authenticated", loggedIn);
    });
    document.querySelectorAll(".mobile-nav-account").forEach(link => {
      link.href = loggedIn ? "/cont.html" : "/login.html";
      link.setAttribute("aria-label", loggedIn ? `Deschide contul lui ${name}` : "Intră în cont sau creează un cont");
      link.querySelector("small").textContent = loggedIn ? "CONTUL TĂU" : "CONT G-TROTS";
      link.querySelector("strong").textContent = name;
      link.classList.toggle("is-authenticated", loggedIn);
    });
  }

  function bindMobileMenu() {
    if (!document.body.matches(".favorites-page,.customer-auth-page,.customer-account-page")) return;
    const toggle = document.querySelector(".menu-toggle");
    const nav = document.querySelector(".main-nav");
    if (!toggle || !nav || toggle.dataset.favoritesMenuBound === "true") return;
    toggle.dataset.favoritesMenuBound = "true";
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      document.body.classList.toggle("menu-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Închide meniul" : "Deschide meniul");
    });
    nav.addEventListener("click", event => {
      if (!event.target.closest("a")) return;
      nav.classList.remove("open");
      document.body.classList.remove("menu-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  }

  function productIdForButton(button) {
    if (button.classList.contains("product-detail-favorite")) {
      return document.body.dataset.productId || button.dataset.favoriteId || "";
    }
    return button.dataset.favoriteId || button.closest("[data-product-id]")?.dataset.productId || document.body.dataset.productId || "";
  }

  function updateFavoriteButtons(ids = readFavorites()) {
    document.querySelectorAll(".favorite-button, .product-detail-favorite").forEach(button => {
      const id = productIdForButton(button);
      if (!PRODUCTS[id]) return;
      const active = ids.includes(id);
      button.dataset.favoriteId = id;
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-label", `${active ? "Elimină" : "Adaugă"} ${PRODUCTS[id].name} ${active ? "din" : "la"} favorite`);
      button.textContent = active ? "♥" : "♡";
    });
  }

  function updateCartButtons(cart = readCart()) {
    document.querySelectorAll(".cart-button, [data-add-cart]").forEach(button => {
      const id = productIdForButton(button);
      if (!PRODUCTS[id]) return;
      const quantity = cart.find(item => item.id === id)?.quantity || 0;
      button.classList.toggle("is-added", quantity > 0);
      button.setAttribute("aria-label", `${quantity > 0 ? "Elimină" : "Adaugă"} ${PRODUCTS[id].name} ${quantity > 0 ? "din" : "în"} coș${quantity > 0 ? `, ${quantity} în coș` : ""}`);
      const badge = button.querySelector(":scope > b");
      if (badge) badge.textContent = quantity > 0 ? "✓" : "+";
    });
  }

  function updateFavoriteCounters(ids = readFavorites(), cart = readCart()) {
    const count = ids.length;
    document.querySelectorAll("[data-global-favorites-count]").forEach(element => {
      element.textContent = String(count);
      element.classList.toggle("has-favorites", count > 0);
    });
    document.querySelectorAll(".global-favorites-nav").forEach(link => {
      link.classList.toggle("has-favorites", count > 0);
      link.setAttribute("aria-label", `Produse favorite, ${count} ${count === 1 ? "produs salvat" : "produse salvate"}`);
    });
    document.querySelectorAll("[data-favorites-total]").forEach(element => {
      element.textContent = `${count} ${count === 1 ? "produs" : "produse"}`;
    });

    const cartCount = cart.reduce((total, item) => total + Math.max(1, Number(item?.quantity) || 1), 0);
    document.querySelectorAll("[data-global-cart-count]").forEach(element => {
      element.textContent = String(cartCount);
      element.classList.toggle("has-items", cartCount > 0);
    });
    document.querySelectorAll(".global-cart-nav").forEach(link => {
      link.setAttribute("aria-label", `Coș de cumpărături, ${cartCount} ${cartCount === 1 ? "produs" : "produse"}`);
    });
    document.querySelectorAll("[data-cart-total]").forEach(element => {
      element.textContent = `${cartCount} ${cartCount === 1 ? "produs" : "produse"}`;
    });
  }

  function favoriteCard(id) {
    const product = PRODUCTS[id];
    return `<article class="favorite-product-card" data-favorite-card="${id}">
      <div class="favorite-product-stage">
        ${productImageMarkup(product)}
        <span class="favorite-product-stock"><i></i>${escapeHtml(product.stock)}</span>
      </div>
      <div class="favorite-product-copy">
        <span>${escapeHtml(product.category)}</span>
        <h2>${escapeHtml(product.name)}</h2>
        <p>${escapeHtml(product.description)}</p>
      </div>
      <div class="favorite-product-bottom">
        <strong>${escapeHtml(product.price)}</strong>
        <button class="favorite-remove" type="button" data-remove-favorite="${id}" aria-label="Elimină ${escapeHtml(product.name)} din favorite">♥</button>
      </div>
      <a class="favorite-product-link" href="${escapeHtml(product.url)}" aria-label="Deschide ${escapeHtml(product.name)}"></a>
    </article>`;
  }

  function renderFavorites(ids = readFavorites()) {
    const grid = document.querySelector("[data-favorites-grid]");
    const empty = document.querySelector("[data-favorites-empty]");
    if (!grid || !empty) return;
    grid.innerHTML = ids.map(favoriteCard).join("");
    grid.hidden = ids.length === 0;
    empty.hidden = ids.length !== 0;
  }

  function cartCard(item) {
    const product = PRODUCTS[item.id];
    const unitPrice = parseProductPrice(product.price);
    const lineTotal = formatProductPrice(unitPrice * item.quantity);
    return `<article class="favorite-product-card cart-product-card" data-cart-card="${item.id}">
      <div class="favorite-product-stage">
        ${productImageMarkup(product)}
        <span class="favorite-product-stock"><i></i>${escapeHtml(product.stock)}</span>
      </div>
      <div class="favorite-product-copy">
        <span>${escapeHtml(product.category)}</span>
        <h2>${escapeHtml(product.name)}</h2>
        <p>${escapeHtml(product.description)}</p>
      </div>
      <div class="favorite-product-bottom">
        <div class="cart-line-price"><small>${item.quantity} × ${escapeHtml(product.price)}</small><strong>${lineTotal}</strong></div>
        <div class="cart-product-controls">
          <div class="cart-quantity" aria-label="Cantitate ${item.quantity}">
            <button type="button" data-cart-decrease="${item.id}" aria-label="Scade cantitatea pentru ${escapeHtml(product.name)}">−</button>
            <b>${item.quantity}</b>
            <button type="button" data-cart-increase="${item.id}" aria-label="Mărește cantitatea pentru ${escapeHtml(product.name)}">+</button>
          </div>
          <button class="favorite-remove cart-remove" type="button" data-remove-cart="${item.id}" aria-label="Elimină ${escapeHtml(product.name)} din coș">×</button>
        </div>
      </div>
      <a class="favorite-product-link" href="${escapeHtml(product.url)}" aria-label="Deschide ${escapeHtml(product.name)}"></a>
    </article>`;
  }

  function parseProductPrice(price) {
    const normalized = String(price).replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
    return Number(normalized) || 0;
  }

  function formatProductPrice(value) {
    return `${new Intl.NumberFormat("ro-RO", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value)} lei`;
  }

  function updateCartSummary(cart) {
    const itemCount = cart.reduce((total, item) => total + item.quantity, 0);
    const subtotal = cart.reduce((total, item) => {
      return total + parseProductPrice(PRODUCTS[item.id]?.price) * item.quantity;
    }, 0);
    const discount = Math.min(subtotal, Math.max(0, Number(activeCartPromotionQuote.discount_total || 0)));
    const orderTotal = Math.max(0, subtotal - discount);
    const formattedSubtotal = formatProductPrice(subtotal);

    document.querySelectorAll("[data-cart-items-summary]").forEach(element => {
      element.textContent = `${itemCount} ${itemCount === 1 ? "produs" : "produse"}`;
    });
    document.querySelectorAll("[data-cart-subtotal]").forEach(element => {
      element.textContent = formattedSubtotal;
    });
    document.querySelectorAll("[data-cart-order-total]").forEach(element => {
      element.textContent = formatProductPrice(orderTotal);
    });
    document.querySelectorAll("[data-cart-discount-line]").forEach(element => {
      element.hidden = discount <= 0;
    });
    document.querySelectorAll("[data-cart-discount]").forEach(element => {
      element.textContent = `−${formatProductPrice(discount)}`;
    });
    document.querySelectorAll("[data-cart-promotion-title]").forEach(element => {
      element.textContent = activeCartPromotionQuote.promotion_title || activeCartPromotionQuote.promotion_code || "Promoție aplicată";
    });

    const checkout = document.querySelector("[data-cart-checkout]");
    if (checkout) checkout.href = "/checkout.html";
  }

  async function refreshCartPromotionQuote(cart, force = false) {
    if (!catalogReady) return;
    const items = cart.map(item => ({
      product_id: String(PRODUCTS[item.id]?.apiId || ""),
      quantity: Number(item.quantity || 1)
    })).filter(item => item.product_id);
    const token = localStorage.getItem(CUSTOMER_TOKEN_KEY) || "";
    const signature = `${JSON.stringify(items)}|${token}`;
    if (!force && signature === cartPromotionSignature) return;
    cartPromotionSignature = signature;
    const sequence = ++cartPromotionQuoteSequence;
    if (!items.length) {
      activeCartPromotionQuote = { subtotal: 0, discount_total: 0, promotion_code: "", promotion_title: "" };
      updateCartSummary(cart);
      return;
    }
    try {
      const response = await fetch(`${SHOP_API_URL}?action=publicPromotionQuote&_=${Date.now()}`, {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(token ? { "X-Customer-Token": token } : {})
        },
        body: JSON.stringify({ items })
      });
      const quote = await response.json();
      if (!response.ok) throw new Error(String(quote?.error || "Promoția nu a putut fi verificată."));
      if (sequence !== cartPromotionQuoteSequence) return;
      activeCartPromotionQuote = {
        subtotal: Number(quote.subtotal || 0),
        discount_total: Math.max(0, Number(quote.discount_total || 0)),
        promotion_code: String(quote.promotion_code || ""),
        promotion_title: String(quote.promotion_title || "")
      };
    } catch {
      if (sequence !== cartPromotionQuoteSequence) return;
      activeCartPromotionQuote = { subtotal: 0, discount_total: 0, promotion_code: "", promotion_title: "" };
    }
    updateCartSummary(cart);
  }

  function renderCart(cart = readCart()) {
    const grid = document.querySelector("[data-cart-grid]");
    const empty = document.querySelector("[data-cart-empty]");
    const layout = document.querySelector("[data-cart-layout]");
    const loading = document.querySelector("[data-cart-loading]");
    if (!grid || !empty) return;
    if (loading && !catalogReady) {
      loading.hidden = false;
      grid.hidden = true;
      if (layout) layout.hidden = true;
      empty.hidden = true;
      return;
    }
    if (loading) loading.hidden = true;
    grid.innerHTML = cart.map(cartCard).join("");
    grid.hidden = cart.length === 0;
    if (layout) layout.hidden = cart.length === 0;
    empty.hidden = cart.length !== 0;
    updateCartSummary(cart);
    void refreshCartPromotionQuote(cart);
  }

  function refresh(ids = readFavorites(), cart = readCart()) {
    updateFavoriteButtons(ids);
    updateCartButtons(cart);
    updateFavoriteCounters(ids, cart);
    renderFavorites(ids);
    renderCart(cart);
  }

  function initialize() {
    ensureStyles();
    refreshArticleStyles();
    ensurePromotionLayer();
    ensureCabItCredit();
    document.querySelectorAll(".shop-header-cta").forEach(button => button.remove());
    normalizeHeaderBrand();
    normalizeNavigation();
    createFavoriteNav();
    bindMobileMenu();
    refresh();

    document.addEventListener("click", event => {
      const favoriteButton = event.target.closest(".favorite-button, .product-detail-favorite");
      if (favoriteButton) {
        event.preventDefault();
        event.stopPropagation();
        const id = productIdForButton(favoriteButton);
        if (PRODUCTS[id]) toggleFavorite(id);
        return;
      }

      const cartButton = event.target.closest(".cart-button, [data-add-cart]");
      if (cartButton) {
        event.preventDefault();
        event.stopPropagation();
        const id = productIdForButton(cartButton);
        if (PRODUCTS[id]) toggleCartProduct(id);
        return;
      }

      const cartIncrease = event.target.closest("[data-cart-increase]");
      if (cartIncrease) {
        event.preventDefault();
        event.stopPropagation();
        changeCartQuantity(cartIncrease.dataset.cartIncrease, 1);
        return;
      }

      const cartDecrease = event.target.closest("[data-cart-decrease]");
      if (cartDecrease) {
        event.preventDefault();
        event.stopPropagation();
        changeCartQuantity(cartDecrease.dataset.cartDecrease, -1);
        return;
      }

      const removeCartButton = event.target.closest("[data-remove-cart]");
      if (removeCartButton) {
        event.preventDefault();
        event.stopPropagation();
        writeCart(readCart().filter(item => item.id !== removeCartButton.dataset.removeCart));
        return;
      }

      const removeButton = event.target.closest("[data-remove-favorite]");
      if (removeButton) {
        event.preventDefault();
        event.stopPropagation();
        const id = removeButton.dataset.removeFavorite;
        writeFavorites(readFavorites().filter(item => item !== id));
      }
    });

    document.addEventListener("g-trots:favorites-changed", event => refresh(event.detail));
    document.addEventListener("g-trots:cart-changed", event => refresh(readFavorites(), event.detail));
    document.addEventListener("g-trots:customer-changed", event => {
      updateCustomerNavigation(event.detail);
      cartPromotionSignature = "";
      void refreshCartPromotionQuote(readCart(), true);
    });
    document.addEventListener("g-trots:catalog-error", () => {
      catalogReady = true;
      refresh();
    });
    window.addEventListener("storage", event => {
      if (event.key === STORAGE_KEY || event.key === CART_STORAGE_KEY) refresh();
      if (event.key === CUSTOMER_TOKEN_KEY || event.key === CUSTOMER_PROFILE_KEY) {
        updateCustomerNavigation();
        cartPromotionSignature = "";
        void refreshCartPromotionQuote(readCart(), true);
      }
    });
  }

  window.GTrotsFavorites = {
    products: PRODUCTS,
    registerProducts,
    get: readFavorites,
    toggle: toggleFavorite,
    remove: id => writeFavorites(readFavorites().filter(item => item !== id))
  };

  window.GTrotsCart = {
    get: readCart,
    add: addToCart,
    toggle: toggleCartProduct,
    remove: id => writeCart(readCart().filter(item => item.id !== id)),
    changeQuantity: changeCartQuantity
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
