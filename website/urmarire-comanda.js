(() => {
  const API_URL = "https://g-trots.ro/shop-api/api-v2.php";
  const icons = {
    new: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    confirmed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 12.5 10.2 16 17.5 8"/><circle cx="12" cy="12" r="9"/></svg>',
    processing: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 8 8-4 8 4-8 4Z"/><path d="M4 8v8l8 4 8-4V8M12 12v8"/></svg>',
    shipped: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    completed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/><circle cx="12" cy="12" r="10"/></svg>',
    return_requested: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7v5h5"/><path d="M5.6 16a8 8 0 1 0 .2-8.2L4 12"/></svg>',
    return_refused: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>',
    return_confirmed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7v5h5"/><path d="M5.6 16a8 8 0 1 0 .2-8.2L4 12"/><path d="m9 12 2 2 4-4"/></svg>',
    refunded: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7v5h5"/><path d="M5.6 16a8 8 0 1 0 .2-8.2L4 12"/></svg>',
    cancelled: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>'
  };
  const statuses = [
    { value: "new", label: "În procesare", description: "Am primit comanda și verificăm toate detaliile.", color: "#38bdf8", icon: icons.new },
    { value: "confirmed", label: "Confirmată", description: "Comanda și plata au fost confirmate.", color: "#34d399", icon: icons.confirmed },
    { value: "processing", label: "În pregătire", description: "Produsele sunt pregătite pentru expediere.", color: "#fb923c", icon: icons.processing },
    { value: "shipped", label: "Predată curierului", description: "Pachetul a plecat către adresa de livrare.", color: "#a78bfa", icon: icons.shipped },
    { value: "completed", label: "Livrată", description: "Comanda a ajuns la destinație.", color: "#22c55e", icon: icons.completed },
    { value: "return_requested", label: "Retur solicitat", description: "Solicitarea de retur este în curs de verificare.", color: "#f472b6", icon: icons.return_requested },
    { value: "return_refused", label: "Retur refuzat", description: "Solicitarea de retur a fost verificată și refuzată.", color: "#fb7185", icon: icons.return_refused },
    { value: "return_confirmed", label: "Retur confirmat", description: "Returul a fost confirmat și urmează rambursarea.", color: "#2dd4bf", icon: icons.return_confirmed },
    { value: "refunded", label: "Rambursată", description: "Comanda a fost returnată și rambursată.", color: "#f59e0b", icon: icons.refunded },
    { value: "cancelled", label: "Comandă anulată", description: "Comanda nu mai este procesată.", color: "#fb7185", icon: icons.cancelled },
  ];
  const resultHost = document.getElementById("tracking-result");
  const stateHost = document.getElementById("tracking-state");
  const form = document.getElementById("tracking-form");
  const submit = document.getElementById("tracking-submit");
  const orderInput = document.getElementById("tracking-order-number");
  const emailInput = document.getElementById("tracking-email");
  const cancelModal = document.getElementById("cancellation-modal");
  const cancelReason = document.getElementById("cancellation-reason");
  const cancelError = document.getElementById("cancellation-error");
  const cancelConfirm = document.getElementById("cancellation-confirm");
  const footerCancel = document.getElementById("tracking-footer-cancel");
  const returnModal = document.getElementById("return-modal");
  const returnReason = document.getElementById("return-reason");
  const returnHolder = document.getElementById("return-holder");
  const returnIban = document.getElementById("return-iban");
  const returnError = document.getElementById("return-error");
  const returnConfirm = document.getElementById("return-confirm");
  const returnCost = document.getElementById("return-cost");
  const returnRefund = document.getElementById("return-refund");
  const footerReturn = document.getElementById("tracking-footer-return");
  const params = new URLSearchParams(window.location.search);
  const cancellationIntent = params.get("anulare") === "1";
  const returnIntent = params.get("retur") === "1";
  let activeAccess = null;
  let activeOrder = null;
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const money = (value, currency = "RON") => `${new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} ${currency}`;
  const date = value => { const parsed = new Date(String(value || "").replace(" ", "T")); return Number.isNaN(parsed.getTime()) ? String(value || "") : parsed.toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" }); };

  function showState(kind, title, message) {
    resultHost.hidden = true;
    footerCancel.hidden = true;
    footerReturn.hidden = true;
    stateHost.hidden = false;
    stateHost.className = `tracking-state ${kind}`;
    stateHost.innerHTML = `<div><span class="tracking-state-icon">${kind === "error" ? "!" : "↻"}</span><h2>${esc(title)}</h2><p>${esc(message)}</p></div>`;
  }
  function visibleStatuses(order) {
    return statuses.filter(item => !["return_requested", "return_refused", "return_confirmed"].includes(item.value));
  }
  function render(order) {
    activeOrder = order;
    const current = statuses.find(item => item.value === order.status) || statuses[0];
    const history = Array.isArray(order.status_history) ? order.status_history : [];
    const terminalValues = ["refunded", "cancelled"];
    const internalReturnActive = ["return_requested", "return_refused", "return_confirmed"].includes(order.status);
    const terminalCurrent = terminalValues.includes(order.status);
    const deliveryWasCompleted = internalReturnActive || order.status === "refunded";
    const flowStatuses = visibleStatuses(order).filter(item => !terminalValues.includes(item.value));
    const currentFlowIndex = flowStatuses.findIndex(item => item.value === order.status);
    const timeline = flowStatuses.map((item, index) => {
      const entry = [...history].reverse().find(historyItem => historyItem.to_status === item.value);
      const reached = deliveryWasCompleted || Boolean(entry) || (!terminalCurrent && currentFlowIndex >= 0 && index <= currentFlowIndex);
      const isCurrent = item.value === order.status;
      return `<article class="tracking-step ${reached ? "reached" : ""} ${isCurrent ? "current" : ""}" style="--status-color:${item.color}"><div class="tracking-step-rail"><span>${item.icon}</span></div><div class="tracking-step-copy"><small>${isCurrent ? "STATUS ACTUAL" : reached ? "FINALIZAT" : "URMEAZĂ"}</small><strong>${esc(item.label)}</strong><p>${esc(item.description)}</p>${entry ? `<time>${esc(date(entry.created_at))}</time>` : ""}</div></article>`;
    }).join("");
    const terminalMeta = terminalCurrent || internalReturnActive ? statuses.find(item => item.value === order.status) : null;
    const terminalEntry = terminalMeta ? [...history].reverse().find(historyItem => historyItem.to_status === terminalMeta.value) : null;
    const cancellationDetails = order.status === "cancelled" && order.cancellation_reason
      ? `<div class="tracking-cancellation-result"><small>MOTIVUL ANULĂRII</small><strong>${esc(order.cancellation_reason)}</strong>${order.refund_status === "pending" ? `<p>Rambursarea pe card este în curs și va fi efectuată în cel mult 15 zile calendaristice${order.refund_due_at ? `, până la ${esc(new Date(`${order.refund_due_at}T12:00:00`).toLocaleDateString("ro-RO"))}` : ""}.</p>` : ""}</div>`
      : "";
    const returnDetails = internalReturnActive && order.return_reason
      ? `<div class="tracking-return-result"><small>DETALII RETUR</small><strong>${esc(order.return_reason)}</strong><p>Titular: ${esc(order.return_bank_account_holder || "—")} · IBAN: ${esc(order.return_bank_iban_masked || "—")}</p><p>Cost retur ${money(order.return_shipping_cost, order.currency)} · estimare restituire <b>${money(order.return_refund_amount, order.currency)}</b></p></div>`
      : "";
    const terminalState = terminalMeta ? `<article class="tracking-cancel-state current" style="--status-color:${terminalMeta.color}"><span>${terminalMeta.icon}</span><div><small>STATUS ACTUAL</small><strong>${esc(terminalMeta.label)}</strong><p>${esc(terminalMeta.description)}</p>${terminalEntry ? `<time>${esc(date(terminalEntry.created_at))}</time>` : ""}</div></article>${cancellationDetails}${returnDetails}` : "";
    const discount = Math.max(0, Number(order.discount_total || 0));
    const isProductPromotion = order.promotion_scope === "product";
    const items = (order.items || []).map(item => {
      const hasDiscount = isProductPromotion && Number(item.discount_total || 0) > 0;
      const unitPrice = hasDiscount
        ? `<del>${money(item.unit_price, order.currency)}</del><em>${money(item.discounted_unit_price, order.currency)}</em>`
        : money(item.unit_price, order.currency);
      const lineTotal = hasDiscount
        ? `<del>${money(item.line_total, order.currency)}</del><em>${money(item.discounted_line_total, order.currency)}</em>`
        : money(item.line_total, order.currency);
      return `<article class="tracking-item">${item.image_url ? `<img src="${esc(item.image_url)}" alt="">` : '<span class="tracking-item-placeholder">GT</span>'}<span><strong>${esc(item.product_name)}</strong><small class="${hasDiscount ? "is-discounted" : ""}">${Number(item.quantity)} × ${unitPrice}</small></span><b class="${hasDiscount ? "is-discounted" : ""}">${lineTotal}</b></article>`;
    }).join("");
    const displaySubtotal = Number(order.subtotal || 0) - (isProductPromotion ? discount : 0);
    const hasVat = Boolean(order.vat_payer);
    const subtotalLabel = `${isProductPromotion && discount > 0 ? "Subtotal după reducerile pe produse" : "Subtotal"}${hasVat ? " (TVA inclus)" : ""}`;
    const discountRow = discount > 0 && !isProductPromotion
      ? `<p class="discount"><span>Reducere${order.promotion_code ? ` · ${esc(order.promotion_code)}` : ""}</span><b>−${money(discount, order.currency)}</b></p>`
      : "";
    const customerType = order.customer_type === "company" ? "PJ" : "PF";
    const contactName = order.customer_contact_name || order.customer_name || "";
    const displayName = order.customer_display_name || (customerType === "PJ" ? order.company_name : contactName) || "";
    const companyRows = customerType === "PJ" ? `<p><span>Persoană de contact</span><b>${esc(contactName)}</b></p><p><span>CUI / CIF</span><b>${esc(order.company_cui)}</b></p><p><span>Registrul Comerțului</span><b>${esc(order.company_registration_number)}</b></p><p><span>Sediu social</span><b>${esc(order.company_address)}</b></p>` : "";
    const customerBlock = `<div class="tracking-customer-data"><header><span class="tracking-customer-badge ${customerType === "PJ" ? "is-company" : ""}">${customerType}</span><strong>${customerType === "PJ" ? "Persoană juridică" : "Persoană fizică"}</strong></header><p><span>${customerType === "PJ" ? "Denumire firmă" : "Nume"}</span><b>${esc(displayName)}</b></p>${companyRows}<p><span>Telefon</span><b>${esc(order.customer_phone)}</b></p><p><span>Livrare</span><b>${esc([order.address, order.city, order.county].filter(Boolean).join(", "))}</b></p></div>`;
    resultHost.innerHTML = `<section class="tracking-progress"><header class="tracking-result-head"><div class="tracking-current-icon" style="--status-color:${current.color}">${current.icon}</div><div><small>COMANDA ${esc(order.order_number)}</small><h2>${esc(current.label)}</h2><p>${esc(current.description)}</p></div><span class="tracking-status-pill" style="--status-color:${current.color}"><i></i>${esc(current.label)}</span></header><div class="tracking-timeline"><div class="tracking-timeline-flow">${timeline}</div>${terminalState}</div></section><aside class="tracking-receipt"><div class="tracking-receipt-brand"><img src="assets/logo.png" alt=""><span><strong>G-Trots România</strong><small>REZUMAT COMANDĂ</small></span><b>Actualizat acum</b></div><div class="tracking-receipt-code"><span><small>COD COMANDĂ</small><strong>${esc(order.order_number)}</strong></span><span><small>DATA</small><strong>${esc(date(order.created_at))}</strong></span></div>${customerBlock}<div class="tracking-items">${items}</div><div class="tracking-totals"><p><span>${subtotalLabel}</span><b>${money(displaySubtotal, order.currency)}</b></p>${discountRow}<p><span>Livrare · ${esc(order.shipping_method_name)}</span><b>${money(order.shipping_cost, order.currency)}</b></p><p><span>Plată</span><b>${order.payment_method === "card" ? "Card online" : "Ramburs la curier"}</b></p><p class="total"><span>Total de plată${hasVat ? " (TVA inclus)" : ""}</span><strong>${money(order.total, order.currency)}</strong></p></div><div class="tracking-help"><span>${icons.new}</span><p><strong>Actualizare automată</strong>Vezi aici ultimul status salvat de echipa G-Trots. Nu este nevoie să reintroduci datele comenzii.</p></div></aside>`;
    footerCancel.hidden = !order.can_cancel;
    footerReturn.hidden = !order.can_request_return;
    resultHost.querySelectorAll(".tracking-item img").forEach(image => image.addEventListener("error", () => {
      image.replaceWith(Object.assign(document.createElement("span"), { className: "tracking-item-placeholder", textContent: "GT" }));
    }, { once: true }));
    stateHost.hidden = true;
    resultHost.hidden = false;
    resultHost.scrollIntoView({ behavior: "smooth", block: "start" });
    if (cancellationIntent && order.can_cancel) window.setTimeout(openCancellation, 180);
    if (returnIntent && order.can_request_return) window.setTimeout(openReturn, 180);
  }
  function openCancellation() {
    if (!activeOrder?.can_cancel || !activeAccess) return;
    cancelError.textContent = "";
    cancelReason.value = "";
    cancelModal.hidden = false;
    document.body.classList.add("cancellation-open");
    window.setTimeout(() => cancelReason.focus(), 80);
  }
  function closeCancellation() {
    if (cancelConfirm.disabled) return;
    cancelModal.hidden = true;
    document.body.classList.remove("cancellation-open");
  }
  async function submitCancellation() {
    const reason = cancelReason.value.trim();
    if (reason.length < 3) { cancelError.textContent = "Scrie un motiv de cel puțin 3 caractere."; cancelReason.focus(); return; }
    cancelError.textContent = "";
    cancelConfirm.disabled = true;
    cancelConfirm.textContent = "Se anulează…";
    try {
      const response = await fetch(`${API_URL}?action=customerCancelOrder`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ ...activeAccess, reason }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Comanda nu a putut fi anulată.");
      cancelModal.hidden = true;
      document.body.classList.remove("cancellation-open");
      render(data.order);
    } catch (error) {
      cancelError.textContent = error instanceof Error ? error.message : "Comanda nu a putut fi anulată.";
    } finally {
      cancelConfirm.disabled = false;
      cancelConfirm.textContent = "Anulează comanda";
    }
  }
  function openReturn() {
    if (!activeOrder?.can_request_return || !activeAccess) return;
    returnError.textContent = "";
    returnReason.value = "";
    returnHolder.value = activeOrder.customer_contact_name || activeOrder.customer_name || "";
    returnIban.value = "";
    const cost = Number(activeOrder.configured_return_shipping_cost || 0);
    returnCost.textContent = money(cost, activeOrder.currency);
    returnRefund.textContent = money(Math.max(0, Number(activeOrder.total || 0) - cost), activeOrder.currency);
    returnModal.hidden = false;
    document.body.classList.add("return-open");
    window.setTimeout(() => returnReason.focus(), 80);
  }
  function closeReturn() {
    if (returnConfirm.disabled) return;
    returnModal.hidden = true;
    document.body.classList.remove("return-open");
  }
  async function submitReturn() {
    const reason = returnReason.value.trim();
    const holder = returnHolder.value.trim();
    const iban = returnIban.value.trim().toUpperCase().replace(/\s+/g, "");
    if (reason.length < 3 || holder.length < 3 || !iban) { returnError.textContent = "Completează motivul, titularul contului și IBAN-ul."; return; }
    returnError.textContent = "";
    returnConfirm.disabled = true;
    returnConfirm.textContent = "Se trimite…";
    try {
      const response = await fetch(`${API_URL}?action=customerRequestReturn`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ ...activeAccess, reason, bank_account_holder: holder, bank_iban: iban }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Solicitarea de retur nu a putut fi trimisă.");
      returnModal.hidden = true;
      document.body.classList.remove("return-open");
      render(data.order);
    } catch (error) {
      returnError.textContent = error instanceof Error ? error.message : "Solicitarea de retur nu a putut fi trimisă.";
    } finally {
      returnConfirm.disabled = false;
      returnConfirm.textContent = "Trimite solicitarea";
    }
  }
  async function load(query, access) {
    activeAccess = access;
    submit.disabled = true;
    showState("loading", "Verificăm comanda…", "Conectăm în siguranță codul cu informațiile din magazin.");
    try {
      const response = await fetch(`${API_URL}?action=publicTrackOrder&${query}&_=${Date.now()}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Comanda nu a putut fi verificată.");
      render(data);
    } catch (error) {
      showState("error", "Comanda nu a fost găsită", error instanceof Error ? error.message : "Verifică datele și încearcă din nou.");
    } finally { submit.disabled = false; }
  }
  orderInput.addEventListener("input", () => { const start = orderInput.selectionStart; orderInput.value = orderInput.value.toUpperCase(); orderInput.setSelectionRange(start, start); });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const orderNumber = orderInput.value.trim();
    const email = emailInput.value.trim();
    if (!orderNumber || !emailInput.checkValidity()) { showState("error", "Completează datele", "Introdu codul comenzii și adresa de e-mail folosită la checkout."); return; }
    void load(`order_number=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(email)}`, { order_number: orderNumber, email });
  });
  cancelModal.querySelectorAll("[data-cancel-close]").forEach(button => button.addEventListener("click", closeCancellation));
  footerCancel.addEventListener("click", openCancellation);
  cancelConfirm.addEventListener("click", () => void submitCancellation());
  returnModal.querySelectorAll("[data-return-close]").forEach(button => button.addEventListener("click", closeReturn));
  footerReturn.addEventListener("click", openReturn);
  returnConfirm.addEventListener("click", () => void submitReturn());
  returnIban.addEventListener("input", () => { const start = returnIban.selectionStart; returnIban.value = returnIban.value.toUpperCase(); returnIban.setSelectionRange(start, start); });
  document.addEventListener("keydown", event => { if (event.key !== "Escape") return; if (!returnModal.hidden) closeReturn(); else if (!cancelModal.hidden) closeCancellation(); });
  const token = params.get("token")?.trim() || "";
  if (token) {
    document.body.classList.add("tracking-token-mode");
    void load(`token=${encodeURIComponent(token)}`, { token });
  }
})();
if (!document.querySelector('link[href*="promotions.css"]')) { const link = document.createElement("link"); link.rel = "stylesheet"; link.href = "/promotions.css?v=20260828-marquee-v5"; document.head.append(link); }
if (!document.querySelector('script[src*="promotions.js"]')) { const script = document.createElement("script"); script.src = "/promotions.js?v=20260828-global-v1"; document.head.append(script); }
