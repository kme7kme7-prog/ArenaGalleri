import assert from 'node:assert/strict';
import test from 'node:test';
import { routeParts } from '../site/route-path.js';

test('route parts decode names once and preserve encoded slashes inside their segment', () => {
  assert.deepEqual(routeParts('#/questions/%E4%B8%89%E7%BB%B4#shots'), ['questions', '三维']);
  assert.deepEqual(routeParts('#/task%2Fname/work%2520name'), ['task/name', 'work%20name']);
  assert.deepEqual(routeParts(''), []);
});

test('malformed path encoding produces an invalid route without throwing', () => {
  for (const path of ['#/%', '#/questions/%GG', '#/leaderboard/%E4%B8', '#/task/%ED%A0%80']) assert.equal(routeParts(path), null);
  assert.deepEqual(routeParts('#/task#%'), ['task'], 'the panel marker is not a path segment');
});
