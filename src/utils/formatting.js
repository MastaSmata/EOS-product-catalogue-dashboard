export const REPORTING_TIME_ZONE = 'Europe/London';
export const REPORTING_CURRENCY = 'NGN';

const currencyFormatters = new Map();
const shortDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: REPORTING_TIME_ZONE,
});
const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  timeZone: REPORTING_TIME_ZONE,
});

function getCurrencyFormatter(currency = REPORTING_CURRENCY) {
  const code = /^[A-Z]{3}$/.test(String(currency)) ? String(currency) : REPORTING_CURRENCY;
  if (!currencyFormatters.has(code)) {
    try {
      currencyFormatters.set(code, new Intl.NumberFormat('en-US', {
        style: 'currency', currency: code, maximumFractionDigits: 2,
      }));
    } catch {
      currencyFormatters.set(code, new Intl.NumberFormat('en-US', {
        style: 'currency', currency: REPORTING_CURRENCY, maximumFractionDigits: 2,
      }));
    }
  }
  return currencyFormatters.get(code);
}

export function formatCurrency(value, currency = REPORTING_CURRENCY) {
  const number = Number(value);
  return Number.isFinite(number) ? getCurrencyFormatter(currency).format(number) : '—';
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : shortDateFormatter.format(date);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : dateTimeFormatter.format(date);
}

export function toDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: REPORTING_TIME_ZONE,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getReportingWeekBounds(now = new Date()) {
  const [year, month, day] = toDateKey(now).split('-').map(Number);
  const monday = new Date(Date.UTC(year, month - 1, day, 12));
  const weekday = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() - ((weekday + 6) % 7));
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);
  const dateKey = (date) => date.toISOString().slice(0, 10);
  return { start: dateKey(monday), end: dateKey(nextMonday), timeZone: REPORTING_TIME_ZONE };
}

export function formatWeekRange(now = new Date()) {
  const { start, end } = getReportingWeekBounds(now);
  const first = new Date(`${start}T12:00:00Z`);
  const last = new Date(new Date(`${end}T12:00:00Z`).getTime() - 86400000);
  return `${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: REPORTING_TIME_ZONE }).format(first)}–${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: REPORTING_TIME_ZONE }).format(last)}`;
}

export function statusForStock(product) {
  if (product.track_inventory === false) return 'in';
  const stock = Number(product.stock ?? product.stock_quantity) || 0;
  const threshold = Number(product.lowStockThreshold ?? product.low_stock_threshold) || 0;
  if (stock <= 0) return 'out';
  if (threshold > 0 && stock <= threshold) return 'low';
  return 'in';
}

export function titleCase(value = '') {
  return String(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}
