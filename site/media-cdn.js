// Read switch for objects already stored on the media CDN.
// The source of truth is mediaCdnBaseUrl (build env MEDIA_CDN_BASE_URL).
// Empty, unset, or invalid means off: gallery /assets/scenes/ stays same-origin
// and /media/ stays on the API host.
// A non-empty HTTP(S) base rewrites /assets/scenes/ and public /media/ keys onto
// that host. /media/references/ and /media/pack-references/ are left unchanged so
// mediaUrl can keep them on the API for access checks. Absolute http(s) URLs are
// rewritten only when their path is public /media/ and their endpoint is the
// configured API or https://api.arenaofbias.icu; path and query stay. blob, data,
// and any other host stay as given. An old mediaCdnEnabled boolean is not read.
const SCENE_ROOT = '/assets/scenes/';
const MEDIA_ROOT = '/media/';
const PROTECTED_MEDIA = ['/media/references', '/media/pack-references'];
const PRODUCTION_API = 'https://api.arenaofbias.icu';

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

function protectedMediaPath(pathname) {
  return PROTECTED_MEDIA.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

function scenePath(pathname) {
  return pathname === SCENE_ROOT.slice(0, -1) || pathname.startsWith(SCENE_ROOT);
}

function publicMediaPath(pathname) {
  return (pathname === MEDIA_ROOT.slice(0, -1) || pathname.startsWith(MEDIA_ROOT)) && !protectedMediaPath(pathname);
}

function configuredApiEndpoint() {
  const configured = globalThis.SAME_PROMPT_CONFIG?.apiBaseUrl;
  if (typeof configured !== 'string' || !configured.trim()) return null;
  try {
    const url = new URL(configured.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url;
  } catch { return null; }
}

function endpoint(url) {
  return `${url.protocol}//${url.hostname}:${url.port || (url.protocol === 'https:' ? '443' : '80')}`;
}

function apiMediaHost(url) {
  if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) return false;
  const here = endpoint(url);
  if (here === endpoint(new URL(PRODUCTION_API))) return true;
  const configured = configuredApiEndpoint();
  return Boolean(configured) && here === endpoint(configured);
}

// Relative and root-relative keys only. Scheme URLs are handled separately.
function cdnKey(value) {
  if (typeof value !== 'string' || !value) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) return null;
  let url;
  try { url = new URL(value, 'https://gallery.local/'); }
  catch { return null; }
  if (!scenePath(url.pathname) && !publicMediaPath(url.pathname)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

function absoluteCdnUrl(value, base) {
  let url;
  try { url = new URL(value); }
  catch { return null; }
  if (!apiMediaHost(url) || !publicMediaPath(url.pathname)) return null;
  return `${new URL(base).origin}${url.pathname}${url.search}${url.hash}`;
}

export function cdnMediaUrl(value) {
  const base = mediaCdnBaseUrl();
  if (!base || typeof value !== 'string' || !value) return value;
  const key = cdnKey(value);
  if (key) return `${base}${key}`;
  return absoluteCdnUrl(value, base) ?? value;
}
