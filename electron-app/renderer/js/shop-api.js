(function () {
  const baseUrl = String(window.SHOP_API_URL || 'https://g-trots.ro/shop-api').replace(/\/$/, '');

  async function call(action, options = {}, id = '') {
    const token = window.AUTH?.getToken?.() || '';
    if (!token) throw new Error('Autentifica-te pentru a folosi catalogul SHOP.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const url = `${baseUrl}/api.php?action=${encodeURIComponent(action)}${id ? `&id=${encodeURIComponent(id)}` : ''}`;
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
      if (!response.ok) throw new Error(result?.error || `Eroare SHOP (${response.status})`);
      return result;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Serverul SHOP nu a raspuns la timp.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  const json = (method, body) => ({ method, body: JSON.stringify(body) });
  window.SHOP_API = {
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
  };
})();
