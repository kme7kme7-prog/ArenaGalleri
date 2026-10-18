import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHold, loadPair, watchFrameLoad } from '../site/arena-loading.js';

test('draw timeout aborts transport and rejects even if the transport returns late; cancellation stops pending draws', async () => {
  let signal, finish;
  const request = loadPair(value => { signal = value; return new Promise(resolve => { finish = resolve; }); }, { timeout: 10 });
  await assert.rejects(request.promise, { code: 'match-timeout' });
  assert.equal(signal.aborted, true);
  finish({ id: 'late' });
  let called = false;
  const cancelled = loadPair(() => { called = true; });
  cancelled.cancel();
  await assert.rejects(cancelled.promise, { name: 'AbortError' });
  assert.equal(called, false);
  const ready = loadPair(async () => ({ id: 'current' }));
  assert.deepEqual(await ready.promise, { id: 'current' });
});

test('a side is ready only on its own frame\'s work-ready message; a slow frame offers recovery without declaring ready', async () => {
  const frame = Object.assign(new EventTarget(), { src: 'https://content.example/w/m1', contentWindow: {} });
  const page = new EventTarget();
  const say = (data, source = frame.contentWindow, origin = 'https://content.example') => page.dispatchEvent(Object.assign(new Event('message'), { data, source, origin }));
  let slow = 0, ready = 0, loads = 0;
  const stop = watchFrameLoad(frame, { onReady: () => ready++, onLoad: () => loads++, onSlow: () => slow++, timeout: 5, target: page });
  frame.dispatchEvent(new Event('load'));
  assert.equal(loads, 1); assert.equal(ready, 0, 'native load alone is not ready');
  say('aob:work-loading'); say('aob:work-ready', {}); say('aob:work-ready', frame.contentWindow, 'https://evil.example');
  assert.equal(ready, 0);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(slow, 1); assert.equal(ready, 0);
  say('aob:work-ready'); assert.equal(ready, 1);
  say('aob:work-ready'); assert.equal(ready, 1);
  stop();
  const stale = Object.assign(new EventTarget(), { src: 'https://content.example/w/m2', contentWindow: {} });
  const cancel = watchFrameLoad(stale, { onReady: () => ready++, onSlow: () => slow++, timeout: 5, target: page });
  cancel(); say('aob:work-ready', stale.contentWindow); stale.dispatchEvent(new Event('error'));
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(slow, 1); assert.equal(ready, 1);
});

test('the vote and skip holds count only visible time and never open before the server deadline', () => {
  let clock = 1000, away = false;
  const hold = createHold(() => {}, { now: () => clock, hidden: () => away });
  hold.begin();
  clock += 2000; hold.tick();
  assert.equal(hold.left('vote', 5000), 3000);
  away = true; clock += 10_000; hold.tick();
  assert.equal(hold.left('vote', 5000), 3000, 'a hidden page does not run the clock');
  away = false; hold.touch(); clock += 3000; hold.tick();
  assert.equal(hold.left('vote', 5000), 0);
  hold.mark('vote', clock + 800);
  assert.equal(hold.left('vote', 5000), 800, 'the server may hold longer than the local count');
  hold.reset();
  assert.equal(hold.left('vote', 5000), 5000);
  hold.stop();
});
