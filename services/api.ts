import type {
  Client,
  Profile,
  Collaborator,
  ExpenseCategory,
  CompanySettings,
  AppUser,
  ClientFormData,
  StatsData,
  ChatContact,
  ChatMessage,
  ChatConversation,
  ChatMessagesResponse,
  ChatUnreadResponse,
  LoginResponse,
  WhatsAppPredefinedMessage,
  PricePreset,
  ServiceSheet,
  ServiceSheetFormData,
  PaymentStatus,
  PlatformAccess,
  UserRole,
} from '@/types';
import { generateQrCode } from '@/utils/qr';
import * as SecureStore from 'expo-secure-store';
import { calculateClientPayment, normalizeServiceSheetWorkPrice } from '@/constants/financial';

const API_CONFIG_STORAGE_KEY = 'gtrots.systemApiConfig';
const DEFAULT_API_CONFIG = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://cab-it.ro/trotty-api',
  apiKey: process.env.EXPO_PUBLIC_API_KEY || 'GTROTS_X9K3M7_2026_SECURE',
};

export type RuntimeApiConfig = {
  apiUrl: string;
  apiKey: string;
};

export type SystemDatabaseInfo = {
  api_url: string;
  api_key: string;
  db_host: string;
  db_name: string;
  db_user: string;
  db_pass: string;
  service_sheet_pdf_base_url: string;
  db_password_saved: boolean;
  schema_file: string | null;
  config_file_saved: boolean;
};

export type SystemDatabasePayload = {
  api_key: string;
  db_host: string;
  db_name: string;
  db_user: string;
  db_pass: string;
  service_sheet_pdf_base_url: string;
  keep_db_pass?: number;
  run_schema?: number;
};

export type SystemDatabaseResult = {
  success: boolean;
  database_created: boolean;
  schema_ran: boolean;
  schema_statements: number;
  config_file_saved: boolean;
  target_database: string;
  default_admin_ready?: boolean;
  message?: string;
};

export type MobileAppUpdateInfo = {
  platform: 'android';
  current_version: string;
  available_version: string;
  update_available: boolean;
  download_url: string;
  release_notes?: string;
  message?: string;
};

export type PagedResult<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
  prefetch_pages?: {
    items: T[];
    page: number;
    has_more: boolean;
  }[];
};

function pagedPrefetchCount(pageSize: number) {
  const safePageSize = Math.min(100, Math.max(10, Math.trunc(pageSize || 10)));
  return Math.max(0, Math.min(4, Math.floor(100 / safePageSize) - 1));
}

export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

export function isAuthenticationApiError(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 401 || error.status === 403);
}

function isTransientApiError(error: unknown): boolean {
  return error instanceof ApiRequestError
    && (error.status === 0 || error.status === 200 || error.status === 408 || error.status === 429 || error.status >= 500);
}

let runtimeConfigPromise: Promise<RuntimeApiConfig> | null = null;
const referenceCache = new Map<string, { expiresAt: number; value?: unknown; promise?: Promise<unknown> }>();
const inflightGetRequests = new Map<string, Promise<unknown>>();
const legacyClientsTableCache = new Map<string, Client[]>();
const legacyServiceTableCache = new Map<string, ServiceSheet[]>();
const clientsTablePageCache = new Map<string, PagedResult<Client>>();
const serviceTablePageCache = new Map<string, PagedResult<ServiceSheet>>();
const clientsTablePageRequests = new Map<string, Promise<PagedResult<Client> | Client[]>>();
const serviceTablePageRequests = new Map<string, Promise<PagedResult<ServiceSheet> | ServiceSheet[]>>();
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

function actionInvalidatesTables(action: string) {
  return action === 'login'
    || action === 'adminLogin'
    || action === 'logout'
    || action === 'markQrUsed'
    || action === 'saveSystemDatabaseInfo'
    || /(Client|ServiceSheet|Profile|Collaborator|Expense|User)/.test(action);
}

function tablePageKey(authToken: string, kind: 'clients' | 'service', query: Record<string, unknown>) {
  return JSON.stringify([
    authToken,
    kind,
    query.search || '',
    query.profileId || '',
    query.clientId || '',
    query.lifecycle || '',
    query.paymentStatus || '',
    query.filterColumn || '',
    query.dateFrom || '',
    query.dateTo || '',
    query.sortBy || '',
    query.sortDir || '',
    query.page || 1,
    query.pageSize || 10,
  ]);
}

function readTablePage<T>(cache: Map<string, PagedResult<T>>, key: string) {
  const cached = cache.get(key);
  if (!cached) return undefined;
  cache.delete(key);
  cache.set(key, cached);
  return cached;
}

function rememberTableWindow<T>(
  cache: Map<string, PagedResult<T>>,
  authToken: string,
  kind: 'clients' | 'service',
  query: Record<string, unknown>,
  result: PagedResult<T>
) {
  const pageSize = Math.max(Number(query.pageSize || result.page_size || 10), 10);
  const limit = Math.max(5, Math.min(12, Math.floor(500 / pageSize)));
  const remember = (pageQuery: Record<string, unknown>, value: PagedResult<T>) => {
    const key = tablePageKey(authToken, kind, pageQuery);
    if (cache.has(key)) cache.delete(key);
    while (cache.size >= limit) {
      const oldest = cache.keys().next().value;
      if (!oldest) break;
      cache.delete(oldest);
    }
    cache.set(key, value);
  };
  // Pastram fereastra doar pe pagina principala; paginile sintetice nu o
  // recopiaza. Astfel, primul ecran poate importa tot blocul intr-un singur pas.
  remember(query, result);
  result.prefetch_pages?.forEach((prefetched) => remember(
    { ...query, page: prefetched.page },
    {
      ...result,
      items: prefetched.items,
      page: prefetched.page,
      has_more: prefetched.has_more,
      prefetch_pages: undefined,
    }
  ));
}

function rememberLegacyTable<T>(cache: Map<string, T[]>, key: string, rows: T[]) {
  if (!cache.has(key) && cache.size >= 4) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, rows);
  return rows;
}

function legacyClientsTableKey(authToken: string, query: ClientsTableQuery) {
  return JSON.stringify([authToken, query.search || '', query.profileId || '']);
}

