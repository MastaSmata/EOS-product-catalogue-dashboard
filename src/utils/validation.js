export const MEDIA_LIMIT = 3;
export const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const MEDIA_MAX_BYTES = VIDEO_MAX_BYTES;
export const MAX_VIDEO_SECONDS = 120;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/tiff']);
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const ISO_CURRENCY = /^[A-Z]{3}$/;

export const ACCEPTED_MEDIA = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES].join(',');

export function mediaByteLimit(type = '') {
  return String(type).startsWith('video/') ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
}

function decimalError(value, maxScale = 4) {
  if (value === '' || value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return 'Enter a non-negative number.';
  const digits = text.replace('.', '').replace(/^0+/, '') || '0';
  const scale = text.includes('.') ? text.split('.')[1].length : 0;
  if (digits.length > 18 || scale > maxScale) return `Use no more than ${maxScale} decimal places.`;
  return '';
}

export function validateProduct(draft, _products = [], _editingId = null, currencies = []) {
  const errors = {};
  if (!String(draft.name || '').trim()) errors.name = 'Add a product name.';
  if (String(draft.name || '').trim().length > 180) errors.name = 'Use 180 characters or fewer.';

  for (const [key, label] of [['cost_price', 'Cost price'], ['selling_price', 'Selling price']]) {
    const value = draft[key];
    if (value === '' || value === null || value === undefined) errors[key] = `${label} is required.`;
    else {
      const issue = decimalError(value, 4);
      if (issue) errors[key] = `${label} ${issue.charAt(0).toLocaleLowerCase()}${issue.slice(1)}`;
    }
  }

  const currency = String(draft.currency || '').toUpperCase();
  if (!ISO_CURRENCY.test(currency)) errors.currency = 'Choose a valid three-letter ISO currency.';
  else if (currencies.length && !currencies.includes(currency)) errors.currency = 'Choose a currency available in account settings.';

  if (!['draft', 'active'].includes(draft.status)) errors.status = 'Choose Draft or Active status.';
  if (typeof draft.track_inventory !== 'boolean') errors.track_inventory = 'Choose whether to track inventory.';

  for (const [key, label] of [['stock_quantity', 'Stock quantity'], ['low_stock_threshold', 'Low-stock threshold']]) {
    const value = draft[key];
    if (value === '' || value === null || value === undefined) {
      if (key === 'stock_quantity') errors[key] = `${label} is required.`;
    } else if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > 2_147_483_647) {
      errors[key] = `${label} must be a non-negative whole number.`;
    }
  }

  if (draft.weight !== '' && draft.weight !== null && draft.weight !== undefined) {
    const issue = decimalError(draft.weight, 6);
    if (issue) errors.weight = `Weight ${issue.charAt(0).toLocaleLowerCase()}${issue.slice(1)}`;
  }
  if (Array.isArray(draft.tags) && draft.tags.length > 50) errors.tags = 'Use no more than 50 tags.';

  const media = Array.isArray(draft.media) ? draft.media : [];
  if (media.length > MEDIA_LIMIT) errors.media = `Add no more than ${MEDIA_LIMIT} files.`;
  media.forEach((file, index) => {
    const size = Number(file.size ?? file.size_bytes ?? 0);
    const type = String(file.type || file.content_type || '').toLowerCase();
    const isExistingServerMedia = file.source === 'server' || (file.id && file.url && !String(file.url).startsWith('blob:'));
    if (!isExistingServerMedia && size > mediaByteLimit(type)) {
      errors.media = `File ${index + 1} exceeds the ${String(type).startsWith('video/') ? '100 MB video' : '15 MB image'} upload limit.`;
    }
    if (type && !ALLOWED_IMAGE_TYPES.has(type) && !ALLOWED_VIDEO_TYPES.has(type)) {
      errors.media = `File ${index + 1} is not a supported image or video.`;
    }
  });
  return errors;
}
