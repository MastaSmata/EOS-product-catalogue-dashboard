import './styles/index.css';
import { api } from './api/client.js';
import { store } from './state/store.js';
import { renderHeader } from './components/header.js';
import { renderCatalogueView } from './views/catalogue-view.js';
import { renderDatabaseView } from './views/database-view.js';
import { renderAuthView } from './views/auth-view.js';
import { openProductForm } from './components/product-form.js';
import { openAccountDialog } from './components/account-dialog.js';
import { renderExportDialog } from './components/export-dialog.js';
import { cleanupMediaPreviews } from './services/media-preview.js';
import { getFilteredProducts, sortProducts } from './utils/product-query.js';
import { escapeHtml, debounce, safeMediaUrl } from './utils/dom.js';
import { BRANDING } from './data/branding.js';

const app = document.getElementById('app');
const overlay = document.getElementById('overlay-root');
const toastRoot = document.getElementById('toast-root');
const scrollPositions = { catalogue: 0, database: 0 };
let lastMenuId = null;
let lastFilterOpen = false;
let lastProfileOpen = false;
let mobileDockRequested = false;
let columnPressTimer = null;
let pressedColumnIndex = null;
let suppressNextHeaderClick = false;

function updateMobileDockVisibility() {
  const mobile = window.matchMedia('(max-width: 620px)').matches;
  const state = store.getState();
  const spreadsheet = app.querySelector('.database-main .spreadsheet-scroll');
  const databaseScrolled = window.scrollY > 110 || (spreadsheet && spreadsheet.scrollTop > 32);
  app.querySelectorAll('.mobile-scroll-dock').forEach((dock) => {
    const isDatabase = dock.classList.contains('database-mobile-dock');
    const visible = mobile && (isDatabase
      ? databaseScrolled || state.selectedIds.length > 0 || mobileDockRequested
      : window.scrollY > 110);
    dock.classList.toggle('is-visible', Boolean(visible));
    dock.setAttribute('aria-hidden', String(!visible));
    dock.inert = !visible;
  });
}

function getFocusSnapshot() {
  const active = document.activeElement;
  if (!active || !app.contains(active)) return null;
  if (active.matches('[data-auth-form] input') && active.id) return { selector: `#${CSS.escape(active.id)}`, start: active.selectionStart, end: active.selectionEnd };
  if (active.matches('[data-search]')) return { selector: '[data-search]', start: active.selectionStart, end: active.selectionEnd };
  if (active.matches('[data-filter]')) return { selector: `[data-filter="${CSS.escape(active.dataset.filter)}"]`, start: active.selectionStart, end: active.selectionEnd };
  if (active.matches('[data-select-id]')) return { selector: `[data-select-id="${CSS.escape(active.dataset.selectId)}"]` };
  if (active.matches('[data-select-all]')) return { selector: '[data-select-all]' };
  if (active.matches('[data-cell]')) return { selector: `[data-cell="${CSS.escape(active.dataset.cell)}"]` };
  if (active.matches('[data-action="filters-toggle"]')) return { selector: '[data-action="filters-toggle"]' };
  if (active.matches('[data-action="profile-toggle"]')) return { selector: '[data-action="profile-toggle"]' };
  return null;
}

function renderToast(state) {
  const toast = state.toast;
  toastRoot.innerHTML = toast ? `<div class="toast toast-${escapeHtml(toast.tone)}" role="status"><span class="toast-mark">${toast.tone === 'error' ? '!' : '✓'}</span><span>${escapeHtml(toast.message)}</span></div>` : '';
}

