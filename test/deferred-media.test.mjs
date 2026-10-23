import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeferredMedia } from '../site/deferred-media.js';

function fixture() {
  const original = Object.fromEntries(['IntersectionObserver', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'innerHeight', 'innerWidth'].map(key => [key, globalThis[key]]));
  let intersect, mutate, scheduled;
  const observed = new Set();
  globalThis.IntersectionObserver = class { constructor(callback) { intersect = callback; } observe(image) { observed.add(image); } unobserve(image) { observed.delete(image); } disconnect() { observed.clear(); } };
  globalThis.MutationObserver = class { constructor(callback) { mutate = callback; } observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = callback => { scheduled = callback; return 1; };
  globalThis.cancelAnimationFrame = () => { scheduled = null; };
  globalThis.innerHeight = 900; globalThis.innerWidth = 1440;
  const images = [];
  const doc = Object.assign(new EventTarget(), { hidden: false, documentElement: {}, querySelectorAll: () => images });
  const add = (src, { top = 0, left = 0, visible = true, card = null } = {}) => {
    let current;
    const image = { dataset: { mediaSrc: src }, isConnected: true, complete: false, starts: 0, visible, card,
      matches: () => true, querySelectorAll: () => [], closest() { return this.card; },
      hasAttribute: name => name === 'src' && current !== undefined,
      getClientRects() { return this.visible ? [{}] : []; },
      getBoundingClientRect: () => ({ top, left, bottom: top + 100, right: left + 100, width: 100, height: 100 }),
      removeAttribute() { current = undefined; }, get src() { return current; }, set src(value) { current = value; this.starts++; } };
    images.push(image); return image;
  };
  return { doc, add, nearby: image => intersect([{ target: image, isIntersecting: true }]),
    leave: image => intersect([{ target: image, isIntersecting: false }]),
    change: () => mutate([{ type: 'attributes' }]), flush: () => { const next = scheduled; scheduled = null; next?.(); },
    remove: image => { image.isConnected = false; images.splice(images.indexOf(image), 1); mutate([{ type: 'childList', removedNodes: [image], addedNodes: [] }]); },
    restore: () => Object.assign(globalThis, original) };
}

test('media waits for viewport intersection, panel visibility and a visible document; loaded images are retained', () => {
  const f = fixture(); let media;
  try {
    const first = f.add('first.webp'), far = f.add('far.webp', { top: 3000 }), panel = f.add('panel.webp', { visible: false });
    media = createDeferredMedia(f.doc);
    assert.equal(first.starts, 0, 'registering the catalog does not assign every image src');
    f.nearby(first); f.nearby(far); f.nearby(panel);
    assert.equal(first.starts, 1); assert.equal(far.starts, 0); assert.equal(panel.starts, 0);
    panel.visible = true; f.doc.hidden = true; f.change(); f.flush();
    assert.equal(panel.starts, 0, 'opening a hidden tab does not start requests in a background page');
    f.doc.hidden = false; f.doc.dispatchEvent(new Event('visibilitychange')); f.flush();
    assert.equal(panel.starts, 1);
    media.refresh(); f.nearby(first); f.nearby(panel);
    assert.equal(first.starts, 1); assert.equal(panel.starts, 1, 'returning never assigns the same loaded src again');
  } finally { media?.destroy(); f.restore(); }
});

test('hero warms only the current and next card, and horizontal offscreen pictures stay deferred', () => {
  const f = fixture(); let media;
  try {
    const attrs = new Set(), next = f.add('next.webp', { card: { hasAttribute: key => attrs.has(key) } });
    const outside = f.add('outside.webp', { left: 2000 });
    media = createDeferredMedia(f.doc); f.nearby(next); f.nearby(outside);
    assert.equal(next.starts, 0); assert.equal(outside.starts, 0);
    attrs.add('data-media-warm'); f.change(); f.flush();
    assert.equal(next.starts, 1); assert.equal(outside.starts, 0);
  } finally { media?.destroy(); f.restore(); }
});

test('removing a page cancels unfinished image sources and ignores late observer notifications', () => {
  const f = fixture(); let media;
  try {
    const image = f.add('old.webp'); media = createDeferredMedia(f.doc); f.nearby(image);
    f.remove(image); assert.equal(image.src, undefined);
    f.nearby(image); assert.equal(image.starts, 1);
    const later = f.add('later.webp'); media.refresh(); media.destroy(); f.nearby(later);
    assert.equal(later.starts, 0);
  } finally { media?.destroy(); f.restore(); }
});

test('portal preparation waits for an explicit viewport pass before reporting its visible images ready to decode', async () => {
  const f = fixture(); let media;
  try {
    const image = f.add('portal.webp'); media = createDeferredMedia(f.doc);
    let settled = false;
    const preparation = media.prepare().then(() => { settled = true; });
    await Promise.resolve(); assert.equal(settled, false); assert.equal(image.starts, 0);
    f.nearby(image); await preparation;
    assert.equal(settled, true); assert.equal(image.starts, 1);
  } finally { media?.destroy(); f.restore(); }
});
