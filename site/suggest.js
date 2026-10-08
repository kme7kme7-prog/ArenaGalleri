// Suggestions for free-text inputs backed by a <datalist>: <input data-suggest="list-id">.
// The browser's own datalist only matches substrings, so "56" never finds GPT-5.6 and "6"
// lists Opus 4.6 before GPT-6. Here version numbers match without their dots and whole
// numbers come before numbers that merely contain the digits. Equal matches put the
// common and the new first (see weight).

const tokens = (text) => String(text ?? '').normalize('NFKC').toLowerCase().match(/\d+(?:\.\d+)*|\p{L}+/gu) ?? [];
const compact = (text) => String(text ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\d]+/gu, '');

// 0 a token it starts (6 → 6, 6.1), 3 a token that only contains it (6 → 4.6); numbers only match numbers.
function tier(q, t) {
  const num = /^\d/.test(q);
  if (num !== /^\d/.test(t)) return null;
  const qd = q.replaceAll('.', ''), td = t.replaceAll('.', '');
  if (td.startsWith(qd)) return 0;
  return td.includes(qd) ? 3 : null;
}

const best = (q, list) => list.reduce((min, t) => {
  const n = tier(q, t);
  return n === null || (min !== null && min <= n) ? min : n;
}, null);

// Release dates are unknown, so newness comes from the version within a family (GPT-6.1 after
// GPT-6, Opus 5.5 after Opus 4.8) and from when the first work arrived on the site.
const familyOf = (value) => {
  const words = tokens(value);
  const at = words.findIndex((w) => /^\d/.test(w));
  return at < 0 ? null : { family: words.slice(0, at).join(' '), version: words[at].split('.').map(Number) };
};
const older = (a, b) => a.reduce((d, n, i) => d || n - (b[i] ?? -1), 0) || a.length - b.length;
// 0 the oldest version of its family, 1 the newest; 0.5 for a family of one version.
function newness(items) {
  const parsed = new Map(items.map((item) => [item, familyOf(item.value)]));
  const families = new Map();
  for (const f of parsed.values()) if (f) families.set(f.family, (families.get(f.family) ?? new Map()).set(f.version.join('.'), f.version));
  return new Map(items.map((item) => {
    const f = parsed.get(item);
    const versions = f ? [...families.get(f.family).values()] : [];
    if (versions.length < 2) return [item, 0.5];
    return [item, versions.filter((v) => older(v, f.version) < 0).length / (versions.length - 1)];
  }));
}

// Works on the site plus newness: the newest version of a family counts like about 20 more
// works, and so does a model whose first work arrived today (a month old: about 5 more).
const DAY = 864e5;
const weight = ({ count = 0, since }, fresh, now) => Math.log1p(count) + 3 * fresh
  + (since ? 3 * 0.5 ** (Math.max(0, now - since) / DAY / 30) : 0);

// items: [{ value, keys, count, since }]: keys holds secondary words such as the vendor or
// aliases, count the works that use the entry, since when its first work arrived (ms).
// Returns the matching items, best first.
export function rankSuggestions(query, items, now = Date.now()) {
  const words = tokens(query);
  const fresh = newness(items);
  const byUse = (a, b) => weight(b.item, fresh.get(b.item), now) - weight(a.item, fresh.get(a.item), now) || a.index - b.index;
  if (!words.length) return items.map((item, index) => ({ item, index })).sort(byUse).map((s) => s.item);
  const scored = [];
  items.forEach((item, index) => {
    const own = tokens(item.value), extra = tokens(item.keys);
    let score = 0;
    for (const q of words) {
      const hit = best(q, own) ?? (best(q, extra) === null ? null : best(q, extra) + 2);
      if (hit === null) { score = null; break; }
      score += hit;
    }
    // Typed as one run ("m2" in MiniMax-M2.5) beats words matched apart (MiMo V2.6).
    const joined = compact(item.value).includes(compact(query));
    if (score === null && joined) score = 9;
    else if (joined) score -= 0.5;
    if (score !== null) scored.push({ item, score, index });
  });
  return scored.sort((a, b) => a.score - b.score || byUse(a, b)).map((s) => s.item);
}

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
