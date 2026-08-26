(() => {
  const API_URL = "https://g-trots.ro/shop-api/api-v2.php";
  const icons = {
    new: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    confirmed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 12.5 10.2 16 17.5 8"/><circle cx="12" cy="12" r="9"/></svg>',
    processing: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 8 8-4 8 4-8 4Z"/><path d="M4 8v8l8 4 8-4V8M12 12v8"/></svg>',
    shipped: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    completed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/><circle cx="12" cy="12" r="10"/></svg>',
    cancelled: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>'
  };
  const statuses = [
    { value: "new", label: "În procesare", description: "Am primit comanda și verificăm toate detaliile.", color: "#38bdf8", icon: icons.new },
    { value: "confirmed", label: "Confirmată", description: "Comanda și plata au fost confirmate.", color: "#34d399", icon: icons.confirmed },
    { value: "processing", label: "În pregătire", description: "Produsele sunt pregătite pentru expediere.", color: "#fb923c", icon: icons.processing },
    { value: "shipped", label: "Predată curierului", description: "Pachetul a plecat către adresa de livrare.", color: "#a78bfa", icon: icons.shipped },
    { value: "completed", label: "Livrată", description: "Comanda a ajuns la destinație.", color: "#22c55e", icon: icons.completed },
    { value: "cancelled", label: "Comandă anulată", description: "Comanda nu mai este procesată.", color: "#fb7185", icon: icons.cancelled },
  ];
  const resultHost = document.getElementById("tracking-result");
  const stateHost = document.getElementById("tracking-state");
  const form = document.getElementById("tracking-form");
  const submit = document.getElementById("tracking-submit");
  const orderInput = document.getElementById("tracking-order-number");
  const emailInput = document.getElementById("tracking-email");
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const money = (value, currency = "RON") => `${new Intl.NumberFormat("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} ${currency}`;
  const date = value => { const parsed = new Date(String(value || "").replace(" ", "T")); return Number.isNaN(parsed.getTime()) ? String(value || "") : parsed.toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" }); };

  function showState(kind, title, message) {
    resultHost.hidden = true;
    stateHost.hidden = false;
    stateHost.className = `tracking-state ${kind}`;
    stateHost.innerHTML = `<div><span class="tracking-state-icon">${kind === "error" ? "!" : "↻"}</span><h2>${esc(title)}</h2><p>${esc(message)}</p></div>`;
  }
  function visibleStatuses(order) {
    return statuses;
  }
  function render(order) {
    const current = statuses.find(item => item.value === order.status) || statuses[0];
    const history = Array.isArray(order.status_history) ? order.status_history : [];
    const flowStatuses = visibleStatuses(order).filter(item => item.value !== "cancelled");
    const currentFlowIndex = flowStatuses.findIndex(item => item.value === order.status);
    const timeline = flowStatuses.map((item, index) => {
      const entry = [...history].reverse().find(historyItem => historyItem.to_status === item.value);
      const reached = order.status !== "cancelled" && (Boolean(entry) || (currentFlowIndex >= 0 && index <= currentFlowIndex));
      const isCurrent = item.value === order.status;
      return `<article class="tracking-step ${reached ? "reached" : ""} ${isCurrent ? "current" : ""}" style="--status-color:${item.color}"><div class="tracking-step-rail"><span>${item.icon}</span></div><div class="tracking-step-copy"><small>${isCurrent ? "STATUS ACTUAL" : reached ? "FINALIZAT" : "URMEAZĂ"}</small><strong>${esc(item.label)}</strong><p>${esc(item.description)}</p>${entry ? `<time>${esc(date(entry.created_at))}</time>` : ""}</div></article>`;
    }).join("");
    const cancelledMeta = statuses.find(item => item.value === "cancelled");
    const cancelledEntry = [...history].reverse().find(historyItem => historyItem.to_status === "cancelled");
    const cancelledCurrent = order.status === "cancelled";
    const cancelled = `<article class="tracking-cancel-state ${cancelledCurrent ? "current" : ""}" style="--status-color:${cancelledMeta.color}"><span>${cancelledMeta.icon}</span><div><small>${cancelledCurrent ? "STATUS ACTUAL" : "STARE ALTERNATIVĂ"}</small><strong>${esc(cancelledMeta.label)}</strong><p>${esc(cancelledMeta.description)}</p>${cancelledEntry ? `<time>${esc(date(cancelledEntry.created_at))}</time>` : ""}</div></article>`;
    const items = (order.items || []).map(item => `<article class="tracking-item">${item.image_url ? `<img src="${esc(item.image_url)}" alt="">` : '<span class="tracking-item-placeholder">GT</span>'}<span><strong>${esc(item.product_name)}</strong><small>${Number(item.quantity)} × ${money(item.unit_price, order.currency)}</small></span><b>${money(item.line_total, order.currency)}</b></article>`).join("");
    resultHost.innerHTML = `<section class="tracking-progress"><header class="tracking-result-head"><div class="tracking-current-icon" style="--status-color:${current.color}">${current.icon}</div><div><small>COMANDA ${esc(order.order_number)}</small><h2>${esc(current.label)}</h2><p>${esc(current.description)}</p></div><span class="tracking-status-pill" style="--status-color:${current.color}"><i></i>${esc(current.label)}</span></header><div class="tracking-timeline"><div class="tracking-timeline-flow">${timeline}</div>${cancelled}</div></section><aside class="tracking-receipt"><div class="tracking-receipt-brand"><img src="assets/logo.png" alt=""><span><strong>G-Trots România</strong><small>REZUMAT COMANDĂ</small></span><b>Actualizat acum</b></div><div class="tracking-receipt-code"><span><small>COD COMANDĂ</small><strong>${esc(order.order_number)}</strong></span><span><small>DATA</small><strong>${esc(date(order.created_at))}</strong></span></div><div class="tracking-items">${items}</div><div class="tracking-totals"><p><span>Subtotal</span><b>${money(order.subtotal, order.currency)}</b></p><p><span>Livrare · ${esc(order.shipping_method_name)}</span><b>${money(order.shipping_cost, order.currency)}</b></p><p><span>Plată</span><b>${order.payment_method === "card" ? "Card online" : "Ramburs la curier"}</b></p><p class="total"><span>Total de plată</span><strong>${money(order.total, order.currency)}</strong></p></div><div class="tracking-help"><span>${icons.new}</span><p><strong>Actualizare automată</strong>Vezi aici ultimul status salvat de echipa G-Trots. Nu este nevoie să reintroduci datele comenzii.</p></div></aside>`;
    resultHost.querySelectorAll(".tracking-item img").forEach(image => image.addEventListener("error", () => {
      image.replaceWith(Object.assign(document.createElement("span"), { className: "tracking-item-placeholder", textContent: "GT" }));
    }, { once: true }));
    stateHost.hidden = true;
    resultHost.hidden = false;
    resultHost.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function load(query) {
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
    void load(`order_number=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(email)}`);
  });
  const token = new URLSearchParams(window.location.search).get("token")?.trim() || "";
  if (token) {
    document.body.classList.add("tracking-token-mode");
    void load(`token=${encodeURIComponent(token)}`);
  }
})();