function legacyServiceTableKey(authToken: string, query: ServiceSheetsQuery) {
  return JSON.stringify([
    authToken,
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

async function cachedReference<T>(key: string, loader: () => Promise<T>, ttlMs = 60000): Promise<T> {
  const now = Date.now();
  const cached = referenceCache.get(key);
  if (cached?.value !== undefined && cached.expiresAt > now) return cached.value as T;
  if (cached?.promise) return cached.promise as Promise<T>;
  const generation = referenceCacheGeneration;
  let promise: Promise<T>;
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

function invalidateReferenceCache(...prefixes: string[]) {
  referenceCacheGeneration += 1;
  inflightGetRequests.clear();
  for (const key of referenceCache.keys()) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) referenceCache.delete(key);
  }
}

export function normalizeApiUrl(value: string) {
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
  } catch {}
  return normalized;
}

async function readStoredApiConfig(): Promise<RuntimeApiConfig> {
  const fallback = {
    apiUrl: normalizeApiUrl(DEFAULT_API_CONFIG.apiUrl),
    apiKey: DEFAULT_API_CONFIG.apiKey.trim(),
  };
  try {
    const raw = await SecureStore.getItemAsync(API_CONFIG_STORAGE_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<RuntimeApiConfig>;
    const config = {
      apiUrl: normalizeApiUrl(saved.apiUrl || fallback.apiUrl),
      apiKey: String(saved.apiKey || fallback.apiKey).trim(),
    };
    if (saved.apiUrl !== config.apiUrl || saved.apiKey !== config.apiKey) {
      await SecureStore.setItemAsync(API_CONFIG_STORAGE_KEY, JSON.stringify(config));
    }
    return config;
  } catch {
    return fallback;
  }
}

export async function getRuntimeApiConfig(): Promise<RuntimeApiConfig> {
  if (!runtimeConfigPromise) runtimeConfigPromise = readStoredApiConfig();
  return runtimeConfigPromise;
}

export async function saveRuntimeApiConfig(config: RuntimeApiConfig): Promise<RuntimeApiConfig> {
  const next = {
    apiUrl: normalizeApiUrl(config.apiUrl),
    apiKey: String(config.apiKey || '').trim(),
  };
  if (!next.apiUrl || !/^https?:\/\//i.test(next.apiUrl)) {
    throw new Error('Adresa API trebuie sa inceapa cu http:// sau https://.');
  }
  if (!next.apiKey) throw new Error('API Key este obligatoriu.');
  await SecureStore.setItemAsync(API_CONFIG_STORAGE_KEY, JSON.stringify(next));
  runtimeConfigPromise = Promise.resolve(next);
  clearReferenceCaches();
  clearTableCaches();
  return next;
}

async function callWithConfig<T>(
  config: RuntimeApiConfig,
  action: string,
  method: string = 'GET',
  body?: object,
  params?: Record<string, string>
): Promise<T> {
  const apiUrl = normalizeApiUrl(config.apiUrl);
  if (!apiUrl || !/^https?:\/\//i.test(apiUrl)) {
    throw new ApiRequestError('Adresa API trebuie sa inceapa cu http:// sau https://.');
  }
  const url = new URL(`${apiUrl}/api.php`);
  url.searchParams.set('action', action);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  let res: Response;
  const controller = new AbortController();
  const timeoutMs = method.toUpperCase() === 'GET' ? 12000 : 30000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    res = await fetch(url.toString(), {
      method,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': config.apiKey },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new ApiRequestError(
        `API-ul ${apiUrl} nu a raspuns in ${Math.round(timeoutMs / 1000)} secunde. Incearca din nou.`
      );
    }
    throw new ApiRequestError(
      `Nu pot contacta API-ul ${apiUrl}. Verifica internetul si incearca din nou.`
    );
  } finally {
    clearTimeout(timeout);
  }

  const raw = await res.text();
  let json: any = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    throw new ApiRequestError(
      `Serverul ${apiUrl} nu a returnat JSON valid (HTTP ${res.status}).`,
      res.status
    );
  }
  if (!res.ok) throw new ApiRequestError(json.error || `HTTP ${res.status}`, res.status);
  return json as T;
}

function readFallbackConfigs(config: RuntimeApiConfig): RuntimeApiConfig[] {
  const configs = [config];
  try {
    const current = new URL(normalizeApiUrl(config.apiUrl));
    const hostname = current.hostname.toLowerCase();
    if (hostname === 'cab-it.ro') {
      configs.push({ ...config, apiUrl: 'https://g-trots.ro/trotty-api' });
    } else if (hostname === 'g-trots.ro') {
      configs.push({ ...config, apiUrl: 'https://cab-it.ro/trotty-api' });
    }
  } catch {}
  return configs.filter(
    (item, index, values) => values.findIndex((candidate) => candidate.apiUrl === item.apiUrl) === index
  );
}

