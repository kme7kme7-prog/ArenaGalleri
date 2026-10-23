import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../site/publish.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const question = { id: 'rejected', title: 'Saved title', summary: 'Summary', category: 'web', domains: ['web'], prompt: 'Prompt', templates: ['static'], resubmittable: true,
  moderation: { status: 'rejected', at: '2026-10-23T00:00:00Z', round: 1 }, references: [] };
const answer = title => ({ question: { ...question, title }, works: [{ id: 'sample', task: 'rejected', title: 'Kept sample', modelName: 'Fixture', scene: 'https://media.test/private-preview' }] });
function environment({ resubmit = true, aborts = false } = {}) {
  let version = 1, html = '', timerId = 0;
  const reads = [], timers = new Map(), notices = [], refreshes = [];
  const fields = new Map();
  const field = name => { if (!fields.has(name)) fields.set(name, { value: '', innerHTML: '', textContent: '', hidden: false, focus() {} }); return fields.get(name); };
  const form = { querySelector: field, querySelectorAll: () => [] };
  const root = { get innerHTML() { return html; }, set innerHTML(value) {
    html = value; const title = value.match(/name="title"[^>]*value="([^"]*)"/); if (title) field('[name="title"]').value = title[1];
  }, querySelector: selector => selector === '.publish-form' ? html.includes('class="publish-form"') ? form : null : field(selector) };
  const state = { AbortController, URLSearchParams, history: { state: {} },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    accountVersion: () => version, platform: { user: { id: 'one' } }, can: () => true,
    addEventListener() {}, removeEventListener() {}, setPageTitle() {}, scrollTo() {}, referencesEnabled: () => false,
    $: (selector, node) => node.querySelector(selector), $$: (selector, node) => node.querySelectorAll(selector),
    esc: String, formatDate: String, pad: String, icon: () => '', moderationBadge: () => '', reviewVerdict: () => '',
    categoryOf: () => ({ templates: ['static'] }), categoryField: () => '', domainField: () => '', syncDomains() {}, TEMPLATE_LABELS: {},
    resolveApiMedia(data, endpoint) { assert.equal(endpoint, 'question'); return data; },
    requireUser: async () => true, toast: message => notices.push(message), refreshPlatform: async reason => refreshes.push(reason),
    FormData: class { get(key) { return { title: 'New title', summary: 'Summary', prompt: 'Prompt', category: 'web' }[key]; } getAll(key) { return { domains: ['web'], templates: ['static'] }[key] ?? []; } },
    api(path, options = {}) {
      let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      const read = { path, ...options, resolve, reject, promise }; reads.push(read);
      if (aborts) options.signal?.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      return promise;
    },
  };
  vm.runInNewContext(source.replace(/^import .*$/gm, '').replace('export function mount', 'function mount') + '\nglobalThis.mountForTest=mount;', state);
  const page = state.mountForTest(root, { param: resubmit ? 'rejected' : null, DATA: { title: 'Fixture' }, pageStart: () => '', pageEnd: () => '' });
  return { root, form, field, state, page, reads, timers, notices, refreshes, identity() { version++; state.platform.user = { id: 'two' }; } };
}

test('resubmission reads only its question, coalesces session events, and preserves unsaved edits and the sample preview', async () => {
  const e = environment();
  assert.equal(e.reads[0].path, 'me?view=resubmit&question=rejected');
  e.page.onPlatformChange('session'); assert.equal(e.reads.length, 1);
  e.reads[0].resolve(answer('Saved title')); await e.page.ready;
  assert.match(e.root.innerHTML, /Kept sample/); assert.match(e.root.innerHTML, /https:\/\/media.test\/private-preview/);
  e.field('[name="title"]').value = 'Unsaved edit'; e.page.onPlatformChange('session');
  assert.equal(e.reads.length, 1); assert.equal(e.field('[name="title"]').value, 'Unsaved edit');
  e.page.destroy(); assert.equal(e.timers.size, 0);
});

test('old account and departed resubmission reads are aborted and cannot install their form', async () => {
  const e = environment(); e.identity(); e.page.onPlatformChange('identity');
  assert.equal(e.reads[0].signal.aborted, true); assert.equal(e.reads.length, 2);
  e.reads[0].resolve(answer('Old private title')); await flush(); assert.doesNotMatch(e.root.innerHTML, /Old private title/);
  e.page.destroy(); assert.equal(e.reads[1].signal.aborted, true);
  e.reads[1].resolve(answer('Departed private title')); await flush(); assert.doesNotMatch(e.root.innerHTML, /Departed private title/);
});

test('resubmission failures offer one explicit retry and a missing owner question never creates an editor', async () => {
  const e = environment(); e.reads[0].reject(new Error('offline')); await e.page.ready;
  assert.match(e.root.innerHTML, /offline[\s\S]*data-resubmit-retry/);
  e.root.onclick({ target: { closest: () => ({}) } });
  e.reads[1].reject(Object.assign(new Error('not found'), { status: 404 })); await flush();
  assert.match(e.root.innerHTML, /没有找到这道题/); assert.doesNotMatch(e.root.innerHTML, /publish-form|data-resubmit-retry/);
  e.page.destroy();
});

test('a resubmission body timeout and malformed answer both recover with a new request', async () => {
  const e = environment({ aborts: true });
  [...e.timers.values()].find(timer => timer.ms === 15000).fn(); await e.page.ready;
  assert.match(e.root.innerHTML, /连接超时，请重试。/); assert.equal(e.reads[0].signal.aborted, true);
  e.root.onclick({ target: { closest: () => ({}) } }); e.reads[1].resolve({ question, works: 'broken' }); await flush();
  assert.match(e.root.innerHTML, /data-resubmit-retry/);
  e.root.onclick({ target: { closest: () => ({}) } }); e.reads[2].resolve(answer('Recovered title')); await flush();
  assert.equal(e.field('[name="title"]').value, 'Recovered title'); e.page.destroy();
});

test('a late question publication cannot notify, refresh or redraw a different account', async () => {
  const e = environment({ resubmit: false });
  e.root.onsubmit({ target: e.form, submitter: { value: 'plain' }, preventDefault() {} }); await flush();
  assert.equal(e.reads.length, 1); assert.equal(e.reads[0].path, 'questions');
  e.identity(); e.reads[0].resolve({ question: { ...question, moderation: { status: 'pending' } } }); await flush();
  assert.deepEqual(e.notices, []); assert.deepEqual(e.refreshes, []); assert.doesNotMatch(e.root.innerHTML, /submit-done/);
  e.page.destroy();
});
