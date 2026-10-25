// Read switch for objects already stored on the media CDN.
// Off: gallery /assets/scenes/ stays same-origin, and API /media/ stays on the API host or mediaBaseUrl.
// On: those relative keys are read from the CDN. The path after the host does not change.
export const MEDIA_CDN_ORIGIN = 'https://media.arenaofbias.icu';

export function mediaCdnEnabled() {
  return globalThis.SAME_PROMPT_CONFIG?.mediaCdnEnabled === true;
}

const CDN_ROOTS = ['/media/', '/assets/scenes/'];

// Relative and root-relative keys only. Absolute URLs (token scenes, data, blob) stay as given.
function cdnKey(value) {
  if (typeof value !== 'string' || !value) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) return null;
  let url;
  try { url = new URL(value, 'https://gallery.local/'); }
  catch { return null; }
  const path = url.pathname;
  if (!CDN_ROOTS.some((root) => path === root.slice(0, -1) || path.startsWith(root))) return null;
  return `${path}${url.search}${url.hash}`;
}

export function cdnMediaUrl(value) {
  if (!mediaCdnEnabled()) return value;
  const key = cdnKey(value);
  return key ? `${MEDIA_CDN_ORIGIN}${key}` : value;
}
