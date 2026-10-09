// 亿模亿样 — single-page gallery and platform. Routes are hash based, so the archive works
// on any static host; the platform routes need the server (npm start).
//   #/                        home: latest questions and answers
//   #/questions               library: every task and every model
//   #/<task>                  task: results, screenshots, prompt, leaderboard
//   #/<task>/<result>         viewer: the live page in a frame with a guide drawer
//   #/<task>/<a>/vs/<b>       viewer, two results side by side
//   #/arena[/<task>]          blind comparison            (platform)
//   #/leaderboard[/<task>]    leaderboard                 (platform)
//   #/new                    publish a question          (platform)
//   #/submit/<task>           upload to this task         (platform)
//   #/me · #/review           personal center · review queue (platform)
//   #/terms · #/privacy       terms of use and disclaimer · privacy policy
import { $, $$, LOGO, brandMark, byName, esc, ext, formatBytes, formatDate, icon, img, pad, store, syncThemeUi, themeButton, versionedMedia } from './ui.js';
import { STATUS, accountControl, api, arenaScope, arenaText, avatarFace, byStaff, connectPlatform, isStaff, onPlatformChange, platform, reactionBar, refreshAccountControls, refreshPlatform, requestBootstrap, setFaces, startPlatformRecovery, statusBadge, toast } from './platform.js';
import { mount as renderLanding } from './home.js';
import { CONTACT, aigcLabel, beianLink, mount as renderLegal } from './legal.js';
import { effortRank, representatives, standard, taskCover } from './featured.js';
import { groupVariantResults, variantChoices, variantKey, variantsOf } from './prompt-variants.js';
import { downloadReference, linkReferences, referenceSheet, useReferenceViewer } from './references.js';
import { aiJudged, aiScoreOf, categoryLabel, categoryOf, domainList, domainsIn, domainsOf, searchMatch, tracksOf } from './categories.js';
import { textMatches } from './match.js';
import { modelResolver } from './models.js';
import { createWorkControls, workFrameUrl } from './work-controls.js';
import { hasModelPreview, screenshotOf } from './work-preview-media.js';

const root = $('#app');
let DATA;
let MODELS;
let HARNESSES;
let PROVIDERS;
let resolveModel;
let initialPlatformSettled = false;

// Uploads may name a model that is not in the registry; they carry their own name and vendor.
const modelOf = (r) => resolveModel({ model: r.model, modelName: r.modelName ?? r.model, vendor: r.vendorName ?? r.vendor });
const vendorOf = (r) => modelOf(r).vendor || '其他';
const harnessOf = (r) => (r.harness && HARNESSES.get(r.harness)) || (r.harnessName || r.harness ? { name: r.harnessName ?? r.harness } : null);
// Provider is only official or not: anything named other than 'official' counts as unofficial.
const providerOf = (r) => (r.provider || r.providerName ? PROVIDERS.get(r.provider === 'official' ? 'official' : 'unofficial') : null);
const providerKey = (r) => providerOf(r)?.id ?? 'unset';
const sourceLine = (r) => {
  const harness = harnessOf(r);
  return [harness?.name, providerOf(r)?.name].filter(Boolean).join(' · ');
};
const sourceKey = (r, field, nameField) => r[field] ? `id:${r[field]}` : r[nameField] ? `name:${r[nameField]}` : 'unset';
const label = (r) => (r.effort ? `${modelOf(r).name} · ${r.effort}` : modelOf(r).name);
// Works outside the blind test (multi-turn or with human help) say so on their card.
const INTERVENTION_TEXT = { 'prompt-guided': '人工提示与指导', 'code-edited': '人工修改了代码' };
const generationBadges = (r) => standard(r) ? '' : `${r.generationMode === 'multi-turn' ? '<span class="badge" title="多轮生成 · 只展示，不参与盲评">多轮</span>' : ''}${INTERVENTION_TEXT[r.humanIntervention] ? `<span class="badge" title="${INTERVENTION_TEXT[r.humanIntervention]} · 只展示，不参与盲评">人工介入</span>` : ''}`;
// AI-graded questions show their grade where blind questions rely on the leaderboard.
const aiScoreBadge = (r) => {
  const grade = aiScoreOf(r);
  return grade ? `<span class="badge" title="${esc(grade.judge ? `评分模型：${grade.judge}` : 'AI 评分')}">AI 评分 ${grade.score} / ${grade.max}</span>`
    : '<span class="badge" title="推理题由 AI 评分，评分开放前不显示">AI 评分待开放</span>';
};
const resultBadges = (r) => `${r.effort ? `<span class="badge">${esc(r.effort)}</span>` : ''}${r.sourceLabel ? `<span class="badge source-badge">${esc(r.sourceLabel)}</span>` : ''}${generationBadges(r)}`;
// Leaderboard entry of a work (model + effort), the same key the server ranks by.
const normal = (s) => String(s ?? '').normalize('NFKC').trim().toLowerCase();
const modelKey = (r) => (MODELS.has(r.model) ? r.model : `x:${normal(r.modelName ?? r.model)}`);
const entryKey = (r) => `${modelKey(r)}|${normal(r.effort)}`;
// A work's registered model, including uploads that named one before it was registered.
const registeredOf = (r) => modelOf(r).id;
const modelCount = (results) => new Set(results.map((r) => registeredOf(r) ?? modelKey(r))).size;
// The index and its counts show only registered models with a verified work.
function exhibitedModels() {
  const ids = new Set(DATA.tasks.flatMap((t) => t.results.filter((r) => r.status === 'verified').map(registeredOf)));
  return DATA.models.filter((m) => ids.has(m.id));
}
const sortModes = { added: '加入时间（最新在前）', vendor: '模型厂商（A–Z）', name: '模型名字（A–Z）', score: '榜单评分（高到低）' };
const sortChoices = () => Object.entries(sortModes).filter(([value]) => value !== 'score' || platform.available);
let resultSort = Object.hasOwn(sortModes, store.get('result-sort')) ? store.get('result-sort') : 'added';
let previewMode = store.get('preview-mode') === 'screenshot' ? 'screenshot' : 'model';
document.body.dataset.previewMode = previewMode;
const sortControl = () => `<label class="result-sort">排序<select data-result-sort>${sortChoices().map(([value, text]) => `<option value="${value}"${value === resultSort ? ' selected' : ''}>${text}</option>`).join('')}</select></label>`;
// Verified works come first, questioned ones last; the chosen order applies within each group.
const STATUS_ORDER = { verified: 0, unverified: 1, questioned: 2 };
let taskScores = new Map();
function sortedResults(t) {
  return [...t.results].sort((a, b) => {
    const group = (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0);
    if (group) return group;
    if (resultSort === 'vendor') return byName(vendorOf(a), vendorOf(b)) || byName(label(a), label(b));
    if (resultSort === 'name') return byName(label(a), label(b));
    if (resultSort === 'score') return (taskScores.get(entryKey(b)) ?? -Infinity) - (taskScores.get(entryKey(a)) ?? -Infinity) || byName(label(a), label(b));
    return (Date.parse(b.addedAt) || 0) - (Date.parse(a.addedAt) || 0);
  });
}
function setResultSort(value) {
  resultSort = value;
  store.set('result-sort', value);
}
// Cover: the first uniform capture (task condition order), else the author's first screenshot.
const cover = screenshotOf;
// Works without a screenshot yet show their title instead of an empty frame.
function coverHtml(r, cls = '', eager = false) {
  const src = cover(r);
  if (src) return img(src, r.title, cls, eager);
  return `<div class="${cls} img-empty upload-cover"><b>${esc(r.title)}</b><span>${platform.site?.capture ? '截图生成中' : '暂无截图'}</span></div>`;
}
const taskHref = (t) => `#/${t.id}`;
const viewHref = (t, a, b) => `#/${t.id}/${a}${b ? `/vs/${b}` : ''}`;
const hasExhibition = (t) => t.sandtable;
const sandtableHref = (t, ids = []) => `#/${t.id}/sandtable${ids.length ? `/${ids.join(',')}` : ''}`;
// Works this site serves itself can be framed same-origin: the sandtable, the exhibition, card
// models and injected controls need that. Works on the content origin stay sandboxed.
const hosted = (r) => Boolean(r.scene) && new URL(r.scene, document.baseURI).origin === location.origin;
const hostedTask = (t) => ({ ...t, results: t.results.filter(hosted) });
// Staff publish under the site's name; members under their own.
const authorName = (item) => (byStaff(item) ? DATA.title : item.author.name ?? '已注销的用户');
const authorAvatar = (item) => (byStaff(item) ? LOGO : avatarFace(item.author.avatar, item.author.name ?? ''));
const workKey = (t, r) => `${t.id}/${r.id}`;
const interactive = (r) => r.status !== 'questioned';
// Whether a work has a gallery page: the public catalog holds exactly the works the gallery shows,
// so an unverified, held or taken-down upload links to its own preview instead.
const inGallery = (taskId, id) => DATA.tasks.some((t) => t.id === taskId && t.results.some((r) => r.id === id));

// Images fade in once decoded; `load` does not bubble, so listen in the capture phase.
document.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('is-loaded'); }, true);
document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('is-loaded', 'is-broken'); }, true);
document.addEventListener('click', (e) => { if (e.target.closest('[data-reload]')) location.reload(); });
const RELOAD = '<button type="button" class="btn primary" data-reload>刷新页面</button>';

// A tab left open across a release keeps its old import map, so a page it loads later can get new
// modules that link against old ones. The build writes this tab's ?v= to version.json; when they
// differ, only a full reload helps, and it keeps the address.
const loadedVersion = new URL(import.meta.url).searchParams.get('v');
async function loadFailure(error, title) {
  if (loadedVersion) {
    try {
      const res = await fetch('version.json', { cache: 'no-store' });
      const { assets } = res.ok ? await res.json() : {};
      if (assets && assets !== loadedVersion) return { updated: true, title: '页面已更新', text: '网站已发布新版本，这个标签页仍是旧版。刷新后会回到当前页面。' };
    } catch { /* fall through to the original error */ }
  }
  return { updated: false, title, text: error?.message ?? String(error) };
}
const settleImages = () => $$('img', root).forEach((im) => { if (im.complete) im.classList.add('is-loaded'); });

// ---- shell ----------------------------------------------------------------------------
const previewControl = () => `<div class="preview-setting" role="group" aria-label="作品卡片预览">
  <button data-preview-mode="screenshot" aria-pressed="${previewMode === 'screenshot'}" title="截图预览 · 减少设备负担">截图</button>
  <button data-preview-mode="model" aria-pressed="${previewMode === 'model'}" title="小模型预览 · 可随鼠标转动">小模型</button>
</div>`;
const SITE_NAV = [['questions', '题库'], ['arena', '盲评'], ['leaderboard', '排行榜'], ['new', '发起题目']];
// Breadcrumbs follow the real hierarchy: each section is its own root. The crumb one level up is
// the way back, so it returns to that page as the reader left it.
const LIBRARY = { text: '题库', href: '#/questions' };
function breadcrumbTrail(crumbs = []) {
  const items = crumbs.length ? crumbs : [{ text: DATA.subtitle }];
  return items.map((c, i) => `${i ? '<span class="sep" aria-hidden="true">/</span>' : ''}${c.href
    ? `<a href="${esc(back?.up === c.href ? back.href : c.href)}" title="${esc(c.text)}"${back?.up === c.href ? ' data-back' : ''}${c.href === LIBRARY.href ? ' data-home-view="tasks"' : ''}>${esc(c.text)}</a>`
    : `<span aria-current="page" title="${esc(c.text)}">${esc(c.text)}</span>`}`).join('');
}
// Shown under the top bar while the platform and the archive disagree on the data version.
const platformNotice = () => `<div class="platform-notice" role="status"><div class="wrap platform-notice-in">
  <span class="platform-notice-mark" aria-hidden="true"></span>
  <p><strong>有新内容，请刷新</strong><span>刷新后可查看最新作品；上传和盲评可继续使用。</span></p>
  <button type="button" class="link" data-reload>刷新页面</button>
</div></div>`;
function header(crumbs = [], showPreviewSetting = false, current = '', { notice = true } = {}) {
  const nav = platform.available
    ? `<nav class="site-nav" aria-label="平台">${SITE_NAV.map(([id, text]) => `<a class="topbar-link" href="#/${id}"${id === current ? ' aria-current="page"' : ''}>${text}</a>`).join('')}</nav>`
    : '';
  return `<header class="topbar"><div class="wrap topbar-in">
    <a class="brand" href="#/" aria-label="${esc(DATA.title)} · 首页">${LOGO}<span class="wordmark">${esc(DATA.title)}</span></a>
    ${backLink('top-back')}
    <nav class="crumbs" aria-label="面包屑">${breadcrumbTrail(crumbs)}</nav>
    <div class="topbar-tools${showPreviewSetting ? ' has-preview-setting' : ''}${platform.available ? ' has-platform' : ''}">
      ${nav}
      ${platform.available ? '' : ext(DATA.repo, 'GitHub', 'topbar-link topbar-github')}
      ${themeButton()}
      ${accountControl(current === 'me')}
    </div>
  </div></header>${platform.stale && notice ? platformNotice() : ''}`;
}
// The two 3D views sit under their task; the mode switch names the current one.
function galleryStageHeader(t, mode) {
  const modes = [['exhibition', '原作展厅'], ['sandtable', '三维沙盘']];
  return `<header class="topbar sandbar"><div class="wrap topbar-in sandbar-in">
    <a class="brand" href="#/" aria-label="${esc(DATA.title)} · 首页">${LOGO}<span class="wordmark">${esc(DATA.title)}</span></a>
    ${backLink('top-back')}
    <nav class="crumbs sand-crumbs" aria-label="面包屑">${breadcrumbTrail([LIBRARY, { text: t.title, href: taskHref(t) }])}</nav>
    <nav class="display-modes" aria-label="展示模式">${modes.map(([id, name]) => `<a ${id === mode ? 'aria-current="page"' : 'data-switch-mode'} href="#/${t.id}/${id}">${name}</a>`).join('')}</nav>
    <div class="sandbar-tools"><span class="sand-count">已选择 <b data-count>0</b> 件</span><button class="btn sm" data-action="panel" aria-expanded="true" aria-controls="${mode === 'sandtable' ? 'sand-library' : 'exhibition-library'}">选择模型</button>${themeButton()}</div>
  </div></header>`;
}
const footer = () => `<footer class="footer"><div class="wrap footer-in">
  <p class="footer-brand">${LOGO}<span>${esc(DATA.title)}</span><span class="muted">前端作品档案</span></p>
  <div class="footer-links">${platform.available ? '<a href="#/new">发起题目</a><a href="#/leaderboard">榜单</a>' : ''}<a href="${esc(DATA.repo)}" target="_blank" rel="noopener">项目仓库</a><a href="${esc(DATA.repo)}#readme" target="_blank" rel="noopener">参与贡献</a><a href="#/terms">使用条款</a><a href="#/privacy">隐私政策</a><a href="mailto:${CONTACT}">联系我们</a></div>
  <p class="footer-legal">© ${new Date().getFullYear()} ${esc(DATA.title)} · 站内作品由 AI 模型生成，仅供比较与学习参考 · 引用或转载请<a href="#/terms#cite">注明来源</a> · <a href="mailto:${CONTACT}">${CONTACT}</a>${beianLink() ? ` · ${beianLink()}` : ''}</p>
</div></footer>`;