async function callReadWithRecovery<T>(
  config: RuntimeApiConfig,
  action: string,
  params?: Record<string, string>
): Promise<T> {
  let lastError: unknown = null;
  const configs = readFallbackConfigs(config);
  for (const candidate of configs) {
    try {
      return await callWithConfig<T>(candidate, action, 'GET', undefined, params);
    } catch (error) {
      lastError = error;
      if (isAuthenticationApiError(error) || !isTransientApiError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError || new ApiRequestError('API-ul nu este disponibil momentan.');
}

async function call<T>(
  action: string,
  method: string = 'GET',
  body?: object,
  params?: Record<string, string>
): Promise<T> {
  const config = await getRuntimeApiConfig();
  if (method.toUpperCase() !== 'GET') {
    const result = await callWithConfig<T>(config, action, method, body, params);
    if (actionInvalidatesTables(action)) clearTableCaches();
    return result;
  }

  const sortedParams = Object.entries(params || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const requestKey = `${config.apiUrl}|${config.apiKey}|${action}|${sortedParams}`;
  const existing = inflightGetRequests.get(requestKey);
  if (existing) return existing as Promise<T>;

  const request = callReadWithRecovery<T>(config, action, params)
    .finally(() => {
      if (inflightGetRequests.get(requestKey) === request) inflightGetRequests.delete(requestKey);
    });
  inflightGetRequests.set(requestKey, request);
  return request;
}

export async function bootstrapSystemAt(
  targetConfig: RuntimeApiConfig,
  payload: SystemDatabasePayload
) {
  const current = await getRuntimeApiConfig();
  const authorizationKeys = [
    String(targetConfig.apiKey || '').trim(),
    String(DEFAULT_API_CONFIG.apiKey || '').trim(),
    String(current.apiKey || '').trim(),
  ].filter((value, index, values) => value && values.indexOf(value) === index);

  let lastError: unknown = null;
  for (const authorizationKey of authorizationKeys) {
    try {
      return await callWithConfig<SystemDatabaseResult>(
        { apiUrl: targetConfig.apiUrl, apiKey: authorizationKey },
        'bootstrapSystem',
        'POST',
        payload
      );
    } catch (error) {
      lastError = error;
      if (!(error instanceof ApiRequestError) || error.status !== 401) throw error;
    }
  }
  throw lastError || new Error('API Key invalid pentru noul server.');
}

export async function getSystemDatabaseInfo(authToken: string) {
  return call<SystemDatabaseInfo>('getSystemDatabaseInfo', 'GET', undefined, { authToken });
}

export async function saveSystemDatabaseInfo(
  authToken: string,
  payload: SystemDatabasePayload
) {
  return call<SystemDatabaseResult>('saveSystemDatabaseInfo', 'POST', {
    ...payload,
    auth_token: authToken,
  });
}

export async function loginAppUser(
  username: string,
  password: string,
  platform: 'desktop' | 'mobile' = 'mobile',
  rememberMe = false
) {
  const config = await getRuntimeApiConfig();
  const payload = {
    username,
    password,
    platform,
    remember_me: rememberMe ? 1 : 0,
  };
  let lastError: unknown = null;
  for (const candidate of readFallbackConfigs(config)) {
    try {
      return await callWithConfig<LoginResponse>(candidate, 'login', 'POST', payload);
    } catch (error) {
      lastError = error;
      if (isAuthenticationApiError(error) || !isTransientApiError(error)) throw error;
    }
  }
  throw lastError || new ApiRequestError('Autentificarea nu este disponibila momentan.');
}

export async function logoutAppUser(authToken: string) {
  return call<{ success: boolean }>('logout', 'POST', { auth_token: authToken });
}

export async function getCurrentAppUser(authToken: string) {
  return call<AppUser>('getCurrentUser', 'GET', undefined, { authToken });
}

export async function getMobileAppUpdate(currentVersion: string) {
  return call<MobileAppUpdateInfo>('getMobileAppUpdate', 'GET', undefined, {
    currentVersion,
    platform: 'android',
    cacheBust: String(Date.now()),
  });
}

// ─── Clients ────────────────────────────────────────────────────────────────

function nullableMoneyInput(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : null;
}

function normalizeExpenseCosts(form: ClientFormData) {
  return (form.expense_costs || [])
    .map((item) => ({
      expense_id: item.expense_id,
      cost: parseFloat(item.cost) || 0,
    }))
    .filter((item) => item.expense_id);
}

function expenseCostsTotal(form: ClientFormData) {
  return normalizeExpenseCosts(form).reduce((sum, item) => sum + item.cost, 0);
}

function normalizeCollaboratorCosts(form: ClientFormData, profilePercentage = 0) {
  const price = parseFloat(form.price) || 0;
  const predefinedPrice = parseFloat(form.predefined_price) || 0;
  const discount = Math.min(100, Math.max(parseFloat(form.discount_percentage) || 0, 0));
  const revenue = calculateClientPayment(price, predefinedPrice, discount).total;
  const profileCost = revenue * (Math.min(100, Math.max(profilePercentage || 0, 0)) / 100);
  const effectivePartsCost = nullableMoneyInput(form.valoare_piese)
    ?? (parseFloat(form.service_parts_price) || 0);
  const baseBeforeCollaborators = Math.max(
    revenue - profileCost - effectivePartsCost - expenseCostsTotal(form),
    0
  );
  const rawItems = (form.collaborator_costs || [])
    .filter((item) => item.collaborator_id)
    .map((item) => ({
      ...item,
      cost_type: item.cost_type === 'percentage' ? 'percentage' as const : 'fixed' as const,
      percentage: String(Math.min(100, Math.max(parseFloat(item.percentage) || 0, 0))),
      cost: String(Math.max(parseFloat(item.cost) || 0, 0)),
      payment_status: normalizePaymentStatusValue(item.payment_status, 'de_incasat'),
    }));
  const fixedTotal = rawItems.reduce(
    (sum, item) => item.cost_type === 'fixed' ? sum + (parseFloat(item.cost) || 0) : sum,
    0
  );
  const percentageNetBase = Math.max(baseBeforeCollaborators - fixedTotal, 0);

  return rawItems.map((item) => {
    const percentage = parseFloat(item.percentage) || 0;
    return {
      collaborator_id: item.collaborator_id,
      cost_type: item.cost_type,
      percentage,
      cost: item.cost_type === 'percentage'
        ? percentageNetBase * (percentage / 100)
        : parseFloat(item.cost) || 0,
      payment_status: normalizePaymentStatusValue(item.payment_status, 'de_incasat'),
    };
  });
}

function collaboratorCostsTotal(form: ClientFormData, profilePercentage = 0) {
  return normalizeCollaboratorCosts(form, profilePercentage).reduce((sum, item) => sum + item.cost, 0);
}

function paymentStatusFromAmounts(total: number, amountDue: number): PaymentStatus {
  return total > 0 && amountDue <= 0 ? 'incasati' : 'de_incasat';
}

function normalizePaymentStatusValue(value: unknown, fallback: PaymentStatus = 'de_incasat'): PaymentStatus {
  return value === 'incasati' || value === 'de_incasat' ? value : fallback;
}

function resolvedPaymentStatus(value: unknown, total: number, amountDue: number): PaymentStatus {
  if (total > 0 && amountDue <= 0) return 'incasati';
  return normalizePaymentStatusValue(value, paymentStatusFromAmounts(total, amountDue));
}

export async function getClients(search?: string, profileId?: string, authToken?: string) {
  const p: Record<string, string> = { cacheBust: String(Date.now()) };
  if (search)    p.search    = search;
  if (profileId) p.profileId = profileId;
  if (authToken) p.authToken = authToken;
  return call<Client[]>('getClients', 'GET', undefined, p);
}

export type ClientsTableQuery = {
  search?: string;
  profileId?: string;
  lifecycle?: 'active' | 'finalized';
  sortBy?: 'created_at' | 'name';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
};

export async function getClientsPage(
  authToken: string,
  query: ClientsTableQuery = {},
  preferLegacyCache = false
): Promise<PagedResult<Client>> {
  const pageCacheKey = tablePageKey(authToken, 'clients', query as Record<string, unknown>);
  const cachedPage = preferLegacyCache ? readTablePage(clientsTablePageCache, pageCacheKey) : undefined;
  if (cachedPage) return cachedPage;
  const generation = tableCacheGeneration;
  const legacyKey = legacyClientsTableKey(authToken, query);
  const cachedLegacy = preferLegacyCache ? legacyClientsTableCache.get(legacyKey) : undefined;
  const params: Record<string, string> = {
    authToken,
    table: '1',
    prefetchPages: String(pagedPrefetchCount(query.pageSize || 10)),
    cacheBust: String(Date.now()),
  };
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') params[key] = String(value);
  });
  let pageRequest = clientsTablePageRequests.get(pageCacheKey);
  if (!cachedLegacy && !pageRequest) {
    pageRequest = call<PagedResult<Client> | Client[]>('getClients', 'GET', undefined, params);
    clientsTablePageRequests.set(pageCacheKey, pageRequest);
    void pageRequest.finally(() => {
      if (clientsTablePageRequests.get(pageCacheKey) === pageRequest) clientsTablePageRequests.delete(pageCacheKey);
    }).catch(() => {});
  }
  const result = cachedLegacy ?? await pageRequest!;
  if (!Array.isArray(result)) {
    if (generation === tableCacheGeneration) {
      rememberTableWindow(clientsTablePageCache, authToken, 'clients', query as Record<string, unknown>, result);
    }
    return result;
  }
  const compactRows = cachedLegacy ?? rememberLegacyTable(
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
  const page = Math.max(query.page || 1, 1);
  const pageSize = Math.max(query.pageSize || 40, 1);
  const start = (page - 1) * pageSize;
  const items = orderedRows.slice(start, start + pageSize);
  const pagedResult = { items, total: orderedRows.length, page, page_size: pageSize, has_more: start + items.length < orderedRows.length };
  if (generation === tableCacheGeneration) {
    rememberTableWindow(clientsTablePageCache, authToken, 'clients', query as Record<string, unknown>, pagedResult);
  }
  return pagedResult;
}

export async function getClientById(id: string, authToken?: string) {
  return call<Client | null>('getClientById', 'GET', undefined, authToken ? { id, authToken } : { id });
}

export async function getClientByQrCode(qrCode: string, authToken?: string) {
  return call<Client | null>('getClientByQrCode', 'GET', undefined, authToken ? { qrCode, authToken } : { qrCode });
}

export async function markQrUsed(
  id: string,
  price: number,
  predefined_price: number,
  advance_amount: number,
  currency_code: string,
  payment_status: PaymentStatus,
  discount_percentage: number,
  notes: string,
  authToken?: string
) {
  const storedPrice = price > 0 ? price : predefined_price;
  const payment = calculateClientPayment(storedPrice, predefined_price, discount_percentage, advance_amount);
  const resolvedStatus = resolvedPaymentStatus(payment_status, payment.total, payment.amountDue);
  return call<Client>(
    'markQrUsed',
    'PATCH',
    authToken
      ? { price: storedPrice, predefined_price, advance_amount, currency_code, payment_status: resolvedStatus, discount_percentage, notes, auth_token: authToken }
      : { price: storedPrice, predefined_price, advance_amount, currency_code, payment_status: resolvedStatus, discount_percentage, notes },
    { id }
  );
}

export async function createClient(form: ClientFormData, authToken?: string, profilePercentage = 0) {
  const collaborator_costs = normalizeCollaboratorCosts(form, profilePercentage);
  const expense_costs = normalizeExpenseCosts(form);
  const rawPrice = parseFloat(form.price) || 0;
  const predefinedPrice = parseFloat(form.predefined_price) || 0;
  const price = rawPrice > 0 ? rawPrice : predefinedPrice;
  const discount = parseFloat(form.discount_percentage) || 0;
  const advanceAmount = Math.max(parseFloat(form.advance_amount) || 0, 0);
  const payment = calculateClientPayment(price, predefinedPrice, discount, advanceAmount);
  return call<Client>('createClient', 'POST', {
    name:                 form.name.trim(),
    phone:                form.phone.trim(),
    email:                form.email.trim()              || null,
    status:               'va_folosi_codul',
    qr_code:              generateQrCode(),
    price,
    predefined_price:     predefinedPrice,
    advance_amount:       advanceAmount,
    currency_code:        form.currency_code || 'RON',
    payment_status:       resolvedPaymentStatus(form.payment_status, payment.total, payment.amountDue),
    discount_percentage:  discount,
    manopera_colaboratori: collaborator_costs.length ? collaboratorCostsTotal(form, profilePercentage) : nullableMoneyInput(form.manopera_colaboratori),
    collaborator_costs,
    valoare_piese:        nullableMoneyInput(form.valoare_piese),
    service_parts_price:  parseFloat(form.service_parts_price) || 0,
    service_labor_price:  parseFloat(form.service_labor_price) || 0,
    alte_cheltuieli:      expense_costs.length ? expenseCostsTotal(form) : null,
    expense_costs,
    notes:                form.notes.trim()              || null,
    profile_id:           form.profile_id                || null,
    auth_token:           authToken || undefined,
  });
}

export async function updateClient(id: string, form: ClientFormData, authToken?: string, profilePercentage = 0) {
  const collaborator_costs = normalizeCollaboratorCosts(form, profilePercentage);
  const expense_costs = normalizeExpenseCosts(form);
  const rawPrice = parseFloat(form.price) || 0;
  const predefinedPrice = parseFloat(form.predefined_price) || 0;
  const price = rawPrice > 0 ? rawPrice : predefinedPrice;
  const discount = parseFloat(form.discount_percentage) || 0;
  const advanceAmount = Math.max(parseFloat(form.advance_amount) || 0, 0);
  const payment = calculateClientPayment(price, predefinedPrice, discount, advanceAmount);
  const body: Record<string, unknown> = {
    name:                 form.name.trim(),
    phone:                form.phone.trim(),
    email:                form.email.trim()              || null,
    status:               form.status,
    price,
    predefined_price:     predefinedPrice,
    advance_amount:       advanceAmount,
    currency_code:        form.currency_code || 'RON',
    payment_status:       resolvedPaymentStatus(form.payment_status, payment.total, payment.amountDue),
    discount_percentage:  discount,
    manopera_colaboratori: collaborator_costs.length ? collaboratorCostsTotal(form, profilePercentage) : nullableMoneyInput(form.manopera_colaboratori),
    collaborator_costs,
    valoare_piese:        nullableMoneyInput(form.valoare_piese),
    service_parts_price:  parseFloat(form.service_parts_price) || 0,
    service_labor_price:  parseFloat(form.service_labor_price) || 0,
    alte_cheltuieli:      expense_costs.length ? expenseCostsTotal(form) : null,
    expense_costs,
    notes:                form.notes.trim()              || null,
    profile_id:           form.profile_id                || null,
    auth_token:           authToken || undefined,
  };
  if (form.is_finalized !== undefined) {
    body.is_finalized = form.is_finalized ? 1 : 0;
  }
  return call<Client>('updateClient', 'PUT', body, { id });
}

export async function finalizeClient(id: string, form: ClientFormData, authToken?: string, profilePercentage = 0) {
  const collaborator_costs = normalizeCollaboratorCosts(form, profilePercentage);
  const expense_costs = normalizeExpenseCosts(form);
  const rawPrice = parseFloat(form.price) || 0;
  const predefinedPrice = parseFloat(form.predefined_price) || 0;
  const price = rawPrice > 0 ? rawPrice : predefinedPrice;
  const discount = parseFloat(form.discount_percentage) || 0;
  const advanceAmount = Math.max(parseFloat(form.advance_amount) || 0, 0);
  const payment = calculateClientPayment(price, predefinedPrice, discount, advanceAmount);
  return call<Client>('finalizeClient', 'PATCH', {
    name:                 form.name.trim(),
    phone:                form.phone.trim(),
    email:                form.email.trim()              || null,
    status:               'cod_folosit',
    price,
    predefined_price:     predefinedPrice,
    advance_amount:       advanceAmount,
    currency_code:        form.currency_code || 'RON',
    payment_status:       resolvedPaymentStatus(form.payment_status, payment.total, payment.amountDue),
    discount_percentage:  discount,
    manopera_colaboratori: collaborator_costs.length ? collaboratorCostsTotal(form, profilePercentage) : nullableMoneyInput(form.manopera_colaboratori),
    collaborator_costs,
    valoare_piese:        nullableMoneyInput(form.valoare_piese),
    service_parts_price:  parseFloat(form.service_parts_price) || 0,
    service_labor_price:  parseFloat(form.service_labor_price) || 0,
    alte_cheltuieli:      expense_costs.length ? expenseCostsTotal(form) : null,
    expense_costs,
    notes:                form.notes.trim()              || null,
    profile_id:           form.profile_id                || null,
    auth_token:           authToken || undefined,
  }, { id });
}

export async function deleteClient(id: string, authToken?: string) {
  return call<{ success: boolean }>(
    'deleteClient',
    'DELETE',
    authToken ? { auth_token: authToken } : undefined,
    { id }
  );
}

// ─── Profiles ────────────────────────────────────────────────────────────────

export async function getProfiles() {
  return cachedReference('profiles', () => call<Profile[]>('getProfiles', 'GET'));
}

export async function createProfile(authToken: string, name: string, role: string, percentage: number, color: string) {
  const result = await call<Profile>('createProfile', 'POST', { auth_token: authToken, name, role, percentage, color });
  invalidateReferenceCache('profiles');
  return result;
}

export async function updateProfile(authToken: string, id: string, name: string, role: string, percentage: number, color: string) {
  const result = await call<Profile>('updateProfile', 'PUT', { auth_token: authToken, name, role, percentage, color }, { id });
  invalidateReferenceCache('profiles');
  return result;
}

export async function deleteProfile(authToken: string, id: string) {
  const result = await call<{ success: boolean }>('deleteProfile', 'DELETE', { auth_token: authToken }, { id });
  invalidateReferenceCache('profiles');
  return result;
}

// Collaborators

export async function getCollaborators() {
  return cachedReference('collaborators', () => call<Collaborator[]>('getCollaborators', 'GET'));
}

export async function createCollaborator(authToken: string, name: string, role: string, phone: string, email: string, percentage: number, color: string) {
  const result = await call<Collaborator>('createCollaborator', 'POST', { auth_token: authToken, name, role, phone, email, percentage, color });
  invalidateReferenceCache('collaborators');
  return result;
}

export async function updateCollaborator(
  authToken: string,
  id: string,
  name: string,
  role: string,
  phone: string,
  email: string,
  percentage: number,
  color: string
) {
  const result = await call<Collaborator>('updateCollaborator', 'PUT', { auth_token: authToken, name, role, phone, email, percentage, color }, { id });
  invalidateReferenceCache('collaborators');
  return result;
}

export async function deleteCollaborator(authToken: string, id: string) {
  const result = await call<{ success: boolean }>('deleteCollaborator', 'DELETE', { auth_token: authToken }, { id });
  invalidateReferenceCache('collaborators');
  return result;
}

// Expense categories

export async function getExpenseCategories() {
  return cachedReference('expense-categories', () => call<ExpenseCategory[]>('getExpenseCategories', 'GET'));
}

export async function createExpenseCategory(authToken: string, name: string, color: string) {
  const result = await call<ExpenseCategory>('createExpenseCategory', 'POST', { auth_token: authToken, name, color });
  invalidateReferenceCache('expense-categories');
  return result;
}

export async function updateExpenseCategory(authToken: string, id: string, name: string, color: string) {
  const result = await call<ExpenseCategory>('updateExpenseCategory', 'PUT', { auth_token: authToken, name, color }, { id });
  invalidateReferenceCache('expense-categories');
  return result;
}

export async function deleteExpenseCategory(authToken: string, id: string) {
  const result = await call<{ success: boolean }>('deleteExpenseCategory', 'DELETE', { auth_token: authToken }, { id });
  invalidateReferenceCache('expense-categories');
  return result;
}

// Price presets

export async function getPricePresets(authToken?: string) {
  return cachedReference(
    `price-presets:${authToken || 'public'}`,
    () => call<PricePreset[]>(
      'getPricePresets',
      'GET',
      undefined,
      authToken ? { authToken, cacheBust: String(Date.now()) } : { cacheBust: String(Date.now()) }
    )
  );
}

export async function createPricePreset(authToken: string, label: string, price: number) {
  const result = await call<PricePreset>('createPricePreset', 'POST', {
    auth_token: authToken,
    label,
    price,
  });
  invalidateReferenceCache('price-presets:');
  return result;
}

export async function updatePricePreset(authToken: string, id: string, label: string, price: number, isActive = true) {
  const result = await call<PricePreset>('updatePricePreset', 'PUT', {
    auth_token: authToken,
    label,
    price,
    is_active: isActive ? 1 : 0,
  }, { id });
  invalidateReferenceCache('price-presets:');
  return result;
}

export async function deletePricePreset(authToken: string, id: string) {
  const result = await call<{ success: boolean }>('deletePricePreset', 'DELETE', { auth_token: authToken }, { id });
  invalidateReferenceCache('price-presets:');
  return result;
}

// Company settings

export async function getCompanySettings(authToken: string) {
  return call<CompanySettings>('getCompanySettings', 'GET', undefined, {
    authToken,
    cacheBust: String(Date.now()),
  });
}

export async function saveCompanySettings(authToken: string, settings: CompanySettings) {
  return call<CompanySettings>('saveCompanySettings', 'POST', {
    ...settings,
    auth_token: authToken,
  });
}

// Service sheets

export type ServiceSheetsQuery = {
  search?: string;
  filterColumn?: 'sheet_number' | 'client' | 'phone' | 'created_at' | 'updated_at' | 'total_price';
  clientId?: string;
  dateFrom?: string;
  dateTo?: string;
  paymentStatus?: PaymentStatus;
  sortBy?: 'sheet_number' | 'client' | 'phone' | 'created_at' | 'updated_at' | 'total_price';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
};

function serviceSheetBody(authToken: string, form: ServiceSheetFormData) {
  const totalPrice = parseFloat(form.total_price) || 0;
  const diagnosticPrice = parseFloat(form.diagnostic_price) || 0;
  const storedTotalPrice = totalPrice > 0 ? totalPrice : diagnosticPrice;
  const advanceAmount = Math.max(parseFloat(form.advance_amount) || 0, 0);
  const discount = Math.min(100, Math.max(parseFloat(form.client_discount) || 0, 0));
  const servicePayment = calculateClientPayment(
    normalizeServiceSheetWorkPrice(storedTotalPrice, diagnosticPrice),
    diagnosticPrice,
    discount,
    advanceAmount
  );
  return {
    ...form,
    auth_token: authToken,
    client_email: form.client_email.trim() || null,
    client_address: form.client_address.trim() || null,
    issue_description: form.issue_description.trim() || null,
    visible_damage: form.visible_damage.trim() || null,
    diagnostic: form.diagnostic.trim() || null,
    work_performed: form.work_performed.trim() || null,
    parts_used: form.parts_used.trim() || null,
    observations: form.observations.trim() || null,
    diagnostic_price: diagnosticPrice,
    parts_price: parseFloat(form.parts_price) || 0,
    labor_price: parseFloat(form.labor_price) || 0,
    internal_parts_cost: nullableMoneyInput(form.internal_parts_cost),
    internal_labor_cost: nullableMoneyInput(form.internal_labor_cost),
    internal_other_costs: (form.expense_costs || []).reduce(
      (sum, item) => sum + Math.max(parseFloat(item.cost) || 0, 0),
      0
    ),
    expense_costs: form.expense_costs || [],
    total_price: storedTotalPrice,
    advance_amount: advanceAmount,
    currency_code: form.currency_code || 'RON',
    payment_status: resolvedPaymentStatus(form.payment_status, servicePayment.total, servicePayment.amountDue),
    client_discount: discount,
    deadline_unit: form.deadline_unit || 'zile',
    storage_fee_per_day: parseFloat(form.storage_fee_per_day) || 0,
    storage_after_days: parseInt(form.storage_after_days, 10) || 0,
    accessories_charger: form.accessories_charger ? 1 : 0,
    accessories_keys: form.accessories_keys ? 1 : 0,
    accessories_saddle: form.accessories_saddle ? 1 : 0,
    accessories_other: form.accessories_other ? 1 : 0,
    quick_powers_on: form.quick_powers_on ? 1 : 0,
    quick_water_traces: form.quick_water_traces ? 1 : 0,
    quick_impact: form.quick_impact ? 1 : 0,
    quick_battery_risk: form.quick_battery_risk ? 1 : 0,
    old_parts_client: form.old_parts_client ? 1 : 0,
    old_parts_recycle: form.old_parts_recycle ? 1 : 0,
    approve_diagnostic_test: form.approve_diagnostic_test ? 1 : 0,
    approve_repair_estimate: form.approve_repair_estimate ? 1 : 0,
    reject_repair: form.reject_repair ? 1 : 0,
    vehicle_delivered_checked: form.vehicle_delivered_checked ? 1 : 0,
  };
}

export async function getServiceSheets(authToken: string, query: ServiceSheetsQuery = {}) {
  const params: Record<string, string> = { authToken, cacheBust: String(Date.now()) };
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') params[key] = String(value);
  });
  return call<ServiceSheet[]>('getServiceSheets', 'GET', undefined, params);
}

export async function getServiceSheetsPage(
  authToken: string,
  query: ServiceSheetsQuery = {},
  preferLegacyCache = false
): Promise<PagedResult<ServiceSheet>> {
  const pageCacheKey = tablePageKey(authToken, 'service', query as Record<string, unknown>);
  const cachedPage = preferLegacyCache ? readTablePage(serviceTablePageCache, pageCacheKey) : undefined;
  if (cachedPage) return cachedPage;
  const generation = tableCacheGeneration;
  const legacyKey = legacyServiceTableKey(authToken, query);
  const cachedLegacy = preferLegacyCache ? legacyServiceTableCache.get(legacyKey) : undefined;
  const params: Record<string, string> = {
    authToken,
    table: '1',
    prefetchPages: String(pagedPrefetchCount(query.pageSize || 10)),
    cacheBust: String(Date.now()),
  };
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') params[key] = String(value);
  });
  let pageRequest = serviceTablePageRequests.get(pageCacheKey);
  if (!cachedLegacy && !pageRequest) {
    pageRequest = call<PagedResult<ServiceSheet> | ServiceSheet[]>('getServiceSheets', 'GET', undefined, params);
    serviceTablePageRequests.set(pageCacheKey, pageRequest);
    void pageRequest.finally(() => {
      if (serviceTablePageRequests.get(pageCacheKey) === pageRequest) serviceTablePageRequests.delete(pageCacheKey);
    }).catch(() => {});
  }
  const result = cachedLegacy ?? await pageRequest!;
  if (!Array.isArray(result)) {
    if (generation === tableCacheGeneration) {
      rememberTableWindow(serviceTablePageCache, authToken, 'service', query as Record<string, unknown>, result);
    }
    return result;
  }
  const compactRows = cachedLegacy ?? rememberLegacyTable(
    legacyServiceTableCache,
    legacyKey,
    result.map((sheet) => ({
      ...sheet,
      client_signature: null,
      expense_costs: [],
    }))
  );
  const page = Math.max(query.page || 1, 1);
  const pageSize = Math.max(query.pageSize || 40, 1);
  const start = (page - 1) * pageSize;
  const items = compactRows.slice(start, start + pageSize);
  const pagedResult = { items, total: compactRows.length, page, page_size: pageSize, has_more: start + items.length < compactRows.length };
  if (generation === tableCacheGeneration) {
    rememberTableWindow(serviceTablePageCache, authToken, 'service', query as Record<string, unknown>, pagedResult);
  }
  return pagedResult;
}

