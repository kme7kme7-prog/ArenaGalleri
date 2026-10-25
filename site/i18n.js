import gallery from './i18n-gallery.js';
import platform from './i18n-platform.js';
import authoring from './i18n-authoring.js';
import experience from './i18n-experience.js';
import levels from './i18n-levels.js';

const normalize = (text) => text.trim().replace(/\s+/g, ' ');
const catalog = Object.fromEntries(Object.entries({ ...gallery, ...platform, ...authoring, ...experience, ...levels }).map(([source, english]) => [normalize(source), english]));
const generatedUiSources = new Map();
const reverseCatalog = Object.fromEntries(Object.entries(catalog).map(([source, english]) => [english, source]));
const KEY = 'gallery-locale';
let current;
try { current = localStorage.getItem(KEY); } catch { /* storage unavailable */ }
if (!['zh-CN', 'en'].includes(current)) current = /^zh\b/i.test(globalThis.navigator?.languages?.[0] ?? globalThis.navigator?.language ?? 'zh-CN') ? 'zh-CN' : 'en';
export const locale = () => current;
export const formatNumber = (value, options = {}) => new Intl.NumberFormat(current, options).format(value);
// DOM attributes stringify API millisecond timestamps. Leave years and ordinary
// date strings to Date's existing parser; only long integer timestamps are numeric.
const dateValue = value => typeof value === 'string' && /^[+-]?\d{11,16}$/.test(value) ? Number(value) : value;
export const formatDate = (value, options = {}) => value ? new Date(dateValue(value)).toLocaleDateString(current, { year: 'numeric', month: '2-digit', day: '2-digit', ...options }) : '';
export const formatTime = (value, options = {}) => value ? new Date(dateValue(value)).toLocaleString(current, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', ...options }) : '';
const escapePattern = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Templates are an explicit allowlist, anchored to the entire phrase; raw content is excluded below.
const patterns = Object.entries(catalog).filter(([key]) => /\{[A-Za-z][A-Za-z0-9]*\}/.test(key) && /[\u3400-\u9fff]/.test(key)).map(([key, english]) => {
  const names = [];
  const pattern = key.split(/(\{[A-Za-z][A-Za-z0-9]*\})/).map((part) => {
    if (/^\{[A-Za-z][A-Za-z0-9]*\}$/.test(part)) {
      const name = part.slice(1, -1);
      names.push(name);
      if (/^(?:count|n|seconds|total|models|works|votes|voters|tasks|groups|configs|vendors|files|score|max|year|percent)$/.test(name) || new RegExp(`\\{${name}\\}\\s*(?:次|件|份|个|张|道|位|组|秒|分钟|字|小时|天|%)`).test(key)) return '([\\d,.]+)';
      if (name === 'side') return '(A|B|左|右|left|right)';
      return '([^\\r\\n]+?)';
    }
    return escapePattern(part).replace(/ +/g, '\\s+');
  }).join('');
  return { regex: new RegExp(`^${pattern}$`), names, english };
});
const interpolate = (text, vars) => text.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (whole, name) => vars[name] ?? whole);
// Only nouns in authored English templates are inflected; captured original content is untouched.
const singularNouns = { answers: 'answer', attempts: 'attempt', providers: 'provider', vendors: 'vendor', models: 'model', works: 'work', files: 'file', questions: 'question', votes: 'vote', participants: 'participant', seconds: 'second', minutes: 'minute', hours: 'hour', days: 'day', images: 'image', characters: 'character', configurations: 'configuration', comparisons: 'comparison', pairs: 'pair', results: 'result', groups: 'group', entries: 'entry', wins: 'win', ties: 'tie', losses: 'loss', people: 'person', items: 'item', uploads: 'upload', submissions: 'submission', screenshots: 'screenshot', references: 'reference', members: 'member', reviews: 'review' };
const countedNoun = new RegExp(`\\{([A-Za-z][A-Za-z0-9]*)\\}((?: [a-z-]+){0,3}) (${Object.keys(singularNouns).join('|')})\\b`, 'g');
const englishPlural = new Intl.PluralRules('en');
function englishMessage(template, vars) {
  const text = template.replace(countedNoun, (whole, name, adjectives, noun) => {
    const value = Number(String(vars[name] ?? '').replaceAll(',', ''));
    return Number.isFinite(value) && englishPlural.select(value) === 'one' ? `{${name}}${adjectives} ${singularNouns[noun]}` : whole;
  });
  return interpolate(text, vars);
}
export function t(source, vars = {}) {
  const text = String(source ?? '');
  const original = interpolate(text, vars);
  const output = current === 'en' ? englishMessage(catalog[normalize(text)] ?? translateText(text), vars) : original;
  if (output !== original) generatedUiSources.set(output, original);
  return output;
}
export function translateText(source) {
  const text = String(source ?? '');
  if (current !== 'en') return text;
  const trimmed = text.trim();
  const normalized = normalize(trimmed);
  let english = catalog[normalized];
  if (english === undefined) for (const pattern of patterns) {
    const match = trimmed.match(pattern.regex);
    if (match) { english = englishMessage(pattern.english, Object.fromEntries(pattern.names.map((name, i) => [name, match[i + 1]]))); break; }
  }
  return english === undefined ? text : text.replace(trimmed, english);
}
const ignored = 'pre,code,script,style,textarea,[contenteditable], [data-i18n-ignore]';
const attrs = ['title', 'aria-label', 'placeholder', 'alt', 'label'];
const originals = new WeakMap();
let observer;
let pageTitle;
let lastPageTitle;
// Search engines read the rendered title; the Chinese site name stays in English titles.
const BRAND = '亿模亿样';
const titlePart = (text) => text === BRAND && current === 'en' ? `${BRAND} ${t(BRAND)}` : t(text);
export function setPageTitle(parts) {
  pageTitle = parts;
  if (typeof document !== 'undefined') {
    const text = parts.map((part) => typeof part === 'string' ? titlePart(part) : part.original ? part.text : titlePart(part.text)).join(' · ');
    if (document.title !== text) document.title = text;
    lastPageTitle = text;
  }
}
function translateSlot(node, key, read, write) {
  const value = read();
  const slots = originals.get(node) ?? {};
  const saved = slots[key];
  const knownSource = generatedUiSources.get(value.trim()) ?? reverseCatalog[value.trim()];
  const source = !saved || value !== saved.output ? knownSource ? value.replace(value.trim(), knownSource) : value : saved.source;
  const output = translateText(source);
  slots[key] = { source, output };
  originals.set(node, slots);
  if (value !== output) write(output);
}
function localize(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.parentElement && !(node.parentElement.tagName === 'TITLE' && pageTitle) && !node.parentElement.closest(ignored) && !(node.parentElement.tagName === 'OPTION' && !node.parentElement.hasAttribute('value'))) translateSlot(node, 'text', () => node.data, (text) => { node.data = text; });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) return;
  if (node.nodeType === Node.ELEMENT_NODE) {
    if (node.hasAttribute('data-i18n-option-original')) {
      node.textContent = node.getAttribute('data-i18n-option-original') + translateText(node.getAttribute('data-i18n-option-suffix') ?? '');
      return;
    }
    if ((node.tagName === 'TITLE' && pageTitle) || node.closest(ignored.replace('textarea,', '')) || (node.tagName === 'OPTION' && !node.hasAttribute('value'))) return;
    const originalAttrs = (node.getAttribute('data-i18n-original-attrs') ?? '').split(/\s+/);
    for (const attr of attrs) if (node.hasAttribute(attr) && !originalAttrs.includes(attr)) translateSlot(node, attr, () => node.getAttribute(attr), (text) => node.setAttribute(attr, text));
    if (node.tagName === 'TEXTAREA') return;
    for (const kind of ['date', 'time', 'number']) if (node.hasAttribute(`data-i18n-${kind}`)) {
      const value = node.getAttribute(`data-i18n-${kind}`);
      node.textContent = kind === 'date' ? formatDate(value) : kind === 'time' ? formatTime(value) : formatNumber(Number(value));
      return;
    }
  }
  for (const child of node.childNodes) localize(child);
}
function syncButtons() {
  document.querySelectorAll('[data-locale-toggle]').forEach((button) => {
    button.setAttribute('aria-label', current === 'en' ? '切换到中文' : 'Switch to English');
    button.title = current === 'en' ? '切换到中文' : 'Switch to English';
    button.querySelector('[data-locale-zh]')?.setAttribute('aria-current', String(current === 'zh-CN'));
    button.querySelector('[data-locale-en]')?.setAttribute('aria-current', String(current === 'en'));
  });
}
function syncMetadata() {
  document.documentElement.lang = current;
  if (pageTitle && document.title !== lastPageTitle) pageTitle = null;
  if (pageTitle) setPageTitle(pageTitle);
  const meta = document.querySelector('meta[name="description"]');
  if (meta) translateSlot(meta, 'content', () => meta.content, (text) => { meta.content = text; });
}
const observe = () => observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attrs.concat(['data-i18n-date', 'data-i18n-time', 'data-i18n-number', 'data-i18n-option-suffix']) });
function refresh() {
  observer?.disconnect();
  localize(document);
  syncMetadata();
  syncButtons();
  if (observer) observe();
}
// The page may wrap the swap in a transition (motion.js); the language itself changes at once.
let switching = (apply) => apply();
export const setLocaleTransition = (wrap) => { switching = wrap; };
export function setLocale(next) {
  if (!['zh-CN', 'en'].includes(next) || next === current) return;
  current = next;
  try { localStorage.setItem(KEY, next); } catch { /* storage unavailable */ }
  const apply = () => {
    if (typeof document !== 'undefined') refresh();
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('localechange', { detail: { locale: current } }));
  };
  if (typeof document === 'undefined') apply();
  else switching(apply);
}
export const languageButton = (cls = '') => `<button type="button" class="locale-toggle ${cls}" data-locale-toggle data-i18n-ignore aria-label="${current === 'en' ? '切换到中文' : 'Switch to English'}"><span data-locale-zh aria-current="${current === 'zh-CN'}">中文</span><span class="locale-divider" aria-hidden="true">/</span><span data-locale-en aria-current="${current === 'en'}">EN</span></button>`;
export function initI18n() {
  if (observer) return;
  observer = new MutationObserver((records) => {
    observer.disconnect();
    for (const record of records) {
      if (record.type === 'childList') for (const node of record.addedNodes) localize(node);
      else localize(record.target);
    }
    syncMetadata();
    syncButtons();
    observe();
  });
  refresh();
  // A click on one language picks it; anywhere else on the switch (or the keyboard) toggles.
  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-locale-toggle]')) return;
    const picked = event.target.closest('[data-locale-zh], [data-locale-en]');
    setLocale(picked ? (picked.hasAttribute('data-locale-en') ? 'en' : 'zh-CN') : current === 'en' ? 'zh-CN' : 'en');
  });
  window.addEventListener('storage', (event) => { if (event.key === KEY && ['zh-CN', 'en'].includes(event.newValue)) setLocale(event.newValue); });
}
