import assert from 'node:assert/strict';
import { test } from 'node:test';

test('curated view requests its scope and refuses an old backend returning the public board', async () => {
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
    board = mountBoard(container, { curated: true, sectionId: 'web', onData() { assert.fail('an unscoped board must never be presented'); } });
    await board.ready;
    assert.equal(requested.searchParams.get('audience'), 'curated');
    assert.equal(requested.searchParams.get('sectionId'), 'web');
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

test('rankings wait for the server update time, coalesce reads, and stop after leaving', async () => {
  const original = { document: globalThis.document, window: globalThis.window,
    addEventListener: globalThis.addEventListener, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const originalNow = Date.now;
  globalThis.document = Object.assign(new EventTarget(), { baseURI: 'https://gallery.test/', visibilityState: 'visible' });
  globalThis.window = new EventTarget();
  globalThis.addEventListener = globalThis.window.addEventListener.bind(globalThis.window);
  let tick, delay, calls = 0, finish, now = 0, armed = false;
  Date.now = () => now;
  globalThis.setTimeout = (callback, ms) => { tick = callback; delay = ms; armed = true; return 42; };
  globalThis.clearTimeout = () => { armed = false; };
  let live;
  try {
    const { watchBoardRefresh } = await import('../site/leaderboard.js');
    live = watchBoardRefresh(() => { calls++; return new Promise((resolve) => { finish = resolve; }); });
    assert.equal(delay, 600_000);
    globalThis.window.dispatchEvent(new Event('focus'));
    globalThis.window.dispatchEvent(new Event('online'));
    assert.equal(calls, 0, 'focus and network events do not turn the board into a live feed');
    live.update({ nextUpdateAt: new Date(120_000).toISOString() });
    assert.equal(delay, 120_000, 'join the shared snapshot deadline instead of starting a new ten-minute window');
    now = 120_000;
    const first = tick();
    globalThis.window.dispatchEvent(new Event('focus'));
    await tick();
    assert.equal(calls, 1, 'do not overlap a slow refresh');
    finish(); await first;
    assert.equal(delay, 600_000, 'older servers use the ten-minute fallback');
    globalThis.document.visibilityState = 'hidden';
    now += 600_000;
    await tick();
    globalThis.window.dispatchEvent(new Event('online'));
    assert.equal(calls, 1, 'hidden tabs do not poll');
    globalThis.document.visibilityState = 'visible';
    globalThis.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(calls, 2);
    live.destroy();
    finish(); await Promise.resolve(); await Promise.resolve();
    assert.equal(armed, false, 'a pending refresh cannot restart the timer after leaving');
    globalThis.window.dispatchEvent(new Event('focus'));
    globalThis.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(calls, 2, 'leaving removes listeners and the timer');
  } finally {
    live?.destroy();
    Date.now = originalNow;
    Object.assign(globalThis, original);
  }
});

test('curated empty states describe staff history only when the current scope enables it', async () => {
  const original = { document: globalThis.document, window: globalThis.window, addEventListener: globalThis.addEventListener,
    fetch: globalThis.fetch, SAME_PROMPT_CONFIG: globalThis.SAME_PROMPT_CONFIG };
  globalThis.document = Object.assign(new EventTarget(), { baseURI: 'https://gallery.test/', activeElement: null });
  globalThis.window = new EventTarget();
  globalThis.addEventListener = globalThis.window.addEventListener.bind(globalThis.window);
  globalThis.SAME_PROMPT_CONFIG = { apiBaseUrl: 'https://backend.test/api/' };
  try {
    const { mountBoard } = await import('../site/leaderboard.js');
    let scenario = 0;
    for (const votes of [0, 12]) for (const flag of [true, false, undefined]) {
      globalThis.fetch = async () => Response.json({ audience: 'curated', rows: [], unranked: [], totals: { votes, voters: 2 },
        scope: { taskIds: ['question'], provisionalGames: 30, provisionalModels: 2, countingStartedAt: '2026-10-20T00:00:00Z',
          ...(flag === undefined ? {} : { includesStaffHistory: flag }) } });
      const container = Object.assign(new EventTarget(), { innerHTML: '', setAttribute() {}, removeAttribute() {},
        querySelector() { return null; }, querySelectorAll() { return []; } });
      // An explicit false in the scope overrides cached page metadata; an absent flag falls back.
      const board = mountBoard(container, { curated: true, sectionId: `history-${scenario++}`, info: { includesStaffHistory: true } });
      try {
        await board.ready;
        if (flag === false) assert.doesNotMatch(container.innerHTML, /管理员历史票|管理员的历史有效票/);
        else assert.match(container.innerHTML, /含管理员历史票/);
        if (!votes) assert.match(container.innerHTML, /精选榜等待比较/);
      } finally { board.destroy(); }
    }
  } finally { Object.assign(globalThis, original); }
});
