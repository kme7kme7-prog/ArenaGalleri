import { formatDate, formatTime, formatNumber } from './i18n.js';
import { cdnMediaUrl } from './media-cdn.js';
export { formatDate, formatTime, formatNumber };
// Shared page helpers: DOM shortcuts, escaping, storage, icons and marks.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
};
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const pad = (n) => String(n).padStart(2, '0');
export const byName = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });
export const formatBytes = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

const ICONS = {
  grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  text: '<path d="M5 7V4h14v3M12 4v16M8 20h8"/>',
  reason: '<path d="M17.5 7V4.5h-11l6 7.5-6 7.5h11V17"/>',
  sun: '<circle cx="12" cy="12" r="3.6"/><path d="M12 3v1.8M12 19.2V21M5.64 5.64l1.27 1.27M17.09 17.09l1.27 1.27M3 12h1.8M19.2 12H21M5.64 18.36l1.27-1.27M17.09 6.91l1.27-1.27"/>',
  moon: '<path d="M19.5 14.6A7.5 7.5 0 0 1 9.4 4.5a7.5 7.5 0 1 0 10.1 10.1Z"/>',
  arrow: '<path d="M7.5 16.5 16.5 7.5M9 7.5h7.5V15"/>',
  right: '<path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5"/>',
  prev: '<path d="m14.5 18-6-6 6-6"/>',
  next: '<path d="m9.5 18 6-6-6-6"/>',
  close: '<path d="M17.5 6.5l-11 11M6.5 6.5l11 11"/>',
  guide: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.9v.01"/>',
  split: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M12 5v14"/>',
  full: '<path d="M4.5 9V4.5H9M19.5 9V4.5H15M4.5 15v4.5H9M19.5 15v4.5H15"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  check: '<path d="m6 12.5 4 4 8-9"/>',
  bookmark: '<path d="M7 4.5h10v15l-5-3.5-5 3.5z"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m20.5 15.5-4.5-4.5-8.5 8"/>',
  code: '<path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4"/>',
  reload: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.2h-4.2"/>',
  rank: '<path d="M5.5 19.5v-6M12 19.5v-14M18.5 19.5v-9"/>',
  upload: '<path d="M12 15.5v-11M7.5 9 12 4.5 16.5 9M4.5 15v4.5h15V15"/>',
  download: '<path d="M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5M4.5 15v4.5h15V15"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5a7 7 0 0 1 14 0"/>',
  smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c1.8 2.2 5.2 2.2 7 0M9.2 9.6v.01M14.8 9.6v.01"/>',
  alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.8v5M12 16.1v.01"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  shield: '<path d="M12 3.5 19 6v5.6c0 4.3-3 7.5-7 8.9-4-1.4-7-4.6-7-8.9V6z"/><path d="m9 12 2.2 2.2L15.3 10"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  logout: '<path d="M13.5 4.5h5v15h-5M9.5 8l-4 4 4 4M5.5 12h9"/>',
  file: '<path d="M7 3.5h7l4.5 4.5v12.5h-11.5z"/><path d="M14 3.5V8h4.5"/>',
  menu: '<path d="M4.5 7.5h15M4.5 12h15M4.5 16.5h15"/>',
  desktop: '<rect x="3.5" y="4.5" width="17" height="11" rx="1.5"/><path d="M9 19.5h6M12 15.5v4"/>',
  phone: '<rect x="7" y="3.5" width="10" height="17" rx="2"/><path d="M11 17.5h2"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7.5 7.5 5.5 7.5-5.5"/>',
  cube: '<path d="M12 3.5 19.5 7.5v9L12 20.5 4.5 16.5v-9z"/><path d="M4.5 7.5 12 11.5l7.5-4M12 11.5v9"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  blind: '<rect x="3" y="5.5" width="7.5" height="13" rx="1.5"/><rect x="13.5" y="5.5" width="7.5" height="13" rx="1.5"/><path d="M6.75 10.5v.01M17.25 10.5v.01M5.5 14h2.5M16 14h2.5"/>',
};
export const icon = (name) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
// Same mark as assets/logo.svg, drawn with theme colours: a solid line (一) over a broken one (亿样).
export const LOGO = '<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect class="logo-bg" width="32" height="32" rx="7"/><rect class="logo-fg" x="7" y="10" width="18" height="4"/><rect class="logo-fg" x="7" y="18" width="7.6" height="4"/><rect class="logo-ac" x="17.4" y="18" width="7.6" height="4"/></svg>';