export async function getServiceSheetById(id: string, authToken: string, financialEntry = false) {
  return call<ServiceSheet>('getServiceSheetById', 'GET', undefined, {
    id,
    authToken,
    financialEntry: financialEntry ? '1' : '0',
    cacheBust: String(Date.now()),
  });
}

export async function getOrCreateServiceSheetForClient(
  clientId: string,
  authToken: string,
  forceNew = false,
  showCompanyDetails = false,
  financialEntry = false
) {
  return call<ServiceSheet>('getOrCreateServiceSheetForClient', 'POST', {
    auth_token: authToken,
    client_id: clientId,
    force_new: forceNew ? 1 : 0,
    show_company_details: showCompanyDetails ? 1 : 0,
    financial_entry: financialEntry ? 1 : 0,
  });
}

export async function createServiceSheet(authToken: string, form: ServiceSheetFormData) {
  return call<ServiceSheet>('createServiceSheet', 'POST', serviceSheetBody(authToken, form));
}

export async function updateServiceSheet(authToken: string, id: string, form: ServiceSheetFormData, financialEntry = false) {
  return call<ServiceSheet>('updateServiceSheet', 'PUT', {
    ...serviceSheetBody(authToken, form),
    financial_entry: financialEntry ? 1 : 0,
  }, { id });
}

