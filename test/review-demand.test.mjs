import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../site/account.js', import.meta.url), 'utf8');
const bucketSource = source.slice(source.indexOf('function reviewBucket('), source.indexOf('const galleryOn ='));
const reviewSource = bucketSource + source.slice(source.indexOf('const REVIEW_SUMMARY ='));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = () => new Promise((resolve) => setImmediate(resolve));
const work = (id, bucket = 'unverified') => ({ task: 'q', id, title: id, status: bucket === 'verified' ? 'verified' : 'unverified', bucket });
const page = (panel, works = [], extras = {}) => ({ panel, works, questions: [], audit: [], total: 105, scopeTotal: 120, page: 1,
  counts: { questions: 3, content: 4, unverified: 105 }, filterCounts: { all: 120, public: 70 }, ...extras });
function environment(param, responses = []) {
  const reads = [], details = [], opened = [], dialogs = [], buckets = [], notices = [], nodes = new Map();
  let role = 'admin', version = 1;
  const root = { innerHTML: '', querySelector(selector) {
    if (!selector.includes('-results]') && !selector.includes('-chips]') && selector !== '.work-manage-heading h3 span') return null;
    if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '', textContent: '' });
    return nodes.get(selector);
  } };
  const state = { URLSearchParams, AbortController, setTimeout, clearTimeout, console,
    accountKey: () => `${version}:${role}`, isStaff: () => role === 'admin', isSenior: () => role === 'admin',
    platform: { user: { id: 'admin' }, arena: {} },
    todoTabs: () => ({ questions: '题目', content: '内容', unverified: '核验' }), DONE_TABS: { done: '已处理', log: '记录' },
    manageTabs: () => ({ catalog: '全部题目', works: '全部作品', members: '全部成员' }), FILTER_TABS: { verified: 'public' },
    DONE_FILTERS: { all: '全部', public: '已公开' }, CATALOG_FILTERS: { all: '全部' }, ACCOUNT: {}, ACTIONS: {},
    membersState: () => ({ list: null, filter: 'all', query: '', email: '', active: '', sort: 'seen' }),
    memberList: (s, pagination) => `<div data-member-chips></div><div data-member-results>${JSON.stringify(s.list)}${pagination}</div>`,
    memberChips: (s) => JSON.stringify(s.filterCounts), memberResults: (s) => JSON.stringify(s.list),
    canDecide: () => true, pickId: (w) => `${w.task}/${w.id}`, held: () => false, faceOn: (w) => w.show_gallery || w.show_arena,
    workRow: (_, w) => `<article>${w.title}</article>`, reviewQuestionRow: (_, q) => `<article>${q.title}</article>`,
    catalogRow: (_, q) => `<article>${q.title}</article>`, questionWaiting: () => true,
    brandMark: () => '', thumb: () => '', publisherHtml: () => '', dateHtml: (s) => s, timeHtml: (s) => s,
    icon: () => '', esc: (s) => String(s ?? ''), setPageTitle() {}, accountNav: () => '', FACE_ACTIONS: {},
    recall: () => undefined, toast: (message) => notices.push(message), signedOut() {}, $$: () => [],
    apiRemembered(path, options) { const next = responses.shift() ?? page('unverified'); reads.push({ path, signal: options.signal }); return next?.promise ?? Promise.resolve(next); },
    api(path, options) { const next = deferred(); details.push({ path, signal: options.signal, ...next }); return next.promise; },
    openWorkManagement: (_, w) => opened.push(['manage', w.id]), openReview: (_, w, options) => { opened.push(['review', w.id]); dialogs.push({ w, options }); },
    openContent: (_, w, options) => { opened.push(['content', w.id]); dialogs.push({ w, options }); }, reviewEditor() {}, refreshPlatform: async () => {},
  };
  vm.runInNewContext(`${reviewSource}\nglobalThis.mountReview = review;`, state);
  const bucket = state.reviewBucket;
  state.reviewBucket = (...args) => { const result = bucket(...args); buckets.push(result); return result; };
  const ctx = { param, DATA: { tasks: [{ id: 'q', title: 'Question' }] }, packagedWork: () => ({}),
    pageStart: (data) => data.caption ?? '', pageEnd: () => '', settleImages() {}, inGallery: () => true,
    modelOf: () => ({ name: 'Model' }) };
  const mounted = state.mountReview(root, ctx);
  const event = (selector, dataset = {}) => ({ target: { closest: (s) => s === selector ? { dataset, closest: () => null } : null } });
  return { root, nodes, reads, details, opened, dialogs, buckets, notices, mounted, responses, event,
    revoke() { role = 'member'; version++; }, destroy() { mounted.destroy(); } };
}

