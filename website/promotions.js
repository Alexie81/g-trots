(() => {
  if (window.GTrotsPromotionsLoaded) return;
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
      const response = await fetch(`${API_URL}?action=publicActivePromotions&_=${Date.now()}`, { cache: "no-store", headers: { Accept: "application/json", ...(token ? { "X-Customer-Token": token } : {}), ...(deviceToken ? { "X-Shop-Device": deviceToken } : {}) } });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload)) return;
      render(payload.filter(item => item.show_banner));
    } catch {
      // Magazinul rămâne disponibil chiar dacă anunțurile nu se pot încărca.
    }
  }

  function render(items) {
    document.querySelector(".gt-promotion-bar")?.remove();
    document.body.classList.remove("gt-has-promotion-bar");
    document.documentElement.style.removeProperty("--gt-promotion-height");
    if (!items.length) return;
    const message = items.map(item => {
      const value = item.discount_type === "percent" ? `${Number(item.discount_value)}%` : `${Number(item.discount_value).toLocaleString("ro-RO")} lei`;
      const threshold = Number(item.min_order_value) > 0 ? ` la comenzi de minimum ${Number(item.min_order_value).toLocaleString("ro-RO")} lei` : "";
      return item.banner_text || `${item.title} · ${value}${threshold}`;
    }).join("   ✦   ");
    const bar = document.createElement("section");
    bar.className = "gt-promotion-bar";
    bar.setAttribute("aria-label", "Oferte active G-Trots");
    bar.innerHTML = `
      <div class="gt-promotion-shell">
        <span class="gt-promotion-label" aria-hidden="true"><i>%</i><b>Ofertă activă</b></span>
        <div class="gt-promotion-viewport">
          <div class="gt-promotion-track"><span>${escapeHtml(message)}</span><span aria-hidden="true">${escapeHtml(message)}</span></div>
        </div>
      </div>`;
    const header = document.querySelector(".site-header, header");
    if (header?.parentNode) header.parentNode.insertBefore(bar, header);
    else document.body.prepend(bar);
    document.body.classList.add("gt-has-promotion-bar");

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
