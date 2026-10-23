import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../site/arena.js', import.meta.url), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const chunk = (first, last) => source.slice(source.indexOf(first), source.indexOf(last, source.indexOf(first)));

function environment() {
  let version = 1;
  const reads = [], notices = [], deadlines = [];
  const e = { alive: true, DOMException, state: { match: { id: 'current' }, busy: false, counted: 0, tally: {} },
    accountVersion: () => version, platform: { user: { id: 'one' }, me: { votes: 10 }, totals: { votes: 20 } },
    task: { id: 'task' }, stopGate() {}, levelOf: () => 1, curatedKnown: () => null,
    canVote: () => true, canSkip: () => true, update() {}, drawBar() {}, prefetch() { e.prefetches++; }, prefetches: 0,
    toast: message => notices.push(message), performance: { now: () => 0 }, document: { hidden: false },
    hold: { mark: (...value) => deadlines.push(value), resume() {} }, later() { assert.fail('a rejected write must wait for another user action'); },
    api(path, options) { const request = { path, ...options, ...deferred() }; reads.push(request); return request.promise; },
    askHuman: options => { e.challenge = options; e.answer = deferred(); return e.answer.promise; },
  };
  vm.runInNewContext(chunk('  const owns =', '\n  const later') + chunk('  function accept(', '\n  function togglePrompt') + '\nglobalThis.voteForTest = vote; globalThis.verifyForTest = verifyVote;', e);
  return { e, reads, notices, deadlines, identity() { version++; e.platform.user = { id: 'two' }; e.platform.me = { votes: 50 }; } };
}

test('a late successful vote after departure or an account epoch change cannot update counters or prefetch', async () => {
  for (const change of ['departure', 'identity', 'match']) {
    const { e, reads, identity } = environment();
    const sending = e.voteForTest('a');
    if (change === 'departure') e.alive = false;
    else if (change === 'identity') identity();
    else e.state.match = { id: 'next' };
    reads[0].resolve({ counted: true }); await sending;
    assert.equal(e.platform.me.votes, change === 'identity' ? 50 : 10);
    assert.equal(e.platform.totals.votes, 20);
    assert.equal(e.prefetches, 0);
  }
});

test('a rejected early vote restores the same pair and waits for an explicit second vote', async () => {
  const { e, reads, deadlines, notices } = environment(), current = e.state.match;
  const first = e.voteForTest('a');
  reads[0].reject(Object.assign(new Error('early'), { code: 'vote_too_early', retryAfter: 2 })); await first;
  assert.equal(reads.length, 1); assert.equal(e.state.busy, false); assert.equal(e.state.match, current);
  assert.equal(deadlines.length, 2); assert.deepEqual(notices, ['请再多看一会儿再投票']);
  const second = e.voteForTest('a'); reads[1].resolve({ counted: true }); await second;
  assert.equal(e.platform.me.votes, 11); assert.equal(e.platform.totals.votes, 21); assert.equal(e.prefetches, 1);
});

test('a challenge cannot submit or accept a vote belonging to an old account epoch', async () => {
  const { e, reads, identity } = environment();
  const verifying = e.verifyForTest('a', { siteKey: 'fixture' });
  const pending = e.challenge.submit('token'); assert.equal(reads.length, 1);
  identity();
  assert.throws(() => e.challenge.submit('late-token'), { name: 'AbortError' });
  reads[0].resolve({ counted: true });
  e.answer.resolve({ value: await pending }); await verifying;
  assert.equal(e.platform.me.votes, 50); assert.equal(e.prefetches, 0);
});

test('ready acknowledgements cannot restart the hold after departure or identity change', async () => {
  for (const change of ['departure', 'identity']) {
    let version = 1, finish, marked = 0;
    const e = { alive: true, state: { match: { id: 'one' }, result: null }, accountVersion: () => version,
      hold: { begin() {}, mark() { marked++; }, resume() {} }, resetGate() {}, live() {}, seconds: () => 0, viewMs: () => 0,
      api: () => new Promise(resolve => { finish = resolve; }), performance: { now: () => 0 }, document: { hidden: false }, update() {}, syncGate() {}, voteWait: () => 1, skipWait: () => 1 };
    vm.runInNewContext(chunk('  const owns =', '\n  const later') + chunk('  function startGate()', '\n  function tickGate') + '\nglobalThis.start = startGate;', e);
    e.start(); if (change === 'departure') e.alive = false; else version++;
    finish({ serverNow: '2026-01-01', voteAllowedAt: '2026-01-02', skipAllowedAt: '2026-01-02' });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(marked, 0);
  }
});
