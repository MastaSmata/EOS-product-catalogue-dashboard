const API_ROOT = '/api/v1';
const TOKEN_KEY = 'eos-pcm-access-token';
const API_SORT_FIELDS = new Set([
  'sku', 'name', 'slug', 'category', 'brand', 'cost_price', 'selling_price', 'currency', 'status',
  'track_inventory', 'stock_quantity', 'weight', 'weight_unit', 'created_at', 'updated_at',
  'low_stock_threshold', 'tags',
]);

export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function storage() {
  try { return window.sessionStorage; } catch { return null; }
}

function clearExpiredSession(token) {
  if (!token) return;
  storage()?.removeItem(TOKEN_KEY);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('pcm-session-expired'));
}

function detailMessage(payload, status) {
  if (typeof payload?.detail === 'string') return payload.detail;
  if (Array.isArray(payload?.detail)) {
    return payload.detail.map((item) => `${(item.loc || []).filter((part) => part !== 'body').join('.')}: ${item.msg}`).join(' · ') || `Request failed (${status}).`;
  }
  return payload?.message || `Request failed (${status}).`;
}

async function parseResponse(response) {
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    try { return await response.json(); } catch { return null; }
  }
  try { return await response.text(); } catch { return null; }
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = storage()?.getItem(TOKEN_KEY);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const isForm = options.body instanceof FormData;
  if (options.body !== undefined && !isForm && !(options.body instanceof Blob) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, { cache: 'no-store', ...options, headers });
  } catch {
    throw new ApiError('The local PCM API is unavailable. Start the FastAPI backend, then retry.', 0);
  }
  const payload = response.status === 204 ? null : await parseResponse(response);
  if (!response.ok) {
    if (response.status === 401 && token) clearExpiredSession(token);
    throw new ApiError(detailMessage(payload, response.status), response.status, payload);
  }
  return payload;
}

function queryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === 'all') return;
    if (Array.isArray(value)) value.forEach((item) => search.append(key, String(item)));
    else search.set(key, String(value));
  });
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

function filterParams(state = {}) {
  const filters = state.filters || {};
  const params = {
    q: state.query || '',
    category: filters.category,
    stock: filters.stock,
    low_stock: filters.lowStock === 'low' ? true : filters.lowStock === 'not-low' ? false : undefined,
    min_price: filters.minPrice || undefined,
    max_price: filters.maxPrice || undefined,
  };
  if (filters.active === 'active') params.status = 'active';
  if (filters.active === 'inactive') params.status = 'draft';
  if (API_SORT_FIELDS.has(state.sort?.key)) {
    params.sort = state.sort.key;
    params.direction = state.sort.direction === 'desc' ? 'desc' : 'asc';
  }
  Object.entries(filters.variations || {}).forEach(([key, value]) => {
    if (value !== '' && value !== 'all' && value != null) (params.variation ||= []).push(`${key}=${value}`);
  });
  return params;
}

function cleanProductPayload(draft) {
  const payload = {};
  const keys = [
    'name', 'category', 'brand', 'description', 'short_description', 'cost_price', 'selling_price',
    'Color', 'Size', 'currency', 'status', 'track_inventory', 'stock_quantity', 'weight', 'weight_unit',
    'low_stock_threshold', 'tags', 'variations',
  ];
  keys.forEach((key) => { if (Object.hasOwn(draft, key)) payload[key] = draft[key]; });
  return payload;
}

function isFile(item) {
  return typeof File !== 'undefined' && item?.file instanceof File;
}

function productFormData(draft, includeKeepIds) {
  const body = new FormData();
  body.append('product', JSON.stringify(cleanProductPayload(draft)));
  const files = (draft.media || []).filter(isFile);
  files.forEach((item) => body.append('files', item.file, item.file.name));
  if (includeKeepIds) {
    const keepIds = (draft.media || []).filter((item) => item.id && !isFile(item)).map((item) => item.id);
    body.append('keep_media_ids', JSON.stringify(keepIds));
  }
  return body;
}

async function download(path, filenameFallback) {
  const headers = new Headers();
  const token = storage()?.getItem(TOKEN_KEY);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response;
  try { response = await fetch(`${API_ROOT}${path}`, { cache: 'no-store', headers }); }
  catch { throw new ApiError('The export could not reach the local PCM API.', 0); }
  if (!response.ok) {
    const payload = await parseResponse(response);
    if (response.status === 401 && token) clearExpiredSession(token);
    throw new ApiError(detailMessage(payload, response.status), response.status, payload);
  }
  const blob = await response.blob();
  const contentDisposition = response.headers.get('content-disposition') || '';
  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quoted = contentDisposition.match(/filename="?([^";]+)"?/i)?.[1];
  const filename = encoded ? decodeURIComponent(encoded) : quoted || filenameFallback;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return filename;
}

export const api = {
  hasToken() { return Boolean(storage()?.getItem(TOKEN_KEY)); },
  clearToken() { storage()?.removeItem(TOKEN_KEY); },
  async authenticate(mode, values) {
    const result = await request(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(values) });
    storage()?.setItem(TOKEN_KEY, result.access_token);
    return result;
  },
  async logout() {
    try { return await request('/auth/logout', { method: 'POST' }); }
    finally { this.clearToken(); }
  },
  me: () => request('/auth/me'),
  updateProfile: (values) => request('/auth/profile', { method: 'PATCH', body: JSON.stringify(values) }),
  async changePassword(values) {
    const result = await request('/auth/password', { method: 'POST', body: JSON.stringify(values) });
    storage()?.setItem(TOKEN_KEY, result.access_token);
    return result;
  },
  async changeEmail(values) {
    const result = await request('/auth/email', { method: 'POST', body: JSON.stringify(values) });
    storage()?.setItem(TOKEN_KEY, result.access_token);
    return result;
  },
  listProducts: () => request('/products'),
  createProduct: (draft) => request('/products', { method: 'POST', body: productFormData(draft, false) }),
  updateProduct: (id, draft) => request(`/products/${encodeURIComponent(id)}`, { method: 'PATCH', body: productFormData(draft, true) }),
  setProductStatus: (id, status) => request(`/products/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteProduct: (id) => request(`/products/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listVariations: (includeInactive = true) => request(`/product-variations${queryString({ include_inactive: includeInactive })}`),
  addVariation: (display_name) => request('/product-variations', { method: 'POST', body: JSON.stringify({ display_name, data_type: 'text' }) }),
  updateVariation: (id, changes) => request(`/product-variations/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  removeVariation: (id) => request(`/product-variations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  exportProducts: (state, format, ids = []) => {
    const params = ids.length ? { ids, format } : { ...filterParams(state), format };
    if (!ids.length && state.exportScope === 'all') {
      return download(`/products/export${queryString({ format })}`, `eos-pcm-products.${format}`);
    }
    return download(`/products/export${queryString(params)}`, `eos-pcm-products.${format}`);
  },
};
