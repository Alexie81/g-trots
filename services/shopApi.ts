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
  ean: string | null;
  source_id: string | null;
  source_name: string | null;
  source_domain: string;
  source_url: string | null;
  name: string;
  slug: string;
  short_description: string;
  description_title: string;
  description_html?: string;
  meta_title: string;
  meta_description: string;
  cost_price: number;
  price: number;
  sale_price: number | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number | null;
  discount_percent: number;
  currency: string;
  stock_mode: 'tracked' | 'unlimited';
  stock_quantity: number;
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
  address: string;
  city: string;
  county: string | null;
  postal_code: string | null;
  customer_notes: string | null;
  admin_notes: string | null;
  shipping_method_name: string;
  subtotal: number;
  shipping_cost: number;
  total: number;
  currency: string;
  items: ShopOrderItem[];
  status_history?: ShopOrderStatusHistory[];
  email_notification?: ShopOrderEmailNotification;
  created_at: string;
  updated_at: string;
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

export type ShopStripeSyncSummary = {
  synced: number;
  archived: number;
  skipped: number;
  errors: { product_id: string; error: string }[];
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
  movement_type: string;
  quantity_delta: number;
  quantity_after: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type ShopProductManagerBootstrap = {
  products: ShopProduct[];
  categories: ShopCategory[];
  brands: ShopBrand[];
  manufacturers: ShopManufacturer[];
  sources: ShopProductSource[];
};

const SHOP_API_BASE = (process.env.EXPO_PUBLIC_SHOP_API_URL || 'https://g-trots.ro/shop-api').replace(/\/$/, '');
const SHOP_API_KEY = process.env.EXPO_PUBLIC_SHOP_API_KEY || process.env.EXPO_PUBLIC_API_KEY || 'GTROTS_X9K3M7_2026_SECURE';

async function shopCall<T>(action: string, token: string, init?: RequestInit, id?: string, attempt = 0): Promise<T> {
  const controller = new AbortController();
  // Stergerea sincronizeaza arhivarea cu Stripe inainte de eliminarea locala.
  // O lasam sa se incheie si pe conexiuni mobile mai lente.
  const timeoutMs = action === 'syncBoomagTaxonomy' ? 240000 : action === 'deleteProduct' ? 65000 : 20000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const isGet = !init?.method || init.method === 'GET';
  const cacheBuster = isGet ? `&_=${Date.now()}` : '';
  const url = `${SHOP_API_BASE}/api-v2.php?action=${encodeURIComponent(action)}${id ? `&id=${encodeURIComponent(id)}` : ''}${cacheBuster}`;

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
      return shopCall<T>(action, token, init, id, attempt + 1);
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
      return shopCall<T>(action, token, init, id, attempt + 1);
    }
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Serverul SHOP nu a raspuns la timp.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const shopApi = {
  getDashboardStats: (token: string) => shopCall<ShopDashboardStats>('getDashboardStats', token),
  loadProductManager: (token: string) => shopCall<ShopProductManagerBootstrap>('productManagerBootstrap', token),
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
  syncBoomagTaxonomy: (token: string) => shopCall<ShopTaxonomySyncResult>('syncBoomagTaxonomy', token, { method: 'POST', body: '{}' }),
  listProducts: (token: string) => shopCall<ShopProduct[]>('listProducts', token),
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
  getPaymentSettings: (token: string) => shopCall<ShopPaymentSettings>('getPaymentSettings', token),
  updatePaymentSettings: (token: string, payload: ShopPaymentSettings) => shopCall<ShopPaymentSettings>('updatePaymentSettings', token, { method: 'PUT', body: JSON.stringify(payload) }),
  syncStripeCatalog: (token: string) => shopCall<ShopStripeSyncSummary>('syncStripeCatalog', token, { method: 'POST', body: '{}' }),
  listShippingMethods: (token: string) => shopCall<ShopShippingMethod[]>('listShippingMethods', token),
  createShippingMethod: (token: string, payload: Omit<ShopShippingMethod, 'id'>) => shopCall<ShopShippingMethod>('createShippingMethod', token, { method: 'POST', body: JSON.stringify(payload) }),
  updateShippingMethod: (token: string, id: string, payload: Omit<ShopShippingMethod, 'id'>) => shopCall<ShopShippingMethod>('updateShippingMethod', token, { method: 'PUT', body: JSON.stringify(payload) }, id),
  deleteShippingMethod: (token: string, id: string) => shopCall<{ success: true }>('deleteShippingMethod', token, { method: 'DELETE' }, id),
};
