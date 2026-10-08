import assert from 'node:assert/strict';
import test from 'node:test';

test('platform recovery waits out rate limits, shares retries and keeps version mismatches blocked', async () => {
  const original = { document: globalThis.document, window: globalThis.window, addEventListener: globalThis.addEventListener,
    fetch: globalThis.fetch, timeout: globalThis.setTimeout, now: Date.now };
  const doc = new EventTarget();
  doc.baseURI = 'https://gallery.test/';
  globalThis.document = doc;
  globalThis.window = new EventTarget();
  globalThis.addEventListener = globalThis.window.addEventListener.bind(globalThis.window);
  let now = 100000;
  Date.now = () => now;
  let scheduled;
  globalThis.setTimeout = (fn, delay) => { scheduled = { fn, delay }; return 1; };
  const build = { datapack: 'a'.repeat(40) };
  const success = () => new Response(JSON.stringify({ apiVersion: 2, datapack: build.datapack, questions: [], works: [], arena: {} }),
    { headers: { 'Content-Type': 'application/json' } });
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ error: 'Too many reads', retryAfter: 12 }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '30' } });
  };
  try {
    const { platform, connectPlatform, refreshPlatform, startPlatformRecovery, onPlatformChange } = await import('../site/platform.js');
    assert.equal(await connectPlatform(build), false);
    assert.equal(platform.connectionError.kind, 'limited');
    assert.equal(platform.connectionError.retryAt, now + 12000);
    startPlatformRecovery();
    assert.equal(scheduled.delay, 12000);
    assert.equal(await refreshPlatform('reconnect'), false);
    globalThis.window.dispatchEvent(new Event('online'));
    await new Promise(setImmediate);
    assert.equal(calls, 1, 'cooldown blocks both manual and network-event retries');

    now += 12000;
    let release;
    globalThis.fetch = () => { calls++; return new Promise((resolve) => { release = resolve; }); };
    let changes = 0;
    const unsubscribe = onPlatformChange(() => changes++);
    scheduled.fn();
    const retry = connectPlatform();
    assert.equal(calls, 2, 'the automatic retry and another reconnect share one request');
    assert.equal(platform.connecting, true);
    release(success());
    assert.equal(await retry, true);
    await new Promise(setImmediate);
    assert.equal(platform.available, true);
    assert.equal(platform.connecting, false);
    assert.equal(platform.connectionError, null);
    assert.equal(changes, 1, 'successful recovery tells the current route to redraw');
    unsubscribe();

    assert.equal(await connectPlatform(build, Promise.reject(new DOMException('Timed out', 'TimeoutError'))), false);
    assert.match(platform.connectionError.message, /超时/);
    assert.equal(platform.available, true, 'a failed refresh preserves an already connected snapshot');
    assert.equal(await connectPlatform(build, Promise.resolve(new Response('{}', { status: 409 }))), false);
    assert.equal(platform.mismatch, true);
    now += 30000;
    assert.equal(await refreshPlatform('reconnect'), false);
    assert.equal(calls, 2, 'version mismatch cannot be bypassed by recovery');
  } finally {
    globalThis.document = original.document;
    globalThis.window = original.window;
    globalThis.addEventListener = original.addEventListener;
    globalThis.fetch = original.fetch;
    globalThis.setTimeout = original.timeout;
    Date.now = original.now;
  }
});