export async function updateServiceSheetCompanyDetails(
  authToken: string,
  id: string,
  showCompanyDetails: boolean
) {
  return call<ServiceSheet>('updateServiceSheetCompanyDetails', 'PUT', {
    auth_token: authToken,
    show_company_details: showCompanyDetails ? 1 : 0,
  }, { id });
}

export async function deleteServiceSheet(authToken: string, id: string) {
  return call<{ success: boolean }>('deleteServiceSheet', 'DELETE', { auth_token: authToken }, { id });
}

export async function getServiceSheetPdfUrl(id: string, authToken: string) {
  const config = await getRuntimeApiConfig();
  const url = new URL(`${normalizeApiUrl(config.apiUrl)}/api.php`);
  url.searchParams.set('action', 'downloadServiceSheetPdf');
  url.searchParams.set('id', id);
  url.searchParams.set('authToken', authToken);
  url.searchParams.set('api_key', config.apiKey);
  url.searchParams.set('_', `${Date.now()}`);
  return url.toString();
}

export async function createServiceSheetPdfShareLink(authToken: string, id: string) {
  return call<{ success: boolean; share_url: string; filename: string; bytes: number }>(
    'createServiceSheetPdfShareLink',
    'POST',
    { auth_token: authToken },
    { id }
  );
}

