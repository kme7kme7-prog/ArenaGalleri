// Suggestions for free-text inputs backed by a <datalist>: <input data-suggest="list-id">.
// The browser's own list only matches substrings; this one ranks with match.js. The datalist
// stays in the page as the record of registered entries.
import { rankSuggestions } from './match.js';

const LIMIT = 60;
let box = null, owner = null, shown = [], active = -1;

const listOf = (input) => document.getElementById(input.dataset.suggest);
const itemsOf = (input) => [...(listOf(input)?.options ?? [])].map((o) => ({ value: o.value, label: o.label === o.value ? '' : o.label, keys: `${o.label} ${o.dataset.keys ?? ''}`, count: Number(o.dataset.count) || 0, since: Number(o.dataset.since) || 0 }));

function close() {
  box?.remove();
  owner?.setAttribute('aria-expanded', 'false');
  owner?.removeAttribute('aria-activedescendant');
  box = owner = null; shown = []; active = -1;
}

function mark(index) {
  active = index;
  box?.querySelectorAll('[role=option]').forEach((el, i) => el.setAttribute('aria-selected', String(i === index)));
  const el = box?.children[index];
  if (el) { el.scrollIntoView({ block: 'nearest' }); owner.setAttribute('aria-activedescendant', el.id); } else owner?.removeAttribute('aria-activedescendant');
}

function open(input) {
  const value = input.value.trim();
  const items = itemsOf(input);
  // A finished choice shows the whole list again so another one is a click away.
  const exact = items.some((i) => i.value === value);
  const found = rankSuggestions(exact ? '' : value, items).slice(0, LIMIT);
  if (!found.length) return close();
  if (owner !== input) { close(); owner = input; }
  if (!box) {
    box = document.createElement('ul');
    box.className = 'suggest';
    box.id = `${input.dataset.suggest}-box`;
    box.setAttribute('role', 'listbox');
    box.addEventListener('mousedown', (e) => e.preventDefault());
    box.addEventListener('click', (e) => {
      const li = e.target.closest('[data-index]');
      if (li) choose(Number(li.dataset.index));
    });
    input.closest('.field')?.append(box) ?? input.after(box);
    input.setAttribute('aria-controls', box.id);
  }
  box.style.top = `${input.offsetTop + input.offsetHeight + 4}px`;
  shown = found;
  box.replaceChildren(...found.map((item, i) => {
    const li = document.createElement('li');
    li.id = `${box.id}-${i}`;
    li.dataset.index = i;
    li.setAttribute('role', 'option');
    li.append(Object.assign(document.createElement('b'), { textContent: item.value }));
    if (item.label) li.append(Object.assign(document.createElement('small'), { textContent: item.label }));
    return li;
  }));
  input.setAttribute('aria-expanded', 'true');
  mark(exact ? found.findIndex((i) => i.value === value) : value ? 0 : -1);
}

function choose(index) {
  const input = owner, item = shown[index];
  if (!input || !item) return;
  close();
  input.value = item.value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

if (typeof document !== 'undefined') {
  const target = (e) => (e.target instanceof HTMLInputElement && e.target.dataset.suggest ? e.target : null);
  document.addEventListener('focusin', (e) => { if (target(e)) open(e.target); });
  document.addEventListener('focusout', (e) => { if (target(e) === owner) close(); });
  document.addEventListener('input', (e) => { if (target(e) && e.isTrusted) open(e.target); });
  document.addEventListener('keydown', (e) => {
    const input = target(e);
    if (!input) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (owner !== input) return open(input);
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      mark((active + step + shown.length) % shown.length);
    } else if (e.key === 'Enter' && owner === input && active >= 0) {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape' && owner === input) {
      // Close only the list, not a dialog around the form.
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }, true);
}
