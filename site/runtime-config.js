// Set apiBaseUrl to the independently deployed server's API directory.
// mediaCdnEnabled is omitted here, so it stays off: /assets/scenes/ remains same-origin
// and /media/ remains on the API host (or mediaBaseUrl). Set it to true to read those
// keys from https://media.arenaofbias.icu. Build with MEDIA_CDN_ENABLED=1 to bake that in.
globalThis.SAME_PROMPT_CONFIG = { apiBaseUrl: 'api/' };