export const ext = (href, text, cls = 'btn') => `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener">${text}${icon('arrow')}</a>`;
export const brandMark = (m, cls = 'brand-mark') => (m.logo
  ? `<span class="${cls}"><img data-media-src="${esc(m.logo)}" alt="" loading="lazy" decoding="async"></span>`
  : `<span class="${cls}${m.unlisted ? ' is-unlisted' : ''}" aria-hidden="true">${esc((m.name ?? '?').slice(0, 1))}</span>`);
// The vendor under a model name; a model outside the registry says so (see models.js).
const UNLISTED = { declared: '厂商由投稿者填写', inferred: '厂商按模型名称推断' };
export const vendorLine = (m) => (!m.unlisted ? `<span data-i18n-ignore>${esc(m.vendor ?? '')}</span>`
  : m.vendor ? `<span data-i18n-ignore>${esc(m.vendor)}</span> · <span class="unlisted" title="注册表尚未收录这个模型，${UNLISTED[m.unlisted]}">未收录</span>`
    : '<span class="unlisted" title="注册表尚未收录这个模型，也无法从名称判断厂商">未收录模型</span>');

// ---- theme ------------------------------------------------------------------------------
const THEME_COLOR = { light: '#f5f4f0', dark: '#121211' };
const currentTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
export function syncThemeUi() {
  const dark = currentTheme() === 'dark';
  $('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[currentTheme()]);
  $$('[data-theme-toggle]').forEach((b) => {
    b.setAttribute('aria-pressed', String(dark));
    b.title = dark ? '切换到浅色模式' : '切换到深色模式';
  });
}
// The new theme spreads as a circle from the switch over the whole page (motion.css).
function setTheme(next, from) {
  store.set('theme', next);
  const html = document.documentElement;
  const apply = () => { html.dataset.theme = next; syncThemeUi(); };
  if (!document.startViewTransition || reducedMotion()) return apply();
  const box = from?.getBoundingClientRect(), x = box ? box.left + box.width / 2 : innerWidth / 2, y = box ? box.top + box.height / 2 : 0;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  html.classList.add('is-theming');
  const transition = document.startViewTransition(apply);
  transition.ready.then(() => html.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
    { duration: 650, easing: 'cubic-bezier(.65, 0, .35, 1)', pseudoElement: '::view-transition-new(root)' }), () => {});
  transition.finished.then(() => html.classList.remove('is-theming'), () => html.classList.remove('is-theming'));
}
export const themeButton = (cls = 'icon-btn') => `<button class="${cls} theme-toggle" data-theme-toggle aria-label="深色模式" aria-pressed="${currentTheme() === 'dark'}">${icon('moon')}${icon('sun')}</button>`;
// Theme changes are explicit, so the default ink exhibition stays consistent.
document.addEventListener('click', (e) => {
  const toggle = e.target.closest('[data-theme-toggle]');
  if (toggle) setTheme(currentTheme() === 'dark' ? 'light' : 'dark', toggle);
});

// 截图/封面在同一个数据包内内容不变：URL 拼数据包版本号，配 nginx 长缓存后
// 平时直接吃本地缓存，换包时版本变化自动失效。
export const versionedMedia = (src) => {
  const resolved = cdnMediaUrl(src);
  const version = globalThis.SAME_PROMPT_CONFIG?.assetVersion;
  return resolved && version ? `${resolved}${resolved.includes('?') ? '&' : '?'}v=${version}` : resolved;
};

export function img(src, alt, cls = '', eager = false) {
  src = versionedMedia(src);
  return src
    ? `<img data-i18n-ignore class="${cls}" ${eager ? 'src' : 'data-media-src'}="${esc(src)}" alt="${esc(alt)}" loading="${eager ? 'eager' : 'lazy'}"${eager ? ' fetchpriority="high"' : ''} decoding="async" />`
    : `<div class="${cls} img-empty">暂无截图</div>`;
}
