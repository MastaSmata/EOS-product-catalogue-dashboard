
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

import {
  calculateMetrics,
  getUnitsSoldThisWeek,
} from '../src/utils/metrics.js';

import {
  getFilteredProducts,
  sortProducts,
} from '../src/utils/product-query.js';

import { validateProduct } from '../src/utils/validation.js';

import {
  exportCsv,
  exportXlsx,
} from '../src/services/export-service.js';

import { renderDatabaseView } from '../src/views/database-view.js';
import { renderHeader } from '../src/components/header.js';

const now = new Date('2026-10-14T10:00:00.000Z');

const products = [
  {
    id: 'p-1',
    name: 'Alpha "quote", Widget',
    sku: 'GT-QA-001',
    category: 'Apparel',
    brand: 'Test Co',
    costPrice: 4,
    selling_price: 11,
    price: 11,
    stock: 2,
    lowStockThreshold: 2,
    active: true,
    description: 'A sample product',
    tags: ['=SUM(1,1)'],
    media: [{
      name: 'alpha.jpg',
      url: 'https://cdn.example.test/alpha.jpg',
      type: 'image/jpeg',
      size: 0,
    }],
    createdAt: '2026-10-12T12:00:00.000Z',
    updatedAt: '2026-10-13T12:00:00.000Z',
    archivedAt: null,
  },
  {
    id: 'p-2',
    name: 'Zero Stock Widget',
    sku: 'GT-QA-002',
    category: 'Home & Living',
    brand: 'Test Co',
    costPrice: 2,
    selling_price: 5,
    price: 5,
    stock: 0,
    lowStockThreshold: 4,
    active: true,
    description: '',
    tags: [],
    media: [],
    createdAt: '2026-10-12T12:00:00.000Z',
    updatedAt: '2026-10-13T12:00:00.000Z',
    archivedAt: null,
  },
  {
    id: 'p-3',
    name: 'Stable Stock Widget',
    sku: 'GT-QA-003',
    category: 'Electronics',
    brand: 'Test Co',
    costPrice: 6,
    selling_price: 20,
    price: 20,
    stock: 21,
    lowStockThreshold: 5,
    active: false,
    description: '',
    tags: [],
    media: [],
    createdAt: '2026-10-12T12:00:00.000Z',
    updatedAt: '2026-10-13T12:00:00.000Z',
    archivedAt: null,
  },
  {
    id: 'p-4',
    name: 'Archived Widget',
    sku: 'GT-QA-004',
    category: 'Beauty',
    brand: 'Test Co',
    costPrice: 1,
    selling_price: 3,
    price: 3,
    stock: 0,
    lowStockThreshold: 2,
    active: true,
    description: '',
    tags: [],
    media: [],
    createdAt: '2026-10-12T12:00:00.000Z',
    updatedAt: '2026-10-13T12:00:00.000Z',
    archivedAt: '2026-10-13T12:00:00.000Z',
  },
];

const sales = [
  {
    id: 's-1',
    productId: 'p-1',
    occurredAt: '2026-10-12T01:00:00.000Z',
    quantity: 3,
  },
  {
    id: 's-2',
    productId: 'p-2',
    occurredAt: '2026-10-18T21:00:00.000Z',
    quantity: 4,
  },
  {
    id: 's-3',
    productId: 'p-3',
    occurredAt: '2026-10-19T00:00:00.000Z',
    quantity: 100,
  },
];

// Metrics and reporting.
const metrics = calculateMetrics(products, sales, now);
const { monthlyGrowthStatus, ...metricTotals } = metrics;

assert.deepEqual(metricTotals, {
  totalProducts: 3,
  activeProducts: 2,
  soldThisWeek: 7,
  outOfStock: 1,
  lowStock: 1,
});

assert.equal(
  monthlyGrowthStatus.key,
  'insufficient',
  'Missing comparison history is reported as insufficient',
);

assert.equal(getUnitsSoldThisWeek(sales, 'p-1', now), 3);

// Monthly growth classification.
const growthProduct = {
  id: 'growth-test',
  price: 1,
  stock: 1,
  active: true,
};

const growthStatusFor = (older, previous, current) =>
  calculateMetrics(
    [growthProduct],
    [
      {
        id: 'older-month',
        productId: growthProduct.id,
        occurredAt: '2026-08-14T12:00:00.000Z',
        quantity: older,
      },
      {
        id: 'previous-month',
        productId: growthProduct.id,
        occurredAt: '2026-09-14T12:00:00.000Z',
        quantity: previous,
      },
      {
        id: 'current-month',
        productId: growthProduct.id,
        occurredAt: '2026-10-14T12:00:00.000Z',
        quantity: current,
      },
    ],
    now,
  ).monthlyGrowthStatus;

assert.equal(growthStatusFor(80, 100, 130).label, 'Business is Growing');
assert.equal(growthStatusFor(100, 100, 102).label, 'Business is Stable');
assert.equal(growthStatusFor(100, 100, 80).label, 'Business is Declining');
assert.equal(growthStatusFor(100, 120, 90).label, 'Business is Volatile');

