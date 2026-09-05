(() => {
  const API_URL = "https://g-trots.ro/shop-api/api-v2.php";
  const ORDER_STATE_KEY = "g-trots-last-checkout-v1";
  const CUSTOMER_TOKEN_KEY = "g-trots-customer-session-v1";
  const CUSTOMER_PROFILE_KEY = "g-trots-customer-profile-v1";
  const SHOP_DEVICE_KEY = "g-trots-shop-device-v1";
  const $ = selector => document.querySelector(selector);
  let activePromotionQuote = { subtotal: 0, discount_total: 0, promotion_code: "", promotion_title: "", promotion_scope: "", promotion_min_order_value: null, items: [] };
  let promotionQuoteSequence = 0;
  let manualPromotionCode = "";
  const customerCheckout = { customer: null, addresses: [], selectedAddressId: "new" };

  function shopDeviceToken() {
    try {
      let token = String(localStorage.getItem(SHOP_DEVICE_KEY) || "").trim();
      if (/^[A-Za-z0-9_-]{20,128}$/.test(token)) return token;
      if (window.crypto?.getRandomValues) {
        const bytes = new Uint8Array(24);
        window.crypto.getRandomValues(bytes);
        token = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
      } else {
        token = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
      }
      localStorage.setItem(SHOP_DEVICE_KEY, token);
      return token;
    } catch {
      return "";
    }
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
    const deviceToken = shopDeviceToken();
    try {
      const url = new URL(API_URL);
      url.searchParams.set("action", action);
      Object.entries(options.query || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value) !== "") url.searchParams.set(key, String(value));
      });
      const response = await fetch(url.toString(), {
        method: options.method || "GET",
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(localStorage.getItem(CUSTOMER_TOKEN_KEY) ? { "X-Customer-Token": localStorage.getItem(CUSTOMER_TOKEN_KEY) } : {}),
          ...(deviceToken ? { "X-Shop-Device": deviceToken } : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        cache: "no-store",
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.error || `Comanda nu a putut fi procesată (${response.status}).`);
        error.status = response.status;
        error.code = payload.code || "";
        throw error;
      }
      return payload;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("Conexiunea a durat prea mult. Verifică internetul și încearcă din nou.");
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function cachedCustomer() {
    try { return JSON.parse(localStorage.getItem(CUSTOMER_PROFILE_KEY) || "null"); }
    catch { return null; }
  }

  function formField(form, name) {
    return form?.elements?.namedItem(name) || null;
  }

  function setCheckoutField(form, name, value, overwrite = false) {
    const field = formField(form, name);
    if (!field || value == null || String(value).trim() === "") return;
    if (overwrite || !String(field.value || "").trim()) field.value = String(value);
  }

  function fillCustomerFields(form, customer, overwrite = false) {
    if (!customer) return;
    setCheckoutField(form, "customer_name", customer.full_name, overwrite);
    setCheckoutField(form, "customer_phone", customer.phone, overwrite);
    setCheckoutField(form, "customer_email", customer.email, overwrite);
    ["address", "city", "county", "postal_code", "company_name", "company_cui", "company_registration_number", "company_address"].forEach(name => setCheckoutField(form, name, customer[name], overwrite));
    setCheckoutCustomerType(form, customer.customer_type);
  }

  function setCheckoutCustomerType(form, type) {
    const normalized = type === "company" ? "company" : "individual";
    const customerTypeField = formField(form, "customer_type");
    if (customerTypeField) customerTypeField.value = normalized;
    form.querySelectorAll("[data-checkout-customer-type]").forEach(button => {
      const active = button.dataset.checkoutCustomerType === normalized;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const companyFields = form.querySelector("[data-checkout-company-fields]");
    if (companyFields) companyFields.hidden = normalized !== "company";
    ["company_name", "company_cui", "company_registration_number", "company_address"].forEach(name => {
      const field = formField(form, name);
      if (field) field.required = normalized === "company";
    });
  }

  function fillAddressFields(form, address) {
    if (!address) {
      ["address", "city", "county", "postal_code"].forEach(name => {
        const field = formField(form, name);
        if (field) field.value = "";
      });
      fillCustomerFields(form, customerCheckout.customer, true);
      return;
    }
    setCheckoutField(form, "customer_name", address.recipient_name, true);
    setCheckoutField(form, "customer_phone", address.phone, true);
    ["address", "city", "county", "postal_code"].forEach(name => setCheckoutField(form, name, address[name], true));
  }

  function addressIcon(isNew = false) {
    return isNew
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>`;
  }

  function addressSelectionIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7.5 12.5 3 3 6-7"/></svg>`;
  }

  function renderCheckoutAddresses(form) {
    const section = $("[data-checkout-address-book]");
    const host = $("[data-checkout-address-options]");
    const saveOption = $("[data-checkout-save-address]");
    if (!section || !host || !localStorage.getItem(CUSTOMER_TOKEN_KEY)) return;
    section.hidden = false;
    const rows = customerCheckout.addresses.map(address => `<button type="button" class="checkout-address-option${address.id === customerCheckout.selectedAddressId ? " is-selected" : ""}" data-checkout-address-id="${escapeHtml(address.id)}" aria-pressed="${address.id === customerCheckout.selectedAddressId ? "true" : "false"}">
      <span class="checkout-address-option-icon">${addressIcon()}</span><span class="checkout-address-option-copy"><span><strong>${escapeHtml(address.label || "Adresă salvată")}</strong>${address.is_default ? "<em>Principală</em>" : ""}</span><small>${escapeHtml(address.address)}, ${escapeHtml(address.city)}</small></span><span class="checkout-address-option-check">${addressSelectionIcon()}</span>
    </button>`);
    rows.push(`<button type="button" class="checkout-address-option is-new${customerCheckout.selectedAddressId === "new" ? " is-selected" : ""}" data-checkout-address-id="new" aria-pressed="${customerCheckout.selectedAddressId === "new" ? "true" : "false"}"><span class="checkout-address-option-icon">${addressIcon(true)}</span><span class="checkout-address-option-copy"><span><strong>Folosește o adresă nouă</strong></span><small>Completează datele de livrare mai jos</small></span><span class="checkout-address-option-check">${addressSelectionIcon()}</span></button>`);
    host.innerHTML = rows.join("");
    saveOption.hidden = customerCheckout.selectedAddressId !== "new";
    host.querySelectorAll("[data-checkout-address-id]").forEach(button => button.addEventListener("click", () => {
      customerCheckout.selectedAddressId = button.dataset.checkoutAddressId;
      const address = customerCheckout.addresses.find(item => String(item.id) === customerCheckout.selectedAddressId) || null;
      fillAddressFields(form, address);
      renderCheckoutAddresses(form);
    }));
  }

  async function hydrateCheckoutCustomer(form) {
    if (!localStorage.getItem(CUSTOMER_TOKEN_KEY)) return;
    const cached = cachedCustomer();
    customerCheckout.customer = cached;
    fillCustomerFields(form, cached);
    const [meResult, addressResult] = await Promise.allSettled([api("customerMe"), api("customerAddresses")]);
    if (meResult.status === "rejected" && [401, 403].includes(Number(meResult.reason?.status))) {
      localStorage.removeItem(CUSTOMER_TOKEN_KEY);
      localStorage.removeItem(CUSTOMER_PROFILE_KEY);
      document.dispatchEvent(new CustomEvent("g-trots:customer-changed", { detail: null }));
      return;
    }
    if (meResult.status === "fulfilled") {
      customerCheckout.customer = meResult.value?.customer || meResult.value;
      fillCustomerFields(form, customerCheckout.customer);
      localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(customerCheckout.customer));
      document.dispatchEvent(new CustomEvent("g-trots:customer-changed", { detail: customerCheckout.customer }));
    }
    customerCheckout.addresses = addressResult.status === "fulfilled" && Array.isArray(addressResult.value) ? addressResult.value : [];
    const selected = customerCheckout.addresses.find(address => address.is_default) || customerCheckout.addresses[0] || null;
    customerCheckout.selectedAddressId = selected ? String(selected.id) : "new";
    fillAddressFields(form, selected);
    renderCheckoutAddresses(form);
  }

  async function saveCheckoutAddress(fields) {
    if (!localStorage.getItem(CUSTOMER_TOKEN_KEY)) return;
    return api("customerAddresses", {
      method: "POST",
      body: {
        label: "Comanda mea",
        recipient_name: fields.customer_name,
        phone: fields.customer_phone,
        address: fields.address,
        city: fields.city,
        county: fields.county || "",
        postal_code: fields.postal_code || "",
        is_default: customerCheckout.addresses.length === 0,
      }
    });
  }

  function stockLabel(product) {
    if (product.stock_mode === "unlimited") return "În stoc";
    const quantity = Number(product.stock_quantity || 0);
    if (quantity <= 0) return "Stoc epuizat";
    return quantity <= Number(product.low_stock_threshold || 3) ? "Stoc limitat" : "În stoc";
  }

  function normalizeProduct(product) {
    const slug = String(product.slug || product.id || "");
    const basePriceValue = product.sale_price == null ? Number(product.price || 0) : Number(product.sale_price || 0);
    const priceValue = product.promotion_price == null ? basePriceValue : Number(product.promotion_price || 0);
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
      basePriceValue,
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

  async function checkoutCatalog(cart) {
    const ids = [...new Set(cart.map(item => String(item?.id || "").trim().slice(0, 180)).filter(Boolean))];
    if (!ids.length) return [];
    return api("publicCheckoutProducts", { method: "POST", body: { ids } });
  }

  function productPrice(product) {
    return Number(product?.basePriceValue ?? product?.priceValue ?? parsePrice(product?.price)) || 0;
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

  function checkoutLinePricing(product, quantity) {
    const baseUnitPrice = productPrice(product);
    const quoteItem = activePromotionQuote.promotion_scope === "product"
      ? activePromotionQuote.items.find(row => String(row.product_id || "") === String(product?.apiId || ""))
      : null;
    const hasDiscount = Boolean(quoteItem?.is_discounted) && Number(quoteItem?.discount_total || 0) > 0;
    return {
      hasDiscount,
      baseUnitPrice,
      currentUnitPrice: hasDiscount ? Number(quoteItem.discounted_unit_price || 0) : baseUnitPrice,
      baseLineTotal: hasDiscount ? Number(quoteItem.line_total || baseUnitPrice * quantity) : baseUnitPrice * quantity,
      currentLineTotal: hasDiscount ? Number(quoteItem.discounted_line_total || 0) : baseUnitPrice * quantity
    };
  }

  function renderCheckoutItems(cart) {
    const products = checkoutProducts();
    const itemsHost = $("[data-checkout-items]");
    if (!itemsHost) return;
    itemsHost.innerHTML = cart.map(item => {
      const product = products[item.id];
      const quantity = Number(item.quantity || 0);
      const pricing = checkoutLinePricing(product, quantity);
      const unitPrice = pricing.hasDiscount
        ? `<del>${formatMoney(pricing.baseUnitPrice)}</del><span>${formatMoney(pricing.currentUnitPrice)}</span>`
        : formatMoney(pricing.baseUnitPrice);
      const lineTotal = pricing.hasDiscount
        ? `<del>${formatMoney(pricing.baseLineTotal)}</del><span>${formatMoney(pricing.currentLineTotal)}</span>`
        : formatMoney(pricing.currentLineTotal);
      return `<article class="checkout-summary-item">
        <a class="checkout-summary-item-image" href="${escapeHtml(product?.url || "/magazin.html")}"${imageStyle(product)} aria-label="Deschide ${escapeHtml(product?.name || "produsul")}"></a>
        <span class="checkout-summary-item-copy"><strong>${escapeHtml(product?.name || "Produs G-Trots")}</strong><small class="${pricing.hasDiscount ? "is-discounted" : ""}">${quantity} × ${unitPrice}</small></span>
        <b class="${pricing.hasDiscount ? "is-discounted" : ""}">${lineTotal}</b>
      </article>`;
    }).join("");
  }

  function renderSummary(cart, config) {
    const itemCount = cart.reduce((total, item) => total + Number(item.quantity || 0), 0);
    renderCheckoutItems(cart);
    $("[data-checkout-item-count]").textContent = `${itemCount} ${itemCount === 1 ? "produs" : "produse"}`;
    updateTotals(cart, config);
    void refreshPromotionQuote(cart, config);
  }

  async function refreshPromotionQuote(cart, config, couponCode = manualPromotionCode, showFeedback = false) {
    const products = checkoutProducts();
    const items = cart.map(item => ({ product_id: String(products[item.id]?.apiId || ""), quantity: Number(item.quantity || 1) })).filter(item => item.product_id);
    const sequence = ++promotionQuoteSequence;
    const cleanCode = String(couponCode || "").trim().toUpperCase();
    const promoMessage = $("[data-checkout-promo-message]");
    const promoWrap = $("[data-checkout-promo]");
    const promoButton = $("[data-checkout-promo-apply]");
    if (showFeedback && promoButton) promoButton.disabled = true;
    try {
      const quote = await api("publicPromotionQuote", { method: "POST", body: { items, coupon_code: cleanCode, device_token: shopDeviceToken() } });
      if (sequence !== promotionQuoteSequence) return;
      activePromotionQuote = {
        subtotal: Number(quote.subtotal || 0),
        discount_total: Math.max(0, Number(quote.discount_total || 0)),
        promotion_code: String(quote.promotion_code || ""),
        promotion_title: String(quote.promotion_title || ""),
        promotion_scope: String(quote.promotion_scope || ""),
        promotion_min_order_value: quote.promotion_min_order_value == null ? null : Number(quote.promotion_min_order_value),
        items: Array.isArray(quote.items) ? quote.items : []
      };
      manualPromotionCode = cleanCode;
      promoWrap?.classList.toggle("is-applied", Boolean(cleanCode));
      if (showFeedback && promoMessage) {
        promoMessage.className = "is-success";
        promoMessage.textContent = cleanCode ? `Codul ${cleanCode} a fost aplicat. Ai economisit ${formatMoney(activePromotionQuote.discount_total)}.` : "Se aplică automat cea mai bună ofertă disponibilă.";
      }
      renderCheckoutItems(cart);
      updateTotals(cart, config);
      return true;
    } catch (error) {
      if (sequence !== promotionQuoteSequence) return;
      const message = error instanceof Error ? error.message : "Codul nu a putut fi verificat.";
      if (cleanCode) {
        manualPromotionCode = "";
        promoWrap?.classList.remove("is-applied");
        if (promoMessage) { promoMessage.className = "is-error"; promoMessage.textContent = message; }
        void refreshPromotionQuote(cart, config, "", false);
        return false;
      }
      activePromotionQuote = { subtotal: 0, discount_total: 0, promotion_code: "", promotion_title: "", promotion_scope: "", promotion_min_order_value: null, items: [] };
      renderCheckoutItems(cart);
      updateTotals(cart, config);
      return false;
    } finally {
      if (showFeedback && promoButton) promoButton.disabled = false;
    }
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
    label.textContent = paymentMethod === "card" ? "Comandă și plătește" : "Plasează comanda cu obligație de plată";
  }

  function updateTotals(cart, config) {
    const subtotal = cartSubtotal(cart);
    const shippingId = document.querySelector('input[name="shipping_method_id"]:checked')?.value || "";
    const cost = shippingCost(config, subtotal, shippingId);
    const discount = Math.abs(activePromotionQuote.subtotal - subtotal) < .02 ? Math.min(subtotal, activePromotionQuote.discount_total) : 0;
    const productDiscount = activePromotionQuote.promotion_scope === "product" ? discount : 0;
    const orderDiscount = activePromotionQuote.promotion_scope === "product" ? 0 : discount;
    $("[data-checkout-subtotal]").textContent = formatMoney(subtotal - productDiscount);
    const discountLine = $("[data-checkout-discount-line]");
    if (discountLine) discountLine.hidden = orderDiscount <= 0;
    if ($("[data-checkout-discount]")) $("[data-checkout-discount]").textContent = `−${formatMoney(orderDiscount)}`;
    if ($("[data-checkout-promotion-code]")) {
      const details = [];
      if (activePromotionQuote.promotion_code) details.push(activePromotionQuote.promotion_code);
      const minimum = Number(activePromotionQuote.promotion_min_order_value || 0);
      if (minimum > 0) details.push(`Prag minim: ${formatMoney(minimum)}`);
      $("[data-checkout-promotion-code]").textContent = details.length ? `· ${details.join(" · ")}` : "";
    }
    const total = subtotal - productDiscount - orderDiscount + cost;
    const hasVat = Boolean(config?.tax?.vat_payer);
    $("[data-checkout-shipping-cost]").textContent = cost === 0 ? "Gratuit" : formatMoney(cost);
    $("[data-checkout-total]").textContent = formatMoney(total);
    if ($("[data-checkout-subtotal-label]")) $("[data-checkout-subtotal-label]").textContent = hasVat ? "Subtotal (TVA inclus)" : "Subtotal";
    if ($("[data-checkout-total-label]")) $("[data-checkout-total-label]").textContent = hasVat ? "Total de plată (TVA inclus)" : "Total de plată";
    updateOptionStates();
    return { subtotal, discountTotal: discount, shippingCost: cost, total, vatPayer: hasVat };
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
      [formField(form, "customer_name"), "Completează numele și prenumele."],
      [formField(form, "customer_phone"), "Completează numărul de telefon."],
      [formField(form, "address"), "Completează adresa de livrare."],
      [formField(form, "city"), "Completează localitatea."]
    ];
    if (formField(form, "customer_type")?.value === "company") {
      requiredFields.push(
        [formField(form, "company_name"), "Completează denumirea firmei."],
        [formField(form, "company_cui"), "Completează CUI/CIF-ul firmei."],
        [formField(form, "company_registration_number"), "Completează numărul de la Registrul Comerțului."],
        [formField(form, "company_address"), "Completează sediul social."]
      );
    }
    requiredFields.forEach(([field, message]) => {
      if (!String(field?.value || "").trim()) {
        invalidate(field, message);
        errors.push(field);
      }
    });
    const phoneField = formField(form, "customer_phone");
    const phone = String(phoneField?.value || "").replace(/\D/g, "");
    if (phone && phone.length < 7) {
      invalidate(phoneField, "Introdu un număr de telefon valid.");
      errors.push(phoneField);
    }
    const emailField = formField(form, "customer_email");
    const email = String(emailField?.value || "").trim();
    if (!email) {
      invalidate(emailField, "Completează adresa de e-mail.");
      errors.push(emailField);
    } else if (email && !emailField.checkValidity()) {
      invalidate(emailField, "Introdu o adresă de e-mail validă.");
      errors.push(emailField);
    }
    const confirmationField = formField(form, "confirm_order");
    if (!confirmationField?.checked) {
      confirmationField?.closest("label")?.classList.add("is-invalid");
      errors.push(confirmationField);
    }
    const termsField = formField(form, "accept_terms");
    if (!termsField?.checked) {
      termsField?.closest("label")?.classList.add("is-invalid");
      errors.push(termsField);
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
      const initialCart = cartRows();
      if (!initialCart.length) {
        loading.hidden = true;
        empty.hidden = false;
        return;
      }
      const [rawProducts, config] = await Promise.all([checkoutCatalog(initialCart), api("publicShopConfig")]);
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
      form.querySelectorAll("[data-checkout-customer-type]").forEach(button => button.addEventListener("click", () => setCheckoutCustomerType(form, button.dataset.checkoutCustomerType)));
      setCheckoutCustomerType(form, formField(form, "customer_type")?.value || "individual");
      await hydrateCheckoutCustomer(form);
      form.hidden = false;
      updateSubmitLabel(form, submit);

      const promoInput = $("[data-checkout-promo-input]");
      const promoApply = $("[data-checkout-promo-apply]");
      promoInput?.addEventListener("input", () => {
        promoInput.value = promoInput.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
        $("[data-checkout-promo-message]")?.removeAttribute("class");
      });
      const applyManualPromotion = async () => {
        const code = String(promoInput?.value || "").trim().toUpperCase();
        if (!code) {
          manualPromotionCode = "";
          await refreshPromotionQuote(cartRows(), config, "", true);
          return;
        }
        const applied = await refreshPromotionQuote(cartRows(), config, code, true);
        if (!applied && promoInput) promoInput.focus();
      };
      promoApply?.addEventListener("click", () => void applyManualPromotion());
      promoInput?.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); void applyManualPromotion(); } });

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
        const shouldSaveAddress = Boolean(fields.save_address_for_later && customerCheckout.selectedAddressId === "new");
        delete fields.save_address_for_later;
        submit.disabled = true;
        submit.querySelector("strong").textContent = "Se trimite comanda…";
        message.textContent = "Rezervăm produsele și înregistrăm comanda.";

        try {
          const totals = updateTotals(currentCart, config);
          if (shouldSaveAddress) {
            message.textContent = "Salvăm adresa în contul tău…";
            const savedAddress = await saveCheckoutAddress(fields);
            if (!savedAddress?.id) throw new Error("Adresa nu a putut fi salvată în cont. Încearcă din nou sau debifează opțiunea de salvare.");
            customerCheckout.addresses = [
              savedAddress,
              ...customerCheckout.addresses.filter(address => String(address.id) !== String(savedAddress.id))
            ];
            customerCheckout.selectedAddressId = String(savedAddress.id);
            renderCheckoutAddresses(form);
            message.textContent = "Adresa a fost salvată în cont. Înregistrăm comanda…";
          }
          const order = await api("createPublicOrder", {
            method: "POST",
            body: { ...fields, items, coupon_code: manualPromotionCode, device_token: shopDeviceToken(), return_base_url: window.location.origin }
          });
          const shipping = config.shipping_methods.find(row => String(row.id) === String(fields.shipping_method_id));
          const payment = payments.find(row => row.id === fields.payment_method);
          const apiItems = new Map((Array.isArray(order.items) ? order.items : []).map(item => [String(item.product_id || ""), item]));
          const receiptItems = currentCart.map(item => {
            const product = products[item.id] || {};
            const apiItem = apiItems.get(String(product.apiId || "")) || {};
            const quantity = Number(item.quantity || 1);
            const unitPrice = Number(apiItem.unit_price ?? productPrice(product));
            return {
              id: String(item.id || ""),
              apiId: String(product.apiId || apiItem.product_id || ""),
              name: String(apiItem.product_name || product.name || "Produs G-Trots"),
              quantity,
              unitPrice,
              lineTotal: Number(apiItem.line_total ?? unitPrice * quantity),
              discountTotal: Number(apiItem.discount_total ?? 0),
              discountedUnitPrice: Number(apiItem.discounted_unit_price ?? unitPrice),
              discountedLineTotal: Number(apiItem.discounted_line_total ?? apiItem.line_total ?? unitPrice * quantity),
              image: Number(product.image || 0),
              imageUrl: safeUrl(apiItem.image_url || product.imageUrl),
              url: String(product.url || "/magazin.html")
            };
          });
          try {
            sessionStorage.setItem(ORDER_STATE_KEY, JSON.stringify({
              orderNumber: String(order.order_number || ""),
              orderId: String(order.id || ""),
              trackingToken: String(order.tracking_token || ""),
              paymentMethod: String(fields.payment_method || ""),
              paymentLabel: String(payment?.label || ""),
              shippingLabel: String(shipping?.name || ""),
              subtotal: Number(order.subtotal ?? totals.subtotal),
              discountTotal: Number(order.discount_total ?? totals.discountTotal ?? 0),
              promotionCode: String(order.promotion_code || activePromotionQuote.promotion_code || ""),
              promotionScope: String(order.promotion_scope || activePromotionQuote.promotion_scope || ""),
              shippingCost: Number(order.shipping_cost ?? totals.shippingCost),
              total: Number(order.total ?? totals.total),
              vatPayer: Boolean(order.vat_payer ?? totals.vatPayer),
              customerName: String(order.customer_name || fields.customer_name || ""),
              customerContactName: String(order.customer_contact_name || order.customer_name || fields.customer_name || ""),
              customerDisplayName: String(order.customer_display_name || (fields.customer_type === "company" ? fields.company_name : fields.customer_name) || ""),
              customerPhone: String(order.customer_phone || fields.customer_phone || ""),
              customerEmail: String(order.customer_email || fields.customer_email || ""),
              customerType: String(order.customer_type || fields.customer_type || "individual"),
              companyName: String(order.company_name || fields.company_name || ""),
              companyCui: String(order.company_cui || fields.company_cui || ""),
              companyRegistrationNumber: String(order.company_registration_number || fields.company_registration_number || ""),
              companyAddress: String(order.company_address || fields.company_address || ""),
              deliveryAddress: [fields.address, fields.city, fields.county, fields.postal_code].filter(Boolean).join(", "),
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
