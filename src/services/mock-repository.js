import { getReportingWeekBounds, toDateKey } from '../utils/formatting.js';

const STORAGE_KEY = 'eos-pcm-demo-v1';
const wait = (ms = 120) => new Promise((resolve) => window.setTimeout(resolve, ms));

function makeMonthlyHistory(products, now = new Date()) {
  if (!products.length) return [];
  const [year, month, currentDay] = toDateKey(now).split('-').map(Number);
  const currentWeekStart = getReportingWeekBounds(now).start;
  const history = [];
  const baseUnits = { 0: 7, 1: 6, 2: 5 };

  for (let monthsAgo = 2; monthsAgo >= 0; monthsAgo -= 1) {
    const monthStart = new Date(Date.UTC(year, month - 1 - monthsAgo, 1, 12));
    const monthLastDay = new Date(Date.UTC(
      monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0, 12,
    )).getUTCDate();
    const throughDay = Math.min(currentDay, monthLastDay);

    for (let day = 1; day <= throughDay; day += 1) {
      const date = new Date(monthStart);
      date.setUTCDate(day);
      const dateKey = date.toISOString().slice(0, 10);
      if (monthsAgo === 0 && dateKey >= currentWeekStart) continue;
      const product = products[(day - 1) % products.length];
      const quantity = baseUnits[monthsAgo] + (day % 4 === 0 ? 1 : 0);
      history.push({
        id: `demo-history-${dateKey}`,
        productId: product.id,
        quantity,
        unitPrice: Number(product.price) || 0,
        occurredAt: `${dateKey}T12:15:00.000Z`,
      });
    }
  }
  return history;
}

function appendMissingMonthlyHistory(data, now = new Date()) {
  const existingIds = new Set(data.sales.map((sale) => sale.id));
  const missingHistory = makeMonthlyHistory(data.products, now).filter((sale) => !existingIds.has(sale.id));
  return missingHistory.length ? { ...data, sales: [...data.sales, ...missingHistory] } : data;
}

function makeSeed() {
  const now = new Date();
  const bounds = getReportingWeekBounds(now);
  const weekStart = new Date(`${bounds.start}T12:00:00Z`);
  const atDay = (offset, hour = 13) => {
    const date = new Date(weekStart);
    date.setUTCDate(date.getUTCDate() + offset);
    date.setUTCHours(hour, 15, 0, 0);
    return date.toISOString();
  };
  const created = (daysAgo) => new Date(now.getTime() - daysAgo * 86400000).toISOString();
  const products = [
    { id: 'prd-01', name: 'Field Notes Canvas Tote', sku: 'GT-BAG-104', category: 'Accessories', brand: 'PCM Studio', costPrice: 9.5, price: 32, stock: 42, lowStockThreshold: 12, active: true, description: 'A sturdy everyday carryall in natural cotton canvas.', tags: ['canvas', 'everyday'], media: [], createdAt: created(54), updatedAt: created(2) },
    { id: 'prd-02', name: 'Contour Ceramic Pitcher', sku: 'GT-HME-220', category: 'Home & Living', brand: 'Forma House', costPrice: 18, price: 58, stock: 7, lowStockThreshold: 10, active: true, description: 'Hand-finished stoneware with a soft, sculptural silhouette.', tags: ['ceramic', 'table'], media: [], createdAt: created(41), updatedAt: created(1) },
    { id: 'prd-03', name: 'Daily Mineral SPF 30', sku: 'GT-BTY-031', category: 'Beauty', brand: 'Morrow', costPrice: 8.25, price: 28, stock: 0, lowStockThreshold: 8, active: true, description: 'Lightweight mineral sunscreen for daily wear.', tags: ['skincare', 'daily'], media: [], createdAt: created(38), updatedAt: created(5) },
    { id: 'prd-04', name: 'Merino Trail Crew', sku: 'GT-OUT-418', category: 'Outdoor', brand: 'Northline', costPrice: 14, price: 46, stock: 24, lowStockThreshold: 8, active: true, description: 'Breathable merino blend for long days on the trail.', tags: ['merino', 'trail'], media: [], createdAt: created(30), updatedAt: created(3) },
    { id: 'prd-05', name: 'Ribbed Everyday Tank', sku: 'GT-APP-516', category: 'Apparel', brand: 'PCM Studio', costPrice: 11, price: 38, stock: 9, lowStockThreshold: 10, active: false, description: 'Soft cotton rib with a relaxed, versatile fit.', tags: ['cotton', 'basics'], media: [], createdAt: created(23), updatedAt: created(8) },
    { id: 'prd-06', name: 'Studio Desk Lamp', sku: 'GT-HME-302', category: 'Home & Living', brand: 'Forma House', costPrice: 27, price: 84, stock: 16, lowStockThreshold: 5, active: true, description: 'An adjustable metal lamp with a warm directional glow.', tags: ['lighting', 'desk'], media: [], createdAt: created(19), updatedAt: created(4) },
    { id: 'prd-07', name: 'Wireless Field Speaker', sku: 'GT-ELE-704', category: 'Electronics', brand: 'Aster Works', costPrice: 34, price: 98, stock: 5, lowStockThreshold: 6, active: true, description: 'Compact Bluetooth speaker with a durable weather-resistant shell.', tags: ['audio', 'travel'], media: [], createdAt: created(12), updatedAt: created(1) },
    { id: 'prd-08', name: 'Woven Market Scarf', sku: 'GT-ACC-112', category: 'Accessories', brand: 'Morrow', costPrice: 12, price: 42, stock: 31, lowStockThreshold: 9, active: false, description: 'A lightweight cotton weave in a versatile seasonal palette.', tags: ['cotton', 'gift'], media: [], createdAt: created(7), updatedAt: created(1) },
  ];
  const units = [8, 5, 7, 3, 2, 4, 6, 1];
  const sales = products.flatMap((product, index) => {
    const first = Math.ceil(units[index] * 0.6);
    return [
      { id: `sale-${index + 1}-a`, productId: product.id, quantity: first, occurredAt: atDay(0, 10 + (index % 4)) },
      { id: `sale-${index + 1}-b`, productId: product.id, quantity: units[index] - first, occurredAt: atDay(1 + (index % 3), 15) },
    ].filter((sale) => sale.quantity > 0);
  });
  return appendMissingMonthlyHistory({ products, sales }, now);
}

