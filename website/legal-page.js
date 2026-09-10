(() => {
  const CACHE_KEY = 'g-trots-public-shop-config-v4';
  const CACHE_TTL = 5 * 60 * 1000;
  const API_URL = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname)
    ? 'https://g-trots.ro/shop-api/api-v2.php'
    : '/shop-api/api-v2.php';
  const fallback = { legal_name: 'CAB IT EXPERT S.R.L.', trade_name: 'G-Trots', cui: '49972605', registration_number: 'J40/8303/2024', address: 'Str. Humulești nr. 131-135, lot 4', city: 'București, Sector 5', county: 'București', postal_code: '052262', country: 'România', physical_address: 'București–Ilfov', full_address: 'Str. Humulești nr. 131-135, lot 4, 052262, București, Sector 5, România', email: 'contact@g-trots.ro', phone: '0762 093 915', website: 'https://g-trots.ro', bank_name: '', iban: '', share_capital: '' };

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
      : fetch(`${API_URL}?action=publicShopConfig`, { headers: { Accept: 'application/json' } })
        .then(response => response.ok ? response.json() : null)
        .then(data => {
          if (data) try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ saved_at: Date.now(), data })); } catch { /* storage can be disabled */ }
          return data;
        });
    return window.GTrotsPublicConfigPromise;
  }

  function companyWithFallback(company) {
    const merged = { ...fallback };
    Object.entries(company || {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined && String(value).trim() !== '') merged[key] = value;
    });
    return merged;
  }

  function phoneNumber(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('0040')) digits = digits.slice(2);
    if (digits.startsWith('40')) return `+${digits}`;
    if (digits.startsWith('0')) return `+40${digits.slice(1)}`;
    return digits ? `+40${digits}` : '';
  }

  function phoneDisplay(value) {
    const international = phoneNumber(value);
    const local = international.startsWith('+40') ? `0${international.slice(3)}` : international;
    return /^0\d{9}$/.test(local) ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : String(value || '');
  }

  function fillCompany(input) {
    const company = companyWithFallback(input);
    document.querySelectorAll('[data-company]').forEach(node => {
      const key = node.dataset.company;
      const value = key === 'full_address'
        ? company.full_address
        : String(company[key] || '');
      node.textContent = key === 'phone' ? phoneDisplay(value) : (value || node.textContent || 'Indisponibil temporar');
      if (node.tagName === 'A' && key === 'email') node.href = value ? `mailto:${value}` : '#';
      if (node.tagName === 'A' && key === 'phone') node.href = value ? `tel:${phoneNumber(value)}` : '#';
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
      fillCompany(data?.company);
      renderShipping(Array.isArray(data?.shipping_methods) ? data.shipping_methods.filter(method => method?.is_active !== false) : []);
    })
    .catch(() => {
      fillCompany(fallback);
      renderShipping([]);
    });
})();
