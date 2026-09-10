(() => {
  const viewport = document.querySelector('[data-service-products-viewport]');
  const track = document.querySelector('[data-service-products-track]');
  if (!viewport || !track) return;

  const money = new Intl.NumberFormat('ro-RO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let firstSetWidth = 0;
  let animationFrame = 0;
  let previousFrame = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartScroll = 0;
  let dragDistance = 0;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
    );
  }

  function safeUrl(value, fallback = '/assets/logo.png') {
    try {
      const url = new URL(String(value || fallback), window.location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
    } catch {
      return fallback;
    }
  }

  function isAvailable(product) {
    const raw = product?.raw || {};
    if (raw.is_purchasable === false) return false;
    if (raw.stock_mode === 'unlimited') return true;
    if (raw.stock_mode) return Number(raw.stock_quantity || 0) > 0;
    return !/epuizat|indisponibil/i.test(String(product?.stock || ''));
  }

  function cardMarkup(product, duplicate = false) {
    const raw = product.raw || {};
    const featured = Boolean(raw.is_featured);
    const price = Number(product.priceValue ?? raw.promotion_price ?? raw.sale_price ?? raw.price ?? 0);
    const brand = String(raw.brands?.[0]?.name || raw.manufacturer_name || product.category || 'G-Trots');
    const stock = String(product.stock || 'În stoc');
    const image = safeUrl(product.imageUrl);
    const url = safeUrl(product.url || `/magazin/produs/${encodeURIComponent(product.id)}/`);
    return `
      <article class="service-product-card" data-product-id="${escapeHtml(product.id)}"${duplicate ? ' aria-hidden="true"' : ''}>
        <div class="service-product-card__visual">
          <img src="${escapeHtml(image)}" alt="${duplicate ? '' : escapeHtml(product.name)}" loading="lazy" decoding="async" draggable="false">
          <span class="service-product-card__stock"><i></i>${escapeHtml(stock)}</span>
          ${featured ? '<span class="service-product-card__featured">Recomandat</span>' : ''}
        </div>
        <div class="service-product-card__body">
          <small>${escapeHtml(brand)}</small>
          <h3>${escapeHtml(product.name)}</h3>
          <div><strong>${money.format(price)} <span>lei</span></strong><b aria-hidden="true">→</b></div>
        </div>
        <a class="product-card-link" href="${escapeHtml(url)}" aria-label="Vezi ${escapeHtml(product.name)}"${duplicate ? ' tabindex="-1"' : ''}></a>
      </article>`;
  }

  function normalizeLoopPosition() {
    if (!firstSetWidth) return;
    if (viewport.scrollLeft <= 0) viewport.scrollLeft += firstSetWidth;
    else if (viewport.scrollLeft >= firstSetWidth * 2) viewport.scrollLeft -= firstSetWidth;
  }

  function animate(timestamp) {
    const elapsed = previousFrame ? Math.min(48, timestamp - previousFrame) : 0;
    previousFrame = timestamp;
    if (!dragging && !prefersReducedMotion && firstSetWidth) {
      viewport.scrollLeft -= elapsed * 0.026;
      normalizeLoopPosition();
    }
    animationFrame = window.requestAnimationFrame(animate);
  }

  function startAnimation() {
    if (animationFrame || prefersReducedMotion) return;
    previousFrame = 0;
    animationFrame = window.requestAnimationFrame(animate);
  }

  function render(products) {
    const seen = new Set();
    const available = (Array.isArray(products) ? products : [])
      .filter((product) => product?.id && isAvailable(product))
      .filter((product) => {
        const key = String(product.apiId || product.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((first, second) => {
        const featureDifference = Number(Boolean(second.raw?.is_featured)) - Number(Boolean(first.raw?.is_featured));
        if (featureDifference) return featureDifference;
        const firstRank = Number(first.raw?.featured_rank ?? Number.MAX_SAFE_INTEGER);
        const secondRank = Number(second.raw?.featured_rank ?? Number.MAX_SAFE_INTEGER);
        return firstRank - secondRank;
      })
      .slice(0, 14);

    if (!available.length) {
      track.innerHTML = '<p class="service-products-empty">Produsele disponibile pot fi consultate direct în magazin.</p>';
      return;
    }

    const original = available.map((product) => cardMarkup(product)).join('');
    const duplicate = available.map((product) => cardMarkup(product, true)).join('');
    track.innerHTML = `
      <div class="service-products-set" data-service-products-set>${original}</div>
      <div class="service-products-set" aria-hidden="true">${duplicate}</div>
      <div class="service-products-set" aria-hidden="true">${duplicate}</div>`;

    window.requestAnimationFrame(() => {
      firstSetWidth = track.querySelector('[data-service-products-set]')?.offsetWidth || 0;
      viewport.scrollLeft = firstSetWidth;
      startAnimation();
    });
  }

  function productsFromRegistry() {
    return Object.values(window.GTrotsFavorites?.products || {});
  }

  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = true;
    dragStartX = event.clientX;
    dragStartScroll = viewport.scrollLeft;
    dragDistance = 0;
    viewport.classList.add('is-dragging');
    viewport.setPointerCapture(event.pointerId);
  });

  viewport.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const difference = event.clientX - dragStartX;
    dragDistance = Math.max(dragDistance, Math.abs(difference));
    viewport.scrollLeft = dragStartScroll - difference;
    normalizeLoopPosition();
  });

  const stopDragging = (event) => {
    if (!dragging) return;
    dragging = false;
    viewport.classList.remove('is-dragging');
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  };
  viewport.addEventListener('pointerup', stopDragging);
  viewport.addEventListener('pointercancel', stopDragging);
  viewport.addEventListener('click', (event) => {
    if (dragDistance <= 8) return;
    event.preventDefault();
    event.stopPropagation();
    dragDistance = 0;
  }, true);

  document.addEventListener('g-trots:live-products', (event) => render(event.detail));
  window.addEventListener('resize', () => {
    const set = track.querySelector('[data-service-products-set]');
    if (!set) return;
    const oldWidth = firstSetWidth;
    firstSetWidth = set.offsetWidth || 0;
    if (oldWidth && firstSetWidth) viewport.scrollLeft = firstSetWidth + (viewport.scrollLeft % oldWidth);
  }, { passive: true });

  const registered = productsFromRegistry();
  if (registered.length) render(registered);
})();
