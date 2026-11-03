import { getReportingWeekBounds, toDateKey } from './formatting.js';

const GROWTH_LABELS = Object.freeze({
  growing: 'Business is Growing',
  stable: 'Business is Stable',
  declining: 'Business is Declining',
  volatile: 'Business is Volatile',
  insufficient: 'Insufficient sales history',
});
const STABLE_BAND_PERCENT = 5;
const VOLATILE_REVERSAL_PERCENT = 10;

export function getUnitsSoldThisWeek(sales, productId, now = new Date()) {
  const { start, end } = getReportingWeekBounds(now);
  return sales.reduce((total, sale) => {
    if (sale.productId !== productId || !sale.occurredAt) return total;
    const date = toDateKey(new Date(sale.occurredAt));
    return date >= start && date < end ? total + Number(sale.quantity || 0) : total;
  }, 0);
}

function comparableMonthWindow(now, monthsAgo) {
  const [year, month, currentDay] = toDateKey(now).split('-').map(Number);
  const comparableDay = [0, 1, 2].reduce((limit, offset) => {
    const candidate = new Date(Date.UTC(year, month - 1 - offset, 1, 12));
    const candidateEnd = new Date(Date.UTC(
      candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0, 12,
    )).getUTCDate();
    return Math.min(limit, candidateEnd);
  }, currentDay);
  const monthStartDate = new Date(Date.UTC(year, month - 1 - monthsAgo, 1, 12));
  const monthEndDay = new Date(Date.UTC(
    monthStartDate.getUTCFullYear(), monthStartDate.getUTCMonth() + 1, 0, 12,
  )).getUTCDate();
  const throughDay = Math.min(comparableDay, monthEndDay);
  const endDate = new Date(monthStartDate);
  endDate.setUTCDate(throughDay + 1);
  return {
    start: monthStartDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
  };
}

function revenueForComparablePeriod(productsById, sales, now, monthsAgo) {
  const { start, end } = comparableMonthWindow(now, monthsAgo);
  return sales.reduce((total, sale) => {
    if (!sale.occurredAt) return total;
    const occurredAt = new Date(sale.occurredAt);
    if (!Number.isFinite(occurredAt.valueOf())) return total;
    const dateKey = toDateKey(occurredAt);
    if (dateKey < start || dateKey >= end) return total;

    const product = productsById.get(sale.productId);
    const quantity = Number(sale.quantity || 0);
    const recordedRevenue = sale.revenue == null ? NaN : Number(sale.revenue);
    const unitPrice = sale.unitPrice == null ? Number(product?.price) : Number(sale.unitPrice);
    const revenue = Number.isFinite(recordedRevenue) ? recordedRevenue : quantity * unitPrice;
    return Number.isFinite(revenue) ? total + revenue : total;
  }, 0);
}

function percentageChange(current, previous) {
  if (previous > 0) return ((current - previous) / previous) * 100;
  return current === 0 && previous === 0 ? 0 : null;
}

function signedPercent(value) {
  if (value == null) return '—';
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

/**
 * Compare current MTD revenue with matching elapsed days in each of the prior two months.
 * Volatile means two meaningful (>=10%) consecutive changes reversed direction;
 * otherwise changes strictly within +/-5% are stable; changes at/beyond that band are classified
 * as growing or declining.
 */
export function classifyMonthlyGrowthStatus(currentRevenue, previousRevenue, olderRevenue) {
  const currentChange = previousRevenue > 0 ? percentageChange(currentRevenue, previousRevenue) : null;
  const previousChange = olderRevenue > 0 ? percentageChange(previousRevenue, olderRevenue) : null;
  const reversedTrend = currentChange != null && previousChange != null
    && currentChange * previousChange < 0
    && Math.abs(currentChange) >= VOLATILE_REVERSAL_PERCENT
    && Math.abs(previousChange) >= VOLATILE_REVERSAL_PERCENT;

  let key = currentChange == null ? 'insufficient' : 'stable';
  if (reversedTrend) key = 'volatile';
  else if (currentChange != null && currentChange >= STABLE_BAND_PERCENT) key = 'growing';
  else if (currentChange != null && currentChange <= -STABLE_BAND_PERCENT) key = 'declining';

  let detail;
  if (currentChange == null) {
    detail = 'No prior-period sales recorded';
  } else if (key === 'volatile') {
    detail = `Trend reversed ${signedPercent(previousChange)} to ${signedPercent(currentChange)}`;
  } else {
    detail = `${signedPercent(currentChange)} revenue vs same period last month`;
  }

  return {
    key,
    label: GROWTH_LABELS[key],
    detail,
    changePercent: currentChange,
    previousChangePercent: previousChange,
    currentRevenue,
    previousRevenue,
    olderRevenue,
  };
}

export function calculateMonthlyGrowthStatus(products, sales, now = new Date()) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const currentRevenue = revenueForComparablePeriod(productsById, sales, now, 0);
  const previousRevenue = revenueForComparablePeriod(productsById, sales, now, 1);
  const olderRevenue = revenueForComparablePeriod(productsById, sales, now, 2);
  return classifyMonthlyGrowthStatus(currentRevenue, previousRevenue, olderRevenue);
}

export function calculateMetrics(products, sales, now = new Date()) {
  const current = products.filter((product) => !product.archivedAt);
  const tracked = current.filter((product) => product.track_inventory !== false);
  const outOfStock = tracked.filter((product) => Number(product.stock) <= 0).length;
  const lowStock = tracked.filter((product) => Number(product.stock) > 0
    && Number(product.lowStockThreshold) > 0
    && Number(product.stock) <= Number(product.lowStockThreshold)).length;
  const { start, end } = getReportingWeekBounds(now);
  const soldThisWeek = sales.length ? sales.reduce((total, sale) => {
    const date = sale.occurredAt ? toDateKey(new Date(sale.occurredAt)) : '';
    return date >= start && date < end ? total + Number(sale.quantity || 0) : total;
  }, 0) : null;
  return {
    totalProducts: current.length,
    activeProducts: current.filter((product) => product.active).length,
    soldThisWeek,
    outOfStock,
    lowStock,
    monthlyGrowthStatus: calculateMonthlyGrowthStatus(products, sales, now),
  };
}
