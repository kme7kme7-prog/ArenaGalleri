import { languageButton } from './i18n.js';
import { $, esc, icon } from './ui.js';

let nextTitle = 0;

// Keep authentication outside the native top layer so password-manager menus can work.
export function openAuthDialog({ title, body, className = '', onClose }) {
  const returnFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay';
  const panel = document.createElement('div');
  const titleId = `auth-dialog-title-${++nextTitle}`;
  panel.className = `sheet ${className}`;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', titleId);
  panel.tabIndex = -1;
  panel.innerHTML = `<div class="sheet-in">
    <header class="sheet-head"><h2 id="${titleId}">${esc(title)}</h2><div class="sheet-head-tools">${languageButton()}<button class="icon-btn" type="button" data-sheet-close aria-label="关闭">${icon('close')}</button></div></header>
    <div class="sheet-body">${body}</div>
  </div>`;
  const previous = [...document.querySelectorAll('.auth-overlay')].at(-1);
  // Only our own page and previous sheet become inert; extension nodes stay interactive.
  const background = [$('#app'), $('#lightbox'), previous].filter(Boolean)
    .map((el) => ({ el, inert: el.inert }));
  background.forEach(({ el }) => { el.inert = true; });
  overlay.append(panel);
  document.body.append(overlay);
  const isTop = () => [...document.querySelectorAll('.auth-overlay')].at(-1) === overlay;
  const close = () => {
    if (!panel.isConnected || !isTop()) return;
    overlay.remove();
    background.forEach(({ el, inert }) => { el.inert = inert; });
    panel.dispatchEvent(new Event('close'));
    if (returnFocus?.isConnected) returnFocus.focus();
    onClose?.();
  };
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('[data-sheet-close]')) close();
  });
  panel.addEventListener('keydown', (event) => {
    if (!isTop()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      const focusable = [...panel.querySelectorAll('button, input, select, textarea, a[href], iframe, [tabindex]')]
        .filter((el) => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || (event.shiftKey && (document.activeElement === first || document.activeElement === panel))
        || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last ?? panel : first ?? panel).focus();
      }
    }
  });
  panel.focus();
  return { el: panel, close, setTitle: (text) => { $('.sheet-head h2', panel).textContent = text; } };
}
