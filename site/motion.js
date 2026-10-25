import { reducedMotion } from './ui.js';
import { setLocaleTransition } from './i18n.js';
import { routeParts } from './route-path.js';

// The motion layer: a hairline for slow navigations, entrance cascades, the opening card giving way
// to the first page, the work frame a card hands to the viewer, list reflows, a gliding highlight
// in segmented controls, the language switch and a pointer light on question cards. It is decoration only: without it, or with reduced motion, everything is simply
// where it belongs. Styles live in motion.css.
const EASE = 'cubic-bezier(.16, 1, .3, 1)';
const still = () => reducedMotion() || !Element.prototype.animate;

// ---- route hairline ---------------------------------------------------------------------
// Shown only when a navigation is still busy after a moment; it creeps toward the end, then
// completes and fades. A newer navigation takes the bar over, so a stale one cannot finish it.
let bar = null, barRun = 0, barTimer = 0, barCreep = null;
export function progressStart() {
  const run = ++barRun;
  clearTimeout(barTimer);
  if (still()) return run;
  barTimer = setTimeout(() => {
    bar ??= document.body.appendChild(Object.assign(document.createElement('div'), { className: 'route-progress' }));
    bar.getAnimations().forEach((animation) => animation.cancel());
    bar.classList.add('is-on');
    barCreep = bar.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(.38)', offset: 0.12 }, { transform: 'scaleX(.92)' }],
      { duration: 12000, easing: 'cubic-bezier(.1, .6, .2, 1)', fill: 'forwards' });
  }, 160);
  return run;
}
export function progressDone(run) {
  if (run !== barRun) return;
  clearTimeout(barTimer);
  if (!bar?.classList.contains('is-on')) return;
  const from = getComputedStyle(bar).transform;
  barCreep?.cancel();
  bar.animate([{ transform: from }, { transform: 'scaleX(1)' }], { duration: 260, easing: EASE, fill: 'forwards' })
    .finished.then(() => { if (run === barRun) bar.classList.remove('is-on'); }, () => {});
}

// ---- entrances --------------------------------------------------------------------------
// The items a page is made of rise in on arrival, a few at a time; those below the fold wait
// until they scroll into view. Redraws in place (filters, sign-in) never replay this.
const ENTER = [
  '.task-card', '.result', '.shot', '.family-head', '.collection-heading', '.collection-toolbar', '.question-recommendation', '.block-head',
  '.home-lede', '.home-actions', '.home-proof', '.home-foot', '.home-recent', '.home-blind',
  'table.board tbody tr', '.board-notes', '.arena-task', '.changelog-month-head', '.changelog-entry', '.dir-row', '.work-row', '.submission-question',
  '.profile-settings', '.profile-activity', '.profile-bindings', '.profile-reactions', '.board-empty', '.account-empty', '.submission-empty',
  '.terms section', '.step', '.publish-layout > *', '.empty-page > *',
].join(', ');
// A screen that only holds the place of a page; replacing it is that page's real arrival. The
// static intro is the opening card shown while the app loads (index.html, motion.css).
const PLACEHOLDER = '.static-intro, .catalog-status, .home-pending, .empty-page > .muted:only-child';
const seen = new WeakSet();
let sidebarTitle = null;
const inView = (el) => {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
};
// Where an item sits: a loading screen's item drawn again in the same place is the same item.
const spot = (el) => {
  const r = el.getBoundingClientRect();
  return `${el.className}|${Math.round(r.left)}|${Math.round(r.top)}|${Math.round(r.width)}`;
};
const reveal = (el, i) => {
  el.style.setProperty('--reveal-i', String(i));
  el.dataset.reveal = 'in';
};
const later = new IntersectionObserver((entries) => {
  let i = 0;
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    later.unobserve(entry.target);
    reveal(entry.target, Math.min(i++, 6));
  }
}, { rootMargin: '0px 0px -4% 0px' });
document.addEventListener('animationend', (event) => {
  const el = event.target;
  if (el.dataset?.reveal !== 'in' || !event.animationName.startsWith('motion-rise')) return;
  delete el.dataset.reveal;
  el.style.removeProperty('--reveal-i');
});

