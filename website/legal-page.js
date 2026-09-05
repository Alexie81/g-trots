(() => {
  const CACHE_KEY = 'g-trots-public-shop-config-v1';
  const CACHE_TTL = 5 * 60 * 1000;
  const fallback = { legal_name: 'G-Trots România', trade_name: 'G-Trots România', cui: '', registration_number: '', address: '', city: '', county: '', postal_code: '', country: '', email: '', phone: '' };

  function cachedConfig() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      return cached && Date.now() - Number(cached.saved_at || 0) < CACHE_TTL ? cached.data : null;
    } catch { return null; }
  }

  function loadConfig() {
    if (window.GTrotsPublicConfigPromise) return window.GTrotsPublicConfigPromise;
    const cached = cachedConfig();
    window.GTrotsPublicConfigPromise = cached
      ? Promise.resolve(cached)
      : fetch('/shop-api/api-v2.php?action=publicShopConfig', { headers: { Accept: 'application/json' } })
        .then(response => response.ok ? response.json() : null)
        .then(data => {
          if (data) try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ saved_at: Date.now(), data })); } catch { /* storage can be disabled */ }
          return data;
        });
    return window.GTrotsPublicConfigPromise;
  }

  function fillCompany(company) {
    document.querySelectorAll('[data-company]').forEach(node => {
      const key = node.dataset.company;
      const value = key === 'full_address'
        ? [company.address, company.postal_code, company.city, company.county, company.country].filter(Boolean).join(', ')
        : String(company[key] || '');
      node.textContent = value || 'Indisponibil temporar';
      if (node.tagName === 'A' && key === 'email') node.href = value ? `mailto:${value}` : '#';
      if (node.tagName === 'A' && key === 'phone') node.href = value ? `tel:${value.replace(/\s/g, '')}` : '#';
    });
  }

  function money(value) {
    return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(Number(value || 0));
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  }

  function renderShipping(methods) {
    document.querySelectorAll('[data-shipping-methods]').forEach(host => {
      if (!methods.length) {
        host.innerHTML = '<p class="legal-live-empty">Metodele active și costurile exacte vor fi afișate în checkout înainte de plasarea comenzii.</p>';
        return;
      }
      host.innerHTML = methods.map(method => `<article><div><strong>${escapeHtml(method.name)}</strong><small>${escapeHtml(method.eta_label || method.description || 'Termen afișat în checkout')}</small></div><dl><div><dt>Livrare</dt><dd>${money(method.cost)}</dd></div>${method.free_above == null ? '' : `<div><dt>Gratuit peste</dt><dd>${money(method.free_above)}</dd></div>`}<div><dt>Retur prin G-Trots</dt><dd>${money(method.return_cost)}</dd></div></dl></article>`).join('');
    });
  }

  loadConfig()
    .then(data => {
      fillCompany({ ...fallback, ...(data?.company || {}) });
      renderShipping(Array.isArray(data?.shipping_methods) ? data.shipping_methods.filter(method => method?.is_active !== false) : []);
    })
    .catch(() => {
      fillCompany(fallback);
      renderShipping([]);
    });
})();
