import assert from 'node:assert/strict';
import test from 'node:test';
import { closestEntry, rankSuggestions, textMatches } from '../site/match.js';

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

test('an unregistered name written like a registered model points to it, a new version does not', () => {
  const models = [
    { value: 'GPT-5.6 Luna', aliases: ['gpt-5-6-luna'] },
    { value: 'Claude Haiku 5.5', aliases: [] },
    { value: 'Seed 2.1 Lite', aliases: ['doubao-seed-2.1-lite'] },
  ];
  const guess = (name) => closestEntry(name, models)?.value ?? null;
  assert.equal(guess('gpt5.6 luna'), 'GPT-5.6 Luna');
  assert.equal(guess('luna GPT 5.6'), 'GPT-5.6 Luna');
  assert.equal(guess('Claude Hiaku 5.5'), 'Claude Haiku 5.5');
  assert.equal(guess('Doubao Seed 2.1 Lite'), 'Seed 2.1 Lite');
  assert.equal(guess('GPT-5.7 Luna'), null);
  assert.equal(guess('GPT-5.6 Luna Pro'), null);
});

test('searches match words separately and version numbers without dots', () => {
  assert.ok(textMatches('56', 'GPT-5.6 Luna xhigh OpenAI'));
  assert.ok(textMatches('luna 56', 'GPT-5.6 Luna xhigh OpenAI'));
  assert.ok(textMatches('云山', '云山古刹 · Claude Opus 5.5'));
  assert.ok(textMatches('', 'anything'));
  assert.ok(!textMatches('57', 'GPT-5.6 Luna xhigh OpenAI'));
});
