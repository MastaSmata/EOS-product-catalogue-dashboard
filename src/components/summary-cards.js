import { BRANDING } from '../data/branding.js';
import { calculateMetrics } from '../utils/metrics.js';
import { formatWeekRange } from '../utils/formatting.js';
import { escapeHtml, icon } from '../utils/dom.js';

const metrics = [
  { key: 'totalProducts', label: 'Total products', detail: 'Across active and inactive items', icon: 'box', tone: 'ink' },
  { key: 'activeProducts', label: 'Active products', detail: 'Enabled in this catalog', icon: 'check', tone: 'teal' },
  { key: 'soldThisWeek', label: 'Sold this week', detail: 'Units · current reporting week', icon: 'arrow', tone: 'blue' },
  { key: 'outOfStock', label: 'Out of stock', detail: 'Available quantity is zero', icon: 'archive', tone: 'coral' },
  { key: 'lowStock', label: 'Low stock', detail: 'At or below reorder threshold', icon: 'spark', tone: 'amber' },
];

const growthTones = Object.freeze({
  growing: 'growth-growing',
  stable: 'growth-stable',
  declining: 'growth-declining',
  volatile: 'growth-volatile',
  insufficient: 'growth-insufficient',
});

export function renderSummaryCards(products, sales) {
  const values = calculateMetrics(products, sales);
  const week = formatWeekRange();
  const brandName = BRANDING.merchantName.trim() || 'Brand name';
  const growth = values.monthlyGrowthStatus;
  const cards = [
    ...metrics.map((metric) => ({ ...metric, value: metric.key === 'soldThisWeek' && values[metric.key] == null ? '—' : values[metric.key], className: '' })),
    {
      key: 'monthlyGrowthStatus',
      label: 'Monthly Growth Status',
      detail: growth.detail,
      icon: 'spark',
      tone: 'growth',
      value: growth.label,
      className: `metric-growth-status metric-${growthTones[growth.key]}`,
    },
  ];

  return `<section class="catalogue-brand-heading" aria-labelledby="summary-title">
    <h1 id="summary-title">${escapeHtml(brandName)} - PCM Dashboard</h1>
    <span class="reporting-period">${icon('clock', 14)} ${week} <span class="timezone-note">· Europe/London</span></span>
  </section>
  <section class="summary-section" aria-label="Catalogue metrics">
    <div class="summary-grid">${cards.map((metric) => `<article class="metric-card ${metric.tone ? `metric-${metric.tone}` : ''} ${metric.className}" aria-label="${escapeHtml(metric.label)}: ${escapeHtml(metric.value)}">
      <div class="metric-top"><span>${metric.label}</span><span class="metric-icon">${icon(metric.icon, 17)}</span></div>
      <strong class="metric-value">${escapeHtml(metric.value)}</strong><small>${escapeHtml(metric.key === 'soldThisWeek' ? `${metric.detail}${sales.length ? ` · ${week}` : ' · no sales source connected'}` : metric.detail)}</small>
    </article>`).join('')}</div>
  </section>`;
}
