import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { readPosterManifest, createPosterFingerprint, posterIsCurrent } from './poster-fingerprint.mjs';
import { MENTIONS_REFERENCES } from '../site/reference-files.js';

// Validate published assets; source builds and intake belong to the data repository.
export function checkDatapack(root, site) {
  const errors = [], warnings = [];
  // A missing or stale poster makes cards fall back to screenshots. CI blocks that release;
  // local builds only warn while the data repository regenerates its posters.
  const posterIssues = process.env.CI ? errors : warnings;
  const manifest = readPosterManifest(root);
  const fingerprint = createPosterFingerprint({ datapackRoot: root, siteRoot: site, manifest });
  let data, works = 0;
  const file = (path, label, base = root) => {
    if (typeof path !== 'string' || !path || !resolve(base, path).startsWith(base + sep)) {
      errors.push(`${label}: invalid asset path ${path}`);
      return null;
    }
    const target = resolve(base, path);
    if (!existsSync(target) || !statSync(target).isFile()) {
      errors.push(`${label}: missing ${path}`);
      return null;
    }
    return target;
  };
  try { data = JSON.parse(readFileSync(join(root, 'data.json'), 'utf8')); }
  catch (error) { return { errors: [`Cannot read datapack data.json: ${error.message}`], warnings, works }; }
  if (!Array.isArray(data.models) || !data.models.length || !Array.isArray(data.tasks) || !data.tasks.length) {
    return { errors: ['data.json must contain nonempty models and tasks arrays'], warnings, works };
  }
  for (const field of ['title', 'subtitle', 'description', 'repo']) {
    if (typeof data[field] !== 'string' || !data[field].trim()) errors.push(`data.json: missing ${field}`);
  }
  const brandFile = file('assets/brands/README.md', 'Logo sources');
  const brands = brandFile ? readFileSync(brandFile, 'utf8') : '';
  const models = new Set(), tasks = new Set();
  for (const model of data.models) {
    if (!model.id || models.has(model.id)) errors.push(`Missing or duplicate model id: ${model.id}`);
    models.add(model.id);
    for (const field of ['name', 'vendor', 'brandName', 'brandUrl']) {
      if (typeof model[field] !== 'string' || !model[field].trim()) errors.push(`${model.id}: missing ${field}`);
    }
    file(model.logo, model.id);
    if (!model.logo || !brands.includes(model.logo.split('/').at(-1))) errors.push(`${model.id}: logo source is undocumented`);
    if (model.vendorNote) warnings.push(`${model.id}: ${model.vendorNote}`);
  }
  for (const vendor of ['three.module.js', 'three.core.js', 'OrbitControls.js', 'BufferGeometryUtils.js']) file(`vendor/${vendor}`, 'Viewer');
  const reserved = new Set(['questions', 'arena', 'leaderboard', 'new', 'exam', 'submit', 'me', 'review']);
  for (const task of data.tasks) {
    if (!task.id || tasks.has(task.id) || reserved.has(task.id)) errors.push(`Invalid or duplicate task id: ${task.id}`);
    tasks.add(task.id);
    if (typeof task.title !== 'string' || !task.title.trim() || typeof task.prompt !== 'string' || !task.prompt.trim() || !Array.isArray(task.tags) || !Array.isArray(task.conditions) || !Array.isArray(task.results)) {
      errors.push(`${task.id}: missing title, prompt, tags, conditions or results`);
      continue;
    }
    // Reference images go to every model with the prompt; the prompt says how many and in what order.
    const names = new Set();
    for (const ref of task.references ?? []) {
      if (!/^\d{2}-[^/\\]+\.(?:jpe?g|png|webp)$/i.test(ref.name ?? '') || names.has(ref.name)) errors.push(`${task.id}: invalid or duplicate reference name ${ref.name}`);
      names.add(ref.name);
      file(ref.src, `${task.id} reference`);
      if (ref.thumb) file(ref.thumb, `${task.id} reference`);
    }
    const prompts = [task.prompt, ...(task.promptVariants ?? []).map(variant => variant.prompt)].join('\n');
    if (!task.references?.length && MENTIONS_REFERENCES.test(prompts)) warnings.push(`${task.id}: prompt mentions reference images but the task has none`);
    const ids = new Set();
    for (const result of task.results) {
      works++;
      const key = `${task.id}/${result.id}`;
      if (!result.id || ids.has(result.id)) errors.push(`${key}: invalid or duplicate result id`);
      ids.add(result.id);
      if (!models.has(result.model)) errors.push(`${key}: unregistered model ${result.model}`);
      if (!result.title?.trim() || !result.source?.trim()) errors.push(`${key}: missing title or source`);
      if (!result.addedAt || !/(?:Z|[+-]\d{2}:\d{2})$/.test(result.addedAt) || !Number.isFinite(Date.parse(result.addedAt))) errors.push(`${key}: invalid addedAt`);
      file(`${result.scene}index.html`, key);
      if (result.previewMode !== 'screenshot') file(`${result.previewLoader}index.html`, key);
      for (const condition of ['first', 'mobile']) {
        if (!task.conditions.some(item => item.id === condition)) errors.push(`${key}: missing ${condition} condition`);
        file(result.captures?.[condition], key);
      }
      for (const image of result.gallery ?? []) file(image.src, key);
      if (result.previewMode === 'screenshot') continue;
      const modelFile = file(result.previewModel, key);
      if (modelFile) {
        try {
          const buffer = gunzipSync(readFileSync(modelFile));
          const header = JSON.parse(buffer.subarray(4, 4 + buffer.readUInt32LE(0)));
          if (!header.meshes?.length || !header.geometries?.length || header.version >= 2 && !header.compact) errors.push(`${key}: empty or uncompacted preview model`);
          const bytes = statSync(modelFile).size;
          if (bytes > 3 * 1024 * 1024) warnings.push(`${key}: preview model ${(bytes / 1048576).toFixed(2)} MiB; review loading on mobile`);
        } catch (error) { errors.push(`${key}: unreadable preview model (${error.message})`); }
      }
      const poster = result.previewPoster;
      if (poster && existsSync(join(root, poster))) {
        file(poster, key);
        if (modelFile && !posterIsCurrent({ datapackRoot: root, task, result, manifest, fingerprint })) posterIssues.push(`${key}: stale preview poster; regenerate in arenaofbias-data (screenshot fallback)`);
      }
      else posterIssues.push(`${key}: missing preview poster in datapack; generate it in arenaofbias-data`);
    }
  }
  return { data, errors, warnings, works };
}
