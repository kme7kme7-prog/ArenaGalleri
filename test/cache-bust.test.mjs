import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { cacheBustSite } from '../scripts/cache-bust.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gallery-cache-'));
  const site = join(root, 'site'), dist = join(root, 'dist');
  mkdirSync(site); mkdirSync(dist); mkdirSync(join(dist, 'vendor'));
  mkdirSync(join(dist, 'results'));
  const save = (path, content) => writeFileSync(path, content);
  const js = {
    'app.js': "import './helper.js'; await import('./lazy.js');",
    'helper.js': "import * as THREE from 'three';",
    'lazy.js': "import './vendor/OrbitControls.js';",
    'runtime-config.js': 'globalThis.SAME_PROMPT_CONFIG = { apiBaseUrl: "https://one.example/api/" };'
  };
  for (const [name, content] of Object.entries(js)) {
    save(join(site, name), content); save(join(dist, name), content);
  }
  save(join(site, 'style.css'), 'body { color: red }');
  save(join(dist, 'style.css'), 'body { color: red }');
  save(join(dist, 'vendor', 'three.module.js'), "export * from './three.core.js';");
  save(join(dist, 'vendor', 'three.core.js'), 'export const color = 1;');
  save(join(dist, 'vendor', 'OrbitControls.js'), "import * as THREE from 'three';");
  save(join(dist, 'results', 'original.js'), 'keep this byte for byte');
  save(join(dist, 'index.html'), '<link rel="stylesheet" href="style.css"><script type="importmap">{"imports":{"three":"./vendor/three.module.js"}}</script><script src="runtime-config.js"></script><script type="module" src="app.js"></script>');
  save(join(site, 'index.html'), readFileSync(join(dist, 'index.html')));
  return { root, site, dist };
}

test('versions the complete local module graph and direct HTML assets under either base path', () => {
  const { root, site, dist } = fixture();
  try {
    const version = cacheBustSite(dist, site, 'same-sha');
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    const maps = [...html.matchAll(/<script type="importmap">([^<]+)<\/script>/g)];
    assert.equal(maps.length, 1);
    const imports = JSON.parse(maps[0][1]).imports;
    for (const name of ['app.js', 'helper.js', 'lazy.js', 'runtime-config.js', 'vendor/three.module.js', 'vendor/three.core.js', 'vendor/OrbitControls.js']) {
      assert.equal(imports[`./${name}`], `./${name}?v=${version}`);
    }
    assert.equal(imports.three, `./vendor/three.module.js?v=${version}`);
    assert.match(html, new RegExp(`href="style\\.css\\?v=${version}"`));
    assert.match(html, new RegExp(`src="runtime-config\\.js\\?v=${version}"`));
    assert.match(html, new RegExp(`src="app\\.js\\?v=${version}"`));
    assert.deepEqual(JSON.parse(readFileSync(join(dist, 'version.json'), 'utf8')), { assets: version });
    assert.match(version, /^[a-f0-9]{24}$/);
    const policy = html.match(/id="gallery-script-csp"[^>]*content="([^"]+)"/)[1];
    assert.ok(!policy.includes('unsafe-inline'));
    for (const match of html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      assert.ok(policy.includes(`'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`));
    }
    for (const base of ['https://example.test/', 'https://example.test/gallery/']) {
      const staticImport = new URL(imports['./helper.js'], base);
      const dynamicImport = new URL(imports['./lazy.js'], base);
      const vendorImport = new URL(imports['./vendor/three.core.js'], base);
      assert.equal(staticImport.pathname, new URL('helper.js', base).pathname);
      assert.equal(dynamicImport.pathname, new URL('lazy.js', base).pathname);
      assert.equal(vendorImport.pathname, new URL('vendor/three.core.js', base).pathname);
      assert.equal(staticImport.search, `?v=${version}`);
    }
    assert.equal(readFileSync(join(dist, 'results', 'original.js'), 'utf8'), 'keep this byte for byte');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the same frontend commit gets a new version when runtime configuration changes', () => {
  const first = fixture(), second = fixture();
  try {
    const version1 = cacheBustSite(first.dist, first.site, 'same-sha');
    writeFileSync(join(second.dist, 'runtime-config.js'), 'globalThis.SAME_PROMPT_CONFIG = { apiBaseUrl: "https://two.example/api/" };');
    const version2 = cacheBustSite(second.dist, second.site, 'same-sha');
    assert.notEqual(version1, version2);
    assert.equal(version1, cacheBustSite(first.dist, first.site, 'same-sha'));
  } finally {
    rmSync(first.root, { recursive: true, force: true });
    rmSync(second.root, { recursive: true, force: true });
  }
});
