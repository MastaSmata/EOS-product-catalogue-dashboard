import { escapeHtml, icon, safeMediaUrl } from '../utils/dom.js';
import { formatCurrency, statusForStock } from '../utils/formatting.js';
import { getUnitsSoldThisWeek } from '../utils/metrics.js';

const artTone = (category = '') => ({
  Apparel: 'art-clay', 'Home & Living': 'art-sand', Beauty: 'art-rose', Electronics: 'art-blue', Outdoor: 'art-sage', Accessories: 'art-lilac',
}[category] || 'art-sand');

function renderMedia(product) {
  const file = product.media?.[0];
  const url = file?.url ? safeMediaUrl(file.url) : '';
  if (file?.type?.startsWith('image/') && url) return `<img class="product-image" src="${escapeHtml(url)}" alt="${escapeHtml(product.name)}" loading="lazy" />`;
  if (file?.type?.startsWith('video/')) return `<div class="product-image product-video-thumb ${artTone(product.category)}"><span class="media-placeholder-icon">${icon('video', 28)}</span><span class="video-label">VIDEO</span></div>`;
  const initials = String(product.name || 'Product').split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  return `<div class="product-image product-placeholder ${artTone(product.category)}"><span class="placeholder-orbit"></span><span class="placeholder-product-mark">${icon('box', 24)}</span><span class="placeholder-initials">${escapeHtml(initials)}</span></div>`;
}

function renderProductMenu(product) {
  return `<div class="popover card-menu" role="menu" aria-label="Actions for ${escapeHtml(product.name)}">
    <div class="menu-product-heading"><span class="menu-product-name">${escapeHtml(product.name)}</span><span class="menu-product-sku">${escapeHtml(product.sku)}</span></div>
    <button class="menu-item" type="button" role="menuitem" data-action="edit-product" data-id="${escapeHtml(product.id)}">${icon('edit', 15)} Edit product</button>
    <button class="menu-item" type="button" role="menuitem" data-action="toggle-activation" data-id="${escapeHtml(product.id)}">${product.active ? `<span class="status-dot status-dot-off"></span> Deactivate product` : `${icon('check', 15)} Activate product`}</button>
  </div>`;
}

export function renderProductCard(product, sales, menuId) {
  const stockStatus = statusForStock(product);
  const sold = sales.length ? getUnitsSoldThisWeek(sales, product.id) : '—';
  const stockValue = product.track_inventory === false ? '—' : Number(product.stock) || 0;
  const stockLabel = product.track_inventory === false ? 'Not tracked' : stockStatus === 'out' ? 'Out of stock' : stockStatus === 'low' ? 'Low stock' : 'In stock';
  return `<article class="product-card" data-card-id="${escapeHtml(product.id)}" tabindex="0" aria-label="${escapeHtml(product.name)}. Open product actions">
    <div class="card-media-wrap" data-action="product-menu" data-id="${escapeHtml(product.id)}">${renderMedia(product)}<span class="activation-badge ${product.active ? 'is-active' : 'is-inactive'}"><span class="status-dot"></span>${product.active ? 'Active' : 'Not Active'}</span><button class="icon-button card-more" type="button" aria-label="Actions for ${escapeHtml(product.name)}" aria-haspopup="true" aria-expanded="${menuId === product.id}" data-action="product-menu" data-id="${escapeHtml(product.id)}">${icon('dots', 19)}</button>${menuId === product.id ? renderProductMenu(product) : ''}</div>
    <div class="card-body" data-action="product-menu" data-id="${escapeHtml(product.id)}">
      <div class="product-title-row"><div class="product-title-group"><span class="category-label">${escapeHtml(product.category || 'Uncategorized')}</span><h3>${escapeHtml(product.name)}</h3></div><span class="product-price">${formatCurrency(product.price, product.currency)}</span></div>
      <div class="product-meta"><span class="sku-pill">${escapeHtml(product.sku)}</span><span class="product-brand">${escapeHtml(product.brand || '—')}</span></div>
      <div class="card-divider"></div>
      <div class="card-stats"><div><span class="stat-label">Available stock</span><strong>${stockValue} <span class="stock-indicator ${stockStatus}">${stockLabel}</span></strong></div><div class="sold-stat"><span class="stat-label">Sold this week</span><strong>${sold}<small>${sales.length ? ' units' : ' no data'}</small></strong></div></div>
    </div>
  </article>`;
}

export function renderCatalogueEmpty({ loading, error, query, hasFilters }) {
  if (loading) return `<div class="product-grid skeleton-grid" aria-label="Loading products">${Array.from({ length: 4 }, () => '<div class="skeleton-card"><span></span><div><i></i><i></i><i></i></div></div>').join('')}</div>`;
  if (error) return `<div class="empty-state error-state"><span class="empty-icon">${icon('archive', 23)}</span><p class="eyebrow">Couldn't load your catalog</p><h3>Something interrupted the connection.</h3><p>${escapeHtml(error)}</p><button class="button button-primary" data-action="retry-load" type="button">Try again</button></div>`;
  if (query) return `<div class="empty-state"><span class="empty-icon">${icon('search', 23)}</span><p class="eyebrow">Search finished</p><h3>No products match “${escapeHtml(query)}”.</h3><p>Try another product name or SKU.</p><button type="button" class="button button-subtle" data-action="search-clear">Clear search</button></div>`;
  if (hasFilters) return `<div class="empty-state"><span class="empty-icon">${icon('filter', 23)}</span><p class="eyebrow">No matches yet</p><h3>No products match these filters.</h3><p>Broaden your criteria to see more items.</p><button type="button" class="button button-subtle" data-action="filters-clear">Clear all filters</button></div>`;
  return `<div class="empty-state"><span class="empty-icon">${icon('box', 23)}</span><p class="eyebrow">Your catalog starts here</p><h3>Add your first product.</h3><p>Your product data will appear here and in the database view.</p><button type="button" class="button button-primary" data-action="add-product">${icon('plus', 16)} Add product</button></div>`;
}
