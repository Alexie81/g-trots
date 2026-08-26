(function () {
  const state = {
    products: [], orders: [], inventory: [], sources: [], categories: [], brands: [], manufacturers: [], shipping: [],
    editingProduct: null, editingOrder: null, editingStock: null, editingSource: null, editingShipping: null,
    productImages: [], productSpecifications: [], productQuestions: [], productDetail: null, slugTouched: false, productQuery: '', richRange: null, richImage: null, richDragging: null, richResize: null,
    pages: { products: 1, orders: 1, inventory: 1 },
    pageSizes: { products: 10, orders: 10, inventory: 10 },
  };
  const PAGE_SIZE_OPTIONS = [10, 25, 50];
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  const money = value => `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} lei`;
  const slugify = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 200);
  const toast = (message, type = 'success') => window.BUSINESS_UI?.showToast?.(message, type);
  const statusLabels = { new: 'În procesare', confirmed: 'Confirmată', processing: 'În pregătire', shipped: 'Predată curierului', completed: 'Livrată', cancelled: 'Comandă anulată' };
  const statusColors = { new: '#38bdf8', confirmed: '#34d399', processing: '#fb923c', shipped: '#a78bfa', completed: '#22c55e', cancelled: '#fb7185' };
  const statusDefinitions = [
    { value: 'new', description: 'Comanda a intrat în fluxul de lucru.' },
    { value: 'confirmed', description: 'Comanda și plata au fost confirmate.' },
    { value: 'processing', description: 'Produsele sunt pregătite pentru expediere.' },
    { value: 'shipped', description: 'Pachetul a fost predat curierului.' },
    { value: 'completed', description: 'Comanda a ajuns la destinație.' },
    { value: 'cancelled', description: 'Comanda nu mai este procesată.' },
  ];
  const statusIcon = status => ({
    new: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/></svg>',
    confirmed: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>',
    processing: '<svg viewBox="0 0 24 24"><path d="m4 8 8-4 8 4-8 4Z"/><path d="M4 8v8l8 4 8-4V8M12 12v8"/></svg>',
    shipped: '<svg viewBox="0 0 24 24"><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    completed: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/><circle cx="12" cy="12" r="10"/></svg>',
    cancelled: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>',
  }[status] || '');

  function mount() {
    $('tab-shop-products').innerHTML = commercePage('Produse', 'Catalog, preturi, descrieri, imagini si SEO.', 'shop-products-content', true);
    $('tab-shop-orders').innerHTML = commercePage('Comenzi', 'Comenzile primite direct din magazinul online.', 'shop-orders-content');
    $('tab-shop-inventory').innerHTML = commercePage('Stocuri', 'Cantitati, alerte si istoricul miscarilor.', 'shop-inventory-content');

    const anchor = $('tab-shop-invoices');
    anchor.insertAdjacentHTML('afterend', `
      <div class="tab-panel shop-tab-panel" id="tab-shop-sources">${commercePage('Surse produse', 'Gestioneaza provenienta produselor si sursa implicita.', 'shop-sources-content', true)}</div>
      <div class="tab-panel shop-tab-panel" id="tab-shop-payments">${commercePage('Metode de plata', 'Controleaza optiunile disponibile la finalizarea comenzii.', 'shop-payments-content')}</div>
      <div class="tab-panel shop-tab-panel" id="tab-shop-shipping">${commercePage('Livrari', 'Costuri, transport gratuit si termene estimate.', 'shop-shipping-content', true)}</div>
    `);
    document.querySelector('#tab-shop-dashboard .shop-area-grid')?.insertAdjacentHTML('beforeend', `
      ${dashboardCard('shop-sources', 'blue', 'SURSE', 'Surse produse', 'Magazinele si furnizorii produselor.')}
      ${dashboardCard('shop-payments', 'purple', 'CHECKOUT', 'Metode de plata', 'Card online si ramburs la curier.')}
      ${dashboardCard('shop-shipping', 'green', 'LOGISTICA', 'Livrari', 'Costuri si praguri de gratuitate.')}
    `);
    document.body.insertAdjacentHTML('beforeend', productModal() + productDetailModal() + orderModal() + stockModal() + sourceModal() + shippingModal());
    wire();
    if ($('tab-shop-dashboard')?.classList.contains('active')) void loadDashboard();
  }

  function commercePage(title, description, contentId, hasAdd = false) {
    const kind = contentId.replace('shop-', '').replace('-content', '');
    const symbols = { products: '◇', orders: '✓', inventory: '▦', sources: '◎', payments: '▣', shipping: '⇢' };
    return `<div class="shop-commerce-page"><header class="shop-commerce-head shop-commerce-hero" data-commerce-kind="${kind}"><span class="shop-commerce-hero-glow"></span><button type="button" class="shop-back-btn" data-shop-open="shop-dashboard">&larr; Panou SHOP</button><div class="shop-commerce-title"><span>G-TROTS SHOP CRM</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="shop-commerce-hero-symbol" aria-hidden="true">${symbols[kind] || '◇'}</div><div class="shop-commerce-head-actions"><button type="button" class="shop-commerce-refresh" data-commerce-refresh="${contentId}" title="Reincarca" aria-label="Reincarca datele"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0 2 5"/><path d="M20 4v7h-7"/></svg></button>${hasAdd ? `<button type="button" class="shop-commerce-add" data-commerce-add="${contentId}">+ Adauga</button>` : ''}</div></header><main id="${contentId}" class="shop-commerce-content"><div class="shop-commerce-loading">Se incarca...</div></main></div>`;
  }
  function dashboardCard(target, tone, kicker, title, description) {
    return `<button type="button" class="shop-area-card ${tone}" data-shop-open="${target}"><span class="shop-area-icon">${target === 'shop-sources' ? '◎' : target === 'shop-payments' ? '▣' : '⇢'}</span><span class="shop-area-copy"><small>${kicker}</small><strong>${title}</strong><em>${description}</em></span><span class="shop-area-arrow">&rarr;</span></button>`;
  }

  function productModal() {
    return `<div class="shop-commerce-overlay" id="shop-product-modal" hidden><form class="shop-commerce-modal product-editor" id="shop-product-form"><header><div><small>CRM PRODUSE</small><h2 id="shop-product-modal-title">Produs nou</h2></div><button type="button" data-commerce-close="shop-product-modal">×</button></header><div class="shop-commerce-modal-scroll">
      ${section('01', 'Sursa si identitate', 'Sursa implicita este selectata automat pentru un produs nou.')}
      <div class="shop-commerce-columns"><label>Sursa produsului<select id="shop-product-source"></select></label><label>SKU / cod<input id="shop-product-sku" maxlength="80" placeholder="Se generează automat la salvare" disabled aria-disabled="true" /><small class="shop-field-help">Se generează automat la salvare</small></label></div>
      <div class="shop-commerce-columns"><label>Nume produs *<input id="shop-product-name" maxlength="180" required /><small id="shop-product-name-error" class="shop-field-error" hidden>Acest nume de produs exista deja.</small></label><label>Slug *<span class="shop-input-prefix">g-trots.ro/magazin/produs/</span><input id="shop-product-slug" maxlength="200" required /></label></div>
      ${section('02', 'Galerie foto', 'Incarca pana la 12 poze. Tine click pe o fotografie si trage-o in pozitia dorita.')}
      <div class="shop-product-gallery" id="shop-product-gallery"></div><input id="shop-product-images-input" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden />
      ${section('03', 'Descriere', 'Poti lipi continut formatat; stilurile, bold si italic sunt pastrate.')}
      <label>Descriere scurta<textarea id="shop-product-short" rows="3" maxlength="2000"></textarea></label>
      <label>Titlu descriere lunga<input id="shop-product-description-title" maxlength="220" placeholder="Ex: Aderenta sigura pentru traseele tale zilnice." /></label>
      <div class="shop-rich-field"><span class="shop-rich-label">Descriere completa</span><div class="shop-rich-toolbar"><button type="button" data-rich-command="bold" title="Bold"><b>B</b></button><button type="button" data-rich-command="italic" title="Italic"><i>I</i></button><button type="button" data-rich-command="underline" title="Subliniat"><u>U</u></button><button type="button" data-rich-command="insertUnorderedList">• Lista</button><button type="button" data-rich-command="insertOrderedList">1. Lista</button><i class="shop-rich-separator"></i><button type="button" class="shop-rich-image-add" id="shop-rich-image-add">+ Imagine</button><button type="button" data-rich-image-action="move-up" title="Muta imaginea mai sus" disabled>↑</button><button type="button" data-rich-image-action="move-down" title="Muta imaginea mai jos" disabled>↓</button><button type="button" data-rich-image-action="resize" title="Schimba dimensiunea" disabled>Marime</button><span class="shop-rich-hint" id="shop-rich-hint">Poti lipi text si imagini direct in editor</span></div><input id="shop-rich-image-input" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden><div id="shop-product-description" class="shop-rich-editor" contenteditable="true" spellcheck="true"></div><div id="shop-rich-image-menu" class="shop-rich-image-menu" role="menu" aria-label="Optiuni imagine" hidden><button type="button" data-rich-context-action="copy" role="menuitem"><span class="shop-rich-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg></span><span><b>Copiaza imaginea</b><small>O pune in clipboard</small></span></button><button type="button" class="danger" data-rich-context-action="delete" role="menuitem"><span class="shop-rich-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M7 7l1 13h8l1-13"></path><path d="M10 11v5M14 11v5"></path></svg></span><span><b>Sterge imaginea</b><small>O elimina din descriere</small></span></button></div></div>
      ${section('04', 'Specificatii', 'Adauga grupele si caracteristicile proprii acestui produs.')}<div class="shop-subeditor-head"><strong>SPECIFICATII PRODUS</strong><button type="button" id="shop-product-add-specification">+ Adauga specificatie</button></div><div id="shop-product-specifications" class="shop-product-subeditor"></div>
      ${section('05', 'Intrebari si raspunsuri', 'Continutul este afisat numai pe pagina acestui produs.')}<div class="shop-subeditor-head"><strong>INTREBARI PRODUS</strong><button type="button" id="shop-product-add-question">+ Adauga intrebare</button></div><div id="shop-product-questions" class="shop-product-subeditor"></div>
      ${section('06', 'Pret si reducere', 'Configureaza pretul de vanzare si reducerea afisata pe site.')}
      <div class="shop-commerce-columns three"><label>Pret vanzare *<input id="shop-product-price" type="number" min="0" step="0.01" required /></label><label>Tip reducere<select id="shop-product-discount-type"><option value="percent">Procent (%)</option><option value="fixed">Suma fixa (lei)</option></select></label><label id="shop-product-discount-label">Reducere %<input id="shop-product-discount-value" type="number" min="0" step="0.01" /></label></div><div class="shop-nir-note"><b>Costul de achizitie nu se introduce manual.</b><span>Va fi calculat automat din NIR-uri si facturile de intrare, deoarece poate varia la fiecare receptie.</span></div><div class="shop-price-preview"><small>PRET PE SITE</small><strong id="shop-product-final-price">0,00 lei</strong></div>
      ${section('07', 'Catalog si compatibilitate', 'Leaga produsul de categorie, producator si brandurile compatibile.')}
      <div class="shop-commerce-columns"><label>Categorie<select id="shop-product-category"></select></label><label>Producator<select id="shop-product-manufacturer"></select></label></div><div class="shop-field-group"><span>Compatibilitati</span><div class="shop-multi-select" id="shop-product-brand-select"><button type="button" id="shop-product-brands-toggle" aria-expanded="false"><span id="shop-product-brands-summary">Alege marcile compatibile</span><b>⌄</b></button><div class="shop-brand-options" id="shop-product-brands" hidden></div></div></div>
      ${section('08', 'Stoc online', 'Alege intre cantitate urmarita si stoc nelimitat.')}
      <div class="shop-commerce-columns three"><label>Tip stoc<select id="shop-product-stock-mode"><option value="tracked">Stoc cu numar</option><option value="unlimited">Stoc nelimitat</option></select></label><label>Cantitate<input id="shop-product-stock" type="number" min="0" step="1" /></label><label>Alerta stoc mic sub<input id="shop-product-low-stock" type="number" min="0" step="1" value="3" /></label></div>
      ${section('09', 'SEO si Google', 'Controleaza titlul, descrierea si previzualizarea rezultatului.')}
      <div class="shop-commerce-columns"><label>Meta titlu<input id="shop-product-meta-title" maxlength="180" /></label><label>Meta descriere<textarea id="shop-product-meta-description" rows="3" maxlength="320"></textarea></label></div>
      <div class="shop-google-preview"><span id="shop-google-image" role="img" hidden></span><div><small>G-Trots · g-trots.ro</small><strong id="shop-google-title">Titlul produsului</strong><p id="shop-google-description">Descrierea produsului va aparea aici.</p><em id="shop-google-url">https://g-trots.ro/magazin/produs/slug-produs</em></div></div>
      <div class="shop-editor-toggles"><label><span><b>Produs activ</b><small>Este vizibil si poate fi comandat.</small></span><input id="shop-product-active" type="checkbox" checked /></label><label><span><b>Produs recomandat</b><small>Apare prioritar in magazin.</small></span><input id="shop-product-featured" type="checkbox" /></label></div>
    </div><footer><button type="button" class="btn-ghost" data-commerce-close="shop-product-modal">Renunta</button><button type="submit" class="btn-primary" id="shop-product-save">Salveaza produsul</button></footer></form></div>`;
  }

  function productDetailModal() {
    return `<div class="shop-commerce-overlay" id="shop-product-detail-modal" hidden><div class="shop-commerce-modal product-detail-modal"><header><div><small>FISA PRODUSULUI</small><h2 id="shop-product-detail-title">Produs</h2></div><button type="button" data-commerce-close="shop-product-detail-modal">×</button></header><div class="shop-commerce-modal-scroll" id="shop-product-detail-content"></div><footer><button type="button" class="btn-ghost" data-commerce-close="shop-product-detail-modal">Inchide</button><button type="button" class="btn-primary" id="shop-product-detail-edit">Editeaza produsul</button></footer></div></div>`;
  }

  function orderModal() {
    return `<div class="shop-commerce-overlay" id="shop-order-modal" hidden><form class="shop-commerce-modal compact" id="shop-order-form"><header><div><small>COMANDA SHOP</small><h2 id="shop-order-title">Comanda</h2></div><button type="button" data-commerce-close="shop-order-modal">×</button></header><div class="shop-commerce-modal-scroll" id="shop-order-details"></div><footer><button type="button" class="btn-ghost" data-commerce-close="shop-order-modal">Inchide</button><button type="submit" class="btn-primary" id="shop-order-save">Salveaza comanda</button></footer></form></div>`;
  }
  function stockModal() {
    return `<div class="shop-commerce-overlay" id="shop-stock-modal" hidden><form class="shop-commerce-modal compact" id="shop-stock-form"><header><div><small>AJUSTARE STOC</small><h2 id="shop-stock-title">Produs</h2></div><button type="button" data-commerce-close="shop-stock-modal">×</button></header><div class="shop-commerce-modal-scroll"><label>Cantitate noua<input id="shop-stock-quantity" type="number" min="0" step="1" required /></label><label>Motiv / notita<textarea id="shop-stock-note" rows="3" placeholder="Ex: Marfa receptionata"></textarea></label><div id="shop-stock-history" class="shop-stock-history"></div></div><footer><button type="button" class="btn-ghost" data-commerce-close="shop-stock-modal">Renunta</button><button type="submit" class="btn-primary" id="shop-stock-save">Actualizeaza stocul</button></footer></form></div>`;
  }
  function sourceModal() {
    return `<div class="shop-commerce-overlay" id="shop-source-modal" hidden><form class="shop-commerce-modal mini" id="shop-source-form"><header><div><small>SURSA PRODUS</small><h2 id="shop-source-title">Sursa noua</h2></div><button type="button" data-commerce-close="shop-source-modal">×</button></header><div class="shop-commerce-modal-scroll"><label>Nume *<input id="shop-source-name" required maxlength="120" /></label><label>Domeniu *<input id="shop-source-domain" required maxlength="120" placeholder="exemplu.ro" /></label><label>Adresa de baza<input id="shop-source-url" type="url" maxlength="500" placeholder="https://exemplu.ro" /></label><div class="shop-editor-toggles"><label><span><b>Vizibila pe website</b><small>Afiseaza toate produsele acestei surse.</small></span><input id="shop-source-active" type="checkbox" checked /></label><label><span><b>Sursa implicita</b><small>Este aleasa automat la produs nou.</small></span><input id="shop-source-default" type="checkbox" /></label></div></div><footer><button type="button" class="btn-ghost" data-commerce-close="shop-source-modal">Renunta</button><button type="submit" class="btn-primary" id="shop-source-save">Salveaza sursa</button></footer></form></div>`;
  }
  function shippingModal() {
    return `<div class="shop-commerce-overlay" id="shop-shipping-modal" hidden><form class="shop-commerce-modal mini" id="shop-shipping-form"><header><div><small>LIVRARE SHOP</small><h2 id="shop-shipping-title">Livrare noua</h2></div><button type="button" data-commerce-close="shop-shipping-modal">×</button></header><div class="shop-commerce-modal-scroll"><label>Nume *<input id="shop-shipping-name" required maxlength="120" /></label><label>Descriere<textarea id="shop-shipping-description" rows="3" maxlength="500"></textarea></label><div class="shop-commerce-columns"><label>Cost lei<input id="shop-shipping-cost" type="number" min="0" step="0.01" required /></label><label>Gratuit peste<input id="shop-shipping-free" type="number" min="0" step="0.01" placeholder="Optional" /></label></div><label>Termen estimat<input id="shop-shipping-eta" maxlength="120" placeholder="1-3 zile lucratoare" /></label><div class="shop-editor-toggles"><label><span><b>Livrare activa</b><small>Este disponibila pe site.</small></span><input id="shop-shipping-active" type="checkbox" checked /></label></div></div><footer><button type="button" class="btn-ghost" data-commerce-close="shop-shipping-modal">Renunta</button><button type="submit" class="btn-primary" id="shop-shipping-save">Salveaza livrarea</button></footer></form></div>`;
  }
  function section(number, title, text) { return `<div class="shop-editor-section"><b>${number}</b><span><strong>${title}</strong><small>${text}</small></span></div>`; }

  function wire() {
    const loaders = { 'shop-dashboard': loadDashboard, 'shop-products': loadProducts, 'shop-orders': loadOrders, 'shop-inventory': loadInventory, 'shop-sources': loadSourcesPage, 'shop-payments': loadPayments, 'shop-shipping': loadShippingPage };
    window.addEventListener('tab-change', event => {
      loaders[event.detail]?.();
    });
    window.addEventListener('auth-change', event => {
      if (!event.detail?.token) return;
      const activePanel = document.querySelector('.shop-tab-panel.active');
      const activeTab = activePanel?.id?.replace(/^tab-/, '');
      if (activeTab && loaders[activeTab]) void loaders[activeTab]();
    });
    document.querySelectorAll('[data-commerce-close]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.commerceClose)));
    document.querySelectorAll('.shop-commerce-overlay').forEach(overlay => overlay.addEventListener('mousedown', event => { if (event.target === overlay) closeModal(overlay.id); }));
    document.querySelectorAll('[data-commerce-refresh]').forEach(button => button.addEventListener('click', () => ({ 'shop-products-content': loadProducts, 'shop-orders-content': loadOrders, 'shop-inventory-content': loadInventory, 'shop-sources-content': loadSourcesPage, 'shop-shipping-content': loadShippingPage })[button.dataset.commerceRefresh]?.()));
    document.querySelectorAll('[data-commerce-add]').forEach(button => button.addEventListener('click', () => ({ 'shop-products-content': openProduct, 'shop-sources-content': openSource, 'shop-shipping-content': openShipping })[button.dataset.commerceAdd]?.()));
    $('shop-product-form').addEventListener('submit', saveProduct);
    $('shop-order-form').addEventListener('submit', saveOrder);
    $('shop-stock-form').addEventListener('submit', saveStock);
    $('shop-source-form').addEventListener('submit', saveSource);
    $('shop-shipping-form').addEventListener('submit', saveShipping);
    $('shop-product-images-input').addEventListener('change', addProductImages);
    $('shop-product-add-specification').addEventListener('click', () => { state.productSpecifications.push({ group: 'Caracteristici generale', label: '', value: '' }); renderProductSpecifications(); });
    $('shop-product-add-question').addEventListener('click', () => { state.productQuestions.push({ question: '', answer: '' }); renderProductQuestions(); });
    $('shop-product-detail-edit').addEventListener('click', () => { const product = state.productDetail?.product; if (!product) return; closeModal('shop-product-detail-modal'); setTimeout(() => openProduct(product.id), 190); });
    $('shop-product-name').addEventListener('input', () => { if (!state.slugTouched) $('shop-product-slug').value = slugify($('shop-product-name').value); validateProductName(); updateProductPreview(); });
    $('shop-product-slug').addEventListener('input', () => { state.slugTouched = true; $('shop-product-slug').value = slugify($('shop-product-slug').value); updateProductPreview(); });
    $('shop-product-brands-toggle').addEventListener('click', () => { const options = $('shop-product-brands'); const opening = options.hidden; options.hidden = !opening; $('shop-product-brands-toggle').setAttribute('aria-expanded', opening ? 'true' : 'false'); });
    document.addEventListener('click', event => { if (event.target.closest('#shop-product-brand-select')) return; $('shop-product-brands').hidden = true; $('shop-product-brands-toggle').setAttribute('aria-expanded', 'false'); });
    ['shop-product-price', 'shop-product-discount-value', 'shop-product-meta-title', 'shop-product-meta-description', 'shop-product-short'].forEach(id => $(id).addEventListener('input', updateProductPreview));
    $('shop-product-discount-type').addEventListener('change', updateProductPreview);
    $('shop-product-stock-mode').addEventListener('change', updateStockInputs);
    wireRichDescriptionEditor();
  }

  function wireRichDescriptionEditor() {
    const editor = $('shop-product-description');
    document.addEventListener('selectionchange', () => {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) state.richRange = range.cloneRange();
    });
    editor.addEventListener('dblclick', event => { event.preventDefault(); event.stopPropagation(); });
    editor.addEventListener('click', event => selectRichImage(event.target.closest?.('figure[data-rich-image]') || null));
    editor.addEventListener('contextmenu', event => {
      const figure = event.target.closest?.('figure[data-rich-image]');
      if (!figure) return closeRichImageMenu();
      event.preventDefault(); event.stopPropagation();
      selectRichImage(figure); openRichImageMenu(event.clientX, event.clientY);
    });
    editor.addEventListener('pointerdown', startRichImageResize);
    editor.addEventListener('dragstart', startRichImageDrag);
    editor.addEventListener('dragover', updateRichImageDrop, true);
    editor.addEventListener('drop', finishRichImageDrop, true);
    editor.addEventListener('dragend', finishRichImageDrag);
    editor.addEventListener('dragleave', event => { if (!editor.contains(event.relatedTarget)) clearRichDropMarkers(); });
    editor.addEventListener('beforeinput', event => { if (state.richDragging && event.inputType === 'insertFromDrop') event.preventDefault(); });
    editor.addEventListener('input', () => { normalizeRichImages(); saveRichSelection(); });
    editor.addEventListener('keyup', saveRichSelection);
    editor.addEventListener('mouseup', saveRichSelection);
    editor.addEventListener('paste', handleRichPaste);
    document.querySelectorAll('[data-rich-command], [data-rich-image-action]').forEach(button => button.addEventListener('mousedown', event => event.preventDefault()));
    document.querySelectorAll('[data-rich-command]').forEach(button => button.addEventListener('click', () => {
      restoreRichSelection(); editor.focus(); document.execCommand(button.dataset.richCommand, false, null); saveRichSelection();
    }));
    $('shop-rich-image-add').addEventListener('click', () => $('shop-rich-image-input').click());
    $('shop-rich-image-input').addEventListener('change', async event => {
      const files = Array.from(event.target.files || []).slice(0, 6);
      event.target.value = '';
      for (const file of files) await uploadRichImage(file);
    });
    document.querySelectorAll('[data-rich-image-action]').forEach(button => button.addEventListener('click', () => richImageAction(button.dataset.richImageAction)));
    $('shop-rich-image-menu').querySelectorAll('[data-rich-context-action]').forEach(button => button.addEventListener('click', () => richImageContextAction(button.dataset.richContextAction)));
    document.addEventListener('pointerdown', event => { if (!event.target.closest?.('#shop-rich-image-menu')) closeRichImageMenu(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeRichImageMenu(); });
    window.addEventListener('resize', closeRichImageMenu);
  }

  function saveRichSelection() {
    const editor = $('shop-product-description');
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) state.richRange = range.cloneRange();
  }

  function restoreRichSelection() {
    if (!state.richRange) return;
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(state.richRange);
  }

  function selectRichImage(figure) {
    state.richImage?.classList.remove('selected');
    state.richImage = figure || null;
    if (state.richImage) {
      ensureRichImageUi(state.richImage);
      state.richImage.classList.add('selected');
      updateRichImageWidthLabel(state.richImage);
    }
    document.querySelectorAll('[data-rich-image-action]').forEach(button => { button.disabled = !state.richImage; });
    $('shop-rich-hint').textContent = state.richImage ? 'Trage imaginea pentru mutare sau coltul portocaliu pentru redimensionare.' : 'Poti lipi text si imagini direct in editor';
  }

  function ensureRichImageUi(figure) {
    figure.contentEditable = 'false';
    figure.draggable = true;
    let handle = figure.querySelector(':scope > [data-rich-editor-ui="resize"]');
    if (!handle) {
      handle = document.createElement('span');
      handle.className = 'shop-rich-resize-handle';
      handle.dataset.richEditorUi = 'resize';
      handle.title = 'Trage pentru redimensionare';
      handle.setAttribute('aria-label', 'Redimensioneaza imaginea');
      handle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 16 16 8M11 16h5v-5"></path></svg>';
      figure.append(handle);
    }
    handle.draggable = false;
  }

  function updateRichImageWidthLabel(figure) {
    const width = Math.round(Number.parseFloat(figure.style.width || '100')) || 100;
    figure.dataset.richWidth = `${width}%`;
  }

  function normalizeRichImages() {
    const editor = $('shop-product-description');
    editor.querySelectorAll('img').forEach(image => {
      let figure = image.closest('figure[data-rich-image]');
      if (!figure) {
        figure = document.createElement('figure'); figure.dataset.richImage = ''; figure.style.cssText = 'width:100%;max-width:100%;margin:18px auto;';
        image.parentNode.insertBefore(figure, image); figure.append(image);
      }
      ensureRichImageUi(figure);
      updateRichImageWidthLabel(figure);
      image.draggable = false; image.loading = 'lazy';
      image.style.width = '100%'; image.style.maxWidth = '100%'; image.style.height = 'auto'; image.style.display = 'block'; image.style.objectFit = 'contain'; image.style.borderRadius = '14px';
    });
  }

  function richDescriptionHtml() {
    const clone = $('shop-product-description').cloneNode(true);
    clone.querySelectorAll('[data-rich-editor-ui]').forEach(node => node.remove());
    clone.querySelectorAll('.selected,.dragging,.resizing,.drop-before,.drop-after').forEach(node => node.classList.remove('selected', 'dragging', 'resizing', 'drop-before', 'drop-after'));
    clone.querySelectorAll('figure[data-rich-image]').forEach(node => { node.removeAttribute('draggable'); delete node.dataset.richWidth; });
    clone.querySelectorAll('[contenteditable]').forEach(node => node.removeAttribute('contenteditable'));
    return clone.innerHTML;
  }

  function insertRichImage(url) {
    if (!url) return;
    const editor = $('shop-product-description');
    const figure = document.createElement('figure'); figure.dataset.richImage = ''; figure.contentEditable = 'false'; figure.style.cssText = 'width:100%;max-width:100%;margin:18px auto;';
    figure.innerHTML = `<img src="${esc(url)}" alt="Imagine din descriere" loading="lazy" style="width:100%;max-width:100%;height:auto;display:block;object-fit:contain;border-radius:14px">`;
    restoreRichSelection();
    const range = state.richRange;
    const anchor = range?.startContainer?.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range?.startContainer;
    const block = anchor?.closest?.('p,div,h2,h3,h4,blockquote,li');
    if (block && block.parentElement === editor) block.insertAdjacentElement('afterend', figure);
    else if (range) range.insertNode(figure);
    else editor.append(figure);
    const paragraph = document.createElement('p'); paragraph.innerHTML = '<br>'; figure.insertAdjacentElement('afterend', paragraph);
    ensureRichImageUi(figure); updateRichImageWidthLabel(figure);
    selectRichImage(figure);
  }

  async function uploadRichImage(fileOrBase64) {
    const hint = $('shop-rich-hint');
    try {
      hint.textContent = 'Imaginea se incarca...';
      const base64 = typeof fileOrBase64 === 'string' ? fileOrBase64 : await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = reject; reader.readAsDataURL(fileOrBase64); });
      const uploaded = await window.SHOP_API.uploadRichDescriptionImage(base64);
      insertRichImage(uploaded.url);
      hint.textContent = 'Imagine adaugata. Apasa pe ea pentru optiuni.';
    } catch (error) { hint.textContent = 'Imaginea nu a putut fi incarcata.'; toast(error.message || hint.textContent, 'error'); }
  }

  function handleRichPaste(event) {
    const files = Array.from(event.clipboardData?.items || []).filter(item => item.type.startsWith('image/')).map(item => item.getAsFile()).filter(Boolean);
    if (!files.length) { setTimeout(normalizeRichImages, 0); return; }
    event.preventDefault();
    files.forEach(file => void uploadRichImage(file));
  }

  function richImageAction(action) {
    const editor = $('shop-product-description'); const figure = state.richImage;
    if (!figure) return;
    const container = figure.parentElement || editor;
    if (action === 'move-up') { const previous = figure.previousElementSibling; if (previous) container.insertBefore(figure, previous); }
    else if (action === 'move-down') { const next = figure.nextElementSibling; if (next) container.insertBefore(figure, next.nextSibling); }
    else if (action === 'resize') { const sizes = [100, 75, 50, 33]; const current = parseInt(figure.style.width || '100', 10); const index = sizes.indexOf(current); const next = sizes[(index < 0 ? 0 : index + 1) % sizes.length]; setRichImageWidth(figure, next); }
    markRichDescriptionChanged();
  }

  function setRichImageWidth(figure, width) {
    const safeWidth = Math.max(24, Math.min(100, Math.round(width)));
    figure.style.width = `${safeWidth}%`; figure.style.maxWidth = '100%'; figure.style.marginInline = 'auto';
    updateRichImageWidthLabel(figure);
    $('shop-rich-hint').textContent = `Imagine ${safeWidth}% din latimea descrierii.`;
  }

  function markRichDescriptionChanged() {
    normalizeRichImages();
    $('shop-product-description').dispatchEvent(new Event('input', { bubbles: true }));
  }

  function startRichImageResize(event) {
    const handle = event.target.closest?.('[data-rich-editor-ui="resize"]');
    if (!handle) return;
    const editor = $('shop-product-description'); const figure = handle.closest('figure[data-rich-image]');
    if (!figure) return;
    event.preventDefault(); event.stopPropagation(); closeRichImageMenu(); selectRichImage(figure);
    const editorWidth = Math.max(1, editor.getBoundingClientRect().width - 36);
    state.richResize = { figure, pointerId: event.pointerId, startX: event.clientX, startWidth: figure.getBoundingClientRect().width / editorWidth * 100, editorWidth };
    figure.draggable = false; figure.classList.add('resizing'); handle.setPointerCapture?.(event.pointerId);
    const onMove = moveEvent => {
      if (!state.richResize || moveEvent.pointerId !== state.richResize.pointerId) return;
      moveEvent.preventDefault();
      setRichImageWidth(figure, state.richResize.startWidth + ((moveEvent.clientX - state.richResize.startX) / state.richResize.editorWidth * 100));
    };
    const onEnd = endEvent => {
      if (!state.richResize || endEvent.pointerId !== state.richResize.pointerId) return;
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onEnd); window.removeEventListener('pointercancel', onEnd);
      figure.classList.remove('resizing'); figure.draggable = true; state.richResize = null; markRichDescriptionChanged();
    };
    window.addEventListener('pointermove', onMove, { passive: false }); window.addEventListener('pointerup', onEnd); window.addEventListener('pointercancel', onEnd);
  }

  function startRichImageDrag(event) {
    const figure = event.target.closest?.('figure[data-rich-image]');
    if (!figure || state.richResize || event.target.closest?.('[data-rich-editor-ui]')) return event.preventDefault();
    closeRichImageMenu(); selectRichImage(figure); state.richDragging = figure;
    event.stopPropagation(); event.dataTransfer?.clearData(); event.dataTransfer?.setData('application/x-g-trots-rich-image', 'move');
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    requestAnimationFrame(() => figure.classList.add('dragging'));
    $('shop-rich-hint').textContent = 'Muta imaginea in locul dorit si elibereaza.';
  }

  function directRichEditorBlock(target) {
    const editor = $('shop-product-description'); let block = target?.nodeType === Node.TEXT_NODE ? target.parentElement : target;
    if (!block || block === editor || !editor.contains(block)) return null;
    while (block.parentElement && block.parentElement !== editor) block = block.parentElement;
    return block.parentElement === editor ? block : null;
  }

  function clearRichDropMarkers() {
    $('shop-product-description').querySelectorAll('.drop-before,.drop-after').forEach(node => node.classList.remove('drop-before', 'drop-after'));
  }

  function updateRichImageDrop(event) {
    if (!state.richDragging) return;
    event.preventDefault(); event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    clearRichDropMarkers();
    const target = directRichEditorBlock(event.target);
    if (!target || target === state.richDragging) return;
    const after = event.clientY > target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
    target.classList.add(after ? 'drop-after' : 'drop-before');
  }

  function finishRichImageDrop(event) {
    const editor = $('shop-product-description'); const figure = state.richDragging;
    if (!figure) return;
    event.preventDefault(); event.stopPropagation();
    const target = directRichEditorBlock(event.target); const oldParent = figure.parentElement;
    if (target && target !== figure) {
      const after = event.clientY > target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
      editor.insertBefore(figure, after ? target.nextSibling : target);
    } else if (!target) editor.append(figure);
    if (oldParent && oldParent !== editor && !oldParent.textContent.trim() && !oldParent.querySelector('img')) oldParent.remove();
    finishRichImageDrag(); markRichDescriptionChanged(); selectRichImage(figure);
  }

  function finishRichImageDrag() {
    state.richDragging?.classList.remove('dragging'); state.richDragging = null; clearRichDropMarkers();
    if (state.richImage) $('shop-rich-hint').textContent = 'Imagine mutata. Trage din nou pentru a-i schimba pozitia.';
  }

  function openRichImageMenu(clientX, clientY) {
    const menu = $('shop-rich-image-menu'); menu.hidden = false;
    const margin = 12; const width = menu.offsetWidth || 250; const height = menu.offsetHeight || 126;
    menu.style.left = `${Math.max(margin, Math.min(clientX, window.innerWidth - width - margin))}px`;
    menu.style.top = `${Math.max(margin, Math.min(clientY, window.innerHeight - height - margin))}px`;
    requestAnimationFrame(() => menu.classList.add('visible'));
  }

  function closeRichImageMenu() {
    const menu = $('shop-rich-image-menu'); if (!menu) return;
    menu.classList.remove('visible'); menu.hidden = true;
  }

  async function copyRichImage(figure) {
    const image = figure?.querySelector('img'); const source = image?.currentSrc || image?.src || '';
    if (!source) throw new Error('Imaginea nu poate fi copiata.');
    try {
      const { clipboard, nativeImage, net } = require('electron');
      let clipboardImage;
      if (source.startsWith('data:')) clipboardImage = nativeImage.createFromDataURL(source);
      else {
        const response = await net.fetch(source); if (!response.ok) throw new Error('Imagine indisponibila');
        clipboardImage = nativeImage.createFromBuffer(Buffer.from(await response.arrayBuffer()));
      }
      if (clipboardImage?.isEmpty?.()) throw new Error('Imagine invalida');
      clipboard.writeImage(clipboardImage); return;
    } catch (electronError) {
      const response = await fetch(source); const blob = await response.blob();
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw electronError;
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    }
  }

  async function richImageContextAction(action) {
    const editor = $('shop-product-description'); const figure = state.richImage;
    if (!figure) return closeRichImageMenu();
    if (action === 'copy') {
      try { await copyRichImage(figure); toast('Imaginea a fost copiata.'); }
      catch (error) { toast(error.message || 'Imaginea nu a putut fi copiata.', 'error'); }
    } else if (action === 'delete') {
      const next = figure.nextElementSibling || figure.previousElementSibling;
      figure.remove(); closeRichImageMenu(); selectRichImage(null);
      if (!editor.childNodes.length) { const paragraph = document.createElement('p'); paragraph.innerHTML = '<br>'; editor.append(paragraph); }
      const caretTarget = next?.isConnected ? next : editor.lastChild;
      if (caretTarget) { const range = document.createRange(); range.selectNodeContents(caretTarget); range.collapse(false); state.richRange = range; restoreRichSelection(); }
      editor.focus(); markRichDescriptionChanged(); toast('Imaginea a fost stearsa din descriere.');
    }
    closeRichImageMenu();
  }

  function openModal(id) { const modal = $(id); modal.hidden = false; requestAnimationFrame(() => modal.classList.add('visible')); }
  function closeModal(id) { const modal = $(id); modal?.classList.remove('visible'); setTimeout(() => { if (modal) modal.hidden = true; }, 180); }
  async function metadata() {
    [state.categories, state.brands, state.manufacturers, state.sources] = await Promise.all([window.SHOP_API.listCategories(), window.SHOP_API.listBrands(), window.SHOP_API.listManufacturers(), window.SHOP_API.listProductSources()]);
  }
  function loading(id, text) { $(id).innerHTML = `<div class="shop-commerce-loading">${esc(text)}</div>`; }
  function failure(id, error) { $(id).innerHTML = `<div class="shop-commerce-error">${esc(error.message || 'Datele nu au putut fi incarcate.')}</div>`; }
  function pageData(items, key) {
    const pageSize = PAGE_SIZE_OPTIONS.includes(state.pageSizes[key]) ? state.pageSizes[key] : PAGE_SIZE_OPTIONS[0];
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    const page = Math.min(Math.max(1, state.pages[key] || 1), pageCount);
    state.pages[key] = page;
    state.pageSizes[key] = pageSize;
    return { page, pageCount, pageSize, items: items.slice((page - 1) * pageSize, page * pageSize) };
  }
  function pagination(key, total, page, pageCount, pageSize) {
    if (!total) return '';
    const first = (page - 1) * pageSize + 1;
    const last = Math.min(total, page * pageSize);
    const selectId = `shop-${key}-page-size`;
    const options = PAGE_SIZE_OPTIONS.map(value => `<option value="${value}" ${value === pageSize ? 'selected' : ''}>${value}</option>`).join('');
    const chevron = direction => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${direction === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'}"/></svg>`;
    return `<nav class="shop-commerce-pagination" aria-label="Paginare"><div class="shop-commerce-page-size"><label for="${selectId}">Randuri pe pagina:</label><span><select id="${selectId}" data-page-size-key="${key}" aria-label="Randuri pe pagina">${options}</select><i aria-hidden="true">⌄</i></span></div><span class="shop-commerce-pagination-range" aria-live="polite">${first}–${last} din ${total}</span><div class="shop-commerce-pagination-arrows"><button type="button" data-page-key="${key}" data-page="${page - 1}" aria-label="Pagina anterioara" title="Pagina anterioara" ${page === 1 ? 'disabled' : ''}>${chevron('left')}</button><button type="button" data-page-key="${key}" data-page="${page + 1}" aria-label="Pagina urmatoare" title="Pagina urmatoare" ${page === pageCount ? 'disabled' : ''}>${chevron('right')}</button></div></nav>`;
  }
  function bindPagination(containerId, key, render) {
    $(containerId).querySelectorAll(`[data-page-key="${key}"]`).forEach(button => button.addEventListener('click', () => { state.pages[key] = Number(button.dataset.page); render(); $(containerId).scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    $(containerId).querySelector(`[data-page-size-key="${key}"]`)?.addEventListener('change', event => {
      const pageSize = Number(event.target.value);
      if (!PAGE_SIZE_OPTIONS.includes(pageSize)) return;
      state.pageSizes[key] = pageSize;
      state.pages[key] = 1;
      render();
    });
  }
  function imageBackground(image) {
    const url = image?.preview || image?.url || '';
    if (!url) return '';
    const sprite = Number(image.sprite_index || 0);
    const position = sprite ? `${((sprite - 1) % 3) * 50}% ${Math.floor((sprite - 1) / 3) * 100}%` : 'center';
    return `background-image:url('${esc(url)}');background-size:${sprite ? '300% 200%' : 'cover'};background-position:${position}`;
  }
  function productPicture(image, className = 'shop-commerce-thumb') {
    return image?.url || image?.preview ? `<span class="${className}" style="${imageBackground(image)}" role="img"></span>` : `<span class="${className} empty">□</span>`;
  }

  async function loadDashboard() {
    const host = document.querySelector('#tab-shop-dashboard .shop-page-scroll');
    if (!host || !window.SHOP_API?.getDashboardStats) return;
    host.innerHTML = '<div class="shop-commerce-loading">Se actualizeaza dashboardul...</div>';
    try {
      const dashboard = await window.SHOP_API.getDashboardStats();
      const recent = dashboard.recent_orders?.map(order => `<button type="button" class="shop-dashboard-order" data-shop-open="shop-orders"><span><strong>${esc(order.order_number)}</strong><small>${esc(order.customer_name)} · ${esc(order.created_at)}</small></span><span><b>${money(order.total)}</b><em class="${order.status === 'new' ? 'new' : ''}">${esc(statusLabels[order.status] || order.status)}</em></span></button>`).join('') || '<p class="shop-dashboard-empty">Nu exista inca nicio comanda.</p>';
      host.innerHTML = `<section class="shop-dashboard-hero"><div><span>DASHBOARD COMERCIAL</span><h1>Magazinul tau, pe scurt.</h1><p>Vanzari, comenzi, achizitii si profit sincronizate direct cu magazinul online.</p><b><i></i>Date sincronizate cu baza de date</b></div><div class="shop-dashboard-orbit" aria-hidden="true"><strong>↗</strong><span>${Number(dashboard.new_orders_count || 0)}</span><small>COMENZI NOI</small></div></section><section class="shop-dashboard-metrics">${dashboardMetric('Vanzari', money(dashboard.revenue), '#38bdf8')}${dashboardMetric('Comenzi', dashboard.orders_count, '#a78bfa')}${dashboardMetric('Achizitii', money(dashboard.acquisitions), '#f59e0b')}${dashboardMetric('Profit', money(dashboard.profit), '#22c55e')}</section><section class="shop-dashboard-columns"><div><div class="shop-section-head"><div><span>ACTIUNI RAPIDE</span><h2>Administreaza magazinul</h2></div></div><div class="shop-dashboard-actions"><button type="button" data-shop-open="shop-products"><span>◇</span><strong>Produse</strong><small>Adauga sau editeaza catalogul.</small><b>Deschide →</b></button><button type="button" data-shop-open="shop-orders"><span>✓</span><strong>Comenzi</strong><small>Verifica si proceseaza comenzile.</small><b>Deschide →</b></button></div></div><div><div class="shop-section-head"><div><span>ACTIVITATE RECENTA</span><h2>Ultimele comenzi</h2></div><small>${Number(dashboard.new_orders_count || 0)} noi</small></div><div class="shop-dashboard-orders">${recent}</div></div></section>`;
    } catch (error) {
      host.innerHTML = `<div class="shop-commerce-error">${esc(error.message || 'Dashboardul nu a putut fi incarcat.')}</div>`;
    }
  }
  function dashboardMetric(label, value, color) { return `<article style="--metric:${color}"><i></i><small>${esc(label)}</small><strong>${esc(value)}</strong></article>`; }

  async function loadProducts() {
    loading('shop-products-content', 'Se incarca produsele...');
    try {
      const bootstrap = await window.SHOP_API.loadProductManager();
      state.products = bootstrap.products;
      state.categories = bootstrap.categories;
      state.brands = bootstrap.brands;
      state.manufacturers = bootstrap.manufacturers;
      state.sources = bootstrap.sources;
      renderProducts();
    } catch (error) { failure('shop-products-content', error); }
  }
  function renderProducts() {
    const term = state.productQuery.trim().toLowerCase();
    const filtered = term ? state.products.filter(product => `${product.name} ${product.sku || ''} ${product.source_domain || ''}`.toLowerCase().includes(term)) : state.products;
    const page = pageData(filtered, 'products');
    const rows = page.items.map(product => `<tr data-product-open="${product.id}"><td>${productPicture(product.images?.[0])}</td><td><strong>${esc(product.name)}</strong><small>/${esc(product.slug)}</small><em>${esc(product.sku || 'Fara SKU')} · ${esc(product.source_domain)}</em></td><td><b>${money(product.sale_price ?? product.price)}</b>${product.sale_price ? `<small class="old">${money(product.price)}</small>` : ''}</td><td>${stockBadge(product)}</td><td>${product.is_active ? '<span class="commerce-pill active">ACTIV</span>' : '<span class="commerce-pill inactive">INACTIV</span>'}</td><td><button class="commerce-icon edit" data-product-edit="${product.id}" title="Editeaza" aria-label="Editeaza produsul"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button class="commerce-icon delete" data-product-delete="${product.id}" title="Sterge" aria-label="Sterge produsul"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6"/></svg></button></td></tr>`).join('');
    $('shop-products-content').innerHTML = `<div class="shop-commerce-tools"><div><b>${filtered.length}</b><span>produse gasite</span></div><input id="shop-products-search" value="${esc(state.productQuery)}" placeholder="Cauta produs sau SKU..." /></div>${rows ? `<div class="shop-commerce-table-wrap"><table class="shop-commerce-table products"><thead><tr><th>Poza</th><th>Produs</th><th>Pret</th><th>Stoc</th><th>Status</th><th>Actiuni</th></tr></thead><tbody>${rows}</tbody></table></div>${pagination('products', filtered.length, page.page, page.pageCount, page.pageSize)}` : empty('Niciun produs', 'Adauga primul produs pentru a-l publica pe site.')}`;
    $('shop-products-content').querySelectorAll('[data-product-edit]').forEach(button => button.addEventListener('click', () => openProduct(button.dataset.productEdit)));
    $('shop-products-content').querySelectorAll('[data-product-delete]').forEach(button => button.addEventListener('click', () => deleteProduct(button.dataset.productDelete)));
    $('shop-products-content').querySelectorAll('[data-product-open]').forEach(row => row.addEventListener('click', event => { if (!event.target.closest('button')) openProductDetail(row.dataset.productOpen); }));
    $('shop-products-search')?.addEventListener('input', event => {
      state.productQuery = event.target.value;
      state.pages.products = 1;
      const caret = event.target.selectionStart ?? state.productQuery.length;
      renderProducts();
      const nextInput = $('shop-products-search');
      nextInput?.focus();
      nextInput?.setSelectionRange?.(caret, caret);
    });
    bindPagination('shop-products-content', 'products', renderProducts);
  }
  function stockBadge(product) { if (product.stock_mode === 'unlimited') return '<span class="commerce-stock unlimited">NELIMITAT</span>'; const low = product.stock_quantity <= product.low_stock_threshold; return `<span class="commerce-stock ${low ? 'low' : ''}">${product.stock_quantity} BUC.${low ? ' · STOC MIC' : ''}</span>`; }

  async function openProductDetail(id) {
    $('shop-product-detail-title').textContent = 'Se incarca...';
    $('shop-product-detail-content').innerHTML = '<div class="shop-commerce-loading">Se incarca fisa produsului...</div>';
    openModal('shop-product-detail-modal');
    try {
      const detail = await window.SHOP_API.getProductStats(id);
      state.productDetail = detail;
      $('shop-product-detail-title').textContent = detail.product.name;
      renderProductDetail();
    } catch (error) { $('shop-product-detail-content').innerHTML = `<div class="shop-commerce-error">${esc(error.message)}</div>`; }
  }
  function renderProductDetail() {
    const detail = state.productDetail;
    if (!detail) return;
    const product = detail.product;
    const gallery = product.images.map((image, index) => `<div class="shop-detail-image ${index === 0 ? 'main' : ''}">${productPicture(image, 'shop-detail-image-photo')}${index === 0 ? '<small>PRINCIPALA</small>' : ''}</div>`).join('') || '<p>Produsul nu are imagini.</p>';
    const orders = detail.orders.map(order => {
      const acquisitionPrice = Number(product.cost_price || 0);
      const salePrice = Number(order.unit_price || 0);
      const orderProfit = Number(order.line_total || 0) - (acquisitionPrice * Number(order.quantity || 0));
      return `<tr><td><strong>${esc(order.order_number)}</strong><small>${esc(order.created_at)}</small><em>${esc(order.customer_name)}</em></td><td>${order.quantity} buc.</td><td><b>${money(acquisitionPrice)}</b><small>pe bucata</small></td><td><b>${money(salePrice)}</b><small>pe bucata</small></td><td><b class="shop-profit-value">${money(orderProfit)}</b><small>total comanda</small></td><td><span class="commerce-pill" style="--pill:${statusColors[order.status] || '#aaa'}">${esc(statusLabels[order.status] || order.status)}</span></td></tr>`;
    }).join('');
    const reviews = detail.reviews.map(review => `<article class="shop-detail-review"><header><div><strong>${esc(review.customer_name)}</strong><small>${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)} · ${esc(review.created_at)}</small></div><button type="button" class="danger" data-detail-review-delete="${review.id}">×</button></header><p>${esc(review.message)}</p><label>Raspunsul magazinului<textarea rows="3" data-detail-review-reply="${review.id}">${esc(review.admin_reply || '')}</textarea></label><button type="button" class="btn-primary" data-detail-review-save="${review.id}">Salveaza raspunsul</button></article>`).join('') || '<p class="shop-detail-empty">Produsul nu are inca recenzii.</p>';
    $('shop-product-detail-content').innerHTML = `<div class="shop-detail-gallery">${gallery}</div><div class="shop-detail-metrics">${detailMetric('Vanzari', money(detail.revenue))}${detailMetric('Comenzi', detail.orders_count)}${detailMetric('Bucati vandute', detail.units_sold)}${detailMetric('Vizualizari pe site', product.view_count)}${detailMetric('Pret achizitie', money(product.cost_price))}${detailMetric('Pret vanzare', money(product.sale_price ?? product.price))}${detailMetric('Profit estimat', money(detail.profit), true)}${detailMetric('Recenzii', `${detail.reviews.length}${product.review_average ? ` · ${Number(product.review_average).toFixed(1)}★` : ''}`)}</div>${section('01', 'Comenzi si vanzari', 'Istoricul comenzilor care contin acest produs.')}<div class="shop-commerce-table-wrap"><table class="shop-commerce-table shop-product-sales-table"><thead><tr><th>Numar comanda</th><th>Cantitate</th><th>Pret achizitie</th><th>Pret vanzare</th><th>Profit</th><th>Status</th></tr></thead><tbody>${orders || '<tr><td colspan="6">Produsul nu apare in nicio comanda.</td></tr>'}</tbody></table></div>${section('02', 'Recenzii', 'Raspunde clientilor sau sterge recenziile direct de aici.')}<div class="shop-detail-reviews">${reviews}</div>`;
    $('shop-product-detail-content').querySelectorAll('[data-detail-review-save]').forEach(button => button.addEventListener('click', async () => { try { const id = button.dataset.detailReviewSave; const reply = $(`shop-product-detail-content`).querySelector(`[data-detail-review-reply="${id}"]`).value; await window.SHOP_API.replyProductReview(id, reply); toast('Raspunsul a fost salvat.'); await openProductDetail(product.id); } catch (error) { toast(error.message, 'error'); } }));
    $('shop-product-detail-content').querySelectorAll('[data-detail-review-delete]').forEach(button => button.addEventListener('click', async () => { if (!confirm('Stergi aceasta recenzie de pe site?')) return; try { await window.SHOP_API.deleteProductReview(button.dataset.detailReviewDelete); toast('Recenzia a fost stearsa.'); await openProductDetail(product.id); } catch (error) { toast(error.message, 'error'); } }));
  }
  function detailMetric(label, value, accent = false) { return `<article class="${accent ? 'accent' : ''}"><small>${esc(label)}</small><strong>${esc(value)}</strong></article>`; }

  async function openProduct(id = '') {
    try {
      if (!state.sources.length) await metadata();
      const product = id ? await window.SHOP_API.getProduct(id) : null;
      state.editingProduct = product;
      state.slugTouched = false;
      state.productImages = (product?.images || []).map((image, index) => ({ ...image, key: image.id || `existing-${index}`, preview: image.url }));
      state.productSpecifications = (product?.specifications || []).map(item => ({ ...item }));
      state.productQuestions = (product?.questions || []).map(item => ({ ...item }));
      $('shop-product-modal-title').textContent = product ? 'Editeaza produsul' : 'Produs nou';
      fillSelect($('shop-product-source'), state.sources.filter(item => item.is_active || (product && item.id === product.source_id)), product?.source_id || state.sources.find(item => item.is_default && item.is_active)?.id || '', item => `${item.name} · ${item.domain}${item.is_active ? '' : ' · ascunsa pe site'}`);
      fillSelect($('shop-product-category'), state.categories, product?.category_id || '', item => item.name, 'Fara categorie');
      fillSelect($('shop-product-manufacturer'), state.manufacturers, product?.manufacturer_id || '', item => item.name, 'Fara producator');
      renderBrandDropdown(product?.brand_ids || []);
      const values = { 'shop-product-sku': product?.sku, 'shop-product-name': product?.name, 'shop-product-slug': product?.slug, 'shop-product-short': product?.short_description, 'shop-product-description-title': product?.description_title, 'shop-product-price': product?.price, 'shop-product-discount-value': product?.discount_value || '', 'shop-product-stock': product?.stock_quantity ?? 0, 'shop-product-low-stock': product?.low_stock_threshold ?? 3, 'shop-product-meta-title': product?.meta_title, 'shop-product-meta-description': product?.meta_description };
      Object.entries(values).forEach(([key, value]) => $(key).value = value ?? '');
      $('shop-product-discount-type').value = product?.discount_type || 'percent';
      state.richRange = null;
      selectRichImage(null);
      $('shop-product-description').innerHTML = product?.description_html || '';
      normalizeRichImages();
      $('shop-product-stock-mode').value = product?.stock_mode || 'tracked';
      $('shop-product-active').checked = product?.is_active ?? true;
      $('shop-product-featured').checked = product?.is_featured ?? false;
      renderProductGallery(); renderProductSpecifications(); renderProductQuestions(); validateProductName(); updateProductPreview(); updateStockInputs(); openModal('shop-product-modal');
    } catch (error) { toast(error.message || 'Produsul nu a putut fi deschis.', 'error'); }
  }
  function fillSelect(select, items, selected, label, emptyLabel = '') { select.innerHTML = (emptyLabel ? `<option value="">${esc(emptyLabel)}</option>` : '') + items.map(item => `<option value="${item.id}" ${item.id === selected ? 'selected' : ''}>${esc(label(item))}</option>`).join(''); }
  function renderBrandDropdown(selectedIds = []) {
    const options = $('shop-product-brands');
    options.hidden = true;
    $('shop-product-brands-toggle').setAttribute('aria-expanded', 'false');
    options.innerHTML = state.brands.length ? state.brands.map(brand => `<label><input type="checkbox" value="${brand.id}" data-brand-name="${esc(brand.name)}" ${selectedIds.includes(brand.id) ? 'checked' : ''} /><span><i>✓</i>${esc(brand.name)}</span></label>`).join('') : '<p>Nu exista marci disponibile.</p>';
    options.querySelectorAll('input').forEach(input => input.addEventListener('change', updateBrandDropdownSummary));
    updateBrandDropdownSummary();
  }
  function updateBrandDropdownSummary() {
    const selected = Array.from($('shop-product-brands').querySelectorAll('input:checked')).map(input => input.dataset.brandName);
    $('shop-product-brands-summary').textContent = selected.length ? selected.join(', ') : 'Alege marcile compatibile';
  }
  function renderProductGallery() {
    $('shop-product-gallery').innerHTML = state.productImages.map((image, index) => `<article draggable="true" data-gallery-index="${index}" class="shop-gallery-card ${index === 0 ? 'main' : ''}"><div class="shop-gallery-photo">${productPicture(image, 'shop-product-gallery-image')}<button type="button" class="remove" data-image-remove="${index}" aria-label="Sterge fotografia">×</button>${index === 0 ? '<span class="primary-badge">PRINCIPALA</span>' : ''}</div><footer><span class="drag-handle" title="Trage pentru reordonare">⠿ <b>Trage</b></span><button type="button" class="make-main ${index === 0 ? 'selected' : ''}" data-image-main="${index}" ${index === 0 ? 'disabled' : ''} aria-label="Alege fotografia principala">★ <span>${index === 0 ? 'Principala' : 'Alege principala'}</span></button></footer></article>`).join('') + (state.productImages.length < 12 ? `<button type="button" class="add-images" id="shop-product-add-images"><span>＋</span><b>Adauga poze</b><small>${state.productImages.length} din 12 fotografii</small></button>` : '');
    $('shop-product-add-images')?.addEventListener('click', () => $('shop-product-images-input').click());
    $('shop-product-gallery').querySelectorAll('[data-image-remove]').forEach(button => button.addEventListener('click', () => { state.productImages.splice(Number(button.dataset.imageRemove), 1); renderProductGallery(); updateProductPreview(); }));
    $('shop-product-gallery').querySelectorAll('[data-image-main]').forEach(button => button.addEventListener('click', () => { const [image] = state.productImages.splice(Number(button.dataset.imageMain), 1); state.productImages.unshift(image); renderProductGallery(); updateProductPreview(); }));
    let dragged = -1;
    const clearDragStyles = () => $('shop-product-gallery').querySelectorAll('.shop-gallery-card').forEach(card => card.classList.remove('dragging', 'drag-over'));
    $('shop-product-gallery').querySelectorAll('.shop-gallery-card').forEach(card => {
      card.addEventListener('dragstart', event => { dragged = Number(card.dataset.galleryIndex); event.dataTransfer.effectAllowed = 'move'; requestAnimationFrame(() => card.classList.add('dragging')); });
      card.addEventListener('dragend', () => { dragged = -1; clearDragStyles(); });
      card.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (dragged !== Number(card.dataset.galleryIndex)) card.classList.add('drag-over'); });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
      card.addEventListener('drop', event => { event.preventDefault(); const target = Number(card.dataset.galleryIndex); if (dragged < 0 || dragged === target) return clearDragStyles(); const [image] = state.productImages.splice(dragged, 1); state.productImages.splice(target, 0, image); renderProductGallery(); updateProductPreview(); });
    });
    $('shop-product-add-images')?.addEventListener('dragover', event => { if (dragged >= 0) event.preventDefault(); });
    $('shop-product-add-images')?.addEventListener('drop', event => { event.preventDefault(); if (dragged < 0 || dragged === state.productImages.length - 1) return; const [image] = state.productImages.splice(dragged, 1); state.productImages.push(image); renderProductGallery(); updateProductPreview(); });
  }
  function renderProductSpecifications() {
    $('shop-product-specifications').innerHTML = state.productSpecifications.map((item, index) => `<article><header><strong>Specificatie ${index + 1}</strong><button type="button" data-specification-remove="${index}">×</button></header><div class="shop-commerce-columns three"><label>Grupa<input data-specification-field="group" data-specification-index="${index}" value="${esc(item.group || '')}" placeholder="Caracteristici generale"></label><label>Denumire<input data-specification-field="label" data-specification-index="${index}" value="${esc(item.label || '')}" placeholder="Ex: Greutate"></label><label>Valoare<input data-specification-field="value" data-specification-index="${index}" value="${esc(item.value || '')}" placeholder="Ex: 1,2 kg"></label></div></article>`).join('') || '<p class="shop-subeditor-empty">Nu ai adaugat specificatii.</p>';
    $('shop-product-specifications').querySelectorAll('[data-specification-field]').forEach(input => input.addEventListener('input', () => { state.productSpecifications[Number(input.dataset.specificationIndex)][input.dataset.specificationField] = input.value; }));
    $('shop-product-specifications').querySelectorAll('[data-specification-remove]').forEach(button => button.addEventListener('click', () => { state.productSpecifications.splice(Number(button.dataset.specificationRemove), 1); renderProductSpecifications(); }));
  }
  function renderProductQuestions() {
    $('shop-product-questions').innerHTML = state.productQuestions.map((item, index) => `<article><header><strong>Intrebare ${index + 1}</strong><button type="button" data-question-remove="${index}">×</button></header><label>Intrebare<textarea rows="2" data-question-field="question" data-question-index="${index}" placeholder="Intrebarea clientului">${esc(item.question || '')}</textarea></label><label>Raspuns<textarea rows="3" data-question-field="answer" data-question-index="${index}" placeholder="Raspunsul magazinului">${esc(item.answer || '')}</textarea></label></article>`).join('') || '<p class="shop-subeditor-empty">Nu ai adaugat intrebari si raspunsuri.</p>';
    $('shop-product-questions').querySelectorAll('[data-question-field]').forEach(input => input.addEventListener('input', () => { state.productQuestions[Number(input.dataset.questionIndex)][input.dataset.questionField] = input.value; }));
    $('shop-product-questions').querySelectorAll('[data-question-remove]').forEach(button => button.addEventListener('click', () => { state.productQuestions.splice(Number(button.dataset.questionRemove), 1); renderProductQuestions(); }));
  }
  async function addProductImages(event) { const files = Array.from(event.target.files || []).slice(0, 12 - state.productImages.length); const results = await Promise.all(files.map(file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ key: `new-${Date.now()}-${Math.random()}`, preview: reader.result, base64: reader.result, alt_text: $('shop-product-name').value || file.name }); reader.onerror = reject; reader.readAsDataURL(file); }))); state.productImages.push(...results); event.target.value = ''; renderProductGallery(); updateProductPreview(); }
  function updateStockInputs() { const tracked = $('shop-product-stock-mode').value === 'tracked'; $('shop-product-stock').disabled = !tracked; $('shop-product-low-stock').disabled = !tracked; }
  function validateProductName() {
    const input = $('shop-product-name');
    const message = $('shop-product-name-error');
    const normalized = input.value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ro-RO');
    const duplicate = Boolean(normalized && state.products.some(product => product.id !== state.editingProduct?.id && String(product.name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ro-RO') === normalized));
    input.classList.toggle('is-invalid', duplicate);
    input.setAttribute('aria-invalid', duplicate ? 'true' : 'false');
    message.hidden = !duplicate;
    return !duplicate;
  }
  function updateProductPreview() { const price = Number($('shop-product-price').value || 0); const discount = Math.max(0, Number($('shop-product-discount-value').value || 0)); const discountType = $('shop-product-discount-type').value; const finalPrice = discount ? Math.max(0, discountType === 'fixed' ? price - discount : price * (1 - discount / 100)) : price; $('shop-product-discount-label').firstChild.textContent = discountType === 'fixed' ? 'Reducere lei' : 'Reducere %'; $('shop-product-final-price').textContent = money(finalPrice); $('shop-google-title').textContent = $('shop-product-meta-title').value.trim() || $('shop-product-name').value.trim() || 'Titlul produsului'; $('shop-google-description').textContent = $('shop-product-meta-description').value.trim() || $('shop-product-short').value.trim() || 'Descrierea produsului va aparea aici.'; $('shop-google-url').textContent = `https://g-trots.ro/magazin/produs/${$('shop-product-slug').value || 'slug-produs'}`; const image = $('shop-google-image'); if (state.productImages[0]) { image.setAttribute('style', imageBackground(state.productImages[0])); image.hidden = false; } else { image.removeAttribute('style'); image.hidden = true; } }
  async function saveProduct(event) {
    event.preventDefault(); const button = $('shop-product-save'); button.disabled = true;
    try {
      if (!validateProductName()) { $('shop-product-name').focus(); throw new Error('Acest nume de produs exista deja.'); }
      const price = Number($('shop-product-price').value); const costPrice = Number(state.editingProduct?.cost_price || 0); const discount = Number($('shop-product-discount-value').value || 0); const discountType = $('shop-product-discount-type').value; const source = state.sources.find(item => item.id === $('shop-product-source').value);
      if (discount < 0 || (discount > 0 && (discountType === 'percent' ? discount >= 100 : discount >= price))) throw new Error(discountType === 'percent' ? 'Reducerea procentuala trebuie sa fie sub 100%.' : 'Reducerea fixa trebuie sa fie mai mica decat pretul.');
      const salePrice = discount ? Math.round((discountType === 'fixed' ? price - discount : price * (1 - discount / 100)) * 100) / 100 : null;
      const payload = { source_id: source?.id || null, source_domain: source?.domain || 'g-trots.ro', source_url: '', name: $('shop-product-name').value.trim(), slug: $('shop-product-slug').value.trim(), short_description: $('shop-product-short').value.trim(), description_title: $('shop-product-description-title').value.trim(), description_html: richDescriptionHtml(), specifications: state.productSpecifications.map(item => ({ group: item.group.trim(), label: item.label.trim(), value: item.value.trim() })), questions: state.productQuestions.map(item => ({ question: item.question.trim(), answer: item.answer.trim() })), meta_title: $('shop-product-meta-title').value.trim(), meta_description: $('shop-product-meta-description').value.trim(), cost_price: costPrice, price, discount_type: discountType, discount_value: discount || null, discount_percent: discountType === 'percent' ? discount || null : null, sale_price: salePrice, category_id: $('shop-product-category').value || null, manufacturer_id: $('shop-product-manufacturer').value || null, brand_ids: Array.from($('shop-product-brands').querySelectorAll('input:checked')).map(input => input.value), stock_mode: $('shop-product-stock-mode').value, stock_quantity: Math.max(0, Number($('shop-product-stock').value || 0)), low_stock_threshold: Math.max(0, Number($('shop-product-low-stock').value || 0)), currency: 'RON', is_active: $('shop-product-active').checked, is_featured: $('shop-product-featured').checked, images: state.productImages.map((image, index) => ({ id: image.id, base64: image.base64, alt_text: image.alt_text || $('shop-product-name').value.trim(), sort_order: index })) };
      if (!payload.name || !payload.slug || !Number.isFinite(price) || !Number.isFinite(costPrice) || costPrice < 0) throw new Error('Completeaza numele, slug-ul si preturile valide.');
      const saved = state.editingProduct ? await window.SHOP_API.updateProduct(state.editingProduct.id, payload) : await window.SHOP_API.createProduct(payload);
      closeModal('shop-product-modal');
      toast(saved.stripe_sync_status === 'error' ? `Produs salvat. Stripe: ${saved.stripe_sync_error || 'sincronizarea trebuie reincercata.'}` : 'Produsul a fost salvat si sincronizat.', saved.stripe_sync_status === 'error' ? 'error' : 'success');
      await loadProducts();
    } catch (error) { toast(error.message || 'Produsul nu a putut fi salvat.', 'error'); } finally { button.disabled = false; }
  }
  async function deleteProduct(id) { const product = state.products.find(item => item.id === id); if (!product || !confirm(`Stergi definitiv produsul „${product.name}”? Toate pozele lui vor fi sterse de pe server.`)) return; try { const result = await window.SHOP_API.deleteProduct(id); if (!result?.success || result.deleted_id !== id) throw new Error('Serverul nu a confirmat stergerea produsului.'); state.products = state.products.filter(item => item.id !== id); renderProducts(); await loadProducts(); if (state.products.some(item => item.id === id)) throw new Error('Produsul apare inca in catalog dupa stergere. Reincarca si incearca din nou.'); toast(`Produsul a fost sters definitiv${result.deleted_files ? ` impreuna cu ${result.deleted_files} fisiere` : ''}.`); } catch (error) { toast(error.message, 'error'); } }

  async function loadOrders() { loading('shop-orders-content', 'Se incarca comenzile...'); try { state.orders = await window.SHOP_API.listOrders(); renderOrders(); } catch (error) { failure('shop-orders-content', error); } }
  function renderOrders() {
    const page = pageData(state.orders, 'orders');
    const rows = page.items.map(order => `<tr data-order-open="${order.id}"><td><strong>${esc(order.order_number)}</strong><small>${esc(new Date(order.created_at.replace(' ', 'T')).toLocaleString('ro-RO'))}</small></td><td><strong>${esc(order.customer_name)}</strong><small>${esc(order.customer_phone)}</small></td><td><span class="commerce-pill" style="--pill:${statusColors[order.status]}">${esc(statusLabels[order.status] || order.status)}</span></td><td>${order.payment_method === 'card' ? 'Card' : 'Ramburs'}<small>${esc(order.payment_status)}</small></td><td><b>${money(order.total)}</b></td><td>›</td></tr>`).join('');
    $('shop-orders-content').innerHTML = rows ? `<div class="shop-commerce-summary"><span><b>${state.orders.filter(item => item.status === 'new').length}</b> în procesare</span><span><b>${state.orders.filter(item => item.status === 'processing').length}</b> în pregătire</span><span><b>${money(state.orders.filter(item => item.status !== 'cancelled').reduce((sum, item) => sum + Number(item.total), 0))}</b> valoare</span></div><div class="shop-commerce-table-wrap"><table class="shop-commerce-table orders"><thead><tr><th>Comanda</th><th>Client</th><th>Status</th><th>Plata</th><th>Total</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${pagination('orders', state.orders.length, page.page, page.pageCount, page.pageSize)}` : empty('Nicio comanda', 'Comenzile trimise de pe site vor aparea automat aici.');
    $('shop-orders-content').querySelectorAll('[data-order-open]').forEach(row => row.addEventListener('click', () => openOrder(row.dataset.orderOpen)));
    bindPagination('shop-orders-content', 'orders', renderOrders);
  }
  function orderTimeline(order) {
    const history = Array.isArray(order.status_history) ? order.status_history : [];
    const recorded = new Set(history.map(item => item.to_status));
    const regular = statusDefinitions.filter(item => item.value !== 'cancelled');
    const currentIndex = regular.findIndex(item => item.value === order.status);
    const visible = order.status === 'cancelled'
      ? statusDefinitions.filter(item => recorded.has(item.value) || item.value === 'cancelled')
      : regular.filter((item, index) => recorded.has(item.value) || index >= Math.max(0, currentIndex));
    return `<section class="shop-order-timeline"><div class="shop-order-section-title"><span>EVOLUȚIA COMENZII</span><strong>Istoric status</strong></div><div class="shop-order-timeline-flow">${visible.map((item, index) => {
      const entry = [...history].reverse().find(historyItem => historyItem.to_status === item.value);
      const reached = Boolean(entry) || item.value === order.status;
      const current = item.value === order.status;
      const date = entry ? new Date(String(entry.created_at).replace(' ', 'T')).toLocaleString('ro-RO') : '';
      return `<div class="shop-order-timeline-step ${reached ? 'reached' : ''} ${current ? 'current' : ''}" style="--status-color:${statusColors[item.value]}"><div class="shop-order-timeline-rail"><span>${statusIcon(item.value)}</span>${index < visible.length - 1 ? '<i></i>' : ''}</div><div class="shop-order-timeline-card"><div><strong>${esc(statusLabels[item.value])}</strong>${current ? '<em>ACUM</em>' : ''}</div><p>${esc(item.description)}</p>${entry ? `<footer><time>${esc(date)}</time>${entry.customer_notified ? '<b>✉ CLIENT NOTIFICAT</b>' : ''}</footer>` : `<small>${current ? 'Statusul curent' : 'Pas următor'}</small>`}</div></div>`;
    }).join('')}</div></section>`;
  }
  function orderStatusPicker(order) {
    return `<section class="shop-order-status-section"><div class="shop-order-section-title"><span>ACTUALIZEAZĂ</span><strong>Alege statusul comenzii</strong></div><div class="shop-order-status-picker">${statusDefinitions.map(item => `<label class="shop-order-status-option ${order.status === item.value ? 'selected' : ''}" style="--status-color:${statusColors[item.value]}"><input type="radio" name="shop-order-status" value="${item.value}" ${order.status === item.value ? 'checked' : ''}><span class="shop-order-status-icon">${statusIcon(item.value)}</span><span><strong>${esc(statusLabels[item.value])}</strong><small>${esc(item.description)}</small></span><i>✓</i></label>`).join('')}</div></section>`;
  }
  function syncOrderNotify() {
    const notify = $('shop-order-notify');
    const helper = $('shop-order-notify-helper');
    const status = document.querySelector('input[name="shop-order-status"]:checked')?.value || state.editingOrder?.status;
    if (!notify || !state.editingOrder) return;
    const hasEmail = Boolean(state.editingOrder.customer_email);
    const changed = status !== state.editingOrder.status;
    notify.disabled = !hasEmail || !changed;
    if (notify.disabled) notify.checked = false;
    if (helper) helper.textContent = !hasEmail ? 'Comanda nu are o adresă de e-mail.' : !changed ? 'Alege un status diferit pentru a notifica clientul.' : `Bonul și linkul de urmărire vor fi trimise la ${state.editingOrder.customer_email}.`;
    document.querySelectorAll('.shop-order-status-option').forEach(label => label.classList.toggle('selected', label.querySelector('input')?.checked));
  }
  function renderOrderDetails(order) {
    state.editingOrder = order;
    $('shop-order-title').textContent = order.order_number;
    $('shop-order-details').innerHTML = `<div class="shop-order-grid"><section><small>CLIENT</small><strong>${esc(order.customer_name)}</strong><span>${esc(order.customer_phone)}</span><span>${esc(order.customer_email || 'Fără e-mail')}</span></section><section><small>LIVRARE</small><strong>${esc(order.address)}</strong><span>${esc(order.city)}${order.county ? `, ${esc(order.county)}` : ''}</span><span>${esc(order.shipping_method_name)}</span></section></div><div class="shop-order-items">${order.items.map(item => `<div>${item.image_url ? `<img src="${esc(item.image_url)}" alt="">` : `<b>${item.quantity}×</b>`}<span><strong>${esc(item.product_name)}</strong><small>${item.quantity} × ${money(item.unit_price)} · ${esc(item.product_sku || 'Fără SKU')}</small></span><em>${money(item.line_total)}</em></div>`).join('')}</div><div class="shop-order-total"><span>Produse ${money(order.subtotal)} · Livrare ${money(order.shipping_cost)}</span><strong>Total ${money(order.total)}</strong></div>${orderTimeline(order)}${orderStatusPicker(order)}<label class="shop-order-notify"><input id="shop-order-notify" type="checkbox"><span class="shop-order-notify-icon">✉</span><span><strong>Trimite actualizarea pe e-mail</strong><small id="shop-order-notify-helper"></small></span><i>✓</i></label><div class="shop-commerce-columns"><label>Status plată<select id="shop-order-payment-status">${['pending', 'paid', 'failed', 'refunded'].map(value => `<option value="${value}" ${order.payment_status === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Metodă de plată<input value="${order.payment_method === 'card' ? 'Card online' : 'Ramburs la curier'}" disabled></label></div><label>Notițe interne<textarea id="shop-order-admin-notes" rows="4">${esc(order.admin_notes || '')}</textarea></label>${order.customer_notes ? `<div class="shop-order-note"><small>OBSERVAȚII CLIENT</small>${esc(order.customer_notes)}</div>` : ''}`;
    document.querySelectorAll('input[name="shop-order-status"]').forEach(input => input.addEventListener('change', syncOrderNotify));
    syncOrderNotify();
  }
  async function openOrder(id) {
    const summary = state.orders.find(item => item.id === id);
    if (!summary) return;
    state.editingOrder = summary;
    $('shop-order-title').textContent = summary.order_number;
    $('shop-order-details').innerHTML = '<div class="shop-commerce-loading">Se încarcă istoricul comenzii...</div>';
    openModal('shop-order-modal');
    try { renderOrderDetails(await window.SHOP_API.getOrder(id)); }
    catch (error) { renderOrderDetails(summary); toast(error.message || 'Istoricul nu a putut fi încărcat.', 'error'); }
  }
  async function saveOrder(event) {
    event.preventDefault();
    if (!state.editingOrder) return;
    const button = $('shop-order-save');
    button.disabled = true;
    try {
      const status = document.querySelector('input[name="shop-order-status"]:checked')?.value || state.editingOrder.status;
      if (status === 'cancelled' && state.editingOrder.status !== 'cancelled' && !confirm('Anulezi comanda? Stocul va fi returnat automat.')) return;
      const updated = await window.SHOP_API.updateOrder(state.editingOrder.id, { status, payment_status: $('shop-order-payment-status').value, admin_notes: $('shop-order-admin-notes').value.trim(), notify_customer: Boolean($('shop-order-notify')?.checked) });
      closeModal('shop-order-modal');
      const email = updated.email_notification;
      toast(email?.requested ? (email.sent ? `Comanda a fost actualizată, iar clientul a fost notificat la ${email.recipient}.` : `Status salvat. E-mailul nu a plecat: ${email.error || 'verifică SMTP.'}`) : 'Comanda a fost actualizată.', email?.requested && !email.sent ? 'error' : 'success');
      await loadOrders();
    } catch (error) { toast(error.message, 'error'); }
    finally { button.disabled = false; }
  }

  async function loadInventory() { loading('shop-inventory-content', 'Se incarca stocurile...'); try { state.inventory = await window.SHOP_API.listInventory(); renderInventory(); } catch (error) { failure('shop-inventory-content', error); } }
  function renderInventory() {
    const page = pageData(state.inventory, 'inventory');
    const rows = page.items.map(product => `<tr ${product.stock_mode === 'tracked' ? `data-stock-open="${product.id}"` : ''}><td>${productPicture(product.images?.[0])}</td><td><strong>${esc(product.name)}</strong><small>${esc(product.sku || 'Fara SKU')}</small></td><td>${stockBadge(product)}</td><td><strong class="commerce-accounting-stock">${Number(product.accounting_stock_quantity || 0)} BUC.</strong><small>Doar citire</small></td><td>${product.stock_mode === 'tracked' ? product.low_stock_threshold : '—'}</td><td>${product.stock_mode === 'tracked' ? 'Ajusteaza ›' : 'Nelimitat'}</td></tr>`).join('');
    const low = state.inventory.filter(item => item.stock_mode === 'tracked' && item.stock_quantity <= item.low_stock_threshold).length;
    $('shop-inventory-content').innerHTML = rows ? `<div class="shop-commerce-summary"><span><b>${state.inventory.filter(item => item.stock_mode === 'tracked').length}</b> produse urmarite</span><span class="warn"><b>${low}</b> cu stoc mic</span><span><b>${state.inventory.filter(item => item.stock_mode === 'unlimited').length}</b> nelimitate</span></div><div class="shop-commerce-table-wrap"><table class="shop-commerce-table inventory"><thead><tr><th>Poza</th><th>Produs</th><th>Stoc online</th><th>Stoc Conta</th><th>Alerta sub</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${pagination('inventory', state.inventory.length, page.page, page.pageCount, page.pageSize)}` : empty('Niciun produs in stoc', 'Adauga produse pentru a le gestiona cantitatile.');
    $('shop-inventory-content').querySelectorAll('[data-stock-open]').forEach(row => row.addEventListener('click', () => openStock(row.dataset.stockOpen)));
    bindPagination('shop-inventory-content', 'inventory', renderInventory);
  }
  async function openStock(id) { const product = state.inventory.find(item => item.id === id); if (!product) return; state.editingStock = product; $('shop-stock-title').textContent = product.name; $('shop-stock-quantity').value = product.stock_quantity; $('shop-stock-note').value = ''; $('shop-stock-history').innerHTML = '<div class="shop-commerce-loading">Se incarca istoricul...</div>'; openModal('shop-stock-modal'); try { const movements = await window.SHOP_API.listInventoryMovements(id); $('shop-stock-history').innerHTML = `<h3>Istoric recent</h3>${movements.slice(0, 30).map(item => `<div><b class="${item.quantity_delta >= 0 ? 'plus' : 'minus'}">${item.quantity_delta > 0 ? '+' : ''}${item.quantity_delta}</b><span><strong>${esc(item.note || item.movement_type)}</strong><small>${esc(item.created_at)} · stoc ${item.quantity_after}</small></span></div>`).join('') || '<p>Nicio miscare inregistrata.</p>'}`; } catch (error) { $('shop-stock-history').innerHTML = `<p>${esc(error.message)}</p>`; } }
  async function saveStock(event) { event.preventDefault(); if (!state.editingStock) return; const button = $('shop-stock-save'); button.disabled = true; try { await window.SHOP_API.adjustStock(state.editingStock.id, { quantity: Math.max(0, Number($('shop-stock-quantity').value || 0)), note: $('shop-stock-note').value.trim() || 'Ajustare manuala din desktop' }); closeModal('shop-stock-modal'); toast('Stocul a fost actualizat.'); await loadInventory(); } catch (error) { toast(error.message, 'error'); } finally { button.disabled = false; } }

  async function loadSourcesPage() { loading('shop-sources-content', 'Se incarca sursele...'); try { state.sources = await window.SHOP_API.listProductSources(); renderSources(); } catch (error) { failure('shop-sources-content', error); } }
  function renderSources() { $('shop-sources-content').innerHTML = state.sources.map(source => `<article class="shop-settings-row"><span class="shop-settings-icon">${source.is_default ? '★' : '◎'}</span><div><strong>${esc(source.name)}</strong><small>${esc(source.domain)}</small><em>${source.is_active ? 'Produsele sunt vizibile pe website' : 'Produsele sunt pastrate doar in CRM'}</em></div>${source.is_default ? '<b class="commerce-pill active">IMPLICITA</b>' : ''}<label class="commerce-source-switch" title="Afiseaza sau ascunde produsele pe website"><b>${Number(source.product_count || 0)} ${Number(source.product_count || 0) === 1 ? 'produs' : 'produse'}</b><input type="checkbox" data-source-toggle="${source.id}" ${source.is_active ? 'checked' : ''}><span></span></label><button data-source-edit="${source.id}">✎</button><button class="danger" data-source-delete="${source.id}">×</button></article>`).join('') || empty('Nicio sursa', 'Adauga sursa produselor.'); $('shop-sources-content').querySelectorAll('[data-source-toggle]').forEach(input => input.addEventListener('change', () => toggleSourceVisibility(input.dataset.sourceToggle, input.checked, input))); $('shop-sources-content').querySelectorAll('[data-source-edit]').forEach(button => button.addEventListener('click', () => openSource(button.dataset.sourceEdit))); $('shop-sources-content').querySelectorAll('[data-source-delete]').forEach(button => button.addEventListener('click', () => deleteSource(button.dataset.sourceDelete))); }
  async function toggleSourceVisibility(id, isActive, input) { const source = state.sources.find(item => item.id === id); if (!source) return; input.disabled = true; try { await window.SHOP_API.updateProductSource(id, { ...source, is_active: isActive, is_default: isActive ? source.is_default : false }); toast(isActive ? 'Produsele sursei sunt vizibile pe website.' : 'Produsele sursei au fost ascunse de pe website.'); await loadSourcesPage(); } catch (error) { input.checked = !isActive; input.disabled = false; toast(error.message, 'error'); } }
  function openSource(id = '') { const source = state.sources.find(item => item.id === id) || null; state.editingSource = source; $('shop-source-title').textContent = source ? 'Editeaza sursa' : 'Sursa noua'; $('shop-source-name').value = source?.name || ''; $('shop-source-domain').value = source?.domain || ''; $('shop-source-url').value = source?.base_url || ''; $('shop-source-active').checked = source?.is_active ?? true; $('shop-source-default').checked = source?.is_default ?? false; openModal('shop-source-modal'); }
  async function saveSource(event) { event.preventDefault(); const button = $('shop-source-save'); button.disabled = true; try { const domain = $('shop-source-domain').value.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0]; const payload = { name: $('shop-source-name').value.trim(), domain, base_url: $('shop-source-url').value.trim() || `https://${domain}`, is_active: $('shop-source-active').checked, is_default: $('shop-source-default').checked, sort_order: state.editingSource?.sort_order || state.sources.length }; if (state.editingSource) await window.SHOP_API.updateProductSource(state.editingSource.id, payload); else await window.SHOP_API.createProductSource(payload); closeModal('shop-source-modal'); toast('Sursa a fost salvata.'); await loadSourcesPage(); } catch (error) { toast(error.message, 'error'); } finally { button.disabled = false; } }
  async function deleteSource(id) { const source = state.sources.find(item => item.id === id); if (!source || !confirm(`Stergi sursa ${source.domain}?`)) return; try { await window.SHOP_API.deleteProductSource(id); toast('Sursa a fost stearsa.'); await loadSourcesPage(); } catch (error) { toast(error.message, 'error'); } }

  async function loadPayments() {
    loading('shop-payments-content', 'Se incarca metodele de plata...');
    try {
      const settings = await window.SHOP_API.getPaymentSettings();
      const stripeState = settings.stripe_configured
        ? `<span class="shop-payment-status is-connected"><i aria-hidden="true"></i>STRIPE ${settings.stripe_test_mode ? 'TEST' : 'ACTIV'}</span>`
        : '<span class="shop-payment-status is-offline"><i aria-hidden="true"></i>NECONFIGURAT</span>';
      $('shop-payments-content').innerHTML = `
        <form id="shop-payments-form" class="shop-settings-form shop-payment-settings" aria-label="Setari metode de plata">
          <section class="shop-payment-stripe-card">
            <div class="shop-payment-stripe-main">
              <span class="shop-payment-brand-icon" aria-hidden="true">S</span>
              <div class="shop-payment-copy">
                <span class="shop-payment-eyebrow">INTEGRARE STRIPE</span>
                <h2>Catalog conectat la Stripe</h2>
                <p>CRM-ul ramane catalogul principal pentru produse, preturi si disponibilitate.</p>
              </div>
              ${stripeState}
            </div>
            <div class="shop-payment-sync-row">
              <div class="shop-payment-sync-summary">
                <span class="shop-payment-sync-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5M6.1 9a7 7 0 0 1 11.6-2.6L20 9M4 15l2.3 2.6A7 7 0 0 0 17.9 15" /></svg>
                </span>
                <span>
                  <strong>${Number(settings.stripe_synced_products || 0)} produse sincronizate</strong>
                  <small>${Number(settings.stripe_sync_errors || 0) ? `${Number(settings.stripe_sync_errors)} erori necesita atentie` : 'Catalogul este pregatit pentru urmatoarea sincronizare'}</small>
                </span>
              </div>
              <button class="btn-secondary shop-payment-sync-button" type="button" data-stripe-sync ${settings.stripe_configured ? '' : 'disabled'}>Sincronizeaza acum</button>
            </div>
          </section>

          <section class="shop-payment-methods-panel">
            <header class="shop-payment-section-head">
              <div>
                <span class="shop-payment-eyebrow">CONFIGURARE CHECKOUT</span>
                <h2>Cum pot plati clientii</h2>
                <p>Activeaza metodele dorite si personalizeaza denumirea afisata in magazin.</p>
              </div>
              <span class="shop-payment-options-badge">2 OPTIUNI</span>
            </header>

            <div class="shop-payment-method-grid">
              <article class="shop-payment-method-card shop-payment-method-card--online">
                <div class="shop-payment-method-head">
                  <span class="shop-payment-method-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18M7 15h4" /></svg>
                  </span>
                  <div class="shop-payment-method-copy">
                    <h3>Card online</h3>
                    <p>Plata securizata, procesata prin Stripe.</p>
                  </div>
                  <label class="shop-payment-switch" for="shop-payment-card">
                    <input type="checkbox" id="shop-payment-card" ${settings.card_enabled ? 'checked' : ''} />
                    <span class="shop-payment-switch-track" aria-hidden="true"></span>
                    <span class="shop-payment-sr-only">Activeaza plata cu cardul</span>
                  </label>
                </div>
                <label class="shop-payment-field" for="shop-payment-card-label">
                  <span>Denumire afisata</span>
                  <input id="shop-payment-card-label" value="${esc(settings.card_label)}" />
                  <small>Asa va aparea optiunea la finalizarea comenzii.</small>
                </label>
              </article>

              <article class="shop-payment-method-card shop-payment-method-card--cash">
                <div class="shop-payment-method-head">
                  <span class="shop-payment-method-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="M4 9.5 12 4l8 5.5v8.2a2.3 2.3 0 0 1-2.3 2.3H6.3A2.3 2.3 0 0 1 4 17.7Z" /><path d="M8 13h8M9.5 16h5" /></svg>
                  </span>
                  <div class="shop-payment-method-copy">
                    <h3>Ramburs la curier</h3>
                    <p>Clientul plateste atunci cand primeste coletul.</p>
                  </div>
                  <label class="shop-payment-switch" for="shop-payment-cod">
                    <input type="checkbox" id="shop-payment-cod" ${settings.cash_on_delivery_enabled ? 'checked' : ''} />
                    <span class="shop-payment-switch-track" aria-hidden="true"></span>
                    <span class="shop-payment-sr-only">Activeaza plata ramburs</span>
                  </label>
                </div>
                <label class="shop-payment-field" for="shop-payment-cod-label">
                  <span>Denumire afisata</span>
                  <input id="shop-payment-cod-label" value="${esc(settings.cash_on_delivery_label)}" />
                  <small>Asa va aparea optiunea la finalizarea comenzii.</small>
                </label>
              </article>
            </div>
          </section>

          <footer class="shop-payment-form-actions">
            <div class="shop-payment-save-note">
              <span aria-hidden="true">
                <svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
              </span>
              <span><strong>Setari protejate</strong><small>Modificarile devin vizibile imediat in checkout.</small></span>
            </div>
            <button class="btn-primary shop-payment-save-button" type="submit">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-8" /></svg>
              Salveaza metodele de plata
            </button>
          </footer>
        </form>`;
      $('shop-payments-content').querySelector('[data-stripe-sync]')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = 'Se sincronizeaza...';
        try {
          const result = await window.SHOP_API.syncStripeCatalog();
          toast(`${result.synced} produse sincronizate${result.errors.length ? ` · ${result.errors.length} erori` : ''}.`, result.errors.length ? 'error' : 'success');
          await loadPayments();
        } catch (error) {
          toast(error.message, 'error');
          button.disabled = false;
          button.textContent = 'Sincronizeaza acum catalogul';
        }
      });
      $('shop-payments-form').addEventListener('submit', async event => {
        event.preventDefault();
        try {
          await window.SHOP_API.updatePaymentSettings({ card_enabled: $('shop-payment-card').checked, cash_on_delivery_enabled: $('shop-payment-cod').checked, card_label: $('shop-payment-card-label').value.trim(), cash_on_delivery_label: $('shop-payment-cod-label').value.trim() });
          toast('Metodele de plata au fost salvate.');
        } catch (error) { toast(error.message, 'error'); }
      });
    } catch (error) { failure('shop-payments-content', error); }
  }

  async function loadShippingPage() { loading('shop-shipping-content', 'Se incarca livrarile...'); try { state.shipping = await window.SHOP_API.listShippingMethods(); renderShipping(); } catch (error) { failure('shop-shipping-content', error); } }
  function renderShipping() { $('shop-shipping-content').innerHTML = state.shipping.map(item => `<article class="shop-settings-row"><span class="shop-settings-icon">⇢</span><div><strong>${esc(item.name)}</strong><small>${item.cost ? money(item.cost) : 'Gratuit'}${item.free_above !== null ? ` · gratuit peste ${money(item.free_above)}` : ''}</small><em>${esc(item.eta_label || item.description || '')}</em></div>${!item.is_active ? '<b class="commerce-pill inactive">INACTIVA</b>' : ''}<button data-shipping-edit="${item.id}">✎</button><button class="danger" data-shipping-delete="${item.id}">×</button></article>`).join('') || empty('Nicio metoda de livrare', 'Adauga prima livrare.'); $('shop-shipping-content').querySelectorAll('[data-shipping-edit]').forEach(button => button.addEventListener('click', () => openShipping(button.dataset.shippingEdit))); $('shop-shipping-content').querySelectorAll('[data-shipping-delete]').forEach(button => button.addEventListener('click', () => deleteShipping(button.dataset.shippingDelete))); }
  function openShipping(id = '') { const item = state.shipping.find(entry => entry.id === id) || null; state.editingShipping = item; $('shop-shipping-title').textContent = item ? 'Editeaza livrarea' : 'Livrare noua'; $('shop-shipping-name').value = item?.name || ''; $('shop-shipping-description').value = item?.description || ''; $('shop-shipping-cost').value = item?.cost ?? 0; $('shop-shipping-free').value = item?.free_above ?? ''; $('shop-shipping-eta').value = item?.eta_label || ''; $('shop-shipping-active').checked = item?.is_active ?? true; openModal('shop-shipping-modal'); }
  async function saveShipping(event) { event.preventDefault(); const button = $('shop-shipping-save'); button.disabled = true; try { const payload = { name: $('shop-shipping-name').value.trim(), description: $('shop-shipping-description').value.trim(), cost: Number($('shop-shipping-cost').value || 0), free_above: $('shop-shipping-free').value === '' ? null : Number($('shop-shipping-free').value), eta_label: $('shop-shipping-eta').value.trim(), is_active: $('shop-shipping-active').checked, sort_order: state.editingShipping?.sort_order || state.shipping.length }; if (state.editingShipping) await window.SHOP_API.updateShippingMethod(state.editingShipping.id, payload); else await window.SHOP_API.createShippingMethod(payload); closeModal('shop-shipping-modal'); toast('Livrarea a fost salvata.'); await loadShippingPage(); } catch (error) { toast(error.message, 'error'); } finally { button.disabled = false; } }
  async function deleteShipping(id) { const item = state.shipping.find(entry => entry.id === id); if (!item || !confirm(`Stergi metoda ${item.name}?`)) return; try { await window.SHOP_API.deleteShippingMethod(id); toast('Livrarea a fost stearsa.'); await loadShippingPage(); } catch (error) { toast(error.message, 'error'); } }

  function empty(title, text) { return `<div class="shop-commerce-empty"><b>◇</b><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`; }
  mount();
})();