// Chat

export async function getMobileChatContacts(authToken: string) {
  return call<ChatContact[]>('getChatContacts', 'GET', undefined, {
    actor: 'mobile',
    authToken,
  });
}

export async function getMobileChatMessages(authToken: string) {
  return call<ChatMessagesResponse>('getChatMessages', 'GET', undefined, {
    actor: 'mobile',
    authToken,
  });
}

export async function sendMobileChatMessage(authToken: string, body: string) {
  return call<ChatMessage>('sendChatMessage', 'POST', {
    actor: 'mobile',
    auth_token: authToken,
    body,
  });
}

export async function markMobileChatRead(authToken: string) {
  return call<{ success: boolean }>('markChatRead', 'PATCH', {
    actor: 'mobile',
    auth_token: authToken,
  });
}

export async function getMobileChatUnread(authToken: string) {
  return call<ChatUnreadResponse>('getChatUnread', 'GET', undefined, {
    actor: 'mobile',
    authToken,
  });
}

export async function leaveMobileChat(authToken: string) {
  return call<{ success: boolean; conversation: ChatConversation }>('leaveChat', 'POST', {
    auth_token: authToken,
  });
}

export async function getAgentChatContacts(authToken: string) {
  return call<ChatContact[]>('getChatContacts', 'GET', undefined, {
    actor: 'agent',
    authToken,
  });
}

