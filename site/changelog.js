// Changelog: the public page (#/changelog, #/changelog/<id>) and the helpers the home page's
// news pill shares. Entries come from GET /api/changelog, newest first; the kind filter is page state.
import { locale, setPageTitle } from './i18n.js';
import { $, esc, icon, store } from './ui.js';
import { api, apiRemembered, recall, toast } from './platform.js';

const KINDS = {
  feature: ['新功能', 'New', 'plus'],
  improve: ['改进', 'Improved', 'arrow'],
  fix: ['修复', 'Fixed', 'shield'],
  rule: ['规则调整', 'Policy', 'file'],
};
const SEEN = 'gallery-changelog-seen';

const english = () => locale() === 'en';
export const kindName = (kind) => KINDS[kind][english() ? 1 : 0];
// An entry reads in English only when both English fields exist; otherwise the Chinese original stands in.
export const entryView = (e) => (english() && e.titleEn && e.bodyEn ? { title: e.titleEn, body: e.bodyEn, original: false } : { title: e.title, body: e.body, original: english() });
const day = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const shortDate = (iso) => iso.slice(5);

// Read state is the newest entry the reader has opened the page on: "<date>#<id>".
const stamp = (e) => `${e.publishedOn}#${e.id}`;
export const markSeen = (entries) => { if (entries[0]) store.set(SEEN, stamp(entries[0])); };
export function unseen(entry) {
  const seen = store.get(SEEN);
  if (!seen) return true;
  const [date, id] = seen.split('#');
  return entry.publishedOn > date || (entry.publishedOn === date && entry.id > Number(id));
}

