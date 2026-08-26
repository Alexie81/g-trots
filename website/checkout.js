(() => {
  const API_URL = "https://g-trots.ro/shop-api/api-v2.php";
  const ORDER_STATE_KEY = "g-trots-last-checkout-v1";
  const $ = selector => document.querySelector(selector);

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

  function formatMoney(value) {
    return `${new Intl.NumberFormat("ro-RO", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(value) || 0)} lei`;
  }

  function parsePrice(value) {
    if (typeof value === "number") return value;
    const normalized = String(value || "").replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
    return Number(normalized) || 0;
  }

  async function api(action, options = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 14000);
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
      if (!response.ok) throw new Error(payload.error || `Comanda nu a putut fi procesată (${response.status}).`);
      return payload;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("Conexiunea a durat prea mult. Verifică internetul și încearcă din nou.");
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function stockLabel(product) {
    if (product.stock_mode === "unlimited") return "În stoc";
    const quantity = Number(product.stock_quantity || 0);
    if (quantity <= 0) return "Stoc epuizat";
    return quantity <= Number(product.low_stock_threshold || 3) ? "Stoc limitat" : "În stoc";
  }

  function normalizeProduct(product) {
    const slug = String(product.slug || product.id || "");
    const priceValue = product.sale_price == null ? Number(product.price || 0) : Number(product.sale_price || 0);
    const image = Array.isArray(product.images) ? product.images[0] : null;
    return {
      id: slug,
      slug,
      apiId: String(product.id || ""),
      name: String(product.name || "Produs G-Trots"),
      category: String(product.category_name || "Produs G-Trots"),
      description: String(product.short_description || ""),
      price: formatMoney(priceValue),
      priceValue,
      stock: stockLabel(product),
      image: Number(image?.sprite_index || 0),
      imageUrl: image?.sprite_index ? "" : safeUrl(image?.url),
      url: `/magazin/produs/${encodeURIComponent(slug)}/`
    };
  }

  function checkoutProducts() {
    return window.GTrotsFavorites?.products || {};
  }

  function cartRows() {
    return window.GTrotsCart?.get?.() || [];
  }

  function productPrice(product) {
    return Number(product?.priceValue ?? parsePrice(product?.price)) || 0;
  }

  function cartSubtotal(cart) {
    const products = checkoutProducts();
    return cart.reduce((total, item) => total + productPrice(products[item.id]) * Number(item.quantity || 0), 0);
  }

  function shippingCost(config, subtotal, shippingId) {
    const method = config.shipping_methods.find(row => String(row.id) === String(shippingId));
    if (!method) return 0;
    if (method.free_above != null && subtotal >= Number(method.free_above)) return 0;
    return Number(method.cost || 0);
  }

  function shippingIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>`;
  }

  function paymentIcon(type) {
    if (type === "card") return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6.5 15h3"/></svg>`;
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 9.5A2.5 2.5 0 0 1 5.5 11M17 14.5a2.5 2.5 0 0 1 1.5-1.5"/></svg>`;
  }

  function renderShipping(config) {
    const host = $("[data-checkout-shipping]");
    host.innerHTML = config.shipping_methods.map((method, index) => {
      const cost = Number(method.cost || 0);
      const freeText = method.free_above != null ? ` · Gratuit peste ${formatMoney(method.free_above)}` : "";
      return `<label class="checkout-option${index === 0 ? " is-selected" : ""}">
        <input type="radio" name="shipping_method_id" value="${escapeHtml(method.id)}"${index === 0 ? " checked" : ""}>
        <span class="checkout-option-icon">${shippingIcon()}</span>
        <span class="checkout-option-copy"><strong>${escapeHtml(method.name)}</strong><small>${escapeHtml(method.eta_label || method.description || "Livrare la adresa indicată")}${escapeHtml(freeText)}</small></span>
        <b class="checkout-option-price">${cost === 0 ? "Gratuit" : formatMoney(cost)}</b>
      </label>`;
    }).join("");
  }

  function activePayments(config) {
    const methods = [];
    if (config.payments?.cash_on_delivery_enabled) {
      methods.push({
        id: "cash_on_delivery",
        label: config.payments.cash_on_delivery_label || "Ramburs la curier",
        description: "Plătești în momentul în care primești coletul."
      });
    }
    if (config.payments?.card_enabled) {
      methods.push({
        id: "card",
        label: config.payments.card_label || "Card online",
        description: "Plătești securizat în pagina Stripe; nu stocăm datele cardului."
      });
    }
    return methods;
  }

  function renderPayments(config) {
    const payments = activePayments(config);
    const host = $("[data-checkout-payment]");
    host.innerHTML = payments.map((method, index) => `<label class="checkout-option${index === 0 ? " is-selected" : ""}">
      <input type="radio" name="payment_method" value="${method.id}"${index === 0 ? " checked" : ""}>
      <span class="checkout-option-icon">${paymentIcon(method.id)}</span>
      <span class="checkout-option-copy"><strong>${escapeHtml(method.label)}</strong><small>${escapeHtml(method.description)}</small></span>
      <b class="checkout-option-price">${method.id === "card" ? "Online" : "La livrare"}</b>
    </label>`).join("");
    return payments;
  }

  function imageStyle(product) {
    const url = safeUrl(product?.imageUrl);
    return url ? ` style="background-image:url('${escapeHtml(url)}')"` : "";
  }

  function renderSummary(cart, config) {
    const products = checkoutProducts();
    const itemCount = cart.reduce((total, item) => total + Number(item.quantity || 0), 0);
    const itemsHost = $("[data-checkout-items]");
    itemsHost.innerHTML = cart.map(item => {
      const product = products[item.id];
      const quantity = Number(item.quantity || 0);
      return `<article class="checkout-summary-item">
        <a class="checkout-summary-item-image" href="${escapeHtml(product?.url || "/magazin.html")}"${imageStyle(product)} aria-label="Deschide ${escapeHtml(product?.name || "produsul")}"></a>
        <span class="checkout-summary-item-copy"><strong>${escapeHtml(product?.name || "Produs G-Trots")}</strong><small>${quantity} × ${formatMoney(productPrice(product))}</small></span>
        <b>${formatMoney(productPrice(product) * quantity)}</b>
      </article>`;
    }).join("");
    $("[data-checkout-item-count]").textContent = `${itemCount} ${itemCount === 1 ? "produs" : "produse"}`;
    updateTotals(cart, config);
  }

  function updateOptionStates() {
    document.querySelectorAll(".checkout-option").forEach(option => {
      option.classList.toggle("is-selected", Boolean(option.querySelector("input")?.checked));
    });
  }

  function updateSubmitLabel(form, submit) {
    const label = submit?.querySelector("strong");
    if (!label || submit.disabled) return;
    const paymentMethod = form?.querySelector('input[name="payment_method"]:checked')?.value || "";
    label.textContent = paymentMethod === "card" ? "Plătește acum" : "Trimite comanda";
  }

  function updateTotals(cart, config) {
    const subtotal = cartSubtotal(cart);
    const shippingId = document.querySelector('input[name="shipping_method_id"]:checked')?.value || "";
    const cost = shippingCost(config, subtotal, shippingId);
    $("[data-checkout-subtotal]").textContent = formatMoney(subtotal);
    $("[data-checkout-shipping-cost]").textContent = cost === 0 ? "Gratuit" : formatMoney(cost);
    $("[data-checkout-total]").textContent = formatMoney(subtotal + cost);
    updateOptionStates();
    return { subtotal, shippingCost: cost, total: subtotal + cost };
  }

  function clearValidation(form) {
    form.querySelectorAll(".is-invalid").forEach(element => element.classList.remove("is-invalid"));
    form.querySelectorAll("[data-field-error]").forEach(element => { element.textContent = ""; });
  }

  function invalidate(field, message) {
    const label = field?.closest("label");
    if (!label) return;
    label.classList.add("is-invalid");
    const error = label.querySelector("[data-field-error]");
    if (error) error.textContent = message;
  }

  function validate(form) {
    clearValidation(form);
    const errors = [];
    const requiredFields = [
      [form.elements.customer_name, "Completează numele și prenumele."],
      [form.elements.customer_phone, "Completează numărul de telefon."],
      [form.elements.address, "Completează adresa de livrare."],
      [form.elements.city, "Completează localitatea."]
    ];
    requiredFields.forEach(([field, message]) => {
      if (!String(field?.value || "").trim()) {
        invalidate(field, message);
        errors.push(field);
      }
    });
    const phone = String(form.elements.customer_phone?.value || "").replace(/\D/g, "");
    if (phone && phone.length < 7) {
      invalidate(form.elements.customer_phone, "Introdu un număr de telefon valid.");
      errors.push(form.elements.customer_phone);
    }
    const email = String(form.elements.customer_email?.value || "").trim();
    if (!email) {
      invalidate(form.elements.customer_email, "Completează adresa de e-mail.");
      errors.push(form.elements.customer_email);
    } else if (email && !form.elements.customer_email.checkValidity()) {
      invalidate(form.elements.customer_email, "Introdu o adresă de e-mail validă.");
      errors.push(form.elements.customer_email);
    }
    if (!form.elements.confirm_order?.checked) {
      form.elements.confirm_order?.closest("label")?.classList.add("is-invalid");
      errors.push(form.elements.confirm_order);
    }
    errors[0]?.focus?.({ preventScroll: true });
    errors[0]?.closest?.("label")?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    return errors.length === 0;
  }

  function setLoadingError(message) {
    const loading = $("[data-checkout-loading]");
    loading.innerHTML = `<span class="checkout-empty-icon" aria-hidden="true">!</span><strong>Checkout-ul nu s-a putut încărca</strong><p>${escapeHtml(message)}</p><button class="checkout-primary-link" type="button" data-checkout-retry>Încearcă din nou <span aria-hidden="true">↻</span></button>`;
    loading.querySelector("[data-checkout-retry]")?.addEventListener("click", () => window.location.reload());
  }

  async function initialize() {
    const loading = $("[data-checkout-loading]");
    const empty = $("[data-checkout-empty]");
    const form = $("[data-checkout-form]");
    const message = $("[data-checkout-message]");
    const submit = $("[data-checkout-submit]");
    try {
      const [rawProducts, config] = await Promise.all([api("publicProducts"), api("publicShopConfig")]);
      const normalized = Array.isArray(rawProducts) ? rawProducts.map(normalizeProduct) : [];
      window.GTrotsFavorites?.registerProducts?.(normalized);
      const cart = cartRows();
      loading.hidden = true;
      if (!cart.length) {
        empty.hidden = false;
        return;
      }
      if (!Array.isArray(config.shipping_methods) || !config.shipping_methods.length) {
        throw new Error("Momentan nu este activă nicio metodă de livrare.");
      }
      const payments = activePayments(config);
      if (!payments.length) throw new Error("Momentan nu este activă nicio metodă de plată.");
      renderShipping(config);
      renderPayments(config);
      renderSummary(cart, config);
      form.hidden = false;
      updateSubmitLabel(form, submit);

      form.addEventListener("change", event => {
        event.target.closest("label")?.classList.remove("is-invalid");
        if (event.target.matches('input[type="radio"]')) {
          updateTotals(cartRows(), config);
          if (event.target.name === "payment_method") updateSubmitLabel(form, submit);
        }
      });
      form.addEventListener("reset", () => window.requestAnimationFrame(() => updateSubmitLabel(form, submit)));
      window.addEventListener("pageshow", () => updateSubmitLabel(form, submit));
      form.addEventListener("input", event => {
        event.target.closest("label")?.classList.remove("is-invalid");
      });

      form.addEventListener("submit", async event => {
        event.preventDefault();
        message.className = "checkout-submit-message";
        message.textContent = "";
        if (!validate(form)) {
          message.classList.add("is-error");
          message.textContent = "Verifică câmpurile marcate înainte să trimiți comanda.";
          return;
        }

        const currentCart = cartRows();
        const products = checkoutProducts();
        const items = currentCart.map(item => ({
          product_id: products[item.id]?.apiId,
          quantity: Number(item.quantity || 1)
        }));
        if (!items.length || items.some(item => !item.product_id)) {
          message.classList.add("is-error");
          message.textContent = "Un produs nu mai este disponibil. Revino în coș și verifică produsele.";
          return;
        }

        const fields = Object.fromEntries(new FormData(form).entries());
        delete fields.confirm_order;
        submit.disabled = true;
        submit.querySelector("strong").textContent = "Se trimite comanda…";
        message.textContent = "Rezervăm produsele și înregistrăm comanda.";

        try {
          const totals = updateTotals(currentCart, config);
          const order = await api("createPublicOrder", {
            method: "POST",
            body: { ...fields, items, return_base_url: window.location.origin }
          });
          const shipping = config.shipping_methods.find(row => String(row.id) === String(fields.shipping_method_id));
          const payment = payments.find(row => row.id === fields.payment_method);
          const receiptItems = currentCart.map(item => {
            const product = products[item.id] || {};
            const quantity = Number(item.quantity || 1);
            const unitPrice = productPrice(product);
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
          try {
            sessionStorage.setItem(ORDER_STATE_KEY, JSON.stringify({
              orderNumber: String(order.order_number || ""),
              orderId: String(order.id || ""),
              paymentMethod: String(fields.payment_method || ""),
              paymentLabel: String(payment?.label || ""),
              shippingLabel: String(shipping?.name || ""),
              subtotal: Number(order.subtotal ?? totals.subtotal),
              shippingCost: Number(order.shipping_cost ?? totals.shippingCost),
              total: Number(order.total ?? totals.total),
              items: receiptItems,
              cartIds: currentCart.map(item => String(item.id || "")).filter(Boolean),
              createdAt: new Date().toISOString()
            }));
          } catch {
            // Redirecționarea rămâne funcțională și fără stocare de sesiune.
          }
          if (fields.payment_method === "card") {
            const checkoutUrl = new URL(String(order.stripe_checkout_url || ""));
            const isStripeCheckout = checkoutUrl.protocol === "https:"
              && (checkoutUrl.hostname === "checkout.stripe.com" || checkoutUrl.hostname.endsWith(".checkout.stripe.com"));
            if (!isStripeCheckout) throw new Error("Stripe nu a returnat o pagina de plata valida.");
            message.textContent = "Te redirectionam in siguranta catre Stripe…";
            window.location.assign(checkoutUrl.href);
            return;
          }

          currentCart.forEach(item => window.GTrotsCart?.remove?.(item.id));
          const params = new URLSearchParams({
            comanda: String(order.order_number || ""),
            metoda: String(fields.payment_method || ""),
            status: "cod"
          });
          window.location.assign(`plata-finalizata.html?${params.toString()}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Comanda nu a putut fi trimisă.";
          message.classList.add("is-error");
          message.textContent = errorMessage;
          submit.disabled = false;
          updateSubmitLabel(form, submit);
        }
      });
    } catch (error) {
      empty.hidden = true;
      form.hidden = true;
      loading.hidden = false;
      setLoadingError(error instanceof Error ? error.message : "Încearcă din nou peste câteva momente.");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
