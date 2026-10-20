import assert from 'node:assert/strict';
import test from 'node:test';

// A fake clock: each backoff wait advances time at once and records its length.
function clock(start = 1000) {
  const original = { timeout: globalThis.setTimeout, now: Date.now };
  const state = { now: start, waits: [] };
  Date.now = () => state.now;
  globalThis.setTimeout = (fn, ms) => { state.waits.push(ms); state.now += ms; queueMicrotask(fn); return 0; };
  state.restore = () => { globalThis.setTimeout = original.timeout; Date.now = original.now; };
  return state;
}

async function withPlatform(label, run) {
  const original = { document: globalThis.document, window: globalThis.window, addEventListener: globalThis.addEventListener,
    fetch: globalThis.fetch, config: globalThis.SAME_PROMPT_CONFIG };
  globalThis.document = Object.assign(new EventTarget(), { baseURI: 'https://gallery.test/' });
  globalThis.window = new EventTarget();
  globalThis.addEventListener = globalThis.window.addEventListener.bind(globalThis.window);
  globalThis.SAME_PROMPT_CONFIG = { apiBaseUrl: 'https://backend.test/api/' };
  const time = clock();
  try { await run(await import(`../site/platform.js?retry=${label}`), time); }
  finally {
    time.restore();
    Object.assign(globalThis, { document: original.document, window: original.window, addEventListener: original.addEventListener,
      fetch: original.fetch, SAME_PROMPT_CONFIG: original.config });
  }
}

const build = { datapack: 'a'.repeat(40) };
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify({ apiVersion: 2, datapack: build.datapack, ...data }),
  { status, headers: { 'Content-Type': 'application/json', ...headers } });
const catalog = () => json({ questions: [], works: [] });
// Serve each endpoint from its own queue; a function entry runs with the request options.
function serve(queues) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const name = new URL(url).pathname.split('/').pop();
    calls.push(name);
    const next = queues[name]?.shift() ?? (name === 'session' ? json({ user: null }) : json({}));
    return typeof next === 'function' ? next(options) : next;
  };
  return calls;
}
const count = (calls, name) => calls.filter((call) => call === name).length;

test('retryRead backs off on network failures and stops at the attempt limit', async () => {
  const time = clock();
  try {
    const { retryRead } = await import('../site/platform-api.js');
    const timeouts = [];
    await assert.rejects(retryRead(async (timeout) => { timeouts.push(timeout); throw new TypeError('Failed to fetch'); }), TypeError);
    assert.deepEqual(time.waits, [1000, 3000, 6000]);
    assert.deepEqual(timeouts, [15000, 15000, 15000, 15000]);
    time.waits.length = 0;
    let tries = 0;
    assert.equal(await retryRead(async () => { if (++tries < 3) throw new SyntaxError('Unexpected token <'); return 'ok'; }), 'ok');
    assert.deepEqual(time.waits, [1000, 3000], 'a body that is not JSON is read again');
  } finally { time.restore(); }
});

test('retryRead keeps every attempt inside the total budget', async () => {
  const time = clock();
  try {
    const { retryRead } = await import('../site/platform-api.js');
    const timeouts = [];
    // Every attempt hangs until its own deadline.
    await assert.rejects(retryRead(async (timeout) => {
      timeouts.push(timeout);
      time.now += timeout;
      throw new DOMException('Timed out', 'TimeoutError');
    }), { name: 'TimeoutError' });
    assert.deepEqual(timeouts, [15000, 15000, 11000], 'the last attempt only gets what is left');
    assert.deepEqual(time.waits, [1000, 3000]);
    assert.ok(time.now - 1000 <= 45000, 'the read reports within 45 seconds');
  } finally { time.restore(); }
});

test('retryRead honours Retry-After within the budget and leaves HTTP answers alone', async () => {
  const time = clock();
  try {
    const { retryRead } = await import('../site/platform-api.js');
    let tries = 0;
    assert.equal(await retryRead(async () => {
      if (++tries === 1) throw { kind: 'limited', retryAt: Date.now() + 8000 };
      return 'ok';
    }), 'ok');
    assert.deepEqual(time.waits, [8000]);
    time.waits.length = 0;
    tries = 0;
    await assert.rejects(retryRead(async () => { tries++; throw { kind: 'limited', retryAt: Date.now() + 60000 }; }), { kind: 'limited' });
    assert.equal(tries, 1, 'a Retry-After beyond the budget reports at once');
    assert.deepEqual(time.waits, []);
    for (const kind of ['http', 'missing']) {
      tries = 0;
      await assert.rejects(retryRead(async () => { tries++; throw { kind, status: kind === 'http' ? 500 : 404 }; }), { kind });
      assert.equal(tries, 1, `${kind} answers are final`);
    }
    assert.deepEqual(time.waits, []);
  } finally { time.restore(); }
});

