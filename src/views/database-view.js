import { renderDatabaseToolbar } from '../components/toolbar.js';
import { renderSpreadsheet } from '../components/spreadsheet.js';
import { BRANDING } from '../data/branding.js';
import { escapeHtml, icon } from '../utils/dom.js';
import { getFilteredProducts, sortProducts } from '../utils/product-query.js';
import { formatWeekRange, REPORTING_TIME_ZONE } from '../utils/formatting.js';

function renderDatabaseMobileDock(state) {
  const selectedProducts = state.products.filter((product) => state.selectedIds.includes(product.id) && !product.archivedAt);
  const count = selectedProducts.length;
  let actions;

  if (count === 1) {
    const product = selectedProducts[0];
    actions = `<span class="database-dock-count">1 selected</span><button type="button" class="dock-control" data-action="edit-selected">${icon('edit', 17)}<span>Edit</span></button><button type="button" class="dock-control" data-action="toggle-activation" data-id="${escapeHtml(product.id)}">${icon(product.active ? 'pause' : 'check', 17)}<span>${product.active ? 'Deactivate' : 'Activate'}</span></button><button type="button" class="dock-control dock-action-danger" data-action="bulk-delete">${icon('archive', 17)}<span>Delete</span></button>`;
  } else if (count > 1) {
    actions = `<span class="database-dock-count">${count} selected</span><button type="button" class="dock-control dock-action-danger" data-action="bulk-delete">${icon('archive', 17)}<span>Delete</span></button>`;
  } else {
    actions = `<button type="button" class="dock-add-button" data-action="add-product">${icon('plus', 17)}<span>Add product</span></button><button type="button" class="dock-control" data-action="focus-database-search">${icon('search', 17)}<span>Search</span></button><button type="button" class="dock-control" data-action="focus-database-filter">${icon('filter', 17)}<span>Filter by</span></button><button type="button" class="dock-control" data-action="export-open">${icon('download', 17)}<span>Export</span></button>`;
  }

  return `<nav class="database-mobile-dock mobile-scroll-dock" aria-label="Database quick actions" aria-hidden="true" inert>${actions}</nav>`;
}

export function renderDatabaseView(state) {
  const matches = sortProducts(getFilteredProducts(state.products, state.query, state.filters, state.variations), state.sort, state.variations);
  const title = escapeHtml(`${BRANDING.merchantName} - PCM Dashboard`);
  const reportingPeriod = `${icon('clock', 14)} ${formatWeekRange()} <span class="timezone-note">&middot; ${REPORTING_TIME_ZONE}</span>`;
  return `<main class="workspace-main database-main">
    <section class="database-mobile-title" aria-label="Product database"><h1>${title}</h1><span class="reporting-period">${reportingPeriod}</span></section>
    ${renderDatabaseToolbar(state, matches.length)}
    <section class="database-grid-section" aria-label="Product records">
      ${state.error ? `<div class="inline-error" role="alert">${escapeHtml(state.error)} <button data-action="retry-load" type="button">Try again</button></div>` : ''}
      ${renderSpreadsheet(matches, state.sales, state)}
    </section>
    <footer class="database-footer"><span>Active product fields follow this account's variation settings.</span><span>Products are saved by the local FastAPI service.</span></footer>
  </main>${renderDatabaseMobileDock(state)}`;
}
