import test from 'node:test';
import assert from 'node:assert/strict';
import { apiBaseUrl, apiUrl, compatibleBuild, createUploadRequest, fetchApi, mediaUrl, resolveApiMedia, setDatapackVersion, staleBuild } from '../site/platform-api.js';
import { cdnMediaUrl, normalizeMediaCdnBase } from '../site/media-cdn.js';

globalThis.document = { baseURI: 'https://gallery.example/archive/' };

test('platform keeps the API available across datapack versions', () => {
  const build = { datapack: 'a'.repeat(40) };
  assert.equal(compatibleBuild(build, { datapack: build.datapack, apiVersion: 2 }), true);
  assert.equal(compatibleBuild(build, { datapack: 'b'.repeat(40), apiVersion: 2 }), true);
  assert.equal(staleBuild(build, { datapack: 'b'.repeat(40), apiVersion: 2 }), true);
  assert.equal(staleBuild(build, { datapack: build.datapack, apiVersion: 2 }), false);
  assert.equal(compatibleBuild(build, { datapack: build.datapack, apiVersion: 1 }), false);
  assert.equal(compatibleBuild({ datapack: null }, { datapack: null, apiVersion: 2 }), true);
  assert.equal(compatibleBuild({ datapack: null, catalogDigest: 'c'.repeat(64) }, { datapack: null, catalogDigest: 'c'.repeat(64), apiVersion: 2 }), true);
  assert.equal(staleBuild({ datapack: null, catalogDigest: 'c'.repeat(64) }, { datapack: null, catalogDigest: 'd'.repeat(64), apiVersion: 2 }), true);
  assert.equal(compatibleBuild({}, { datapack: null, apiVersion: 2 }), false);
});

test('default API remains relative to the static gallery directory', () => {
  delete globalThis.SAME_PROMPT_CONFIG;
  assert.equal(apiUrl('bootstrap'), 'https://gallery.example/archive/api/bootstrap');
  assert.equal(mediaUrl('media/work/first.jpg'), 'https://gallery.example/archive/media/work/first.jpg');
});

test('configured API uses the backend for fetch and raw uploads with credentials', async () => {
  globalThis.SAME_PROMPT_CONFIG = { apiBaseUrl: 'https://server.example/api' };
  setDatapackVersion('a'.repeat(40));
  assert.equal(apiBaseUrl().href, 'https://server.example/api/');
  const originalFetch = globalThis.fetch;
  const originalXhr = globalThis.XMLHttpRequest;
  try {
    globalThis.fetch = async (url, options) => ({ url, options });
    const request = await fetchApi('auth/login', { method: 'POST' });
    assert.equal(request.url, 'https://server.example/api/auth/login');
    assert.equal(request.options.credentials, 'include');
    assert.equal(request.options.headers.get('X-Datapack-Version'), 'a'.repeat(40));
    assert.equal((await fetchApi('bootstrap')).options.headers.get('X-Datapack-Version'), null);
    const catalog = await fetchApi('catalog', { credentials: 'omit', cache: 'no-cache' });
    assert.equal(catalog.options.credentials, 'omit');
    assert.equal(catalog.options.cache, 'no-cache');
    assert.equal(catalog.options.headers.get('X-Datapack-Version'), null);
    globalThis.XMLHttpRequest = class { open(method, url) { this.method = method; this.url = url; } setRequestHeader(name, value) { this.headers ??= {}; this.headers[name] = value; } };
    const upload = createUploadRequest('drafts?task=keyboard&name=work.zip');
    assert.equal(upload.url, 'https://server.example/api/drafts?task=keyboard&name=work.zip');
    assert.equal(upload.method, 'POST');
    assert.equal(upload.withCredentials, true);
    assert.equal(upload.headers['X-Datapack-Version'], 'a'.repeat(40));
  } finally {
    setDatapackVersion(null);
    globalThis.fetch = originalFetch;
    globalThis.XMLHttpRequest = originalXhr;
  }
});

test('a backend origin resolves to /api/ without changing custom API directories', () => {
  for (const configured of ['https://server.example', 'https://server.example/']) {
    globalThis.SAME_PROMPT_CONFIG = { apiBaseUrl: configured };
    assert.equal(apiUrl('auth/turnstile'), 'https://server.example/api/auth/turnstile');
    assert.equal(apiUrl('auth/register'), 'https://server.example/api/auth/register');
    assert.equal(mediaUrl('media/work/cover.webp'), 'https://server.example/media/work/cover.webp');
  }
  globalThis.SAME_PROMPT_CONFIG = { apiBaseUrl: 'https://server.example/custom/api/' };
  assert.equal(apiUrl('auth/register'), 'https://server.example/custom/api/auth/register');
});

