import { escapeHtml, icon } from '../utils/dom.js';

function renderVariationRows(variations = []) {
  if (!variations.length) return '<p class="settings-empty">No variation fields are configured.</p>';
  return variations.map((variation) => `<div class="variation-setting-row ${variation.active ? '' : 'is-inactive'}" data-variation-id="${escapeHtml(variation.id)}"><label class="form-field"><span class="form-label">Variation name</span><input type="text" maxlength="40" value="${escapeHtml(variation.display_name)}" data-variation-name="${escapeHtml(variation.id)}" ${variation.standard ? 'readonly' : ''} /></label><span class="variation-key">${escapeHtml(variation.key)} · ${variation.active ? 'Active' : 'Inactive'}</span><div class="variation-actions">${variation.standard ? '' : `<button type="button" class="button button-small button-subtle" data-settings-action="rename-variation" data-id="${escapeHtml(variation.id)}">Rename</button>`}<button type="button" class="button button-small ${variation.active ? 'button-subtle' : 'button-primary'}" data-settings-action="toggle-variation" data-id="${escapeHtml(variation.id)}" data-active="${variation.active}">${variation.active ? 'Deactivate' : 'Activate'}</button></div></div>`).join('');
}

function setResult(element, message, tone = 'success') {
  element.textContent = message;
  element.classList.add('is-visible');
  element.classList.toggle('is-error', tone === 'error');
}