// A shared two-column shell keeps every platform page in the same exhibition. The top bar is the
// site navigation and carries the way back; the sidebar only holds this section's own views.
function pageStart({ title, description, section, meta = '', nav = '', heading = title, caption = '', crumbs = [{ text: title }] }) {
  return `${header(crumbs, false, section)}<div class="app-layout platform-layout">
    <aside class="app-sidebar">
      <h1>${esc(title)}</h1><p class="side-intro">${esc(description)}</p>${meta}${nav}
      <div class="side-bottom"><p>同一份提示词，<br>看见不同的答案。</p></div>
    </aside><main class="workspace page"><div class="collection-heading"><h2>${esc(heading)}</h2>${caption || '<span class="collection-caption">亿模亿样 · 模型作品对比</span>'}</div>`;
}
// Views of the current section in a platform sidebar: [href, glyph, text, current, count].
const sideNav = (label, links) => `<nav class="side-nav section-nav" aria-label="${esc(label)}">${links.map(([href, glyph, text, current, count]) => `<a class="side-link" href="${esc(href)}"${current ? ' aria-current="page"' : ''}>${icon(glyph)}${esc(text)}${count === undefined ? '' : `<span class="nav-count">${count}</span>`}</a>`).join('')}</nav>`;
const pageEnd = () => `${footer()}</main></div>`;
const searchControl = (type, placeholder, value = '') => `<label class="collection-search">${icon('search')}<input type="search" data-${type}-search aria-label="${placeholder}" placeholder="${placeholder}" value="${esc(value)}"></label>`;
const questionSorts = { date: '发布时间（最新在前）', works: '解答数量（多到少）', title: '题目名称（A–Z）' };
const homeState = { category: '', domain: '', model: '', query: '', view: 'tasks', sort: Object.hasOwn(questionSorts, store.get('question-sort')) ? store.get('question-sort') : 'works', modelQuery: '', vendor: '' };

// ---- home -----------------------------------------------------------------------------
// Questioned works stay visible as reference but are left out of every count.
const counted = (t) => t.results.filter(interactive);

function libraryStart(crumbs) {
  const works = DATA.tasks.reduce((sum, t) => sum + counted(t).length, 0);
  const models = exhibitedModels();
  const vendorCount = new Set(models.map((m) => m.vendor || '其他')).size;
  const control = (cls, attrs, pressed, body) => `<button class="${cls}" ${attrs} aria-pressed="${pressed}">${body}</button>`;
  const domains = domainsIn(DATA.tasks, domainList(platform));
  return `${header(crumbs, false, 'questions')}<div class="app-layout home-layout">
    <aside class="app-sidebar">
      <h1>题库</h1><p class="side-intro">${DATA.tasks.length} 道题目 · ${works} 件作品</p>
      <nav class="side-nav section-nav" aria-label="题库导航">
        ${control('side-link', 'data-home-view="tasks"', true, `${icon('grid')}全部题目<span class="nav-count">${DATA.tasks.length}</span>`)}
        ${tracksOf(DATA.tasks).map((x) => control('side-link', `data-home-category="${esc(x.name)}"`, false, `${icon(x.glyph)}${esc(x.label)}<span class="nav-count">${x.tasks.length}</span>`)).join('')}
        <span class="side-divider" aria-hidden="true"></span>
        ${control('side-link', 'data-home-view="models"', false, `${icon('code')}模型索引<span class="nav-count">${models.length}</span>`)}
      </nav>
      ${domains.length ? `<section class="side-section" aria-label="按领域筛选"><h2>领域</h2><div class="chips">${domains.map((d) => control('chip', `data-home-domain="${esc(d.name)}"`, false, `${esc(d.name)}<span class="nav-count">${d.tasks.length}</span>`)).join('')}</div></section>` : ''}
      <div class="side-bottom"><p>${vendorCount} 家厂商 · ${models.length} 个模型<br>同一份提示词，不同的表达。</p></div>
    </aside>
    <main class="workspace page">`;
}

// Taking part sits beside the works: blind review in vermilion, uploading in ink. Library and task page share it.
const AB = '<span class="task-act-ab">A<i>B</i></span>';
const act = (kind, href, glyph, title, note, hint = '') => (href
  ? `<a class="task-act is-${kind}" href="${href}"><span class="task-act-mark" aria-hidden="true">${glyph}</span><span><b>${title}</b><small>${note}</small></span></a>`
  : `<span class="task-act is-off" aria-disabled="true"${hint ? ` title="${hint}"` : ''}><span class="task-act-mark" aria-hidden="true">${glyph}</span><span><b>${title}</b><small>${note}</small></span></span>`);

// Filter selects share the task page's toolbar: the option text carries the label and count.
const selectControl = (name, aria, options) => `<label class="result-sort">${aria}<select data-${name} aria-label="${aria}">${options}</select></label>`;
const option = (value, text, selected) => `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(text)}</option>`;
const answeredBy = (t, id) => counted(t).some((r) => registeredOf(r) === id);
// A card names its form, then its domains.
const tagLine = (t) => `${t.category ? `<li class="tag-kind">${esc(categoryLabel(t.category))}</li>` : ''}${domainsOf(t).map((d) => `<li class="tag-domain">${esc(d)}</li>`).join('')}`;
function sortedTasks() {
  const order = new Map(DATA.tasks.map((t, i) => [t.id, i]));
  return [...DATA.tasks].sort((a, b) => {
    if (homeState.sort === 'works') return counted(b).length - counted(a).length || order.get(b.id) - order.get(a.id);
    if (homeState.sort === 'title') return byName(a.title, b.title);
    return (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0) || order.get(b.id) - order.get(a.id);
  });
}

