const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 920,
    webPreferences: { nodeIntegration: true, contextIsolation: false, offscreen: true, backgroundThrottling: false },
  });
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 && !message.includes('Electron Security Warning') && !message.includes('Failed to fetch')) errors.push(message);
  });
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await win.webContents.executeJavaScript(`(() => {
    document.getElementById('startup-loader').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'none';
    const sources = [
      { id:'s1', name:'G-Trots', domain:'g-trots.ro', base_url:'https://g-trots.ro', is_default:true, is_active:true, sort_order:0, product_count:12 },
      { id:'s2', name:'Boomag', domain:'boomag.ro', base_url:'https://boomag.ro', is_default:false, is_active:false, sort_order:1, product_count:37 }
    ];
    const brands = [
      { id:'b1', name:'Universal', slug:'universal', is_active:true },
      { id:'b2', name:'KuKirin', slug:'kukirin', is_active:true },
      { id:'b3', name:'Xiaomi', slug:'xiaomi', is_active:true },
      { id:'b4', name:'Ninebot', slug:'ninebot', is_active:true }
    ];
    const qaImageOrange = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22400%22%3E%3Crect width=%22400%22 height=%22400%22 rx=%2240%22 fill=%22%23ff6b00%22/%3E%3Ccircle cx=%22200%22 cy=%22200%22 r=%22110%22 fill=%22%23171519%22/%3E%3C/svg%3E';
    const qaImageBlue = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22400%22%3E%3Crect width=%22400%22 height=%22400%22 rx=%2240%22 fill=%22%2338bdf8%22/%3E%3Ccircle cx=%22200%22 cy=%22200%22 r=%22110%22 fill=%22%23ffffff%22/%3E%3C/svg%3E';
    const products = Array.from({ length: 31 }, (_, index) => ({ id:'p' + (index + 1), name:'Anvelopa G10 ' + (index + 1), slug:'anvelopa-g10-' + (index + 1), sku:'GT-' + String(index + 1).padStart(3, '0'), source_id:'s1', source_domain:'g-trots.ro', source_url:'', price:149, sale_price:119, discount_type:'fixed', discount_value:30, discount_percent:20.13, short_description:'Anvelopa testata in service.', description_html:'<p><strong>Profil aderent</strong> pentru drum mixt.</p>', category_id:null, manufacturer_id:null, brand_ids:[], stock_mode:'tracked', stock_quantity:4, low_stock_threshold:3, is_active:true, is_featured:index === 0, images:index === 0 ? [{ id:'i1', url:qaImageOrange, alt_text:'Imagine portocalie', sort_order:0 }, { id:'i2', url:qaImageBlue, alt_text:'Imagine albastra', sort_order:1 }] : [] }));
    const qaOrder = { id:'o1', order_number:'GT-QA-ORDER', created_at:'2026-08-26 10:00:00', customer_name:'Client QA', customer_phone:'0700000000', customer_email:'client@example.com', address:'Strada Test 1', city:'Bucuresti', county:'Bucuresti', postal_code:'010101', shipping_method_name:'Curier standard', shipping_cost:25, subtotal:119, total:144, payment_method:'cash_on_delivery', payment_status:'pending', status:'new', admin_notes:'', customer_notes:'Vreau comanda livrata cat mai repede.', status_history:[], items:[{ product_name:'Anvelopa G10 1', product_sku:'GT-001', quantity:1, unit_price:119, line_total:119, image_url:qaImageOrange }] };
    const qaOrders = Array.from({ length: 13 }, (_, index) => ({
      ...qaOrder,
      id:'o' + (index + 1),
      order_number:'GT-QA-' + String(index + 1).padStart(4, '0'),
      created_at:'2026-08-' + String(26 - (index % 5)).padStart(2, '0') + ' ' + String(10 + (index % 8)).padStart(2, '0') + ':00:00',
      customer_name:index % 2 ? 'Alexie Test' : 'Client QA',
      customer_phone:'07000000' + String(index).padStart(2, '0'),
      payment_method:index % 3 === 0 ? 'cash_on_delivery' : 'card',
      payment_status:index % 3 === 0 ? 'pending' : 'paid',
      status:index < 3 ? 'new' : (index < 6 ? 'confirmed' : (index < 9 ? 'processing' : (index === 11 ? 'refunded' : (index === 12 ? 'cancelled' : 'completed')))),
      total:144 + index,
    }));
    const productSales = qaOrders.map((order, index) => ({ id:order.id, order_number:order.order_number, created_at:order.created_at, customer_name:order.customer_name, quantity:(index % 3) + 1, unit_price:119, line_total:119 * ((index % 3) + 1), status:order.status }));
    window.SHOP_API = {
      loadProductManager: async () => ({ products, categories:[], brands, manufacturers:[], sources }),
      getDashboardStats: async () => ({ revenue:18450, orders_count:42, new_orders_count:3, acquisitions:9300, profit:9150, products_count:31, recent_orders:qaOrders.slice(0, 6) }),
      listProducts: async () => products, getProduct: async () => products[0], getProductStats: async () => ({ product:{ ...products[0], cost_price:70, view_count:286, review_average:4.5 }, orders_count:productSales.length, units_sold:25, revenue:2975, acquisition_total:1750, profit:1225, orders:productSales, reviews:[{ id:'r1', customer_name:'Client QA', rating:5, message:'Produs excelent.', created_at:'2026-08-26', admin_reply:'' }, { id:'r2', customer_name:'Alexie Test', rating:4, message:'Foarte bun.', created_at:'2026-08-25', admin_reply:'' }] }), createProduct: async value => value, updateProduct: async (_id, value) => value, deleteProduct: async () => ({ success:true, deleted_files:3 }),
      listProductReviews: async () => [], replyProductReview: async () => ({}), deleteProductReview: async () => ({ success:true }),
      listCategories: async () => [], listBrands: async () => brands, listManufacturers: async () => [], listProductSources: async () => sources,
      createProductSource: async value => value, updateProductSource: async (_id, value) => value, deleteProductSource: async () => ({success:true}),
      listOrders: async () => qaOrders, getOrder: async (id) => qaOrders.find(order => order.id === id) || qaOrder, updateOrder: async (id, value) => ({ ...(qaOrders.find(order => order.id === id) || qaOrder), ...value }), listInventory: async () => products, listInventoryMovements: async () => [], adjustStock: async () => products[0],
      getPaymentSettings: async () => ({ card_enabled:true, cash_on_delivery_enabled:true, card_label:'Card online', cash_on_delivery_label:'Ramburs la curier' }), updatePaymentSettings: async value => value,
      listShippingMethods: async () => [], createShippingMethod: async value => value, updateShippingMethod: async (_id, value) => value, deleteShippingMethod: async () => ({success:true})
    };
    window.selectAppModule('shop');
  })()`);
  await sleep(350);

  const outputDir = path.join(__dirname, '..', '..', 'tmp', 'qa-shop-commerce');
  fs.mkdirSync(outputDir, { recursive: true });
  const dashboardPath = path.join(outputDir, 'dashboard.png');
  fs.writeFileSync(dashboardPath, (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`window.switchTab('shop-products')`);
  await sleep(250);
  const productsPath = path.join(outputDir, 'products.png');
  fs.writeFileSync(productsPath, (await win.webContents.capturePage()).toPNG());

  await win.webContents.executeJavaScript(`document.querySelector('#shop-products-content [data-product-open]').click()`);
  await sleep(250);
  await win.webContents.executeJavaScript(`(() => {
    window.__qaProductSaleRows = document.querySelectorAll('#shop-product-detail-content [data-product-sale-order]').length;
    window.__qaProductMetricLabels = [...document.querySelectorAll('#shop-product-detail-content .shop-detail-metrics small')].map(node => node.textContent.trim());
    window.__qaProductSalePageSizes = [...document.querySelectorAll('#shop-productSales-page-size option')].map(option => Number(option.value));
    document.getElementById('shop-product-detail-content').scrollTop = 540;
  })()`);
  await sleep(100);
  const productDetailPath = path.join(outputDir, 'product-detail.png');
  fs.writeFileSync(productDetailPath, (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('#shop-product-detail-modal [data-commerce-close]').click()`);
  await sleep(220);

  await win.webContents.executeJavaScript(`document.querySelector('#shop-products-content [data-product-edit]').click()`);
  await sleep(250);
  const editorPath = path.join(outputDir, 'product-editor.png');
  fs.writeFileSync(editorPath, (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`(() => {
    const cards = [...document.querySelectorAll('#shop-product-gallery .shop-gallery-card')];
    const before = cards[0]?.querySelector('.shop-product-gallery-image')?.style.backgroundImage || '';
    const transfer = new DataTransfer();
    cards[0]?.dispatchEvent(new DragEvent('dragstart', { bubbles:true, dataTransfer:transfer }));
    cards[1]?.dispatchEvent(new DragEvent('dragover', { bubbles:true, cancelable:true, dataTransfer:transfer }));
    cards[1]?.dispatchEvent(new DragEvent('drop', { bubbles:true, cancelable:true, dataTransfer:transfer }));
    const after = document.querySelector('#shop-product-gallery .shop-gallery-card .shop-product-gallery-image')?.style.backgroundImage || '';
    window.__qaDesktopDragReordered = Boolean(before && after && before !== after);
    const nameInput = document.getElementById('shop-product-name');
    nameInput.value = 'Produs Slug Automat';
    nameInput.dispatchEvent(new Event('input', { bubbles:true }));
    window.__qaSlugAutoUpdates = document.getElementById('shop-product-slug').value === 'produs-slug-automat';
    nameInput.value = 'Anvelopa G10 2';
    nameInput.dispatchEvent(new Event('input', { bubbles:true }));
    window.__qaDuplicateNameWarning = !document.getElementById('shop-product-name-error').hidden && nameInput.classList.contains('is-invalid');
    document.getElementById('shop-product-brands-toggle').click();
    window.__qaBrandDropdownOptions = document.querySelectorAll('#shop-product-brands input').length;
    document.querySelector('#shop-product-brands input')?.click();
    window.__qaBrandSummaryUpdates = document.getElementById('shop-product-brands-summary').textContent.includes('Universal');
    window.__qaNoManualCostInput = !document.getElementById('shop-product-cost-price');
    const sourceSelect = document.getElementById('shop-product-source');
    if (![...sourceSelect.options].some(option => option.value === 's2')) sourceSelect.add(new Option('Boomag · boomag.ro', 's2'));
    sourceSelect.value = 's2';
    sourceSelect.dispatchEvent(new Event('change', { bubbles:true }));
    document.getElementById('shop-product-supplier-base-price').value = '100';
    document.getElementById('shop-product-price').value = '149';
    document.getElementById('shop-product-price').dispatchEvent(new Event('input', { bubbles:true }));
    window.__qaBoomagPricingVisible = !document.getElementById('shop-product-boomag-pricing').hidden;
    window.__qaBoomagSupplierPriceDisabled = document.getElementById('shop-product-supplier-base-price').disabled;
    window.__qaBoomagDifferenceDisabled = document.getElementById('shop-product-price-difference').disabled;
    window.__qaBoomagDifference = document.getElementById('shop-product-price-difference').value;
  })()`);
  await win.webContents.executeJavaScript(`document.querySelector('[data-commerce-close="shop-product-modal"]').click()`);
  await sleep(220);
  await win.webContents.executeJavaScript(`window.switchTab('shop-sources')`);
  await sleep(250);
  const sourcesPath = path.join(outputDir, 'sources.png');
  fs.writeFileSync(sourcesPath, (await win.webContents.capturePage()).toPNG());

  await win.webContents.executeJavaScript(`window.switchTab('shop-orders')`);
  win.setSize(938, 936);
  win.webContents.setZoomFactor(1);
  await sleep(250);
  const ordersPath = path.join(outputDir, 'orders.png');
  fs.writeFileSync(ordersPath, (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('#shop-orders-content [data-order-open]').click()`);
  await sleep(250);
  const orderContactPath = path.join(outputDir, 'order-modal-contact.png');
  fs.writeFileSync(orderContactPath, (await win.webContents.capturePage()).toPNG());
  win.webContents.setZoomFactor(2);
  await sleep(120);
  await win.webContents.executeJavaScript(`(() => {
    const nextStatus = document.querySelector('input[name="shop-order-status"][value="confirmed"]');
    nextStatus.click();
    const notify = document.getElementById('shop-order-notify');
    const details = document.getElementById('shop-order-details');
    details.scrollTop = Math.max(0, notify.offsetTop - details.clientHeight / 2);
    const scrollBeforeNotify = details.scrollTop;
    notify.click();
    window.__qaOrderNotifyScrollDelta = Math.abs(details.scrollTop - scrollBeforeNotify);
    details.scrollTop = details.scrollHeight;
  })()`);
  await sleep(100);
  const orderModalPath = path.join(outputDir, 'order-modal-notify.png');
  fs.writeFileSync(orderModalPath, (await win.webContents.capturePage()).toPNG());

  const metrics = await win.webContents.executeJavaScript(`(() => ({
    productRows: document.querySelectorAll('#shop-products-content tbody tr').length,
    productPaginationButtons: document.querySelectorAll('#shop-products-content .shop-commerce-pagination button').length,
    productSaleRows: Number(window.__qaProductSaleRows || 0),
    productMetricLabels: window.__qaProductMetricLabels || [],
    productSalePageSizes: window.__qaProductSalePageSizes || [],
    editorSections: document.querySelectorAll('#shop-product-modal .shop-editor-section').length,
    imageInputMultiple: document.getElementById('shop-product-images-input').multiple,
    desktopDragReordered: Boolean(window.__qaDesktopDragReordered),
    slugAutoUpdates: Boolean(window.__qaSlugAutoUpdates),
    duplicateNameWarning: Boolean(window.__qaDuplicateNameWarning),
    brandDropdownOptions: Number(window.__qaBrandDropdownOptions || 0),
    brandSummaryUpdates: Boolean(window.__qaBrandSummaryUpdates),
    noManualCostInput: Boolean(window.__qaNoManualCostInput),
    boomagPricingVisible: Boolean(window.__qaBoomagPricingVisible),
    boomagSupplierPriceDisabled: Boolean(window.__qaBoomagSupplierPriceDisabled),
    boomagDifferenceDisabled: Boolean(window.__qaBoomagDifferenceDisabled),
    boomagDifference: window.__qaBoomagDifference || '',
    discountTypes: [...document.querySelectorAll('#shop-product-discount-type option')].map(option => option.value),
    hasSourceLinkField: Boolean(document.getElementById('shop-product-source-url')),
    sourceRows: document.querySelectorAll('#shop-sources-content .shop-settings-row').length,
    sourceSwitches: document.querySelectorAll('#shop-sources-content [data-source-toggle]').length,
    sourceCounts: [...document.querySelectorAll('#shop-sources-content .commerce-source-switch > b')].map(node => node.textContent.trim()),
    bodyHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    orderNotifyChecked: document.getElementById('shop-order-notify')?.checked,
    orderNotifyScrollDelta: Number(window.__qaOrderNotifyScrollDelta || 0),
    orderContactActions: document.querySelectorAll('#shop-order-details .shop-order-contact-actions button').length,
    orderDeliveryRows: document.querySelectorAll('#shop-order-details .shop-order-summary-card:nth-child(2) .shop-order-detail-row').length,
    orderKpiCount: document.querySelectorAll('#shop-orders-content .shop-order-kpi').length,
    orderModalRects: (() => { const modal = document.querySelector('#shop-order-modal .shop-commerce-modal'); const scroll = document.getElementById('shop-order-details'); const footer = modal?.querySelector(':scope > footer'); return Object.fromEntries([['modal',modal],['scroll',scroll],['footer',footer]].map(([key,node]) => [key, node ? { top:Math.round(node.getBoundingClientRect().top), bottom:Math.round(node.getBoundingClientRect().bottom), height:Math.round(node.getBoundingClientRect().height), scrollHeight:node.scrollHeight } : null])); })(),
    heroRects: (() => { const hero = document.querySelector('.shop-commerce-hero'); const back = hero?.querySelector('.shop-back-btn'); const title = hero?.querySelector('.shop-commerce-title'); const actions = hero?.querySelector('.shop-commerce-head-actions'); return Object.fromEntries([['hero',hero],['back',back],['title',title],['actions',actions]].map(([key,node]) => [key, node ? { x:Math.round(node.getBoundingClientRect().x), width:Math.round(node.getBoundingClientRect().width) } : null])); })(),
  }))()`);
  console.log(JSON.stringify({ ...metrics, errors, screenshots: { dashboardPath, productsPath, productDetailPath, editorPath, sourcesPath, ordersPath, orderContactPath, orderModalPath } }, null, 2));
  await win.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
