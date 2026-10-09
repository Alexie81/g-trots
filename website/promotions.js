(() => {
  const COMPONENT_VERSION = "20261004-free-shipping-v1";
  if (window.GTrotsPromotionsVersion === COMPONENT_VERSION) return;
  window.GTrotsPromotionsVersion = COMPONENT_VERSION;
  window.GTrotsPromotionsLoaded = true;
  if (!document.querySelector('link[href*="performance.css"]')) {
    const performanceStyles = document.createElement("link");
    performanceStyles.rel = "stylesheet";
    performanceStyles.href = "/performance.css?v=20260828-catalog-v2";
    document.head.append(performanceStyles);
  }
  const API_URL = "https://g-trots.ro/shop-api/api-v2.php";
  const TOKEN_KEY = "g-trots-customer-session-v1";
  const SHOP_DEVICE_KEY = "g-trots-shop-device-v1";

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

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

  async function loadPromotions() {
    try {
      const token = localStorage.getItem(TOKEN_KEY) || "";
      const deviceToken = shopDeviceToken();
      const requestHeaders = { Accept: "application/json", ...(token ? { "X-Customer-Token": token } : {}), ...(deviceToken ? { "X-Shop-Device": deviceToken } : {}) };
      const stamp = Date.now();
      const [promotionResult, shippingResult] = await Promise.allSettled([
        fetch(`${API_URL}?action=publicActivePromotions&_=${stamp}`, { cache: "no-store", headers: requestHeaders }).then(async response => response.ok ? response.json() : []),
        fetch(`${API_URL}?action=publicFreeShippingBanners&_=${stamp}`, { cache: "no-store", headers: { Accept: "application/json" } }).then(async response => response.ok ? response.json() : []),
      ]);
      const promotions = promotionResult.status === "fulfilled" && Array.isArray(promotionResult.value) ? promotionResult.value.filter(item => item.show_banner) : [];
      const shippingMethods = shippingResult.status === "fulfilled" && Array.isArray(shippingResult.value) ? shippingResult.value : [];
      render(promotions, shippingMethods);
    } catch {
      // Magazinul rămâne disponibil chiar dacă anunțurile nu se pot încărca.
    }
  }

  function render(items, shippingMethods) {
    document.querySelector(".gt-promotion-bar")?.remove();
    document.body.classList.remove("gt-has-promotion-bar");
    document.documentElement.style.removeProperty("--gt-promotion-height");
    const promotionMessages = items.map(item => {
      const value = item.discount_type === "percent" ? `${Number(item.discount_value)}%` : `${Number(item.discount_value).toLocaleString("ro-RO")} lei`;
      const threshold = Number(item.min_order_value) > 0 ? ` la comenzi de minimum ${Number(item.min_order_value).toLocaleString("ro-RO")} lei` : "";
      return item.banner_text || `${item.title} · ${value}${threshold}`;
    });
    const eligibleShippingMethods = shippingMethods
      .filter(item => Number(item.free_above) > 0)
      .sort((left, right) => Number(left.free_above) - Number(right.free_above))
      .slice(0, 1);
    const shippingMessages = eligibleShippingMethods
      .map(item => `Livrare gratuită la comenzi de minimum ${(Math.floor(Number(item.free_above)) + 1).toLocaleString("ro-RO", { maximumFractionDigits: 0 })} lei${item.name ? ` prin ${item.name}` : ""}`);
    const messages = [...shippingMessages, ...promotionMessages];
    if (!messages.length) return;
    const hasPromotions = promotionMessages.length > 0;
    const hasFreeShipping = shippingMessages.length > 0;
    const message = messages.join("   ✦   ");
    const label = hasFreeShipping && !hasPromotions ? "Livrare gratuită" : hasFreeShipping ? "Avantaje active" : "Ofertă activă";
    const badge = hasFreeShipping ? `<i class="gt-free-shipping-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5h11v10H3zM14 10h3.8l3.2 3.4v3.1h-7zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg></i>` : "<i>%</i>";
    const bar = document.createElement("section");
    bar.className = `gt-promotion-bar${hasFreeShipping ? " gt-has-free-shipping" : ""}${hasFreeShipping && !hasPromotions ? " gt-free-shipping-bar" : ""}`;
    bar.setAttribute("aria-label", hasFreeShipping ? "Livrare gratuită și oferte G-Trots" : "Oferte active G-Trots");
    bar.dataset.promotionId = String(items[0]?.id || items[0]?.code || eligibleShippingMethods[0]?.id || "active-benefits");
    bar.dataset.promotionName = String(items[0]?.title || items[0]?.banner_text || shippingMessages[0] || "Avantaje active G-Trots");
    bar.innerHTML = `
      <div class="gt-promotion-shell">
        <span class="gt-promotion-label" aria-hidden="true">${badge}<b>${escapeHtml(label)}</b></span>
        <div class="gt-promotion-viewport">
          <div class="gt-promotion-track"><span>${escapeHtml(message)}</span><span aria-hidden="true">${escapeHtml(message)}</span></div>
        </div>
      </div>`;
    const header = document.querySelector(".site-header, header");
    if (header?.parentNode) header.parentNode.insertBefore(bar, header);
    else document.body.prepend(bar);
    document.body.classList.add("gt-has-promotion-bar");
    document.dispatchEvent(new CustomEvent("g-trots:promotions-viewed", { detail: items }));

    const syncTrack = () => {
      const viewport = bar.querySelector(".gt-promotion-viewport");
      const sample = bar.querySelector(".gt-promotion-track span");
      const viewportWidth = Math.max(1, Math.round(viewport?.getBoundingClientRect().width || 1));
      const textWidth = Math.max(1, Math.ceil(sample?.scrollWidth || 1));
      const cycleWidth = Math.max(viewportWidth, textWidth + 32);
      bar.style.setProperty("--gt-promotion-cycle", `${cycleWidth}px`);
      bar.style.setProperty("--gt-promotion-duration", `${Math.max(10, cycleWidth / 65).toFixed(2)}s`);
    };
    requestAnimationFrame(syncTrack);
    if ("ResizeObserver" in window) new ResizeObserver(syncTrack).observe(bar);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadPromotions, { once: true });
  else void loadPromotions();
  document.addEventListener("g-trots:customer-changed", loadPromotions);
})();