// Form and domain ride in the address (#/questions/<category>/<domain>, either may be left out),
// as does the model index (#/questions/models), so a return or a shared link keeps them. Search
// and the selects only survive a return; a fresh visit opens the whole library.
function renderLibrary(scopes = [], fresh = true) {
  if (fresh) Object.assign(homeState, { model: '', query: '', modelQuery: '', vendor: '' });
  homeState.view = scopes[0] === 'models' ? 'models' : 'tasks';
  homeState.category = scopes.find((x) => DATA.tasks.some((t) => t.category === x)) ?? '';
  homeState.domain = scopes.find((x) => DATA.tasks.some((t) => domainsOf(t).includes(x))) ?? '';
  const controller = new AbortController();
  let previews = null, destroyed = false, activePreviewKey = null;
  const choices = DATA.tasks.map((task) => ({ task, result: taskCover(task, platform.featured?.[task.id]?.cover) }));
  const artworkFor = (t, shown, eager = false) => shown?.previewMode === 'screenshot'
    ? img(screenshotOf(shown), shown.title, 'question-screenshot-preview', eager)
    : shown?.previewModel || shown?.previewLoader
      ? (shown.previewPoster ? img(shown.previewPoster, '', 'question-model-poster', eager) : coverHtml(shown))
      : shown ? coverHtml(shown, '', eager) : `<span class="question-placeholder">${icon('text')}<span>${counted(t).length ? '暂无预览图' : '等待第一份答案'}</span></span>`;
  const results = DATA.tasks.flatMap((t) => counted(t).map((r) => ({ t, r })));

  const taskCards = sortedTasks().map((t, ti) => {
    const works = counted(t);
    const shown = choices.find(({ task }) => task === t).result;
    const artwork = artworkFor(t, shown, ti < 3);
    return `<article class="task-card" data-task-card="${esc(t.id)}">
      <a class="question-visual${shown?.previewMode === 'screenshot' ? ' screenshot-thumb' : shown?.previewModel || shown?.previewLoader ? ' model-thumb' : ''}" href="${taskHref(t)}" aria-label="查看「${esc(t.title)}」的全部作品" tabindex="-1"${shown ? ` data-preview-id="${esc(shown.id)}"` : ''}>
        ${artwork}
      </a>
      <div class="task-body">
        <div class="question-byline"><ul class="tag-line">${tagLine(t)}</ul>
          <span class="avatar question-avatar${byStaff(t) ? ' is-site' : ''}" role="img" aria-label="发布者：${esc(authorName(t))}" title="发布者：${esc(authorName(t))}">${authorAvatar(t)}</span>
        </div>
        <h3><a href="${taskHref(t)}">${esc(t.title)}</a></h3>
        <p class="summary">${esc(t.summary)}</p>
        <p class="prompt-hit" data-prompt-hit hidden></p>
        <div class="question-meta">
          <span class="question-date">${esc(t.date ?? '')}</span>
          ${t.references?.length ? `<span class="question-refs" title="附 ${t.references.length} 张参考图，作答需要识图">${icon('image')}参考图 ${t.references.length}</span>` : ''}
          <a href="${taskHref(t)}">${modelCount(works)} 个模型 · ${works.length} 件作品${icon('next')}</a>
        </div>
      </div>
    </article>`;
  }).join('');
  // Publishing sits in the grid itself, as the first card, so it reads as part of the library.
  const newCard = platform.available ? `<a class="task-card task-new" href="#/new" data-task-new>
      <span class="question-visual task-new-visual" aria-hidden="true"><span class="task-new-stack"><i></i><i></i><i></i></span><span class="task-new-plus">${icon('plus')}</span></span>
      <span class="task-body">
        <span class="task-new-kicker">发起题目</span>
        <h3>下一道题，由你来出</h3>
        <p class="summary">写下一份提示词，邀请各家模型作答，收录后在这里并排对照。</p>
        <span class="question-meta"><span>一份提示词 · 许多答案</span><span class="task-new-go">开始发起${icon('next')}</span></span>
      </span>
    </a>` : '';

  const modelsByVendor = new Map();
  const exhibited = exhibitedModels();
  for (const model of exhibited) {
    const vendor = model.vendor || '其他';
    if (!modelsByVendor.has(vendor)) modelsByVendor.set(vendor, []);
    modelsByVendor.get(vendor).push(model);
  }
  // The index lists verified works.
  const catalogued = results.filter(({ r }) => r.status === 'verified');
  const vendors = [...modelsByVendor.keys()].sort(byName);
  if (!vendors.includes(homeState.vendor)) homeState.vendor = '';
  // Only models with an answer can narrow the question list.
  const answering = vendors.map((vendor) => [vendor, modelsByVendor.get(vendor).filter((m) => DATA.tasks.some((t) => answeredBy(t, m.id)))]).filter(([, models]) => models.length);
  if (!answering.some(([, models]) => models.some((m) => m.id === homeState.model))) homeState.model = '';
  // Search leads every list's toolbar; the heading keeps the page's own actions or a quiet note.
  const taskToolbar = `<div class="collection-toolbar">${searchControl('home', '搜索题目或提示词', homeState.query)}<div class="toolbar-actions">
    ${selectControl('home-model', '按作答模型筛选', option('', '全部作答模型', !homeState.model) + answering.map(([vendor, models]) => `<optgroup label="${esc(vendor)}">${models.map((m) => option(m.id, `${m.name}（${DATA.tasks.filter((t) => answeredBy(t, m.id)).length} 题）`, m.id === homeState.model)).join('')}</optgroup>`).join(''))}
    ${selectControl('home-sort', '题目排序', Object.entries(questionSorts).map(([value, text]) => option(value, text, value === homeState.sort)).join(''))}
  </div></div>`;
  const modelToolbar = `<div class="collection-toolbar">${searchControl('model', '搜索模型或厂商', homeState.modelQuery)}<div class="toolbar-actions">
    ${selectControl('model-vendor', '按厂商筛选', option('', `全部厂商（${vendors.length}）`, !homeState.vendor) + vendors.map((v) => option(v, `${v}（${modelsByVendor.get(v).length}）`, v === homeState.vendor)).join(''))}
  </div></div>`;
  const rows = vendors.map((vendor) => [vendor, modelsByVendor.get(vendor)]).map(([vendor, models]) => {
    const ids = new Set(models.map((m) => m.id));
    const works = catalogued.filter(({ r }) => ids.has(registeredOf(r))).length;
    const items = models.map((m) => {
      const mine = catalogued.filter(({ r }) => registeredOf(r) === m.id);
      const mark = m.logo
        ? `<a class="brand-mark" href="${esc(m.brandUrl)}" target="_blank" rel="noopener" aria-label="${esc(m.brandName)} 官网" title="${esc(m.brandName)} 官网"><img src="${esc(versionedMedia(m.logo))}" alt="" loading="lazy" decoding="async"></a>`
        : brandMark(m);
      return `<li class="dir-model" data-dir-model="${esc([m.name, ...(m.aliases ?? []), m.vendorNote ?? '', vendor].join(' '))}">${mark}
        <div class="dir-model-body">
          <h4>${esc(m.name)}${m.vendorNote ? `<span class="note">${esc(m.vendorNote)}</span>` : ''}</h4>
          ${mine.length ? `<ul class="dir-works">${mine.map(({ t, r }) => `<li><a href="${viewHref(t, r.id)}" title="${esc(t.title)}">${esc(r.title)}${resultBadges(r)}</a></li>`).join('')}</ul>` : '<p class="muted">暂无作品</p>'}
        </div>
      </li>`;
    }).join('');
    return `<section class="dir-row" data-dir-vendor="${esc(vendor)}">
      <header class="dir-vendor"><h3>${esc(vendor)}</h3><p>${models.length} 个模型 · ${works} 件作品</p></header>
      <ul class="dir-models">${items}</ul>
    </section>`;
  }).join('');

  root.innerHTML = `${libraryStart([{ text: '题库' }])}
      <section data-home-panel="tasks">
        <div class="collection-heading"><div class="collection-title"><h2 id="h-tasks">全部题目</h2><span data-home-count title="解答数不计存疑作品">${DATA.tasks.length} 道题目</span></div>${platform.available ? '<div class="task-acts" data-home-blind></div>' : ''}</div>
        ${taskToolbar}
        <div class="task-list">${newCard}${taskCards || (newCard ? '' : '<p class="muted">还没有题目。</p>')}</div>
        <div class="board-empty" data-home-empty hidden><h3>没有找到这道题</h3><p>${platform.available ? '换个关键词或筛选条件，或者把它发起成一道新题。' : '换个关键词或筛选条件，或浏览全部题目。'}</p><div class="board-empty-actions"><button class="btn" data-home-reset>清除筛选</button>${platform.available ? `<a class="btn primary" href="#/new">${icon('plus')}发起题目</a>` : ''}</div></div>
      </section>
      <section data-home-panel="models" hidden><div class="collection-heading"><div class="collection-title"><h2 id="h-models">模型索引</h2><span data-model-count>${modelsByVendor.size} 家厂商 · ${exhibited.length} 个模型</span></div><span class="collection-caption">点击作品直接进入在线预览</span></div>
        ${modelToolbar}<div class="dir-rows">${rows}</div>
        <div class="board-empty" data-model-empty hidden><h3>没有找到这个模型</h3><p>换个关键词，或查看全部厂商。</p><div class="board-empty-actions"><button class="btn" data-model-reset>清除筛选</button></div></div></section>
      ${footer()}
    </main></div>`;
  // While searching, questions matched by their own words come first and those matched only inside
  // a prompt follow, each showing the stretch of prompt that matched; the chosen sort holds within each.
  let blindScope = [];
  const filter = () => {
    let count = 0;
    const promptOnly = new Set();
    blindScope = [];
    for (const card of $$('[data-task-card]', root)) {
      const task = DATA.tasks.find((t) => t.id === card.dataset.taskCard);
      const match = searchMatch(task, homeState.query);
      card.hidden = Boolean(!match || (homeState.category && task.category !== homeState.category) || (homeState.domain && !domainsOf(task).includes(homeState.domain)) || (homeState.model && !answeredBy(task, homeState.model)));
      const hit = $('[data-prompt-hit]', card);
      hit.hidden = !match?.snippet;
      if (match?.snippet) {
        const { before, hit: word, after } = match.snippet;
        hit.innerHTML = `<span>提示词</span>${esc(before)}<mark>${esc(word)}</mark>${esc(after)}`;
        promptOnly.add(task.id);
      }
      if (!card.hidden) {
        count++;
        if ((platform.arena[task.id]?.entries ?? 0) >= 2) blindScope.push(task);
      }
    }
    // Random pairs come from the questions in view, as far as they can be judged.
    const blind = $('[data-home-blind]', root);
    if (blind) {
      blind.innerHTML = blindScope.length
        ? act('judge', `#/arena/random`, AB, '参与盲评', `可盲评 ${blindScope.reduce((sum, t) => sum + platform.arena[t.id].works, 0)} 件`)
        : act('judge', '', AB, '参与盲评', '暂无可评的题', '当前范围内没有两个模型配置以上的盲评池');
    }
    const order = sortedTasks().sort((a, b) => promptOnly.has(a.id) - promptOnly.has(b.id));
    const list = $('.task-list', root), cards = $$('[data-task-card]', list);
    if (order.some((t, i) => cards[i].dataset.taskCard !== t.id)) list.append(...order.map((t) => cards.find((card) => card.dataset.taskCard === t.id)));
    $('#h-tasks').textContent = [homeState.category && categoryLabel(homeState.category), homeState.domain, MODELS.get(homeState.model)?.name].filter(Boolean).join(' · ') || '全部题目';
    $('[data-home-count]').textContent = `${count} 道题目`;
    $('[data-home-empty]').hidden = count > 0;
    $('[data-task-new]')?.toggleAttribute('hidden', count === 0);
    $('[data-home-model]').value = homeState.model;
    // Model index: the keyword matches a model or its vendor; the vendor select keeps one row.
    const needle = homeState.modelQuery;
    let models = 0, vendorsShown = 0;
    for (const row of $$('[data-dir-vendor]', root)) {
      const vendorMatch = textMatches(needle, row.dataset.dirVendor);
      let shown = 0;
      for (const item of $$('[data-dir-model]', row)) {
        item.hidden = !vendorMatch && !textMatches(needle, item.dataset.dirModel);
        if (!item.hidden) shown++;
      }
      row.hidden = !shown || Boolean(homeState.vendor && row.dataset.dirVendor !== homeState.vendor);
      if (!row.hidden) { models += shown; vendorsShown++; }
    }
    $('#h-models').textContent = homeState.vendor || '模型索引';
    $('[data-model-count]').textContent = `${vendorsShown} 家厂商 · ${models} 个模型`;
    $('[data-model-empty]').hidden = models > 0;
    $('[data-model-vendor]').value = homeState.vendor;
    $$('[data-home-panel]').forEach((el) => { el.hidden = el.dataset.homePanel !== homeState.view; });
    $$('.side-nav [data-home-view]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.homeView === homeState.view && !(el.dataset.homeView === 'tasks' && (homeState.category || homeState.domain)))));
    $$('[data-home-category]').forEach((el) => el.setAttribute('aria-pressed', String(homeState.view === 'tasks' && el.dataset.homeCategory === homeState.category)));
    $$('[data-home-domain]').forEach((el) => el.setAttribute('aria-pressed', String(homeState.view === 'tasks' && el.dataset.homeDomain === homeState.domain)));
    const scopes = homeState.view === 'tasks' ? [homeState.category, homeState.domain].filter(Boolean) : [];
    const scope = homeState.view === 'models' ? '模型索引' : scopes.map((x) => (categoryOf(x) ? categoryLabel(x) : x)).join(' · ');
    $('.topbar .crumbs').innerHTML = breadcrumbTrail(scope ? [LIBRARY, { text: scope }] : [{ text: '题库' }]);
    const address = [LIBRARY.href, ...(homeState.view === 'models' ? ['models'] : scopes.map(encodeURIComponent))].join('/');
    if (location.hash !== address) history.replaceState(history.state, '', address);
    previews?.setPaused(homeState.view !== 'tasks');
  };
  root.oninput = (event) => {
    if (event.target.matches('[data-home-search]')) homeState.query = event.target.value;
    else if (event.target.matches('[data-model-search]')) homeState.modelQuery = event.target.value;
    else return;
    filter();
  };
  root.onchange = (event) => {
    const el = event.target;
    if (el.matches('[data-home-model]')) homeState.model = el.value;
    else if (el.matches('[data-model-vendor]')) homeState.vendor = el.value;
    else if (el.matches('[data-home-sort]')) {
      homeState.sort = el.value;
      store.set('question-sort', el.value);
    } else return;
    filter();
  };
  root.onclick = (event) => {
    if (event.target.closest('[data-home-blind] a')) arenaScope.set(blindScope.map((t) => t.id));
    // Form and domain combine; pressing the current domain again lifts it.
    const category = event.target.closest('[data-home-category]'), domain = event.target.closest('[data-home-domain]'), view = event.target.closest('[data-home-view]');
    if (category) { homeState.category = category.dataset.homeCategory; homeState.view = 'tasks'; }
    if (domain) { homeState.domain = homeState.view === 'tasks' && homeState.domain === domain.dataset.homeDomain ? '' : domain.dataset.homeDomain; homeState.view = 'tasks'; }
    if (view) { homeState.view = view.dataset.homeView; homeState.category = ''; homeState.domain = ''; }
    if (event.target.closest('[data-home-reset]')) { homeState.category = ''; homeState.domain = ''; homeState.model = ''; homeState.query = ''; $('[data-home-search]').value = ''; }
    if (event.target.closest('[data-model-reset]')) { homeState.vendor = ''; homeState.modelQuery = ''; $('[data-model-search]').value = ''; }
    if (category || domain || view || event.target.closest('[data-home-reset], [data-model-reset]')) filter();
  };
  filter();
  document.title = `题库 · ${DATA.title}`;
  async function loadPreviews(choice) {
    const result = choice?.result;
    if (destroyed || !initialPlatformSettled || homeState.view !== 'tasks' || result?.previewMode === 'screenshot' || !(result?.previewModel || result?.previewLoader)) return;
    const key = `${choice.task.id}/${result.id}`;
    if (activePreviewKey === key && previews) return;
    previews?.destroy(); previews = null;
    activePreviewKey = key;
    try {
      const { createQuestionPreviews } = await import('./result-previews.js');
      if (destroyed || activePreviewKey !== key) return;
      previews = createQuestionPreviews(root, [choice]);
      previews.setPaused(homeState.view !== 'tasks');
      settleImages();
    } catch (error) {
      if (activePreviewKey === key) activePreviewKey = null;
      console.error('Question model previews unavailable:', error);
    }
  }
  root.onpointerover = (event) => {
    if (event.pointerType === 'touch' || homeState.view !== 'tasks') return;
    const visual = event.target.closest('.question-visual');
    const card = visual?.closest('[data-task-card]');
    if (!card || visual.contains(event.relatedTarget) || card.hidden) return;
    loadPreviews(choices.find(({ task }) => task.id === card.dataset.taskCard));
  };
  root.onfocusin = (event) => {
    const card = event.target.closest('[data-task-card]');
    if (card && !card.hidden && homeState.view === 'tasks') loadPreviews(choices.find(({ task }) => task.id === card.dataset.taskCard));
  };
  return {
    destroy() { destroyed = true; controller.abort(); previews?.destroy(); activePreviewKey = null; },
  };
}

// ---- task -----------------------------------------------------------------------------
const taskState = { task: null, cond: null, vendor: '', harness: '', provider: '', query: '', picks: [], promptVariant: null, variants: new Map(), open: new Set(), view: store.get('task-view') === 'family' ? 'family' : 'featured' };
const selectedVariant = (t) => variantsOf(t).find((variant) => variant.id === taskState.promptVariant);
const selectedPrompt = (t) => selectedVariant(t)?.prompt ?? t.prompt;
// Each model leads with one work (per review group); its other works follow, folded until opened.
const foldKey = (r) => `${r.status}|${modelKey(r)}`;
// The task's cover work heads the verified grid and is drawn large while nothing narrows the list.
// It needs a few other models around it to read as the lead, and it leads its own model's fold.
function coverLead(t) {
  const cover = taskCover(t, platform.featured?.[t.id]?.cover);
  if (cover?.status !== 'verified') return null;
  return new Set(t.results.filter((r) => r.status === 'verified').map(modelKey)).size >= 3 ? cover : null;
}
// A tagged cover keeps the lead when the reader switches its prompt version.
const isLead = (lead, r) => Boolean(lead) && (r.id === lead.id || Boolean(r.promptVariant && lead.promptVariant && variantKey(r) === variantKey(lead)));
function foldOrder(t, results) {
  const lead = coverLead(t);
  const leads = new Set();
  for (const status of new Set(results.map((r) => r.status))) {
    const featured = { ...platform.featured?.[t.id]?.models, ...(lead && status === 'verified' ? { [modelKey(lead)]: results.find((r) => isLead(lead, r))?.id } : {}) };
    const picks = representatives(results.filter((r) => r.status === status), modelKey, featured);
    picks.forEach((r) => leads.add(r));
  }
  const ordered = results.filter((r) => leads.has(r)).flatMap((first) => [first, ...results.filter((r) => r !== first && !leads.has(r) && foldKey(r) === foldKey(first))]);
  if (!lead) return ordered;
  const ahead = (r) => r.status === 'verified' && modelKey(r) === modelKey(lead);
  return [...ordered.filter(ahead), ...ordered.filter((r) => !ahead(r))];
}
const displayedResults = (t) => foldOrder(t, groupVariantResults(t, sortedResults(t), taskState.variants));
function resultVariantButtons(t, r, pane = null) {
  const choices = variantChoices(t, r);
  if (!choices.length) return '';
  return `<div class="seg result-variants" role="group" aria-label="${esc(label(r))}的提示词版本">${choices.map((choice) => `<button ${pane === null ? 'data-result-variant' : `data-pane-variant="${pane}"`} data-variant-result="${esc(choice.result?.id ?? '')}" aria-pressed="${choice.id === r.promptVariant}"${choice.result ? '' : ' disabled title="这版结果尚未收录"'}>${esc(choice.label)}</button>`).join('')}</div>`;
}
let resultPreviews = null;
let previewVersion = 0;
let activeResultPreviewId = null;
function previewTriggerId(t) {
  const results = new Map(t.results.map((result) => [result.id, result]));
  const visible = $$('.result[data-id]', root).filter((card) => !card.hidden && card.getClientRects().length);
  const available = (card) => {
    const result = results.get(card.dataset.id);
    return result && hasModelPreview(result) && (result.previewModel || hosted(result));
  };
  return (visible.find((card) => card.classList.contains('is-lead') && available(card)) ?? visible.find(available))?.dataset.id ?? null;
}
function prioritizeResultLead() {
  const cards = $$('.result[data-id]', root);
  const visible = cards.filter((card) => !card.hidden && card.getClientRects().length);
  const card = visible.find((item) => item.classList.contains('is-lead')) ?? visible[0];
  const images = $$('.result-media img', root);
  const leadImages = card ? $$('.result-media img', card) : [];
  const selected = previewMode === 'screenshot'
    ? card?.querySelector('img.result-screenshot-preview') ?? leadImages[0]
    : card?.querySelector('img.result-model-poster') ?? card?.querySelector('img.result-screenshot-preview') ?? leadImages[0];
  for (const image of images) {
    const eager = image === selected;
    image.loading = eager ? 'eager' : 'lazy';
    image.fetchPriority = eager ? 'high' : 'auto';
  }
}
async function updateResultPreviews(t, preferredId = null) {
  if (!initialPlatformSettled || previewMode !== 'model') {
    ++previewVersion;
    resultPreviews?.destroy(); resultPreviews = null; activeResultPreviewId = null;
    return;
  }
  const results = displayedResults(t).filter((result) => hasModelPreview(result) && (result.previewModel || hosted(result)));
  const visibleIds = new Set($$('.result[data-id]', root).filter((card) => !card.hidden && card.getClientRects().length).map((card) => card.dataset.id));
  // Without an explicit card target, keep the poster and transfer no model file.
  const selected = preferredId
    ? results.find((result) => result.id === preferredId && visibleIds.has(result.id))
    : results.find((result) => result.id === activeResultPreviewId && visibleIds.has(result.id));
  if (preferredId && !selected) return;
  if (selected?.id === activeResultPreviewId && resultPreviews) return;
  const version = ++previewVersion;
  resultPreviews?.destroy(); resultPreviews = null;
  activeResultPreviewId = selected?.id ?? null;
  if (!selected) return;
  try {
    const { createResultPreviews } = await import('./result-previews.js');
    if (version !== previewVersion || previewMode !== 'model') return;
    resultPreviews = createResultPreviews(root, { ...t, results: [selected] });
    resultPreviews.setPaused($('#results').hidden);
  } catch (error) {
    if (version === previewVersion) activeResultPreviewId = null;
    console.error('Model previews unavailable:', error);
  }
}
// Panels are views of the one task page: they replace the address and add no level to the trail.
// The prompt lives in the sidebar now; an old #prompt address opens the works.
const panels = ['results', 'shots', 'board'];
function activatePanel(name, updateHash = true) {
  const target = panels.includes(name) && $(`[data-panel="${name}"]`) ? name : 'results';
  $$('[data-panel]').forEach((el) => { el.hidden = el.dataset.panel !== target; });
  $$('[data-go]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.go === target)));
  resultPreviews?.setPaused(target !== 'results');
  if (target === 'board') mountTaskBoard();
  if (updateHash) {
    const base = `#${location.hash.split('#')[1]}`;
    history.replaceState(history.state, '', target === 'results' ? base : `${base}#${target}`);
  }
}

// The task leaderboard doubles as the source of the "榜单评分" sort.
let taskBoard = null;
async function loadTaskScores(t) {
  if (!platform.available || aiJudged(t)) return;
  try {
    const board = await api(`leaderboard?task=${encodeURIComponent(t.id)}`);
    if (taskState.task !== t.id) return;
    taskScores = new Map(board.rows.map((row) => [row.key, row.score]));
    if (resultSort === 'score') applySort(t);
  } catch { /* the sort falls back to names */ }
}
async function mountTaskBoard() {
  const body = $('#board-body');
  if (!body || body.dataset.mounted) return;
  body.dataset.mounted = '1';
  const t = DATA.tasks.find((task) => task.id === taskState.task);
  try {
    const { mountBoard } = await import('./leaderboard.js');
    if (!body.isConnected) return;
    taskBoard = mountBoard(body, { ...context(), task: t, embedded: true });
  } catch (error) {
    const failure = await loadFailure(error, '榜单加载失败');
    if (body.isConnected) body.innerHTML = `<div class="board-empty"><p class="board-empty-title">${failure.title}</p><p>${esc(failure.text)}</p><div class="board-empty-actions">${RELOAD}</div></div>`;
  }
}

function shotGrid(t) {
  const cond = t.conditions.find((c) => c.id === taskState.cond) ?? t.conditions[0];
  if (!cond) return '';
  const shots = t.results.filter((r) => r.captures[cond.id]);
  if (!shots.length) return '<p class="muted empty-note">该条件下暂无截图。</p>';
  return `<div class="shot-grid${cond.mobile ? ' phones' : ''}">${shots.map((r) => {
    const src = r.captures[cond.id];
    return `<figure class="shot">
      <button class="shot-img" data-shot="${esc(r.id)}" aria-label="放大查看 ${esc(label(r))} · ${esc(cond.label)}">${img(src, `${label(r)} · ${cond.label}`)}</button>
      <figcaption><b>${esc(r.title)}</b><span>${esc(label(r))}${r.status !== 'verified' ? ` · ${STATUS[r.status].label}` : ''}</span><a href="${viewHref(t, r.id)}">在线预览</a></figcaption>
    </figure>`;
  }).join('')}</div>`;
}

// Staff see the task's blind pool and how many published works stay out of it.
function adminPoolLine(t, pool) {
  const out = t.results.filter((r) => r.status === 'verified' && r.arena && r.arena.state !== 'in_pool').length;
  return `<p>盲评池 ${pool?.works ?? 0} 件 · ${pool?.entries ?? 0} 个配置${out ? ` · <a href="#/review/noarena">${out} 件已公开但不在池中</a>` : ''}</p>`;
}

// The model is the card's title; the work's own name follows in grey. Summaries stay in the guide.
function resultCard(t, r) {
  const m = modelOf(r);
  const screenshotPreview = !hasModelPreview(r);
  const screenshot = screenshotOf(r);
  const coverWork = coverLead(t);
  const lead = isLead(coverWork, r);
  const eagerPoster = lead && !screenshotPreview && Boolean(r.previewPoster) && previewMode === 'model';
  const eagerScreenshot = lead && !eagerPoster;
  return `<article class="result${screenshotPreview ? ' is-screenshot-preview' : ''}${lead ? ' is-lead' : ''}" data-vendor="${esc(vendorOf(r))}" data-model="${esc(modelKey(r))}" data-id="${esc(r.id)}" data-status="${r.status}">
    <div class="result-media">
      <a href="${viewHref(t, r.id)}" aria-label="在线预览：${esc(r.title)}，${esc(label(r))}">${screenshotPreview && screenshot ? img(screenshot, r.title, 'result-screenshot-preview', eagerScreenshot) : coverHtml(r, 'result-screenshot-preview', eagerScreenshot)}${!screenshotPreview && r.previewPoster ? img(r.previewPoster, '', 'result-model-poster', eagerPoster) : ''}<span class="play">${icon('arrow')}在线预览</span></a>
      ${lead ? '<span class="lead-seal" aria-hidden="true"><span>代</span><span>表</span></span>' : ''}
      ${t.results.length > 1 ? `<button class="pick" data-pick="${esc(r.id)}" aria-pressed="false" aria-label="加入对比：${esc(r.title)}"><span class="pick-box">${icon('plus')}${icon('check')}</span><span class="pick-text">对比</span></button>` : ''}
    </div>
    <div class="result-body">
      ${resultVariantButtons(t, r)}
      <p class="result-model">${brandMark(m, 'brand-mark sm')}<b>${esc(m.name)}</b>${resultBadges(r)}${aiJudged(t) ? aiScoreBadge(r) : ''}${platform.featured?.[t.id]?.models?.[modelKey(r)] === r.id ? '<span class="badge featured-badge" title="盲评票选出的代表作">代表作</span>' : ''}${statusBadge(r.status, { reason: r.reason })}</p>
      ${lead ? `<p class="lead-why">${t.cover === coverWork.id ? '管理员指定的本题封面' : platform.featured?.[t.id]?.cover === coverWork.id ? '盲评票选的代表作' : '本题封面作品 · 盲评票数足够后改由票选决定'}</p>` : ''}
      <h3><a href="${viewHref(t, r.id)}">${esc(r.title)}${icon('arrow')}</a></h3>
      <p class="result-by">${esc(authorName(r))} 发布${sourceLine(r) || r.tool ? ` · ${esc(sourceLine(r) || r.tool)}` : ''}${r.addedAt ? ` · ${formatDate(r.addedAt)}` : ''}</p>
      ${r.status === 'questioned' && r.reason ? `<p class="result-reason">${icon('alert')}<span>${esc(r.reason)}</span></p>` : ''}
      <div class="result-foot">
        ${r.gallery.length ? `<button class="text-action" data-gallery="${esc(r.id)}">${icon('image')}截图 ${r.gallery.length}</button>` : ''}
        ${reactionBar(workKey(t, r), { locked: !interactive(r) })}
      </div>
    </div>
  </article>`;
}

// The list splits by review state: verified works lead, unverified
// ones follow, questioned ones stay folded away as reference.
const GROUPS = [
  { status: 'verified', title: '已验证', note: '核验通过的作品' },
  { status: 'unverified', title: '未验证', note: '等待管理员核验 · 可以浏览和贴表情，暂不参与盲评' },
  { status: 'questioned', title: '存疑', note: '核验存疑 · 仅供参考，不参与互动与盲评' },
];
function resultGroup(t, g, items) {
  const head = `<div class="group-head"><h3>${g.title}<span class="group-count" data-group-count>${items.length}</span></h3><p>${g.note}</p>${g.status === 'questioned' ? `<span class="group-toggle" aria-hidden="true"><span class="when-open">收起</span><span class="when-closed">展开</span>${icon('next')}</span>` : ''}</div>`;
  const grid = `<div class="result-grid" data-group="${g.status}">${items.map((r) => resultCard(t, r)).join('')}</div>`;
  return g.status === 'questioned'
    ? `<details class="result-group is-questioned" data-group-wrap><summary>${head}</summary>${grid}</details>`
    : `<section class="result-group" data-group-wrap>${head}${grid}</section>`;
}
function resultGroups(t) {
  const sorted = displayedResults(t);
  if (t.results.every((r) => r.status === 'verified')) return `<div class="result-grid" data-group="verified">${sorted.map((r) => resultCard(t, r)).join('')}</div>`;
  return GROUPS.map((g) => {
    const items = sorted.filter((r) => r.status === g.status);
    return items.length ? resultGroup(t, g, items) : '';
  }).join('');
}

// 同门: each vendor's works in version order, so one lab's versions read left to right. Vendors
// with a single model share the last row; questioned works keep their folded group below.
// A task where no vendor answered with two models has no lineage to show, so it stays on 精选.
function hasLineage(t) {
  const models = new Map();
  for (const r of t.results.filter((item) => item.status !== 'questioned')) models.set(vendorOf(r), new Set([...(models.get(vendorOf(r)) ?? []), modelKey(r)]));
  return [...models.values()].some((keys) => keys.size > 1);
}
const familyShown = (t) => taskState.view === 'family' && hasLineage(t);
// Many models have no release month, so versions follow the name with its numbers read as numbers:
// a product line stays together and runs Gemini 3.1 → 3.7 → 3.8 → 4.x, then each effort low to max.
const lineage = (a, b) => modelOf(a).name.localeCompare(modelOf(b).name, 'en', { numeric: true, sensitivity: 'base' }) || effortRank(a) - effortRank(b);
function familyView(t) {
  const shown = displayedResults(t);
  const vendors = new Map();
  for (const r of shown.filter((item) => item.status !== 'questioned')) vendors.set(vendorOf(r), [...(vendors.get(vendorOf(r)) ?? []), r]);
  const models = (list) => new Set(list.map(modelKey)).size;
  const rows = [...vendors].filter(([, list]) => models(list) > 1)
    .sort(([a, x], [b, y]) => models(y) - models(x) || y.length - x.length || byName(a, b))
    .map(([vendor, list]) => ({ vendor, list: list.sort(lineage) }));
  const rest = [...vendors].filter(([, list]) => models(list) === 1).sort(([a], [b]) => byName(a, b)).flatMap(([, list]) => list.sort(lineage));
  if (rest.length) rows.push({ vendor: '', list: rest });
  const questioned = shown.filter((r) => r.status === 'questioned');
  return `<div class="family-list">${rows.map(({ vendor, list }) => `<section class="family" data-family${vendor ? '' : ' data-family-rest'}>
      <header class="family-head">${vendor ? brandMark(modelOf(list[0]), 'brand-mark') : ''}<h3>${vendor ? esc(vendor) : '其他厂商'}</h3><p data-family-count></p></header>
      <div class="family-strip">${list.map((r) => resultCard(t, r)).join('')}</div>
    </section>`).join('')}</div>
    ${questioned.length ? resultGroup(t, GROUPS[2], questioned) : ''}`;
}
const viewControl = (t) => !hasLineage(t) ? '' : `<div class="seg task-view" role="group" aria-label="作品排列">${[['featured', '精选', '每个模型先看一件代表作'], ['family', '同门', '按厂商分组，同一家按系列与版本排开']]
  .map(([value, text, hint]) => `<button data-task-view="${value}" aria-pressed="${value === (familyShown(t) ? 'family' : 'featured')}" title="${hint}">${text}</button>`).join('')}</div>`;
// 同门 keeps its own order, so the sort waits until the reader returns to 精选.
function syncTaskView(t) {
  const family = familyShown(t);
  $$('[data-task-view]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.taskView === taskState.view)));
  Object.assign($('[data-result-sort]'), { disabled: family, title: family ? '同门按系列与版本排列' : '' });
}

function sourceChoices(results, field, nameField, resolve) {
  const choices = new Map();
  for (const r of results) {
    const key = sourceKey(r, field, nameField);
    const item = choices.get(key) ?? { name: key === 'unset' ? '未注明' : resolve(r)?.name ?? r[nameField] ?? r[field], count: 0 };
    item.count++;
    choices.set(key, item);
  }
  if (!choices.has('unset')) choices.set('unset', { name: '未注明', count: 0 });
  return [...choices].sort(([a, x], [b, y]) => a === 'unset' ? -1 : b === 'unset' ? 1 : byName(x.name, y.name));
}

function renderTask(t) {
  if (taskState.task !== t.id) {
    Object.assign(taskState, { task: t.id, vendor: '', harness: '', provider: '', query: '', picks: [], promptVariant: variantsOf(t)[0]?.id, variants: new Map(), open: new Set() });
    taskScores = new Map();
  }
  taskState.cond = t.conditions.some((c) => c.id === taskState.cond) ? taskState.cond : t.conditions[0]?.id;
  const vendorCounts = new Map();
  for (const r of t.results) vendorCounts.set(vendorOf(r), (vendorCounts.get(vendorOf(r)) ?? 0) + 1);
  const vendors = [...vendorCounts.keys()].sort(byName);
  if (!vendors.includes(taskState.vendor)) taskState.vendor = '';
  const harnessChoices = sourceChoices(t.results, 'harness', 'harnessName', harnessOf);
  const providerChoices = ['unset', ...PROVIDERS.keys()].map((key) => [key, { name: PROVIDERS.get(key)?.name ?? '未注明', count: t.results.filter((r) => providerKey(r) === key).length }]);
  if (!harnessChoices.some(([key]) => key === taskState.harness)) taskState.harness = '';
  if (!providerChoices.some(([key]) => key === taskState.provider)) taskState.provider = '';
  taskState.picks = taskState.picks.filter((id) => t.results.some((r) => r.id === id));
  const hasCaptures = t.results.some((r) => Object.keys(r.captures).length);
  const captureNotes = t.results.filter((r) => r.captureNote).map((r) => `${esc(r.title)}：${esc(r.captureNote)}`);
  const works = counted(t);
  const pool = platform.arena[t.id];
  const actions = platform.available ? `<div class="task-acts">
    ${aiJudged(t) ? act('judge', '', icon('reason'), 'AI 评分', '暂未开放', '推理题由 AI 评分，不参与盲评和排行榜')
      : (pool?.entries ?? 0) >= 2 ? act('judge', `#/arena/${esc(t.id)}`, AB, '参与盲评', `可盲评 ${pool.works} 件`) : act('judge', '', AB, '参与盲评', '作品不足', '至少需要两个模型配置的作品进入盲评池')}
    ${t.acceptsUploads ? act('upload', `#/submit/${esc(t.id)}`, icon('upload'), '上传作品', '交一份你的答案') : act('upload', '', icon('upload'), '暂不接受投稿', t.promptPending ? '提示词原文尚未公开' : '这道题暂时关闭了投稿')}
  </div>` : '';

  root.innerHTML = `${header([LIBRARY, { text: t.title }], false, 'questions')}<div class="app-layout task-layout">
    <aside class="app-sidebar">
      <h1>${esc(t.title)}</h1>
      <p class="side-intro">${esc(t.summary)}</p>
      <p class="side-byline">${esc(authorName(t))} 发起${t.date ? ` · ${esc(t.date)}` : ''}</p>
      <ul class="tags side-tags">${t.category ? `<li class="tag-kind">${esc(categoryLabel(t.category))}</li>` : ''}${domainsOf(t).map((d) => `<li><a href="${LIBRARY.href}/${encodeURIComponent(d)}">${esc(d)}</a></li>`).join('')}</ul>
      <nav class="side-nav task-nav" aria-label="本页">
        <button class="side-link" data-go="results" aria-pressed="true">${icon('grid')}作品<span class="nav-count">${t.results.length}</span></button>
        ${t.conditions.length ? `<button class="side-link" data-go="shots" aria-pressed="false">${icon('image')}截图对照</button>` : ''}
        ${platform.available && !aiJudged(t) ? `<button class="side-link" data-go="board" aria-pressed="false">${icon('rank')}排行榜</button>` : ''}
        ${hasExhibition(t) ? `<p class="nav-sep">全屏查看</p>
        <a class="side-link" href="${sandtableHref(t)}">${icon('full')}三维沙盘<span class="nav-ext">${icon('arrow')}</span></a>
        <a class="side-link" href="#/${t.id}/exhibition">${icon('grid')}原作展厅<span class="nav-ext">${icon('arrow')}</span></a>` : ''}
      </nav>
      <div class="side-facts"><p>${new Set(works.map((r) => r.model)).size} 个模型 · ${new Set(works.map(vendorOf)).size} 家厂商</p>
        ${isStaff() ? adminPoolLine(t, pool) : ''}</div>
      <section class="side-prompt" aria-labelledby="side-prompt-title">
        <div class="side-prompt-head"><h2 id="side-prompt-title">题面</h2>
          ${variantsOf(t).length ? `<div class="seg" role="group" aria-label="提示词版本">${variantsOf(t).map((variant) => `<button data-prompt-variant="${esc(variant.id)}" aria-pressed="${variant.id === taskState.promptVariant}">${esc(variant.label)}</button>`).join('')}</div>` : ''}
          <button class="text-action side-prompt-more" data-prompt-more aria-expanded="false">展开</button><button class="text-action" data-copy>复制</button></div>
        ${referenceSheet(t.references, { key: t.id, credit: t.referenceCredit })}
        <pre data-prompt-text>${linkReferences(selectedPrompt(t), t.references, t.id)}</pre>
      </section>
    </aside>
    <main class="workspace page">
    <section id="results" data-panel="results" class="collection-panel">
      <div class="collection-heading"><div class="collection-title"><h2 id="filter-heading">全部作品</h2><span id="filter-count">${t.results.length} 件作品</span>${aigcLabel()}</div>${actions}</div>
      <div class="collection-toolbar">${searchControl('work', '搜索模型或作品', taskState.query)}<div class="toolbar-actions">${viewControl(t)}${previewControl()}<label class="result-sort">厂商<select data-vendor-filter aria-label="按模型厂商筛选">
        <option value="">全部厂商（${t.results.length}）</option>
        ${vendors.map((v) => `<option value="${esc(v)}"${v === taskState.vendor ? ' selected' : ''}>${esc(v)}（${vendorCounts.get(v)}）</option>`).join('')}
      </select></label><label class="result-sort">Harness<select data-harness-filter aria-label="按 Harness 筛选">
        <option value="">全部 Harness（${t.results.length}）</option>
        ${harnessChoices.map(([key, item]) => `<option value="${esc(key)}"${key === taskState.harness ? ' selected' : ''}>${esc(item.name)}（${item.count}）</option>`).join('')}
      </select></label><label class="result-sort">服务商<select data-provider-filter aria-label="按服务商筛选">
        <option value="">全部服务商（${t.results.length}）</option>
        ${providerChoices.map(([key, item]) => `<option value="${esc(key)}"${key === taskState.provider ? ' selected' : ''}>${esc(item.name)}（${item.count}）</option>`).join('')}
      </select></label>${sortControl()}</div></div>
      <div data-results>${familyShown(t) ? familyView(t) : resultGroups(t)}</div>
      <p class="muted filter-empty" hidden>${t.results.length ? '没有匹配的作品，请试试其他关键词或筛选条件。' : '还没有作品，点击本题的「上传作品」带来第一份答案。'}</p>
    </section>

    ${t.conditions.length ? `<section id="shots" data-panel="shots" class="block wrap" hidden>
      <div class="block-head"><h2>截图对照</h2><p>切换拍摄条件；点开大图后，←/→ 换作品，↑/↓ 换条件。</p></div>
      <div class="seg" role="group" aria-label="截图条件">${t.conditions.map((c) => `<button data-cond="${esc(c.id)}" aria-pressed="${c.id === taskState.cond}">${esc(c.label)}</button>`).join('')}</div>
      <p class="cond-note" id="cond-note">${esc(t.conditions.find((c) => c.id === taskState.cond)?.note ?? '')}</p>
      <div id="shot-grid">${hasCaptures ? shotGrid(t) : '<p class="muted">暂无截图。</p>'}</div>
      ${captureNotes.length ? `<p class="fine">${captureNotes.join('<br />')}</p>` : ''}
      <p class="fine">自动截图可能使用软件渲染；实际光影与帧率请以在线预览为准。</p>
    </section>` : ''}

    ${platform.available && !aiJudged(t) ? `<section id="board" data-panel="board" class="block wrap" hidden>
      <div class="block-head"><h2>榜单</h2><p>这道题的盲评结果 · 按模型与推理档位分别计分</p>${(pool?.entries ?? 0) >= 2 ? `<a class="block-hint text-link" href="#/arena/${esc(t.id)}">参与这道题的盲评${icon('right')}</a>` : ''}</div>
      <div id="board-body"><p class="muted">正在载入榜单…</p></div>
    </section>` : ''}
    ${footer()}</main></div>
  <div class="tray" role="region" aria-label="对比栏" hidden></div>`;
  document.title = `${t.title} · ${DATA.title}`;
  syncTaskView(t);
  filterResults(t);
  syncPicks(t);
  loadTaskScores(t);

  root.oninput = (e) => {
    if (!e.target.matches('[data-work-search]')) return;
    taskState.query = e.target.value;
    filterResults(t);
    updateResultPreviews(t);
  };

  root.onchange = (e) => {
    if (e.target.matches('[data-vendor-filter]')) { taskState.vendor = e.target.value; filterResults(t); updateResultPreviews(t); }
    if (e.target.matches('[data-harness-filter]')) { taskState.harness = e.target.value; filterResults(t); updateResultPreviews(t); }
    if (e.target.matches('[data-provider-filter]')) { taskState.provider = e.target.value; filterResults(t); updateResultPreviews(t); }
    if (!e.target.matches('[data-result-sort]')) return;
    setResultSort(e.target.value);
    applySort(t);
  };
  root.onclick = (e) => {
    const promptVariant = e.target.closest('[data-prompt-variant]');
    if (promptVariant) {
      taskState.promptVariant = promptVariant.dataset.promptVariant;
      $$('[data-prompt-variant]').forEach((button) => button.setAttribute('aria-pressed', String(button === promptVariant)));
      $('[data-prompt-text]').innerHTML = linkReferences(selectedPrompt(t), t.references, t.id);
    }
    // On narrow screens the sidebar sits above the works, so the prompt opens on request.
    const more = e.target.closest('[data-prompt-more]');
    if (more) {
      const open = more.closest('.side-prompt').classList.toggle('is-open');
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? '收起' : '展开';
    }
    const view = e.target.closest('[data-task-view]');
    if (view && view.dataset.taskView !== taskState.view) {
      taskState.view = view.dataset.taskView;
      store.set('task-view', taskState.view);
      $('[data-results]').innerHTML = familyShown(t) ? familyView(t) : resultGroups(t);
      syncTaskView(t); filterResults(t); syncPicks(t); settleImages(); updateResultPreviews(t);
    }
    const resultVariant = e.target.closest('[data-result-variant]');
    if (resultVariant && resultVariant.dataset.variantResult) {
      const card = resultVariant.closest('.result'), previousId = card.dataset.id;
      const result = t.results.find((item) => item.id === resultVariant.dataset.variantResult);
      taskState.variants.set(variantKey(result), result.id);
      taskState.picks = taskState.picks.map((id) => id === previousId ? result.id : id);
      card.outerHTML = resultCard(t, result);
      applySort(t); filterResults(t); syncPicks(t); settleImages(); updateResultPreviews(t);
    }
    const preview = e.target.closest('[data-preview-mode]');
    if (preview) {
      if (preview.dataset.previewMode !== previewMode) {
        previewMode = preview.dataset.previewMode;
        store.set('preview-mode', previewMode);
        document.body.dataset.previewMode = previewMode;
        $$('[data-preview-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.previewMode === previewMode)));
      }
      prioritizeResultLead();
      updateResultPreviews(t, previewMode === 'model' ? previewTriggerId(t) : null);
    }
    const go = e.target.closest('[data-go]');
    if (go) {
      activatePanel(go.dataset.go);
      scrollTo({ top: 0 });
    }
    const fold = e.target.closest('[data-fold]');
    if (fold) {
      if (taskState.open.has(fold.dataset.fold)) taskState.open.delete(fold.dataset.fold);
      else taskState.open.add(fold.dataset.fold);
      filterResults(t);
    }
    const pick = e.target.closest('[data-pick], [data-unpick]');
    if (pick) togglePick(t, pick.dataset.pick ?? pick.dataset.unpick);
    if (e.target.closest('[data-clear-picks]')) { taskState.picks = []; syncPicks(t); }
    const cond = e.target.closest('[data-cond]');
    if (cond) {
      taskState.cond = cond.dataset.cond;
      $$('[data-cond]').forEach((el) => el.setAttribute('aria-pressed', String(el === cond)));
      $('#cond-note').textContent = t.conditions.find((c) => c.id === taskState.cond)?.note ?? '';
      if (hasCaptures) { $('#shot-grid').innerHTML = shotGrid(t); settleImages(); }
    }
    const shot = e.target.closest('[data-shot]');
    if (shot) openCompareLightbox(t, shot.dataset.shot);
    const gal = e.target.closest('[data-gallery]');
    if (gal) {
      const r = t.results.find((x) => x.id === gal.dataset.gallery);
      lightbox.open(r.gallery.map((g) => ({ src: versionedMedia(g.src), title: g.caption || r.title, sub: `${r.title} · ${label(r)} · 作者截图` })), 0);
    }
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      navigator.clipboard?.writeText(selectedPrompt(t)).then(() => {
        copy.textContent = '已复制';
        setTimeout(() => { copy.textContent = '复制'; }, 1500);
      }, () => { copy.textContent = '复制失败'; });
    }
  };
  const requestCardPreview = (event) => {
    if (!initialPlatformSettled || previewMode !== 'model' || $('#results').hidden) return;
    const media = event.target.closest?.('.result-media');
    const card = media?.closest('.result[data-id]');
    if (!card || card.hidden || media.contains(event.relatedTarget)) return;
    updateResultPreviews(t, card.dataset.id);
  };
  root.onpointerover = (event) => {
    if (event.pointerType !== 'touch') requestCardPreview(event);
  };
  root.onfocusin = requestCardPreview;
}

// The task page as the router sees it: its panel and selected card preview, plus board and tray cleanup.
function taskPage(t) {
  renderTask(t);
  activatePanel(location.hash.split('#')[2], false);
  return {
    ready: updateResultPreviews(t),
    destroy() {
      taskBoard?.destroy?.();
      taskBoard = null;
      ++previewVersion;
      resultPreviews?.destroy();
      resultPreviews = null;
      activeResultPreviewId = null;
      document.body.classList.remove('has-tray');
    },
  };
}

function applySort(t) {
  const cards = new Map($$('.result').map((el) => [el.dataset.id, el]));
  const sorted = displayedResults(t);
  $$('.result-grid[data-group]').forEach((grid) => grid.append(...sorted.filter((r) => r.status === grid.dataset.group).map((r) => cards.get(r.id)).filter(Boolean)));
  resultPreviews?.refresh();
}

function filterResults(t) {
  const displayed = displayedResults(t);
  const shown = displayed.filter((r) => (!taskState.vendor || vendorOf(r) === taskState.vendor)
    && (!taskState.harness || sourceKey(r, 'harness', 'harnessName') === taskState.harness)
    && (!taskState.provider || providerKey(r) === taskState.provider)
    && textMatches(taskState.query, [label(r), r.title, r.summary, vendorOf(r), harnessOf(r)?.name, providerOf(r)?.name].join(' ')));
  // A filter or search lists every match; otherwise each model shows its lead work. 同门 lists them all.
  const filtering = Boolean(taskState.vendor || taskState.harness || taskState.provider || taskState.query.trim());
  const unfolded = filtering || familyShown(t);
  const leads = new Map(), folded = new Set();
  for (const r of displayed) {
    if (!leads.has(foldKey(r))) leads.set(foldKey(r), { id: r.id, more: 0 });
    else { leads.get(foldKey(r)).more++; folded.add(r.id); }
  }
  const ids = new Set(shown.filter((r) => unfolded || !folded.has(r.id) || taskState.open.has(foldKey(r))).map((r) => r.id));
  $$('.result').forEach((el) => {
    el.hidden = !ids.has(el.dataset.id);
    $('[data-fold]', el)?.remove();
    const r = displayed.find((item) => item.id === el.dataset.id);
    const lead = r && leads.get(foldKey(r));
    const open = Boolean(r) && !unfolded && Boolean(lead?.more) && taskState.open.has(foldKey(r));
    // An opened model's cards share one edge so the group reads as a unit.
    el.classList.toggle('is-fold-open', open);
    if (unfolded || !lead?.more || lead.id !== r.id) return;
    const name = modelOf(r).name;
    $('.result-model', el).insertAdjacentHTML('beforeend', `<button class="fold-chip" data-fold="${esc(foldKey(r))}" aria-expanded="${open}" aria-label="${open ? `收起 ${esc(name)} 的其余作品` : `展开 ${esc(name)} 的另外 ${lead.more} 件作品`}" title="${open ? '收起' : `同一模型的另外 ${lead.more} 件作品（其他档位或版本）`}">${open ? '收起' : `+${lead.more} 件`}</button>`);
  });
  // The cover is drawn large only over the full list; a filter or search shows plain matches.
  $$('.result-grid').forEach((grid) => grid.classList.toggle('is-filtering', filtering));
  // A vendor row marks each step to a newer model; the shared last row has no lineage to mark.
  $$('[data-family]').forEach((row) => {
    const cards = $$('.result', row).filter((el) => !el.hidden);
    row.hidden = !cards.length;
    cards.forEach((el, i) => el.classList.toggle('is-next-model', i > 0 && !('familyRest' in row.dataset) && el.dataset.model !== cards[i - 1].dataset.model));
    $('[data-family-count]', row).textContent = `${new Set(cards.map((el) => el.dataset.model)).size} 个模型 · ${cards.length} 件作品`;
  });
  $$('[data-group-wrap]').forEach((wrap) => {
    const matches = new Set(shown.map((r) => r.id));
    wrap.hidden = !$$('.result', wrap).some((el) => !el.hidden);
    $('[data-group-count]', wrap).textContent = $$('.result', wrap).filter((el) => matches.has(el.dataset.id)).length;
  });
  $('[data-vendor-filter]').value = taskState.vendor;
  $('[data-harness-filter]').value = taskState.harness;
  $('[data-provider-filter]').value = taskState.provider;
  $('#filter-heading').textContent = taskState.vendor || '全部作品';
  $('#filter-count').textContent = variantsOf(t).length ? `${modelCount(shown)} 个模型 · ${shown.length} 组结果 · ${t.results.length} 份作品` : `${modelCount(shown)} 个模型 · ${shown.length} 件作品`;
  $('.filter-empty').hidden = shown.length > 0;
  prioritizeResultLead();
  resultPreviews?.refresh();
}

// Architecture supports a multi-result exhibition; other tasks keep two panes.
function togglePick(t, id) {
  const picks = taskState.picks;
  if (picks.includes(id)) taskState.picks = picks.filter((x) => x !== id);
  else taskState.picks = hasExhibition(t) ? [...picks, id] : [...picks, id].slice(-2);
  syncPicks(t);
}

function syncPicks(t) {
  const picks = taskState.picks;
  $$('[data-pick]').forEach((el) => {
    const on = picks.includes(el.dataset.pick);
    el.setAttribute('aria-pressed', String(on));
    el.closest('.result')?.classList.toggle('picked', on);
    $('.pick-text', el).textContent = on ? `已选 ${picks.indexOf(el.dataset.pick) + 1}` : '对比';
  });
  const tray = $('.tray');
  if (!tray) return;
  tray.hidden = !picks.length;
  document.body.classList.toggle('has-tray', picks.length > 0);
  if (!picks.length) return;
  const chosen = picks.map((id) => t.results.find((r) => r.id === id));
  // Works on the content origin have no scene extract: side by side, but not in the sandtable.
  const sandIds = picks.filter((id) => t.results.some((r) => r.id === id && hosted(r)));
  const sandNote = sandIds.length < picks.length ? ' title="网页上传的作品没有沙盘模型"' : '';
  const slot = (r, i) => (r
    ? `<li class="slot"><span class="slot-thumb">${img(cover(r), '', '', true)}</span><span class="slot-text"><b>${esc(r.title)}</b><small>${esc(label(r))}</small></span><button class="slot-x" data-unpick="${esc(r.id)}" aria-label="移出对比：${esc(r.title)}">${icon('close')}</button></li>`
    : `<li class="slot empty"><span class="slot-thumb">${pad(i + 1)}</span><span class="slot-text"><b>再选一件</b><small>点击作品上的「对比」</small></span></li>`);
  tray.innerHTML = `<ol class="slots">${slot(chosen[0], 0)}<li class="vs" aria-hidden="true">${chosen.length > 2 ? `+${chosen.length - 1}` : 'vs'}</li>${chosen.length <= 2 ? slot(chosen[1], 1) : `<li class="slot"><span class="slot-text"><b>共 ${chosen.length} 件作品</b><small>在同一画布上查看原作</small></span></li>`}</ol>
    <div class="tray-actions">
      <button class="icon-btn" data-clear-picks aria-label="清空对比" title="清空">${icon('close')}</button>
      ${chosen.length === 2 ? `<a class="btn${hasExhibition(t) ? '' : ' primary'}" href="${viewHref(t, chosen[0].id, chosen[1].id)}">并排对比${icon('right')}</a>` : ''}
      ${hasExhibition(t) ? (sandIds.length ? `<a class="btn primary" href="${sandtableHref(t, sandIds)}"${sandNote}>进入沙盘${icon('right')}</a>` : `<span class="btn primary is-disabled" aria-disabled="true" title="投稿作品不进入沙盘">进入沙盘${icon('right')}</span>`) : chosen.length < 2 ? `<span class="btn primary is-disabled" aria-disabled="true">并排对比${icon('right')}</span>` : ''}
    </div>`;
  settleImages();
}

function openCompareLightbox(t, resultId) {
  const items = (condId) => {
    const cond = t.conditions.find((c) => c.id === condId);
    return t.results.filter((r) => r.captures[condId]).map((r) => ({
      id: r.id, src: r.captures[condId], title: `${r.title} · ${cond.label}`, sub: `${label(r)} · ←/→ 换作品，↑/↓ 换条件`,
    }));
  };
  const current = t.results.find((r) => r.id === resultId);
  const list = items(taskState.cond);
  lightbox.open(list, Math.max(0, list.findIndex((x) => x.id === current.id)), (dir, item) => {
    const withShots = t.conditions.filter((c) => t.results.some((r) => r.captures[c.id]));
    let i = withShots.findIndex((c) => c.id === taskState.cond);
    i = (i + dir + withShots.length) % withShots.length;
    taskState.cond = withShots[i].id;
    $$('[data-cond]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.cond === taskState.cond)));
    const note = $('#cond-note');
    if (note) note.textContent = withShots[i].note ?? '';
    const grid = $('#shot-grid');
    if (grid) { grid.innerHTML = shotGrid(t); settleImages(); }
    const next = items(taskState.cond);
    return { items: next, index: Math.max(0, next.findIndex((x) => x.id === item.id)) };
  });
}

// ---- lightbox -------------------------------------------------------------------------
const lightbox = (() => {
  const el = $('#lightbox');
  const image = $('.lb-img', el);
  const caption = $('.lb-caption', el);
  const count = $('.lb-count', el);
  $('.lb-close', el).innerHTML = icon('close');
  $('.lb-prev', el).innerHTML = icon('prev');
  $('.lb-next', el).innerHTML = icon('next');
  const download = $('.lb-download', el);
  download.innerHTML = icon('download');
  const strip = $('.lb-strip', el);
  let items = [];
  let index = 0;
  let vertical = null;
  let lastFocus = null;
  let label = '';
  const show = () => {
    const it = items[index];
    image.classList.remove('is-loaded');
    image.src = it.src;
    image.alt = it.title;
    if (image.complete) image.classList.add('is-loaded');
    caption.innerHTML = `<b>${esc(it.title)}</b><span>${esc(it.sub ?? '')}</span>`;
    count.textContent = items.length > 1 ? `${label ? `${label} ` : ''}${index + 1} / ${items.length}` : label;
    el.classList.toggle('single', items.length < 2);
    // Items with a download name offer the file under that name.
    download.hidden = !it.download;
    if (it.download) Object.assign(download, { href: it.download.href, download: it.download.name });
    $('.lb-file', el).textContent = it.download?.name ?? '';
    $$('button', strip).forEach((b, i) => b.setAttribute('aria-current', String(i === index)));
  };
  const step = (d) => { index = (index + d + items.length) % items.length; show(); };
  const close = () => {
    if (el.hidden) return;
    el.hidden = true;
    document.body.classList.remove('lb-open');
    resultPreviews?.setPaused(Boolean($('#results')?.hidden));
    lastFocus?.focus();
  };
  el.addEventListener('click', (e) => {
    if (e.target.closest('.lb-download')) {
      e.preventDefault();
      downloadReference(items[index].download);
      return;
    }
    const act = e.target.closest('[data-lb]')?.dataset.lb;
    const go = e.target.closest('[data-lb-go]');
    if (go) { index = Number(go.dataset.lbGo); show(); }
    else if (act === 'prev') step(-1);
    else if (act === 'next') step(1);
    else if (act === 'close' || e.target === el || e.target.matches('.lb-figure')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (el.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (vertical && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      ({ items, index } = vertical(e.key === 'ArrowDown' ? 1 : -1, items[index]));
      show();
    } else if (e.key === 'Tab') {
      // Keep focus inside the dialog.
      const focusable = $$('button, a[href]', el).filter((b) => !b.hidden && b.offsetParent);
      const i = focusable.indexOf(document.activeElement);
      const next = focusable[(i + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length];
      next?.focus();
    } else return;
    e.preventDefault();
  });
  let touchX = null;
  el.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    touchX = null;
  });
  return {
    // strip: show every item as a thumbnail under the picture; label: what the count counts.
    open(list, i = 0, onVertical = null, { strip: withStrip = false, label: name = '' } = {}) {
      if (!list.length) return;
      items = list;
      index = i;
      vertical = onVertical;
      label = name;
      strip.hidden = !withStrip || list.length < 2;
      el.classList.toggle('has-strip', !strip.hidden);
      strip.innerHTML = strip.hidden ? '' : list.map((it, k) => `<button type="button" data-lb-go="${k}" aria-label="${esc(it.title)}"><img src="${esc(it.thumb ?? it.src)}" alt="" decoding="async"></button>`).join('');
      lastFocus = document.activeElement;
      show();
      el.hidden = false;
      document.body.classList.add('lb-open');
      resultPreviews?.setPaused(true);
      $('.lb-close', el).focus();
    },
    close,
    get isOpen() { return !el.hidden; },
  };
})();

useReferenceViewer(lightbox.open);

// ---- viewer ---------------------------------------------------------------------------
// Kept alive across hash changes inside the same task so switching one pane
// does not reload the other.
const wide = () => matchMedia('(min-width: 1100px)').matches;

// How a work was made, in the guide drawer.
function sourceFacts(r) {
  const harness = harnessOf(r);
  return `<div><dt>Harness</dt><dd>${harness ? esc(harness.name) : r.tool ? `${esc(r.tool)}（作者原始声明）` : '未注明'}</dd></div>
      <div><dt>服务商</dt><dd>${esc(providerOf(r)?.name ?? '未注明')}</dd></div>`;
}
// Staff switches beside a verified work: [button, faces, toast].
const VIEWER_FACES = { 'arena-on': ['开启盲评', { show_arena: true }, '已开启盲评'], 'arena-off': ['移出盲评', { show_arena: false }, '已移出盲评'],
  hide: ['撤下', { show_gallery: false, show_arena: false }, '已撤下'] };
// A work's review state, who published it and how it was made.
function workFacts(r) {
  const info = STATUS[r.status];
  const admin = isStaff() && r.status === 'verified';
  const switches = admin ? [r.arena?.state === 'in_pool' ? 'arena-off' : r.arena?.state === 'off' ? 'arena-on' : '', 'hide'].filter(Boolean) : [];
  return `<div class="guide-block guide-status" data-status="${r.status}">
    <h3>核验状态</h3>
    <p class="guide-state">${statusBadge(r.status, { always: true })}<span>${esc(arenaText(r.arena) ? `已公开 · ${arenaText(r.arena)}` : info.hint)}</span></p>
    ${switches.length ? `<div class="actions">${switches.map((action) => `<button class="btn sm" data-face="${action}">${VIEWER_FACES[action][0]}</button>`).join('')}</div>` : ''}
    ${r.reason ? `<p class="guide-reason">${esc(r.reason)}</p>` : ''}
    <dl class="facts">
      <div><dt>发布</dt><dd>${esc(authorName(r))}${r.addedAt ? ` · ${formatDate(r.addedAt)}` : ''}</dd></div>
      ${sourceFacts(r)}
      ${r.files ? `<div><dt>文件</dt><dd>${r.files} 个 · ${formatBytes(r.bytes)}</dd></div>` : ''}
    </dl>
    ${r.note ? `<p class="guide-note">${esc(r.note)}</p>` : ''}
  </div>`;
}

function createViewer(t) {
  const state = { panes: [], queries: [], active: 0, guide: store.get('guide') === '1' && wide() };
  const byId = (id) => t.results.find((r) => r.id === id);
  const options = () => sortedResults(t).map((r) => `<option value="${esc(r.id)}">${esc(r.title)} · ${esc(label(r))}${r.promptVariant ? ` · ${esc(variantsOf(t).find((variant) => variant.id === r.promptVariant)?.label)}` : ''}${r.status !== 'verified' ? ` · ${STATUS[r.status].label}` : ''}</option>`).join('');
  const many = t.results.length > 1;
  document.title = `在线预览 · ${t.title}`;

  root.innerHTML = `<div class="viewer">
    <header class="vbar">
      ${backLink('vback')}
      <div class="vnav">
        ${many ? `<button class="vtool icon-only" data-v="prev" aria-label="上一件作品" title="上一件（←）">${icon('prev')}</button>` : ''}
        <span class="vselect-wrap"><span class="vmark" aria-hidden="true"></span><select class="vselect" aria-label="选择预览作品">${options()}</select></span>
        ${many ? `<button class="vtool icon-only" data-v="next" aria-label="下一件作品" title="下一件（→）">${icon('next')}</button>` : ''}
      </div>
      <span class="split-context">并排对比 · 点击一栏以选中</span>
      <div class="vtools">
        ${aigcLabel()}
        ${hasExhibition(t) ? `<button class="vtool" data-v="exhibition" title="将当前作品加入三维沙盘">${icon('full')}<span class="vtool-text">沙盘</span></button>` : ''}
        <button class="vtool" data-v="guide" aria-label="操作指南" aria-pressed="false" title="操作指南（G）">${icon('guide')}<span class="vtool-text">指南</span></button>
        ${many ? `<button class="vtool" data-v="split" aria-label="并排对比" aria-pressed="false" title="并排对比（S）">${icon('split')}<span class="vtool-text">并排</span></button>` : ''}
        <button class="vtool" data-v="controls" aria-label="显示作品控件" aria-pressed="false" title="显示作品控件" hidden>${icon('menu')}<span class="vtool-text">显示作品控件</span></button>
        <a class="vtool" data-v="open" aria-label="在新窗口打开独立页面" target="_blank" rel="noopener" title="在新窗口打开独立页面">${icon('arrow')}<span class="vtool-text">新窗口</span></a>
        <button class="vtool" data-v="full" aria-label="全屏" title="全屏（F）">${icon('full')}<span class="vtool-text">全屏</span></button>
        <span class="vdivider" aria-hidden="true"></span>
        ${themeButton('vtool icon-only')}
      </div>
    </header>
    <div class="vmain">
      <div class="stage"></div>
      <aside class="guide" aria-label="操作指南"></aside>
    </div>
  </div>`;
  document.body.classList.add('is-viewer');
  const el = $('.viewer', root);
  const stage = $('.stage', el);
  const guide = $('.guide', el);
  const controlsButton = $('[data-v="controls"]', el);
  const controls = createWorkControls(({ folded, count }) => {
    controlsButton.hidden = state.panes.length < 2 || !count;
    const text = folded ? '显示作品控件' : '隐藏作品控件';
    controlsButton.setAttribute('aria-label', text);
    controlsButton.setAttribute('aria-pressed', String(!folded));
    controlsButton.title = `${folded ? '显示' : '隐藏'}作品控件`;
    $('.vtool-text', controlsButton).textContent = text;
  });

  function paneHtml(i) {
    return `<section class="pane" data-pane="${i}">
      <div class="pane-head">
        <span class="pane-tag">${i === 0 ? 'A' : 'B'}</span>
        <select data-pane-pick="${i}" aria-label="${i === 0 ? '左' : '右'}栏的作品">${options()}</select>
        <button class="pane-close" data-close="${i}" title="关闭这一栏" aria-label="关闭这一栏">${icon('close')}</button>
      </div>
      <div class="pane-variants"></div>
      <div class="pane-body"></div>
    </section>`;
  }

  function load(i) {
    const r = byId(state.panes[i]);
    const pane = $(`[data-pane="${i}"]`, stage);
    const body = $('.pane-body', pane);
    const previous = $('iframe', body);
    if (previous) controls.remove(previous);
    $('select', pane).value = r.id;
    $('.pane-variants', pane).innerHTML = resultVariantButtons(t, r, i);
    $('.pane-variants', pane).hidden = !variantChoices(t, r).length;
    if (!r.scene) {
      body.innerHTML = `<div class="loader static"><b>${esc(r.title)}</b><span>该作品尚未构建，无法在线预览。</span></div>`;
      return;
    }
    const split = state.panes.length > 1;
    const src = workFrameUrl(r.scene, state.queries[i], split && !hosted(r));
    const bg = versionedMedia(cover(r));
    // Works on the content origin get the frame sandbox that repeats the server's policy.
    const sandbox = hosted(r) ? '' : ' sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-downloads" referrerpolicy="no-referrer"';
    // Replace the whole frame so the previous scene's WebGL context is released.
    body.innerHTML = `<iframe src="${esc(src)}" title="${esc(r.title)} · ${esc(label(r))}" allow="fullscreen; autoplay; clipboard-write" allowfullscreen${sandbox}></iframe>
      <div class="loader"${bg ? ` style="--cover:url('${esc(bg)}')"` : ''}><div class="spinner" aria-hidden="true"></div><b>${esc(r.title)}</b><span>${esc(label(r))} · 正在载入</span></div>`;
    const frame = $('iframe', body);
    if (split) controls.add(frame, { inject: hosted(r) });
    const loader = $('.loader', body);
    let done = false;
    const hide = () => {
      if (done) return;
      done = true;
      setTimeout(() => loader.classList.add('gone'), 500);
    };
    frame.addEventListener('load', hide, { once: true });
    setTimeout(hide, 20000);
  }

  function renderGuide() {
    const r = byId(state.panes[state.active]);
    const g = r.guide ?? {};
    const split = state.panes.length > 1;
    guide.innerHTML = `<div class="guide-in">
      <div class="guide-head">
        <div><p class="eyebrow">${split ? `${state.active === 0 ? 'A 栏' : 'B 栏'} · ` : ''}操作指南</p><h2>${esc(r.title)}</h2><p class="guide-model">${esc(label(r))}</p></div>
        <button class="icon-btn" data-v="guide" aria-label="收起指南">${icon('close')}</button>
      </div>
      ${r.summary ? `<p class="guide-summary">${esc(r.summary)}</p>` : ''}
      ${workFacts(r)}
      ${platform.available ? `<div class="guide-block"><h3>表情</h3>${reactionBar(workKey(t, r), { locked: !interactive(r) }) || '<p class="fine">存疑作品不再接受互动。</p>'}</div>` : ''}
      ${g.presets?.length ? `<div class="guide-block"><h3>快速跳转</h3>
        <div class="presets">${g.presets.map((p) => `<button class="chip${state.queries[state.active] === p.query ? ' on' : ''}" data-preset="${esc(p.query)}">${esc(p.label)}</button>`).join('')}
        <button class="chip ghost" data-preset="">默认</button></div></div>` : ''}
      ${(g.sections ?? []).map((s) => `<div class="guide-block"><h3>${esc(s.title)}</h3><dl class="keys">${s.items.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div>`).join('')}
      ${g.tips?.length ? `<div class="guide-block"><h3>看点</h3><ul class="tips">${g.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <div class="guide-block"><h3>本站快捷键</h3><dl class="keys">
        <div><dt>← / →</dt><dd>切换作品</dd></div>
        <div><dt>G · S · F</dt><dd>指南 · 并排 · 全屏</dd></div>
        <div><dt>R</dt><dd>重新载入当前栏</dd></div></dl>
        <p class="fine">点击场景后键盘会交给场景本身；点一下顶栏即可恢复本站快捷键。</p></div>
      <div class="guide-links">
        <a class="btn sm" href="${taskHref(t)}#shots">截图对照</a>
      </div>
    </div>`;
  }

  function sync() {
    const split = state.panes.length > 1;
    el.classList.toggle('split', split);
    el.classList.toggle('guide-open', state.guide);
    $$('.pane', stage).forEach((p, i) => p.classList.toggle('active', split && i === state.active));
    const current = byId(state.panes[state.active]);
    $('.vselect', el).value = current.id;
    const m = modelOf(current);
    $('.vmark', el).innerHTML = m.logo ? `<img src="${esc(versionedMedia(m.logo))}" alt="">` : '';
    $('[data-v="guide"]', el).setAttribute('aria-pressed', String(state.guide));
    $('[data-v="split"]', el)?.setAttribute('aria-pressed', String(split));
    const open = $('[data-v="open"]', el);
    if (current.scene) open.href = workFrameUrl(current.scene, state.queries[state.active]);
    else open.removeAttribute('href');
    renderGuide();
  }

  function navigate(panes, active = state.active) {
    state.active = Math.min(active, panes.length - 1);
    const hash = viewHref(t, panes[0], panes[1]);
    if (location.hash !== hash) history.replaceState(history.state, '', hash);
    update(panes);
  }

  function update(panes) {
    const before = state.panes;
    if (panes.length !== before.length) {
      controls.clear();
      if (panes.length > 1) controls.hide();
      stage.innerHTML = panes.map((_, i) => paneHtml(i)).join('');
      state.queries = panes.map((id, i) => (before[i] === id ? state.queries[i] ?? '' : ''));
      state.panes = panes;
      panes.forEach((_, i) => load(i));
    } else {
      panes.forEach((id, i) => {
        if (before[i] === id) return;
        state.panes[i] = id;
        state.queries[i] = '';
        load(i);
      });
    }
    state.active = Math.min(state.active, panes.length - 1);
    sync();
  }

  const cycle = (d) => {
    const ids = sortedResults(t).map((r) => r.id);
    const panes = [...state.panes];
    let i = ids.indexOf(panes[state.active]);
    do i = (i + d + ids.length) % ids.length; while (panes.length > 1 && panes.includes(ids[i]) && ids.length > 2);
    panes[state.active] = ids[i];
    navigate(panes);
  };
  const toggleGuide = () => {
    state.guide = !state.guide;
    if (wide()) store.set('guide', state.guide ? '1' : '0');
    sync();
  };
  const toggleSplit = () => {
    if (state.panes.length > 1) return navigate([state.panes[state.active]], 0);
    const other = sortedResults(t).find((r) => r.id !== state.panes[0]);
    if (other) navigate([state.panes[0], other.id], 1);
  };
  const reload = () => load(state.active);
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => {});
  };

  el.addEventListener('click', (e) => {
    const variant = e.target.closest('[data-pane-variant]');
    if (variant && variant.dataset.variantResult) {
      const i = Number(variant.dataset.paneVariant), panes = [...state.panes];
      panes[i] = variant.dataset.variantResult;
      return navigate(panes, i);
    }
    const v = e.target.closest('[data-v]')?.dataset.v;
    if (v === 'exhibition') { location.hash = sandtableHref(t, state.panes); return; }
    if (v === 'guide') return toggleGuide();
    if (v === 'split') return toggleSplit();
    if (v === 'controls') return controls.toggle();
    if (v === 'full') return fullscreen();
    if (v === 'prev') return cycle(-1);
    if (v === 'next') return cycle(1);
    const face = e.target.closest('[data-face]');
    if (face) {
      const r = byId(state.panes[state.active]);
      const [, faces, done] = VIEWER_FACES[face.dataset.face];
      face.disabled = true;
      setFaces(t.id, r.id, faces).then(() => { toast(`${done}：${r.title}`); return refreshPlatform('review'); },
        (error) => { toast(error.message); face.disabled = false; });
      return;
    }
    const preset = e.target.closest('[data-preset]');
    if (preset) {
      state.queries[state.active] = preset.dataset.preset;
      load(state.active);
      return sync();
    }
    const close = e.target.closest('[data-close]');
    if (close) {
      const keep = state.panes.filter((_, i) => i !== Number(close.dataset.close));
      return navigate(keep, 0);
    }
    const pane = e.target.closest('[data-pane]');
    if (pane && Number(pane.dataset.pane) !== state.active) {
      state.active = Number(pane.dataset.pane);
      sync();
    }
  });
  el.addEventListener('change', (e) => {
    if (e.target.matches('.vselect')) {
      const panes = [...state.panes];
      panes[state.active] = e.target.value;
      navigate(panes);
    } else if (e.target.matches('[data-pane-pick]')) {
      const i = Number(e.target.dataset.panePick);
      const panes = [...state.panes];
      panes[i] = e.target.value;
      navigate(panes, i);
    }
  });
  // Clicking into a frame does not bubble; focus moving into it marks that pane active.
  const onBlur = () => {
    setTimeout(() => {
      const frame = document.activeElement;
      if (frame?.tagName !== 'IFRAME') return;
      const i = Number(frame.closest('[data-pane]')?.dataset.pane);
      if (state.panes.length > 1 && i !== state.active) { state.active = i; sync(); }
    });
  };
  window.addEventListener('blur', onBlur);
  const onKey = (e) => {
    if (lightbox.isOpen || e.metaKey || e.ctrlKey || e.altKey || e.target.matches('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft') cycle(-1);
    else if (k === 'arrowright') cycle(1);
    else if (k === 'g') toggleGuide();
    else if (k === 's' && many) toggleSplit();
    else if (k === 'f') fullscreen();
    else if (k === 'r') reload();
    else if (k === 'escape' && state.guide && !wide()) toggleGuide();
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);

  return {
    task: t,
    update,
    fullscreen: true,
    // Review state or reactions changed elsewhere; the frames stay as they are.
    onPlatformChange() {
      $('.vselect', el).innerHTML = options();
      $$('[data-pane-pick]', stage).forEach((select) => { select.innerHTML = options(); });
      const panes = state.panes.filter(byId);
      if (!panes.length) { location.hash = taskHref(t); return; }
      if (panes.length !== state.panes.length) return navigate(panes, 0);
      $$('[data-pane-pick]', stage).forEach((select, i) => { select.value = state.panes[i] ?? state.panes[0]; });
      sync();
    },
    destroy() {
      controls.destroy();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
      document.body.classList.remove('is-viewer');
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    },
  };
}

// ---- router ---------------------------------------------------------------------------
function notFound(msg) {
  root.innerHTML = `${header()}<main class="page wrap empty-page"><p class="kicker"><span class="num">404</span></p><h1>找不到页面</h1><p>${esc(msg)}</p><a class="btn primary" href="#/">回到首页${icon('right')}</a></main>`;
}

// Platform pages live in their own modules and need the server; task ids never use these names.
const PLATFORM_PAGES = { arena: './arena.js', leaderboard: './leaderboard.js', new: './publish.js', submit: './submit.js', me: './account.js', review: './account.js' };
const PAGE_TITLES = { arena: '盲评', leaderboard: '榜单', new: '发起题目', submit: '上传作品', me: '个人中心', review: '审核' };
const PAGE_SECTIONS = { arena: 'arena', leaderboard: 'leaderboard', new: 'new', submit: 'questions', me: 'me', review: 'me' };
function platformOffline(name) {
  const missing = platform.connectionError?.kind === 'missing';
  // The page itself explains a version mismatch, so the header notice is not repeated.
  root.innerHTML = `${header([{ text: PAGE_TITLES[name] }], false, PAGE_SECTIONS[name], { notice: false })}<main class="page wrap empty-page">
    <p class="kicker"><span class="num">${esc(PAGE_TITLES[name])}</span></p>
    <h1>${platform.mismatch ? `${esc(PAGE_TITLES[name])}暂时不可用` : missing ? '这里需要平台服务' : '平台连接暂时失败'}</h1>
    <p role="status">${platform.mismatch ? '作品数据与平台服务版本不一致，平台功能已暂停。可能是新版本正在发布，稍后刷新即可恢复；作品可照常浏览。' : missing ? `当前地址没有可用的平台服务。连接后即可使用${esc(PAGE_TITLES[name])}，作品仍可浏览。` : esc(platform.connectionError?.message)}</p>
    <div class="empty-actions">${platform.mismatch ? '<button type="button" class="btn primary" data-reload>刷新页面</button>' : '<button type="button" class="btn primary" data-platform-retry>重新连接</button>'}<a class="btn" href="#/questions">回到题库${icon('right')}</a></div>
  </main>${footer()}`;
  const button = $('[data-platform-retry]', root);
  if (!button) return {};
  const update = () => {
    const seconds = Math.max(0, Math.ceil(((platform.connectionError?.retryAt ?? 0) - Date.now()) / 1000));
    button.disabled = platform.connecting || seconds > 0;
    button.textContent = platform.connecting ? '正在连接…' : seconds ? `${seconds} 秒后可重试` : '重新连接';
  };
  update();
  const timer = setInterval(update, 1000);
  root.onclick = (event) => {
    if (!event.target.closest('[data-platform-retry]') || button.disabled) return;
    void refreshPlatform('reconnect');
    update();
  };
  return { destroy: () => clearInterval(timer) };
}

// ---- the way back ---------------------------------------------------------------------
// A sub-page's way back always leads one level up, the same page its breadcrumb names: on wide
// screens that crumb is the way back, on narrow ones a "返回" takes its place. When the page above
// is earlier in this tab's history, it goes back there for real and keeps its filters and scroll.
const PAGE_NAMES = { questions: '题库', arena: '盲评' };
function placeOf(hash) {
  const [p = '', a] = hash.replace(/^#\/?/, '').split('#')[0].split('/').filter(Boolean).map(decodeURIComponent);
  const t = DATA.tasks.find((x) => x.id === p);
  if (t && !a) return { key: p, name: '题目', up: LIBRARY.href };
  if (t) return { key: a === 'exhibition' || a === 'sandtable' ? `${p}/stage` : `${p}/view`, up: taskHref(t) };
  if (p === 'submit' && DATA.tasks.some((x) => x.id === a)) return { key: `submit/${a}`, up: `#/${a}` };
  if (p === 'arena' && a) return { key: `arena/${a}`, up: '#/arena' };
  // The library's form, domain and model index ride in its address but leave it the same page.
  const key = p === 'questions' ? p : [p, a].filter(Boolean).join('/');
  return { key, name: PAGE_NAMES[p], up: null };
}
// Keep each history entry, including forward entries, so browser traversal keeps its origin and scroll.
const visits = new Map();
let currentVisit = null;
let nextVisit = Date.now();
let back = null;
// Returns the scroll position to restore (the page's own when the reader went back to it) and
// whether this is such a return.
function retrace(from) {
  const here = placeOf(location.hash);
  // The page being left is still on screen, so its address and scroll are taken as it goes.
  if (from && currentVisit) Object.assign(visits.get(currentVisit), { hash: new URL(from).hash || '#/', scroll: scrollY });
  const visit = history.state?.visit;
  let entry = visits.get(visit);
  const returning = entry?.key === here.key;
  if (!returning) {
    // `from` is the history entry just before this one, when this visit followed a link from it.
    nextVisit = Math.max(nextVisit, visit ?? 0);
    entry = { key: here.key, visit: visit ?? ++nextVisit, from: visit ? null : currentVisit, scroll: 0 };
    visits.set(entry.visit, entry);
    if (!visit) history.replaceState({ ...history.state, visit: entry.visit }, '');
  }
  currentVisit = entry.visit;
  entry.hash = location.hash;
  // Each visit's `from` is the history entry just before it, so walking them counts the steps back.
  back = null;
  if (here.up) {
    const above = placeOf(here.up);
    let prev = visits.get(entry.from), steps = 1;
    while (prev && prev.key !== above.key) { prev = visits.get(prev.from); steps++; }
    back = { up: here.up, text: above.name, href: prev?.hash ?? here.up, steps: prev ? steps : 0 };
  }
  return { scroll: returning ? entry.scroll : 0, returning };
}
history.scrollRestoration = 'manual';
const plainClick = (event) => !event.defaultPrevented && !event.button && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
addEventListener('click', (event) => {
  if (!plainClick(event)) return;
  if (back?.steps && event.target.closest('.top-back, .vback, [data-back]')) {
    event.preventDefault();
    history.go(-back.steps);
    return;
  }
  // The exhibition and the sandtable are two views of one place, like the task page's panels.
  const mode = event.target.closest('[data-switch-mode]');
  if (mode) {
    event.preventDefault();
    const from = location.href;
    history.replaceState(history.state, '', mode.getAttribute('href'));
    route({ from });
  }
});
// "返回" names the page above it; the viewers keep it at every width, the other pages on narrow screens.
function backLink(cls) {
  return back ? `<a class="${cls}" href="${esc(back.href)}" title="返回${esc(back.text)}">${icon('prev')}<span class="back-text">返回<span class="back-place">${esc(back.text)}</span></span></a>` : '';
}

// Everything a platform page needs from the gallery.
const context = () => ({ DATA, backLink, MODELS, HARNESSES, PROVIDERS, header, footer, pageStart, sideNav, LIBRARY, pageEnd, label, modelOf, vendorOf, harnessOf, providerOf, sourceLine, cover, coverHtml, resultBadges, exhibitedModels, entryKey, taskHref, viewHref, workKey, interactive, inGallery, settleImages, packagedWork });

// The data pack holds its questions' assets: screenshots, scenes, models and capture conditions.
// The API decides which questions and works are public and holds their current fields; without
// it the pack is shown as an archive. Task and work objects stay the same across merges.
let PACK = new Map();
const tasksById = new Map(), resultsByKey = new Map();
const packagedWork = (task, id) => PACK.get(task)?.works.get(id) ?? null;
// Fields a work keeps when the pack has none for it.
const UNPACKED = { source: null, readme: null, sourceLabel: '', captureNote: '', guide: {}, previewModel: null, previewLoader: null };
function resultOf(pack, w) {
  if (!platform.available) return { ...pack, status: 'verified' };
  return {
    ...(pack ?? UNPACKED),
    id: w.id,
    status: w.status,
    reason: w.reason ?? '',
    author: w.author,
    mine: w.mine,
    model: w.model ?? `x:${w.modelName}`,
    modelName: w.modelName,
    vendorName: w.vendor,
    effort: w.effort ?? '',
    tool: w.tool,
    harness: w.harness,
    harnessName: w.harnessName,
    provider: w.provider,
    providerName: w.providerName,
    promptVariant: w.promptVariant ?? pack?.promptVariant,
    generationMode: w.generationMode,
    humanIntervention: w.humanIntervention,
    note: w.note,
    title: w.title,
    summary: w.summary ?? '',
    addedAt: w.addedAt ?? pack?.addedAt,
    scene: w.scene ?? pack?.scene,
    previewModel: w.previewModel ?? pack?.previewModel ?? null,
    previewPoster: w.previewPoster ?? pack?.previewPoster ?? null,
    previewMode: w.previewMode ?? pack?.previewMode,
    previewCapture: w.previewCapture ?? pack?.previewCapture,
    gallery: pack?.gallery ?? (w.cover ? [{ src: w.cover, caption: '作者提供的封面' }] : []),
    captures: w.captures ?? pack?.captures ?? {},
    files: w.files,
    bytes: w.bytes,
    arena: w.arena,
    aiScore: w.aiScore ?? pack?.aiScore ?? null,
  };
}
function stable(map, key, fresh) {
  const kept = map.get(key);
  if (!kept) { map.set(key, fresh); return fresh; }
  for (const name of Object.keys(kept)) if (!Object.hasOwn(fresh, name)) delete kept[name];
  return Object.assign(kept, fresh);
}
function mergePlatform() {
  const listed = platform.available ? new Map(platform.questions.map((q) => [q.id, q])) : null;
  const ids = [...[...PACK.keys()].filter((id) => !listed || listed.has(id)), ...(listed ? [...listed.keys()].filter((id) => !PACK.has(id)) : [])];
  DATA.tasks = ids.map((id) => {
    const pack = PACK.get(id);
    const works = listed ? platform.works.filter((w) => w.task === id) : [...pack.works.values()];
    // Reference images come from the API when it holds them, otherwise from the pack.
    const own = listed?.get(id)?.references?.length ? listed.get(id) : pack?.task;
    return stable(tasksById, id, {
      ...(pack?.task ?? { id, conditions: [], promptVariants: [] }),
      ...listed?.get(id),
      references: own?.references ?? [],
      referenceCredit: own?.referenceCredit ?? '',
      results: works.map((w) => stable(resultsByKey, `${id}/${w.id}`, resultOf(pack?.works.get(w.id), w))),
    });
  });
}

let page = null;
let routeVersion = 0;
// Following a link is one view transition: the old screen stays up while the new page draws and
// gathers its first data, for at most HOLD, then the two cross-fade. The top bar and the sidebar
// keep their own layers (studio.css), so an unchanged shell stays still. Past HOLD the page shows
// its own loading state and fills in when the data arrives.
const HOLD = 300;
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
// `from` is the address being left; a redraw in place (sign-in, a review) passes none, and the
// first route of a visit passes ''.
async function route({ keepScroll = false, from = null } = {}) {
  const version = ++routeVersion;
  const visit = keepScroll || from === null ? null : retrace(from);
  const scrollBack = keepScroll ? scrollY : visit?.scroll ?? 0;
  let shown;
  if (from && document.startViewTransition && document.visibilityState === 'visible') {
    // A newer route or a theme switch skips this transition; the page is drawn all the same.
    const transition = document.startViewTransition(async () => {
      shown = await show(version, visit, scrollBack);
      await Promise.race([shown?.ready, delay(HOLD)]);
    });
    transition.ready.catch(() => {});
    await transition.updateCallbackDone.catch(() => {});
  } else shown = await show(version, visit, scrollBack);
  if (version !== routeVersion || !shown?.ready) return;
  // A page that loads its data is only as tall as its loading state at first, so the way back
  // lands its scroll again once the data is drawn, unless the reader has scrolled meanwhile.
  const landed = scrollY;
  await shown.ready.catch(() => {});
  if (version !== routeVersion) return;
  settleImages();
  if (shown.scrolls && scrollBack && scrollY === landed) scrollTo(0, scrollBack);
}

// Every address shows one page. A page is whatever its renderer returns, all fields optional:
//   ready             a promise for its first data (route waits on it, see above)
//   fullscreen        it keeps its own scroll
//   onPlatformChange  it redraws itself when the session or reviews change; without it the
//                     router draws the page again in place
//   destroy           it lets go of timers, listeners and frames
// Pages may also set root.on* handlers; tearing a page down clears them.
function teardown() {
  page?.destroy?.();
  page = null;
  root.onclick = root.onchange = root.oninput = root.onsubmit = root.onkeydown = root.onpointerover = root.onfocusin = null;
  lightbox.close();
}

// Tears down the page on screen and draws the one at the address. Resolves to nothing when a
// newer route has taken over.
async function show(version, visit, scrollBack) {
  if (version !== routeVersion) return;
  const parts = location.hash.replace(/^#\/?/, '').split('#')[0].split('/').filter(Boolean).map(decodeURIComponent);
  const [taskId, a, vs, b] = parts;
  const platformPage = Object.hasOwn(PLATFORM_PAGES, taskId ?? '') ? taskId : null;
  const t = platformPage ? null : DATA.tasks.find((x) => x.id === taskId);
  const inExhibition = t && hasExhibition(t) && (a === 'exhibition' || a === 'sandtable');
  const inViewer = t && a && !inExhibition;
  const ids = inViewer ? [a, vs === 'vs' ? b : null].filter(Boolean) : [];
  const works = ids.filter((id, i) => t.results.some((r) => r.id === id) && ids.indexOf(id) === i);

  // The viewer stays up while the address moves between works of its task, so switching one pane
  // does not reload the other.
  if (works.length && page?.task === t) page.update(works);
  else {
    teardown();
    if (!taskId) page = renderLanding(root, context());
    else if (taskId === 'questions') page = renderLibrary(parts.slice(1), Boolean(visit && !visit.returning));
    else if (taskId === 'terms' || taskId === 'privacy') page = renderLegal(root, context(), taskId);
    else if (platformPage) {
      if (!platform.available) page = platformOffline(platformPage);
      else {
        root.innerHTML = `${header([{ text: PAGE_TITLES[platformPage] }], false, PAGE_SECTIONS[platformPage])}<main class="page wrap empty-page"><p class="muted">正在打开…</p></main>`;
        try {
          const module = await import(PLATFORM_PAGES[platformPage]);
          if (version !== routeVersion) return;
          page = module.mount(root, { ...context(), route: platformPage, param: a ?? null });
        } catch (error) {
          const failure = await loadFailure(error, '页面加载失败');
          if (version !== routeVersion) return;
          root.innerHTML = `${header()}<main class="page wrap empty-page"><h1>${failure.title}</h1><p>${esc(failure.text)}</p><div class="empty-actions">${RELOAD}${failure.updated ? '' : '<a class="btn" href="#/">回到首页</a>'}</div></main>`;
        }
      }
    } else if (!t && !initialPlatformSettled) {
      root.innerHTML = `${header([{ text: '题库' }], false, 'questions')}<main class="page wrap empty-page"><p class="muted" role="status">正在载入题目…</p></main>`;
    } else if (!t) notFound(`没有 id 为「${taskId}」的题目。`);
    else if (inExhibition) {
      root.innerHTML = `${galleryStageHeader(t, a)}<main class="page empty-page wrap"><p class="muted">正在打开预览…</p></main>`;
      try {
        const create = a === 'sandtable'
          ? (await import('./sandtable.js')).createSandtable
          : (await import('./exhibition.js')).createExhibition;
        if (version !== routeVersion) return;
        const staged = hostedTask(t);
        const stage = create(root, staged, { label, vendorOf, cover, header: galleryStageHeader(t, a), initial: (vs ?? '').split(',').filter((id) => staged.results.some((r) => r.id === id)) });
        // The 3D views keep the works they opened with; a review elsewhere shows on the next visit.
        page = { destroy: () => stage.destroy(), onPlatformChange() {} };
      } catch (error) {
        const failure = await loadFailure(error, '展厅加载失败');
        if (version !== routeVersion) return;
        root.innerHTML = `<main class="empty-page wrap"><h1>${failure.title}</h1><p>${esc(failure.text)}</p><div class="empty-actions">${RELOAD}${failure.updated ? '' : `<a class="btn" href="${taskHref(t)}">返回作品</a>`}</div></main>`;
      }
    } else if (!inViewer) page = taskPage(t);
    else if (!works.length) notFound(`「${t.title}」下没有 id 为「${a}」的作品。`);
    else {
      page = createViewer(t);
      page.update(works);
    }
  }
  syncThemeUi();
  settleImages();
  const scrolls = !page?.fullscreen;
  if (scrolls) scrollTo(0, scrollBack);
  return { ready: page?.ready, scrolls };
}

// Signing in or out, a review or an upload: merge the new state and redraw what shows it.
onPlatformChange((reason) => {
  mergePlatform();
  refreshAccountControls();
  if (page?.onPlatformChange) return page.onPlatformChange(reason);
  route({ keepScroll: true });
});

try {
  const bootstrap = requestBootstrap();
  bootstrap.catch(() => {});
  const res = await fetch('data.json', { cache: 'no-cache' });
  if (res.status === 429) {
    const error = new Error('请稍后刷新页面。');
    error.status = 429;
    throw error;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  DATA = await res.json();
  PACK = new Map(DATA.tasks.map(({ results, ...task }) => [task.id, { task, works: new Map(results.map((r) => [r.id, r])) }]));
  // 媒体缓存钥匙：数据包提交号前 8 位，nginx 长缓存依赖它换包失效。
  globalThis.SAME_PROMPT_CONFIG.assetVersion ??= DATA.buildInfo?.datapack?.slice(0, 8) ?? '';
  MODELS = new Map(DATA.models.map((m) => [m.id, m]));
  resolveModel = modelResolver(DATA.models);
  HARNESSES = new Map((DATA.harnesses ?? []).map((h) => [h.id, h]));
  PROVIDERS = new Map([['official', { id: 'official', name: '官方', listed: true }], ['unofficial', { id: 'unofficial', name: '非官方', listed: true }]]);
  mergePlatform();
  const platformConnection = connectPlatform(DATA.buildInfo, bootstrap);
  platformConnection.catch(() => {});
  addEventListener('hashchange', (event) => route({ from: event.oldURL }));
  await route({ from: '' });
  await window.ArenaEntry?.ready(root);
  await platformConnection;
  initialPlatformSettled = true;
  if (!platform.available && resultSort === 'score') resultSort = 'added';
  mergePlatform();
  await route({ keepScroll: true });
  startPlatformRecovery();
} catch (err) {
  window.ArenaEntry?.fail();
  root.innerHTML = err.status === 429
    ? `<main class="wrap empty-page"><h1>访问较频繁</h1><p>${esc(err.message)}</p></main>`
    : `<main class="wrap empty-page"><h1>数据加载失败</h1><p>${esc(err.message)}</p><p>本地查看请先运行 <code>npm run build</code>，再用 <code>npm start</code> 打开。</p></main>`;
}