export function openAccountDialog({ user, currencies = [], variations = [], onProfileSave, onEmailSave, onPasswordSave, onVariationAdd, onVariationUpdate, onVariationRemove, onLogout }) {
  const overlay = document.getElementById('overlay-root');
  const app = document.getElementById('app');
  const priorFocus = document.activeElement;
  const appWasInert = app.inert;
  const currencyOptions = [...new Set([...(currencies || []), ...(user?.preferred_currency ? [user.preferred_currency] : [])])];
  overlay.innerHTML = `<dialog class="modal-dialog account-dialog" aria-labelledby="account-title"><div class="dialog-shell account-shell"><header class="dialog-header"><div><p class="eyebrow">ACCOUNT SETTINGS</p><h2 id="account-title">Profile & settings</h2><p>Changes are saved to your authenticated local PCM account.</p></div><button type="button" class="icon-button" aria-label="Close account settings" data-account-close>${icon('close', 18)}</button></header><div class="account-settings-content">
    <section class="account-settings-section"><h3>Profile & currency</h3><form class="account-form" data-account-form="profile"><label class="form-label" for="account-email">Login email</label><input id="account-email" type="email" value="${escapeHtml(user?.email || '')}" disabled autocomplete="username" /><span class="field-hint">Change your login email in the separate security section below.</span><label class="form-label" for="account-display-name">Display name</label><input id="account-display-name" name="display_name" type="text" maxlength="80" required value="${escapeHtml(user?.display_name || '')}" autocomplete="name" /><label class="form-label" for="account-currency">Preferred currency</label><select id="account-currency" name="preferred_currency" required>${currencyOptions.map((code) => `<option value="${escapeHtml(code)}" ${user?.preferred_currency === code ? 'selected' : ''}>${escapeHtml(code)}</option>`).join('')}</select><span class="field-hint">Sets the currency for new products and display formatting. Existing prices are never converted.</span><p class="account-result" role="status" aria-live="polite"></p><button type="submit" class="button button-primary">Save profile</button></form></section>
    <section class="account-settings-section"><h3>Change login email</h3><form class="account-form" data-account-form="email"><label class="form-label" for="new-login-email">New login email</label><input id="new-login-email" name="new_email" type="email" maxlength="254" required autocomplete="email" value="${escapeHtml(user?.email || '')}" /><label class="form-label" for="email-current-password">Confirm current password</label><input id="email-current-password" name="current_password" type="password" required autocomplete="current-password" /><span class="field-hint">Changing the login email invalidates existing tokens and refreshes this session. No email verification is configured for local testing.</span><p class="account-result" role="status" aria-live="polite"></p><button type="submit" class="button button-primary">Update login email</button></form></section>
    <section class="account-settings-section"><h3>Change password</h3><form class="account-form" data-account-form="password"><label class="form-label" for="current-password">Current password</label><input id="current-password" name="current_password" type="password" required autocomplete="current-password" /><label class="form-label" for="new-password">New password</label><input id="new-password" name="new_password" type="password" minlength="12" maxlength="128" required autocomplete="new-password" /><span class="field-hint">Use at least 12 characters. Changing your password signs in with a fresh token.</span><label class="form-label" for="confirm-password">Confirm new password</label><input id="confirm-password" name="confirm_password" type="password" minlength="12" maxlength="128" required autocomplete="new-password" /><p class="account-result" role="status" aria-live="polite"></p><button type="submit" class="button button-primary">Change password</button></form></section>
    <section class="account-settings-section variations-settings"><div class="settings-heading"><div><h3>Product variations</h3><p>Active fields appear in the product form and Database. Deactivation preserves historical values.</p></div></div><div class="variation-settings-list" data-variation-list>${renderVariationRows(variations)}</div><form class="variation-add-form" data-account-form="variation-add"><label class="form-field"><span class="form-label" for="new-variation-name">Add a variation field</span><input id="new-variation-name" name="display_name" type="text" maxlength="40" placeholder="e.g. Material" required /></label><button class="button button-subtle" type="submit">${icon('plus', 14)} Add field</button><p class="account-result" role="status" aria-live="polite"></p></form></section>
    <section class="account-settings-section account-signout-section"><div><h3>Session</h3><p>Signing out invalidates this session token.</p></div><button type="button" class="button button-danger-soft" data-account-logout>Sign out</button></section>
  </div></div></dialog>`;
  const dialog = overlay.querySelector('dialog');
  const close = () => {
    app.inert = appWasInert;
    if (dialog.open) dialog.close();
    overlay.innerHTML = '';
    priorFocus?.focus?.({ preventScroll: true });
  };
  dialog.querySelectorAll('[data-account-close]').forEach((button) => button.addEventListener('click', close));
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  dialog.querySelector('[data-account-logout]').addEventListener('click', async () => {
    close();
    await onLogout?.();
  });

  const profileForm = dialog.querySelector('[data-account-form="profile"]');
  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = profileForm.querySelector('button[type="submit"]');
    const result = profileForm.querySelector('.account-result');
    button.disabled = true;
    try {
      await onProfileSave?.({
        display_name: profileForm.elements.display_name.value.trim(),
        preferred_currency: profileForm.elements.preferred_currency.value,
      });
      setResult(result, 'Profile and currency preference saved.');
    } catch (error) {
      setResult(result, error?.message || 'Profile could not be saved.', 'error');
    } finally { button.disabled = false; }
  });

  const emailForm = dialog.querySelector('[data-account-form="email"]');
  emailForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = emailForm.querySelector('button[type="submit"]');
    const result = emailForm.querySelector('.account-result');
    button.disabled = true;
    try {
      const updated = await onEmailSave?.({
        new_email: emailForm.elements.new_email.value.trim(),
        current_password: emailForm.elements.current_password.value,
      });
      const emailField = dialog.querySelector('#account-email');
      if (emailField) emailField.value = updated?.email || emailForm.elements.new_email.value.trim();
      emailForm.elements.current_password.value = '';
      setResult(result, 'Login email updated. Your session has been refreshed.');
    } catch (error) {
      setResult(result, error?.message || 'Login email could not be changed.', 'error');
    } finally { button.disabled = false; }
  });

  const passwordForm = dialog.querySelector('[data-account-form="password"]');
  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = passwordForm.querySelector('button[type="submit"]');
    const result = passwordForm.querySelector('.account-result');
    const currentPassword = passwordForm.elements.current_password.value;
    const newPassword = passwordForm.elements.new_password.value;
    const confirmation = passwordForm.elements.confirm_password.value;
    if (newPassword !== confirmation) { setResult(result, 'The new passwords do not match.', 'error'); return; }
    if (newPassword.length < 12) { setResult(result, 'Use at least 12 characters for the new password.', 'error'); return; }
    button.disabled = true;
    try {
      await onPasswordSave?.({ current_password: currentPassword, new_password: newPassword });
      passwordForm.reset();
      setResult(result, 'Password changed. Your session has been refreshed.');
    } catch (error) {
      setResult(result, error?.message || 'Password could not be changed.', 'error');
    } finally { button.disabled = false; }
  });

  const addVariationForm = dialog.querySelector('[data-account-form="variation-add"]');
  const variationList = dialog.querySelector('[data-variation-list]');
  addVariationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = addVariationForm.querySelector('button[type="submit"]');
    const result = addVariationForm.querySelector('.account-result');
    button.disabled = true;
    try {
      const updated = await onVariationAdd?.(addVariationForm.elements.display_name.value.trim());
      variationList.innerHTML = renderVariationRows(updated || []);
      addVariationForm.reset();
      setResult(result, 'Variation field added.');
    } catch (error) {
      setResult(result, error?.message || 'Variation field could not be added.', 'error');
    } finally { button.disabled = false; }
  });
  variationList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-settings-action]');
    if (!button) return;
    const id = button.dataset.id;
    const row = button.closest('[data-variation-id]');
    const input = row?.querySelector(`[data-variation-name="${CSS.escape(id)}"]`);
    button.disabled = true;
    try {
      const updated = button.dataset.settingsAction === 'rename-variation'
        ? await onVariationUpdate?.(id, { display_name: input?.value.trim() })
        : button.dataset.active === 'true'
          ? await onVariationRemove?.(id)
          : await onVariationUpdate?.(id, { active: true });
      variationList.innerHTML = renderVariationRows(updated || []);
    } catch (error) {
      const existing = row?.querySelector('.variation-key');
      if (existing) existing.insertAdjacentHTML('afterend', `<span class="field-error is-visible">${escapeHtml(error?.message || 'Variation could not be updated.')}</span>`);
      button.disabled = false;
    }
  });

  app.inert = true;
  dialog.showModal();
  dialog.querySelector('#account-display-name').focus({ preventScroll: true });
}
