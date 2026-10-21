import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const app = readFileSync(new URL('../site/app.js', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const home = readFileSync(new URL('../site/home.js', import.meta.url), 'utf8').replaceAll('\r\n', '\n');

test('account checks leave mounted catalog pages intact, while identity and waiting pages still refresh', () => {
  const source = app.slice(app.indexOf('onPlatformChange((reason) => {'), app.indexOf('\n\ntry {', app.indexOf('onPlatformChange((reason) => {')));
  const calls = [];
  let notify;
  const state = { DATA: {}, page: { home: true, onPlatformChange: (reason) => calls.push(reason) },
    platform: { works: [], questions: [] }, catalogState: () => 'ready',
    location: { hash: '#/' }, onPlatformChange: (callback) => { notify = callback; },
    mergePlatform: () => calls.push('merge'), refreshAccountControls: () => calls.push('account'),
    route: () => calls.push('route') };
  state.mergedCatalog = { ...state.platform, state: 'ready' };
  vm.runInNewContext(source, state);
  for (const reason of ['session', 'session-ready']) {
    calls.length = 0;
    notify(reason);
    assert.deepEqual(calls, ['account'], 'unchanged identity cannot merge or rebuild the catalog');
  }
  for (const reason of ['identity', 'activity', 'refresh', 'reconnect', 'stale']) {
    calls.length = 0;
    notify(reason);
    assert.deepEqual(calls, ['account', 'merge', reason]);
  }
  state.platform.works = [];
  calls.length = 0;
  notify('session');
  assert.deepEqual(calls, ['account', 'merge', 'session'], 'explicit session refreshes with a new catalog cannot be dropped');
  for (const flag of ['awaitingSession', 'fullscreen']) {
    state.page = { [flag]: true, onPlatformChange: () => calls.push('page') };
    calls.length = 0;
    notify('session-ready');
    assert.deepEqual(calls, ['account', 'merge', 'page']);
  }
  state.page = { review: true };
  state.location.hash = '#/review';
  calls.length = 0;
  notify('identity');
  assert.deepEqual(calls, ['account', 'merge', 'route'], 'revoked roles must re-enter the review route gate');
});

test('home catalog notifications preserve unchanged images and tabs, but refresh real changes and access gates', () => {
  const start = home.indexOf('  const updateCatalog = () => {');
  const source = home.slice(start, home.indexOf('  const retryTimer', start));
  const calls = [];
  const box = (name) => ({ set innerHTML(value) { calls.push([name, value]); } });
  const proof = box('proof'), strip = box('strip'), blind = {};
  const oldDeck = { id: 'a' }, nextDeck = { id: 'a', title: 'fresh metadata' };
  const tabList = Object.assign(box('tabs'), { scrollLeft: 42,
    children: [{ style: { setProperty: () => calls.push(['progress']) } }] });
  const state = { root: { querySelector: (selector) => selector === '.home-proof' ? proof : blind },
    recentSection: { querySelector: () => strip }, tabList,
    ctx: { DATA: { tasks: [nextDeck] }, settleImages: () => {} },
    platform: { available: true }, catalogReady: () => true,
    statusMarkup: () => state.proof, tabsMarkup: (selected = 0) => `${state.tabs}:${selected}`,
    stripMarkup: () => state.strip, decksOf: (tasks) => tasks,
    lastProof: 'proof', lastTabs: 'tabs:0', lastStrip: 'strip',
    proof: 'proof', tabs: 'tabs', strip: 'strip',
    decks: [oldDeck], current: 0, elapsed: 100, QUESTION: 1000, autoQuestion: true,
    fitPosters: () => calls.push(['fit']), $$: () => [],
    askNews: () => {}, showNews: () => {}, refreshLinks: () => calls.push(['links']) };
  vm.runInNewContext(`${source}\nglobalThis.update = updateCatalog;`, state);
  state.update();
  assert.deepEqual(calls, [['links']], 'no DOM replacement or pixel scan for identical catalog output');
  assert.equal(state.decks[0], nextDeck, 'new metadata must still feed the next ordinary hero rotation');
  assert.equal(blind.hidden, false);
  state.proof = 'new counts';
  calls.length = 0;
  state.update();
  assert.deepEqual(calls, [['proof', 'new counts'], ['links']], 'count-only changes preserve recent-image nodes');
  state.tabs = 'new question'; state.strip = 'new images';
  calls.length = 0;
  state.update();
  assert.deepEqual(calls, [['tabs', 'new question:0'], ['progress'], ['strip', 'new images'], ['fit'], ['links']]);
  assert.equal(tabList.scrollLeft, 42);
  state.ctx.DATA.tasks = [];
  state.strip = ''; state.platform.available = false;
  calls.length = 0;
  state.update();
  assert.deepEqual(calls, [['strip', ''], ['fit'], ['links']], 'withdrawals clear recent works and always recheck existing hero links');
  assert.equal(blind.hidden, true);
});