function render(state) {
  if (state.authStatus === 'loading' && app.querySelector('[data-auth-form]')) {
    const button = app.querySelector('[data-auth-form] button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = 'Checking account…'; }
    renderToast(state);
    return;
  }
  const focus = getFocusSnapshot();
  if (state.authStatus !== 'ready') {
    app.inert = false;
    const currentAuthForm = app.querySelector('[data-auth-form]');
    const authDraft = currentAuthForm ? {
      email: currentAuthForm.elements.email?.value || '',
      display_name: currentAuthForm.elements.display_name?.value || '',
      password: currentAuthForm.elements.password?.value || '',
    } : null;
    document.title = 'PCM - Sign in';
    app.innerHTML = renderAuthView(state);
    const nextAuthForm = app.querySelector('[data-auth-form]');
    if (authDraft && nextAuthForm) {
      if (nextAuthForm.elements.email) nextAuthForm.elements.email.value = authDraft.email || state.authEmail || '';
      if (nextAuthForm.elements.display_name) nextAuthForm.elements.display_name.value = authDraft.display_name;
      if (nextAuthForm.elements.password) nextAuthForm.elements.password.value = authDraft.password;
    }
    if (focus?.selector) {
      const target = app.querySelector(focus.selector);
      target?.focus({ preventScroll: true });
      if (target && typeof focus.start === 'number' && target.setSelectionRange) {
        try { target.setSelectionRange(focus.start, focus.end); } catch { /* unsupported input type */ }
      }
    }
    renderToast(state);
    return;
  }

  document.title = `${BRANDING.merchantName} - PCM ${state.view === 'catalogue' ? 'Dashboard' : 'Product Database'}`;
  const brandLogo = safeMediaUrl(BRANDING.logoUrl || '/groundtaq-logo.svg');
  app.innerHTML = `<div class="app-shell">${renderHeader(state)}${state.view === 'catalogue' ? renderCatalogueView(state) : renderDatabaseView(state)}<footer class="app-footer"><span><span>Powered by:</span>${brandLogo ? `<img class="footer-logo" src="${escapeHtml(brandLogo)}" alt="PCM logo" />` : ''}<span class="footer-divider">·</span> Product catalog management</span><span>FastAPI · CSV-backed records${state.sales.length ? '' : ' · sales source not connected'}</span></footer></div>`;
  updateMobileDockVisibility();
  if (focus?.selector) {
    const target = app.querySelector(focus.selector);
    target?.focus({ preventScroll: true });
    if (target && typeof focus.start === 'number' && target.setSelectionRange) {
      try { target.setSelectionRange(focus.start, focus.end); } catch { /* unsupported input type */ }
    }
  }
  if (state.menuId && state.menuId !== lastMenuId) app.querySelector('.card-menu .menu-item, .table-row-toolbox .button')?.focus({ preventScroll: true });
  if (state.filterOpen && !lastFilterOpen) app.querySelector('[data-filter="active"]')?.focus({ preventScroll: true });
  if (state.profileOpen && !lastProfileOpen) app.querySelector('.profile-menu [role="menuitem"]')?.focus({ preventScroll: true });
  lastMenuId = state.menuId;
  lastFilterOpen = state.filterOpen;
  lastProfileOpen = state.profileOpen;
  renderToast(state);
}

store.subscribe(render);
render(store.getState());
void store.load();

const updateQuery = debounce((value) => store.setQuery(value), 120);
const updateFilter = debounce((key, value) => {
  if (key.startsWith('variation:')) {
    const variationKey = key.slice('variation:'.length);
    store.setFilters({ variations: { [variationKey]: value === 'all' ? '' : value } });
  } else store.setFilters({ [key]: value });
}, 100);

function openForm(product = null) {
  const current = store.getState();
  openProductForm({
    product,
    products: current.products,
    variations: current.variations,
    currencies: current.availableCurrencies,
    defaultCurrency: current.user?.preferred_currency || 'NGN',
    onSave: async (draft) => {
      await store.saveProduct(draft);
      store.showToast(product ? 'Product changes saved.' : 'Product added to your shared catalog.');
    },
  });
}

function openAccount() {
  const current = store.getState();
  store.closeMenus();
  openAccountDialog({
    user: current.user,
    currencies: current.availableCurrencies,
    variations: current.variations,
    onProfileSave: (changes) => store.updateProfile(changes),
    onEmailSave: (changes) => store.changeEmail(changes),
    onPasswordSave: (changes) => store.changePassword(changes),
    onVariationAdd: (name) => store.addVariation(name),
    onVariationUpdate: (id, changes) => store.updateVariation(id, changes),
    onVariationRemove: (id) => store.removeVariation(id),
    onLogout: () => store.logout(),
  });
}

function openExport() {
  const state = store.getState();
  const filtered = sortProducts(getFilteredProducts(state.products, state.query, state.filters, state.variations), state.sort, state.variations);
  const all = state.products.filter((product) => !product.archivedAt && !product.deleted_at);
  const selected = all.filter((product) => state.selectedIds.includes(product.id));
  overlay.innerHTML = renderExportDialog(state, { all: all.length, filtered: filtered.length, selected: selected.length });
  const dialog = overlay.querySelector('dialog');
  const appWasInert = app.inert;
  app.inert = true;
  const close = () => {
    if (dialog.open) dialog.close();
    overlay.innerHTML = '';
    app.inert = appWasInert;
  };
  dialog.querySelectorAll('[data-action="export-close"]').forEach((button) => button.addEventListener('click', close));
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  dialog.querySelectorAll('[data-action="export-format"]').forEach((button) => button.addEventListener('click', async () => {
    const scope = dialog.querySelector('input[name="export-scope"]:checked')?.value || 'filtered';
    const records = scope === 'all' ? all : scope === 'selected' ? selected : filtered;
    const error = dialog.querySelector('[data-export-error]');
    if (!records.length) {
      if (error) { error.textContent = 'There are no eligible product records to export in this scope.'; error.hidden = false; }
      return;
    }
    const format = button.dataset.format;
    dialog.querySelectorAll('[data-action="export-format"]').forEach((control) => { control.disabled = true; });
    button.setAttribute('aria-busy', 'true');
    const original = button.querySelector('strong')?.textContent;
    if (button.querySelector('strong')) button.querySelector('strong').textContent = 'Preparing download…';
    if (error) error.hidden = true;
    try {
      const exportState = { ...state, exportScope: scope };
      const filename = await api.exportProducts(exportState, format, scope === 'selected' ? selected.map((product) => product.id) : []);
      close();
      store.showToast(`Downloaded ${filename}.`);
    } catch (requestError) {
      if (error) { error.textContent = requestError?.message || 'The export could not be created.'; error.hidden = false; }
      dialog.querySelectorAll('[data-action="export-format"]').forEach((control) => { control.disabled = false; });
      button.removeAttribute('aria-busy');
      if (button.querySelector('strong')) button.querySelector('strong').textContent = original || 'Download file';
    }
  }));
  dialog.showModal();
  dialog.querySelector('input[name="export-scope"]:checked')?.focus({ preventScroll: true });
}

async function changeActivation(ids, active, name = '') {
  const current = store.getState();
  const products = current.products.filter((product) => ids.includes(product.id) && !product.archivedAt);
  if (!products.length) return;
  const verb = active ? 'activate' : 'deactivate';
  const summary = name ? `“${name}”` : `${products.length} selected product${products.length === 1 ? '' : 's'}`;
  const message = active
    ? `Activate ${summary}? This changes the catalog status only; it does not publish the product to an external channel.`
    : `Deactivate ${summary}? Inventory and any recorded history will be preserved. This does not unpublish the product from an external channel.`;
  if (!window.confirm(message)) return;
  try {
    await store.setActivation(products.map((product) => product.id), active);
    store.showToast(`${products.length} product${products.length === 1 ? '' : 's'} ${verb}d.`);
  } catch (error) {
    store.showToast(error?.message || 'The status could not be changed. Please try again.', 'error');
  }
}

async function archiveProducts(ids) {
  const current = store.getState();
  const products = current.products.filter((product) => ids.includes(product.id) && !product.archivedAt);
  if (!products.length) return;
  const names = products.length === 1 ? `“${products[0].name}”` : `${products.length} products`;
  const message = `Delete ${names} from the active catalog? The FastAPI service soft-archives these records; normal views and exports will exclude them, and issued SKUs are never reused.`;
  if (!window.confirm(message)) return;
  try {
    await store.archiveProducts(products.map((product) => product.id));
    store.showToast(`${products.length} product${products.length === 1 ? '' : 's'} deleted from the active catalog.`);
  } catch (error) {
    store.showToast(error?.message || 'The product record could not be deleted. Please review the catalog.', 'error');
  }
}

function handleAction(element, event) {
  const action = element.dataset.action;
  const state = store.getState();
  const product = state.products.find((item) => item.id === element.dataset.id);
  switch (action) {
    case 'navigate':
      event.preventDefault();
      if (state.view !== element.dataset.view) switchView(element.dataset.view);
      break;
    case 'switch-view': switchView(state.view === 'catalogue' ? 'database' : 'catalogue'); break;
    case 'profile-toggle': store.toggleProfile(); break;
    case 'account-settings':
    case 'account-details':
    case 'change-login': openAccount(); break;
    case 'sign-out': void store.logout(); break;
    case 'auth-mode': store.setAuthMode(element.dataset.mode); break;
    case 'export-open': openExport(); break;
    case 'add-product': openForm(); break;
    case 'focus-catalogue-search': {
      const search = app.querySelector('.catalogue-toolbar [data-search]');
      if (search) { search.scrollIntoView({ behavior: 'smooth', block: 'center' }); window.setTimeout(() => search.focus({ preventScroll: true }), 180); }
      break;
    }
    case 'focus-catalogue-filter':
      store.toggleFilters();
      requestAnimationFrame(() => {
        app.querySelector('.catalogue-toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        app.querySelector('.catalogue-toolbar [data-action="filters-toggle"]')?.focus({ preventScroll: true });
      });
      break;
    case 'focus-database-search': app.querySelector('.database-toolbar [data-search]')?.focus({ preventScroll: true }); break;
    case 'focus-database-filter': store.toggleFilters(); break;
    case 'edit-product': store.closeMenus(); if (product) openForm(product); break;
    case 'edit-selected': {
      const selected = state.products.filter((item) => state.selectedIds.includes(item.id) && !item.archivedAt);
      if (selected.length === 1) openForm(selected[0]);
      break;
    }
    case 'product-menu':
    case 'row-menu': store.setMenu(element.dataset.id); break;
    case 'toggle-activation': if (product) void changeActivation([product.id], !product.active, product.name); break;
    case 'bulk-activate': void changeActivation(state.selectedIds, true); break;
    case 'bulk-deactivate': void changeActivation(state.selectedIds, false); break;
    case 'delete-one': void archiveProducts([element.dataset.id]); break;
    case 'bulk-delete': void archiveProducts(state.selectedIds); break;
    case 'layout': store.setLayout(element.dataset.layout); break;
    case 'filters-toggle': store.toggleFilters(); break;
    case 'filters-clear': store.clearFilters(); break;
    case 'filter-remove': {
      const key = element.dataset.filterKey;
      if (key === 'variation') store.setFilters({ variations: { [element.dataset.variationKey]: '' } });
      else store.setFilters({ [key]: ['minPrice', 'maxPrice'].includes(key) ? '' : 'all' });
      break;
    }
    case 'search-clear': store.setQuery(''); break;
    case 'sort': store.setSort(element.dataset.key); break;
    case 'retry-load': void store.load(); break;
    default: break;
  }
}

function switchView(view) {
  mobileDockRequested = false;
  const current = store.getState();
  scrollPositions[current.view] = window.scrollY;
  store.setView(view);
  requestAnimationFrame(() => window.scrollTo({ top: scrollPositions[view] || 0, behavior: 'auto' }));
}

app.addEventListener('click', (event) => {
  const authPage = event.target.closest('.auth-page');
  if (authPage) {
    const authAction = event.target.closest('[data-action]');
    if (authAction && app.contains(authAction)) {
      event.preventDefault();
      handleAction(authAction, event);
    }
    return;
  }
  const mobile = window.matchMedia('(max-width: 620px)').matches;
  const columnHeader = event.target.closest('.spreadsheet thead th[data-column-index]');
  if (mobile && columnHeader) {
    event.preventDefault();
    if (suppressNextHeaderClick) { suppressNextHeaderClick = false; return; }
    mobileDockRequested = true;
    updateMobileDockVisibility();
    return;
  }
  const tappedGridCell = event.target.closest('.spreadsheet tbody [data-cell], .spreadsheet tbody .row-index-cell');
  if (mobile && tappedGridCell && !event.target.closest('button,input,a,[role="menu"]')) {
    event.preventDefault();
    mobileDockRequested = true;
    updateMobileDockVisibility();
    return;
  }
  const actionElement = event.target.closest('[data-action]');
  if (actionElement && app.contains(actionElement)) {
    event.preventDefault();
    handleAction(actionElement, event);
    return;
  }
  const rowIndex = event.target.closest('.row-index-cell');
  if (rowIndex && !event.target.closest('button,input')) {
    const row = rowIndex.closest('[data-product-row]');
    if (row) store.toggleSelected(row.dataset.productRow);
    return;
  }
  const row = event.target.closest('[data-product-row]');
  if (row && !event.target.closest('button,input,a,[role="menu"]')) { store.toggleSelected(row.dataset.productRow); return; }
  const card = event.target.closest('.product-card');
  if (card && !event.target.closest('button,[role="menu"],a')) { store.setMenu(card.dataset.cardId); return; }
  const catalogueRow = event.target.closest('tr[data-catalogue-row]');
  if (catalogueRow && !event.target.closest('button,input,a,[role="menu"]')) { store.setMenu(catalogueRow.dataset.catalogueRow); return; }
  if (!event.target.closest('.popover,.filter-anchor,.profile-anchor,[data-select-id],[data-select-all]')) store.closeMenus();
});

function clearColumnPressTimer() {
  if (columnPressTimer) window.clearTimeout(columnPressTimer);
  columnPressTimer = null;
  pressedColumnIndex = null;
}

app.addEventListener('pointerdown', (event) => {
  if (!window.matchMedia('(max-width: 620px)').matches) return;
  const header = event.target.closest('.spreadsheet thead th[data-column-index]');
  if (!header || event.pointerType === 'mouse') return;
  clearColumnPressTimer();
  pressedColumnIndex = Number(header.dataset.columnIndex);
  columnPressTimer = window.setTimeout(() => {
    const index = pressedColumnIndex;
    if (!Number.isInteger(index)) return;
    app.querySelectorAll('.spreadsheet .is-column-marked').forEach((node) => node.classList.remove('is-column-marked'));
    app.querySelector(`.spreadsheet thead th[data-column-index="${index}"]`)?.classList.add('is-column-marked');
    app.querySelectorAll('.spreadsheet tbody td[data-cell]').forEach((cell) => {
      const column = Number(cell.dataset.cell.split(':')[1]);
      if (column === index) cell.classList.add('is-column-marked');
    });
    mobileDockRequested = true;
    suppressNextHeaderClick = true;
    updateMobileDockVisibility();
    columnPressTimer = null;
  }, 520);
}, { passive: true });

app.addEventListener('pointerup', clearColumnPressTimer, { passive: true });
app.addEventListener('pointercancel', clearColumnPressTimer, { passive: true });
app.addEventListener('pointerleave', clearColumnPressTimer, { passive: true });

app.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-auth-form]');
  if (!form) return;
  event.preventDefault();
  const state = store.getState();
  const emailField = form.elements.email;
  const email = emailField.value.trim();
  const password = form.elements.password.value;
  const displayName = form.elements.display_name?.value.trim() || '';
  const isRegister = state.authMode === 'register';
  if (!email || !emailField.validity.valid || !password || (isRegister && (!displayName || password.length < 12))) {
    store.setAuthEmail(email);
    store.setAuthError(isRegister
      ? 'Enter a valid email, display name, and password of at least 12 characters.'
      : 'Enter your email address and password.');
    return;
  }
  const values = isRegister ? { email, display_name: displayName, password } : { email, password };
  try { await store.authenticate(state.authMode, values); } catch { /* the store presents the API error on the login gate */ }
});

