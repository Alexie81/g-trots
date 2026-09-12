(() => {
  if (window.GTrotsMeta) return;

  const PIXEL_ID = "1077035528384445";
  const CONSENT_KEY = "g-trots-cookie-consent-v1";
  const PURCHASES_KEY = "g-trots-meta-purchases-v1";
  const CONFIG_URL = "/shop-api/api-v2.php?action=publicMetaConfig";
  const CONVERSION_URL = "/shop-api/api-v2.php?action=metaConversion";
  const sentPageKeys = new Set();
  let pixelLoaded = false;
  let conversionApiEnabled = false;

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return parsed == null ? fallback : parsed;
    } catch { return fallback; }
  }

  function marketingAllowed() {
    const consent = readJson(CONSENT_KEY, null);
    return consent?.version === 1 && consent.marketing === true;
  }

  function clean(value) {
    return Object.fromEntries(Object.entries(value || {}).filter(([, item]) => item !== undefined && item !== null && item !== ""));
  }

  function eventId() {
    const bytes = new Uint8Array(12);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    const random = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("") || Math.random().toString(36).slice(2);
    return `gt_${Date.now()}_${random}`;
  }

  function cookie(name) {
    const prefix = `${name}=`;
    return document.cookie.split(";").map(part => part.trim()).find(part => part.startsWith(prefix))?.slice(prefix.length) || "";
  }

  function expireMetaCookies() {
    try {
      const domain = location.hostname.replace(/^www\./i, "");
      ["_fbp", "_fbc"].forEach(name => {
        const removal = `${name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`;
        document.cookie = removal;
        document.cookie = `${removal}; Domain=${location.hostname}`;
        document.cookie = `${removal}; Domain=.${domain}`;
      });
    } catch { /* cookie-urile pot fi blocate */ }
  }

  function ensurePixel() {
    if (!marketingAllowed()) return false;
    if (pixelLoaded) return true;
    pixelLoaded = true;
    if (!window.fbq) {
      const fbq = window.fbq = function () { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
      if (!window._fbq) window._fbq = fbq;
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = "2.0";
      fbq.queue = [];
      const script = document.createElement("script");
      script.async = true;
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.append(script);
    }
    window.fbq("consent", "grant");
    window.fbq("init", PIXEL_ID);
    return true;
  }

  function itemsData(params) {
    const items = (Array.isArray(params?.items) ? params.items : []).filter(Boolean).slice(0, 100);
    return {
      content_ids: items.map(item => String(item.item_id || "")).filter(Boolean),
      contents: items.map(item => clean({
        id: String(item.item_id || ""),
        quantity: Math.max(1, Number(item.quantity) || 1),
        item_price: Math.max(0, Number(item.price) || 0)
      })).filter(item => item.id),
      content_type: "product",
      content_name: items.length === 1 ? String(items[0].item_name || "") : undefined,
      content_category: items.length === 1 ? String(items[0].item_category || "") : undefined,
      num_items: items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0),
      currency: String(params?.currency || "RON"),
      value: Math.max(0, Number(params?.value) || 0)
    };
  }

  function mapEvent(eventName, params) {
    const items = itemsData(params);
    const mappings = {
      view_item: ["ViewContent", false, items],
      view_item_list: ["ViewCategory", true, items],
      select_item: ["SelectItem", true, items],
      search: ["Search", false, { search_string: String(params?.search_term || "") }],
      add_to_wishlist: ["AddToWishlist", false, items],
      remove_from_wishlist: ["RemoveFromWishlist", true, items],
      add_to_cart: ["AddToCart", false, items],
      remove_from_cart: ["RemoveFromCart", true, items],
      view_cart: ["ViewCart", true, items],
      begin_checkout: ["InitiateCheckout", false, items],
      add_shipping_info: ["AddShippingInfo", true, { ...items, shipping_tier: String(params?.shipping_tier || "") }],
      add_payment_info: ["AddPaymentInfo", false, { ...items, payment_type: String(params?.payment_type || "") }],
      form_start: ["FormStart", true, { form_id: String(params?.form_id || "") }],
      form_submit: ["FormSubmit", true, { form_id: String(params?.form_id || "") }],
      phone_click: ["Contact", false, { contact_method: "phone" }],
      whatsapp_click: ["Contact", false, { contact_method: "whatsapp" }],
      click_to_call: ["Contact", false, { contact_method: "phone" }],
      click_whatsapp: ["Contact", false, { contact_method: "whatsapp" }],
      sign_up: ["CompleteRegistration", false, { registration_method: String(params?.method || "") }],
      login: ["Login", true, { login_method: String(params?.method || "") }],
      purchase: ["Purchase", false, { ...items, order_id: String(params?.transaction_id || ""), payment_type: String(params?.payment_type || "") }],
      refund: ["Refund", true, { ...items, order_id: String(params?.transaction_id || "") }],
      payment_failed: ["PaymentFailed", true, { ...items, order_id: String(params?.transaction_id || ""), payment_type: String(params?.payment_type || ""), failure_reason: String(params?.failure_reason || "") }],
      payment_cancelled: ["PaymentCancelled", true, { ...items, order_id: String(params?.transaction_id || ""), payment_type: String(params?.payment_type || "") }],
      view_promotion: ["ViewPromotion", true, items],
      select_promotion: ["SelectPromotion", true, items]
    };
    return mappings[eventName] || null;
  }

  function conversionUserData(context) {
    const source = context?.user_data || {};
    return clean({
      em: source.email || source.em,
      ph: source.phone || source.ph,
      fn: source.first_name || source.fn,
      ln: source.last_name || source.ln,
      ct: source.city || source.ct,
      st: source.state || source.st,
      zp: source.postal_code || source.zp,
      country: source.country || "ro",
      external_id: source.external_id,
      fbp: cookie("_fbp"),
      fbc: cookie("_fbc")
    });
  }

  function sendConversion(name, id, data, context) {
    if (!conversionApiEnabled || !marketingAllowed()) return;
    const payload = {
      marketing_consent: true,
      event_name: name,
      event_id: id,
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: location.href,
      user_data: conversionUserData(context),
      custom_data: data
    };
    fetch(CONVERSION_URL, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }

  function send(name, custom, isCustom = false, context = {}) {
    if (!ensurePixel() || !marketingAllowed()) return false;
    const id = eventId();
    const data = clean(custom);
    window.fbq(isCustom ? "trackCustom" : "track", name, data, { eventID: id });
    sendConversion(name, id, data, context);
    return true;
  }

  function pageView() {
    const key = `PageView:${location.pathname}${location.search}`;
    if (sentPageKeys.has(key)) return;
    if (send("PageView", {}, false)) sentPageKeys.add(key);
  }

  function mirror(detail) {
    if (!marketingAllowed()) return;
    const mapped = mapEvent(String(detail?.eventName || ""), detail?.params || {});
    if (!mapped) return;
    const [name, isCustom, data] = mapped;
    if (name === "Purchase") {
      const transactionId = String(detail?.params?.transaction_id || "");
      const sent = new Set(readJson(PURCHASES_KEY, []).map(String));
      if (!transactionId || sent.has(transactionId)) return;
      if (send(name, data, isCustom, detail?.context || {})) {
        sent.add(transactionId);
        try { localStorage.setItem(PURCHASES_KEY, JSON.stringify([...sent].slice(-500))); } catch { /* fara persistenta */ }
      }
      return;
    }
    const ids = Array.isArray(data?.content_ids) ? data.content_ids.join("|") : "";
    const pageKey = ["ViewContent", "ViewCategory"].includes(name) ? `${name}:${ids || location.pathname}` : "";
    if (pageKey && sentPageKeys.has(pageKey)) return;
    if (send(name, data, isCustom, detail?.context || {}) && pageKey) sentPageKeys.add(pageKey);
  }

  function currentProductView() {
    if (!/^\/magazin\/produs\//.test(location.pathname)) return;
    const product = window.GTrotsFavorites?.products?.[String(document.body.dataset.productId || "")];
    const item = window.GTrotsGoogle?.itemFromProduct?.(product);
    if (!item) return;
    mirror({ eventName: "view_item", params: { currency: "RON", value: Number(item.price) || 0, items: [item] } });
  }

  function activate() {
    if (!marketingAllowed()) return;
    ensurePixel();
    pageView();
    [100, 500, 1500].forEach(delay => setTimeout(currentProductView, delay));
  }

  document.addEventListener("g-trots:analytics-event", event => mirror(event.detail));
  document.addEventListener("g-trots:live-products", currentProductView);
  window.addEventListener("g-trots:consent-changed", event => {
    if (event.detail?.marketing) activate();
    else {
      if (window.fbq) window.fbq("consent", "revoke");
      pixelLoaded = false;
      try { localStorage.removeItem(PURCHASES_KEY); } catch { /* fara persistenta */ }
      expireMetaCookies();
    }
  });

  window.GTrotsMeta = { pixelId: PIXEL_ID, send, mirror, pageView, marketingAllowed };
  fetch(CONFIG_URL, { credentials: "same-origin", headers: { Accept: "application/json" } })
    .then(response => response.ok ? response.json() : null)
    .then(config => { conversionApiEnabled = Boolean(config?.conversions_api_enabled); })
    .catch(() => {});
  activate();
})();