test('the catalog stays loading while a failed connection is retried', async () => {
  await withPlatform('network', async ({ connectPlatform, platform, catalogState, onPlatformChange }, time) => {
    const states = [];
    const calls = serve({ catalog: [
      () => { states.push(catalogState()); return Promise.reject(new TypeError('Failed to fetch')); },
      () => { states.push(catalogState()); return new Response('<html>edge error</html>', { headers: { 'Content-Type': 'text/html' } }); },
      () => { states.push(catalogState()); return catalog(); },
    ] });
    const shown = [];
    onPlatformChange(() => shown.push(catalogState()));
    assert.equal(await connectPlatform(build), true);
    assert.equal(count(calls, 'catalog'), 3);
    assert.deepEqual(time.waits, [1000, 3000]);
    assert.deepEqual(states, ['loading', 'loading', 'loading'], 'no error is shown between attempts');
    assert.ok(!shown.includes('error'));
    assert.equal(platform.available, true);
    assert.equal(platform.connectionError, null);
  });
});

test('the catalog waits out Retry-After and does not repeat other HTTP errors', async () => {
  await withPlatform('limited', async ({ connectPlatform, platform }, time) => {
    let calls = serve({ catalog: [json({ error: 'Too many reads' }, 429, { 'Retry-After': '5' }), catalog()] });
    assert.equal(await connectPlatform(build), true);
    assert.equal(count(calls, 'catalog'), 2);
    assert.deepEqual(time.waits, [5000]);

    for (const status of [500, 403]) {
      time.waits.length = 0;
      calls = serve({ catalog: [json({ error: 'Nope' }, status)] });
      assert.equal(await connectPlatform(build), false);
      assert.equal(count(calls, 'catalog'), 1, `${status} is not retried`);
      assert.deepEqual(time.waits, []);
      assert.equal(platform.connectionError.kind, 'http');
    }
  });
});

test('the original failure is shown once the budget runs out', async () => {
  await withPlatform('exhausted', async ({ connectPlatform, platform, catalogState }, time) => {
    const failing = () => Promise.reject(new TypeError('Failed to fetch'));
    const calls = serve({ catalog: [failing, failing, failing, failing, failing] });
    assert.equal(await connectPlatform(build), false);
    assert.equal(count(calls, 'catalog'), 4);
    assert.deepEqual(time.waits, [1000, 3000, 6000]);
    assert.equal(catalogState(), 'error');
    assert.equal(platform.connectionError.message, '连接失败，请检查网络后重试。');
  });
});

test('legacy bootstrap, session and activity reads use the same backoff', async () => {
  await withPlatform('legacy', async ({ connectPlatform, platform }, time) => {
    const failing = () => Promise.reject(new TypeError('Failed to fetch'));
    const calls = serve({ catalog: [json({}, 404)], session: [json({}, 404)],
      bootstrap: [failing, json({ user: null, questions: [], works: [], arena: {} })] });
    assert.equal(await connectPlatform(build), true);
    assert.equal(count(calls, 'catalog'), 1, 'a missing catalog switches to bootstrap without retrying');
    assert.equal(count(calls, 'bootstrap'), 2);
    assert.deepEqual(time.waits, [1000]);
    assert.equal(platform.sessionReady, true);
  });
  await withPlatform('session-activity', async ({ connectPlatform, platform }, time) => {
    const failing = () => Promise.reject(new TypeError('Failed to fetch'));
    const calls = serve({ catalog: [catalog()], session: [failing, json({ user: null })],
      activity: [failing, json({ arena: {}, reactions: { counts: {}, mine: {} } })] });
    assert.equal(await connectPlatform(build), true);
    for (let i = 0; i < 20 && !platform.activityReady; i++) await new Promise(setImmediate);
    assert.equal(count(calls, 'session'), 2);
    assert.equal(count(calls, 'activity'), 2);
    assert.equal(platform.sessionReady, true);
    assert.equal(platform.activityReady, true);
    assert.deepEqual(time.waits, [1000, 1000]);
  });
});
