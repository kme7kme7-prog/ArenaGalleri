import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { checkDatapack } from './datapack.mjs';
import { readSource } from './datapack-client.mjs';
import { readPosterManifest, createPosterFingerprint, posterIsCurrent } from './poster-fingerprint.mjs';
import { cacheBustSite } from './cache-bust.mjs';
import { normalizeMediaCdnBase } from '../site/media-cdn.js';
import { publicCatalog, publishablePackageFile } from './public-catalog.mjs';

// Assembles dist/ = data package (.datapack/) + site overlay (site/).
// The two sides are designed to be disjoint; any file-level collision is a
// hard error, never a silent overwrite.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const DATAPACK = join(ROOT, '.datapack');
const SITE = join(ROOT, 'site');

if (!existsSync(DATAPACK)) {
  console.error('Missing .datapack/ — run `node scripts/fetch-datapack.mjs` first.');
  process.exit(1);
}

const { data, errors, works } = checkDatapack(DATAPACK, SITE);
if (errors.length) throw new Error(`Invalid datapack:\n${errors.join('\n')}`);
const config = JSON.parse(readFileSync(join(ROOT, 'site-config.json'), 'utf8'));
const origin = readSource(DATAPACK);
const buildInfo = { datapack: origin?.source === 'github' ? origin.commit : null,
  catalogDigest: createHash('sha256').update(readFileSync(join(DATAPACK, 'data.json'))).digest('hex'), schemaVersion: data.schemaVersion ?? 1 };
for (const field of ['title', 'subtitle', 'description', 'repo']) {
  if (typeof config[field] !== 'string' || !config[field].trim()) throw new Error(`site-config.json must set ${field}`);
  data[field] = config[field];
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
cpSync(DATAPACK, DIST, { recursive: true, filter: path => publishablePackageFile(relative(DATAPACK, path)) });
// Compatibility for the previously published package only. New data packages
// own and ship the bridge; this vendored copy belongs to the data tooling.
if (!existsSync(join(DIST, 'sandtable-bridge.js'))) {
  if (data.schemaVersion) throw new Error('Data package is missing its scene bridge');
  cpSync(join(ROOT, 'scripts/datapack-bridge.js'), join(DIST, 'sandtable-bridge.js'));
}

let overlaid = 0;
const collisions = [];
for (const file of walk(SITE)) {
  const rel = relative(SITE, file);
  const target = join(DIST, rel);
  if (existsSync(target)) {
    collisions.push(rel.split('\\').join('/'));
    continue;
  }
  mkdirSync(dirname(target), { recursive: true });
  cpSync(file, target);
  overlaid++;
}
if (collisions.length) {
  console.error('Site overlay collides with the data package at:');
  for (const rel of collisions) console.error(`  ${rel}`);
  console.error('Paths are meant to be disjoint; resolve the overlap before deploying.');
  process.exit(1);
}

// Posters and their paths come from the data package. A stale poster falls back
// locally; checkDatapack blocks the same mismatch in CI.
const manifest = readPosterManifest(DATAPACK);
const fingerprint = createPosterFingerprint({ datapackRoot: DATAPACK, siteRoot: SITE, manifest });
for (const task of data.tasks) {
  for (const result of task.results) {
    if (!posterIsCurrent({ datapackRoot: DATAPACK, task, result, manifest, fingerprint })) result.previewPoster = null;
  }
}
writeFileSync(join(DIST, 'data.json'), JSON.stringify(publicCatalog(data, buildInfo)));
function readCdnBase(name) {
  if (!Object.hasOwn(process.env, name)) return undefined;
  return normalizeMediaCdnBase(process.env[name], true);
}
const mediaBase = readCdnBase('MEDIA_CDN_BASE_URL');
const viteBase = readCdnBase('VITE_MEDIA_CDN_BASE_URL');
if (mediaBase !== undefined && viteBase !== undefined && mediaBase !== viteBase) {
  throw new Error('MEDIA_CDN_BASE_URL and VITE_MEDIA_CDN_BASE_URL disagree');
}
// Empty or unset stays off. An explicit empty MEDIA_CDN_BASE_URL wins over a missing alias.
const mediaCdnBaseUrl = mediaBase !== undefined ? mediaBase : (viteBase ?? '');
if (process.env.API_BASE_URL || process.env.MEDIA_BASE_URL || mediaCdnBaseUrl || mediaBase !== undefined || viteBase !== undefined) {
  const runtime = {};
  for (const [variable, field] of [['API_BASE_URL', 'apiBaseUrl'], ['MEDIA_BASE_URL', 'mediaBaseUrl']]) {
    if (!process.env[variable]) continue;
    const base = new URL(process.env[variable]);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error(`${variable} must be an HTTP(S) URL`);
    runtime[field] = base.href;
  }
  if (!runtime.apiBaseUrl) runtime.apiBaseUrl = 'api/';
  runtime.mediaCdnBaseUrl = mediaCdnBaseUrl;
  writeFileSync(join(DIST, 'runtime-config.js'), `globalThis.SAME_PROMPT_CONFIG = ${JSON.stringify(runtime)};\n`);
}

const assetVersion = cacheBustSite(DIST, SITE);

console.log(`Assembled dist/: ${works} result(s) + ${overlaid} site file(s), no collisions. Assets: ${assetVersion}`);
