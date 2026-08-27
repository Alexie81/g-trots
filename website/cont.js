(() => {
  const API_URL = "https://g-trots.ro/shop-api/api-v2.php";
  const TOKEN_KEY = "g-trots-customer-session-v1";
  const PROFILE_KEY = "g-trots-customer-profile-v1";
  const page = document.body.dataset.customerPage || "";
  const state = { customer: null, orders: [], addresses: [], coupons: [] };
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
  const safeImage = value => { try { const url = new URL(String(value || ""), location.origin); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } };
  const firstName = name => String(name || "client").trim().split(/\s+/)[0] || "client";

  async function api(action, { method = "GET", body, query = "", auth = true } = {}) {
    const response = await fetch(`${API_URL}?action=${encodeURIComponent(action)}${query}`, {
      method,
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(auth && token() ? { "X-Customer-Token": token() } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || "Cererea nu a putut fi procesată.");
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
    const node = scope?.querySelector?.("[data-auth-message], [data-address-message]") || document.querySelector("[data-auth-message]");
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

  async function initializeGoogle() {
    const host = document.querySelector("[data-google-auth]");
    if (!host) return;
    try {
      const config = await api("customerAuthConfig", { auth: false });
      if (!config.google_client_id) {
        host.innerHTML = '<button class="google-auth-button" type="button" disabled><span class="google-g">G</span><span>Continuă cu Google</span></button><p class="google-auth-note">Conectarea Google va fi disponibilă după activarea identității G-Trots.</p>';
        return;
      }
      await new Promise((resolve, reject) => {
        if (window.google?.accounts?.id) return resolve();
        const script = document.createElement("script"); script.src = "https://accounts.google.com/gsi/client"; script.async = true; script.defer = true; script.onload = resolve; script.onerror = reject; document.head.append(script);
      });
      host.innerHTML = '<div data-google-official></div>';
      window.google.accounts.id.initialize({ client_id: config.google_client_id, callback: async response => {
        try { const session = await api("customerGoogleLogin", { method: "POST", body: { credential: response.credential }, auth: false }); saveSession(session); redirectAfterAuth(); }
        catch (error) { setMessage(document, error.message); }
      }});
      window.google.accounts.id.renderButton(host.querySelector("[data-google-official]"), { theme: "outline", size: "large", shape: "pill", width: Math.min(420, host.clientWidth || 420), text: page === "register" ? "signup_with" : "signin_with", locale: "ro" });
    } catch (error) {
      host.innerHTML = '<button class="google-auth-button" type="button" disabled><span class="google-g">G</span><span>Google este temporar indisponibil</span></button>';
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
    initializeGoogle();
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
    return `<button class="customer-order-card" type="button" data-order-id="${escapeHtml(order.id)}"><i class="order-card-icon">▤</i><span><strong>${escapeHtml(order.order_number)}</strong><small>${escapeHtml(date(order.created_at))} · ${order.items.length} ${order.items.length === 1 ? "produs" : "produse"}</small></span><div><em>${escapeHtml(meta[0])}</em><b>${escapeHtml(money(order.total))}</b></div></button>`;
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
    const productRows = order.items.map(item => { const image = safeImage(item.image_url); return `<article class="order-product">${image ? `<img src="${escapeHtml(image)}" alt="">` : '<img src="assets/logo.png" alt="">'}<span><strong>${escapeHtml(item.product_name)}</strong><small>${item.quantity} × ${escapeHtml(money(item.unit_price))}</small></span><b>${escapeHtml(money(item.line_total))}</b></article>`; }).join("");
    const timeline = stages.map((stage, index) => `<span class="${index <= currentIndex ? "done" : ""}"><i>${index < currentIndex ? "✓" : index + 1}</i><b>${escapeHtml(statusMeta[stage][0])}</b></span>`).join("");
    const discountRow = Number(order.discount_total) > 0 ? `<p><span>Reducere${order.promotion_code ? ` · ${escapeHtml(order.promotion_code)}` : ""}</span><b style="color:#6ee7b7">−${escapeHtml(money(order.discount_total))}</b></p>` : "";
    return `<div class="order-detail"><header class="order-detail-head"><img class="order-detail-logo" src="assets/logo.png" alt=""><span><small>REZUMAT COMANDĂ</small><strong>${escapeHtml(order.order_number)}</strong></span><em class="order-status-pill">${escapeHtml(orderStatus(order)[0])}</em></header><div class="order-products">${productRows}</div><div class="order-totals"><p><span>Produse</span><b>${escapeHtml(money(order.subtotal))}</b></p>${discountRow}<p><span>Livrare · ${escapeHtml(order.shipping_method_name)}</span><b>${escapeHtml(money(order.shipping_cost))}</b></p><p><span>Plată · ${order.payment_method === "card" ? "Card online" : "Ramburs la curier"}</span><b>${escapeHtml(order.payment_status === "paid" ? "Plătită" : "În așteptare")}</b></p><p class="total"><span>Total</span><b>${escapeHtml(money(order.total))}</b></p></div><section class="order-delivery"><h3>LIVRARE</h3><p><strong>${escapeHtml(order.customer_name)}</strong> · ${escapeHtml(order.customer_phone)}</p><p>${escapeHtml(order.address)}, ${escapeHtml(order.city)}, ${escapeHtml(order.county || "")}${order.postal_code ? ` · ${escapeHtml(order.postal_code)}` : ""}</p></section><div class="order-timeline">${timeline}</div>${order.tracking_token ? `<a class="track-order-button" href="/urmarire-comanda?token=${encodeURIComponent(order.tracking_token)}"><span>Urmărește comanda</span><b>›</b></a>` : ""}</div>`;
  }

  function openOrder(id) {
    const order = state.orders.find(item => item.id === id); if (!order) return;
    document.querySelector("[data-order-detail]").innerHTML = renderOrderDetail(order);
    document.querySelector("[data-order-dialog]").showModal();
  }

  function renderAddresses() {
    const host = document.querySelector("[data-customer-addresses]"); if (!host) return;
    document.querySelectorAll("[data-address-count]").forEach(node => node.textContent = state.addresses.length);
    host.innerHTML = state.addresses.length ? state.addresses.map(address => `<article class="address-card"><i>⌖</i><div><h3>${escapeHtml(address.label)}${address.is_default ? '<span class="default-pill">PRINCIPALĂ</span>' : ""}</h3><p><strong>${escapeHtml(address.recipient_name)}</strong> · ${escapeHtml(address.phone)}</p><p>${escapeHtml(address.address)}, ${escapeHtml(address.city)}, ${escapeHtml(address.county)}${address.postal_code ? ` · ${escapeHtml(address.postal_code)}` : ""}</p></div><div class="address-card-actions"><button type="button" data-edit-address="${escapeHtml(address.id)}" aria-label="Editează">✎</button><button type="button" data-delete-address="${escapeHtml(address.id)}" aria-label="Șterge">×</button></div></article>`).join("") : emptyState("⌖", "Nu ai adrese salvate", "Adaugă o adresă pentru un checkout mai rapid.");
  }

  function renderCoupons() {
    const host = document.querySelector("[data-customer-coupons]"); if (!host) return;
    host.innerHTML = state.coupons.length ? state.coupons.map(coupon => `<article class="coupon-card"><i>✦</i><div><h3>${escapeHtml(coupon.title)}</h3><p>${escapeHtml(coupon.description || "Reducere disponibilă în contul tău.")}</p><p><strong>${escapeHtml(coupon.code)}</strong> · ${coupon.discount_type === "percent" ? `${Number(coupon.discount_value)}%` : money(coupon.discount_value)}</p></div></article>`).join("") : emptyState("✦", "Nu ai cupoane active acum", "Când apare o ofertă pentru tine, o vei găsi aici.");
  }

  function openAddress(address = null) {
    const dialog = document.querySelector("[data-address-dialog]"); const form = dialog.querySelector("form"); form.reset();
    form.elements.id.value = address?.id || ""; ["label", "recipient_name", "phone", "address", "city", "county", "postal_code"].forEach(key => form.elements[key].value = address?.[key] || (key === "recipient_name" ? state.customer.full_name : key === "phone" ? state.customer.phone : "")); form.elements.is_default.checked = Boolean(address?.is_default); document.querySelector("[data-address-form-title]").textContent = address ? "Editează adresa" : "Adaugă o adresă"; dialog.showModal();
  }

  async function loadAccount() {
    if (!token()) { location.replace(`/login.html?redirect=${encodeURIComponent(location.pathname)}`); return; }
    try {
      const [me, orders, addresses, coupons] = await Promise.all([api("customerMe"), api("customerOrders"), api("customerAddresses"), api("customerCoupons")]);
      state.customer = me.customer; state.orders = Array.isArray(orders) ? orders : []; state.addresses = Array.isArray(addresses) ? addresses : []; state.coupons = Array.isArray(coupons) ? coupons : [];
      localStorage.setItem(PROFILE_KEY, JSON.stringify(state.customer)); document.dispatchEvent(new CustomEvent("g-trots:customer-changed", { detail: state.customer }));
      document.querySelector("[data-customer-first-name]").textContent = firstName(state.customer.full_name); document.querySelector("[data-customer-email]").textContent = state.customer.email;
      renderOrders(); renderAddresses(); renderCoupons(); document.querySelector("[data-account-loading]").hidden = true; document.querySelector("[data-account-app]").hidden = false;
    } catch (error) { if (error.status === 401 || error.status === 403) { clearSession(); location.replace(`/login.html?redirect=${encodeURIComponent(location.pathname)}&reason=${encodeURIComponent(error.code || "expired")}`); } else document.querySelector("[data-account-loading]").innerHTML = emptyState("!", "Contul nu s-a putut încărca", error.message); }
  }

  function bindAccountEvents() {
    document.addEventListener("click", async event => {
      const tab = event.target.closest("[data-account-tab]"); if (tab) { document.querySelectorAll("[data-account-tab]").forEach(node => node.classList.toggle("active", node === tab)); document.querySelectorAll("[data-account-panel]").forEach(node => node.classList.toggle("active", node.dataset.accountPanel === tab.dataset.accountTab)); return; }
      const orderButton = event.target.closest("[data-order-id]"); if (orderButton) return openOrder(orderButton.dataset.orderId);
      if (event.target.closest("[data-dialog-close]")) return event.target.closest("dialog")?.close();
      if (event.target.closest("[data-add-address]")) return openAddress();
      const edit = event.target.closest("[data-edit-address]"); if (edit) return openAddress(state.addresses.find(item => item.id === edit.dataset.editAddress));
      const remove = event.target.closest("[data-delete-address]"); if (remove) { if (!confirm("Ștergi această adresă salvată?")) return; try { await api("customerAddress", { method: "DELETE", query: `&id=${encodeURIComponent(remove.dataset.deleteAddress)}` }); state.addresses = await api("customerAddresses"); renderAddresses(); } catch (error) { alert(error.message); } return; }
      if (event.target.closest("[data-customer-logout]")) { try { await api("customerLogout", { method: "POST" }); } catch {} clearSession(); location.href = "/login.html"; return; }
      if (event.target.closest("[data-delete-account]")) { const confirmation = prompt('Pentru confirmare, scrie STERGE. Comenzile comerciale rămân păstrate în evidența G-Trots.'); if (confirmation !== "STERGE") return; try { await api("customerDeleteAccount", { method: "DELETE", body: { confirmation } }); clearSession(); location.href = "/magazin.html?cont=sters"; } catch (error) { alert(error.message); } }
    });
    const form = document.querySelector("[data-address-form]"); form?.addEventListener("submit", async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(form)); data.is_default = form.elements.is_default.checked; const id = data.id; delete data.id; setBusy(form, true); setMessage(form, ""); try { await api(id ? "customerAddress" : "customerAddresses", { method: id ? "PATCH" : "POST", query: id ? `&id=${encodeURIComponent(id)}` : "", body: data }); state.addresses = await api("customerAddresses"); renderAddresses(); form.closest("dialog").close(); } catch (error) { setMessage(form, error.message); } finally { setBusy(form, false); } });
  }

  bindPasswordToggles();
  if (page === "login") initializeLogin();
  else if (page === "register") initializeRegister();
  else if (page === "account") { bindAccountEvents(); loadAccount(); }
})();
