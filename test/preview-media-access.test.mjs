import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as platformApi from '../site/platform-api.js';
import { cdnMediaUrl } from '../site/media-cdn.js';

const source = readFileSync(new URL('../site/preview-model.js', import.meta.url), 'utf8');

test('model reads send a session only to API media that stays off the CDN, preserving cancellation', async () => {
  globalThis.document = { baseURI: 'https://gallery.example/archive/' };
  globalThis.SAME_PROMPT_CONFIG = { apiBaseUrl: 'https://api.example/api/', mediaCdnBaseUrl: 'https://media.example' };
  const calls = [];
  const state = { ...platformApi, cdnMediaUrl,
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: false, status: 404 }; },
  };
  vm.runInNewContext(source.replace(/^import .*$/gm, '').replace(/^export /gm, '') + '\nglobalThis.readForTest=readModel;', state);
  try {
    const controller = new AbortController();
    for (const [url, credentials] of [
      ['https://api.example/media/up-abcd1234/preview.sbox?access=20261026', 'same-origin'],
      ['https://api.example:443/media/up-abcd1234/preview.sbox', 'same-origin'],
      ['assets/scenes/task/model.sbox', 'same-origin'],
      ['https://media.example/media/up-abcd1234/preview.sbox', 'same-origin'],
      ['https://api.example/api/private', 'same-origin'],
      ['https://api.example.evil.test/media/up-abcd1234/preview.sbox', 'same-origin'],
      ['https://api.example:8443/media/up-abcd1234/preview.sbox', 'same-origin'],
      ['https://user@api.example/media/up-abcd1234/preview.sbox', 'same-origin'],
      ['https://api.example/media/../api/private', 'same-origin'],
      ['https://api.example/media/references/secret.jpg', 'include'],
      ['https://api.example/media/pack-references/secret.jpg', 'include'],
    ]) {
      await assert.rejects(state.readForTest(url, controller.signal), /Model request failed: 404/);
      const call = calls.at(-1);
      assert.equal(call.url, cdnMediaUrl(url));
      assert.equal(call.options.credentials, credentials, url);
      assert.equal(call.options.signal, controller.signal);
    }
    assert.equal(calls[0].url, 'https://media.example/media/up-abcd1234/preview.sbox?access=20261026');
    assert.equal(calls[2].url, 'https://media.example/assets/scenes/task/model.sbox');
    assert.equal(calls.at(-2).url, 'https://api.example/media/references/secret.jpg');
    assert.equal(calls.at(-1).url, 'https://api.example/media/pack-references/secret.jpg');
    globalThis.SAME_PROMPT_CONFIG.apiBaseUrl = 'https://api.example/custom/api/';
    for (const [url, credentials] of [
      ['https://api.example/custom/media/up-abcd1234/preview.sbox', 'include'],
      ['https://api.example/media/up-abcd1234/preview.sbox', 'same-origin'],
    ]) {
      await assert.rejects(state.readForTest(url, controller.signal), /Model request failed: 404/);
      assert.equal(calls.at(-1).options.credentials, credentials, url);
    }
  } finally {
    delete globalThis.document;
    delete globalThis.SAME_PROMPT_CONFIG;
  }
});
