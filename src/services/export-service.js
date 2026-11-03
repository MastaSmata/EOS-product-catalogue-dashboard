import * as XLSX from 'xlsx';
import { PRODUCT_FIELDS } from '../data/product-schema.js';
import { formatCurrency, formatDateTime } from '../utils/formatting.js';
import { getUnitsSoldThisWeek } from '../utils/metrics.js';

function exportValue(product, field, sales) {
  const value = product[field.key];
  if (field.key === 'active') return value ? 'Active' : 'Not Active';
  if (field.key === 'tags') return Array.isArray(value) ? value.join(', ') : value || '';
  if (field.key === 'media') return (product.media || []).map((media) => media.url || media.name || '').filter(Boolean).join(' | ');
  if (field.key === 'costPrice' || field.key === 'price') return formatCurrency(value);
  if (field.key === 'createdAt' || field.key === 'updatedAt') return formatDateTime(value);
  return value ?? '';
}

function exportRows(products, sales) {
  const fields = PRODUCT_FIELDS;
  const headers = [...fields.map((field) => field.label), 'Sold This Week'];
  const rows = products.map((product) => [
    ...fields.map((field) => exportValue(product, field, sales)),
    getUnitsSoldThisWeek(sales, product.id),
  ]);
  return { headers, rows };
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function filenameDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
}

export function exportCsv(products, sales) {
  const { headers, rows } = exportRows(products, sales);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  downloadBlob(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }), `eos-pcm-products-${filenameDate()}.csv`);
}

export function exportXlsx(products, sales) {
  const { headers, rows } = exportRows(products, sales);
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet['!cols'] = headers.map((header, index) => ({ wch: Math.min(36, Math.max(14, index === 0 ? 30 : String(header).length + 4)) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Products');
  const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'array', compression: true });
  downloadBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `eos-pcm-products-${filenameDate()}.xlsx`);
}
