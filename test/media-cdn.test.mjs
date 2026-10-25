import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMediaCdnBase } from '../site/media-cdn.js';

test('image URLs keep the datapack cache key and move only synced paths', async () => {
  globalThis.document = { documentElement: { dataset: {} }, addEventListener() {} };
  const { versionedMedia } = await import('../site/ui.js');
  const cdn = 'https://media.arenaofbias.icu';
  assert.equal(normalizeMediaCdnBase(''), '');
  assert.equal(normalizeMediaCdnBase('https://media.arenaofbias.icu/'), cdn);
  globalThis.SAME_PROMPT_CONFIG = { assetVersion: 'abc', mediaCdnBaseUrl: '' };
  assert.equal(versionedMedia('assets/scenes/task/poster.webp'), 'assets/scenes/task/poster.webp?v=abc');
  assert.equal(versionedMedia('results/work/first.jpg'), 'results/work/first.jpg?v=abc');
  globalThis.SAME_PROMPT_CONFIG = { assetVersion: 'abc', mediaCdnBaseUrl: `${cdn}/` };
  assert.equal(versionedMedia('assets/scenes/task/poster.webp'), `${cdn}/assets/scenes/task/poster.webp?v=abc`);
  assert.equal(versionedMedia('assets/scenes/task/model.sbox?x=1'), `${cdn}/assets/scenes/task/model.sbox?x=1&v=abc`);
  assert.equal(versionedMedia('/media/work/first.jpg'), `${cdn}/media/work/first.jpg?v=abc`);
  assert.equal(versionedMedia('results/work/first.jpg'), 'results/work/first.jpg?v=abc');
  assert.equal(versionedMedia('assets/brands/claude.svg'), 'assets/brands/claude.svg?v=abc');
  assert.equal(versionedMedia(''), '');
});
