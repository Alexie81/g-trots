(() => {
  if (window.GTrotsPromotionsLoaded) return;
  window.GTrotsPromotionsLoaded = true;
  const API_URL = "https://g-trots.ro/shop-api/api-v2.php";
  const TOKEN_KEY = "g-trots-customer-session-v1";

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

  async function loadPromotions() {
    try {
      const token = localStorage.getItem(TOKEN_KEY) || "";
      const response = await fetch(`${API_URL}?action=publicActivePromotions&_=${Date.now()}`, { cache: "no-store", headers: { Accept: "application/json", ...(token ? { "X-Customer-Token": token } : {}) } });
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

    const syncHeight = () => {
      const height = Math.max(1, Math.round(bar.getBoundingClientRect().height));
      document.documentElement.style.setProperty("--gt-promotion-height", `${height}px`);
    };
    requestAnimationFrame(syncHeight);
    if ("ResizeObserver" in window) new ResizeObserver(syncHeight).observe(bar);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadPromotions, { once: true });
  else void loadPromotions();
  document.addEventListener("g-trots:customer-changed", loadPromotions);
})();