test('members opens the paged member endpoint directly and requests another page on demand', async () => {
  const e = environment('members', [{ users: [{ id: 'one' }], total: 105, scopeTotal: 120, page: 1 }]);
  try {
    await e.mounted.ready;
    assert.equal(e.reads.length, 1);
    assert.match(e.reads[0].path, /^admin\/users\?page=1&pageSize=50/);
    assert.match(e.root.innerHTML, /one/);
    e.responses.push({ users: [{ id: 'fifty-one' }], total: 105, scopeTotal: 120, page: 2 });
    await e.root.onclick(e.event('[data-review-page]', { reviewPage: 'members', page: '2' }));
    assert.match(e.reads[1].path, /page=2/);
    assert.match(e.nodes.get('[data-member-results]').innerHTML, /fifty-one/);
    assert.doesNotMatch(e.nodes.get('[data-member-results]').innerHTML, /"one"/);
  } finally { e.destroy(); }
});

test('work search and filters use server totals and drop obsolete responses after a fast switch', async () => {
  const e = environment('works', [page('works', [work('first')])]);
  try {
    await e.mounted.ready;
    assert.match(e.root.innerHTML, /已公开<span>70/);
    const stale = deferred(), latest = deferred(); e.responses.push(stale, latest);
    const older = e.root.onclick(e.event('[data-managed-filter]', { managedFilter: 'public' }));
    const newer = e.root.onclick(e.event('[data-managed-filter]', { managedFilter: 'content' }));
    assert.equal(e.reads[1].signal.aborted, true);
    latest.resolve(page('works', [work('latest')], { total: 7 })); await newer;
    stale.resolve(page('works', [work('stale')])); await older;
    assert.match(e.nodes.get('[data-managed-results]').innerHTML, /latest/);
    assert.doesNotMatch(e.nodes.get('[data-managed-results]').innerHTML, /stale/);
    assert.match(e.reads[2].path, /filter=content/);
  } finally { e.destroy(); }
});

test('details load only on open, share repeated clicks, recover failure and never open after revocation', async () => {
  const e = environment('works', [page('works', [work('one'), work('two')])]);
  try {
    await e.mounted.ready; assert.equal(e.details.length, 0);
    const first = e.root.onclick(e.event('[data-manage-work]', { manageWork: 'q/one' }));
    const repeated = e.root.onclick(e.event('[data-manage-work]', { manageWork: 'q/one' }));
    assert.equal(e.details.length, 1);
    e.details[0].reject(new Error('offline')); await first; await repeated;
    assert.deepEqual(e.opened, []); assert.deepEqual(e.notices, ['offline']);
    const retry = e.root.onclick(e.event('[data-manage-work]', { manageWork: 'q/one' }));
    const next = e.root.onclick(e.event('[data-manage-work]', { manageWork: 'q/two' }));
    assert.equal(e.details[1].signal.aborted, true);
    e.details[1].resolve({ work: work('one') }); await retry;
    e.revoke(); e.details[2].resolve({ work: work('two') }); await next;
    assert.deepEqual(e.opened, []);
  } finally { e.destroy(); }
});

test('leaving review cancels lists and detail reads even when the transport resolves late', async () => {
  const first = deferred(), e = environment('log', [first]);
  e.destroy(); assert.equal(e.reads[0].signal.aborted, true);
  first.resolve(page('log', [], { audit: [{ action: 'meta', detail: 'private late row' }] })); await flush();
  assert.doesNotMatch(e.root.innerHTML, /private late row/);
  const detail = environment('works', [page('works', [work('one')])]);
  await detail.mounted.ready;
  const opening = detail.root.onclick(detail.event('[data-manage-work]', { manageWork: 'q/one' }));
  detail.destroy(); assert.equal(detail.details[0].signal.aborted, true);
  detail.details[0].resolve({ work: work('one') }); await opening;
  assert.deepEqual(detail.opened, []);
});


test('a decision removes its old bucket and platform refresh cannot cancel opening the next work', async () => {
  const e = environment('unverified', [page('unverified', [work('one'), work('two'), work('three')])]);
  try {
    await e.mounted.ready;
    const opening = e.root.onclick(e.event('[data-review], [data-content], [data-delete]', { review: 'q/one' }));
    await flush(); e.details[0].resolve({ work: work('one'), question: { id: 'q' } }); await opening;
    const first = e.dialogs[0];
    first.options.onChanged({ ...first.w, bucket: undefined, status: 'verified', reviewed: { gallery: '2026-10-23' }, show_gallery: true });
    first.options.onDecided(); await flush();
    assert.equal(e.details[1].path, 'admin/works/q/two');
    e.responses.push(page('unverified', [work('two'), work('three')], { counts: { unverified: 2 } }));
    await e.mounted.onPlatformChange('review');
    assert.equal(e.details[1].signal.aborted, false);
    e.details[1].resolve({ work: work('two') }); await flush();
    assert.deepEqual(e.opened, [['review', 'one'], ['review', 'two']]);
    const second = e.dialogs[1];
    second.options.onChanged({ ...second.w, bucket: undefined, status: 'verified', reviewed: { gallery: '2026-10-23' }, show_gallery: true });
    second.options.onDecided(); await flush();
    assert.equal(e.details[2].path, 'admin/works/q/three', 'the already decided first work cannot re-enter the queue');
    e.details[2].resolve({ work: work('three') }); await flush();
  } finally { e.destroy(); }
});

