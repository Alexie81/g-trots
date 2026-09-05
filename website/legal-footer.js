(() => {
  if (window.__gtLegalFooter) return;
  window.__gtLegalFooter = true;

  const CACHE_KEY = 'g-trots-public-shop-config-v1';
  const CACHE_TTL = 5 * 60 * 1000;
  const companyFallback = {
    legal_name: 'G-Trots România',
    trade_name: 'G-Trots',
    email: '',
    phone: '+40 0762 093 915',
    cui: '',
    registration_number: '',
    address: '',
    city: '',
    county: '',
    postal_code: '',
    country: '',
  };

  const loadAsset = (tag, attributes) => {
    const element = document.createElement(tag);
    Object.assign(element, attributes);
    document.head.append(element);
    return element;
  };
  const esc = value => String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

  if (!document.querySelector('link[href*="fonts.googleapis.com/css2?family=Manrope"]')) {
    loadAsset('link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap' });
  }
  loadAsset('link', { rel: 'stylesheet', href: '/legal-footer.css?v=20260905-15' });
  if (!document.querySelector('script[src*="cookie-consent.js"]')) {
    loadAsset('script', { src: '/cookie-consent.js?v=20260905-default-on-v1', defer: true });
  }

  function phoneHref(phone) {
    const normalized = String(phone || '').replace(/[^+\d]/g, '');
    return normalized ? `tel:${normalized}` : '#';
  }

  function ensureOriginalHeader() {
    const legacyHeader = document.querySelector('.legal-top');
    if (!legacyHeader || document.querySelector('.site-header:not(.legal-top)')) return;

    const header = document.createElement('header');
    header.className = 'site-header gt-public-header';
    header.innerHTML = `
      <div class="header-inner">
        <a class="logo" href="/" aria-label="G-Trots, pagina principală">
          <img src="/assets/logo.png" width="1024" height="1024" alt="">
          <b><span>G</span>-Trots</b>
        </a>
        <nav class="main-nav" aria-label="Navigație principală">
          <div class="mobile-nav-heading" aria-hidden="true"><span>Meniu</span><small>G-Trots service</small></div>
          <a href="/#servicii">Servicii</a>
          <a class="nav-shop-link" href="/magazin.html"><span class="nav-shop-icon" aria-hidden="true"></span><span>Shop</span></a>
          <a href="/ghiduri-service-trotinete-electrice.html">Ghiduri</a>
          <a href="/#proces">Cum lucrăm</a>
          <a href="/#intrebari">Întrebări</a>
          <a href="/#contact">Contact</a>
          <a class="mobile-nav-account" href="/login.html" aria-label="Intră în cont sau creează un cont"><span class="mobile-nav-account-avatar" aria-hidden="true"><i></i></span><span class="mobile-nav-account-copy"><small>CONT G-TROTS</small><strong>Login</strong></span><b aria-hidden="true">›</b></a>
          <a class="mobile-nav-call" href="tel:+40762093915"><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.7 3.3 3.3 4.9 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.4.6 3.6.6.6 0 .9.4.9.9V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.6c.5 0 .9.3.9.8.1 1.3.3 2.5.6 3.6.1.4 0 .8-.3 1.1l-2.2 2.3Z"/></svg></span><strong>Sună chiar acum</strong><small>+40 0762 093 915</small></a>
        </nav>
        <a class="button button-small header-cta call-button" href="tel:+40762093915">
          Sună acum
          <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.7 3.3 3.3 4.9 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.4.6 3.6.6.6 0 .9.4.9.9V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.6c.5 0 .9.3.9.8.1 1.3.3 2.5.6 3.6.1.4 0 .8-.3 1.1l-2.2 2.3Z"/></svg></span>
        </a>
        <button class="menu-toggle" type="button" aria-label="Deschide meniul" aria-expanded="false"><span></span><span></span></button>
      </div>`;
    legacyHeader.replaceWith(header);

    const toggle = header.querySelector('.menu-toggle');
    const nav = header.querySelector('.main-nav');
    const syncMobileAccount = () => {
      const account = nav.querySelector('.mobile-nav-account');
      if (!account) return;
      let customer = null;
      let loggedIn = false;
      try {
        loggedIn = Boolean(localStorage.getItem('g-trots-customer-session-v1'));
        customer = loggedIn ? JSON.parse(localStorage.getItem('g-trots-customer-profile-v1') || 'null') : null;
      } catch { /* localStorage poate fi indisponibil */ }
      const name = customer ? String(customer.full_name || 'Contul meu').trim().split(/\s+/)[0] : 'Login';
      account.href = loggedIn && customer ? '/cont.html' : '/login.html';
      account.setAttribute('aria-label', loggedIn && customer ? `Deschide contul lui ${name}` : 'Intră în cont sau creează un cont');
      account.querySelector('small').textContent = loggedIn && customer ? 'CONTUL TĂU' : 'CONT G-TROTS';
      account.querySelector('strong').textContent = name;
      account.classList.toggle('is-authenticated', Boolean(loggedIn && customer));
    };
    const setOpen = open => {
      document.body.classList.toggle('menu-open', open);
      nav.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Închide meniul' : 'Deschide meniul');
    };
    toggle.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
    nav.addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
    addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
    addEventListener('storage', event => {
      if (event.key === 'g-trots-customer-session-v1' || event.key === 'g-trots-customer-profile-v1') syncMobileAccount();
    });
    syncMobileAccount();
  }

  function ensureShopNavigation() {
    if (!document.querySelector('link[href*="favorites.css"]')) {
      loadAsset('link', { rel: 'stylesheet', href: '/favorites.css?v=20260828-line-promotions-v1' });
    }
    if (!document.querySelector('script[src*="favorites.js"]')) {
      loadAsset('script', { src: '/favorites.js?v=20260905-shared-header-v1' });
    }
  }

  function cachedConfig() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      return cached && Date.now() - Number(cached.saved_at || 0) < CACHE_TTL ? cached.data : null;
    } catch {
      return null;
    }
  }

  function loadConfig() {
    if (window.GTrotsPublicConfigPromise) return window.GTrotsPublicConfigPromise;
    const cached = cachedConfig();
    window.GTrotsPublicConfigPromise = cached
      ? Promise.resolve(cached)
      : fetch('/shop-api/api-v2.php?action=publicShopConfig', { headers: { Accept: 'application/json' } })
        .then(response => response.ok ? response.json() : null)
        .then(data => {
          if (data) {
            try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ saved_at: Date.now(), data })); } catch { /* storage can be disabled */ }
          }
          return data;
        });
    return window.GTrotsPublicConfigPromise;
  }

  function appendOrganizationSchema(company) {
    if (document.querySelector('[data-gt-organization-schema]')) return;
    const hasAddress = company.address || company.city || company.county || company.postal_code;
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'OnlineStore',
      name: company.trade_name || company.legal_name || 'G-Trots România',
      url: `${location.origin}/`,
      logo: `${location.origin}/assets/logo.png`,
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'RO',
        returnPolicyCountry: 'RO',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: 30,
        returnMethod: 'https://schema.org/ReturnByMail',
        returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility',
        merchantReturnLink: `${location.origin}/politica-de-retur`,
      },
    };
    if (company.legal_name) schema.legalName = company.legal_name;
    if (company.email || company.phone) schema.contactPoint = { '@type': 'ContactPoint', contactType: 'customer service', email: company.email || undefined, telephone: company.phone || undefined };
    if (company.email) schema.email = company.email;
    if (company.phone) schema.telephone = company.phone;
    if (company.cui) { schema.taxID = company.cui; schema.vatID = company.cui; }
    if (hasAddress) schema.address = { '@type': 'PostalAddress', streetAddress: company.address || undefined, postalCode: company.postal_code || undefined, addressLocality: company.city || undefined, addressRegion: company.county || undefined, addressCountry: 'RO' };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.gtOrganizationSchema = '';
    script.textContent = JSON.stringify(schema);
    document.head.append(script);
  }

  function paymentMarks() {
    return `
      <span class="gt-pay-mark gt-pay-visa" aria-label="Visa"><svg viewBox="0 0 72 28" aria-hidden="true"><text x="36" y="20" text-anchor="middle">VISA</text></svg></span>
      <span class="gt-pay-mark gt-pay-mastercard" aria-label="Mastercard"><svg viewBox="0 0 72 28" aria-hidden="true"><circle cx="30" cy="14" r="9"/><circle cx="42" cy="14" r="9"/><path d="M36 7.3a9 9 0 0 1 0 13.4A9 9 0 0 1 36 7.3Z"/></svg></span>
      <span class="gt-pay-mark gt-pay-google" aria-label="Google Pay"><svg viewBox="0 0 82 28" aria-hidden="true"><g transform="translate(3 2)"><path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.05H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.35Z"/><path fill="#34a853" d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.59A10 10 0 0 0 12 22Z"/><path fill="#fbbc05" d="M6.39 13.9a6.02 6.02 0 0 1 0-3.8V7.51H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.49l3.35-2.59Z"/><path fill="#ea4335" d="M12 5.97c1.47 0 2.79.5 3.83 1.5L18.7 4.6A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.59C7.18 7.73 9.39 5.97 12 5.97Z"/></g><text x="31" y="20">Pay</text></svg></span>
      <span class="gt-pay-mark gt-pay-apple" aria-label="Apple Pay"><svg viewBox="0 0 76 28" aria-hidden="true"><path d="M18.7 9.2c-1.1 0-2.8-1.2-4.6-1.2-2.3 0-4.4 1.3-5.6 3.4-2.4 4.2-.6 10.3 1.7 13.6 1.1 1.6 2.4 3.4 4.2 3.3 1.7-.1 2.3-1.1 4.4-1.1 2 0 2.6 1.1 4.4 1.1 1.8 0 3-1.6 4.1-3.2 1.3-1.9 1.8-3.8 1.8-3.9-.1 0-3.5-1.3-3.5-5.4 0-3.4 2.8-5 2.9-5.1-1.6-2.3-4.1-2.6-5-2.7-2.3-.2-4.2 1.2-5.2 1.2Zm3.6-3.5c.9-1.1 1.5-2.7 1.3-4.2-1.3.1-2.9.9-3.9 2-.8.9-1.5 2.5-1.3 4 1.5.1 3-.7 3.9-1.8Z" transform="translate(0 -1) scale(.72)"/><text x="27" y="20">Pay</text></svg></span>
      <span class="gt-pay-mark gt-pay-stripe" aria-label="Stripe"><svg viewBox="0 0 76 28" aria-hidden="true"><text x="38" y="20" text-anchor="middle">stripe</text></svg></span>`;
  }

  function render(company) {
    if (document.querySelector('[data-gt-legal-footer]')) return;
    const existingFooter = Array.from(document.querySelectorAll('body > footer'))
      .reverse()
      .find(footer => !footer.classList.contains('smart-search-footer'));
    const host = existingFooter || document.createElement('footer');
    const isTrackingFooter = host.classList.contains('tracking-footer');
    let trackingContent = null;
    if (isTrackingFooter) {
      trackingContent = document.createElement('div');
      trackingContent.className = 'gt-site-footer__tracking';
      while (host.firstChild) trackingContent.append(host.firstChild);
    } else {
      host.replaceChildren();
    }

    // Pagina principală avea clase de layout vechi (`shell` / `footer-inner`)
    // care restrângeau footerul doar la anumite lățimi mobile. Componenta comună
    // își controlează singură dimensiunile, identic pe toate paginile.
    host.classList.remove('shell');
    host.classList.add('gt-site-footer');
    if (!existingFooter) host.classList.add('gt-site-footer--generated');
    host.dataset.gtLegalFooter = '';
    host.setAttribute('aria-label', 'Informații despre G-Trots, plăți și politici');

    const address = [company.address, company.postal_code, company.city, company.county, company.country].filter(Boolean).join(', ');
    const tradeName = company.trade_name || company.legal_name || 'G-Trots';
    const inner = document.createElement('div');
    inner.className = 'gt-site-footer__inner';
    inner.innerHTML = `
      <section class="gt-site-footer__brand">
        <a class="gt-site-footer__logo" href="/">
          <img src="/assets/logo.png" width="1024" height="1024" alt="">
          <span><strong>${esc(tradeName)}</strong><small>Service & shop pentru mobilitate electrică</small></span>
        </a>
        <p>Cumpărături clare, piese alese atent și asistență reală înainte și după comandă.</p>
        <div class="gt-site-footer__trust"><span>Plăți securizate</span><span>Retur transparent</span><span>Suport G-Trots</span></div>
        <div class="gt-site-footer__contact">${company.phone ? `<a href="${phoneHref(company.phone)}">${esc(company.phone)}</a>` : ''}${company.email ? `<a href="mailto:${esc(company.email)}">${esc(company.email)}</a>` : ''}</div>
      </section>
      <div class="gt-site-footer__nav-grid">
        <nav aria-label="Magazin și servicii"><b>Magazin și servicii</b><div><a href="/">Service G-Trots</a><a href="/magazin.html">Catalog produse</a><a href="/livrare-si-plata">Livrare și plată</a><a href="/plata-si-facturare">Plată și facturare</a><a href="/despre-g-trots">Despre G-Trots</a></div></nav>
        <nav aria-label="Comenzi și retururi"><b>Comenzi și retururi</b><div><a href="/urmarire-comanda">Urmărește comanda</a><a href="/politica-de-retur">Politica de retur</a><a class="gt-withdrawal-link" href="/solicita-retur">Solicită un retur</a><a href="/garantii-si-reclamatii">Garanții și reclamații</a><a href="/contact">Contact</a></div></nav>
        <nav aria-label="Legal și confidențialitate"><b>Legal și confidențialitate</b><div><a href="/termeni-si-conditii">Termeni și condiții</a><a href="/politica-de-confidentialitate">Confidențialitate</a><a href="/politica-cookies">Politica de cookie-uri</a><button type="button" data-cookie-preferences>Preferințe cookie</button><a href="/siguranta-produselor">Siguranța produselor</a><a href="/conditii-b2b">Condiții B2B</a><a href="/accesibilitate">Accesibilitate</a></div></nav>
      </div>
      <section class="gt-site-footer__assurance" aria-label="Plăți și protecția consumatorilor">
        <div class="gt-site-footer__payments"><span><b>Plăți securizate</b><small>Procesate prin Stripe</small></span><div>${paymentMarks()}</div></div>
        <a class="gt-sal-link" href="https://reclamatiisal.anpc.ro" target="_blank" rel="noopener noreferrer"><img src="/assets/anpc-sal.png" width="201" height="50" alt="ANPC - Soluționarea Alternativă a Litigiilor"></a>
      </section>
      <div class="gt-site-footer__bottom">
        <span class="gt-site-footer__company">${esc(company.legal_name || 'G-Trots România')}${company.cui ? ` · CUI ${esc(company.cui)}` : ''}${company.registration_number ? ` · ${esc(company.registration_number)}` : ''}${address ? ` · ${esc(address)}` : ''}</span>
        <a class="cab-it-credit" href="https://cab-it.ro/" target="_blank" rel="noopener noreferrer"><span>Designed by</span><img src="https://cab-it.ro/assets/img/brand/cab-it-header-symbol-clean.webp" width="44" height="44" alt="Sigla CAB-IT Expert"><strong>cab-it.ro</strong></a>
        <span class="gt-site-footer__copyright">© ${new Date().getFullYear()} ${esc(tradeName)}</span>
      </div>`;

    if (trackingContent) host.append(trackingContent);
    host.append(inner);
    host.querySelector('[data-cookie-preferences]')?.addEventListener('click', () => {
      if (window.GTrotsConsent?.open) window.GTrotsConsent.open();
      else document.dispatchEvent(new CustomEvent('g-trots:open-consent'));
    });
    if (!existingFooter) document.body.append(host);
    appendOrganizationSchema(company);
  }

  ensureOriginalHeader();
  ensureShopNavigation();
  loadConfig()
    .then(data => render({ ...companyFallback, ...(data?.company || {}) }))
    .catch(() => render(companyFallback));
})();
