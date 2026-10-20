import { locale } from './i18n.js';
import { api, isSenior, onPlatformChange, toast } from './platform.js';
import { apiUrl } from './platform-api.js';
import { esc, icon, store } from './ui.js';
import { renderAnnouncementMarkdown } from './announcement-markdown.js';

const READ_KEY = 'gallery-announcement-read-through';
const tr = (zh, en) => locale() === 'en' ? en : zh;
const readThrough = () => Number(store.get(READ_KEY)) || 0;
const dateOf = entry => {
  const date = new Date(entry.publishedAt);
  return Number.isNaN(date.getTime()) ? '' : `${date.getMonth() + 1}`.padStart(2, '0') + '-' + `${date.getDate()}`.padStart(2, '0');
};
const fullDate = entry => new Date(entry.publishedAt).toLocaleDateString(locale() === 'en' ? 'en-US' : 'zh-CN',
  { year: 'numeric', month: 'long', day: 'numeric' });

let entries = [], started = false, pending = null, modal = null, stream = null;
let selectedId = 0, editing = false, dismissedThrough = 0, shownAdmin = false;
const latest = () => entries[0] ?? null;
export const latestAnnouncement = () => latest();
export const announcementShortDate = dateOf;

function notify() { window.dispatchEvent(new Event('announcementschange')); }

function render() {
  if (!modal) return;
  shownAdmin = isSenior();
  const current = entries.find(entry => entry.id === selectedId) ?? latest();
  const add = shownAdmin && !editing ? `<button class="announcement-icon" type="button" data-ann-add aria-label="${tr('发布公告', 'Publish an announcement')}" title="${tr('发布公告', 'Publish an announcement')}">${icon('plus')}</button>` : '';
  modal.innerHTML = `<div class="announcement-shell">
    <header class="announcement-head"><div><p class="announcement-eyebrow">${tr('站点消息', 'Site notices')}</p><h2 id="announcement-dialog-title">${editing ? tr('发布公告', 'Publish an announcement') : tr('公告', 'Announcements')}</h2></div>
      <div class="announcement-head-actions">${add}<button class="announcement-icon" type="button" data-ann-close aria-label="${tr('关闭', 'Close')}" title="${tr('关闭', 'Close')}">${icon('close')}</button></div></header>
    ${editing ? `<form class="announcement-compose" data-ann-form>
      <div class="announcement-compose-fields"><label>${tr('标题', 'Title')}<input name="title" maxlength="100" required autocomplete="off" placeholder="${tr('简短描述这则公告', 'A short title for this announcement')}"></label>
        <label>${tr('Markdown 正文', 'Markdown body')}<textarea name="body" maxlength="20000" required placeholder="# ${tr('公告标题', 'Announcement heading')}\n\n${tr('在这里编写公告…', 'Write the announcement here…')}"></textarea></label></div>
      <div class="announcement-compose-preview"><span>${tr('预览', 'Preview')}</span><div class="announcement-markdown" data-ann-preview></div></div>
      <p class="announcement-error" role="alert" data-ann-error hidden></p>
      <div class="announcement-compose-actions"><button type="button" class="btn" data-ann-cancel>${tr('取消', 'Cancel')}</button><button type="submit" class="btn primary announcement-publish">${tr('发布公告', 'Publish announcement')}</button></div>
    </form>` : entries.length ? `<div class="announcement-layout">
      <nav class="announcement-history" aria-label="${tr('历史公告', 'Announcement history')}"><h3>${tr('历史公告', 'History')} <small>${entries.length}</small></h3>
        ${entries.map(entry => `<button type="button" data-ann-select="${entry.id}"${entry.id === current.id ? ' aria-current="true"' : ''}><time datetime="${esc(entry.publishedAt)}">${dateOf(entry)}</time><span>${esc(entry.title)}</span></button>`).join('')}</nav>
      <article class="announcement-article" aria-labelledby="announcement-entry-title"><time datetime="${esc(current.publishedAt)}">${esc(fullDate(current))}</time><h3 id="announcement-entry-title">${esc(current.title)}</h3>
        <div class="announcement-markdown">${renderAnnouncementMarkdown(current.body)}</div></article></div>
      <footer class="announcement-footer"><button type="button" class="btn" data-ann-later>${tr('暂时关闭', 'Close for now')}</button><button type="button" class="btn primary" data-ann-read>${tr('已读并关闭', 'Mark read and close')}</button></footer>`
      : `<div class="announcement-empty">${tr('目前还没有公告。', 'There are no announcements yet.')}</div>`}
  </div>`;
  if (editing) modal.querySelector('[name="title"]')?.focus();
}

