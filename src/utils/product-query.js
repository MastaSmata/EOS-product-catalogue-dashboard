import { getProductFields } from '../data/product-schema.js';
import { statusForStock } from './formatting.js';

function fieldValue(product, field) {
  if (field.variationKey) return product.variations?.[field.variationKey] ?? '';
  if (field.key === 'low_stock_threshold') return product.lowStockThreshold ?? product.low_stock_threshold ?? 0;
  if (field.key === 'tags') return product.tags || [];
  if (field.key === 'media') return product.media || [];
  return product[field.key];
}

function searchableText(product, variations) {
  const fields = getProductFields(variations).filter((field) => field.searchable);
  return fields.map((field) => {
    const value = fieldValue(product, field);
    return Array.isArray(value) ? value.map((item) => typeof item === 'string' ? item : item?.name || '').join(' ') : String(value ?? '');
  }).join(' ').toLocaleLowerCase();
}

export function getFilteredProducts(products, query, filters = {}, variations = []) {
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase();
  return products.filter((product) => {
    if (product.deleted_at || product.archivedAt) return false;
    if (normalizedQuery && !searchableText(product, variations).includes(normalizedQuery)) return false;
    if (filters.active === 'active' && product.status !== 'active' && !product.active) return false;
    if (filters.active === 'inactive' && (product.status === 'active' || product.active)) return false;
    if (filters.category && filters.category !== 'all' && product.category !== filters.category) return false;
    const stockStatus = statusForStock(product);
    if (filters.stock === 'in' && stockStatus === 'out') return false;
    if (filters.stock === 'out' && stockStatus !== 'out') return false;
    if (filters.lowStock === 'low' && stockStatus !== 'low') return false;
    if (filters.lowStock === 'not-low' && stockStatus === 'low') return false;
    const sellingPrice = Number(product.selling_price ?? product.price);
    if (filters.minPrice !== '' && sellingPrice < Number(filters.minPrice)) return false;
    if (filters.maxPrice !== '' && sellingPrice > Number(filters.maxPrice)) return false;
    for (const [key, expected] of Object.entries(filters.variations || {})) {
      if (expected === '' || expected === 'all' || expected == null) continue;
      const actual = key === 'Color' || key === 'Size'
        ? product[key]
        : product.variations?.[key] ?? product[`variation:${key}`];
      if (String(actual ?? '').toLocaleLowerCase() !== String(expected).toLocaleLowerCase()) return false;
    }
    return true;
  });
}

export function sortProducts(products, sort = { key: 'name', direction: 'asc' }, variations = []) {
  const field = getProductFields(variations).find((item) => item.key === sort.key);
  if (!field || !field.sortable) return [...products];
  const direction = sort.direction === 'desc' ? -1 : 1;
  return [...products].sort((a, b) => {
    let left = fieldValue(a, field);
    let right = fieldValue(b, field);
    if (field.key === 'status') { left = String(left || 'draft'); right = String(right || 'draft'); }
    else if (['decimal', 'integer'].includes(field.type)) { left = Number(left) || 0; right = Number(right) || 0; }
    else if (field.type === 'datetime') { left = Date.parse(left) || 0; right = Date.parse(right) || 0; }
    else if (Array.isArray(left)) { left = left.map((item) => item?.name || '').join(', '); right = (right || []).map((item) => item?.name || '').join(', '); }
    else { left = String(left ?? '').toLocaleLowerCase(); right = String(right ?? '').toLocaleLowerCase(); }
    if (left < right) return -1 * direction;
    if (left > right) return 1 * direction;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function hasActiveFilters(filters = {}) {
  return filters.active !== 'all' || filters.category !== 'all' || filters.stock !== 'all'
    || filters.lowStock !== 'all' || filters.minPrice !== '' || filters.maxPrice !== ''
    || Object.values(filters.variations || {}).some((value) => value !== '' && value !== 'all' && value != null);
}
