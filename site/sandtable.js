import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { batchArchitecture } from './sandtable-batching.js';
import { createArchitectureLod } from './sandtable-lod.js';
import { disposeObject } from './scene-resources.js';
import { setPageTitle } from './i18n.js';
export { disposeObject } from './scene-resources.js';

const $ = (selector, root) => root.querySelector(selector);
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function copyAttribute(attribute) {
  // The iframe has its own TypedArray constructors. WebGL checks against the
  // main window's constructors, so recreate the buffer in this realm.
  const types = { Float32Array, Float64Array, Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array };
  const source = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;
  const array = new types[source.constructor.name](source);
  if (attribute.isInterleavedBufferAttribute) {
    const data = new THREE.InterleavedBuffer(array, attribute.data.stride);
    return new THREE.InterleavedBufferAttribute(data, attribute.itemSize, attribute.offset, attribute.normalized);
  }
  return new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized);
}

function copyGeometry(source) {
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, copyAttribute(attribute));
  if (source.index) geometry.setIndex(copyAttribute(source.index));
  geometry.groups = source.groups.map(group => ({ ...group }));
  geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
  return geometry;
}

// Export the original meshes, including instance matrices and vertex colours.
// A shared exhibition light replaces each author's sky, fog and postprocessing.
export async function importArchitecture(scenes, id, { architecture = true, railwayPreview = false } = {}) {
  let sliceStart = performance.now();
  async function yieldImport() {
    if (performance.now() - sliceStart < 8) return;
    await new Promise(resolve => setTimeout(resolve, 0));
    sliceStart = performance.now();
  }
  const candidates = scenes.map((scene) => {
    let count = 0;
    scene.traverseVisible((o) => { if (o.isMesh && !o.material?.isShaderMaterial) count += o.isInstancedMesh ? o.count : 1; });
    return { scene, count };
  }).sort((a, b) => b.count - a.count);
  const source = candidates[0]?.scene;
  if (!source) throw new Error('作品尚未生成建筑场景');
  source.updateMatrixWorld(true);
  const lightPositions = [];
  source.traverseVisible((object) => {
    if (object.isDirectionalLight) lightPositions.push(object.getWorldPosition(new THREE.Vector3()));
  });
  const meshes = [];
  source.traverseVisible((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (railwayPreview && materials.every(m => !m.visible || m.opacity === 0 || m.isShadowMaterial)) return;
    // Background domes and full-screen postprocessing quads are not architecture.
    if (materials.every((m) => m.side === THREE.BackSide || (architecture && (m.isShaderMaterial || m.fog === false)))) return;
    let instances;
    const bounds = new THREE.Box3();
    if (railwayPreview && mesh.isInstancedMesh) {
      // Particle pools park unused instances far below the model at tiny scale.
      // Export active instances only, so those sentinels cannot affect framing.
      mesh.geometry.computeBoundingBox();
      instances = [];
      const matrix = new THREE.Matrix4(), scale = new THREE.Vector3();
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix); scale.setFromMatrixScale(matrix);
        if (Math.max(scale.x, scale.y, scale.z) < 0.001) continue;
        instances.push(i);
        bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(matrix).applyMatrix4(mesh.matrixWorld));
      }
    } else bounds.setFromObject(mesh);
    const size = bounds.getSize(new THREE.Vector3());
    if (bounds.isEmpty() || !Number.isFinite(size.length())) return;
    // Some originals draw a sun orb beside their directional light.
    // Keep that decoration out of both the building export and its bounds.
    if (mesh.geometry.type === 'SphereGeometry' && materials.every((m) => m.isMeshBasicMaterial)) {
      const center = bounds.getCenter(new THREE.Vector3());
      if (lightPositions.some((position) => position.distanceTo(center) < Math.max(size.x, size.y, size.z) * 3)) return;
    }
    meshes.push({ mesh, bounds, size, instances });
  });
  // Ignore infinite floors when finding the footprint; keep actual raised terrain.
  const solid = architecture || railwayPreview ? meshes.filter(({ size }) => size.y > Math.max(size.x, size.z) * 0.008) : meshes;
  const widths = solid.map(({ size }) => Math.max(size.x, size.z)).sort((a, b) => a - b);
  const sceneryLimit = (widths[Math.floor((widths.length - 1) * 0.75)] || 1) * 8;
  const bounds = new THREE.Box3();
  for (const item of solid) if (railwayPreview || item.mesh.isInstancedMesh || Math.max(item.size.x, item.size.z) <= sceneryLimit) bounds.union(item.bounds);
  // Some results merge distant scenery or clouds into the world. These extents
  // follow each result's site/layout source and keep the complete compound.
  const compoundBounds = architecture && {
    'mimo-v2.6-pro': [[-85, -1.4, -80], [85, 65, 90]],
    'mimo-v2.6-flash': [[-65, -4, -70], [65, 55, 65]],
    'sonnet-5.5-max': [[-128.5, 0, -190], [127.5, 112, 210]],
    'glm-5.3': [[-52.5, -0.5, -72.5], [51.5, 60, 57.5]],
    'glm-5.3-flash': [[-46.5, -0.5, -50.5], [46.5, 60, 48.5]],
    'space-bunny': [[-125, -1, -190], [125, 120, 130]],
  }[id];
  if (compoundBounds) { bounds.min.fromArray(compoundBounds[0]); bounds.max.fromArray(compoundBounds[1]); }
  if (bounds.isEmpty()) throw new Error('未找到可展示的建筑');
  const span = bounds.getSize(new THREE.Vector3());
  const footprint = Math.max(span.x, span.z);
  const meta = { textures: {}, images: {} }, materialJson = new Map(), geometries = new Map();
  const materialIds = new Map(), materialSignatures = new Map();
  const children = [];
  const instanceIndices = new Map();
  for (const { mesh, size, bounds: meshBounds, instances } of meshes) {
    if (compoundBounds && !meshBounds.intersectsBox(bounds)) continue;
    if (!compoundBounds && Math.max(size.x, size.z) > footprint * 1.25) continue;
    if (!geometries.has(mesh.geometry.uuid)) geometries.set(mesh.geometry.uuid, copyGeometry(mesh.geometry));
    for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
      if (materialIds.has(material.uuid)) continue;
      const json = material.toJSON(meta);
      delete json.envMap;
      const signature = JSON.stringify({ ...json, uuid: undefined, metadata: undefined, name: undefined });
      if (!materialSignatures.has(signature)) {
        materialSignatures.set(signature, material.uuid);
        materialJson.set(material.uuid, json);
      }
      materialIds.set(material.uuid, materialSignatures.get(signature));
    }
    children.push(mesh);
    if (instances) instanceIndices.set(mesh, instances);
    if (children.length % 32 === 0) await yieldImport();
  }
  const loader = new THREE.ObjectLoader();
  const images = await loader.parseImagesAsync(Object.values(meta.images));
  const textures = loader.parseTextures(Object.values(meta.textures), images);
  const materials = loader.parseMaterials([...materialJson.values()], textures);
  const group = new THREE.Group();
  for (const sourceMesh of children) {
    const geometry = geometries.get(sourceMesh.geometry.uuid);
    const material = Array.isArray(sourceMesh.material) ? sourceMesh.material.map(m => materials[materialIds.get(m.uuid)]) : materials[materialIds.get(sourceMesh.material.uuid)];
    const indices = instanceIndices.get(sourceMesh);
    const mesh = sourceMesh.isInstancedMesh ? new THREE.InstancedMesh(geometry, material, indices?.length ?? sourceMesh.count) : new THREE.Mesh(geometry, material);
    if (sourceMesh.isInstancedMesh) {
      if (indices) indices.forEach((index, target) => mesh.instanceMatrix.array.set(sourceMesh.instanceMatrix.array.subarray(index * 16, index * 16 + 16), target * 16));
      else mesh.instanceMatrix.array.set(sourceMesh.instanceMatrix.array.subarray(0, sourceMesh.count * 16));
      mesh.instanceMatrix.needsUpdate = true;
      if (sourceMesh.instanceColor) {
        const colors = new Float32Array(mesh.count * 3);
        if (indices) indices.forEach((index, target) => colors.set(sourceMesh.instanceColor.array.subarray(index * 3, index * 3 + 3), target * 3));
        else colors.set(sourceMesh.instanceColor.array.subarray(0, mesh.count * 3));
        mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
      }
    }
    mesh.matrix.copy(sourceMesh.matrixWorld);
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.renderOrder = sourceMesh.renderOrder;
    group.add(mesh);
    if (group.children.length % 32 === 0) await yieldImport();
  }
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = 88 / footprint;
  group.scale.setScalar(scale);
  group.position.set(-center.x * scale, -bounds.min.y * scale + 2.1, -center.z * scale);
  const batches = await batchArchitecture(group);
  const detail = await createArchitectureLod(group, scale);
  console.debug(`Sandtable ${id}: ${batches.before} → ${batches.after} mesh submissions; ${batches.trianglesBefore} → ${detail.detailed} triangles; overview ${detail.overview} triangles`);
  const previewBounds = new THREE.Box3(
    new THREE.Vector3(-span.x * scale / 2, 2.1, -span.z * scale / 2),
    new THREE.Vector3(span.x * scale / 2, span.y * scale + 2.1, span.z * scale / 2),
  );
  return { group, lods: detail.lods, height: span.y * scale, previewBounds };
}