export async function getAgentChatMessages(authToken: string, conversationId: string) {
  return call<ChatMessagesResponse>('getChatMessages', 'GET', undefined, {
    actor: 'agent',
    authToken,
    conversationId,
  });
}

export async function acceptAgentChat(authToken: string, conversationId: string) {
  return call<ChatConversation>('acceptChat', 'POST', {
    auth_token: authToken,
    conversation_id: conversationId,
  });
}

export async function sendAgentChatMessage(authToken: string, conversationId: string, body: string) {
  return call<ChatMessage>('sendChatMessage', 'POST', {
    actor: 'agent',
    auth_token: authToken,
    conversation_id: conversationId,
    body,
  });
}

export async function markAgentChatRead(authToken: string, conversationId: string) {
  return call<{ success: boolean }>('markChatRead', 'PATCH', {
    actor: 'agent',
    auth_token: authToken,
    conversation_id: conversationId,
  });
}

export async function deleteAgentChatConversation(authToken: string, conversationId: string) {
  return call<{ success: boolean }>('deleteChatConversation', 'DELETE', {
    auth_token: authToken,
    conversation_id: conversationId,
  });
}

export async function closeAgentChatConversation(authToken: string, conversationId: string) {
  return call<{ success: boolean; conversation: ChatConversation }>('closeChatConversation', 'POST', {
    auth_token: authToken,
    conversation_id: conversationId,
  });
}

export async function getAgentChatUnread(authToken: string) {
  return call<ChatUnreadResponse>('getChatUnread', 'GET', undefined, {
    actor: 'agent',
    authToken,
  });
}

export async function registerPushToken(authToken: string, pushToken: string, platform: string) {
  return call<{ success: boolean }>('registerPushToken', 'POST', {
    auth_token: authToken,
    push_token: pushToken,
    platform,
  });
}

export async function unregisterPushToken(authToken: string, pushToken: string) {
  return call<{ success: boolean }>('unregisterPushToken', 'DELETE', {
    auth_token: authToken,
    push_token: pushToken,
  });
}

export async function getWhatsAppPredefinedMessages(authToken: string) {
  return call<WhatsAppPredefinedMessage[]>('getWhatsAppPredefinedMessages', 'GET', undefined, { authToken });
}

export async function createWhatsAppPredefinedMessage(authToken: string, title: string, body: string) {
  return call<WhatsAppPredefinedMessage>('createWhatsAppPredefinedMessage', 'POST', {
    auth_token: authToken,
    title,
    body,
  });
}

