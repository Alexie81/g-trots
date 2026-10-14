(() => {
  if (window.__gtProductCatalogSearch) return;
  window.__gtProductCatalogSearch = true;

  const breadcrumb = document.querySelector('.product-detail-breadcrumb');
  if (!document.body.classList.contains('product-page') || !breadcrumb) return;

  const normalize = value => String(value ?? '')
    .toLocaleLowerCase('ro-RO')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const money = value => `${new Intl.NumberFormat('ro-RO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)} lei`;

  const safeImage = value => {
    try {
      const url = new URL(String(value || ''), location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  };

  const component = document.createElement('section');
  component.className = 'product-catalog-search shell';
  component.setAttribute('aria-label', 'Caută alt produs în magazin');
  component.innerHTML = `
    <form class="product-catalog-search__form" role="search" action="/magazin" method="get">
      <button class="product-catalog-search__icon" type="button" aria-label="Activează căutarea"><span aria-hidden="true"></span></button>
      <label class="product-catalog-search__copy" for="product-catalog-search-input">
        <small>Caută în magazin</small>
        <input id="product-catalog-search-input" name="q" type="search" autocomplete="off" spellcheck="false" placeholder="Denumire, cod sau model..." aria-label="Caută alt produs" aria-controls="product-catalog-search-results" aria-expanded="false">
      </label>
      <button class="product-catalog-search__clear" type="button" aria-label="Șterge căutarea" hidden><span aria-hidden="true">×</span></button>
      <span class="product-catalog-search__hint"><i aria-hidden="true"></i><b data-product-search-count>Catalog G-Trots</b><small>piese și accesorii</small></span>
      <button class="product-catalog-search__submit" type="submit" aria-label="Vezi rezultatele în magazin"><span aria-hidden="true">›</span></button>
    </form>
    <div class="product-catalog-search__results" id="product-catalog-search-results" hidden>
      <div class="product-catalog-search__results-head"><span><i aria-hidden="true"></i><strong data-product-search-title>Căutare inteligentă</strong><small data-product-search-subtitle>Găsește piesa potrivită după denumire, model sau marcă</small></span><button type="button" data-product-search-close aria-label="Închide rezultatele"><span aria-hidden="true">×</span></button></div>
      <div class="product-catalog-search__results-body" data-product-search-results></div>
      <button class="product-catalog-search__all" type="button" data-product-search-all>Vezi toate rezultatele în catalog <span aria-hidden="true">→</span></button>
      <footer class="product-catalog-search__mobile-footer"><button type="button" data-product-search-back><span aria-hidden="true">←</span><b>Înapoi la magazin</b></button></footer>
    </div>`;
  breadcrumb.insertAdjacentElement('beforebegin', component);

  const form = component.querySelector('form');
  const input = component.querySelector('input');
  const iconButton = component.querySelector('.product-catalog-search__icon');
  const clearButton = component.querySelector('.product-catalog-search__clear');
  const panel = component.querySelector('.product-catalog-search__results');
  const resultBody = component.querySelector('[data-product-search-results]');
  const resultTitle = component.querySelector('[data-product-search-title]');
  const resultSubtitle = component.querySelector('[data-product-search-subtitle]');
  const resultCount = component.querySelector('[data-product-search-count]');
  const closeButton = component.querySelector('[data-product-search-close]');
  const allButton = component.querySelector('[data-product-search-all]');
  const backButton = component.querySelector('[data-product-search-back]');
  let products = [];
  let fallbackRequested = false;
  let activeIndex = -1;
  const mobileSearchMedia = window.matchMedia('(max-width: 700px)');
  const popularSearches = [
    ['Cauciucuri și anvelope', 'Cauciucuri și anvelope'],
    ['Camere pentru roți', 'Camere pentru roți'],
    ['Controlere', 'Controlere'],
    ['Display-uri', 'Display-uri'],
    ['Sisteme de frânare', 'Sisteme de frânare'],
    ['Discuri de frână', 'Discuri de frână'],
    ['Cabluri de frână', 'Cabluri de frână'],
    ['Sonerii', 'Sonerii'],
    ['Căști de protecție', 'Căști de protecție'],
    ['Încărcătoare', 'Încărcătoare'],
  ];

  const normalizedProduct = product => {
    const raw = product?.raw || product || {};
    const slug = String(product?.slug || product?.id || raw.slug || raw.id || '');
    const image = safeImage(product?.imageUrl || raw.images?.[0]?.url || '');
    const priceValue = Number(product?.priceValue ?? raw.promotion_price ?? raw.sale_price ?? raw.price ?? 0);
    const brands = Array.isArray(raw.brands) ? raw.brands.map(brand => brand?.name || '').filter(Boolean) : [];
    const sku = String(raw.sku || '');
    const ean = String(raw.ean || '');
    const name = String(product?.name || raw.name || 'Produs G-Trots');
    const category = String(product?.category || raw.category_name || 'Produs G-Trots');
    const stock = String(product?.stock || (Number(raw.stock_quantity || 0) > 0 || raw.stock_mode === 'unlimited' ? 'În stoc' : 'Stoc epuizat'));
    const route = String(product?.url || `/magazin/produs/${encodeURIComponent(slug)}/`);
    return {
      slug, sku, ean, name, category, stock, image, priceValue, route,
      normalizedName: normalize(name),
      normalizedIdentifiers: [sku, ean, raw.id, slug].map(normalize).filter(Boolean),
      search: normalize([name, sku, ean, category, raw.manufacturer_name, brands.join(' '), raw.short_description].join(' ')),
    };
  };

  const setProducts = rows => {
    if (!Array.isArray(rows) || !rows.length) return;
    const unique = new Map();
    rows.map(normalizedProduct).forEach(product => {
      if (product.slug) unique.set(product.slug, product);
    });
    if (!unique.size) return;
    products = [...unique.values()];
    resultCount.textContent = `${products.length} ${products.length === 1 ? 'produs' : 'produse'}`;
    if (document.activeElement === input) renderResults();
  };

  const decodeCompactPayload = payload => {
    if (Array.isArray(payload)) return payload;
    if (payload?.v !== 1 || !Array.isArray(payload.p)) return [];
    return payload.p.map(row => ({
      id: row[0], slug: row[1], sku: row[2], ean: row[3], name: row[4], short_description: row[5],
      category_name: row[7], manufacturer_name: row[10],
      brands: Array.isArray(row[12]) ? row[12].map(brand => ({ name: brand[1] })) : [],
      images: row[13] ? [{ url: row[13] }] : [], price: row[14], sale_price: row[15],
      stock_mode: row[19], stock_quantity: row[20], promotion_price: row[24],
    }));
  };

  async function loadFallbackCatalog() {
    if (fallbackRequested || products.length) return;
    fallbackRequested = true;
    try {
      const firstResponse = await fetch('/shop-api/api-v2.php?action=publicProductsPage&page=1&page_size=400', { headers: { Accept: 'application/json' } });
      if (!firstResponse.ok) throw new Error('catalog');
      const firstPayload = await firstResponse.json();
      const firstRows = decodeCompactPayload(firstPayload);
      setProducts(firstRows);
      const total = Math.max(firstRows.length, Number(firstPayload?.total || 0));
      const pages = Math.max(1, Math.ceil(total / 400));
      if (pages <= 1) return;
      const payloads = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => fetch(`/shop-api/api-v2.php?action=publicProductsPage&page=${index + 2}&page_size=400`, { headers: { Accept: 'application/json' } }).then(response => response.ok ? response.json() : null)));
      setProducts([firstPayload, ...payloads].flatMap(decodeCompactPayload));
    } catch {
      resultCount.textContent = 'Catalog G-Trots';
    }
  }

  const matchedProducts = queryValue => {
    const query = normalize(queryValue);
    if (!query) return [];
    const exactIdentifiers = products.filter(product => product.normalizedIdentifiers.includes(query));
    if (exactIdentifiers.length) return exactIdentifiers;
    const exactNames = products.filter(product => product.normalizedName === query);
    if (exactNames.length) return exactNames;
    const tokens = query.split(' ').filter(Boolean);
    return products
      .map(product => {
        const allTokens = tokens.every(token => product.search.includes(token));
        if (!allTokens) return null;
        let score = 0;
        if (product.normalizedName.startsWith(query)) score += 80;
        else if (product.normalizedName.includes(query)) score += 60;
        else if (product.search.includes(query)) score += 38;
        tokens.forEach(token => {
          if (product.normalizedName.includes(token)) score += 14;
          if (product.normalizedIdentifiers.some(identifier => identifier.includes(token))) score += 20;
        });
        if (!normalize(product.stock).includes('epuizat')) score += 4;
        return { product, score };
      })
      .filter(Boolean)
      .sort((first, second) => second.score - first.score)
      .map(result => result.product);
  };

  const resultLink = product => {
    const link = document.createElement('a');
    link.className = 'product-catalog-search__result';
    link.href = product.route;
    if (product.image) {
      const image = document.createElement('span');
      image.className = 'product-catalog-search__result-image';
      image.style.backgroundImage = `url("${product.image.replace(/["\\]/g, '\\$&')}")`;
      image.setAttribute('aria-hidden', 'true');
      link.append(image);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'product-catalog-search__result-image is-placeholder';
      placeholder.textContent = 'GT';
      link.append(placeholder);
    }
    const copy = document.createElement('span');
    copy.className = 'product-catalog-search__result-copy';
    const category = document.createElement('small');
    category.textContent = product.category;
    const name = document.createElement('strong');
    name.textContent = product.name;
    const code = document.createElement('span');
    code.textContent = product.sku ? `Cod: ${product.sku}` : product.stock;
    copy.append(category, name, code);
    const meta = document.createElement('span');
    meta.className = 'product-catalog-search__result-meta';
    const stock = document.createElement('small');
    stock.textContent = product.stock;
    stock.classList.toggle('is-out', normalize(product.stock).includes('epuizat'));
    const price = document.createElement('strong');
    price.textContent = money(product.priceValue);
    meta.append(stock, price);
    link.append(copy, meta);
    return link;
  };

  const popularSearchList = () => {
    const section = document.createElement('section');
    section.className = 'product-catalog-search__popular-section';
    const heading = document.createElement('header');
    heading.innerHTML = '<span><strong>Căutări populare în G-Trots</strong><small>Alege rapid piesa de care ai nevoie</small></span><em>Sugestii</em>';
    const list = document.createElement('div');
    list.className = 'product-catalog-search__popular';
    popularSearches.forEach(([label, query], index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = `<i>${String(index + 1).padStart(2, '0')}</i><span><strong>${label}</strong><small>Caută în catalog</small></span><b aria-hidden="true">›</b>`;
      button.addEventListener('click', () => {
        input.value = query;
        renderResults();
        input.focus({ preventScroll: true });
      });
      list.append(button);
    });
    section.append(heading, list);
    return section;
  };

  function renderResults() {
    const query = input.value.trim();
    clearButton.hidden = !query;
    resultBody.replaceChildren();
    activeIndex = -1;
    if (!query) {
      resultTitle.textContent = 'Căutare inteligentă';
      resultSubtitle.textContent = 'Găsește piesa potrivită după denumire, model sau marcă';
      if (mobileSearchMedia.matches) {
        resultBody.append(popularSearchList());
      } else {
        const empty = document.createElement('p');
        empty.className = 'product-catalog-search__empty';
        empty.innerHTML = '<span aria-hidden="true">⌕</span><b>Găsești rapid produsul potrivit.</b><small>Introdu cel puțin două caractere.</small>';
        resultBody.append(empty);
      }
      allButton.hidden = true;
      return;
    }
    const matches = matchedProducts(query);
    resultTitle.textContent = 'Căutare inteligentă';
    resultSubtitle.textContent = matches.length ? `${matches.length} ${matches.length === 1 ? 'produs găsit' : 'produse găsite'}` : 'Căutăm în catalog';
    if (!products.length) {
      const loading = document.createElement('p');
      loading.className = 'product-catalog-search__empty is-loading';
      loading.innerHTML = '<span aria-hidden="true"></span><b>Încărcăm catalogul...</b><small>Rezultatele apar imediat.</small>';
      resultBody.append(loading);
      void loadFallbackCatalog();
    } else if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'product-catalog-search__empty';
      empty.innerHTML = '<span aria-hidden="true">?</span><b>Nicio potrivire rapidă.</b><small>Deschide catalogul pentru căutarea completă.</small>';
      resultBody.append(empty);
    } else {
      matches.slice(0, 6).forEach(product => resultBody.append(resultLink(product)));
    }
    allButton.hidden = false;
  }

  function openPanel() {
    component.classList.add('is-open');
    if (mobileSearchMedia.matches) {
      document.body.classList.add('product-catalog-search-open');
      iconButton.setAttribute('aria-label', 'Închide căutarea');
    }
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    renderResults();
    if (!products.length) void loadFallbackCatalog();
  }

  function closePanel() {
    component.classList.remove('is-open');
    document.body.classList.remove('product-catalog-search-open');
    iconButton.setAttribute('aria-label', 'Activează căutarea');
    input.setAttribute('aria-expanded', 'false');
    window.setTimeout(() => {
      if (!component.classList.contains('is-open')) panel.hidden = true;
    }, 190);
    activeIndex = -1;
  }

  function goToCatalog() {
    const query = input.value.trim();
    const url = new URL('/magazin', location.origin);
    if (query) url.searchParams.set('q', query);
    url.hash = 'catalog';
    location.assign(`${url.pathname}${url.search}${url.hash}`);
  }

  function moveActive(direction) {
    const links = [...resultBody.querySelectorAll('a')];
    if (!links.length) return;
    activeIndex = (activeIndex + direction + links.length) % links.length;
    links.forEach((link, index) => link.classList.toggle('is-active', index === activeIndex));
    links[activeIndex].scrollIntoView({ block: 'nearest' });
  }

  document.addEventListener('g-trots:live-products', event => setProducts(event.detail));
  form.addEventListener('submit', event => {
    event.preventDefault();
    goToCatalog();
  });
  form.addEventListener('click', event => {
    if (event.target.closest('button, a, input')) return;
    input.focus({ preventScroll: true });
  });
  input.addEventListener('focus', openPanel);
  input.addEventListener('input', renderResults);
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      resultBody.querySelectorAll('a')[activeIndex]?.click();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      input.blur();
      closePanel();
    }
  });
  iconButton.addEventListener('click', () => {
    if (mobileSearchMedia.matches && component.classList.contains('is-open')) {
      input.blur();
      closePanel();
      return;
    }
    input.focus({ preventScroll: true });
  });
  clearButton.addEventListener('click', event => {
    event.preventDefault();
    input.value = '';
    input.focus({ preventScroll: true });
    renderResults();
  });
  closeButton.addEventListener('click', () => {
    input.blur();
    closePanel();
  });
  backButton.addEventListener('click', () => {
    location.assign('/magazin');
  });
  allButton.addEventListener('click', goToCatalog);
  document.addEventListener('pointerdown', event => {
    if (!component.contains(event.target)) closePanel();
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      input.focus({ preventScroll: true });
    }
  });
  mobileSearchMedia.addEventListener?.('change', event => {
    if (!event.matches) document.body.classList.remove('product-catalog-search-open');
  });
})();