function close(read = false) {
  const newest = latest()?.id ?? 0;
  if (read && newest) store.set(READ_KEY, String(Math.max(readThrough(), newest)));
  dismissedThrough = Math.max(dismissedThrough, newest);
  modal?.close();
}

export function openAnnouncements(id = latest()?.id) {
  if (modal) { if (!editing && id) { selectedId = id; render(); } modal.focus(); return; }
  selectedId = id ?? 0;
  editing = false;
  modal = document.createElement('dialog');
  modal.className = 'announcement-dialog';
  modal.setAttribute('aria-labelledby', 'announcement-dialog-title');
  document.body.append(modal);
  modal.addEventListener('close', () => {
    dismissedThrough = Math.max(dismissedThrough, latest()?.id ?? 0);
    modal.remove(); modal = null; editing = false;
  });
  modal.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (event.target === modal || button?.hasAttribute('data-ann-close') || button?.hasAttribute('data-ann-later')) close();
    else if (button?.hasAttribute('data-ann-read')) close(true);
    else if (button?.hasAttribute('data-ann-add') && isSenior()) { editing = true; render(); }
    else if (button?.hasAttribute('data-ann-cancel')) { editing = false; render(); }
    else if (button?.hasAttribute('data-ann-select')) { selectedId = Number(button.dataset.annSelect); render(); }
  });
  modal.addEventListener('input', event => {
    if (editing && event.target.matches('[name="body"]')) {
      modal.querySelector('[data-ann-preview]').innerHTML = renderAnnouncementMarkdown(event.target.value);
    }
  });
  modal.addEventListener('submit', async event => {
    if (!event.target.matches('[data-ann-form]')) return;
    event.preventDefault();
    if (!isSenior()) return;
    const form = event.target, button = form.querySelector('[type="submit"]'), error = form.querySelector('[data-ann-error]');
    button.disabled = true;
    error.hidden = true;
    try {
      const { entry } = await api('admin/announcements', { method: 'POST', body: {
        title: form.elements.title.value, body: form.elements.body.value } });
      entries = [entry, ...entries.filter(item => item.id !== entry.id)];
      selectedId = entry.id;
      editing = false;
      notify();
      render();
      toast(tr('公告已发布', 'Announcement published'));
    } catch (failure) {
      error.textContent = failure.message ?? tr('发布失败，请稍后再试', 'Publishing failed. Please try again.');
      error.hidden = false;
      button.disabled = false;
    }
  });
  render();
  modal.showModal();
  if (!entries.length) void refresh();
}

function maybeOpen() {
  const entry = latest();
  if (!entry || modal || entry.id <= Math.max(readThrough(), dismissedThrough)) return;
  openAnnouncements(entry.id);
}

function connectStream() {
  if (stream || !started) return;
  stream = new EventSource(apiUrl('announcements/events'), { withCredentials: true });
  stream.addEventListener('announcement', async event => {
    const id = Number(JSON.parse(event.data).id) || 0;
    if (id <= (latest()?.id ?? 0)) return;
    await refresh();
    if (id > (latest()?.id ?? 0)) await refresh();
  });
}

async function refresh() {
  if (pending) return pending;
  pending = api('announcements').then(({ entries: next }) => {
    if (!Array.isArray(next)) throw new Error('公告列表格式无效');
    const previous = latest()?.id ?? 0;
    const changed = next.length !== entries.length || next.some((entry, index) => entry.id !== entries[index]?.id);
    entries = next;
    connectStream();
    if (modal && !editing && changed) {
      if ((latest()?.id ?? 0) > previous) selectedId = latest().id;
      render();
    }
    if (changed) notify();
    maybeOpen();
  }).catch(error => {
    if (error.status !== 404) console.warn('公告加载失败', error);
  }).finally(() => { pending = null; });
  return pending;
}

export async function startAnnouncements() {
  if (started) return;
  started = true;
  document.addEventListener('click', event => {
    if (event.target.closest('[data-open-announcements]')) openAnnouncements();
  });
  onPlatformChange(() => {
    if (modal && shownAdmin !== isSenior()) { editing = false; render(); }
  });
  window.addEventListener('localechange', () => { if (modal && !editing) render(); });
  window.addEventListener('storage', event => { if (event.key === READ_KEY) dismissedThrough = Math.max(dismissedThrough, readThrough()); });
  await refresh();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  setInterval(() => { if (!document.hidden) void refresh(); }, 60000);
}
