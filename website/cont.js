(() => {
  const API_URL = "https://g-trots.ro/shop-api/api-v2.php";
  const TOKEN_KEY = "g-trots-customer-session-v1";
  const PROFILE_KEY = "g-trots-customer-profile-v1";
  const SHOP_DEVICE_KEY = "g-trots-shop-device-v1";
  const page = document.body.dataset.customerPage || "";
  const state = { customer: null, orders: [], addresses: [], coupons: [] };
  let googleScriptPromise = null;
  const statusMeta = {
    new: ["În procesare", "Am primit comanda și o verificăm."],
    confirmed: ["Confirmată", "Comanda și plata au fost confirmate."],
    processing: ["În pregătire", "Produsele sunt pregătite pentru expediere."],
    shipped: ["Predată curierului", "Pachetul este în drum spre tine."],
    completed: ["Livrată", "Comanda a ajuns la destinație."],
    refunded: ["Rambursată", "Valoarea comenzii a fost rambursată."],
    cancelled: ["Anulată", "Comanda nu mai este procesată."]
  };

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const money = value => `${new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)} lei`;
  const date = value => value ? new Intl.DateTimeFormat("ro-RO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(String(value).replace(" ", "T"))) : "—";
  const token = () => localStorage.getItem(TOKEN_KEY) || "";
  const formField = (form, name) => form?.elements?.namedItem(name) || null;
  const safeImage = value => { try { const url = new URL(String(value || ""), location.origin); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } };
  const firstName = name => String(name || "client").trim().split(/\s+/)[0] || "client";

  function shopDeviceToken() {
    try {
      let value = String(localStorage.getItem(SHOP_DEVICE_KEY) || "").trim();
      if (/^[A-Za-z0-9_-]{20,128}$/.test(value)) return value;
      if (window.crypto?.getRandomValues) {
        const bytes = new Uint8Array(24);
        window.crypto.getRandomValues(bytes);
        value = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
      } else {
        value = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
      }
      localStorage.setItem(SHOP_DEVICE_KEY, value);
      return value;
    } catch {
      return "";
    }
  }

  async function api(action, { method = "GET", body, query = "", auth = true } = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    const deviceToken = shopDeviceToken();
    try {
      const response = await fetch(`${API_URL}?action=${encodeURIComponent(action)}${query}`, {
        method,
        headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(auth && token() ? { "X-Customer-Token": token() } : {}), ...(deviceToken ? { "X-Shop-Device": deviceToken } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.error || "Cererea nu a putut fi procesată.");
        error.code = payload.code || "";
        error.status = response.status;
        throw error;
      }
      return payload;
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = new Error("Serverul răspunde prea greu. Reîncarcă pagina pentru a încerca din nou.");
        timeoutError.code = "timeout";
        throw timeoutError;
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function validateResetLink(email, resetToken) {
    const response = await fetch("https://g-trots.ro/shop-api/reset-link-status.php", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ email, token: resetToken }),
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || "Linkul de resetare nu a putut fi verificat.");
      error.code = payload.code || "";
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function saveSession(payload) {
    localStorage.setItem(TOKEN_KEY, payload.token);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(payload.customer));
    document.dispatchEvent(new CustomEvent("g-trots:customer-changed", { detail: payload.customer }));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
    document.dispatchEvent(new CustomEvent("g-trots:customer-changed", { detail: null }));
  }

  function setMessage(scope, message, success = false) {
    const node = scope?.querySelector?.("[data-auth-message], [data-address-message], [data-settings-message], [data-profile-message]") || document.querySelector("[data-auth-message]");
    if (!node) return;
    node.textContent = message;
    node.hidden = !message;
    node.classList.toggle("success", success);
    if (!message) node.classList.remove("account-disabled");
  }

  function setBusy(form, busy) {
    form?.querySelectorAll("button,input").forEach(control => { control.disabled = busy; });
    form?.classList.toggle("is-busy", busy);
  }

  function redirectAfterAuth() {
    const requested = new URLSearchParams(location.search).get("redirect");
    const safe = requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : "/cont.html";
    location.href = safe;
  }

  function bindPasswordToggles() {
    document.querySelectorAll("[data-password-toggle]").forEach(button => button.addEventListener("click", () => {
      const input = button.parentElement?.querySelector("input");
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
      button.classList.toggle("is-visible", input.type === "text");
      button.setAttribute("aria-label", input.type === "text" ? "Ascunde parola" : "Arată parola");
    }));
  }

  const googleLogo = `
    <svg class="google-auth-logo" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z"/>
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.37l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.13H3.06v2.62A10 10 0 0 0 12 22Z"/>
      <path fill="#FBBC05" d="M6.4 13.92A6 6 0 0 1 6.08 12c0-.67.12-1.32.32-1.92V7.46H3.06A10 10 0 0 0 2 12c0 1.61.38 3.14 1.06 4.54l3.34-2.62Z"/>
      <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.94 5.46l3.34 2.62C7.19 7.7 9.4 5.95 12 5.95Z"/>
    </svg>`;

  function googleSurface(text, retry = false) {
    return `<button class="google-auth-button${retry ? " is-retry" : ""}" type="button"${retry ? " data-google-retry" : ""}>${googleLogo}<span>${text}</span><i aria-hidden="true">&gt;</i></button>`;
  }

  function ensureGoogleScript() {
    if (window.google?.accounts?.id) return Promise.resolve();
    if (googleScriptPromise) return googleScriptPromise;
    googleScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => window.google?.accounts?.id ? resolve() : reject(new Error("Google Identity Services nu este disponibil."));
      script.onerror = () => reject(new Error("Scriptul Google nu a putut fi încărcat."));
      document.head.append(script);
    }).catch(error => {
      googleScriptPromise = null;
      throw error;
    });
    return googleScriptPromise;
  }

  async function initializeGoogle() {
    const host = document.querySelector("[data-google-auth]");
    if (!host) return;
    const label = page === "register" ? "Creează cont cu Google" : "Continuă cu Google";
    if (!host.querySelector(".google-auth-button")) host.innerHTML = googleSurface(label);
    host.setAttribute("aria-busy", "true");
    try {
      const [config] = await Promise.all([
        api("customerAuthConfig", { auth: false }),
        ensureGoogleScript()
      ]);
      if (!config.google_client_id) {
        host.innerHTML = `${googleSurface("Continuă cu Google", true)}<p class="google-auth-note">Reîncearcă autentificarea securizată cu Google.</p>`;
        host.removeAttribute("aria-busy");
        host.querySelector("[data-google-retry]")?.addEventListener("click", initializeGoogle, { once: true });
        return;
      }
      host.innerHTML = `<div class="google-auth-ready">${googleSurface(label)}<div data-google-official aria-label="${label}"></div></div>`;
      window.google.accounts.id.initialize({ client_id: config.google_client_id, callback: async response => {
        try { const session = await api("customerGoogleLogin", { method: "POST", body: { credential: response.credential }, auth: false }); saveSession(session); redirectAfterAuth(); }
        catch (error) { setMessage(document, error.message); }
      }});
      window.google.accounts.id.renderButton(host.querySelector("[data-google-official]"), { theme: "outline", size: "large", shape: "pill", width: Math.max(240, host.clientWidth || 420), text: page === "register" ? "signup_with" : "signin_with", locale: "ro", logo_alignment: "left" });
      host.removeAttribute("aria-busy");
    } catch (error) {
      host.innerHTML = `${googleSurface("Reîncearcă Google", true)}<p class="google-auth-note">Conexiunea nu a răspuns. Apasă pentru a reîncerca.</p>`;
      host.removeAttribute("aria-busy");
      host.querySelector("[data-google-retry]")?.addEventListener("click", initializeGoogle, { once: true });
    }
  }

  function initializeLogin() {
    if (token()) { location.replace("/cont.html"); return; }
    const form = document.querySelector("[data-login-form]");
    form?.addEventListener("submit", async event => {
      event.preventDefault(); setMessage(form, "");
      const data = new FormData(form); setBusy(form, true);
      try { const session = await api("customerLogin", { method: "POST", body: { email: data.get("email"), password: data.get("password") }, auth: false }); saveSession(session); redirectAfterAuth(); }
      catch (error) {
        setMessage(form, error.message);
        form.querySelector("[data-auth-message]")?.classList.toggle("account-disabled", error.code === "customer_disabled");
      }
      finally { setBusy(form, false); }
    });
    form?.querySelector("[data-forgot-password]")?.addEventListener("click", async () => {
      setMessage(form, "");
      const emailField = formField(form, "email");
      const email = String(emailField?.value || "").trim();
      if (!email || !emailField?.checkValidity()) {
        emailField?.focus();
        setMessage(form, "Completează mai întâi adresa de e-mail validă a contului tău.");
        return;
      }
      setBusy(form, true);
      try {
        const result = await api("customerForgotPassword", { method: "POST", body: { email }, auth: false });
        setMessage(form, result.message || "Dacă adresa aparține unui cont activ, vei primi e-mailul pentru resetare.", true);
      } catch (error) {
        setMessage(form, error.message);
      } finally {
        setBusy(form, false);
      }
    });
    initializeGoogle();
  }

  function renderResetLinkState({ title, message, label = "Link securizat G-Trots", expired = false } = {}) {
    const statePanel = document.querySelector("[data-reset-link-state]");
    const content = document.querySelector("[data-reset-content]");
    if (!statePanel || !content) return;
    statePanel.hidden = false;
    content.hidden = true;
    statePanel.classList.toggle("is-expired", expired);
    const labelNode = statePanel.querySelector("[data-reset-state-label]");
    const titleNode = statePanel.querySelector("[data-reset-state-title]");
    const messageNode = statePanel.querySelector("[data-reset-state-message]");
    if (labelNode) labelNode.textContent = label;
    if (titleNode) titleNode.textContent = title || "Verificăm linkul primit";
    if (messageNode) messageNode.textContent = message || "Confirmăm că linkul este valid și poate fi folosit în siguranță.";
    const progress = statePanel.querySelector("[data-reset-state-progress]");
    const home = statePanel.querySelector("[data-reset-home]");
    if (progress) progress.hidden = expired;
    if (home) home.hidden = !expired;
  }

  function showResetForm() {
    const statePanel = document.querySelector("[data-reset-link-state]");
    const content = document.querySelector("[data-reset-content]");
    if (statePanel) statePanel.hidden = true;
    if (content) content.hidden = false;
  }

  function showExpiredResetLink() {
    renderResetLinkState({
      label: "Link expirat",
      title: "Linkul de resetare a expirat",
      message: "Din motive de siguranță, linkul poate fi folosit o singură dată și este valabil 30 de minute. Solicită un link nou din pagina de autentificare.",
      expired: true
    });
  }

  async function initializeResetPassword() {
    const form = document.querySelector("[data-reset-password-form]");
    if (!form) return;
    const params = new URLSearchParams(location.search);
    const resetToken = String(params.get("token") || "").trim();
    const emailField = formField(form, "email");
    if (emailField) emailField.value = String(params.get("email") || "").trim();
    if (resetToken) history.replaceState({}, "", "/resetare-parola.html");
    const password = formField(form, "password");
    password?.addEventListener("input", () => {
      const value = password.value;
      const score = [value.length >= 8, /[a-zăâîșț]/i.test(value), /\d/.test(value), /[^a-zăâîșț\d]/i.test(value)].filter(Boolean).length;
      document.querySelectorAll("[data-password-meter] i").forEach((bar, index) => bar.classList.toggle("active", index < score));
    });
    if (!/^[a-f0-9]{64}$/i.test(resetToken) || !emailField?.checkValidity()) {
      showExpiredResetLink();
      return;
    }
    try {
      await validateResetLink(emailField.value, resetToken);
      showResetForm();
    } catch (error) {
      if (error.status === 404 || error.status === 410 || error.code === "reset_link_expired") {
        showExpiredResetLink();
        return;
      }
      renderResetLinkState({
        label: "Verificare indisponibilă",
        title: "Linkul nu poate fi verificat acum",
        message: "Conexiunea cu serverul nu a putut fi realizată. Reîncarcă pagina peste câteva momente.",
        expired: true
      });
      return;
    }
    form.addEventListener("submit", async event => {
      event.preventDefault();
      setMessage(form, "");
      const data = new FormData(form);
      const email = String(data.get("email") || "").trim();
      if (!email || !emailField?.checkValidity()) {
        emailField?.focus();
        return setMessage(form, "Adresa de e-mail este obligatorie și trebuie să fie validă.");
      }
      if (data.get("password") !== data.get("password_confirm")) return setMessage(form, "Parolele introduse nu coincid.");
      setBusy(form, true);
      let completed = false;
      try {
        const result = await api("customerResetPassword", { method: "POST", body: { email, token: resetToken, password: data.get("password"), password_confirm: data.get("password_confirm") }, auth: false });
        completed = true;
        setMessage(form, result.message || "Parola a fost resetată. Acum te poți autentifica.", true);
        form.querySelectorAll("input,button").forEach(control => { control.disabled = true; });
        history.replaceState({}, "", "/resetare-parola.html?resetata=1");
      } catch (error) {
        if (error.status === 410 || error.code === "reset_link_expired" || /expirat|nu este valid/i.test(error.message || "")) showExpiredResetLink();
        else setMessage(form, error.message);
      } finally {
        if (!completed) setBusy(form, false);
      }
    });
  }

  function initializeRegister() {
    if (token()) { location.replace("/cont.html"); return; }
    const form = document.querySelector("[data-register-form]");
    const password = form?.elements.password;
    password?.addEventListener("input", () => {
      const value = password.value; const score = [value.length >= 8, /[a-zăâîșț]/i.test(value), /\d/.test(value), /[^a-zăâîșț\d]/i.test(value)].filter(Boolean).length;
      document.querySelectorAll("[data-password-meter] i").forEach((bar, index) => bar.classList.toggle("active", index < score));
    });
    form?.addEventListener("submit", async event => {
      event.preventDefault(); setMessage(form, ""); const data = new FormData(form);
      if (data.get("password") !== data.get("password_confirm")) return setMessage(form, "Parolele introduse nu coincid.");
      if (!data.get("terms")) return setMessage(form, "Acceptă administrarea datelor contului pentru a continua.");
      setBusy(form, true);
      try { const session = await api("customerRegister", { method: "POST", body: { full_name: data.get("full_name"), phone: data.get("phone"), email: data.get("email"), password: data.get("password") }, auth: false }); saveSession(session); redirectAfterAuth(); }
      catch (error) { setMessage(form, error.message); }
      finally { setBusy(form, false); }
    });
    initializeGoogle();
  }

  function orderStatus(order) { return statusMeta[order.status] || [order.status_label || "Comandă", "Status actualizat."]; }
  function isActiveOrder(order) { return !["completed", "cancelled", "refunded"].includes(order.status); }
  function orderCard(order) {
    const meta = orderStatus(order);
    const customerType = order.customer_type === "company" ? "PJ" : "PF";
    return `<button class="customer-order-card" type="button" data-order-id="${escapeHtml(order.id)}"><i class="order-card-icon">▤</i><span><strong>${escapeHtml(order.order_number)} <em class="customer-type-badge ${customerType === "PJ" ? "is-company" : ""}">${customerType}</em></strong><small>${escapeHtml(date(order.created_at))} · ${order.items.length} ${order.items.length === 1 ? "produs" : "produse"}</small></span><div><em>${escapeHtml(meta[0])}</em><b>${escapeHtml(money(order.total))}</b></div></button>`;
  }
  function emptyState(icon, title, text) { return `<div class="empty-account-state"><i>${icon}</i><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`; }

  function renderOrders() {
    const host = document.querySelector("[data-customer-orders]"); if (!host) return;
    host.innerHTML = state.orders.length ? state.orders.map(orderCard).join("") : emptyState("▤", "Nu ai încă nicio comandă", "Produsele comandate cu acest e-mail vor apărea aici.");
    document.querySelectorAll("[data-order-count]").forEach(node => node.textContent = state.orders.length);
    document.querySelector("[data-metric-orders]").textContent = state.orders.length;
    document.querySelector("[data-metric-active]").textContent = state.orders.filter(isActiveOrder).length;
    document.querySelector("[data-metric-total]").textContent = money(state.orders.reduce((sum, order) => sum + Number(order.total || 0), 0));
    const latest = state.orders[0]; const latestHost = document.querySelector("[data-latest-order]");
    latestHost.innerHTML = latest ? `<span>CEA MAI RECENTĂ COMANDĂ</span><div class="latest-order-head"><h3>${escapeHtml(latest.order_number)}</h3><b>${escapeHtml(money(latest.total))}</b></div><p>${escapeHtml(orderStatus(latest)[0])} · ${escapeHtml(date(latest.created_at))}</p><button type="button" data-order-id="${escapeHtml(latest.id)}">Vezi rezumatul complet</button>` : emptyState("▤", "Prima ta comandă va apărea aici", "Catalogul G-Trots te așteaptă.");
  }

  function renderOrderDetail(order) {
    const stages = ["new", "confirmed", "processing", "shipped", "completed"];
    const currentIndex = stages.indexOf(order.status);
    const isProductPromotion = order.promotion_scope === "product";
    const productRows = order.items.map(item => {
      const image = safeImage(item.image_url);
      const hasDiscount = isProductPromotion && Number(item.discount_total || 0) > 0;
      const unitPrice = hasDiscount
        ? `<del>${escapeHtml(money(item.unit_price))}</del><em>${escapeHtml(money(item.discounted_unit_price))}</em>`
        : escapeHtml(money(item.unit_price));
      const lineTotal = hasDiscount
        ? `<del>${escapeHtml(money(item.line_total))}</del><em>${escapeHtml(money(item.discounted_line_total))}</em>`
        : escapeHtml(money(item.line_total));
      return `<article class="order-product">${image ? `<img src="${escapeHtml(image)}" alt="">` : '<img src="assets/logo.png" alt="">'}<span><strong>${escapeHtml(item.product_name)}</strong><small class="${hasDiscount ? "is-discounted" : ""}">${item.quantity} × ${unitPrice}</small></span><b class="${hasDiscount ? "is-discounted" : ""}">${lineTotal}</b></article>`;
    }).join("");
    const timeline = stages.map((stage, index) => `<span class="${index <= currentIndex ? "done" : ""}"><i>${index < currentIndex ? "✓" : index + 1}</i><b>${escapeHtml(statusMeta[stage][0])}</b></span>`).join("");
    const discount = Number(order.discount_total || 0);
    const discountRow = discount > 0 && !isProductPromotion ? `<p><span>Reducere${order.promotion_code ? ` · ${escapeHtml(order.promotion_code)}` : ""}</span><b style="color:#6ee7b7">−${escapeHtml(money(discount))}</b></p>` : "";
    const hasVat = Boolean(order.vat_payer);
    const subtotalLabel = `${isProductPromotion && discount > 0 ? "Subtotal după reduceri" : "Subtotal"}${hasVat ? " (TVA inclus)" : ""}`;
    const subtotal = Number(order.subtotal || 0) - (isProductPromotion ? discount : 0);
    const companyBlock = order.customer_type === "company" ? `<section class="order-company"><h3><span class="customer-type-badge is-company">PJ</span> PERSOANĂ JURIDICĂ</h3><p><strong>${escapeHtml(order.company_name)}</strong></p><p>CUI/CIF: ${escapeHtml(order.company_cui)} · RC: ${escapeHtml(order.company_registration_number)}</p><p>${escapeHtml(order.company_address)}</p></section>` : `<section class="order-company is-individual"><h3><span class="customer-type-badge">PF</span> PERSOANĂ FIZICĂ</h3><p>Comandă plasată pe numele <strong>${escapeHtml(order.customer_name)}</strong>.</p></section>`;
    return `<div class="order-detail"><header class="order-detail-head"><img class="order-detail-logo" src="assets/logo.png" alt=""><span><small>REZUMAT COMANDĂ</small><strong>${escapeHtml(order.order_number)}</strong></span><em class="order-status-pill">${escapeHtml(orderStatus(order)[0])}</em></header><div class="order-products">${productRows}</div><div class="order-totals"><p><span>${subtotalLabel}</span><b>${escapeHtml(money(subtotal))}</b></p>${discountRow}<p><span>Livrare · ${escapeHtml(order.shipping_method_name)}</span><b>${escapeHtml(money(order.shipping_cost))}</b></p><p><span>Plată · ${order.payment_method === "card" ? "Card online" : "Ramburs la curier"}</span><b>${escapeHtml(order.payment_status === "paid" ? "Plătită" : "În așteptare")}</b></p><p class="total"><span>Total de plată${hasVat ? " (TVA inclus)" : ""}</span><b>${escapeHtml(money(order.total))}</b></p></div>${companyBlock}<section class="order-delivery"><h3>LIVRARE</h3><p><strong>${escapeHtml(order.customer_name)}</strong> · ${escapeHtml(order.customer_phone)}</p><p>${escapeHtml(order.address)}, ${escapeHtml(order.city)}, ${escapeHtml(order.county || "")}${order.postal_code ? ` · ${escapeHtml(order.postal_code)}` : ""}</p></section><div class="order-timeline">${timeline}</div>${order.tracking_token ? `<a class="track-order-button" href="/urmarire-comanda?token=${encodeURIComponent(order.tracking_token)}"><span>Urmărește comanda</span><b>›</b></a>` : ""}</div>`;
  }

  function openOrder(id) {
    const order = state.orders.find(item => item.id === id); if (!order) return;
    const dialog = document.querySelector("[data-order-dialog]");
    document.querySelector("[data-order-detail]").innerHTML = renderOrderDetail(order);
    dialog.classList.remove("is-closing");
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    requestAnimationFrame(() => dialog.classList.add("is-visible"));
  }

  function renderAddresses() {
    const host = document.querySelector("[data-customer-addresses]"); if (!host) return;
    document.querySelectorAll("[data-address-count]").forEach(node => node.textContent = state.addresses.length);
    host.innerHTML = state.addresses.length ? state.addresses.map(address => `<article class="address-card"><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5.25-7 10.25-7 10.25S5 15.25 5 10a7 7 0 1 1 14 0Z"></path><circle cx="12" cy="10" r="2.25"></circle></svg></i><div><h3>${escapeHtml(address.label)}${address.is_default ? '<span class="default-pill">PRINCIPALĂ</span>' : ""}</h3><p><strong>${escapeHtml(address.recipient_name)}</strong> · ${escapeHtml(address.phone)}</p><p>${escapeHtml(address.address)}, ${escapeHtml(address.city)}, ${escapeHtml(address.county)}${address.postal_code ? ` · ${escapeHtml(address.postal_code)}` : ""}</p></div><div class="address-card-actions"><button type="button" data-edit-address="${escapeHtml(address.id)}" aria-label="Editează"><svg viewBox="0 0 24 24"><path d="m4 20 4.25-1 10.5-10.5-3.25-3.25L5 15.75Z"></path><path d="m13.75 7 3.25 3.25"></path></svg></button><button type="button" data-delete-address="${escapeHtml(address.id)}" aria-label="Șterge"><svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13"></path></svg></button></div></article>`).join("") : emptyState("⌖", "Nu ai adrese salvate", "Adaugă o adresă pentru un checkout mai rapid.");
  }

  function renderCoupons() {
    const host = document.querySelector("[data-customer-coupons]"); if (!host) return;
    document.querySelectorAll("[data-coupon-count]").forEach(node => node.textContent = state.coupons.length);
    if (!state.coupons.length) {
      host.innerHTML = `<div class="coupon-empty-state"><span class="coupon-percent-mark" aria-hidden="true"><b>%</b><i></i></span><div><strong>Nu ai reduceri active acum</strong><p>Când apare o ofertă pentru contul tău, o vei găsi aici cu toate condițiile explicate.</p></div><a href="/magazin.html#catalog">Vezi magazinul <b aria-hidden="true">›</b></a></div>`;
      return;
    }

    host.innerHTML = state.coupons.map(coupon => {
      const value = coupon.discount_type === "percent" ? `${Number(coupon.discount_value)}%` : money(coupon.discount_value);
      const productCount = Array.isArray(coupon.product_ids) ? coupon.product_ids.length : 0;
      const scope = coupon.scope === "product"
        ? (productCount === 1 ? "1 produs selectat" : `${productCount} produse selectate`)
        : "Toată comanda";
      const audience = coupon.audience === "selected"
        ? "Ofertă aleasă pentru contul tău"
        : coupon.audience === "registered" ? "Pentru clienții autentificați" : "Disponibilă tuturor clienților";
      const threshold = Number(coupon.min_order_value || 0) > 0 ? `Comandă minimă ${money(coupon.min_order_value)}` : "Fără valoare minimă";
      const period = coupon.valid_until
        ? `Valabilă până la ${date(coupon.valid_until)}`
        : coupon.valid_from ? `Disponibilă din ${date(coupon.valid_from)}` : "Fără termen limită";
      const mode = coupon.auto_apply ? "Se aplică automat" : "Se aplică prin cod";
      const description = coupon.description || coupon.banner_text || "Reducere disponibilă în contul tău G-Trots.";
      return `<article class="coupon-card customer-promotion-card">
        <div class="coupon-card-accent" aria-hidden="true"></div>
        <span class="coupon-percent-mark" aria-hidden="true"><b>%</b><i></i></span>
        <div class="coupon-card-content">
          <header><span class="coupon-card-kicker"><i></i> OFERTĂ ACTIVĂ</span><span class="coupon-card-mode">${escapeHtml(mode)}</span></header>
          <div class="coupon-card-main"><div><h3>${escapeHtml(coupon.title)}</h3><p>${escapeHtml(description)}</p></div><strong>${escapeHtml(value)}</strong></div>
          <div class="coupon-card-facts">
            <span><small>Se aplică pentru</small><b>${escapeHtml(scope)}</b></span>
            <span><small>Disponibilitate</small><b>${escapeHtml(audience)}</b></span>
            <span><small>Condiție</small><b>${escapeHtml(threshold)}</b></span>
            <span><small>Perioadă</small><b>${escapeHtml(period)}</b></span>
          </div>
          <footer><span class="coupon-code"><small>COD PROMOȚIONAL</small><code>${escapeHtml(coupon.code)}</code></span><button type="button" data-copy-coupon="${escapeHtml(coupon.code)}"><span>Copiază codul</span><b class="coupon-copy-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg></b></button><a href="/magazin.html#catalog">Vezi produsele <b aria-hidden="true">›</b></a></footer>
        </div>
      </article>`;
    }).join("");
  }

  function setCustomerType(type) {
    const form = document.querySelector("[data-customer-profile-form]");
    if (!form) return;
    const normalized = type === "company" ? "company" : "individual";
    const customerTypeField = form.elements.namedItem("customer_type");
    if (customerTypeField) customerTypeField.value = normalized;
    form.querySelectorAll("[data-customer-type]").forEach(button => {
      const active = button.dataset.customerType === normalized;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const companyFields = form.querySelector("[data-company-fields]");
    if (companyFields) companyFields.hidden = normalized !== "company";
    ["company_name", "company_cui", "company_registration_number", "company_address"].forEach(name => {
      const field = form.elements.namedItem(name);
      if (field) field.required = normalized === "company";
    });
  }

  function renderCustomerProfile() {
    const form = document.querySelector("[data-customer-profile-form]");
    if (!form || !state.customer) return;
    ["full_name", "phone", "address", "city", "county", "postal_code", "company_name", "company_cui", "company_registration_number", "company_address"].forEach(name => {
      const field = form.elements.namedItem(name);
      if (field) field.value = state.customer[name] || "";
    });
    setCustomerType(state.customer.customer_type);
  }

  function openAddress(address = null) {
    const dialog = document.querySelector("[data-address-dialog]"); const form = dialog.querySelector("form"); form.reset();
    const idField = formField(form, "id");
    if (idField) idField.value = address?.id || "";
    ["label", "recipient_name", "phone", "address", "city", "county", "postal_code"].forEach(key => {
      const field = formField(form, key);
      if (field) field.value = address?.[key] || (key === "recipient_name" ? state.customer.full_name : key === "phone" ? state.customer.phone : "");
    });
    const defaultField = formField(form, "is_default");
    if (defaultField) defaultField.checked = Boolean(address?.is_default);
    document.querySelector("[data-address-form-title]").textContent = address ? "Editează adresa" : "Adaugă o adresă"; dialog.showModal(); requestAnimationFrame(() => dialog.classList.add("is-visible"));
  }

  function closeAccountDialog(dialog) {
    if (!dialog?.open || dialog.classList.contains("is-closing")) return;
    dialog.classList.add("is-closing");
    dialog.classList.remove("is-visible");
    window.setTimeout(() => { dialog.close(); dialog.classList.remove("is-closing"); }, 220);
  }

  async function loadAccount() {
    if (!token()) { location.replace(`/login.html?redirect=${encodeURIComponent(location.pathname)}`); return; }
    try {
      const me = await api("customerMe");
      const [ordersResult, addressesResult, couponsResult] = await Promise.allSettled([api("customerOrders"), api("customerAddresses"), api("customerCoupons")]);
      const valueOrEmpty = result => result.status === "fulfilled" && Array.isArray(result.value) ? result.value : [];
      state.customer = me.customer; state.orders = valueOrEmpty(ordersResult); state.addresses = valueOrEmpty(addressesResult); state.coupons = valueOrEmpty(couponsResult);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(state.customer)); document.dispatchEvent(new CustomEvent("g-trots:customer-changed", { detail: state.customer }));
      document.querySelector("[data-customer-first-name]").textContent = firstName(state.customer.full_name); document.querySelector("[data-customer-email]").textContent = state.customer.email;
      document.querySelectorAll("[data-settings-email]").forEach(node => { node.textContent = state.customer.email; });
      renderOrders(); renderAddresses(); renderCoupons(); renderCustomerProfile(); document.querySelector("[data-account-loading]").hidden = true; document.querySelector("[data-account-app]").hidden = false;
    } catch (error) { if (error.status === 401 || error.status === 403) { clearSession(); location.replace(`/login.html?redirect=${encodeURIComponent(location.pathname)}&reason=${encodeURIComponent(error.code || "expired")}`); } else document.querySelector("[data-account-loading]").innerHTML = emptyState("!", "Contul nu s-a putut încărca", error.message); }
  }

  function bindAccountEvents() {
    document.addEventListener("click", async event => {
      const tab = event.target.closest("[data-account-tab]"); if (tab) { document.querySelectorAll("[data-account-tab]").forEach(node => node.classList.toggle("active", node === tab)); document.querySelectorAll("[data-account-panel]").forEach(node => node.classList.toggle("active", node.dataset.accountPanel === tab.dataset.accountTab)); return; }
      const customerTypeButton = event.target.closest("[data-customer-type]"); if (customerTypeButton) { setCustomerType(customerTypeButton.dataset.customerType); return; }
      const copyCoupon = event.target.closest("[data-copy-coupon]"); if (copyCoupon) { const code = copyCoupon.dataset.copyCoupon || ""; try { await navigator.clipboard.writeText(code); copyCoupon.classList.add("is-copied"); copyCoupon.querySelector("span").textContent = "Cod copiat"; window.setTimeout(() => { copyCoupon.classList.remove("is-copied"); const label = copyCoupon.querySelector("span"); if (label) label.textContent = "Copiază codul"; }, 1800); } catch { window.prompt("Copiază codul promoțional:", code); } return; }
      const resetPassword = event.target.closest("[data-send-password-reset]"); if (resetPassword) { const feedback = document.querySelector("[data-profile-message]"); feedback.hidden = true; feedback.classList.remove("success"); resetPassword.disabled = true; try { const result = await api("customerForgotPassword", { method: "POST", body: { email: state.customer.email }, auth: false }); feedback.textContent = result.message || "Verifică adresa de e-mail pentru linkul de resetare."; feedback.hidden = false; feedback.classList.add("success"); } catch (error) { feedback.textContent = error.message; feedback.hidden = false; } finally { resetPassword.disabled = false; } return; }
      const orderButton = event.target.closest("[data-order-id]"); if (orderButton) return openOrder(orderButton.dataset.orderId);
      if (event.target.closest("[data-dialog-close]")) return closeAccountDialog(event.target.closest("dialog"));
      if (event.target.closest("[data-add-address]")) return openAddress();
      const edit = event.target.closest("[data-edit-address]"); if (edit) return openAddress(state.addresses.find(item => item.id === edit.dataset.editAddress));
      const remove = event.target.closest("[data-delete-address]"); if (remove) { if (!confirm("Ștergi această adresă salvată?")) return; try { await api("customerAddress", { method: "DELETE", query: `&id=${encodeURIComponent(remove.dataset.deleteAddress)}` }); state.addresses = await api("customerAddresses"); renderAddresses(); } catch (error) { alert(error.message); } return; }
      if (event.target.closest("[data-customer-logout]")) { try { await api("customerLogout", { method: "POST" }); } catch {} clearSession(); location.href = "/login.html"; return; }
      if (event.target.closest("[data-delete-account]")) { const confirmation = prompt('Pentru confirmare, scrie STERGE. Comenzile comerciale rămân păstrate în evidența G-Trots.'); if (confirmation !== "STERGE") return; try { await api("customerDeleteAccount", { method: "DELETE", body: { confirmation } }); clearSession(); location.href = "/magazin.html?cont=sters"; } catch (error) { alert(error.message); } }
    });
    const form = document.querySelector("[data-address-form]"); form?.addEventListener("submit", async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(form)); data.is_default = Boolean(formField(form, "is_default")?.checked); const id = data.id; delete data.id; setBusy(form, true); setMessage(form, ""); try { await api(id ? "customerAddress" : "customerAddresses", { method: id ? "PATCH" : "POST", query: id ? `&id=${encodeURIComponent(id)}` : "", body: data }); state.addresses = await api("customerAddresses"); renderAddresses(); closeAccountDialog(form.closest("dialog")); } catch (error) { setMessage(form, error.message); } finally { setBusy(form, false); } });
    const profileForm = document.querySelector("[data-customer-profile-form]"); profileForm?.addEventListener("submit", async event => {
      event.preventDefault();
      setMessage(profileForm, "");
      setBusy(profileForm, true);
      try {
        const result = await api("customerProfile", { method: "PATCH", body: Object.fromEntries(new FormData(profileForm)) });
        state.customer = result.customer;
        localStorage.setItem(PROFILE_KEY, JSON.stringify(state.customer));
        document.dispatchEvent(new CustomEvent("g-trots:customer-changed", { detail: state.customer }));
        renderCustomerProfile();
        document.querySelector("[data-customer-first-name]").textContent = firstName(state.customer.full_name);
        setMessage(profileForm, "Datele personale au fost salvate.", true);
      } catch (error) { setMessage(profileForm, error.message); }
      finally { setBusy(profileForm, false); }
    });
    document.querySelectorAll(".account-dialog").forEach(dialog => {
      dialog.addEventListener("click", event => { if (event.target === dialog) closeAccountDialog(dialog); });
      dialog.addEventListener("cancel", event => { event.preventDefault(); closeAccountDialog(dialog); });
      dialog.addEventListener("close", () => dialog.classList.remove("is-visible", "is-closing"));
    });
  }

  function initializeAuthTypewriter() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelectorAll("[data-auth-typewriter]").forEach(node => {
      const text = String(node.dataset.typeText || node.textContent || "").trim();
      if (!text) return;
      node.textContent = "";
      node.setAttribute("aria-label", text);

      const reserve = document.createElement("span");
      reserve.className = "auth-typewriter-reserve";
      reserve.setAttribute("aria-hidden", "true");
      reserve.textContent = text;

      const live = document.createElement("span");
      live.className = "auth-typewriter-live";
      live.setAttribute("aria-hidden", "true");
      node.append(reserve, live);

      if (reducedMotion) {
        live.textContent = text;
        return;
      }

      live.classList.add("is-typing");
      let index = 0;
      let deleting = false;
      const animate = () => {
        if (!deleting) {
          index = Math.min(text.length, index + 1);
          live.textContent = text.slice(0, index);
          if (index === text.length) {
            deleting = true;
            window.setTimeout(animate, 2600);
            return;
          }
          window.setTimeout(animate, 62 + Math.random() * 34);
          return;
        }

        index = Math.max(0, index - 1);
        live.textContent = text.slice(0, index);
        if (index === 0) {
          deleting = false;
          window.setTimeout(animate, 520);
          return;
        }
        window.setTimeout(animate, 36 + Math.random() * 24);
      };
      window.setTimeout(animate, 450);
    });
  }

  initializeAuthTypewriter();
  bindPasswordToggles();
  if (page === "login") initializeLogin();
  else if (page === "register") initializeRegister();
  else if (page === "reset-password") initializeResetPassword();
  else if (page === "account") { bindAccountEvents(); loadAccount(); }
})();
