import { CATEGORIES } from '../data/product-schema.js';
import { escapeHtml, icon } from '../utils/dom.js';
import { hasActiveFilters } from '../utils/product-query.js';

function filterCount(filters = {}) {
  const rootCount = ['category', 'active', 'stock', 'lowStock'].filter((key) => filters[key] && filters[key] !== 'all').length;
  const rangeCount = ['minPrice', 'maxPrice'].filter((key) => filters[key] !== '' && filters[key] != null).length;
  const variationCount = Object.values(filters.variations || {}).filter((value) => value !== '' && value !== 'all' && value != null).length;
  return rootCount + rangeCount + variationCount;
}

function categoriesFor(state) {
  return [...new Set([
    ...CATEGORIES,
    ...(state.products || []).map((product) => product.category).filter(Boolean),
    ...(state.filters.category && state.filters.category !== 'all' ? [state.filters.category] : []),
  ])].sort((a, b) => a.localeCompare(b));
}

function variationValue(product, definition) {
  return definition.key === 'Color' || definition.key === 'Size'
    ? product[definition.key]
    : product.variations?.[definition.key];
}

function renderFilterPanel(state) {
  const { filters } = state;
  const activeVariations = (state.variations || []).filter((variation) => variation.active !== false);
  const customFilters = activeVariations.map((variation) => {
    const choices = [...new Set((state.products || []).map((product) => variationValue(product, variation)).filter((value) => value !== '' && value != null))]
      .sort((a, b) => String(a).localeCompare(String(b)));
    const current = filters.variations?.[variation.key] || '';
    return `<label class="field-compact"><span>${escapeHtml(variation.display_name)}</span><select data-filter="variation:${escapeHtml(variation.key)}"><option value="all" ${!current || current === 'all' ? 'selected' : ''}>Any ${escapeHtml(variation.display_name.toLocaleLowerCase())}</option>${choices.map((choice) => `<option value="${escapeHtml(choice)}" ${current === choice ? 'selected' : ''}>${escapeHtml(choice)}</option>`).join('')}</select></label>`;
  }).join('');
  return `<div class="popover filter-popover" role="region" aria-label="Product filters">
    <div class="popover-heading"><div><strong>Filter products</strong><small>Filters combine across fields.</small></div><button type="button" class="icon-button small" aria-label="Close filters" data-action="filters-toggle">${icon('close', 15)}</button></div>
    <div class="filter-grid">
      <label class="field-compact"><span>Activation</span><select data-filter="active"><option value="all" ${filters.active === 'all' ? 'selected' : ''}>Any status</option><option value="active" ${filters.active === 'active' ? 'selected' : ''}>Active</option><option value="inactive" ${filters.active === 'inactive' ? 'selected' : ''}>Not active</option></select></label>
      <label class="field-compact"><span>Category</span><select data-filter="category"><option value="all" ${filters.category === 'all' ? 'selected' : ''}>All categories</option>${categoriesFor(state).map((category) => `<option value="${escapeHtml(category)}" ${filters.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select></label>
      <label class="field-compact"><span>Stock status</span><select data-filter="stock"><option value="all" ${filters.stock === 'all' ? 'selected' : ''}>Any stock</option><option value="in" ${filters.stock === 'in' ? 'selected' : ''}>In stock</option><option value="out" ${filters.stock === 'out' ? 'selected' : ''}>Out of stock</option></select></label>
      <label class="field-compact"><span>Low stock</span><select data-filter="lowStock"><option value="all" ${filters.lowStock === 'all' ? 'selected' : ''}>Any</option><option value="low" ${filters.lowStock === 'low' ? 'selected' : ''}>Low stock</option><option value="not-low" ${filters.lowStock === 'not-low' ? 'selected' : ''}>Not low stock</option></select></label>
      <label class="field-compact"><span>Price from</span><input type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${escapeHtml(filters.minPrice)}" data-filter="minPrice" /></label>
      <label class="field-compact"><span>Price to</span><input type="number" min="0" step="0.01" inputmode="decimal" placeholder="Any" value="${escapeHtml(filters.maxPrice)}" data-filter="maxPrice" /></label>
      ${customFilters}
    </div>
    <div class="popover-footer"><span>${filterCount(filters)} filters applied</span><button class="text-button" type="button" data-action="filters-clear">Clear all</button></div>
  </div>`;
}

function filterChips(filters) {
  const chips = [];
  if (filters.active !== 'all') chips.push({ key: 'active', label: filters.active === 'active' ? 'Active' : 'Not active' });
  if (filters.category !== 'all') chips.push({ key: 'category', label: filters.category });
  if (filters.stock !== 'all') chips.push({ key: 'stock', label: filters.stock === 'in' ? 'In stock' : 'Out of stock' });
  if (filters.lowStock !== 'all') chips.push({ key: 'lowStock', label: filters.lowStock === 'low' ? 'Low stock' : 'Not low stock' });
  if (filters.minPrice !== '') chips.push({ key: 'minPrice', label: `From ${filters.minPrice}` });
  if (filters.maxPrice !== '') chips.push({ key: 'maxPrice', label: `Up to ${filters.maxPrice}` });
  Object.entries(filters.variations || {}).forEach(([key, value]) => {
    if (value !== '' && value !== 'all' && value != null) {
      const definition = (filters._definitions || []).find((item) => item.key === key);
      chips.push({ key: 'variation', variationKey: key, label: `${definition?.display_name || key}: ${value}` });
    }
  });
  return chips;
}

function renderSearchFilters(state) {
  const active = hasActiveFilters(state.filters);
  const chips = filterChips({ ...state.filters, _definitions: state.variations });
  return `<div class="search-filter-group">
    <label class="search-box"><span class="visually-hidden">Search products or SKU</span>${icon('search', 17)}<input type="search" aria-label="Search products or SKU" placeholder="Search products or SKU" value="${escapeHtml(state.query)}" data-search /><kbd>⌘ K</kbd>${state.query ? `<button class="search-clear" type="button" aria-label="Clear search" data-action="search-clear">${icon('close', 14)}</button>` : ''}</label>
    <div class="filter-anchor"><button class="button button-subtle filter-trigger ${active ? 'has-filters' : ''}" type="button" aria-expanded="${state.filterOpen}" data-action="filters-toggle">${icon('filter', 16)}<span>Filter by</span>${active ? `<span class="filter-count">${filterCount(state.filters)}</span>` : ''}</button>${state.filterOpen ? renderFilterPanel(state) : ''}</div>
    ${active || state.query ? `<div class="active-filter-strip">${chips.map((chip) => `<button type="button" class="filter-chip" data-action="filter-remove" data-filter-key="${escapeHtml(chip.key)}" ${chip.variationKey ? `data-variation-key="${escapeHtml(chip.variationKey)}"` : ''}>${escapeHtml(chip.label)}<span>×</span></button>`).join('')}${state.query ? `<span class="query-chip">“${escapeHtml(state.query)}”</span>` : ''}<button type="button" class="text-button clear-all" data-action="filters-clear">Clear all filters</button></div>` : ''}
  </div>`;
}

export function renderCatalogueToolbar(state) {
  return `<section class="toolbar catalogue-toolbar" aria-label="Catalogue controls">
    <div class="toolbar-main">${renderSearchFilters(state)}<div class="toolbar-actions"><button class="button button-primary" type="button" data-action="add-product">${icon('plus', 16)}<span>Add product</span></button><div class="layout-switch" role="group" aria-label="Catalogue layout"><button type="button" class="layout-option ${state.layout === 'tiles' ? 'is-active' : ''}" aria-pressed="${state.layout === 'tiles'}" title="Tile view" data-action="layout" data-layout="tiles">${icon('grid', 16)}<span class="visually-hidden">Tile view</span></button><button type="button" class="layout-option ${state.layout === 'table' ? 'is-active' : ''}" aria-pressed="${state.layout === 'table'}" title="Table view" data-action="layout" data-layout="table">${icon('table', 16)}<span class="visually-hidden">Table view</span></button></div></div></div>
  </section>`;
}

export function renderDatabaseToolbar(state, visibleCount) {
  const count = state.selectedIds.length;
  const oneSelected = count === 1;
  const selectedProducts = state.products.filter((product) => state.selectedIds.includes(product.id) && !product.archivedAt);
  const canActivate = selectedProducts.some((product) => !product.active);
  const canDeactivate = selectedProducts.some((product) => product.active);
  return `<section class="toolbar database-toolbar" aria-label="Database controls">
    <div class="toolbar-main">${renderSearchFilters(state)}<div class="toolbar-actions database-toolbar-actions"><button class="button button-primary" type="button" data-action="add-product">${icon('plus', 16)}<span>Add product</span></button><button class="button button-subtle database-mobile-export" type="button" data-action="export-open">${icon('download', 16)}<span>Export</span></button></div></div>
    ${count ? `<div class="bulk-toolbar"><div class="selection-summary"><strong>${count}</strong> selected <span class="selection-separator">·</span><span>${visibleCount} matching records</span></div><div class="bulk-actions"><button class="button button-small button-subtle" type="button" data-action="edit-selected" ${oneSelected && selectedProducts.length === 1 ? '' : 'disabled'}>${icon('edit', 14)}<span>Edit</span></button><button class="button button-small button-subtle" type="button" data-action="bulk-activate" ${canActivate ? '' : 'disabled'}>${icon('check', 14)}<span>Activate</span></button><button class="button button-small button-subtle" type="button" data-action="bulk-deactivate" ${canDeactivate ? '' : 'disabled'}><span class="status-dot status-dot-off"></span><span>Deactivate</span></button><button class="button button-small button-danger-soft" type="button" data-action="bulk-delete" ${count ? '' : 'disabled'}>${icon('archive', 14)}<span>Delete</span></button></div></div>` : ''}
  </section>`;
}