function createLandscape(scene) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -3;
  scene.add(ground);

  const mountains = [0, 1].map((layer) => {
    const material = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
    const hills = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 9, 5), material, 24);
    const transform = new THREE.Object3D();
    for (let i = 0; i < hills.count; i++) {
      const angle = i / hills.count * Math.PI * 2 + layer * 0.13;
      const radius = 1050 + layer * 350 + Math.sin(i * 2.7) * 75;
      const height = 100 + layer * 35 + (Math.sin(i * 1.9) + 1) * 35;
      transform.position.set(Math.cos(angle) * radius, -height * 0.45 - 3, Math.sin(angle) * radius);
      transform.scale.set(240 + Math.cos(i * 2.1) * 55, height, 190 + Math.sin(i * 1.3) * 40);
      transform.rotation.y = angle;
      transform.updateMatrix(); hills.setMatrixAt(i, transform.matrix);
    }
    scene.add(hills);
    return hills;
  });

  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.5, 1, 5), new THREE.MeshStandardMaterial({ roughness: 1 }), 64);
  const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), 64);
  const transform = new THREE.Object3D();
  for (let i = 0; i < trunks.count; i++) {
    const angle = i / trunks.count * Math.PI * 2;
    const radius = 560 + (Math.sin(i * 4.3) + 1) * 95;
    const height = 14 + (Math.sin(i * 2.1) + 1) * 9;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    transform.position.set(x, height * 0.2 - 3, z);
    transform.scale.set(1, height * 0.4, 1);
    transform.updateMatrix(); trunks.setMatrixAt(i, transform.matrix);
    transform.position.y = height * 0.65 - 3;
    transform.scale.set(height * 0.3, height, height * 0.3);
    transform.rotation.y = angle;
    transform.updateMatrix(); leaves.setMatrixAt(i, transform.matrix);
  }
  scene.add(trunks, leaves);

  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4; skyCanvas.height = 256;
  const sky = new THREE.CanvasTexture(skyCanvas);
  sky.colorSpace = THREE.SRGBColorSpace;
  scene.background = sky;
  return {
    setTheme(dark) {
      const colors = dark
        ? { zenith: '#253b50', horizon: '#768b91', ground: '#35463e', hills: ['#4b6262', '#6c8084'], leaves: '#435a48', trunk: '#635d50' }
        : { zenith: '#9cbfcf', horizon: '#e4e8db', ground: '#a5b393', hills: ['#879e92', '#aabbb1'], leaves: '#718c66', trunk: '#8b8069' };
      const ctx = skyCanvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, colors.zenith);
      gradient.addColorStop(0.65, colors.horizon);
      gradient.addColorStop(1, colors.horizon);
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 4, 256);
      sky.needsUpdate = true;
      scene.fog = new THREE.Fog(colors.horizon, 600, 1900);
      ground.material.color.set(colors.ground);
      mountains.forEach((hill, i) => hill.material.color.set(colors.hills[i]));
      leaves.material.color.set(colors.leaves);
      trunks.material.color.set(colors.trunk);
    },
    dispose() { sky.dispose(); },
  };
}

