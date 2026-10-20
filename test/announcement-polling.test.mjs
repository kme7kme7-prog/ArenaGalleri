import assert from 'node:assert/strict';
import { test } from 'node:test';

test('announcements poll every minute while visible, pause while hidden and never open a stream', async () => {
  const keys = ['document', 'window', 'addEventListener', 'fetch', 'SAME_PROMPT_CONFIG', 'setInterval', 'clearInterval', 'EventSource', 'localStorage'];
  const original = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  const intervals = new Map();
  let nextTimer = 1, requests = 0;
  globalThis.document = Object.assign(new EventTarget(), { baseURI: 'https://gallery.test/', hidden: false, visibilityState: 'visible',
    activeElement: null, querySelector() { return null; }, querySelectorAll() { return []; } });
  globalThis.window = new EventTarget();
  globalThis.addEventListener = globalThis.window.addEventListener.bind(globalThis.window);
  globalThis.SAME_PROMPT_CONFIG = { apiBaseUrl: 'https://backend.test/api/' };
  const memory = new Map();
  globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: (key) => memory.delete(key) };
  // Read-through is already at the newest entry, so the dialog never opens.
  memory.set('gallery-announcement-read-through', '7');
  globalThis.EventSource = class { constructor() { assert.fail('announcements must not open an EventSource'); } };
  globalThis.setInterval = (callback, ms) => { const id = nextTimer++; intervals.set(id, { callback, ms }); return id; };
  globalThis.clearInterval = (id) => { intervals.delete(id); };
  globalThis.fetch = async (url) => {
    const target = new URL(url);
    if (target.pathname.endsWith('/announcements')) requests++;
    return new Response(JSON.stringify({ entries: [{ id: 7, title: 'T', body: 'B', publishedAt: '2026-10-20T00:00:00.000Z' }] }),
      { headers: { 'Content-Type': 'application/json' } });
  };
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  try {
    const { startAnnouncements, latestAnnouncement } = await import('../site/announcements.js');
    await startAnnouncements();
    assert.equal(requests, 1);
    assert.equal(latestAnnouncement().id, 7);
    assert.deepEqual([...intervals.values()].map((timer) => timer.ms), [60000]);
    [...intervals.values()][0].callback();
    await settle();
    assert.equal(requests, 2, 'the minute timer reads the list');
    globalThis.document.hidden = true;
    globalThis.document.visibilityState = 'hidden';
    globalThis.document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    assert.equal(intervals.size, 0, 'a hidden page stops polling');
    assert.equal(requests, 2);
    globalThis.document.hidden = false;
    globalThis.document.visibilityState = 'visible';
    globalThis.document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    assert.equal(requests, 3, 'returning to the page refreshes at once');
    assert.equal(intervals.size, 1, 'and polling resumes');
  } finally {
    for (const key of keys) globalThis[key] = original[key];
  }
});
