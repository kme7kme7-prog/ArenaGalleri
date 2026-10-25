import * as THREE from 'three';
import { cdnMediaUrl } from './media-cdn.js';

const arrayTypes = { Float32Array, Float64Array, Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array };

export async function readModel(url, signal) {
  const response = await fetch(cdnMediaUrl(url), { signal });
  if (!response.ok) throw new Error(`Model request failed: ${response.status}`);
  const buffer = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const headerSize = new DataView(buffer).getUint32(0, true);
  const data = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerSize)));
  const offset = data.version >= 2 ? Math.ceil((4 + headerSize) / 8) * 8 : 4 + headerSize;
  const array = (spec) => {
    const Type = arrayTypes[spec.type], start = offset + spec.offset;
    // Aligned baked buffers can be uploaded without copying their contents.
    return start % Type.BYTES_PER_ELEMENT === 0
      ? new Type(buffer, start, spec.length)
      : new Type(buffer.slice(start, start + spec.length * Type.BYTES_PER_ELEMENT));
  };
  const attribute = (spec) => {
    let values = array(spec);
    if (spec.quantized) {
      const expanded = new Float32Array(values.length), { min, span } = spec.quantized;
      for (let i = 0; i < values.length; i++) expanded[i] = min[i % 3] + values[i] / 65535 * span[i % 3];
      values = expanded;
    }
    return spec.instanced
      ? new THREE.InstancedBufferAttribute(values, spec.itemSize, spec.normalized, spec.meshPerAttribute)
      : new THREE.BufferAttribute(values, spec.itemSize, spec.normalized);
  };
  const geometries = data.geometries.map((spec) => {
    const geometry = new THREE.BufferGeometry();
    for (const [name, value] of Object.entries(spec.attributes)) geometry.setAttribute(name, attribute(value));
    if (spec.index) geometry.setIndex(attribute(spec.index));
    geometry.groups = spec.groups;
    if (spec.drawRange) geometry.setDrawRange(spec.drawRange[0], spec.drawRange[1] ?? Infinity);
    if (spec.sphere) geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(...spec.sphere.center), spec.sphere.radius);
    return geometry;
  });
  const objectLoader = new THREE.ObjectLoader();
  const images = await objectLoader.parseImagesAsync(data.images ?? []);
  const textures = objectLoader.parseTextures(data.textures ?? [], images);
  const loader = new THREE.MaterialLoader(); loader.setTextures(textures);
  const materials = data.materials.map((spec) => loader.parse(spec));
  const group = new THREE.Group();
  for (const spec of data.meshes) {
    const material = Array.isArray(spec.material) ? spec.material.map((id) => materials[id]) : materials[spec.material];
    const mesh = spec.count ? new THREE.InstancedMesh(geometries[spec.geometry], material, spec.count) : new THREE.Mesh(geometries[spec.geometry], material);
    if (spec.instances) mesh.instanceMatrix = new THREE.InstancedBufferAttribute(array(spec.instances), 16);
    if (spec.colors) mesh.instanceColor = new THREE.InstancedBufferAttribute(array(spec.colors), 3);
    mesh.matrix.fromArray(spec.matrix);
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.matrixAutoUpdate = false; mesh.renderOrder = spec.renderOrder ?? 0;
    group.add(mesh);
  }
  const bounds = new THREE.Box3(new THREE.Vector3(...data.bounds.min), new THREE.Vector3(...data.bounds.max));
  if (!data.normalized) {
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const scale = 88 / Math.max(size.x, size.z);
    group.scale.setScalar(scale);
    group.position.set(-center.x * scale, -bounds.min.y * scale + 2.1, -center.z * scale);
    group.updateMatrixWorld(true); bounds.applyMatrix4(group.matrixWorld);
  }
  return { group, previewBounds: bounds, clip: data.clip ?? false };
}

