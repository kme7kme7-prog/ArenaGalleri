import { cdnMediaUrl } from './media-cdn.js';

// Runtime configuration keeps the static gallery and the API independently deployable.
export function apiBaseUrl() {
  const base = new URL(globalThis.SAME_PROMPT_CONFIG?.apiBaseUrl || 'api/', document.baseURI);
  if (base.pathname === '/') base.pathname = '/api/';
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return base;
}

export const apiUrl = (path) => new URL(path.replace(/^\/+/, ''), apiBaseUrl()).href;

export function compatibleBuild(buildInfo, bootstrap) {
  return Boolean(buildInfo && Object.hasOwn(buildInfo, 'datapack') && bootstrap.apiVersion === 2);
}

export function staleBuild(buildInfo, bootstrap) {
  if (typeof buildInfo.datapack === 'string' && /^[a-f0-9]{40}$/.test(buildInfo.datapack)) {
    return bootstrap.datapack !== buildInfo.datapack;
  }
  return buildInfo.datapack === null && bootstrap.datapack === null
    && typeof buildInfo.catalogDigest === 'string' && /^[a-f0-9]{64}$/.test(buildInfo.catalogDigest)
    && bootstrap.catalogDigest !== buildInfo.catalogDigest;
}

let datapackVersion = null;
export function setDatapackVersion(version) {
  datapackVersion = typeof version === 'string' && /^[a-f0-9]{40}$/.test(version) ? version : null;
}

// index.html starts the first reads before the modules arrive; each is taken once, by its first caller.
export function bootRead(name) {
  const boot = globalThis.GALLERY_BOOT, read = boot?.[name];
  if (read) delete boot[name];
  return read ?? null;
}

// Only writes are version-checked by the server; keeping reads free of the custom header
// spares cross-origin GETs a CORS preflight.
export function fetchApi(path, options = {}) {
  const headers = new Headers(options.headers);
  const write = !['GET', 'HEAD'].includes((options.method ?? 'GET').toUpperCase());
  if (datapackVersion && write) headers.set('X-Datapack-Version', datapackVersion);
  return fetch(apiUrl(path), { credentials: 'include', ...options, headers });
}

// Startup reads are GETs, so they are safe to repeat. Back off after no answer, a timeout, a body
// that is not JSON, or 429 (never sooner than its Retry-After); any other HTTP answer is final.
// One budget covers every attempt, so a slow link gets a few chances without a long wait.
export const READ_RETRY = { delays: [1000, 3000, 6000], budget: 45000, timeout: 15000 };
export async function retryRead(attempt, { delays, budget, timeout } = READ_RETRY) {
  const deadline = Date.now() + budget;
  for (let tries = 0; ; tries++) {
    try {
      return await attempt(Math.min(timeout, deadline - Date.now()), tries);
    } catch (error) {
      const limited = error?.kind === 'limited';
      if ((error?.kind && !limited) || tries >= delays.length) throw error;
      const wait = Math.max(delays[tries], limited ? (error.retryAt ?? 0) - Date.now() : 0);
      if (Date.now() + wait + 2000 > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

export function createUploadRequest(path) {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', apiUrl(path));
  xhr.withCredentials = true;
  if (datapackVersion) xhr.setRequestHeader('X-Datapack-Version', datapackVersion);
  return xhr;
}

export function mediaUrl(value) {
  if (!value || typeof value !== 'string') return value;
  const cdn = cdnMediaUrl(value);
  if (cdn !== value) return cdn;
  const configured = globalThis.SAME_PROMPT_CONFIG?.mediaBaseUrl;
  const base = configured ? new URL(configured, document.baseURI) : new URL('../', apiBaseUrl());
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return new URL(value.replace(/^\/+/, ''), base).href;
}

// The API sends media fields only for works whose files it hosts; packaged works keep the
// frontend's own assets, so a missing field stays missing.
const work = (item) => !item ? item : {
  ...item,
  ...(item.cover ? { cover: mediaUrl(item.cover) } : {}),
  ...Object.fromEntries(['previewModel', 'previewPoster', 'previewCapture'].filter((field) => item[field]).map((field) => [field, mediaUrl(item[field])])),
  ...(item.captures ? { captures: Object.fromEntries(Object.entries(item.captures).map(([name, url]) => [name, mediaUrl(url)])) } : {}),
};
const works = (items) => items?.map(work);
const question = (item) => !item ? item : {
  ...item,
  ...(item.references ? { references: item.references.map((ref) => ({ ...ref, src: mediaUrl(ref.src), ...(ref.thumb ? { thumb: mediaUrl(ref.thumb) } : {}) })) } : {}),
  ...(Array.isArray(item.samples) ? { samples: works(item.samples) } : {}),
};

// Only the API's known DTOs contain server media. Packaged assets remain on the frontend.
export function resolveApiMedia(data, endpoint) {
  if (!data || typeof data !== 'object') return data;
  if (['bootstrap', 'catalog', 'me', 'review', 'questions'].includes(endpoint) && Array.isArray(data.questions)) data = { ...data, questions: data.questions.map(question) };
  if (endpoint === 'review' && Array.isArray(data.autoWorks)) data = { ...data, autoWorks: works(data.autoWorks) };
  if (['bootstrap', 'catalog', 'me', 'review'].includes(endpoint)) return Array.isArray(data.works) ? { ...data, works: works(data.works) } : data;
  if (endpoint === 'work') return { ...data, work: work(data.work), ...(Object.hasOwn(data, 'question') ? { question: question(data.question) } : {}) };
  if (endpoint === 'question') return { ...data, question: question(data.question), ...(Array.isArray(data.works) ? { works: works(data.works) } : {}) };
  if (endpoint === 'draft') return { ...data, preview: data.preview ? new URL(data.preview, new URL('../', apiBaseUrl())).href : data.preview };
  if (endpoint === 'match') return { ...data, a: mediaUrl(data.a), b: mediaUrl(data.b) };
  if (endpoint === 'reveal') return { ...data, a: work(data.a), b: work(data.b) };
  return data;
}
