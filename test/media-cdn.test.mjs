import test from 'node:test';
import assert from 'node:assert/strict';
import { MEDIA_CDN_ORIGIN } from '../site/media-cdn.js';

test('image URLs keep the datapack cache key and move only synced paths', async () => {
  globalThis.document = { documentElement: { dataset: {} }, addEventListener() {} };
  const { versionedMedia } = await import('../site/ui.js');
  globalThis.SAME_PROMPT_CONFIG = { assetVersion: 'abc', mediaCdnEnabled: false };
  assert.equal(versionedMedia('assets/scenes/task/poster.webp'), 'assets/scenes/task/poster.webp?v=abc');
  assert.equal(versionedMedia('results/work/first.jpg'), 'results/work/first.jpg?v=abc');
  globalThis.SAME_PROMPT_CONFIG = { assetVersion: 'abc', mediaCdnEnabled: true };
  assert.equal(versionedMedia('assets/scenes/task/poster.webp'), `${MEDIA_CDN_ORIGIN}/assets/scenes/task/poster.webp?v=abc`);
  assert.equal(versionedMedia('assets/scenes/task/model.sbox?x=1'), `${MEDIA_CDN_ORIGIN}/assets/scenes/task/model.sbox?x=1&v=abc`);
  assert.equal(versionedMedia('/media/work/first.jpg'), `${MEDIA_CDN_ORIGIN}/media/work/first.jpg?v=abc`);
  assert.equal(versionedMedia('results/work/first.jpg'), 'results/work/first.jpg?v=abc');
  assert.equal(versionedMedia('assets/brands/claude.svg'), 'assets/brands/claude.svg?v=abc');
  assert.equal(versionedMedia(''), '');
});