const monthEndStatus = calculateMetrics(
  [growthProduct],
  [
    {
      id: 'jan-28',
      productId: growthProduct.id,
      occurredAt: '2026-01-28T12:00:00.000Z',
      quantity: 5,
    },
    {
      id: 'jan-29',
      productId: growthProduct.id,
      occurredAt: '2026-01-29T12:00:00.000Z',
      quantity: 500,
    },
    {
      id: 'feb-28',
      productId: growthProduct.id,
      occurredAt: '2026-02-28T12:00:00.000Z',
      quantity: 5,
    },
    {
      id: 'mar-28',
      productId: growthProduct.id,
      occurredAt: '2026-03-28T12:00:00.000Z',
      quantity: 5,
    },
    {
      id: 'mar-29',
      productId: growthProduct.id,
      occurredAt: '2026-03-29T12:00:00.000Z',
      quantity: 500,
    },
  ],
  new Date('2026-03-31T10:00:00.000Z'),
).monthlyGrowthStatus;

assert.deepEqual(
  [
    monthEndStatus.olderRevenue,
    monthEndStatus.previousRevenue,
    monthEndStatus.currentRevenue,
  ],
  [5, 5, 5],
);

// Database view and mobile toolbar.
const allFilters = {
  active: 'all',
  category: 'all',
  stock: 'all',
  lowStock: 'all',
  minPrice: '',
  maxPrice: '',
};

const databaseState = (selectedIds = []) => ({
  products,
  sales,
  query: '',
  filters: allFilters,
  sort: { key: 'name', direction: 'asc' },
  selectedIds,
  menuId: null,
  filterOpen: false,
  error: '',
  view: 'database',
  profileOpen: false,
});

const databaseMarkup = renderDatabaseView(databaseState());

const databaseDock = (markup) =>
  markup.match(
    /<nav class="database-mobile-dock mobile-scroll-dock"[\s\S]*?<\/nav>/,
  )?.[0] ?? '';

for (const removed of [
  'Structured product data',
  'One dependable record set behind every product view.',
  'Demo workspace',
  'PRODUCT RECORDS',
  '<span>#</span>',
  'class="corner-add"',
  '8 shown',
]) {
  assert.equal(
    databaseMarkup.includes(removed),
    false,
    `Database View removes ${removed}`,
  );
}

// Verify title and toolbar existence before checking their order.
const mobileTitleIndex = databaseMarkup.indexOf(
  'class="database-mobile-title"',
);
const toolbarIndex = databaseMarkup.indexOf(
  'class="toolbar database-toolbar"',
);

assert.notEqual(mobileTitleIndex, -1, 'Database mobile title exists');
assert.notEqual(toolbarIndex, -1, 'Database toolbar exists');

assert.ok(
  mobileTitleIndex < toolbarIndex,
  'Database mobile title precedes the toolbar',
);

// Row selection and numbering remain; the removed row menu must not return.
assert.match(databaseMarkup, /class="row-select"/);
assert.match(databaseMarkup, /class="row-number">1<\/span>/);

assert.doesNotMatch(
  databaseMarkup,
  /class="row-menu-trigger"/,
  'Product rows no longer display a row menu',
);

assert.match(databaseMarkup, /<button[^>]+class="bottom-add-row"/);

const singleSelectMarkup = databaseDock(
  renderDatabaseView(databaseState(['p-1'])),
);

assert.match(singleSelectMarkup, /data-action="edit-selected"/);
assert.match(singleSelectMarkup, /Deactivate/);
assert.match(singleSelectMarkup, /data-action="bulk-delete"/);

const multiSelectMarkup = databaseDock(
  renderDatabaseView(databaseState(['p-1', 'p-2'])),
);

assert.equal(
  (multiSelectMarkup.match(/<button\b/g) ?? []).length,
  1,
  'Multi-select mobile dock exposes only Delete',
);

assert.match(multiSelectMarkup, /data-action="bulk-delete"/);

const noSelectDock = databaseDock(databaseMarkup);

assert.notEqual(noSelectDock, '', 'Default mobile action dock exists');

for (const action of [
  'add-product',
  'focus-database-search',
  'focus-database-filter',
  'export-open',
]) {
  assert.match(
    noSelectDock,
    new RegExp(`data-action="${action}"`),
  );
}

assert.match(
  renderHeader({ view: 'database', profileOpen: false }),
  /class="button button-primary export-trigger database-header-export"/,
);

// Filtering and sorting.
assert.deepEqual(
  getFilteredProducts(products, 'gt-qa-001', allFilters).map((item) => item.id),
  ['p-1'],
);

assert.deepEqual(
  getFilteredProducts(products, '', {
    ...allFilters,
    lowStock: 'low',
  }).map((item) => item.id),
  ['p-1'],
);

