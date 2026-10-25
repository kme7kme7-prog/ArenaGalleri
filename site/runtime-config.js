// Set apiBaseUrl to the independently deployed server's API directory.
// mediaCdnBaseUrl is the read switch. Empty keeps /assets/scenes/ on this origin and
// /media/ on the API host (or mediaBaseUrl). A base such as https://media.arenaofbias.icu
// (no trailing slash) reads those relative keys from that host. Build with MEDIA_CDN_BASE_URL.
globalThis.SAME_PROMPT_CONFIG = { apiBaseUrl: 'api/', mediaCdnBaseUrl: '' };
