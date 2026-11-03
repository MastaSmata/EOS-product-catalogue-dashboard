import { renderSummaryCards } from '../components/summary-cards.js';
import { renderCatalogueToolbar } from '../components/toolbar.js';
import { renderCatalogueEmpty, renderProductCard } from '../components/product-card.js';
import { renderCatalogueTable } from '../components/catalogue-table.js';
import { getFilteredProducts, hasActiveFilters, sortProducts } from '../utils/product-query.js';
import { icon } from '../utils/dom.js';

function renderMobileDock(state) {
  return `<nav class="catalogue-mobile-dock mobile-scroll-dock" aria-label="Catalogue quick actions" aria-hidden="true" inert>
    <button type="button" class="dock-add-button" data-action="add-product">${icon('plus', 17)}<span>Add product</span></button>
    <button type="button" class="dock-control" data-action="focus-catalogue-search">${icon('search', 17)}<span>Search</span></button>
    <button type="button" class="dock-control" data-action="focus-catalogue-filter">${icon('filter', 17)}<span>Filter by</span></button>
    <div class="dock-layout-switch" role="group" aria-label="Catalogue layout">
      <button type="button" class="dock-layout-option ${state.layout === 'tiles' ? 'is-active' : ''}" aria-label="Tile view" aria-pressed="${state.layout === 'tiles'}" data-action="layout" data-layout="tiles">${icon('grid', 17)}</button>
      <button type="button" class="dock-layout-option ${state.layout === 'table' ? 'is-active' : ''}" aria-label="Table view" aria-pressed="${state.layout === 'table'}" data-action="layout" data-layout="table">${icon('table', 17)}</button>
    </div>
  </nav>`;
}

export function renderCatalogueView(state) {
  const matches = sortProducts(getFilteredProducts(state.products, state.query, state.filters, state.variations), state.sort, state.variations);
  const content = state.loading || state.error || !state.products.some((product) => !product.archivedAt)
    || !matches.length
    ? renderCatalogueEmpty({ loading: state.loading, error: state.error, query: state.query, hasFilters: hasActiveFilters(state.filters) })
    : state.layout === 'table'
      ? renderCatalogueTable(matches, state.sales, state.menuId)
      : `<div class="product-grid">${matches.map((product) => renderProductCard(product, state.sales, state.menuId)).join('')}</div>`;
  return `<main class="workspace-main catalogue-main">${renderSummaryCards(state.products, state.sales)}${renderCatalogueToolbar(state)}<section class="catalogue-results" aria-label="Products"><div class="results-heading"><div><p class="eyebrow">Product catalog</p><h2>Products <span class="results-count">${matches.length}</span></h2></div><p class="results-note">One shared catalog · ${matches.length} ${matches.length === 1 ? 'record' : 'records'} in this view</p></div>${content}</section></main>${renderMobileDock(state)}`;
}
