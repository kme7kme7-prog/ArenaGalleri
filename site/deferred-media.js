// Images outside the current view have no src yet. Native loading=lazy alone can fetch several
// screens ahead, including artwork behind other tabs. Keep a small margin for smooth scrolling.
export function createDeferredMedia(doc = document, { margin = 240 } = {}) {
  const pending = new Set(), nearby = new Set(), preparations = new Map();
  let scheduled = 0, stopped = false;
  const candidates = node => [
    ...(node.matches?.('img[data-media-src]') ? [node] : []),
    ...(node.querySelectorAll?.('img[data-media-src]') ?? []),
  ];
  function load(image) {
    if (stopped || !pending.has(image) || doc.hidden || !image.isConnected || !image.getClientRects().length) return;
    const card = image.closest('.home-deck .home-window');
    if (card && !card.hasAttribute('data-front') && !card.hasAttribute('data-media-warm')) return;
    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom < -margin || rect.top > innerHeight + margin || rect.right < -margin || rect.left > innerWidth + margin) return;
    image.loading = 'eager';
    image.src = image.dataset.mediaSrc;
    pending.delete(image); nearby.delete(image);
    observer.unobserve(image);
  }
  const observer = new IntersectionObserver(changes => {
    for (const change of changes) {
      if (change.isIntersecting) { nearby.add(change.target); load(change.target); }
      else nearby.delete(change.target);
    }
  }, { rootMargin: `${margin}px` });
  function enroll(node) {
    for (const image of candidates(node)) {
      if (image.hasAttribute('src') || pending.has(image)) continue;
      pending.add(image); observer.observe(image);
    }
  }
  function release(node) {
    for (const image of candidates(node)) {
      if (image.isConnected) continue;
      pending.delete(image); nearby.delete(image); observer.unobserve(image);
      // Stop an unfinished request when its page is torn down; completed images retain the
      // browser cache, and merely hiding a panel never clears an image or reloads it on return.
      if (!image.complete) image.removeAttribute('src');
    }
  }
  function refresh(node = doc) {
    if (stopped) return;
    enroll(node);
    for (const image of pending) {
      if (!image.isConnected) { pending.delete(image); nearby.delete(image); observer.unobserve(image); }
      else if (nearby.has(image)) load(image);
    }
  }
  // The portal cover must wait for the first visible images even when its first animation frame
  // runs before the normal observer callback. A zero-margin pass excludes offscreen/hidden media.
  function prepare(node = doc) {
    refresh(node);
    const images = candidates(node).filter(image => pending.has(image));
    if (!images.length || stopped || doc.hidden) return Promise.resolve();
    return new Promise(resolve => {
      const first = new IntersectionObserver(changes => {
        for (const change of changes) if (change.isIntersecting) load(change.target);
        first.disconnect(); preparations.delete(first); resolve();
      });
      preparations.set(first, resolve);
      for (const image of images) first.observe(image);
    });
  }
  function queue() {
    if (!scheduled && !stopped) scheduled = requestAnimationFrame(() => { scheduled = 0; refresh(); });
  }
  const mutations = new MutationObserver(records => {
    for (const record of records) if (record.type === 'childList') {
      for (const node of record.removedNodes) release(node);
      for (const node of record.addedNodes) enroll(node);
    }
    queue();
  });
  mutations.observe(doc.documentElement, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['hidden', 'open', 'data-preview-mode', 'data-front', 'data-media-warm'] });
  doc.addEventListener('visibilitychange', queue);
  refresh();
  return { refresh, prepare, destroy() {
    stopped = true; cancelAnimationFrame(scheduled); observer.disconnect(); mutations.disconnect();
    doc.removeEventListener('visibilitychange', queue); pending.clear(); nearby.clear();
    for (const [observer, resolve] of preparations) { observer.disconnect(); resolve(); }
    preparations.clear();
  } };
}