const clone = (value) => structuredClone(value);

function readPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return makeSeed();
    const data = JSON.parse(raw);
    if (!Array.isArray(data.products) || !Array.isArray(data.sales)) return makeSeed();
    return appendMissingMonthlyHistory(data);
  } catch {
    return makeSeed();
  }
}

let catalog = readPersisted();

function persist() {
  try {
    const products = catalog.products.map((product) => ({
      ...product,
      media: (product.media || []).map((file) => ({
        ...file,
        url: typeof file.url === 'string' && file.url.startsWith('blob:') ? '' : file.url,
      })),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ products, sales: catalog.sales }));
  } catch (error) {
    console.warn('Local demo data could not be saved.', error);
  }
}

export const mockRepository = {
  async loadCatalog() {
    await wait(260);
    return clone(catalog);
  },

  async saveProduct(draft) {
    await wait();
    const timestamp = new Date().toISOString();
    const saved = draft.id
      ? { ...draft, updatedAt: timestamp }
      : { ...draft, id: `prd-${crypto.randomUUID()}`, createdAt: timestamp, updatedAt: timestamp, archivedAt: null };
    const index = catalog.products.findIndex((product) => product.id === saved.id);
    catalog.products = index >= 0
      ? catalog.products.map((product) => product.id === saved.id ? saved : product)
      : [saved, ...catalog.products];
    persist();
    return clone(saved);
  },

  async setActivation(ids, active) {
    await wait();
    const timestamp = new Date().toISOString();
    catalog.products = catalog.products.map((product) => ids.includes(product.id)
      ? { ...product, active, updatedAt: timestamp }
      : product);
    persist();
    return clone(catalog.products.filter((product) => ids.includes(product.id)));
  },

  async archiveProducts(ids) {
    await wait();
    const timestamp = new Date().toISOString();
    catalog.products = catalog.products.map((product) => ids.includes(product.id)
      ? { ...product, archivedAt: timestamp, updatedAt: timestamp }
      : product);
    persist();
    return { archived: ids.length };
  },
};
