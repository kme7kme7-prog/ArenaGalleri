// Cross-repository contract check against the real pinned datapack and an isolated server.
// SERVER_REPO_DIR=... node scripts/integration-smoke.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, request } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { compatibleBuild, resolveApiMedia } from '../site/platform-api.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = resolve(process.env.SERVER_REPO_DIR || join(root, '.integration', 'server'));
const dataRoot = process.env.DATA_REPO_DIR && resolve(process.env.DATA_REPO_DIR);
const datapackRoot = join(root, '.datapack');
const pin = JSON.parse(readFileSync(join(root, 'datapack.json')));
assert.ok(existsSync(join(serverRoot, 'server', 'app.mjs')), `Missing server checkout: ${serverRoot}`);
assert.equal(JSON.parse(readFileSync(join(serverRoot, 'datapack.json'))).commit, pin.commit, 'frontend/server pins differ');
assert.deepEqual(readFileSync(join(root, 'scripts', 'datapack-client.mjs')),
  readFileSync(join(serverRoot, 'scripts', 'datapack-client.mjs')), 'shared datapack client differs');
if (dataRoot) {
  assert.deepEqual(readFileSync(join(root, 'scripts', 'datapack-client.mjs')),
    readFileSync(join(dataRoot, 'scripts', 'datapack-client.mjs')), 'data canonical datapack client differs');
  assert.deepEqual(readFileSync(join(root, 'scripts', 'datapack-bridge.js')),
    readFileSync(join(dataRoot, 'scripts', 'datapack-bridge.js')), 'data canonical bridge differs');
}
const marker = JSON.parse(readFileSync(join(datapackRoot, '.datapack-source.json')));
assert.ok(['github', 'local'].includes(marker.source), 'unknown datapack source');
if (marker.source === 'github') assert.equal(marker.commit, pin.commit, 'cached datapack differs from frontend pin');
const packageCommit = marker.source === 'github' ? marker.commit : null;
const rawData = readFileSync(join(datapackRoot, 'data.json'));
const catalogDigest = createHash('sha256').update(rawData).digest('hex');
const data = JSON.parse(rawData);
// A published package in the current format names the data commit it was built from;
// that must be the data commit integration.json checks tools and bridge against.
const integration = JSON.parse(readFileSync(join(root, 'integration.json')));
if (marker.source === 'github' && data.schemaVersion != null) {
  assert.equal(data.sourceCommit, integration.data.commit, 'datapack sourceCommit differs from the integration.json data pin');
}
const task = data.tasks.find((entry) => entry.results?.length >= 2 && !entry.promptPending);
assert.ok(task, 'no packaged task with two works');

const { createPlatform } = await import(pathToFileURL(join(serverRoot, 'server', 'app.mjs')).href);
const { config: defaults, limits } = await import(pathToFileURL(join(serverRoot, 'server', 'config.mjs')).href);
const temporary = mkdtempSync(join(tmpdir(), 'same-prompt-integration-'));
let platform, site, content;
const listen = (server) => new Promise((done, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { server.off('error', reject); done(); });
});
const close = (server) => server && new Promise((done) => server.close(done));

