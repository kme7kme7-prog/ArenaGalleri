import assert from 'node:assert/strict';
import test from 'node:test';
import { watchViewerFrame } from '../site/viewer-loading.js';

const wait = () => new Promise(resolve => setTimeout(resolve, 20));
test('viewer timeout offers recovery without revealing a pending frame, and a late load recovers', async () => {
  const frame = new EventTarget();
  let slow = 0, loaded = 0;
  const stop = watchViewerFrame(frame, { onSlow: () => slow++, onLoaded: () => loaded++, timeout: 5, revealDelay: 0 });
  await wait();
  assert.equal(slow, 1);
  assert.equal(loaded, 0, 'elapsed time never substitutes for load');
  frame.dispatchEvent(new Event('error'));
  assert.equal(slow, 1, 'the same stalled frame does not redraw recovery repeatedly');
  frame.dispatchEvent(new Event('load'));
  await wait();
  assert.equal(loaded, 1);
  stop();
});

test('replaced or destroyed viewer panes cancel pending timeout and delayed reveals', async () => {
  const frame = new EventTarget();
  let changes = 0;
  const options = { onSlow: () => changes++, onLoaded: () => changes++, timeout: 5, revealDelay: 5 };
  const stop = watchViewerFrame(frame, options);
  stop();
  frame.dispatchEvent(new Event('load'));
  frame.dispatchEvent(new Event('error'));
  const next = watchViewerFrame(frame, options);
  frame.dispatchEvent(new Event('load'));
  next();
  await wait();
  assert.equal(changes, 0);
});
