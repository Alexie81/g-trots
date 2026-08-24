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

const SHOP_API_BASE = (process.env.EXPO_PUBLIC_SHOP_API_URL || 'https://g-trots.ro/shop-api').replace(/\/$/, '');
const SHOP_API_KEY = process.env.EXPO_PUBLIC_SHOP_API_KEY || process.env.EXPO_PUBLIC_API_KEY || 'GTROTS_X9K3M7_2026_SECURE';

async function shopCall<T>(action: string, token: string, init?: RequestInit, id?: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const url = `${SHOP_API_BASE}/api.php?action=${encodeURIComponent(action)}${id ? `&id=${encodeURIComponent(id)}` : ''}`;

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': SHOP_API_KEY,
        'X-Auth-Token': token,
        ...(init?.headers || {}),
      },
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || `Eroare SHOP (${response.status})`);
    return result as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Serverul SHOP nu a raspuns la timp.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const shopApi = {
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
};