test('a shrunken final page returns to a valid page rather than showing an empty queue', async () => {
  const e = environment('works', [page('works', [work('one')])]);
  try {
    await e.mounted.ready;
    e.responses.push(page('works', [], { page: 3, total: 50 }), page('works', [work('remaining')], { page: 1, total: 50 }));
    await e.root.onclick(e.event('[data-review-page]', { reviewPage: 'works', page: '3' }));
    assert.match(e.reads[1].path, /page=3/); assert.match(e.reads[2].path, /page=1/);
    assert.match(e.nodes.get('[data-managed-results]').innerHTML, /remaining/);
  } finally { e.destroy(); }
});

test('member controls retain the complete server query and typing is debounced', async () => {
  const e = environment('members', [{ users: [], total: 0, scopeTotal: 0, page: 1 }]);
  const select = async (name, value) => e.root.onchange({ target: { closest: (s) => s === '[data-member-select]' ? { name, value } : null } });
  try {
    await e.mounted.ready;
    e.responses.push({ users: [], total: 0, scopeTotal: 0, page: 1 }); await select('email', 'none');
    e.responses.push({ users: [], total: 0, scopeTotal: 0, page: 1 }); await select('active', 'idle');
    e.responses.push({ users: [], total: 0, scopeTotal: 0, page: 1 }); await select('sort', 'votes');
    e.responses.push({ users: [], total: 0, scopeTotal: 0, page: 1 }); await e.root.onclick(e.event('[data-member-filter]', { memberFilter: 'trusted' }));
    const type = (value) => e.root.oninput({ target: { closest: (s) => s === '[data-member-search]' ? { value } : null } });
    const before = e.reads.length;
    type('first'); type('member name');
    e.responses.push({ users: [], total: 0, scopeTotal: 0, page: 1 });
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(e.reads.length, before + 1);
    const query = new URLSearchParams(e.reads.at(-1).path.split('?')[1]);
    assert.equal(query.get('email'), 'unbound'); assert.equal(query.get('active'), 'idle');
    assert.equal(query.get('sort'), 'votes'); assert.equal(query.get('filter'), 'trusted'); assert.equal(query.get('q'), 'member name');
  } finally { e.destroy(); }
});

test('default is selected by the server and content has independent manual and automatic pages', async () => {
  const initial = environment('', [page('questions', [], { questions: [{ id: 'pending-q', title: 'Pending question' }] })]);
  try {
    await initial.mounted.ready;
    assert.match(initial.reads[0].path, /panel=default/);
    assert.match(initial.root.innerHTML, /Pending question/);
  } finally { initial.destroy(); }
  const e = environment('content', [page('content', [work('manual', 'content')], { autoWorks: [work('automatic', 'auto')], autoTotal: 105, autoPage: 1 })]);
  try {
    await e.mounted.ready;
    assert.match(e.root.innerHTML, /manual/); assert.match(e.root.innerHTML, /automatic/);
    e.responses.push(page('content', [work('manual', 'content')], { autoWorks: [work('automatic-page-two', 'auto')], autoTotal: 105, autoPage: 2 }));
    await e.root.onclick(e.event('[data-review-page]', { reviewPage: 'auto', page: '2' }));
    const query = new URLSearchParams(e.reads[1].path.split('?')[1]);
    assert.equal(query.get('page'), '1'); assert.equal(query.get('autoPage'), '2');
    assert.match(e.root.innerHTML, /automatic-page-two/);
    assert.match(e.root.innerHTML, /第 2 \/ 3 页/);
  } finally { e.destroy(); }
});


test('content decisions preserve private question status while recomputing the work bucket', async () => {
  for (const [status, expected] of [['review', 'sample'], ['rejected', 'rejected']]) {
    const sample = { ...work('sample', 'content'), task: 'private', moderation: { status: 'review' } };
    const e = environment('content', [page('content', [sample], { counts: { content: 1 }, questionChoices: [{ id: 'private', title: 'Private question' }] })]);
    try {
      await e.mounted.ready;
      const opening = e.root.onclick(e.event('[data-review], [data-content], [data-delete]', { content: 'private/sample' }));
      await flush(); e.details[0].resolve({ work: sample, question: { id: 'private', title: 'Private question', moderation: { status } } }); await opening;
      e.dialogs[0].options.onChanged({ ...sample, moderation: { status: 'approved' } });
      assert.equal(e.buckets.at(-1), expected);
      assert.match(e.root.innerHTML, /没有等待人工审核内容的投稿/);
      assert.equal(e.dialogs[0].options.onDecided(), ' · 内容队列已清空');
    } finally { e.destroy(); }
  }
});
