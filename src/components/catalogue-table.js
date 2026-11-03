import { escapeHtml, icon } from '../utils/dom.js';
import { formatCurrency, statusForStock } from '../utils/formatting.js';
import { getUnitsSoldThisWeek } from '../utils/metrics.js';

export function renderCatalogueTable(products, sales, menuId) {
  return `<div class="table-scroll catalogue-table-wrap"><table class="catalogue-table"><thead><tr><th scope="col">Product</th><th scope="col">SKU</th><th scope="col">Category</th><th scope="col">Price</th><th scope="col">Stock</th><th scope="col">Sold this week</th><th scope="col">Status</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead><tbody>${products.map((product) => {
    const stock = statusForStock(product);
    const stockValue = product.track_inventory === false ? '—' : Number(product.stock) || 0;
    const stockLabel = product.track_inventory === false ? 'not tracked' : stock === 'out' ? 'out' : stock === 'low' ? 'low' : 'in stock';
    const id = escapeHtml(product.id);
    const name = escapeHtml(product.name);
    const toolbox = menuId === product.id ? `<div class="table-row-toolbox" role="group" aria-label="Actions for ${name}"><button class="button button-small button-subtle" type="button" data-action="edit-product" data-id="${id}">${icon('edit', 14)}<span>Edit product</span></button><button class="button button-small button-subtle" type="button" data-action="toggle-activation" data-id="${id}"><span>${product.active ? 'Deactivate product' : 'Activate product'}</span></button></div>` : '';
    return `<tr data-catalogue-row="${id}" tabindex="0" aria-label="${name}. Open product actions."><td><div class="table-product-name"><span class="tiny-product-mark">${icon('box', 15)}</span><strong>${name}</strong></div>${toolbox}</td><td><span class="sku-pill">${escapeHtml(product.sku)}</span></td><td>${escapeHtml(product.category || 'Uncategorized')}</td><td class="numeric-cell">${formatCurrency(product.price, product.currency)}</td><td><span class="table-stock ${stock}">${stockValue} <small>${stockLabel}</small></span></td><td>${sales.length ? getUnitsSoldThisWeek(sales, product.id) : '—'}</td><td><span class="activation-badge compact ${product.active ? 'is-active' : 'is-inactive'}"><span class="status-dot"></span>${product.active ? 'Active' : 'Not Active'}</span></td><td><button class="icon-button table-more" type="button" aria-label="Actions for ${name}" aria-expanded="${menuId === product.id}" data-action="product-menu" data-id="${id}">${icon('dots', 18)}</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
