import { api, ApiError } from '../api/client.js';

const blankFilters = () => ({ active: 'all', category: 'all', stock: 'all', lowStock: 'all', minPrice: '', maxPrice: '', variations: {} });
const listeners = new Set();
let state = {
  products: [], sales: [], variations: [], user: null, availableCurrencies: [], totalProducts: 0,
  loading: false, authStatus: 'checking', authMode: 'login', authError: '', authEmail: '', error: '',
  view: 'catalogue', layout: 'tiles', query: '', filters: blankFilters(), selectedIds: [],
  sort: { key: 'name', direction: 'asc' }, filterOpen: false, profileOpen: false,
  menuId: null, toast: null,
};
let reloadRequest = 0;

function emit() { listeners.forEach((listener) => listener(state)); }
function update(patch) { state = { ...state, ...patch }; emit(); }

function asViewProduct(product) {
  return {
    ...product,
    price: String(product.selling_price ?? ''),
    costPrice: String(product.cost_price ?? ''),
    stock: Number(product.stock_quantity || 0),
    lowStockThreshold: Number(product.low_stock_threshold || 0),
    active: product.status === 'active',
    archivedAt: product.deleted_at || null,
    createdAt: product.created_at,
    updatedAt: product.updated_at,
    media: (product.media || []).map((item) => ({
      ...item,
      name: item.name || item.filename || 'Product media',
      type: item.type || item.content_type || '',
      size: item.size ?? item.size_bytes ?? 0,
      source: 'server',
    })),
  };
}

async function bootstrap() {
  if (!api.hasToken()) {
    update({ authStatus: 'signed-out', authError: '', authEmail: '', loading: false, products: [], sales: [], variations: [], user: null, totalProducts: 0, selectedIds: [] });
    return;
  }
  update({ authStatus: 'loading', loading: true, authError: '', error: '' });
  try {
    const [account, definitions, result] = await Promise.all([api.me(), api.listVariations(true), api.listProducts()]);
    state = {
      ...state,
      user: account.user,
      availableCurrencies: account.available_currencies || [],
      variations: definitions.items || [],
      products: (result.items || []).map(asViewProduct),
      totalProducts: result.total || 0,
      sales: [],
      loading: false,
      authStatus: 'ready',
      error: '',
      authError: '',
      authEmail: '',
      selectedIds: [],
      filters: blankFilters(),
    };
    emit();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      api.clearToken();
      update({ authStatus: 'signed-out', user: null, products: [], variations: [], sales: [], totalProducts: 0, selectedIds: [], loading: false, authError: '', authEmail: '', error: '' });
      return;
    }
    update({ authStatus: 'error', loading: false, error: error?.message || 'The local PCM API could not be reached.' });
  }
}

