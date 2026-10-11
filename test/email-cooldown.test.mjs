import assert from 'node:assert/strict';
import test from 'node:test';

test('email send respects JSON retry time, blocks repeated clicks and catches up after idle', async () => {
  const original = { document: globalThis.document, window: globalThis.window, addEventListener: globalThis.addEventListener, fetch: globalThis.fetch, now: Date.now,
    interval: globalThis.setInterval, clear: globalThis.clearInterval, localStorage: globalThis.localStorage };
  globalThis.localStorage = { getItem: () => 'en' };
  const doc = new EventTarget();
  doc.baseURI = 'https://gallery.test/';
  globalThis.document = doc;
  globalThis.window = new EventTarget();
  globalThis.addEventListener = globalThis.window.addEventListener.bind(globalThis.window);
  let tick;
  globalThis.setInterval = (fn) => { tick = fn; return 1; };
  globalThis.clearInterval = () => { tick = null; };
  let now = 1000000;
  Date.now = () => now;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return new Response(JSON.stringify({ error: '当前网络发送请求较多。', code: 'email_ip_limited', retryAfter: 683 }),
      { status: 429, headers: { 'Content-Type': 'application/json' } });
  };
  const el = new EventTarget();
  el.isConnected = true;
  const send = new EventTarget();
  const error = { textContent: '' };
  const notice = { textContent: '' };
  const form = { querySelector: (selector) => ({ '[data-send]': send, '.form-error': error, '.code-notice': notice })[selector] };
  try {
    const { codeSender, api } = await import('../site/platform.js');
    codeSender({ el }, form, () => api('auth/email/send', { method: 'POST', body: {} }), async () => null);
    send.dispatchEvent(new Event('click'));
    send.dispatchEvent(new Event('click'));
    await new Promise(setImmediate);
    assert.equal(requests, 1);
    assert.equal(send.disabled, true);
    assert.match(error.textContent, /11 分 23 秒/);
    // Simulate the language observer translating a visible cooldown error.
    const { translateText } = await import('../site/i18n.js');
    error.textContent = translateText(error.textContent);
    assert.match(error.textContent, /11 minutes 23 seconds/);
    now += 600000;
    doc.dispatchEvent(new Event('visibilitychange'));
    assert.match(send.textContent, /1 分 23 秒/);
    assert.match(error.textContent, /1 分 23 秒/);
    error.textContent = translateText(error.textContent);
    now += 83000;
    tick();
    assert.equal(send.disabled, false);
    assert.equal(error.textContent, '');
    assert.equal(send.textContent, '发送验证码');
    assert.equal(tick, null);
  } finally {
    el.dispatchEvent(new Event('close'));
    globalThis.localStorage = original.localStorage;
    globalThis.document = original.document;
    globalThis.window = original.window;
    globalThis.addEventListener = original.addEventListener;
    globalThis.fetch = original.fetch;
    Date.now = original.now;
    globalThis.setInterval = original.interval;
    globalThis.clearInterval = original.clear;
  }
});