test('API media maps only known DTO fields, with a separate media service', () => {
  globalThis.SAME_PROMPT_CONFIG = { apiBaseUrl: 'https://server.example/api/', mediaBaseUrl: 'https://cdn.example/gallery' };
  const work = { scene: 'https://token.works.example/', cover: 'media/work/cover.webp', captures: { first: '/media/work/first.jpg' }, title: 'A plain title',
    previewModel: 'media/work/preview.sbox?v=123', previewPoster: 'media/work/preview.webp?v=123', previewCapture: 'media/work/preview.jpg?v=123', previewMode: 'model' };
  const question = { cover: 'w-1', promptUrl: 'prompts/task.md' };
  // A packaged work has no media fields; it keeps the frontend's own assets.
  const packaged = { task: 't', id: 'a', title: 'Packaged' };
  const boot = resolveApiMedia({ works: [work, packaged], questions: [question] }, 'bootstrap');
  assert.deepEqual(boot.works[1], packaged);
  assert.equal(boot.works[0].cover, 'https://cdn.example/gallery/media/work/cover.webp');
  assert.equal(boot.works[0].captures.first, 'https://cdn.example/gallery/media/work/first.jpg');
  assert.equal(boot.works[0].scene, work.scene);
  assert.equal(boot.works[0].previewModel, 'https://cdn.example/gallery/media/work/preview.sbox?v=123');
  assert.equal(boot.works[0].previewPoster, 'https://cdn.example/gallery/media/work/preview.webp?v=123');
  assert.equal(boot.works[0].previewCapture, 'https://cdn.example/gallery/media/work/preview.jpg?v=123');
  assert.equal(boot.works[0].previewMode, 'model');
  assert.deepEqual(boot.questions[0], question);
  assert.equal(resolveApiMedia({ works: [work] }, 'me').works[0].cover, boot.works[0].cover);
  assert.equal(resolveApiMedia({ works: [work] }, 'review').works[0].cover, boot.works[0].cover);
  assert.equal(resolveApiMedia({ work }, 'work').work.cover, boot.works[0].cover);
  assert.equal(resolveApiMedia({ a: work, b: work }, 'reveal').b.cover, boot.works[0].cover);
  assert.equal(resolveApiMedia({ preview: '/draft-preview/' }, 'draft').preview, 'https://server.example/draft-preview/');
  assert.equal(resolveApiMedia({ a: '/media/a/', b: 'https://sand.example/b/' }, 'match').a, 'https://cdn.example/gallery/media/a/');
  assert.equal(work.cover, 'media/work/cover.webp');
  assert.equal(mediaUrl('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(mediaUrl('blob:https://gallery.example/abc'), 'blob:https://gallery.example/abc');
});

test('the media CDN base rewrites only synced scene and API media keys', () => {
  const cdn = 'https://media.arenaofbias.icu';
  globalThis.SAME_PROMPT_CONFIG = { apiBaseUrl: 'https://server.example/api/', mediaBaseUrl: 'https://cdn.example/gallery', mediaCdnBaseUrl: '', mediaCdnEnabled: true };
  assert.equal(normalizeMediaCdnBase('https://media.arenaofbias.icu/'), cdn);
  assert.equal(mediaUrl('media/work/first.jpg'), 'https://cdn.example/gallery/media/work/first.jpg');
  assert.equal(cdnMediaUrl('assets/scenes/task/model.sbox'), 'assets/scenes/task/model.sbox');
  assert.equal(cdnMediaUrl('assets/work.sbox'), 'assets/work.sbox');
  assert.equal(cdnMediaUrl('results/work/first.jpg'), 'results/work/first.jpg');

  globalThis.SAME_PROMPT_CONFIG.mediaCdnBaseUrl = `${cdn}/`;
  assert.equal(mediaUrl('/media/work/first.jpg'), `${cdn}/media/work/first.jpg`);
  assert.equal(mediaUrl('media/work/cover.webp'), `${cdn}/media/work/cover.webp`);
  assert.equal(mediaUrl('media/work/preview.sbox?v=123'), `${cdn}/media/work/preview.sbox?v=123`);
  assert.equal(mediaUrl('/assets/scenes/task/model.sbox'), `${cdn}/assets/scenes/task/model.sbox`);
  assert.equal(cdnMediaUrl('assets/scenes/task/poster.webp'), `${cdn}/assets/scenes/task/poster.webp`);
  assert.equal(cdnMediaUrl('./assets/scenes/task/model.sbox'), `${cdn}/assets/scenes/task/model.sbox`);
  assert.equal(mediaUrl('assets/brands/claude.svg'), 'https://cdn.example/gallery/assets/brands/claude.svg');
  assert.equal(cdnMediaUrl('assets/avatars/a.svg'), 'assets/avatars/a.svg');
  assert.equal(cdnMediaUrl('assets/work.sbox'), 'assets/work.sbox');
  assert.equal(cdnMediaUrl('results/work/first.jpg'), 'results/work/first.jpg');
  assert.equal(mediaUrl('https://sand.example/media/b/'), 'https://sand.example/media/b/');
  assert.equal(mediaUrl('https://api.example/media/work/first.jpg'), 'https://api.example/media/work/first.jpg');
  assert.equal(mediaUrl('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(resolveApiMedia({ preview: '/draft-preview/' }, 'draft').preview, 'https://server.example/draft-preview/');
  const match = resolveApiMedia({ a: '/media/a/', b: 'https://sand.example/b/' }, 'match');
  assert.equal(match.a, `${cdn}/media/a/`);
  assert.equal(match.b, 'https://sand.example/b/');
  globalThis.SAME_PROMPT_CONFIG.mediaCdnBaseUrl = 'https://staging.media.example';
  assert.equal(mediaUrl('media/work/first.jpg'), 'https://staging.media.example/media/work/first.jpg');
});
