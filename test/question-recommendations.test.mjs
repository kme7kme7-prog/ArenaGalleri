import assert from 'node:assert/strict';
import test from 'node:test';
import { recommendQuestions } from '../site/question-recommendations.js';

const NOW = Date.parse('2026-10-19T12:01:00Z');
const DAY = 86_400_000;
const HOUR = 3_600_000;
const work = (model, age = 0, extra = {}) => ({ model, status: 'verified', addedAt: new Date(NOW - age * DAY).toISOString(), ...extra });
const question = (id, count = 0, extra = {}) => ({ id, title: id, category: '建模', acceptsUploads: true,
  date: '2026-09-01', results: Array.from({ length: count }, (_, i) => work(`model-${i}`)), ...extra });
const rank = (tasks, options = {}) => recommendQuestions(tasks, { now: NOW, ...options });
const ids = rows => rows.map(row => row.task.id);
const fixture = () => [
  ...Array.from({ length: 8 }, (_, i) => question(`popular-${i}`, 12 + i)),
  ...Array.from({ length: 8 }, (_, i) => question(`zero-${i}`)),
  ...Array.from({ length: 8 }, (_, i) => question(`low-${i}`, 2)),
  ...Array.from({ length: 8 }, (_, i) => question(`new-${i}`, 5, { createdAt: '2026-10-18T09:00:00Z' })),
];

test('a full recommendation block reserves popular, unanswered, recent and under-tested positions', () => {
  const result = rank(fixture());
  assert.deepEqual(result.slice(0, 6).map(row => row.reason), ['popular', 'unanswered', 'popular', 'recent', 'popular', 'explore']);
  assert.equal(result[1].task.results.length, 0);
  assert.equal(result[5].task.results.length, 2);
  assert.equal(result.length, 32);
  assert.equal(new Set(ids(result)).size, 32, 'overlapping lanes cannot repeat a question');
});

test('recent cross-model participation can overtake a large inactive archive', () => {
  const archive = question('archive', 100, { results: Array.from({ length: 100 }, (_, i) => work(`old-${i}`, 90)) });
  const rising = question('rising', 20);
  assert.equal(rank([archive, rising])[0].task.id, 'rising');
});

test('repeating a model or its aliases cannot create unlimited popularity', () => {
  const base = question('repeated', 4);
  base.results.push(work('model-0'));
  const other = question('other', 5);
  const before = ids(rank([base, other]));
  const spam = structuredClone(base);
  spam.results.push(...Array.from({ length: 500 }, () => work('MODEL 0')));
  const key = item => item.model.toLowerCase().replace(/[\s-]/g, '');
  assert.deepEqual(ids(rank([spam, other], { modelKey: key })), before);
  const oneModel = question('one-model', 0, { results: Array.from({ length: 500 }, () => work('single')) });
  const result = rank([oneModel, other]);
  assert.equal(result[0].task.id, 'other');
  assert.equal(result.find(row => row.task.id === 'one-model').reason, 'explore');
});

test('questioned and unverified works do not manufacture popularity', () => {
  const pending = question('pending', 12, { results: Array.from({ length: 12 }, (_, i) => work(`pending-${i}`, 0, { status: 'unverified' })) });
  const questioned = question('questioned', 12, { results: Array.from({ length: 12 }, (_, i) => work(`bad-${i}`, 0, { status: 'questioned' })) });
  const genuine = question('genuine', 4);
  const result = rank([pending, questioned, genuine]);
  assert.equal(result[0].task.id, 'genuine');
  assert.equal(result.find(row => row.task.id === 'pending').reason, 'explore');
  assert.equal(result.find(row => row.task.id === 'questioned').reason, 'unanswered');
});

test('exploration is stable within six hours and cycles through every unanswered question', () => {
  const tasks = Array.from({ length: 13 }, (_, i) => question(`unanswered-${i}`));
  const original = structuredClone(tasks);
  assert.deepEqual(ids(rank(tasks)), ids(rank([...tasks].reverse(), { now: NOW + 5 * HOUR })));
  const firsts = new Set(Array.from({ length: tasks.length }, (_, i) => rank(tasks, { now: NOW + i * 6 * HOUR })[0].task.id));
  assert.equal(firsts.size, tasks.length);
  assert.notDeepEqual(ids(rank(tasks)), ids(rank(tasks, { batch: 1 })));
  assert.deepEqual(tasks, original, 'ranking cannot mutate tasks or their works');
});

test('changing the batch rotates discoveries while keeping the strongest popular question first', () => {
  const tasks = fixture().filter(task => !task.id.startsWith('new-'));
  const first = rank(tasks).slice(0, 6);
  const next = rank(tasks, { batch: 1 }).slice(0, 6);
  assert.equal(first[0].task.id, next[0].task.id);
  assert.notEqual(first[1].task.id, next[1].task.id);
  assert.notEqual(first[5].task.id, next[5].task.id);
});

test('closed or unreleased questions are not given exploration or new-question slots', () => {
  const tasks = fixture();
  const closed = question('closed', 0, { acceptsUploads: false, createdAt: '2026-10-19T01:00:00Z' });
  const hiddenPrompt = question('pending-prompt', 0, { promptPending: true, createdAt: '2026-10-19T01:00:00Z' });
  const result = rank([closed, hiddenPrompt, ...tasks]);
  assert.ok(result.slice(0, 6).every(row => !['closed', 'pending-prompt'].includes(row.task.id)));
  assert.equal(result.find(row => row.task.id === 'closed').reason, null);
  assert.equal(result.find(row => row.task.id === 'pending-prompt').reason, null);
  assert.equal(result.length, tasks.length + 2, 'readable closed questions remain in the complete library');
});

test('small or filtered pools remain complete, and missing or future dates do not get a freshness bonus', () => {
  assert.deepEqual(rank([]), []);
  const tasks = [question('missing', 1, { date: null }), question('invalid', 0, { date: 'invalid' }),
    question('future', 0, { createdAt: '2030-01-01', date: null }), question('one', 4)];
  const result = rank(tasks);
  assert.equal(result.length, 4);
  assert.equal(new Set(ids(result)).size, 4);
  assert.ok(result.every(row => row.reason !== 'recent'));
  assert.deepEqual(new Set(ids(rank(tasks.slice(0, 2)))), new Set(['missing', 'invalid']));
});

test('a recommendation lane avoids a third consecutive type when an alternative is available', () => {
  const popular = Array.from({ length: 6 }, (_, i) => question(`p-${i}`, 10));
  const zero = Array.from({ length: 6 }, (_, i) => question(`z-${i}`));
  const writing = question('writing', 4, { category: '文学' });
  const result = rank([...popular, ...zero, writing]);
  assert.equal(result[0].task.category, '建模');
  assert.equal(result[1].task.category, '建模');
  assert.equal(result[2].task.id, 'writing');
});

test('type diversity cannot repeatedly skip the exploration turn of a majority type', () => {
  const tasks = fixture();
  tasks.find(task => task.id === 'low-0').category = '文学';
  const explored = new Set(Array.from({ length: 8 }, (_, batch) => rank(tasks, { batch })[5].task.id));
  assert.equal(explored.size, 8, 'every under-tested question gets the early exploration slot');
});
