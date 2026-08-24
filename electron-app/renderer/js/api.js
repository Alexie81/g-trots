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
  const next = {
    apiUrl: normalizeApiUrl(config?.apiUrl || window.API_URL || ''),
    apiKey: String(config?.apiKey || window.API_KEY || '').trim(),
  };
  localStorage.setItem(API_CONFIG_STORAGE_KEY, JSON.stringify(next));
  referenceCache?.clear?.();
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
    return apiCallWithConfig(config, action, method, body, params);
  }

  const sortedParams = Object.entries(params || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const requestKey = `${config.apiUrl}|${config.apiKey}|${action}|${sortedParams}`;
  const existing = inflightGetRequests.get(requestKey);
  if (existing) return existing;
  const request = apiCallWithConfig(config, action, method, body, params)
    .finally(() => inflightGetRequests.delete(requestKey));
  inflightGetRequests.set(requestKey, request);
  return request;
}

const referenceCache = new Map();
const inflightGetRequests = new Map();

function cachedReference(key, loader, ttlMs = 60000) {
  const now = Date.now();
  const cached = referenceCache.get(key);
  if (cached?.value !== undefined && cached.expiresAt > now) return Promise.resolve(cached.value);
  if (cached?.promise) return cached.promise;
  const promise = loader()
    .then((value) => {
      referenceCache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((error) => {
      referenceCache.delete(key);
      throw error;
    });
  referenceCache.set(key, { promise, expiresAt: now + ttlMs });
  return promise;
}

function invalidateReferenceCache(prefix) {
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