assert.deepEqual(
  getFilteredProducts(products, '', {
    ...allFilters,
    stock: 'out',
    active: 'active',
  }).map((item) => item.id),
  ['p-2'],
);

const sorted = sortProducts(products.slice(0, 3), {
  key: 'selling_price',
  direction: 'asc',
});

assert.deepEqual(sorted.map((item) => item.id), ['p-2', 'p-1', 'p-3']);

assert.deepEqual(
  products.slice(0, 3).map((item) => item.id),
  ['p-1', 'p-2', 'p-3'],
  'Sorting must not mutate source order',
);

// Product validation.
const goodDraft = {
  name: 'New Demo Product',
  sku: 'GT-QA-100',
  category: 'Accessories',
  brand: '',
  cost_price: 2,
  selling_price: 8,
  currency: 'USD',
  status: 'active',
  track_inventory: true,
  stock_quantity: 3,
  low_stock_threshold: 2,
  description: '',
  tags: [],
  media: [],
};

assert.deepEqual(validateProduct(goodDraft, products), {});

const requiredErrors = validateProduct(
  {
    ...goodDraft,
    name: '',
    sku: '',
    category: '',
    cost_price: '',
    selling_price: '',
    currency: '',
    status: '',
    track_inventory: '',
    stock_quantity: '',
  },
  products,
);

for (const field of [
  'name',
  'cost_price',
  'selling_price',
  'currency',
  'status',
  'track_inventory',
  'stock_quantity',
]) {
  assert.ok(requiredErrors[field], `Required validation for ${field}`);
}

assert.ok(validateProduct({ ...goodDraft, selling_price: -1 }, products).selling_price);

assert.match(
  validateProduct(
    {
      ...goodDraft,
      media: [{
        name: 'bad.pdf',
        type: 'application/pdf',
        size: 1,
      }],
    },
    products,
  ).media,
  /supported/i,
);

assert.match(
  validateProduct(
    {
      ...goodDraft,
      media: Array.from(
        { length: 4 },
        () => ({ name: 'a.jpg', type: 'image/jpeg', size: 1 }),
      ),
    },
    products,
  ).media,
  /no more than 3/i,
);

// CSV and XLSX exports.
let downloadedBlob = null;

const previousCreate = URL.createObjectURL;
const previousDocument = globalThis.document;
const previousWindow = globalThis.window;

URL.createObjectURL = (blob) => {
  downloadedBlob = blob;
  return 'blob:pcm-smoke-test';
};

globalThis.document = {
  body: { append() {} },
  createElement: () => ({ click() {}, remove() {} }),
};

globalThis.window = { setTimeout() {} };

try {
  exportCsv(products.slice(0, 3), sales);

  assert.ok(downloadedBlob, 'CSV export creates a Blob');

  const csvBytes = new Uint8Array(await downloadedBlob.arrayBuffer());

  assert.deepEqual(
    [...csvBytes.slice(0, 3)],
    [0xef, 0xbb, 0xbf],
    'CSV must include a UTF-8 BOM',
  );

  const csv = new TextDecoder().decode(csvBytes.slice(3));

  assert.ok(
    csv.includes('"Alpha ""quote"", Widget"'),
    'CSV quotes and commas must be escaped',
  );

  assert.ok(
    csv.includes('"\'=SUM(1,1)"'),
    'CSV formula-like text must be neutralized',
  );

  assert.ok(
    csv.includes('https://cdn.example.test/alpha.jpg'),
    'Media exports as a reference URL',
  );

  exportXlsx(products.slice(0, 3), sales);

  assert.ok(downloadedBlob, 'XLSX export creates a Blob');

  const workbook = XLSX.read(
    new Uint8Array(await downloadedBlob.arrayBuffer()),
    { type: 'array' },
  );

  assert.deepEqual(workbook.SheetNames, ['Products']);

  const rows = XLSX.utils.sheet_to_json(
    workbook.Sheets.Products,
    { header: 1, defval: '' },
  );

  assert.equal(
    rows.length,
    4,
    'XLSX contains one header and exactly one row per product',
  );

  const weeklySalesIndex = rows[0].indexOf('Sold This Week');

  assert.notEqual(
    weeklySalesIndex,
    -1,
    'XLSX includes the Sold This Week column',
  );

  const productNameIndex = rows[0].indexOf('Product Name');
  assert.notEqual(productNameIndex, -1, 'XLSX includes the Product Name column');
  assert.equal(rows[1][productNameIndex], products[0].name);

  assert.equal(
    rows[1][weeklySalesIndex],
    3,
    'Weekly units are included as a numeric value',
  );
} finally {
  URL.createObjectURL = previousCreate;

  if (previousDocument === undefined) {
    delete globalThis.document;
  } else {
    globalThis.document = previousDocument;
  }

  if (previousWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = previousWindow;
  }
}

console.log(
  'PCM smoke checks passed: metrics, monthly growth, reporting week, database view, mobile dock, filters, sorting, validation, CSV, and XLSX.',
);