// Body markup: paragraphs, - lists, 1. lists, **bold**, `code` and [text](link). Everything is escaped
// first; links only keep #/, https:// and mailto: targets, anything else stays as the typed text.
function inline(source) {
  return esc(source).split(/(`[^`]+`)/).map((part, i) => (i % 2 ? `<code>${part.slice(1, -1)}</code>` : part
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, text, url) => (/^(#\/|https:\/\/|mailto:)/.test(url)
      ? `<a href="${url}"${url.startsWith('https://') ? ' target="_blank" rel="noopener"' : ''}>${text}</a>` : whole)))).join('');
}
export function bodyHtml(text) {
  const blocks = [];
  for (const line of String(text).split(/\r?\n/)) {
    const item = line.match(/^(-|\d+\.)\s+(.*)$/);
    const tag = item ? (item[1] === '-' ? 'ul' : 'ol') : 'p';
    const last = blocks.at(-1);
    if (!line.trim()) { blocks.push(null); continue; }
    if (last && last.tag === tag && tag !== 'p') last.lines.push(item[2]);
    else if (last && tag === 'p' && last.tag === 'p') last.lines.push(line.trim());
    else blocks.push({ tag, lines: [item ? item[2] : line.trim()] });
  }
  return blocks.filter(Boolean).map(({ tag, lines }) => (tag === 'p'
    ? `<p>${lines.map(inline).join('<br>')}</p>`
    : `<${tag}>${lines.map((l) => `<li>${inline(l)}</li>`).join('')}</${tag}>`)).join('');
}

const linkHtml = (link) => (link ? `<a class="text-link changelog-more" href="${esc(link)}"${link.startsWith('https://') ? ' target="_blank" rel="noopener"' : ''}>去看看${icon(link.startsWith('https://') ? 'arrow' : 'right')}</a>` : '');
const monthLabel = (month, count) => {
  const [y, m] = month.split('-').map(Number);
  return english() ? `${new Date(y, m - 1, 1).toLocaleDateString('en', { month: 'long' })} ${y} · ${count}` : `${y} 年 ${m} 月 · ${count} 条`;
};

// The news pill on the home page: the newest entry, or null when there is none worth showing.
export async function latestNews() {
  const { entries } = await api('changelog?limit=1');
  const entry = entries[0];
  return entry && Date.now() - day(entry.publishedOn) < 45 * 864e5 ? entry : null;
}

export function mount(root, ctx) {
  const target = /^\d+$/.test(ctx.param ?? '') ? ctx.param : null;
  let entries = recall('changelog')?.entries ?? null;
  let failed = false, kind = '', destroyed = false;
  let readController = null, readRun = 0, pendingRead = null;

  const counts = () => Object.fromEntries(['', ...Object.keys(KINDS)].map((k) => [k, k ? entries.filter((e) => e.kind === k).length : entries.length]));
  const stat = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const navButton = (value, glyph, name, count) => `<button type="button" class="side-link" data-cl-kind="${value}"${value === kind ? ' aria-current="page"' : ''}${count === 0 ? ' disabled' : ''}>${icon(glyph)}<span data-i18n-ignore>${name}</span><span class="nav-count">${count}</span></button>`;
  const nav = () => {
    const c = entries ? counts() : {};
    return `<nav class="side-nav section-nav changelog-nav" aria-label="更新类型">${navButton('', 'grid', english() ? 'All' : '全部', entries ? c[''] : '')}${Object.entries(KINDS).map(([k, [zh, en, glyph]]) => navButton(k, glyph, english() ? en : zh, entries ? c[k] : '')).join('')}</nav>`;
  };
  const heading = () => (kind ? kindName(kind) : '全部更新');

  const entryHtml = (e) => {
    const view = entryView(e);
    const week = day(e.publishedOn).toLocaleDateString(locale(), { weekday: 'short' });
    return `<article class="changelog-entry" id="changelog-${e.id}" aria-labelledby="changelog-title-${e.id}">
      <div class="changelog-when"><time datetime="${e.publishedOn}">${shortDate(e.publishedOn)}</time><span data-i18n-ignore>${esc(week)}</span></div>
      <p class="changelog-kind"><span class="badge" data-i18n-ignore>${kindName(e.kind)}</span>${view.original ? '<span class="badge provisional">仅中文</span>' : ''}</p>
      <div class="changelog-head"><h3 id="changelog-title-${e.id}" data-i18n-ignore>${esc(view.title)}</h3><button type="button" class="btn ghost sm changelog-copy" data-cl-copy="${e.id}" aria-label="复制这条更新的链接">${icon('link')}</button></div>
      <div class="changelog-body" data-i18n-ignore>${bodyHtml(view.body)}</div>
      ${linkHtml(e.link)}
    </article>`;
  };
  const listHtml = () => {
    if (!entries) {
      return failed
        ? '<div class="board-empty"><p class="board-empty-title">更新日志暂时无法加载</p><div class="board-empty-actions"><button type="button" class="btn sm" data-cl-retry>重试</button></div></div>'
        : `<div class="changelog-skeleton" aria-busy="true" aria-label="正在载入…">${'<div><i></i><i></i><i></i></div>'.repeat(3)}</div>`;
    }
    const missing = target && !entries.some((e) => String(e.id) === target) ? '<p class="changelog-note" role="status">这条更新不存在或已撤下</p>' : '';
    if (!entries.length) return `${missing}<div class="board-empty"><p class="board-empty-title">还没有更新记录</p></div>`;
    const shown = kind ? entries.filter((e) => e.kind === kind) : entries;
    if (!shown.length) return `${missing}<div class="board-empty"><p class="board-empty-title">这个类型还没有更新</p><div class="board-empty-actions"><button type="button" class="btn sm" data-cl-kind="">查看全部</button></div></div>`;
    const months = new Map();
    for (const e of shown) months.set(e.publishedOn.slice(0, 7), [...(months.get(e.publishedOn.slice(0, 7)) ?? []), e]);
    return missing + [...months].map(([month, items]) => `<section class="changelog-month" aria-label="${esc(monthLabel(month, items.length))}">
      <h3 class="changelog-month-head" data-i18n-ignore>${esc(monthLabel(month, items.length))}</h3>${items.map(entryHtml).join('')}</section>`).join('');
  };

  // Switching the kind redraws the sidebar nav, the heading and the list, not the page around them.
  const paint = () => {
    $('.changelog-nav', root).outerHTML = nav();
    $('.collection-heading h2', root).textContent = heading();
    $('[data-cl-list]', root).innerHTML = listHtml();
  };
  function draw() {
    const open = target && entries?.find((e) => String(e.id) === target);
    const crumbs = open ? [{ text: '更新日志', href: '#/changelog' }, { text: entryView(open).title, original: true }] : [{ text: '更新日志' }];
    root.innerHTML = `${ctx.pageStart({
      title: '更新日志', section: '', heading: heading(), crumbs, description: '亿模亿样的新功能、改进、修复与规则调整。',
      caption: '<span class="collection-caption">按发布时间倒序</span>',
      meta: entries ? `<dl class="side-stats">${stat('更新条数', entries.length)}${stat('最近更新', entries[0] ? shortDate(entries[0].publishedOn) : '—')}</dl>` : '',
      nav: nav(),
    })}<section class="block wrap" data-cl-list>${listHtml()}</section>${ctx.pageEnd()}`;
    setPageTitle(open ? ['更新日志', { text: entryView(open).title, original: true }, ctx.DATA.title] : ['更新日志', ctx.DATA.title]);
  }
  // A shared link lands on its entry once; later redraws leave the scroll alone.
  function arrive() {
    const el = target && $(`#changelog-${target}`, root);
    if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('is-target'); }
  }

  async function load() {
    if (pendingRead) return pendingRead;
    const run = ++readRun, controller = new AbortController();
    readController = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    pendingRead = (async () => {
      failed = false;
      const shown = entries && JSON.stringify(entries);
      try {
        const data = await apiRemembered('changelog', { signal: controller.signal });
        if (destroyed || run !== readRun || controller.signal.aborted) return;
        entries = data.entries;
        markSeen(entries);
      } catch {
        if (destroyed || run !== readRun) return;
        if (!entries) failed = true;
      } finally {
        clearTimeout(timer);
        if (run === readRun) { pendingRead = null; readController = null; }
      }
      if (destroyed || run !== readRun) return;
      if (!shown || shown !== JSON.stringify(entries)) draw();
      arrive();
    })();
    return pendingRead;
  }

  const onClick = (event) => {
    const filter = event.target.closest('[data-cl-kind]');
    if (filter) { kind = filter.dataset.clKind; paint(); return; }
    if (event.target.closest('[data-cl-retry]')) { entries = null; failed = false; paint(); void load(); return; }
    const copy = event.target.closest('[data-cl-copy]');
    if (copy) {
      navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/changelog/${copy.dataset.clCopy}`)
        .then(() => toast('已复制链接'), () => toast('复制失败，请从地址栏复制'));
    }
  };
  const relocalize = () => { if (!destroyed) draw(); };
  root.addEventListener('click', onClick);
  window.addEventListener('localechange', relocalize);

  draw();
  return {
    ready: load(),
    onPlatformChange() {},
    destroy() {
      destroyed = true;
      readRun++;
      readController?.abort();
      root.removeEventListener('click', onClick);
      window.removeEventListener('localechange', relocalize);
    },
  };
}
