import assert from 'node:assert/strict';
import test from 'node:test';

const build = { datapack: 'a'.repeat(40) };
const dto = (value = {}, status = 200) => new Response(JSON.stringify({ apiVersion: 2, datapack: build.datapack, ...value }),
  { status, headers: { 'Content-Type': 'application/json' } });
const tick = () => new Promise(setImmediate);
const pending = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function environment(label, run) {
  const saved = { document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch,
    addEventListener: globalThis.addEventListener, config: globalThis.SAME_PROMPT_CONFIG, now: Date.now };
  const document = Object.assign(new EventTarget(), { baseURI: 'https://gallery.test/', visibilityState: 'visible' });
  const window = new EventTarget();
  globalThis.document = document; globalThis.window = window;
  globalThis.addEventListener = window.addEventListener.bind(window);
  globalThis.SAME_PROMPT_CONFIG = { apiBaseUrl: 'https://backend.test/api/' };
  try { await run(await import(`../site/platform.js?demand=${label}`), { document, window }); }
  finally {
    globalThis.document = saved.document; globalThis.window = saved.window; globalThis.fetch = saved.fetch;
    globalThis.addEventListener = saved.addEventListener; globalThis.SAME_PROMPT_CONFIG = saved.config; Date.now = saved.now;
  }
}
function backend(calls, activity = () => dto({ totals: { votes: 12 }, workAccess: [] })) {
  return async url => {
    const path = new URL(url).pathname.split('/').at(-1); calls.push(path);
    if (path === 'catalog') return dto({ questions: [], works: [] });
    if (path === 'session') return dto({ user: null, me: null });
    return activity();
  };
}

test('catalog/session-only routes defer activity until a consuming route explicitly enters', async () => environment('route-entry', async (module) => {
  const calls = [], activity = pending();
  globalThis.fetch = backend(calls, () => activity.promise);
  await module.connectPlatform(build); await tick();
  assert.deepEqual(calls, ['catalog', 'session']);
  assert.equal(module.platform.activityReady, false);
  const first = module.setActivityNeeded(true), second = module.ensureActivity();
  assert.equal(calls.filter(path => path === 'activity').length, 1);
  activity.resolve(dto({ totals: { votes: 12 }, workAccess: [] }));
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  await module.setActivityNeeded(false);
  await module.setActivityNeeded(true);
  assert.equal(calls.filter(path => path === 'activity').length, 1, 'returning to a route reuses the successful block');
}));

test('demand before connection waits for both the catalog and the proven session', async () => environment('before-session', async (module) => {
  const session = pending(), calls = [];
  globalThis.fetch = url => {
    const path = new URL(url).pathname.split('/').at(-1); calls.push(path);
    return path === 'session' ? session.promise : Promise.resolve(dto(path === 'catalog' ? { questions: [], works: [] } : { totals: { votes: 3 } }));
  };
  await module.setActivityNeeded(true);
  await module.connectPlatform(build); await tick();
  assert.deepEqual(calls, ['catalog', 'session']);
  const waiting = module.ensureActivity();
  session.resolve(dto({ user: { id: 'member', role: 'user' }, me: {} }));
  assert.equal(await waiting, true);
  assert.equal(module.platform.activityReady, true);
  assert.equal(calls.filter(path => path === 'activity').length, 1);
}));

test('hidden tabs defer activity and visible/focus/online recovery shares one read', async () => environment('visibility', async (module, { document, window }) => {
  const calls = [], activity = pending();
  document.visibilityState = 'hidden';
  globalThis.fetch = backend(calls, () => activity.promise);
  await module.setActivityNeeded(true);
  await module.connectPlatform(build); await tick();
  module.startPlatformRecovery();
  assert.equal(calls.includes('activity'), false);
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online'));
  await tick();
  assert.equal(calls.filter(path => path === 'activity').length, 1);
  activity.resolve(dto({ totals: { votes: 5 } })); await tick();
  document.dispatchEvent(new Event('visibilitychange')); await tick();
  assert.equal(calls.filter(path => path === 'activity').length, 1);
}));

test('an activity failure does not make unrelated routes retry and re-entry recovers', async () => environment('failure', async (module, { window }) => {
  const calls = []; let succeeds = false, now = 100_000;
  Date.now = () => now;
  globalThis.fetch = backend(calls, () => succeeds ? dto({ totals: { votes: 8 } }) : dto({}, 503));
  await module.setActivityNeeded(true); await module.connectPlatform(build); await tick();
  assert.equal(module.platform.activityError.status, 503);
  await module.setActivityNeeded(false); module.startPlatformRecovery();
  window.dispatchEvent(new Event('online')); await tick();
  assert.equal(calls.filter(path => path === 'activity').length, 1);
  now += 3000; succeeds = true;
  assert.equal(await module.setActivityNeeded(true), true);
  assert.equal(module.platform.totals.votes, 8);
  assert.equal(calls.filter(path => path === 'activity').length, 2);
}));

test('writes on a hidden tab defer the invalidated activity until visibility returns', async () => environment('hidden-write', async (module, { document }) => {
  const calls = []; let votes = 1;
  globalThis.fetch = backend(calls, () => dto({ totals: { votes } }));
  await module.setActivityNeeded(true); await module.connectPlatform(build); await tick();
  assert.equal(module.platform.totals.votes, 1);
  document.visibilityState = 'hidden'; votes = 2;
  await module.refreshPlatform('review'); await tick();
  assert.equal(calls.filter(path => path === 'activity').length, 1);
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange')); await tick();
  assert.equal(module.platform.totals.votes, 2);
  assert.equal(calls.filter(path => path === 'activity').length, 2);
}));