// What was just clicked: the card a navigation or a lightbox grows out of.
let press = null;
document.addEventListener('click', (event) => {
  const link = event.target.closest?.('a[href^="#"]');
  press = { target: event.target, link, href: link?.getAttribute('href'), at: performance.now() };
}, true);
const recent = () => (press && performance.now() - press.at < 1200 ? press : null);

// One change of screen. `transition` says whether it is a view transition (app.js): a link followed,
// the opening card giving way to the first page, or a loading screen to its page. leave() runs while
// the old screen is still up, arrive() whenever new content has been drawn (it may run again when
// late data lands) and play() once the screen may move.
export function scene(root, { navigation = false, from = '' } = {}) {
  const moving = !still();
  const placeholder = root.querySelector(PLACEHOLDER);
  const fresh = moving && (navigation || Boolean(placeholder));
  const kind = from ? 'navigate' : !moving || !placeholder ? null
    : from === '' ? placeholder.matches('.static-intro') && !document.documentElement.dataset.entry ? 'open' : null
      : from === null ? 'swap' : null;
  // What a loading screen and its page both show stays still; only what is new rises in.
  const kept = new Set(kind === 'swap' ? [...root.querySelectorAll(ENTER)].map(spot) : []);
  const run = navigation && from ? progressStart() : 0;
  const named = new Set();
  let live = false, pending = [], heroOut = false, heroBack = null, first = true;
  const name = (el) => { el.style.viewTransitionName = 'work-hero'; named.add(el); };
  const start = () => {
    const batch = pending;
    pending = [];
    let i = 0;
    for (const el of batch) {
      if (!el.isConnected) continue;
      if (inView(el)) reveal(el, Math.min(i++, 9));
      else later.observe(el);
    }
  };
  if (fresh && navigation) later.disconnect();
  return {
    transition: kind,
    leave() {
      if (kind === 'open' || kind === 'swap') document.documentElement.dataset.scene = kind;
      if (!moving) return;
      const stage = root.querySelector('.viewer:not(.split) .stage');
      if (stage) {
        const [, id, vs] = routeParts(new URL(from, location.href).hash) ?? [];
        if (id && !vs) { heroBack = id; name(stage); document.documentElement.dataset.workHero = 'close'; }
        return;
      }
      // The work frame: a card's picture grows into the viewer's stage, and shrinks back on return.
      const source = recent()?.link && press.href === location.hash ? press.link.closest('.result-media, .home-window') : null;
      if (source?.isConnected && inView(source)) { heroOut = true; name(source); document.documentElement.dataset.workHero = 'open'; }
    },
    arrive() {
      if (heroOut) {
        const stage = root.querySelector('.viewer .stage');
        if (stage) name(stage);
      } else if (heroBack) {
        const media = root.querySelector(`.result[data-id="${CSS.escape(heroBack)}"] .result-media`);
        if (media && inView(media)) name(media);
      }
      heroOut = false; heroBack = null;
      const side = root.querySelector('.app-sidebar');
      const title = side?.querySelector('h1')?.textContent ?? null;
      const sideMoved = first && side && title !== sidebarTitle;
      if (first) sidebarTitle = title;
      first = false;
      if (!fresh) return;
      const found = [...root.querySelectorAll(ENTER)];
      // The sidebar cascades only when it changed; within a section it stays put.
      if (sideMoved) found.unshift(...side.children);
      for (const el of found) {
        if (seen.has(el) || !el.getClientRects().length) continue;
        seen.add(el);
        if (kept.size && kept.has(spot(el))) continue;
        el.dataset.reveal = 'wait';
        pending.push(el);
      }
      if (live) start();
    },
    play() { live = true; start(); },
    settle() {
      for (const el of named) el.style.viewTransitionName = '';
      if (named.size) delete document.documentElement.dataset.workHero;
      named.clear();
      delete document.documentElement.dataset.scene;
    },
    done() { progressDone(run); },
  };
}

