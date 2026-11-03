const activeUrls = new Set();

export function createMediaPreview(file) {
  const url = URL.createObjectURL(file);
  activeUrls.add(url);
  return url;
}

export function revokeMediaPreview(url) {
  if (!url || !activeUrls.has(url)) return;
  URL.revokeObjectURL(url);
  activeUrls.delete(url);
}

export function cleanupMediaPreviews() {
  activeUrls.forEach((url) => URL.revokeObjectURL(url));
  activeUrls.clear();
}
