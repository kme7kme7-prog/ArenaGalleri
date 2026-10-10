import assert from 'node:assert/strict';
import test from 'node:test';

const build = { datapack: 'a'.repeat(40) };
const dto = (data = {}, status = 200) => new Response(JSON.stringify({ apiVersion: 2, datapack: build.datapack, ...data }),
  { status, headers: { 'Content-Type': 'application/json' } });
const tick = () => new Promise(setImmediate);
const pending = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

async function environment(label, run) {
  const original = { document: globalThis.document, window: globalThis.window, addEventListener: globalThis.addEventListener,
    fetch: globalThis.fetch, config: globalThis.SAME_PROMPT_CONFIG };
  globalThis.document = Object.assign(new EventTarget(), { baseURI: 'https://gallery.test/' });
  globalThis.window = new EventTarget();
  globalThis.addEventListener = globalThis.window.addEventListener.bind(globalThis.window);
  globalThis.SAME_PROMPT_CONFIG = { apiBaseUrl: 'https://backend.test/api/' };
  try { await run(await import(`../site/platform.js?case=${label}`)); }
  finally {
    globalThis.document = original.document;
    globalThis.window = original.window;
    globalThis.addEventListener = original.addEventListener;
    globalThis.fetch = original.fetch;
    globalThis.SAME_PROMPT_CONFIG = original.config;
  }
}

test('catalog renders before delayed session, and activity starts after both without blocking', async () => {
  await environment('delay', async ({ connectPlatform, platform, catalogState }) => {
    const session = pending(), activity = pending(), calls = [];
    globalThis.fetch = (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/session')) return session.promise;
      if (url.endsWith('/activity')) return activity.promise;
      return Promise.resolve(dto({ questions: [{ id: 'q' }], works: [{ task: 'q', id: 'w' }] }));
    };
    assert.equal(await connectPlatform(build), true);
    assert.equal(catalogState(), 'ready');
    assert.equal(platform.works.length, 1);
    assert.equal(platform.sessionReady, false);
    assert.equal(platform.activityReady, false);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.credentials, 'omit');
    session.resolve(dto({ user: { id: 'alice', role: 'user' }, me: { votes: 7 } }));
    await tick();
    assert.equal(platform.sessionReady, true);
    assert.equal(platform.user.id, 'alice');
    assert.equal(platform.activityReady, false);
    assert.equal(calls.length, 3);
    activity.resolve(dto({ arena: { q: { works: 4, entries: 2 } }, totals: { votes: 12 }, workAccess: [{ task: 'q', id: 'w', mine: true }] }));
    await tick();
    assert.equal(platform.activityReady, true);
    assert.equal(platform.works[0].mine, true);
  });
});

test('account and role changes clear remembered private data and reject old activity answers', async () => {
  await environment('identity', async ({ connectPlatform, refreshPlatform, platform, api, apiRemembered, recall }) => {
    let user = { id: 'alice', role: 'admin' }, delayed = null;
    globalThis.fetch = (url) => {
      if (url.endsWith('/catalog')) return Promise.resolve(dto({ questions: [{ id: 'q' }], works: [{ task: 'q', id: 'w' }] }));
      if (url.endsWith('/session')) return Promise.resolve(dto({ user, me: { votes: 1 } }));
      if (url.endsWith('/activity')) return delayed?.promise ?? Promise.resolve(dto({ arenaModels: [{ key: 'secret' }], workAccess: [{ task: 'q', id: 'w', mine: true }] }));
      if (url.endsWith('/auth/logout')) return Promise.resolve(dto());
      return Promise.resolve(dto({ secret: 1 }));
    };
    await connectPlatform(build); await tick();
    await apiRemembered('review');
    assert.equal(recall('review').secret, 1);
    delayed = pending();
    await refreshPlatform(); await tick();
    const oldActivity = delayed;
    await api('auth/logout', { method: 'POST' });
    assert.equal(platform.user, null);
    assert.equal(platform.review, null);
    assert.deepEqual(platform.arenaModels, []);
    assert.equal(platform.works[0].mine, undefined);
    assert.equal(recall('review'), undefined);
    user = { id: 'alice', role: 'user' }; delayed = null;
    await refreshPlatform('session'); await tick();
    assert.equal(platform.user.role, 'user');
    oldActivity.resolve(dto({ arenaModels: [{ key: 'old-admin' }], workAccess: [{ task: 'q', id: 'w', mine: false }] }));
    await tick();
    assert.notEqual(platform.arenaModels[0]?.key, 'old-admin');
    assert.equal(recall('review'), undefined);
    // A failed session refresh keeps the last proven identity.
    globalThis.fetch = (url) => url.endsWith('/session') ? Promise.resolve(dto({}, 503))
      : Promise.resolve(dto({ questions: [{ id: 'q' }], works: [{ task: 'q', id: 'w' }] }));
    await refreshPlatform(); await tick();
    assert.equal(platform.user.id, 'alice');
    assert.equal(platform.sessionError.status, 503);
  });
});

