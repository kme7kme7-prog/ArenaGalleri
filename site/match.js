// Matching names the way people type them, shared by the suggestion lists (suggest.js), the
// model-name hint and the searches. A plain substring test never finds GPT-5.6 from "56" and
// puts Opus 4.6 before GPT-6 for "6". Here words match separately, version numbers match
// without their dots, and whole numbers come before numbers that merely contain the digits.

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

// Lower is better, null when some word is missing. keys holds secondary words (vendor, aliases)
// that match a little worse than the value itself.
function matchScore(query, value, keys = '') {
  const own = tokens(value), extra = tokens(keys);
  let score = 0;
  for (const q of tokens(query)) {
    const hit = best(q, own) ?? (best(q, extra) === null ? null : best(q, extra) + 2);
    if (hit === null) { score = null; break; }
    score += hit;
  }
  // Typed as one run ("m2" in MiniMax-M2.5) beats words matched apart (MiMo V2.6).
  const joined = compact(value).includes(compact(query));
  if (score === null) return joined ? 9 : null;
  return joined ? score - 0.5 : score;
}

// Whether every word of a search appears in the text; an empty search matches everything.
export const textMatches = (query, text) => !compact(query) || matchScore(query, text) !== null;

// items: [{ value, keys, count, since }]: keys holds secondary words such as the vendor or
// aliases, count the works that use the entry, since when its first work arrived (ms).
// Returns the matching items, best first; equal matches put the common and the new first.
export function rankSuggestions(query, items, now = Date.now()) {
  const fresh = newness(items);
  const byUse = (a, b) => weight(b.item, fresh.get(b.item), now) - weight(a.item, fresh.get(a.item), now) || a.index - b.index;
  if (!tokens(query).length) return items.map((item, index) => ({ item, index })).sort(byUse).map((s) => s.item);
  return items.map((item, index) => ({ item, index, score: matchScore(query, item.value, item.keys) }))
    .filter((s) => s.score !== null)
    .sort((a, b) => a.score - b.score || byUse(a, b)).map((s) => s.item);
}

// The registered entry an unregistered name most likely means: the same words written another
// way (GPT5.6 luna, luna gpt-5.6, an alias) or with a typo inside a longer word (Hiaku). Short
// words and numbers must agree, so neither GPT-5.7 Luna nor Laguna XS is taken for an
// existing model. items: [{ value, aliases }]; returns the item or null.
export function closestEntry(name, items) {
  if (compact(name).length < 3) return null;
  const words = (text) => tokens(text).map((t) => t.replaceAll('.', '')).sort();
  const mine = words(name);
  // Typos allowed across the words, or Infinity when the words cannot be the same.
  const typos = (other) => {
    if (compact(other) === compact(name)) return 0;
    const theirs = words(other);
    if (theirs.length !== mine.length) return Infinity;
    let sum = 0;
    for (const [i, word] of mine.entries()) {
      if (word === theirs[i]) continue;
      const limit = Math.min(word.length, theirs[i].length) >= 5 ? 2 : Math.min(word.length, theirs[i].length) >= 4 ? 1 : 0;
      if (/\d/.test(word + theirs[i]) || !limit) return Infinity;
      const d = distance(word, theirs[i], limit + 1);
      if (d > limit) return Infinity;
      sum += d;
    }
    return sum;
  };
  let found = null, least = Infinity;
  for (const item of items) {
    for (const other of [item.value, ...(item.aliases ?? [])]) {
      const d = typos(other);
      if (d < least) { found = item; least = d; }
    }
  }
  return found;
}

// Edit distance, giving up (returning limit) once it reaches limit.
function distance(a, b, limit) {
  if (Math.abs(a.length - b.length) >= limit) return limit;
  let row = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...next) >= limit) return limit;
    row = next;
  }
  return Math.min(row[b.length], limit);
}