export const store = {
  getState: () => state,
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  load: bootstrap,
  async authenticate(mode, values) {
    update({ authStatus: 'loading', loading: true, authError: '', error: '' });
    try {
      await api.authenticate(mode, values);
      await bootstrap();
      if (state.authStatus !== 'ready') throw new ApiError(state.error || 'The account could not be loaded.', 0);
    } catch (error) {
      api.clearToken();
      update({ authStatus: 'signed-out', loading: false, authEmail: values.email || '', authError: error?.message || 'Sign in could not be completed.' });
      throw error;
    }
  },
  setAuthMode(authMode) { update({ authMode, authError: '' }); },
  setAuthEmail(authEmail) { update({ authEmail }); },
  setAuthError(authError) { update({ authError }); },
  sessionExpired() {
    api.clearToken();
    update({ authStatus: 'signed-out', user: null, products: [], sales: [], variations: [], totalProducts: 0, selectedIds: [], loading: false, authEmail: '', authError: 'Your session expired. Sign in again to continue.', error: '' });
  },
  setView(view) { update({ view, menuId: null, filterOpen: false, profileOpen: false }); },
  setLayout(layout) { update({ layout }); },
  setQuery(query) { update({ query }); },
  setFilters(filters) {
    const next = { ...state.filters, ...filters };
    if (filters.variations) next.variations = { ...state.filters.variations, ...filters.variations };
    update({ filters: next });
  },
  clearFilters() { update({ filters: blankFilters() }); },
  toggleFilters() { update({ filterOpen: !state.filterOpen, profileOpen: false, menuId: null }); },
  toggleProfile() { update({ profileOpen: !state.profileOpen, filterOpen: false, menuId: null }); },
  setMenu(menuId) { update({ menuId: state.menuId === menuId ? null : menuId, profileOpen: false }); },
  closeMenus() { update({ menuId: null, profileOpen: false, filterOpen: false }); },
  setSort(key) {
    const direction = state.sort.key === key && state.sort.direction === 'asc' ? 'desc' : 'asc';
    update({ sort: { key, direction } });
  },
  setSelected(ids) { update({ selectedIds: [...new Set(ids)], menuId: null }); },
  toggleSelected(id) {
    if (!id) return;
    const selectedIds = state.selectedIds.includes(id)
      ? state.selectedIds.filter((selectedId) => selectedId !== id)
      : [...state.selectedIds, id];
    update({ selectedIds, menuId: null });
  },
  showToast(message, tone = 'success') {
    const id = crypto.randomUUID();
    update({ toast: { id, message, tone } });
    window.setTimeout(() => { if (state.toast?.id === id) update({ toast: null }); }, 4200);
  },
  async reloadProducts() {
    const requestId = ++reloadRequest;
    update({ loading: true, error: '' });
    try {
      const result = await api.listProducts();
      if (requestId !== reloadRequest) return;
      const products = (result.items || []).map(asViewProduct);
      const availableIds = new Set(products.map((product) => product.id));
      update({ products, totalProducts: result.total || 0, selectedIds: state.selectedIds.filter((id) => availableIds.has(id)), loading: false, error: '' });
    } catch (error) {
      if (requestId === reloadRequest) update({ loading: false, error: error?.message || 'Products could not be loaded.' });
      throw error;
    }
  },
  async saveProduct(draft) {
    const saved = draft.id ? await api.updateProduct(draft.id, draft) : await api.createProduct(draft);
    const mapped = asViewProduct(saved);
    const products = draft.id
      ? state.products.map((product) => product.id === mapped.id ? mapped : product)
      : [...state.products.filter((product) => product.id !== mapped.id), mapped];
    update({ products, totalProducts: products.filter((product) => !product.deleted_at).length, error: '' });
    void this.reloadProducts().catch(() => {});
    return mapped;
  },
  async setActivation(ids, active) {
    const changed = [];
    let failure = null;
    for (const id of ids) {
      try { changed.push(await api.setProductStatus(id, active ? 'active' : 'draft')); }
      catch (error) { failure = error; break; }
    }
    update({ selectedIds: [], menuId: null });
    try { await this.reloadProducts(); } catch { /* list error is already visible */ }
    if (failure && changed.length) {
      throw new ApiError(`Updated ${changed.length} product(s) before a later update failed. The catalogue was refreshed; check the remaining statuses.`, failure.status, failure.payload);
    }
    if (failure) throw failure;
    return changed;
  },
  async archiveProducts(ids) {
    const archived = [];
    let failure = null;
    for (const id of ids) {
      try { archived.push(await api.deleteProduct(id)); }
      catch (error) { failure = error; break; }
    }
    update({ selectedIds: [], menuId: null });
    try { await this.reloadProducts(); } catch { /* list error is already visible */ }
    if (failure && archived.length) {
      throw new ApiError(`Archived ${archived.length} product(s) before a later request failed. The catalogue was refreshed; review the remaining records.`, failure.status, failure.payload);
    }
    if (failure) throw failure;
    return archived;
  },
  async updateProfile(changes) {
    const result = await api.updateProfile(changes);
    update({ user: result.user, availableCurrencies: result.available_currencies || state.availableCurrencies });
    return result.user;
  },
  async changePassword(changes) {
    const result = await api.changePassword(changes);
    update({ user: result.user });
    return result.user;
  },
  async changeEmail(changes) {
    const result = await api.changeEmail(changes);
    update({ user: result.user });
    return result.user;
  },
  async addVariation(displayName) {
    await api.addVariation(displayName);
    return this.reloadConfiguration();
  },
  async updateVariation(id, changes) {
    await api.updateVariation(id, changes);
    return this.reloadConfiguration();
  },
  async removeVariation(id) {
    await api.removeVariation(id);
    return this.reloadConfiguration();
  },
  async reloadConfiguration() {
    const [account, definitions] = await Promise.all([api.me(), api.listVariations(true)]);
    update({ user: account.user, availableCurrencies: account.available_currencies || [], variations: definitions.items || [] });
    return definitions.items || [];
  },
  async logout() {
    try { await api.logout(); }
    finally {
      state = { ...state, authStatus: 'signed-out', user: null, products: [], sales: [], variations: [], totalProducts: 0, selectedIds: [], profileOpen: false, menuId: null, error: '', authError: '', authEmail: '' };
      emit();
    }
  },
};