// A part of the page swapped in place (a panel, a regrouped list) eases in on its own.
export function settleIn(el, { rise = 10 } = {}) {
  if (!el || still()) return;
  el.animate([{ opacity: 0, transform: `translateY(${rise}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE });
}
export function cascade(scope, selector = '.result, .family-head') {
  if (!scope || still()) return;
  let i = 0;
  for (const el of scope.querySelectorAll(selector)) {
    if (!el.getClientRects().length || !inView(el)) continue;
    el.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
      { duration: 520, delay: Math.min(i++, 10) * 28, easing: EASE, fill: 'backwards' });
  }
}

// ---- list reflow ------------------------------------------------------------------------
// Filtering, sorting and searching move the cards that stay to their new places and fade in the
// ones that appear. Only cards on screen move; the others just take their place.
export function flip(scope, change, selector = '.task-card, .result') {
  if (!scope || still()) return change();
  const before = new Map();
  for (const el of scope.querySelectorAll(selector)) {
    if (el.getClientRects().length) before.set(el, el.getBoundingClientRect());
  }
  for (const el of before.keys()) for (const animation of el.getAnimations()) if (animation.id === 'flip') animation.cancel();
  const result = change();
  let entering = 0;
  for (const el of scope.querySelectorAll(selector)) {
    if (!el.getClientRects().length) continue;
    const now = el.getBoundingClientRect();
    if (now.bottom < 0 || now.top > innerHeight) continue;
    const was = before.get(el);
    const dx = was ? was.left - now.left : 0, dy = was ? was.top - now.top : 0;
    let animation = null;
    if (was && Math.hypot(dx, dy) < innerHeight) {
      if (Math.abs(dx) + Math.abs(dy) > 1) animation = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 480, easing: EASE });
    } else {
      animation = el.animate([{ opacity: 0, transform: 'translateY(10px) scale(.98)' }, { opacity: 1, transform: 'none' }],
        { duration: 440, delay: Math.min(entering++, 8) * 30, easing: EASE, fill: 'backwards' });
    }
    if (animation) animation.id = 'flip';
  }
  return result;
}

// ---- lightbox ---------------------------------------------------------------------------
// The opened picture grows out of the thumbnail it came from; stepping slides the next one in.
export function zoomFrom(image, fallback) {
  const source = recent()?.target.closest?.('button, a') ?? fallback;
  const thumb = source?.matches?.('img') ? source : source?.querySelector?.('img');
  if (still() || !thumb?.isConnected) return;
  const from = thumb.getBoundingClientRect();
  if (!from.width || !inView(thumb)) return;
  const src = image.src;
  const grow = () => {
    const to = image.getBoundingClientRect();
    if (image.src !== src || !to.width) return;
    const x = from.left + from.width / 2 - (to.left + to.width / 2), y = from.top + from.height / 2 - (to.top + to.height / 2);
    image.animate([{ transform: `translate(${x}px, ${y}px) scale(${from.width / to.width})`, opacity: 0.35 }, { transform: 'none', opacity: 1 }], { duration: 560, easing: EASE });
  };
  if (image.complete && image.naturalWidth) grow();
  else image.addEventListener('load', grow, { once: true });
}
export function slideIn(image, direction) {
  if (still()) return;
  const src = image.src;
  const slide = () => {
    if (image.src !== src) return;
    image.animate([{ transform: `translateX(${direction * 32}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 460, easing: EASE });
  };
  if (image.complete && image.naturalWidth) slide();
  else image.addEventListener('load', slide, { once: true });
}

// ---- segmented controls -----------------------------------------------------------------
// When the pressed item of a group changes in place, a pill glides from the old one to the new.
const GROUPS = '.seg, .preview-setting, .side-nav';
const on = (value) => value !== null && value !== 'false';
function glide(group, from, to) {
  const box = group.getBoundingClientRect(), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  if (!a.width || !b.width) return;
  // With the items' own transitions held, the new item already shows its final background.
  group.querySelectorAll(':scope > .motion-glide').forEach((old) => old.remove());
  group.classList.remove('is-hiding');
  group.classList.add('is-gliding');
  const look = getComputedStyle(to);
  const pill = Object.assign(document.createElement('span'), { className: 'motion-glide' });
  pill.setAttribute('aria-hidden', 'true');
  Object.assign(pill.style, {
    left: `${b.left - box.left - group.clientLeft + group.scrollLeft}px`, top: `${b.top - box.top - group.clientTop + group.scrollTop}px`,
    width: `${b.width}px`, height: `${b.height}px`, background: look.backgroundColor, borderRadius: look.borderRadius, boxShadow: look.boxShadow,
  });
  group.classList.add('is-hiding');
  group.append(pill);
  pill.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)`, width: `${a.width}px`, height: `${a.height}px` }, { transform: 'none', width: `${b.width}px`, height: `${b.height}px` }],
    { duration: 420, easing: EASE }).finished.then(() => {
    if (!pill.isConnected) return;
    // The item takes its own background back before the pill goes, so nothing blinks.
    group.classList.remove('is-hiding');
    requestAnimationFrame(() => {
      if (!pill.isConnected) return;
      pill.remove();
      group.classList.remove('is-gliding');
    });
  }, () => {});
}
new MutationObserver((records) => {
  if (still()) return;
  const groups = new Map();
  for (const { target, oldValue, attributeName } of records) {
    const group = target.parentElement?.closest(GROUPS);
    if (!group) continue;
    const pair = groups.get(group) ?? {};
    const now = target.getAttribute(attributeName);
    if (on(now) && !on(oldValue)) pair.to = target;
    else if (!on(now) && on(oldValue)) pair.from = target;
    groups.set(group, pair);
  }
  for (const [group, { from, to }] of groups) if (from && to && from.isConnected && to.isConnected) glide(group, from, to);
}).observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['aria-pressed', 'aria-current'] });

// ---- language ---------------------------------------------------------------------------
// Switching languages cross-fades only the words that change; the rest of the page holds still and
// the pressed language glides across the switch that was used.
setLocaleTransition((apply) => {
  if (still() || !document.startViewTransition || document.visibilityState !== 'visible') return apply();
  const html = document.documentElement;
  const toggle = recent()?.target.closest?.('[data-locale-toggle]');
  let pill = toggle?.querySelector('[aria-current="true"]');
  const name = (el) => { if (el) el.style.viewTransitionName = 'locale-pill'; };
  name(pill);
  html.classList.add('is-relocating');
  const transition = document.startViewTransition(() => {
    if (pill) pill.style.viewTransitionName = '';
    apply();
    pill = toggle?.isConnected ? toggle.querySelector('[aria-current="true"]') : null;
    name(pill);
  });
  const done = () => {
    html.classList.remove('is-relocating');
    if (pill) pill.style.viewTransitionName = '';
  };
  transition.finished.then(done, done);
});

// ---- pointer light ----------------------------------------------------------------------
// A soft light follows the pointer across a question card and catches its edge.
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
let lit = null, litX = 0, litY = 0, litFrame = 0;
document.addEventListener('pointermove', (event) => {
  if (event.pointerType !== 'mouse' || !finePointer.matches) return;
  const card = event.target.closest?.('.task-card');
  if (!card) return;
  lit = card; litX = event.clientX; litY = event.clientY;
  litFrame ||= requestAnimationFrame(() => {
    litFrame = 0;
    if (!lit?.isConnected) return;
    const r = lit.getBoundingClientRect();
    lit.style.setProperty('--mx', `${litX - r.left}px`);
    lit.style.setProperty('--my', `${litY - r.top}px`);
  });
}, { passive: true });
