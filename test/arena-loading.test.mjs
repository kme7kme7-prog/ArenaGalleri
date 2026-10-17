import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadPair, watchFrameLoad } from '../site/arena-loading.js';

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

test('a slow frame offers recovery without declaring ready; late load recovers and replacement removes old callbacks', async () => {
  const frame = new EventTarget();
  let slow = 0, ready = 0;
  const stop = watchFrameLoad(frame, { onLoad: () => ready++, onSlow: () => slow++, timeout: 5 });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(slow, 1); assert.equal(ready, 0);
  frame.dispatchEvent(new Event('load')); assert.equal(ready, 1);
  frame.dispatchEvent(new Event('load')); assert.equal(ready, 1);
  stop();
  const stale = new EventTarget();
  const cancel = watchFrameLoad(stale, { onLoad: () => ready++, onSlow: () => slow++, timeout: 5 });
  cancel(); stale.dispatchEvent(new Event('load')); stale.dispatchEvent(new Event('error'));
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(slow, 1); assert.equal(ready, 1);
});
