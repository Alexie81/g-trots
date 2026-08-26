(() => {
  const API_URL = "https://g-trots.ro/shop-api/api-v2.php";
  const ORDER_STATE_KEY = "g-trots-last-checkout-v1";

  async function api(action, options = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 16000);
    try {
      const response = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`, {
        method: options.method || "GET",
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        cache: "no-store",
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Confirmarea nu a putut fi verificata (${response.status}).`);
      return payload;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function readState() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(ORDER_STATE_KEY) || "null");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveState(state) {
    try {
      sessionStorage.setItem(ORDER_STATE_KEY, JSON.stringify(state));
    } catch {
      // Bonul ramane functional si cand stocarea sesiunii nu este disponibila.
    }
  }

  function clearPaidCart(state) {
    const savedIds = Array.isArray(state.cartIds) ? state.cartIds : [];
    if (savedIds.length) {
      savedIds.forEach(id => window.GTrotsCart?.remove?.(id));
      return;
    }
    (window.GTrotsCart?.get?.() || []).forEach(item => window.GTrotsCart?.remove?.(item.id));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function safeUrl(value) {
    try {
      const raw = String(value || "").trim();
      if (!raw) return "";
      const url = new URL(raw, window.location.origin);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function parsePrice(value) {
    if (typeof value === "number") return value;
    const normalized = String(value || "").replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
    return Number(normalized) || 0;
  }

  function formatMoney(value) {
    return `${new Intl.NumberFormat("ro-RO", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(value) || 0)} lei`;
  }

  function setTextAll(selector, value) {
    if (value === undefined || value === null || value === "") return;
    document.querySelectorAll(selector).forEach(element => { element.textContent = String(value); });
  }

  function setResultIcon(type) {
    const host = document.querySelector("[data-result-icon]");
    if (!host) return;
    const icons = {
      paid: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 9.5A2.5 2.5 0 0 1 5.5 11M17 14.5a2.5 2.5 0 0 1 1.5-1.5"/></svg>`,
      processing: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`,
      pending: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M8 14h3"/></svg>`
    };
    host.innerHTML = icons[type] || icons.processing;
  }

  function configureResultState(method, status) {
    const hero = document.querySelector(".order-result-hero.is-confirmed");
    const receipt = document.querySelector("[data-order-receipt]");
    const isCod = method === "cash_on_delivery" || status === "cod";
    const isPaid = status === "paid";
    const mode = isPaid ? "paid" : isCod ? "processing" : "pending";

    hero?.classList.add(`is-${mode}`);
    receipt?.classList.add(`is-${mode}`);
    setResultIcon(mode);

    if (isPaid) {
      document.title = "Plată efectuată | G-Trots";
      setTextAll("[data-result-eyebrow]", "Plata a fost confirmată");
      setTextAll("[data-result-title-main]", "Plată");
      setTextAll("[data-result-title-accent]", "efectuată.");
      setTextAll("[data-result-mark-title]", "Plată efectuată");
      setTextAll("[data-result-mark-copy]", "Suma a fost confirmată în siguranță.");
      setTextAll("[data-receipt-status-text]", "Plătită");
      return;
    }

    if (isCod) {
      document.title = "Comandă în procesare | G-Trots";
      setTextAll("[data-result-eyebrow]", "Comanda a intrat în procesare");
      setTextAll("[data-result-title-main]", "Comandă");
      setTextAll("[data-result-title-accent]", "în procesare.");
      setTextAll("[data-result-mark-title]", "În procesare");
      setTextAll("[data-result-mark-copy]", "Pregătim verificarea și livrarea.");
      setTextAll("[data-receipt-status-text]", "În procesare");
      return;
    }

    document.title = "Plată în curs de confirmare | G-Trots";
    setTextAll("[data-result-eyebrow]", "Plata este în curs de confirmare");
    setTextAll("[data-result-title-main]", "Plata");
    setTextAll("[data-result-title-accent]", "se confirmă.");
    setTextAll("[data-result-mark-title]", "Confirmăm plata");
    setTextAll("[data-result-mark-copy]", "Așteptăm răspunsul procesatorului.");
    setTextAll("[data-receipt-status-text]", "În confirmare");
  }

  function renderClientTimeline(currentStatus) {
    const flow = ["new", "confirmed", "processing", "shipped", "completed"];
    const currentIndex = flow.indexOf(currentStatus);
    document.querySelectorAll("[data-order-flow-step]").forEach(step => {
      const value = step.dataset.orderFlowStep;
      const index = flow.indexOf(value);
      const isCancelled = currentStatus === "cancelled";
      const reached = !isCancelled && index >= 0 && index <= currentIndex;
      const current = value === currentStatus;
      step.classList.toggle("is-reached", reached || current);
      step.classList.toggle("is-current", current);
      const state = step.querySelector("i");
      if (state) state.textContent = current ? "Acum" : reached ? "Finalizat" : value === "cancelled" ? "Alternativ" : "Urmează";
    });
  }

  function currentCartItems() {
    const cart = window.GTrotsCart?.get?.() || [];
    const products = window.GTrotsFavorites?.products || {};
    return cart.map(item => {
      const product = products[item.id] || {};
      const quantity = Number(item.quantity || 1);
      const unitPrice = Number(product.priceValue ?? parsePrice(product.price));
      return {
        id: String(item.id || ""),
        name: String(product.name || "Produs G-Trots"),
        quantity,
        unitPrice,
        lineTotal: unitPrice * quantity,
        image: Number(product.image || 0),
        imageUrl: safeUrl(product.imageUrl),
        url: String(product.url || "/magazin.html")
      };
    });
  }

  function normalizedItems(state) {
    const source = Array.isArray(state.items) && state.items.length ? state.items : currentCartItems();
    return source.map(item => {
      const quantity = Math.max(1, Number(item.quantity || 1));
      const unitPrice = Number(item.unitPrice ?? item.unit_price ?? 0);
      return {
        id: String(item.id || ""),
        name: String(item.name || item.product_name || "Produs G-Trots"),
        quantity,
        unitPrice,
        lineTotal: Number(item.lineTotal ?? item.line_total ?? unitPrice * quantity),
        image: Number(item.image || item.sprite_index || 0),
        imageUrl: safeUrl(item.imageUrl || item.image_url),
        url: String(item.url || "/magazin.html")
      };
    });
  }

  async function enrichStateImages(state) {
    const items = normalizedItems(state);
    if (!items.length || items.every(item => item.imageUrl || item.image)) return state;
    try {
      const catalog = await api("publicProducts");
      const products = Array.isArray(catalog) ? catalog : [];
      const byKey = new Map();
      products.forEach(product => {
        const image = Array.isArray(product.images) ? product.images[0] : null;
        const normalized = {
          apiId: String(product.id || ""),
          slug: String(product.slug || ""),
          imageUrl: safeUrl(image?.url),
          image: Number(image?.sprite_index || 0),
          url: `/magazin/produs/${encodeURIComponent(String(product.slug || product.id || ""))}/`
        };
        [normalized.apiId, normalized.slug].filter(Boolean).forEach(key => byKey.set(key, normalized));
      });
      const hydrated = items.map(item => {
        const urlSlug = String(item.url || "").match(/\/magazin\/produs\/([^/]+)/)?.[1] || "";
        const product = byKey.get(item.id) || byKey.get(decodeURIComponent(urlSlug)) || {};
        return {
          ...item,
          imageUrl: item.imageUrl || product.imageUrl || "",
          image: item.image || product.image || 0,
          url: item.url || product.url || "/magazin.html"
        };
      });
      return { ...state, items: hydrated };
    } catch {
      return state;
    }
  }

  function renderReceipt(state, method) {
    const host = document.querySelector("[data-order-items]");
    if (!host) return;
    const empty = document.querySelector("[data-order-items-empty]");
    const items = normalizedItems(state);
    const subtotalFromItems = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const subtotal = Number.isFinite(Number(state.subtotal)) ? Number(state.subtotal) : subtotalFromItems;
    const hasShipping = state.shippingCost !== undefined && state.shippingCost !== null;
    const shipping = hasShipping ? Number(state.shippingCost || 0) : null;
    const total = Number.isFinite(Number(state.total)) && Number(state.total) > 0
      ? Number(state.total)
      : subtotal + Number(shipping || 0);

    host.innerHTML = items.map(item => {
      const legacyImage = item.image >= 1 && item.image <= 6 ? ` is-legacy-image receipt-product-image-${item.image}` : "";
      const imageMarkup = item.imageUrl
        ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="eager">`
        : legacyImage
          ? ""
          : '<span class="order-receipt-product-fallback">GT</span>';
      return `<article class="order-receipt-product">
        <a href="${escapeHtml(item.url)}" class="order-receipt-product-image${legacyImage}" aria-label="Deschide ${escapeHtml(item.name)}">${imageMarkup}</a>
        <span><strong>${escapeHtml(item.name)}</strong><small>${item.quantity} × ${formatMoney(item.unitPrice)}</small></span>
        <b>${formatMoney(item.lineTotal)}</b>
      </article>`;
    }).join("");
    host.querySelectorAll(".order-receipt-product-image img").forEach(image => {
      image.addEventListener("error", () => {
        image.replaceWith(Object.assign(document.createElement("span"), { className: "order-receipt-product-fallback", textContent: "GT" }));
      }, { once: true });
    });
    host.hidden = items.length === 0;
    if (empty) empty.hidden = items.length > 0;

    setTextAll("[data-order-subtotal]", formatMoney(subtotal));
    setTextAll("[data-order-shipping]", shipping === null ? "Se confirmă" : shipping === 0 ? "Gratuit" : formatMoney(shipping));
    setTextAll("[data-order-total]", formatMoney(total));
    setTextAll("[data-order-shipping-label]", state.shippingLabel || "Livrare");
    const paymentLabel = state.paymentLabel || (method === "card" ? "Card online" : "Ramburs la curier");
    setTextAll("[data-order-payment]", paymentLabel);
    setTextAll("[data-order-date]", new Intl.DateTimeFormat("ro-RO", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(state.createdAt ? new Date(state.createdAt) : new Date()));
  }

  async function copyText(value) {
    if (!value) return false;
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();
      return copied;
    }
  }

  function bindInteractions(orderNumber) {
    document.querySelectorAll("[data-copy-order]").forEach(button => {
      button.addEventListener("click", async () => {
        const copied = await copyText(orderNumber);
        const label = button.querySelector("b, span");
        const initial = label?.textContent || "";
        if (label) label.textContent = copied ? "Copiat!" : "Nu s-a copiat";
        window.setTimeout(() => { if (label) label.textContent = initial; }, 1600);
      });
    });
    document.querySelector("[data-print-order]")?.addEventListener("click", () => window.print());
  }

  function revealReceipt() {
    const receipt = document.querySelector("[data-order-receipt]");
    if (!receipt) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      receipt.classList.add("is-revealed");
      return;
    }
    receipt.classList.add("is-reveal-ready");
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      receipt.classList.add("is-revealed");
      observer.disconnect();
    }, { threshold: 0.22 });
    observer.observe(receipt);
  }

  async function initialize() {
    let state = readState();
    const params = new URLSearchParams(window.location.search);
    const isFailed = document.body.dataset.checkoutStatus === "failed";
    let orderNumber = String(params.get("comanda") || state.orderNumber || "").trim();
    let method = String(params.get("metoda") || state.paymentMethod || "").trim();
    let status = String(params.get("status") || "").trim();
    const numberWrap = document.querySelector("[data-order-number-wrap]");

    if (isFailed && status === "cancelled" && orderNumber && params.get("token")) {
      try {
        await api("cancelStripeCheckout", {
          method: "POST",
          body: { order_number: orderNumber, token: params.get("token") }
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Sesiunea Stripe nu a putut fi inchisa.";
        setTextAll("[data-failure-reason]", reason);
      }
    }

    if (!isFailed && method === "card" && params.get("session_id")) {
      try {
        const result = await api("stripeCheckoutStatus", {
          method: "POST",
          body: { session_id: params.get("session_id") }
        });
        if (result.order && typeof result.order === "object") {
          state = { ...state, ...result.order, cartIds: state.cartIds || [] };
          saveState(state);
          orderNumber = String(result.order.orderNumber || orderNumber);
          method = String(result.order.paymentMethod || method);
        }
        status = ["paid", "no_payment_required"].includes(String(result.payment_status || "")) ? "paid" : "pending";
        if (status === "paid") clearPaidCart(state);
      } catch {
        status = "pending";
      }
    }

    if (orderNumber) {
      numberWrap?.removeAttribute("hidden");
      setTextAll("[data-order-number]", orderNumber);
    } else {
      numberWrap?.setAttribute("hidden", "");
    }

    const whatsapp = document.querySelector("[data-status-whatsapp]");
    if (whatsapp) {
      const message = orderNumber
        ? `Bună ziua! Am nevoie de ajutor pentru comanda ${orderNumber}.`
        : "Bună ziua! Am nevoie de ajutor pentru finalizarea unei comenzi.";
      whatsapp.href = `https://wa.me/40762093915?text=${encodeURIComponent(message)}`;
    }

    if (isFailed) {
      if (status === "cancelled") {
        document.title = "Plată anulată | G-Trots";
        setTextAll("[data-failure-eyebrow]", "Plata a fost anulată");
        setTextAll("[data-failure-title]", "Ai anulat");
        setTextAll("[data-failure-title-accent]", "plata.");
        setTextAll("[data-status-lead]", "Nu s-a încasat nicio sumă. Produsele tale au rămas în coș și poți relua comanda oricând.");
        setTextAll("[data-failure-mark-title]", "Plată anulată");
        setTextAll("[data-failure-mark-copy]", "Comanda și stocul au fost actualizate corect.");
      }
      const cartCount = (window.GTrotsCart?.get?.() || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      setTextAll("[data-failure-cart-count]", cartCount
        ? `${cartCount} ${cartCount === 1 ? "produs păstrat" : "produse păstrate"} în coș`
        : "Coșul tău rămâne disponibil");
      const reason = String(params.get("motiv") || "").trim();
      if (reason) setTextAll("[data-failure-reason]", reason);
      return;
    }

    configureResultState(method, status);
    renderClientTimeline(status === "paid" ? "confirmed" : "new");

    if (method === "cash_on_delivery" || status === "cod") {
      setTextAll("[data-status-lead]", "Am primit comanda ta. Este nouă și se află în procesare, iar echipa G-Trots verifică toate detaliile înainte de pregătire.");
      setTextAll("[data-payment-step-title]", "Plătești la livrare");
      setTextAll("[data-payment-step-copy]", "Comanda va fi verificată și confirmată de echipa G-Trots.");
    } else if (status === "paid") {
      setTextAll("[data-status-lead]", "Am primit comanda ta. Plata a fost efectuată, iar comanda este confirmată automat și va intra în pregătire.");
      setTextAll("[data-payment-step-title]", "Plata este confirmată");
      setTextAll("[data-payment-step-copy]", "Plata a fost efectuată, iar comanda este confirmată.");
    } else if (method === "card") {
      setTextAll("[data-status-lead]", "Comanda este confirmată în sistemul G-Trots. Plata cu cardul rămâne în curs de confirmare până la verificarea comenzii.");
      setTextAll("[data-payment-step-title]", "Confirmăm plata cu cardul");
      setTextAll("[data-payment-step-copy]", state.paymentLabel || "Primești confirmarea după verificarea comenzii.");
    }

    if (state.shippingLabel) {
      setTextAll("[data-shipping-step-copy]", `${state.shippingLabel}. Primești confirmarea înainte ca produsele să plece spre tine.`);
    }
    state = await enrichStateImages(state);
    saveState(state);
    renderReceipt(state, method);
    bindInteractions(orderNumber);
    revealReceipt();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
