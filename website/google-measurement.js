(() => {
  if (window.GTrotsGoogle) return;

  const MEASUREMENT_ID = "G-6EWM36QSDY";
  const GTM_CONTAINER_ID = "GTM-K2N32ZFD";
  const CONSENT_KEY = "g-trots-cookie-consent-v1";
  const CART_KEY = "g-trots-cart-products-v1";
  const FAVORITES_KEY = "g-trots-favorite-products-v1";
  const PURCHASES_KEY = "g-trots-ga4-purchases-v1";
  const REFUNDS_KEY = "g-trots-ga4-refunds-v1";
  const AUTH_EVENT_KEY = "g-trots-ga4-auth-pending-v1";
  const SELECT_EVENT_KEY = "g-trots-ga4-select-pending-v1";
  const ATTRIBUTION_KEY = "g-trots-ga4-session-attribution-v1";
  const LANDING_EVENT_KEY = "g-trots-ga4-landing-sent-v1";
  const CURRENCY = "RON";
  const once = new Set();
  const transientPurchases = new Set();
  const transientRefunds = new Set();

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function readConsent() {
    const value = readJson(CONSENT_KEY, null);
    return value && value.version === 1 ? value : null;
  }

  function consentState(value = readConsent()) {
    return {
      analytics_storage: value?.analytics ? "granted" : "denied",
      ad_storage: value?.marketing ? "granted" : "denied",
      ad_user_data: value?.marketing ? "granted" : "denied",
      ad_personalization: value?.marketing ? "granted" : "denied",
      functionality_storage: value?.preferences ? "granted" : "denied",
      personalization_storage: value?.preferences ? "granted" : "denied",
      security_storage: "granted"
    };
  }

  function analyticsStorageAllowed() {
    return readConsent()?.analytics === true;
  }

  function expireFirstPartyCookies(prefixes) {
    try {
      const baseDomain = location.hostname.replace(/^www\./i, "");
      document.cookie.split(";").forEach(part => {
        const name = part.split("=", 1)[0].trim();
        if (!name || !prefixes.some(prefix => name === prefix || name.startsWith(prefix))) return;
        const removal = `${encodeURIComponent(name)}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`;
        document.cookie = removal;
        document.cookie = `${removal}; Domain=${location.hostname}`;
        document.cookie = `${removal}; Domain=.${baseDomain}`;
      });
    } catch { /* cookie-urile pot fi blocate de browser */ }
  }

  function clearDisallowedMeasurementStorage(consent = readConsent()) {
    if (!consent?.analytics) {
      try {
        localStorage.removeItem(PURCHASES_KEY);
        localStorage.removeItem(REFUNDS_KEY);
        localStorage.removeItem(AUTH_EVENT_KEY);
        sessionStorage.removeItem(SELECT_EVENT_KEY);
        sessionStorage.removeItem(ATTRIBUTION_KEY);
        sessionStorage.removeItem(LANDING_EVENT_KEY);
      } catch { /* stocarea poate fi indisponibilă */ }
      expireFirstPartyCookies(["_ga"]);
    }
    if (!consent?.marketing) expireFirstPartyCookies(["_gcl_", "_gac_"]);
  }

  window.gtag("consent", "default", { ...consentState(), wait_for_update: 500 });
  window.gtag("set", "url_passthrough", true);
  window.gtag("set", "ads_data_redaction", true);

  function loadGoogleTag() {
    if (/^GTM-[A-Z0-9]+$/.test(GTM_CONTAINER_ID)) {
      window.gtag("js", new Date());
      window.gtag("config", MEASUREMENT_ID, {
        send_page_view: false,
        anonymize_ip: true,
        allow_google_signals: Boolean(readConsent()?.marketing)
      });
      window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(GTM_CONTAINER_ID)}`;
      document.head.append(script);
      return;
    }
    window.gtag("js", new Date());
    window.gtag("config", MEASUREMENT_ID, {
      send_page_view: true,
      anonymize_ip: true,
      allow_google_signals: Boolean(readConsent()?.marketing)
    });
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
    document.head.append(script);
  }

  function updateConsent(value) {
    window.gtag("consent", "update", consentState(value));
    window.gtag("set", "allow_google_signals", Boolean(value?.marketing));
  }

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function priceFromText(value) {
    const clean = String(value || "").replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
    return finite(clean);
  }

  function productById(id) {
    return window.GTrotsFavorites?.products?.[String(id || "")] || null;
  }

  function productItem(product, quantity = 1, index) {
    if (!product) return null;
    const raw = product.raw || {};
    const item = {
      item_id: String(product.apiId || raw.id || product.id || product.slug || ""),
      item_name: String(product.name || raw.name || "Produs G-Trots"),
      affiliation: "G-Trots",
      item_brand: String(raw.manufacturer_name || product.manufacturerName || "G-Trots"),
      item_category: String(product.category || raw.category_name || "Produse"),
      item_variant: String(raw.sku || ""),
      price: finite(product.priceValue ?? product.basePriceValue, priceFromText(product.price)),
      quantity: Math.max(1, finite(quantity, 1))
    };
    if (Number.isInteger(index)) item.index = index;
    return item;
  }

  function cartItems(cart = readJson(CART_KEY, [])) {
    return (Array.isArray(cart) ? cart : [])
      .map(row => productItem(productById(row?.id), row?.quantity || 1))
      .filter(Boolean);
  }

  function ecommerceValue(items) {
    const total = items.reduce((sum, item) => sum + finite(item.price) * finite(item.quantity, 1), 0);
    return Math.round((total + Number.EPSILON) * 100) / 100;
  }

  function cleanParams(params) {
    return Object.fromEntries(Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && value !== ""));
  }

  function limited(value, maximum = 100) {
    return String(value || "").trim().slice(0, maximum);
  }

  function readSessionJson(key, fallback) {
    try {
      const value = JSON.parse(sessionStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function currentAttribution() {
    const saved = analyticsStorageAllowed() ? readSessionJson(ATTRIBUTION_KEY, null) : null;
    if (saved?.landing_page) return saved;

    const query = new URLSearchParams(location.search);
    let referrerHost = "";
    try { referrerHost = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./i, "") : ""; }
    catch { referrerHost = ""; }
    const gclid = limited(query.get("gclid"), 180);
    const gbraid = limited(query.get("gbraid"), 180);
    const wbraid = limited(query.get("wbraid"), 180);
    const clickId = gclid || gbraid || wbraid;
    const clickIdType = gclid ? "gclid" : gbraid ? "gbraid" : wbraid ? "wbraid" : "";
    const explicitSource = limited(query.get("utm_source"));
    const explicitMedium = limited(query.get("utm_medium"));
    const source = explicitSource || (clickId ? "google" : referrerHost) || "direct";
    const searchReferrer = /(^|\.)(google|bing|yahoo|duckduckgo|ecosia)\./i.test(referrerHost);
    const medium = explicitMedium || (clickId ? "cpc" : source === "direct" ? "none" : searchReferrer ? "organic" : "referral");
    const paidMedium = /^(?:cpc|ppc|paid|paid_search|paid_social|display|cpm|cpv|affiliate)$/i.test(medium);
    const trafficChannel = clickId || paidMedium
      ? "paid"
      : medium === "organic" || searchReferrer
        ? "organic"
        : source === "direct"
          ? "direct"
          : "referral";
    const attribution = cleanParams({
      landing_page: limited(`${location.pathname}${location.search}`, 100),
      landing_page_url: limited(location.href, 1000),
      initial_referrer: limited(document.referrer, 420),
      traffic_source: source,
      traffic_medium: medium,
      traffic_channel: trafficChannel,
      traffic_campaign: limited(query.get("utm_campaign")),
      traffic_content: limited(query.get("utm_content")),
      traffic_term: limited(query.get("utm_term")),
      traffic_click_id: clickId,
      traffic_click_id_type: clickIdType
    });
    if (analyticsStorageAllowed()) {
      try { sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution)); } catch { /* fără persistență */ }
    }
    return attribution;
  }

  function interactionLocation(element) {
    const explicit = element?.closest?.("[data-analytics-location]")?.dataset?.analyticsLocation;
    if (explicit) return limited(explicit);
    if (element?.closest?.("header")) return "header";
    if (element?.closest?.("footer")) return "footer";
    if (element?.closest?.("form")) return "form";
    if (element?.closest?.("aside")) return "aside";
    return "content";
  }

  function track(eventName, params = {}, context = {}) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(String(eventName || ""))) return;
    const cleanEventParams = cleanParams(params);
    window.gtag("event", eventName, { ...cleanEventParams, send_to: MEASUREMENT_ID });
    document.dispatchEvent(new CustomEvent("g-trots:analytics-event", {
      detail: { eventName, params: cleanEventParams, context, timestamp: Date.now() }
    }));
  }

  function trackLandingPage() {
    if (!analyticsStorageAllowed()) return false;
    try { if (sessionStorage.getItem(LANDING_EVENT_KEY) === "1") return false; }
    catch { /* fără persistență */ }
    track("landing_page_view", currentAttribution());
    try { sessionStorage.setItem(LANDING_EVENT_KEY, "1"); } catch { /* fără persistență */ }
    return true;
  }

  function trackContact(method, params = {}) {
    const consent = readConsent();
    if (!consent?.analytics && !consent?.marketing) return false;
    const normalizedMethod = method === "phone" ? "phone" : "whatsapp";
    track(normalizedMethod === "phone" ? "phone_click" : "whatsapp_click", {
      ...currentAttribution(),
      page_path: limited(`${location.pathname}${location.search}`, 100),
      contact_method: normalizedMethod,
      ...cleanParams(params)
    });
    return true;
  }

  function trackEcommerce(eventName, items, params = {}) {
    const normalized = (Array.isArray(items) ? items : []).filter(Boolean).slice(0, 200);
    if (!normalized.length) return;
    track(eventName, { currency: CURRENCY, value: ecommerceValue(normalized), ...params, items: normalized });
  }

  function onceTrack(key, callback) {
    if (once.has(key)) return;
    once.add(key);
    callback();
  }

  function normalizedSearchTerm(value) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, 100);
  }

  function currentSearchTerm(trigger) {
    const explicit = trigger?.dataset?.popularSearch;
    const input = document.querySelector('input[type="search"],#product-search,[data-smart-search-input]');
    return normalizedSearchTerm(explicit || input?.value);
  }

  function trackSearch(term) {
    const searchTerm = normalizedSearchTerm(term);
    if (!searchTerm) return;
    const key = searchTerm.toLocaleLowerCase("ro-RO");
    onceTrack(`search:${key}`, () => track("search", { search_term: searchTerm }));
    onceTrack(`view_search_results:${key}`, () => track("view_search_results", { search_term: searchTerm }));
  }

  let previousCart = readJson(CART_KEY, []);
  let previousFavorites = readJson(FAVORITES_KEY, []);

  function quantityMap(rows) {
    return new Map((Array.isArray(rows) ? rows : []).map(row => [String(row?.id || ""), finite(row?.quantity, 1)]));
  }

  function handleCartChanged(nextRows) {
    const before = quantityMap(previousCart);
    const after = quantityMap(nextRows);
    new Set([...before.keys(), ...after.keys()]).forEach(id => {
      const delta = finite(after.get(id)) - finite(before.get(id));
      if (!delta) return;
      const item = productItem(productById(id), Math.abs(delta));
      if (item) trackEcommerce(delta > 0 ? "add_to_cart" : "remove_from_cart", [item]);
    });
    previousCart = Array.isArray(nextRows) ? nextRows : [];
  }

  function handleFavoritesChanged(nextIds) {
    const before = new Set(Array.isArray(previousFavorites) ? previousFavorites.map(String) : []);
    const after = new Set(Array.isArray(nextIds) ? nextIds.map(String) : []);
    after.forEach(id => {
      if (!before.has(id)) {
        const item = productItem(productById(id));
        if (item) trackEcommerce("add_to_wishlist", [item]);
      }
    });
    before.forEach(id => {
      if (!after.has(id)) {
        const item = productItem(productById(id));
        if (item) trackEcommerce("remove_from_wishlist", [item]);
      }
    });
    previousFavorites = Array.isArray(nextIds) ? nextIds : [];
  }

  function visibleCatalogItems() {
    return [...document.querySelectorAll(".product-card")]
      .filter(card => !card.hidden && getComputedStyle(card).display !== "none")
      .slice(0, 200)
      .map((card, index) => productItem(productById(card.dataset.productId), 1, index))
      .filter(Boolean);
  }

  function trackPageCommerce() {
    const path = location.pathname.replace(/\.html$/, "").replace(/\/+$/, "") || "/";
    if (path === "/magazin") {
      const items = visibleCatalogItems();
      if (items.length) onceTrack(`view_item_list:${items.map(item => item.item_id).join("|")}`, () => trackEcommerce("view_item_list", items, { item_list_id: "catalog", item_list_name: "Catalog G-Trots" }));
    }
    if (/^\/magazin\/produs\//.test(path)) {
      const item = productItem(productById(document.body.dataset.productId));
      if (item) onceTrack(`view_item:${item.item_id}`, () => trackEcommerce("view_item", [item]));
    }
    if (path === "/cos") {
      const items = cartItems();
      if (items.length) onceTrack("view_cart", () => trackEcommerce("view_cart", items));
    }
    if (path === "/checkout") {
      const items = cartItems();
      if (items.length) onceTrack("begin_checkout", () => trackEcommerce("begin_checkout", items));
    }
    const searchTerm = normalizedSearchTerm(new URLSearchParams(location.search).get("q") || new URLSearchParams(location.search).get("search"));
    if (searchTerm) onceTrack(`view_search_results:${searchTerm.toLocaleLowerCase("ro-RO")}`, () => track("view_search_results", { search_term: searchTerm }));
  }

  function schedulePageCommerceTracking() {
    [120, 600, 1600, 4000].forEach(delay => window.setTimeout(trackPageCommerce, delay));
  }

  function formName(form) {
    return String(form.id || form.getAttribute("name") || form.className || "formular").trim().replace(/\s+/g, "_").slice(0, 100);
  }

  function bindInteractions() {
    document.addEventListener("click", event => {
      const link = event.target.closest("a[href]");
      if (link) {
        let url = null;
        try { url = new URL(link.href, location.href); } catch { /* URL invalid */ }
        if (url?.protocol === "tel:") trackContact("phone", { link_url: url.href, link_text: link.textContent.trim().slice(0, 100), interaction_location: interactionLocation(link) });
        if (url && /(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)$/i.test(url.hostname)) {
          trackContact("whatsapp", { link_url: `${url.origin}${url.pathname}`, link_text: link.textContent.trim().slice(0, 100), interaction_location: interactionLocation(link) });
        }
      }
      const searchTrigger = event.target.closest("[data-smart-search-submit],[data-smart-search-all],[data-search-choice]");
      if (searchTrigger) trackSearch(currentSearchTerm(searchTrigger));

      const productLink = event.target.closest(".product-card-link,.favorite-product-link,.order-receipt-product-image,.smart-search-result");
      const card = productLink?.closest("[data-product-id],.product-card,[data-cart-card]");
      const productId = card?.dataset.productId || card?.dataset.cartCard || document.body.dataset.productId;
      const item = productItem(productById(productId));
      if (productLink && item) {
        const listId = productLink.matches(".smart-search-result") ? "search_results" : location.pathname.includes("favorite") ? "favorites" : "catalog";
        const url = productLink instanceof HTMLAnchorElement ? new URL(productLink.href, location.href) : null;
        const params = {
          item_list_id: listId,
          item_list_name: listId === "search_results" ? "Rezultate căutare" : listId === "favorites" ? "Favorite" : "Catalog G-Trots"
        };
        if (url?.origin === location.origin && /^\/magazin\/produs\//.test(url.pathname)) {
          if (analyticsStorageAllowed()) {
            try { sessionStorage.setItem(SELECT_EVENT_KEY, JSON.stringify({ item, params })); }
            catch { trackEcommerce("select_item", [item], params); }
          } else {
            trackEcommerce("select_item", [item], params);
          }
        } else {
          trackEcommerce("select_item", [item], params);
        }
      }
    }, true);

    document.addEventListener("focusin", event => {
      const form = event.target.closest("form");
      if (!form || form.matches("[data-checkout-form]")) return;
      onceTrack(`form_start:${formName(form)}`, () => track("form_start", { form_id: formName(form), form_destination: form.action || location.href }));
    });

    document.addEventListener("submit", event => {
      const form = event.target.closest("form");
      if (!form) return;
      if (form.matches("[data-checkout-form]")) {
        const items = cartItems();
        const data = new FormData(form);
        const shippingTier = String(data.get("shipping_method_id") || "");
        const paymentType = String(data.get("payment_method") || "");
        if (items.length && shippingTier) onceTrack(`add_shipping_info:${shippingTier}`, () => trackEcommerce("add_shipping_info", items, { shipping_tier: shippingTier }));
        if (items.length && paymentType) onceTrack(`add_payment_info:${paymentType}`, () => trackEcommerce("add_payment_info", items, { payment_type: paymentType }));
        return;
      }
      const name = formName(form);
      track("form_submit", { form_id: name, form_destination: form.action || location.href });
    }, true);

    document.addEventListener("change", event => {
      if (event.target.matches('input[name="shipping_method_id"]')) trackEcommerce("add_shipping_info", cartItems(), { shipping_tier: event.target.closest("label")?.textContent?.trim().slice(0, 100) });
      if (event.target.matches('input[name="payment_method"]')) trackEcommerce("add_payment_info", cartItems(), { payment_type: event.target.value });
    });

    document.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      const input = event.target.closest('input[type="search"],#product-search,[data-smart-search-input]');
      trackSearch(input?.value);
    });
  }

  function trackPurchase(state) {
    const transactionId = String(state?.orderNumber || state?.order_number || state?.orderId || state?.order_id || "").trim();
    if (!transactionId) return false;
    const sent = new Set([
      ...(analyticsStorageAllowed() ? readJson(PURCHASES_KEY, []).map(String) : []),
      ...transientPurchases,
    ]);
    if (sent.has(transactionId)) return false;
    const items = (Array.isArray(state?.items) ? state.items : []).map((item, index) => ({
      item_id: String(item.apiId || item.product_id || item.id || ""),
      item_name: String(item.name || item.product_name || "Produs G-Trots"),
      affiliation: "G-Trots",
      item_brand: String(item.brand || item.manufacturer_name || "G-Trots"),
      item_category: String(item.category || item.category_name || "Produse"),
      item_variant: String(item.sku || item.product_sku || ""),
      price: finite(item.discountedUnitPrice ?? item.discounted_unit_price ?? item.unitPrice ?? item.unit_price),
      discount: finite(item.discountTotal ?? item.discount_total) / Math.max(1, finite(item.quantity, 1)),
      quantity: Math.max(1, finite(item.quantity, 1)),
      index
    })).filter(item => item.item_id || item.item_name);
    const merchandiseValue = ecommerceValue(items);
    track("purchase", {
      ...currentAttribution(),
      transaction_id: transactionId,
      affiliation: "G-Trots",
      currency: CURRENCY,
      value: merchandiseValue,
      order_total: finite(state.total),
      tax: finite(state.vatTotal ?? state.vat_total),
      shipping: finite(state.shippingCost ?? state.shipping_cost),
      coupon: String(state.promotionCode || state.promotion_code || ""),
      payment_type: String(state.paymentMethod || state.payment_method || ""),
      items
    }, {
      user_data: {
        email: String(state.customerEmail || state.customer_email || ""),
        phone: String(state.customerPhone || state.customer_phone || ""),
        first_name: String(state.customerFirstName || state.customer_first_name || ""),
        last_name: String(state.customerLastName || state.customer_last_name || ""),
        city: String(state.customerCity || state.customer_city || ""),
        state: String(state.customerCounty || state.customer_county || ""),
        postal_code: String(state.customerPostalCode || state.customer_postal_code || ""),
        country: "ro",
        external_id: String(state.customerId || state.customer_id || "")
      }
    });
    sent.add(transactionId);
    transientPurchases.add(transactionId);
    if (analyticsStorageAllowed()) {
      try { localStorage.setItem(PURCHASES_KEY, JSON.stringify([...sent].slice(-500))); } catch { /* fără persistență */ }
    }
    return true;
  }

  function promotionItems(promotions) {
    return (Array.isArray(promotions) ? promotions : [promotions])
      .filter(Boolean)
      .slice(0, 200)
      .map((promotion, index) => ({
        promotion_id: String(promotion.id || promotion.promotion_id || promotion.code || `promotion-${index + 1}`),
        promotion_name: String(promotion.title || promotion.promotion_name || promotion.banner_text || "Ofertă G-Trots"),
        creative_name: String(promotion.banner_text || promotion.description || promotion.title || "Ofertă G-Trots"),
        creative_slot: String(promotion.creative_slot || "global_promotion_bar"),
        index
      }));
  }

  function trackPromotion(eventName, promotions) {
    const items = promotionItems(promotions);
    if (items.length) track(eventName, { items });
  }

  function trackRefund(order) {
    const transactionId = String(order?.order_number || order?.orderNumber || order?.order_id || order?.id || "").trim();
    if (!transactionId) return false;
    const sent = new Set([
      ...(analyticsStorageAllowed() ? readJson(REFUNDS_KEY, []).map(String) : []),
      ...transientRefunds,
    ]);
    if (sent.has(transactionId)) return false;
    const items = (Array.isArray(order?.items) ? order.items : []).map((item, index) => {
      const quantity = finite(item.return_accepted_quantity ?? item.accepted_quantity ?? item.quantity, 0);
      if (quantity <= 0) return null;
      return {
        item_id: String(item.product_id || item.id || item.product_sku || ""),
        item_name: String(item.product_name || item.name || "Produs G-Trots"),
        price: finite(item.discounted_unit_price ?? item.unit_price ?? item.unitPrice),
        quantity,
        index
      };
    }).filter(Boolean);
    track("refund", {
      transaction_id: transactionId,
      affiliation: "G-Trots",
      currency: CURRENCY,
      value: finite(order.return_refund_amount ?? order.refund_amount ?? order.total),
      coupon: String(order.promotion_code || ""),
      items
    });
    sent.add(transactionId);
    transientRefunds.add(transactionId);
    if (analyticsStorageAllowed()) {
      try { localStorage.setItem(REFUNDS_KEY, JSON.stringify([...sent].slice(-500))); } catch { /* fără persistență */ }
    }
    return true;
  }

  function trackRefundedOrders(orders) {
    (Array.isArray(orders) ? orders : []).filter(order => order?.status === "refunded" || order?.payment_status === "refunded").forEach(trackRefund);
  }

  document.addEventListener("g-trots:consent-changed", event => {
    updateConsent(event.detail);
    clearDisallowedMeasurementStorage(event.detail);
    if (event.detail?.analytics) trackLandingPage();
  });
  document.addEventListener("g-trots:cart-changed", event => handleCartChanged(event.detail));
  document.addEventListener("g-trots:favorites-changed", event => handleFavoritesChanged(event.detail));
  document.addEventListener("g-trots:live-products", schedulePageCommerceTracking);
  document.addEventListener("g-trots:purchase-ready", event => trackPurchase(event.detail));
  document.addEventListener("g-trots:promotions-viewed", event => trackPromotion("view_promotion", event.detail));
  document.addEventListener("g-trots:promotion-selected", event => trackPromotion("select_promotion", event.detail));
  document.addEventListener("g-trots:refund-ready", event => trackRefund(event.detail));

  window.GTrotsGoogle = {
    measurementId: MEASUREMENT_ID,
    containerId: GTM_CONTAINER_ID,
    track,
    trackContact,
    trackLandingPage,
    trackEcommerce,
    trackPurchase,
    trackRefund,
    trackRefundedOrders,
    trackPromotion,
    updateConsent,
    itemFromProduct: productItem
  };

  clearDisallowedMeasurementStorage();

  const pendingAuth = analyticsStorageAllowed() ? readJson(AUTH_EVENT_KEY, null) : null;
  if (pendingAuth && ["login", "sign_up"].includes(pendingAuth.event)) {
    track(pendingAuth.event, { method: String(pendingAuth.method || "email") });
    try { localStorage.removeItem(AUTH_EVENT_KEY); } catch { /* fără persistență */ }
  }
  if (window.GTrotsPendingPurchase) {
    trackPurchase(window.GTrotsPendingPurchase);
    delete window.GTrotsPendingPurchase;
  }
  if (analyticsStorageAllowed()) {
    try {
      const pendingSelect = JSON.parse(sessionStorage.getItem(SELECT_EVENT_KEY) || "null");
      if (pendingSelect?.item) trackEcommerce("select_item", [pendingSelect.item], pendingSelect.params || {});
      sessionStorage.removeItem(SELECT_EVENT_KEY);
    } catch { /* sessionStorage poate fi indisponibil */ }
  }
  document.dispatchEvent(new CustomEvent("g-trots:google-ready"));

  loadGoogleTag();
  bindInteractions();
  trackLandingPage();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedulePageCommerceTracking, { once: true });
  else schedulePageCommerceTracking();
})();
