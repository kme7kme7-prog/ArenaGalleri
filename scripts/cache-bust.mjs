import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

function* files(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

// Only the gallery shell and its shared Three.js vendor modules participate.
// Results and other data-package pages are independent documents.
export function mainSiteAssets(dist, site) {
  const scripts = readdirSync(site).filter(name => name.endsWith('.js')).map(name => join(dist, name));
  const styles = readdirSync(site).filter(name => name.endsWith('.css')).map(name => join(dist, name));
  const vendor = [...files(join(dist, 'vendor'))].filter(path => path.endsWith('.js'));
  return { scripts: [...scripts, ...vendor].sort(), styles: styles.sort() };
}

export function cacheBustSite(dist, site) {
  const { scripts, styles } = mainSiteAssets(dist, site);
  const paths = [...scripts, ...styles].map(path => [relative(dist, path).replaceAll('\\', '/'), path])
    .sort(([a], [b]) => a.localeCompare(b, 'en'));
  const digest = createHash('sha256');
  digest.update(readFileSync(join(site, 'index.html')));
  for (const [path, file] of paths) {
    digest.update('\0' + path + '\0');
    digest.update(readFileSync(file));
  }
  const version = digest.digest('hex').slice(0, 24);
  const versioned = new Map(paths.filter(([path]) => path.endsWith('.js')).map(([path]) => [path, `./${path}?v=${version}`]));
  const htmlFile = join(dist, 'index.html');
  let html = readFileSync(htmlFile, 'utf8');
  const importmaps = [...html.matchAll(/<script\s+type="importmap">([^<]*)<\/script>/g)];
  if (importmaps.length !== 1) throw new Error('Expected one main-site import map');
  const imports = JSON.parse(importmaps[0][1]).imports;
  const bare = { ...imports };
  for (const [name, target] of Object.entries(imports)) {
    const path = target.replace(/^\.\//, '');
    if (versioned.has(path)) imports[name] = versioned.get(path);
  }
  for (const [path, target] of versioned) imports[`./${path}`] = target;
  // The entry's static import graph is listed right after the map, so the browser fetches every
  // module at once instead of one level of imports per round trip. import() stays lazy.
  const graph = new Set();
  const walk = (path) => {
    if (graph.has(path) || !versioned.has(path)) return;
    graph.add(path);
    const code = readFileSync(join(dist, path), 'utf8');
    for (const [, specifier] of code.matchAll(/(?:^|[\n;])\s*(?:import|export)\s*(?:[\w$*{}\s,]+\sfrom\s*)?['"]([^'"]+)['"]/g)) {
      walk(new URL(bare[specifier] ?? specifier, `https://site/${path}`).pathname.slice(1));
    }
  };
  walk(html.match(/<script\b[^>]*\btype="module"[^>]*\bsrc="(?:\.\/)?([^"?]+)"/)?.[1] ?? '');
  const preloads = [...graph].map((path) => `\n  <link rel="modulepreload" href="${versioned.get(path)}">`).join('');
  html = html.replace(importmaps[0][0], `<script type="importmap">${JSON.stringify({ imports })}</script>${preloads}`);
  const appendVersion = (url) => {
    const path = url.replace(/^\.\//, '');
    if (!paths.some(([asset]) => asset === path)) return url;
    return `${url}?v=${version}`;
  };
  html = html.replace(/(<script\b[^>]*\bsrc=")([^"]+)(")/g, (_, before, url, after) => before + appendVersion(url) + after);
  html = html.replace(/(<link\b(?=[^>]*\brel="stylesheet")[^>]*\bhref=")([^"]+)(")/g, (_, before, url, after) => before + appendVersion(url) + after);
  // Static hosting cannot mint a nonce. Hash the final inline boots and import map;
  // the browser intersects this policy with any additional Nginx header policy.
  html = html.replace(/<meta id="gallery-script-csp"[^>]*>\s*/g, '');
  const hashes = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((match) => `'sha256-${createHash('sha256').update(match[1].replaceAll('\r\n', '\n')).digest('base64')}'`);
  const policy = `script-src 'self' ${hashes.join(' ')} https://challenges.cloudflare.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'`;
  const meta = `<meta id="gallery-script-csp" http-equiv="Content-Security-Policy" content="${policy}">`;
  html = html.includes('<head>') ? html.replace('<head>', `<head>\n${meta}`) : meta + html;
  writeFileSync(htmlFile, html);
  // A tab open across a release compares this with its own ?v= before offering a full reload.
  writeFileSync(join(dist, 'version.json'), `${JSON.stringify({ assets: version })}\n`);
  return version;
}
