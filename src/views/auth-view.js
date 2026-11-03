import { BRANDING } from '../data/branding.js';
import { escapeHtml, icon, safeMediaUrl } from '../utils/dom.js';

function brandLogo() {
  const logoUrl = BRANDING.logoUrl ? safeMediaUrl(BRANDING.logoUrl) : '';
  return logoUrl
    ? `<img class="auth-brand-logo" src="${escapeHtml(logoUrl)}" alt="PCM logo" />`:'';
}

function renderLoading() {
  return `<main class="auth-page"><section class="auth-card auth-loading" aria-live="polite"><div class="auth-brand-lockup">${brandLogo()}<span>PCM</span></div><span class="spinner auth-spinner" aria-hidden="true"></span><h1>Connecting to your catalog</h1><p>Checking your local account and saved product records.</p></section></main>`;
}

function renderRecovery(state) {
  return `<main class="auth-page"><section class="auth-card"><div class="auth-brand-lockup">${brandLogo()}<span>PCM</span></div><p class="eyebrow">LOCAL SERVICE</p><h1>Catalog service unavailable</h1><p class="auth-intro">${escapeHtml(state.error || 'The FastAPI service could not be reached.')}</p><p class="auth-help">Start the local backend service, then retry. Your product data remains in the CSV store.</p><div class="auth-actions"><button type="button" class="button button-primary" data-action="retry-load">Try again</button><button type="button" class="button button-subtle" data-action="sign-out">Sign out</button></div></section></main>`;
}

export function renderAuthView(state) {
  if (state.authStatus === 'checking' || state.authStatus === 'loading') return renderLoading();
  if (state.authStatus === 'error') return renderRecovery(state);
  const isRegister = state.authMode === 'register';
  return `<main class="auth-page"><section class="auth-card${isRegister ? ' auth-card-register' : ''}" aria-labelledby="auth-title"><div class="auth-brand-lockup">${brandLogo()}</div><p class="eyebrow">PRODUCT CATALOG MANAGEMENT</p><h1 id="auth-title">${isRegister ? 'Create your catalog account' : 'Sign in to your catalog'}</h1><p class="auth-intro">${isRegister ? 'Set up a local workspace to manage product records, media, and account settings.' : 'Use your local PCM account to access your shared product records.'}</p><form class="auth-form" data-auth-form data-auth-mode="${state.authMode}" novalidate>
    ${isRegister ? `<label class="form-field" for="auth-display-name"><span class="form-label">Display name <span class="required-mark">*</span></span><input id="auth-display-name" name="display_name" type="text" maxlength="80" autocomplete="name" placeholder="Your name or business" required /></label>` : ''}
    <label class="form-field" for="auth-email"><span class="form-label">Email <span class="required-mark">*</span></span><input id="auth-email" name="email" type="email" maxlength="254" autocomplete="username" value="${escapeHtml(state.authEmail || '')}" placeholder="you@company.com" required /></label>
    <label class="form-field" for="auth-password"><span class="form-label">Password <span class="required-mark">*</span></span><input id="auth-password" name="password" type="password" maxlength="128" minlength="${isRegister ? '12' : '1'}" autocomplete="${isRegister ? 'new-password' : 'current-password'}" placeholder="${isRegister ? 'At least 12 characters' : 'Enter your password'}" required /></label>
    ${state.authError ? `<div class="auth-error" role="alert">${escapeHtml(state.authError)}</div>` : ''}
    <button class="button button-primary auth-submit" type="submit">${isRegister ? 'Create account' : 'Sign in'} ${icon('arrow', 15)}</button>
  </form><p class="auth-mode-switch">${isRegister ? 'Already have an account?' : 'New to PCM?'} <button type="button" class="text-button" data-action="auth-mode" data-mode="${isRegister ? 'login' : 'register'}">${isRegister ? 'Sign in' : 'Create an account'}</button></p><p class="auth-local-note">Local testing account · data is stored in this project's CSV files. No production email verification is provided.</p></section></main>`;
}
