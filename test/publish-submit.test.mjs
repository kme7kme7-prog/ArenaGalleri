import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document = { title: '', addEventListener() {} };
globalThis.window = { addEventListener() {} };
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.history = { state: {} };
globalThis.SAME_PROMPT_CONFIG = { apiBaseUrl: 'https://backend.test/api/' };
const { platform } = await import('../site/platform.js');
const { mount } = await import('../site/publish.js');
const settle = () => new Promise(resolve => setImmediate(resolve));

async function withForm(values, run) {
  const previous = { user: platform.user, site: platform.site, sessionReady: platform.sessionReady };
  const originalFormData = globalThis.FormData, originalFetch = globalThis.fetch;
  platform.user = { id: 1, role: 'user', level: 1, emailBound: true, capabilities: { canSubmitQuestion: true } };
  platform.site = { limits: { referenceCount: 0 } };
  platform.sessionReady = true;
  const error = { textContent: '' }, buttons = [{ disabled: false }, { disabled: false }];
  const fields = new Map();
  const field = selector => { if (!fields.has(selector)) fields.set(selector, { innerHTML: '', value: '', focus() {} }); return fields.get(selector); };
  const form = {
    querySelector: selector => selector === '.form-error' ? error : selector === '[data-domain-count]' ? null : field(selector),
    querySelectorAll: selector => selector === 'button[type="submit"]' ? buttons : [],
  };
  const root = { innerHTML: '', querySelector: selector => selector === '.publish-form' ? form : field(selector) };
  globalThis.FormData = class {
    constructor(node) { assert.equal(node, form); }
    get(name) { const value = values[name]; return Array.isArray(value) ? value[0] ?? null : value ?? null; }
    getAll(name) { const value = values[name]; return Array.isArray(value) ? value : value == null ? [] : [value]; }
  };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options.method, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ error: 'Test submission rejected' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  };
  const page = mount(root, { DATA: { title: 'Gallery test' }, pageStart: () => '', pageEnd: () => '' });
  const submit = async mode => {
    root.onsubmit({ target: form, submitter: { value: mode }, preventDefault() {} });
    await settle();
  };
  try { await run({ submit, error, calls, buttons }); }
  finally {
    page.destroy();
    Object.assign(platform, previous);
    globalThis.FormData = originalFormData;
    globalThis.fetch = originalFetch;
  }
}

for (const mode of ['plain', 'sample']) {
  test(`${mode} question submission reaches form validation`, async () => {
    await withForm({ title: '' }, async ({ submit, error, calls }) => {
      await submit(mode);
      assert.equal(error.textContent, '请填写题目标题');
      assert.equal(calls.length, 0, 'invalid forms must not be sent');
    });
  });
}

test('a complete question reaches the API and can be retried after a rejection', async () => {
  const question = { title: 'A question', summary: 'Compare answers', prompt: 'Build a page',
    category: '静态网页', domains: ['计算机技术'], templates: ['static'] };
  await withForm(question, async ({ submit, error, calls, buttons }) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      await submit('plain');
      assert.equal(calls.length, attempt);
      assert.deepEqual(calls.at(-1), { url: 'https://backend.test/api/questions', method: 'POST', body: question });
      assert.equal(error.textContent, 'Test submission rejected');
      assert.ok(buttons.every(button => !button.disabled), 'a rejected request must allow retrying');
    }
  });
});
