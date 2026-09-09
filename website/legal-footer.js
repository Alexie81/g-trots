(() => {
  const COMPONENT_VERSION = '20260909-nav-v3';
  if (window.__gtLegalFooterVersion === COMPONENT_VERSION) return;
  window.__gtLegalFooterVersion = COMPONENT_VERSION;
  window.__gtLegalFooter = true;
  document.documentElement.classList.add('commerce-preview');

  const CACHE_KEY = 'g-trots-public-shop-config-v3';
  const CACHE_TTL = 5 * 60 * 1000;
  const API_URL = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname)
    ? 'https://g-trots.ro/shop-api/api-v2.php'
    : '/shop-api/api-v2.php';
  const companyFallback = {
    legal_name: 'CAB IT EXPERT S.R.L.',
    trade_name: 'G-Trots',
    email: 'contact@g-trots.ro',
    phone: '0762093915',
    website: 'https://g-trots.ro',
    cui: '49972605',
    registration_number: 'J40/8303/2024',
    address: 'Str. Humulești nr. 131-135, lot 4',
    city: 'București, Sector 5',
    county: 'București',
    postal_code: '052262',
    country: 'România',
    bank_name: '',
    iban: '',
    share_capital: '',
  };

  const loadAsset = (tag, attributes) => {
    const element = document.createElement(tag);
    Object.assign(element, attributes);
    document.head.append(element);
    return element;
  };
  const esc = value => String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

  if (!document.querySelector('link[href*="fonts.googleapis.com/css2?family=Manrope"]')) {
    loadAsset('link', {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap',
      media: 'print',
      onload() { this.media = 'all'; },
    });
  }
  loadAsset('link', { rel: 'stylesheet', href: '/legal-footer.css?v=20260909-nav-v2' });
  if (!document.querySelector('script[src*="google-measurement.js"]')) {
    loadAsset('script', { src: '/google-measurement.js?v=20260907-meta-v9', async: true });
  }
  if (!document.querySelector('script[src*="meta-measurement.js"]')) {
    loadAsset('script', { src: '/meta-measurement.js?v=20260907-meta-v2', async: true });
  }
  if (!document.querySelector('script[src*="cookie-consent.js"]')) {
    loadAsset('script', { src: '/cookie-consent.js?v=20260907-meta-v6', async: true });
  }

  function phoneHref(phone) {
    const normalized = String(phone || '').replace(/[^+\d]/g, '');
    return normalized ? `tel:${normalized}` : '#';
  }

  function companyAddress(company) {
    return [company.address, company.postal_code, company.city, company.county, company.country].filter(Boolean).join(', ');
  }

  function renderCompanyProfiles(company) {
    const address = companyAddress(company);
    const bank = [company.bank_name, company.iban].filter(Boolean).join(' · ');
    const profileHtml = `
      <div class="gt-company-profile__heading"><span>DATE OFICIALE</span><h2>Comerciantul din spatele G-Trots</h2><p>Informațiile sunt administrate central din aplicațiile G-Trots și se actualizează în toate paginile publice.</p></div>
      <dl class="gt-company-profile__grid">
        <div><dt>Denumire juridică</dt><dd>${esc(company.legal_name || 'Necompletat')}</dd></div>
        <div><dt>CUI / CIF</dt><dd>${esc(company.cui || 'Necompletat')}</dd></div>
        <div><dt>Registrul Comerțului</dt><dd>${esc(company.registration_number || 'Necompletat')}</dd></div>
        <div><dt>Sediu social</dt><dd>${esc(address || 'Necompletat')}</dd></div>
        <div><dt>Telefon</dt><dd>${company.phone ? `<a href="${phoneHref(company.phone)}">${esc(company.phone)}</a>` : 'Necompletat'}</dd></div>
        <div><dt>E-mail</dt><dd>${company.email ? `<a href="mailto:${esc(company.email)}">${esc(company.email)}</a>` : 'Necompletat'}</dd></div>
        <div><dt>Website</dt><dd>${company.website ? `<a href="${esc(company.website)}">${esc(company.website)}</a>` : 'Necompletat'}</dd></div>
        <div><dt>Date bancare</dt><dd>${esc(bank || 'Se completează din aplicațiile G-Trots')}</dd></div>
      </dl>`;

    const legalContent = document.querySelector('.legal-content');
    if (legalContent && !legalContent.querySelector('[data-gt-company-profile]')) {
      const card = document.createElement('article');
      card.className = 'legal-card gt-company-profile';
      card.dataset.gtCompanyProfile = '';
      card.innerHTML = profileHtml;
      legalContent.prepend(card);
    }

    const aboutAnswer = document.querySelector('.about-answer');
    if (aboutAnswer && !document.querySelector('.about-company')) {
      const section = document.createElement('section');
      section.className = 'about-company';
      section.setAttribute('aria-label', 'Datele oficiale ale comerciantului');
      section.innerHTML = `<div class="about-shell gt-company-profile" data-gt-company-profile>${profileHtml}</div>`;
      aboutAnswer.after(section);
    }
  }

  function ensureOriginalHeader() {
    if (/^\/googledb9a3f7a7ad1d21d(?:\.html)?\/?$/i.test(location.pathname)) return;

    const currentPath = location.pathname.toLowerCase().replace(/\/+$/, '').replace(/\.html$/, '') || '/';
    const shopActive = /\/(magazin|produs)(?:\/|$)|anvelopa-g10|display-smart|incarcator-fastcharge|motor-dualhub|baterie-powercore|kit-frana/.test(currentPath);
    const serviceActive = currentPath === '/service-trotinete-electrice';
    const contactActive = currentPath === '/contact';
    const guidesActive = !shopActive && !serviceActive && !contactActive && (
      currentPath === '/ghiduri-service-trotinete-electrice'
      || currentPath.startsWith('/ghid-')
      || Boolean(document.querySelector('main.seo-page'))
    );
    const navigationHtml = `
          <div class="mobile-nav-heading" aria-hidden="true"><span>Meniu</span><small>G-Trots</small></div>
          <a href="/service-trotinete-electrice"${serviceActive ? ' aria-current="page"' : ''}>Servicii</a>
          <a class="nav-shop-link${shopActive ? ' active' : ''}" href="/magazin"${shopActive ? ' aria-current="page"' : ''}><span class="nav-shop-icon" aria-hidden="true"></span><span>Shop</span></a>
          <a href="/ghiduri-service-trotinete-electrice"${guidesActive ? ' aria-current="page"' : ''}>Ghiduri</a>
          <a href="/#proces">Cum lucrăm</a>
          <a href="/#intrebari">Întrebări</a>
          <a href="/contact"${contactActive ? ' aria-current="page"' : ''}>Contact</a>
          <a class="mobile-nav-account" href="/login" aria-label="Intră în cont sau creează un cont"><span class="mobile-nav-account-avatar" aria-hidden="true"><i></i></span><span class="mobile-nav-account-copy"><small>CONT G-TROTS</small><strong>Login</strong></span><b aria-hidden="true">›</b></a>
          <a class="mobile-nav-call" href="tel:+40762093915"><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.7 3.3 3.3 4.9 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.4.6 3.6.6.6 0 .9.4.9.9V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.6c.5 0 .9.3.9.8.1 1.3.3 2.5.6 3.6.1.4 0 .8-.3 1.1l-2.2 2.3Z"/></svg></span><strong>Sună chiar acum</strong><small>+40 0762 093 915</small></a>`;

    const callButtonHtml = `Sună acum <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.7 3.3 3.3 4.9 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.4.6 3.6.6.6 0 .9.4.9.9V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.6c.5 0 .9.3.9.8.1 1.3.3 2.5.6 3.6.1.4 0 .8-.3 1.1l-2.2 2.3Z"/></svg></span>`;

    const existingHeader = document.querySelector('.site-header:not(.legal-top)');
    let header = existingHeader;
    if (!header) {
      const legacyHeader = document.querySelector('.legal-top, .tracking-header');
      header = document.createElement('header');
      header.className = 'site-header gt-public-header';
      header.innerHTML = `
      <div class="header-inner">
        <a class="logo" href="/" aria-label="G-Trots, pagina principală">
          <img src="/assets/favicon.png" width="128" height="128" alt="">
          <b><span>G</span>-Trots</b>
        </a>
        <nav class="main-nav" aria-label="Navigație principală">
${navigationHtml}
        </nav>
        <a class="button button-small header-cta call-button" href="tel:+40762093915">
          ${callButtonHtml}
        </a>
        <button class="menu-toggle" type="button" aria-label="Deschide meniul" aria-expanded="false"><span></span><span></span></button>
      </div>`;
      if (legacyHeader) legacyHeader.replaceWith(header);
      else document.body.prepend(header);
    }

    header.classList.add('gt-public-header');
    const headerInner = header.querySelector('.header-inner');
    const logo = header.querySelector('.logo');
    if (logo) {
      logo.href = '/';
      logo.setAttribute('aria-label', 'G-Trots, pagina principală');
      logo.innerHTML = '<img src="/assets/favicon.png" width="128" height="128" alt=""><b><span>G</span>-Trots</b>';
    }

    let nav = header.querySelector('.main-nav');
    if (!nav && headerInner) {
      nav = document.createElement('nav');
      nav.className = 'main-nav';
      headerInner.append(nav);
    }
    if (!nav) return;
    nav.setAttribute('aria-label', 'Navigație principală');
    nav.innerHTML = navigationHtml;

    let callButton = header.querySelector('.header-cta');
    if (!callButton && headerInner) {
      callButton = document.createElement('a');
      headerInner.insertBefore(callButton, headerInner.querySelector('.global-shop-actions, .menu-toggle'));
    }
    if (callButton) {
      callButton.className = 'button button-small header-cta call-button';
      callButton.href = 'tel:+40762093915';
      callButton.innerHTML = callButtonHtml;
    }

    let toggle = header.querySelector('.menu-toggle');
    if (!toggle && headerInner) {
      toggle = document.createElement('button');
      toggle.className = 'menu-toggle';
      toggle.type = 'button';
      toggle.innerHTML = '<span></span><span></span>';
      headerInner.append(toggle);
    }
    if (!toggle) return;
    // Unele pagini statice au încă un handler inline pentru vechiul navbar.
    // Înlocuirea butonului păstrează aspectul și elimină handler-ele duplicate,
    // altfel aceeași atingere deschide și închide imediat meniul pe mobil.
    const cleanToggle = toggle.cloneNode(true);
    toggle.replaceWith(cleanToggle);
    toggle = cleanToggle;
    toggle.setAttribute('aria-label', 'Deschide meniul');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.dataset.gtNavigationBound = 'true';
    toggle.dataset.favoritesMenuBound = 'true';
    document.dispatchEvent(new CustomEvent('g-trots:customer-changed'));

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
      account.href = loggedIn && customer ? '/cont' : '/login';
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
    toggle.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(!nav.classList.contains('open'));
    });
    nav.addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
    document.addEventListener('click', event => {
      if (nav.classList.contains('open') && !header.contains(event.target)) setOpen(false);
    }, true);
    addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
    addEventListener('resize', () => { if (innerWidth > 900) setOpen(false); }, { passive: true });
    addEventListener('storage', event => {
      if (event.key === 'g-trots-customer-session-v1' || event.key === 'g-trots-customer-profile-v1') syncMobileAccount();
    });
    syncMobileAccount();
  }

  function ensureShopNavigation() {
    if (!document.querySelector('link[href*="favorites.css"]')) {
      loadAsset('link', { rel: 'stylesheet', href: '/favorites.css?v=20260909-nav-v2' });
    }
    if (!document.querySelector('script[src*="favorites.js"]')) {
      loadAsset('script', { src: '/favorites.js?v=20260908-nav-v1' });
    }
  }

  function ensureStaticStoreShortcut() {
    const currentPath = location.pathname.toLowerCase().replace(/\/+$/, '').replace(/\.html$/, '') || '/';
    const commercePath = /^\/(?:magazin|cos|checkout|favorite|cont|login|cont-nou|resetare-parola|plata-finalizata|plata-esuata)(?:\/|$)/.test(currentPath)
      || /(?:anvelopa-g10|display-smart|incarcator-fastcharge|motor-dualhub|baterie-powercore|kit-frana)$/.test(currentPath);
    if (commercePath || document.body.dataset.productId || document.querySelector('main.product-page, [data-product-detail]')) return;
    if (document.querySelector('[data-gt-store-shortcut]')) return;

    const shortcut = document.createElement('a');
    shortcut.className = 'gt-store-shortcut';
    shortcut.href = '/magazin';
    shortcut.dataset.gtStoreShortcut = '';
    shortcut.setAttribute('aria-label', 'Intră în magazinul G-Trots');
    shortcut.innerHTML = `
      <span class="gt-store-shortcut__label" aria-hidden="true">Vezi magazinul</span>
      <span class="gt-store-shortcut__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M6.8 8.1h10.4l1.15 11H5.65l1.15-11Z"/><path d="M9 9V6.6a3 3 0 0 1 6 0V9"/></svg>
      </span>`;
    document.body.append(shortcut);

    const storeCta = Array.from(document.querySelectorAll('a[href="/magazin"], a[href^="/magazin?"]'))
      .find(link => !link.closest('header, footer, nav') && /magazin|produse/i.test(link.textContent || ''));
    let frame = 0;
    const update = () => {
      frame = 0;
      const revealAfter = storeCta
        ? storeCta.getBoundingClientRect().bottom + scrollY + 20
        : Math.max(innerHeight * 0.7, 420);
      shortcut.classList.toggle('is-visible', scrollY > revealAfter);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule, { passive: true });
    update();
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
      : fetch(`${API_URL}?action=publicShopConfig`, { headers: { Accept: 'application/json' } })
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
      alternateName: 'G-Trots',
      url: `${location.origin}/`,
      logo: `${location.origin}/assets/logo.png`,
      sameAs: [
        'https://www.instagram.com/gtrots.ro/',
        'https://www.facebook.com/profile.php?id=61590892933228',
        'https://www.tiktok.com/@gtrots.service',
        'https://x.com/servicegtrots',
        'https://www.youtube.com/@g-trots',
      ],
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
    if (company.cui) schema.taxID = company.cui;
    if (hasAddress) schema.address = { '@type': 'PostalAddress', streetAddress: company.address || undefined, postalCode: company.postal_code || undefined, addressLocality: company.city || undefined, addressRegion: company.county || undefined, addressCountry: 'RO' };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.gtOrganizationSchema = '';
    script.textContent = JSON.stringify(schema);
    document.head.append(script);
  }

  function paymentMarks() {
    return `
      <span class="gt-pay-mark gt-pay-visa" role="img" aria-label="Visa"><svg viewBox="0 0 72 28" aria-hidden="true"><text x="36" y="20" text-anchor="middle">VISA</text></svg></span>
      <span class="gt-pay-mark gt-pay-mastercard" role="img" aria-label="Mastercard"><svg viewBox="0 0 72 28" aria-hidden="true"><circle cx="30" cy="14" r="9"/><circle cx="42" cy="14" r="9"/><path d="M36 7.3a9 9 0 0 1 0 13.4A9 9 0 0 1 36 7.3Z"/></svg></span>
      <span class="gt-pay-mark gt-pay-google" role="img" aria-label="Google Pay"><svg viewBox="0 0 82 28" aria-hidden="true"><g transform="translate(3 2)"><path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.05H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.35Z"/><path fill="#34a853" d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.59A10 10 0 0 0 12 22Z"/><path fill="#fbbc05" d="M6.39 13.9a6.02 6.02 0 0 1 0-3.8V7.51H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.49l3.35-2.59Z"/><path fill="#ea4335" d="M12 5.97c1.47 0 2.79.5 3.83 1.5L18.7 4.6A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.59C7.18 7.73 9.39 5.97 12 5.97Z"/></g><text x="31" y="20">Pay</text></svg></span>
      <span class="gt-pay-mark gt-pay-apple" role="img" aria-label="Apple Pay"><svg viewBox="0 0 76 28" aria-hidden="true"><path d="M18.7 9.2c-1.1 0-2.8-1.2-4.6-1.2-2.3 0-4.4 1.3-5.6 3.4-2.4 4.2-.6 10.3 1.7 13.6 1.1 1.6 2.4 3.4 4.2 3.3 1.7-.1 2.3-1.1 4.4-1.1 2 0 2.6 1.1 4.4 1.1 1.8 0 3-1.6 4.1-3.2 1.3-1.9 1.8-3.8 1.8-3.9-.1 0-3.5-1.3-3.5-5.4 0-3.4 2.8-5 2.9-5.1-1.6-2.3-4.1-2.6-5-2.7-2.3-.2-4.2 1.2-5.2 1.2Zm3.6-3.5c.9-1.1 1.5-2.7 1.3-4.2-1.3.1-2.9.9-3.9 2-.8.9-1.5 2.5-1.3 4 1.5.1 3-.7 3.9-1.8Z" transform="translate(0 -1) scale(.72)"/><text x="27" y="20">Pay</text></svg></span>
      <span class="gt-pay-mark gt-pay-stripe" role="img" aria-label="Stripe"><svg viewBox="0 0 76 28" aria-hidden="true"><text x="38" y="20" text-anchor="middle">stripe</text></svg></span>`;
  }

  function socialLinks() {
    return `
      <div class="gt-site-footer__social" role="navigation" aria-label="Urmărește G-Trots pe rețelele sociale">
        <a class="gt-social-link gt-social-link--instagram" href="https://www.instagram.com/gtrots.ro/" target="_blank" rel="noopener noreferrer" aria-label="G-Trots pe Instagram" title="Instagram">
          <svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="gt-instagram-gradient" x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse"><stop stop-color="#ffd600"/><stop offset=".34" stop-color="#ff7a00"/><stop offset=".58" stop-color="#ff0169"/><stop offset=".8" stop-color="#d300c5"/><stop offset="1" stop-color="#7638fa"/></linearGradient></defs><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.1"/><circle cx="12" cy="12" r="4.05"/><circle class="gt-social-detail" cx="17.45" cy="6.65" r="1.05"/></svg>
        </a>
        <a class="gt-social-link gt-social-link--facebook" href="https://www.facebook.com/profile.php?id=61590892933228" target="_blank" rel="noopener noreferrer" aria-label="G-Trots pe Facebook" title="Facebook">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg>
        </a>
        <a class="gt-social-link gt-social-link--tiktok" href="https://www.tiktok.com/@gtrots.service" target="_blank" rel="noopener noreferrer" aria-label="G-Trots pe TikTok" title="TikTok">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path class="gt-social-tiktok-cyan" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/><path class="gt-social-tiktok-red" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
        </a>
        <a class="gt-social-link gt-social-link--x" href="https://x.com/servicegtrots" target="_blank" rel="noopener noreferrer" aria-label="G-Trots pe X" title="X">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/></svg>
        </a>
        <a class="gt-social-link gt-social-link--youtube" href="https://www.youtube.com/@g-trots" target="_blank" rel="noopener noreferrer" aria-label="G-Trots pe YouTube" title="YouTube">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
        </a>
      </div>`;
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

    const address = companyAddress(company);
    const tradeName = company.trade_name || company.legal_name || 'G-Trots';
    const inner = document.createElement('div');
    inner.className = 'gt-site-footer__inner';
    inner.innerHTML = `
      <section class="gt-site-footer__brand">
        <a class="gt-site-footer__logo" href="/">
          <img src="/assets/favicon.png" width="128" height="128" alt="">
          <span><strong>${esc(tradeName)}</strong><small>Service & shop pentru mobilitate electrică</small></span>
        </a>
        <p>Cumpărături clare, piese alese atent și asistență reală înainte și după comandă.</p>
        <dl class="gt-site-footer__identity gt-site-footer__identity--desktop">
          <div><dt>Operator</dt><dd>${esc(company.legal_name || 'Necompletat')}</dd></div>
          <div><dt>CUI</dt><dd>${esc(company.cui || 'Necompletat')}</dd></div>
          <div><dt>Sediu social</dt><dd>${esc(address || 'Necompletat')}</dd></div>
        </dl>
      </section>
      <div class="gt-site-footer__nav-grid">
        <nav aria-label="Pagini principale G-Trots"><b>Pagini principale</b><div><a href="/magazin">Magazin piese trotinete electrice</a><a href="/service-trotinete-electrice">Service trotinete electrice</a><a href="/despre-g-trots">Despre G-Trots</a><a href="/contact">Contact și date firmă</a><a href="/ghiduri-service-trotinete-electrice">Ghiduri service trotinete electrice</a></div></nav>
        <nav aria-label="Comenzi, livrare și retururi"><b>Comenzi și retururi</b><div><a href="/urmarire-comanda">Urmărește comanda</a><a href="/livrare-si-plata">Livrare și plată</a><a href="/plata-si-facturare">Plată și facturare</a><a href="/politica-de-retur">Politica de retur</a><a class="gt-withdrawal-link" href="/solicita-retur">Solicită un retur</a><a class="gt-mobile-wide-link gt-mobile-wide-link--cross-nav" href="/garantii-si-reclamatii">Garanții și reclamații</a></div></nav>
        <nav aria-label="Legal și confidențialitate"><b>Legal și confidențialitate</b><div><a href="/termeni-si-conditii">Termeni și condiții</a><a href="/politica-de-confidentialitate">Confidențialitate</a><a href="/politica-cookies">Politica de cookie-uri</a><button type="button" data-cookie-preferences>Preferințe cookie</button><a href="/siguranta-produselor">Siguranța produselor</a><a href="/conditii-b2b">Condiții B2B</a><a class="gt-mobile-wide-link gt-mobile-wide-link--inner-grid" href="/accesibilitate">Accesibilitate</a></div></nav>
      </div>
      <dl class="gt-site-footer__identity gt-site-footer__identity--mobile" aria-label="Datele firmei G-Trots">
        <div><dt>Operator</dt><dd>${esc(company.legal_name || 'Necompletat')}</dd></div>
        <div><dt>CUI</dt><dd>${esc(company.cui || 'Necompletat')}</dd></div>
        <div><dt>Sediu social</dt><dd>${esc(address || 'Necompletat')}</dd></div>
      </dl>
      <div class="gt-site-footer__contact-row">
        <div class="gt-site-footer__contact">${company.phone ? `<a href="${phoneHref(company.phone)}">${esc(company.phone)}</a>` : ''}${company.email ? `<a href="mailto:${esc(company.email)}">${esc(company.email)}</a>` : ''}</div>
        ${socialLinks()}
      </div>
      <section class="gt-site-footer__assurance" aria-label="Plăți și protecția consumatorilor">
        <div class="gt-site-footer__payments"><span><b>Plăți securizate</b><small>Procesate prin Stripe</small></span><div>${paymentMarks()}</div></div>
        <a class="gt-sal-link" href="https://reclamatiisal.anpc.ro" target="_blank" rel="noopener noreferrer"><img src="/assets/anpc-sal.png" width="201" height="50" loading="lazy" decoding="async" alt="ANPC - Soluționarea Alternativă a Litigiilor"></a>
      </section>
      <div class="gt-site-footer__bottom">
        <a class="cab-it-credit" href="https://cab-it.ro/" target="_blank" rel="noopener noreferrer"><span>Designed by</span><img src="https://cab-it.ro/assets/img/brand/cab-it-header-symbol-clean.webp" width="44" height="44" loading="lazy" decoding="async" alt="Sigla CAB-IT Expert"><strong>cab-it.ro</strong></a>
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
    renderCompanyProfiles(company);
  }

  ensureOriginalHeader();
  ensureShopNavigation();
  ensureStaticStoreShortcut();
  loadConfig()
    .then(data => render({ ...companyFallback, ...(data?.company || {}) }))
    .catch(() => render(companyFallback));
})();
