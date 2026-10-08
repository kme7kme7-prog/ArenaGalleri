import assert from 'node:assert/strict';
import test from 'node:test';
import { rankSuggestions } from '../site/suggest.js';

const items = [
  { value: 'Claude Opus 4.6', keys: 'Anthropic', count: 30 },
  { value: 'GPT-5.6 Luna', keys: 'OpenAI', count: 2 },
  { value: 'GPT-5.6 Terra', keys: 'OpenAI', count: 5 },
  { value: 'GPT-6 Sol', keys: 'OpenAI', count: 1 },
  { value: 'GPT-6.1 Sol', keys: 'OpenAI', count: 4 },
  { value: 'MiMo V2.6 Flash', keys: 'Xiaomi', count: 9 },
  { value: 'MiniMax-M2.7', keys: 'MiniMax', count: 0 },
];
const names = (query) => rankSuggestions(query, items).map((i) => i.value);

test('version numbers match without dots, series first, then by works on the site', () => {
  assert.deepEqual(names('56'), ['GPT-5.6 Terra', 'GPT-5.6 Luna']);
  assert.deepEqual(names('6').slice(0, 2), ['GPT-6.1 Sol', 'GPT-6 Sol']);
  assert.equal(names('6').at(-1), 'GPT-5.6 Luna');
  assert.ok(names('6').indexOf('Claude Opus 4.6') > names('6').indexOf('GPT-6 Sol'));
  assert.deepEqual(names('luna 56'), ['GPT-5.6 Luna']);
  assert.equal(names('m2')[0], 'MiniMax-M2.7');
  assert.equal(names('openai').length, 4);
  assert.equal(names('')[0], 'Claude Opus 4.6');
});
