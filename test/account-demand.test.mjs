import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../site/account.js', import.meta.url), 'utf8');
const mine = source.slice(source.indexOf('function mine('), source.indexOf('// ---- review queue'));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(tab = 'overview') {
  const calls = [], timers = new Map(), listeners = new Map();
  let draws = 0, html = '', timer = 0, owner = '1:alice:user';
  const root = { querySelector: () => null, get innerHTML() { return html; }, set innerHTML(value) { html = value; draws++; } };
  const doc = { visibilityState: 'visible', addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  const data = tab === 'overview' ? { votes: 3, activity: { total: 7 }, joinedAt: '2026-01-01' }
    : tab === 'works' ? { works: [{ id: 'w', task: 'q', moderation: { status: 'pending' } }], questions: [] } : { questions: [] };
  let response = () => Promise.resolve(data);
  const state = { document: doc, AbortController, Promise, JSON, setTimeout: fn => { timers.set(++timer, fn); return timer; }, clearTimeout: id => timers.delete(id),
    ME_TABS: { overview: 'Overview', works: 'Works', questions: 'Questions' }, ACCOUNT: {}, AUTHOR_GROUPS: { waiting: 'Waiting' },
    platform: { user: { id: 'alice', role: 'user' } }, accountKey: () => owner, recall: () => null,
    apiRemembered(path, options) { calls.push({ path, options }); return path === 'auth/me' ? Promise.resolve({ user: { email: 'alice@example.test' } }) : response(options.signal); },
    profileOverview: () => '<profile>', accountNav: () => '<nav>', uploadQuota: () => ({}), uploadButton: () => '', authorStage: () => ({ group: 'waiting' }),
    workRow: () => '<work>', questionRow: () => '<question>', esc: value => value, icon: () => '', setPageTitle: () => {},
  };
  vm.runInNewContext(`${mine}\nglobalThis.mountMine = mine;`, state);
  const page = state.mountMine(root, { param: tab, DATA: { title: 'Gallery' }, pageStart: () => '', pageEnd: () => '', settleImages: () => {} });
  return { page, calls, timers, listeners, root, doc, get draws() { return draws; },
    respond(fn) { response = fn; }, setOwner(value) { owner = value; },
    visibility(hidden) { doc.visibilityState = hidden ? 'hidden' : 'visible'; listeners.get('visibilitychange')?.(); },
    async poll() { const [id, fn] = timers.entries().next().value; timers.delete(id); await fn(); }, data };
}

test('personal tabs request only their scope; unrelated platform notifications preserve the page', async () => {
  for (const tab of ['overview', 'works', 'questions']) {
    const f = fixture(tab);
    await f.page.ready;
    assert.deepEqual(f.calls.map(call => call.path), tab === 'overview' ? ['me?view=overview', 'auth/me'] : [`me?view=${tab}`]);
    const draws = f.draws;
    for (const reason of ['activity', 'session', 'session-ready', 'stale']) f.page.onPlatformChange(reason);
    await tick();
    assert.equal(f.draws, draws);
    assert.equal(f.calls.length, tab === 'overview' ? 2 : 1);
    assert.equal(f.timers.size, tab === 'works' ? 1 : 0);
    f.page.destroy();
    assert.equal(f.listeners.size, 0);
    assert.equal(f.timers.size, 0);
  }
});

test('pending works pause in a hidden tab, deduplicate reads, and refresh after an in-flight mutation', async () => {
  const f = fixture('works'); await f.page.ready;
  f.visibility(true); assert.equal(f.timers.size, 0);
  const pending = deferred(); f.respond(() => pending.promise);
  f.visibility(false);
  f.page.onPlatformChange('reconnect');
  f.page.onPlatformChange('review');
  assert.equal(f.calls.length, 2, 'one visible read is shared while the mutation schedules a fresh follow-up');
  f.respond(() => Promise.resolve({ works: [], questions: [] }));
  pending.resolve(f.data); await tick();
  assert.equal(f.calls.length, 3, 'the pre-write response cannot swallow the mutation refresh');
  assert.equal(f.timers.size, 0, 'no pending works remain');
  f.page.destroy();
});

test('departure aborts personal reads, and late data from a revoked identity cannot repaint', async () => {
  const f = fixture('works'); await f.page.ready;
  const pending = deferred(); f.respond(() => pending.promise);
  const reading = f.page.onPlatformChange('review');
  const draws = f.draws;
  f.setOwner('2:alice:guest');
  pending.resolve({ works: [{ id: 'private' }], questions: [] });
  await reading;
  assert.equal(f.draws, draws);
  f.respond(() => new Promise(() => {}));
  f.page.onPlatformChange('refresh');
  const signal = f.calls.at(-1).options.signal;
  f.page.destroy();
  assert.equal(signal.aborted, true);
});

test('a stalled personal read times out with an explicit retry and can recover', async () => {
  const f = fixture('works'); await f.page.ready;
  f.respond(signal => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })));
  const loading = f.page.onPlatformChange('refresh');
  await f.poll(); await loading;
  assert.match(f.root.innerHTML, /个人内容加载超时/);
  assert.match(f.root.innerHTML, /data-account-retry/);
  f.respond(() => Promise.resolve({ works: [], questions: [] }));
  await f.page.onPlatformChange('refresh');
  assert.doesNotMatch(f.root.innerHTML, /个人内容加载超时/);
  f.page.destroy();
});
