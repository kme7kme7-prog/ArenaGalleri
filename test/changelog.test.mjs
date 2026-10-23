import assert from 'node:assert/strict';
import { test } from 'node:test';

test('changelog body: markdown subset renders, HTML is escaped, only safe link targets become links', async () => {
  const original = { document: globalThis.document, window: globalThis.window, addEventListener: globalThis.addEventListener };
  globalThis.document = Object.assign(new EventTarget(), { baseURI: 'https://gallery.test/' });
  globalThis.window = new EventTarget();
  globalThis.addEventListener = globalThis.window.addEventListener.bind(globalThis.window);
  let bodyHtml, unseen;
  try { ({ bodyHtml, unseen } = await import('../site/changelog.js')); }
  finally { Object.assign(globalThis, original); }
  assert.equal(bodyHtml('第一段\n续行\n\n- a\n- b\n\n1. x\n2. y'), '<p>第一段<br>续行</p><ul><li>a</li><li>b</li></ul><ol><li>x</li><li>y</li></ol>');
  assert.equal(bodyHtml('**粗** `<b>` [去](#/leaderboard)'), '<p><b>粗</b> <code>&lt;b&gt;</code> <a href="#/leaderboard">去</a></p>');
  assert.equal(bodyHtml('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  assert.equal(bodyHtml('[a](javascript:alert(1)) [b](https://e.test/?q=1&r="2")'),
    '<p>[a](javascript:alert(1)) <a href="https://e.test/?q=1&amp;r=&quot;2&quot;" target="_blank" rel="noopener">b</a></p>');
  assert.equal(unseen({ publishedOn: '2026-10-19', id: 12 }), true);
});

test('leaving the changelog prevents a late response from marking unread entries seen', async () => {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const source = readFileSync(new URL('../site/changelog.js', import.meta.url), 'utf8');
  const start = source.indexOf('  async function load()');
  const end = source.indexOf('  const onClick', start);
  let resolve, signal;
  const response = new Promise((yes) => { resolve = yes; });
  const seen = [], draws = [];
  const context = { AbortController, setTimeout, clearTimeout, entries: null, failed: false, destroyed: false,
    readRun: 0, readController: null, pendingRead: null,
    apiRemembered: (_, options) => { signal = options.signal; return response; },
    markSeen: (entries) => seen.push(entries), draw: () => draws.push('draw'), arrive() {} };
  vm.runInNewContext(`${source.slice(start, end)}\nglobalThis.loadPage = load;`, context);
  const loading = context.loadPage();
  context.destroyed = true;
  context.readRun++;
  context.readController.abort();
  assert.equal(signal.aborted, true);
  resolve({ entries: [{ id: 999, publishedOn: '2026-10-23' }] });
  await loading;
  assert.deepEqual(seen, []);
  assert.deepEqual(draws, []);
});
