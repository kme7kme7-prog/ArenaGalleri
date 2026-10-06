// Check the API configured by the published Gallery, rather than an unrelated API URL.
import assert from 'node:assert/strict';
import { compatibleBuild, staleBuild } from '../site/platform-api.js';

const [siteUrl, expectedApiUrl] = process.argv.slice(2);
assert.ok(siteUrl && expectedApiUrl, 'Usage: npm run check:deployment -- <gallery URL> <expected API directory URL>');
const site = new URL(siteUrl);
const expectedApi = new URL(expectedApiUrl).href;
const read = async (path) => {
  const response = await fetch(new URL(path, site), { cache: 'no-store' });
  assert.ok(response.ok, `${response.url}: HTTP ${response.status}`);
  return response;
};
const source = await (await read('runtime-config.js')).text();
const config = JSON.parse(source.match(/SAME_PROMPT_CONFIG\s*=\s*(\{[^\n]*\})/)?.[1] ?? 'null');
assert.ok(config?.apiBaseUrl, 'Published runtime must explicitly configure the production API');
const configuredApi = new URL(config.apiBaseUrl, site);
if (configuredApi.pathname === '/') configuredApi.pathname = '/api/';
if (!configuredApi.pathname.endsWith('/')) configuredApi.pathname += '/';
const actualApi = configuredApi.href;
assert.equal(actualApi, expectedApi, 'Published Gallery API differs from the expected production API');
const response = await fetch(new URL('bootstrap', actualApi), { cache: 'no-store', headers: { Origin: site.origin } });
assert.ok(response.ok, `Configured bootstrap: HTTP ${response.status}`);
assert.equal(response.headers.get('access-control-allow-origin'), site.origin, 'Gallery origin must be allowed by the API');
const bootstrap = await response.json();
const catalog = await (await read('data.json')).json();
assert.ok(compatibleBuild(catalog.buildInfo, bootstrap), 'Published Gallery and configured API must be compatible');
assert.ok(!staleBuild(catalog.buildInfo, bootstrap), 'Published Gallery and configured API must use the same datapack');
assert.ok(bootstrap.questions.length >= catalog.tasks.length, 'Configured API must include the packaged questions');
console.log(JSON.stringify({ api: actualApi, questions: bootstrap.questions.length, communityQuestions: bootstrap.questions.filter((q) => !catalog.tasks.some((t) => t.id === q.id)).length, works: bootstrap.works.length, server: bootstrap.serverVersion }));
