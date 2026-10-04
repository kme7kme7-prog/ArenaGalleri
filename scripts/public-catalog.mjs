// Only fields used by the public gallery belong in its display catalog.
const pick = (value, fields) => Object.fromEntries(fields.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));

export function publicCatalog(data, buildInfo) {
  return {
    ...pick(data, ['title', 'subtitle', 'description', 'repo', 'schemaVersion']),
    buildInfo: pick(buildInfo, ['datapack', 'catalogDigest', 'schemaVersion']),
    models: data.models.map(model => pick(model, ['id', 'name', 'vendor', 'logo', 'brandUrl', 'brandName', 'vendorNote', 'aliases'])),
    harnesses: (data.harnesses ?? []).map(item => pick(item, ['id', 'name', 'kind', 'maker', 'url', 'logo', 'aliases', 'listed'])),
    providers: (data.providers ?? []).map(item => pick(item, ['id', 'name', 'kind', 'operator', 'url', 'logo', 'aliases', 'listed'])),
    tasks: data.tasks.map(task => ({
      ...pick(task, ['id', 'title', 'summary', 'date', 'category', 'domains', 'sandtable', 'sceneProfile', 'prompt', 'promptPending', 'version', 'owner', 'referenceCredit']),
      references: (task.references ?? []).map(ref => pick(ref, ['name', 'src', 'thumb', 'caption', 'width', 'height'])),
      promptVariants: (task.promptVariants ?? []).map(variant => pick(variant, ['id', 'label', 'prompt'])),
      conditions: (task.conditions ?? []).map(condition => pick(condition, ['id', 'label', 'note', 'mobile'])),
      results: task.results.map(result => ({
        ...pick(result, ['id', 'model', 'effort', 'harness', 'harnessVersion', 'provider', 'sourceLabel', 'promptVariant',
          'title', 'summary', 'scene', 'previewModel', 'previewPoster', 'previewLoader', 'previewMode', 'addedAt',
          'captureNote', 'generationMode', 'humanIntervention']),
        guide: {
          ...pick(result.guide ?? {}, ['tips']),
          sections: (result.guide?.sections ?? []).map(section => pick(section, ['title', 'items'])),
          presets: (result.guide?.presets ?? []).map(preset => pick(preset, ['label', 'query'])),
        },
        captures: result.captures ?? {},
        gallery: (result.gallery ?? []).map(shot => pick(shot, ['src', 'caption'])),
      })),
    })),
  };
}

// Build diagnostics and source maps stay in the private input, never in dist/.
export function publishablePackageFile(path) {
  const normalized = path.replaceAll('\\', '/');
  const name = normalized.split('/').at(-1);
  return !['data.json', '.datapack-source.json', 'assets/scenes/posters.json', 'assets/brands/README.md'].includes(normalized)
    && name !== 'build-info.json'
    && !/\.map$/i.test(name);
}
