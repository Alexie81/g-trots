(() => {
  const carousel = document.querySelector('[data-product-carousel]');
  if (!carousel) return;

  const cards = [...carousel.querySelectorAll('.about-product')];
  const previous = document.querySelector('[data-carousel-prev]');
  const next = document.querySelector('[data-carousel-next]');
  const current = document.querySelector('[data-carousel-current]');
  const status = document.querySelector('[data-catalog-status]');

  const formatMoney = value => `${new Intl.NumberFormat('ro-RO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)} lei`;

  const activeCardIndex = () => {
    const left = carousel.scrollLeft;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    cards.forEach((card, index) => {
      const distance = Math.abs(card.offsetLeft - carousel.offsetLeft - left);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    return nearestIndex;
  };

  const syncControls = () => {
    const index = activeCardIndex();
    if (current) current.textContent = String(index + 1).padStart(2, '0');
    if (previous) previous.disabled = carousel.scrollLeft <= 4;
    if (next) next.disabled = carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 4;
  };

  const move = direction => {
    const index = activeCardIndex();
    const target = Math.max(0, Math.min(cards.length - 1, index + direction));
    cards[target]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  };

  previous?.addEventListener('click', () => move(-1));
  next?.addEventListener('click', () => move(1));
  carousel.addEventListener('scroll', () => requestAnimationFrame(syncControls), { passive: true });
  carousel.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
  });
  window.addEventListener('resize', syncControls, { passive: true });
  syncControls();

  const decodeProducts = payload => {
    if (!payload || payload.v !== 1 || !Array.isArray(payload.p)) return [];
    return payload.p.map(row => ({
      slug: row[1],
      sku: row[2],
      name: row[4],
      category: row[7],
      image: row[13],
      price: row[24] ?? row[15] ?? row[14],
      stockMode: row[19],
      stock: Number(row[20] || 0),
      lowStock: Number(row[21] || 3),
    }));
  };

  const updateCard = (card, product) => {
    const href = `/magazin/produs/${encodeURIComponent(product.slug)}/`;
    card.querySelectorAll('a').forEach(link => { link.href = href; });
    card.querySelector('[data-product-category]').textContent = product.category || 'Piesă trotinetă electrică';
    card.querySelector('[data-product-name]').textContent = product.name;
    card.querySelector('[data-product-price]').textContent = formatMoney(product.price);
    const image = card.querySelector('img');
    if (product.image) image.src = product.image;
    const stock = card.querySelector('[data-product-stock]');
    stock.classList.remove('is-out');
    if (product.stockMode === 'unlimited') stock.textContent = 'În stoc';
    else if (product.stock <= 0) { stock.textContent = 'Stoc epuizat'; stock.classList.add('is-out'); }
    else if (product.stock <= product.lowStock) stock.textContent = 'Stoc limitat';
    else stock.textContent = 'În stoc';
  };

  fetch('https://g-trots.ro/shop-api/api-v2.php?action=publicProductsPage&page=1&page_size=400', {
    headers: { Accept: 'application/json' },
    cache: 'default',
  })
    .then(response => {
      if (!response.ok) throw new Error('Catalog indisponibil');
      return response.json();
    })
    .then(payload => {
      const products = new Map(decodeProducts(payload).map(product => [String(product.sku), product]));
      let updated = 0;
      cards.forEach(card => {
        const product = products.get(card.dataset.sku || '');
        if (!product) return;
        updateCard(card, product);
        updated += 1;
      });
      if (status) status.textContent = updated === cards.length
        ? 'Prețurile și disponibilitatea au fost verificate din catalogul G-Trots.'
        : 'Produsele sunt afișate din selecția G-Trots; verifică pagina produsului pentru informația curentă.';
    })
    .catch(() => {
      if (status) status.textContent = 'Verifică pagina fiecărui produs pentru prețul și disponibilitatea curentă.';
    });

  const revealTargets = document.querySelectorAll('.about-heading, .about-service-card, .about-service-process__visual, .about-service-process__copy, .about-values__grid article, .about-faq__list details');
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  revealTargets.forEach(target => target.classList.add('about-reveal'));
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -7% 0px', threshold: 0.08 });
  revealTargets.forEach(target => observer.observe(target));
})();