test('missing split endpoints use one bootstrap and only a standalone missing API allows archive mode', async () => {
  await environment('legacy', async ({ connectPlatform, platform }) => {
    const calls = [];
    globalThis.fetch = (url) => {
      calls.push(url);
      return Promise.resolve(url.endsWith('/bootstrap') ? dto({ user: null, questions: [], works: [], arena: {} }) : dto({}, 404));
    };
    assert.equal(await connectPlatform(build), true); await tick();
    assert.equal(calls.filter((url) => url.endsWith('/bootstrap')).length, 1);
    assert.equal(platform.sessionReady, true);
    assert.equal(platform.activityReady, true);
  });
  await environment('configured-missing', async ({ connectPlatform, catalogState }) => {
    globalThis.fetch = () => Promise.resolve(dto({}, 404));
    assert.equal(await connectPlatform(build), false); await tick();
    assert.equal(catalogState(), 'error');
    delete globalThis.SAME_PROMPT_CONFIG;
    assert.equal(catalogState(), 'static');
  });
  await environment('partial-deployment', async ({ connectPlatform, platform, catalogState }) => {
    globalThis.fetch = (url) => Promise.resolve(url.endsWith('/catalog') ? dto({ questions: [], works: [] }) : dto({}, 404));
    assert.equal(await connectPlatform(build), true); await tick();
    assert.equal(catalogState(), 'ready');
    assert.equal(platform.sessionConnecting, false);
    assert.equal(platform.sessionError.kind, 'missing');
    assert.equal(platform.sessionReady, false);
  });
});

test('same-account mutation supersedes pending activity with one fresh read', async () => {
  await environment('mutation-activity', async ({ connectPlatform, refreshPlatform, platform }) => {
    const oldRead = pending(), newRead = pending();
    let activityCalls = 0;
    globalThis.fetch = (url) => {
      if (url.endsWith('/catalog')) return Promise.resolve(dto({ questions: [{ id: 'q' }], works: [{ task: 'q', id: 'w' }] }));
      if (url.endsWith('/session')) return Promise.resolve(dto({ user: { id: 'alice', role: 'admin' }, me: {} }));
      activityCalls++;
      return activityCalls === 1 ? oldRead.promise : newRead.promise;
    };
    await connectPlatform(build); await tick();
    assert.equal(activityCalls, 1);
    await refreshPlatform('review'); await tick();
    assert.equal(activityCalls, 2, 'a mutation starts exactly one replacement activity read');
    newRead.resolve(dto({ arena: { q: { entries: 3, works: 5 } }, totals: { votes: 20 }, workAccess: [{ task: 'q', id: 'w', mine: false, arena: { state: 'off' } }] }));
    await tick();
    oldRead.resolve(dto({ arena: { q: { entries: 2, works: 4 } }, totals: { votes: 10 }, workAccess: [{ task: 'q', id: 'w', mine: true, arena: { state: 'in_pool' } }] }));
    await tick();
    assert.equal(platform.arena.q.works, 5);
    assert.equal(platform.totals.votes, 20);
    assert.equal(platform.works[0].mine, false);
    assert.equal(platform.works[0].arena.state, 'off');
    assert.equal(activityCalls, 2);
  });
});

test('proven session expiry immediately restores anonymous activity without a focus event', async () => {
  await environment('expired-session', async ({ connectPlatform, platform, api }) => {
    let activityCalls = 0;
    globalThis.fetch = (url) => {
      if (url.endsWith('/catalog')) return Promise.resolve(dto({ questions: [], works: [] }));
      if (url.endsWith('/session')) return Promise.resolve(dto({ user: { id: 'alice', role: 'admin' }, me: {} }));
      if (url.endsWith('/activity')) { activityCalls++; return Promise.resolve(dto({ totals: { votes: 12 }, arena: {} })); }
      return Promise.resolve(dto({ error: 'expired' }, 401));
    };
    await connectPlatform(build); await tick();
    assert.equal(platform.activityReady, true);
    await assert.rejects(api('me'), (error) => error.status === 401);
    await tick();
    assert.equal(platform.user, null);
    assert.equal(platform.activityReady, true);
    assert.equal(platform.totals.votes, 12);
    assert.equal(activityCalls, 2);
  });
});

test('leaderboard task choices remain selectable while pool statistics are unknown', async () => {
  await environment('board-options', async () => {
    const { boardTaskOptions } = await import('../site/leaderboard.js');
    const tasks = [{ id: 'open', title: 'Open task' }, { id: 'short', title: 'Short task' }];
    const waiting = boardTaskOptions(tasks, '', false, {});
    assert.doesNotMatch(waiting, /disabled|作品不足/);
    assert.match(waiting, /统计加载中/);
    const loaded = boardTaskOptions(tasks, '', true, { open: { entries: 2, works: 4 }, short: { entries: 1, works: 1 } });
    assert.match(loaded, /value="open">Open task（4）/);
    assert.match(loaded, /value="short" disabled>Short task（作品不足）/);
    const selected = boardTaskOptions(tasks, 'short', true, {});
    assert.match(selected, /value="short" selected>Short task/);
  });
});
