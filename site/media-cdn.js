// Read switch for objects already stored on the media CDN.
// The source of truth is mediaCdnBaseUrl (build env MEDIA_CDN_BASE_URL).
// Empty, unset, or invalid means off: gallery /assets/scenes/ stays same-origin,
// and API /media/ stays on the API host or mediaBaseUrl.
// A non-empty HTTP(S) base rewrites only those relative keys. An old mediaCdnEnabled
// boolean is not read; an empty base stays off even if that boolean is true.
const CDN_ROOTS = ['/media/', '/assets/scenes/'];

export function normalizeMediaCdnBase(value, strict = false) {
  if (typeof value !== 'string' || !value.trim()) return '';
  let url;
  try { url = new URL(value.trim()); }
  catch { if (strict) throw new Error('MEDIA_CDN_BASE_URL must be an HTTP(S) URL'); return ''; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    if (strict) throw new Error('MEDIA_CDN_BASE_URL must be an HTTP(S) URL without credentials, a query, or a hash');
    return '';
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

export function mediaCdnBaseUrl() {
  return normalizeMediaCdnBase(globalThis.SAME_PROMPT_CONFIG?.mediaCdnBaseUrl);
}

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
  const base = mediaCdnBaseUrl();
  if (!base) return value;
  const key = cdnKey(value);
  return key ? `${base}${key}` : value;
}