export function createSandtable(root, task, { label, vendorOf, cover, header, initial = [] }) {
  document.body.classList.add('is-viewer');
  setPageTitle(['三维沙盘', { text: task.title, original: true }]);
  root.innerHTML = `<main class="sandtable">
    ${header}
    <div class="sandbody">
      <aside class="sand-library" id="sand-library" aria-label="模型选择">
        <div class="sand-library-head"><span class="kicker">COLLECTION / 模型作品</span><h2>选择你的建筑群</h2><p>只摆放你选中的作品，自由组合、近看细节。</p></div>
        <label class="sand-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="搜索模型或作品" aria-label="搜索模型或作品"></label>
        <div class="sand-filters"><select aria-label="筛选模型厂商"><option value="">全部厂商</option>${[...new Set(task.results.map(vendorOf))].sort().map((v) => `<option>${escape(v)}</option>`).join('')}</select><button data-action="clear">清空已选</button></div>
        <div class="sand-catalog">${task.results.map((r) => `<article class="sand-item" data-id="${r.id}">
          <label class="sand-pick"><img data-media-src="${escape(cover(r))}" alt="" loading="lazy"><span data-i18n-ignore><b>${escape(label(r))}</b><small>${escape(r.title)}</small></span><input type="checkbox" value="${r.id}" aria-label="加入沙盘：${escape(label(r))}"></label>
          <div class="sand-item-detail" hidden><span class="sand-status" role="status"></span><button data-focus="${r.id}" hidden>聚焦 ↗</button><button data-retry="${r.id}" hidden>重试</button></div>
        </article>`).join('')}<p class="sand-no-results" hidden>没有匹配的作品，试试其他关键词。</p></div>
        <p class="sand-library-note">布局对照 · 统一光照与尺度<br>已简化天空、特效与动画；完整效果请切换「原作展厅」。</p>
      </aside>
      <section class="sand-stage" aria-label="三维建筑沙盘">
        <div class="sand-heading"><span class="kicker">THE ARCHITECTURE ATLAS</span><h1>方寸之间，<br>万千气象。</h1></div>
        <div class="sand-canvas"></div><div class="sand-labels"></div>
        <div class="sand-empty"><span class="sand-empty-mark" aria-hidden="true">＋</span><h2>从一座建筑群开始</h2><p>选择模型，把它的作品放上沙盘。<br>再添一座，在同一个视角里看见差异。</p><button class="btn primary" data-action="choose">选择第一件作品 ↗</button></div>
        <div class="sand-error" role="alert" hidden></div>
        <div class="sand-focus" hidden><span class="kicker">正在近看</span><strong data-i18n-ignore></strong><a class="btn sm" data-original>进入原作 ↗</a></div>
        <div class="sand-toolbar" role="group" aria-label="沙盘视角">
          <button data-action="overview" title="总览（Home）">⌂ <span>总览</span></button><i></i>
          <button data-action="perspective" aria-pressed="true">斜视</button><button data-action="top" aria-pressed="false">俯视</button><i></i>
          <button data-action="in" aria-label="放大">＋</button><button data-action="out" aria-label="缩小">−</button>
        </div>
        <div class="sand-bottom"><span>拖动旋转 · 右键平移 · 滚轮缩放<span class="sand-touch-hint"> / 双指缩放与平移</span></span><span>双击展台聚焦</span></div>
      </section>
    </div>
  </main>`;

  const el = $('.sandtable', root), stage = $('.sand-stage', el), host = $('.sand-canvas', el);
  const entries = new Map(), abort = new AbortController();
  const signal = abort.signal;
  let destroyed = false, loading = null, tween = null, focused = null, topView = false, frameId = 0;
  let interacting = false, quality = 1, lastFrame = 0, slowFrames = 0, measuredFrames = 0;
  function requestRender() {
    if (!destroyed && !frameId) frameId = requestAnimationFrame(render);
  }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }); }
  catch { $('.sand-error', el).hidden = false; $('.sand-error', el).textContent = '无法启动三维沙盘，请启用浏览器硬件加速后重试。'; return { destroy() { document.body.classList.remove('is-viewer'); } }; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.localClippingEnabled = true;
  host.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '拖动旋转，右键平移，滚轮缩放；也可使用下方视角按钮');
  renderer.domElement.tabIndex = 0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 3000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.14;
  controls.minDistance = 8; controls.maxDistance = 1300;
  controls.maxPolarAngle = Math.PI * 0.485;
  controls.screenSpacePanning = false;
  controls.addEventListener('start', () => { tween = null; interacting = true; lastFrame = slowFrames = measuredFrames = 0; });
  controls.addEventListener('end', () => { interacting = false; });
  controls.addEventListener('change', requestRender);
  const landscape = createLandscape(scene);
  const table = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), new THREE.MeshStandardMaterial({ color: '#eeeadd', roughness: 0.9 }));
  table.position.y = -1.4; table.scale.set(235, 1, 165); scene.add(table);
  // Fixed shared light, with no shadow pass, sky shader or time animation.
  scene.add(new THREE.HemisphereLight('#f1f5ff', '#97938b', 2.4));
  const sun = new THREE.DirectionalLight('#fff2dd', 2.6);
  sun.position.set(-160, 250, 120); scene.add(sun);
  const fill = new THREE.DirectionalLight('#e2ecff', 0.8);
  fill.position.set(100, 80, -150); scene.add(fill);
  function syncSceneTheme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    landscape.setTheme(dark);
    table.material.color.set(dark ? '#555e57' : '#dedccf');
    requestRender();
  }
  const themeObserver = new MutationObserver(syncSceneTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  syncSceneTheme();
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();

  function travel(target, distance) {
    const offset = topView ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(0.65, focused ? 0.82 : 0.5, 1.12).normalize();
    tween = { start: performance.now(), from: camera.position.clone(), targetFrom: controls.target.clone(), to: target.clone().addScaledVector(offset, distance), target };
    if (reducedMotion()) { camera.position.copy(tween.to); controls.target.copy(target); tween = null; }
    requestRender();
  }
  function overview() {
    focused = null; $('.sand-focus', el).hidden = true;
    const box = new THREE.Box3();
    for (const entry of entries.values()) box.expandByPoint(entry.position);
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
    const width = size.x + 135, depth = size.z + 145;
    travel(center, Math.max(width / camera.aspect, depth) * 1.75);
  }
  function focus(id) {
    const entry = entries.get(id);
    if (!entry?.group) return;
    focused = id;
    const target = entry.position.clone(); target.y = Math.min(entry.height * 0.3, 25);
    travel(target, Math.max(125, 135 / camera.aspect, entry.height * 2));
    const card = $('.sand-focus', el); card.hidden = false;
    $('strong', card).textContent = label(entry.result);
    $('[data-original]', card).href = `#/${task.id}/${id}`;
  }
  function layout() {
    const count = entries.size, cols = Math.ceil(Math.sqrt(count || 1));
    const rows = Math.ceil(count / cols);
    [...entries.values()].forEach((entry, index) => {
      entry.position.set((index % cols - (cols - 1) / 2) * 112, 0, (Math.floor(index / cols) - (rows - 1) / 2) * 120);
      entry.platform.position.copy(entry.position);
      entry.planes[0].constant = 44 - entry.position.x;
      entry.planes[1].constant = 44 + entry.position.x;
      entry.planes[2].constant = 44 - entry.position.z;
      entry.planes[3].constant = 44 + entry.position.z;
    });
    table.scale.set(Math.max(235, cols * 112 + 22), 1, Math.max(165, rows * 120 + 20));
    requestRender();
    $('[data-count]', el).textContent = count;
    const ids = [...entries.keys()];
    history.replaceState(history.state, '', `#/${task.id}/sandtable${ids.length ? `/${ids.join(',')}` : ''}`);
    $('[data-switch-mode]', el).href = `#/${task.id}/exhibition${ids.length ? `/${ids.join(',')}` : ''}`;
    $('.display-modes [aria-current="page"]', el).href = location.hash;
    $('.sand-empty', el).hidden = count > 0;
    $('.sand-heading', el).classList.toggle('compact', count > 0);
    overview();
  }
  function setStatus(entry, text, state) {
    entry.state = state;
    const row = $(`[data-id="${entry.result.id}"]`, el);
    $('.sand-status', row).textContent = text;
    $('[data-focus]', row).hidden = state !== 'ready';
    $('[data-retry]', row).hidden = state !== 'error';
    entry.tag.classList.toggle('is-loading', state === 'loading' || state === 'queued');
    entry.tag.replaceChildren();
    const name = document.createElement('span');
    name.dataset.i18nIgnore = '';
    name.textContent = label(entry.result);
    entry.tag.append(name, state === 'ready' ? ' ↗' : ' · ');
    if (state !== 'ready') {
      const status = document.createElement('span');
      status.textContent = text;
      entry.tag.append(status);
    }
  }
  function stopLoader() {
    if (!loading) return;
    clearTimeout(loading.timeout); loading.frame.remove(); loading = null;
  }
  function pump() {
    if (destroyed || loading) return;
    const entry = [...entries.values()].find((e) => e.state === 'queued');
    if (!entry) return;
    setStatus(entry, '载入建筑…', 'loading');
    const frame = document.createElement('iframe');
    frame.className = 'sand-loader'; frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
    frame.title = `正在载入 ${label(entry.result)}`;
    const src = new URL(entry.result.previewLoader, location.href); src.searchParams.set('sandtable', '1');
    frame.src = src.href;
    loading = { entry, frame, timeout: setTimeout(() => {
      setStatus(entry, '载入超时', 'error'); stopLoader(); pump();
    }, 60000) };
    el.append(frame);
  }
  window.addEventListener('message', async (event) => {
    if (!loading || event.origin !== location.origin || event.source !== loading.frame.contentWindow || event.data?.type !== 'gallery-scene-ready') return;
    const job = loading;
    if (job.importing) return;
    job.importing = true;
    try {
      const imported = await importArchitecture(job.frame.contentWindow.__galleryScenes, job.entry.result.id);
      if (destroyed || entries.get(job.entry.result.id) !== job.entry) { disposeObject(imported.group); return; }
      Object.assign(job.entry, imported);
      imported.group.traverse((mesh) => {
        if (!mesh.material) return;
        for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) material.clippingPlanes = job.entry.planes;
      });
      job.entry.platform.add(imported.group);
      requestRender();
      setStatus(job.entry, '已摆放', 'ready');
    } catch (error) {
      if (!destroyed && entries.get(job.entry.result.id) === job.entry) setStatus(job.entry, '载入失败', 'error');
      console.error('Sandtable import:', error);
    } finally { if (loading === job) { stopLoader(); pump(); } }
  }, { signal });
  function add(id) {
    if (entries.has(id)) return;
    const result = task.results.find((r) => r.id === id);
    if (!result) return;
    const platform = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(98, 2, 98), new THREE.MeshStandardMaterial({ color: '#cbc5b4', roughness: 0.85 }));
    base.position.y = 1; platform.add(base); scene.add(platform);
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(base.geometry), new THREE.LineBasicMaterial({ color: '#a9a28e', transparent: true, opacity: 0.55 }));
    rim.position.y = 1; platform.add(rim);
    const tag = document.createElement('button'); tag.className = 'sand-tag'; tag.dataset.focus = id;
    $('.sand-labels', el).append(tag);
    const planes = [new THREE.Vector3(1,0,0), new THREE.Vector3(-1,0,0), new THREE.Vector3(0,0,1), new THREE.Vector3(0,0,-1)].map((normal) => new THREE.Plane(normal, 44));
    const entry = { result, platform, base, tag, planes, position: new THREE.Vector3(), state: 'queued' };
    entries.set(id, entry);
    const row = $(`[data-id="${id}"]`, el); $('input', row).checked = true;
    row.classList.add('selected'); $('.sand-item-detail', row).hidden = false;
    setStatus(entry, '等待载入', 'queued'); layout(); pump();
  }
  function remove(id, refresh = true) {
    const entry = entries.get(id); if (!entry) return;
    if (loading?.entry === entry) stopLoader();
    scene.remove(entry.platform); disposeObject(entry.platform); entry.tag.remove(); entries.delete(id);
    const row = $(`[data-id="${id}"]`, el); $('input', row).checked = false; row.classList.remove('selected'); $('.sand-item-detail', row).hidden = true;
    if (refresh) { layout(); pump(); }
  }
  function filter() {
    const query = $('input[type="search"]', el).value.trim().toLocaleLowerCase();
    const vendor = $('select', el).value; let shown = 0;
    for (const r of task.results) {
      const visible = (!vendor || vendorOf(r) === vendor) && `${label(r)} ${r.title}`.toLocaleLowerCase().includes(query);
      $(`[data-id="${r.id}"]`, el).hidden = !visible; if (visible) shown++;
    }
    $('.sand-no-results', el).hidden = shown > 0;
  }
  function panel(open) {
    el.classList.toggle('library-closed', !open);
    $('[data-action="panel"]', el).setAttribute('aria-expanded', String(open));
  }
  el.addEventListener('input', (e) => { if (e.target.type === 'search') filter(); }, { signal });
  el.addEventListener('change', (e) => {
    if (e.target.matches('.sand-pick input')) e.target.checked ? add(e.target.value) : remove(e.target.value);
    if (e.target.matches('.sand-filters select')) filter();
  }, { signal });
  el.addEventListener('click', (e) => {
    const target = e.target.closest('button'); if (!target) return;
    if (target.dataset.focus) focus(target.dataset.focus);
    if (target.dataset.retry) { const entry = entries.get(target.dataset.retry); setStatus(entry, '等待载入', 'queued'); pump(); }
    switch (target.dataset.action) {
      case 'panel': panel(el.classList.contains('library-closed')); break;
      case 'choose': panel(true); $('input[type="search"]', el).focus(); break;
      case 'clear': for (const id of [...entries.keys()]) remove(id, false); layout(); break;
      case 'overview': overview(); break;
      case 'in': case 'out': {
        tween = null; const offset = camera.position.clone().sub(controls.target);
        const distance = THREE.MathUtils.clamp(offset.length() * (target.dataset.action === 'in' ? 0.75 : 1.33), controls.minDistance, controls.maxDistance);
        camera.position.copy(controls.target).add(offset.setLength(distance)); requestRender(); break;
      }
      case 'perspective': case 'top':
        topView = target.dataset.action === 'top';
        $('[data-action="top"]', el).setAttribute('aria-pressed', String(topView));
        $('[data-action="perspective"]', el).setAttribute('aria-pressed', String(!topView));
        if (focused) focus(focused); else overview(); break;
    }
  }, { signal });
  renderer.domElement.addEventListener('dblclick', (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([...entries.values()].map((e) => e.base), false);
    if (!hits.length) return;
    let object = hits[0].object; while (object.parent && object.parent !== scene) object = object.parent;
    const entry = [...entries.values()].find((e) => e.platform === object); if (entry) focus(entry.result.id);
  }, { signal });
  renderer.domElement.addEventListener('keydown', (e) => {
    if (e.key === 'Home') { e.preventDefault(); overview(); }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault(); tween = null;
      const delta = new THREE.Vector3(e.key === 'ArrowLeft' ? -8 : e.key === 'ArrowRight' ? 8 : 0, 0, e.key === 'ArrowUp' ? -8 : e.key === 'ArrowDown' ? 8 : 0);
      camera.position.add(delta); controls.target.add(delta); requestRender();
    }
  }, { signal });
  const resize = new ResizeObserver(() => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    quality = Math.min(1, Math.sqrt(1200000 / (width * height)));
    renderer.setPixelRatio(Math.min(devicePixelRatio, quality));
    renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); requestRender();
  });
  resize.observe(host);
  camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix();
  camera.position.set(170, 215, 290); overview();
  if (matchMedia('(max-width: 700px)').matches) panel(false);
  const projected = new THREE.Vector3();
  function render(now) {
    if (destroyed) return;
    frameId = 0;
    if (document.hidden) return;
    if (tween) {
      const progress = Math.min(1, (now - tween.start) / 650), eased = 1 - Math.pow(1 - progress, 3);
      camera.position.lerpVectors(tween.from, tween.to, eased);
      controls.target.lerpVectors(tween.targetFrom, tween.target, eased);
      if (progress === 1) tween = null;
    }
    // Lower the pixel workload only when sustained interaction misses frames.
    // Keep the chosen quality while idle, avoiding repeated buffer reallocations.
    if (interacting && lastFrame) {
      measuredFrames++;
      if (now - lastFrame > 25) slowFrames++;
      if (measuredFrames === 20) {
        if (slowFrames > 10 && quality > 0.55) {
          quality = Math.max(0.55, quality * 0.8);
          renderer.setPixelRatio(Math.min(devicePixelRatio, quality));
        }
        slowFrames = measuredFrames = 0;
      }
    }
    lastFrame = interacting ? now : 0;
    const moving = controls.update();
    const detailDistance = renderer.domElement.height * 0.5 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.25);
    for (const entry of entries.values()) for (const lod of entry.lods ?? []) lod.levels[1].distance = detailDistance;
    renderer.render(scene, camera);
    const width = host.clientWidth, height = host.clientHeight;
    for (const entry of entries.values()) {
      projected.copy(entry.position); projected.y += 3; projected.z += 54; projected.project(camera);
      const x = (projected.x + 1) * width / 2, y = (-projected.y + 1) * height / 2;
      entry.tag.hidden = projected.z > 1 || projected.z < -1 || x < 0 || x > width || y < 0 || y > height - 70;
      entry.tag.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      entry.tag.classList.toggle('focused', focused === entry.result.id);
    }
    if (tween || moving) requestRender();
  }
  document.addEventListener('visibilitychange', requestRender, { signal });
  requestRender();
  initial.forEach(add);
  return { destroy() {
    destroyed = true; abort.abort(); stopLoader(); cancelAnimationFrame(frameId); resize.disconnect(); controls.dispose();
    themeObserver.disconnect(); landscape.dispose(); disposeObject(scene); renderer.dispose(); renderer.forceContextLoss(); document.body.classList.remove('is-viewer');
  } };
}