export async function updateWhatsAppPredefinedMessage(authToken: string, id: string, title: string, body: string) {
  return call<{ success: boolean }>('updateWhatsAppPredefinedMessage', 'PUT', {
    auth_token: authToken,
    id,
    title,
    body,
  }, { id });
}

export async function deleteWhatsAppPredefinedMessage(authToken: string, id: string) {
  return call<{ success: boolean }>('deleteWhatsAppPredefinedMessage', 'DELETE', {
    auth_token: authToken,
    id,
  }, { id });
}

// ─── App Users ───────────────────────────────────────────────────────────────

export interface AppUserPayload {
  username: string;
  display_name: string;
  password?: string;
  role: UserRole;
  platform_access: PlatformAccess;
  support_chat_access: boolean;
  client_panel_access: boolean;
  client_edit_access: boolean;
  service_sheet_access: boolean;
  client_financial_access: boolean;
  is_active: boolean;
}

function appUserBody(authToken: string, payload: AppUserPayload) {
  return {
    ...payload,
    auth_token: authToken,
    support_chat_access: payload.support_chat_access ? 1 : 0,
    client_panel_access: payload.client_panel_access ? 1 : 0,
    client_edit_access: payload.client_edit_access ? 1 : 0,
    service_sheet_access: payload.service_sheet_access ? 1 : 0,
    client_financial_access: payload.client_financial_access ? 1 : 0,
    is_active: payload.is_active ? 1 : 0,
  };
}

export async function getAppUsers(authToken: string): Promise<AppUser[]> {
  return call<AppUser[]>('getUsers', 'GET', undefined, {
    authToken,
    cacheBust: String(Date.now()),
  });
}

export async function createAppUser(authToken: string, payload: AppUserPayload): Promise<AppUser> {
  return call<AppUser>('createUser', 'POST', appUserBody(authToken, payload));
}

export async function updateAppUser(
  authToken: string,
  id: string,
  payload: AppUserPayload
): Promise<AppUser> {
  return call<AppUser>('updateUser', 'PUT', appUserBody(authToken, payload), { id });
}

export async function deleteAppUser(authToken: string, id: string): Promise<void> {
  await call<{ success: boolean }>('deleteUser', 'DELETE', { auth_token: authToken, id }, { id });
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function collaboratorStatsFromClients(
  clients: Client[],
  period: 'today' | 'week' | 'month' | 'year' | 'all'
): StatsData['collaboratorStats'] {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === 'week') start.setDate(start.getDate() - 6);
  if (period === 'month') start.setDate(1);
  if (period === 'year') { start.setMonth(0, 1); }
  const hasStart = period !== 'all';
  const rows = new Map<string, any>();

  clients.forEach((client) => {
    if (client.status !== 'cod_folosit') return;
    const usedAt = client.qr_used_at ? new Date(client.qr_used_at) : null;
    if (hasStart && (!usedAt || Number.isNaN(usedAt.getTime()) || usedAt < start)) return;
    (client.collaborator_costs || []).forEach((cost) => {
      const paid = normalizePaymentStatusValue(cost.payment_status, 'de_incasat') === 'incasati';
      const amount = Math.max(Number(cost.cost || 0), 0);
      if (amount <= 0) return;
      const key = String(cost.collaborator_id || cost.collaborator_name || cost.id);
      const current = rows.get(key) || {
        collaborator: {
          id: key,
          name: cost.collaborator_name || 'Colaborator',
          role: cost.collaborator_role || '',
          percentage: Number(cost.percentage || 0),
          color: cost.collaborator_color || '#14B8A6',
          created_at: cost.created_at || '',
        },
        clientIds: new Set<string>(),
        paidClientIds: new Set<string>(),
        onHoldClientIds: new Set<string>(),
        totalCost: 0,
        paidCost: 0,
        onHoldCost: 0,
        dailyMap: new Map<string, any>(),
      };
      current.clientIds.add(client.id);
      (paid ? current.paidClientIds : current.onHoldClientIds).add(client.id);
      current.totalCost += amount;
      if (paid) current.paidCost += amount;
      else current.onHoldCost += amount;
      const day = usedAt && !Number.isNaN(usedAt.getTime())
        ? usedAt.toISOString().slice(0, 10)
        : '';
      if (day) {
        const daily = current.dailyMap.get(day) || {
          date: day, clientIds: new Set<string>(), totalCost: 0, paidCost: 0, onHoldCost: 0,
        };
        daily.clientIds.add(client.id);
        daily.totalCost += amount;
        if (paid) daily.paidCost += amount;
        else daily.onHoldCost += amount;
        current.dailyMap.set(day, daily);
      }
      rows.set(key, current);
    });
  });

  return [...rows.values()].map((row) => ({
    collaborator: row.collaborator,
    clientCount: row.clientIds.size,
    paidClientCount: row.paidClientIds.size,
    onHoldClientCount: row.onHoldClientIds.size,
    totalCost: row.totalCost,
    paidCost: row.paidCost,
    onHoldCost: row.onHoldCost,
    daily: [...row.dailyMap.values()]
      .map((day: any) => ({
        date: day.date,
        clientCount: day.clientIds.size,
        totalCost: day.totalCost,
        paidCost: day.paidCost,
        onHoldCost: day.onHoldCost,
      }))
      .sort((left: any, right: any) => right.date.localeCompare(left.date)),
  })).sort((left, right) => right.onHoldCost - left.onHoldCost || right.totalCost - left.totalCost);
}
export async function getStats(
  authToken: string,
  period: 'today' | 'week' | 'month' | 'year' | 'all' = 'all'
) {
  const data = await call<StatsData>('getStats', 'GET', undefined, { period, authToken });
  const collaboratorStats = data.collaboratorStats || [];
  const hasPaymentBreakdown = collaboratorStats.every((item) =>
    item.paidCost !== undefined && item.onHoldCost !== undefined
  );
  if (hasPaymentBreakdown) return { ...data, collaboratorStats };
  try {
    const clients = await getClients(undefined, undefined, authToken);
    return { ...data, collaboratorStats: collaboratorStatsFromClients(clients, period) };
  } catch {
    return {
      ...data,
      collaboratorStats: collaboratorStats.map((item) => ({
        ...item,
        paidCost: item.totalCost,
        onHoldCost: 0,
        paidClientCount: item.clientCount,
        onHoldClientCount: 0,
        daily: (item.daily || []).map((day) => ({ ...day, paidCost: day.totalCost, onHoldCost: 0 })),
      })),
    };
  }
}
