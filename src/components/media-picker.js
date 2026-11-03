import { ACCEPTED_MEDIA, IMAGE_MAX_BYTES, MEDIA_LIMIT, VIDEO_MAX_BYTES, mediaByteLimit } from '../utils/validation.js';
import { escapeHtml, icon, safeMediaUrl } from '../utils/dom.js';
import { createMediaPreview, revokeMediaPreview } from '../services/media-preview.js';

const MAX_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/tiff', 'video/mp4', 'video/webm', 'video/quicktime']);

export function attachMediaPicker(dialog, initialMedia = [], onDirty = () => {}) {
  const list = dialog.querySelector('[data-media-list]');
  const counter = dialog.querySelector('[data-media-counter]');
  const input = dialog.querySelector('[data-media-input]');
  const zone = dialog.querySelector('[data-drop-zone]');
  const error = dialog.querySelector('[data-field-error="media"]');
  let files = (initialMedia || []).map((item) => ({ ...item, source: 'server' }));
  const newUrls = new Set();
  const removedUrls = new Set();

  function setError(message = '') {
    error.textContent = message;
    error.classList.toggle('is-visible', Boolean(message));
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function render() {
    counter.textContent = `${files.length} of ${MEDIA_LIMIT} files added`;
    list.innerHTML = files.map((file, index) => {
      const url = file.url ? safeMediaUrl(file.url) : '';
      const type = String(file.type || file.content_type || '').toLowerCase();
      const fileName = file.name || file.filename || 'Product media';
      const size = Number(file.size || file.size_bytes || 0);
      const preview = type.startsWith('image/') && url
        ? `<img src="${escapeHtml(url)}" alt="Preview of ${escapeHtml(fileName)}" />`
        : type.startsWith('video/') && url
          ? `<video src="${escapeHtml(url)}" aria-label="Preview of ${escapeHtml(fileName)}" muted playsinline controls preload="metadata"></video>`
          : `<span class="media-file-icon">${icon(type.startsWith('video/') ? 'video' : 'image', 18)}</span>`;
      return `<div class="media-item"><div class="media-thumb">${preview}</div><div class="media-info"><strong title="${escapeHtml(fileName)}">${escapeHtml(fileName)}</strong><small>${type.startsWith('video/') ? 'Video · WebM' : 'Image · AVIF'} · ${size ? `${(size / (1024 * 1024)).toFixed(size < 1024 * 1024 ? 2 : 1)} MB` : 'Existing media'}</small></div><div class="media-item-actions"><button class="text-button" type="button" data-media-action="replace" data-index="${index}">Replace</button><button class="icon-button small" type="button" aria-label="Remove ${escapeHtml(fileName)}" data-media-action="remove" data-index="${index}">${icon('close', 14)}</button></div></div>`;
    }).join('');
    zone.classList.toggle('is-full', files.length >= MEDIA_LIMIT);
    input.disabled = files.length >= MEDIA_LIMIT;
    zone.setAttribute('aria-disabled', String(files.length >= MEDIA_LIMIT));
  }

  function validFile(file) {
    const type = String(file.type || '').toLowerCase();
    if (!MAX_TYPES.has(type)) return 'Choose a JPEG, PNG, WebP, GIF, AVIF, TIFF, MP4, WebM, or QuickTime file.';
    const limit = mediaByteLimit(type);
    if (file.size > limit) return `${file.name} exceeds the ${type.startsWith('video/') ? Math.round(VIDEO_MAX_BYTES / (1024 * 1024)) : Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB ${type.startsWith('video/') ? 'video' : 'image'} upload limit.`;
    return '';
  }

  function acceptFiles(incoming, replaceIndex = -1) {
    const selection = Array.from(incoming || []);
    if (!selection.length) return;
    const next = [...files];
    let firstError = '';
    for (let index = 0; index < selection.length; index += 1) {
      const file = selection[index];
      const invalid = validFile(file);
      if (invalid) { firstError ||= invalid; continue; }
      const slot = replaceIndex >= 0 && index === 0 ? replaceIndex : -1;
      if (slot < 0 && next.length >= MEDIA_LIMIT) { firstError ||= `A product can have up to ${MEDIA_LIMIT} media files.`; continue; }
      const url = createMediaPreview(file);
      newUrls.add(url);
      const item = { id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, url, source: 'local-preview', file };
      if (slot >= 0 && slot < next.length) {
        if (next[slot]?.url?.startsWith('blob:')) removedUrls.add(next[slot].url);
        next[slot] = item;
      } else next.push(item);
    }
    files = next;
    setError(firstError);
    onDirty();
    render();
  }

  input.accept = ACCEPTED_MEDIA;
  input.addEventListener('change', () => {
    acceptFiles(input.files);
    input.value = '';
  });
  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-media-action]');
    if (!button) return;
    const index = Number(button.dataset.index);
    if (button.dataset.mediaAction === 'remove') {
      const [removed] = files.splice(index, 1);
      if (removed?.url?.startsWith('blob:')) removedUrls.add(removed.url);
      setError('');
      onDirty();
      render();
      return;
    }
    const replacement = document.createElement('input');
    replacement.type = 'file';
    replacement.accept = ACCEPTED_MEDIA;
    replacement.addEventListener('change', () => acceptFiles(replacement.files, index), { once: true });
    replacement.click();
  });
  ['dragenter', 'dragover'].forEach((name) => zone.addEventListener(name, (event) => {
    event.preventDefault();
    if (files.length < MEDIA_LIMIT) zone.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach((name) => zone.addEventListener(name, (event) => {
    event.preventDefault();
    zone.classList.remove('is-dragging');
    if (name === 'drop') acceptFiles(event.dataTransfer?.files);
  }));
  render();

  return {
    getFiles: () => files.map((file) => ({ ...file })),
    commit() {
      newUrls.forEach(revokeMediaPreview);
      removedUrls.forEach(revokeMediaPreview);
    },
    discard() { newUrls.forEach(revokeMediaPreview); },
  };
}
