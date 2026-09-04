// ─── PHP API wrapper ─────────────────────────────────────────────────────────
const API_CONFIG_STORAGE_KEY = 'gtrots.systemApiConfig';

function normalizeApiUrl(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/\/api\.php$/i, '')
    .replace(/\/+$/, '');
  try {
    const url = new URL(normalized);
    if (url.hostname.toLowerCase() === 'g-trots.rp') {
      url.hostname = 'g-trots.ro';
      return url.toString().replace(/\/+$/, '');
    }
  } catch (_error) {}
  return normalized;
}

function readRuntimeApiConfig() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(API_CONFIG_STORAGE_KEY) || '{}') || {};
  } catch (_e) {
    saved = {};
  }
  const next = {
    apiUrl: normalizeApiUrl(saved.apiUrl || window.API_URL || ''),
    apiKey: String(saved.apiKey || window.API_KEY || '').trim(),
  };
  if (saved.apiUrl && String(saved.apiUrl).trim().replace(/\/+$/, '') !== next.apiUrl) {
    localStorage.setItem(API_CONFIG_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

function saveRuntimeApiConfig(config) {
  const previous = readRuntimeApiConfig();
  const next = {
    apiUrl: normalizeApiUrl(config?.apiUrl || window.API_URL || ''),
    apiKey: String(config?.apiKey || window.API_KEY || '').trim(),
  };
  localStorage.setItem(API_CONFIG_STORAGE_KEY, JSON.stringify(next));
  clearReferenceCaches();
  clearTableCaches();
  if (previous.apiUrl !== next.apiUrl || previous.apiKey !== next.apiKey) {
    window.dispatchEvent(new CustomEvent('api-config-change', {
      detail: { apiUrl: next.apiUrl },
    }));
  }
  return next;
}

async function apiCallWithConfig(config, action, method = 'GET', body, params = {}) {
  const apiUrl = normalizeApiUrl(config?.apiUrl || '');
  const apiKey = String(config?.apiKey || '').trim();
  if (!apiUrl || !/^https?:\/\//i.test(apiUrl)) {
    throw new Error('Adresa API trebuie sa inceapa cu http:// sau https://.');
  }

  const url = new URL(`${apiUrl}/api.php`);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });

  let res;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    res = await fetch(url.toString(), {
      method,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`API-ul ${apiUrl} nu a raspuns in 25 de secunde. Incearca din nou.`);
    }
    throw new Error(
      `Nu pot contacta API-ul ${apiUrl}. Verifica internetul si incearca din nou.`
    );
  } finally {
    clearTimeout(timeout);
  }

  const raw = await res.text();
  let json = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch (_error) {
    const responseError = new Error(
      `Serverul ${apiUrl} nu a returnat JSON valid (HTTP ${res.status}). Verifica daca adresa duce la folderul care contine api.php.`
    );
    responseError.status = res.status;
    throw responseError;
  }
  if (!res.ok) {
    const responseError = new Error(json.error || `HTTP ${res.status}`);
    responseError.status = res.status;
    throw responseError;
  }
  return json;
}