app.addEventListener('input', (event) => {
  if (event.target.matches('[data-search]')) updateQuery(event.target.value);
  if (event.target.matches('[data-filter]')) updateFilter(event.target.dataset.filter, event.target.value);
});
app.addEventListener('change', (event) => {
  if (event.target.matches('[data-filter]')) updateFilter(event.target.dataset.filter, event.target.value);
  if (event.target.matches('[data-select-id]')) {
    const selected = new Set(store.getState().selectedIds);
    if (event.target.checked) selected.add(event.target.dataset.selectId); else selected.delete(event.target.dataset.selectId);
    store.setSelected([...selected]);
  }
  if (event.target.matches('[data-select-all]')) {
    const state = store.getState();
    const visible = getFilteredProducts(state.products, state.query, state.filters, state.variations);
    const selected = new Set(state.selectedIds);
    visible.forEach((item) => event.target.checked ? selected.add(item.id) : selected.delete(item.id));
    store.setSelected([...selected]);
  }
});

app.addEventListener('keydown', (event) => {
  const catalogueRow = event.target.closest('tr[data-catalogue-row]');
  if (catalogueRow && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); store.setMenu(catalogueRow.dataset.catalogueRow); return; }
  const card = event.target.closest('.product-card');
  if (card && event.target === card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); store.setMenu(card.dataset.cardId); return; }
  const cell = event.target.closest('[data-cell]');
  if (cell && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    const [row, column] = cell.dataset.cell.split(':').map(Number);
    const rowCount = app.querySelectorAll('[data-product-row]').length;
    const columnCount = app.querySelectorAll('.spreadsheet thead th[data-column-index]').length;
    const nextRow = Math.max(0, Math.min(rowCount - 1, row + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0)));
    const nextColumn = Math.max(0, Math.min(columnCount - 1, column + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0)));
    app.querySelector(`[data-cell="${nextRow}:${nextColumn}"]`)?.focus({ preventScroll: false });
  } else if (cell && (event.key === ' ' || event.key === 'Enter')) {
    event.preventDefault();
    const id = cell.closest('[data-product-row]')?.dataset.productRow;
    if (id) store.toggleSelected(id);
  }
});

window.addEventListener('pcm-session-expired', () => store.sessionExpired());
window.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); app.querySelector('[data-search]')?.focus(); }
  if (event.key === 'Escape' && !overlay.querySelector('dialog[open]')) store.closeMenus();
});
window.addEventListener('beforeunload', cleanupMediaPreviews);
window.addEventListener('scroll', updateMobileDockVisibility, { passive: true });
window.addEventListener('resize', updateMobileDockVisibility, { passive: true });
app.addEventListener('scroll', updateMobileDockVisibility, { capture: true, passive: true });
