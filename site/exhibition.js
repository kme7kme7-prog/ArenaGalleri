import { aigcLabel } from './legal.js';
import { setPageTitle } from './i18n.js';

const $ = (selector, root) => root.querySelector(selector);
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const CARD_W = 720, CARD_H = 510, GAP = 42;
const PAGE_W = 1280, PAGE_H = 800;
const MAX_ZOOM = PAGE_W / CARD_W;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

// The host only moves page containers. Each result keeps its own rendering,
// frame loop, camera, effects, UI and dependencies, without injected code.
export function createExhibition(root, task, { label, vendorOf, cover, header, initial = [] }) {
  document.body.classList.add('is-viewer');
  setPageTitle(['原作展厅', { text: task.title, original: true }]);
  root.innerHTML = `<main class="sandtable exhibition">
    ${header}
    <div class="sandbody">
      <aside class="sand-library" id="exhibition-library" aria-label="模型选择">
        <div class="sand-library-head"><span class="kicker">COLLECTION / 模型作品</span><h2>把原作放在一起</h2><p>选择想看的模型，近看每一份完整的答案。</p></div>
        <label class="sand-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="搜索模型或作品" aria-label="搜索模型或作品"></label>
        <div class="sand-filters"><select aria-label="筛选模型厂商"><option value="">全部厂商</option>${[...new Set(task.results.map(vendorOf))].sort().map((v) => `<option>${escape(v)}</option>`).join('')}</select><button data-action="clear">清空已选</button></div>
        <div class="sand-catalog">${task.results.map((r) => `<article class="sand-item" data-id="${r.id}">
          <label class="sand-pick"><img src="${escape(cover(r))}" alt="" loading="lazy"><span data-i18n-ignore><b>${escape(label(r))}</b><small>${escape(r.title)}</small></span><input type="checkbox" value="${r.id}" aria-label="加入展厅：${escape(label(r))}"></label>
          <div class="sand-item-detail" hidden><span class="exhibition-status" role="status"></span><button data-focus="${r.id}">操作原作 ↗</button></div>
        </article>`).join('')}<p class="sand-no-results" hidden>没有匹配的作品，试试其他关键词。</p></div>
        <p class="sand-library-note">完整原作 · 独立实时运行<br>原有光影、动画、细节与交互全部保留。</p>
      </aside>
      <section class="exhibition-stage" aria-label="可缩放的原作画布" tabindex="0">
        <div class="exhibition-heading"><span class="kicker">THE ORIGINALS / LIVE GALLERY</span><span class="exhibition-mode">原作实时预览</span></div>
        <div class="exhibition-world"></div>
        <div class="exhibition-empty"><span class="kicker">YOUR OWN COLLECTION</span><div class="exhibition-empty-art" aria-hidden="true"><i></i><i></i><i></i></div><h1>让不同的答案，<br>在这里相遇。</h1><p>从一件作品开始，自由选择、放大、探索。<br>每个模型的光影与表达，都保持原样。</p><button class="btn primary" data-action="choose">选择第一件作品 ↗</button></div>
        <div class="exhibition-focusbar" hidden><button data-action="back">← 返回画布</button><span><b data-i18n-ignore></b><small>正在操作原作</small></span><a target="_blank" rel="noopener" data-original>独立打开 ↗</a></div>
        <div class="exhibition-toolbar" role="group" aria-label="画布操作">
          <button data-action="overview" title="总览（Home）">⌂ 总览</button><i></i>
          <button data-action="out" aria-label="缩小画布">−</button><output aria-label="画布缩放比例">100%</output><button data-action="in" aria-label="放大画布">＋</button><i></i>
          <button data-action="actual" title="原作页面像素与屏幕像素一比一">1:1</button>
        </div>
        <div class="exhibition-hint">拖动画布平移 · 滚轮 / 双指缩放 · 点击作品操作原作</div>
      </section>
    </div>
  </main>`;

  const el = $('.exhibition', root), stage = $('.exhibition-stage', el), world = $('.exhibition-world', el);
  const entries = new Map(), abort = new AbortController(), pointers = new Map();
  const signal = abort.signal;
  const view = { x: 0, y: 0, scale: 0.5, fitted: true };
  let activeId = null, bounds = { width: 0, height: 0 }, gesture = null, layoutCols = 1;
  const columns = () => stage.clientWidth < 600 ? 1 : Math.ceil(Math.sqrt(entries.size || 1));

  function paint() {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    stage.style.backgroundPosition = `${view.x}px ${view.y}px`;
    const grid = Math.max(18, 32 * view.scale);
    stage.style.backgroundSize = `${grid}px ${grid}px`;
    $('output', el).textContent = `${Math.round(view.scale / MAX_ZOOM * 100)}%`;
  }
  function overview() {
    leaveOriginal();
    view.fitted = true;
    const width = stage.clientWidth, height = stage.clientHeight;
    const padding = width < 600 ? 18 : 40;
    view.scale = Math.min(1, (width - padding * 2) / (bounds.width || CARD_W), (height - 150) / (bounds.height || CARD_H));
    view.x = (width - bounds.width * view.scale) / 2;
    view.y = 60 + (height - 150 - bounds.height * view.scale) / 2;
    paint();
  }
  function zoom(factor, x = stage.clientWidth / 2, y = stage.clientHeight / 2) {
    if (activeId) return;
    const next = clamp(view.scale * factor, 0.035, MAX_ZOOM), ratio = next / view.scale;
    view.x = x - (x - view.x) * ratio; view.y = y - (y - view.y) * ratio;
    view.scale = next; view.fitted = false; paint();
  }
  function syncSelection() {
    const ids = [...entries.keys()];
    history.replaceState(history.state, '', `#/${task.id}/exhibition${ids.length ? `/${ids.join(',')}` : ''}`);
    $('[data-switch-mode]', el).href = `#/${task.id}/sandtable${ids.length ? `/${ids.join(',')}` : ''}`;
    $('.display-modes [aria-current="page"]', el).href = location.hash;
    $('[data-count]', el).textContent = ids.length;
    $('.exhibition-empty', el).hidden = ids.length > 0;
    $('.exhibition-toolbar', el).hidden = !ids.length;
    $('.exhibition-hint', el).hidden = !ids.length;
  }
  function layout() {
    const cols = columns(), rows = Math.ceil(entries.size / cols);
    layoutCols = cols;
    [...entries.values()].forEach((entry, index) => {
      entry.card.style.left = `${index % cols * (CARD_W + GAP)}px`;
      entry.card.style.top = `${Math.floor(index / cols) * (CARD_H + GAP)}px`;
      $('.exhibition-number', entry.card).textContent = String(index + 1).padStart(2, '0');
    });
    bounds = { width: entries.size ? cols * (CARD_W + GAP) - GAP : 0, height: rows ? rows * (CARD_H + GAP) - GAP : 0 };
    syncSelection(); overview();
  }
  function setStatus(entry, status) {
    const row = $(`[data-id="${entry.result.id}"]`, el);
    $('.exhibition-status', row).textContent = status;
    $('.exhibition-page-state', entry.card).textContent = status;
  }
  function load(entry) {
    clearTimeout(entry.timer);
    entry.frame?.remove();
    const frame = document.createElement('iframe');
    frame.title = `${label(entry.result)} · ${entry.result.title} · 完整原作`;
    frame.setAttribute('allow', 'fullscreen; autoplay; clipboard-write');
    frame.allowFullscreen = true;
    frame.inert = activeId !== entry.result.id;
    frame.tabIndex = activeId === entry.result.id ? 0 : -1;
    frame.width = PAGE_W; frame.height = PAGE_H;
    entry.frame = frame;
    setStatus(entry, '正在打开…');
    entry.timer = setTimeout(() => setStatus(entry, '仍在载入，可重新打开'), 45000);
    frame.addEventListener('load', () => {
      clearTimeout(entry.timer);
      setStatus(entry, '页面已打开');
      // Only a gallery navigation shortcut; the original's rendering is untouched.
      try {
        frame.contentDocument.addEventListener('keydown', (event) => {
          if (event.key === 'Escape' && !frame.contentDocument.fullscreenElement && activeId === entry.result.id) {
            event.preventDefault(); leaveOriginal(); stage.focus({ preventScroll: true });
          }
        });
      } catch { /* A cross-origin result still has the visible return button. */ }
    }, { signal });
    frame.src = entry.result.scene;
    $('.exhibition-viewport', entry.card).prepend(frame);
  }
  function add(id, refresh = true) {
    if (entries.has(id)) return;
    const result = task.results.find((r) => r.id === id); if (!result) return;
    const card = document.createElement('article'); card.className = 'exhibition-card'; card.dataset.card = id;
    card.setAttribute('aria-label', `${label(result)} 的完整原作`);
    card.innerHTML = `<header class="exhibition-card-head"><span class="exhibition-number"></span><div data-i18n-ignore><strong>${escape(label(result))}</strong><span>${escape(result.title)}</span></div>${aigcLabel()}<span class="exhibition-live"><i></i> LIVE</span><button data-remove="${id}" aria-label="移出展厅：${escape(label(result))}">×</button></header>
      <div class="exhibition-viewport"><button class="exhibition-glass" data-focus="${id}" aria-label="操作原作：${escape(label(result))}"><span>操作原作 ↗</span></button></div>
      <footer class="exhibition-card-foot"><span class="exhibition-page-state" role="status"></span><span><button data-reload="${id}">重新打开</button><button data-focus="${id}">操作原作 ↗</button></span></footer>`;
    world.append(card);
    const entry = { result, card, frame: null, timer: null }; entries.set(id, entry);
    const row = $(`[data-id="${id}"]`, el); $('input', row).checked = true; row.classList.add('selected'); $('.sand-item-detail', row).hidden = false;
    load(entry); if (refresh) layout();
  }
  function remove(id, refresh = true) {
    const entry = entries.get(id); if (!entry) return;
    if (activeId === id) leaveOriginal();
    clearTimeout(entry.timer); entry.card.remove(); entries.delete(id);
    const row = $(`[data-id="${id}"]`, el); $('input', row).checked = false; row.classList.remove('selected'); $('.sand-item-detail', row).hidden = true;
    if (refresh) layout();
  }
  function focus(id) {
    const entry = entries.get(id); if (!entry || id === activeId) return;
    leaveOriginal(); activeId = id;
    el.classList.add('is-operating'); entry.card.classList.add('is-active');
    entry.frame.inert = false; entry.frame.tabIndex = 0;
    const bar = $('.exhibition-focusbar', el); bar.hidden = false;
    $('b', bar).textContent = label(entry.result); $('[data-original]', bar).href = entry.result.scene;
    $('.exhibition-toolbar', el).hidden = true; $('.exhibition-hint', el).hidden = true;
    if (matchMedia('(max-width: 700px)').matches) panel(false);
  }
  function leaveOriginal() {
    if (!activeId) return;
    const entry = entries.get(activeId);
    if (entry) { entry.card.classList.remove('is-active'); entry.frame.inert = true; entry.frame.tabIndex = -1; }
    activeId = null; el.classList.remove('is-operating');
    $('.exhibition-focusbar', el).hidden = true;
    $('.exhibition-toolbar', el).hidden = !entries.size; $('.exhibition-hint', el).hidden = !entries.size;
  }
  function panel(open) {
    el.classList.toggle('library-closed', !open);
    $('[data-action="panel"]', el).setAttribute('aria-expanded', String(open));
  }
  function filter() {
    const query = $('input[type="search"]', el).value.trim().toLocaleLowerCase(), vendor = $('select', el).value;
    let count = 0;
    for (const r of task.results) {
      const show = (!vendor || vendorOf(r) === vendor) && `${label(r)} ${r.title}`.toLocaleLowerCase().includes(query);
      $(`[data-id="${r.id}"]`, el).hidden = !show; if (show) count++;
    }
    $('.sand-no-results', el).hidden = count > 0;
  }
  el.addEventListener('input', (e) => { if (e.target.type === 'search') filter(); }, { signal });
  el.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') e.target.checked ? add(e.target.value) : remove(e.target.value);
    if (e.target.tagName === 'SELECT') filter();
  }, { signal });
  el.addEventListener('click', (e) => {
    const target = e.target.closest('button'); if (!target) return;
    if (target.dataset.focus && !target.classList.contains('exhibition-glass')) focus(target.dataset.focus);
    // Keyboard activation does not generate pointer events.
    if (target.classList.contains('exhibition-glass') && e.detail === 0) focus(target.dataset.focus);
    if (target.dataset.remove) remove(target.dataset.remove);
    if (target.dataset.reload) load(entries.get(target.dataset.reload));
    switch (target.dataset.action) {
      case 'panel': panel(el.classList.contains('library-closed')); break;
      case 'choose': panel(true); $('input[type="search"]', el).focus(); break;
      case 'clear': [...entries.keys()].forEach((id) => remove(id, false)); layout(); break;
      case 'overview': overview(); break;
      case 'back': leaveOriginal(); stage.focus({ preventScroll: true }); break;
      case 'in': zoom(1.25); break;
      case 'out': zoom(0.8); break;
      case 'actual': zoom(MAX_ZOOM / view.scale); break;
    }
  }, { signal });
  stage.addEventListener('wheel', (e) => {
    if (activeId || e.target.closest('button:not(.exhibition-glass), a')) return;
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stage.clientHeight : 1);
    zoom(Math.exp(-clamp(delta, -120, 120) * 0.0025), e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false, signal });
  stage.addEventListener('pointerdown', (e) => {
    if (activeId || !entries.size || e.button > 0 || e.target.closest('button:not(.exhibition-glass), a')) return;
    e.preventDefault(); stage.focus({ preventScroll: true });
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.setPointerCapture(e.pointerId);
    if (pointers.size === 1) gesture = { x: e.clientX, y: e.clientY, moved: false, card: e.target.closest('.exhibition-glass')?.dataset.focus };
    else gesture.moved = true;
    stage.classList.add('is-dragging');
  }, { signal });
  stage.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const before = [...pointers.values()];
    const old = pointers.get(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 5) gesture.moved = true;
    if (pointers.size === 2) {
      const after = [...pointers.values()], rect = stage.getBoundingClientRect();
      const midpoint = (points) => ({ x: (points[0].x + points[1].x) / 2 - rect.left, y: (points[0].y + points[1].y) / 2 - rect.top });
      const a = midpoint(before), b = midpoint(after);
      const distance = (points) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      zoom(distance(after) / Math.max(1, distance(before)), a.x, a.y);
      view.x += b.x - a.x; view.y += b.y - a.y;
    } else { view.x += e.clientX - old.x; view.y += e.clientY - old.y; }
    view.fitted = false; paint();
  }, { signal });
  function pointerEnd(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (!pointers.size) {
      stage.classList.remove('is-dragging');
      if (e.type === 'pointerup' && gesture && !gesture.moved && gesture.card) focus(gesture.card);
      gesture = null;
    }
  }
  stage.addEventListener('pointerup', pointerEnd, { signal });
  stage.addEventListener('pointercancel', pointerEnd, { signal });
  stage.addEventListener('keydown', (e) => {
    if (e.target !== stage || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') leaveOriginal();
    else if (e.key === 'Home') overview();
    else if (!activeId && ['+', '=', '-'].includes(e.key)) zoom(e.key === '-' ? 0.8 : 1.25);
    else if (!activeId && e.key.startsWith('Arrow')) {
      view.x += e.key === 'ArrowLeft' ? 50 : e.key === 'ArrowRight' ? -50 : 0;
      view.y += e.key === 'ArrowUp' ? 50 : e.key === 'ArrowDown' ? -50 : 0;
      view.fitted = false; paint();
    } else return;
    e.preventDefault();
  }, { signal });
  const resize = new ResizeObserver(() => {
    if (activeId) return;
    if (columns() !== layoutCols) layout();
    else if (view.fitted) overview();
  });
  resize.observe(stage);
  if (matchMedia('(max-width: 700px)').matches) panel(false);
  initial.forEach((id) => add(id, false)); layout();
  return { destroy() {
    abort.abort(); resize.disconnect();
    for (const entry of entries.values()) { clearTimeout(entry.timer); entry.card.remove(); }
    entries.clear(); document.body.classList.remove('is-viewer');
  } };
}
