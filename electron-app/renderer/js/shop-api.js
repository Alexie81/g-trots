(function () {
  const baseUrl = String(window.SHOP_API_URL || 'https://g-trots.ro/shop-api').replace(/\/$/, '');

  async function call(action, options = {}, id = '', attempt = 0) {
    let token = window.AUTH?.getToken?.() || '';
    if (!token && window.AUTH?.whenReady) {
      await window.AUTH.whenReady();
      token = window.AUTH?.getToken?.() || '';
    }
    if (!token) throw new Error('Autentifica-te pentru a folosi catalogul SHOP.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const url = `${baseUrl}/api-v2.php?action=${encodeURIComponent(action)}${id ? `&id=${encodeURIComponent(id)}` : ''}`;
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
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
        return call(action, options, id, attempt + 1);
      }
      if (!response.ok) throw new Error(result?.error || `Eroare SHOP (${response.status})`);
      return result;
    } catch (error) {
      const retryable = !options.method || options.method === 'GET';
      if (retryable && attempt === 0 && (error?.name === 'AbortError' || error?.name === 'TypeError')) {
        await new Promise(resolve => setTimeout(resolve, 450));
        return call(action, options, id, attempt + 1);
      }
      if (error?.name === 'AbortError') throw new Error('Serverul SHOP nu a raspuns la timp.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  const json = (method, body) => ({ method, body: JSON.stringify(body) });
  window.SHOP_API = {
    getDashboardStats: () => call('getDashboardStats'),
    loadProductManager: () => call('productManagerBootstrap'),
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
    listProducts: () => call('listProducts'),
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
    syncStripeCatalog: () => call('syncStripeCatalog', json('POST', {})),
    listShippingMethods: () => call('listShippingMethods'),
    createShippingMethod: (payload) => call('createShippingMethod', json('POST', payload)),
    updateShippingMethod: (id, payload) => call('updateShippingMethod', json('PUT', payload), id),
    deleteShippingMethod: (id) => call('deleteShippingMethod', { method: 'DELETE' }, id),
  };
})();
