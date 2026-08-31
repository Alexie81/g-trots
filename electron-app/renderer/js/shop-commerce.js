(function () {
  const { shell } = require('electron');
  const state = {
    products: [], orders: [], inventory: [], inventoryMovements: [], sources: [], suppliers: [], categories: [], brands: [], manufacturers: [], shipping: [], customers: [], promotions: [], companies: [], nirs: [], nirPermissions: [], nirWarehouses: [],
    editingProduct: null, editingOrder: null, editingStock: null, editingSource: null, editingSupplier: null, editingShipping: null, editingPromotion: null, editingCompany: null, customerDetail: null, companyStampBase64: null, companyStampRemove: false, promotionSelectedProductIds: new Set(), promotionAllProductIds: null, promotionSelectingAll: false, promotionProductQuery: '', promotionProductsLoading: false, promotionProductSearchTimer: null, promotionSelectedCustomerIds: new Set(), promotionCustomerQuery: '', promotionCustomersLoading: false,
    productImages: [], productSpecifications: [], productQuestions: [], productDetail: null, productTotal: 0, productSearchTimer: null, productLoadRequestId: 0, slugTouched: false, productQuery: '', orderQuery: '', orderSearchTimer: null, orderStatusFilter: 'all', orderPaymentMethodFilter: 'all', orderPaymentStatusFilter: 'all', richRange: null, richImage: null, richDragging: null, richResize: null,
    customerQuery: '', inventoryQuery: '', inventoryMovementsLoading: false, supplierProductsBySupplier: {}, supplierProductPages: {}, nirEditor: null, nirCorrectionOriginal: null, nirSearch: '', nirStatus: '', nirSupplierQuery: '', nirProductQuery: '', nirProductLineIndex: -1, nirSavePromise: null, nirEditRevision: 0, nirRegistryRequestId: 0, nirBootstrapped: false, nirCreateInFlight: false, nirResolveTimers: new Map(), nirResolveRequestIds: new Map(), nirPendingFiles: [], nirStornoPendingFiles: [], nirRateLoading: '', nirReversing: false,
    pages: { products: 1, orders: 1, inventory: 1, stockFlow: 1, stockMovements: 1, productSales: 1, productReviews: 1, productPurchases: 1, customers: 1, customerOrders: 1, nirs: 1 },
    pageSizes: { products: 10, orders: 10, inventory: 10, stockFlow: 5, stockMovements: 5, productSales: 5, productReviews: 5, productPurchases: 5, customers: 10, customerOrders: 5, nirs: 15 },
  };
  const PAGE_SIZE_OPTIONS = [10, 25, 50];
  const PRODUCT_SALES_PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 25, 50, 75, 100];
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  const money = value => `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} lei`;
  const quantity = value => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(Number(value || 0));
  const slugify = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 200);
  const normalizeSemanticSearch = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  function searchEditDistance(left, right) {
    if (left === right) return 0;
    if (!left.length) return right.length;
    if (!right.length) return left.length;
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
      const current = [leftIndex];
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) current[rightIndex] = Math.min(current[rightIndex - 1] + 1, previous[rightIndex] + 1, previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1));
      previous = current;
    }
    return previous[right.length];
  }
  function inventorySearchScore(product, rawQuery) {
    const query = normalizeSemanticSearch(rawQuery);
    if (!query) return 1;
    const brandNames = Array.isArray(product.brands) ? product.brands.map(brand => brand.name).join(' ') : '';
    const specifications = Array.isArray(product.specifications) ? product.specifications.map(item => `${item.group || ''} ${item.label || ''} ${item.value || ''}`).join(' ') : '';
    const fields = [
      [product.name, 180], [product.sku, 230], [product.supplier_product_code, 230], [product.ean, 240],
      [product.category_name, 110], [product.manufacturer_name, 110], [brandNames, 110],
      [product.source_name, 95], [product.source_domain, 90], [product.inventory_search_terms, 125],
      [product.slug, 80], [product.description_title, 65], [product.short_description, 55],
      [product.meta_title, 45], [product.meta_description, 35], [specifications, 60],
    ].map(([value, weight]) => ({ text: normalizeSemanticSearch(value), weight })).filter(field => field.text);
    const compactQuery = query.replaceAll(' ', '');
    let score = 0;
    for (const field of fields) {
      const compactField = field.text.replaceAll(' ', '');
      if (field.text === query || compactField === compactQuery) score = Math.max(score, field.weight * 5);
      else if (field.text.startsWith(query) || compactField.startsWith(compactQuery)) score = Math.max(score, field.weight * 3.5);
      else if (field.text.includes(query) || (compactQuery.length >= 3 && compactField.includes(compactQuery))) score = Math.max(score, field.weight * 2.5);
    }
    const tokens = [...new Set(query.split(' ').filter(Boolean))];
    for (const token of tokens) {
      let tokenScore = 0;
      for (const field of fields) {
        const words = field.text.split(' ');
        for (const word of words) {
          if (word === token) tokenScore = Math.max(tokenScore, field.weight);
          else if (word.startsWith(token) || token.startsWith(word)) tokenScore = Math.max(tokenScore, field.weight * 0.88);
          else if (token.length >= 3 && word.includes(token)) tokenScore = Math.max(tokenScore, field.weight * 0.72);
          else if (token.length >= 4 && word.length >= 4) {
            const tolerance = Math.max(1, Math.floor(Math.max(token.length, word.length) * 0.25));
            if (Math.abs(token.length - word.length) <= tolerance && searchEditDistance(token, word) <= tolerance) tokenScore = Math.max(tokenScore, field.weight * 0.56);
          }
        }
      }
      if (!tokenScore) return -1;
      score += tokenScore;
    }
    return score;
  }
  const toast = (message, type = 'success') => window.BUSINESS_UI?.showToast?.(message, type);
  const statusLabels = { new: 'În procesare (Nouă)', confirmed: 'Confirmată', processing: 'În pregătire', shipped: 'Predată curierului', completed: 'Livrată', refunded: 'Rambursată', cancelled: 'Comandă anulată' };
  const statusShortLabels = { new: 'Nouă', confirmed: 'Confirmată', processing: 'În pregătire', shipped: 'Predată curierului', completed: 'Livrată', refunded: 'Rambursată', cancelled: 'Anulată' };
  const statusColors = { new: '#38bdf8', confirmed: '#34d399', processing: '#fb923c', shipped: '#a78bfa', completed: '#22c55e', refunded: '#f59e0b', cancelled: '#fb7185' };
  const statusDefinitions = [
    { value: 'new', description: 'Comanda a fost primită și a intrat în procesare.' },
    { value: 'confirmed', description: 'Comanda și plata au fost confirmate.' },
    { value: 'processing', description: 'Produsele sunt pregătite pentru expediere.' },
    { value: 'shipped', description: 'Pachetul a fost predat curierului.' },
    { value: 'completed', description: 'Comanda a ajuns la destinație.' },
    { value: 'refunded', description: 'Comanda a fost returnată și rambursată.' },
    { value: 'cancelled', description: 'Comanda nu mai este procesată.' },
  ];
  const mainStatusFlow = ['new', 'confirmed', 'processing', 'shipped', 'completed'];
  const terminalStatuses = ['refunded', 'cancelled'];
  const statusTransitionLocked = (current, candidate) => {
    if (candidate === current) return false;
    if (terminalStatuses.includes(current)) return true;
    if (terminalStatuses.includes(candidate)) return false;
    const currentIndex = mainStatusFlow.indexOf(current);
    const candidateIndex = mainStatusFlow.indexOf(candidate);
    return currentIndex >= 0 && candidateIndex >= 0 && candidateIndex < currentIndex;
  };
  const statusIcon = status => ({
    new: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/></svg>',
    confirmed: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>',
    processing: '<svg viewBox="0 0 24 24"><path d="m4 8 8-4 8 4-8 4Z"/><path d="M4 8v8l8 4 8-4V8M12 12v8"/></svg>',
    shipped: '<svg viewBox="0 0 24 24"><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    completed: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/><circle cx="12" cy="12" r="10"/></svg>',
    refunded: '<svg viewBox="0 0 24 24"><path d="M4 7v5h5"/><path d="M5.6 16a8 8 0 1 0 .2-8.2L4 12"/></svg>',
    cancelled: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>',
  }[status] || '');

  function mount() {
    $('tab-shop-products').innerHTML = commercePage('Produse', 'Catalog, preturi, descrieri, imagini si SEO.', 'shop-products-content', true);
    $('tab-shop-orders').innerHTML = commercePage('Comenzi', 'Comenzile primite direct din magazinul online.', 'shop-orders-content');
    $('tab-shop-inventory').innerHTML = commercePage('Stocuri', 'Cantitati, alerte si istoricul miscarilor.', 'shop-inventory-content');

    const anchor = $('tab-shop-invoices');
    anchor.insertAdjacentHTML('afterend', `
      <div class="tab-panel shop-tab-panel" id="tab-shop-sources">${commercePage('Surse produse', 'Gestioneaza provenienta produselor si sursa implicita.', 'shop-sources-content', true)}</div>
      <div class="tab-panel shop-tab-panel" id="tab-shop-suppliers">${commercePage('Furnizori', 'Firme partenere, persoane de contact si date comerciale pentru achizitii.', 'shop-suppliers-content', true)}</div>
      <div class="tab-panel shop-tab-panel" id="tab-shop-nirs">${commercePage('NIR-uri', 'Recepții contabile, facturi de achiziție și costuri istorice.', 'shop-nirs-content', true)}</div>
      <div class="tab-panel shop-tab-panel" id="tab-shop-payments">${commercePage('Metode de plata', 'Controleaza optiunile disponibile la finalizarea comenzii.', 'shop-payments-content')}</div>
      <div class="tab-panel shop-tab-panel" id="tab-shop-shipping">${commercePage('Livrari', 'Costuri, transport gratuit si termene estimate.', 'shop-shipping-content', true)}</div>
      <div class="tab-panel shop-tab-panel" id="tab-shop-customers">${commercePage('Clienti', 'Conturi, comenzi, valoare totala si controlul accesului.', 'shop-customers-content')}</div>
      <div class="tab-panel shop-tab-panel" id="tab-shop-discounts">${commercePage('Reduceri', 'Campanii detaliate, clienti eligibili si rezultate masurate pentru fiecare reducere.', 'shop-discounts-content', true)}</div>
      <div class="tab-panel shop-tab-panel" id="tab-shop-company">${commercePage('Datele firmei', 'Societatea, datele bancare si stampila folosite in fluxurile SHOP.', 'shop-company-content', true)}</div>
    `);
    document.querySelector('#tab-shop-dashboard .shop-area-grid')?.insertAdjacentHTML('beforeend', `
      ${dashboardCard('shop-sources', 'blue', 'SURSE', 'Surse produse', 'Magazinele si furnizorii produselor.')}
      ${dashboardCard('shop-suppliers', 'teal', 'ACHIZITII', 'Furnizori', 'Parteneri, contacte si date comerciale.')}
      ${dashboardCard('shop-nirs', 'teal', 'RECEPTII', 'NIR-uri', 'Facturi de achiziție, intrări și costuri reale.')}
      ${dashboardCard('shop-payments', 'purple', 'CHECKOUT', 'Metode de plata', 'Card online si ramburs la curier.')}
      ${dashboardCard('shop-shipping', 'green', 'LOGISTICA', 'Livrari', 'Costuri si praguri de gratuitate.')}
      ${dashboardCard('shop-customers', 'blue', 'RELATII CLIENTI', 'Clienti', 'Conturi, comenzi si acces la magazin.')}
      ${dashboardCard('shop-discounts', 'amber', 'PROMOTII', 'Reduceri', 'Campanii, cupoane si anunturi pe site.')}
      ${dashboardCard('shop-company', 'purple', 'IDENTITATE', 'Datele firmei', 'Societati, conturi bancare si stampila.')}
    `);
    document.body.insertAdjacentHTML('beforeend', productModal() + productDetailModal() + orderModal() + stockModal() + sourceModal() + supplierModal() + nirModal() + shippingModal() + customerModal() + promotionModal() + promotionStatsModal() + companyModal());
    wire();
    if ($('tab-shop-dashboard')?.classList.contains('active')) void loadDashboard();
  }

  function commercePage(title, description, contentId, hasAdd = false) {
    const kind = contentId.replace('shop-', '').replace('-content', '');
    const symbols = { products: '◇', orders: '✓', inventory: '▦', sources: '◎', suppliers: '⌁', nirs: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h5M9 12h7m-7 4h7"/><path d="m9 8 1.2 1.2L12.7 7"/></svg>', payments: '▣', shipping: '⇢', customers: '◉', discounts: '%', company: '▤' };
    return `<div class="shop-commerce-page"><header class="shop-commerce-head shop-commerce-hero" data-commerce-kind="${kind}"><span class="shop-commerce-hero-glow"></span><button type="button" class="shop-back-btn" data-shop-open="shop-dashboard">&larr; Panou SHOP</button><div class="shop-commerce-title"><span>G-TROTS SHOP CRM</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="shop-commerce-hero-symbol" aria-hidden="true">${symbols[kind] || '◇'}</div><div class="shop-commerce-head-actions"><button type="button" class="shop-commerce-refresh" data-commerce-refresh="${contentId}" title="Reincarca" aria-label="Reincarca datele"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0 2 5"/><path d="M20 4v7h-7"/></svg></button>${hasAdd ? `<button type="button" class="shop-commerce-add" data-commerce-add="${contentId}" ${contentId === 'shop-company-content' ? 'hidden' : ''}>${contentId === 'shop-nirs-content' ? '<span class="shop-nir-add-icon">+</span> NIR nou' : '+ Adauga'}</button>` : ''}</div></header><main id="${contentId}" class="shop-commerce-content"><div class="shop-commerce-loading">Se incarca...</div></main></div>`;
  }
  function dashboardCard(target, tone, kicker, title, description) {
    return `<button type="button" class="shop-area-card ${tone}" data-shop-open="${target}"><span class="shop-area-icon">${target === 'shop-sources' ? '◎' : target === 'shop-suppliers' ? '⌁' : target === 'shop-payments' ? '▣' : '⇢'}</span><span class="shop-area-copy"><small>${kicker}</small><strong>${title}</strong><em>${description}</em></span><span class="shop-area-arrow">&rarr;</span></button>`;
  }

  function productModal() {
    return `<div class="shop-commerce-overlay" id="shop-product-modal" hidden><form class="shop-commerce-modal product-editor" id="shop-product-form"><header><div><small>CRM PRODUSE</small><h2 id="shop-product-modal-title">Produs nou</h2></div><button type="button" data-commerce-close="shop-product-modal">×</button></header><div class="shop-commerce-modal-scroll">
      ${section('01', 'Sursa si identitate', 'Sursa implicita este selectata automat pentru un produs nou.')}
      <div class="shop-commerce-columns"><label>Sursa produsului<select id="shop-product-source"></select></label><label>SKU / cod<input id="shop-product-sku" maxlength="80" placeholder="Se generează automat la salvare" disabled aria-disabled="true" /><small class="shop-field-help">Se generează automat la salvare</small></label></div>
      <div class="shop-commerce-columns"><label>Cod produs furnizor<input id="shop-product-supplier-code" maxlength="120" placeholder="Optional · litere si cifre" /></label><label>EAN<input id="shop-product-ean" maxlength="120" placeholder="Optional · litere si cifre" /></label></div>
      <div class="shop-commerce-columns"><label>Nume produs *<input id="shop-product-name" maxlength="180" required /><small id="shop-product-name-error" class="shop-field-error" hidden>Acest nume de produs exista deja.</small></label><label>Slug *<span class="shop-input-prefix">g-trots.ro/magazin/produs/</span><input id="shop-product-slug" maxlength="200" required /></label></div>
      ${section('02', 'Galerie foto', 'Incarca pana la 12 poze. Tine click pe o fotografie si trage-o in pozitia dorita.')}
      <div class="shop-product-gallery" id="shop-product-gallery"></div><input id="shop-product-images-input" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden />
      ${section('03', 'Descriere', 'Poti lipi continut formatat; stilurile, bold si italic sunt pastrate.')}
      <label>Descriere scurta<textarea id="shop-product-short" rows="3" maxlength="2000"></textarea></label>
      <label>Titlu descriere lunga<input id="shop-product-description-title" maxlength="220" placeholder="Ex: Aderenta sigura pentru traseele tale zilnice." /></label>
      <div class="shop-rich-field"><span class="shop-rich-label">Descriere completa</span><div class="shop-rich-toolbar"><button type="button" data-rich-command="bold" title="Bold"><b>B</b></button><button type="button" data-rich-command="italic" title="Italic"><i>I</i></button><button type="button" data-rich-command="underline" title="Subliniat"><u>U</u></button><button type="button" data-rich-command="insertUnorderedList">• Lista</button><button type="button" data-rich-command="insertOrderedList">1. Lista</button><i class="shop-rich-separator"></i><button type="button" class="shop-rich-image-add" id="shop-rich-image-add">+ Imagine</button><button type="button" data-rich-image-action="move-up" title="Muta imaginea mai sus" disabled>↑</button><button type="button" data-rich-image-action="move-down" title="Muta imaginea mai jos" disabled>↓</button><button type="button" data-rich-image-action="resize" title="Schimba dimensiunea" disabled>Marime</button><span class="shop-rich-hint" id="shop-rich-hint">Poti lipi text si imagini direct in editor</span></div><input id="shop-rich-image-input" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden><div id="shop-product-description" class="shop-rich-editor" contenteditable="true" spellcheck="true"></div><div id="shop-rich-image-menu" class="shop-rich-image-menu" role="menu" aria-label="Optiuni imagine" hidden><button type="button" data-rich-context-action="copy" role="menuitem"><span class="shop-rich-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg></span><span><b>Copiaza imaginea</b><small>O pune in clipboard</small></span></button><button type="button" class="danger" data-rich-context-action="delete" role="menuitem"><span class="shop-rich-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="M7 7l1 13h8l1-13"></path><path d="M10 11v5M14 11v5"></path></svg></span><span><b>Sterge imaginea</b><small>O elimina din descriere</small></span></button></div></div>
      ${section('04', 'Specificatii', 'Adauga grupele si caracteristicile proprii acestui produs.')}<div class="shop-subeditor-head"><strong>SPECIFICATII PRODUS</strong><button type="button" id="shop-product-add-specification">+ Adauga specificatie</button></div><div id="shop-product-specifications" class="shop-product-subeditor"></div>
      ${section('05', 'Intrebari si raspunsuri', 'Continutul este afisat numai pe pagina acestui produs.')}<div class="shop-subeditor-head"><strong>INTREBARI PRODUS</strong><button type="button" id="shop-product-add-question">+ Adauga intrebare</button></div><div id="shop-product-questions" class="shop-product-subeditor"></div>
      ${section('06', 'Pret si reducere', 'Controleaza pretul G-Trots; pentru produsele Boomag, diferenta comerciala este pastrata automat la actualizarea feedului.')}
      <div class="shop-supplier-pricing" id="shop-product-boomag-pricing" hidden><div class="shop-supplier-pricing-head"><span><small>SINCRONIZARE BOOMAG</small><strong>Pretul public se pastreaza automat</strong></span><em><i></i>FEED ACTIV</em></div><div class="shop-commerce-columns"><label>Pret feed Boomag<input id="shop-product-supplier-base-price" type="number" step="0.01" disabled placeholder="Nesincronizat" /><small>Valoare preluata automat din feed.</small></label><label>Diferenta comerciala<input id="shop-product-price-difference" type="number" step="0.01" disabled placeholder="Nedisponibila" /><small>Calculata automat fata de pretul G-Trots.</small></label></div></div>
      <div class="shop-commerce-columns three"><label>Pret G-Trots *<input id="shop-product-price" type="number" min="0" step="0.01" required /><small id="shop-product-price-hint" hidden>Editezi pretul public dorit; diferenta se recalculeaza automat.</small></label><label>Tip reducere<select id="shop-product-discount-type"><option value="percent">Procent (%)</option><option value="fixed">Suma fixa (lei)</option></select></label><label id="shop-product-discount-label">Reducere %<input id="shop-product-discount-value" type="number" min="0" step="0.01" /></label></div><div class="shop-nir-note"><b>Costul de achizitie nu se introduce manual.</b><span>Va fi calculat automat din NIR-uri si facturile de intrare, deoarece poate varia la fiecare receptie.</span></div><div class="shop-price-preview"><small>PRET PE SITE</small><strong id="shop-product-final-price">0,00 lei</strong></div>
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
    return `<div class="shop-commerce-overlay shop-stock-sheet-overlay" id="shop-stock-modal" hidden><form class="shop-commerce-modal shop-stock-sheet-modal" id="shop-stock-form"><header><div><small>STOCURI / FISA PRODUSULUI</small><h2 id="shop-stock-title">Produs</h2></div><span class="shop-stock-sheet-live"><i></i>ISTORIC ACTUALIZAT</span><button type="button" data-commerce-close="shop-stock-modal">×</button></header><div class="shop-commerce-modal-scroll" id="shop-stock-details"><div class="shop-commerce-loading">Se pregateste fisa de stoc...</div></div><footer><button type="button" class="btn-ghost" data-commerce-close="shop-stock-modal">Inchide</button><button type="submit" class="btn-primary" id="shop-stock-save">Salveaza ajustarea</button></footer></form></div>`;
  }
  function sourceModal() {
    return `<div class="shop-commerce-overlay" id="shop-source-modal" hidden><form class="shop-commerce-modal mini" id="shop-source-form"><header><div><small>SURSA PRODUS</small><h2 id="shop-source-title">Sursa noua</h2></div><button type="button" data-commerce-close="shop-source-modal">×</button></header><div class="shop-commerce-modal-scroll"><label>Nume *<input id="shop-source-name" required maxlength="120" /></label><label>Domeniu *<input id="shop-source-domain" required maxlength="120" placeholder="exemplu.ro" /></label><label>Adresa de baza<input id="shop-source-url" type="url" maxlength="500" placeholder="https://exemplu.ro" /></label><div class="shop-editor-toggles"><label><span><b>Vizibila pe website</b><small>Afiseaza toate produsele acestei surse.</small></span><input id="shop-source-active" type="checkbox" checked /></label><label><span><b>Sursa implicita</b><small>Este aleasa automat la produs nou.</small></span><input id="shop-source-default" type="checkbox" /></label></div></div><footer><button type="button" class="btn-ghost" data-commerce-close="shop-source-modal">Renunta</button><button type="submit" class="btn-primary" id="shop-source-save">Salveaza sursa</button></footer></form></div>`;
  }
  function supplierModal() {
    return `<div class="shop-commerce-overlay" id="shop-supplier-modal" hidden><form class="shop-commerce-modal shop-supplier-modal" id="shop-supplier-form"><header><div><small>ACHIZITII / FURNIZORI</small><h2 id="shop-supplier-title">Furnizor nou</h2></div><button type="button" data-commerce-close="shop-supplier-modal">×</button></header><div class="shop-commerce-modal-scroll">
      ${section('01', 'Identitate', 'Datele firmei care livreaza produsele sau serviciile.')}
      <label>Nume furnizor *<input id="shop-supplier-name" required maxlength="180" placeholder="Ex: Distribuitor piese SRL" /></label><div class="shop-commerce-columns"><label>CUI / CIF<input id="shop-supplier-cui" maxlength="60" placeholder="RO12345678" /></label><label>Registrul comertului (J)<input id="shop-supplier-registration" maxlength="80" placeholder="J40/1234/2026" /></label></div>
      ${section('02', 'Persoana de contact', 'Datele folosite pentru comenzi si comunicare directa.')}
      <label>Persoana de contact<input id="shop-supplier-contact" maxlength="180" placeholder="Nume si prenume" /></label><div class="shop-commerce-columns"><label>Telefon<input id="shop-supplier-phone" maxlength="50" placeholder="07..." /></label><label>E-mail<input id="shop-supplier-email" type="email" maxlength="180" placeholder="contact@firma.ro" /></label></div>
      <div class="shop-commerce-columns"><label>Website<input id="shop-supplier-website" maxlength="255" placeholder="https://firma.ro" /></label><label>Adresa<input id="shop-supplier-address" maxlength="255" placeholder="Strada, numar, localitate" /></label></div>
      ${section('03', 'Observatii', 'Conditii comerciale, program, termene sau alte informatii utile.')}
      <label>Notite<textarea id="shop-supplier-notes" rows="4" placeholder="Discount negociat, persoana alternativa, program livrari..."></textarea></label>
      <div class="shop-editor-toggles"><label><span><b>Furnizor activ</b><small>Poate fi folosit pentru achizitii noi.</small></span><input id="shop-supplier-active" type="checkbox" checked /></label></div>
    </div><footer><button type="button" class="btn-ghost" data-commerce-close="shop-supplier-modal">Renunta</button><button type="submit" class="btn-primary" id="shop-supplier-save">Salveaza furnizorul</button></footer></form></div>`;
  }
  function nirModal() {
    return `<div class="shop-commerce-overlay shop-nir-overlay" id="shop-nir-modal" hidden><section class="shop-commerce-modal shop-nir-modal"><header><div><small>ACHIZITII / NOTA DE INTRARE RECEPTIE</small><h2 id="shop-nir-title">NIR nou</h2></div><span id="shop-nir-status" class="shop-nir-status draft">CIORNA</span><button type="button" data-commerce-close="shop-nir-modal">×</button></header><div class="shop-commerce-modal-scroll" id="shop-nir-editor"><div class="shop-commerce-loading">Se pregateste editorul...</div></div><footer id="shop-nir-footer"><button type="button" class="shop-nir-delete-trigger" id="shop-nir-delete" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg><span>Șterge NIR-ul</span></button><button type="button" class="btn-ghost shop-nir-reverse-trigger" id="shop-nir-reverse-trigger" hidden>${nirUiIcon('reverse')} <span>Stornare factură</span></button><button type="button" class="btn-ghost shop-nir-correct" id="shop-nir-correct" hidden>${nirUiIcon('edit')} <span>Editeaza NIR</span></button><button type="button" class="btn-ghost" id="shop-nir-export-pdf" hidden>Export PDF</button><button type="button" class="btn-ghost" id="shop-nir-export-xlsx" hidden>Export Excel</button><button type="button" class="btn-ghost" id="shop-nir-save">Salveaza ciorna</button><button type="button" class="btn-primary" id="shop-nir-confirm">Verifica si confirma</button></footer></section><input type="file" id="shop-nir-files" accept="application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/xml,text/xml" multiple hidden /></div>
    <div class="shop-commerce-overlay shop-nir-delete-overlay" id="shop-nir-delete-dialog" hidden><section class="shop-nir-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="shop-nir-delete-title" aria-describedby="shop-nir-delete-message"><div class="shop-nir-delete-orb" aria-hidden="true"><i></i><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></div><small>ȘTERGERE DEFINITIVĂ</small><h2 id="shop-nir-delete-title">Ștergi această notă de intrare-recepție?</h2><p id="shop-nir-delete-message">Ești sigur că vrei să ștergi această notă de intrare-recepție marfă?</p><div class="shop-nir-delete-document"><span><small>DOCUMENT</small><strong id="shop-nir-delete-number">NIR</strong></span><span><small>FURNIZOR</small><strong id="shop-nir-delete-supplier">Necompletat</strong></span></div><aside><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.7 20h18.6L12 3Zm0 6v5m0 3h.01"/></svg><span><b>Acțiunea nu poate fi anulată.</b>Pozițiile, documentele atașate și toate datele acestei ciorne vor fi eliminate definitiv.</span></aside><footer><button type="button" class="shop-nir-delete-cancel" id="shop-nir-delete-cancel">Nu, păstrează NIR-ul</button><button type="button" class="shop-nir-delete-confirm" id="shop-nir-delete-confirm"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg><span>Da, șterge definitiv</span></button></footer></section></div>
    <div class="shop-commerce-overlay shop-nir-delete-overlay shop-nir-reverse-overlay" id="shop-nir-reverse-dialog" hidden><section class="shop-nir-delete-dialog shop-nir-reverse-dialog" role="dialog" aria-modal="true" aria-labelledby="shop-nir-reverse-title" aria-describedby="shop-nir-reverse-message"><div class="shop-nir-delete-orb shop-nir-reverse-orb" aria-hidden="true"><i></i>${nirUiIcon('reverse')}</div><small>STORNARE CONTABILĂ</small><h2 id="shop-nir-reverse-title">Ce poziții stornezi din această factură?</h2><p id="shop-nir-reverse-message">Alege produsele și completează separat cantitatea stornată pentru fiecare poziție.</p><div class="shop-nir-delete-document"><span><small>DOCUMENT</small><strong id="shop-nir-reverse-number">NIR</strong></span><span><small>FURNIZOR</small><strong id="shop-nir-reverse-supplier">Necompletat</strong></span></div><section class="shop-nir-storno-selection" aria-labelledby="shop-nir-storno-selection-title"><header><span><small>POZIȚII DIN NIR</small><strong id="shop-nir-storno-selection-title">Alege produsele stornate</strong></span><button type="button" id="shop-nir-storno-all">Deselectează toate</button></header><div id="shop-nir-storno-lines"></div><small id="shop-nir-storno-selection-error" hidden>Alege cel puțin un produs și introdu o cantitate validă.</small></section><label class="shop-nir-reverse-reason"><span>Motivul stornării *</span><textarea id="shop-nir-reverse-reason" rows="3" maxlength="500" placeholder="Ex: factură corectată de furnizor sau recepție anulată"></textarea><small id="shop-nir-reverse-error" hidden>Scrie motivul stornării.</small></label><aside><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.7 20h18.6L12 3Zm0 6v5m0 3h.01"/></svg><span><b>Stocul selectat trebuie să fie încă disponibil.</b>Dacă marfa a fost deja consumată într-un document de ieșire, stornarea poziției este blocată pentru protejarea stocului contabil.</span></aside><footer><button type="button" class="shop-nir-delete-cancel" id="shop-nir-reverse-cancel">Renunță</button><button type="button" class="shop-nir-delete-confirm shop-nir-reverse-confirm" id="shop-nir-reverse-confirm">${nirUiIcon('reverse')}<span>Stornare factură</span></button></footer></section><input type="file" id="shop-nir-storno-files" accept="application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/xml,text/xml" multiple hidden /></div>
    <div class="shop-commerce-overlay shop-nir-picker-overlay" id="shop-nir-product-picker" hidden><section class="shop-commerce-modal mini"><header><div><small>ASOCIERE FURNIZOR–PRODUS</small><h2>Selecteaza produsul intern</h2></div><button type="button" data-commerce-close="shop-nir-product-picker">×</button></header><div class="shop-commerce-modal-scroll"><label class="shop-nir-picker-search">Cauta dupa denumire, SKU sau cod<input id="shop-nir-product-search" type="search" autocomplete="off" placeholder="Scrie cel putin 2 caractere" /></label><div id="shop-nir-product-results" class="shop-nir-product-results"><p>Scrie pentru a cauta in catalog.</p></div></div></section></div>`;
  }
  function shippingModal() {
    return `<div class="shop-commerce-overlay" id="shop-shipping-modal" hidden><form class="shop-commerce-modal mini" id="shop-shipping-form"><header><div><small>LIVRARE SHOP</small><h2 id="shop-shipping-title">Livrare noua</h2></div><button type="button" data-commerce-close="shop-shipping-modal">×</button></header><div class="shop-commerce-modal-scroll"><label>Nume *<input id="shop-shipping-name" required maxlength="120" /></label><label>Descriere<textarea id="shop-shipping-description" rows="3" maxlength="500"></textarea></label><div class="shop-commerce-columns"><label>Cost lei<input id="shop-shipping-cost" type="number" min="0" step="0.01" required /></label><label>Gratuit peste<input id="shop-shipping-free" type="number" min="0" step="0.01" placeholder="Optional" /></label></div><label>Termen estimat<input id="shop-shipping-eta" maxlength="120" placeholder="1-3 zile lucratoare" /></label><div class="shop-editor-toggles"><label><span><b>Livrare activa</b><small>Este disponibila pe site.</small></span><input id="shop-shipping-active" type="checkbox" checked /></label></div></div><footer><button type="button" class="btn-ghost" data-commerce-close="shop-shipping-modal">Renunta</button><button type="submit" class="btn-primary" id="shop-shipping-save">Salveaza livrarea</button></footer></form></div>`;
  }
  function customerModal() {
    return `<div class="shop-commerce-overlay" id="shop-customer-modal" hidden><section class="shop-commerce-modal shop-customer-modal"><header><div><small>FISA CLIENT</small><h2 id="shop-customer-title">Client</h2></div><button type="button" data-commerce-close="shop-customer-modal">×</button></header><div class="shop-commerce-modal-scroll" id="shop-customer-details"></div><footer><button type="button" class="btn-ghost" data-commerce-close="shop-customer-modal">Inchide</button><button type="button" class="btn-primary" id="shop-customer-status">Dezactiveaza contul</button></footer></section></div>`;
  }
  function promotionModal() {
    return `<div class="shop-commerce-overlay" id="shop-promotion-modal" hidden><form class="shop-commerce-modal shop-promotion-modal" id="shop-promotion-form"><header><div><small>PROMOTII G-TROTS</small><h2 id="shop-promotion-title">Reducere noua</h2></div><button type="button" data-commerce-close="shop-promotion-modal">×</button></header><div class="shop-commerce-modal-scroll">
      <div class="shop-commerce-columns"><label>Cod reducere *<input id="shop-promotion-code" maxlength="80" placeholder="GTROTS10" required /></label><label>Titlu *<input id="shop-promotion-name" maxlength="180" required /></label></div>
      <label>Descriere<textarea id="shop-promotion-description" rows="3" maxlength="800"></textarea></label>
      <div class="shop-commerce-columns three"><label>Tip reducere<select id="shop-promotion-type"><option value="percent">Procent (%)</option><option value="fixed">Suma fixa (lei)</option></select></label><label>Valoare *<input id="shop-promotion-value" type="number" min="0.01" step="0.01" required /></label><label>Comanda minima<input id="shop-promotion-minimum" type="number" min="0" step="0.01" placeholder="Fara prag" /></label></div>
      <div class="shop-commerce-columns"><label>Cine beneficiaza<select id="shop-promotion-audience"><option value="all">Toti utilizatorii</option><option value="registered">Doar utilizatorii inregistrati</option><option value="selected">Clienti selectati</option></select></label><label>Unde se aplica<select id="shop-promotion-scope"><option value="global">Toata comanda</option><option value="product">Produse selectate</option></select></label></div>
      <section id="shop-promotion-customer-wrap" class="shop-promotion-product-picker shop-promotion-customer-picker" hidden>
        <header><div><b>Clienti eligibili</b><small id="shop-promotion-customer-count">0 selectati</small></div><div class="shop-promotion-product-actions"><button type="button" id="shop-promotion-customer-all">Selecteaza toti clientii</button><button type="button" id="shop-promotion-customer-results-all" hidden>Selecteaza rezultatele</button></div></header>
        <label class="shop-promotion-product-search"><span>⌕</span><input id="shop-promotion-customer-search" type="search" placeholder="Cauta dupa nume, e-mail sau telefon" autocomplete="off" /></label>
        <div id="shop-promotion-customer-selected" class="shop-promotion-product-selected"></div>
        <div id="shop-promotion-customer-results" class="shop-promotion-product-results"><p class="shop-promotion-product-empty">Cauta un client sau selecteaza toate conturile.</p></div>
      </section>
      <button type="button" id="shop-promotion-product-shortcut" class="shop-promotion-product-shortcut"><span>%</span><b>Alege produse din catalog</b><small>Caută instant după nume sau cod. Catalogul nu se încarcă în fundal.</small><i>›</i></button>
      <label>Limita de utilizare<select id="shop-promotion-usage"><option value="unlimited">Fara limita de aplicari</option><option value="once_per_customer">O singura data per utilizator</option><option value="once_per_device">O singura data per dispozitiv</option></select></label>
      <section id="shop-promotion-product-wrap" class="shop-promotion-product-picker" hidden>
        <header><div><b>Produse incluse</b><small id="shop-promotion-product-count">0 selectate</small></div><div class="shop-promotion-product-actions"><button type="button" id="shop-promotion-product-all">Selecteaza toate produsele</button><button type="button" id="shop-promotion-product-results-all" hidden>Selecteaza rezultatele</button></div></header>
        <label class="shop-promotion-product-search"><span>⌕</span><input id="shop-promotion-product-search" type="search" placeholder="Cauta dupa nume sau cod produs" autocomplete="off" /></label>
        <div id="shop-promotion-product-selected" class="shop-promotion-product-selected"></div>
        <div id="shop-promotion-product-results" class="shop-promotion-product-results"><p class="shop-promotion-product-empty">Scrie numele sau codul produsului. Rezultatele apar pe măsură ce scrii.</p></div>
      </section>
      <div class="shop-commerce-columns"><label>Incepe la<input id="shop-promotion-from" type="datetime-local" /></label><label>Se termina la<input id="shop-promotion-until" type="datetime-local" /></label></div>
      <label>Text in bara site-ului<input id="shop-promotion-banner" maxlength="220" placeholder="Oferta speciala G-Trots" /></label>
      <div class="shop-editor-toggles"><label><span><b>Reducere activa</b><small>Poate fi folosita in perioada configurata.</small></span><input id="shop-promotion-active" type="checkbox" checked /></label><label><span><b>Aplicare automata</b><small>Se aplica fara introducerea codului.</small></span><input id="shop-promotion-auto" type="checkbox" checked /></label><label><span><b>Afiseaza in bara site-ului</b><small>Anuntul apare deasupra meniului magazinului.</small></span><input id="shop-promotion-show-banner" type="checkbox" checked /></label></div>
    </div><footer><button type="button" class="btn-ghost" data-commerce-close="shop-promotion-modal">Renunta</button><button type="submit" class="btn-primary" id="shop-promotion-save">Salveaza reducerea</button></footer></form></div>`;
  }
  function promotionStatsModal() {
    return `<div class="shop-commerce-overlay" id="shop-promotion-stats-modal" hidden><section class="shop-commerce-modal shop-promotion-stats-modal"><header><div><small>REZULTATE CAMPANIE</small><h2 id="shop-promotion-stats-title">Reducere</h2></div><button type="button" data-commerce-close="shop-promotion-stats-modal">×</button></header><div class="shop-commerce-modal-scroll" id="shop-promotion-stats-content"><div class="shop-commerce-loading">Se incarca statisticile...</div></div><footer><button type="button" class="btn-ghost" data-commerce-close="shop-promotion-stats-modal">Inchide</button><button type="button" class="btn-primary" id="shop-promotion-stats-edit">Editeaza reducerea</button></footer></section></div>`;
  }
  function companyModal() {
    return `<div class="shop-commerce-overlay" id="shop-company-modal" hidden><form class="shop-commerce-modal shop-company-modal" id="shop-company-form"><header><div><small>DATELE FIRMEI</small><h2 id="shop-company-title">Firma noua</h2></div><button type="button" data-commerce-close="shop-company-modal">×</button></header><div class="shop-commerce-modal-scroll">
      ${section('01', 'Identitate juridica', 'Datele oficiale ale societatii si numele folosit comercial.')}
      <div class="shop-commerce-columns"><label>Denumire legala *<input id="shop-company-legal-name" required /></label><label>Nume comercial<input id="shop-company-trade-name" placeholder="G-Trots Romania" /></label></div>
      <div class="shop-commerce-columns"><label>CUI / CIF<input id="shop-company-cui" /></label><label>Registrul comertului<input id="shop-company-registration" /></label></div>
      <div class="shop-editor-toggles"><label><span><b>Firma implicita</b><small>Este folosita automat pe documente si comenzi.</small></span><input id="shop-company-default" type="checkbox" /></label><label><span><b>Platitoare de TVA</b><small>Societate inregistrata in scopuri de TVA.</small></span><input id="shop-company-vat" type="checkbox" /></label></div>
      <label id="shop-company-vat-rate-wrap" class="shop-company-vat-rate">Cota TVA aplicata (%)<input id="shop-company-vat-rate" type="number" min="0" max="100" step="0.01" value="19" /><small>TVA-ul este inclus in pretul final si va fi evidentiat separat in cos, checkout, comenzi si e-mailuri.</small></label>
      ${section('02', 'Sediu si contact', 'Adresa completa si datele publice de contact.')}
      <label>Adresa completa<input id="shop-company-address" /></label><div class="shop-commerce-columns three"><label>Localitate<input id="shop-company-city" /></label><label>Judet<input id="shop-company-county" /></label><label>Cod postal<input id="shop-company-postal" /></label></div>
      <div class="shop-commerce-columns three"><label>Tara<input id="shop-company-country" value="Romania" /></label><label>E-mail<input id="shop-company-email" type="email" /></label><label>Telefon<input id="shop-company-phone" /></label></div><label>Website<input id="shop-company-website" placeholder="https://g-trots.ro" /></label>
      ${section('03', 'Date bancare', 'Informatii folosite in documentele financiare.')}
      <div class="shop-commerce-columns"><label>Banca<input id="shop-company-bank" /></label><label>IBAN<input id="shop-company-iban" /></label></div><label>Capital social<input id="shop-company-capital" /></label>
      ${section('04', 'Stampila firmei', 'Imaginea poate fi folosita pe documentele generate.')}
      <div class="shop-company-stamp"><div id="shop-company-stamp-preview"><span>Fara stampila</span></div><div><input id="shop-company-stamp-input" type="file" accept="image/png,image/jpeg,image/webp" hidden /><button type="button" class="btn-ghost" id="shop-company-stamp-pick">Alege stampila</button><button type="button" class="btn-ghost danger" id="shop-company-stamp-remove">Sterge stampila</button></div></div>
    </div><footer><button type="button" class="btn-ghost" data-commerce-close="shop-company-modal">Renunta</button><button type="submit" class="btn-primary" id="shop-company-save">Salveaza firma</button></footer></form></div>`;
  }
  function section(number, title, text) { return `<div class="shop-editor-section"><b>${number}</b><span><strong>${title}</strong><small>${text}</small></span></div>`; }

  function mountNirStornoInvoiceFields() {
    const documentCard = document.querySelector('#shop-nir-reverse-dialog .shop-nir-delete-document');
    if (!documentCard || $('shop-nir-storno-original-invoice')) return;
    documentCard.insertAdjacentHTML('afterend', `<section class="shop-nir-storno-original" aria-label="Factura originală"><small>FACTURĂ ORIGINALĂ</small><strong id="shop-nir-storno-original-invoice">—</strong><span><b id="shop-nir-storno-original-date">Data —</b><b id="shop-nir-storno-original-value">Valoare —</b></span></section><section class="shop-nir-storno-invoice" aria-labelledby="shop-nir-storno-invoice-title"><header><span><small>FACTURĂ NOUĂ DE STORNO</small><strong id="shop-nir-storno-invoice-title">Completează documentul primit de la furnizor</strong></span><em>DATE OBLIGATORII</em></header><div><label><span id="shop-nir-storno-invoice-series-label">Serie factură storno</span><input id="shop-nir-storno-invoice-series" maxlength="80" autocomplete="off" placeholder="Ex: FT" /></label><label><span>Număr factură storno *</span><input id="shop-nir-storno-invoice-number" maxlength="120" autocomplete="off" placeholder="Ex: 191" /></label><label><span>Data facturii storno *</span><input id="shop-nir-storno-invoice-date" type="date" /></label></div><small id="shop-nir-storno-invoice-error" hidden>Completează datele obligatorii ale facturii de storno.</small></section><section class="shop-nir-storno-documents"><header><span><small>DOCUMENTELE FACTURII</small><strong>Atașează factura de storno și fișierele primite</strong></span><button type="button" id="shop-nir-storno-files-pick">Alege documente</button></header><div id="shop-nir-storno-file-list" class="shop-nir-storno-file-list"><p>PDF · JPG · PNG · WEBP · XLSX · XML</p></div></section>`);
  }

  function wire() {
    mountNirStornoInvoiceFields();
    const loaders = { 'shop-dashboard': loadDashboard, 'shop-products': loadProducts, 'shop-orders': loadOrders, 'shop-inventory': loadInventory, 'shop-sources': loadSourcesPage, 'shop-suppliers': loadSuppliers, 'shop-nirs': loadNirs, 'shop-payments': loadPayments, 'shop-shipping': loadShippingPage, 'shop-customers': loadCustomers, 'shop-discounts': loadPromotions, 'shop-company': loadCompanies };
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
    document.querySelectorAll('[data-commerce-refresh]').forEach(button => button.addEventListener('click', () => ({ 'shop-products-content': loadProducts, 'shop-orders-content': loadOrders, 'shop-inventory-content': loadInventory, 'shop-sources-content': loadSourcesPage, 'shop-suppliers-content': loadSuppliers, 'shop-nirs-content': loadNirs, 'shop-shipping-content': loadShippingPage, 'shop-customers-content': loadCustomers, 'shop-discounts-content': loadPromotions, 'shop-company-content': loadCompanies })[button.dataset.commerceRefresh]?.()));
    document.querySelectorAll('[data-commerce-add]').forEach(button => button.addEventListener('click', () => ({ 'shop-products-content': openProduct, 'shop-sources-content': openSource, 'shop-suppliers-content': openSupplier, 'shop-nirs-content': createNir, 'shop-shipping-content': openShipping, 'shop-discounts-content': openPromotion, 'shop-company-content': openCompany })[button.dataset.commerceAdd]?.()));
    document.addEventListener('click', event => {
      const trigger = event.target.closest('[data-shop-order-filter]');
      if (!trigger) return;
      state.orderStatusFilter = trigger.dataset.shopOrderFilter || 'all';
      state.pages.orders = 1;
    });
    $('shop-product-form').addEventListener('submit', saveProduct);
    $('shop-order-form').addEventListener('submit', saveOrder);
    $('shop-stock-form').addEventListener('submit', saveStock);
    $('shop-source-form').addEventListener('submit', saveSource);
    $('shop-supplier-form').addEventListener('submit', saveSupplier);
    $('shop-nir-save').addEventListener('click', () => void saveNir());
    $('shop-nir-confirm').addEventListener('click', () => void confirmNir());
    $('shop-nir-correct').addEventListener('click', () => void handleNirCorrectionAction());
    $('shop-nir-delete').addEventListener('click', openNirDeleteDialog);
    $('shop-nir-delete-cancel').addEventListener('click', closeNirDeleteDialog);
    $('shop-nir-delete-confirm').addEventListener('click', () => void deleteNir());
    $('shop-nir-reverse-trigger').addEventListener('click', openNirReverseDialog);
    $('shop-nir-reverse-cancel').addEventListener('click', () => closeModal('shop-nir-reverse-dialog'));
    $('shop-nir-reverse-confirm').addEventListener('click', () => void reverseNir());
    $('shop-nir-storno-all').addEventListener('click', toggleAllNirStornoLines);
    $('shop-nir-storno-files-pick').addEventListener('click', () => $('shop-nir-storno-files').click());
    $('shop-nir-storno-files').addEventListener('change', importNirStornoFiles);
    const stornoDropzone = $('shop-nir-storno-file-list');
    stornoDropzone.addEventListener('click', event => { if (!event.target.closest('button')) $('shop-nir-storno-files').click(); });
    stornoDropzone.addEventListener('dragover', event => { event.preventDefault(); stornoDropzone.classList.add('dragging'); });
    stornoDropzone.addEventListener('dragleave', event => { if (!stornoDropzone.contains(event.relatedTarget)) stornoDropzone.classList.remove('dragging'); });
    stornoDropzone.addEventListener('drop', event => { event.preventDefault(); stornoDropzone.classList.remove('dragging'); importNirStornoFiles({ target: { files: event.dataTransfer?.files || [], value: '' } }); });
    $('shop-nir-reverse-reason').addEventListener('input', () => {
      $('shop-nir-reverse-reason').classList.remove('invalid');
      $('shop-nir-reverse-error').hidden = true;
    });
    ['shop-nir-storno-invoice-series', 'shop-nir-storno-invoice-number', 'shop-nir-storno-invoice-date'].forEach(id => {
      const field = $(id);
      const clearError = () => {
        field.classList.remove('invalid');
        $('shop-nir-storno-invoice-error').hidden = true;
      };
      field.addEventListener('input', clearError);
      field.addEventListener('change', clearError);
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (!$('shop-nir-delete-dialog')?.hidden) { event.preventDefault(); closeNirDeleteDialog(); return; }
      if (!$('shop-nir-reverse-dialog')?.hidden) { event.preventDefault(); closeModal('shop-nir-reverse-dialog'); }
    });
    $('shop-nir-export-pdf').addEventListener('click', () => void exportNir('pdf'));
    $('shop-nir-export-xlsx').addEventListener('click', () => void exportNir('xlsx'));
    $('shop-nir-files').addEventListener('change', importNirFiles);
    $('shop-nir-product-search').addEventListener('input', event => {
      clearTimeout(state.nirProductSearchTimer);
      state.nirProductSearchTimer = setTimeout(() => void searchNirProducts(event.target.value), 180);
    });
    $('shop-shipping-form').addEventListener('submit', saveShipping);
    $('shop-promotion-form').addEventListener('submit', savePromotion);
    $('shop-company-form').addEventListener('submit', saveCompany);
    $('shop-company-stamp-pick').addEventListener('click', () => $('shop-company-stamp-input').click());
    $('shop-company-stamp-input').addEventListener('change', readCompanyStamp);
    $('shop-company-stamp-remove').addEventListener('click', removeCompanyStamp);
    $('shop-company-vat').addEventListener('change', updateCompanyVatVisibility);
    $('shop-promotion-scope').addEventListener('change', updatePromotionProductVisibility);
    $('shop-promotion-audience').addEventListener('change', updatePromotionCustomerVisibility);
    $('shop-promotion-product-shortcut').addEventListener('click', () => { $('shop-promotion-scope').value = 'product'; updatePromotionProductVisibility(); setTimeout(() => $('shop-promotion-product-search').focus(), 30); });
    $('shop-promotion-product-search').addEventListener('input', event => {
      state.promotionProductQuery = event.target.value;
      clearTimeout(state.promotionProductSearchTimer);
      renderPromotionProductPicker();
      const query = state.promotionProductQuery.trim();
      if (!query) return;
      state.promotionProductSearchTimer = setTimeout(() => void ensurePromotionProducts(query, [...state.promotionSelectedProductIds]), 170);
    });
    $('shop-promotion-product-results-all').addEventListener('click', () => {
      const query = state.promotionProductQuery.trim().toLocaleLowerCase('ro');
      const results = promotionProductsSorted().filter(product => query && (String(product.name || '') + ' ' + String(product.sku || '') + ' ' + String(product.supplier_product_code || '')).toLocaleLowerCase('ro').includes(query));
      results.forEach(product => state.promotionSelectedProductIds.add(product.id));
      renderPromotionProductPicker();
    });
    $('shop-promotion-product-all').addEventListener('click', toggleAllPromotionProducts);
    $('shop-promotion-customer-all').addEventListener('click', toggleAllPromotionCustomers);
    $('shop-promotion-customer-search').addEventListener('input', event => { state.promotionCustomerQuery = event.target.value; renderPromotionCustomerPicker(); });
    $('shop-promotion-customer-results-all').addEventListener('click', () => { promotionCustomerMatches().forEach(customer => state.promotionSelectedCustomerIds.add(customer.id)); renderPromotionCustomerPicker(); });
    $('shop-promotion-stats-edit').addEventListener('click', () => { const id = $('shop-promotion-stats-edit').dataset.id; if (!id) return; closeModal('shop-promotion-stats-modal'); setTimeout(() => openPromotion(id), 190); });
    $('shop-customer-status').addEventListener('click', toggleCustomerStatus);
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
    $('shop-product-source').addEventListener('change', () => { updateStockInputs(); updateProductPreview(); });
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

  function openModal(id) {
    const modal = $(id); if (!modal) return;
    const opened = [...document.querySelectorAll('.shop-commerce-overlay.visible')].filter(item => item !== modal);
    modal.style.zIndex = String(750 + opened.length + 1);
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('visible'));
  }
  function closeModal(id) {
    if (id === 'shop-nir-reverse-dialog') {
      if (state.nirReversing) return;
      if ($('shop-nir-reverse-reason')) $('shop-nir-reverse-reason').value = '';
      $('shop-nir-reverse-reason')?.classList.remove('invalid');
      if ($('shop-nir-reverse-error')) $('shop-nir-reverse-error').hidden = true;
      if ($('shop-nir-storno-selection-error')) $('shop-nir-storno-selection-error').hidden = true;
      ['shop-nir-storno-invoice-series', 'shop-nir-storno-invoice-number', 'shop-nir-storno-invoice-date'].forEach(fieldId => {
        if ($(fieldId)) $(fieldId).value = '';
        $(fieldId)?.classList.remove('invalid');
      });
      if ($('shop-nir-storno-invoice-error')) $('shop-nir-storno-invoice-error').hidden = true;
      if ($('shop-nir-storno-lines')) $('shop-nir-storno-lines').innerHTML = '';
      state.nirStornoPendingFiles = [];
      renderNirStornoFiles();
    }
    if (id === 'shop-nir-modal' && state.nirCorrectionOriginal) {
      if (state.nirSaving || state.nirSavePromise) return toast('Așteaptă finalizarea corectării înainte să închizi.', 'error');
      const leave = confirm('Sigur vrei să ieși?\n\nModificările nu se salvează, iar NIR-ul rămâne confirmat exact cum era înainte.');
      if (!leave) return;
      state.nirEditor = JSON.parse(JSON.stringify(state.nirCorrectionOriginal));
      state.nirCorrectionOriginal = null;
      state.nirPendingFiles = [];
      state.nirEditRevision = 0;
    } else if (id === 'shop-nir-modal' && state.nirEditor?.status === 'draft' && state.nirEditRevision > 0) {
      const leave = confirm('Există modificări nesalvate.\n\nDacă închizi acum, datele introduse după ultima salvare vor fi eliminate. Nimic nu se salvează în fundal.');
      if (!leave) return;
    }
    const modal = $(id);
    modal?.classList.remove('visible');
    setTimeout(() => { if (modal && !modal.classList.contains('visible')) { modal.hidden = true; modal.classList.remove('over-order'); modal.style.zIndex = ''; } }, 180);
  }

  function openStripeSyncProgress() {
    document.getElementById('stripe-sync-progress')?.remove();
    const startedAt = Date.now();
    const overlay = document.createElement('div');
    overlay.id = 'stripe-sync-progress';
    overlay.className = 'stripe-sync-progress-overlay';
    overlay.innerHTML = `<section class="stripe-sync-progress-card" role="dialog" aria-modal="true" aria-labelledby="stripe-sync-progress-title">
      <div class="stripe-sync-progress-orb" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5M6.1 9a7 7 0 0 1 11.6-2.6L20 9M4 15l2.3 2.6A7 7 0 0 0 17.9 15"/></svg><i></i></div>
      <span class="stripe-sync-progress-kicker">CATALOG STRIPE</span>
      <h2 id="stripe-sync-progress-title">Sincronizam catalogul</h2>
      <p data-sync-status>Pregatim produsele si conexiunea securizata...</p>
      <div class="stripe-sync-progress-track"><i data-sync-progress-fill></i></div>
      <div class="stripe-sync-progress-numbers"><span data-sync-count>Se pregateste...</span><strong data-sync-percent>0%</strong></div>
      <div class="stripe-sync-progress-stats"><span><b data-sync-synced>0</b><small>sincronizate</small></span><span><b data-sync-archived>0</b><small>arhivate</small></span><span><b data-sync-errors>0</b><small>erori</small></span></div>
      <small class="stripe-sync-progress-elapsed" data-sync-elapsed>Timp scurs 00:00 · lasa aplicatia deschisa</small>
      <button type="button" data-sync-close hidden>Inchide</button>
    </section>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
    const elapsed = overlay.querySelector('[data-sync-elapsed]');
    const timer = setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      elapsed.textContent = `Timp scurs ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')} · lasa aplicatia deschisa`;
    }, 1000);
    const close = () => {
      clearInterval(timer);
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 220);
    };
    overlay.querySelector('[data-sync-close]').addEventListener('click', close);
    return {
      update(progress) {
        const percent = Number(progress.percent || 0);
        overlay.querySelector('[data-sync-progress-fill]').style.width = `${Math.max(3, percent)}%`;
        overlay.querySelector('[data-sync-percent]').textContent = `${percent}%`;
        overlay.querySelector('[data-sync-count]').textContent = progress.total ? `${progress.processed} din ${progress.total} produse` : 'Se pregateste...';
        overlay.querySelector('[data-sync-synced]').textContent = Number(progress.synced || 0);
        overlay.querySelector('[data-sync-archived]').textContent = Number(progress.archived || 0);
        overlay.querySelector('[data-sync-errors]').textContent = Number(progress.errors?.length || 0);
        overlay.querySelector('[data-sync-status]').textContent = percent < 75 ? 'Actualizam produsele, imaginile si preturile...' : 'Verificam ultimele produse si inchidem sincronizarea...';
      },
      complete(summary) {
        overlay.classList.add('is-complete');
        overlay.querySelector('[data-sync-status]').textContent = `Gata · ${Number(summary.synced || 0)} produse sincronizate.`;
        overlay.querySelector('[data-sync-progress-fill]').style.width = '100%';
        overlay.querySelector('[data-sync-percent]').textContent = '100%';
        clearInterval(timer);
      },
      fail(message) {
        overlay.classList.add('is-error');
        overlay.querySelector('[data-sync-status]').textContent = message;
        overlay.querySelector('[data-sync-close]').hidden = false;
        clearInterval(timer);
      },
      close,
    };
  }
  async function metadata() {
    [state.categories, state.brands, state.manufacturers, state.sources] = await Promise.all([window.SHOP_API.listCategories(), window.SHOP_API.listBrands(), window.SHOP_API.listManufacturers(), window.SHOP_API.listProductSources()]);
  }
  function loading(id, text) { $(id).innerHTML = `<div class="shop-commerce-loading">${esc(text)}</div>`; }
  function failure(id, error) { $(id).innerHTML = `<div class="shop-commerce-error">${esc(error.message || 'Datele nu au putut fi incarcate.')}</div>`; }
  function pageData(items, key, pageSizeOptions = PAGE_SIZE_OPTIONS) {
    const pageSize = pageSizeOptions.includes(state.pageSizes[key]) ? state.pageSizes[key] : pageSizeOptions[0];
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    const page = Math.min(Math.max(1, state.pages[key] || 1), pageCount);
    state.pages[key] = page;
    state.pageSizes[key] = pageSize;
    return { page, pageCount, pageSize, items: items.slice((page - 1) * pageSize, page * pageSize) };
  }
  function pagination(key, total, page, pageCount, pageSize, pageSizeOptions = PAGE_SIZE_OPTIONS) {
    if (!total) return '';
    const first = (page - 1) * pageSize + 1;
    const last = Math.min(total, page * pageSize);
    const selectId = `shop-${key}-page-size`;
    const options = pageSizeOptions.map(value => `<option value="${value}" ${value === pageSize ? 'selected' : ''}>${value}</option>`).join('');
    const chevron = direction => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${direction === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'}"/></svg>`;
    return `<nav class="shop-commerce-pagination" aria-label="Paginare"><div class="shop-commerce-page-size"><label for="${selectId}">Randuri pe pagina:</label><span><select id="${selectId}" data-page-size-key="${key}" aria-label="Randuri pe pagina">${options}</select><i aria-hidden="true">⌄</i></span></div><span class="shop-commerce-pagination-range" aria-live="polite">${first}–${last} din ${total}</span><div class="shop-commerce-pagination-arrows"><button type="button" data-page-key="${key}" data-page="${page - 1}" aria-label="Pagina anterioara" title="Pagina anterioara" ${page === 1 ? 'disabled' : ''}>${chevron('left')}</button><button type="button" data-page-key="${key}" data-page="${page + 1}" aria-label="Pagina urmatoare" title="Pagina urmatoare" ${page === pageCount ? 'disabled' : ''}>${chevron('right')}</button></div></nav>`;
  }
  function bindPagination(containerId, key, render, pageSizeOptions = PAGE_SIZE_OPTIONS) {
    $(containerId).querySelectorAll(`[data-page-key="${key}"]`).forEach(button => button.addEventListener('click', () => { state.pages[key] = Number(button.dataset.page); render(); $(containerId).scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    $(containerId).querySelector(`[data-page-size-key="${key}"]`)?.addEventListener('change', event => {
      const pageSize = Number(event.target.value);
      if (!pageSizeOptions.includes(pageSize)) return;
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
      const recentNewOrders = (Array.isArray(dashboard.recent_orders) ? dashboard.recent_orders : []).filter(order => order.status === 'new');
      const dashboardPaymentLabels = { pending: 'În așteptare', paid: 'Plătită', failed: 'Eșuată', refunded: 'Rambursată' };
      const recent = recentNewOrders.map(order => {
        const paymentState = ['pending', 'paid', 'failed', 'refunded'].includes(order.payment_status) ? order.payment_status : 'pending';
        const paymentMethod = order.payment_method === 'card' ? 'Card online' : 'Ramburs';
        const paymentMethodClass = order.payment_method === 'card' ? 'card' : 'cash';
        return `<button type="button" class="shop-dashboard-order" data-dashboard-order-open="${esc(order.id)}"><span class="shop-dashboard-order-copy"><strong>${esc(order.order_number)}</strong><small>${esc(order.customer_name)} · ${esc(order.created_at)}</small><span class="shop-dashboard-order-payment"><i class="method ${paymentMethodClass}">${paymentMethod}</i><i class="state ${paymentState}"><b></b>${esc(dashboardPaymentLabels[paymentState])}</i></span></span><span class="shop-dashboard-order-total"><b>${money(order.total)}</b><em class="new">${esc(statusLabels[order.status] || order.status)}</em></span></button>`;
      }).join('') || '<p class="shop-dashboard-empty">Nu există comenzi noi.</p>';
      const quickActions = [
        { target: 'shop-products', tone: 'orange', title: 'Produse', description: 'Adaugă sau editează catalogul.', icon: '<svg viewBox="0 0 24 24"><path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z"/><path d="m4 12 8 4.5 8-4.5M4 16.5l8 4.5 8-4.5"/></svg>' },
        { target: 'shop-orders', tone: 'blue', title: 'Comenzi', description: 'Verifică și procesează comenzile.', icon: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6m-6 4h6"/></svg>', filter: 'all' },
        { target: 'shop-payments', tone: 'purple', title: 'Metode de plată', description: 'Configurează cardul online și rambursul.', icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/></svg>' },
      ].map(action => `<button type="button" class="${action.tone}" data-shop-open="${action.target}" ${action.filter ? `data-shop-order-filter="${action.filter}"` : ''}><span>${action.icon}</span><strong>${action.title}</strong><small>${action.description}</small><b>Deschide <i>→</i></b></button>`).join('');
      host.innerHTML = `<section class="shop-dashboard-hero"><div><span>DASHBOARD COMERCIAL</span><h1>Magazinul tau, pe scurt.</h1><p>Vanzari, comenzi, achizitii si profit sincronizate direct cu magazinul online.</p><b><i></i>Date sincronizate cu baza de date</b></div><div class="shop-dashboard-orbit" aria-hidden="true"><strong>↗</strong><span>${Number(dashboard.new_orders_count || 0)}</span><small>COMENZI NOI</small></div></section><section class="shop-dashboard-metrics">${dashboardMetric('Vanzari', money(dashboard.revenue), '#38bdf8')}${dashboardMetric('Comenzi', dashboard.orders_count, '#a78bfa')}${dashboardMetric('Achizitii', money(dashboard.acquisitions), '#f59e0b')}${dashboardMetric('Profit', money(dashboard.profit), '#22c55e')}</section><section class="shop-dashboard-columns"><div><div class="shop-section-head"><div><span>ACTIUNI RAPIDE</span><h2>Administreaza magazinul</h2></div></div><div class="shop-dashboard-actions">${quickActions}</div></div><div><div class="shop-section-head"><div><span>ACTIVITATE RECENTA</span><h2>Ultimele comenzi</h2></div><button type="button" class="shop-dashboard-see-all" data-shop-open="shop-orders" data-shop-order-filter="new">Vezi toate <b>→</b></button></div><div class="shop-dashboard-orders">${recent}</div></div></section>`;
      host.querySelectorAll('[data-dashboard-order-open]').forEach(button => button.addEventListener('click', async () => {
        state.orderStatusFilter = 'new';
        state.pages.orders = 1;
        window.switchTab('shop-orders');
        await loadOrders();
        await openOrder(button.dataset.dashboardOrderOpen);
      }));
    } catch (error) {
      host.innerHTML = `<div class="shop-commerce-error">${esc(error.message || 'Dashboardul nu a putut fi incarcat.')}</div>`;
    }
  }
  function dashboardMetric(label, value, color) { return `<article style="--metric:${color}"><i></i><small>${esc(label)}</small><strong>${esc(value)}</strong></article>`; }

  async function loadProducts(options = {}) {
    const requestId = ++state.productLoadRequestId;
    const searchInput = $('shop-products-search');
    const restoreSearchFocus = options.preserveSearchFocus === true && document.activeElement === searchInput;
    const selectionStart = options.selectionStart ?? searchInput?.selectionStart ?? state.productQuery.length;
    const selectionEnd = options.selectionEnd ?? searchInput?.selectionEnd ?? selectionStart;
    if (!options.preserveSearchFocus) loading('shop-products-content', 'Se incarca produsele...');
    try {
      const bootstrap = await window.SHOP_API.loadProductManager({ page: state.pages.products, page_size: state.pageSizes.products, q: state.productQuery, include_metadata: !state.categories.length });
      if (requestId !== state.productLoadRequestId) return;
      state.products = Array.isArray(bootstrap.products) ? bootstrap.products : [];
      state.productTotal = Number(bootstrap.total ?? state.products.length);
      state.pages.products = Number(bootstrap.page || state.pages.products || 1);
      if (bootstrap.categories?.length) state.categories = bootstrap.categories;
      if (bootstrap.brands?.length) state.brands = bootstrap.brands;
      if (bootstrap.manufacturers?.length) state.manufacturers = bootstrap.manufacturers;
      if (bootstrap.sources?.length) state.sources = bootstrap.sources;
      renderProducts({ restoreSearchFocus, selectionStart, selectionEnd });
    } catch (error) { if (requestId === state.productLoadRequestId) failure('shop-products-content', error); }
  }
  function renderProducts(options = {}) {
    const pageCount = Math.max(1, Math.ceil(state.productTotal / state.pageSizes.products));
    const rows = state.products.map(product => `<tr data-product-open="${product.id}"><td>${productPicture(product.images?.[0])}</td><td><strong>${esc(product.name)}</strong><small>/${esc(product.slug)}</small><em>${esc(product.sku || 'Fara SKU')} · ${esc(product.source_domain)}</em></td><td><b>${money(product.sale_price ?? product.price)}</b>${product.sale_price ? `<small class="old">${money(product.price)}</small>` : ''}</td><td>${stockBadge(product)}</td><td>${product.is_active ? '<span class="commerce-pill active">ACTIV</span>' : '<span class="commerce-pill inactive">INACTIV</span>'}</td><td><button class="commerce-icon edit" data-product-edit="${product.id}" title="Editeaza" aria-label="Editeaza produsul"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button class="commerce-icon delete" data-product-delete="${product.id}" title="Sterge" aria-label="Sterge produsul"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6"/></svg></button></td></tr>`).join('');
    const host = $('shop-products-content');
    const results = rows ? `<div class="shop-commerce-table-wrap"><table class="shop-commerce-table products"><thead><tr><th>Poza</th><th>Produs</th><th>Pret</th><th>Stoc</th><th>Status</th><th>Actiuni</th></tr></thead><tbody>${rows}</tbody></table></div>${pagination('products', state.productTotal, state.pages.products, pageCount, state.pageSizes.products)}` : empty('Niciun produs relevant', 'Incearca un termen apropiat, un cod, o marca sau o compatibilitate.');
    if (!host.querySelector('#shop-products-search') || !host.querySelector('#shop-products-results')) {
      host.innerHTML = `<div class="shop-commerce-tools shop-products-tools"><div><b>${state.productTotal}</b><span>${state.productQuery ? 'rezultate relevante' : 'produse gasite'}</span></div><input id="shop-products-search" type="search" autocomplete="off" spellcheck="false" value="${esc(state.productQuery)}" placeholder="Caută semantic după nume, cod, model sau compatibilitate..." /></div><div id="shop-products-results">${results}</div>`;
    } else {
      const tools = host.querySelector('.shop-products-tools');
      tools.querySelector('b').textContent = String(state.productTotal);
      tools.querySelector('span').textContent = state.productQuery ? 'rezultate relevante' : 'produse gasite';
      const currentSearch = $('shop-products-search');
      if (document.activeElement !== currentSearch) currentSearch.value = state.productQuery;
      host.querySelector('#shop-products-results').innerHTML = results;
    }
    $('shop-products-content').querySelectorAll('[data-product-edit]').forEach(button => button.addEventListener('click', () => openProduct(button.dataset.productEdit)));
    $('shop-products-content').querySelectorAll('[data-product-delete]').forEach(button => button.addEventListener('click', () => deleteProduct(button.dataset.productDelete)));
    $('shop-products-content').querySelectorAll('[data-product-open]').forEach(row => row.addEventListener('click', event => { if (!event.target.closest('button')) openProductDetail(row.dataset.productOpen); }));
    const productSearch = $('shop-products-search');
    wireKeyboardInputRecovery(productSearch);
    if (productSearch && !productSearch.dataset.searchBound) productSearch.addEventListener('input', event => {
      const input = event.currentTarget;
      state.productQuery = input.value;
      state.pages.products = 1;
      state.productLoadRequestId += 1;
      clearTimeout(state.productSearchTimer);
      const selectionStart = input.selectionStart ?? state.productQuery.length;
      const selectionEnd = input.selectionEnd ?? selectionStart;
      state.productSearchTimer = setTimeout(() => void loadProducts({ preserveSearchFocus: true, selectionStart, selectionEnd }), state.productQuery.trim() ? 260 : 0);
    });
    if (productSearch) productSearch.dataset.searchBound = 'true';
    if (options.restoreSearchFocus) requestAnimationFrame(() => {
      const nextInput = $('shop-products-search');
      if (!nextInput) return;
      nextInput.focus({ preventScroll: true });
      nextInput.setSelectionRange?.(Math.min(options.selectionStart ?? state.productQuery.length, state.productQuery.length), Math.min(options.selectionEnd ?? state.productQuery.length, state.productQuery.length));
    });
    bindPagination('shop-products-content', 'products', loadProducts);
  }
  function stockBadge(product) { if (product.stock_mode === 'unlimited') return '<span class="commerce-stock unlimited">NELIMITAT</span>'; const low = product.stock_quantity <= product.low_stock_threshold; return `<span class="commerce-stock ${low ? 'low' : ''}">${product.stock_quantity} BUC.${low ? ' · STOC MIC' : ''}</span>`; }

  async function openProductDetail(id, options = {}) {
    const detailModal = $('shop-product-detail-modal');
    const preserveLayer = !detailModal.hidden && detailModal.classList.contains('over-order');
    detailModal.classList.toggle('over-order', options.overOrder === true || (options.overOrder == null && preserveLayer));
    state.pages.productSales = 1;
    state.pages.productReviews = 1;
    state.pages.productPurchases = 1;
    $('shop-product-detail-title').textContent = 'Se incarca...';
    $('shop-product-detail-content').innerHTML = '<div class="shop-commerce-loading">Se incarca fisa produsului...</div>';
    openModal('shop-product-detail-modal');
    try {
      const [detail, supplierReferences, purchaseHistory] = await Promise.all([
        window.SHOP_API.getProductStats(id),
        window.SHOP_API.listProductSupplierReferences(id),
        window.SHOP_API.getProductPurchaseHistory(id).catch(() => ({ items: [], statistics: {} })),
      ]);
      detail.supplier_references = supplierReferences;
      detail.purchase_history = purchaseHistory;
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
    const salesPage = pageData(Array.isArray(detail.orders) ? detail.orders : [], 'productSales', PRODUCT_SALES_PAGE_SIZE_OPTIONS);
    const reviewsPage = pageData(Array.isArray(detail.reviews) ? detail.reviews : [], 'productReviews', [5]);
    const purchaseRows = Array.isArray(detail.purchase_history?.items) ? detail.purchase_history.items : [];
    const purchasesPage = pageData(purchaseRows, 'productPurchases', [5]);
    const orders = salesPage.items.map((order, index) => {
      const acquisitionPrice = Number(product.cost_price || 0);
      const salePrice = Number(order.unit_price || 0);
      const orderProfit = Number(order.line_total || 0) - (acquisitionPrice * Number(order.quantity || 0));
      return `<tr data-product-sale-order="${esc(order.id)}" style="--product-sale-index:${index}"><td><strong>${esc(order.order_number)}</strong><small>${esc(order.created_at)}</small><em>${esc(order.customer_name)}</em></td><td>${order.quantity} buc.</td><td><b>${money(acquisitionPrice)}</b><small>pe bucata</small></td><td><b>${money(salePrice)}</b><small>pe bucata</small></td><td><b class="shop-profit-value">${money(orderProfit)}</b><small>total comanda</small></td><td><span class="commerce-pill" style="--pill:${statusColors[order.status] || '#aaa'}">${esc(statusLabels[order.status] || order.status)}</span></td></tr>`;
    }).join('');
    const reviews = reviewsPage.items.map((review, index) => `<article class="shop-detail-review" style="--product-review-index:${index}"><header><div><strong>${esc(review.customer_name)}</strong><small>${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)} · ${esc(review.created_at)}</small></div><button type="button" class="danger" data-detail-review-delete="${review.id}">×</button></header><p>${esc(review.message)}</p><label>Raspunsul magazinului<textarea rows="3" data-detail-review-reply="${review.id}">${esc(review.admin_reply || '')}</textarea></label><button type="button" class="btn-primary" data-detail-review-save="${review.id}">Salveaza raspunsul</button></article>`).join('') || '<p class="shop-detail-empty">Produsul nu are inca recenzii.</p>';
    const soldUnits = Number(detail.units_sold || 0);
    const averageSalePrice = soldUnits ? Number(detail.revenue || 0) / soldUnits : 0;
    const averageAcquisitionPrice = soldUnits ? Number(detail.acquisition_total || 0) / soldUnits : 0;
    const averageProfit = soldUnits ? Number(detail.profit || 0) / soldUnits : 0;
    const reviewAverage = Number(product.review_average || 0);
    const numberedPagination = (key, total, page, pageCount, sectionId) => { const labels = { productReviews: 'recenzii', productSales: 'comenzi', productPurchases: 'achizitii' }; return `<nav class="shop-customer-pagination compact shop-product-detail-pagination" aria-label="Paginare"><button type="button" class="direction" data-product-detail-page="${page - 1}" data-product-detail-key="${key}" data-product-detail-section="${sectionId}" ${page === 1 ? 'disabled' : ''}>‹</button>${customerPaginationItems(pageCount, page).map(item => item === '…' ? '<span>…</span>' : `<button type="button" data-product-detail-page="${item}" data-product-detail-key="${key}" data-product-detail-section="${sectionId}" class="${item === page ? 'active' : ''}">${item}</button>`).join('')}<button type="button" class="direction" data-product-detail-page="${page + 1}" data-product-detail-key="${key}" data-product-detail-section="${sectionId}" ${page === pageCount ? 'disabled' : ''}>›</button><small>${total} ${labels[key] || 'inregistrari'}</small></nav>`; };
    const salesPagination = numberedPagination('productSales', detail.orders.length, salesPage.page, salesPage.pageCount, 'shop-product-sales-section');
    const reviewsPagination = numberedPagination('productReviews', detail.reviews.length, reviewsPage.page, reviewsPage.pageCount, 'shop-product-reviews-section');
    const purchasesPagination = numberedPagination('productPurchases', purchaseRows.length, purchasesPage.page, purchasesPage.pageCount, 'shop-product-purchases-section');
    const referencesBySupplier = new Map();
    const aliasesBySupplier = new Map();
    const addSupplierAlias = (key, type, rawValue) => {
      const value = String(rawValue || '').trim();
      if (!value) return;
      const aliases = aliasesBySupplier.get(key) || [];
      if (!aliases.some(alias => alias.type === type && alias.value.toLocaleLowerCase('ro-RO') === value.toLocaleLowerCase('ro-RO'))) aliases.push({ type, value });
      aliasesBySupplier.set(key, aliases);
    };
    (detail.supplier_references || []).forEach(reference => {
      const key = reference.supplier_id || String(reference.supplier_name || '').trim().toLocaleLowerCase('ro-RO');
      const current = referencesBySupplier.get(key);
      if (!current || reference.is_primary_for_supplier || (!current.last_confirmed_at && reference.last_confirmed_at)) referencesBySupplier.set(key, reference);
      (reference.aliases || []).forEach(alias => addSupplierAlias(key, alias.type, alias.value));
      addSupplierAlias(key, 'code', reference.supplier_product_code_original);
      addSupplierAlias(key, 'name', reference.supplier_product_name);
      addSupplierAlias(key, 'ean', reference.supplier_ean);
    });
    const purchasedSuppliers = new Map();
    (detail.purchase_history?.items || []).forEach(purchase => {
      const supplierName = String(purchase.supplier_name || '').trim() || 'Furnizor';
      const key = purchase.supplier_id || supplierName.toLocaleLowerCase('ro-RO');
      addSupplierAlias(key, 'code', purchase.supplier_code);
      addSupplierAlias(key, 'name', purchase.supplier_product_name);
      addSupplierAlias(key, 'ean', purchase.supplier_ean);
      const current = purchasedSuppliers.get(key);
      if (current) { current.purchase_count += 1; current.aliases = aliasesBySupplier.get(key) || current.aliases; return; }
      const reference = referencesBySupplier.get(key);
      purchasedSuppliers.set(key, { supplier_name: supplierName, is_active: reference?.is_active !== false, purchase_count: 1, last_confirmed_price_ron: purchase.inventory_unit_cost_ron || reference?.last_confirmed_price_ron || null, last_confirmed_at: purchase.reception_date || reference?.last_confirmed_at || null, aliases: aliasesBySupplier.get(key) || [] });
    });
    const supplierRows = purchasedSuppliers.size ? [...purchasedSuppliers.entries()].map(([key, value]) => value) : [...referencesBySupplier.entries()].map(([key, reference]) => ({ ...reference, purchase_count: reference.last_confirmed_at ? 1 : 0, aliases: aliasesBySupplier.get(key) || [] }));
    const references = supplierRows.map(reference => {
      const invoiceNames = (reference.aliases || []).filter(alias => alias.type === 'name').map(alias => alias.value);
      const supplierCodes = (reference.aliases || []).filter(alias => alias.type === 'code').map(alias => alias.value);
      const aliasSummary = [`Pe factura: ${invoiceNames.join(', ')}`, `Cod: ${supplierCodes.join(', ')}`].filter(part => !part.endsWith(': ')).join(' · ');
      return `<article class="shop-detail-supplier-ref supplier-only ${reference.is_active === false ? 'inactive' : ''}"><span class="shop-detail-ref-icon">${supplierIconSvg('building')}</span><div><span class="shop-detail-ref-head"><strong>${esc(reference.supplier_name || 'Furnizor')}</strong><b>CUMPARAT PRIN NIR</b></span><span class="shop-detail-ref-data"><small>${reference.purchase_count ? `${reference.purchase_count} ${reference.purchase_count === 1 ? 'receptie confirmata' : 'receptii confirmate'}` : 'Furnizor asociat produsului'}</small></span>${aliasSummary ? `<small class="shop-detail-ref-aliases">${esc(aliasSummary)}</small>` : ''}<em>${reference.last_confirmed_price_ron ? `Ultimul cost ${money(reference.last_confirmed_price_ron)}${reference.last_confirmed_at ? ` · ${esc(reference.last_confirmed_at)}` : ''}` : 'Fara cost confirmat'}</em></div></article>`;
    }).join('') || '<p class="shop-detail-empty">Produsul nu are furnizori in istoricul NIR.</p>';
    const history = purchasesPage.items.map(item => `<tr><td><strong>${esc(item.nir_number)}</strong><small>${esc(item.reception_date)}</small></td><td>${esc(item.supplier_name || '—')}</td><td>${esc(item.supplier_code || '—')}</td><td>${esc(item.stock_quantity)}</td><td>${money(item.unit_price)} ${esc(item.currency)}</td></tr>`).join('') || '<tr><td colspan="5">Nu exista achizitii confirmate.</td></tr>';
    $('shop-product-detail-content').innerHTML = `<div class="shop-detail-gallery">${gallery}</div><div class="shop-detail-metrics compact">${detailMetric('Total vânzări', money(detail.revenue))}${detailMetric('Preț vânzare mediu', money(averageSalePrice))}${detailMetric('Preț achiziție mediu', money(averageAcquisitionPrice))}${detailMetric('Profit mediu', money(averageProfit), true)}${detailMetric('Bucăți vândute', soldUnits)}${detailMetric('Vizualizări pe site', product.view_count)}${detailMetric('Număr recenzii', detail.reviews.length)}${detailMetric('Media recenziilor', reviewAverage ? `${reviewAverage.toFixed(1)} ★` : '—')}</div><div id="shop-product-sales-section">${section('01', 'Comenzi si vanzari', 'Istoricul comenzilor care contin acest produs.')}<div class="shop-commerce-table-wrap"><table class="shop-commerce-table shop-product-sales-table"><thead><tr><th>Numar comanda</th><th>Cantitate</th><th>Pret achizitie</th><th>Pret vanzare</th><th>Profit</th><th>Status</th></tr></thead><tbody>${orders || '<tr><td colspan="6">Produsul nu apare in nicio comanda.</td></tr>'}</tbody></table></div>${salesPagination}</div><div id="shop-product-reviews-section">${section('02', 'Recenzii', 'Raspunde clientilor sau sterge recenziile direct de aici.')}<div class="shop-detail-reviews">${reviews}</div>${reviewsPagination}</div>${section('03', 'Furnizori', 'Firmele de la care a fost sau poate fi cumparat acest produs.')}<div class="shop-detail-supplier-refs">${references}</div><div id="shop-product-purchases-section">${section('04', 'Istoric preturi de achizitie', 'Fiecare receptie confirmata pastreaza separat furnizorul, cantitatea si pretul platit.')}<div class="shop-commerce-table-wrap"><table class="shop-commerce-table"><thead><tr><th>NIR</th><th>Furnizor</th><th>Cod</th><th>Cantitate</th><th>Pret factura</th></tr></thead><tbody>${history}</tbody></table></div>${purchasesPagination}</div>`;
    $('shop-product-detail-content').querySelectorAll('[data-ref-primary],[data-ref-active]').forEach(button => button.addEventListener('click', async () => {
      const id = button.dataset.refPrimary || button.dataset.refActive;
      const reference = (detail.supplier_references || []).find(item => item.id === id);
      if (!reference) return;
      try {
        await window.SHOP_API.updateSupplierProductReference(id, button.dataset.refPrimary ? { row_version: reference.row_version, is_primary_for_supplier: true } : { row_version: reference.row_version, is_active: !reference.is_active });
        await openProductDetail(product.id);
      } catch (error) { toast(error.message || 'Asocierea nu a putut fi actualizata.', 'error'); }
    }));
    $('shop-product-detail-content').querySelectorAll('[data-product-detail-key]').forEach(button => button.addEventListener('click', () => {
      if (button.disabled) return;
      const key = button.dataset.productDetailKey;
      state.pages[key] = Number(button.dataset.productDetailPage || 1);
      const sectionId = button.dataset.productDetailSection;
      renderProductDetail();
      setTimeout(() => $(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    }));
    $('shop-product-detail-content').querySelectorAll('[data-product-sale-order]').forEach(row => row.addEventListener('click', () => { closeModal('shop-product-detail-modal'); setTimeout(() => openOrder(row.dataset.productSaleOrder), 190); }));
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
      fillSelect($('shop-product-source'), state.sources.filter(item => item.is_active || (product && item.id === product.source_id)), product?.source_id || '', item => `${item.name} · ${item.domain}${item.is_active ? '' : ' · ascunsa pe site'}`, product ? '' : 'Alege sursa produsului');
      fillSelect($('shop-product-category'), state.categories, product?.category_id || '', item => item.name, 'Fara categorie');
      fillSelect($('shop-product-manufacturer'), state.manufacturers, product?.manufacturer_id || '', item => item.name, 'Fara producator');
      renderBrandDropdown(product?.brand_ids || []);
      const values = { 'shop-product-sku': product?.sku, 'shop-product-supplier-code': product?.supplier_product_code, 'shop-product-ean': product?.ean, 'shop-product-name': product?.name, 'shop-product-slug': product?.slug, 'shop-product-short': product?.short_description, 'shop-product-description-title': product?.description_title, 'shop-product-price': product?.price, 'shop-product-supplier-base-price': product?.supplier_base_price ?? '', 'shop-product-price-difference': product?.supplier_price_difference ?? '', 'shop-product-discount-value': product?.discount_value || '', 'shop-product-stock': product?.stock_quantity ?? 0, 'shop-product-low-stock': product?.low_stock_threshold ?? 3, 'shop-product-meta-title': product?.meta_title, 'shop-product-meta-description': product?.meta_description };
      Object.entries(values).forEach(([key, value]) => $(key).value = value ?? '');
      $('shop-product-discount-type').value = product?.discount_type || 'percent';
      state.richRange = null;
      selectRichImage(null);
      $('shop-product-description').innerHTML = product?.description_html || '';
      normalizeRichImages();
      $('shop-product-stock-mode').value = product?.stock_mode || 'tracked';
      $('shop-product-active').checked = product?.is_active ?? true;
      $('shop-product-featured').checked = product?.is_featured ?? false;
      const productModal = $('shop-product-modal');
      productModal.classList.toggle('over-order', !$('shop-order-modal').hidden && $('shop-order-modal').classList.contains('visible'));
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
  function updateStockInputs() { const source = state.sources.find(item => item.id === $('shop-product-source').value); const supplierManaged = String(source?.domain || '').toLowerCase() === 'boomag.ro'; if (supplierManaged) $('shop-product-stock-mode').value = 'tracked'; const tracked = $('shop-product-stock-mode').value === 'tracked'; $('shop-product-stock-mode').disabled = supplierManaged; $('shop-product-stock').disabled = !tracked || supplierManaged; $('shop-product-low-stock').disabled = !tracked; $('shop-product-stock').title = supplierManaged ? `Stoc furnizor: ${Number(state.editingProduct?.supplier_stock_quantity || 0)} buc. · actualizare automata zilnica` : ''; }
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
  function updateProductPreview() { const price = Number($('shop-product-price').value || 0); const source = state.sources.find(item => item.id === $('shop-product-source').value); const isBoomag = String(source?.domain || '').trim().toLowerCase() === 'boomag.ro'; const supplierBaseInput = $('shop-product-supplier-base-price'); const differenceInput = $('shop-product-price-difference'); const supplierBase = supplierBaseInput.value === '' ? null : Number(supplierBaseInput.value); $('shop-product-boomag-pricing').hidden = !isBoomag; $('shop-product-price-hint').hidden = !isBoomag; differenceInput.value = isBoomag && supplierBase !== null && Number.isFinite(supplierBase) ? (price - supplierBase).toFixed(2) : ''; const discount = Math.max(0, Number($('shop-product-discount-value').value || 0)); const discountType = $('shop-product-discount-type').value; const finalPrice = discount ? Math.max(0, discountType === 'fixed' ? price - discount : price * (1 - discount / 100)) : price; $('shop-product-discount-label').firstChild.textContent = discountType === 'fixed' ? 'Reducere lei' : 'Reducere %'; $('shop-product-final-price').textContent = money(finalPrice); $('shop-google-title').textContent = $('shop-product-meta-title').value.trim() || $('shop-product-name').value.trim() || 'Titlul produsului'; $('shop-google-description').textContent = $('shop-product-meta-description').value.trim() || $('shop-product-short').value.trim() || 'Descrierea produsului va aparea aici.'; $('shop-google-url').textContent = `https://g-trots.ro/magazin/produs/${$('shop-product-slug').value || 'slug-produs'}`; const image = $('shop-google-image'); if (state.productImages[0]) { image.setAttribute('style', imageBackground(state.productImages[0])); image.hidden = false; } else { image.removeAttribute('style'); image.hidden = true; } }
  async function saveProduct(event) {
    event.preventDefault(); const button = $('shop-product-save'); button.disabled = true;
    try {
      if (!validateProductName()) { $('shop-product-name').focus(); throw new Error('Acest nume de produs exista deja.'); }
      const price = Number($('shop-product-price').value); const costPrice = Number(state.editingProduct?.cost_price || 0); const discount = Number($('shop-product-discount-value').value || 0); const discountType = $('shop-product-discount-type').value; const source = state.sources.find(item => item.id === $('shop-product-source').value);
      if (discount < 0 || (discount > 0 && (discountType === 'percent' ? discount >= 100 : discount >= price))) throw new Error(discountType === 'percent' ? 'Reducerea procentuala trebuie sa fie sub 100%.' : 'Reducerea fixa trebuie sa fie mai mica decat pretul.');
      const salePrice = discount ? Math.round((discountType === 'fixed' ? price - discount : price * (1 - discount / 100)) * 100) / 100 : null;
      const payload = { source_id: source?.id || null, source_domain: source?.domain || 'g-trots.ro', source_url: '', supplier_product_code: $('shop-product-supplier-code').value.trim(), ean: $('shop-product-ean').value.trim(), name: $('shop-product-name').value.trim(), slug: $('shop-product-slug').value.trim(), short_description: $('shop-product-short').value.trim(), description_title: $('shop-product-description-title').value.trim(), description_html: richDescriptionHtml(), specifications: state.productSpecifications.map(item => ({ group: item.group.trim(), label: item.label.trim(), value: item.value.trim() })), questions: state.productQuestions.map(item => ({ question: item.question.trim(), answer: item.answer.trim() })), meta_title: $('shop-product-meta-title').value.trim(), meta_description: $('shop-product-meta-description').value.trim(), cost_price: costPrice, price, discount_type: discountType, discount_value: discount || null, discount_percent: discountType === 'percent' ? discount || null : null, sale_price: salePrice, category_id: $('shop-product-category').value || null, manufacturer_id: $('shop-product-manufacturer').value || null, brand_ids: Array.from($('shop-product-brands').querySelectorAll('input:checked')).map(input => input.value), stock_mode: $('shop-product-stock-mode').value, stock_quantity: Math.max(0, Number($('shop-product-stock').value || 0)), low_stock_threshold: Math.max(0, Number($('shop-product-low-stock').value || 0)), currency: 'RON', is_active: $('shop-product-active').checked, is_featured: $('shop-product-featured').checked, images: state.productImages.map((image, index) => ({ id: image.id, base64: image.base64, alt_text: image.alt_text || $('shop-product-name').value.trim(), sort_order: index })) };
      if (!payload.name || !payload.slug || !Number.isFinite(price) || !Number.isFinite(costPrice) || costPrice < 0) throw new Error('Completeaza numele, slug-ul si preturile valide.');
      const saved = state.editingProduct ? await window.SHOP_API.updateProduct(state.editingProduct.id, payload) : await window.SHOP_API.createProduct(payload);
      closeModal('shop-product-modal');
      toast(saved.stripe_sync_status === 'error' ? `Produs salvat. Stripe: ${saved.stripe_sync_error || 'sincronizarea trebuie reincercata.'}` : 'Produsul a fost salvat si sincronizat.', saved.stripe_sync_status === 'error' ? 'error' : 'success');
      await loadProducts();
    } catch (error) { toast(error.message || 'Produsul nu a putut fi salvat.', 'error'); } finally { button.disabled = false; }
  }
  async function deleteProduct(id) { const product = state.products.find(item => item.id === id); if (!product || !confirm(`Stergi definitiv produsul „${product.name}”? Toate pozele lui vor fi sterse de pe server.`)) return; try { const result = await window.SHOP_API.deleteProduct(id); if (!result?.success || result.deleted_id !== id) throw new Error('Serverul nu a confirmat stergerea produsului.'); state.products = state.products.filter(item => item.id !== id); renderProducts(); await loadProducts(); if (state.products.some(item => item.id === id)) throw new Error('Produsul apare inca in catalog dupa stergere. Reincarca si incearca din nou.'); toast(`Produsul a fost sters definitiv${result.deleted_files ? ` impreuna cu ${result.deleted_files} fisiere` : ''}.`); } catch (error) { toast(error.message, 'error'); } }

  async function loadOrders() { loading('shop-orders-content', 'Se incarca comenzile...'); try { const orders = await window.SHOP_API.listOrders(); state.orders = Array.isArray(orders) ? orders : []; renderOrders(); } catch (error) { failure('shop-orders-content', error); } }
  function orderCustomerKind(order) {
    const company = String(order?.customer_type || '').toLowerCase() === 'company'
      || Boolean(String(order?.company_name || '').trim())
      || Boolean(String(order?.company_cui || '').trim())
      || Boolean(String(order?.company_registration_number || '').trim());
    return company
      ? { key: 'company', short: 'PJ', label: 'Persoană juridică' }
      : { key: 'individual', short: 'PF', label: 'Persoană fizică' };
  }
  function orderCustomerBadge(order) {
    const kind = orderCustomerKind(order);
    return `<span class="shop-order-customer-type ${kind.key}" title="${kind.label}" aria-label="${kind.label}">${kind.short}</span>`;
  }
  function orderPaymentChips(order, labels) {
    const isCard = order.payment_method === 'card';
    const method = isCard ? 'card' : 'cash';
    const methodLabel = isCard ? 'Card online' : 'Ramburs';
    const methodIcon = isCard
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="3"/><circle cx="12" cy="12" r="2.5"/><path d="M7 9.5a2.5 2.5 0 0 1-1.5 2.3M17 14.5a2.5 2.5 0 0 1 1.5-2.3"/></svg>';
    const paymentState = ['pending', 'paid', 'failed', 'refunded'].includes(order.payment_status) ? order.payment_status : 'pending';
    return `<div class="shop-order-payment-cell"><span class="shop-order-payment-method ${method}">${methodIcon}<b>${methodLabel}</b></span><span class="shop-order-payment-state ${paymentState}"><i></i>${esc(labels[paymentState] || paymentState)}</span></div>`;
  }
  function renderOrders() {
    const normalizeSearch = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const paymentStatusLabels = { pending: 'În așteptare', paid: 'Plătită', failed: 'Eșuată', refunded: 'Rambursată' };
    const term = normalizeSearch(state.orderQuery);
    const searchTerms = term.split(/\s+/).filter(Boolean);
    const filtered = state.orders.filter(order => {
      const created = new Date(String(order.created_at || '').replace(' ', 'T'));
      const createdLabels = Number.isNaN(created.getTime()) ? [] : [created.toLocaleDateString('ro-RO'), created.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }), created.toLocaleString('ro-RO')];
      const customerKind = orderCustomerKind(order);
      const searchText = normalizeSearch([order.order_number, order.customer_name, order.customer_phone, order.customer_email, customerKind.short, customerKind.label, order.company_name, order.company_cui, order.company_registration_number, order.company_address, order.address, order.city, order.county, order.postal_code, order.created_at, ...createdLabels, order.status, statusLabels[order.status], statusShortLabels[order.status], order.payment_method, order.payment_method === 'card' ? 'card online plata cu cardul' : 'ramburs la curier plata ramburs numerar cash', order.payment_status, paymentStatusLabels[order.payment_status], ...(Array.isArray(order.items) ? order.items.flatMap(item => [item.product_name, item.product_sku]) : [])].join(' '));
      const compactSearchText = searchText.replace(/\s+/g, '');
      if (searchTerms.length && !searchTerms.every(searchTerm => searchText.includes(searchTerm) || compactSearchText.includes(searchTerm.replace(/\s+/g, '')))) return false;
      if (state.orderStatusFilter !== 'all' && order.status !== state.orderStatusFilter) return false;
      if (state.orderPaymentMethodFilter === 'card' && order.payment_method !== 'card') return false;
      if (state.orderPaymentMethodFilter === 'cash' && order.payment_method === 'card') return false;
      if (state.orderPaymentStatusFilter !== 'all' && order.payment_status !== state.orderPaymentStatusFilter) return false;
      return true;
    });
    const page = pageData(filtered, 'orders');
    const rows = page.items.map(order => `<tr data-order-open="${order.id}"><td><strong>${esc(order.order_number)}</strong><small>${esc(new Date(order.created_at.replace(' ', 'T')).toLocaleString('ro-RO'))}</small></td><td><div class="shop-order-client-heading"><strong>${esc(order.customer_name)}</strong>${orderCustomerBadge(order)}</div><small>${esc(order.customer_phone)}</small></td><td><span class="commerce-pill" style="--pill:${statusColors[order.status]}">${esc(statusShortLabels[order.status] || order.status)}</span></td><td>${orderPaymentChips(order, paymentStatusLabels)}</td><td><b>${money(order.total)}</b></td><td><span class="shop-order-open-indicator" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></span></td></tr>`).join('');
    const activeOrders = state.orders.filter(item => !terminalStatuses.includes(item.status));
    const collected = activeOrders.filter(item => item.payment_status === 'paid').reduce((sum, item) => sum + Number(item.total || 0), 0);
    const pendingCash = activeOrders.filter(item => item.payment_method !== 'card' && item.payment_status === 'pending').reduce((sum, item) => sum + Number(item.total || 0), 0);
    const orderMetrics = [
      { tone: 'blue', icon: statusIcon('new'), label: 'În procesare', value: String(state.orders.filter(item => item.status === 'new').length), help: 'Comenzi noi' },
      { tone: 'orange', icon: statusIcon('processing'), label: 'În pregătire', value: String(state.orders.filter(item => item.status === 'processing').length), help: 'Se pregătesc pentru livrare' },
      { tone: 'purple', icon: '<svg viewBox="0 0 24 24"><path d="M4 7h16v11H4z"/><path d="M7 7V5h10v2M8 13h4"/></svg>', label: 'Total', value: money(collected + pendingCash), help: 'Încasări + ramburs în așteptare' },
      { tone: 'green', icon: statusIcon('completed'), label: 'Încasat', value: money(collected), help: 'Toate plățile încasate' },
      { tone: 'amber', icon: statusIcon('new'), label: 'De încasat', value: money(pendingCash), help: 'Ramburs în așteptare' },
    ];
    const metricsHtml = `<div class="shop-order-kpi-strip">${orderMetrics.map(item => `<article class="shop-order-kpi ${item.tone}"><span class="shop-order-kpi-icon">${item.icon}</span><div><small>${esc(item.label)}</small><strong>${esc(item.value)}</strong><em>${esc(item.help)}</em></div></article>`).join('')}</div>`;
    const option = (value, label, selected) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
    const filtersHtml = `<section class="shop-order-filters"><header><div><strong>Căutare și filtre</strong><span>${filtered.length} ${filtered.length === 1 ? 'rezultat' : 'rezultate'}</span></div><button type="button" id="shop-orders-filter-reset" ${(term || state.orderStatusFilter !== 'all' || state.orderPaymentMethodFilter !== 'all' || state.orderPaymentStatusFilter !== 'all') ? '' : 'disabled'}>Resetează filtrele</button></header><div class="shop-order-filter-grid"><label class="search"><small>Caută în toate datele comenzii</small><input id="shop-orders-search" type="search" autocomplete="off" spellcheck="false" value="${esc(state.orderQuery)}" placeholder="Client, dată, oră, telefon, produs, status, plată sau număr comandă" /></label><label><small>Status comandă</small><select id="shop-orders-status-filter">${option('all', 'Toate statusurile', state.orderStatusFilter)}${Object.entries(statusLabels).map(([value, label]) => option(value, label, state.orderStatusFilter)).join('')}</select></label><label><small>Metodă de plată</small><select id="shop-orders-payment-method-filter">${option('all', 'Toate metodele', state.orderPaymentMethodFilter)}${option('card', 'Card online', state.orderPaymentMethodFilter)}${option('cash', 'Ramburs la curier', state.orderPaymentMethodFilter)}</select></label><label><small>Status plată</small><select id="shop-orders-payment-status-filter">${option('all', 'Toate plățile', state.orderPaymentStatusFilter)}${option('pending', 'În așteptare', state.orderPaymentStatusFilter)}${option('paid', 'Plătită', state.orderPaymentStatusFilter)}${option('failed', 'Eșuată', state.orderPaymentStatusFilter)}${option('refunded', 'Rambursată', state.orderPaymentStatusFilter)}</select></label></div></section>`;
    const tableHtml = rows ? `<div class="shop-commerce-table-wrap"><table class="shop-commerce-table orders"><thead><tr><th>Comanda</th><th>Client</th><th>Status</th><th>Plata</th><th>Total</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${pagination('orders', filtered.length, page.page, page.pageCount, page.pageSize)}` : empty('Nicio comandă găsită', 'Schimbă sau resetează filtrele pentru a vedea alte comenzi.');
    $('shop-orders-content').innerHTML = state.orders.length ? `${metricsHtml}${filtersHtml}${tableHtml}` : empty('Nicio comanda', 'Comenzile trimise de pe site vor aparea automat aici.');
    $('shop-orders-content').querySelectorAll('[data-order-open]').forEach(row => row.addEventListener('click', () => openOrder(row.dataset.orderOpen)));
    $('shop-orders-search')?.addEventListener('input', event => {
      const input = event.currentTarget;
      state.orderQuery = input.value;
      state.pages.orders = 1;
      const caret = input.selectionStart ?? state.orderQuery.length;
      clearTimeout(state.orderSearchTimer);
      state.orderSearchTimer = setTimeout(() => {
        const restoreFocus = document.activeElement === input;
        renderOrders();
        if (!restoreFocus) return;
        const nextInput = $('shop-orders-search');
        nextInput?.focus({ preventScroll: true });
        nextInput?.setSelectionRange?.(Math.min(caret, state.orderQuery.length), Math.min(caret, state.orderQuery.length));
      }, 90);
    });
    [['shop-orders-status-filter', 'orderStatusFilter'], ['shop-orders-payment-method-filter', 'orderPaymentMethodFilter'], ['shop-orders-payment-status-filter', 'orderPaymentStatusFilter']].forEach(([id, key]) => $(id)?.addEventListener('change', event => { state[key] = event.target.value; state.pages.orders = 1; renderOrders(); }));
    $('shop-orders-filter-reset')?.addEventListener('click', () => { clearTimeout(state.orderSearchTimer); state.orderQuery = ''; state.orderStatusFilter = 'all'; state.orderPaymentMethodFilter = 'all'; state.orderPaymentStatusFilter = 'all'; state.pages.orders = 1; renderOrders(); });
    bindPagination('shop-orders-content', 'orders', renderOrders);
  }
  function orderTimeline(order) {
    const history = Array.isArray(order.status_history) ? order.status_history : [];
    const terminalCurrent = terminalStatuses.includes(order.status) ? statusDefinitions.find(item => item.value === order.status) : null;
    const flow = statusDefinitions.filter(item => mainStatusFlow.includes(item.value));
    const currentFlowIndex = flow.findIndex(item => item.value === order.status);
    const flowHtml = flow.map((item, index) => {
      const entry = [...history].reverse().find(historyItem => historyItem.to_status === item.value);
      const flowIndex = flow.findIndex(flowItem => flowItem.value === item.value);
      const reached = Boolean(entry) || (!terminalCurrent && (item.value === order.status || (flowIndex >= 0 && currentFlowIndex >= 0 && flowIndex <= currentFlowIndex)));
      const current = item.value === order.status;
      const date = entry ? new Date(String(entry.created_at).replace(' ', 'T')).toLocaleString('ro-RO') : '';
      return `<div class="shop-order-timeline-step ${reached ? 'reached' : ''} ${current ? 'current' : ''}" style="--status-color:${statusColors[item.value]}"><div class="shop-order-timeline-rail"><span>${statusIcon(item.value)}</span>${index < flow.length - 1 ? '<i></i>' : ''}</div><strong>${esc(statusShortLabels[item.value] || statusLabels[item.value])}</strong><small>${date ? esc(date) : current ? 'Status actual' : 'Pas următor'}</small></div>`;
    }).join('');
    const currentMeta = terminalCurrent || flow.find(item => item.value === order.status) || flow[0];
    const currentEntry = [...history].reverse().find(historyItem => historyItem.to_status === currentMeta.value);
    const currentDate = currentEntry ? new Date(String(currentEntry.created_at).replace(' ', 'T')).toLocaleString('ro-RO') : '';
    const currentState = `<div class="shop-order-current-state ${terminalCurrent ? 'terminal' : ''}" style="--status-color:${statusColors[currentMeta.value]}"><span>${statusIcon(currentMeta.value)}</span><div><small>${terminalCurrent ? 'STATUS FINAL ACTUAL' : 'STATUS ACTUAL'}</small><strong>${esc(statusLabels[currentMeta.value])}</strong><p>${esc(currentMeta.description)}</p>${currentDate ? `<time>${esc(currentDate)}</time>` : ''}</div><em>ACUM</em></div>`;
    return `<section class="shop-order-timeline"><div class="shop-order-section-title"><span>EVOLUȚIA COMENZII</span><strong>Istoric status</strong></div><div class="shop-order-timeline-flow">${flowHtml}</div>${currentState}</section>`;
  }
  function orderStatusPicker(order) {
    return `<section class="shop-order-status-section"><div class="shop-order-section-title"><span>ACTUALIZEAZĂ</span><strong>Alege următorul status</strong></div><div class="shop-order-status-picker">${statusDefinitions.map((item, index) => {
      const locked = statusTransitionLocked(order.status, item.value);
      return `<label class="shop-order-status-option ${order.status === item.value ? 'selected' : ''} ${locked ? 'locked' : ''}" style="--status-color:${statusColors[item.value]}"><input type="radio" name="shop-order-status" value="${item.value}" ${order.status === item.value ? 'checked' : ''} ${locked ? 'disabled' : ''}><span class="shop-order-status-icon">${statusIcon(item.value)}<b>${String(index + 1).padStart(2, '0')}</b></span><span><strong>${esc(statusLabels[item.value])}</strong><small>${esc(locked ? 'Etapă finalizată · nu se poate reveni' : item.description)}</small></span><i>✓</i></label>`;
    }).join('')}</div></section>`;
  }
  function normalizeWhatsAppPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('0') && digits.length === 10) digits = `40${digits.slice(1)}`;
    if (digits.length === 9) digits = `40${digits}`;
    return digits;
  }
  function orderDetailRow(label, value, strong = false) {
    return `<div class="shop-order-detail-row"><small>${esc(label)}</small><span class="${strong ? 'strong' : ''}">${esc(String(value || '').trim() || '—')}</span></div>`;
  }
  function orderDeliveryInput(label, id, value, strong = false) {
    return `<label class="shop-order-delivery-field ${strong ? 'strong' : ''}"><small>${esc(label)}</small><input id="${id}" value="${esc(value || '')}" disabled></label>`;
  }
  async function openOrderContact(kind, phone) {
    try {
      if (kind === 'call') {
        const target = String(phone || '').replace(/[^\d+]/g, '');
        if (!target) throw new Error('Comanda nu are un număr de telefon valid.');
        await shell.openExternal(`tel:${target}`);
        return;
      }
      const target = normalizeWhatsAppPhone(phone);
      if (!target) throw new Error('Comanda nu are un număr de telefon valid.');
      try { await shell.openExternal(`whatsapp://send?phone=${target}`); }
      catch (_error) { await shell.openExternal(`https://web.whatsapp.com/send?phone=${target}&type=phone_number&app_absent=0`); }
    } catch (error) { toast(error.message || 'Acțiunea nu a putut fi deschisă.', 'error'); }
  }
  function syncOrderNotify() {
    const notify = $('shop-order-notify');
    const helper = $('shop-order-notify-helper');
    const card = notify?.closest('.shop-order-notify');
    const stateBadge = $('shop-order-notify-state');
    const status = document.querySelector('input[name="shop-order-status"]:checked')?.value || state.editingOrder?.status;
    if (!notify || !state.editingOrder) return;
    const hasEmail = Boolean(state.editingOrder.customer_email);
    const changed = status !== state.editingOrder.status;
    notify.disabled = !hasEmail || !changed;
    if (notify.disabled) notify.checked = false;
    if (helper) helper.textContent = !hasEmail ? 'Comanda nu are o adresă de e-mail.' : !changed ? 'Alege un status diferit, apoi poți trimite automat rezumatul comenzii.' : `Rezumatul și linkul de urmărire vor fi trimise la ${state.editingOrder.customer_email}.`;
    if (card) card.dataset.notifyState = !hasEmail ? 'missing' : !changed ? 'waiting' : notify.checked ? 'active' : 'ready';
    if (stateBadge) stateBadge.textContent = !hasEmail ? 'FĂRĂ E-MAIL' : !changed ? 'ALEGE STATUS' : notify.checked ? 'ACTIVATĂ' : 'PREGĂTITĂ';
    document.querySelectorAll('.shop-order-status-option').forEach(label => label.classList.toggle('selected', label.querySelector('input')?.checked));
  }
  function renderOrderDetails(order) {
    state.editingOrder = order;
    $('shop-order-title').textContent = order.order_number;
    const orderItems = Array.isArray(order.items) ? order.items : [];
    const isProductPromotion = order.promotion_scope === 'product';
    const orderDiscount = Math.max(0, Number(order.discount_total || 0));
    const orderItemsHtml = orderItems.map(item => {
      const hasDiscount = isProductPromotion && Number(item.discount_total || 0) > 0;
      const unitPrice = hasDiscount
        ? `<del>${money(item.unit_price)}</del><b>${money(item.discounted_unit_price ?? item.unit_price)}</b>`
        : money(item.unit_price);
      const lineTotal = hasDiscount
        ? `<del>${money(item.line_total)}</del><b>${money(item.discounted_line_total ?? item.line_total)}</b>`
        : money(item.line_total);
      const productOpen = item.product_id ? `<button type="button" class="shop-order-product-open" data-order-product-open="${esc(item.product_id)}" aria-label="Deschide fișa produsului ${esc(item.product_name)}" title="Deschide fișa produsului"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>` : '';
      return `<div>${item.image_url ? `<img src="${esc(item.image_url)}" alt="">` : `<b>${item.quantity}×</b>`}<span><strong>${esc(item.product_name)}</strong><small>${item.quantity} × <span class="${hasDiscount ? 'discounted' : ''}">${unitPrice}</span> · ${esc(item.product_sku || 'Fără SKU')}</small></span><em class="${hasDiscount ? 'discounted' : ''}">${lineTotal}</em>${productOpen}</div>`;
    }).join('');
    const productsTotal = Number(order.subtotal || 0) - (isProductPromotion ? orderDiscount : 0);
    const globalDiscount = !isProductPromotion && orderDiscount > 0
      ? `<small class="shop-order-discount">Reducere${order.promotion_code ? ` · ${esc(order.promotion_code)}` : ''} <b>−${money(orderDiscount)}</b></small>`
      : '';
    const contactIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h3l1.2 4-2 1.5a14 14 0 0 0 5.3 5.3l1.5-2L20 14v3c0 1.1-.9 2-2 2C10.8 19 5 13.2 5 6c0-1.1.9-2 2-2Z"/></svg>';
    const whatsappIcon = '<svg class="whatsapp-brand" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.981.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.895 6.99c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.14 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>';
    const editIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>';
    const customerKind = orderCustomerKind(order);
    const companyRows = customerKind.key === 'company'
      ? `<div class="shop-order-company-block"><small>DATE FISCALE</small>${orderDetailRow('Denumire firmă', order.company_name, true)}${orderDetailRow('CUI / CIF', order.company_cui)}${orderDetailRow('Registrul Comerțului', order.company_registration_number)}${orderDetailRow('Sediu social', order.company_address)}</div>`
      : '';
    const clientCard = `<section class="shop-order-summary-card"><div class="shop-order-card-head"><small>CLIENT</small><div class="shop-order-client-kind">${orderCustomerBadge(order)}<em>${customerKind.label.toUpperCase()}</em></div></div>${orderDetailRow('Nume', order.customer_name, true)}${orderDetailRow('Telefon', order.customer_phone)}${orderDetailRow('E-mail', order.customer_email || 'Fără e-mail')}${companyRows}<div class="shop-order-contact-actions"><button type="button" data-order-call>${contactIcon}<span>Apelează</span></button><button type="button" class="whatsapp" data-order-whatsapp>${whatsappIcon}<span>WhatsApp</span></button></div></section>`;
    const deliveryCard = `<section class="shop-order-summary-card"><div class="shop-order-card-head"><small>LIVRARE</small><div class="shop-order-card-actions"><em>DATE COMPLETE</em><button type="button" data-order-delivery-edit>${editIcon}<span>Editează</span></button></div></div>${orderDeliveryInput('Adresă completă', 'shop-order-address', order.address, true)}${orderDeliveryInput('Localitate', 'shop-order-city', order.city)}${orderDeliveryInput('Județ', 'shop-order-county', order.county)}${orderDeliveryInput('Cod poștal', 'shop-order-postal-code', order.postal_code)}${orderDetailRow('Metodă', order.shipping_method_name)}${orderDetailRow('Cost livrare', money(order.shipping_cost))}<p class="shop-order-delivery-helper" hidden>Modificările se salvează folosind butonul „Salvează comanda”.</p></section>`;
    const hasVat = Boolean(order.vat_payer);
    $('shop-order-details').innerHTML = `<div class="shop-order-grid">${clientCard}${deliveryCard}</div><div class="shop-order-items">${orderItemsHtml}</div><div class="shop-order-total"><span>${isProductPromotion && orderDiscount > 0 ? 'Subtotal după reduceri' : 'Subtotal'}${hasVat ? ' (TVA inclus)' : ''} ${money(productsTotal)} · Livrare ${money(order.shipping_cost)}${globalDiscount}</span><strong>Total de plată${hasVat ? ' (TVA inclus)' : ''} ${money(order.total)}</strong></div>${orderTimeline(order)}${orderStatusPicker(order)}<label class="shop-order-notify" data-notify-state="waiting"><input id="shop-order-notify" type="checkbox"><span class="shop-order-notify-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m5 8 7 5 7-5"/></svg><i></i></span><span class="shop-order-notify-copy"><span class="shop-order-notify-eyebrow">NOTIFICARE CLIENT <b id="shop-order-notify-state">ALEGE STATUS</b></span><strong>Trimite actualizarea pe e-mail</strong><small id="shop-order-notify-helper"></small></span><span class="shop-order-notify-switch" aria-hidden="true"><i></i></span></label><div class="shop-commerce-columns"><label>Status plată<select id="shop-order-payment-status">${['pending', 'paid', 'failed', 'refunded'].map(value => `<option value="${value}" ${order.payment_status === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Metodă de plată<input value="${order.payment_method === 'card' ? 'Card online' : 'Ramburs la curier'}" disabled></label></div><label>Notițe interne<textarea id="shop-order-admin-notes" rows="4">${esc(order.admin_notes || '')}</textarea></label>${order.customer_notes ? `<div class="shop-order-note"><small>OBSERVAȚII CLIENT</small>${esc(order.customer_notes)}</div>` : ''}`;
    $('shop-order-details').querySelector('[data-order-call]')?.addEventListener('click', () => void openOrderContact('call', order.customer_phone));
    $('shop-order-details').querySelector('[data-order-whatsapp]')?.addEventListener('click', () => void openOrderContact('whatsapp', order.customer_phone));
    $('shop-order-details').querySelectorAll('[data-order-product-open]').forEach(button => button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      void openProductDetail(button.dataset.orderProductOpen, { overOrder: true });
    }));
    const deliveryEditButton = $('shop-order-details').querySelector('[data-order-delivery-edit]');
    const deliveryInputs = ['shop-order-address', 'shop-order-city', 'shop-order-county', 'shop-order-postal-code'].map(id => $(id)).filter(Boolean);
    const deliveryOriginal = deliveryInputs.map(input => input.value);
    let deliveryEditing = false;
    deliveryEditButton?.addEventListener('click', () => {
      deliveryEditing = !deliveryEditing;
      deliveryInputs.forEach((input, index) => { input.disabled = !deliveryEditing; if (!deliveryEditing) input.value = deliveryOriginal[index]; });
      deliveryEditButton.classList.toggle('active', deliveryEditing);
      deliveryEditButton.querySelector('span').textContent = deliveryEditing ? 'Anulează' : 'Editează';
      const helper = $('shop-order-details').querySelector('.shop-order-delivery-helper');
      if (helper) helper.hidden = !deliveryEditing;
      if (deliveryEditing) deliveryInputs[0]?.focus();
    });
    document.querySelectorAll('input[name="shop-order-status"]').forEach(input => input.addEventListener('change', syncOrderNotify));
    $('shop-order-notify')?.addEventListener('change', syncOrderNotify);
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
      const updated = await window.SHOP_API.updateOrder(state.editingOrder.id, { status, payment_status: $('shop-order-payment-status').value, admin_notes: $('shop-order-admin-notes').value.trim(), notify_customer: Boolean($('shop-order-notify')?.checked), address: $('shop-order-address')?.value.trim(), city: $('shop-order-city')?.value.trim(), county: $('shop-order-county')?.value.trim(), postal_code: $('shop-order-postal-code')?.value.trim() });
      closeModal('shop-order-modal');
      const email = updated.email_notification;
      toast(email?.requested ? (email.sent ? `Comanda a fost actualizată, iar clientul a fost notificat la ${email.recipient}.` : `Status salvat. E-mailul nu a plecat: ${email.error || 'verifică SMTP.'}`) : 'Comanda a fost actualizată.', email?.requested && !email.sent ? 'error' : 'success');
      await loadOrders();
    } catch (error) { toast(error.message, 'error'); }
    finally { button.disabled = false; }
  }

  async function loadInventory() { loading('shop-inventory-content', 'Se incarca stocurile...'); try { state.inventory = await window.SHOP_API.listInventory(); renderInventory(); } catch (error) { failure('shop-inventory-content', error); } }
  function renderInventory() {
    const root = $('shop-inventory-content');
    if (!$('shop-inventory-search')) {
      root.innerHTML = `<section class="shop-inventory-searchbar"><span class="shop-inventory-search-icon"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg></span><label for="shop-inventory-search"><small>CAUTARE INTELIGENTA IN STOCURI</small><input id="shop-inventory-search" type="search" value="${esc(state.inventoryQuery)}" placeholder="Nume, cod, furnizor, marca, categorie sau chiar cu o greseala" autocomplete="off" /></label><button type="button" id="shop-inventory-search-clear" aria-label="Sterge cautarea" title="Sterge cautarea" ${state.inventoryQuery ? '' : 'hidden'}><svg viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17"/></svg></button><em id="shop-inventory-search-count"></em></section><div id="shop-inventory-results"></div>`;
      const search = $('shop-inventory-search');
      const clear = $('shop-inventory-search-clear');
      search.addEventListener('input', () => {
        state.inventoryQuery = search.value;
        state.pages.inventory = 1;
        clear.hidden = !state.inventoryQuery;
        renderInventoryResults();
      });
      search.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !state.inventoryQuery) return;
        event.preventDefault();
        state.inventoryQuery = ''; search.value = ''; clear.hidden = true; state.pages.inventory = 1; renderInventoryResults();
      });
      clear.addEventListener('click', () => {
        state.inventoryQuery = ''; search.value = ''; clear.hidden = true; state.pages.inventory = 1; renderInventoryResults(); search.focus({ preventScroll: true });
      });
    }
    renderInventoryResults();
  }
  function renderInventoryResults() {
    const query = normalizeSemanticSearch(state.inventoryQuery);
    const filtered = query ? state.inventory.map(product => ({ product, score: inventorySearchScore(product, query) })).filter(item => item.score >= 0).sort((left, right) => right.score - left.score || String(left.product.name || '').localeCompare(String(right.product.name || ''), 'ro')).map(item => item.product) : state.inventory;
    const page = pageData(filtered, 'inventory');
    const rows = page.items.map(product => { const supplierManaged = String(product.source_domain || '').toLowerCase() === 'boomag.ro'; return `<tr data-stock-open="${esc(product.id)}"><td>${productPicture(product.images?.[0])}</td><td><strong>${esc(product.name)}</strong><small>${esc(product.sku || 'Fara SKU')}</small></td><td>${supplierManaged ? `<strong class="commerce-supplier-stock">${Number(product.supplier_stock_quantity || 0)} BUC.</strong><small>Sincronizat Boomag</small>` : '<strong>—</strong><small>Fara furnizor conectat</small>'}</td><td>${stockBadge(product)}</td><td><strong class="commerce-accounting-stock">${Number(product.accounting_stock_quantity || 0)} BUC.</strong><small>Doar citire</small></td><td>${product.stock_mode === 'tracked' ? product.low_stock_threshold : '—'}</td><td><span class="shop-stock-open-label">${product.stock_mode === 'tracked' && !supplierManaged ? 'Fisa / ajustare' : 'Vezi fisa'} <i>›</i></span></td></tr>`; }).join('');
    const low = state.inventory.filter(item => item.stock_mode === 'tracked' && item.stock_quantity <= item.low_stock_threshold).length;
    $('shop-inventory-search-count').innerHTML = `<b>${filtered.length}</b> din ${state.inventory.length} produse`;
    $('shop-inventory-results').innerHTML = `<div class="shop-commerce-summary"><span><b>${state.inventory.filter(item => item.stock_mode === 'tracked').length}</b> produse urmarite</span><span class="warn"><b>${low}</b> cu stoc mic</span><span><b>${state.inventory.filter(item => String(item.source_domain || '').toLowerCase() === 'boomag.ro').length}</b> sincronizate cu furnizorul</span></div>${rows ? `<div class="shop-commerce-table-wrap"><table class="shop-commerce-table inventory"><thead><tr><th>Poza</th><th>Produs</th><th>Stoc furnizor</th><th>Stoc online</th><th>Stoc Conta</th><th>Alerta sub</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${pagination('inventory', filtered.length, page.page, page.pageCount, page.pageSize)}` : empty(state.inventoryQuery ? 'Niciun produs gasit' : 'Niciun produs in stoc', state.inventoryQuery ? `Nu exista rezultate pentru „${esc(state.inventoryQuery)}”.` : 'Adauga produse pentru a le gestiona cantitatile.')}`;
    $('shop-inventory-results').querySelectorAll('[data-stock-open]').forEach(row => row.addEventListener('click', () => openStock(row.dataset.stockOpen)));
    bindPagination('shop-inventory-results', 'inventory', renderInventoryResults);
  }
  function stockMovementDelta(movement) { return Number(movement.accounting_quantity_delta ?? movement.quantity_delta ?? 0); }
  function stockMovementAfter(movement) { return Number(movement.accounting_quantity_after ?? movement.quantity_after ?? 0); }
  function stockMovementType(movement) {
    const labels = { NIR_IN: 'Intrare prin NIR', NIR_REVERSAL: 'Stornare NIR', sale: 'Iesire prin vanzare', adjustment: 'Ajustare manuala', return: 'Retur in stoc', cancellation: 'Anulare comanda', reservation: 'Rezervare', release: 'Eliberare rezervare' };
    return labels[movement.movement_type] || String(movement.movement_type || 'Miscare de stoc').replaceAll('_', ' ');
  }
  function stockMovementDate(value) {
    const parsed = new Date(String(value || '').replace(' ', 'T'));
    return Number.isNaN(parsed.getTime()) ? String(value || '—') : parsed.toLocaleString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function stockMovementSource(movement) {
    if (movement.order_number) return `Comanda ${movement.order_number}`;
    if (movement.nir_document_id) return String(movement.note || '').match(/NIR-[A-Z0-9-]+/i)?.[0] || 'Nota de intrare-receptie';
    return movement.created_by ? `Operat de ${movement.created_by}` : 'Operatiune interna';
  }
  function stockPager(key, total, page, pageCount, sectionId) {
    if (!total) return '';
    const first = (page - 1) * 5 + 1; const last = Math.min(total, page * 5);
    const pages = customerPaginationItems(pageCount, page);
    return `<nav class="shop-stock-pager" aria-label="Paginare"><small>${first}–${last} din ${total}</small><span><button type="button" class="direction" data-stock-page-key="${key}" data-stock-page="${page - 1}" data-stock-section="${sectionId}" ${page === 1 ? 'disabled' : ''} aria-label="Pagina anterioara">‹</button>${pages.map(item => item === '…' ? '<i>…</i>' : `<button type="button" data-stock-page-key="${key}" data-stock-page="${item}" data-stock-section="${sectionId}" class="${item === page ? 'active' : ''}" ${item === page ? 'aria-current="page"' : ''}>${item}</button>`).join('')}<button type="button" class="direction" data-stock-page-key="${key}" data-stock-page="${page + 1}" data-stock-section="${sectionId}" ${page === pageCount ? 'disabled' : ''} aria-label="Pagina urmatoare">›</button></span></nav>`;
  }
  function renderStockDetail() {
    const product = state.editingStock; if (!product) return;
    const supplierManaged = String(product.source_domain || '').toLowerCase() === 'boomag.ro';
    const canAdjust = product.stock_mode === 'tracked' && !supplierManaged;
    const movements = Array.isArray(state.inventoryMovements) ? state.inventoryMovements : [];
    const nirEntries = movements.filter(movement => movement.movement_type === 'NIR_IN' && movement.nir_document_id);
    const flowPage = pageData(nirEntries, 'stockFlow', [5]);
    const movementPage = pageData(movements, 'stockMovements', [5]);
    const totalIn = movements.reduce((sum, movement) => sum + Math.max(0, stockMovementDelta(movement)), 0);
    const totalOut = movements.reduce((sum, movement) => sum + Math.abs(Math.min(0, stockMovementDelta(movement))), 0);
    const flowRows = flowPage.items.map((movement, index) => { const quantity = Math.abs(stockMovementDelta(movement)); const documentNumber = String(movement.note || '').match(/NIR-[A-Z0-9-]+/i)?.[0] || 'NIR confirmat'; return `<button type="button" class="shop-stock-document-row" style="--stock-row:${index}" data-stock-nir-open="${esc(movement.nir_document_id)}"><span class="shop-stock-document-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6zM15 3v5h5M9 12h7m-7 4h7"/></svg></span><span class="shop-stock-document-copy"><small>DOCUMENT DE INTRARE</small><strong>${esc(documentNumber)}</strong><em>Deschide nota de intrare-receptie</em></span><span><small>DATA SI ORA</small><strong>${esc(stockMovementDate(movement.created_at))}</strong></span><span><small>CANTITATE</small><strong class="positive">+${quantity.toLocaleString('ro-RO')} buc.</strong></span><span><small>VALOARE UNITARA</small><strong>${money(movement.inventory_unit_cost_ron || 0)}</strong></span><span><small>VALOARE TOTALA</small><strong>${money(movement.inventory_cost_total_ron || 0)}</strong></span><i aria-hidden="true">›</i></button>`; }).join('');
    const movementRows = movementPage.items.map(movement => { const delta = stockMovementDelta(movement); return `<tr><td><strong>${esc(stockMovementDate(movement.created_at))}</strong><small>${esc(movement.created_by || 'Sistem')}</small></td><td><span class="shop-stock-kind ${delta > 0 ? 'in' : delta < 0 ? 'out' : 'neutral'}">${esc(stockMovementType(movement))}</span></td><td><strong>${esc(stockMovementSource(movement))}</strong><small>${esc(movement.note || 'Fara observatii')}</small></td><td><b class="shop-stock-delta ${delta >= 0 ? 'plus' : 'minus'}">${delta > 0 ? '+' : ''}${delta.toLocaleString('ro-RO')}</b></td><td><strong>${stockMovementAfter(movement).toLocaleString('ro-RO')} buc.</strong></td></tr>`; }).join('');
    const adjustment = canAdjust ? `<section class="shop-stock-adjustment"><header><span><svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18"/></svg></span><div><small>AJUSTARE MANUALA</small><strong>Corecteaza stocul online</strong><p>Foloseste doar pentru inventar, pierderi sau corectii justificate.</p></div></header><div><label>Cantitate noua<input id="shop-stock-quantity" type="number" min="0" step="1" value="${Number(product.stock_quantity || 0)}" required /></label><label>Motiv / notita<textarea id="shop-stock-note" rows="2" placeholder="Ex: Corectie dupa inventar"></textarea></label></div></section>` : `<aside class="shop-stock-readonly"><svg viewBox="0 0 24 24"><path d="M12 3 4 7v5c0 5 3.4 8 8 9 4.6-1 8-4 8-9V7l-8-4Zm-3 9 2 2 4-4"/></svg><span><strong>${supplierManaged ? 'Stoc administrat automat de furnizor' : 'Produs cu stoc nelimitat'}</strong><small>${supplierManaged ? 'Poti consulta istoricul, dar cantitatea online este sincronizata din Boomag.' : 'Poti consulta miscarile existente; produsul nu necesita ajustare manuala.'}</small></span></aside>`;
    $('shop-stock-details').innerHTML = `<section class="shop-stock-product-hero">${productPicture(product.images?.[0], 'shop-stock-product-image')}<span><small>FISA DE STOC · ${esc(product.source_name || product.source_domain || 'CATALOG INTERN')}</small><strong>${esc(product.name)}</strong><em>${esc(product.sku || 'Fara SKU')} ${product.supplier_product_code ? `· cod furnizor ${esc(product.supplier_product_code)}` : ''}</em></span><b class="${product.stock_mode === 'tracked' ? '' : 'unlimited'}">${product.stock_mode === 'tracked' ? 'URMARIT' : 'NELIMITAT'}</b></section><section class="shop-stock-sheet-metrics"><span><small>STOC ONLINE</small><strong>${product.stock_mode === 'tracked' ? `${Number(product.stock_quantity || 0).toLocaleString('ro-RO')} buc.` : 'Nelimitat'}</strong><em>vizibil in magazin</em></span><span><small>STOC CONTABIL</small><strong>${Number(product.accounting_stock_quantity || 0).toLocaleString('ro-RO')} buc.</strong><em>confirmat prin receptii</em></span><span class="positive"><small>TOTAL INTRARI</small><strong>+${totalIn.toLocaleString('ro-RO')}</strong><em>in istoricul disponibil</em></span><span class="negative"><small>TOTAL IESIRI</small><strong>−${totalOut.toLocaleString('ro-RO')}</strong><em>in istoricul disponibil</em></span></section>${adjustment}${state.inventoryMovementsLoading ? '<div class="shop-commerce-loading">Se incarca intrarile si miscarile de stoc...</div>' : state.inventoryMovementsError ? `<div class="shop-commerce-error">${esc(state.inventoryMovementsError)}</div>` : `<section class="shop-stock-ledger-section documents" id="shop-stock-flow-section"><header><span><small>01 · DOCUMENTE DE INTRARE</small><strong>Intrari din NIR-uri</strong><p>Documentul, momentul receptiei, cantitatea si valorile contabile. Apasa un rand pentru a deschide NIR-ul.</p></span><b>${nirEntries.length} intrari</b></header><div class="shop-stock-document-list">${flowRows || '<p class="shop-stock-empty">Produsul nu are inca intrari confirmate prin NIR.</p>'}</div>${stockPager('stockFlow', nirEntries.length, flowPage.page, flowPage.pageCount, 'shop-stock-flow-section')}<aside class="shop-stock-future-note">Iesirile prin facturi vor aparea aici dupa implementarea documentelor de vanzare.</aside></section><section class="shop-stock-ledger-section journal" id="shop-stock-movements-section"><header><span><small>02 · JURNAL COMPLET</small><strong>Miscari de stoc</strong><p>Detalii despre tipul operatiunii, documentul sursa, operator si stocul rezultat.</p></span><b>${movements.length} inregistrari</b></header><div class="shop-stock-movement-table"><table><thead><tr><th>Data</th><th>Tip</th><th>Sursa / explicatie</th><th>Delta</th><th>Stoc dupa</th></tr></thead><tbody>${movementRows || '<tr><td colspan="5">Nu exista miscari inregistrate.</td></tr>'}</tbody></table></div>${stockPager('stockMovements', movements.length, movementPage.page, movementPage.pageCount, 'shop-stock-movements-section')}</section>`}`;
    $('shop-stock-save').hidden = !canAdjust;
    $('shop-stock-details').querySelectorAll('[data-stock-page-key]').forEach(button => button.addEventListener('click', () => {
      if (button.disabled) return;
      const key = button.dataset.stockPageKey; state.pages[key] = Number(button.dataset.stockPage || 1); renderStockDetail();
      requestAnimationFrame(() => $(button.dataset.stockSection)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }));
    $('shop-stock-details').querySelectorAll('[data-stock-nir-open]').forEach(button => button.addEventListener('click', () => void openStockNir(button.dataset.stockNirOpen)));
  }
  async function openStockNir(id) {
    if (!id) return;
    closeModal('shop-stock-modal');
    window.switchTab?.('shop-nirs');
    if (!state.nirBootstrapped) await loadNirs(1);
    await openNir(id);
  }
  async function openStock(id) {
    const product = state.inventory.find(item => item.id === id); if (!product) return;
    state.editingStock = product; state.inventoryMovements = []; state.inventoryMovementsError = ''; state.inventoryMovementsLoading = true; state.pages.stockFlow = 1; state.pages.stockMovements = 1;
    $('shop-stock-title').textContent = product.name; openModal('shop-stock-modal'); renderStockDetail();
    try { state.inventoryMovements = await window.SHOP_API.listInventoryMovements(id); }
    catch (error) { state.inventoryMovementsError = error.message || 'Istoricul de stoc nu a putut fi incarcat.'; }
    finally { state.inventoryMovementsLoading = false; renderStockDetail(); }
  }
  async function saveStock(event) { event.preventDefault(); if (!state.editingStock) return; const button = $('shop-stock-save'); button.disabled = true; try { await window.SHOP_API.adjustStock(state.editingStock.id, { quantity: Math.max(0, Number($('shop-stock-quantity').value || 0)), note: $('shop-stock-note').value.trim() || 'Ajustare manuala din desktop' }); closeModal('shop-stock-modal'); toast('Stocul a fost actualizat.'); await loadInventory(); } catch (error) { toast(error.message, 'error'); } finally { button.disabled = false; } }

  async function loadSourcesPage() { loading('shop-sources-content', 'Se incarca sursele...'); try { state.sources = await window.SHOP_API.listProductSources(); renderSources(); } catch (error) { failure('shop-sources-content', error); } }
  function renderSources() { $('shop-sources-content').innerHTML = state.sources.map(source => `<div class="shop-source-block"><article class="shop-settings-row"><span class="shop-settings-icon">${source.is_default ? '★' : '◎'}</span><div><strong>${esc(source.name)}</strong><small>${esc(source.domain)}</small><em>${source.is_active ? 'Produsele sunt vizibile pe website' : 'Produsele sunt pastrate doar in CRM'}</em></div>${source.is_default ? '<b class="commerce-pill active">IMPLICITA</b>' : ''}<label class="commerce-source-switch" title="Afiseaza sau ascunde produsele pe website"><b>${Number(source.product_count || 0)} ${Number(source.product_count || 0) === 1 ? 'produs' : 'produse'}</b><input type="checkbox" data-source-toggle="${source.id}" ${source.is_active ? 'checked' : ''}><span></span></label><button data-source-edit="${source.id}">✎</button><button class="danger" data-source-delete="${source.id}">×</button></article>${source.domain === 'boomag.ro' ? `<button type="button" class="shop-taxonomy-sync" data-source-stock-sync="${source.id}"><span>↻</span><b>Actualizeaza preturile si stocul</b><small>Preturi furnizor, diferenta comerciala si stoc online din feedul Boomag</small></button>` : ''}</div>`).join('') || empty('Nicio sursa', 'Adauga sursa produselor.'); $('shop-sources-content').querySelectorAll('[data-source-toggle]').forEach(input => input.addEventListener('change', () => toggleSourceVisibility(input.dataset.sourceToggle, input.checked, input))); $('shop-sources-content').querySelectorAll('[data-source-edit]').forEach(button => button.addEventListener('click', () => openSource(button.dataset.sourceEdit))); $('shop-sources-content').querySelectorAll('[data-source-delete]').forEach(button => button.addEventListener('click', () => deleteSource(button.dataset.sourceDelete))); $('shop-sources-content').querySelectorAll('[data-source-stock-sync]').forEach(button => button.addEventListener('click', () => syncBoomagStock(button))); }
  async function toggleSourceVisibility(id, isActive, input) { const source = state.sources.find(item => item.id === id); if (!source) return; input.disabled = true; try { await window.SHOP_API.updateProductSource(id, { ...source, is_active: isActive, is_default: isActive ? source.is_default : false }); toast(isActive ? 'Produsele sursei sunt vizibile pe website.' : 'Produsele sursei au fost ascunse de pe website.'); await loadSourcesPage(); } catch (error) { input.checked = !isActive; input.disabled = false; toast(error.message, 'error'); } }
  function openSource(id = '') { const source = state.sources.find(item => item.id === id) || null; state.editingSource = source; $('shop-source-title').textContent = source ? 'Editeaza sursa' : 'Sursa noua'; $('shop-source-name').value = source?.name || ''; $('shop-source-domain').value = source?.domain || ''; $('shop-source-url').value = source?.base_url || ''; $('shop-source-active').checked = source?.is_active ?? true; $('shop-source-default').checked = source?.is_default ?? false; openModal('shop-source-modal'); }
  async function saveSource(event) { event.preventDefault(); const button = $('shop-source-save'); button.disabled = true; try { const domain = $('shop-source-domain').value.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0]; const payload = { name: $('shop-source-name').value.trim(), domain, base_url: $('shop-source-url').value.trim() || `https://${domain}`, is_active: $('shop-source-active').checked, is_default: $('shop-source-default').checked, sort_order: state.editingSource?.sort_order || state.sources.length }; if (state.editingSource) await window.SHOP_API.updateProductSource(state.editingSource.id, payload); else await window.SHOP_API.createProductSource(payload); closeModal('shop-source-modal'); toast('Sursa a fost salvata.'); await loadSourcesPage(); } catch (error) { toast(error.message, 'error'); } finally { button.disabled = false; } }
  async function deleteSource(id) { const source = state.sources.find(item => item.id === id); if (!source || !confirm(`Stergi sursa ${source.domain}?`)) return; try { await window.SHOP_API.deleteProductSource(id); toast('Sursa a fost stearsa.'); await loadSourcesPage(); } catch (error) { toast(error.message, 'error'); } }
  async function syncBoomagTaxonomy(button) { if (!button || button.disabled) return; button.disabled = true; const previous = button.innerHTML; button.innerHTML = '<span>↻</span><b>Se actualizeaza structura...</b><small>Nu se importa niciun produs</small>'; try { const result = await window.SHOP_API.syncBoomagTaxonomy(); const missing = result.subcategories_without_thumbnail?.length || 0; toast(`${result.categories} categorii · ${result.manufacturers} producatori · ${result.compatibilities} compatibilitati · ${result.subcategories_with_thumbnail} miniaturi${missing ? ` · ${missing} lipsa` : ''}. Produse importate: ${result.products_imported}.`); await loadSourcesPage(); } catch (error) { button.disabled = false; button.innerHTML = previous; toast(error.message, 'error'); } }
  async function syncBoomagStock(button) { if (!button || button.disabled) return; button.disabled = true; const previous = button.innerHTML; button.innerHTML = '<span>↻</span><b>Se actualizeaza preturile si stocul...</b><small>Feedul furnizorului este procesat</small>'; try { const result = await window.SHOP_API.syncBoomagStock(); toast(`${result.matched_products} produse gasite · ${result.prices_changed} preturi si ${result.stocks_changed} stocuri modificate.`); await loadSourcesPage(); } catch (error) { button.disabled = false; button.innerHTML = previous; toast(error.message, 'error'); } }

  async function loadSuppliers() {
    loading('shop-suppliers-content', 'Se incarca furnizorii...');
    try {
      const suppliers = await window.SHOP_API.listSuppliers();
      state.suppliers = Array.isArray(suppliers) ? suppliers : [];
      renderSuppliers();
    } catch (error) { failure('shop-suppliers-content', error); }
  }
  function supplierIconSvg(kind) {
    const paths = {
      building: '<path d="M4 21h16M6 21V5l8-3v19M14 8h4v13M9 7h2M9 11h2M9 15h2M17 11h1M17 15h1"></path>',
      user: '<path d="M20 21a8 8 0 0 0-16 0"></path><circle cx="12" cy="7" r="4"></circle>',
      phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2.1Z"></path>',
      mail: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 7 9 6 9-6"></path>',
      location: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2.5"></circle>',
      web: '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"></path>',
      edit: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path>',
      trash: '<path class="shop-supplier-trash-shape" d="M7 21c-.55 0-1.02-.2-1.41-.59C5.2 20.02 5 19.55 5 19V6H4V4h5V3h6v1h5v2h-1v13c0 .55-.2 1.02-.59 1.41-.39.39-.86.59-1.41.59H7Zm2-4h2V8H9v9Zm4 0h2V8h-2v9Z"></path>',
      plus: '<path d="M12 5v14M5 12h14"></path>',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[kind] || paths.building}</svg>`;
  }
  function supplierContactItem(icon, label, value) {
    if (!value) return '';
    return `<span class="shop-supplier-contact"><i aria-hidden="true">${supplierIconSvg(icon)}</i><span><small>${esc(label)}</small><strong>${esc(value)}</strong></span></span>`;
  }
  function renderSuppliers() {
    const active = state.suppliers.filter(item => item.is_active).length;
    const withContact = state.suppliers.filter(item => item.email || item.phone).length;
    const cards = state.suppliers.map((supplier, index) => `<article class="shop-supplier-card ${supplier.is_active ? '' : 'is-inactive'}" style="--supplier-index:${index}">
      <span class="shop-supplier-avatar"><i></i>${supplierIconSvg('building')}</span>
      <div class="shop-supplier-card-content">
        <div class="shop-supplier-heading"><span class="shop-supplier-name"><small>${[supplier.cui ? `CUI ${esc(supplier.cui)}` : '', supplier.registration_number ? `RC ${esc(supplier.registration_number)}` : ''].filter(Boolean).join(' · ') || 'DATE FISCALE NEADĂUGATE'}</small><strong>${esc(supplier.name)}</strong><em>${supplierIconSvg('user')}${esc(supplier.contact_person || 'Persoana de contact necompletata')}</em></span><span class="shop-supplier-status ${supplier.is_active ? 'active' : 'inactive'}"><i></i>${supplier.is_active ? 'Activ' : 'Inactiv'}</span></div>
        <div class="shop-supplier-contacts">${supplierContactItem('phone', 'Telefon', supplier.phone)}${supplierContactItem('mail', 'E-mail', supplier.email)}${supplierContactItem('location', 'Adresa', supplier.address)}${supplierContactItem('web', 'Website', String(supplier.website || '').replace(/^https?:\/\//i, ''))}${!supplier.phone && !supplier.email && !supplier.address && !supplier.website ? `<button type="button" class="shop-supplier-no-contact" data-supplier-edit="${esc(supplier.id)}">${supplierIconSvg('plus')}<span><strong>Completeaza datele de contact</strong><small>Telefon, e-mail, adresa sau website</small></span></button>` : ''}</div>
        ${supplier.notes ? `<p class="shop-supplier-notes">${esc(supplier.notes)}</p>` : ''}
      </div>
      <aside class="shop-supplier-actions"><button type="button" class="shop-supplier-edit" data-supplier-products="${esc(supplier.id)}">${supplierIconSvg('web')}<span>Produse asociate</span></button><button type="button" class="shop-supplier-edit" data-supplier-edit="${esc(supplier.id)}">${supplierIconSvg('edit')}<span>Editeaza</span></button><button type="button" class="shop-supplier-delete" data-supplier-delete="${esc(supplier.id)}" aria-label="Sterge furnizorul" title="Sterge furnizorul">${supplierIconSvg('trash')}</button></aside><div class="shop-supplier-products" id="shop-supplier-products-${esc(supplier.id)}" hidden></div>
    </article>`).join('');
    $('shop-suppliers-content').innerHTML = `<section class="shop-supplier-summary"><div><small>PARTENERI SALVATI</small><strong>${state.suppliers.length}</strong><span>furnizori in baza comuna</span></div><div class="active"><small>FURNIZORI ACTIVI</small><strong>${active}</strong><span>disponibili pentru achizitii</span></div><div><small>CU DATE DE CONTACT</small><strong>${withContact}</strong><span>telefon sau e-mail completat</span></div></section><section class="shop-supplier-grid">${cards || empty('Niciun furnizor', 'Adauga prima firma partenera si datele de contact.')}</section>`;
    $('shop-suppliers-content').querySelectorAll('[data-supplier-edit]').forEach(button => button.addEventListener('click', () => openSupplier(button.dataset.supplierEdit)));
    $('shop-suppliers-content').querySelectorAll('[data-supplier-products]').forEach(button => button.addEventListener('click', () => void toggleSupplierProducts(button.dataset.supplierProducts)));
    $('shop-suppliers-content').querySelectorAll('[data-supplier-delete]').forEach(button => button.addEventListener('click', () => deleteSupplier(button.dataset.supplierDelete)));
  }
  async function toggleSupplierProducts(id) {
    const panel = $(`shop-supplier-products-${id}`); if (!panel) return;
    if (!panel.hidden) { panel.hidden = true; return; }
    panel.hidden = false; panel.innerHTML = '<div class="shop-commerce-loading">Se incarca produsele asociate...</div>';
    try {
      const references = await window.SHOP_API.listSupplierProducts(id);
      state.supplierProductsBySupplier[id] = Array.isArray(references) ? references : [];
      state.supplierProductPages[id] = 1;
      renderSupplierProductsPage(id);
    } catch (error) { panel.innerHTML = `<p>${esc(error.message)}</p>`; }
  }

  function supplierPageNumbers(page, totalPages) {
    const values = [];
    for (let value = 1; value <= totalPages; value += 1) {
      if (value === 1 || value === totalPages || Math.abs(value - page) <= 2) values.push(value);
      else if (values[values.length - 1] !== '…') values.push('…');
    }
    return values;
  }

  function renderSupplierProductsPage(id) {
    const panel = $(`shop-supplier-products-${id}`); if (!panel) return;
    const references = state.supplierProductsBySupplier[id] || [];
    if (!references.length) { panel.innerHTML = '<p class="shop-supplier-products-empty">Niciun produs asociat acestui furnizor.</p>'; return; }
    const pageSize = 5;
    const totalPages = Math.max(1, Math.ceil(references.length / pageSize));
    const page = Math.min(totalPages, Math.max(1, Number(state.supplierProductPages[id] || 1)));
    state.supplierProductPages[id] = page;
    const rows = references.slice((page - 1) * pageSize, page * pageSize).map(reference => {
      const image = reference.product_image_url ? `<img src="${esc(reference.product_image_url)}" alt="" />` : `<span>${nirUiIcon('product')}</span>`;
      return `<article class="shop-supplier-product-row ${reference.is_active ? '' : 'inactive'}"><div class="shop-supplier-product-image">${image}</div><div class="shop-supplier-product-copy"><strong>${esc(reference.product_name)}</strong><span><b>${esc(reference.supplier_product_code_original)}</b><em>${esc(reference.product_sku || 'Fara SKU')}</em></span><small>${reference.last_confirmed_price_ron ? `Ultimul pret confirmat ${money(reference.last_confirmed_price_ron)}` : 'Inca nu are o achizitie confirmata'}</small></div><b class="shop-supplier-product-state ${reference.is_active ? 'active' : ''}">${reference.is_active ? 'ACTIV' : 'INACTIV'}</b></article>`;
    }).join('');
    const numbers = supplierPageNumbers(page, totalPages).map(value => value === '…' ? '<i>…</i>' : `<button type="button" data-supplier-products-page="${value}" class="${value === page ? 'active' : ''}">${value}</button>`).join('');
    panel.innerHTML = `<header class="shop-supplier-products-head"><div><small>CATALOG ASOCIAT</small><strong>Produse si coduri de furnizor</strong><span>Afisam cate 5 produse pentru o lista usor de urmarit.</span></div><b><strong>${references.length}</strong><small>PRODUSE ASOCIATE</small></b></header><div class="shop-supplier-product-list">${rows}</div><nav class="shop-supplier-products-pagination" aria-label="Paginare produse asociate"><button type="button" data-supplier-products-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>‹</button>${numbers}<button type="button" data-supplier-products-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>›</button><span>Pagina ${page} din ${totalPages}</span></nav>`;
    panel.querySelectorAll('[data-supplier-products-page]').forEach(button => button.addEventListener('click', () => { state.supplierProductPages[id] = Number(button.dataset.supplierProductsPage || 1); renderSupplierProductsPage(id); }));
  }
  function openSupplier(id = '') {
    const supplier = state.suppliers.find(item => String(item.id) === String(id)) || null;
    state.editingSupplier = supplier;
    $('shop-supplier-title').textContent = supplier ? 'Editeaza furnizorul' : 'Furnizor nou';
    $('shop-supplier-name').value = supplier?.name || '';
    $('shop-supplier-cui').value = supplier?.cui || '';
    $('shop-supplier-registration').value = supplier?.registration_number || '';
    $('shop-supplier-contact').value = supplier?.contact_person || '';
    $('shop-supplier-phone').value = supplier?.phone || '';
    $('shop-supplier-email').value = supplier?.email || '';
    $('shop-supplier-website').value = supplier?.website || '';
    $('shop-supplier-address').value = supplier?.address || '';
    $('shop-supplier-notes').value = supplier?.notes || '';
    $('shop-supplier-active').checked = supplier?.is_active ?? true;
    openModal('shop-supplier-modal');
    requestAnimationFrame(() => $('shop-supplier-name')?.focus({ preventScroll: true }));
  }
  async function saveSupplier(event) {
    event.preventDefault();
    const button = $('shop-supplier-save');
    button.disabled = true;
    try {
      let website = $('shop-supplier-website').value.trim();
      if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
      const payload = {
        name: $('shop-supplier-name').value.trim(),
        cui: $('shop-supplier-cui').value.trim().toUpperCase(),
        registration_number: $('shop-supplier-registration').value.trim().toUpperCase(),
        contact_person: $('shop-supplier-contact').value.trim(),
        phone: $('shop-supplier-phone').value.trim(),
        email: $('shop-supplier-email').value.trim().toLowerCase(),
        website,
        address: $('shop-supplier-address').value.trim(),
        notes: $('shop-supplier-notes').value.trim(),
        is_active: $('shop-supplier-active').checked,
      };
      const savedSupplier = state.editingSupplier
        ? await window.SHOP_API.updateSupplier(state.editingSupplier.id, payload)
        : await window.SHOP_API.createSupplier(payload);
      closeModal('shop-supplier-modal');
      toast('Furnizorul a fost salvat.');
      await loadSuppliers();
      if (state.nirPendingSupplierCreate && state.nirEditor && savedSupplier) {
        state.nirPendingSupplierCreate = false;
        state.nirEditor.supplier_id = savedSupplier.id;
        state.nirEditor.supplier_name = savedSupplier.name;
        if (!state.suppliers.some(item => item.id === savedSupplier.id)) state.suppliers.push(savedSupplier);
        renderNirEditor(); scheduleNirAutosave();
      }
    } catch (error) { toast(error.message || 'Furnizorul nu a putut fi salvat.', 'error'); }
    finally { button.disabled = false; }
  }
  async function deleteSupplier(id) {
    const supplier = state.suppliers.find(item => String(item.id) === String(id));
    if (!supplier || !confirm(`Stergi furnizorul „${supplier.name}”?`)) return;
    try {
      await window.SHOP_API.deleteSupplier(supplier.id);
      toast('Furnizorul a fost sters.');
      await loadSuppliers();
    } catch (error) { toast(error.message || 'Furnizorul nu a putut fi sters.', 'error'); }
  }

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
        const progress = openStripeSyncProgress();
        button.disabled = true;
        button.textContent = 'Se sincronizeaza...';
        try {
          const result = await window.SHOP_API.syncStripeCatalog(next => progress.update(next));
          progress.complete(result);
          toast(`${result.synced} produse sincronizate${result.errors.length ? ` · ${result.errors.length} erori` : ''}.`, result.errors.length ? 'error' : 'success');
          await new Promise(resolve => setTimeout(resolve, 900));
          progress.close();
          await loadPayments();
        } catch (error) {
          progress.fail(error.message || 'Sincronizarea nu a putut continua.');
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

  async function loadShippingPage() { loading('shop-shipping-content', 'Se incarca livrarile...'); try { const shipping = await window.SHOP_API.listShippingMethods(); state.shipping = Array.isArray(shipping) ? shipping : []; renderShipping(); } catch (error) { failure('shop-shipping-content', error); } }
  function renderShipping() {
    const courierIcon = `<svg class="shop-courier-truck" viewBox="0 0 48 32" aria-hidden="true" focusable="false">
      <g class="shop-courier-speed"><path d="M2 8h8"></path><path d="M1 13h6"></path><path d="M4 18h5"></path></g>
      <g class="shop-courier-vehicle"><path class="shop-courier-box" d="M10 5h20v17H10Z"></path><path class="shop-courier-cab" d="M30 11h7l6 6v5H30Z"></path><path class="shop-courier-window" d="M33 13h3l3.6 4H33Z"></path><path class="shop-courier-mark" d="m17 11 3 3 5-6"></path><circle class="shop-courier-wheel wheel-one" cx="17" cy="24" r="3"></circle><circle class="shop-courier-wheel wheel-two" cx="36" cy="24" r="3"></circle><circle class="shop-courier-hub" cx="17" cy="24" r=".8"></circle><circle class="shop-courier-hub" cx="36" cy="24" r=".8"></circle></g>
      <path class="shop-courier-road" d="M6 29h38"></path>
    </svg>`;
    $('shop-shipping-content').innerHTML = state.shipping.map((item, index) => `<article class="shop-settings-row shop-shipping-row" style="--shipping-index:${index}"><span class="shop-settings-icon shop-courier-icon">${courierIcon}</span><div><strong>${esc(item.name)}</strong><small>${item.cost ? money(item.cost) : 'Gratuit'}${item.free_above !== null ? ` · gratuit peste ${money(item.free_above)}` : ''}</small><em>${esc(item.eta_label || item.description || '')}</em></div>${!item.is_active ? '<b class="commerce-pill inactive">INACTIVA</b>' : ''}<button data-shipping-edit="${item.id}" aria-label="Editeaza livrarea" title="Editeaza livrarea">✎</button><button class="danger" data-shipping-delete="${item.id}" aria-label="Sterge livrarea" title="Sterge livrarea">×</button></article>`).join('') || empty('Nicio metoda de livrare', 'Adauga prima livrare.');
    $('shop-shipping-content').querySelectorAll('[data-shipping-edit]').forEach(button => button.addEventListener('click', () => openShipping(button.dataset.shippingEdit)));
    $('shop-shipping-content').querySelectorAll('[data-shipping-delete]').forEach(button => button.addEventListener('click', () => deleteShipping(button.dataset.shippingDelete)));
  }
  function openShipping(id = '') { const item = state.shipping.find(entry => entry.id === id) || null; state.editingShipping = item; $('shop-shipping-title').textContent = item ? 'Editeaza livrarea' : 'Livrare noua'; $('shop-shipping-name').value = item?.name || ''; $('shop-shipping-description').value = item?.description || ''; $('shop-shipping-cost').value = item?.cost ?? 0; $('shop-shipping-free').value = item?.free_above ?? ''; $('shop-shipping-eta').value = item?.eta_label || ''; $('shop-shipping-active').checked = item?.is_active ?? true; openModal('shop-shipping-modal'); }
  async function saveShipping(event) { event.preventDefault(); const button = $('shop-shipping-save'); button.disabled = true; try { const payload = { name: $('shop-shipping-name').value.trim(), description: $('shop-shipping-description').value.trim(), cost: Number($('shop-shipping-cost').value || 0), free_above: $('shop-shipping-free').value === '' ? null : Number($('shop-shipping-free').value), eta_label: $('shop-shipping-eta').value.trim(), is_active: $('shop-shipping-active').checked, sort_order: state.editingShipping?.sort_order || state.shipping.length }; if (state.editingShipping) await window.SHOP_API.updateShippingMethod(state.editingShipping.id, payload); else await window.SHOP_API.createShippingMethod(payload); closeModal('shop-shipping-modal'); toast('Livrarea a fost salvata.'); await loadShippingPage(); } catch (error) { toast(error.message, 'error'); } finally { button.disabled = false; } }
  async function deleteShipping(id) { const item = state.shipping.find(entry => entry.id === id); if (!item || !confirm(`Stergi metoda ${item.name}?`)) return; try { await window.SHOP_API.deleteShippingMethod(id); toast('Livrarea a fost stearsa.'); await loadShippingPage(); } catch (error) { toast(error.message, 'error'); } }

  function dateTime(value) {
    if (!value) return '—';
    const parsed = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' });
  }

  async function loadCustomers() {
    loading('shop-customers-content', 'Se incarca clientii...');
    try {
      const customers = await window.SHOP_API.listCustomers();
      state.customers = Array.isArray(customers) ? customers : [];
      renderCustomers();
    } catch (error) { failure('shop-customers-content', error); }
  }

  function customerPaginationItems(totalPages, currentPage) {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
    const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
    if (currentPage <= 3) [2, 3, 4].forEach(page => pages.add(page));
    if (currentPage >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach(page => pages.add(page));
    const ordered = [...pages].filter(page => page > 0 && page <= totalPages).sort((a, b) => a - b);
    return ordered.flatMap((page, index) => index && page - ordered[index - 1] > 1 ? ['…', page] : [page]);
  }
  function filteredCustomers() {
    const query = String(state.customerQuery || '').trim().toLocaleLowerCase('ro-RO');
    if (!query) return state.customers;
    return state.customers.filter(customer => [customer.full_name, customer.email, customer.phone].some(value => String(value || '').toLocaleLowerCase('ro-RO').includes(query)));
  }
  function renderCustomerResults() {
    const host = $('shop-customer-results');
    if (!host) return;
    const filtered = filteredCustomers();
    const pageSize = state.pageSizes.customers;
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    state.pages.customers = Math.max(1, Math.min(Number(state.pages.customers || 1), totalPages));
    const start = (state.pages.customers - 1) * pageSize;
    const visible = filtered.slice(start, start + pageSize);
    const rows = visible.map((customer, index) => `<button type="button" class="shop-customer-card" style="--customer-index:${index}" data-customer-open="${esc(customer.id)}"><span class="shop-customer-avatar">${esc(String(customer.full_name || customer.email || '?').trim().charAt(0).toUpperCase())}<i class="${customer.is_active ? '' : 'off'}"></i></span><span class="shop-customer-copy"><strong>${esc(customer.full_name || 'Client fara nume')}</strong><small>${esc(customer.email)}${customer.phone ? ` · ${esc(customer.phone)}` : ''}</small><em>Ultima comanda: ${esc(dateTime(customer.last_order_at))}</em></span><span class="shop-customer-numbers"><b>${Number(customer.orders_count || 0)} comenzi</b><strong>${money(customer.orders_total)}</strong></span><span class="commerce-pill ${customer.is_active ? 'active' : 'inactive'}">${customer.is_active ? 'ACTIV' : 'DEZACTIVAT'}</span><i aria-hidden="true">›</i></button>`).join('');
    const pageItems = customerPaginationItems(totalPages, state.pages.customers);
    const pager = filtered.length ? `<nav class="shop-customer-pagination" aria-label="Paginile clientilor"><button type="button" class="direction" data-customer-page="${state.pages.customers - 1}" ${state.pages.customers === 1 ? 'disabled' : ''} aria-label="Pagina anterioara">‹</button>${pageItems.map(item => item === '…' ? '<span>…</span>' : `<button type="button" data-customer-page="${item}" class="${item === state.pages.customers ? 'active' : ''}" ${item === state.pages.customers ? 'aria-current="page"' : ''}>${item}</button>`).join('')}<button type="button" class="direction" data-customer-page="${state.pages.customers + 1}" ${state.pages.customers === totalPages ? 'disabled' : ''} aria-label="Pagina urmatoare">›</button></nav>` : '';
    host.innerHTML = `<div class="shop-customer-list">${rows || empty('Niciun client gasit', 'Incearca alt nume, e-mail sau numar de telefon.')}</div>${pager}`;
    const counter = $('shop-customer-result-count');
    if (counter) counter.textContent = `${filtered.length} ${filtered.length === 1 ? 'client' : 'clienti'}${filtered.length ? ` · pagina ${state.pages.customers} din ${totalPages}` : ''}`;
    const clear = $('shop-customer-search-clear');
    if (clear) clear.hidden = !state.customerQuery;
    host.querySelectorAll('[data-customer-open]').forEach(button => button.addEventListener('click', () => openCustomer(button.dataset.customerOpen)));
    host.querySelectorAll('[data-customer-page]').forEach(button => button.addEventListener('click', () => {
      const page = Number(button.dataset.customerPage || 1);
      if (button.disabled || page === state.pages.customers) return;
      state.pages.customers = page;
      renderCustomerResults();
      $('shop-customer-search')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }));
  }
  function renderCustomers() {
    const active = state.customers.filter(item => item.is_active).length;
    const orders = state.customers.reduce((sum, item) => sum + Number(item.orders_count || 0), 0);
    const value = state.customers.reduce((sum, item) => sum + Number(item.orders_total || 0), 0);
    const searchIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>';
    $('shop-customers-content').innerHTML = `<section class="shop-customer-metrics">${detailMetric('Clienti inregistrati', state.customers.length)}${detailMetric('Conturi active', active, true)}${detailMetric('Comenzi asociate', orders)}${detailMetric('Valoare comenzi', money(value))}</section><section class="shop-customer-search-panel"><span class="shop-customer-search-icon">${searchIcon}</span><label for="shop-customer-search"><small>CAUTA UN CLIENT</small><input id="shop-customer-search" type="search" value="${esc(state.customerQuery)}" placeholder="Nume, adresa de e-mail sau telefon" autocomplete="off" /></label><span id="shop-customer-result-count" class="shop-customer-result-count"></span><button type="button" id="shop-customer-search-clear" class="shop-customer-search-clear" aria-label="Sterge cautarea">×</button></section><div id="shop-customer-results"></div>`;
    const search = $('shop-customer-search');
    search.addEventListener('input', () => { state.customerQuery = search.value; state.pages.customers = 1; renderCustomerResults(); });
    $('shop-customer-search-clear').addEventListener('click', () => { state.customerQuery = ''; state.pages.customers = 1; search.value = ''; search.focus(); renderCustomerResults(); });
    renderCustomerResults();
  }

  async function openCustomer(id) {
    $('shop-customer-title').textContent = 'Se incarca...';
    $('shop-customer-details').innerHTML = '<div class="shop-commerce-loading">Se pregateste fisa clientului...</div>';
    openModal('shop-customer-modal');
    try {
      const customer = await window.SHOP_API.getCustomer(id);
      state.customerDetail = customer;
      state.pages.customerOrders = 1;
      $('shop-customer-title').textContent = customer.full_name || customer.email;
      $('shop-customer-status').textContent = customer.is_active ? 'Dezactiveaza contul' : 'Reactiveaza contul';
      $('shop-customer-status').classList.toggle('danger', customer.is_active);
      renderCustomerDetail();
    } catch (error) { $('shop-customer-details').innerHTML = `<div class="shop-commerce-error">${esc(error.message)}</div>`; }
  }

  function renderCustomerDetail() {
    const customer = state.customerDetail;
    if (!customer) return;
    const allOrders = Array.isArray(customer.orders) ? customer.orders : [];
    const pageSize = state.pageSizes.customerOrders;
    const totalPages = Math.max(1, Math.ceil(allOrders.length / pageSize));
    state.pages.customerOrders = Math.max(1, Math.min(Number(state.pages.customerOrders || 1), totalPages));
    const start = (state.pages.customerOrders - 1) * pageSize;
    const visibleOrders = allOrders.slice(start, start + pageSize);
    const orders = visibleOrders.map((order, index) => `<button type="button" class="shop-customer-order" style="--customer-order-index:${index}" data-customer-order="${esc(order.id)}"><span><strong>${esc(order.order_number)}</strong><small>${esc(dateTime(order.created_at))}</small></span><span><em class="commerce-pill" style="--pill:${statusColors[order.status] || '#aaa'}">${esc(statusLabels[order.status] || order.status)}</em><b>${money(order.total)}</b></span><i>›</i></button>`).join('');
    const pageItems = customerPaginationItems(totalPages, state.pages.customerOrders);
    const pager = allOrders.length ? `<nav class="shop-customer-pagination compact" aria-label="Paginile comenzilor clientului"><button type="button" class="direction" data-customer-orders-page="${state.pages.customerOrders - 1}" ${state.pages.customerOrders === 1 ? 'disabled' : ''}>‹</button>${pageItems.map(item => item === '…' ? '<span>…</span>' : `<button type="button" data-customer-orders-page="${item}" class="${item === state.pages.customerOrders ? 'active' : ''}">${item}</button>`).join('')}<button type="button" class="direction" data-customer-orders-page="${state.pages.customerOrders + 1}" ${state.pages.customerOrders === totalPages ? 'disabled' : ''}>›</button></nav>` : '';
    $('shop-customer-details').innerHTML = `<section class="shop-customer-profile"><span class="shop-customer-avatar large">${esc(String(customer.full_name || customer.email || '?').trim().charAt(0).toUpperCase())}</span><div><small>CLIENT G-TROTS</small><h3>${esc(customer.full_name || 'Client fara nume')}</h3><p>${esc(customer.email)}${customer.phone ? ` · ${esc(customer.phone)}` : ''}</p><em>Cont creat ${esc(dateTime(customer.created_at))} · ultima autentificare ${esc(dateTime(customer.last_login_at))}</em></div><span class="commerce-pill ${customer.is_active ? 'active' : 'inactive'}">${customer.is_active ? 'CONT ACTIV' : 'CONT DEZACTIVAT'}</span></section><section class="shop-customer-metrics modal-metrics">${detailMetric('Comenzi', Number(customer.orders_count || 0))}${detailMetric('Valoare totala', money(customer.orders_total), true)}${detailMetric('Ultima comanda', dateTime(customer.orders?.[0]?.created_at))}</section>${section('01', 'Comenzile clientului', `${allOrders.length} comenzi · pagina ${state.pages.customerOrders} din ${totalPages}`)}<div class="shop-customer-orders">${orders || empty('Nicio comanda', 'Clientul nu are inca nicio comanda asociata.')}</div>${pager}`;
    $('shop-customer-details').querySelectorAll('[data-customer-order]').forEach(button => button.addEventListener('click', () => { closeModal('shop-customer-modal'); setTimeout(() => openOrder(button.dataset.customerOrder), 190); }));
    $('shop-customer-details').querySelectorAll('[data-customer-orders-page]').forEach(button => button.addEventListener('click', () => {
      const page = Number(button.dataset.customerOrdersPage || 1);
      if (button.disabled || page === state.pages.customerOrders) return;
      state.pages.customerOrders = page;
      renderCustomerDetail();
    }));
  }

  async function toggleCustomerStatus() {
    const customer = state.customerDetail;
    if (!customer) return;
    const next = !customer.is_active;
    if (!next && !confirm(`Dezactivezi contul lui ${customer.full_name || customer.email}? Sesiunile active vor fi inchise.`)) return;
    const button = $('shop-customer-status'); button.disabled = true;
    try {
      await window.SHOP_API.updateCustomerStatus(customer.id, next);
      toast(next ? 'Contul clientului a fost reactivat.' : 'Contul clientului a fost dezactivat.');
      await loadCustomers();
      await openCustomer(customer.id);
    } catch (error) { toast(error.message, 'error'); }
    finally { button.disabled = false; }
  }

  async function loadPromotions() {
    loading('shop-discounts-content', 'Se incarca reducerile...');
    try {
      const promotions = await window.SHOP_API.listPromotions();
      state.promotions = Array.isArray(promotions) ? promotions : [];
      renderPromotions();
    } catch (error) { failure('shop-discounts-content', error); }
  }

  async function ensurePromotionProducts(query = '', ids = []) {
    const cleanQuery = String(query || '').trim();
    const cleanIds = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))];
    if (!cleanQuery && !cleanIds.length) {
      state.products = [];
      renderPromotionProductPicker();
      return;
    }
    state.promotionProductsLoading = true;
    if (!$('shop-promotion-product-wrap').hidden) renderPromotionProductPicker();
    try {
      const products = await window.SHOP_API.listProductOptions({ q: cleanQuery, ids: cleanIds, limit: cleanIds.length ? 250 : 40 });
      state.products = Array.isArray(products) ? products : [];
    } catch (error) {
      if (!$('shop-promotion-product-wrap').hidden) $('shop-promotion-product-results').innerHTML = '<p class="shop-promotion-product-empty">' + esc(error.message || 'Produsele nu s-au putut incarca.') + '</p>';
    } finally {
      state.promotionProductsLoading = false;
      if (!$('shop-promotion-product-wrap').hidden) renderPromotionProductPicker();
    }
  }

  function promotionValue(item) { return item.discount_type === 'percent' ? `${Number(item.discount_value)}%` : money(item.discount_value); }
  function promotionAudience(item) { return item.audience === 'selected' ? `${Number(item.customer_count || 0)} clienti selectati` : item.audience === 'registered' ? 'Doar clienti autentificati' : 'Toti clientii'; }
  function promotionStatus(item) {
    if (!item?.is_active) return { key: 'off', label: 'OPRITA' };
    const rawUntil = String(item.valid_until || '').trim();
    const validUntil = rawUntil ? new Date(rawUntil.replace(' ', 'T')) : null;
    if (validUntil && !Number.isNaN(validUntil.getTime()) && validUntil.getTime() < Date.now()) return { key: 'expired', label: 'EXPIRATA' };
    return { key: 'active', label: 'ACTIVA' };
  }
  function renderPromotions() {
    const active = state.promotions.filter(item => promotionStatus(item).key === 'active').length;
    const banners = state.promotions.filter(item => promotionStatus(item).key === 'active' && item.show_banner).length;
    const applications = state.promotions.reduce((sum, item) => sum + Number(item.application_count || 0), 0);
    const totalDiscount = state.promotions.reduce((sum, item) => sum + Number(item.total_discount_given || 0), 0);
    const cards = state.promotions.map(item => {
      const status = promotionStatus(item);
      return `<article class="shop-promotion-card ${status.key === 'off' ? 'is-off' : ''} ${status.key === 'expired' ? 'is-expired' : ''}" data-promotion-open="${esc(item.id)}"><span class="shop-promotion-icon">%</span><div class="shop-promotion-copy"><div class="shop-promotion-titleline"><span><small>COD ${esc(item.code)}</small><strong>${esc(item.title)}</strong></span><div class="shop-promotion-value"><b>${esc(promotionValue(item))}</b><span>${item.scope === 'product' ? `${Number(item.product_ids?.length || 0)} produse selectate` : 'Toata comanda'}</span></div></div><div class="shop-promotion-inline-badges"><span><b>PUBLIC</b>${esc(promotionAudience(item))}</span><span><b>PERIOADA</b>${esc(dateTime(item.valid_from))} — ${esc(dateTime(item.valid_until))}</span><span>${item.auto_apply ? 'AUTOMATA' : 'COD MANUAL'}</span>${item.show_banner ? '<span>BARA SITE</span>' : ''}<span class="open-stats">STATISTICI LA APASARE</span></div></div><div class="shop-promotion-actions"><span class="commerce-pill ${status.key}">${status.label}</span><button type="button" data-promotion-edit="${esc(item.id)}" aria-label="Editeaza"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.25-1 10.5-10.5-3.25-3.25L5 15.75Z"></path><path d="m13.75 7 3.25 3.25"></path></svg></button><button type="button" class="danger" data-promotion-delete="${esc(item.id)}" aria-label="Sterge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13"></path></svg></button><i aria-hidden="true">›</i></div></article>`;
    }).join('');
    $('shop-discounts-content').innerHTML = `<section class="shop-customer-metrics">${detailMetric('Campanii', state.promotions.length)}${detailMetric('Active', active, true)}${detailMetric('Aplicari valide', applications)}${detailMetric('Total redus', money(totalDiscount))}</section><div class="shop-promotion-list">${cards || empty('Nicio reducere configurata', 'Adauga prima campanie promotionala G-Trots.')}</div>`;
    $('shop-discounts-content').querySelectorAll('[data-promotion-open]').forEach(card => card.addEventListener('click', event => { if (event.target.closest('button')) return; void openPromotionStats(card.dataset.promotionOpen); }));
    $('shop-discounts-content').querySelectorAll('[data-promotion-edit]').forEach(button => button.addEventListener('click', () => openPromotion(button.dataset.promotionEdit)));
    $('shop-discounts-content').querySelectorAll('[data-promotion-delete]').forEach(button => button.addEventListener('click', () => deletePromotion(button.dataset.promotionDelete)));
  }

  async function openPromotionStats(id) {
    const known = state.promotions.find(item => item.id === id);
    $('shop-promotion-stats-title').textContent = known?.title || 'Reducere';
    $('shop-promotion-stats-content').innerHTML = '<div class="shop-commerce-loading">Se incarca statisticile...</div>';
    $('shop-promotion-stats-edit').dataset.id = id;
    openModal('shop-promotion-stats-modal');
    try {
      const detail = await window.SHOP_API.getPromotionStats(id);
      const item = detail.promotion;
      const status = promotionStatus(item);
      $('shop-promotion-stats-title').textContent = item.title;
      const applications = (Array.isArray(detail.applications) ? detail.applications : []).map(order => `<button type="button" class="shop-promotion-application ${order.is_counted ? '' : 'excluded'}" data-promotion-order="${esc(order.id)}"><span><strong>${esc(order.order_number)}</strong><small>${esc(order.customer_name || order.customer_email || 'Client')} · ${esc(dateTime(order.created_at))}</small></span><span><b>-${money(order.discount_total)}</b><small>${order.is_counted ? 'Inclusa' : 'Anulata / rambursata'} · total ${money(order.total)}</small></span><i>›</i></button>`).join('');
      $('shop-promotion-stats-content').innerHTML = `<section class="shop-promotion-stats-hero"><span class="shop-promotion-icon large">%</span><div><small>COD ${esc(item.code)} · <b class="shop-promotion-status-${status.key}">${status.label}</b></small><strong>${esc(promotionValue(item))}</strong><p>${esc(item.description || 'Campanie fara descriere.')}</p></div></section><section class="shop-customer-metrics modal-metrics">${detailMetric('Aplicari valide', detail.summary.application_count, true)}${detailMetric('Total redus', money(detail.summary.total_discount_given))}${detailMetric('Medie redusa', money(detail.summary.average_discount))}${detailMetric('Valoare comenzi', money(detail.summary.orders_total))}</section><section class="shop-promotion-stats-facts"><span><b>Public</b>${esc(promotionAudience(item))}</span><span><b>Aplicare</b>${item.scope === 'global' ? 'Toata comanda' : `${Number(item.product_ids?.length || 0)} produse`}</span><span><b>Perioada</b>${esc(dateTime(item.valid_from))} — ${esc(dateTime(item.valid_until))}</span></section>${section('01', 'Aplicari recente', 'Comenzile anulate sau rambursate nu intra in totalurile campaniei.')}<div class="shop-promotion-applications">${applications || empty('Nicio aplicare', 'Primele comenzi cu aceasta reducere vor aparea aici.')}</div>`;
      $('shop-promotion-stats-content').querySelectorAll('[data-promotion-order]').forEach(button => button.addEventListener('click', () => { closeModal('shop-promotion-stats-modal'); setTimeout(() => openOrder(button.dataset.promotionOrder), 190); }));
    } catch (error) { $('shop-promotion-stats-content').innerHTML = `<div class="shop-commerce-error">${esc(error.message)}</div>`; }
  }

  function promotionDateInput(value) { return value ? String(value).replace(' ', 'T').slice(0, 16) : ''; }
  function updatePromotionProductVisibility() {
    const productScope = $('shop-promotion-scope').value === 'product';
    $('shop-promotion-product-wrap').hidden = !productScope;
    $('shop-promotion-product-shortcut').hidden = productScope;
    if (productScope) renderPromotionProductPicker();
  }
  async function ensurePromotionCustomers() {
    if (state.customers.length || state.promotionCustomersLoading) return;
    state.promotionCustomersLoading = true;
    renderPromotionCustomerPicker();
    try {
      const customers = await window.SHOP_API.listCustomers();
      state.customers = Array.isArray(customers) ? customers : [];
    } catch (error) { toast(error.message || 'Clientii nu s-au putut incarca.', 'error'); }
    finally { state.promotionCustomersLoading = false; renderPromotionCustomerPicker(); }
  }
  function updatePromotionCustomerVisibility() {
    const selectedAudience = $('shop-promotion-audience').value === 'selected';
    $('shop-promotion-customer-wrap').hidden = !selectedAudience;
    if (selectedAudience) { renderPromotionCustomerPicker(); void ensurePromotionCustomers(); }
  }
  function promotionCustomersSorted() { return [...state.customers].sort((a, b) => String(a.full_name || a.email || '').localeCompare(String(b.full_name || b.email || ''), 'ro', { sensitivity: 'base' })); }
  function promotionCustomerMatches() {
    const query = String(state.promotionCustomerQuery || '').trim().toLocaleLowerCase('ro');
    return query ? promotionCustomersSorted().filter(customer => `${customer.full_name || ''} ${customer.email || ''} ${customer.phone || ''}`.toLocaleLowerCase('ro').includes(query)) : [];
  }
  function customerInitial(customer) { return esc(String(customer.full_name || customer.email || '?').trim().charAt(0).toUpperCase()); }
  function renderPromotionCustomerPicker() {
    const wrap = $('shop-promotion-customer-wrap');
    if (!wrap || wrap.hidden) return;
    const selected = state.promotionSelectedCustomerIds;
    const all = promotionCustomersSorted();
    const matches = promotionCustomerMatches();
    const allSelected = all.length > 0 && all.every(customer => selected.has(customer.id));
    $('shop-promotion-customer-count').textContent = `${selected.size} selectati${state.promotionCustomerQuery.trim() ? ` · ${matches.length} rezultate` : ''}`;
    $('shop-promotion-customer-all').disabled = state.promotionCustomersLoading;
    $('shop-promotion-customer-all').textContent = state.promotionCustomersLoading ? 'Se incarca...' : allSelected ? 'Deselecteaza toti' : 'Selecteaza toti clientii';
    $('shop-promotion-customer-all').classList.toggle('is-all', allSelected);
    $('shop-promotion-customer-results-all').hidden = !matches.length;
    $('shop-promotion-customer-selected').innerHTML = all.filter(customer => selected.has(customer.id)).map(customer => `<button type="button" data-promotion-customer-remove="${esc(customer.id)}"><i class="shop-promotion-customer-avatar">${customerInitial(customer)}</i><span>${esc(customer.full_name || customer.email)}</span><b>×</b></button>`).join('');
    $('shop-promotion-customer-selected').hidden = selected.size === 0;
    if (state.promotionCustomersLoading && !all.length) { $('shop-promotion-customer-results').innerHTML = '<div class="shop-commerce-loading">Se incarca clientii...</div>'; return; }
    if (!state.promotionCustomerQuery.trim()) { $('shop-promotion-customer-results').innerHTML = '<p class="shop-promotion-product-empty">Cauta dupa nume, e-mail sau telefon ori selecteaza toti clientii.</p>'; }
    else $('shop-promotion-customer-results').innerHTML = matches.slice(0, 150).map(customer => { const isSelected = selected.has(customer.id); return `<button type="button" class="shop-promotion-product-result shop-promotion-customer-result ${isSelected ? 'selected' : ''}" data-promotion-customer-toggle="${esc(customer.id)}"><i class="shop-promotion-customer-avatar large">${customerInitial(customer)}</i><span><strong>${esc(customer.full_name || 'Client fara nume')}</strong><small><b>${esc(customer.email)}</b><em class="${customer.is_active ? 'in' : 'out'}">${customer.is_active ? 'Cont activ' : 'Dezactivat'}</em></small></span><i>${isSelected ? '✓' : ''}</i></button>`; }).join('') || '<p class="shop-promotion-product-empty">Nu am gasit niciun client.</p>';
    $('shop-promotion-customer-results').querySelectorAll('[data-promotion-customer-toggle]').forEach(button => button.addEventListener('click', () => { const id = button.dataset.promotionCustomerToggle; if (selected.has(id)) selected.delete(id); else selected.add(id); renderPromotionCustomerPicker(); }));
    $('shop-promotion-customer-selected').querySelectorAll('[data-promotion-customer-remove]').forEach(button => button.addEventListener('click', () => { selected.delete(button.dataset.promotionCustomerRemove); renderPromotionCustomerPicker(); }));
  }
  function toggleAllPromotionCustomers() {
    const all = promotionCustomersSorted();
    const allSelected = all.length > 0 && all.every(customer => state.promotionSelectedCustomerIds.has(customer.id));
    state.promotionSelectedCustomerIds = allSelected ? new Set() : new Set(all.map(customer => customer.id));
    renderPromotionCustomerPicker();
  }
  function promotionStockLabel(product) {
    if (product.stock_mode === 'unlimited') return ['Nelimitat', 'in'];
    return Number(product.stock_quantity || 0) > 0 ? [String(Number(product.stock_quantity)) + ' in stoc', 'in'] : ['Stoc epuizat', 'out'];
  }
  function promotionProductsSorted() {
    return [...state.products].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ro', { sensitivity: 'base' }));
  }
  async function toggleAllPromotionProducts() {
    if (state.promotionSelectingAll) return;
    state.promotionSelectingAll = true;
    renderPromotionProductPicker();
    try {
      const ids = Array.isArray(state.promotionAllProductIds) ? state.promotionAllProductIds : await window.SHOP_API.listProductOptionIds();
      state.promotionAllProductIds = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
      const allSelected = state.promotionAllProductIds.length > 0 && state.promotionAllProductIds.every(id => state.promotionSelectedProductIds.has(id));
      state.promotionSelectedProductIds = allSelected ? new Set() : new Set(state.promotionAllProductIds);
    } catch (error) {
      toast(error.message || 'Produsele nu au putut fi selectate.', 'error');
    } finally {
      state.promotionSelectingAll = false;
      renderPromotionProductPicker();
    }
  }
  function renderPromotionProductPicker() {
    const selected = state.promotionSelectedProductIds;
    const all = promotionProductsSorted();
    const query = String(state.promotionProductQuery || '').trim().toLocaleLowerCase('ro');
    const matches = all.filter(product => query && (String(product.name || '') + ' ' + String(product.sku || '') + ' ' + String(product.supplier_product_code || '')).toLocaleLowerCase('ro').includes(query));
    $('shop-promotion-product-count').textContent = selected.size + ' selectate' + (query ? ' · ' + matches.length + ' rezultate' : '');
    const knownAllIds = Array.isArray(state.promotionAllProductIds) ? state.promotionAllProductIds : [];
    const allSelected = knownAllIds.length > 0 && knownAllIds.every(id => selected.has(id));
    $('shop-promotion-product-all').disabled = state.promotionSelectingAll;
    $('shop-promotion-product-all').textContent = state.promotionSelectingAll ? 'Se selecteaza...' : allSelected ? 'Deselecteaza toate' : 'Selecteaza toate produsele';
    $('shop-promotion-product-all').classList.toggle('is-all', allSelected);
    $('shop-promotion-product-results-all').hidden = !matches.length;
    $('shop-promotion-product-selected').innerHTML = all.filter(product => selected.has(product.id)).map(product => '<button type="button" data-promotion-product-remove="' + esc(product.id) + '">' + productPicture(product.images?.[0], 'shop-promotion-product-chip-image') + '<span>' + esc(product.name) + '</span><b>×</b></button>').join('');
    $('shop-promotion-product-selected').hidden = selected.size === 0;
    if (state.promotionProductsLoading && !all.length) {
      $('shop-promotion-product-results').innerHTML = '<div class="shop-commerce-loading">Cautam produsele...</div>';
      return;
    }
    if (!query) {
      $('shop-promotion-product-results').innerHTML = '<p class="shop-promotion-product-empty">Scrie numele sau codul produsului. Catalogul nu este incarcat in fundal.</p>';
      return;
    }
    $('shop-promotion-product-results').innerHTML = matches.slice(0, 100).map(product => {
      const isSelected = selected.has(product.id);
      const stock = promotionStockLabel(product);
      return '<button type="button" class="shop-promotion-product-result ' + (isSelected ? 'selected' : '') + '" data-promotion-product-toggle="' + esc(product.id) + '">' + productPicture(product.images?.[0], 'shop-promotion-product-image') + '<span><strong>' + esc(product.name) + '</strong><small><b>' + esc(product.sku || product.supplier_product_code || 'Fara cod') + '</b><em class="' + stock[1] + '">' + esc(stock[0]) + '</em></small></span><i>' + (isSelected ? '✓' : '') + '</i></button>';
    }).join('') || '<p class="shop-promotion-product-empty">Nu am gasit niciun produs.</p>';
    $('shop-promotion-product-results').querySelectorAll('[data-promotion-product-toggle]').forEach(button => button.addEventListener('click', () => {
      const id = button.dataset.promotionProductToggle;
      if (selected.has(id)) selected.delete(id); else selected.add(id);
      renderPromotionProductPicker();
    }));
    $('shop-promotion-product-selected').querySelectorAll('[data-promotion-product-remove]').forEach(button => button.addEventListener('click', () => {
      selected.delete(button.dataset.promotionProductRemove);
      renderPromotionProductPicker();
    }));
  }
  function openPromotion(id = '') {
    const item = state.promotions.find(entry => entry.id === id) || null;
    state.editingPromotion = item;
    $('shop-promotion-title').textContent = item ? 'Editeaza reducerea' : 'Reducere noua';
    $('shop-promotion-code').value = item?.code || '';
    $('shop-promotion-name').value = item?.title || '';
    $('shop-promotion-description').value = item?.description || '';
    $('shop-promotion-type').value = item?.discount_type || 'percent';
    $('shop-promotion-value').value = item?.discount_value ?? 10;
    $('shop-promotion-minimum').value = item?.min_order_value ?? '';
    $('shop-promotion-audience').value = item?.audience || 'all';
    $('shop-promotion-scope').value = item?.scope || 'global';
    $('shop-promotion-usage').value = item?.usage_mode || 'unlimited';
    state.promotionSelectedProductIds = new Set(Array.isArray(item?.product_ids) && item.product_ids.length ? item.product_ids : item?.product_id ? [item.product_id] : []);
    state.promotionSelectedCustomerIds = new Set(Array.isArray(item?.customer_ids) ? item.customer_ids : []);
    state.promotionCustomerQuery = '';
    $('shop-promotion-customer-search').value = '';
    state.promotionAllProductIds = null;
    state.promotionSelectingAll = false;
    state.products = [];
    state.promotionProductQuery = '';
    $('shop-promotion-product-search').value = '';
    $('shop-promotion-from').value = promotionDateInput(item?.valid_from);
    $('shop-promotion-until').value = promotionDateInput(item?.valid_until);
    $('shop-promotion-banner').value = item?.banner_text || '';
    $('shop-promotion-active').checked = item?.is_active ?? true;
    $('shop-promotion-auto').checked = item?.auto_apply ?? true;
    $('shop-promotion-show-banner').checked = item?.show_banner ?? true;
    updatePromotionProductVisibility();
    updatePromotionCustomerVisibility();
    openModal('shop-promotion-modal');
    if (state.promotionSelectedProductIds.size) void ensurePromotionProducts('', [...state.promotionSelectedProductIds]);
  }

  async function savePromotion(event) {
    event.preventDefault();
    const button = $('shop-promotion-save'); button.disabled = true;
    try {
      const scope = $('shop-promotion-scope').value;
      const audience = $('shop-promotion-audience').value;
      const productIds = scope === 'product' ? [...state.promotionSelectedProductIds] : [];
      const customerIds = audience === 'selected' ? [...state.promotionSelectedCustomerIds] : [];
      const payload = { code: $('shop-promotion-code').value.trim().toUpperCase(), title: $('shop-promotion-name').value.trim(), description: $('shop-promotion-description').value.trim(), discount_type: $('shop-promotion-type').value, discount_value: Number($('shop-promotion-value').value || 0), min_order_value: $('shop-promotion-minimum').value === '' ? null : Number($('shop-promotion-minimum').value), audience, customer_ids: customerIds, scope, product_ids: productIds, product_id: productIds[0] || null, usage_mode: $('shop-promotion-usage').value, auto_apply: $('shop-promotion-auto').checked, show_banner: $('shop-promotion-show-banner').checked, banner_text: $('shop-promotion-banner').value.trim() || $('shop-promotion-name').value.trim(), valid_from: $('shop-promotion-from').value || null, valid_until: $('shop-promotion-until').value || null, is_active: $('shop-promotion-active').checked };
      if (!payload.code || !payload.title || payload.discount_value <= 0) throw new Error('Completeaza codul, titlul si o valoare valida.');
      if (scope === 'product' && !payload.product_ids.length) throw new Error('Alege cel putin un produs pentru aceasta reducere.');
      if (audience === 'selected' && !payload.customer_ids.length) throw new Error('Alege cel putin un client pentru aceasta reducere.');
      if (state.editingPromotion) await window.SHOP_API.updatePromotion(state.editingPromotion.id, payload); else await window.SHOP_API.createPromotion(payload);
      closeModal('shop-promotion-modal'); toast('Reducerea a fost salvata.'); await loadPromotions();
    } catch (error) { toast(error.message, 'error'); }
    finally { button.disabled = false; }
  }

  async function deletePromotion(id) {
    const item = state.promotions.find(entry => entry.id === id);
    if (!item || !confirm(`Stergi reducerea „${item.title}”?`)) return;
    try { await window.SHOP_API.deletePromotion(id); toast('Reducerea a fost stearsa.'); await loadPromotions(); }
    catch (error) { toast(error.message, 'error'); }
  }

  async function loadCompanies() {
    loading('shop-company-content', 'Se incarca firmele...');
    try {
      const companies = await window.SHOP_API.listCompanySettings();
      state.companies = Array.isArray(companies) ? companies : [];
      renderCompanies();
    } catch (error) { failure('shop-company-content', error); }
  }

  function renderCompanies() {
    const addButton = document.querySelector('[data-commerce-add="shop-company-content"]');
    if (addButton) {
      addButton.hidden = state.companies.length > 0;
      addButton.textContent = '+ Configureaza firma';
    }
    const completeCompanies = state.companies.filter(company => [company.legal_name, company.cui, company.address, company.email, company.phone, company.iban].filter(Boolean).length >= 5).length;
    const cards = state.companies.map((company, index) => {
      const displayName = company.trade_name || company.legal_name || 'Firma fara nume';
      const location = [company.address, company.city, company.county].filter(Boolean).join(', ');
      const contact = [company.email, company.phone].filter(Boolean).join(' · ');
      const companyIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V5.8c0-.7.4-1.3 1.1-1.6l8-3.1A1.4 1.4 0 0 1 16 2.4V21M3 21h18M9 8h3m-3 4h3m-3 4h3m4-8h2v3h-2m0 3h2v3h-2"/></svg>';
      const editIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg>';
      const deleteIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16"></path><path d="M10 11v6M14 11v6"></path><path d="M6 7l1 13h10l1-13"></path><path d="M9 7V4h6v3"></path></svg>';
      return `<article class="shop-company-card ${company.is_default ? 'is-default' : ''}" style="--company-index:${index}">
        <span class="shop-company-card-icon">${companyIcon}</span>
        <div class="shop-company-card-body">
          <header><span class="shop-company-identity"><span class="shop-company-title-line"><strong>${esc(displayName)}</strong>${company.is_default ? '<span class="shop-company-default-dot"><i></i> Implicita</span>' : '<span class="shop-company-saved-dot"><i></i> Salvata</span>'}</span><em>${esc(company.legal_name || 'Denumirea legala nu este completata')}</em></span></header>
          <div class="shop-company-badges">${company.cui ? `<span class="identity"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3 6 21M18 3l-2 18M3 9h18M2 15h18"/></svg><b>CUI</b>${esc(company.cui)}</span>` : '<span class="missing"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/></svg><b>CUI</b> necompletat</span>'}${company.registration_number ? `<span class="registry"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5l8-3 8 3v16M8 9h2m4 0h2M8 13h2m4 0h2M8 17h2m4 0h2"/></svg><b>RC</b>${esc(company.registration_number)}</span>` : ''}${company.vat_payer ? `<span class="vat"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/><path d="m19 5-14 14"/></svg><b>TVA</b>${esc(Number(company.vat_rate || 0).toLocaleString('ro-RO'))}%</span>` : '<span class="no-vat"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 8 8 8"/></svg>Neplătitoare TVA</span>'}</div>
          <div class="shop-company-info-grid">
            <span class="location" title="${esc(location || 'Adresa necompletata')}"><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg></i><small>Sediu</small><strong>${esc(location || 'Necompletat')}</strong></span>
            <span class="contact" title="${esc(contact || 'Date de contact necompletate')}"><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h3l1.2 4-2 1.5a14 14 0 0 0 5.3 5.3l1.5-2L20 14v3c0 1.1-.9 2-2 2C10.8 19 5 13.2 5 6c0-1.1.9-2 2-2Z"/></svg></i><small>Contact</small><strong>${esc(contact || 'Necompletat')}</strong></span>
            <span class="bank" title="${esc([company.bank_name, company.iban].filter(Boolean).join(' · ') || 'Date bancare necompletate')}"><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 9 9-5 9 5M5 10v8m5-8v8m4-8v8m5-8v8M3 21h18M2 18h20"/></svg></i><small>Banca</small><strong>${esc(company.bank_name || company.iban || 'Necompletat')}</strong></span>
            <span class="web" title="${esc(company.website || 'Website necompletat')}"><i><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg></i><small>Web</small><strong>${esc(company.website || 'Necompletat')}</strong></span>
          </div>
        </div>
        <aside class="shop-company-card-side">
          <span class="shop-company-stamp-state">${company.stamp_url ? `<img src="${esc(company.stamp_url)}" alt="Stampila ${esc(displayName)}" /><b>Cu stampila</b>` : '<i>◇</i><b>Fara stampila</b>'}</span>
          <span class="shop-company-actions"><button type="button" class="shop-company-edit" data-company-open="${esc(company.id)}" aria-label="Editeaza firma" title="Editeaza firma">${editIcon}<span>Editeaza</span></button>${state.companies.length > 1 ? `<button type="button" class="shop-company-delete" data-company-delete="${esc(company.id)}" aria-label="Sterge firma" title="Sterge firma">${deleteIcon}<span>Sterge</span></button>` : ''}</span>
        </aside>
      </article>`;
    }).join('');
    $('shop-company-content').innerHTML = `<section class="shop-customer-metrics shop-company-metrics">${detailMetric('Firma configurata', state.companies.length ? 'Da' : 'Nu')}${detailMetric('Societatea folosita', state.companies.find(item => item.is_default)?.trade_name || state.companies.find(item => item.is_default)?.legal_name || '—', true)}${detailMetric('Profil complet', completeCompanies ? 'Da' : 'Nu')}${detailMetric('Regim TVA', state.companies.some(item => item.vat_payer) ? 'Platitoare' : 'Neplatitoare')}</section><section class="shop-company-intro"><span>▤</span><div><small>IDENTITATEA COMPANIEI</small><strong>Date pregatite pentru documente si comenzi</strong><p>Completeaza datele juridice, contactul, banca si stampila societatii folosite in fluxurile SHOP.</p></div></section><div class="shop-company-list">${cards || empty('Nicio firma configurata', 'Configureaza societatea folosita pentru documentele G-Trots.')}</div>`;
    $('shop-company-content').querySelectorAll('[data-company-open]').forEach(button => button.addEventListener('click', () => openCompany(button.dataset.companyOpen)));
    $('shop-company-content').querySelectorAll('[data-company-delete]').forEach(button => button.addEventListener('click', () => deleteCompany(button.dataset.companyDelete)));
  }

  function companyValue(id, value = undefined) { const input = $(id); if (value === undefined) return input.value; input.value = value ?? ''; }
  function renderCompanyStamp(url = '') {
    $('shop-company-stamp-preview').innerHTML = url ? `<img src="${esc(url)}" alt="Stampila firmei" />` : '<span>Fara stampila</span>';
    $('shop-company-stamp-remove').hidden = !url;
  }
  function openCompany(id = '') {
    const company = state.companies.find(item => String(item.id) === String(id)) || null;
    state.editingCompany = company;
    state.companyStampBase64 = null;
    state.companyStampRemove = false;
    $('shop-company-title').textContent = company ? 'Editeaza firma' : 'Firma noua';
    companyValue('shop-company-legal-name', company?.legal_name || ''); companyValue('shop-company-trade-name', company?.trade_name || 'G-Trots Romania');
    companyValue('shop-company-cui', company?.cui || ''); companyValue('shop-company-registration', company?.registration_number || '');
    companyValue('shop-company-address', company?.address || ''); companyValue('shop-company-city', company?.city || ''); companyValue('shop-company-county', company?.county || ''); companyValue('shop-company-postal', company?.postal_code || '');
    companyValue('shop-company-country', company?.country || 'Romania'); companyValue('shop-company-email', company?.email || ''); companyValue('shop-company-phone', company?.phone || ''); companyValue('shop-company-website', company?.website || 'https://g-trots.ro');
    companyValue('shop-company-bank', company?.bank_name || ''); companyValue('shop-company-iban', company?.iban || ''); companyValue('shop-company-capital', company?.share_capital || '');
    $('shop-company-default').checked = company?.is_default ?? state.companies.length === 0; $('shop-company-vat').checked = company?.vat_payer ?? false; companyValue('shop-company-vat-rate', company?.vat_rate ?? 19); updateCompanyVatVisibility();
    renderCompanyStamp(company?.stamp_url || '');
    openModal('shop-company-modal');
  }
  function readCompanyStamp(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { state.companyStampBase64 = String(reader.result || ''); state.companyStampRemove = false; renderCompanyStamp(state.companyStampBase64); };
    reader.readAsDataURL(file); event.target.value = '';
  }
  function removeCompanyStamp() { state.companyStampBase64 = null; state.companyStampRemove = true; renderCompanyStamp(''); }
  function updateCompanyVatVisibility() { $('shop-company-vat-rate-wrap').hidden = !$('shop-company-vat').checked; }
  async function saveCompany(event) {
    event.preventDefault();
    const button = $('shop-company-save'); button.disabled = true;
    try {
      const payload = { legal_name: companyValue('shop-company-legal-name').trim(), trade_name: companyValue('shop-company-trade-name').trim(), cui: companyValue('shop-company-cui').trim(), registration_number: companyValue('shop-company-registration').trim(), address: companyValue('shop-company-address').trim(), city: companyValue('shop-company-city').trim(), county: companyValue('shop-company-county').trim(), postal_code: companyValue('shop-company-postal').trim(), country: companyValue('shop-company-country').trim(), email: companyValue('shop-company-email').trim(), phone: companyValue('shop-company-phone').trim(), website: companyValue('shop-company-website').trim(), bank_name: companyValue('shop-company-bank').trim(), iban: companyValue('shop-company-iban').trim().replace(/\s/g, '').toUpperCase(), share_capital: companyValue('shop-company-capital').trim(), is_default: $('shop-company-default').checked, vat_payer: $('shop-company-vat').checked, vat_rate: Number(companyValue('shop-company-vat-rate') || 19), ...(state.companyStampBase64 ? { stamp_base64: state.companyStampBase64 } : {}), ...(state.companyStampRemove ? { remove_stamp: true } : {}) };
      if (!payload.legal_name) throw new Error('Completeaza denumirea legala a firmei.');
      if (state.editingCompany) await window.SHOP_API.updateCompanySettings(state.editingCompany.id, payload); else await window.SHOP_API.createCompanySettings(payload);
      closeModal('shop-company-modal'); toast('Datele firmei au fost salvate.'); await loadCompanies();
    } catch (error) { toast(error.message || 'Firma nu a putut fi salvata.', 'error'); }
    finally { button.disabled = false; }
  }
  async function deleteCompany(id) {
    const company = state.companies.find(item => String(item.id) === String(id));
    if (!company || !confirm(`Stergi firma „${company.trade_name || company.legal_name}”?`)) return;
    try { await window.SHOP_API.deleteCompanySettings(company.id); toast('Firma a fost stearsa.'); await loadCompanies(); }
    catch (error) { toast(error.message || 'Firma nu a putut fi stearsa.', 'error'); }
  }

  const nirToday = () => new Date().toISOString().slice(0, 10);
  const nirNowTime = () => new Date().toTimeString().slice(0, 5);
  const blankNirLine = () => ({ product_id: null, product_name: '', supplier_product_reference_id: null, supplier_product_code: '', supplier_product_name: '', supplier_ean: '', purchase_unit: 'buc', stock_unit: 'buc', invoiced_quantity: '1', received_quantity: '1', accepted_quantity: '1', rejected_quantity: '0', conversion_factor: '1', unit_price: '0', discount_percent: '0', vat_rate: '19', difference_reason: null, difference_notes: '', mismatch_reason: '', is_stock_item: true });
  const nirLocalLineTotals = (line, exchangeRate = 1) => {
    const numeric = value => Number(String(value ?? 0).replace(',', '.')) || 0;
    const quantity = Math.max(0, numeric(line.accepted_quantity));
    const conversion = Math.max(0, numeric(line.conversion_factor || 1));
    const price = Math.max(0, numeric(line.unit_price));
    const discount = Math.min(100, Math.max(0, numeric(line.discount_percent)));
    const vatRate = Math.min(100, Math.max(0, numeric(line.vat_rate)));
    const rate = Math.max(0, numeric(exchangeRate || 1));
    const allocatedCost = Math.max(0, numeric(line.allocated_cost_ron));
    const net = quantity * price * (1 - discount / 100);
    const vat = net * vatRate / 100;
    const netRon = net * rate;
    const vatRon = vat * rate;
    const stockQuantity = quantity * conversion;
    const inventoryTotalRon = netRon + allocatedCost;
    return { netRon, vatRon, totalRon: netRon + vatRon, stockQuantity, inventoryTotalRon, inventoryUnitCostRon: stockQuantity > 0 ? inventoryTotalRon / stockQuantity : 0 };
  };
  const nirCurrencyCodes = (() => {
    try { return Intl.supportedValuesOf('currency'); }
    catch { return 'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XOF XPF YER ZAR ZMW ZWG'.split(' '); }
  })();
  const nirCurrencyNames = (() => { try { return new Intl.DisplayNames(['ro'], { type: 'currency' }); } catch { return null; } })();
  const nirCurrencyName = code => nirCurrencyNames?.of(code) || code;
  const nirCurrencyPicker = (value, editable) => {
    const code = String(value || 'RON').toUpperCase();
    const prioritized = [...nirCurrencyCodes].sort((a, b) => { const priority = ['RON', 'EUR', 'USD', 'GBP', 'CHF']; const ai = priority.indexOf(a); const bi = priority.indexOf(b); if (ai >= 0 || bi >= 0) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi); return nirCurrencyName(a).localeCompare(nirCurrencyName(b), 'ro'); });
    return `<div class="shop-nir-currency-field"><span>MONEDA ISO *</span><button type="button" id="shop-nir-currency-toggle" ${editable ? '' : 'disabled'} aria-haspopup="listbox" aria-expanded="false"><i>${nirUiIcon('currency')}</i><span><b>${esc(code)}</b><small>${esc(nirCurrencyName(code))}</small></span><svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg></button><div id="shop-nir-currency-panel" class="shop-nir-currency-panel" hidden><header><span>${nirUiIcon('currency')}</span><div><strong>Alege moneda facturii</strong><small>Coduri ISO · cauta dupa cod sau denumire</small></div><b>${prioritized.length} MONEDE</b></header><label>${nirUiIcon('search')}<input id="shop-nir-currency-search" autocomplete="off" placeholder="Scrie EUR, dolar, franc..." /></label><div role="listbox">${prioritized.map(currency => `<button type="button" role="option" data-nir-currency="${currency}" data-currency-search="${esc(`${currency} ${nirCurrencyName(currency)}`.toLowerCase())}" class="${currency === code ? 'active' : ''}"><b>${currency}</b><span>${esc(nirCurrencyName(currency))}</span>${currency === code ? nirUiIcon('check') : '<i>›</i>'}</button>`).join('')}</div><footer><span>Prețurile rămân în moneda facturii.</span><b>Totalurile se calculează în LEI</b></footer></div></div>`;
  };
  async function applyNirCurrency(currency) {
    const document = state.nirEditor;
    if (!document || currency === document.currency) return;
    const invoiceDate = document.supplier_invoice_date || document.nir_date || nirToday();
    document.currency = currency;
    document.exchange_rate_date = invoiceDate;
    if (currency === 'RON') {
      document.exchange_rate = '1';
      state.nirRateLoading = '';
      scheduleNirAutosave();
      renderNirEditor();
      return;
    }
    document.exchange_rate = '';
    state.nirRateLoading = currency;
    scheduleNirAutosave();
    renderNirEditor();
    try {
      const result = await window.SHOP_API.getBnrExchangeRate(currency, invoiceDate);
      if (!state.nirEditor || state.nirEditor.currency !== currency) return;
      state.nirEditor.exchange_rate = result.rate;
      state.nirEditor.exchange_rate_date = result.date;
      state.nirRateLoading = '';
      scheduleNirAutosave();
      renderNirEditor();
      toast(`Curs BNR ${currency}: ${result.rate} lei · ${result.date}`);
    } catch (error) {
      if (!state.nirEditor || state.nirEditor.currency !== currency) return;
      state.nirRateLoading = '';
      renderNirEditor();
      toast(error.message || 'Cursul BNR nu a putut fi preluat. Completeaza-l manual.', 'error');
    }
  }
  async function refreshNirBnrRate(date) {
    const document = state.nirEditor;
    if (!document || document.currency === 'RON' || !date) return;
    const currency = document.currency;
    state.nirRateLoading = currency;
    renderNirEditor();
    try {
      const result = await window.SHOP_API.getBnrExchangeRate(currency, date);
      if (!state.nirEditor || state.nirEditor.currency !== currency) return;
      state.nirEditor.exchange_rate = result.rate;
      state.nirEditor.exchange_rate_date = result.date;
      state.nirRateLoading = '';
      scheduleNirAutosave();
      renderNirEditor();
      toast(`Curs BNR ${currency}: ${result.rate} lei · ${result.date}`);
    } catch (error) {
      if (!state.nirEditor || state.nirEditor.currency !== currency) return;
      state.nirRateLoading = '';
      renderNirEditor();
      toast(error.message || 'Cursul BNR nu a putut fi preluat. Cursul ramane editabil.', 'error');
    }
  }
  const nirCan = permission => state.nirPermissions.includes(permission);
  const isNirReversalDocument = document => document?.document_kind === 'storno' || document?.source_type === 'reversal' || Boolean(document?.reversal_of_id);
  const nirHasStornoHistory = document => ['partial', 'full'].includes(String(document?.storno_state || '').toLowerCase()) || Number(document?.storned_quantity || 0) > 0;
  const isNirCorrectionLocked = document => isNirReversalDocument(document) || document?.status === 'reversed' || document?.fully_storned === true || document?.storno_complete === true || nirHasStornoHistory(document);
  const nirStornableLines = document => (document?.lines || []).filter(line => line.id && Number(line.stornable_quantity || 0) > 0);
  const canNirStorno = document => !isNirReversalDocument(document) && document?.status === 'confirmed' && [true, 1, '1'].includes(document?.can_storno) && nirStornableLines(document).length > 0;
  const nirStatus = document => {
    if (isNirReversalDocument(document)) return ['STORNAT', 'red'];
    if (document?.status === 'draft') return ['CIORNA', 'amber'];
    if (document?.status === 'confirmed' || document?.status === 'reversed') return ['CONFIRMAT', 'green'];
    return [String(document?.status || '').toUpperCase(), 'gray'];
  };
  const nirUiIcon = kind => ({
    document: '<svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5M10 12h5m-5 4h5"/></svg>',
    supplier: '<svg viewBox="0 0 24 24"><path d="M4 21V8l8-5 8 5v13M8 21v-8h8v8M8 9h.01M12 9h.01M16 9h.01"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4m8-4v4M3 10h18"/></svg>',
    currency: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.8-.7-1.7-1-3-1-1.7 0-3 1-3 2.3 0 3.5 6 1.7 6 5 0 1.4-1.3 2.4-3.1 2.4-1.4 0-2.5-.4-3.4-1.2M12 5.5v13"/></svg>',
    product: '<svg viewBox="0 0 24 24"><path d="m4 7 8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10"/></svg>',
    check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5m4-5v5"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14"/></svg>',
    reverse: '<svg viewBox="0 0 24 24"><path d="M4 9V4m0 0h5M4 4l4.2 4.2A7.5 7.5 0 1 1 6 15"/><path d="M9 12h6"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17"/></svg>',
  }[kind] || '');
  const nirStepBadge = (number, kind) => `<b class="shop-nir-step-badge">${nirUiIcon(kind)}<i>${number}</i></b>`;

  async function loadNirs(page = state.pages.nirs || 1) {
    const requestId = ++state.nirRegistryRequestId;
    const registryHost = $('shop-nir-registry');
    if (registryHost) {
      registryHost.classList.add('is-loading');
      registryHost.setAttribute('aria-busy', 'true');
    } else {
      loading('shop-nirs-content', 'Se incarca registrul NIR...');
    }
    try {
      const bootstrap = state.nirBootstrapped
        ? Promise.resolve(null)
        : Promise.all([window.SHOP_API.getNirPermissions(), window.SHOP_API.listWarehouses(), window.SHOP_API.searchSuppliers('')]);
      const [registry, lookups] = await Promise.all([
        window.SHOP_API.listNirs({ page, page_size: state.pageSizes.nirs, search: state.nirSearch, status: state.nirStatus }),
        bootstrap,
      ]);
      if (requestId !== state.nirRegistryRequestId) return;
      state.nirs = Array.isArray(registry.items) ? registry.items : [];
      state.nirRegistry = registry;
      if (lookups) {
        const [permissions, warehouses, suppliers] = lookups;
        state.nirPermissions = Array.isArray(permissions.permissions) ? permissions.permissions : [];
        state.nirWarehouses = Array.isArray(warehouses) ? warehouses : [];
        state.suppliers = Array.isArray(suppliers) ? suppliers : [];
        state.nirBootstrapped = true;
      }
      state.pages.nirs = Number(registry.page || 1);
      renderNirs();
    } catch (error) {
      if (requestId !== state.nirRegistryRequestId) return;
      if ($('shop-nir-registry')) $('shop-nir-registry').innerHTML = empty('Registrul NIR nu s-a putut încărca', error.message || 'Încearcă din nou.');
      else failure('shop-nirs-content', error);
    } finally {
      if (requestId === state.nirRegistryRequestId) {
        $('shop-nir-registry')?.classList.remove('is-loading');
        $('shop-nir-registry')?.removeAttribute('aria-busy');
      }
    }
  }

  function renderNirs() {
    const registry = state.nirRegistry || { page: 1, total_pages: 1, total: state.nirs.length };
    const cards = state.nirs.map((document, index) => {
      const [label, tone] = nirStatus(document);
      return `<button type="button" class="shop-nir-registry-card ${tone}" data-nir-open="${esc(document.id)}" style="--nir-index:${index}"><span class="shop-nir-card-mark"></span><span class="shop-nir-card-icon"><i></i>${nirUiIcon('document')}</span><span class="shop-nir-card-copy"><small>${esc(document.nir_number || document.temporary_number)}</small><strong>${esc(document.supplier_name || 'Furnizor neselectat')}</strong><span class="shop-nir-card-meta"><em>${nirUiIcon('calendar')} ${esc(document.nir_date || document.reception_date)} · ${esc(String(document.nir_time || document.reception_time || '').slice(0, 5) || '—')}</em><em>${nirUiIcon('product')} ${Number(document.line_count || 0)} produse</em><em>${nirUiIcon('document')} Factura ${esc(document.supplier_invoice_series || '')} ${esc(document.supplier_invoice_number || '—')}</em></span></span><span class="shop-nir-card-right"><b class="shop-nir-state ${tone}">${label}</b>${nirCan('NIR_VIEW_COSTS') ? `<strong>${money(document.grand_total_ron || 0)}</strong>` : ''}<small>${esc(document.currency || 'RON')}</small><i>›</i></span></button>`;
    }).join('');
    const emptyRegistry = `<div class="shop-nir-empty-modern"><span class="shop-nir-empty-orb"><i></i>${nirUiIcon('document')}</span><div><small>REGISTRU NIR</small><strong>Niciun NIR pentru filtrul ales</strong><p>${state.nirSearch ? 'Nu am gasit un document care sa corespunda cautarii.' : 'Adauga prima receptie sau alege un alt filtru.'}</p></div>${nirCan('NIR_CREATE') ? '<button type="button" data-nir-empty-create><b>+</b> NIR nou</button>' : ''}</div>`;
    const summary = `<div><span class="shop-nir-summary-icon">${nirUiIcon('document')}</span><small>TOTAL DOCUMENTE</small><strong>${Number(registry.total || 0)}</strong><span>in registrul central</span></div><div class="draft"><span class="shop-nir-summary-icon">${nirUiIcon('calendar')}</span><small>CIORNE IN PAGINA</small><strong>${state.nirs.filter(item => item.status === 'draft').length}</strong><span>fara impact in stoc</span></div><div class="confirmed"><span class="shop-nir-summary-icon">${nirUiIcon('check')}</span><small>CONFIRMATE IN PAGINA</small><strong>${state.nirs.filter(item => !isNirReversalDocument(item) && (item.status === 'confirmed' || item.status === 'reversed')).length}</strong><span>cu evaluare contabila</span></div>`;
    const filters = [['', 'Toate'], ['draft', 'Ciorne'], ['confirmed', 'Confirmate'], ['storno', 'Stornate']].map(([value, label]) => `<button type="button" data-nir-filter="${value}" class="${state.nirStatus === value ? 'active' : ''}">${label}</button>`).join('');
    const pagination = `<button type="button" data-nir-page="${Number(registry.page) - 1}" ${Number(registry.page) <= 1 ? 'disabled' : ''}>‹</button><span>Pagina <b>${Number(registry.page)}</b> din <b>${Number(registry.total_pages || 1)}</b></span><button type="button" data-nir-page="${Number(registry.page) + 1}" ${Number(registry.page) >= Number(registry.total_pages || 1) ? 'disabled' : ''}>›</button>`;
    const root = $('shop-nirs-content');
    const firstRender = !$('shop-nir-search');
    if (firstRender) {
      root.innerHTML = `<section class="shop-nir-onboarding"><div><span>FLUX GHIDAT</span><strong>De la factura furnizorului la stoc, in 5 pasi simpli</strong><small>Nimic nu se salveaza pana nu apesi butonul Salveaza.</small></div><ol><li><i>${nirUiIcon('supplier')}</i><b>1</b><span>Furnizor</span></li><li><i>${nirUiIcon('calendar')}</i><b>2</b><span>Receptie</span></li><li><i>${nirUiIcon('currency')}</i><b>3</b><span>Moneda</span></li><li><i>${nirUiIcon('product')}</i><b>4</b><span>Produse</span></li><li><i>${nirUiIcon('check')}</i><b>5</b><span>Confirmare</span></li></ol></section><section class="shop-nir-summary" id="shop-nir-summary">${summary}</section><section class="shop-nir-toolbar"><label><span class="shop-nir-search-icon">${nirUiIcon('search')}</span><input id="shop-nir-search" type="search" value="${esc(state.nirSearch)}" placeholder="Cauta dupa NIR, factura, furnizor sau CUI" autocomplete="off" /></label><div id="shop-nir-filters">${filters}</div></section><section class="shop-nir-registry" id="shop-nir-registry">${cards || emptyRegistry}</section><nav class="shop-nir-pagination" id="shop-nir-pagination">${pagination}</nav>`;
      const search = $('shop-nir-search');
      search?.addEventListener('input', event => {
        state.nirSearch = event.currentTarget.value;
        clearTimeout(state.nirSearchTimer);
        state.nirSearchTimer = setTimeout(() => { state.pages.nirs = 1; void loadNirs(1); }, 320);
      });
      search?.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault(); clearTimeout(state.nirSearchTimer); state.pages.nirs = 1; void loadNirs(1);
      });
    } else {
      $('shop-nir-summary').innerHTML = summary;
      $('shop-nir-filters').innerHTML = filters;
      $('shop-nir-registry').innerHTML = cards || emptyRegistry;
      $('shop-nir-pagination').innerHTML = pagination;
    }
    root.querySelectorAll('[data-nir-filter]').forEach(button => button.addEventListener('click', () => { state.nirStatus = button.dataset.nirFilter || ''; state.pages.nirs = 1; void loadNirs(1); }));
    root.querySelectorAll('[data-nir-page]').forEach(button => button.addEventListener('click', () => void loadNirs(Number(button.dataset.nirPage || 1))));
    root.querySelectorAll('[data-nir-open]').forEach(button => button.addEventListener('click', () => void openNir(button.dataset.nirOpen)));
    root.querySelector('[data-nir-empty-create]')?.addEventListener('click', () => void createNir());
  }

  async function createNir() {
    if (state.nirCreateInFlight || state.nirSaving) return;
    state.nirCreateInFlight = true;
    try {
      if (!state.nirWarehouses.length) state.nirWarehouses = await window.SHOP_API.listWarehouses();
      const warehouse = state.nirWarehouses.find(item => item.is_default) || state.nirWarehouses[0];
      const date = nirToday();
      const time = nirNowTime();
      state.nirEditor = {
        id: `local-nir-${Date.now()}`, temporary_number: 'NIR nesalvat', nir_number: null, status: 'draft',
        supplier_id: null, supplier_name: null, warehouse_id: warehouse?.id || '', supplier_invoice_series: null,
        supplier_invoice_number: null, supplier_invoice_date: date, nir_date: date, nir_time: time, reception_date: date, reception_time: time,
        currency: 'RON', exchange_rate: '1', exchange_rate_date: date, notes: null, source_type: 'manual',
        row_version: 0, confirmed_at: null, confirmed_by: null, reversed_at: null, reversed_by: null,
        lines: [blankNirLine()], attachments: [], permissions: state.nirPermissions,
      };
      state.nirPendingFiles = [];
      state.nirEditRevision = 0;
      state.nirCorrectionOriginal = null;
      renderNirEditor(); openModal('shop-nir-modal');
    } catch (error) { toast(error.message || 'Editorul NIR nu a putut fi deschis.', 'error'); }
    finally { setTimeout(() => { state.nirCreateInFlight = false; }, 350); }
  }

  async function openNir(id) {
    try {
      state.nirEditor = await window.SHOP_API.getNir(id);
      state.nirPendingFiles = [];
      state.nirEditRevision = 0;
      state.nirCorrectionOriginal = null;
      renderNirEditor(); openModal('shop-nir-modal');
      if (state.nirEditor.status !== 'draft') void loadNirAccountingDetails();
    } catch (error) { toast(error.message || 'NIR-ul nu a putut fi deschis.', 'error'); }
  }

  function nirInput(label, field, value, options = '') { return `<label>${label}<input data-nir-field="${field}" value="${esc(value ?? '')}" ${options} /></label>`; }
  function nirDateTimeInput(label, prefix, date, time, editable) { const value = date ? `${date}T${String(time || '00:00').slice(0, 5)}` : ''; return `<label class="shop-nir-datetime-field"><span>${label}</span><span class="shop-nir-datetime-control">${nirUiIcon('calendar')}<input data-nir-datetime="${prefix}" type="datetime-local" step="60" value="${esc(value)}" ${editable ? '' : 'disabled'} /></span><small>Alege data si ora din acelasi selector</small></label>`; }
  function updateNirLiveCalculations(lineIndex = null) {
    const document = state.nirEditor;
    const editor = $('shop-nir-editor');
    if (!document || !editor) return;
    const lineTotals = (document.lines || []).map(line => nirLocalLineTotals(line, document.exchange_rate));
    if (lineIndex !== null && document.lines?.[lineIndex]) {
      const line = document.lines[lineIndex];
      const totals = lineTotals[lineIndex];
      const row = editor.querySelectorAll('.shop-nir-line')[lineIndex];
      const summaryQuantity = row?.querySelector('.shop-nir-summary-facts>b');
      const summaryTotal = row?.querySelector('.shop-nir-summary-facts>strong');
      const lineTotal = row?.querySelector('.shop-nir-line-total span:first-child strong');
      const unitCost = row?.querySelector('.shop-nir-line-total span:last-child b');
      if (summaryQuantity) summaryQuantity.textContent = `${line.accepted_quantity || 0} ${line.stock_unit || 'buc'}`;
      if (summaryTotal) summaryTotal.textContent = money(totals.totalRon);
      if (lineTotal) lineTotal.textContent = money(totals.totalRon);
      if (unitCost) unitCost.textContent = `${money(totals.inventoryUnitCostRon)}/u`;
    }
    const quantities = (document.lines || []).reduce((summary, line, index) => ({
      invoiced: summary.invoiced + Number(line.invoiced_quantity || 0),
      received: summary.received + Number(line.received_quantity || 0),
      accepted: summary.accepted + Number(line.accepted_quantity || 0),
      stock: summary.stock + Number(lineTotals[index]?.stockQuantity || 0),
    }), { invoiced: 0, received: 0, accepted: 0, stock: 0 });
    const quantityValues = [quantities.invoiced, quantities.received, quantities.accepted, quantities.stock];
    editor.querySelectorAll('.shop-nir-editor-section.review .shop-nir-quantity-summary>span strong').forEach((element, index) => {
      element.textContent = Number(quantityValues[index] || 0).toLocaleString('ro-RO');
    });
    const documentTotals = lineTotals.reduce((total, line) => ({
      netRon: total.netRon + line.netRon,
      vatRon: total.vatRon + line.vatRon,
      totalRon: total.totalRon + line.totalRon,
    }), { netRon: 0, vatRon: 0, totalRon: 0 });
    const totalValues = [documentTotals.netRon, documentTotals.vatRon, documentTotals.totalRon];
    editor.querySelectorAll('.shop-nir-editor-section.review .shop-nir-totals>span strong').forEach((element, index) => {
      element.textContent = money(totalValues[index] || 0);
    });
  }
  function renderNirEditor() {
    const activeInput = window.document.activeElement;
    const focusSnapshot = activeInput?.matches?.('[data-nir-line-field], [data-nir-field], [data-nir-datetime]') ? {
      line: activeInput.dataset.nirLine,
      lineField: activeInput.dataset.nirLineField,
      field: activeInput.dataset.nirField,
      datetime: activeInput.dataset.nirDatetime,
      start: activeInput.selectionStart,
      end: activeInput.selectionEnd,
    } : null;
    const document = state.nirEditor; if (!document) return;
    const correctionEditing = Boolean(state.nirCorrectionOriginal);
    const correctionActionsLocked = isNirCorrectionLocked(document);
    const editable = !correctionActionsLocked && (document.status === 'draft' || correctionEditing);
    const [statusLabel, statusTone] = nirStatus(document);
    $('shop-nir-title').textContent = document.nir_number || document.temporary_number;
    $('shop-nir-status').textContent = statusLabel; $('shop-nir-status').className = `shop-nir-status ${statusTone}`;
    const supplierOptions = `<option value="">Selecteaza furnizorul</option>${state.suppliers.map(supplier => `<option value="${esc(supplier.id)}" ${supplier.id === document.supplier_id ? 'selected' : ''}>${esc(supplier.name)}${supplier.cui ? ` · ${esc(supplier.cui)}` : ''}</option>`).join('')}`;
    const warehouseOptions = state.nirWarehouses.map(warehouse => `<option value="${esc(warehouse.id)}" ${warehouse.id === document.warehouse_id ? 'selected' : ''}>${esc(warehouse.name)}</option>`).join('');
    const lines = (document.lines || []).map((line, index) => renderNirLine(line, index, editable)).join('');
    const attachmentKind = (name, mime = '') => { const extension = String(name || '').split('.').pop().toUpperCase(); if (String(mime).startsWith('image/') || ['JPG', 'JPEG', 'PNG', 'WEBP'].includes(extension)) return `Imagine ${extension || ''}`.trim(); if (extension === 'PDF') return 'Factura PDF'; if (extension === 'XLSX') return 'Fisier Excel'; if (extension === 'XML') return 'Fisier XML'; return `Document ${extension || ''}`.trim(); };
    const attachments = (document.attachments || []).map(file => `<article class="shop-nir-attachment saved"><span>${nirUiIcon('document')}</span><div><strong>${esc(attachmentKind(file.original_name, file.mime_type))}</strong><small title="${esc(file.original_name)}">${esc(file.original_name)}</small><em>Salvat · ${esc(file.extraction_status)} · ${(Number(file.file_size || 0) / 1024).toFixed(0)} KB</em></div><button type="button" class="shop-nir-attachment-download" data-nir-attachment-download="${esc(file.id)}" aria-label="Descarca ${esc(file.original_name)}" title="Descarca documentul">${nirUiIcon('download')}</button></article>`).join('');
    const pendingAttachments = state.nirPendingFiles.map((file, index) => `<article class="shop-nir-attachment pending"><span>${nirUiIcon('document')}</span><div><strong>${esc(attachmentKind(file.name, file.type))}</strong><small title="${esc(file.name)}">${esc(file.name)}</small><em>In asteptarea salvarii · ${(Number(file.size || 0) / 1024).toFixed(0)} KB</em></div>${editable ? `<button type="button" data-nir-pending-remove="${index}" aria-label="Elimina documentul" title="Elimina documentul">${nirUiIcon('close')}</button>` : ''}</article>`).join('');
    const liveLineTotals = (document.lines || []).map(line => nirLocalLineTotals(line, document.exchange_rate));
    const liveDocumentTotals = liveLineTotals.reduce((total, line) => ({ netRon: total.netRon + line.netRon, vatRon: total.vatRon + line.vatRon, totalRon: total.totalRon + line.totalRon }), { netRon: 0, vatRon: 0, totalRon: 0 });
    const quantities = (document.lines || []).reduce((summary, line, index) => ({ invoiced: summary.invoiced + Number(line.invoiced_quantity || 0), received: summary.received + Number(line.received_quantity || 0), accepted: summary.accepted + Number(line.accepted_quantity || 0), stock: summary.stock + (editable ? liveLineTotals[index].stockQuantity : Number(line.stock_quantity || 0)) }), { invoiced: 0, received: 0, accepted: 0, stock: 0 });
    const displayedTotals = editable ? liveDocumentTotals : { netRon: Number(document.subtotal_ron || 0), vatRon: Number(document.vat_total_ron || 0), totalRon: Number(document.grand_total_ron || 0) };
    $('shop-nir-editor').innerHTML = `<section class="shop-nir-editor-flow"><div><small>GHID RAPID</small><strong>Completeaza NIR-ul in 5 pasi</strong><span>Urmeaza sageata: fiecare pas este desenat pe rand, apoi fluxul porneste din nou.</span></div><ol><i class="shop-nir-flow-trail" aria-hidden="true"><b></b></i><li style="--flow-index:0"><i>${nirUiIcon('supplier')}</i><b>1</b><span>Furnizor</span></li><li style="--flow-index:1"><i>${nirUiIcon('calendar')}</i><b>2</b><span>Receptie</span></li><li style="--flow-index:2"><i>${nirUiIcon('currency')}</i><b>3</b><span>Moneda</span></li><li style="--flow-index:3"><i>${nirUiIcon('product')}</i><b>4</b><span>Produse</span></li><li style="--flow-index:4"><i>${nirUiIcon('check')}</i><b>5</b><span>Verificare</span></li></ol></section>
      <div class="shop-nir-editor-grid">
        <section class="shop-nir-editor-section supplier"><header>${nirStepBadge('01', 'supplier')}<span><strong>Alege furnizorul</strong><small>Identifica firma si factura primita</small></span></header><p class="shop-nir-step-help"><b>1</b>Selecteaza furnizorul, apoi completeaza datele facturii.</p><div class="shop-nir-supplier-line"><label>Denumire furnizor *<select data-nir-field="supplier_id" ${editable ? '' : 'disabled'}>${supplierOptions}</select></label>${editable && nirCan('SUPPLIER_CREATE') ? '<button type="button" id="shop-nir-new-supplier">+ Furnizor nou</button>' : ''}</div><div class="shop-commerce-columns three">${nirInput('Serie factura', 'supplier_invoice_series', document.supplier_invoice_series, editable ? '' : 'disabled')}${nirInput('Numar factura *', 'supplier_invoice_number', document.supplier_invoice_number, editable ? 'required' : 'disabled')}${nirInput('Data facturii *', 'supplier_invoice_date', document.supplier_invoice_date, `type="date" ${editable ? '' : 'disabled'}`)}</div></section>
        <section class="shop-nir-editor-section reception"><header>${nirStepBadge('02', 'calendar')}<span><strong>Stabileste receptia</strong><small>Alege data si ora din acelasi selector</small></span></header><p class="shop-nir-step-help"><b>2</b>Fiecare control deschide impreuna calendarul si ora.</p><div class="shop-nir-reception-fields">${nirDateTimeInput('Data si ora NIR *', 'nir', document.nir_date, document.nir_time, editable)}${nirDateTimeInput('Data si ora receptiei *', 'reception', document.reception_date, document.reception_time, editable)}<label>Gestiune *<select data-nir-field="warehouse_id" ${editable ? '' : 'disabled'}>${warehouseOptions}</select></label></div></section>
        <section class="shop-nir-editor-section currency"><header>${nirStepBadge('03', 'currency')}<span><strong>Seteaza moneda</strong><small>Cursul si etichetele de pret se adapteaza automat</small></span></header><p class="shop-nir-step-help"><b>3</b>Alege moneda din lista. Pentru valuta preluam automat cursul oficial BNR, dar il poti modifica.</p><div class="shop-commerce-columns three">${nirCurrencyPicker(document.currency, editable)}${nirInput(`Curs ${esc(document.currency || 'RON')}/RON *`, 'exchange_rate', document.exchange_rate, `type="number" min="0.00000001" step="0.00000001" placeholder="${state.nirRateLoading === document.currency ? 'Se preia de la BNR...' : 'Curs in lei'}" ${editable && document.currency !== 'RON' ? '' : 'disabled'}`)}${nirInput('Data cursului BNR', 'exchange_rate_date', document.exchange_rate_date, `type="date" ${editable && document.currency !== 'RON' ? '' : 'disabled'}`)}</div><p class="shop-nir-bnr-note">${document.currency === 'RON' ? `${nirUiIcon('check')} RON: curs fix 1, data cursului este data facturii.` : state.nirRateLoading === document.currency ? `${nirUiIcon('currency')} Se preia cursul oficial BNR...` : `${nirUiIcon('check')} Curs BNR din ${esc(document.exchange_rate_date || 'data facturii')} · totalurile si costul contabil sunt calculate in lei.`}</p></section>
      </div>
      <section class="shop-nir-editor-section documents ${editable ? '' : 'is-confirmed'}"><header><b class="shop-nir-step-badge optional">${nirUiIcon('document')}<i>+</i></b><span><strong>Documente furnizor</strong><small>${editable ? 'Le poti alege acum; sunt incarcate numai cand apesi Salveaza' : `${(document.attachments || []).length} documente salvate impreuna cu acest NIR`}</small></span>${editable ? '<button type="button" id="shop-nir-import">Alege documente</button>' : (document.attachments || []).length ? `<button type="button" id="shop-nir-download-all">${nirUiIcon('download')} Descarca toate</button>` : ''}</header><div class="shop-nir-attachments shop-nir-dropzone ${editable ? '' : 'is-confirmed'}" role="${editable ? 'button' : 'group'}" tabindex="${editable ? '0' : '-1'}" aria-label="${editable ? 'Adauga documentele furnizorului' : 'Documentele furnizorului'}">${editable ? `<div class="shop-nir-drop-hint"><span><i></i>${nirUiIcon('document')}</span><div><strong>Trage factura aici</strong><small>Documentele raman local pana apesi Salveaza ciorna</small><em>PDF · JPG · PNG · WEBP · XLSX · XML</em></div></div>` : ''}${attachments || pendingAttachments ? `<div class="shop-nir-attachment-list">${attachments}${pendingAttachments}</div>` : '<p>Nu exista documente atasate acestui NIR.</p>'}</div></section>
      <section class="shop-nir-editor-section lines"><header>${nirStepBadge('04', 'product')}<span><strong>Produsele din factura</strong><small>Fiecare rand reprezinta un produs primit de la furnizor.</small></span>${editable ? '<button type="button" id="shop-nir-add-line">+ Produs</button>' : ''}</header><div class="shop-nir-lines-intro"><strong>${nirUiIcon('product')}<span><small>ORDINEA COMPLETARII</small>Urmeaza traseul de la stanga la dreapta</span></strong><ol><li><i>1</i><span><b>Alege produsul</b><small>cauta sau asociaza articolul</small></span></li><em>→</em><li><i>2</i><span><b>Scrie cantitatea</b><small>cat ai primit efectiv</small></span></li><em>→</em><li><i>3</i><span><b>Completeaza pretul</b><small>costul din factura</small></span></li></ol></div><div id="shop-nir-lines" class="shop-nir-line-list">${lines || '<p class="shop-nir-no-lines">Adauga cel putin un produs.</p>'}</div></section>
      <section class="shop-nir-editor-section review"><header>${nirStepBadge('05', 'check')}<span><strong>Verifica documentul</strong><small>Ultimul control inainte ca marfa sa intre in gestiune</small></span><em class="shop-nir-review-ready">${nirUiIcon('check')} GATA DE VERIFICARE</em></header><p class="shop-nir-review-guide"><b>05</b><span><strong>Compara cantitatile, apoi verifica valoarea finala.</strong><small>Daca exista diferente, corecteaza pozitia produsului inainte de confirmare.</small></span></p><section class="shop-nir-quantity-summary"><span><i>${nirUiIcon('document')}</i><b><small>FACTURAT</small><strong>${quantities.invoiced.toLocaleString('ro-RO')}</strong><em>unitati pe factura</em></b></span><span><i>${nirUiIcon('calendar')}</i><b><small>RECEPTIONAT</small><strong>${quantities.received.toLocaleString('ro-RO')}</strong><em>unitati numarate</em></b></span><span class="accepted"><i>${nirUiIcon('check')}</i><b><small>ACCEPTAT</small><strong>${quantities.accepted.toLocaleString('ro-RO')}</strong><em>unitati conforme</em></b></span><span class="stock"><i>${nirUiIcon('product')}</i><b><small>INTRA EFECTIV IN STOC</small><strong>${quantities.stock.toLocaleString('ro-RO')}</strong><em>cantitatea finala</em></b></span></section>${nirCan('NIR_VIEW_COSTS') ? `<section class="shop-nir-totals"><span><i>${nirUiIcon('currency')}</i><b><small>VALOARE FARA TVA</small><strong>${money(displayedTotals.netRon)}</strong><em>Baza de calcul</em></b></span><span><i>${nirUiIcon('document')}</i><b><small>TVA</small><strong>${money(displayedTotals.vatRon)}</strong><em>Valoarea taxei</em></b></span><span class="grand"><i>${nirUiIcon('check')}</i><b><small>TOTAL CONTABIL RON</small><strong>${money(displayedTotals.totalRon)}</strong><em>Valoarea care va fi confirmata</em></b></span></section>` : ''}<label class="shop-nir-review-notes"><span><b>Observatii interne</b><small>Optional · noteaza diferente, explicatii sau detalii utile pentru contabilitate</small></span><textarea data-nir-field="notes" rows="3" placeholder="Exemplu: ambalaj deteriorat, diferenta explicata de furnizor..." ${editable ? '' : 'disabled'}>${esc(document.notes || '')}</textarea></label></section><section id="shop-nir-accounting-details" class="shop-nir-accounting-details" ${editable ? 'hidden' : ''}><div class="shop-commerce-loading">Se incarca miscarile de stoc...</div></section>`;
    $('shop-nir-save').hidden = !editable || correctionEditing; $('shop-nir-confirm').hidden = !editable || correctionEditing; $('shop-nir-confirm').disabled = !nirCan('NIR_CONFIRM');
    $('shop-nir-delete').hidden = !editable || correctionEditing || !nirCan('NIR_EDIT_DRAFT');
    $('shop-nir-reverse-trigger').hidden = !canNirStorno(document) || document.status !== 'confirmed' || correctionEditing || !nirCan('NIR_REVERSE');
    $('shop-nir-correct').hidden = correctionActionsLocked || !(document.status === 'confirmed' || correctionEditing) || !nirCan('NIR_EDIT_DRAFT') || !nirCan('NIR_CONFIRM');
    $('shop-nir-correct').classList.toggle('is-correction-save', correctionEditing);
    $('shop-nir-correct').querySelector('span').textContent = correctionEditing ? 'Corecteaza NIR' : 'Editeaza NIR';
    $('shop-nir-export-pdf').hidden = editable || !nirCan('NIR_EXPORT'); $('shop-nir-export-xlsx').hidden = editable || !nirCan('NIR_EXPORT');
    wireNirEditor(editable);
    wireNirSummaryImages();
    if (focusSnapshot) requestAnimationFrame(() => {
      const candidates = [...$('shop-nir-editor').querySelectorAll('[data-nir-line-field], [data-nir-field], [data-nir-datetime]')];
      const target = candidates.find(item => focusSnapshot.lineField
        ? item.dataset.nirLine === focusSnapshot.line && item.dataset.nirLineField === focusSnapshot.lineField
        : focusSnapshot.datetime ? item.dataset.nirDatetime === focusSnapshot.datetime : item.dataset.nirField === focusSnapshot.field);
      if (!target) return;
      target.focus({ preventScroll: true });
      if (typeof target.setSelectionRange === 'function' && focusSnapshot.start !== null) target.setSelectionRange(focusSnapshot.start, focusSnapshot.end);
    });
  }

  function wireNirSummaryImages() {
    document.querySelectorAll('[data-nir-product-image]').forEach(image => {
      const host = image.closest('.shop-nir-summary-image');
      if (!host) return;
      const showImage = () => {
        if (!image.naturalWidth || !image.naturalHeight) return;
        image.hidden = false;
        host.classList.add('has-image');
        host.setAttribute('aria-label', image.alt || 'Imagine produs');
      };
      const showFallback = () => {
        host.classList.remove('has-image');
        host.setAttribute('aria-label', 'Produs fara fotografie');
        image.hidden = true;
      };
      image.addEventListener('load', showImage, { once: true });
      image.addEventListener('error', showFallback, { once: true });
      if (image.complete) (image.naturalWidth && image.naturalHeight ? showImage : showFallback)();
    });
  }

  function renderNirLine(line, index, editable) {
    const matched = Boolean(line.product_id);
    const received = line.received_quantity ?? line.accepted_quantity;
    const differs = String(line.invoiced_quantity ?? '') !== String(received ?? '') || String(received ?? '') !== String(line.accepted_quantity ?? '');
    const input = (field, value, attrs = '') => `<input data-nir-line="${index}" data-nir-line-field="${field}" value="${esc(value ?? '')}" ${attrs} ${editable ? '' : 'disabled'} />`;
    const field = (label, name, value, attrs = '') => `<label><span>${label}</span>${input(name, value, attrs)}</label>`;
    const storedDifferenceReason = line.difference_reason || (line.mismatch_reason ? 'other' : '');
    const differenceReason = storedDifferenceReason === 'rejected' ? 'other' : storedDifferenceReason;
    const differenceLabels = { shortage: 'Lipsa cantitativa', surplus: 'Surplus', damaged: 'Produs deteriorat', wrong_product: 'Produs gresit', price_difference: 'Pret diferit', vat_difference: 'TVA diferit', other: 'Alt motiv' };
    const differenceFields = differs ? `<div class="shop-nir-difference-fields"><select data-nir-line="${index}" data-nir-line-field="difference_reason" ${editable ? '' : 'disabled'}><option value="">Motivul diferentei *</option>${Object.entries(differenceLabels).map(([value, label]) => `<option value="${value}" ${differenceReason === value ? 'selected' : ''}>${label}</option>`).join('')}</select>${differenceReason === 'other' || line.difference_notes ? input('difference_notes', line.difference_notes || '', 'class="shop-nir-difference-reason" placeholder="Explicatie pentru diferenta *"') : ''}</div>` : '';
    const isStockItem = line.is_stock_item !== false && Number(line.is_stock_item ?? 1) !== 0;
    const comparison = line.price_comparison;
    const priceComparison = comparison ? `<aside class="shop-nir-price-compare ${comparison.is_significant ? 'warning' : ''}"><small>ULTIMA ACHIZITIE · ACELASI FURNIZOR</small><strong>${comparison.last_supplier ? `${money(comparison.last_supplier.unit_net_price_ron)} / unitate` : 'Fara istoric la acest furnizor'}</strong><span>Minim recent: ${comparison.recent_minimum_unit_net_price_ron ? money(comparison.recent_minimum_unit_net_price_ron) : '—'}${comparison.variance_percent !== null ? `<b>${Number(comparison.variance_percent) > 0 ? '+' : ''}${esc(comparison.variance_percent)}%</b>` : ''}</span>${comparison.is_significant ? '<em>Pretul difera semnificativ. Verifica valoarea.</em>' : ''}</aside>` : '';
    const matchLabel = ['matching_code', 'matching_name'].includes(line.resolution_status) ? 'Se verifica asocierea…' : matched ? (line.resolution_status === 'matched_code' ? 'Recunoscut dupa cod' : line.resolution_status === 'matched_name' ? 'Recunoscut dupa denumire' : 'Produs asociat') : 'Necesita asociere';
    const supplierName = state.nirEditor?.supplier_name || state.suppliers.find(item => item.id === state.nirEditor?.supplier_id)?.name || 'Furnizor neselectat';
    const localTotals = nirLocalLineTotals(line, state.nirEditor?.exchange_rate);
    const lineTotal = editable ? localTotals.totalRon : Number(line.line_total_ron || 0);
    const imageLabel = matched ? 'Produs fara fotografie' : 'Produs nerecunoscut';
    const linePicture = `<span class="shop-nir-summary-image shop-nir-product-placeholder ${matched ? 'matched' : 'unmatched'}" role="img" aria-label="${imageLabel}"><span class="shop-nir-summary-image-fallback" aria-hidden="true">${nirUiIcon('product')}</span>${matched && line.product_image_url ? `<img data-nir-product-image src="${esc(line.product_image_url)}" alt="${esc(line.product_name || line.supplier_product_name || 'Imagine produs')}" aria-hidden="true" width="56" height="56" loading="lazy" decoding="async" />` : ''}</span>`;
    return `<details class="shop-nir-line ${matched ? 'matched' : 'unmatched'}" ${line._expanded || !matched || index === 0 ? 'open' : ''}>
      <summary class="shop-nir-line-summary"><span class="shop-nir-line-index">${String(index + 1).padStart(2, '0')}</span>${linePicture}<span class="shop-nir-summary-copy"><small>PRODUS DIN FACTURA</small><strong>${esc(line.product_name || line.supplier_product_name || 'Produs fara denumire')}</strong><em>${esc(line.supplier_product_code || 'Asociere dupa denumirea facturii')}</em></span><span class="shop-nir-summary-facts"><b>${esc(line.accepted_quantity || 0)} ${esc(line.stock_unit || 'buc')}</b><strong>${money(lineTotal)}</strong></span><b class="shop-nir-match ${matched ? 'ok' : 'warn'}">● ${matchLabel}</b><i class="shop-nir-line-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg></i></summary>
      <div class="shop-nir-line-details"><div class="shop-nir-line-details-inner"><div class="shop-nir-line-panels">
        <section class="shop-nir-line-panel identity"><header><span class="shop-nir-panel-icon">${nirUiIcon('product')}<i>01</i></span><div><strong>Ce produs este?</strong><small>Îl caut automat după cod, EAN sau denumirea memorată pentru furnizor.</small></div></header><div class="shop-nir-supplier-context"><small>DENUMIRE FURNIZOR</small><strong>${esc(supplierName)}</strong></div><div class="shop-nir-field-grid">${field('COD FURNIZOR', 'supplier_product_code', line.supplier_product_code, 'placeholder="Optional · ex: COD-1025" autocomplete="off"')}${field('DENUMIRE PE FACTURA', 'supplier_product_name', line.supplier_product_name, 'placeholder="Denumirea exacta de pe factura"')}</div><div class="shop-nir-code-feedback ${matched ? 'ok' : ''}" data-nir-code-state="${index}">${nirUiIcon(matched ? 'check' : 'search')}<span><b>${matched ? 'Produs recunoscut' : 'Cautare automata dupa cod sau nume'}</b><small>${matched ? esc(line.product_name || '') : 'La prima achizitie alegi produsul intern; apoi aceasta denumire se recunoaste automat la acel furnizor.'}</small></span></div><div class="shop-nir-product-link"><div><small>PRODUS INTERN</small><strong>${esc(line.product_name || 'Niciun produs asociat')}</strong><span class="${matched ? 'ok' : 'warn'}">${matched ? (line.resolution_status === 'matched_name' ? 'Denumirea furnizorului este asociata produsului intern.' : 'Codul furnizorului este asociat produsului intern.') : 'Daca nu este gasit automat, alege produsul din catalog.'}</span></div>${editable && isStockItem ? `<span class="shop-nir-line-actions"><button type="button" class="primary" data-nir-product="${index}">${matched ? 'Schimba produsul' : 'Alege produsul'}</button></span>` : ''}</div><p class="shop-nir-panel-help">SKU-ul intern este independent. Același produs poate avea coduri și denumiri diferite la fiecare furnizor.</p></section>
        <section class="shop-nir-line-panel reception"><header><span class="shop-nir-panel-icon">${nirUiIcon('calendar')}<i>02</i></span><div><strong>Verifica marfa</strong><small>Compara factura cu ce ai primit si acceptat</small></div></header><div class="shop-nir-quantities">${field('FACTURAT', 'invoiced_quantity', line.invoiced_quantity, 'type="number" min="0" step="0.0001"')}${field('RECEPTIONAT', 'received_quantity', received, 'type="number" min="0" step="0.0001"')}${field('ACCEPTAT', 'accepted_quantity', line.accepted_quantity, 'type="number" min="0" step="0.0001"')}</div><div class="shop-nir-units">${field('UM ACHIZITIE', 'purchase_unit', line.purchase_unit || 'buc', 'placeholder="buc"')}<i>→</i>${field('UM STOC', 'stock_unit', line.stock_unit || 'buc', 'placeholder="buc"')}</div>${differenceFields}</section>
        <section class="shop-nir-line-panel pricing"><header><span class="shop-nir-panel-icon">${nirUiIcon('currency')}<i>03</i></span><div><strong>Completeaza costul</strong><small>Pretul, discountul, TVA-ul si totalul pozitiei</small></div></header><div class="shop-nir-price-fields">${field(`PRET UNITAR · ${esc(state.nirEditor?.currency || 'RON')}`, 'unit_price', line.unit_price, 'type="number" min="0" step="0.000001"')}${field('DISCOUNT %', 'discount_percent', line.discount_percent, 'type="number" min="0" max="100" step="0.01"')}${field('TVA %', 'vat_rate', line.vat_rate, 'type="number" min="0" max="100" step="0.01"')}${field('COST SUPLIMENTAR RON', 'allocated_cost_ron', line.allocated_cost_ron || '0', 'type="number" min="0" step="0.01"')}</div><div class="shop-nir-line-total"><span><small>TOTAL POZITIE</small><strong>${money(editable ? localTotals.totalRon : line.line_total_ron || 0)}</strong></span><span><small>COST UNITAR CONTABIL</small><b>${money(editable ? localTotals.inventoryUnitCostRon : line.inventory_unit_cost_ron || 0)}/u</b></span></div>${priceComparison}</section>
      </div>${editable ? `<footer class="shop-nir-line-footer"><span>Asocierea si costul se memoreaza numai cand salvezi NIR-ul.</span><button type="button" class="danger" data-nir-remove="${index}" aria-label="Sterge produsul" title="Sterge produsul">${nirUiIcon('trash')}</button></footer>` : ''}</div></div>
    </details>`;
  }

  function toggleNirLineSmooth(details, index) {
    const line = state.nirEditor?.lines?.[index];
    const summary = details.querySelector(':scope > summary');
    const content = details.querySelector(':scope > .shop-nir-line-details');
    if (!line || !summary || !content) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const previousTarget = details._nirExpandedTarget ?? details.open;
    const isOpening = !previousTarget;
    const heightBeforeCancel = details.getBoundingClientRect().height;
    let visualProgress = details.open ? 1 : 0;
    if (details._nirAnimationMeta && details._nirAnimation) {
      const timing = details._nirAnimation.effect?.getComputedTiming?.();
      const timingProgress = Number.isFinite(timing?.progress) ? timing.progress : 0;
      const { from, to } = details._nirAnimationMeta;
      visualProgress = from + ((to - from) * timingProgress);
    }
    details._nirAnimation?.cancel?.();
    details._nirContentAnimation?.cancel?.();
    details._nirExpandedTarget = isOpening;
    line._expanded = isOpening;
    details.dataset.nirExpanded = isOpening ? 'true' : 'false';
    summary.setAttribute('aria-expanded', isOpening ? 'true' : 'false');
    if (reduceMotion || typeof details.animate !== 'function') {
      details.open = isOpening;
      details.style.height = '';
      details.style.overflow = '';
      details._nirAnimation = null;
      details._nirContentAnimation = null;
      return;
    }
    details.open = true;
    details.style.height = '';
    details.style.overflow = '';
    const collapsedHeight = summary.getBoundingClientRect().height;
    void content.offsetHeight;
    const expandedHeight = Math.max(details.scrollHeight, collapsedHeight + content.scrollHeight);
    const startHeight = `${Math.max(collapsedHeight, heightBeforeCancel)}px`;
    const endHeight = `${isOpening ? expandedHeight : collapsedHeight}px`;
    details.style.overflow = 'hidden';
    details.style.height = startHeight;
    const duration = Math.max(170, Math.round((isOpening ? 390 : 330) * Math.max(.45, Math.abs((isOpening ? 1 : 0) - visualProgress))));
    const transitionToken = Number(details._nirTransitionToken || 0) + 1;
    details._nirTransitionToken = transitionToken;
    const animation = details.animate(
      { height: [startHeight, endHeight] },
      { duration, easing: 'cubic-bezier(.22,1,.36,1)' },
    );
    const contentAnimation = content.animate({
      gridTemplateRows: [`${Math.max(.001, visualProgress)}fr`, `${isOpening ? 1 : .001}fr`],
      opacity: [visualProgress, isOpening ? 1 : 0],
      transform: [`translateY(${(-8 * (1 - visualProgress)).toFixed(2)}px) scale(${(.992 + (.008 * visualProgress)).toFixed(4)})`, isOpening ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(.992)'],
    }, { duration, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
    details._nirAnimation = animation;
    details._nirContentAnimation = contentAnimation;
    details._nirAnimationMeta = { from: visualProgress, to: isOpening ? 1 : 0 };
    animation.onfinish = () => {
      if (details._nirTransitionToken !== transitionToken) return;
      if (!isOpening) details.open = false;
      details.style.height = '';
      details.style.overflow = '';
      contentAnimation.cancel();
      details._nirAnimation = null;
      details._nirContentAnimation = null;
      details._nirAnimationMeta = null;
    };
    animation.oncancel = () => {
      if (details._nirTransitionToken !== transitionToken) return;
      details.style.height = '';
      details.style.overflow = '';
    };
  }

  function wireKeyboardInputRecovery(control) {
    if (!control || control.disabled || control.readOnly || control.dataset.keyboardRecoveryBound) return;
    control.dataset.keyboardRecoveryBound = 'true';
    control.addEventListener('keydown', event => {
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
      const inputType = String(control.type || '').toLowerCase();
      if (['date', 'datetime-local', 'time', 'file', 'checkbox', 'radio'].includes(inputType)) return;
      const character = inputType === 'number' && event.key === ',' ? '.' : event.key;
      if (inputType === 'number' && !/[0-9.\-]/.test(character)) return;
      const valueBefore = control.value;
      const selectionStart = typeof control.selectionStart === 'number' ? control.selectionStart : valueBefore.length;
      const selectionEnd = typeof control.selectionEnd === 'number' ? control.selectionEnd : valueBefore.length;
      window.setTimeout(() => {
        if (document.activeElement !== control || control.value !== valueBefore) return;
        let inserted = false;
        try {
          inserted = Boolean(document.execCommand?.('insertText', false, character));
        } catch (_) {
          inserted = false;
        }
        if (inserted && control.value !== valueBefore) return;
        const nextValue = `${valueBefore.slice(0, selectionStart)}${character}${valueBefore.slice(selectionEnd)}`;
        if (inputType === 'number' && nextValue && !Number.isFinite(Number(nextValue))) return;
        control.value = nextValue;
        if (typeof control.setSelectionRange === 'function') {
          try { control.setSelectionRange(selectionStart + character.length, selectionStart + character.length); } catch (_) { /* number inputs do not expose a selection range */ }
        }
        control.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: character }));
      }, 0);
    });
  }

  function wireNirEditor(editable) {
    $('shop-nir-editor').querySelectorAll('[data-nir-attachment-download]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); void downloadNirAttachment(button.dataset.nirAttachmentDownload); }));
    $('shop-nir-download-all')?.addEventListener('click', () => void downloadAllNirAttachments());
    $('shop-nir-editor').querySelectorAll('.shop-nir-line').forEach((details, index) => {
      const summary = details.querySelector(':scope > summary');
      details._nirExpandedTarget = details.open;
      details.dataset.nirExpanded = details.open ? 'true' : 'false';
      summary?.setAttribute('aria-expanded', details.open ? 'true' : 'false');
      summary?.addEventListener('click', event => {
        event.preventDefault();
        toggleNirLineSmooth(details, index);
      });
    });
    if (!editable) return;
    $('shop-nir-editor').querySelectorAll('input:not(:disabled), textarea:not(:disabled)').forEach(wireKeyboardInputRecovery);
    const currencyToggle = $('shop-nir-currency-toggle');
    const currencyPanel = $('shop-nir-currency-panel');
    const currencySearch = $('shop-nir-currency-search');
    const currencyField = currencyToggle?.closest('.shop-nir-currency-field');
    const nirOverlay = $('shop-nir-modal');
    const nirModal = nirOverlay?.querySelector('.shop-nir-modal');
    const nirScroll = $('shop-nir-editor');
    const positionCurrencyPanel = () => {
      if (!currencyToggle || !currencyPanel || currencyPanel.hidden) return;
      const anchor = currencyToggle.getBoundingClientRect();
      const frame = nirModal?.getBoundingClientRect() || { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight, width: window.innerWidth };
      const margin = window.innerWidth <= 720 ? 12 : 20;
      const frameLeft = Math.max(margin, frame.left + margin);
      const frameRight = Math.min(window.innerWidth - margin, frame.right - margin);
      const availableWidth = Math.max(280, frameRight - frameLeft);
      const panelWidth = Math.min(520, availableWidth);
      const left = Math.min(Math.max(anchor.left, frameLeft), frameRight - panelWidth);
      const maxPanelHeight = Math.max(320, Math.min(570, window.innerHeight - (margin * 2)));
      const preferredTop = anchor.bottom + 8;
      const top = Math.min(Math.max(frame.top + margin, preferredTop), window.innerHeight - margin - maxPanelHeight);
      currencyPanel.style.setProperty('--nir-currency-left', `${Math.round(left)}px`);
      currencyPanel.style.setProperty('--nir-currency-top', `${Math.round(Math.max(margin, top))}px`);
      currencyPanel.style.setProperty('--nir-currency-width', `${Math.round(panelWidth)}px`);
      currencyPanel.style.setProperty('--nir-currency-height', `${Math.round(maxPanelHeight)}px`);
    };
    const closeCurrencyPanel = () => {
      if (!currencyPanel) return;
      currencyPanel.hidden = true;
      currencyPanel.classList.remove('is-floating');
      currencyToggle?.setAttribute('aria-expanded', 'false');
      if (currencyField && currencyPanel.parentElement !== currencyField) currencyField.append(currencyPanel);
      window.removeEventListener('resize', positionCurrencyPanel);
      nirScroll?.removeEventListener('scroll', closeCurrencyPanel);
      document.removeEventListener('pointerdown', handleCurrencyOutside, true);
      document.removeEventListener('keydown', handleCurrencyEscape, true);
    };
    const handleCurrencyOutside = event => {
      if (currencyPanel?.hidden) return;
      if (!currencyPanel.contains(event.target) && !currencyToggle?.contains(event.target)) closeCurrencyPanel();
    };
    const handleCurrencyEscape = event => {
      if (event.key !== 'Escape' || currencyPanel?.hidden) return;
      event.preventDefault();
      closeCurrencyPanel();
      currencyToggle?.focus({ preventScroll: true });
    };
    currencyToggle?.addEventListener('click', () => {
      if (!currencyPanel || !nirOverlay) return;
      if (!currencyPanel.hidden) { closeCurrencyPanel(); return; }
      nirOverlay.append(currencyPanel);
      currencyPanel.classList.add('is-floating');
      currencyPanel.hidden = false;
      currencyToggle.setAttribute('aria-expanded', 'true');
      positionCurrencyPanel();
      window.addEventListener('resize', positionCurrencyPanel);
      nirScroll?.addEventListener('scroll', closeCurrencyPanel, { once: true });
      document.addEventListener('pointerdown', handleCurrencyOutside, true);
      document.addEventListener('keydown', handleCurrencyEscape, true);
      requestAnimationFrame(() => { positionCurrencyPanel(); currencySearch?.focus(); });
    });
    currencySearch?.addEventListener('input', () => {
      const query = currencySearch.value.trim().toLowerCase();
      currencyPanel.querySelectorAll('[data-nir-currency]').forEach(option => { option.hidden = Boolean(query) && !option.dataset.currencySearch.includes(query); });
    });
    currencyPanel?.querySelectorAll('[data-nir-currency]').forEach(option => option.addEventListener('click', () => {
      const currency = option.dataset.nirCurrency;
      if (!currency || currency === state.nirEditor.currency) { closeCurrencyPanel(); return; }
      closeCurrencyPanel();
      void applyNirCurrency(currency);
    }));
    $('shop-nir-editor').querySelectorAll('[data-nir-datetime]').forEach(input => input.addEventListener('input', () => {
      const prefix = input.dataset.nirDatetime;
      const [date, time = ''] = String(input.value || '').split('T');
      state.nirEditor[`${prefix}_date`] = date;
      state.nirEditor[`${prefix}_time`] = time.slice(0, 5);
      state.nirEditRevision += 1;
    }));
    $('shop-nir-editor').querySelectorAll('[data-nir-field]').forEach(input => input.addEventListener('input', () => {
      const field = input.dataset.nirField; state.nirEditor[field] = field === 'currency' ? input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) : input.value;
      if (field === 'supplier_id') {
        state.nirEditor.supplier_name = state.suppliers.find(item => item.id === input.value)?.name || null;
        scheduleNirAutosave(); renderNirEditor(); return;
      }
      if (field === 'currency') input.value = state.nirEditor.currency;
      if (field === 'currency' && state.nirEditor.currency === 'RON') { state.nirEditor.exchange_rate = '1'; state.nirEditor.exchange_rate_date = state.nirEditor.nir_date; renderNirEditor(); }
      if (field === 'supplier_invoice_date' && state.nirEditor.currency === 'RON') { state.nirEditor.exchange_rate_date = input.value; scheduleNirAutosave(); renderNirEditor(); return; }
      if (field === 'exchange_rate') { updateNirLiveCalculations(); scheduleNirAutosave(); return; }
      scheduleNirAutosave();
    }));
    $('shop-nir-editor').querySelector('[data-nir-field="exchange_rate_date"]')?.addEventListener('change', event => void refreshNirBnrRate(event.currentTarget.value));
    $('shop-nir-editor').querySelectorAll('[data-nir-line-field]').forEach(input => input.addEventListener('input', () => {
      const lineIndex = Number(input.dataset.nirLine);
      const line = state.nirEditor.lines[lineIndex]; if (!line) return;
      const lineField = input.dataset.nirLineField;
      line[lineField] = lineField === 'is_stock_item' ? input.checked : input.value;
      if (lineField === 'invoiced_quantity') {
        line.received_quantity = input.value;
        line.accepted_quantity = input.value;
        const row = input.closest('.shop-nir-line');
        const receivedInput = row?.querySelector('[data-nir-line-field="received_quantity"]');
        const acceptedInput = row?.querySelector('[data-nir-line-field="accepted_quantity"]');
        if (receivedInput) receivedInput.value = input.value;
        if (acceptedInput) acceptedInput.value = input.value;
      }
      const calculatedFields = ['invoiced_quantity', 'received_quantity', 'accepted_quantity', 'conversion_factor', 'unit_price', 'discount_percent', 'vat_rate', 'allocated_cost_ron'];
      if (calculatedFields.includes(lineField)) {
        line._expanded = true;
        scheduleNirAutosave();
        updateNirLiveCalculations(lineIndex);
        return;
      }
      if (lineField === 'is_stock_item') renderNirEditor();
      if (lineField === 'difference_reason') { line.mismatch_reason = input.value; renderNirEditor(); }
      if (lineField === 'difference_notes') line.mismatch_reason = input.value || line.difference_reason;
      if ((lineField === 'supplier_product_code' || lineField === 'supplier_product_name') && line.product_id) {
        clearTimeout(state.nirResolveTimers.get(lineIndex));
        line.supplier_product_reference_id = null;
        line.resolution_status = 'matched_manual';
        scheduleNirAutosave();
        return;
      }
      if (lineField === 'supplier_product_code') {
        const code = input.value.trim();
        const name = String(line.supplier_product_name || '').trim();
        line._expanded = true;
        line.product_id = null; line.product_name = ''; line.product_image_url = ''; line.supplier_product_reference_id = null;
        line.resolution_status = code ? 'matching_code' : name ? 'matching_name' : 'unmatched';
        clearTimeout(state.nirResolveTimers.get(lineIndex));
        const requestId = Number(state.nirResolveRequestIds.get(lineIndex) || 0) + 1;
        state.nirResolveRequestIds.set(lineIndex, requestId);
        const feedback = $('shop-nir-editor').querySelector(`[data-nir-code-state="${lineIndex}"]`);
        if (feedback) {
          feedback.className = 'shop-nir-code-feedback matching';
          feedback.innerHTML = `${nirUiIcon('search')}<span><b>${code || name ? 'Se cauta automat…' : 'Cautare automata dupa cod sau nume'}</b><small>${code ? `Verificam codul ${esc(code)} la furnizorul selectat.` : name ? 'Nu exista cod; verificam denumirile memorate pentru acest furnizor.' : 'Completeaza codul sau denumirea de pe factura.'}</small></span>`;
        }
        if ((code || name) && state.nirEditor.supplier_id) state.nirResolveTimers.set(lineIndex, setTimeout(() => void resolveNirLine(lineIndex, { silent: true, expectedCode: code, expectedName: name, requestId }), 380));
      } else if (lineField === 'supplier_product_name' && !String(line.supplier_product_code || '').trim()) {
        const name = input.value.trim();
        line._expanded = true;
        line.product_id = null; line.product_name = ''; line.product_image_url = ''; line.supplier_product_reference_id = null;
        line.resolution_status = name ? 'matching_name' : 'unmatched';
        clearTimeout(state.nirResolveTimers.get(lineIndex));
        const requestId = Number(state.nirResolveRequestIds.get(lineIndex) || 0) + 1;
        state.nirResolveRequestIds.set(lineIndex, requestId);
        if (name && state.nirEditor.supplier_id) state.nirResolveTimers.set(lineIndex, setTimeout(() => void resolveNirLine(lineIndex, { silent: true, expectedCode: '', expectedName: name, requestId }), 380));
      }
      scheduleNirAutosave();
    }));
    $('shop-nir-editor').querySelectorAll('[data-nir-resolve]').forEach(button => button.addEventListener('click', () => void resolveNirLine(Number(button.dataset.nirResolve))));
    $('shop-nir-editor').querySelectorAll('[data-nir-product]').forEach(button => button.addEventListener('click', () => openNirProductPicker(Number(button.dataset.nirProduct))));
    $('shop-nir-editor').querySelectorAll('[data-nir-remove]').forEach(button => button.addEventListener('click', () => { state.nirEditor.lines.splice(Number(button.dataset.nirRemove), 1); renderNirEditor(); scheduleNirAutosave(); }));
    $('shop-nir-add-line')?.addEventListener('click', () => { state.nirEditor.lines.push(blankNirLine()); renderNirEditor(); scheduleNirAutosave(); });
    $('shop-nir-new-supplier')?.addEventListener('click', () => { state.nirPendingSupplierCreate = true; openSupplier(); });
    $('shop-nir-import')?.addEventListener('click', () => {
      $('shop-nir-files').click();
    });
    $('shop-nir-editor').querySelectorAll('[data-nir-pending-remove]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); state.nirPendingFiles.splice(Number(button.dataset.nirPendingRemove), 1); renderNirEditor(); }));
    const dropzone = $('shop-nir-editor').querySelector('.shop-nir-attachments');
    dropzone?.addEventListener('dragover', event => { event.preventDefault(); dropzone.classList.add('dragging'); });
    dropzone?.addEventListener('dragleave', event => { if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove('dragging'); });
    dropzone?.addEventListener('drop', event => { event.preventDefault(); dropzone.classList.remove('dragging'); void importNirFiles({ target: { files: event.dataTransfer?.files || [], value: '' } }); });
    const openDocumentPicker = event => {
      if (!editable) return;
      if (event?.target?.closest?.('.shop-nir-attachment')) return;
      $('shop-nir-files').click();
    };
    dropzone?.addEventListener('click', openDocumentPicker);
    dropzone?.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDocumentPicker(event); } });
  }

  function scheduleNirAutosave() {
    if (!state.nirEditor || (state.nirEditor.status !== 'draft' && !state.nirCorrectionOriginal)) return;
    state.nirEditRevision += 1;
  }

  function openNirDeleteDialog() {
    const document = state.nirEditor;
    if (!document || document.status !== 'draft' || !nirCan('NIR_EDIT_DRAFT')) return;
    if (state.nirSaving || state.nirSavePromise) return toast('Asteapta finalizarea salvarii, apoi sterge NIR-ul.', 'error');
    $('shop-nir-delete-number').textContent = document.nir_number || document.temporary_number || 'NIR nesalvat';
    $('shop-nir-delete-supplier').textContent = document.supplier_name || 'Furnizor necompletat';
    openModal('shop-nir-delete-dialog');
    requestAnimationFrame(() => $('shop-nir-delete-cancel')?.focus());
  }

  function closeNirDeleteDialog() {
    closeModal('shop-nir-delete-dialog');
    requestAnimationFrame(() => $('shop-nir-delete')?.focus());
  }

  async function deleteNir() {
    const document = state.nirEditor;
    if (!document || document.status !== 'draft' || !nirCan('NIR_EDIT_DRAFT')) return closeNirDeleteDialog();
    const button = $('shop-nir-delete-confirm');
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span>Se sterge complet...</span>';
    try {
      const localDraft = String(document.id || '').startsWith('local-nir-');
      if (!localDraft) {
        const result = await window.SHOP_API.deleteNir(document.id);
        if (!result?.deleted) throw new Error('Ciorna nu mai exista sau nu mai poate fi stearsa.');
      }
      state.nirEditor = null;
      state.nirPendingFiles = [];
      state.nirEditRevision = 0;
      state.nirProductLineIndex = -1;
      closeModal('shop-nir-delete-dialog');
      closeModal('shop-nir-modal');
      await loadNirs(1);
      toast(localDraft ? 'NIR-ul nesalvat a fost eliminat.' : 'NIR-ul si toate datele sale au fost sterse.');
    } catch (error) {
      toast(error.message || 'NIR-ul nu a putut fi sters.', 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  async function uploadPendingNirFiles(documentId) {
    for (const file of [...state.nirPendingFiles]) {
      const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '').split(',').pop()); reader.onerror = reject; reader.readAsDataURL(file); });
      const attachment = await window.SHOP_API.uploadNirAttachment(documentId, { file_name: file.name, mime_type: file.type || 'application/octet-stream', content_base64: base64 });
      await window.SHOP_API.extractNirAttachment(documentId, attachment.id);
      state.nirPendingFiles = state.nirPendingFiles.filter(item => item !== file);
    }
    return window.SHOP_API.getNir(documentId);
  }

  function nirUpdatePayload(document, rowVersion = document.row_version) {
    const lines = (document.lines || []).map(line => ({ ...line, rejected_quantity: '0' }));
    return { row_version: rowVersion, supplier_id: document.supplier_id || null, warehouse_id: document.warehouse_id, supplier_invoice_series: document.supplier_invoice_series || null, supplier_invoice_number: document.supplier_invoice_number || null, supplier_invoice_date: document.supplier_invoice_date || null, nir_date: document.nir_date, nir_time: document.nir_time || null, reception_date: document.reception_date, reception_time: document.reception_time || null, currency: document.currency, exchange_rate: document.exchange_rate, exchange_rate_date: document.exchange_rate_date || null, notes: document.notes || null, lines };
  }

  async function saveNir(silent = false, includeAttachments = true) {
    if (state.nirSavePromise) {
      await state.nirSavePromise;
      return saveNir(silent, includeAttachments);
    }
    const document = state.nirEditor; if (!document || document.status !== 'draft') return document;
    const snapshot = JSON.parse(JSON.stringify(document));
    const revision = state.nirEditRevision;
    const localDraft = String(snapshot.id || '').startsWith('local-nir-');
    state.nirSaving = true;
    const button = $('shop-nir-save'); if (button) button.disabled = true;
    try {
      const payload = nirUpdatePayload(snapshot);
      state.nirSavePromise = localDraft ? window.SHOP_API.createNir(payload) : window.SHOP_API.updateNir(snapshot.id, payload);
      let saved = await state.nirSavePromise;
      if (includeAttachments && state.nirPendingFiles.length) saved = await uploadPendingNirFiles(saved.id);
      if (state.nirEditor?.id === snapshot.id) {
        if (state.nirEditRevision === revision) {
          state.nirEditor = saved;
          state.nirEditRevision = 0;
        } else if (localDraft) {
          state.nirEditor = { ...saved, ...state.nirEditor, id: saved.id, temporary_number: saved.temporary_number, row_version: saved.row_version, attachments: saved.attachments || [] };
        } else {
          state.nirEditor.row_version = saved.row_version;
        }
      }
      if (state.nirEditRevision !== revision && state.nirEditor?.status === 'draft') {
        state.nirSavePromise = null;
        state.nirSaving = false;
        return await saveNir(silent, includeAttachments);
      }
      if (!silent) { renderNirEditor(); toast('Ciorna NIR a fost sincronizata.'); await loadNirs(state.pages.nirs); }
      return state.nirEditor;
    } catch (error) { if (!silent) toast(error.message || 'Ciorna nu a putut fi salvata.', 'error'); return null; }
    finally { state.nirSavePromise = null; state.nirSaving = false; if (button) button.disabled = false; }
  }

  async function resolveNirLine(index, options = {}) {
    const document = state.nirEditor; const line = document?.lines?.[index];
    if (!document?.supplier_id) { if (!options.silent) toast('Selecteaza furnizorul inainte de recunoasterea codului.', 'error'); return; }
    if (!line?.supplier_product_code && !line?.supplier_ean && !line?.supplier_product_name) { if (!options.silent) toast('Completeaza codul sau denumirea de pe factura.', 'error'); return; }
    const searchedCode = options.expectedCode ?? line.supplier_product_code;
    const searchedName = options.expectedName ?? line.supplier_product_name;
    try {
      const result = await window.SHOP_API.resolveSupplierProductReference(document.supplier_id, searchedCode, line.supplier_ean || '', searchedName || '');
      if (options.requestId && state.nirResolveRequestIds.get(index) !== options.requestId) return;
      if (String(line.supplier_product_code || '').trim() !== String(searchedCode || '').trim()) return;
      if (!searchedCode && String(line.supplier_product_name || '').trim() !== String(searchedName || '').trim()) return;
      if (!result.reference) { line.product_id = null; line.product_name = ''; line.product_image_url = ''; line.supplier_product_reference_id = null; line.resolution_status = 'unmatched'; if (!options.silent) toast('Nu exista o potrivire exacta. Alege produsul intern.', 'error'); }
      else Object.assign(line, { product_id: result.reference.product_id, product_name: result.reference.product_name, product_image_url: result.reference.product_image_url || '', supplier_product_reference_id: result.reference.id || null, supplier_product_name: line.supplier_product_name || result.reference.supplier_product_name || result.reference.product_name, conversion_factor: result.reference.conversion_factor, purchase_unit: result.reference.purchase_unit, stock_unit: result.reference.stock_unit, resolution_status: result.match_method === 'name_exact' ? 'matched_name' : 'matched_code' });
      renderNirEditor(); scheduleNirAutosave();
    } catch (error) { if (!options.silent) toast(error.message, 'error'); else { line.resolution_status = 'unmatched'; renderNirEditor(); } }
  }

  function openNirProductPicker(index) {
    state.nirProductLineIndex = index; $('shop-nir-product-search').value = state.nirEditor?.lines?.[index]?.supplier_product_name || '';
    $('shop-nir-product-results').innerHTML = '<p>Se cauta produsele...</p>'; openModal('shop-nir-product-picker'); void searchNirProducts($('shop-nir-product-search').value);
  }
  async function searchNirProducts(query) {
    try {
      const products = await window.SHOP_API.listProductOptions({ q: String(query || '').trim(), supplier_id: state.nirEditor?.supplier_id || '', limit: 50 });
      $('shop-nir-product-results').innerHTML = products.map(product => { const reference = product.supplier_reference; const supplierAlias = reference ? reference.supplier_product_code_original || reference.supplier_product_name : ''; return `<button type="button" data-nir-product-select="${esc(product.id)}">${productPicture(product.images?.[0], 'shop-nir-product-image')}<span><b>${esc(product.name)}</b><small>${esc(product.sku || 'Fara SKU')} · ${supplierAlias ? `asociat: ${esc(supplierAlias)}` : 'fara alias la acest furnizor'}</small></span><i>Asociaza ›</i></button>`; }).join('') || '<p>Niciun produs gasit.</p>';
      $('shop-nir-product-results').querySelectorAll('[data-nir-product-select]').forEach(button => button.addEventListener('click', () => void selectNirProduct(products.find(item => item.id === button.dataset.nirProductSelect))));
    } catch (error) { $('shop-nir-product-results').innerHTML = `<p>${esc(error.message)}</p>`; }
  }
  async function selectNirProduct(product) {
    const document = state.nirEditor; const line = document?.lines?.[state.nirProductLineIndex]; if (!product || !line) return;
    const reference = product.supplier_reference || null;
    const existingReferenceId = line.supplier_product_reference_id || null;
    const currentCode = String(line.supplier_product_code || '').trim();
    const currentName = String(line.supplier_product_name || '').trim();
    const currentEan = String(line.supplier_ean || '').trim();
    const canReuseReference = Boolean(reference && !currentCode && !currentName && !currentEan);
    Object.assign(line, {
      product_id: product.id,
      product_name: product.name,
      product_image_url: product.images?.[0]?.url || product.images?.[0]?.preview || '',
      supplier_product_reference_id: canReuseReference ? reference.id : existingReferenceId,
      supplier_product_code: currentCode || (canReuseReference ? reference.supplier_product_code_original || '' : ''),
      supplier_product_name: currentName || (canReuseReference ? reference.supplier_product_name || product.name : product.name),
      supplier_ean: currentEan || (canReuseReference ? reference.supplier_ean || '' : ''),
      purchase_unit: canReuseReference ? reference.purchase_unit || line.purchase_unit || 'buc' : line.purchase_unit,
      stock_unit: canReuseReference ? reference.stock_unit || line.stock_unit || 'buc' : line.stock_unit,
      conversion_factor: canReuseReference ? reference.conversion_factor || line.conversion_factor || '1' : line.conversion_factor,
      resolution_status: canReuseReference ? (reference.supplier_product_code_original ? 'matched_code' : 'matched_name') : 'matched_manual',
    });
    closeModal('shop-nir-product-picker'); renderNirEditor(); scheduleNirAutosave();
    toast(canReuseReference ? 'Codul și denumirea cunoscute au fost completate. Le poți modifica pentru un alias nou.' : 'Produsul a fost selectat. Denumirea rămâne editabilă și asocierea se memorează la salvare.');
  }

  async function confirmNir() {
    const correcting = Boolean(state.nirEditor?.nir_number);
    const saved = await saveNir(false); if (!saved) return;
    try {
      const validation = await window.SHOP_API.validateNir(saved.id);
      if (!validation.valid) return toast(validation.errors.join(' · '), 'error');
      if (validation.warnings?.length && !confirm(`${validation.warnings.join('\n')}\n\nContinui confirmarea?`)) return;
      const key = `${saved.id}-${saved.row_version}-${Date.now()}`;
      state.nirEditor = await window.SHOP_API.confirmNir(saved.id, saved.row_version, key);
      state.nirEditRevision = 0;
      renderNirEditor(); void loadNirAccountingDetails(); await loadNirs(state.pages.nirs); toast(correcting ? `NIR ${state.nirEditor.nir_number} corectat. Stocul Conta a fost recalculat.` : `NIR ${state.nirEditor.nir_number} confirmat. Stocul Conta a fost actualizat.`);
    } catch (error) { toast(error.message || 'Confirmarea a esuat. Nu s-a pastrat nicio modificare partiala.', 'error'); }
  }

  function keepLocalCorrectionAfterRestore(modified, restored) {
    state.nirCorrectionOriginal = JSON.parse(JSON.stringify(restored));
    state.nirEditor = {
      ...modified,
      status: 'confirmed',
      row_version: restored.row_version,
      confirmed_at: restored.confirmed_at,
      confirmed_by: restored.confirmed_by,
      subtotal_ron: restored.subtotal_ron,
      vat_total_ron: restored.vat_total_ron,
      grand_total_ron: restored.grand_total_ron,
      attachments: restored.attachments || modified.attachments || [],
    };
    state.nirEditRevision = 1;
    renderNirEditor();
  }

  async function restoreConfirmedNir(original) {
    let current = await window.SHOP_API.getNir(original.id);
    if (current.status === 'confirmed') return current;
    if (current.status !== 'draft') throw new Error('NIR-ul nu mai poate fi readus automat la versiunea confirmată.');
    current = await window.SHOP_API.updateNir(original.id, nirUpdatePayload(original, current.row_version));
    const restoreKey = `${original.id}-restore-${current.row_version}-${Date.now()}`;
    return window.SHOP_API.confirmNir(original.id, current.row_version, restoreKey);
  }

  async function reopenNirForCorrection() {
    const document = state.nirEditor;
    if (!document || document.status !== 'confirmed' || isNirCorrectionLocked(document)) return;
    state.nirCorrectionOriginal = JSON.parse(JSON.stringify(document));
    state.nirEditor = JSON.parse(JSON.stringify(document));
    state.nirPendingFiles = [];
    state.nirEditRevision = 0;
    renderNirEditor();
    requestAnimationFrame(() => {
      const firstField = $('shop-nir-editor')?.querySelector('[data-nir-field="supplier_invoice_series"]');
      firstField?.focus({ preventScroll: true });
      if (typeof firstField?.setSelectionRange === 'function') {
        const end = firstField.value.length;
        firstField.setSelectionRange(end, end);
      }
    });
    toast('Editarea este activă. NIR-ul rămâne confirmat până la aplicarea corectării.');
  }

  async function commitNirCorrection() {
    const original = state.nirCorrectionOriginal;
    const modified = state.nirEditor;
    if (!original || !modified || state.nirSaving || state.nirSavePromise) return;
    const button = $('shop-nir-correct');
    if (button) button.disabled = true;
    state.nirSaving = true;
    let serverReopened = false;
    try {
      const reopened = await window.SHOP_API.reopenNir(original.id, original.row_version);
      serverReopened = true;
      state.nirEditor = {
        ...JSON.parse(JSON.stringify(modified)),
        status: 'draft',
        row_version: reopened.row_version,
        confirmed_at: null,
        confirmed_by: null,
      };
      state.nirEditRevision = 0;
      state.nirSaving = false;
      let saved = await saveNir(true, false);
      state.nirSaving = true;
      if (!saved) throw new Error('Modificările nu au putut fi validate.');
      const validation = await window.SHOP_API.validateNir(saved.id);
      if (!validation.valid) {
        const restored = await restoreConfirmedNir(original);
        keepLocalCorrectionAfterRestore(modified, restored);
        toast(validation.errors.join(' · '), 'error');
        return;
      }
      if (validation.warnings?.length && !confirm(`${validation.warnings.join('\n')}\n\nAplici totuși corectarea?`)) {
        const restored = await restoreConfirmedNir(original);
        keepLocalCorrectionAfterRestore(modified, restored);
        return;
      }
      if (state.nirPendingFiles.length) saved = await uploadPendingNirFiles(saved.id);
      const key = `${saved.id}-correction-${saved.row_version}-${Date.now()}`;
      const confirmed = await window.SHOP_API.confirmNir(saved.id, saved.row_version, key);
      state.nirEditor = confirmed;
      state.nirCorrectionOriginal = null;
      state.nirPendingFiles = [];
      state.nirEditRevision = 0;
      renderNirEditor();
      void loadNirAccountingDetails();
      await loadNirs(state.pages.nirs);
      toast(`NIR ${confirmed.nir_number} corectat. Stocul Conta a fost recalculat.`);
    } catch (error) {
      if (serverReopened) {
        try {
          const restored = await restoreConfirmedNir(original);
          keepLocalCorrectionAfterRestore(modified, restored);
        } catch (restoreError) {
          toast(`Corectarea a eșuat și versiunea confirmată trebuie reîncărcată: ${restoreError.message || 'eroare necunoscută'}`, 'error');
          return;
        }
      }
      toast(error.message || 'Corectarea a eșuat. NIR-ul a rămas în versiunea confirmată inițială.', 'error');
    } finally {
      state.nirSaving = false;
      state.nirSavePromise = null;
      if (button) button.disabled = false;
    }
  }

  async function handleNirCorrectionAction() {
    if (state.nirCorrectionOriginal) {
      await commitNirCorrection();
      return;
    }
    if (state.nirEditor?.status === 'confirmed') {
      await reopenNirForCorrection();
      return;
    }
  }

  async function importNirFiles(event) {
    const files = [...(event.target.files || [])]; event.target.value = ''; if (!files.length || !state.nirEditor) return;
    for (const file of files) {
      if (file.size > 15 * 1024 * 1024) { toast(`${file.name}: fisierul depaseste limita de 15 MB.`, 'error'); continue; }
      const duplicate = state.nirPendingFiles.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified);
      if (!duplicate) state.nirPendingFiles.push(file);
    }
    renderNirEditor();
    toast(`${files.length === 1 ? 'Document pregatit' : 'Documente pregatite'} local. Se incarca numai cand apesi Salveaza ciorna.`);
  }

  async function loadNirAccountingDetails() {
    if (!state.nirEditor) return;
    try {
      const movements = await window.SHOP_API.getNirMovements(state.nirEditor.id);
      const movementQuantity = value => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(Number(value || 0));
      const movementDate = value => {
        const parsed = new Date(String(value || '').replace(' ', 'T'));
        return Number.isNaN(parsed.getTime()) ? String(value || '—') : parsed.toLocaleString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      };
      const movementType = value => ({ NIR_IN: 'INTRARE NIR', NIR_REVERSAL: 'STORNARE NIR', SALE_OUT: 'IESIRE VANZARE', MANUAL_ADJUSTMENT: 'AJUSTARE MANUALA' }[String(value || '').toUpperCase()] || String(value || 'MISCARE STOC').replaceAll('_', ' '));
      const summary = movements.reduce((totals, movement) => {
        const delta = Number(movement.accounting_quantity_delta ?? movement.quantity_delta ?? 0);
        totals.entries += delta > 0 ? delta : 0;
        totals.exits += delta < 0 ? Math.abs(delta) : 0;
        totals.net += delta;
        return totals;
      }, { entries: 0, exits: 0, net: 0 });
      const movementCards = movements.map((movement, index) => {
        const delta = Number(movement.accounting_quantity_delta ?? movement.quantity_delta ?? 0);
        const incoming = delta >= 0;
        const documentNumber = movement.movement_document_number || movement.note || 'Document de stoc';
        return `<article class="shop-nir-movement-card ${incoming ? 'incoming' : 'outgoing'}"><span class="shop-nir-movement-direction" aria-hidden="true">${incoming ? '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14"/></svg>' : nirUiIcon('reverse')}</span><div class="shop-nir-movement-main"><header><b>${esc(movementType(movement.movement_type))}</b><time>${esc(movementDate(movement.created_at))}</time></header><strong>${esc(movement.product_name || `Miscare ${index + 1}`)}</strong><p><span>${esc(movement.product_sku || 'Fara SKU')}</span><i>·</i><em>${esc(documentNumber)}</em></p><footer><span><small>CANTITATE</small><b>${delta > 0 ? '+' : '−'}${movementQuantity(Math.abs(delta))} buc</b></span><span><small>STOC DUPA</small><b>${movementQuantity(movement.accounting_quantity_after ?? movement.quantity_after)} buc</b></span><span><small>OPERATOR</small><b>${esc(movement.created_by || 'Sistem')}</b></span></footer></div></article>`;
      }).join('');
      const emptyState = '<div class="shop-nir-movement-empty"><span>' + nirUiIcon('product') + '</span><strong>Nu exista miscari de stoc</strong><p>Acest document nu a produs inca o intrare sau iesire contabila.</p></div>';
      $('shop-nir-accounting-details').innerHTML = `<section class="shop-nir-movement-board"><header class="shop-nir-movement-head"><span>${nirUiIcon('product')}</span><div><small>JURNAL CONTABIL</small><strong>Traseul stocului</strong><p>${isNirReversalDocument(state.nirEditor) ? 'Pozițiile anulate prin acest document de stornare, în ordine cronologică.' : 'Fiecare miscare produsa de acest NIR, explicata clar.'}</p></div><b>${movements.length}<small>MISCARI</small></b>${state.nirEditor.status === 'confirmed' && canNirStorno(state.nirEditor) && nirCan('NIR_REVERSE') ? '<button type="button" class="danger" id="shop-nir-reverse">' + nirUiIcon('reverse') + '<span>Stornare factură</span></button>' : ''}</header><div class="shop-nir-movement-summary"><span><small>INTRARI</small><strong class="positive">+${movementQuantity(summary.entries)}</strong></span><span><small>IESIRI</small><strong class="negative">−${movementQuantity(summary.exits)}</strong></span><span><small>EFECT NET</small><strong>${summary.net > 0 ? '+' : ''}${movementQuantity(summary.net)}</strong></span></div><div class="shop-nir-movement-list">${movementCards || emptyState}</div></section>`;
      $('shop-nir-reverse')?.addEventListener('click', openNirReverseDialog);
    } catch (error) { $('shop-nir-accounting-details').innerHTML = `<p>${esc(error.message)}</p>`; }
  }

  function nextSupplierInvoiceNumber(value) {
    const current = String(value || '').trim();
    const match = current.match(/^(.*?)(\d+)$/);
    if (!match) return '';
    const next = String(Number(match[2]) + 1).padStart(match[2].length, '0');
    return `${match[1]}${next}`;
  }

  function openNirReverseDialog() {
    const document = state.nirEditor;
    if (!document || document.status !== 'confirmed' || !canNirStorno(document) || !nirCan('NIR_REVERSE') || state.nirReversing) return;
    $('shop-nir-reverse-number').textContent = document.nir_number || document.temporary_number || 'NIR';
    $('shop-nir-reverse-supplier').textContent = document.supplier_name || 'Furnizor necompletat';
    const originalSeries = String(document.supplier_invoice_series || '').trim();
    const originalNumber = String(document.supplier_invoice_number || '').trim();
    const originalInvoice = [originalSeries, originalNumber].filter(Boolean).join('/') || 'Număr necompletat';
    $('shop-nir-storno-original-invoice').textContent = originalInvoice;
    $('shop-nir-storno-original-date').textContent = `Data ${document.supplier_invoice_date || '—'}`;
    $('shop-nir-storno-original-value').textContent = `Valoare ${money(document.grand_total_ron || 0)}`;
    const seriesField = $('shop-nir-storno-invoice-series');
    seriesField.value = originalSeries;
    seriesField.required = false;
    seriesField.dataset.required = 'false';
    $('shop-nir-storno-invoice-series-label').textContent = 'Serie factură storno (opțional)';
    $('shop-nir-storno-invoice-number').value = nextSupplierInvoiceNumber(originalNumber);
    $('shop-nir-storno-invoice-date').value = nirToday();
    state.nirStornoPendingFiles = [];
    renderNirStornoFiles();
    ['shop-nir-storno-invoice-series', 'shop-nir-storno-invoice-number', 'shop-nir-storno-invoice-date'].forEach(fieldId => $(fieldId).classList.remove('invalid'));
    $('shop-nir-storno-invoice-error').hidden = true;
    const availableLines = nirStornableLines(document);
    $('shop-nir-storno-lines').innerHTML = availableLines.map((line, index) => {
      const maximum = String(line.stornable_quantity || '0');
      const unit = String(line.stock_unit || line.purchase_unit || 'buc');
      return `<label class="active"><input type="checkbox" data-nir-storno-line="${esc(line.id)}" checked /><i>${String(index + 1).padStart(2, '0')}</i><span><strong>${esc(line.product_name || line.product_snapshot_name || line.supplier_product_name || `Produs ${index + 1}`)}</strong><small>${esc(line.supplier_product_code || line.sku_snapshot || 'Fara cod furnizor')} · maxim ${esc(quantity(maximum))} ${esc(unit)}</small></span><span class="shop-nir-storno-quantity"><small>CANTITATE STORNATĂ</small><span><input type="number" data-nir-storno-quantity-input min="0.0001" max="${esc(maximum)}" step="0.0001" value="${esc(String(Number(maximum)))}" inputmode="decimal" /><b>${esc(unit)}</b></span></span></label>`;
    }).join('') || '<p>Acest NIR nu mai are poziții disponibile pentru stornare.</p>';
    $('shop-nir-storno-lines').querySelectorAll('[data-nir-storno-line]').forEach(input => input.addEventListener('change', updateNirStornoSelection));
    $('shop-nir-storno-lines').querySelectorAll('[data-nir-storno-quantity-input]').forEach(input => {
      input.addEventListener('click', event => event.stopPropagation());
      input.addEventListener('input', () => { input.classList.remove('invalid'); $('shop-nir-storno-selection-error').hidden = true; });
    });
    $('shop-nir-storno-selection-error').hidden = true;
    updateNirStornoSelection();
    $('shop-nir-reverse-reason').value = '';
    $('shop-nir-reverse-reason').classList.remove('invalid');
    $('shop-nir-reverse-error').hidden = true;
    openModal('shop-nir-reverse-dialog');
    requestAnimationFrame(() => {
      const dialog = window.document.querySelector('#shop-nir-reverse-dialog .shop-nir-reverse-dialog');
      if (dialog) dialog.scrollTop = 0;
      $('shop-nir-storno-invoice-number')?.focus({ preventScroll: true });
    });
  }

  function updateNirStornoSelection() {
    const inputs = [...($('shop-nir-storno-lines')?.querySelectorAll('[data-nir-storno-line]') || [])];
    const selected = inputs.filter(input => input.checked);
    inputs.forEach(input => input.closest('label')?.classList.toggle('active', input.checked));
    const allButton = $('shop-nir-storno-all');
    const allSelected = inputs.length > 0 && selected.length === inputs.length;
    if (allButton) {
      allButton.disabled = inputs.length === 0;
      allButton.classList.toggle('active', allSelected);
      allButton.textContent = allSelected ? 'Deselectează toate' : 'Selectează toate';
    }
    const title = $('shop-nir-storno-selection-title');
    if (title) title.textContent = inputs.length ? `${selected.length} din ${inputs.length} produse selectate` : 'Nicio poziție disponibilă';
    if (selected.length && $('shop-nir-storno-selection-error')) $('shop-nir-storno-selection-error').hidden = true;
  }

  function toggleAllNirStornoLines() {
    const inputs = [...($('shop-nir-storno-lines')?.querySelectorAll('[data-nir-storno-line]') || [])];
    const shouldSelect = !inputs.length || inputs.some(input => !input.checked);
    inputs.forEach(input => { input.checked = shouldSelect; });
    updateNirStornoSelection();
  }

  function renderNirStornoFiles() {
    const list = $('shop-nir-storno-file-list');
    if (!list) return;
    list.innerHTML = state.nirStornoPendingFiles.length
      ? state.nirStornoPendingFiles.map((file, index) => `<article><span>${nirUiIcon('document')}</span><div><strong>${esc(file.name)}</strong><small>${(Number(file.size || 0) / 1024).toFixed(0)} KB · pregătit pentru încărcare</small></div><button type="button" data-nir-storno-file-remove="${index}" aria-label="Elimină documentul">${nirUiIcon('close')}</button></article>`).join('')
      : '<p>Trage sau alege factura: PDF · JPG · PNG · WEBP · XLSX · XML</p>';
    list.querySelectorAll('[data-nir-storno-file-remove]').forEach(button => button.addEventListener('click', () => {
      state.nirStornoPendingFiles.splice(Number(button.dataset.nirStornoFileRemove), 1);
      renderNirStornoFiles();
    }));
  }

  function importNirStornoFiles(event) {
    const files = [...(event.target.files || [])]; event.target.value = '';
    for (const file of files) {
      if (file.size > 15 * 1024 * 1024) { toast(`${file.name}: fișierul depășește limita de 15 MB.`, 'error'); continue; }
      const duplicate = state.nirStornoPendingFiles.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified);
      if (!duplicate) state.nirStornoPendingFiles.push(file);
    }
    renderNirStornoFiles();
  }

  async function uploadNirStornoFiles(documentId) {
    for (const file of [...state.nirStornoPendingFiles]) {
      const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '').split(',').pop()); reader.onerror = reject; reader.readAsDataURL(file); });
      const attachment = await window.SHOP_API.uploadNirAttachment(documentId, { file_name: file.name, mime_type: file.type || 'application/octet-stream', content_base64: base64 });
      await window.SHOP_API.extractNirAttachment(documentId, attachment.id);
      state.nirStornoPendingFiles = state.nirStornoPendingFiles.filter(item => item !== file);
    }
  }

  async function reverseNir() {
    const document = state.nirEditor;
    const reasonField = $('shop-nir-reverse-reason');
    const reason = String(reasonField?.value || '').trim();
    if (!document || document.status !== 'confirmed' || !canNirStorno(document) || !nirCan('NIR_REVERSE') || state.nirReversing) return;
    const seriesField = $('shop-nir-storno-invoice-series');
    const numberField = $('shop-nir-storno-invoice-number');
    const dateField = $('shop-nir-storno-invoice-date');
    const invoiceDetails = {
      supplier_invoice_series: String(seriesField?.value || '').trim() || null,
      supplier_invoice_number: String(numberField?.value || '').trim(),
      supplier_invoice_date: String(dateField?.value || '').trim(),
    };
    const selectedInputs = [...($('shop-nir-storno-lines')?.querySelectorAll('[data-nir-storno-line]:checked') || [])];
    const selectedLines = selectedInputs.map(input => ({ line_id: input.dataset.nirStornoLine, quantity: input.closest('label')?.querySelector('[data-nir-storno-quantity-input]')?.value || '' }));
    let firstInvalid = null;
    const invalidInvoiceFields = [
      ...(!invoiceDetails.supplier_invoice_number ? [numberField] : []),
      ...(!invoiceDetails.supplier_invoice_date ? [dateField] : []),
    ].filter(Boolean);
    invalidInvoiceFields.forEach(field => field.classList.add('invalid'));
    if (invalidInvoiceFields.length) {
      $('shop-nir-storno-invoice-error').hidden = false;
      firstInvalid = invalidInvoiceFields[0];
    }
    if (!selectedLines.length) {
      $('shop-nir-storno-selection-error').hidden = false;
      firstInvalid ||= $('shop-nir-storno-lines').querySelector('input');
    }
    selectedInputs.forEach(input => {
      const field = input.closest('label')?.querySelector('[data-nir-storno-quantity-input]');
      const numeric = Number(field?.value || 0); const maximum = Number(field?.max || 0);
      if (!field || !Number.isFinite(numeric) || numeric <= 0 || numeric > maximum) {
        field?.classList.add('invalid');
        $('shop-nir-storno-selection-error').hidden = false;
        firstInvalid ||= field || input;
      }
    });
    if (!reason) {
      reasonField?.classList.add('invalid');
      $('shop-nir-reverse-error').hidden = false;
      firstInvalid ||= reasonField;
    }
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }
    const button = $('shop-nir-reverse-confirm');
    const label = button?.querySelector('span');
    state.nirReversing = true;
    if (button) button.disabled = true;
    if (label) label.textContent = 'Se stornează...';
    try {
      const result = await window.SHOP_API.reverseNir(document.id, document.row_version, reason, selectedLines, invoiceDetails);
      const stornoDocument = result?.reversal || result?.storno?.document || (result?.storno && typeof result.storno === 'object' ? result.storno : null);
      let attachmentWarning = '';
      if (state.nirStornoPendingFiles.length && stornoDocument?.id) {
        try { await uploadNirStornoFiles(stornoDocument.id); }
        catch (uploadError) { attachmentWarning = ` Stornarea a fost creată, dar documentele nu s-au putut încărca: ${uploadError.message || 'eroare necunoscută'}`; }
      }
      const updatedOriginal = result?.original || result?.document || result?.storno?.original || await window.SHOP_API.getNir(document.id);
      state.nirEditor = { ...updatedOriginal, ...(result?.fully_storned ? { fully_storned: true, can_storno: false } : {}) };
      state.nirReversing = false;
      closeModal('shop-nir-reverse-dialog');
      renderNirEditor();
      void loadNirAccountingDetails();
      await loadNirs(state.pages.nirs);
      toast(`${result?.fully_storned || state.nirEditor.status === 'reversed' ? 'Factura a fost stornată integral.' : `${selectedLines.length} ${selectedLines.length === 1 ? 'poziție a fost stornată' : 'poziții au fost stornate'}.`} Document creat: ${stornoDocument?.nir_number || 'document de stornare'}.${attachmentWarning}`, attachmentWarning ? 'error' : 'success');
    } catch (error) {
      toast(error.message || 'Factura nu poate fi stornată.', 'error');
    } finally {
      state.nirReversing = false;
      if (button) button.disabled = false;
      if (label) label.textContent = 'Stornare factură';
    }
  }

  function saveNirDownload(file) {
    const bytes = Uint8Array.from(atob(file.content_base64), char => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: file.mime_type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = file.file_name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function isUnknownShopAction(error) {
    return /actiune\s+shop\s+necunoscuta/i.test(String(error?.message || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  }

  function legacyNirAttachmentFile(attachment) {
    const date = String(attachment?.created_at || '').match(/^(\d{4})-(\d{2})/);
    const id = String(attachment?.id || '').replace(/-/g, '').toLowerCase();
    const extension = String(attachment?.extension || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!date || !/^[a-f0-9]{32}$/.test(id) || !extension) return null;
    const apiBase = String(window.SHOP_API_URL || 'https://g-trots.ro/shop-api').replace(/\/$/, '');
    return { url: `${apiBase}/uploads/nir/${date[1]}/${date[2]}/${id}.${extension}`, fileName: attachment.original_name || `document.${extension}` };
  }

  async function saveLegacyNirAttachments(attachments) {
    const files = attachments.map(legacyNirAttachmentFile).filter(Boolean);
    if (!files.length || typeof window.saveRemoteFiles !== 'function') throw new Error('Documentele salvate nu pot fi descărcate cu această versiune.');
    const result = await window.saveRemoteFiles(files);
    if (!result?.success && !result?.canceled) throw new Error(result?.error || 'Documentele nu au putut fi salvate.');
    return result;
  }

  async function downloadNirAttachment(attachmentId) {
    if (!state.nirEditor?.id || !attachmentId) return;
    try {
      saveNirDownload(await window.SHOP_API.downloadNirAttachment(state.nirEditor.id, attachmentId));
      toast('Documentul furnizorului a fost descarcat.');
    } catch (error) {
      const attachment = state.nirEditor.attachments?.find(item => item.id === attachmentId);
      if (attachment && isUnknownShopAction(error)) {
        try { const result = await saveLegacyNirAttachments([attachment]); if (result?.success) toast('Documentul furnizorului a fost descarcat.'); }
        catch (legacyError) { toast(legacyError.message || 'Documentul nu a putut fi descarcat.', 'error'); }
      } else toast(error.message || 'Documentul nu a putut fi descarcat.', 'error');
    }
  }

  async function downloadAllNirAttachments() {
    if (!state.nirEditor?.id || !state.nirEditor.attachments?.length) return;
    try {
      saveNirDownload(await window.SHOP_API.downloadAllNirAttachments(state.nirEditor.id));
      toast('Arhiva cu toate documentele a fost descarcata.');
    } catch (error) {
      if (isUnknownShopAction(error)) {
        try { const result = await saveLegacyNirAttachments(state.nirEditor.attachments); if (result?.success) toast(`${result.count || state.nirEditor.attachments.length} documente au fost descarcate.`); }
        catch (legacyError) { toast(legacyError.message || 'Documentele nu au putut fi descarcate.', 'error'); }
      } else toast(error.message || 'Documentele nu au putut fi descarcate.', 'error');
    }
  }

  async function exportNir(format) {
    if (!state.nirEditor) return;
    try {
      saveNirDownload(await window.SHOP_API.exportNir(state.nirEditor.id, format));
    } catch (error) { toast(error.message || 'Exportul a esuat.', 'error'); }
  }

  function empty(title, text) { return `<div class="shop-commerce-empty"><b>◇</b><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`; }
  mount();
})();
