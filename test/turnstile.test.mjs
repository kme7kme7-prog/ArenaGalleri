import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTurnstile, mountTurnstile } from '../site/turnstile.js';
import { locale, setLocale } from '../site/i18n.js';

test('Turnstile loads on demand and can retry a failed script', async () => {
  const originalDocument = globalThis.document;
  const originalTurnstile = globalThis.turnstile;
  const scripts = [];
  globalThis.document = {
    createElement: () => ({ remove() { this.removed = true; } }),
    head: { append(script) { scripts.push(script); } },
  };
  delete globalThis.turnstile;

  try {
    assert.equal(scripts.length, 0);
    const failure = assert.rejects(loadTurnstile(), /加载失败/);
    assert.match(scripts[0].src, /^https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit$/);
    scripts[0].onload();
    await failure;
    assert.equal(scripts[0].removed, true);

    const retry = loadTurnstile();
    assert.equal(scripts.length, 2);
    const widgetApi = { render() {}, reset() {}, remove() {} };
    globalThis.turnstile = widgetApi;
    scripts[1].onload();
    assert.equal(await retry, widgetApi);
  } finally {
    globalThis.document = originalDocument;
    if (originalTurnstile === undefined) delete globalThis.turnstile;
    else globalThis.turnstile = originalTurnstile;
  }
});

test('Turnstile clears expired or rejected tokens and removes its widget', async () => {
  const originalTurnstile = globalThis.turnstile;
  let options;
  const calls = [];
  globalThis.turnstile = {
    render(container, configuration) { options = configuration; calls.push(['render', container]); return 'widget-1'; },
    reset(id) { calls.push(['reset', id]); },
    remove(id) { calls.push(['remove', id]); },
  };
  try {
    const container = {};
    const messages = [];
    const widget = mountTurnstile(container, '1x00000000000000000000AA', (message) => messages.push(message));
    assert.deepEqual(calls[0], ['render', container]);
    assert.equal(options.sitekey, '1x00000000000000000000AA');
    assert.equal(options.language, locale());

    options.callback('first-token');
    assert.equal(widget.token, 'first-token');
    options['expired-callback']();
    await Promise.resolve();
    assert.equal(widget.token, '');
    assert.deepEqual(calls.at(-1), ['reset', 'widget-1']);
    assert.match(messages.at(-1), /过期/);

    options.callback('second-token');
    widget.reset(); // A failed registration request consumes the submitted token.
    assert.equal(widget.token, '');
    assert.deepEqual(calls.at(-1), ['reset', 'widget-1']);

    options.callback('third-token');
    assert.equal(options['error-callback'](), false);
    assert.equal(widget.token, '');
    assert.match(messages.at(-1), /失败/);

    const messageCount = messages.length;
    widget.remove();
    options.callback('late-token');
    widget.reset();
    assert.equal(widget.token, '');
    assert.equal(messages.length, messageCount);
    assert.deepEqual(calls.at(-1), ['remove', 'widget-1']);
  } finally {
    if (originalTurnstile === undefined) delete globalThis.turnstile;
    else globalThis.turnstile = originalTurnstile;
  }
});

test('Turnstile follows locale changes and ignores callbacks from replaced or destroyed widgets', async () => {
  const originalTurnstile = globalThis.turnstile;
  const originalWindow = globalThis.window;
  const originalLocale = locale();
  const calls = [];
  const configurations = [];
  const messages = [];
  const container = { formValue: 'keep this input' };
  const events = new EventTarget();
  let listeners = 0;
  globalThis.window = {
    addEventListener(type, callback) { listeners++; events.addEventListener(type, callback); },
    removeEventListener(type, callback) { listeners--; events.removeEventListener(type, callback); },
    dispatchEvent(event) { return events.dispatchEvent(event); },
  };
  globalThis.turnstile = {
    render(target, configuration) {
      assert.equal(target, container);
      configurations.push(configuration);
      const id = `widget-${configurations.length}`;
      calls.push(['render', id]);
      return id;
    },
    reset(id) { calls.push(['reset', id]); },
    remove(id) { calls.push(['remove', id]); },
  };
  try {
    setLocale('zh-CN');
    const widget = mountTurnstile(container, 'test-key', (message) => messages.push(message));
    assert.equal(configurations[0].language, 'zh-CN');
    assert.equal(listeners, 1);
    configurations[0].callback('chinese-token');
    configurations[0]['expired-callback']();
    setLocale('en');
    await Promise.resolve();
    assert.equal(configurations[1].language, 'en');
    assert.deepEqual(calls, [['render', 'widget-1'], ['remove', 'widget-1'], ['render', 'widget-2']]);
    assert.equal(widget.token, '');
    const messageCount = messages.length;
    configurations[0].callback('stale-token');
    configurations[0]['expired-callback']();
    assert.equal(configurations[0]['error-callback'](), true);
    assert.equal(widget.token, '');
    assert.equal(messages.length, messageCount);

    configurations[1].callback('english-token');
    assert.equal(widget.token, 'english-token');
    setLocale('zh-CN');
    assert.equal(configurations[2].language, 'zh-CN');
    assert.equal(widget.token, '');
    assert.equal(container.formValue, 'keep this input');
    assert.deepEqual(calls.slice(-2), [['remove', 'widget-2'], ['render', 'widget-3']]);
    configurations[2]['expired-callback']();
    widget.remove();
    const destroyedMessageCount = messages.length;
    configurations[2].callback('destroyed-token');
    configurations[2]['expired-callback']();
    assert.equal(configurations[2]['error-callback'](), true);
    setLocale('en');
    await Promise.resolve();
    assert.equal(widget.token, '');
    assert.equal(messages.length, destroyedMessageCount);
    assert.equal(listeners, 0);
    assert.equal(configurations.length, 3);
    assert.deepEqual(calls.at(-1), ['remove', 'widget-3']);
  } finally {
    setLocale(originalLocale);
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalTurnstile === undefined) delete globalThis.turnstile;
    else globalThis.turnstile = originalTurnstile;
  }
});