try {
  const config = { ...defaults, dist: datapackRoot, dataDir: join(temporary, 'data'),
    contentTemplate: '', siteOrigins: ['http://127.0.0.1'], capture: false, secureCookies: false, cookieSameSite: 'Lax' };
  content = createServer((req, res) => platform.handleContent(req, res));
  await listen(content);
  config.contentTemplate = `http://{token}.localhost:${content.address().port}`;
  const mails = [];
  platform = createPlatform({ config, limits, mailer: { ready: () => true, send: async (mail) => { mails.push(mail); } } });
  site = createServer(platform.handleSite);
  await listen(site);
  const base = `http://127.0.0.1:${site.address().port}`;
  globalThis.document = { baseURI: `${base}/` };
  globalThis.SAME_PROMPT_CONFIG = { apiBaseUrl: `${base}/api/`, mediaBaseUrl: `${base}/` };

  const call = async (path, { method = 'GET', body, cookie, version = packageCommit, raw = false } = {}) => {
    const headers = { origin: 'http://127.0.0.1' };
    if (version) headers['X-Datapack-Version'] = version;
    if (cookie) headers.cookie = cookie;
    if (body !== undefined && !raw) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}/api/${path}`, { method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  const boot = await call('bootstrap');
  assert.equal(boot.status, 200);
  assert.equal(boot.data.datapack, packageCommit);
  assert.equal(boot.data.catalogDigest, catalogDigest);
  assert.equal(boot.data.apiVersion, 2);
  assert.equal(typeof boot.data.serverVersion, 'string');
  assert.equal(compatibleBuild({ datapack: packageCommit, catalogDigest }, boot.data), true);
  // One question list: every packaged question is public before anyone asks a new one.
  assert.equal(resolveApiMedia(boot.data, 'bootstrap').questions.length, data.tasks.length);

  // Registration binds an email: the code is sent first, then spent on the new account.
  const register = async (name) => {
    const email = `${name}@example.test`;
    const sent = await call('auth/email/send', { method: 'POST', body: { purpose: 'register', email } });
    assert.equal(sent.status, 200, JSON.stringify(sent.data));
    assert.deepEqual(sent.data, { sent: true, email });
    const code = mails.findLast((mail) => mail.to === email && mail.purpose === 'register')?.code;
    assert.ok(code, 'registration code not delivered');
    const registered = await call('auth/register', { method: 'POST', body: { name, password: 'correct horse', email, code } });
    assert.equal(registered.status, 200, JSON.stringify(registered.data));
    const session = registered.headers.get('set-cookie')?.split(';')[0];
    assert.ok(session, 'session cookie missing');
    const sessionBoot = await call('bootstrap', { cookie: session });
    assert.equal(sessionBoot.status, 200);
    assert.equal(sessionBoot.data.user.emailBound, true);
    return registered;
  };
  const login = await register('smoke-user');
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie, 'session cookie missing');
  const me = await call('me', { cookie });
  assert.equal(me.status, 200);
  assert.deepEqual(resolveApiMedia(me.data, 'me').works, []);
  // A new account can publish with a real sample before earning standalone-question access.
  const sample = await call('drafts?task=__new__&name=sample.html', { method: 'POST', cookie,
    body: '<!doctype html><title>Sample</title><p>A sample for the new question</p>', raw: true });
  assert.equal(sample.status, 200, JSON.stringify(sample.data));
  const question = await call('questions', { method: 'POST', cookie, body: {
    title: 'Smoke question', summary: 'Integration check.', category: '静态网页', domains: [boot.data.domains[0]], prompt: 'Build one small page.', templates: ['static'],
    draftId: sample.data.draft.id, confirmed: true,
    work: { title: 'Sample', modelName: 'Smoke model', vendor: 'Smoke vendor', effort: 'High', providerId: 'official',
      harnessOther: 'CLI', generationMode: 'single-turn', humanIntervention: 'none', trial: { loaded: true } },
  } });
  assert.equal(question.status, 200, JSON.stringify(question.data));
  assert.ok(question.data.question.id);

  // A real upload supplies an API media path; the frontend DTO mapping must resolve it.
  const draft = await call(`drafts?task=${task.id}&name=smoke.html`, { method: 'POST', cookie,
    body: '<!doctype html><title>Smoke work</title><p>Integration check</p>', raw: true });
  assert.equal(draft.status, 200);
  const preview = resolveApiMedia(draft.data.draft, 'draft').preview;
  assert.equal(preview, draft.data.draft.preview);
  const cover = `data:image/png;base64,${readFileSync(join(datapackRoot, 'assets', 'brands', 'qwen.png')).toString('base64')}`;
  const submitted = await call('works', { method: 'POST', cookie, body: {
    draftId: draft.data.draft.id, title: 'Smoke work', modelName: 'Smoke model', vendor: 'Smoke vendor',
    effort: 'High', providerId: 'official', harnessOther: 'CLI', generationMode: 'single-turn', humanIntervention: 'none',
    confirmed: true, trial: { loaded: true, loadMs: 1 }, cover,
  } });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.data));
  const resolvedWork = resolveApiMedia(submitted.data, 'work').work;
  assert.match(submitted.data.work.cover, /^media\//);
  assert.equal(resolvedWork.cover, `${base}/${submitted.data.work.cover}`);
  assert.equal((await fetch(resolvedWork.cover)).status, 404, 'unverified upload stays private');
  assert.equal((await fetch(resolvedWork.cover, { headers: { cookie } })).status, 200, 'author can read own cover');
  platform.auth.promote('smoke-user');
  const reviewed = await call('admin/works/batch-review', { method: 'POST', cookie, body: {
    works: [{ task: task.id, id: submitted.data.work.id }], status: 'verified',
  } });
  assert.equal(reviewed.status, 200, JSON.stringify(reviewed.data));
  assert.equal(reviewed.data.results[0].ok, true, JSON.stringify(reviewed.data));
  assert.equal((await fetch(resolvedWork.cover)).status, 200, 'verified Gallery upload is public');
  const freshBoot = await call('bootstrap');
  assert.equal(resolveApiMedia(freshBoot.data, 'bootstrap').works.find((w) => w.id === submitted.data.work.id).cover, resolvedWork.cover);

  // The pinned server predates work_overrides until the coordinated pin update.
  const hasOverrides = Boolean(platform.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='work_overrides'").get());
  if (hasOverrides) {
    const approved = [];
    for (const result of task.results) {
      if (approved.some((entry) => entry.model === result.model)) continue;
      approved.push(result);
      if (approved.length === 2) break;
    }
    for (const result of approved) platform.db.prepare(`INSERT INTO work_overrides
      (task_id, work_id, show_gallery, show_arena, updated_by, updated_at) VALUES (?, ?, 1, 1, 'smoke', 0)`).run(task.id, result.id);
  }
  const match = await call('arena/matches', { method: 'POST', cookie, body: { task: task.id } });
  assert.equal(match.status, 200, JSON.stringify(match.data));
  const frame = resolveApiMedia(match.data, 'match').a;
  assert.equal(frame, match.data.a);
  const tokenHost = new URL(frame).host;
  const getContent = (pathname) => new Promise((done, reject) => {
    const req = request({ hostname: '127.0.0.1', port: content.address().port, path: pathname, headers: { host: tokenHost } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => done({ status: response.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
  const html = await getContent('/');
  assert.equal(html.status, 200);
  assert.match(html.body.toString(), /__sp_fold\.js/);
  const work = platform.arena.workForToken(tokenHost.split('.')[0]);
  assert.ok(work?.dir, 'match token did not resolve to a packaged work');
  const firstResource = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) { const found = firstResource(join(directory, entry.name)); if (found) return found; }
      else if (entry.isFile() && entry.name !== 'index.html') return join(directory, entry.name);
    }
    return null;
  };
  const resource = firstResource(work.dir);
  assert.ok(resource, 'matched work has no static resource');
  const asset = await getContent(`/${relative(work.dir, resource).split(sep).join('/')}`);
  assert.equal(asset.status, 200);
  assert.deepEqual(asset.body, readFileSync(resource));
  const vote = await call(`arena/matches/${match.data.id}/vote`, { method: 'POST', cookie, body: { choice: 'a' } });
  assert.equal(vote.status, 200);
  assert.equal(vote.data.counted, true);
  const revealed = resolveApiMedia(vote.data, 'reveal');
  assert.ok(revealed.a?.title && revealed.b?.title);
  const secondLogin = await register('stale-user');
  assert.equal(secondLogin.status, 200);
  const secondCookie = secondLogin.headers.get('set-cookie')?.split(';')[0];
  const mismatch = await call('arena/matches', { method: 'POST', cookie: secondCookie, version: 'f'.repeat(40), body: { task: task.id } });
  if (hasOverrides) {
    assert.equal(mismatch.status, 200, JSON.stringify(mismatch.data));
    assert.equal(mismatch.headers.get('X-Datapack-Stale'), '1');
  } else {
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.data.code, 'datapack_mismatch');
  }
  console.log(`Integration smoke passed: ${task.id}, ${basename(resource)}, API v2, ${packageCommit ? `pinned ${packageCommit.slice(0, 12)}` : `local ${catalogDigest.slice(0, 12)}`}.`);
} finally {
  await close(site);
  await close(content);
  await platform?.close();
  assert.ok(temporary.startsWith(resolve(tmpdir()) + sep) && basename(temporary).startsWith('same-prompt-integration-'));
  rmSync(temporary, { recursive: true, force: true });
}