async function apiCall(action, method = 'GET', body, params = {}) {
  const config = readRuntimeApiConfig();
  if (String(method).toUpperCase() !== 'GET') {
    const result = await apiCallWithConfig(config, action, method, body, params);
    if (actionInvalidatesTables(action)) clearTableCaches();
    return result;
  }

  const sortedParams = Object.entries(params || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const requestKey = `${config.apiUrl}|${config.apiKey}|${action}|${sortedParams}`;
  const existing = inflightGetRequests.get(requestKey);
  if (existing) return existing;
  const request = apiCallWithConfig(config, action, method, body, params)
    .finally(() => {
      if (inflightGetRequests.get(requestKey) === request) inflightGetRequests.delete(requestKey);
    });
  inflightGetRequests.set(requestKey, request);
  return request;
}

const referenceCache = new Map();
const inflightGetRequests = new Map();
const legacyClientsTableCache = new Map();
const legacyServiceTableCache = new Map();
const clientsTablePageCache = new Map();
const serviceTablePageCache = new Map();
const clientsTablePageRequests = new Map();
const serviceTablePageRequests = new Map();
let referenceCacheGeneration = 0;
let tableCacheGeneration = 0;

function clearTableCaches() {
  // Cererile deja pornite continua pentru consumatorul lor, dar nu mai pot fi
  // reutilizate dupa o mutatie. `finally` sterge doar propria instanta.
  inflightGetRequests.clear();
  legacyClientsTableCache.clear();
  legacyServiceTableCache.clear();
  clientsTablePageCache.clear();
  serviceTablePageCache.clear();
  clientsTablePageRequests.clear();
  serviceTablePageRequests.clear();
  tableCacheGeneration += 1;
}

function clearReferenceCaches() {
  referenceCacheGeneration += 1;
  referenceCache.clear();
  inflightGetRequests.clear();
}

function actionInvalidatesTables(action) {
  return action === 'login'
    || action === 'adminLogin'
    || action === 'logout'
    || action === 'markQrUsed'
    || action === 'saveSystemDatabaseInfo'
    || /(Client|ServiceSheet|Profile|Collaborator|Expense|User)/.test(action);
}

function tablePrefetchPages(pageSize) {
  const safePageSize = Math.min(100, Math.max(10, Math.trunc(Number(pageSize) || 10)));
  return Math.max(0, Math.min(4, Math.floor(100 / safePageSize) - 1));
}

function tablePageKey(authToken, kind, query = {}) {
  return JSON.stringify([authToken || '', kind, query.search || '', query.profileId || '', query.clientId || '', query.lifecycle || '', query.paymentStatus || '', query.filterColumn || '', query.dateFrom || '', query.dateTo || '', query.sortBy || '', query.sortDir || '', query.page || 1, query.pageSize || 10]);
}

function readTablePage(cache, key) {
  if (!cache.has(key)) return null;
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function rememberTableWindow(cache, authToken, kind, query, result) {
  const pageSize = Math.max(Number(query.pageSize || result.page_size || 10), 10);
  const limit = Math.max(5, Math.min(12, Math.floor(500 / pageSize)));
  const remember = (pageQuery, value) => {
    const key = tablePageKey(authToken, kind, pageQuery);
    if (cache.has(key)) cache.delete(key);
    while (cache.size >= limit) cache.delete(cache.keys().next().value);
    cache.set(key, value);
  };
  remember(query, result);
  (result.prefetch_pages || []).forEach((prefetched) => remember(
    { ...query, page: prefetched.page },
    { ...result, items: prefetched.items, page: prefetched.page, has_more: prefetched.has_more, prefetch_pages: undefined }
  ));
  return result;
}

function rememberLegacyTable(cache, key, rows) {
  if (!cache.has(key) && cache.size >= 4) cache.delete(cache.keys().next().value);
  cache.set(key, rows);
  return rows;
}

function legacyClientsTableKey(authToken, query) {
  return JSON.stringify([authToken || '', query.search || '', query.profileId || '']);
}

function legacyServiceTableKey(authToken, query) {
  return JSON.stringify([
    authToken || '',
    query.search || '',
    query.clientId || '',
    query.filterColumn || '',
    query.dateFrom || '',
    query.dateTo || '',
    query.paymentStatus || '',
    query.sortBy || '',
    query.sortDir || '',
  ]);
}

function cachedReference(key, loader, ttlMs = 60000) {
  const now = Date.now();
  const cached = referenceCache.get(key);
  if (cached?.value !== undefined && cached.expiresAt > now) return Promise.resolve(cached.value);
  if (cached?.promise) return cached.promise;
  const generation = referenceCacheGeneration;
  let promise;
  promise = loader()
    .then((value) => {
      const current = referenceCache.get(key);
      if (generation === referenceCacheGeneration && current?.promise === promise) {
        referenceCache.set(key, { value, expiresAt: Date.now() + ttlMs });
      } else if (current?.promise === promise) {
        referenceCache.delete(key);
      }
      return value;
    })
    .catch((error) => {
      if (referenceCache.get(key)?.promise === promise) referenceCache.delete(key);
      throw error;
    });
  referenceCache.set(key, { promise, expiresAt: now + ttlMs });
  return promise;
}

function invalidateReferenceCache(prefix) {
  referenceCacheGeneration += 1;
  inflightGetRequests.clear();
  for (const key of referenceCache.keys()) {
    if (key.startsWith(prefix)) referenceCache.delete(key);
  }
}

async function bootstrapSystemAt(targetConfig, payload) {
  const runtime = readRuntimeApiConfig();
  const authorizationKeys = [
    String(targetConfig?.apiKey || '').trim(),
    String(window.API_KEY || '').trim(),
    String(runtime.apiKey || '').trim(),
  ].filter((value, index, values) => value && values.indexOf(value) === index);

  let lastError = null;
  for (const authorizationKey of authorizationKeys) {
    try {
      return await apiCallWithConfig(
        { apiUrl: targetConfig?.apiUrl, apiKey: authorizationKey },
        'bootstrapSystem',
        'POST',
        payload
      );
    } catch (error) {
      lastError = error;
      if (error?.status !== 401) throw error;
    }
  }
  throw lastError || new Error('API Key invalid pentru noul server.');
}

window.API = {
  getRuntimeConfig: readRuntimeApiConfig,
  saveRuntimeConfig: saveRuntimeApiConfig,
  bootstrapSystem: bootstrapSystemAt,

  // Auth
  login: (username, password, platform = 'desktop') => apiCall('login', 'POST', {
    username,
    password,
    platform,
  }),
  adminLogin: (username, password) => apiCall('login', 'POST', {
    username,
    password,
    platform: 'desktop',
  }),
  logout: (authToken) => apiCall('logout', 'POST', { auth_token: authToken }),
  getCurrentUser: (authToken) => apiCall('getCurrentUser', 'GET', undefined, { authToken }),
  updateOwnProfile: (authToken, profile) => apiCall('updateOwnProfile', 'PUT', {
    ...profile,
    auth_token: authToken,
  }),
  getUsers: (authToken) => apiCall('getUsers', 'GET', undefined, { authToken }),
  getCompanySettings: (authToken) => apiCall('getCompanySettings', 'GET', undefined, {
    authToken,
    cacheBust: Date.now(),
  }),
  saveCompanySettings: (authToken, settings) => apiCall('saveCompanySettings', 'POST', {
    ...settings,
    auth_token: authToken,
  }),
  getSystemDatabaseInfo: (authToken) => apiCall('getSystemDatabaseInfo', 'GET', undefined, { authToken }),
  saveSystemDatabaseInfo: (authToken, payload) => apiCall('saveSystemDatabaseInfo', 'POST', {
    ...payload,
    auth_token: authToken,
  }),
  createUser: (authToken, user) => apiCall('createUser', 'POST', {
    ...user,
    auth_token: authToken,
  }),
  updateUser: (authToken, id, user) => apiCall('updateUser', 'PUT', {
    ...user,
    id,
    auth_token: authToken,
  }, { id }),
  deleteUser: (authToken, id) => apiCall('deleteUser', 'DELETE', {
    auth_token: authToken,
    id,
  }, { id }),

  // Clients
  getClients: (search, profileId) => {
    const p = {};
    if (search) p.search = search;
    if (profileId) p.profileId = profileId;
    const authToken = window.AUTH?.getToken?.();
    if (authToken) p.authToken = authToken;
    return apiCall('getClients', 'GET', undefined, p);
  },
  getClientsPage: async (query = {}, preferLegacyCache = false) => {
    const authToken = window.AUTH?.getToken?.();
    const pageCacheKey = tablePageKey(authToken, 'clients', query);
    const cachedPage = preferLegacyCache ? readTablePage(clientsTablePageCache, pageCacheKey) : null;
    if (cachedPage) return cachedPage;
    const generation = tableCacheGeneration;
    const legacyKey = legacyClientsTableKey(authToken, query);
    const cachedLegacy = preferLegacyCache ? legacyClientsTableCache.get(legacyKey) : null;
    let pageRequest = clientsTablePageRequests.get(pageCacheKey);
    if (!cachedLegacy && !pageRequest) {
      pageRequest = apiCall('getClients', 'GET', undefined, {
          ...query,
          table: 1,
          prefetchPages: tablePrefetchPages(query.pageSize),
          authToken,
          cacheBust: Date.now(),
        });
      clientsTablePageRequests.set(pageCacheKey, pageRequest);
      void pageRequest.finally(() => {
        if (clientsTablePageRequests.get(pageCacheKey) === pageRequest) clientsTablePageRequests.delete(pageCacheKey);
      }).catch(() => {});
    }
    const result = cachedLegacy || await pageRequest;
    if (!Array.isArray(result)) {
      if (generation === tableCacheGeneration) rememberTableWindow(clientsTablePageCache, authToken, 'clients', query, result);
      return result;
    }
    const compactRows = cachedLegacy || rememberLegacyTable(
      legacyClientsTableCache,
      legacyKey,
      result.map((client) => ({
        ...client,
        collaborator_costs: [],
        expense_costs: [],
        participants: [],
        activity_logs: [],
      }))
    );
    const lifecycleRows = query.lifecycle
      ? compactRows.filter((client) => query.lifecycle === 'finalized'
        ? Boolean(client.is_finalized) && client.finalization_source === 'manual'
        : !(Boolean(client.is_finalized) && client.finalization_source === 'manual'))
      : compactRows;
    const orderedRows = [...lifecycleRows].sort((left, right) => {
      if (query.sortBy === 'name') {
        const comparison = String(left.name || '').localeCompare(String(right.name || ''), 'ro', { sensitivity: 'base' });
        return query.sortDir === 'asc' ? comparison : -comparison;
      }
      const comparison = new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime();
      return query.sortDir === 'asc' ? comparison : -comparison;
    });
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.max(Number(query.pageSize || 60), 1);
    const start = (page - 1) * pageSize;
    const items = orderedRows.slice(start, start + pageSize);
    const pagedResult = { items, total: orderedRows.length, page, page_size: pageSize, has_more: start + items.length < orderedRows.length };
    if (generation === tableCacheGeneration) rememberTableWindow(clientsTablePageCache, authToken, 'clients', query, pagedResult);
    return pagedResult;
  },
  getClientById: (id) => {
    const authToken = window.AUTH?.getToken?.();
    return apiCall('getClientById', 'GET', undefined, { id, authToken, cacheBust: Date.now() });
  },
  getClientByQrCode: (qrCode) => {
    const authToken = window.AUTH?.getToken?.();
    return apiCall('getClientByQrCode', 'GET', undefined, authToken ? { qrCode, authToken } : { qrCode });
  },
  createClient: (authToken, form) => apiCall('createClient', 'POST', {
    ...form,
    auth_token: authToken,
  }),
  getClientActivityHistory: (authToken, search = '') => apiCall('getClientActivityHistory', 'GET', undefined, {
    authToken,
    search,
    cacheBust: Date.now(),
  }),
  deleteClientActivityHistory: (authToken, payload = {}) => apiCall('deleteClientActivityHistory', 'DELETE', {
    ...payload,
    auth_token: authToken,
  }, payload?.id ? { id: payload.id } : {}),
  updateClient: (authToken, id, form) => apiCall('updateClient', 'PUT', {
    ...form,
    auth_token: authToken,
  }, { id }),
  finalizeClient: (authToken, id, form) => apiCall('finalizeClient', 'PATCH', {
    ...form,
    auth_token: authToken,
  }, { id }),
  deleteClient: (authToken, id) => apiCall('deleteClient', 'DELETE', {
    auth_token: authToken,
    id,
  }, { id }),

  // Stats
  getStats: (params = {}) => {
    const query = typeof params === 'string' ? { period: params } : { ...params };
    query.platform = 'desktop';
    const authToken = window.AUTH?.getToken?.();
    if (authToken) query.authToken = authToken;
    return apiCall('getStats', 'GET', undefined, query);
  },

  // Partners
  getProfiles: () => cachedReference('profiles', () => apiCall('getProfiles')),
  createProfile: async (authToken, profile) => {
    const result = await apiCall('createProfile', 'POST', { ...profile, auth_token: authToken });
    invalidateReferenceCache('profiles');
    return result;
  },
  updateProfile: async (authToken, id, profile) => {
    const result = await apiCall('updateProfile', 'PUT', { ...profile, auth_token: authToken }, { id });
    invalidateReferenceCache('profiles');
    return result;
  },
  deleteProfile: async (authToken, id) => {
    const result = await apiCall('deleteProfile', 'DELETE', { id, auth_token: authToken }, { id });
    invalidateReferenceCache('profiles');
    return result;
  },
  getCollaborators: () => cachedReference('collaborators', () => apiCall('getCollaborators')),
  createCollaborator: async (authToken, collaborator) => {
    const result = await apiCall('createCollaborator', 'POST', { ...collaborator, auth_token: authToken });
    invalidateReferenceCache('collaborators');
    return result;
  },
  updateCollaborator: async (authToken, id, collaborator) => {
    const result = await apiCall('updateCollaborator', 'PUT', { ...collaborator, auth_token: authToken }, { id });
    invalidateReferenceCache('collaborators');
    return result;
  },
  deleteCollaborator: async (authToken, id) => {
    const result = await apiCall('deleteCollaborator', 'DELETE', { id, auth_token: authToken }, { id });
    invalidateReferenceCache('collaborators');
    return result;
  },
  getExpenseCategories: () => cachedReference('expense-categories', () => apiCall('getExpenseCategories')),
  createExpenseCategory: async (authToken, expense) => {
    const result = await apiCall('createExpenseCategory', 'POST', { ...expense, auth_token: authToken });
    invalidateReferenceCache('expense-categories');
    return result;
  },
  updateExpenseCategory: async (authToken, id, expense) => {
    const result = await apiCall('updateExpenseCategory', 'PUT', { ...expense, auth_token: authToken }, { id });
    invalidateReferenceCache('expense-categories');
    return result;
  },
  deleteExpenseCategory: async (authToken, id) => {
    const result = await apiCall('deleteExpenseCategory', 'DELETE', { id, auth_token: authToken }, { id });
    invalidateReferenceCache('expense-categories');
    return result;
  },
  getPricePresets: (authToken) => cachedReference(
    `price-presets:${authToken || ''}`,
    () => apiCall('getPricePresets', 'GET', undefined, {
      authToken,
      cacheBust: Date.now(),
    })
  ),
  createPricePreset: async (authToken, preset) => {
    const result = await apiCall('createPricePreset', 'POST', {
      ...preset,
      auth_token: authToken,
    });
    invalidateReferenceCache('price-presets:');
    return result;
  },
  updatePricePreset: async (authToken, id, preset) => {
    const result = await apiCall('updatePricePreset', 'PUT', {
      ...preset,
      auth_token: authToken,
    }, { id });
    invalidateReferenceCache('price-presets:');
    return result;
  },
  deletePricePreset: async (authToken, id) => {
    const result = await apiCall('deletePricePreset', 'DELETE', {
      id,
      auth_token: authToken,
    }, { id });
    invalidateReferenceCache('price-presets:');
    return result;
  },

  // Service Sheets
  markQrUsed: (authToken, id, payload) => apiCall('markQrUsed', 'PATCH', {
    ...payload,
    auth_token: authToken,
  }, { id }),
  getServiceSheets: (query = {}) => {
    const p = { cacheBust: Date.now(), ...query };
    const authToken = window.AUTH?.getToken?.();
    if (authToken) p.authToken = authToken;
    return apiCall('getServiceSheets', 'GET', undefined, p);
  },
  getServiceSheetsPage: async (query = {}, preferLegacyCache = false) => {
    const authToken = window.AUTH?.getToken?.();
    const pageCacheKey = tablePageKey(authToken, 'service', query);
    const cachedPage = preferLegacyCache ? readTablePage(serviceTablePageCache, pageCacheKey) : null;
    if (cachedPage) return cachedPage;
    const generation = tableCacheGeneration;
    const legacyKey = legacyServiceTableKey(authToken, query);
    const cachedLegacy = preferLegacyCache ? legacyServiceTableCache.get(legacyKey) : null;
    let pageRequest = serviceTablePageRequests.get(pageCacheKey);
    if (!cachedLegacy && !pageRequest) {
      pageRequest = apiCall('getServiceSheets', 'GET', undefined, {
          ...query,
          table: 1,
          prefetchPages: tablePrefetchPages(query.pageSize),
          authToken,
          cacheBust: Date.now(),
        });
      serviceTablePageRequests.set(pageCacheKey, pageRequest);
      void pageRequest.finally(() => {
        if (serviceTablePageRequests.get(pageCacheKey) === pageRequest) serviceTablePageRequests.delete(pageCacheKey);
      }).catch(() => {});
    }
    const result = cachedLegacy || await pageRequest;
    if (!Array.isArray(result)) {
      if (generation === tableCacheGeneration) rememberTableWindow(serviceTablePageCache, authToken, 'service', query, result);
      return result;
    }
    const compactRows = cachedLegacy || rememberLegacyTable(
      legacyServiceTableCache,
      legacyKey,
      result.map((sheet) => ({
        ...sheet,
        client_signature: null,
        expense_costs: [],
      }))
    );
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.max(Number(query.pageSize || 60), 1);
    const start = (page - 1) * pageSize;
    const items = compactRows.slice(start, start + pageSize);
    const pagedResult = { items, total: compactRows.length, page, page_size: pageSize, has_more: start + items.length < compactRows.length };
    if (generation === tableCacheGeneration) rememberTableWindow(serviceTablePageCache, authToken, 'service', query, pagedResult);
    return pagedResult;
  },
  getServiceSheetById: (authToken, id, financialEntry = false) => apiCall('getServiceSheetById', 'GET', undefined, {
    id,
    authToken,
    financialEntry: financialEntry ? 1 : undefined,
    cacheBust: Date.now(),
  }),
  getOrCreateServiceSheetForClient: (authToken, clientId, forceNew = false, showCompanyDetails = false, financialEntry = false) => apiCall(
    'getOrCreateServiceSheetForClient',
    'POST',
    {
      auth_token: authToken,
      client_id: clientId,
      force_new: forceNew ? 1 : 0,
      show_company_details: showCompanyDetails ? 1 : 0,
      financial_entry: financialEntry ? 1 : 0,
    }
  ),
  createServiceSheet: (authToken, payload) => apiCall('createServiceSheet', 'POST', {
    ...payload,
    auth_token: authToken,
  }),
  updateServiceSheet: (authToken, id, payload, financialEntry = false) => apiCall('updateServiceSheet', 'PUT', {
    ...payload,
    auth_token: authToken,
    financial_entry: financialEntry ? 1 : 0,
  }, { id }),
  updateServiceSheetCompanyDetails: (authToken, id, showCompanyDetails) => apiCall(
    'updateServiceSheetCompanyDetails',
    'PUT',
    { auth_token: authToken, show_company_details: showCompanyDetails ? 1 : 0 },
    { id }
  ),
  deleteServiceSheet: (authToken, id) => apiCall('deleteServiceSheet', 'DELETE', {
    auth_token: authToken,
  }, { id }),
  getServiceSheetPdfUrl: (authToken, id) => {
    const config = readRuntimeApiConfig();
    const url = new URL(`${normalizeApiUrl(config.apiUrl)}/api.php`);
    url.searchParams.set('action', 'downloadServiceSheetPdf');
    url.searchParams.set('id', id);
    url.searchParams.set('authToken', authToken);
    url.searchParams.set('api_key', config.apiKey);
    url.searchParams.set('_', `${Date.now()}`);
    return url.toString();
  },
  downloadServiceSheetPdf: async (authToken, id) => {
    const config = readRuntimeApiConfig();
    const url = new URL(`${normalizeApiUrl(config.apiUrl)}/api.php`);
    url.searchParams.set('action', 'downloadServiceSheetPdf');
    url.searchParams.set('id', id);
    url.searchParams.set('authToken', authToken);
    url.searchParams.set('_', `${Date.now()}`);
    const res = await fetch(url.toString(), {
      cache: 'no-store',
      headers: { 'X-API-Key': config.apiKey },
    });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const json = await res.json();
        message = json.error || message;
      } catch (_error) {}
      throw new Error(message);
    }
    return Array.from(new Uint8Array(await res.arrayBuffer()));
  },
  createServiceSheetPdfShareLink: (authToken, id) => apiCall('createServiceSheetPdfShareLink', 'POST', {
    auth_token: authToken,
  }, { id }),

  // Chat
  getAdminChatContacts: (authToken) => apiCall('getChatContacts', 'GET', undefined, {
    actor: 'admin',
    authToken,
  }),
  getAdminChatMessages: (authToken, conversationId) => apiCall('getChatMessages', 'GET', undefined, {
    actor: 'admin',
    authToken,
    conversationId,
  }),
  sendAdminChatMessage: (authToken, conversationId, body) => apiCall('sendChatMessage', 'POST', {
    actor: 'admin',
    auth_token: authToken,
    conversation_id: conversationId,
    body,
  }),
  acceptAdminChat: (authToken, conversationId) => apiCall('acceptChat', 'POST', {
    auth_token: authToken,
    conversation_id: conversationId,
  }),
  markAdminChatRead: (authToken, conversationId) => apiCall('markChatRead', 'PATCH', {
    actor: 'admin',
    auth_token: authToken,
    conversation_id: conversationId,
  }),
  getAdminChatUnread: (authToken) => apiCall('getChatUnread', 'GET', undefined, {
    actor: 'admin',
    authToken,
  }),
  getUserChatContacts: (authToken) => apiCall('getChatContacts', 'GET', undefined, {
    actor: 'mobile',
    authToken,
  }),
  getUserChatMessages: (authToken) => apiCall('getChatMessages', 'GET', undefined, {
    actor: 'mobile',
    authToken,
  }),
  sendUserChatMessage: (authToken, body) => apiCall('sendChatMessage', 'POST', {
    actor: 'mobile',
    auth_token: authToken,
    body,
  }),
  markUserChatRead: (authToken) => apiCall('markChatRead', 'PATCH', {
    actor: 'mobile',
    auth_token: authToken,
  }),
  getUserChatUnread: (authToken) => apiCall('getChatUnread', 'GET', undefined, {
    actor: 'mobile',
    authToken,
  }),
  leaveUserChat: (authToken) => apiCall('leaveChat', 'POST', {
    auth_token: authToken,
  }),
  deleteAdminChatConversation: (authToken, conversationId) => apiCall('deleteChatConversation', 'DELETE', {
    auth_token: authToken,
    conversation_id: conversationId,
  }),
  closeAdminChatConversation: (authToken, conversationId) => apiCall('closeChatConversation', 'POST', {
    auth_token: authToken,
    conversation_id: conversationId,
  }),
  getWhatsAppPredefinedMessages: (authToken, targetUserId = '') => apiCall('getWhatsAppPredefinedMessages', 'GET', undefined, { authToken, targetUserId }),
  createWhatsAppPredefinedMessage: (authToken, title, body, targetUserId = '') => apiCall('createWhatsAppPredefinedMessage', 'POST', { auth_token: authToken, title, body, target_user_id: targetUserId }),
  updateWhatsAppPredefinedMessage: (authToken, id, title, body, targetUserId = '') => apiCall('updateWhatsAppPredefinedMessage', 'PUT', { auth_token: authToken, id, title, body, target_user_id: targetUserId }, { id }),
  deleteWhatsAppPredefinedMessage: (authToken, id, targetUserId = '') => apiCall('deleteWhatsAppPredefinedMessage', 'DELETE', { auth_token: authToken, id, target_user_id: targetUserId }, { id }),
};
