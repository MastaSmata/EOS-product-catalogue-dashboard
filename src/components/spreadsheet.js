import { getProductFields } from '../data/product-schema.js';
import { escapeHtml, icon, safeMediaUrl } from '../utils/dom.js';
import { formatCurrency, formatDateTime, statusForStock } from '../utils/formatting.js';

function columnLetter(index) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + value % 26) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function rawValue(product, field) {
  if (field.variationKey) return product.variations?.[field.variationKey] ?? '';
  if (field.key === 'low_stock_threshold') return product.low_stock_threshold ?? product.lowStockThreshold ?? 0;
  return product[field.key];
}

function valueFor(product, field) {
  const value = rawValue(product, field);
  if (field.key === 'cost_price' || field.key === 'selling_price') return escapeHtml(formatCurrency(value, product.currency));
  if (field.key === 'status') {
    const status = value || 'draft';
    const active = status === 'active';
    return `<span class="activation-badge compact ${active ? 'is-active' : 'is-inactive'}"><span class="status-dot"></span>${active ? 'Active' : status === 'archived' ? 'Archived' : 'Draft'}</span>`;
  }
  if (field.key === 'stock_quantity') {
    const status = statusForStock(product);
    const label = product.track_inventory === false ? 'not tracked' : status === 'out' ? 'out' : status === 'low' ? 'low' : 'in stock';
    return `<span class="table-stock ${status}">${Number(value) || 0}<small>${label}</small></span>`;
  }
  if (field.key === 'low_stock_threshold') return Number(value) > 0 ? escapeHtml(value) : '—';
  if (field.key === 'track_inventory') return value ? '<span class="boolean-value">Yes</span>' : '<span class="boolean-value">No</span>';
  if (field.key === 'media') {
    const media = product.media || [];
    const first = media[0];
    if (!first) return '<span class="muted-cell">No media</span>';
    const url = safeMediaUrl(first.url || '');
    const type = first.type || first.content_type || '';
    const label = escapeHtml(first.name || first.filename || 'View file');
    return `<span class="media-cell">${type.startsWith('video/') ? icon('video', 14) : icon('image', 14)}${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${label}</a>` : `<span>${label}</span>`}${media.length > 1 ? `<small>+${media.length - 1}</small>` : ''}</span>`;
  }
  if (field.key === 'tags') return Array.isArray(value) && value.length ? escapeHtml(value.join(', ')) : '—';
  if (field.type === 'datetime') return escapeHtml(formatDateTime(value));
  if (field.type === 'currency') return escapeHtml(value || '—');
  if (Array.isArray(value)) return escapeHtml(value.join(', ')) || '—';
  return escapeHtml(value ?? '—') || '—';
}

function titleFor(product, field) {
  const value = field.key === 'media'
    ? (product.media || []).map((item) => item.name || item.filename || '').join(', ')
    : rawValue(product, field);
  return Array.isArray(value) ? value.join(', ') : String(value ?? '');
}


export function renderSpreadsheet(products, _sales, state) {
  const selected = new Set(state.selectedIds);
  const allSelected = products.length > 0 && products.every((product) => selected.has(product.id));
  const columns = getProductFields(state.variations);
  const header = columns.map((field, index) => `<th scope="col" data-column-index="${index}" data-column="${escapeHtml(field.key)}" style="min-width:${field.width}px" class="${field.sortable ? 'sortable-header' : ''}"><span class="column-letter">${columnLetter(index)}</span><button type="button" class="column-label ${field.sortable ? '' : 'not-sortable'}" ${field.sortable ? `data-action="sort" data-key="${escapeHtml(field.key)}"` : 'disabled'}>${escapeHtml(field.label)}${state.sort.key === field.key ? icon(state.sort.direction === 'asc' ? 'arrowUp' : 'arrowDown', 13) : ''}</button></th>`).join('');
  const rows = products.map((product, rowIndex) => `<tr data-product-row="${escapeHtml(product.id)}" aria-selected="${selected.has(product.id)}" class="${selected.has(product.id) ? 'is-selected' : ''}">
    <th scope="row" class="row-index-cell"><div class="row-index-content"><input class="row-select" type="checkbox" aria-label="Select ${escapeHtml(product.name)}" data-select-id="${escapeHtml(product.id)}" ${selected.has(product.id) ? 'checked' : ''} /><span class="row-number">${rowIndex + 1}</span></div></th>
    ${columns.map((field, colIndex) => `<td class="sheet-cell ${field.key === 'name' ? 'name-cell' : ''}" data-cell="${rowIndex}:${colIndex}" tabindex="${rowIndex === 0 && colIndex === 0 ? '0' : '-1'}" title="${escapeHtml(titleFor(product, field))}">${field.key === 'name' ? `<span class="cell-name-mark">${icon('box', 14)}</span>` : ''}${valueFor(product, field)}</td>`).join('')}
  </tr>`).join('');
  const hasFilters = state.query || Object.values(state.filters || {}).some((value) => value !== 'all' && value !== '') || Object.values(state.filters?.variations || {}).some((value) => value !== '' && value !== 'all');
  return `<div class="spreadsheet-frame"><div class="spreadsheet-scroll" tabindex="0" aria-label="Product data grid. Use arrow keys to move between cells."><table class="spreadsheet" role="grid" aria-rowcount="${products.length + 1}" aria-colcount="${columns.length + 1}"><thead><tr class="column-letters"><th class="corner-cell" aria-label="Select all visible rows"><input type="checkbox" aria-label="Select all visible rows" data-select-all ${allSelected ? 'checked' : ''} /></th>${header}</tr></thead><tbody>${rows}</tbody></table></div>
    ${products.length ? `<div class="sheet-bottom"><span class="bottom-row-count">${products.length} ${products.length === 1 ? 'product row' : 'product rows'} · no blank records</span><button class="bottom-add-row" type="button" aria-label="Add a product after the last row" data-action="add-product">${icon('plus', 14)}<span>Add product${hasFilters ? ' · new products may not match the current filters' : ''}</span></button></div>` : `<div class="sheet-empty"><span class="empty-icon">${icon('box', 21)}</span><div><strong>${hasFilters ? 'No matching products' : 'No products yet'}</strong><p>${hasFilters ? 'Try a different search or filter, or clear the current filters.' : 'Your records will appear here. No blank rows have been added.'}</p></div><button type="button" class="button button-primary button-small" data-action="add-product">${icon('plus', 14)} Add product</button></div>`}
  </div>`;
}
