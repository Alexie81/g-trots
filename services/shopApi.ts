export type ShopCategory = {
  id: string;
  parent_id: string | null;
  parent_name: string | null;
  name: string;
  slug: string;
  description: string | null;
  thumbnail_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ShopBrand = {
  id: string;
  name: string;
  slug: string;
  website_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ShopManufacturer = ShopBrand;

export type ShopCategoryPayload = {
  parent_id: string | null;
  name: string;
  description: string;
  is_active: boolean;
  thumbnail_base64?: string;
  thumbnail_remove?: boolean;
};

export type ShopBrandPayload = {
  name: string;
  website_url: string;
  is_active: boolean;
};

export type ShopManufacturerPayload = ShopBrandPayload;

export type ShopProductSource = {
  id: string;
  name: string;
  domain: string;
  base_url: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  product_count: number;
  created_at?: string;
  updated_at?: string;
};

export type ShopSupplier = {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  cui: string | null;
  registration_number: string | null;
  vat_number?: string | null;
  is_vat_payer?: boolean;
  default_vat_rate?: string | null;
  address: string | null;
  address_line2?: string | null;
  city?: string | null;
  county?: string | null;
  postal_code?: string | null;
  country?: string;
  default_currency?: string;
  payment_terms?: string | null;
  notes: string | null;
  is_active: boolean;
  row_version?: number;
  created_at?: string;
  updated_at?: string;
};

export type ShopSupplierPayload = Omit<ShopSupplier, 'id' | 'created_at' | 'updated_at'>;

export type ShopWarehouse = {
  id: string;
  code: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
};

export type ShopSupplierProductReference = {
  id: string;
  supplier_id: string;
  supplier_name?: string;
  supplier_cui?: string | null;
  product_id: string;
  product_name?: string;
  product_sku?: string | null;
  product_image_url?: string | null;
  supplier_product_code_original: string;
  supplier_product_code_normalized: string;
  supplier_product_name: string | null;
  supplier_ean: string | null;
  purchase_unit: string;
  stock_unit: string;
  conversion_factor: string;
  is_primary_for_supplier: boolean;
  is_active: boolean;
  last_used_at: string | null;
  last_confirmed_purchase_price: string | null;
  last_confirmed_currency: string | null;
  last_confirmed_price_ron: string | null;
  last_confirmed_at: string | null;
  row_version: number;
  match_type?: 'supplier_code' | 'ean' | 'name_exact';
  association_source?: 'confirmed_nir' | 'reference';
  purchase_count?: number;
  aliases?: Array<{
    type: 'code' | 'name' | 'ean';
    value: string;
    source: 'reference' | 'confirmed_nir';
  }>;
};

export type ShopNirLine = {
  id?: string;
  line_number?: number;
  product_id: string | null;
  product_name?: string | null;
  product_image_url?: string | null;
  supplier_product_reference_id: string | null;
  supplier_product_code: string;
  supplier_product_name: string;
  supplier_ean: string;
  purchase_unit: string;
  stock_unit: string;
  invoiced_quantity: string;
  received_quantity: string;
  accepted_quantity: string;
  rejected_quantity: string;
  conversion_factor: string;
  stock_quantity?: string;
  unit_price: string;
  discount_percent: string;
  vat_rate: string;
  allocated_cost_ron?: string;
  line_net?: string;
  line_vat?: string;
  line_total?: string;
  line_net_ron?: string;
  line_vat_ron?: string;
  line_total_ron?: string;
  inventory_unit_cost_ron?: string;
  inventory_cost_total_ron?: string;
  resolution_status?: 'unmatched' | 'matching_code' | 'matching_name' | 'matched_code' | 'matched_name' | 'matched_manual' | 'reversal';
  match_method?: string;
  match_confidence?: string;
  is_stock_item?: boolean;
  difference_reason?: 'shortage' | 'surplus' | 'damaged' | 'wrong_product' | 'price_difference' | 'vat_difference' | 'rejected' | 'other' | null;
  difference_notes?: string | null;
  mismatch_reason?: string | null;
  price_comparison?: {
    current_unit_net_price_ron: string;
    last_supplier: null | { unit_price: string; currency: string; unit_net_price_ron: string; reception_date: string; nir_number: string };
    last_any_supplier: null | { unit_price: string; currency: string; unit_net_price_ron: string; reception_date: string; nir_number: string };
    recent_minimum_unit_net_price_ron: string | null;
    variance_percent: string | null;
    warning_threshold_percent: string;
    is_significant: boolean;
  };
  row_version?: number;
};

export type ShopNirAttachment = {
  id: string;
  original_name: string;
  mime_type: string;
  extension: string;
  file_size: number;
  sha256: string;
  extraction_status: string;
  extraction_message: string | null;
  created_at: string;
};

export type ShopNirDocument = {
  id: string;
  temporary_number: string;
  nir_number: string | null;
  status: 'draft' | 'confirmed' | 'reversed';
  supplier_id: string | null;
  supplier_name?: string | null;
  supplier_cui?: string | null;
  warehouse_id: string;
  warehouse_name?: string;
  supplier_invoice_series: string | null;
  supplier_invoice_number: string | null;
  supplier_invoice_date: string | null;
  nir_date: string;
  nir_time: string | null;
  reception_date: string;
  reception_time: string | null;
  currency: string;
  exchange_rate: string;
  exchange_rate_date: string | null;
  notes: string | null;
  source_type: string;
  subtotal?: string;
  vat_total?: string;
  grand_total?: string;
  subtotal_ron?: string;
  vat_total_ron?: string;
  grand_total_ron?: string;
  inventory_cost_total_ron?: string;
  line_count?: number;
  row_version: number;
  confirmed_at: string | null;
  confirmed_by: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  lines?: ShopNirLine[];
  attachments?: ShopNirAttachment[];
  permissions?: string[];
};

export type ShopNirPayload = Partial<Omit<ShopNirDocument, 'id' | 'temporary_number' | 'nir_number' | 'status' | 'row_version' | 'lines' | 'attachments'>> & {
  row_version?: number;
  lines?: ShopNirLine[];
};

export type ShopNirPage = {
  items: ShopNirDocument[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  permissions: string[];
};

export type ShopNirValidation = { valid: boolean; errors: string[]; warnings: string[]; duplicate: null | { id: string; nir_number: string }; line_count: number };

export type ShopFifoLayer = {
  id: string;
  product_id: string;
  warehouse_id: string;
  supplier_id: string | null;
  nir_document_id: string | null;
  nir_line_id: string | null;
  source_type: string;
  reception_date: string;
  original_quantity: string;
  remaining_quantity: string;
  unit_cost_ron: string;
  total_cost_ron: string;
  nir_number?: string | null;
  supplier_name?: string | null;
};

export type ShopTaxonomySyncResult = {
  success: boolean;
  categories: number;
  root_categories: number;
  subcategories: number;
  subcategories_with_thumbnail: number;
  subcategories_without_thumbnail: string[];
  manufacturers: number;
  compatibilities: number;
  compatibility_names: string[];
  products_scanned_temporarily: number;
  products_imported: number;
  crm_products_after_sync: number;
};

export type ShopProductImage = {
  id?: string;
  url?: string;
  base64?: string;
  alt_text: string;
  sort_order?: number;
  sprite_index?: number;
  is_legacy?: boolean;
};

export type ShopProductSpecification = {
  group: string;
  label: string;
  value: string;
};

export type ShopProductQuestion = {
  question: string;
  answer: string;
};

export type ShopProductReview = {
  id: string;
  product_id: string;
  product_name: string;
  product_slug: string;
  customer_name: string;
  rating: number;
  message: string;
  admin_reply: string | null;
  replied_by: string | null;
  replied_at: string | null;
  created_at: string;
};

export type ShopProduct = {
  id: string;
  category_id: string | null;
  category_name: string | null;
  manufacturer_id: string | null;
  manufacturer_name: string | null;
  sku: string | null;
  supplier_product_code: string | null;
  supplier_reference?: {
    id: string;
    supplier_product_code_original: string;
    supplier_product_name: string | null;
    supplier_ean: string | null;
    purchase_unit: string;
    stock_unit: string;
    conversion_factor: string;
    is_primary_for_supplier: boolean;
  } | null;
  ean: string | null;
  source_id: string | null;
  source_name: string | null;
  source_domain: string;
  source_url: string | null;
  inventory_search_terms?: string;
  name: string;
  slug: string;
  short_description: string;
  description_title: string;
  description_html?: string;
  meta_title: string;
  meta_description: string;
  cost_price: number;
  price: number;
  supplier_base_price: number | null;
  supplier_price_difference: number | null;
  supplier_price_updated_at: string | null;
  sale_price: number | null;
  promotion_price?: number | null;
  price_before_promotion?: number | null;
  promotion_discount_percent?: number;
  active_promotion?: {
    id: string;
    code: string;
    title: string;
    discount_type: 'percent' | 'fixed';
    discount_value: number;
  } | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number | null;
  discount_percent: number;
  currency: string;
  stock_mode: 'tracked' | 'unlimited';
  stock_quantity: number;
  supplier_stock_quantity: number;
  supplier_stock_status: boolean;
  supplier_stock_updated_at: string | null;
  accounting_stock_quantity: number;
  low_stock_threshold: number;
  stock_available: boolean;
  is_active: boolean;
  is_featured: boolean;
  images: ShopProductImage[];
  specifications: ShopProductSpecification[];
  questions: ShopProductQuestion[];
  review_count: number;
  review_average: number | null;
  view_count: number;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  stripe_synced_at: string | null;
  stripe_sync_error: string | null;
  stripe_sync_status: 'pending' | 'synced' | 'error';
  brand_ids: string[];
  brands: Pick<ShopBrand, 'id' | 'name' | 'slug'>[];
  created_at: string;
  updated_at: string;
};

export type ShopProductPayload = {
  category_id: string | null;
  manufacturer_id: string | null;
  brand_ids: string[];
  sku?: string;
  supplier_product_code: string;
  ean: string;
  source_id: string | null;
  source_domain: string;
  source_url: string;
  name: string;
  slug: string;
  short_description: string;
  description_title: string;
  description_html: string;
  meta_title: string;
  meta_description: string;
  cost_price: number;
  price: number;
  sale_price: number | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number | null;
  discount_percent?: number | null;
  currency: string;
  stock_mode: 'tracked' | 'unlimited';
  stock_quantity: number;
  low_stock_threshold: number;
  is_active: boolean;
  is_featured: boolean;
  images: ShopProductImage[];
  specifications: ShopProductSpecification[];
  questions: ShopProductQuestion[];
};

export type ShopProductSale = {
  id: string;
  order_number: string;
  status: ShopOrder['status'];
  payment_status: ShopOrder['payment_status'];
  customer_name: string;
  created_at: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type ShopProductStats = {
  product: ShopProduct;
  orders_count: number;
  units_sold: number;
  revenue: number;
  acquisition_total: number;
  profit: number;
  orders: ShopProductSale[];
  reviews: ShopProductReview[];
};

export type ShopDashboardStats = {
  revenue: number;
  orders_count: number;
  new_orders_count: number;
  acquisitions: number;
  profit: number;
  products_count: number;
  recent_orders: ShopOrder[];
};

export type ShopOrderItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  discount_total?: number;
  discounted_unit_price?: number;
  discounted_line_total?: number;
  image_url?: string;
};

export type ShopOrderStatusHistory = {
  id: string;
  order_id: string;
  from_status: ShopOrder['status'] | null;
  to_status: ShopOrder['status'];
  changed_by: string | null;
  customer_notified: boolean;
  email_status: 'not_requested' | 'pending' | 'sent' | 'failed';
  email_error: string | null;
  created_at: string;
};

export type ShopOrderEmailNotification = {
  requested?: boolean;
  sent: boolean;
  recipient?: string;
  tracking_url?: string;
  error?: string;
};

export type ShopOrder = {
  id: string;
  order_number: string;
  status: 'new' | 'confirmed' | 'processing' | 'shipped' | 'completed' | 'refunded' | 'cancelled';
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  payment_method: 'card' | 'cash_on_delivery';
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
  customer_type?: 'individual' | 'company';
  company_name?: string | null;
  company_cui?: string | null;
  company_registration_number?: string | null;
  company_address?: string | null;
  address: string;
  city: string;
  county: string | null;
  postal_code: string | null;
  customer_notes: string | null;
  admin_notes: string | null;
  shipping_method_name: string;
  subtotal: number;
  discount_total?: number;
  promotion_code?: string | null;
  promotion_scope?: 'global' | 'product' | null;
  shipping_cost: number;
  total: number;
  vat_payer: boolean;
  vat_rate: number;
  vat_total: number;
  net_total: number;
  currency: string;
  items: ShopOrderItem[];
  status_history?: ShopOrderStatusHistory[];
  email_notification?: ShopOrderEmailNotification;
  created_at: string;
  updated_at: string;
};

export type ShopCustomerSummary = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  orders_count: number;
  orders_total: number;
  last_order_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ShopCustomerDetail = ShopCustomerSummary & {
  orders: ShopOrder[];
};

export type ShopPromotion = {
  id: string;
  code: string;
  title: string;
  description: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  min_order_value: number | null;
  audience: 'all' | 'registered' | 'selected';
  scope: 'global' | 'product';
  product_id: string | null;
  product_ids: string[];
  customer_ids: string[];
  customer_count: number;
  application_count: number;
  total_discount_given: number;
  average_discount: number;
  product_name: string | null;
  product_slug: string | null;
  usage_mode: 'unlimited' | 'once_per_customer' | 'once_per_device';
  auto_apply: boolean;
  show_banner: boolean;
  banner_text: string;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ShopPromotionPayload = Omit<ShopPromotion, 'id' | 'product_name' | 'product_slug' | 'customer_count' | 'application_count' | 'total_discount_given' | 'average_discount' | 'created_at' | 'updated_at'>;

export type ShopPromotionStats = {
  promotion: ShopPromotion;
  summary: {
    all_application_count: number;
    application_count: number;
    total_discount_given: number;
    average_discount: number;
    orders_total: number;
  };
  applications: Array<{
    id: string;
    order_number: string;
    status: string;
    customer_name: string;
    customer_email: string | null;
    subtotal: number;
    discount_total: number;
    total: number;
    created_at: string;
    is_counted: boolean;
  }>;
};

export type ShopPaymentSettings = {
  card_enabled: boolean;
  cash_on_delivery_enabled: boolean;
  card_label: string;
  cash_on_delivery_label: string;
  stripe_configured: boolean;
  stripe_test_mode: boolean;
  stripe_synced_products: number;
  stripe_sync_errors: number;
  updated_at?: string | null;
};

export type ShopCompanySettings = {
  id: number;
  legal_name: string;
  trade_name: string;
  cui: string;
  registration_number: string;
  address: string;
  city: string;
  county: string;
  postal_code: string;
  country: string;
  email: string;
  phone: string;
  website: string;
  bank_name: string;
  iban: string;
  share_capital: string;
  stamp_url: string | null;
  is_default: boolean;
  vat_payer: boolean;
  vat_rate: number;
  stamp_base64?: string;
  remove_stamp?: boolean;
  updated_at?: string | null;
};

export type ShopStripeSyncSummary = {
  synced: number;
  archived: number;
  skipped: number;
  errors: { product_id: string; error: string }[];
};

export type ShopStripeSyncProgress = ShopStripeSyncSummary & {
  processed: number;
  total: number;
  percent: number;
};

type ShopStripeSyncBatch = ShopStripeSyncSummary & {
  total: number;
  batch_processed: number;
  next_cursor: string;
  completed: boolean;
  prepared?: boolean;
  product_ids?: string[];
};

export type ShopShippingMethod = {
  id: string;
  name: string;
  description: string;
  cost: number;
  free_above: number | null;
  eta_label: string;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type ShopInventoryMovement = {
  id: string;
  product_id: string;
  product_name: string;
  order_id: string | null;
  order_number: string | null;
  warehouse_id?: string | null;
  nir_document_id?: string | null;
  nir_line_id?: string | null;
  movement_type: string;
  quantity_delta: number;
  quantity_after: number;
  accounting_quantity_delta?: string | number | null;
  accounting_quantity_after?: string | number | null;
  inventory_unit_cost_ron?: string | number | null;
  inventory_cost_total_ron?: string | number | null;
  reception_date?: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  movement_document_number?: string | null;
  movement_document_source?: string | null;
  movement_document_status?: string | null;
  movement_reversal_of_id?: string | null;
};

export type ShopProductManagerBootstrap = {
  products: ShopProduct[];
  total: number;
  page: number;
  page_size: number;
  categories: ShopCategory[];
  brands: ShopBrand[];
  manufacturers: ShopManufacturer[];
  sources: ShopProductSource[];
};

const SHOP_API_BASE = (process.env.EXPO_PUBLIC_SHOP_API_URL || 'https://g-trots.ro/shop-api').replace(/\/$/, '');
const SHOP_API_KEY = process.env.EXPO_PUBLIC_SHOP_API_KEY || process.env.EXPO_PUBLIC_API_KEY || 'GTROTS_X9K3M7_2026_SECURE';

export function isUnknownShopAction(error: unknown): boolean {
  return error instanceof Error && /actiune\s+shop\s+necunoscuta/i.test(error.message.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
}

export function legacyNirAttachmentUrl(attachment: ShopNirAttachment): string | null {
  const date = String(attachment.created_at || '').match(/^(\d{4})-(\d{2})/);
  const id = String(attachment.id || '').replace(/-/g, '').toLowerCase();
  const extension = String(attachment.extension || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!date || !/^[a-f0-9]{32}$/.test(id) || !extension) return null;
  return `${SHOP_API_BASE}/uploads/nir/${date[1]}/${date[2]}/${id}.${extension}`;
}

async function shopCall<T>(action: string, token: string, init?: RequestInit, id?: string, attempt = 0, query: Record<string, string | number | undefined> = {}): Promise<T> {
  const controller = new AbortController();
  // Stergerea sincronizeaza arhivarea cu Stripe inainte de eliminarea locala.
  // O lasam sa se incheie si pe conexiuni mobile mai lente.
  const timeoutMs = action === 'syncStripeCatalog' ? 90000 : ['syncBoomagTaxonomy', 'syncBoomagStock'].includes(action) ? 240000 : action === 'deleteProduct' ? 65000 : 20000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const isGet = !init?.method || init.method === 'GET';
  const cacheBuster = isGet ? `&_=${Date.now()}` : '';
  const queryString = Object.entries(query)
    .filter(([, value]) => value !== undefined && String(value) !== '')
    .map(([key, value]) => `&${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('');
  const url = `${SHOP_API_BASE}/api-v2.php?action=${encodeURIComponent(action)}${id ? `&id=${encodeURIComponent(id)}` : ''}${queryString}${cacheBuster}`;

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': SHOP_API_KEY,
        'X-Auth-Token': token,
        ...(init?.headers || {}),
      },
    });
    const result = await response.json().catch(() => null);
    const retryable = !init?.method || init.method === 'GET';
    if (retryable && attempt === 0 && [502, 503, 504].includes(response.status)) {
      await new Promise((resolve) => setTimeout(resolve, 450));
      return shopCall<T>(action, token, init, id, attempt + 1, query);
    }
    if (!response.ok) throw new Error(result?.error || `Eroare SHOP (${response.status})`);
    if (result === null || result === undefined) {
      throw new Error('Serverul SHOP a trimis un raspuns incomplet. Reincearca actualizarea.');
    }
    return result as T;
  } catch (error) {
    const retryable = !init?.method || init.method === 'GET';
    if (retryable && attempt === 0 && error instanceof Error && (error.name === 'AbortError' || error.name === 'TypeError')) {
      await new Promise((resolve) => setTimeout(resolve, 450));
      return shopCall<T>(action, token, init, id, attempt + 1, query);
    }
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Serverul SHOP nu a raspuns la timp.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function syncStripeCatalogInBatches(token: string, onProgress?: (progress: ShopStripeSyncProgress) => void): Promise<ShopStripeSyncSummary> {
  const summary: ShopStripeSyncSummary = { synced: 0, archived: 0, skipped: 0, errors: [] };
  const plan = await shopCall<ShopStripeSyncBatch>('syncStripeCatalog', token, {
    method: 'POST',
    body: JSON.stringify({ prepare: true }),
  });
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
        const batch = await shopCall<ShopStripeSyncBatch>('syncStripeCatalog', token, {
          method: 'POST',
          body: JSON.stringify({ product_ids: [productId] }),
        });
        summary.synced += Number(batch.synced || 0);
        summary.archived += Number(batch.archived || 0);
        summary.skipped += Number(batch.skipped || 0);
        summary.errors.push(...(Array.isArray(batch.errors) ? batch.errors : []));
        processed += Number(batch.batch_processed || 1);
        onProgress?.({ ...summary, processed, total: plannedTotal, percent: Math.min(100, Math.round((processed / plannedTotal) * 100)) });
      }
    };
    // Opt workeri mentin Stripe Test sub limita sa normala, dar reduc masiv
    // timpul fata de procesarea secventiala a celor peste 1.600 de produse.
    await Promise.all(Array.from({ length: Math.min(8, productIds.length) }, () => worker()));
    return summary;
  }
  let cursor = '';
  let processed = 0;
  let completed = false;
  while (!completed) {
    const batch = await shopCall<ShopStripeSyncBatch>('syncStripeCatalog', token, {
      method: 'POST',
      body: JSON.stringify({ cursor, batch_size: 1 }),
    });
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

export const shopApi = {
  getDashboardStats: (token: string) => shopCall<ShopDashboardStats>('getDashboardStats', token),
  loadProductManager: (
    token: string,
    options: { page?: number; page_size?: number; q?: string; include_metadata?: boolean } = {},
  ) => shopCall<ShopProductManagerBootstrap>('productManagerBootstrap', token, {
    method: 'POST',
    body: JSON.stringify(options),
  }),
  listCategories: (token: string) => shopCall<ShopCategory[]>('listCategories', token),
  createCategory: (token: string, payload: ShopCategoryPayload) => shopCall<ShopCategory>('createCategory', token, { method: 'POST', body: JSON.stringify(payload) }),
  updateCategory: (token: string, id: string, payload: ShopCategoryPayload) => shopCall<ShopCategory>('updateCategory', token, { method: 'PUT', body: JSON.stringify(payload) }, id),
  deleteCategory: (token: string, id: string) => shopCall<{ success: true }>('deleteCategory', token, { method: 'DELETE' }, id),
  listBrands: (token: string) => shopCall<ShopBrand[]>('listBrands', token),
  createBrand: (token: string, payload: ShopBrandPayload) => shopCall<ShopBrand>('createBrand', token, { method: 'POST', body: JSON.stringify(payload) }),
  updateBrand: (token: string, id: string, payload: ShopBrandPayload) => shopCall<ShopBrand>('updateBrand', token, { method: 'PUT', body: JSON.stringify(payload) }, id),
  deleteBrand: (token: string, id: string) => shopCall<{ success: true }>('deleteBrand', token, { method: 'DELETE' }, id),
  listManufacturers: (token: string) => shopCall<ShopManufacturer[]>('listManufacturers', token),
  createManufacturer: (token: string, payload: ShopManufacturerPayload) => shopCall<ShopManufacturer>('createManufacturer', token, { method: 'POST', body: JSON.stringify(payload) }),
  updateManufacturer: (token: string, id: string, payload: ShopManufacturerPayload) => shopCall<ShopManufacturer>('updateManufacturer', token, { method: 'PUT', body: JSON.stringify(payload) }, id),
  deleteManufacturer: (token: string, id: string) => shopCall<{ success: true }>('deleteManufacturer', token, { method: 'DELETE' }, id),
  listProductSources: (token: string) => shopCall<ShopProductSource[]>('listProductSources', token),
  createProductSource: (token: string, payload: Omit<ShopProductSource, 'id'>) => shopCall<ShopProductSource>('createProductSource', token, { method: 'POST', body: JSON.stringify(payload) }),
  updateProductSource: (token: string, id: string, payload: Omit<ShopProductSource, 'id'>) => shopCall<ShopProductSource>('updateProductSource', token, { method: 'PUT', body: JSON.stringify(payload) }, id),
  deleteProductSource: (token: string, id: string) => shopCall<{ success: true }>('deleteProductSource', token, { method: 'DELETE' }, id),
  listSuppliers: (token: string) => shopCall<ShopSupplier[]>('listSuppliers', token),
  createSupplier: (token: string, payload: ShopSupplierPayload) => shopCall<ShopSupplier>('createSupplier', token, { method: 'POST', body: JSON.stringify(payload) }),
  updateSupplier: (token: string, id: string, payload: ShopSupplierPayload) => shopCall<ShopSupplier>('updateSupplier', token, { method: 'PUT', body: JSON.stringify(payload) }, id),
  deleteSupplier: (token: string, id: string) => shopCall<{ success: true }>('deleteSupplier', token, { method: 'DELETE' }, id),
  searchSuppliers: (token: string, q = '') => shopCall<ShopSupplier[]>('searchSuppliers', token, undefined, undefined, 0, { q, limit: 40 }),
  getSupplier: (token: string, id: string) => shopCall<ShopSupplier & { products: ShopSupplierProductReference[] }>('getSupplier', token, undefined, id),
  checkSupplierCui: (token: string, cui: string) => shopCall<{ exists: boolean; supplier: ShopSupplier | null }>('checkSupplierCui', token, undefined, undefined, 0, { cui }),
  listWarehouses: (token: string) => shopCall<ShopWarehouse[]>('listWarehouses', token),
  getNirPermissions: (token: string) => shopCall<{ permissions: string[] }>('nirPermissions', token),
  getBnrExchangeRate: (token: string, currency: string, date = '') => shopCall<{ currency: string; rate: string; date: string; requested_date: string; source: 'BNR' }>('getBnrExchangeRate', token, undefined, undefined, 0, { currency, date }),
  listNirs: (token: string, filters: { page?: number; page_size?: number; search?: string; status?: string; supplier_id?: string; from?: string; to?: string } = {}) => shopCall<ShopNirPage>('listNirs', token, undefined, undefined, 0, filters),
  getNir: (token: string, id: string) => shopCall<ShopNirDocument>('getNir', token, undefined, id),
  createNir: (token: string, payload: ShopNirPayload) => shopCall<ShopNirDocument>('createNir', token, { method: 'POST', body: JSON.stringify(payload) }),
  updateNir: (token: string, id: string, payload: ShopNirPayload) => shopCall<ShopNirDocument>('updateNir', token, { method: 'PUT', body: JSON.stringify(payload) }, id),
  deleteNir: (token: string, id: string) => shopCall<{ success: true; deleted: number; deleted_ids: string[] }>('deleteNirDrafts', token, { method: 'DELETE' }, id),
  autosaveNir: (token: string, id: string, payload: ShopNirPayload) => shopCall<ShopNirDocument>('autosaveNir', token, { method: 'POST', body: JSON.stringify(payload) }, id),
  validateNir: (token: string, id: string) => shopCall<ShopNirValidation>('validateNir', token, { method: 'POST', body: '{}' }, id),
  confirmNir: (token: string, id: string, rowVersion: number, idempotencyKey: string) => shopCall<ShopNirDocument>('confirmNir', token, { method: 'POST', body: JSON.stringify({ row_version: rowVersion, idempotency_key: idempotencyKey }), headers: { 'Idempotency-Key': idempotencyKey } }, id),
  reopenNir: (token: string, id: string, rowVersion: number) => shopCall<ShopNirDocument>('reopenNir', token, { method: 'POST', body: JSON.stringify({ row_version: rowVersion }) }, id),
  reverseNir: (token: string, id: string, rowVersion: number, reason: string) => shopCall<{ original: ShopNirDocument; reversal: ShopNirDocument }>('reverseNir', token, { method: 'POST', body: JSON.stringify({ row_version: rowVersion, reason }) }, id),
  uploadNirAttachment: (token: string, id: string, payload: { file_name: string; mime_type: string; content_base64: string }) => shopCall<ShopNirAttachment>('uploadNirAttachment', token, { method: 'POST', body: JSON.stringify(payload) }, id),
  extractNirAttachment: (token: string, id: string, attachmentId: string) => shopCall<{ status: string; message: string; lines: ShopNirLine[] }>('extractNirAttachment', token, { method: 'POST', body: JSON.stringify({ attachment_id: attachmentId }) }, id),
  downloadNirAttachment: (token: string, id: string, attachmentId: string) => shopCall<{ file_name: string; mime_type: string; content_base64: string }>('downloadNirAttachment', token, undefined, id, 0, { attachment_id: attachmentId }),
  downloadAllNirAttachments: (token: string, id: string) => shopCall<{ file_name: string; mime_type: string; content_base64: string }>('downloadAllNirAttachments', token, undefined, id),
  getNirMovements: (token: string, id: string) => shopCall<ShopInventoryMovement[]>('getNirMovements', token, undefined, id),
  getNirFifoLayers: (token: string, id: string) => shopCall<ShopFifoLayer[]>('getNirFifoLayers', token, undefined, id),
  exportNir: (token: string, id: string, format: 'pdf' | 'xlsx') => shopCall<{ file_name: string; mime_type: string; content_base64: string }>('exportNir', token, undefined, id, 0, { format }),
  resolveSupplierProductReference: (token: string, supplierId: string, code: string, ean = '', name = '') => shopCall<{ matched: boolean; reference: ShopSupplierProductReference | null; normalized_code: string; match_method?: string; reason?: string }>('resolveSupplierProductReference', token, undefined, undefined, 0, { supplier_id: supplierId, code, ean, name }),
  createSupplierProductReference: (token: string, payload: Partial<ShopSupplierProductReference> & { supplier_id: string; product_id: string; supplier_product_code?: string; supplier_product_name?: string | null }) => shopCall<ShopSupplierProductReference>('createSupplierProductReference', token, { method: 'POST', body: JSON.stringify(payload) }),
  updateSupplierProductReference: (token: string, id: string, payload: Partial<ShopSupplierProductReference>) => shopCall<ShopSupplierProductReference>('updateSupplierProductReference', token, { method: 'PATCH', body: JSON.stringify(payload) }, id),
  listProductSupplierReferences: (token: string, productId: string) => shopCall<ShopSupplierProductReference[]>('listProductSupplierReferences', token, undefined, productId),
  listSupplierProducts: (token: string, supplierId: string) => shopCall<ShopSupplierProductReference[]>('listSupplierProducts', token, undefined, supplierId),
  getProductPurchaseHistory: (token: string, productId: string) => shopCall<{ items: Record<string, string>[]; statistics: Record<string, string | number | null> }>('getProductPurchaseHistory', token, undefined, productId),
  getProductFifoLayers: (token: string, productId: string, warehouseId?: string) => shopCall<ShopFifoLayer[]>('getProductFifoLayers', token, undefined, productId, 0, { warehouse_id: warehouseId }),
  previewProductFifo: (token: string, productId: string, quantity: string, warehouseId?: string) => shopCall<{ requested_quantity: string; allocated_quantity: string; shortage_quantity: string; available: boolean; total_cost_ron: string; allocations: Record<string, string>[] }>('previewProductFifo', token, { method: 'POST', body: JSON.stringify({ quantity, warehouse_id: warehouseId }) }, productId),
  getFifoReconciliation: (token: string) => shopCall<{ items: { product_id: string; product_name: string; accounting_stock_quantity: string; fifo_quantity: string; missing_fifo_quantity: string }[] }>('getFifoReconciliation', token),
  createFifoOpeningBalance: (token: string, payload: { product_id: string; warehouse_id?: string; quantity: string; unit_cost_ron: string; reception_date: string; note: string }) => shopCall<Record<string, string>>('createFifoOpeningBalance', token, { method: 'POST', body: JSON.stringify(payload) }),
  syncBoomagTaxonomy: (token: string) => shopCall<ShopTaxonomySyncResult>('syncBoomagTaxonomy', token, { method: 'POST', body: '{}' }),
  syncBoomagStock: (token: string) => shopCall<{ success: true; feed_products: number; matched_products: number; prices_synced: number; prices_changed: number; stocks_changed: number; synced_at: string }>('syncBoomagStock', token, { method: 'POST', body: '{}' }),
  listProducts: (token: string) => shopCall<ShopProduct[]>('listProducts', token),
  listProductOptions: (token: string, options: { q?: string; ids?: string[]; supplier_id?: string; limit?: number } = {}) => shopCall<ShopProduct[]>('listProductOptions', token, { method: 'POST', body: JSON.stringify(options) }),
  listProductOptionIds: (token: string) => shopCall<string[]>('listProductOptionIds', token, { method: 'POST', body: '{}' }),
  getProduct: (token: string, id: string) => shopCall<ShopProduct>('getProduct', token, undefined, id),
  getProductStats: (token: string, id: string) => shopCall<ShopProductStats>('getProductStats', token, undefined, id),
  createProduct: (token: string, payload: ShopProductPayload) => shopCall<ShopProduct>('createProduct', token, { method: 'POST', body: JSON.stringify(payload) }),
  updateProduct: (token: string, id: string, payload: ShopProductPayload) => shopCall<ShopProduct>('updateProduct', token, { method: 'PUT', body: JSON.stringify(payload) }, id),
  uploadRichDescriptionImage: (token: string, base64: string) => shopCall<{ url: string; path: string }>('uploadRichDescriptionImage', token, { method: 'POST', body: JSON.stringify({ base64 }) }),
  deleteProduct: (token: string, id: string) => shopCall<{ success: true; deleted_id: string; deleted_files: number; remaining_products: number }>('deleteProduct', token, { method: 'DELETE' }, id),
  listProductReviews: (token: string, productId?: string) => shopCall<ShopProductReview[]>('listProductReviews', token, undefined, productId),
  replyProductReview: (token: string, id: string, adminReply: string) => shopCall<ShopProductReview>('replyProductReview', token, { method: 'PATCH', body: JSON.stringify({ admin_reply: adminReply }) }, id),
  deleteProductReview: (token: string, id: string) => shopCall<{ success: true }>('deleteProductReview', token, { method: 'DELETE' }, id),
  listInventory: (token: string) => shopCall<ShopProduct[]>('listInventory', token),
  listInventoryMovements: (token: string, productId?: string) => shopCall<ShopInventoryMovement[]>('listInventoryMovements', token, undefined, productId),
  adjustStock: (token: string, id: string, quantity: number, note: string) => shopCall<ShopProduct>('adjustStock', token, { method: 'POST', body: JSON.stringify({ quantity, note }) }, id),
  listOrders: (token: string) => shopCall<ShopOrder[]>('listOrders', token),
  getOrder: (token: string, id: string) => shopCall<ShopOrder>('getOrder', token, undefined, id),
  updateOrder: (token: string, id: string, payload: Pick<ShopOrder, 'status' | 'payment_status'> & { admin_notes: string; notify_customer: boolean; address?: string; city?: string; county?: string; postal_code?: string }) => shopCall<ShopOrder>('updateOrder', token, { method: 'PUT', body: JSON.stringify(payload) }, id),
  listCustomers: (token: string) => shopCall<ShopCustomerSummary[]>('listCustomers', token),
  getCustomer: (token: string, id: string) => shopCall<ShopCustomerDetail>('getCustomer', token, undefined, id),
  updateCustomerStatus: (token: string, id: string, isActive: boolean) => shopCall<{ success: true; is_active: boolean }>('updateCustomerStatus', token, { method: 'PATCH', body: JSON.stringify({ is_active: isActive }) }, id),
  listPromotions: (token: string) => shopCall<ShopPromotion[]>('listPromotions', token),
  getPromotionStats: (token: string, id: string) => shopCall<ShopPromotionStats>('getPromotionStats', token, undefined, id),
  createPromotion: (token: string, payload: ShopPromotionPayload) => shopCall<ShopPromotion>('createPromotion', token, { method: 'POST', body: JSON.stringify(payload) }),
  updatePromotion: (token: string, id: string, payload: ShopPromotionPayload) => shopCall<ShopPromotion>('updatePromotion', token, { method: 'PATCH', body: JSON.stringify(payload) }, id),
  deletePromotion: (token: string, id: string) => shopCall<{ success: true }>('deletePromotion', token, { method: 'DELETE' }, id),
  getPaymentSettings: (token: string) => shopCall<ShopPaymentSettings>('getPaymentSettings', token),
  updatePaymentSettings: (token: string, payload: ShopPaymentSettings) => shopCall<ShopPaymentSettings>('updatePaymentSettings', token, { method: 'PUT', body: JSON.stringify(payload) }),
  listCompanySettings: (token: string) => shopCall<ShopCompanySettings[]>('listCompanySettings', token),
  getCompanySettings: (token: string) => shopCall<ShopCompanySettings>('getCompanySettings', token),
  createCompanySettings: (token: string, payload: ShopCompanySettings) => shopCall<ShopCompanySettings>('createCompanySettings', token, { method: 'POST', body: JSON.stringify(payload) }),
  updateCompanySettings: (token: string, id: number, payload: ShopCompanySettings) => shopCall<ShopCompanySettings>('updateCompanySettings', token, { method: 'PUT', body: JSON.stringify(payload) }, String(id)),
  deleteCompanySettings: (token: string, id: number) => shopCall<{ success: true }>('deleteCompanySettings', token, { method: 'DELETE' }, String(id)),
  syncStripeCatalog: (token: string, onProgress?: (progress: ShopStripeSyncProgress) => void) => syncStripeCatalogInBatches(token, onProgress),
  listShippingMethods: (token: string) => shopCall<ShopShippingMethod[]>('listShippingMethods', token),
  createShippingMethod: (token: string, payload: Omit<ShopShippingMethod, 'id'>) => shopCall<ShopShippingMethod>('createShippingMethod', token, { method: 'POST', body: JSON.stringify(payload) }),
  updateShippingMethod: (token: string, id: string, payload: Omit<ShopShippingMethod, 'id'>) => shopCall<ShopShippingMethod>('updateShippingMethod', token, { method: 'PUT', body: JSON.stringify(payload) }, id),
  deleteShippingMethod: (token: string, id: string) => shopCall<{ success: true }>('deleteShippingMethod', token, { method: 'DELETE' }, id),
};
