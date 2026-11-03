import { BRANDING } from '../data/branding.js';
import { escapeHtml, icon, safeMediaUrl } from '../utils/dom.js';
import { REPORTING_TIME_ZONE } from '../utils/formatting.js';

export function renderHeader(state) {
  const isCatalogue = state.view === 'catalogue';
  const brand = BRANDING.logoUrl ? safeMediaUrl(BRANDING.logoUrl) : '';
  const logo = brand
    ? `<img class="brand-logo" src="${escapeHtml(brand)}" alt="PCM logo" />`
    : `<span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span>`;
  const avatarInitial = String(state.user?.display_name || BRANDING.merchantName || 'G').trim().slice(0, 1).toUpperCase() || 'G';
  const avatar = `<span class="avatar-mark">${escapeHtml(avatarInitial)}</span>`;
  const menuAvatar = `<span class="avatar-mark avatar-mark-large">${escapeHtml(avatarInitial)}</span>`;
  const displayName = state.user?.display_name || BRANDING.merchantName || 'Merchant account';
  return `<header class="app-header">
    <a class="brand-lockup" href="#" aria-label="PCM home" data-action="navigate" data-view="catalogue">
      <span class="powered-by-label">Powered by:</span>${logo}<span class="brand-divider"></span>
      <span class="merchant-name">${escapeHtml(BRANDING.merchantName)}</span><span class="workspace-name">PCM ${isCatalogue ? 'Dashboard' : `Database <span class="workspace-timezone">&middot; ${REPORTING_TIME_ZONE}</span>`}</span>
    </a>
    <nav class="header-actions" aria-label="Workspace">
      <button class="button button-subtle view-switch" type="button" data-action="switch-view">${icon(isCatalogue ? 'table' : 'grid', 16)}<span>Switch to ${isCatalogue ? 'Database' : 'Catalogue'}</span></button>
      ${!isCatalogue ? `<button class="button button-primary export-trigger database-header-export" type="button" data-action="export-open">${icon('download', 16)}<span>Export</span></button>` : ''}
      <span class="header-action-divider ${isCatalogue ? '' : 'database-export-divider'}" aria-hidden="true"></span>
      <div class="profile-anchor">
        <button class="profile-button" type="button" aria-label="Open account menu" aria-haspopup="true" aria-expanded="${state.profileOpen}" data-action="profile-toggle">${avatar}<span class="profile-chevron">${icon('chevron', 14)}</span></button>
        ${state.profileOpen ? `<div class="popover profile-menu" role="menu" aria-label="Account menu">
          <div class="menu-person">${menuAvatar}<span><strong>${escapeHtml(displayName)}</strong><small>${escapeHtml(state.user?.email || 'Merchant account')}</small></span></div>
          <div class="menu-rule"></div>
          <button type="button" role="menuitem" class="menu-item" data-action="account-settings">${icon('settings', 14)} Account & product settings</button>
          <button type="button" role="menuitem" class="menu-item" data-action="change-login">Change password</button>
          <div class="menu-rule"></div><button type="button" role="menuitem" class="menu-item menu-item-danger" data-action="sign-out">Sign out</button>
          <p class="menu-footnote">Account changes are saved to the local FastAPI service.</p>
        </div>` : ''}
      </div>
    </nav>
  </header>`;
}
