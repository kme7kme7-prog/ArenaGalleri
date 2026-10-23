import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../site/announcements.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const entry = id => ({ id, title: `Announcement ${id}`, body: 'Body', publishedAt: '2026-10-23T00:00:00Z' });
function environment({ aborts = false } = {}) {
  let version = 1, timerId = 0;
  const reads = [], dialogs = [], deadlines = new Map(), intervals = new Map(), notices = [], identityListeners = [];
  const document = Object.assign(new EventTarget(), { hidden: false, body: { append(dialog) { dialog.isConnected = true; } }, createElement() {
    const dialog = Object.assign(new EventTarget(), { open: false, isConnected: false,
      setAttribute() {}, showModal() { this.open = true; }, focus() {}, remove() { this.isConnected = false; },
      close() { this.open = false; this.dispatchEvent(new Event('close')); }, querySelector(selector) { return selector === '[data-ann-form]' ? this.form : selector === '[name="title"]' ? { focus() {} } : null; },
    });
    Object.defineProperty(dialog, 'innerHTML', { get() { return this.html; }, set(value) {
      this.html = value;
      this.form = value.includes('data-ann-form') ? { matches: () => true, elements: { title: { value: '' }, body: { value: '' } },
        querySelector: () => ({ disabled: false, hidden: false }) } : null;
    } });
    dialogs.push(dialog); return dialog;
  } });
  const state = { AbortController, Event, document, window: new EventTarget(), locale: () => 'zh-CN', isSenior: () => true,
    accountVersion: () => version, onPlatformChange: listener => identityListeners.push(listener),
    store: { get: () => '9999', set() {} }, esc: String, icon: () => '', renderAnnouncementMarkdown: String, console: { warn() {} },
    toast: message => notices.push(message),
    setTimeout(fn, ms) { const id = ++timerId; deadlines.set(id, { fn, ms }); return id; }, clearTimeout: id => deadlines.delete(id),
    setInterval(fn, ms) { const id = ++timerId; intervals.set(id, { fn, ms }); return id; }, clearInterval: id => intervals.delete(id),
    api(path, options = {}) {
      let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      reads.push({ path, ...options, resolve, reject, promise });
      if (aborts) options.signal?.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      return promise;
    },
  };
  vm.runInNewContext(source.replace(/^import .*$/gm, '').replace(/^export /gm, '') + '\nglobalThis.ann={startAnnouncements,openAnnouncements,latestAnnouncement};', state);
  const click = (dialog, attribute) => {
    const event = new Event('click'); Object.defineProperty(event, 'target', { value: { closest: () => ({ hasAttribute: name => name === attribute }) } }); dialog.dispatchEvent(event);
  };
  const compose = () => { state.ann.openAnnouncements(); const dialog = dialogs.at(-1); click(dialog, 'data-ann-add'); return dialog; };
  const submit = dialog => { const event = new Event('submit'); Object.defineProperty(event, 'target', { value: dialog.form }); dialog.dispatchEvent(event); };
  const visibility = hidden => { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); };
  return { state, reads, dialogs, deadlines, intervals, notices, compose, submit, click, visibility, identity() { version++; identityListeners.forEach(listener => listener('identity')); } };
}

test('visibility handlers exist during the first slow body; hidden cancels and a foreground read wins over a late response', async () => {
  const e = environment(), starting = e.state.ann.startAnnouncements();
  assert.equal(e.intervals.size, 1); e.visibility(true); assert.equal(e.intervals.size, 0); assert.equal(e.reads[0].signal.aborted, true);
  e.visibility(false); assert.equal(e.reads.length, 2); e.reads[0].resolve({ entries: [entry(99)] }); await starting;
  assert.equal(e.state.ann.latestAnnouncement(), null); e.reads[1].resolve({ entries: [entry(7)] }); await flush();
  assert.equal(e.state.ann.latestAnnouncement().id, 7); assert.equal(e.intervals.size, 1); e.visibility(true);
});

test('a body deadline frees the initial announcement read and a dialog offers an explicit retry', async () => {
  const e = environment({ aborts: true }), starting = e.state.ann.startAnnouncements();
  [...e.deadlines.values()].find(timer => timer.ms === 15000).fn(); await starting;
  assert.equal(e.reads[0].signal.aborted, true); e.state.ann.openAnnouncements();
  const dialog = e.dialogs.at(-1); assert.match(dialog.innerHTML, /data-ann-retry/);
  // Opening an empty dialog already starts the same retry; clicking does not duplicate it.
  e.click(dialog, 'data-ann-retry'); assert.equal(e.reads.length, 2);
  e.reads[1].resolve({ entries: [entry(7)] }); await flush();
  assert.equal(e.state.ann.latestAnnouncement().id, 7); assert.doesNotMatch(dialog.innerHTML, /data-ann-retry/); e.visibility(true);
});

test('late announcement writes cannot replace another dialog or the same-role new account editor', async () => {
  for (const changed of ['dialog', 'identity']) {
    const e = environment(), starting = e.state.ann.startAnnouncements(); e.reads[0].resolve({ entries: [entry(7)] }); await starting;
    let dialog = e.compose(); e.submit(dialog); const writing = e.reads[1];
    if (changed === 'dialog') { dialog.close(); dialog = e.compose(); }
    else { e.identity(); e.click(dialog, 'data-ann-add'); }
    const form = dialog.form; form.elements.title.value = 'New unsaved title'; writing.resolve({ entry: entry(8) }); await flush();
    assert.equal(dialog.form, form); assert.equal(form.elements.title.value, 'New unsaved title');
    assert.equal(e.state.ann.latestAnnouncement().id, 7); assert.deepEqual(e.notices, []); e.visibility(true);
  }
});

test('an earlier public poll cannot erase a successfully published announcement', async () => {
  const e = environment(), starting = e.state.ann.startAnnouncements(); e.reads[0].resolve({ entries: [entry(7)] }); await starting;
  e.visibility(true); e.visibility(false); const polling = e.reads[1];
  const dialog = e.compose(); e.submit(dialog); e.reads[2].resolve({ entry: entry(8) }); await flush();
  assert.equal(polling.signal.aborted, true); assert.equal(e.state.ann.latestAnnouncement().id, 8);
  polling.resolve({ entries: [] }); await flush(); assert.equal(e.state.ann.latestAnnouncement().id, 8); assert.equal(e.notices.length, 1); e.visibility(true);
});