// Used by the local baker. Export only the same overview meshes shown in cards.
export async function packPreview(imported, architecture) {
  const { group, previewBounds } = imported;
  for (const lod of imported.lods ?? []) {
    lod.autoUpdate = false;
    lod.levels.forEach((level, index) => { level.object.visible = index === lod.levels.length - 1; });
  }
  group.updateMatrixWorld(true);
  const data = { version: 2, normalized: true, clip: architecture, bounds: { min: previewBounds.min.toArray(), max: previewBounds.max.toArray() }, geometries: [], materials: [], meshes: [] };
  const chunks = [], geometries = new Map(), materials = new Map(), meta = { textures: {}, images: {} };
  let bodySize = 0;
  const appendArray = (array) => {
    const offset = Math.ceil(bodySize / 8) * 8;
    chunks.push({ offset, array: new Uint8Array(array.buffer, array.byteOffset, array.byteLength) });
    bodySize = offset + array.byteLength;
    return { type: array.constructor.name, offset, length: array.length };
  };
  const appendAttribute = (attribute) => {
    let array = attribute.array;
    if (attribute.isInterleavedBufferAttribute) {
      array = new attribute.data.array.constructor(attribute.count * attribute.itemSize);
      for (let i = 0; i < attribute.count; i++) for (let c = 0; c < attribute.itemSize; c++) array[i * attribute.itemSize + c] = attribute.getComponent(i, c);
    }
    return { ...appendArray(array), itemSize: attribute.itemSize, normalized: attribute.normalized, instanced: !!attribute.isInstancedBufferAttribute, meshPerAttribute: attribute.meshPerAttribute };
  };
  const appendMaterial = (material) => {
    if (!materials.has(material.uuid)) {
      materials.set(material.uuid, data.materials.length); data.materials.push(material.toJSON(meta));
    }
    return materials.get(material.uuid);
  };
  group.traverseVisible((mesh) => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    if (!geometries.has(geometry.uuid)) {
      geometry.computeBoundingSphere();
      geometries.set(geometry.uuid, data.geometries.length);
      data.geometries.push({ attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([name, value]) => [name, appendAttribute(value)])), index: geometry.index ? appendAttribute(geometry.index) : null, groups: geometry.groups, drawRange: [geometry.drawRange.start, Number.isFinite(geometry.drawRange.count) ? geometry.drawRange.count : null], sphere: { center: geometry.boundingSphere.center.toArray(), radius: geometry.boundingSphere.radius } });
    }
    data.meshes.push({ geometry: geometries.get(geometry.uuid), material: Array.isArray(mesh.material) ? mesh.material.map(appendMaterial) : appendMaterial(mesh.material), matrix: mesh.matrixWorld.toArray(), renderOrder: mesh.renderOrder, count: mesh.isInstancedMesh ? mesh.count : 0, instances: mesh.isInstancedMesh ? appendArray(mesh.instanceMatrix.array.subarray(0, mesh.count * 16)) : null, colors: mesh.instanceColor ? appendArray(mesh.instanceColor.array.subarray(0, mesh.count * 3)) : null });
  });
  data.textures = Object.values(meta.textures); data.images = Object.values(meta.images);
  // Procedural originals may use dozens of large canvas textures. Keep the
  // same texture content at a resolution appropriate for a 400px-wide card.
  const resized = new Map();
  for (const image of data.images) {
    if (typeof image.url !== 'string' || !image.url.startsWith('data:image/')) continue;
    if (!resized.has(image.url)) {
      const bitmap = await createImageBitmap(await (await fetch(image.url)).blob());
      const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      resized.set(image.url, canvas.toDataURL('image/webp', 0.9));
    }
    image.url = resized.get(image.url);
  }
  data.textureSize = 256;
  const header = new TextEncoder().encode(JSON.stringify(data));
  const bodyOffset = Math.ceil((4 + header.length) / 8) * 8;
  const buffer = new Uint8Array(bodyOffset + bodySize);
  new DataView(buffer.buffer).setUint32(0, header.length, true); buffer.set(header, 4);
  for (const chunk of chunks) buffer.set(chunk.array, bodyOffset + chunk.offset);
  return new Response(new Blob([buffer]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
}
