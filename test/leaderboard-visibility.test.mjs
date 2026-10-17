import assert from 'node:assert/strict';
import { test } from 'node:test';

test('sample visibility respects the five-work boundary without changing scores, ranks, or provisional labels', async () => {
  const original = { document: globalThis.document, window: globalThis.window, addEventListener: globalThis.addEventListener };
  globalThis.document = Object.assign(new EventTarget(), { baseURI: 'https://gallery.test/' });
  globalThis.window = new EventTarget();
  globalThis.addEventListener = globalThis.window.addEventListener.bind(globalThis.window);
  let visibleBoardEntries;
  try { ({ visibleBoardEntries } = await import('../site/leaderboard.js')); }
  finally { Object.assign(globalThis, original); }
  for (const by of ['config', 'model']) {
    const data = { by, rows: [
      { key: 'small', works: 4, rank: 1, score: 1400, provisional: false },
      { key: 'five', works: 5, rank: 2, score: 1300, provisional: true },
      { key: 'large', works: 12, rank: 3, score: 1200, provisional: false },
    ], unranked: [{ key: 'unrated-small', works: 4 }, { key: 'unrated-five', works: 5 }] };
    const before = structuredClone(data);
    assert.deepEqual(visibleBoardEntries(data).rows, data.rows.slice(1));
    assert.deepEqual(visibleBoardEntries(data).unranked, data.unranked.slice(1));
    assert.deepEqual(visibleBoardEntries(data, true), { rows: data.rows, unranked: data.unranked });
    assert.deepEqual(data, before);
  }
});

test('full and embedded boards reveal small provisional entries locally and retain original callback data', async () => {
  const original = { document: globalThis.document, window: globalThis.window, addEventListener: globalThis.addEventListener,
    fetch: globalThis.fetch, SAME_PROMPT_CONFIG: globalThis.SAME_PROMPT_CONFIG, localStorage: globalThis.localStorage };
  globalThis.document = Object.assign(new EventTarget(), { baseURI: 'https://gallery.test/', activeElement: null });
  globalThis.window = new EventTarget();
  globalThis.addEventListener = globalThis.window.addEventListener.bind(globalThis.window);
  globalThis.SAME_PROMPT_CONFIG = { apiBaseUrl: 'https://backend.test/api/' };
  const settings = new Map();
  globalThis.localStorage = { getItem: key => settings.get(key) ?? null, setItem: (key, value) => settings.set(key, value) };
  let calls = 0;
  globalThis.fetch = async url => {
    calls++;
    const by = new URL(url).searchParams.get('by');
    return Response.json({ by, rows: [{ key: 'small', modelName: 'Small sample sentinel', model: 'small',
      rank: 1, works: 4, score: 1300, interval: 100, games: 8, wins: 5, draws: 0, losses: 3, winRate: .625, provisional: true }],
    unranked: [], totals: { votes: 8, voters: 3 }, provisionalGames: 30 });
  };
  try {
    const { mountBoard } = await import('../site/leaderboard.js');
    for (const embedded of [false, true]) for (const by of ['config', 'model']) {
      settings.set('board-unit', by); settings.delete('board-show-small-samples');
      const container = Object.assign(new EventTarget(), { innerHTML: '', setAttribute() {}, removeAttribute() {},
        querySelector() { return null; }, querySelectorAll() { return []; } });
      let delivered, visibleRows;
      const board = mountBoard(container, { embedded, task: { id: `visibility-${embedded}-${by}` },
        modelOf: row => ({ name: row.modelName, vendor: 'Test' }),
        onData(data, visibility) { delivered = data; visibleRows = visibility.visibleRows; } });
      try {
        await board.ready;
        assert.match(container.innerHTML, /当前没有作品数达到 5 件的条目/);
        assert.doesNotMatch(container.innerHTML, /Small sample sentinel/);
        assert.equal(visibleRows, 0); assert.equal(delivered.rows.length, 1);
        const requests = calls;
        const toggle = checked => {
          const event = new Event('change');
          Object.defineProperty(event, 'target', { value: { checked, matches: selector => selector === '[data-board-small]' } });
          container.dispatchEvent(event);
        };
        toggle(true);
        assert.match(container.innerHTML, /Small sample sentinel/);
        assert.match(container.innerHTML, /class="badge provisional"[^>]*>暂定/);
        assert.equal(visibleRows, 1); assert.equal(delivered.rows[0].rank, 1);
        assert.equal(settings.get('board-show-small-samples'), 'true');
        toggle(false);
        assert.doesNotMatch(container.innerHTML, /Small sample sentinel/);
        assert.equal(visibleRows, 0); assert.equal(calls, requests, 'display changes do not request a new ranking');
      } finally { board.destroy(); }
    }
  } finally { Object.assign(globalThis, original); }
});
