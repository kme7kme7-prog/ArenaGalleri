import assert from 'node:assert/strict';
import { test } from 'node:test';

test('curated view requests its scope and refuses an old backend returning the full board', async () => {
  const original = { document: globalThis.document, window: globalThis.window, addEventListener: globalThis.addEventListener, fetch: globalThis.fetch, config: globalThis.SAME_PROMPT_CONFIG };
  let requested;
  globalThis.document = Object.assign(new EventTarget(), { baseURI: 'https://gallery.test/', activeElement: null });
  globalThis.window = new EventTarget();
  globalThis.addEventListener = globalThis.window.addEventListener.bind(globalThis.window);
  globalThis.SAME_PROMPT_CONFIG = { apiBaseUrl: 'https://backend.test/api/' };
  globalThis.fetch = async (url) => {
    requested = new URL(url);
    return new Response(JSON.stringify({ rows: [{ modelName: 'Full board sentinel' }], unranked: [], totals: { votes: 100, voters: 20 } }),
      { headers: { 'Content-Type': 'application/json' } });
  };
  const container = Object.assign(new EventTarget(), { innerHTML: '', setAttribute() {}, removeAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; } });
  let board;
  try {
    const { mountBoard } = await import('../site/leaderboard.js');
    board = mountBoard(container, { board: 'frontend', onData() { assert.fail('an unscoped board must never be presented'); } });
    await board.ready;
    assert.equal(requested.searchParams.get('board'), 'frontend');
    assert.match(container.innerHTML, /后端尚未支持精选榜/);
    assert.doesNotMatch(container.innerHTML, /Full board sentinel/);
  } finally {
    board?.destroy();
    globalThis.document = original.document;
    globalThis.window = original.window;
    globalThis.addEventListener = original.addEventListener;
    globalThis.fetch = original.fetch;
    globalThis.SAME_PROMPT_CONFIG = original.config;
  }
});

test('live curated rankings refresh while visible, coalesce reads, and stop after leaving', async () => {
  const original = { document: globalThis.document, window: globalThis.window,
    addEventListener: globalThis.addEventListener, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
  globalThis.document = Object.assign(new EventTarget(), { baseURI: 'https://gallery.test/', visibilityState: 'visible' });
  globalThis.window = new EventTarget();
  globalThis.addEventListener = globalThis.window.addEventListener.bind(globalThis.window);
  let tick, cleared = false, calls = 0, finish;
  globalThis.setInterval = (callback, delay) => { tick = callback; assert.equal(delay, 60_000); return 42; };
  globalThis.clearInterval = (timer) => { assert.equal(timer, 42); cleared = true; };
  let live;
  try {
    const { watchBoardRefresh } = await import('../site/leaderboard.js');
    live = watchBoardRefresh(() => { calls++; return new Promise((resolve) => { finish = resolve; }); });
    const first = tick();
    globalThis.window.dispatchEvent(new Event('focus'));
    await tick();
    assert.equal(calls, 1, 'do not overlap a slow refresh');
    finish(); await first;
    globalThis.document.visibilityState = 'hidden';
    await tick();
    globalThis.window.dispatchEvent(new Event('online'));
    assert.equal(calls, 1, 'hidden tabs do not poll');
    globalThis.document.visibilityState = 'visible';
    globalThis.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(calls, 2);
    finish(); await Promise.resolve();
    live.destroy();
    assert.ok(cleared);
    globalThis.window.dispatchEvent(new Event('focus'));
    globalThis.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(calls, 2, 'leaving removes listeners and the timer');
  } finally {
    if (!cleared) live?.destroy();
    Object.assign(globalThis, original);
  }
});
