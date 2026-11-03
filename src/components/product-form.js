import { renderFormGroups } from './form-fields.js';
import { attachMediaPicker } from './media-picker.js';
import { getProductFields } from '../data/product-schema.js';
import { validateProduct } from '../utils/validation.js';
import { escapeHtml, icon } from '../utils/dom.js';

function currentDraft(form, product, media, variations) {
  const values = new FormData(form);
  const get = (key) => values.get(key) ?? '';
  const draft = {
    name: String(get('name')).trim(),
    category: String(get('category')).trim() || null,
    brand: String(get('brand')).trim() || null,
    cost_price: get('cost_price'),
    selling_price: get('selling_price'),
    currency: String(get('currency')).toUpperCase(),
    status: get('status'),
    track_inventory: get('track_inventory') === 'true' ? true : get('track_inventory') === 'false' ? false : null,
    stock_quantity: get('stock_quantity'),
    low_stock_threshold: get('low_stock_threshold'),
    description: String(get('description')).trim(),
    short_description: String(get('short_description')).trim() || null,
    weight: get('weight') === '' ? null : get('weight'),
    weight_unit: String(get('weight_unit')).trim() || null,
    tags: String(get('tags')).split(',').map((tag) => tag.trim()).filter(Boolean),
    media: media.getFiles(),
  };
  const fields = getProductFields(variations);
  for (const key of ['Color', 'Size']) {
    if (fields.some((field) => field.key === key)) draft[key] = String(get(key)).trim() || null;
  }
  const activeCustomFields = fields.filter((field) => field.variationKey);
  if (product || activeCustomFields.length) {
    draft.variations = { ...(product?.variations || {}) };
    activeCustomFields.forEach((field) => {
      draft.variations[field.variationKey] = String(get(field.key)).trim();
    });
  }
  if (product?.id) draft.id = product.id;
  return draft;
}

function markFieldErrors(form, errors) {
  form.querySelectorAll('.field-error').forEach((element) => {
    const message = errors[element.dataset.fieldError] || '';
    element.textContent = message;
    element.classList.toggle('is-visible', Boolean(message));
  });
  form.querySelectorAll('[name]').forEach((input) => {
    const invalid = Boolean(errors[input.name]);
    input.setAttribute('aria-invalid', String(invalid));
  });
  const firstError = Object.keys(errors)[0];
  const escaped = firstError ? CSS.escape(firstError) : '';
  const field = firstError && (form.querySelector(`[name="${escaped}"]`) || (firstError === 'media' ? form.querySelector('[data-media-field]') : null));
  field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  (field?.matches('input,select,textarea') ? field : field?.querySelector?.('input,select,textarea'))?.focus({ preventScroll: true });
}

export function openProductForm({ product = null, products = [], variations = [], currencies = [], defaultCurrency = '', onSave }) {
  const overlay = document.getElementById('overlay-root');
  const app = document.getElementById('app');
  const priorFocus = document.activeElement;
  const appWasInert = app.inert;
  const draftProduct = product ? { ...product } : null;
  overlay.innerHTML = `<dialog class="modal-dialog product-dialog" aria-labelledby="product-form-title"><div class="dialog-shell product-form-shell">
    <header class="dialog-header product-form-header"><div><p class="eyebrow">${product ? 'PRODUCT RECORD' : 'CATALOG SETUP'}</p><h2 id="product-form-title">${product ? 'Edit product' : 'Add a product'}</h2><p>${product ? `Update ${escapeHtml(product.name)} without changing other records.` : 'The details you add here appear in both catalog views.'}</p></div><button type="button" class="icon-button" aria-label="Close product form" data-close-form>${icon('close', 18)}</button></header>
    <form id="product-form" novalidate><div class="form-body">${renderFormGroups(draftProduct, variations, currencies, defaultCurrency)}<div class="form-save-error" role="alert" aria-live="polite" hidden></div></div><footer class="dialog-footer product-form-footer"><span class="form-required-note"><span class="required-mark">*</span> Required fields</span><div><button type="button" class="button button-subtle" data-cancel-form>Cancel</button><button type="submit" class="button button-primary" data-save-button>${icon('check', 15)}<span>${product ? 'Save changes' : 'Add product'}</span></button></div></footer></form>
  </div></dialog>`;
  const dialog = overlay.querySelector('dialog');
  const form = dialog.querySelector('#product-form');
  const saveButton = dialog.querySelector('[data-save-button]');
  const saveError = dialog.querySelector('.form-save-error');
  let dirty = false;
  const media = attachMediaPicker(dialog, product?.media || [], () => { dirty = true; });
  const initial = JSON.stringify(currentDraft(form, draftProduct, media, variations));
  let saving = false;
  let saved = false;
  let closed = false;

  const close = (confirmDiscard = false) => {
    if (closed) return;
    const hasUnsavedChanges = dirty && JSON.stringify(currentDraft(form, draftProduct, media, variations)) !== initial;
    if (confirmDiscard && hasUnsavedChanges && !window.confirm('Discard your unsaved product changes?')) return;
    closed = true;
    if (!saved) media.discard();
    app.inert = appWasInert;
    if (dialog.open) dialog.close();
    overlay.innerHTML = '';
    priorFocus?.focus?.({ preventScroll: true });
  };

  const updateDirty = () => {
    dirty = JSON.stringify(currentDraft(form, draftProduct, media, variations)) !== initial;
    saveError.hidden = true;
    form.querySelectorAll('.field-error').forEach((element) => {
      element.textContent = '';
      element.classList.remove('is-visible');
    });
    form.querySelectorAll('[aria-invalid="true"]').forEach((element) => element.removeAttribute('aria-invalid'));
  };
  form.addEventListener('input', updateDirty);
  form.addEventListener('change', updateDirty);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(true); });
  dialog.querySelector('[data-close-form]').addEventListener('click', () => close(true));
  dialog.querySelector('[data-cancel-form]').addEventListener('click', () => close(true));
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(true); });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    const draft = currentDraft(form, draftProduct, media, variations);
    const errors = validateProduct(draft, products, product?.id || null, currencies);
    markFieldErrors(form, errors);
    if (Object.keys(errors).length) return;

    saving = true;
    saveButton.disabled = true;
    saveButton.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Saving…</span>';
    saveError.hidden = true;
    try {
      await onSave(draft);
      saved = true;
      dirty = false;
      media.commit();
      close(false);
    } catch (error) {
      saving = false;
      saveButton.disabled = false;
      saveButton.innerHTML = `${icon('check', 15)}<span>${product ? 'Save changes' : 'Add product'}</span>`;
      saveError.textContent = error?.message || 'The product could not be saved. Your changes are still here. Please try again.';
      saveError.hidden = false;
    }
  });

  app.inert = true;
  dialog.showModal();
  dialog.querySelector('#field-name')?.focus({ preventScroll: true });
  return () => close(true);
}
