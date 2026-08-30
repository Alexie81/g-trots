const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1500,
    height: 960,
    webPreferences: { nodeIntegration: true, contextIsolation: false, offscreen: true, backgroundThrottling: false },
  });
  const errors = [];
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2 && !message.includes('Electron Security Warning') && !message.includes('Failed to fetch')) errors.push(message);
  });
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  const setup = await win.webContents.executeJavaScript(`(() => { try {
    document.getElementById('startup-loader').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'none';
    const supplier = { id:'supplier-1', name:'Furnizor Test România', cui:'RO12345678', default_currency:'EUR', is_active:true };
    const warehouse = { id:'warehouse-1', name:'Gestiune principală', is_default:true, is_active:true };
    const nirs = [
      { id:'nir-1', temporary_number:'DRAFT-20260829-A1B2', nir_number:null, status:'draft', supplier_id:supplier.id, supplier_name:supplier.name, supplier_invoice_series:'FT', supplier_invoice_number:'1028', supplier_invoice_date:'2026-08-29', nir_date:'2026-08-29', reception_date:'2026-08-29', currency:'EUR', exchange_rate:'5.07000000', line_count:2, grand_total_ron:'4860.42' },
      { id:'nir-2', temporary_number:'DRAFT-OLD', nir_number:'NIR-2026-000021', status:'confirmed', supplier_id:supplier.id, supplier_name:'Boomag Distribution', supplier_invoice_series:'BM', supplier_invoice_number:'8812', supplier_invoice_date:'2026-08-28', nir_date:'2026-08-28', reception_date:'2026-08-28', currency:'RON', exchange_rate:'1', line_count:4, grand_total_ron:'9204.00' },
    ];
    const inventory = [
      { id:'stock-1', name:'Cască FRV Street Panther', sku:'SE-CMM087', supplier_product_code:'CASCA-FRV-02', inventory_search_terms:'KIDOTOYS SRL George Distribution SRL RO87654321', source_name:'Boomag', source_domain:'boomag.ro', stock_mode:'tracked', stock_quantity:8, supplier_stock_quantity:12, accounting_stock_quantity:6, low_stock_threshold:3, images:[] },
      { id:'stock-2', name:'Roată completă pentru trotinetă', sku:'ROATA-10', supplier_product_code:'WH-100', source_name:'Depozit local', source_domain:'local', stock_mode:'tracked', stock_quantity:2, supplier_stock_quantity:0, accounting_stock_quantity:2, low_stock_threshold:3, images:[] },
    ];
    const stockMovements = Array.from({ length:8 }, (_, index) => ({ id:'stock-movement-' + index, product_id:'stock-1', product_name:'Cască FRV Street Panther', nir_document_id:'stock-nir-' + (index + 1), movement_type:'NIR_IN', quantity_delta:index + 1, quantity_after:20 + index, accounting_quantity_delta:String(index + 1), accounting_quantity_after:String(20 + index), inventory_unit_cost_ron:String(80 + index), inventory_cost_total_ron:String((80 + index) * (index + 1)), note:'Recepție NIR-2026-0000' + (index + 1), created_at:'2026-08-' + String(20 + index).padStart(2, '0') + 'T14:3' + index + ':00' })).concat(Array.from({ length:4 }, (_, index) => ({ id:'stock-adjustment-' + index, product_id:'stock-1', product_name:'Cască FRV Street Panther', nir_document_id:null, movement_type:index % 2 ? 'SALE_OUT' : 'MANUAL_ADJUSTMENT', quantity_delta:index % 2 ? -1 : 2, quantity_after:30 - index, accounting_quantity_delta:String(index % 2 ? -1 : 2), accounting_quantity_after:String(30 - index), note:index % 2 ? 'Ieșire test' : 'Corecție inventar', created_at:'2026-08-29T16:0' + index + ':00' })));
    const blankLine = { id:'line-local', product_id:null, product_name:'', supplier_product_reference_id:null, supplier_product_code:'CASCA-FRV-02', supplier_product_name:'Cască FRV Street Panther negru mat', supplier_ean:'', purchase_unit:'buc', stock_unit:'buc', invoiced_quantity:'2', received_quantity:'2', accepted_quantity:'2', rejected_quantity:'0', conversion_factor:'1', unit_price:'420', discount_percent:'0', vat_rate:'21', allocated_cost_ron:'0', is_stock_item:true, resolution_status:'unmatched', line_total_ron:'1016.40', inventory_unit_cost_ron:'420' };
    const qaDocument = { id:'local-nir-test', temporary_number:'NIR nesalvat', nir_number:null, status:'draft', supplier_id:supplier.id, supplier_name:supplier.name, warehouse_id:warehouse.id, supplier_invoice_series:'FT', supplier_invoice_number:'1028', supplier_invoice_date:'2026-08-29', nir_date:'2026-08-29', reception_date:'2026-08-29', currency:'EUR', exchange_rate:'5.07000000', exchange_rate_date:'2026-08-29', notes:'', row_version:0, subtotal_ron:'0', vat_total_ron:'0', grand_total_ron:'0', inventory_cost_total_ron:'0', lines:[blankLine], attachments:[], permissions:['NIR_CREATE','NIR_EDIT_DRAFT','NIR_CONFIRM','NIR_REVERSE','NIR_VIEW_COSTS','NIR_EXPORT','SUPPLIER_CREATE'] };
    window.__nirQaCalls = { create:0, update:0, delete:0, reopen:0, reverse:0, reverseReason:null, deletedId:null, openedNirId:null, downloadOne:0, downloadAll:0 };
    window.SHOP_API = {
      getNirPermissions: async () => ({ permissions:qaDocument.permissions }),
      getBnrExchangeRate: async (currency, date) => ({ currency, rate:currency === 'EUR' ? '5.07000000' : '1.00000000', date:date || '2026-08-29', requested_date:date || '2026-08-29', source:'BNR' }),
      listWarehouses: async () => [warehouse],
      searchSuppliers: async () => [supplier],
      listNirs: async ({ page }) => ({ items:nirs, page:page || 1, page_size:15, total:nirs.length, total_pages:1, permissions:qaDocument.permissions }),
      listInventory: async () => inventory,
      listInventoryMovements: async id => id === 'stock-1' ? stockMovements : [],
      getNir: async id => { window.__nirQaCalls.openedNirId = id; const confirmed = id === 'nir-2' || String(id).startsWith('stock-nir-'); return { ...qaDocument, id, temporary_number:id === 'nir-1' ? 'DRAFT-20260829-A1B2' : qaDocument.temporary_number, nir_number:confirmed ? 'NIR-2026-000099' : null, status:confirmed ? 'confirmed' : 'draft', attachments:confirmed ? [{ id:'attachment-1', original_name:'factura-furnizor.pdf', mime_type:'application/pdf', extension:'pdf', file_size:409600, sha256:'qa1', extraction_status:'extracted', extraction_message:null, created_at:'2026-08-29' }, { id:'attachment-2', original_name:'aviz-marfa.png', mime_type:'image/png', extension:'png', file_size:182000, sha256:'qa2', extraction_status:'not_requested', extraction_message:null, created_at:'2026-08-29' }] : [], row_version:id === 'nir-1' ? 2 : qaDocument.row_version }; },
      createNir: async value => { window.__nirQaCalls.create += 1; return { ...qaDocument, ...value, id:'nir-saved', temporary_number:'DRAFT-SAVED', row_version:1 }; },
      updateNir: async (_id, value) => { window.__nirQaCalls.update += 1; return { ...qaDocument, ...value, id:'nir-saved', row_version:2 }; },
      deleteNir: async id => { window.__nirQaCalls.delete += 1; window.__nirQaCalls.deletedId = id; return { success:true, deleted:1, deleted_ids:[id] }; },
      listProductOptions: async () => [{ id:'product-1', name:'Cască FRV Street Panther full face, negru mat', sku:'WT-SP-1386', accounting_stock_quantity:'8', images:[], supplier_reference:{ id:'reference-qa', supplier_product_code_original:'CASCA-FRV-02', supplier_product_name:'Cască Panther furnizor', supplier_ean:'594000000001', purchase_unit:'cutie', stock_unit:'buc', conversion_factor:'2', is_primary_for_supplier:true } }],
      resolveSupplierProductReference: async (_supplierId, code, _ean, name) => !code && name === 'Cască FRV Street Panther full face, negru mat' ? ({ match_method:'name_exact', reference:{ id:null, product_id:'product-1', product_name:name, product_image_url:'', supplier_product_name:name, conversion_factor:'1', purchase_unit:'buc', stock_unit:'buc' } }) : ({ reference:null }),
      validateNir: async () => ({ valid:true, errors:[], warnings:[] }),
      confirmNir: async () => ({ ...qaDocument, id:'nir-saved', status:'confirmed', nir_number:'NIR-2026-000022' }),
      reopenNir: async (id, rowVersion) => { window.__nirQaCalls.reopen += 1; return { ...qaDocument, id, status:'draft', nir_number:'NIR-2026-000099', row_version:Number(rowVersion || 0) + 1, attachments:[{ id:'attachment-1', original_name:'factura-furnizor.pdf', mime_type:'application/pdf', extension:'pdf', file_size:409600, sha256:'qa1', extraction_status:'extracted', extraction_message:null, created_at:'2026-08-29' }] }; },
      reverseNir: async (id, rowVersion, reason) => { window.__nirQaCalls.reverse += 1; window.__nirQaCalls.reverseReason = reason; return { original:{ ...qaDocument, id, status:'reversed', nir_number:'NIR-2026-000099', row_version:Number(rowVersion || 0) + 1 }, reversal:{ ...qaDocument, id:'reversal-1', status:'confirmed', nir_number:'REV-2026-000100' } }; },
      getNirFifoLayers: async () => [],
      getNirMovements: async () => [
        { id:'movement-in', product_id:'stock-1', product_name:'Cască FRV Street Panther', product_sku:'SE-CMM087', nir_document_id:'nir-2', movement_type:'NIR_IN', quantity_delta:'1', quantity_after:'2', accounting_quantity_delta:'1', accounting_quantity_after:'2', movement_document_number:'NIR-2026-000099', created_by:'Administrator', created_at:'2026-08-30 12:43:34' },
        { id:'movement-reversal', product_id:'stock-1', product_name:'Cască FRV Street Panther', product_sku:'SE-CMM087', nir_document_id:'reversal-1', movement_type:'NIR_REVERSAL', quantity_delta:'-1', quantity_after:'1', accounting_quantity_delta:'-1', accounting_quantity_after:'1', movement_document_number:'REV-2026-000100', created_by:'Administrator', created_at:'2026-08-30 12:47:09' },
      ],
      downloadNirAttachment: async () => { window.__nirQaCalls.downloadOne += 1; return { file_name:'factura-furnizor.pdf', mime_type:'application/pdf', content_base64:'UUE=' }; },
      downloadAllNirAttachments: async () => { window.__nirQaCalls.downloadAll += 1; return { file_name:'NIR-documente.zip', mime_type:'application/zip', content_base64:'UUE=' }; },
      loadProductManager: async options => { const normalize=value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); const term=normalize(options.q); const rows = term ? inventory.filter(product => normalize(product.name + ' ' + product.sku).includes(term)) : inventory; return { products:rows, total:rows.length, page:1, page_size:10, categories:[], brands:[], manufacturers:[], sources:[] }; },
      getProductStats: async id => ({ product:{ ...inventory.find(item => item.id === id), images:[], cost_price:'80', view_count:0, review_average:0 }, orders:[], reviews:[], revenue:0, units_sold:0, acquisition_total:0, profit:0 }),
      listProductSupplierReferences: async () => [
        { id:'reference-kido', supplier_id:'supplier-kido', supplier_name:'KIDOTOYS SRL', product_id:'stock-1', supplier_product_code_original:'SE-CMM087', supplier_product_code_normalized:'SECMM087', supplier_product_name:null, supplier_ean:null, purchase_unit:'buc', stock_unit:'buc', conversion_factor:'1', is_primary_for_supplier:true, is_active:true, last_used_at:'2026-08-29', last_confirmed_purchase_price:'30', last_confirmed_currency:'RON', last_confirmed_price_ron:'30', last_confirmed_at:'2026-08-29 21:46:09', row_version:1 },
      ],
      getProductPurchaseHistory: async () => ({ items:[
        { nir_line_id:'history-kido', supplier_id:'supplier-kido', supplier_name:'KIDOTOYS SRL', supplier_code:'SE-CMM087', supplier_product_name:'Cască FRV Street Panther', supplier_ean:'', inventory_unit_cost_ron:'30', reception_date:'2026-08-28', stock_quantity:'1', unit_price:'30', currency:'RON', nir_number:'NIR-2026-000098' },
        { nir_line_id:'history-george', supplier_id:'supplier-george', supplier_name:'George Distribution SRL', supplier_code:'', supplier_product_name:'Cască premium George', supplier_ean:'', inventory_unit_cost_ron:'32', reception_date:'2026-08-29', stock_quantity:'1', unit_price:'32', currency:'RON', nir_number:'NIR-2026-000099' },
      ], suppliers:[], statistics:{} }),
    };
    window.selectAppModule('shop');
    window.switchTab('shop-nirs');
    return { ok:true };
  } catch (error) { return { ok:false, error:String(error && error.stack || error) }; } })()`);
  if (!setup.ok) throw new Error(setup.error);
  await wait(600);
  const output = path.join(__dirname, '..', '..', 'tmp', 'qa-nir-ui');
  fs.mkdirSync(output, { recursive: true });
  await win.webContents.executeJavaScript(`document.getElementById('shop-nir-registry').scrollIntoView({ block:'center' })`);
  await wait(120);
  const registry = path.join(output, 'nir-registry.png');
  fs.writeFileSync(registry, (await win.webContents.capturePage()).toPNG());
  win.setSize(3120, 960);
  await wait(180);
  await win.webContents.executeJavaScript(`document.getElementById('shop-nir-registry').scrollIntoView({ block:'center' })`);
  await wait(120);
  const wideRegistry = await win.webContents.executeJavaScript(`(() => { const registry=document.querySelector('.shop-nir-registry'); const card=registry.querySelector('.shop-nir-registry-card'); return { columns:getComputedStyle(registry).gridTemplateColumns, registryWidth:Math.round(registry.getBoundingClientRect().width), cardWidth:Math.round(card.getBoundingClientRect().width), cardHeight:Math.round(card.getBoundingClientRect().height) }; })()`);
  const registryWide = path.join(output, 'nir-registry-wide.png');
  fs.writeFileSync(registryWide, (await win.webContents.capturePage()).toPNG());
  win.setSize(1500, 960);
  await wait(180);
  await win.webContents.executeJavaScript(`(() => { const input=document.getElementById('shop-nir-search'); input.focus(); input.value='furnizor test'; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await wait(450);
  const searchKeepsFocus = await win.webContents.executeJavaScript(`document.activeElement === document.getElementById('shop-nir-search')`);
  await win.webContents.executeJavaScript(`document.querySelector('#tab-shop-nirs [data-commerce-add="shop-nirs-content"]').click()`);
  await wait(500);
  await win.webContents.executeJavaScript(`(() => { const input=document.querySelector('[data-nir-field="supplier_invoice_number"]'); input.value='QA-NE-SALVAT'; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await wait(500);
  const editor = path.join(output, 'nir-editor.png');
  fs.writeFileSync(editor, (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.getElementById('shop-nir-currency-toggle').click()`);
  await wait(180);
  const currencyPickerLayout = await win.webContents.executeJavaScript(`(() => {
    const search = document.getElementById('shop-nir-currency-search');
    const list = document.querySelector('#shop-nir-currency-panel [role="listbox"]');
    search.focus(); search.value = 'eur'; search.dispatchEvent(new Event('input', { bubbles:true }));
    const visibleOptions = [...list.querySelectorAll('[data-nir-currency]')].filter(option => getComputedStyle(option).display !== 'none').map(option => option.dataset.nirCurrency);
    const result = { columns:getComputedStyle(list).gridTemplateColumns, searchFont:getComputedStyle(search).fontSize, searchColor:getComputedStyle(search).color, searchKeepsFocus:document.activeElement === search, visibleOptions };
    search.value = ''; search.dispatchEvent(new Event('input', { bubbles:true }));
    return result;
  })()`);
  const currencyPicker = path.join(output, 'nir-currency-picker.png');
  fs.writeFileSync(currencyPicker, (await win.webContents.capturePage()).toPNG());
  const currencyPickerClosing = await win.webContents.executeJavaScript(`(() => {
    const toggle = document.getElementById('shop-nir-currency-toggle');
    const panel = document.getElementById('shop-nir-currency-panel');
    document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
    const closesWithEscape = panel.hidden && document.activeElement === toggle;
    toggle.click();
    document.getElementById('shop-nir-title').dispatchEvent(new PointerEvent('pointerdown', { bubbles:true }));
    return { closesWithEscape, closesOutside:panel.hidden };
  })()`);
  await win.webContents.executeJavaScript(`document.querySelector('.shop-nir-editor-section.lines').scrollIntoView({ block:'start' })`);
  await wait(300);
  const editorLines = path.join(output, 'nir-editor-lines.png');
  fs.writeFileSync(editorLines, (await win.webContents.capturePage()).toPNG());
  const nameMatch = await win.webContents.executeJavaScript(`(async () => { const supplier=document.querySelector('[data-nir-field="supplier_id"]'); supplier.value='supplier-1'; supplier.dispatchEvent(new Event('input',{bubbles:true})); const code=document.querySelector('[data-nir-line="0"][data-nir-line-field="supplier_product_code"]'); const name=document.querySelector('[data-nir-line="0"][data-nir-line-field="supplier_product_name"]'); code.value=''; code.dispatchEvent(new Event('input',{bubbles:true})); name.value='Cască FRV Street Panther full face, negru mat'; name.dispatchEvent(new Event('input',{bubbles:true})); await new Promise(resolve => setTimeout(resolve, 520)); return { product:document.querySelector('.shop-nir-product-link strong')?.textContent, status:document.querySelector('.shop-nir-match')?.textContent, explanation:document.querySelector('.shop-nir-product-link .ok')?.textContent }; })()`);
  const liveCalculation = await win.webContents.executeJavaScript(`(async () => { try {
    document.getElementById('shop-nir-currency-toggle').click();
    document.querySelector('[data-nir-currency="EUR"]').click();
    await new Promise(resolve => setTimeout(resolve, 40));
    const foreignCurrency = { label:document.querySelector('.shop-nir-line-panel.pricing label span')?.textContent, rate:document.querySelector('[data-nir-field="exchange_rate"]')?.value, rateEditable:!document.querySelector('[data-nir-field="exchange_rate"]')?.disabled, rateDateEditable:!document.querySelector('[data-nir-field="exchange_rate_date"]')?.disabled };
    document.getElementById('shop-nir-currency-toggle').click();
    document.querySelector('[data-nir-currency="RON"]').click();
    const setLine = (field, value) => { const input = document.querySelector('[data-nir-line="0"][data-nir-line-field="' + field + '"]'); input.value = value; input.dispatchEvent(new Event('input', { bubbles:true })); };
    setLine('invoiced_quantity', '7.5');
    const quantitySync = {
      received:document.querySelector('[data-nir-line="0"][data-nir-line-field="received_quantity"]')?.value,
      accepted:document.querySelector('[data-nir-line="0"][data-nir-line-field="accepted_quantity"]')?.value,
    };
    setLine('accepted_quantity', '1');
    const priceInput = document.querySelector('[data-nir-line="0"][data-nir-line-field="unit_price"]');
    priceInput.focus(); priceInput.value = '89.99'; priceInput.dispatchEvent(new Event('input', { bubbles:true }));
    const priceInputKeepsFocus = document.activeElement === priceInput && priceInput.value === '89.99';
    setLine('discount_percent', '0'); setLine('vat_rate', '19'); setLine('allocated_cost_ron', '0');
    return { total:document.querySelector('.shop-nir-line-total strong')?.textContent, unitCost:document.querySelector('.shop-nir-line-total b')?.textContent, currencyLabel:document.querySelector('.shop-nir-line-panel.pricing label span')?.textContent, foreignCurrency, priceInputKeepsFocus, quantitySync };
  } catch (error) { return { error:String(error && error.stack || error) }; } })()`);
  const directProductAssociation = await win.webContents.executeJavaScript(`(async () => {
    document.getElementById('shop-nir-add-line').click();
    document.querySelector('[data-nir-product="1"]').click();
    await new Promise(resolve => setTimeout(resolve, 80));
    document.querySelector('[data-nir-product-select="product-1"]').click();
    const code = document.querySelector('[data-nir-line="1"][data-nir-line-field="supplier_product_code"]');
    const name = document.querySelector('[data-nir-line="1"][data-nir-line-field="supplier_product_name"]');
    const initial = { code:code.value, name:name.value, codeEditable:!code.disabled, nameEditable:!name.disabled, product:document.querySelectorAll('.shop-nir-product-link strong')[1]?.textContent };
    code.value='CASCA-FRV-NOU'; code.dispatchEvent(new Event('input',{bubbles:true}));
    return { ...initial, editedCode:code.value, productAfterAliasEdit:document.querySelectorAll('.shop-nir-product-link strong')[1]?.textContent };
  })()`);
  await win.webContents.executeJavaScript(`document.querySelector('.shop-nir-editor-section.review').scrollIntoView({ block:'start' })`);
  await wait(300);
  const editorReview = path.join(output, 'nir-editor-review.png');
  fs.writeFileSync(editorReview, (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.getElementById('shop-nir-delete').click()`);
  await wait(80);
  const deleteDialogOpening = await win.webContents.executeJavaScript(`(() => {
    const trigger = document.getElementById('shop-nir-delete');
    const dialog = document.getElementById('shop-nir-delete-dialog');
    return { triggerVisible:!trigger.hidden, visible:dialog.classList.contains('visible'), message:document.getElementById('shop-nir-delete-message')?.textContent, title:document.getElementById('shop-nir-delete-title')?.textContent };
  })()`);
  await wait(80);
  const deleteDialog = path.join(output, 'nir-delete-dialog.png');
  fs.writeFileSync(deleteDialog, (await win.webContents.capturePage()).toPNG());
  const deleteDialogClosing = await win.webContents.executeJavaScript(`(async () => {
    const dialog = document.getElementById('shop-nir-delete-dialog');
    document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
    const closesWithEscape = !dialog.classList.contains('visible');
    await new Promise(resolve => setTimeout(resolve, 210));
    document.getElementById('shop-nir-delete').click();
    dialog.dispatchEvent(new MouseEvent('mousedown', { bubbles:true }));
    return { closesWithEscape, closesOutside:!dialog.classList.contains('visible') };
  })()`);
  const metrics = await win.webContents.executeJavaScript(`(() => ({
    registryCards:document.querySelectorAll('.shop-nir-registry-card').length,
    guideSteps:document.querySelectorAll('.shop-nir-onboarding li').length,
    editorSteps:document.querySelectorAll('.shop-nir-editor-flow li').length,
    linePanels:document.querySelectorAll('.shop-nir-line-panel').length,
    horizontalOverflow:document.documentElement.scrollWidth > document.documentElement.clientWidth,
    modalOverflow:document.querySelector('.shop-nir-modal').scrollWidth > document.querySelector('.shop-nir-modal').clientWidth,
    backgroundWrites:window.__nirQaCalls.create + window.__nirQaCalls.update,
  }))()`);
  await win.webContents.executeJavaScript(`(() => { const dialog=document.getElementById('shop-nir-delete-dialog'); dialog.classList.remove('visible'); dialog.hidden=true; const modal=document.getElementById('shop-nir-modal'); modal.classList.remove('visible'); modal.hidden=true; document.querySelector('[data-nir-open="nir-1"]').click(); })()`);
  await wait(300);
  const savedDelete = await win.webContents.executeJavaScript(`(async () => {
    document.getElementById('shop-nir-delete').click();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    document.getElementById('shop-nir-delete-confirm').click();
    await new Promise(resolve => setTimeout(resolve, 260));
    return { calls:window.__nirQaCalls.delete, deletedId:window.__nirQaCalls.deletedId, editorClosed:!document.getElementById('shop-nir-modal').classList.contains('visible'), dialogClosed:!document.getElementById('shop-nir-delete-dialog').classList.contains('visible') };
  })()`);
  await win.webContents.executeJavaScript(`window.switchTab('shop-inventory')`);
  await wait(450);
  const inventorySearch = await win.webContents.executeJavaScript(`(() => {
    const input=document.getElementById('shop-inventory-search');
    input.focus(); input.value='CASCA-FRV-02'; input.dispatchEvent(new Event('input',{bubbles:true}));
    return { exists:Boolean(input), keepsFocus:document.activeElement === input, rows:document.querySelectorAll('#shop-inventory-results tbody tr').length, resultName:document.querySelector('#shop-inventory-results tbody tr td:nth-child(2) strong')?.textContent, count:document.getElementById('shop-inventory-search-count')?.textContent.trim() };
  })()`);
  const semanticInventorySearch = await win.webContents.executeJavaScript(`(() => { const input=document.getElementById('shop-inventory-search'); input.value='georg distributon'; input.dispatchEvent(new Event('input',{bubbles:true})); return { rows:document.querySelectorAll('#shop-inventory-results tbody tr').length, resultName:document.querySelector('#shop-inventory-results tbody tr td:nth-child(2) strong')?.textContent, keepsFocus:document.activeElement === input }; })()`);
  const inventory = path.join(output, 'inventory-search.png');
  fs.writeFileSync(inventory, (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('[data-stock-open="stock-1"]').click()`);
  await wait(220);
  const stockSheetPageOne = await win.webContents.executeJavaScript(`(() => ({ visible:document.getElementById('shop-stock-modal').classList.contains('visible'), entries:document.querySelectorAll('.shop-stock-document-row').length, movements:document.querySelectorAll('.shop-stock-movement-table tbody tr').length, entryPager:Boolean(document.querySelector('[data-stock-page-key="stockFlow"]')), movementPager:Boolean(document.querySelector('[data-stock-page-key="stockMovements"]')), fields:[...document.querySelector('.shop-stock-document-row').querySelectorAll('small')].map(item => item.textContent) }))()`);
  await win.webContents.executeJavaScript(`document.querySelector('[data-stock-page-key="stockFlow"][data-stock-page="2"]').click()`);
  await wait(80);
  const stockSheetPageTwo = await win.webContents.executeJavaScript(`(() => ({ entries:document.querySelectorAll('.shop-stock-document-row').length, activePage:document.querySelector('.shop-stock-pager button.active')?.textContent }))()`);
  const stockSheet = path.join(output, 'stock-sheet.png');
  fs.writeFileSync(stockSheet, (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('.shop-stock-document-row').click()`);
  await wait(260);
  const confirmedDocuments = await win.webContents.executeJavaScript(`(() => ({ openedNirId:window.__nirQaCalls.openedNirId, savedDocuments:document.querySelectorAll('.shop-nir-attachment.saved').length, individualButtons:document.querySelectorAll('[data-nir-attachment-download]').length, downloadAllVisible:Boolean(document.getElementById('shop-nir-download-all')) }))()`);
  await win.webContents.executeJavaScript(`document.querySelector('.shop-nir-editor-section.documents')?.scrollIntoView({ block:'center' })`);
  await wait(180);
  const confirmedNirDocuments = path.join(output, 'confirmed-nir-documents.png');
  fs.writeFileSync(confirmedNirDocuments, (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.getElementById('shop-nir-accounting-details')?.scrollIntoView({ block:'center' })`);
  await wait(180);
  const movementJournal = await win.webContents.executeJavaScript(`(() => ({
    board:Boolean(document.querySelector('.shop-nir-movement-board')),
    cards:document.querySelectorAll('.shop-nir-movement-card').length,
    incoming:document.querySelectorAll('.shop-nir-movement-card.incoming').length,
    outgoing:document.querySelectorAll('.shop-nir-movement-card.outgoing').length,
    summary:document.querySelector('.shop-nir-movement-summary')?.textContent,
    documents:[...document.querySelectorAll('.shop-nir-movement-main > p em')].map(item => item.textContent),
  }))()`);
  if (!movementJournal.board || movementJournal.cards !== 2 || movementJournal.incoming !== 1 || movementJournal.outgoing !== 1 || !movementJournal.documents.includes('REV-2026-000100')) throw new Error('Jurnalul vizual de mișcări nu explică intrarea și reversarea.');
  const nirMovements = path.join(output, 'nir-movements.png');
  fs.writeFileSync(nirMovements, (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('[data-nir-attachment-download]').click(); document.getElementById('shop-nir-download-all').click()`);
  await wait(120);
  const documentDownloads = await win.webContents.executeJavaScript(`({ one:window.__nirQaCalls.downloadOne, all:window.__nirQaCalls.downloadAll })`);
  const reversalFlow = await win.webContents.executeJavaScript(`(async () => {
    const trigger=document.getElementById('shop-nir-reverse-trigger');
    const triggerVisible=!trigger.hidden;
    trigger.click();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const dialog=document.getElementById('shop-nir-reverse-dialog');
    const reason=document.getElementById('shop-nir-reverse-reason');
    document.getElementById('shop-nir-reverse-confirm').click();
    const emptyBlocked=window.__nirQaCalls.reverse===0 && reason.classList.contains('invalid') && !document.getElementById('shop-nir-reverse-error').hidden;
    reason.value='Recepție introdusă din greșeală'; reason.dispatchEvent(new Event('input',{bubbles:true}));
    document.getElementById('shop-nir-reverse-confirm').click();
    await new Promise(resolve=>setTimeout(resolve,180));
    return { triggerVisible, dialogOpened:dialog.classList.contains('visible') || dialog.hidden === false, emptyBlocked, calls:window.__nirQaCalls.reverse, reason:window.__nirQaCalls.reverseReason, status:document.getElementById('shop-nir-status')?.textContent, dialogClosed:!dialog.classList.contains('visible') };
  })()`);
  if (!reversalFlow.triggerVisible || !reversalFlow.emptyBlocked || reversalFlow.calls !== 1 || reversalFlow.status !== 'REVERSAT' || !reversalFlow.dialogClosed) throw new Error('Fluxul personalizat de reversare NIR nu funcționează complet.');
  await win.webContents.executeJavaScript(`(() => { document.querySelector('[data-commerce-close="shop-nir-modal"]').click(); window.switchTab('shop-nirs'); })()`);
  await wait(220);
  await win.webContents.executeJavaScript(`document.querySelector('[data-nir-open="nir-2"]').click()`);
  await wait(260);
  const confirmedCorrection = await win.webContents.executeJavaScript(`(async () => { const button=document.getElementById('shop-nir-correct'); const visible=Boolean(button && !button.hidden); const beforeLabel=button?.textContent.trim(); window.__nirQaConfirmCalls=0; window.confirm=()=>{ window.__nirQaConfirmCalls += 1; return true; }; const started=performance.now(); button?.click(); await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))); return { visible, beforeLabel, afterLabel:button?.textContent.trim(), sameButton:button === document.getElementById('shop-nir-correct'), calls:window.__nirQaCalls.reopen, status:document.getElementById('shop-nir-status')?.textContent, sameNumber:document.getElementById('shop-nir-title')?.textContent === 'NIR-2026-000099', supplierEditable:!document.querySelector('[data-nir-field="supplier_id"]')?.disabled, exportsHidden:document.getElementById('shop-nir-export-pdf')?.hidden && document.getElementById('shop-nir-export-xlsx')?.hidden, regularActionsHidden:document.getElementById('shop-nir-save')?.hidden && document.getElementById('shop-nir-confirm')?.hidden, focusedField:document.activeElement?.dataset?.nirField || '', activationMs:Math.round((performance.now()-started)*10)/10, nativeConfirmCalls:window.__nirQaConfirmCalls }; })()`);
  if (confirmedCorrection.focusedField !== 'supplier_invoice_series' || confirmedCorrection.nativeConfirmCalls !== 0) throw new Error('Editarea NIR nu activeaza imediat primul camp.');
  const correctionTypingBefore = await win.webContents.executeJavaScript(`(() => {
    const input=document.querySelector('[data-nir-field="supplier_invoice_series"]');
    input.focus();
    input.setSelectionRange(0,input.value.length);
    input.addEventListener('keydown', event => event.preventDefault(), { once:true });
    const style=getComputedStyle(input);
    return { value:input.value, active:document.activeElement===input, disabled:input.disabled, readOnly:input.readOnly, pointerEvents:style.pointerEvents, userSelect:style.userSelect, appRegion:style.webkitAppRegion };
  })()`);
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Q' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Q' });
  await wait(80);
  const correctionTypingAfter = await win.webContents.executeJavaScript(`(() => { const input=document.querySelector('[data-nir-field="supplier_invoice_series"]'); return { value:input.value, active:document.activeElement===input }; })()`);
  if (correctionTypingAfter.value.toLowerCase() !== 'q' || !correctionTypingAfter.active) throw new Error('Campurile NIR nu recupereaza tastarea blocata in modul de corectare.');
  const correctionTyping = { before:correctionTypingBefore, after:correctionTypingAfter };
  await win.webContents.executeJavaScript(`document.querySelector('[data-commerce-close="shop-nir-modal"]').click(); window.switchTab('shop-products')`);
  await wait(220);
  const productKeyboardBefore = await win.webContents.executeJavaScript(`(() => { const input=document.getElementById('shop-products-search'); input.focus(); input.value=''; input.addEventListener('keydown', event => event.preventDefault(), { once:true }); return { active:document.activeElement===input, recoveryBound:input.dataset.keyboardRecoveryBound }; })()`);
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'C' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'C' });
  await wait(80);
  const productKeyboardAfter = await win.webContents.executeJavaScript(`(() => { const input=document.getElementById('shop-products-search'); return { value:input.value, active:document.activeElement===input }; })()`);
  if (productKeyboardAfter.value.toLowerCase() !== 'c' || !productKeyboardAfter.active) throw new Error('Bara de căutare Produse nu recuperează tastarea blocată.');
  const productKeyboardRecovery = { before:productKeyboardBefore, after:productKeyboardAfter };
  const productSearch = await win.webContents.executeJavaScript(`(async () => { const input=document.getElementById('shop-products-search'); const original=input; input.focus(); input.value='casca'; input.dispatchEvent(new Event('input',{bubbles:true})); await new Promise(resolve => setTimeout(resolve, 420)); return { exists:Boolean(input), sameNode:original === document.getElementById('shop-products-search'), keepsFocus:document.activeElement === original, value:original.value, rows:document.querySelectorAll('#shop-products-results tbody tr').length, resultName:document.querySelector('#shop-products-results tbody tr strong')?.textContent }; })()`);
  const productsSearch = path.join(output, 'products-search.png');
  fs.writeFileSync(productsSearch, (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('#shop-products-results [data-product-open]').click()`);
  await wait(220);
  const productSuppliers = await win.webContents.executeJavaScript(`(() => { const cards=[...document.querySelectorAll('.shop-detail-supplier-ref')]; return { count:cards.length, names:cards.map(card => card.querySelector('strong')?.textContent), exposesCode:cards.some(card => /SE-CMM087|cod furnizor/i.test(card.textContent || '')) }; })()`);
  await win.webContents.executeJavaScript(`document.querySelector('.shop-detail-supplier-refs')?.scrollIntoView({ block:'center' })`);
  await wait(120);
  const productSupplierList = path.join(output, 'product-suppliers.png');
  fs.writeFileSync(productSupplierList, (await win.webContents.capturePage()).toPNG());
  process.stdout.write(JSON.stringify({ ...metrics, wideRegistry, liveCalculation, nameMatch, directProductAssociation, searchKeepsFocus, currencyPickerLayout, currencyPickerClosing, deleteDialogOpening, deleteDialogClosing, savedDelete, inventorySearch, semanticInventorySearch, stockSheetPageOne, stockSheetPageTwo, confirmedDocuments, movementJournal, documentDownloads, reversalFlow, confirmedCorrection, correctionTyping, productKeyboardRecovery, productSearch, productSuppliers, errors, screenshots:{ registry, registryWide, editor, currencyPicker, editorLines, editorReview, deleteDialog, inventory, stockSheet, confirmedNirDocuments, nirMovements, productsSearch, productSupplierList } }, null, 2));
  await win.destroy();
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
