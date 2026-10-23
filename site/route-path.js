// Malformed percent escapes can arrive in a pasted/shared URL; they are an invalid route,
// not a fatal application error. Decode once, after separating path segments and panels.
export function routeParts(hash) {
  try { return hash.replace(/^#\/?/, '').split('#')[0].split('/').filter(Boolean).map(decodeURIComponent); }
  catch { return null; }
}
