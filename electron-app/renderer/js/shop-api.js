(function () {
  const baseUrl = String(window.SHOP_API_URL || 'https://g-trots.ro/shop-api').replace(/\/$/, '');

  async function call(action, options = {}, id = '', attempt = 0, query = {}) {
    let token = window.AUTH?.getToken?.() || '';
    if (!token && window.AUTH?.whenReady) {
      await window.AUTH.whenReady();
      token = window.AUTH?.getToken?.() || '';
    }
    if (!token) throw new Error('Autentifica-te pentru a folosi catalogul SHOP.');
    const controller = new AbortController();
    // Stergerea arhiveaza mai intai produsul si pretul in Stripe, deci poate
    // dura mai mult decat o cerere obisnuita pe o conexiune lenta.
    const timeoutMs = ['downloadNirBundle', 'downloadNirRegistryBundle'].includes(action) ? 240000 : action === 'syncStripeCatalog' ? 90000 : ['syncBoomagTaxonomy', 'syncBoomagStock'].includes(action) ? 240000 : action === 'deleteProduct' ? 65000 : 20000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const isGet = !options.method || options.method === 'GET';
    const cacheBuster = isGet ? `&_=${Date.now()}` : '';
    const queryString = Object.entries(query).filter(([, value]) => value !== undefined && String(value) !== '').map(([key, value]) => `&${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('');
    const url = `${baseUrl}/api-v2.php?action=${encodeURIComponent(action)}${id ? `&id=${encodeURIComponent(id)}` : ''}${queryString}${cacheBuster}`;
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-API-Key': window.SHOP_API_KEY || window.API_KEY || '',
          'X-Auth-Token': token,
          ...(options.headers || {}),
        },
      });
      const result = await response.json().catch(() => null);
      const retryable = !options.method || options.method === 'GET';
      if (retryable && attempt === 0 && [502, 503, 504].includes(response.status)) {
        await new Promise(resolve => setTimeout(resolve, 450));
        return call(action, options, id, attempt + 1, query);
      }
      if (!response.ok) {
        const error = new Error(result?.error || `Eroare SHOP (${response.status})`);
        error.status = response.status;
        error.payload = result;
        throw error;
      }
      if (result === null || result === undefined) {
        throw new Error('Serverul SHOP a trimis un raspuns incomplet. Reincearca actualizarea.');
      }
      return result;
    } catch (error) {
      const retryable = !options.method || options.method === 'GET';
      if (retryable && attempt === 0 && (error?.name === 'AbortError' || error?.name === 'TypeError')) {
        await new Promise(resolve => setTimeout(resolve, 450));
        return call(action, options, id, attempt + 1, query);
      }
      if (error?.name === 'AbortError') throw new Error('Serverul SHOP nu a raspuns la timp.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  const json = (method, body) => ({ method, body: JSON.stringify(body) });

  async function syncStripeCatalog(onProgress) {
    const summary = { synced: 0, archived: 0, skipped: 0, errors: [] };
    const plan = await call('syncStripeCatalog', json('POST', { prepare: true }));
    const plannedTotal = Number(plan.total || 0);
    onProgress?.({ ...summary, processed: 0, total: plannedTotal, percent: plannedTotal ? 0 : 100 });
    if (plannedTotal === 0) return summary;
    const productIds = Array.isArray(plan.product_ids) ? plan.product_ids.map(String).filter(Boolean) : [];
    if (productIds.length) {
      let nextIndex = 0;
      let processed = 0;
      const worker = async () => {
        while (nextIndex < productIds.length) {
          const productId = productIds[nextIndex++];
          const batch = await call('syncStripeCatalog', json('POST', { product_ids: [productId] }));
          summary.synced += Number(batch.synced || 0);
          summary.archived += Number(batch.archived || 0);
          summary.skipped += Number(batch.skipped || 0);
          summary.errors.push(...(Array.isArray(batch.errors) ? batch.errors : []));
          processed += Number(batch.batch_processed || 1);
          onProgress?.({ ...summary, processed, total: plannedTotal, percent: Math.min(100, Math.round((processed / plannedTotal) * 100)) });
        }
      };
      // Opt cereri paralele ofera progres rapid fara a forta limita Stripe Test.
      await Promise.all(Array.from({ length: Math.min(8, productIds.length) }, () => worker()));
      return summary;
    }
    let cursor = '';
    let processed = 0;
    let completed = false;
    while (!completed) {
      const batch = await call('syncStripeCatalog', json('POST', { cursor, batch_size: 1 }));
      summary.synced += Number(batch.synced || 0);
      summary.archived += Number(batch.archived || 0);
      summary.skipped += Number(batch.skipped || 0);
      summary.errors.push(...(Array.isArray(batch.errors) ? batch.errors : []));
      processed += Number(batch.batch_processed || 0);
      cursor = String(batch.next_cursor || cursor);
      completed = Boolean(batch.completed) || Number(batch.batch_processed || 0) === 0;
      const total = Number(batch.total || plannedTotal || processed);
      onProgress?.({ ...summary, processed, total, percent: total ? Math.min(100, Math.round((processed / total) * 100)) : 100 });
    }
    return summary;
  }
  window.SHOP_API = {
    getDashboardStats: () => call('getDashboardStats'),
    loadProductManager: (options = {}) => call('productManagerBootstrap', json('POST', options)),
    listCategories: () => call('listCategories'),
    createCategory: (payload) => call('createCategory', json('POST', payload)),
    updateCategory: (id, payload) => call('updateCategory', json('PUT', payload), id),
    deleteCategory: (id) => call('deleteCategory', { method: 'DELETE' }, id),
    listBrands: () => call('listBrands'),
    createBrand: (payload) => call('createBrand', json('POST', payload)),
    updateBrand: (id, payload) => call('updateBrand', json('PUT', payload), id),
    deleteBrand: (id) => call('deleteBrand', { method: 'DELETE' }, id),
    listManufacturers: () => call('listManufacturers'),
    createManufacturer: (payload) => call('createManufacturer', json('POST', payload)),
    updateManufacturer: (id, payload) => call('updateManufacturer', json('PUT', payload), id),
    deleteManufacturer: (id) => call('deleteManufacturer', { method: 'DELETE' }, id),
    listProductSources: () => call('listProductSources'),
    createProductSource: (payload) => call('createProductSource', json('POST', payload)),
    updateProductSource: (id, payload) => call('updateProductSource', json('PUT', payload), id),
    deleteProductSource: (id) => call('deleteProductSource', { method: 'DELETE' }, id),
    listSuppliers: () => call('listSuppliers'),
    createSupplier: (payload) => call('createSupplier', json('POST', payload)),
    updateSupplier: (id, payload) => call('updateSupplier', json('PUT', payload), id),
    deleteSupplier: (id) => call('deleteSupplier', { method: 'DELETE' }, id),
    searchSuppliers: (q = '') => call('searchSuppliers', {}, '', 0, { q, limit: 50 }),
    getSupplier: (id) => call('getSupplier', {}, id),
    checkSupplierCui: (cui) => call('checkSupplierCui', {}, '', 0, { cui }),
    listWarehouses: () => call('listWarehouses'),
    getNirPermissions: () => call('nirPermissions'),
    getBnrExchangeRate: (currency, date = '') => call('getBnrExchangeRate', {}, '', 0, { currency, date }),
    listNirs: (filters = {}) => call('listNirs', {}, '', 0, filters),
    getNir: (id) => call('getNir', {}, id),
    createNir: (payload) => call('createNir', json('POST', payload)),
    updateNir: (id, payload) => call('updateNir', json('PUT', payload), id),
    deleteNir: (id) => call('deleteNirDrafts', { method: 'DELETE' }, id),
    autosaveNir: (id, payload) => call('autosaveNir', json('POST', payload), id),
    validateNir: (id) => call('validateNir', json('POST', {}), id),
    confirmNir: (id, rowVersion, idempotencyKey) => call('confirmNir', { ...json('POST', { row_version: rowVersion, idempotency_key: idempotencyKey }), headers: { 'Idempotency-Key': idempotencyKey } }, id),
    reopenNir: (id, rowVersion) => call('reopenNir', json('POST', { row_version: rowVersion }), id),
    reverseNir: (id, rowVersion, reason, lines, details = {}) => call('reverseNir', json('POST', {
      row_version: rowVersion,
      reason,
      ...(Array.isArray(lines) ? { lines } : {}),
      ...(details && typeof details === 'object' ? {
        supplier_invoice_series: details.supplier_invoice_series ?? null,
        supplier_invoice_number: details.supplier_invoice_number,
        supplier_invoice_date: details.supplier_invoice_date,
      } : {}),
    }), id),
    uploadNirAttachment: (id, payload) => call('uploadNirAttachment', json('POST', payload), id),
    extractNirAttachment: (id, attachmentId) => call('extractNirAttachment', json('POST', { attachment_id: attachmentId }), id),
    downloadNirAttachment: (id, attachmentId) => call('downloadNirAttachment', {}, id, 0, { attachment_id: attachmentId }),
    downloadAllNirAttachments: id => call('downloadAllNirAttachments', {}, id),
    downloadNirBundle: id => call('downloadNirBundle', {}, id),
    downloadNirRegistryBundle: (from, to, includeDocuments) => call('downloadNirRegistryBundle', {}, '', 0, { from, to, include_documents: includeDocuments ? 1 : 0 }),
    getNirMovements: (id) => call('getNirMovements', {}, id),
    getNirFifoLayers: (id) => call('getNirFifoLayers', {}, id),
    exportNir: (id, format) => call('exportNir', {}, id, 0, { format }),
    resolveSupplierProductReference: (supplierId, code, ean = '', name = '') => call('resolveSupplierProductReference', {}, '', 0, { supplier_id: supplierId, code, ean, name }),
    createSupplierProductReference: (payload) => call('createSupplierProductReference', json('POST', payload)),
    updateSupplierProductReference: (id, payload) => call('updateSupplierProductReference', json('PATCH', payload), id),
    listProductSupplierReferences: (productId) => call('listProductSupplierReferences', {}, productId),
    listSupplierProducts: (supplierId) => call('listSupplierProducts', {}, supplierId),
    getProductPurchaseHistory: (productId) => call('getProductPurchaseHistory', {}, productId),
    getProductFifoLayers: (productId, warehouseId = '') => call('getProductFifoLayers', {}, productId, 0, { warehouse_id: warehouseId }),
    previewProductFifo: (productId, quantity, warehouseId = '') => call('previewProductFifo', json('POST', { quantity, warehouse_id: warehouseId }), productId),
    getFifoReconciliation: () => call('getFifoReconciliation'),
    createFifoOpeningBalance: (payload) => call('createFifoOpeningBalance', json('POST', payload)),
    syncBoomagTaxonomy: () => call('syncBoomagTaxonomy', json('POST', {})),
    syncBoomagStock: () => call('syncBoomagStock', json('POST', {})),
    listProducts: () => call('listProducts'),
    listProductOptions: (options = {}) => call('listProductOptions', json('POST', options)),
    listProductOptionIds: () => call('listProductOptionIds', json('POST', {})),
    getProduct: (id) => call('getProduct', {}, id),
    getProductStats: (id) => call('getProductStats', {}, id),
    createProduct: (payload) => call('createProduct', json('POST', payload)),
    updateProduct: (id, payload) => call('updateProduct', json('PUT', payload), id),
    uploadRichDescriptionImage: (base64) => call('uploadRichDescriptionImage', json('POST', { base64 })),
    deleteProduct: (id) => call('deleteProduct', { method: 'DELETE' }, id),
    listProductReviews: (id = '') => call('listProductReviews', {}, id),
    replyProductReview: (id, adminReply) => call('replyProductReview', json('PATCH', { admin_reply: adminReply }), id),
    deleteProductReview: (id) => call('deleteProductReview', { method: 'DELETE' }, id),
    listInventory: () => call('listInventory'),
    listInventoryMovements: (id = '') => call('listInventoryMovements', {}, id),
    adjustStock: (id, payload) => call('adjustStock', json('POST', payload), id),
    listOrders: () => call('listOrders'),
    getOrder: (id) => call('getOrder', {}, id),
    updateOrder: (id, payload) => call('updateOrder', json('PUT', payload), id),
    getPaymentSettings: () => call('getPaymentSettings'),
    updatePaymentSettings: (payload) => call('updatePaymentSettings', json('PUT', payload)),
    getInvoiceThemeSettings: () => call('getInvoiceThemeSettings'),
    updateInvoiceThemeSettings: (theme) => call('updateInvoiceThemeSettings', json('PUT', { theme })),
    listCompanySettings: () => call('listCompanySettings'),
    getCompanySettings: () => call('getCompanySettings'),
    createCompanySettings: (payload) => call('createCompanySettings', json('POST', payload)),
    updateCompanySettings: (id, payload) => call('updateCompanySettings', json('PUT', payload), id),
    deleteCompanySettings: (id) => call('deleteCompanySettings', { method: 'DELETE' }, id),
    syncStripeCatalog,
    listShippingMethods: () => call('listShippingMethods'),
    createShippingMethod: (payload) => call('createShippingMethod', json('POST', payload)),
    updateShippingMethod: (id, payload) => call('updateShippingMethod', json('PUT', payload), id),
    deleteShippingMethod: (id) => call('deleteShippingMethod', { method: 'DELETE' }, id),
    listCustomers: () => call('listCustomers'),
    getCustomer: (id) => call('getCustomer', {}, id),
    updateCustomerStatus: (id, isActive) => call('updateCustomerStatus', json('PATCH', { is_active: isActive }), id),
    listPromotions: () => call('listPromotions'),
    getPromotionStats: (id) => call('getPromotionStats', {}, id),
    createPromotion: (payload) => call('createPromotion', json('POST', payload)),
    updatePromotion: (id, payload) => call('updatePromotion', json('PATCH', payload), id),
    deletePromotion: (id) => call('deletePromotion', { method: 'DELETE' }, id),
  };
})();
