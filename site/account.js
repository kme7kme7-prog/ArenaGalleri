import { setPageTitle } from './i18n.js';
// Personal center (#/me), and the admin review queue (#/review[/<tab>]).
import { $, $$, brandMark, esc, formatBytes, formatDate, formatTime, icon, img } from './ui.js';
import { memberChips, memberList, memberResults, membersState, openMember } from './member-management.js';
import { accountVersion, api, apiRemembered, arenaText, autoRejected, avatarFace, byStaff, canDecide, levelBadge, levelOf, confirmDialog, injected, isSenior, isStaff, moderationBadge, openBindEmail, openDialog, platform, QUESTION_LABELS, recall, refreshPlatform, requireUser, reviewCount, reviewVerdict, riskLabels, ROLE_LABELS, setFaces, statusBadge, toast, updateRememberedReviewWork } from './platform.js';
import { effortOptions, onWorkFieldChange, readWorkFields, workFieldsHtml } from './work-fields.js';
import { openWorkManagement } from './work-management.js';
import { CATEGORIES, categoryLabel, domainsOf, matchesQuery } from './categories.js';
import { categoryField, domainField, syncDomains } from './question-fields.js';
import { referenceEditor, referenceSheet, referencesEnabled } from './references.js';
import { moderated, pendingLimit, stageTrack } from './submit.js';
import { sticker, stickerName } from './stickers.js';
import { lineDiff } from './line-diff.js';

// The review queue runs one pipeline: 题目审核 → 内容审核 → 作品核验. The first group only
// counts what needs a person; the second lists what has been decided; the third manages every
// question and work. Questions belong to senior admins; moderators manage works too.
const TODO_TABS = { questions: '题目', content: '内容', unverified: '核验' };
const DONE_TABS = { done: '已处理', log: '记录' };
const MANAGE_TABS = { catalog: '全部题目', works: '全部作品', members: '全部成员' };
const todoTabs = () => Object.fromEntries(Object.entries(TODO_TABS).filter(([id]) => id !== 'questions' || isSenior()));
const manageTabs = () => Object.fromEntries(Object.entries(MANAGE_TABS).filter(([id]) => id === 'works' || isSenior()));
// Decided uploads by what they show now; each filter answers one question an admin asks.
const DONE_FILTERS = { all: '全部', public: '已公开', noarena: '不进盲评', off: '已撤下', questioned: '存疑', rejected: '已拒绝', machine: '机审拒绝', injection: '疑似注入' };
// Addresses that open the decided list on one filter, including the old decided tabs.
const FILTER_TABS = { verified: 'public', off: 'off', questioned: 'questioned', rejected: 'rejected', noarena: 'noarena', machine: 'machine', injection: 'injection' };
const ME_TABS = { overview: '概览', works: '我的作品', questions: '我的题目' };
const ACCOUNT = { title: '个人中心', description: '每一道提问，每一份解答，都是你的创作足迹。' };
const accountKey = () => `${accountVersion()}:${platform.user?.id ?? ''}:${platform.user?.role ?? ''}`;
const ACTIONS = { submit: '提交作品', verified: '通过核验', questioned: '标记存疑', unverified: '退回未验证', delete: '下架作品', 'delete-followup': '下架后处理',
  'question-create': '发起题目', 'question-review': '审核题目', 'question-edit': '编辑题目', 'question-resubmit': '重新提交题目', 'question-delete': '删除题目',
  'content-review': '内容审核', 'content-retry': '重新自动审核', meta: '编辑信息', 'face-settings': '调整展示设置', role: '调整角色' };

export function mount(root, ctx) {
  return ctx.route === 'review' ? review(root, ctx) : mine(root, ctx);
}

// Every personal-center page keeps this sidebar; the review queue is one of its views.
function accountNav(ctx, current) {
  return ctx.sideNav('个人中心', [
    ['#/me', 'user', ME_TABS.overview, current === 'overview'],
    ['#/me/works', 'grid', ME_TABS.works, current === 'works'],
    ['#/me/questions', 'text', ME_TABS.questions, current === 'questions'],
    ...(isStaff() ? [['#/review', 'shield', '审核', current === 'review', reviewCount() || undefined]] : []),
  ]);
}

function thumb(ctx, w, { link = true } = {}) {
  const src = Object.values(w.captures ?? {})[0] ?? w.cover;
  const inner = src ? img(src, '') : `<span class="img-empty upload-cover"><b data-i18n-ignore>${esc(w.title)}</b></span>`;
  return link
    ? `<a class="work-thumb" href="#/${esc(w.task)}/${esc(w.id)}" tabindex="-1" aria-hidden="true">${inner}</a>`
    : `<span class="work-thumb" aria-hidden="true">${inner}</span>`;
}

function reactionSummary(w) {
  const counts = platform.reactions.counts[`${w.task}/${w.id}`] ?? {};
  const entries = platform.site.emojis.filter((emoji) => counts[emoji]).map((emoji) => [emoji, counts[emoji]]);
  return entries.length ? `<span class="reaction-sum">${entries.map(([emoji, n]) => `<span title="${stickerName(emoji)}">${sticker(emoji)}<b>${n}</b></span>`).join('')}</span>` : '';
}

// What a held work or question means for its author, by moderation status.
const HELD = {
  work: {
    pending: '内容审核中，通过前只有你能看到。',
    review: '等待管理员人工复核，通过前只有你能看到。',
    rejected: '内容审核未通过，作品不会公开。可以删除后重新上传。',
  },
  question: {
    pending: '新题目由管理员人工审核，通过前只有你能看到；附带示例结果时，它的审核进度在「我的作品」里。',
    review: '管理员正在复核，通过前只有你能看到。',
    rejected: '审核未通过，题目不会公开。',
  },
};
const held = (item) => Boolean(HELD.work[item.moderation?.status]);
const dateHtml = (value) => `<time data-i18n-date="${esc(value)}">${formatDate(value)}</time>`;
const timeHtml = (value) => `<time data-i18n-time="${esc(value)}">${formatTime(value)}</time>`;
const sourceHtml = (ctx, w) => [ctx.harnessOf(w)?.name ? `<span data-i18n-ignore>${esc(ctx.harnessOf(w).name)}</span>` : '', ctx.providerOf(w)?.name ? `<span>${esc(ctx.providerOf(w).name)}</span>` : ''].filter(Boolean).join(' · ');
// What an admin needs about a held work: the automatic or human verdict and any error code.
function contentNote(w) {
  if (!held(w)) return '';
  const m = w.moderation;
  const parts = [autoRejected(m) ? `<span>${injected(m) ? '自动拒绝 · 提示词注入' : '自动拒绝'}</span>` : '',
    m.reason ? `<span data-i18n-ignore>${esc(m.reason)}</span>` : '',
    m.categories?.length ? `<span>类别：</span>${riskLabels(m.categories).map((label) => `<span>${esc(label)}</span>`).join(' · ')}` : '',
    m.error ? `<span>错误：</span><span data-i18n-ignore>${esc(m.error)}</span>` : ''].filter(Boolean);
  const text = parts.join(' · ') || (m.status === 'pending' ? '<span>自动审核进行中</span>' : '');
  return text ? `<p class="result-reason">${icon(m.status === 'rejected' ? 'alert' : 'guide')}${text}</p>` : '';
}
function heldNote(kind, item) {
  const status = item.moderation?.status;
  const hint = HELD[kind][status];
  if (!hint) return '';
  const reason = status === 'rejected' && item.moderation.reason ? `<span>原因：</span><span data-i18n-ignore>${esc(item.moderation.reason)}</span>` : '';
  return `<p class="result-reason">${icon(status === 'rejected' ? 'alert' : 'clock')}<span>${esc(hint)}</span>${reason}</p>`;
}

// Where an upload stands for its author: the stages it passes, where it is, and what that means.
// group sorts it under the 我的作品 filters.
const AUTHOR_GROUPS = { held: '审核中', waiting: '等待核验', verified: '已验证', issue: '存疑 / 未通过' };
function authorStage(w, questions) {
  const question = questions.find((q) => q.id === w.task);
  const asked = question?.moderation?.status;
  const content = w.moderation?.status;
  const stages = [
    // Staff uploads skip content moderation.
    ...(!byStaff(w) && (moderated() || (content && content !== 'legacy')) ? ['内容审核'] : []),
    ...(asked && asked !== 'legacy' ? ['题目审核'] : []),
    '等待核验', w.status === 'questioned' ? '存疑' : '已验证'];
  const at = (label) => stages.indexOf(label);
  const auto = platform.site.autoModeration !== false;
  const days = Math.floor((Date.now() - Date.parse(w.addedAt)) / 864e5);
  const stage = (label, group, badge, note, failed = false) => ({ stages: stages.map((s) => [s, '']), current: at(label), group, badge, note, failed });
  if (content === 'pending') return stage('内容审核', 'held', '内容审核中', auto ? '自动检查内容，通常几分钟，通过前只有你能看到。' : '管理员检查内容，通过前只有你能看到。');
  if (content === 'review') return stage('内容审核', 'held', '等待人工复核', HELD.work.review);
  if (content === 'rejected') return { ...stage('内容审核', 'issue', '内容未通过', '', true), noteHtml: `<span>作品不会公开。</span>${w.moderation.reason ? `<span>原因：</span><span data-i18n-ignore>${esc(w.moderation.reason)}</span>。` : ''}<span>可以删除后修改，再重新上传。</span>` };
  if (['pending', 'review'].includes(asked)) return stage('题目审核', 'held', '题目审核中', '所属题目正在人工审核，通过后作品进入核验流程，届时可以编辑信息。');
  if (asked === 'rejected') return stage('题目审核', 'issue', '题目未通过', '所属题目没有通过审核，作品不会公开。', true);
  if (w.status === 'questioned') return { ...stage('存疑', 'issue', '存疑', '', true), noteHtml: `<span>核验存疑</span>${w.reason ? `：<span data-i18n-ignore>${esc(w.reason)}</span>` : ''}。<span>存疑作品不能再修改，可以删除后重新上传。</span>` };
  if (w.status === 'verified') return { ...stage('已验证', 'verified', '已验证', ''), noteHtml: `${w.reviewedAt ? `${dateHtml(w.reviewedAt)} ` : ''}<span>已通过核验</span> · <span>${faceOn(w) ? '已公开' : '已被管理员撤下'}</span>${faceOn(w) && arenaText(w.arena) ? ` · <span>${arenaText(w.arena)}</span>` : ''}`, current: stages.length };
  return { ...stage('等待核验', 'waiting', '等待核验', ''), noteHtml: `<span>等待管理员核对生成信息，公开展示以人工审核和展示设置为准。</span>${days > 0 ? `<span>已等待 ${days} 天。</span>` : ''}` };
}

// Where an upload sits in the review queue. Content comes first; verification needs released
// content and a public question, and a pending question's sample stays with its question.
function reviewBucket(ctx, w, questions = []) {
  const question = questions.find((q) => q.id === w.task);
  if (question?.moderation?.status === 'rejected') return 'rejected';
  const status = w.moderation?.status;
  if (status === 'review') return 'content';
  if (status === 'pending') return 'auto';
  if (status === 'rejected') return 'rejected';
  // Moderators do not see questions, so a sample of an unknown question stays with it.
  if (!ctx.DATA.tasks.some((t) => t.id === w.task)) return question || !isSenior() ? 'sample' : 'rejected';
  if (w.status === 'questioned') return 'questioned';
  if (w.reviewed ? !w.reviewed.gallery : w.status === 'unverified') return 'unverified';
  if (w.status === 'verified' && faceOn(w)) return 'verified';
  return 'off';
}
const galleryOn = (w) => Boolean(w.show_gallery ?? ['show2', 'both'].includes(w.audience));
const faceOn = (w) => galleryOn(w) || Boolean(w.show_arena ?? ['show1', 'both'].includes(w.audience));
// One sentence for where a decided upload shows now.
const doneLine = (w) => (faceOn(w) ? `已公开${galleryOn(w) ? '' : '（未上展览馆）'} · ${arenaText(w.arena) || '不进盲评'}` : '已撤下：展览馆和盲评都不显示');
const doneHtml = (w) => faceOn(w) ? `<span>已公开</span>${galleryOn(w) ? '' : '<span>（未上展览馆）</span>'} · <span>${arenaText(w.arena) || '不进盲评'}</span>` : '<span>已撤下：展览馆和盲评都不显示</span>';
// The face switches behind the row actions and the dialog's take-down: [button, faces, toast].
const FACE_ACTIONS = {
  'arena-on': ['开启盲评', { show_arena: true }, '已开启盲评'],
  'arena-off': ['移出盲评', { show_arena: false }, '已移出盲评'],
  'gallery-on': ['公开到展览馆', { show_gallery: true }, '已公开到展览馆'],
  restore: ['恢复公开', { show_gallery: true, show_arena: true }, '已恢复公开'],
  hide: ['撤下', { show_gallery: false, show_arena: false }, '已撤下'],
};
// Ids repeat across tasks, so every work is keyed by task/id.
const pickId = (w) => `${w.task}/${w.id}`;
const faceButton = (w, action, primary = false) => `<button class="btn sm${primary ? ' primary' : ''}" data-face="${action}" data-work="${esc(pickId(w))}">${FACE_ACTIONS[action][0]}</button>`;
const pickBox = (id, title, picked) => `<label class="row-pick"><input type="checkbox" data-pick="${esc(id)}"${picked ? ' checked' : ''} aria-label="选择「${esc(title)}」"></label>`;
// Who published a work or question, for staff: members by name, staff by name and role.
const publisher = (ctx, item) => (byStaff(item) ? `${item.author?.name ?? ctx.DATA.title} · ${ROLE_LABELS[item.author?.role ?? 'admin']}` : item.author.name ?? '已注销的用户');
const publisherHtml = (ctx, item) => `<span data-i18n-ignore>${esc(item.author?.name ?? (byStaff(item) ? ctx.DATA.title : ''))}</span>${byStaff(item) ? ` · <span>${ROLE_LABELS[item.author?.role ?? 'admin']}</span>` : item.author?.name ? '' : '<span>已注销的用户</span>'}`;
// What the admin does next with a work, by bucket; one primary action per row. A moderator's
// own work opens read-only, for another admin to decide; only senior admins delete.
function adminAction(w, bucket) {
  const id = esc(pickId(w));
  const details = `<button class="btn sm ghost" data-review="${id}">详情</button>`;
  if (!canDecide(w)) return details;
  const arena = w.arena?.state === 'in_pool' ? faceButton(w, 'arena-off') : w.arena?.state === 'off' ? faceButton(w, 'arena-on', true) : '';
  return {
    content: `<button class="btn sm primary" data-content="${id}">审核内容</button>`,
    auto: `<button class="btn sm" data-content="${id}">人工审核</button>`,
    rejected: `${w.moderation?.status === 'rejected' && canDecide(w) ? `<button class="btn sm" data-content="${id}">重新审核内容</button>` : ''}${isSenior() ? `<button class="icon-btn" data-delete="${id}" title="下架作品" aria-label="下架「${esc(w.title)}」">${icon('trash')}</button>` : ''}`,
    unverified: `<button class="btn sm primary" data-review="${id}">核验</button>`,
    verified: `${details}${arena}`,
    off: `${details}${faceButton(w, 'restore', true)}`,
    questioned: `<button class="btn sm" data-review="${id}">重新核验</button>`,
  }[bucket] ?? '';
}

// questions: questions not in the public catalogue, for titles and review state.
// bucket: set on the admin review queue (see reviewBucket). picked: whether the row's batch
// checkbox is ticked; rows outside a batchable queue have none.
function workRow(ctx, w, { bucket = null, questions = [], picked } = {}) {
  const admin = Boolean(bucket);
  const task = ctx.DATA.tasks.find((t) => t.id === w.task);
  const model = ctx.modelOf({ model: w.model, modelName: w.modelName, vendor: w.vendor });
  // Works absent from the public catalog open the server-provided owner/admin preview.
  const hidden = !ctx.inGallery(w.task, w.id);
  const variant = task?.promptVariants?.find((v) => v.id === w.promptVariant);
  const mine = admin ? null : authorStage(w, questions);
  const tone = { held: 'unverified', waiting: 'unverified', issue: 'questioned', verified: 'verified' }[mine?.group];
  const href = hidden ? esc(w.scene) : `#/${esc(w.task)}/${esc(w.id)}`;
  return `<article class="work-row${picked === undefined ? '' : ' is-pickable'}" data-status="${w.status}">
    ${picked === undefined ? '' : pickBox(pickId(w), w.title, picked)}
    ${thumb(ctx, w, { link: false })}
    <div class="work-main">
      <p class="result-model">${brandMark(model, 'brand-mark sm')}<b data-i18n-ignore>${esc(w.modelName)}</b>${w.effort ? `<span class="badge" data-i18n-ignore>${esc(w.effort)}</span>` : ''}${mine
        ? `<span class="status status-${tone}">${icon({ issue: 'alert', verified: 'check' }[mine.group] ?? 'clock')}${mine.badge}</span>`
        : `${moderationBadge(w.moderation, HELD.work[w.moderation?.status])}${statusBadge(w.status, { always: true, reason: w.reason })}`}</p>
      <h3><a href="${href}"${hidden ? ' target="_blank" rel="noopener"' : ''} data-i18n-ignore>${esc(w.title)}</a></h3>
      <p class="work-meta"><span data-i18n-ignore>${esc(task?.title ?? questions.find((q) => q.id === w.task)?.title ?? w.task)}</span>${variant ? ` · <span data-i18n-ignore>${esc(variant.label)}</span>` : ''}${ctx.sourceLine(w) ? ` · ${sourceHtml(ctx, w)}` : w.tool ? ` · 作者原始声明：<span data-i18n-ignore>${esc(w.tool)}</span>` : ''}${w.addedAt ? ` · ${dateHtml(w.addedAt)}` : ''}${admin ? ` · ${publisherHtml(ctx, w)}` : ''}</p>
      ${mine
        ? `${stageTrack(mine.stages, mine.current, { row: true, compact: true, failed: mine.failed })}<p class="result-reason">${icon(mine.failed ? 'alert' : mine.group === 'verified' ? 'check' : 'clock')}<span>${mine.noteHtml ?? esc(mine.note)}</span></p>`
        : `${contentNote(w) || (bucket === 'rejected' ? `<p class="result-reason">${icon('alert')}<span>所属题目未通过审核，作品不会公开。</span></p>` : '')}
      ${['verified', 'off'].includes(bucket) ? `<p class="result-reason">${icon(bucket === 'off' ? 'alert' : 'check')}<span>${doneHtml(w)}</span></p>` : ''}
      ${w.reason ? `<p class="result-reason">${icon('alert')}<span data-i18n-ignore>${esc(w.reason)}</span></p>` : ''}`}
    </div>
    <div class="work-side">
      ${reactionSummary(w)}
      <div class="actions">
        ${admin
          ? adminAction(w, bucket)
          : `${w.status === 'unverified' && task ? `<button class="btn sm" data-edit-work="${esc(pickId(w))}">编辑信息</button>` : ''}<button class="icon-btn" data-delete="${esc(pickId(w))}" title="下架作品" aria-label="下架「${esc(w.title)}」">${icon('trash')}</button>`}
      </div>
    </div>
  </article>`;
}

// Authors correct their own description until an admin has reviewed the work.
function editWork(ctx, w) {
  const task = ctx.DATA.tasks.find((t) => t.id === w.task);
  const sheet = openDialog({
    title: '编辑作品信息',
    className: 'edit-work-sheet',
    body: `<form class="submit-form" data-edit-form novalidate>
      <p class="sheet-text"><span>核验通过前可以修改。</span> ${platform.site.contentModeration ? '<span>改动文字后会重新做内容审核，审核期间作品暂不公开。</span>' : ''}</p>
      ${workFieldsHtml(ctx, task, w)}
      <p class="form-error" role="alert"></p>
      <div class="sheet-actions"><button class="btn" type="button" data-sheet-close>取消</button><button class="btn primary" type="submit">保存</button></div>
    </form>`,
  });
  const form = $('[data-edit-form]', sheet.el);
  form.addEventListener('change', (e) => onWorkFieldChange(form, e.target));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('.form-error:not(.field-error)', form);
    error.textContent = '';
    const { body, error: problem } = readWorkFields(form, task);
    if (!body) return void (error.textContent = problem);
    const button = $('[type="submit"]', form);
    button.disabled = true;
    try {
      await api(`works/${encodeURIComponent(w.task)}/${encodeURIComponent(w.id)}`, { method: 'PATCH', body });
      sheet.close();
      toast('作品信息已保存');
      await refreshPlatform('edit');
    } catch (err) {
      error.textContent = err.message;
      button.disabled = false;
    }
  });
}

async function removeWork(w, { admin, onChanged }) {
  const owner = accountKey();
  const verified = w.status === 'verified';
  const ok = await confirmDialog({
    title: '下架这件作品？',
    message: `「${w.title}」会从展厅和盲评中下架。${verified ? '已计入的盲评票继续保留在榜单中；' : ''}没有对局记录的作品会同时删除文件。${admin ? '操作会记入审核记录。' : ''}`,
    confirm: '下架',
    danger: true,
  });
  if (!ok || owner !== accountKey()) return false;
  try {
    await api(`works/${encodeURIComponent(w.task)}/${encodeURIComponent(w.id)}`, { method: 'DELETE' });
    if (owner !== accountKey()) return true;
    onChanged?.();
    toast('作品已下架');
    await refreshPlatform('delete');
    return true;
  } catch (error) {
    toast(error.message);
    return false;
  }
}

function signedOut(root, ctx, text) {
  root.innerHTML = `${ctx.pageStart({ ...ACCOUNT, section: 'me', heading: '审核', crumbs: [{ text: '个人中心', href: '#/me' }, { text: '审核' }] })}<section class="account-empty">
    ${icon('user')}<h2>${esc(text)}</h2>
    <p>登录后，你上传的作品和核验结果会显示在这里。</p>
    <div class="actions"><button class="btn primary" data-auth="login">登录 / 注册</button><a class="btn" href="#/questions">回到题库</a></div>
  </section>${ctx.pageEnd()}`;
}

// A question held by moderation has no public page yet, so it is shown without links. A rejected
// question the server lets its author resubmit opens the publishing form; a resubmitted one keeps
// the reason it answers.
function questionRow(ctx, question) {
  const task = ctx.DATA.tasks.find((item) => item.id === question.id);
  const works = task?.results.filter(ctx.interactive).length ?? 0;
  const hidden = held(question);
  const m = question.moderation ?? {};
  const again = m.status === 'pending' && m.round > 1;
  const resubmit = m.status === 'rejected' && question.resubmittable;
  const note = m.status === 'rejected'
    ? `${m.reason ? reviewVerdict(m) : ''}<p class="result-reason">${icon('guide')}<span>${resubmit ? '按意见修改后可以重新提交，题目和示例结果都会保留。' : '这道题公开过，不能修改后重新提交。'}</span></p>`
    : again ? `<p class="result-reason">${icon('clock')}<span>已重新提交，管理员会对照上次意见审核。通过前只有你能看到。</span></p>${m.previous?.reason
      ? `<details class="prompt-peek question-previous"><summary>${icon('guide')}上次审核意见${m.previous.at ? ` · ${dateHtml(m.previous.at)}` : ''}</summary><p data-i18n-ignore>${esc(m.previous.reason)}</p></details>` : ''}`
      : heldNote('question', question);
  return `<article class="submission-question${resubmit ? ' can-resubmit' : ''}">
    <span class="submission-question-mark" aria-hidden="true">${icon('text')}</span>
    <div class="submission-question-body"><h3>${hidden ? `<span data-i18n-ignore>${esc(question.title)}</span>` : `<a href="#/${esc(question.id)}" data-i18n-ignore>${esc(question.title)}</a>`}${moderationBadge(m, HELD.question[m.status], QUESTION_LABELS)}${again ? `<span class="badge">第 ${m.round} 次提交</span>` : ''}</h3>
      <p class="summary" data-i18n-ignore>${esc(question.summary)}</p>
      <p class="work-meta">${[categoryLabel(question.category), ...domainsOf(question)].filter(Boolean).map((label) => `<span>${esc(label)}</span>`).join(' · ')}<span>${esc(question.date)}${hidden ? '' : ` · ${works} 件作品`}</span></p>
      ${note}
    </div><div class="actions">${hidden ? '' : `<a class="btn sm" href="#/${esc(question.id)}">查看题目${icon('next')}</a>`}${resubmit ? `<a class="btn sm primary" href="#/new/${encodeURIComponent(question.id)}">修改后重新提交${icon('next')}</a>` : ''}${works && !hidden ? '' : `<button class="icon-btn" data-delete-question="${esc(question.id)}" title="删除题目" aria-label="删除「${esc(question.title)}」">${icon('trash')}</button>`}</div>
  </article>`;
}

async function removeQuestion(question) {
  const ok = await confirmDialog({
    title: '删除这道题？',
    message: `「${question.title}」会被删除，无法恢复。未公开的题目会连同示例结果一起撤回；已经有人作答的题目不能删除。`,
    confirm: '删除',
    danger: true,
  });
  if (!ok) return false;
  try {
    await api(`questions/${encodeURIComponent(question.id)}`, { method: 'DELETE' });
    toast('题目已删除');
    await refreshPlatform('question');
    return true;
  } catch (error) {
    toast(error.message);
    return false;
  }
}

function activityCalendar(activity) {
  const counts = new Map(activity.days.map((day) => [day.date, day.count]));
  const start = new Date(`${activity.from}T00:00:00Z`);
  const end = Date.parse(`${activity.to}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const weeks = [];
  let previousMonth = -1;
  for (let time = start.getTime(); time <= end; time += 7 * 86400000) {
    const month = new Date(Math.max(time, Date.parse(`${activity.from}T00:00:00Z`))).getUTCMonth();
    const monthLabel = month !== previousMonth ? `${month + 1}月` : '';
    previousMonth = month;
    const cells = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(time + index * 86400000).toISOString().slice(0, 10);
      const count = counts.get(date) ?? 0;
      const level = count === 0 ? 0 : count === 1 ? 1 : count < 4 ? 2 : count < 8 ? 3 : 4;
      return `<span class="activity-day${date < activity.from || date > activity.to ? ' outside' : ''}" data-level="${level}" title="${date} · ${count} 次活跃"></span>`;
    }).join('');
    weeks.push(`<div class="activity-week"><span class="activity-month">${monthLabel}</span>${cells}</div>`);
  }
  return `<div class="activity-scroll"><div class="activity-calendar" role="img" aria-label="${activity.from} 至 ${activity.to}，${activity.activeDays} 天活跃，共 ${activity.total} 次参与。日期按北京时间统计。">
    <div class="activity-week activity-weekdays"><span></span><span>一</span><span></span><span>三</span><span></span><span>五</span><span></span><span>日</span></div>${weeks.join('')}
  </div></div>`;
}

// What the account's level means for it: counting, and the way up for a Lv0 member.
function levelLine(user) {
  const level = levelOf(user);
  const since = user.levelSince ? `<time data-i18n-date="${esc(user.levelSince)}">${esc(formatDate(user.levelSince))}</time>` : '';
  const badge = `<span class="sr">等级 ${level}</span>${levelBadge(level)}`;
  if (level === 0) {
    const doing = platform.qualification;
    return `<p class="profile-level">${badge} · <span>你的选择计入大众榜。通过资格考试可升为 Lv1：可以发起题目，选择也计入精选榜。</span> <a class="btn sm" href="#/exam">${doing ? `继续考试 ${doing.activeAnswered}/${doing.questionCount}` : '去考试'}${icon('right')}</a></p>`;
  }
  if (level === 1) {
    const how = user.levelSource === 'exam' ? `<span>通过资格考试</span>` : user.levelSource === 'admin' ? '<span>由管理员设为 Lv1</span>' : '';
    return `<p class="profile-level">${badge}${how ? ` · ${since ? `${since} ` : ''}${how}` : ''} · <span>选择计入大众榜与精选榜</span></p>`;
  }
  return `<p class="profile-level">${badge}</p>`;
}

function profileOverview(state) {
  const user = platform.user;
  const name = user.nickname || user.name;
  const activity = state.activity;
  const received = state.receivedReactions;
  return `<section class="profile-settings" aria-label="个人资料">
    ${platform.site?.avatars?.length
      ? `<button class="avatar profile-avatar" type="button" data-edit-avatar aria-label="更换头像" title="更换头像">${avatarFace(user.avatar, name)}<span class="avatar-change" aria-hidden="true">更换</span></button>`
      : `<span class="avatar profile-avatar" role="img" aria-label="${esc(name)}的头像">${avatarFace(user.avatar, name)}</span>`}
    <div class="profile-main">${state.editing ? `<form class="profile-form" data-profile-form>
        <label class="field-label" for="profile-nickname">昵称</label>
        <div class="profile-name-row"><input class="input" id="profile-nickname" name="nickname" value="${esc(name)}" required maxlength="24" autocomplete="nickname"><button class="btn primary" type="submit">保存</button><button class="btn" type="button" data-edit-cancel>取消</button></div>
        <p class="form-error" data-profile-error role="alert" hidden></p>
      </form>` : `<p class="profile-name"><b data-i18n-ignore>${esc(name)}</b><button class="btn sm ghost" type="button" data-edit-name>编辑昵称</button></p>`}
      <p class="profile-account"><span>登录账号</span> <span data-i18n-ignore>${esc(user.name)}</span>${state.joinedAt ? ` · <span>加入</span> ${dateHtml(state.joinedAt)}` : ''}</p>
      ${levelLine(user)}
    </div><button class="link profile-logout" type="button" data-logout>退出登录</button>
  </section>
  <section class="profile-bindings" aria-labelledby="bindings-title">
    <div class="profile-section-head"><h2 id="bindings-title">账号绑定</h2><p>注册时绑定，用于找回密码与账号安全验证，可随时更换</p></div>
    <div class="binding-list">
      <div class="binding-row"><span class="binding-icon">${icon('mail')}</span><div class="binding-main"><b>邮箱</b><span>${state.email === undefined ? '正在载入…' : state.email ? esc(maskEmail(state.email)) : '未绑定 · 绑定后才能上传和发起题目'}</span></div>
        <button class="btn sm" type="button" data-bind="email"${state.email === undefined ? ' disabled' : ''}>${state.email ? '更换' : '绑定'}</button></div>
    </div>
  </section>
  <section class="profile-activity" aria-labelledby="activity-title">
    <div class="profile-section-head"><h2 id="activity-title">活跃热力图</h2><p>近一年 <b>${activity ? activity.total : '—'}</b> 次参与 · <b>${activity ? activity.activeDays : '—'}</b> 天活跃</p></div>
    ${activity ? activityCalendar(activity) : `<p class="muted">${state.error ? '活跃记录暂时未能载入。' : '正在载入活跃记录…'}</p>`}
    <div class="activity-foot"><p>发起题目、提交作品、盲评与送出表情 · 北京时间</p><div class="activity-legend" aria-hidden="true">少${[0, 1, 2, 3, 4].map((level) => `<span class="activity-day" data-level="${level}"></span>`).join('')}多</div></div>
  </section>
  <section class="profile-reactions" aria-labelledby="received-title">
    <div><h2 id="received-title">获得的表情</h2><p>作品收到了 <b>${received ? received.total : '—'}</b> 个回应</p></div>
    <div class="received-emojis">${platform.site.emojis.map((emoji) => `<div class="received-emoji" title="${stickerName(emoji)}">${sticker(emoji)}<b>${received ? received.counts[emoji] ?? 0 : '—'}</b></div>`).join('')}</div>
  </section>`;
}

const AVATAR_NAMES = { teapot: '茶壶', bunny: '兔子', cube: '立方体', cursor: '光标', ghost: '小幽灵', donut: '甜甜圈', brackets: '代码括号', frame: '画框',
  seal: '印章', moon: '月亮', robot: '机器人', cat: '猫', plant: '盆栽', bulb: '灯泡', dice: '骰子', planet: '行星' };

// The avatar library opens from the profile picture; a pick is saved to the account.
function pickAvatar() {
  let chosen = platform.user.avatar;
  const sheet = openDialog({
    title: '更换头像',
    className: 'avatar-sheet',
    body: `<p class="sheet-text">从展馆的小住客里挑一位，它会代替你出现在菜单、个人中心和你发起的题目上。</p>
      <div class="avatar-picks">${platform.site.avatars.map((id) => `<button class="avatar-pick" type="button" data-avatar="${esc(id)}" aria-pressed="${id === chosen}" aria-label="${esc(AVATAR_NAMES[id] ?? id)}" title="${esc(AVATAR_NAMES[id] ?? id)}">${avatarFace(id)}</button>`).join('')}</div>
      <p class="form-error" data-avatar-error role="alert" hidden></p>
      <div class="sheet-actions"><button class="btn" type="button" data-sheet-close>取消</button><button class="btn primary" type="button" data-avatar-save>使用这个头像</button></div>`,
  });
  sheet.el.addEventListener('click', async (e) => {
    const pick = e.target.closest('[data-avatar]');
    if (pick) {
      chosen = pick.dataset.avatar;
      $$('[data-avatar]', sheet.el).forEach((button) => button.setAttribute('aria-pressed', String(button === pick)));
      return;
    }
    const save = e.target.closest('[data-avatar-save]');
    if (!save) return;
    if (chosen === platform.user?.avatar) return sheet.close();
    save.disabled = true;
    save.textContent = '保存中…';
    try {
      await api('me', { method: 'PATCH', body: { avatar: chosen } });
      sheet.close();
      await refreshPlatform('profile');
      toast('头像已更换');
    } catch (error) {
      const line = $('[data-avatar-error]', sheet.el);
      line.textContent = error.message;
      line.hidden = false;
      save.disabled = false;
      save.textContent = '使用这个头像';
    }
  });
}

// a***@example.com: the profile only shows a masked address.
const maskEmail = (email) => {
  const at = email.indexOf('@');
  return at <= 0 ? email : `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
};

// The server decides which works count against the cap (me.pending); admins have none.
function uploadQuota(works) {
  const cap = isStaff() ? 0 : pendingLimit();
  const used = platform.me?.pending ?? works.filter((w) => w.status === 'unverified').length;
  const full = Boolean(cap) && used >= cap;
  const hint = full
    ? `你已有 ${used} 件作品在等待核验，已达上限 ${cap} 件。核验完成或删除作品后名额会释放，已公开的作品不受影响。`
    : `每人最多 ${cap} 件作品同时等待核验，核验完成或删除作品后名额释放。`;
  return { cap, used, full, hint };
}
const uploadButton = (quota) => `<button class="btn sm" type="button" data-upload${quota.full ? ' aria-disabled="true"' : ''}>${icon('upload')}上传作品</button>`;

// Uploads always belong to a question, so the personal center asks which one first.
function pickTask(ctx) {
  const tasks = ctx.DATA.tasks.filter((t) => t.acceptsUploads);
  const sheet = openDialog({
    title: '上传到哪道题？',
    className: 'upload-pick-sheet',
    body: tasks.length
      ? `<p class="sheet-text">每件作品都对应一道题目，请按它的提示词生成后上传。</p><div class="upload-picks">${tasks.map((t) => `<a class="upload-pick" href="#/submit/${esc(t.id)}"><b><span data-i18n-ignore>${esc(t.title)}</span></b><span>${t.results.filter(ctx.interactive).length} 件作品</span>${icon('next')}</a>`).join('')}</div>`
      : '<p class="sheet-text">暂时没有接受投稿的题目。</p>',
  });
  sheet.el.addEventListener('click', (e) => { if (e.target.closest('a')) sheet.close(); });
}

// ---- personal center: profile, activity, questions, works -------------------------------------
function mine(root, ctx) {
  const tab = Object.hasOwn(ME_TABS, ctx.param ?? '') ? ctx.param : 'overview';
  const path = `me?view=${tab}`;
  const empty = { questions: null, works: null, votes: 0, activity: null, receivedReactions: null, joinedAt: null, email: undefined, error: '' };
  // The first draw already shows this account's loading state, so the first load does not redraw it.
  const state = { owner: accountKey(), editing: false, filter: 'all', ...empty };
  const settle = (data, account) => Object.assign(state, data, account ? { email: account.user?.email ?? null } : {}, { error: '' });
  // A return to the page draws what it showed last time, and the arrival load redraws only if that changed.
  const known = platform.user ? recall(path) : null;
  if (known) settle(known, tab === 'overview' ? recall('auth/me') : null);
  let active = true, request = 0, reading = null, reloadQueued = false, controller;
  function load(afterWrite = false) {
    if (reading) {
      reloadQueued ||= afterWrite;
      return reading;
    }
    const task = read().finally(() => {
      if (reading !== task) return;
      reading = null;
      if (active && reloadQueued) { reloadQueued = false; void load(); }
    });
    reading = task;
    return task;
  }
  async function read() {
    clearTimeout(poll);
    const version = ++request;
    if (state.owner !== accountKey()) {
      Object.assign(state, { owner: accountKey(), editing: false, ...empty });
      draw();
    }
    if (!platform.user) return draw();
    const owner = state.owner;
    const reading = new AbortController();
    controller = reading;
    let timedOut = false;
    const deadline = setTimeout(() => { timedOut = true; reading.abort(); }, 15000);
    const before = JSON.stringify(state);
    try {
      const options = { signal: reading.signal };
      const [data, account] = await Promise.all([apiRemembered(path, options), tab === 'overview' ? apiRemembered('auth/me', options) : null]);
      if (!active || version !== request || owner !== accountKey()) return;
      settle(data, account);
    } catch (error) {
      if (!active || version !== request || owner !== accountKey() || error.name === 'AbortError' && !timedOut) return;
      state.error = timedOut ? '个人内容加载超时，请重试。' : error.message;
    } finally {
      clearTimeout(deadline);
    }
    if (!state.editing && (state.error || JSON.stringify(state) !== before)) draw();
    watch();
  }
  let poll = 0, polls = 0;
  function watch() {
    clearTimeout(poll);
    if (!active || tab !== 'works' || document.visibilityState === 'hidden' || polls >= 40 || !(state.works ?? []).some((w) => w.moderation?.status === 'pending')) return;
    poll = setTimeout(async () => {
      polls++;
      await load();
      watch();
    }, 15000);
  }
  const visibility = () => {
    if (document.visibilityState === 'hidden') clearTimeout(poll);
    else if (platform.user) void load();
  };
  document.addEventListener('visibilitychange', visibility);
  const reactionsKey = () => JSON.stringify((state.works ?? []).map(w => platform.reactions?.counts[`${w.task}/${w.id}`] ?? {}));
  let drawnReactions = '';
  // Filters by where each work stands; a group with nothing in it is left out.
  function worksList(works) {
    const questions = state.questions ?? [];
    const rows = works.map((w) => ({ w, group: authorStage(w, questions).group }));
    const counts = Object.fromEntries(Object.keys(AUTHOR_GROUPS).map((g) => [g, rows.filter((r) => r.group === g).length]));
    if (state.filter !== 'all' && !counts[state.filter]) state.filter = 'all';
    const chip = (key, label, n) => `<button class="chip" type="button" data-work-filter="${key}" aria-pressed="${state.filter === key}">${label}<span>${n}</span></button>`;
    const quota = uploadQuota(works);
    return `<div class="chips work-filters">${chip('all', '全部', works.length)}${Object.entries(AUTHOR_GROUPS).filter(([g]) => counts[g]).map(([g, label]) => chip(g, label, counts[g])).join('')}</div>
      ${quota.full ? `<p class="quota-note">${icon('clock')}<span>${esc(quota.hint)}</span></p>` : ''}
      <div class="work-list">${rows.filter((r) => state.filter === 'all' || r.group === state.filter).map((r) => workRow(ctx, r.w, { questions })).join('')}</div>`;
  }
  function draw() {
    const signedIn = Boolean(platform.user);
    const questions = state.questions ?? [];
    const works = state.works ?? [];
    const nav = signedIn ? accountNav(ctx, tab) : '';
    const quota = uploadQuota(works);
    const caption = !signedIn ? '' : tab === 'works'
      ? `<span class="upload-quota">${quota.cap && state.works ? `<span class="quota${quota.full ? ' is-full' : ''}" title="${esc(quota.hint)}">等待核验 <b>${quota.used}</b> / ${quota.cap}</span>` : ''}${uploadButton(quota)}</span>`
      : tab === 'questions' ? `<a class="btn sm" href="#/new">${icon('plus')}发起题目</a>`
      : `<span class="collection-caption">已参与 ${state.votes} 组盲评</span>`;
    const body = !signedIn ? `<div class="notice submissions-login">${icon('user')}<p>登录后查看你发起的题目与上传的作品。</p><button class="btn primary sm" data-auth="login">登录 / 注册</button></div>`
      : tab === 'overview' ? profileOverview(state)
      : tab === 'works' ? `<section class="submission-section">${state.works === null ? `<p class="muted">${state.error ? '作品暂时未能载入。' : '正在载入作品…'}</p>` : works.length
          ? worksList(works)
          : `<div class="submission-empty"><b>还没有上传作品</b><p>选一道题，上传你让模型生成的答案。</p>${uploadButton(quota)}</div>`}</section>`
      : `<section class="submission-section">${state.questions === null ? `<p class="muted">${state.error ? '题目暂时未能载入。' : '正在载入题目…'}</p>` : questions.length
          ? `<div class="submission-questions">${questions.map((question) => questionRow(ctx, question)).join('')}</div>`
          : `<div class="submission-empty"><b>还没有发起题目</b><p>写下同一份提示词，邀请不同模型给出答案。</p><a class="btn sm" href="#/new">发起题目</a></div>`}</section>`;
    root.innerHTML = `${ctx.pageStart({ ...ACCOUNT, section: 'me', heading: signedIn ? ME_TABS[tab] : '个人中心', caption, nav,
      crumbs: tab === 'overview' ? [{ text: '个人中心' }] : [{ text: '个人中心', href: '#/me' }, { text: ME_TABS[tab] }] })}
      ${state.error ? `<p class="form-error submissions-error" role="alert">${esc(state.error)} <button class="btn sm" type="button" data-account-retry>重试</button></p>` : ''}
      ${body}
    ${ctx.pageEnd()}`;
    const calendar = root.querySelector('.activity-scroll');
    if (calendar) calendar.scrollLeft = calendar.scrollWidth;
    ctx.settleImages();
    setPageTitle(['个人中心', ctx.DATA.title]);
    drawnReactions = reactionsKey();
  }
  root.onsubmit = async (event) => {
    const form = event.target.closest('[data-profile-form]');
    if (!form) return;
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const errorLine = form.querySelector('[data-profile-error]');
    button.disabled = true;
    button.textContent = '保存中…';
    errorLine.hidden = true;
    try {
      await api('me', { method: 'PATCH', body: { nickname: new FormData(form).get('nickname') } });
      state.editing = false;
      await refreshPlatform('profile');
      toast('昵称已保存');
    } catch (error) {
      errorLine.textContent = error.message;
      errorLine.hidden = false;
      button.disabled = false;
      button.textContent = '保存';
    }
  };
  root.onclick = async (e) => {
    const retry = e.target.closest('[data-account-retry]');
    if (retry) { retry.disabled = true; return load(); }
    if (e.target.closest('[data-edit-avatar]')) return pickAvatar();
    if (e.target.closest('[data-bind="email"]')) return openBindEmail({ change: Boolean(state.email) });
    const edit = e.target.closest('[data-edit-name], [data-edit-cancel]');
    if (edit) {
      state.editing = edit.matches('[data-edit-name]');
      draw();
      if (state.editing) root.querySelector('#profile-nickname')?.select();
      return;
    }
    const filter = e.target.closest('[data-work-filter]');
    if (filter) {
      state.filter = filter.dataset.workFilter;
      return draw();
    }
    const upload = e.target.closest('[data-upload]');
    if (upload?.getAttribute('aria-disabled') === 'true') return toast(uploadQuota(state.works ?? []).hint);
    if (upload) {
      if (await requireUser('登录后上传作品，并在这里跟进核验结果。')) pickTask(ctx);
      return;
    }
    const editButton = e.target.closest('[data-edit-work]');
    if (editButton) {
      const work = state.works?.find((w) => pickId(w) === editButton.dataset.editWork);
      if (work) editWork(ctx, work);
      return;
    }
    const questionButton = e.target.closest('[data-delete-question]');
    if (questionButton) {
      const question = state.questions?.find((q) => q.id === questionButton.dataset.deleteQuestion);
      if (question) await removeQuestion(question);
      return;
    }
    const button = e.target.closest('[data-delete]');
    if (!button) return;
    const work = state.works?.find((w) => pickId(w) === button.dataset.delete);
    if (work) await removeWork(work, { admin: false });
  };
  draw();
  const loading = load();
  const pending = tab === 'overview' ? state.activity === null : state[tab] === null;
  return {
    ready: pending ? loading : null,
    onPlatformChange(reason) {
      // Activity/session notifications already update shared controls. Only a mutation or
      // an explicit refresh invalidates this page's own response.
      if (reason === 'activity' && tab === 'works' && drawnReactions !== reactionsKey()) draw();
      if (['activity', 'session', 'session-ready', 'stale'].includes(reason)) return;
      return load(['profile', 'edit', 'delete', 'question', 'upload', 'review', 'refresh'].includes(reason));
    },
    destroy() { active = false; request++; controller?.abort(); clearTimeout(poll); document.removeEventListener('visibilitychange', visibility); root.onsubmit = null; },
  };
}

// ---- review queue -----------------------------------------------------------------------------
function trialRows(trial) {
  if (!trial || trial.loaded === undefined) return '<li class="check is-info"><span><b>试加载</b>没有记录</span></li>';
  const rows = [
    trial.loaded ? ['ok', '页面载入', `${((trial.loadMs ?? 0) / 1000).toFixed(1)} 秒`] : ['fail', '页面载入', '作者提交时页面未完成载入'],
    trial.errors ? ['warn', '脚本错误', `${trial.errors} 条：${trial.errorSamples?.[0] ?? ''}`] : ['ok', '脚本错误', '没有'],
    trial.failedResources?.length ? ['warn', '资源加载', trial.failedResources.join('、')] : ['ok', '资源加载', '全部载入'],
    trial.blocked?.length ? ['warn', '外部请求', `被拦截：${trial.blocked.join('、')}`] : ['ok', '外部请求', '没有被拦截的请求'],
    trial.canvases || trial.media || trial.words > 20 ? ['ok', '画面内容', trial.canvases ? `${trial.canvases} 个画布` : '有可见内容'] : ['warn', '画面内容', '可能是空白页面'],
  ];
  return rows.map(([state, label, detail]) => `<li class="check is-${state}">${icon(state === 'ok' ? 'check' : state === 'fail' ? 'close' : 'alert')}<span><b>${esc(label)}</b>${esc(detail)}</span></li>`).join('');
}

// Admins use the upload fields, but may save incomplete records or reject them.
// Compare form values to the last save so untouched legacy blanks stay untouched.
function reviewEditor(form, task, w) {
  let saved = readWorkFields(form, task, { requireComplete: false }).body ?? {};
  form.addEventListener('change', (event) => onWorkFieldChange(form, event.target));
  return {
    collect(requireComplete = false) {
      const { body, error } = readWorkFields(form, task, { requireComplete });
      if (!body) throw new Error(error);
      const meta = Object.fromEntries(Object.entries(body).filter(([key, value]) => value !== saved[key]));
      // Model and Harness alternatives are one choice; send their full new identity.
      for (const keys of [['modelId', 'modelName', 'vendor'], ['harnessId', 'harnessOther']]) {
        if (keys.some((key) => Object.hasOwn(meta, key))) {
          for (const key of keys) if (Object.hasOwn(body, key)) meta[key] = body[key];
        }
      }
      return meta;
    },
    async save(meta) {
      const values = readWorkFields(form, task, { requireComplete: false }).body;
      const changed = await saveMeta(w, meta);
      saved = values;
      return changed;
    },
  };
}
// Saves the changed fields of a dialog's form; returns whether anything was sent.
async function saveMeta(w, meta) {
  if (!Object.keys(meta).length) return false;
  const owner = accountKey();
  const { work } = await api(`admin/works/${encodeURIComponent(w.task)}/${encodeURIComponent(w.id)}/meta`, { method: 'POST', body: meta });
  Object.assign(w, work);
  if (owner === accountKey()) updateRememberedReviewWork(w);
  return true;
}

// Save information fixes before the decision; only verification needs a complete record.
export function openReview(ctx, w, { questions = [], onChanged, onDecided } = {}) {
  const owner = accountKey();
  const task = ctx.DATA.tasks.find((t) => t.id === w.task) ?? questions.find((q) => q.id === w.task);
  // An unregistered model without a declared vendor shows what its name suggests.
  const guess = w.model || w.vendor ? '' : ctx.modelOf({ modelName: w.modelName }).vendor;
  // Most works here are not in the gallery yet; those only open their preview.
  const shown = ctx.inGallery(w.task, w.id);
  const sheet = openDialog({
    title: '核验作品',
    className: 'review-sheet',
    body: `<div class="review">
      <div class="review-facts">
        <div class="review-head">${thumb(ctx, w, { link: shown })}<div><h3 data-i18n-ignore>${esc(w.title)}</h3><p class="result-model">${statusBadge(w.status, { always: true })}<span data-i18n-ignore>${esc(task?.title ?? w.task)}</span></p>
          <div class="actions"><a class="btn sm" href="${esc(w.scene)}" target="_blank" rel="noopener">打开作品${icon('arrow')}</a>${shown ? `<a class="btn sm" href="#/${esc(w.task)}/${esc(w.id)}">在展厅中查看</a>` : ''}</div></div></div>
        <dl class="facts">
          <div><dt>发布者</dt><dd>${publisherHtml(ctx, w)}${w.addedAt ? ` · ${timeHtml(w.addedAt)}` : ''}</dd></div>
          <div><dt>声明的模型</dt><dd>${esc(w.modelName)}${w.vendor ? ` · ${esc(w.vendor)}` : ''}${w.model ? '' : `（未收录${guess ? `，按名称推断为 ${esc(guess)}` : ''}，可在数据仓注册表补录）`}</dd></div>
          <div><dt>推理档位</dt><dd>${esc(w.effort || '默认 / 未设置')}</dd></div>
          <div><dt>Harness</dt><dd>${ctx.harnessOf(w)?.name ? `<span data-i18n-ignore>${esc(ctx.harnessOf(w).name)}</span>` : '未注明'}</dd></div>
          <div><dt>服务商</dt><dd>${esc(ctx.providerOf(w)?.name ?? '未注明')}</dd></div>
          <div><dt>作者原始声明</dt><dd>${esc(w.tool || '未注明')}</dd></div>
          ${w.files ? `<div><dt>文件</dt><dd>${esc(w.sourceName ?? '')} · ${w.files} 个 · ${formatBytes(w.bytes)} · 入口 ${esc(w.root ? `${w.root}/` : '')}${esc(w.entry ?? '')}</dd></div>` : ''}
          ${w.reviewer ? `<div><dt>上次核验</dt><dd><span data-i18n-ignore>${esc(w.reviewer)}</span> · ${timeHtml(w.reviewedAt)}</dd></div>` : ''}
        </dl>
        ${w.summary ? `<p class="review-text" data-i18n-ignore>${esc(w.summary)}</p>` : ''}
        <h4>生成说明</h4><p class="review-text">${w.note ? `<span data-i18n-ignore>${esc(w.note)}</span>` : '<span class="muted">作者没有填写。</span>'}</p>
        ${w.checks ? `<h4>上传检查</h4><ul class="checks">${w.checks.map((c) => `<li class="check is-${c.state}">${icon(c.state === 'ok' ? 'check' : c.state === 'info' ? 'guide' : 'alert')}<span><b>${esc(c.label)}</b>${esc(c.detail)}</span></li>`).join('')}</ul>` : ''}
        ${w.trial ? `<h4>作者浏览器中的试加载</h4><ul class="checks">${trialRows(w.trial)}</ul>` : ''}
      </div>
      <form class="review-form" novalidate>
        ${held(w) ? `<div class="review-blocked">${icon('alert')}<p>内容审核还没通过，通过后才能核验。</p><button type="button" class="btn sm primary" data-open-content${canDecide(w) ? '' : ' disabled'}>审核内容</button></div>` : ''}
        <details class="review-meta" open><summary>作品信息<small>与上传表单一致，必填项补齐后才能通过核验</small></summary>
          ${workFieldsHtml(ctx, task, w, { expanded: true })}
          <div class="review-meta-actions"><button type="button" class="btn sm" data-save-meta>只保存信息</button></div>
        </details>
        <p class="fine">${w.status === 'verified' ? `<span>现在：</span>${doneHtml(w)}` : '通过后公开到展览馆；单轮生成且无人工介入的作品同时进入盲评。'}</p>
        ${w.status === 'verified' ? '' : '<label class="field"><span class="field-label"><input type="checkbox" name="toInbox"> 娱乐作品（进竞技场收件箱）</span><small>勾选后不进展览馆，也不进任何池子</small></label>'}
        <label class="field"><span class="field-label">存疑原因<small>标记存疑时必填，作者与访客都能看到</small></span><textarea data-i18n-ignore class="input" name="reason" rows="3" maxlength="500">${esc(w.status === 'questioned' ? w.reason : '')}</textarea></label>
        <p class="form-error" role="alert"></p>
        ${canDecide(w) ? '' : `<div class="review-blocked">${icon('alert')}<p>这是你发布的作品，需要由其他管理员核验。</p></div>`}
        <div class="sheet-actions">
          ${isSenior() ? `<button type="button" class="btn danger ghost" data-remove>${icon('trash')}下架</button>` : ''}
          <span class="spacer"></span>
          ${canDecide(w) && w.status === 'verified' && faceOn(w) ? '<button type="button" class="btn ghost" data-decide="off">撤下</button>' : ''}
          ${canDecide(w) ? `<button type="button" class="btn" data-decide="questioned">${icon('alert')}标记存疑</button>
          ${w.status === 'verified' ? '' : `<button type="button" class="btn primary" data-decide="verified"${held(w) ? ' disabled' : ''}>${icon('check')}通过核验</button>`}` : ''}
        </div>
      </form>
    </div>`,
  });
  const form = $('form', sheet.el);
  const editor = reviewEditor(form, task, w);
  sheet.el.addEventListener('click', async (e) => {
    if (e.target.closest('a[href^="#"]')) { sheet.close(); return; }
    if (e.target.closest('[data-open-content]') && canDecide(w)) { sheet.close(); openContent(ctx, w, { questions, onChanged }); return; }
    const decide = e.target.closest('[data-decide]');
    if (e.target.closest('[data-remove]')) {
      if (await removeWork(w, { admin: true, onChanged: () => onChanged?.(w) })) sheet.close();
      return;
    }
    const error = $('.form-error:not(.field-error)', form);
    if (e.target.closest('[data-save-meta]')) {
      const button = e.target.closest('[data-save-meta]');
      error.textContent = '';
      button.disabled = true;
      try {
        const saved = await editor.save(editor.collect());
        if (owner !== accountKey()) { sheet.close(); return; }
        if (saved) onChanged?.(w);
        toast(saved ? `已保存：${w.title}` : '信息没有改动');
        await refreshPlatform('review');
      } catch (err) {
        error.textContent = err.message;
      }
      button.disabled = false;
      return;
    }
    if (!decide || !canDecide(w)) return;
    const status = decide.dataset.decide;
    if (status === 'off') {
      $$('[data-decide]', form).forEach((b) => { b.disabled = true; });
      try {
        const { work } = await setFaces(w.task, w.id, FACE_ACTIONS.hide[1]);
        if (owner !== accountKey()) { sheet.close(); return; }
        Object.assign(w, work);
        updateRememberedReviewWork(w);
        onChanged?.(w);
        sheet.close();
        toast(`已撤下：${w.title}`);
        await refreshPlatform('review');
      } catch (error) {
        $('.form-error:not(.field-error)', form).textContent = error.message;
        $$('[data-decide]', form).forEach((b) => { b.disabled = false; });
      }
      return;
    }
    let body, meta;
    try {
      if (status === 'questioned' && !form.reason.value.trim()) throw new Error('标记存疑时请写明原因，作者和访客都会看到');
      meta = editor.collect(status === 'verified');
      body = { status, reason: status === 'questioned' ? form.reason.value : '' };
      const toInbox = form.elements.namedItem('toInbox');
      if (status === 'verified' && toInbox) body.entertainment = toInbox.checked;
    } catch (err) {
      error.textContent = err.message;
      $('.review-meta', form).open = true;
      return;
    }
    $$('[data-decide]', form).forEach((b) => { b.disabled = true; });
    try {
      if (await editor.save(meta)) onChanged?.(w);
      if (owner !== accountKey()) { sheet.close(); return; }
      const { work } = await api(`works/${encodeURIComponent(w.task)}/${encodeURIComponent(w.id)}/review`, { method: 'POST', body });
      Object.assign(w, work);
      if (owner !== accountKey()) { sheet.close(); return; }
      updateRememberedReviewWork(w);
      onChanged?.(w);
      sheet.close();
      const note = onDecided?.() ?? '';
      toast(`已${{ verified: '通过核验', questioned: '标记存疑' }[body.status]}：${w.title}${note}`);
      await refreshPlatform('review');
    } catch (error) {
      $('.form-error:not(.field-error)', form).textContent = error.message;
      $$('[data-decide]', form).forEach((b) => { b.disabled = false; });
    }
  });
}

// Content review: approving releases the work for verification, rejecting keeps it hidden with a reason
// the author reads, and a retry sends it through the automatic check again.
function openContent(ctx, w, { questions = [], onChanged, onDecided } = {}) {
  const owner = accountKey();
  const m = w.moderation ?? {};
  const listed = ctx.DATA.tasks.find((t) => t.id === w.task);
  const task = listed ?? questions.find((q) => q.id === w.task);
  const source = m.source === 'human' ? `人工 · ${m.reviewer ?? ''}` : m.status === 'pending' ? '自动审核进行中' : `自动 · ${m.model ?? '6 Luna'}`;
  const sheet = openDialog({
    title: '审核内容',
    className: 'review-sheet',
    body: `<div class="review">
      <div class="review-facts">
        <div class="review-head">${thumb(ctx, w, { link: false })}<div><h3 data-i18n-ignore>${esc(w.title)}</h3><p class="result-model">${moderationBadge(m)}<span data-i18n-ignore>${esc(task?.title ?? w.task)}</span></p>
          <div class="actions"><a class="btn sm" href="${esc(w.scene)}" target="_blank" rel="noopener">打开作品${icon('arrow')}</a></div></div></div>
        <dl class="facts">
          <div><dt>发布者</dt><dd>${publisherHtml(ctx, w)}${w.addedAt ? ` · ${timeHtml(w.addedAt)}` : ''}</dd></div>
          <div><dt>审核来源</dt><dd>${esc(source)}</dd></div>
          <div><dt>结论</dt><dd>${m.reason ? `<span data-i18n-ignore>${esc(m.reason)}</span>` : '暂无'}</dd></div>
          ${m.categories?.length ? `<div><dt>风险类别</dt><dd>${esc(riskLabels(m.categories).join('、'))}</dd></div>` : ''}
          ${m.error ? `<div><dt>未完成原因</dt><dd data-i18n-ignore>${esc(m.error)}</dd></div>` : ''}
        </dl>
        ${listed ? '' : '<p class="fine">这是新题目的示例结果：题目和内容通过审核后，结果才会进入核验。</p>'}
      </div>
      <form class="review-form" novalidate>
        <p class="fine">这一步只看能否公开：违法、色情、仇恨、诈骗、恶意脚本等。作品质量和生成信息在「核验」里判断。</p>
        <details class="review-meta" open><summary>作品信息<small>可补充或纠正信息，内容通过后仍需核验</small></summary>
          ${workFieldsHtml(ctx, task, w, { expanded: true })}
          <div class="review-meta-actions"><button type="button" class="btn sm" data-save-meta>只保存信息</button></div>
        </details>
        <label class="field"><span class="field-label">理由<small>拒绝时必填，作者会看到</small></span><textarea data-i18n-ignore class="input" name="reason" rows="3" maxlength="500"></textarea></label>
        <p class="form-error" role="alert"></p>
        <div class="sheet-actions">
          ${canDecide(w) && platform.site.contentModeration && platform.site.autoModeration !== false && m.status !== 'pending' ? '<button type="button" class="btn ghost" data-content-act="retry">重新自动审核</button>' : ''}
          <span class="spacer"></span>
          ${!canDecide(w) ? '<span class="fine">你发布的作品需要由其他管理员审核</span>' : `${m.status === 'rejected' ? '' : `<button type="button" class="btn danger" data-content-act="rejected">${icon('close')}拒绝</button>`}
          <button type="button" class="btn primary" data-content-act="approved">${icon('check')}内容通过</button>`}
        </div>
      </form>
    </div>`,
  });
  const form = $('form', sheet.el);
  const editor = reviewEditor(form, task, w);
  sheet.el.addEventListener('click', async (e) => {
    const error = $('.form-error:not(.field-error)', form);
    const save = e.target.closest('[data-save-meta]');
    if (save) {
      error.textContent = '';
      save.disabled = true;
      try {
        const saved = await editor.save(editor.collect());
        if (owner !== accountKey()) { sheet.close(); return; }
        if (saved) onChanged?.(w);
        toast(saved ? `已保存：${w.title}` : '信息没有改动');
        await refreshPlatform('review');
      } catch (err) {
        error.textContent = err.message;
      }
      save.disabled = false;
      return;
    }
    const act = e.target.closest('[data-content-act]')?.dataset.contentAct;
    if (!act || !canDecide(w)) return;
    const reason = form.reason.value.trim();
    error.textContent = '';
    if (act === 'rejected' && !reason) { error.textContent = '请写明拒绝理由'; form.reason.focus(); return; }
    let meta;
    try {
      meta = editor.collect();
    } catch (err) {
      error.textContent = err.message;
      $('.review-meta', form).open = true;
      return;
    }
    $$('[data-content-act]', form).forEach((b) => { b.disabled = true; });
    const path = `works/${encodeURIComponent(w.task)}/${encodeURIComponent(w.id)}/moderation`;
    try {
      if (await editor.save(meta)) onChanged?.(w);
      if (owner !== accountKey()) { sheet.close(); return; }
      const { work } = act === 'retry' ? await api(`${path}/retry`, { method: 'POST' })
        : await api(path, { method: 'POST', body: { status: act, reason: reason || '人工复核通过' } });
      Object.assign(w, work);
      if (owner !== accountKey()) { sheet.close(); return; }
      updateRememberedReviewWork(w);
      onChanged?.(w);
      sheet.close();
      const note = onDecided?.() ?? '';
      toast(`${{ retry: '已重新提交自动审核', approved: listed ? '内容已通过，转入核验' : '内容已通过', rejected: '内容已拒绝，作者会看到理由' }[act]}：${w.title}${note}`);
      await refreshPlatform('review');
    } catch (err) {
      error.textContent = err.message;
      $$('[data-content-act]', form).forEach((b) => { b.disabled = false; });
    }
  });
}

const questionWaiting = (q) => ['pending', 'review'].includes(q.moderation?.status);

// A sample result sent with a new question; its content is reviewed right here, before the question.
function sampleRow(w) {
  return `<li>${esc(w.modelName)}${w.effort ? ` · ${esc(w.effort)}` : ''} · ${esc(w.title)}${moderationBadge(w.moderation, HELD.work[w.moderation?.status])}${w.scene ? `<a class="text-link" href="${esc(w.scene)}" target="_blank" rel="noopener">预览结果${icon('arrow')}</a>` : ''}${held(w) ? `<button class="btn sm${w.moderation.status === 'review' ? ' primary' : ''}" data-content="${esc(pickId(w))}">审核内容</button>` : ''}</li>`;
}

// For a question its author resubmitted: the last decision and what changed since.
const CHANGE_FIELDS = [['title', '标题'], ['summary', '测试简述'], ['category', '题目类型'], ['domains', '领域'], ['prompt', '完整提示词']];
const DIFF_LINES = { ' ': ['same', ''], '-': ['del', '−'], '+': ['add', '+'] };
function resubmission(q) {
  const before = q.moderation?.previous;
  if (!before) return '';
  const fields = CHANGE_FIELDS.filter(([key]) => Object.hasOwn(before, key) && JSON.stringify(before[key]) !== JSON.stringify(q[key]));
  const text = (key, value) => (key === 'category' ? categoryLabel(value) : key === 'domains' ? (value ?? []).join('、') : value ?? '');
  const changes = fields.filter(([key]) => key !== 'prompt')
    .map(([key, label]) => `<li><b>${label}</b><del><span data-i18n-ignore>${esc(text(key, before[key]))}</span></del><span><span data-i18n-ignore>${esc(text(key, q[key]))}</span></span></li>`).join('');
  const prompt = fields.some(([key]) => key === 'prompt') ? `<div class="line-diff" data-i18n-ignore>${lineDiff(before.prompt, q.prompt ?? '')
    .map(([op, line]) => `<div class="is-${DIFF_LINES[op][0]}"><span class="line-op">${DIFF_LINES[op][1]}</span><span>${esc(line)}</span></div>`).join('')}</div>` : '';
  const decided = [before.reviewer ? `<span data-i18n-ignore>${esc(before.reviewer)}</span>` : '', before.at ? `${dateHtml(before.at)} <span>拒绝</span>` : ''].filter(Boolean).join(' · ');
  return `${before.reason ? `<div class="question-history"><p class="question-history-head">${icon('alert')}上次意见${decided ? `<span>· ${decided}</span>` : ''}</p><p data-i18n-ignore>${esc(before.reason)}</p></div>` : ''}
    <div class="question-history"><p class="question-history-head">本次改动<span>· ${fields.length ? fields.map(([, label]) => label).join('、') : '参考图、提交格式或示例结果'}</span></p>${changes ? `<ul class="question-changes">${changes}</ul>` : ''}${prompt}</div>`;
}

// picked: as in workRow; only questions waiting for a decision can be batched.
function reviewQuestionRow(ctx, q, picked) {
  const status = q.moderation?.status ?? 'legacy';
  const shown = ['legacy', 'approved'].includes(status);
  const detail = [q.moderation?.reason, q.moderation?.categories?.length ? `类别：${q.moderation.categories.join('、')}` : '']
    .filter(Boolean).join(' · ');
  const samples = q.samples ?? [];
  return `<article class="submission-question review-question">
    ${picked === undefined ? '' : pickBox(q.id, q.title, picked)}
    <span class="submission-question-mark" aria-hidden="true">${icon('text')}</span>
    <div class="submission-question-body"><h3>${shown ? `<a href="#/${esc(q.id)}" data-i18n-ignore><span data-i18n-ignore>${esc(q.title)}</span></a>` : `<span data-i18n-ignore><span data-i18n-ignore>${esc(q.title)}</span></span>`}${moderationBadge(q.moderation, '', QUESTION_LABELS)}${q.moderation?.previous ? `<span class="badge">重新提交 · 第 ${q.moderation.round} 次</span>` : ''}</h3>
      <p class="summary" data-i18n-ignore>${esc(q.summary)}</p>
      <p class="work-meta">${publisherHtml(ctx, q)}<span>${esc(q.date)} · ${q.works ?? 0} 件作品</span>${q.category ? `<span>${esc(categoryLabel(q.category))}</span>` : ''}${domainsOf(q).map((d) => `<span>${esc(d)}</span>`).join('')}</p>
      ${detail ? `<p class="result-reason">${icon(status === 'rejected' ? 'alert' : 'guide')}<span>${esc(detail)}</span></p>` : ''}
      ${resubmission(q)}
      ${samples.length ? `<ul class="question-samples">${samples.map(sampleRow).join('')}</ul>` : shown ? '' : '<p class="result-reason"><span>没有附带示例结果。</span></p>'}
      ${referenceSheet(q.references, { key: q.id, credit: q.referenceCredit })}
      <details class="prompt-peek"><summary>${icon('guide')}完整提示词</summary><pre>${esc(q.prompt)}</pre></details>
    </div>
    <div class="actions">
      <a class="btn sm" href="#/review/works?task=${encodeURIComponent(q.id)}">管理作品</a>
      <button class="btn sm" data-q-edit="${esc(q.id)}">编辑</button>
      ${shown ? '' : `<button class="btn sm primary" data-q-decide="approved" data-q="${esc(q.id)}">通过</button>`}
      ${status === 'rejected' ? '' : `<button class="btn sm" data-q-decide="rejected" data-q="${esc(q.id)}">拒绝</button>`}
      <button class="icon-btn" data-q-delete="${esc(q.id)}" title="删除题目" aria-label="删除「${esc(q.title)}」">${icon('trash')}</button>
    </div>
  </article>`;
}

// 全部题目: every question with where it stands and what its works are doing. buckets lists the
// review bucket of each of its works.
const CATALOG_FILTERS = { all: '全部', public: '已公开', waiting: '待审核', hidden: '未公开', closed: '不收投稿' };
const catalogIn = (q, filter) => ({ all: true, public: questionShown(q), waiting: questionWaiting(q),
  hidden: !questionShown(q) && !questionWaiting(q), closed: questionShown(q) && !q.acceptsUploads })[filter];
function catalogRow(ctx, q, buckets) {
  const n = (...names) => q.workCounts ? names.reduce((sum, key) => sum + (q.workCounts[key] ?? 0), 0) : buckets.filter((b) => names.includes(b)).length;
  const shown = questionShown(q), waiting = questionWaiting(q);
  const pool = platform.arena[q.id];
  const counts = [['已公开', n('verified')], ['待处理', n('content', 'auto', 'unverified')], ['存疑', n('questioned')], ['已撤下', n('off')]]
    .filter(([, k]) => k).map(([text, k]) => `${text} ${k}`);
  return `<article class="submission-question review-question">
    <span class="submission-question-mark" aria-hidden="true">${icon('text')}</span>
    <div class="submission-question-body"><h3>${shown ? `<a href="#/${esc(q.id)}" data-i18n-ignore><span data-i18n-ignore>${esc(q.title)}</span></a>` : `<span data-i18n-ignore><span data-i18n-ignore>${esc(q.title)}</span></span>`}${shown ? '' : `<span class="status status-${waiting ? 'unverified' : 'questioned'}">${icon(waiting ? 'clock' : 'alert')}${waiting ? '待审核' : '未公开'}</span>`}${shown && !q.acceptsUploads ? '<span class="badge">不收投稿</span>' : ''}</h3>
      <p class="summary" data-i18n-ignore>${esc(q.summary)}</p>
      <p class="work-meta">${publisherHtml(ctx, q)}${q.date ? `<span>${esc(q.date)}</span>` : ''}${q.category ? `<span>${esc(categoryLabel(q.category))}</span>` : ''}${domainsOf(q).map((d) => `<span>${esc(d)}</span>`).join('')}</p>
      <p class="work-meta">${q.works ?? buckets.length} 件作品${counts.length ? ` · ${counts.join(' · ')}` : ''}${shown ? `<span>盲评池 ${pool?.works ?? 0} 件 · ${pool?.entries ?? 0} 个配置</span>` : ''}</p>
      ${q.moderation?.status === 'rejected' && q.moderation.reason ? `<p class="result-reason">${icon('alert')}<span><span data-i18n-ignore>${esc(q.moderation.reason)}</span></span></p>` : ''}
    </div>
    <div class="actions">
      <a class="btn sm" href="#/review/works?task=${encodeURIComponent(q.id)}">管理作品</a>
      <button class="btn sm" data-q-edit="${esc(q.id)}">编辑</button>
      ${waiting ? '<a class="btn sm primary" href="#/review/questions">去审核</a>'
        : shown ? `<button class="btn sm" data-q-decide="rejected" data-q="${esc(q.id)}">撤下</button>`
          : `<button class="btn sm" data-q-decide="approved" data-q="${esc(q.id)}">恢复公开</button>`}
      ${q.votes ? '' : `<button class="icon-btn" data-q-delete="${esc(q.id)}" title="删除题目" aria-label="删除「${esc(q.title)}」">${icon('trash')}</button>`}
    </div>
  </article>`;
}

// The question type and domains, shared with the publishing form.
function categoryFields(q) {
  return categoryField(q.category) + domainField(platform, domainsOf(q));
}
const questionShown = (q) => ['legacy', 'approved'].includes(q.moderation?.status ?? 'legacy');

// Approving needs no reason and can correct the form and domains; rejecting requires a reason the author will read.
function decideQuestion(q, status, current = () => true) {
  const owner = accountKey();
  // Rejecting a public question takes it and its works off the site until it is approved again.
  const withdraw = status === 'rejected' && questionShown(q)
    ? `这道题已经公开${q.works ? `，有 ${q.works} 件作品` : ''}。撤下后作品随之不再公开，相关投票暂不计入排行榜；重新通过后恢复。` : '';
  return new Promise((resolve) => {
    let saved = false;
    const sheet = openDialog({
      title: status === 'approved' ? '通过这道题？' : '拒绝这道题',
      className: status === 'approved' ? 'edit-work-sheet' : 'confirm-sheet',
      onClose: () => resolve(saved),
      body: `<form data-q-form novalidate>
        <p class="sheet-text">「${esc(q.title)}」${status === 'approved' ? '会公开到题库并开放投稿。' : withdraw ? '会从题库撤下，作者会看到下面的理由。' : '不会公开，作者会看到下面的理由。'}</p>
        ${withdraw ? `<p class="review-blocked">${icon('alert')}<span>${esc(withdraw)}</span></p>` : ''}
        ${status === 'approved' ? categoryFields(q) : ''}
        <label class="field"><span class="field-label">理由${status === 'rejected' ? '<i>*</i>' : '<small>选填</small>'}</span><textarea data-i18n-ignore class="input" name="reason" rows="3" maxlength="500"></textarea></label>
        <p class="form-error" role="alert"></p>
        <div class="sheet-actions"><button class="btn" type="button" data-sheet-close>取消</button><button class="btn primary${status === 'rejected' ? ' danger' : ''}" type="submit">${status === 'approved' ? '通过' : '拒绝'}</button></div>
      </form>`,
    });
    const form = $('[data-q-form]', sheet.el);
    syncDomains(form);
    form.addEventListener('change', () => syncDomains(form));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const reason = form.reason.value.trim();
      const error = $('.form-error', form);
      if (status === 'rejected' && !reason) { error.textContent = '请写明拒绝理由'; form.reason.focus(); return; }
      const category = form.category?.value;
      if (status === 'approved' && !category) { error.textContent = '请选择题目类型'; $('[name="category"]', form).focus(); return; }
      const domains = $$('[name="domains"]:checked', form).map((box) => box.value);
      if (status === 'approved' && !domains.length) { error.textContent = '请选择所属领域'; return; }
      const button = $('[type="submit"]', form);
      button.disabled = true;
      try {
        await api(`questions/${encodeURIComponent(q.id)}/moderation`, { method: 'POST', body: { status, reason, ...(category ? { category, domains } : {}) } });
        saved = true;
        sheet.close();
        // Settle on success too, so the list refreshes even if the close event never arrives.
        resolve(true);
        if (owner === accountKey() && current()) toast(status === 'approved' ? '题目已通过' : '题目已拒绝');
      } catch (err) {
        error.textContent = err.message;
        button.disabled = false;
      }
    });
  });
}

// Senior admins correct a question at any stage without changing its review status. A public
// question that already has works keeps its prompt, so those works still answer the same question.
// works: the question's works, for the cover choice.
function editQuestion(q, works = [], current = () => true) {
  const owner = accountKey();
  const locked = questionShown(q) && q.works > 0;
  const covers = works.filter((w) => w.status === 'verified');
  // Reference images belong to the prompt and lock with it.
  const refs = !locked && referencesEnabled() ? referenceEditor({ refs: q.references ?? [], credit: q.referenceCredit ?? '',
    prompt: () => $('[data-q-edit-form] [name="prompt"]')?.value ?? '' }) : null;
  return new Promise((resolve) => {
    let saved = false;
    const sheet = openDialog({
      title: '编辑题目',
      className: 'edit-work-sheet',
      onClose: () => { refs?.destroy(); resolve(saved); },
      body: `<form class="submit-form" data-q-edit-form novalidate>
        <label class="field"><span class="field-label">标题<i>*</i></span><input class="input" name="title" maxlength="70" required value="${esc(q.title)}"></label>
        <label class="field"><span class="field-label">测试简述<i>*</i></span><textarea data-i18n-ignore class="input" name="summary" maxlength="400" rows="2" required>${esc(q.summary ?? '')}</textarea></label>
        ${categoryFields(q)}
        <label class="field"><span class="field-label">完整提示词<i>*</i>${locked ? `<small>已有 ${q.works} 件作品，不能再改</small>` : ''}</span><textarea data-i18n-ignore class="input" name="prompt" maxlength="20000" rows="10" required${locked ? ' readonly' : ''}>${esc(q.prompt ?? '')}</textarea></label>
        ${refs ? '<div data-ref-host></div>' : referenceSheet(q.references, { key: q.id, credit: q.referenceCredit, still: true })}
        <label class="field"><span class="field-label"><input type="checkbox" name="acceptsUploads"${q.acceptsUploads ? ' checked' : ''}> 接受投稿</span><small>关闭后题目照常展示，上传入口停用</small></label>
        ${covers.length ? `<label class="field"><span class="field-label">封面作品<small>题库卡片显示这件作品</small></span><select class="input" name="cover"><option value="">自动（票选代表作，否则按默认规则）</option>${covers.map((w) => `<option data-i18n-ignore value="${esc(w.id)}"${w.id === q.cover ? ' selected' : ''}>${esc(w.modelName)}${w.effort ? ` · ${esc(w.effort)}` : ''} · ${esc(w.title)}</option>`).join('')}</select></label>` : ''}
        <p class="fine">保存不改变审核状态，改动会写入审核记录。</p>
        <p class="form-error" role="alert"></p>
        <div class="sheet-actions"><button class="btn" type="button" data-sheet-close>取消</button><button class="btn primary" type="submit">保存</button></div>
      </form>`,
    });
    const form = $('[data-q-edit-form]', sheet.el);
    syncDomains(form);
    refs?.mount($('[data-ref-host]', form));
    form.addEventListener('change', () => syncDomains(form));
    form.prompt.addEventListener('input', () => refs?.advise());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const error = $('.form-error', form);
      if (refs?.blocker()) { error.textContent = refs.blocker(); return; }
      const body = {};
      for (const key of ['title', 'summary', 'prompt']) {
        const value = form.elements.namedItem(key).value;
        if (!value.trim()) { error.textContent = '标题、简述和提示词都不能为空'; return; }
        if (value.trim() !== (q[key] ?? '').trim()) body[key] = key === 'prompt' ? value : value.trim();
      }
      if (locked) delete body.prompt;
      const category = form.category.value;
      if (!category) { error.textContent = '请选择题目类型'; return; }
      if (category !== q.category) body.category = category;
      const domains = $$('[name="domains"]:checked', form).map((box) => box.value);
      if (!domains.length) { error.textContent = '请选择所属领域'; return; }
      if ([...domains].sort().join('|') !== [...domainsOf(q)].sort().join('|')) body.domains = domains;
      if (form.acceptsUploads.checked !== Boolean(q.acceptsUploads)) body.acceptsUploads = form.acceptsUploads.checked;
      if (form.cover && (form.cover.value || null) !== (q.cover ?? null)) body.cover = form.cover.value || null;
      if (refs?.changed()) Object.assign(body, { references: refs.value(), referenceCredit: refs.credit() });
      if (!Object.keys(body).length) return sheet.close();
      const button = $('[type="submit"]', form);
      button.disabled = true;
      try {
        await api(`admin/questions/${encodeURIComponent(q.id)}/meta`, { method: 'POST', body });
        saved = true;
        sheet.close();
        resolve(true);
        if (owner === accountKey() && current()) toast(`已保存：${body.title ?? q.title}`);
      } catch (err) {
        error.textContent = err.message;
        button.disabled = false;
      }
    });
  });
}

const REVIEW_SUMMARY = {
  questions: '题目只能人工审核，通过后进入题库并开放投稿。确认提示词是一项具体、可比较的生成任务；拒绝时写明理由，作者会看到。示例结果的内容可以在题目里直接审核。',
  content: '只判断能否公开。自动审核没能确定的投稿在这里由人决定：通过后转入「核验」，拒绝时写明理由，作者会看到。针对审查模型的提示词注入会被自动拒绝、不进这里；要复查或改判，到「已处理」的「机审拒绝」「疑似注入」。',
  unverified: '内容已通过、还没核验的投稿，最早的在前。核对能否运行、是否符合题目、生成信息是否可信。通过即公开到展览馆，单轮生成且无人工介入的同时进入盲评；无法核实的标记存疑并写明原因。',
  done: '核验过的作品，每行写明现在在哪里显示，按钮就是下一步。存疑与拒绝的原因对作者可见。',
  log: '最近的审核与管理操作。',
  catalog: '站内的全部题目：发布者、公开状态和作品情况。可以编辑、开关投稿、指定封面、撤下或恢复；已有投票的题目不能删除。',
  works: '查找、编辑作品信息，分别管理展览馆与盲评展示。审核决定在作品详情中单独处理；保存信息不会自动通过审核。',
  members: '站内的全部账号：角色、邮箱和参与情况。可以把成员设为普通或高级管理员，也可以撤销；自己和服务器固定的账号除外。',
};
const WORK_FILTERS = { all: '全部', public: '已公开', content: '内容审核中', unverified: '待核验', questioned: '存疑', off: '已撤下', rejected: '已拒绝' };
const ARENA_FILTERS = { all: '全部盲评状态', in_pool: '在盲评池', off: '已关闭盲评', not_qualified: '生成方式不符', not_ready: '尚不能盲评' };
const REVIEW_EMPTY = { questions: '没有待审核的题目', content: '没有等待人工审核内容的投稿', unverified: '没有等待核验的投稿' };
// Batch decisions per queue: [status, button, done, what it means]. Each item succeeds or fails on its own.
const BULK = {
  content: { path: 'admin/works/batch-moderation', unit: '件', actions: [
    ['approved', '内容通过', '内容已通过', '内容放行后转入「核验」；新题目的示例结果等题目通过后再进入。'],
    ['rejected', '拒绝', '内容已拒绝', '作品不会公开，作者会看到理由。']] },
  unverified: { path: 'admin/works/batch-review', unit: '件', actions: [
    ['verified', '通过核验', '已通过核验', '通过核验即公开到展览馆，单轮生成且无人工介入的同时进入盲评。'],
    ['questioned', '标记存疑', '已标记存疑', '存疑原因对作者与访客可见。']] },
  questions: { path: 'admin/questions/batch-moderation', unit: '道', actions: [
    ['approved', '通过', '已通过', '公开到题库并开放投稿，沿用作者选的题目类型和领域。'],
    ['rejected', '拒绝', '已拒绝', '题目不会公开，作者会看到理由。']] },
};

const REVIEW_PAGE_SIZE = 50;
let reviewPreferencesOwner = '';
const reviewPreferences = new Map();

function review(root, ctx) {
  const [routeTab = '', routeQuery = ''] = (ctx.param ?? '').split('?');
  const owner = accountKey();
  if (reviewPreferencesOwner !== owner) { reviewPreferences.clear(); reviewPreferencesOwner = owner; }
  const rememberedPreferences = reviewPreferences.get(routeTab);
  const allowed = { ...todoTabs(), ...DONE_TABS, ...manageTabs() };
  const requestedPanel = Object.hasOwn(allowed, routeTab) ? routeTab : Object.hasOwn(FILTER_TABS, routeTab) ? 'done' : 'default';
  const state = { works: null, audit: [], questions: [], error: '', tab: requestedPanel === 'default' ? 'unverified' : requestedPanel,
    resolvedPanel: null, counts: null, filterCounts: {}, total: 0, scopeTotal: 0, autoTotal: 0, questionChoices: [], domainChoices: [],
    filter: FILTER_TABS[routeTab] ?? 'all', picked: new Set(), pages: {},
    catalog: { filter: 'all', query: '', category: '', domain: '', sort: 'latest' }, members: membersState(),
    managed: { filter: 'all', query: new URLSearchParams(routeQuery).get('q') ?? '', task: new URLSearchParams(routeQuery).get('task') ?? '', arena: 'all', sort: 'latest' } };
  if (rememberedPreferences) {
    state.filter = rememberedPreferences.filter;
    state.pages = { ...rememberedPreferences.pages };
    Object.assign(state.catalog, rememberedPreferences.catalog);
    Object.assign(state.managed, rememberedPreferences.managed);
    Object.assign(state.members, rememberedPreferences.members);
  }
  if (routeQuery) Object.assign(state.managed, { query: new URLSearchParams(routeQuery).get('q') ?? '', task: new URLSearchParams(routeQuery).get('task') ?? '' });
  const rememberPreferences = () => reviewPreferences.set(routeTab, { filter: state.filter, pages: { ...state.pages }, catalog: { ...state.catalog }, managed: { ...state.managed },
    members: Object.fromEntries(['filter', 'query', 'email', 'active', 'sort'].map((key) => [key, state.members[key]])) });
  // Each response already contains one page; never slice it again on the client.
  const pageItems = (items) => items;
  const pagination = (items, key = state.tab) => {
    const total = key === 'auto' ? state.autoTotal : state.total;
    const pages = Math.max(1, Math.ceil(total / REVIEW_PAGE_SIZE)), page = state.pages[key] ?? 1;
    return pages > 1 ? `<nav class="review-pagination" aria-label="列表分页"><button type="button" class="btn sm" data-review-page="${esc(key)}" data-page="${page - 1}"${page === 1 ? ' disabled' : ''}>上一页</button><span>第 ${page} / ${pages} 页 · 共 ${total} 项</span><button type="button" class="btn sm" data-review-page="${esc(key)}" data-page="${page + 1}"${page === pages ? ' disabled' : ''}>下一页</button></nav>` : '';
  };
  const mergeWork = (w) => ({ ...ctx.packagedWork(w.task, w.id), ...w });
  const settle = (data, members = false) => {
    if (members) Object.assign(state.members, { list: data.users, error: '', total: data.total, scopeTotal: data.scopeTotal, filterCounts: data.filterCounts, paged: true });
    const questions = data.questions ?? [];
    Object.assign(state, { works: [...new Map([...(data.works ?? []), ...(data.autoWorks ?? []), ...questions.flatMap((q) => q.samples ?? [])].map((w) => [pickId(w), mergeWork(w)])).values()],
      questions, audit: data.audit ?? [], error: '', counts: data.counts ?? state.counts, filterCounts: data.filterCounts ?? {},
      total: data.total ?? 0, scopeTotal: data.scopeTotal ?? data.total ?? 0, autoTotal: data.autoTotal ?? 0,
      questionChoices: data.questionChoices ?? [], domainChoices: data.domainChoices ?? [], resolvedPanel: members ? 'members' : data.panel });
    state.pages[members ? 'members' : data.panel] = data.page ?? 1;
    if (data.autoPage) state.pages.auto = data.autoPage;
  };
  function listPath() {
    const panel = state.resolvedPanel ?? requestedPanel;
    const values = panel === 'members' ? state.members : panel === 'works' ? state.managed : panel === 'catalog' ? state.catalog : {};
    const params = new URLSearchParams({ page: String(state.pages[panel] ?? 1), pageSize: String(REVIEW_PAGE_SIZE) });
    if (panel !== 'members') params.set('panel', panel);
    if (panel === 'content') params.set('autoPage', String(state.pages.auto ?? 1));
    for (const key of ['filter', 'task', 'arena', 'sort', 'category', 'domain', 'email', 'active']) {
      let value = values[key];
      if (key === 'email' && value === 'none') value = 'unbound';
      if (value) params.set(key, value);
    }
    if (values.query) params.set('q', values.query);
    if (panel === 'done') params.set('filter', state.filter);
    return `${panel === 'members' ? 'admin/users' : 'review'}?${params}`;
  }
  const known = isStaff() ? recall(listPath()) : null;
  if (known) settle(known, requestedPanel === 'members');
  let active = true, request = 0, controller = null, loadingRequest = null, searchTimer = null;
  let detailRequest = 0, detailController = null, detailPromise = null, detailPath = '', advance = null, openingDetail = '';
  const detailQuestions = new Map();
  const questionContext = () => [...new Map([...state.questionChoices, ...state.questions, ...detailQuestions.values()].map((q) => [q.id, q])).values()];
  const current = () => active && owner === accountKey() && isStaff();
  function cancelDetail() { detailRequest++; detailController?.abort(); detailController = null; detailPromise = null; detailPath = ''; openingDetail = ''; }
  function cancelLoad(cancelDetails = true) {
    request++; controller?.abort(); controller = null; loadingRequest = null;
    if (cancelDetails) { cancelDetail(); advance = null; }
  }
  function paintResults() {
    const key = state.tab === 'members' ? 'member' : state.tab === 'works' ? 'managed' : state.tab === 'catalog' ? 'catalog' : '';
    const results = key && root.querySelector(`[data-${key}-results]`);
    if (!results || state.works === null) return draw();
    const chips = root.querySelector(`[data-${key}-chips]`);
    chips.innerHTML = key === 'member' ? memberChips(state.members) : key === 'managed' ? managedChips() : catalogChips();
    results.innerHTML = state.error ? `<p class="form-error" role="alert">${esc(state.error)}</p><button type="button" class="btn sm" data-review-retry>重试加载</button>`
      : key === 'member' ? memberResults(state.members) + pagination(state.members.list, 'members') : key === 'managed' ? managedResults() : catalogResults();
    const heading = root.querySelector('.work-manage-heading h3 span');
    if (heading) heading.textContent = String(state.scopeTotal);
    syncBulk();
    ctx.settleImages();
    rememberPreferences();
  }
  function load(arriving = false, replace = false, partial = false, preserveDetail = false) {
    if (loadingRequest && !replace) return loadingRequest;
    if (replace) cancelLoad(!preserveDetail);
    const version = ++request;
    state.error = '';
    if (!current()) { draw(); return Promise.resolve(); }
    const path = listPath(), members = path.startsWith('admin/users?');
    const reading = new AbortController();
    controller = reading;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; reading.abort(); }, 15000);
    const before = JSON.stringify(state);
    const results = partial && root.querySelector(`[data-${state.tab === 'members' ? 'member' : state.tab === 'works' ? 'managed' : 'catalog'}-results]`);
    if (results) results.innerHTML = '<p class="muted">正在载入…</p>';
    loadingRequest = (async () => {
      try {
        let data = await apiRemembered(path, { signal: reading.signal });
        if (!current() || version !== request) return;
        const panel = members ? 'members' : data.panel;
        const last = Math.max(1, Math.ceil(data.total / REVIEW_PAGE_SIZE));
        const lastAuto = Math.max(1, Math.ceil((data.autoTotal ?? 0) / REVIEW_PAGE_SIZE));
        // Decisions and deletions can remove the last row of the last page.
        if (data.page > last || panel === 'content' && data.autoPage > lastAuto) {
          state.resolvedPanel = panel;
          state.pages[panel] = Math.min(data.page, last);
          state.pages.auto = Math.min(data.autoPage ?? 1, lastAuto);
          data = await apiRemembered(listPath(), { signal: reading.signal });
          if (!current() || version !== request) return;
        }
        settle(data, members);
      } catch (error) {
        if (!current() || version !== request) return;
        state.error = timedOut ? '审核列表加载超时，请重试。' : error.message;
      } finally {
        clearTimeout(timer);
        if (version === request) { controller = null; loadingRequest = null; }
      }
      if (!current() || version !== request) return;
      if (!arriving || JSON.stringify(state) !== before) partial ? paintResults() : draw();
      ctx.settleImages();
      if (advance) {
        const { bucket, doneKey } = advance;
        advance = null;
        const next = queue(bucket).find((w) => pickId(w) !== doneKey && canDecide(w));
        if (next) void (bucket === 'content' ? openHeld : open)(next, bucket);
      }
    })();
    return loadingRequest;
  }
  // Details are fetched only for an explicit open. Repeated clicks share the read; a new
  // selection, route change or identity change cancels it before it can open a stale sheet.
  function readDetail(path) {
    if (detailPromise && detailPath === path) return detailPromise;
    const opening = openingDetail;
    cancelDetail();
    openingDetail = opening;
    const version = ++detailRequest, reading = new AbortController();
    detailController = reading; detailPath = path;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; reading.abort(); }, 15000);
    detailPromise = api(path, { signal: reading.signal }).then((data) => current() && version === detailRequest ? data : null, (error) => {
      if (current() && version === detailRequest) toast(timedOut ? '详情加载超时，请重试。' : error.message);
      return null;
    }).finally(() => {
      clearTimeout(timer);
      if (version === detailRequest) { detailController = null; detailPromise = null; detailPath = ''; }
    });
    return detailPromise;
  }
  const workDetail = (work) => readDetail(`admin/works/${encodeURIComponent(work.task)}/${encodeURIComponent(work.id)}`);
  const filterCount = (filter) => state.filterCounts[filter] ?? 0;
  const queue = (bucket) => (state.works ?? []).filter((w) => bucket === 'done' ? true : (w.bucket ?? reviewBucket(ctx, w, state.questions)) === bucket);
  const waitingQuestions = () => state.questions;
  const tabCount = (id) => state.counts?.[id] ?? 0;
  // Batch switches on the decided list: only where every row needs the same next step.
  const doneBulk = () => (state.tab === 'done' ? { noarena: 'arena-on', off: 'restore' }[state.filter] : null);
  // What the batch checkboxes of the current queue can select.
  const pickable = () => (state.tab === 'questions' ? pageItems(waitingQuestions()).map((q) => q.id)
    : state.tab === 'works' ? pageItems(managedWorks()).filter(displayReady).filter(canDecide).map(pickId)
    : state.tab === 'done' ? (doneBulk() ? pageItems(queue('done')).filter(canDecide).filter((w) => doneBulk() !== 'arena-on' || w.arena?.state === 'off').map(pickId) : [])
      : BULK[state.tab] ? pageItems(queue(state.tab)).filter(canDecide).map(pickId) : []);
  const taskOf = (w) => ctx.DATA.tasks.find((t) => t.id === w.task) ?? state.questions?.find((q) => q.id === w.task) ?? state.questionChoices.find((q) => q.id === w.task);
  const displayReady = (w) => w.status === 'verified' && !held(w) && !w.entertainment_route && ctx.DATA.tasks.some((t) => t.id === w.task);
  const arenaState = (w) => !displayReady(w) ? 'not_ready' : w.arena?.state ?? 'not_ready';
  const managedWorks = () => state.works ?? [];
  function managedRow(w) {
    const key = esc(pickId(w)), task = taskOf(w), model = ctx.modelOf(w);
    const bucket = w.bucket ?? reviewBucket(ctx, w, state.questions ?? []);
    const hidden = !ctx.inGallery(w.task, w.id);
    const href = hidden && w.scene ? esc(w.scene) : `#/${esc(w.task)}/${esc(w.id)}`;
    const issue = ['questioned', 'rejected'].includes(bucket);
    const checkLabel = held(w) ? '内容' : bucket === 'sample' || !ctx.DATA.tasks.some((t) => t.id === w.task) ? '题目' : '核验';
    const checkText = held(w) ? { pending: '自动审核中', review: '待人工复核', rejected: '未通过' }[w.moderation.status]
      : checkLabel === '题目' ? bucket === 'rejected' ? '未通过 / 未公开' : '尚未公开'
        : { unverified: '待核验', questioned: '存疑', verified: '已验证', off: '已验证', rejected: '未通过' }[bucket] ?? '待核验';
    const ready = displayReady(w), selectable = ready && canDecide(w);
    const arena = arenaState(w), arenaText = { in_pool: '在盲评池', off: '已关闭', not_qualified: '生成方式不符', not_ready: '尚不能盲评' }[arena] ?? '尚不能盲评';
    const pickHint = !canDecide(w) ? '本人作品的展示设置需由其他管理员处理' : !ready ? '通过审核并公开题目后可批量管理展示' : `选择「${w.title}」`;
    return `<article class="work-row is-pickable work-managed-row" data-status="${esc(w.status)}">
      <label class="row-pick"><input type="checkbox"${selectable ? ` data-pick="${key}"` : ' disabled'}${state.picked.has(pickId(w)) ? ' checked' : ''} aria-label="${esc(pickHint)}" title="${esc(pickHint)}"></label>
      ${thumb(ctx, w, { link: false })}<div class="work-main">
        <p class="result-model">${brandMark(model, 'brand-mark sm')}<b data-i18n-ignore>${esc(model.name)}</b>${w.effort ? `<span class="badge" data-i18n-ignore>${esc(w.effort)}</span>` : ''}</p>
        <h3><a href="${href}"${hidden && w.scene ? ' target="_blank" rel="noopener"' : ''} data-i18n-ignore>${esc(w.title)}</a></h3>
        <p class="work-meta"><span data-i18n-ignore>${esc(task?.title ?? w.task)}</span> · ${publisherHtml(ctx, w)}${w.addedAt ? ` · ${dateHtml(w.addedAt)}` : ''}${w.mine ? ' · 本人作品' : ''}</p>
        <p class="work-state"><span${issue ? ' class="is-issue"' : ''}><small>${checkLabel}</small>${esc(checkText)}</span><span${ready && galleryOn(w) ? '' : ' class="is-muted"'}><small>展览馆</small>${ready && galleryOn(w) ? '已公开' : '未公开'}</span><span${arena === 'in_pool' ? '' : ' class="is-muted"'}${w.arena?.reason ? ` title="${esc(w.arena.reason)}"` : ''}><small>盲评</small>${arenaText}</span></p>
      </div><div class="work-side"><button class="btn sm" type="button" data-manage-work="${key}">管理</button></div>
    </article>`;
  }
  function managedChips() {
    return Object.entries(WORK_FILTERS).map(([id, label]) => `<button class="chip" type="button" data-managed-filter="${id}" aria-pressed="${state.managed.filter === id}">${label}<span>${state.filterCounts[id] ?? 0}</span></button>`).join('');
  }
  function managedResults() {
    const works = managedWorks(), total = state.scopeTotal;
    const bulk = pickable().length ? `<div class="bulk-bar" data-bulk-bar><label class="row-pick"><input type="checkbox" data-pick-all aria-label="全选当前页可管理的作品"></label><span data-bulk-count></span>${['gallery-on', 'hide', 'arena-off'].map((action, i) => `<button class="btn sm${i ? '' : ' primary'}" type="button" data-bulk-face="${action}" disabled>${FACE_ACTIONS[action][0]}</button>`).join('')}</div>` : '';
    return `<p class="work-manage-list-meta">显示 ${state.total} / ${total} 件作品${works.some((w) => !canDecide(w)) ? ' · 本人作品可编辑信息，展示设置由其他管理员处理' : ''}</p>${bulk}
      ${works.length ? `<div class="work-list">${pageItems(works).map(managedRow).join('')}</div>${pagination(works)}` : '<div class="board-empty"><p class="board-empty-title">没有匹配的作品</p><button class="btn sm" type="button" data-managed-reset>清除筛选</button></div>'}`;
  }
  function managedList() {
    const taskTitles = new Map([...ctx.DATA.tasks, ...state.questionChoices, ...state.questions].map((t) => [t.id, t.title]));
    for (const w of state.works ?? []) if (!taskTitles.has(w.task)) taskTitles.set(w.task, w.task);
    const options = (items, current) => items.map(([id, label]) => `<option value="${esc(id)}"${id === current ? ' selected' : ''}>${esc(label)}</option>`).join('');
    return `<div class="work-management"><div class="work-manage-heading"><h3>全部作品<span>${state.scopeTotal}</span></h3><p>信息、核验与展示状态分别管理</p></div>
      <div class="work-manage-tools"><label class="collection-search">${icon('search')}<input type="search" data-managed-search aria-label="搜索作品、模型或发布者" placeholder="搜索作品、模型或发布者" value="${esc(state.managed.query)}"></label>
        <select name="task" data-managed-select aria-label="按题目筛选">${options([['', '全部题目'], ...taskTitles], state.managed.task)}</select>
        <select name="arena" data-managed-select aria-label="按盲评状态筛选">${options(Object.entries(ARENA_FILTERS), state.managed.arena)}</select>
        <select name="sort" data-managed-select aria-label="作品排序">${options([['latest', '最新在前'], ['oldest', '最早在前'], ['title', '按作品名称']], state.managed.sort)}</select></div>
      <div class="chips work-manage-filters" data-managed-chips>${managedChips()}</div><div class="work-manage-results" data-managed-results>${managedResults()}</div></div>`;
  }
  // Preserve input focus while filters and search redraw only the result area.
  function updateManaged() {
    if (!active || owner !== accountKey() || !root.querySelector('[data-managed-results]')) return;
    clearTimeout(searchTimer);
    state.pages.works = 1;
    state.picked.clear();
    rememberPreferences();
    return load(false, true, true);
  }
  // 全部题目, laid out like 全部作品: the search and selects set the scope the chips count within.
  const catalogQuestions = () => state.questions;
  function catalogChips() {
    return Object.entries(CATALOG_FILTERS).map(([id, label]) => `<button class="chip" type="button" data-catalog-filter="${id}" aria-pressed="${state.catalog.filter === id}">${label}<span>${state.filterCounts[id] ?? 0}</span></button>`).join('');
  }
  function catalogResults() {
    const questions = catalogQuestions(), total = state.scopeTotal;
    const buckets = new Map();
    for (const w of state.works ?? []) {
      if (!buckets.has(w.task)) buckets.set(w.task, []);
      buckets.get(w.task).push(reviewBucket(ctx, w, state.questions ?? []));
    }
    return `<p class="work-manage-list-meta">显示 ${state.total} / ${total} 道题目</p>
      ${questions.length ? `<div class="submission-questions">${pageItems(questions).map((q) => catalogRow(ctx, q, buckets.get(q.id) ?? [])).join('')}</div>${pagination(questions)}` : '<div class="board-empty"><p class="board-empty-title">没有匹配的题目</p><button class="btn sm" type="button" data-catalog-reset>清除筛选</button></div>'}`;
  }
  function catalogList() {
    const domains = state.domainChoices;
    const options = (items, current) => items.map(([id, label]) => `<option value="${esc(id)}"${id === current ? ' selected' : ''}>${esc(label)}</option>`).join('');
    return `<div class="work-management"><div class="work-manage-heading"><h3>全部题目<span>${state.scopeTotal}</span></h3><p>公开状态、投稿与作品分别管理</p></div>
      <div class="work-manage-tools"><label class="collection-search">${icon('search')}<input type="search" data-catalog-search aria-label="搜索题目、提示词或发布者" placeholder="搜索题目、提示词或发布者" value="${esc(state.catalog.query)}"></label>
        <select name="category" data-catalog-select aria-label="按题目类型筛选">${options([['', '全部类型'], ...CATEGORIES.map((c) => [c.name, c.label])], state.catalog.category)}</select>
        <select name="domain" data-catalog-select aria-label="按领域筛选">${options([['', '全部领域'], ...domains.map((d) => [d, d])], state.catalog.domain)}</select>
        <select name="sort" data-catalog-select aria-label="题目排序">${options([['latest', '最新在前'], ['oldest', '最早在前'], ['title', '按题目名称'], ['works', '作品最多']], state.catalog.sort)}</select></div>
      <div class="chips work-manage-filters" data-catalog-chips>${catalogChips()}</div><div class="work-manage-results" data-catalog-results>${catalogResults()}</div></div>`;
  }
  // Preserve input focus while filters and search redraw only the result area.
  function updateCatalog() {
    if (!active || owner !== accountKey() || !root.querySelector('[data-catalog-results]')) return;
    clearTimeout(searchTimer);
    state.pages.catalog = 1;
    state.picked.clear();
    rememberPreferences();
    return load(false, true, true);
  }
  function draw() {
    clearTimeout(searchTimer);
    if (!platform.user) return signedOut(root, ctx, '请先登录管理员账号');
    if (!isStaff()) {
      root.innerHTML = `${ctx.pageStart({ ...ACCOUNT, section: 'me', heading: '审核', nav: accountNav(ctx, 'review'), crumbs: [{ text: '个人中心', href: '#/me' }, { text: '审核' }] })}<section class="account-empty">${icon('shield')}<h2>只有管理员可以审核作品</h2><p>管理员由高级管理员授予。</p><a class="btn primary" href="#/questions">回到题库${icon('right')}</a></section>${ctx.pageEnd()}`;
      return;
    }
    // Without a tab in the address, open the first queue that has work waiting.
    const todo = todoTabs(), manage = manageTabs();
    const tab = state.resolvedPanel ?? state.tab;
    if (state.works !== null) platform.review = {
      questions: tabCount('questions'), content: tabCount('content'), unverified: tabCount('unverified'),
    };
    // The selection belongs to one queue and drops what has left it.
    if (state.tab !== tab) state.picked.clear();
    state.tab = tab;
    const ids = pickable();
    for (const id of state.picked) if (!ids.includes(id)) state.picked.delete(id);
    const bulkButtons = doneBulk() ? `<button class="btn sm primary" type="button" data-bulk-face="${doneBulk()}" disabled>${FACE_ACTIONS[doneBulk()][0]}</button>`
      : (BULK[tab]?.actions ?? []).map(([status, label], i) => `<button class="btn sm${i ? '' : ' primary'}" type="button" data-bulk="${status}" disabled>${label}</button>`).join('');
    const bulk = bulkButtons && ids.length ? `<div class="bulk-bar" data-bulk-bar><label class="row-pick"><input type="checkbox" data-pick-all aria-label="全选当前页"></label><span data-bulk-count></span>${bulkButtons}</div>` : '';
    const works = state.works ?? [];
    const byKey = new Map(works.map((w) => [pickId(w), w]));
    const questions = state.questions ?? [];
    const questionTitles = new Map([...ctx.DATA.tasks, ...state.questionChoices, ...questions].map((q) => [q.id, q.title]));
    const rows = (bucket) => pageItems(queue(bucket), bucket).map((w) => workRow(ctx, w, { bucket: bucket === 'done' ? w.bucket ?? reviewBucket(ctx, w, questions) : bucket, questions,
      picked: bucket === tab && ids.includes(pickId(w)) ? state.picked.has(pickId(w)) : undefined })).join('');
    const empty = (text) => `<div class="board-empty"><p class="board-empty-title">${text}</p></div>`;
    // A logged work links to its gallery page, or to its preview while it is not in the gallery.
    const auditWork = (w, id) => !w ? `<span class="muted">${esc(id)}（已删除）</span>`
      : ctx.inGallery(w.task, w.id) ? `<a href="#/${esc(w.task)}/${esc(w.id)}" data-i18n-ignore>${esc(w.title)}</a>`
        : w.scene ? `<a href="${esc(w.scene)}" target="_blank" rel="noopener" data-i18n-ignore>${esc(w.title)}</a>` : esc(w.title);
    let list;
    if (tab === 'log') {
      list = state.audit.length ? `<ol class="audit">${state.audit.map((row) => `<li>${timeHtml(row.at)}<span class="audit-actor" data-i18n-ignore>${esc(row.actor)}</span><b>${esc(ACTIONS[row.action] ?? row.action)}</b><span class="audit-work" data-i18n-ignore>${!row.work && row.action?.startsWith('question-') && row.task ? esc(questionTitles.get(row.task) ?? row.task) : ''}${row.work ? auditWork(byKey.get(`${row.task}/${row.work}`), row.work) : ''}${row.detail ? ` · <span data-i18n-ignore>${esc(row.detail)}</span>` : ''}</span></li>`).join('')}</ol>${pagination(state.audit)}` : '<p class="muted">还没有记录。</p>';
    } else if (tab === 'questions') {
      const waiting = waitingQuestions();
      list = `${waiting.length ? `${bulk}<div class="submission-questions">${pageItems(waiting).map((q) => reviewQuestionRow(ctx, q, state.picked.has(q.id))).join('')}</div>${pagination(waiting)}` : empty(REVIEW_EMPTY.questions)}
          <p class="fine">处理过的题目在<a href="#/review/catalog">全部题目</a>里。</p>`;
    } else if (tab === 'catalog') {
      list = catalogList();
    } else if (tab === 'works') {
      list = managedList();
    } else if (tab === 'members') {
      list = memberList(state.members, state.members.list ? pagination(state.members.list, 'members') : '');
    } else if (tab === 'content') {
      const waiting = rows('content'), auto = rows('auto');
      list = `${waiting ? `${bulk}<div class="work-list">${waiting}</div>${pagination(queue('content'), 'content')}` : empty(REVIEW_EMPTY.content)}
        ${auto ? `<h3 class="review-subhead">自动审核中 · ${state.autoTotal}<small>完成后会自动转入「核验」或回到这里，也可以提前人工审核</small></h3><div class="work-list is-muted">${auto}</div>${pagination(queue('auto'), 'auto')}` : ''}`;
    } else if (tab === 'done') {
      const chips = `<div class="chips review-filters">${Object.entries(DONE_FILTERS).map(([id, text]) => `<button class="chip${id === state.filter ? ' on' : ''}" type="button" data-filter="${id}" aria-pressed="${id === state.filter}"><span>${text}</span> · ${filterCount(id)}</button>`).join('')}</div>`;
      const shown = rows('done');
      list = `${chips}${shown ? `${bulk}<div class="work-list">${shown}</div>${pagination(queue('done'))}` : empty(state.filter === 'all' ? '还没有核验过的作品' : `没有${DONE_FILTERS[state.filter]}的作品`)}`;
    } else {
      const shown = rows(tab);
      list = shown ? `${bulk}<div class="work-list">${shown}</div>${pagination(queue(tab))}` : empty(REVIEW_EMPTY[tab]);
    }
    const link = ([id, text], counted) => `<a href="#/review/${id}"${id === tab ? ' aria-current="page"' : ''}>${text}${counted && state.works !== null ? `<span>${tabCount(id)}</span>` : ''}</a>`;
    root.innerHTML = `${ctx.pageStart({ ...ACCOUNT, section: 'me', heading: '审核', nav: accountNav(ctx, 'review'),
      crumbs: [{ text: '个人中心', href: '#/me' }, { text: '审核' }],
      caption: `<nav class="review-nav" aria-label="审核分类">
        <div class="seg review-tabs"><span class="seg-caption">待处理</span>${Object.entries(todo).map((entry) => link(entry, true)).join('')}</div>
        <div class="seg review-tabs"><span class="seg-caption">已处理</span>${Object.entries(DONE_TABS).map((entry) => link(entry, false)).join('')}</div>
        ${Object.keys(manage).length ? `<div class="seg review-tabs"><span class="seg-caption">管理</span>${Object.entries(manage).map((entry) => link(entry, false)).join('')}</div>` : ''}</nav>` })}
      <section class="submission-section">
        <p class="submission-summary">${REVIEW_SUMMARY[tab]}</p>
        ${state.error ? `<div class="review-load-error"><p class="form-error" role="alert">${esc(state.error)}</p><button type="button" class="btn sm" data-review-retry>重试加载</button></div>` : ''}
        ${state.works === null ? state.error ? '' : '<p class="muted">正在载入…</p>' : list}
      </section>
    ${ctx.pageEnd()}`;
    setPageTitle(['审核', ctx.DATA.title]);
    syncBulk();
    rememberPreferences();
  }
  // Updates the batch bar in place, so ticking boxes keeps the scroll position.
  function syncBulk() {
    const bar = root.querySelector('[data-bulk-bar]');
    if (!bar) return;
    const n = state.picked.size, total = pickable().length;
    const all = bar.querySelector('[data-pick-all]');
    all.checked = n > 0 && n === total;
    all.indeterminate = n > 0 && n < total;
    const unit = BULK[state.tab]?.unit ?? '件';
    const faces = Boolean(bar.querySelector('[data-bulk-face]'));
    bar.querySelector('[data-bulk-count]').textContent = `${n ? `已选 ${n} ${unit}` : `全选当前页（${total} ${unit}）`}${faces && (n > 200 || total > 200) ? ' · 每批最多 200 件，请缩小选择范围' : ''}`;
    $$('[data-bulk], [data-bulk-face]', bar).forEach((button) => { button.disabled = !n || faces && n > 200; });
  }
  // After a decision in a queue, the oldest remaining work of that queue opens right away.
  const nextIn = (bucket, doneKey) => () => {
    if (!active || owner !== accountKey()) return '';
    const next = queue(bucket).find((w) => pickId(w) !== doneKey && canDecide(w));
    if (next) { (bucket === 'content' ? openHeld : open)(next, bucket); return ''; }
    if ((state.counts?.[bucket] ?? 0) > 0) {
      advance = { bucket, doneKey };
      void load(false, true, false, true);
      return '';
    }
    return bucket === 'content' ? ' · 内容队列已清空' : ' · 核验队列已清空';
  };
  function changedWork(work) {
    if (!active || owner !== accountKey()) return;
    cancelLoad();
    const current = state.works?.find((item) => pickId(item) === pickId(work));
    if (current) {
      const before = current.bucket;
      Object.assign(current, work);
      current.bucket = reviewBucket(ctx, current, questionContext());
      if (before !== current.bucket && state.counts) {
        if (Object.hasOwn(state.counts, before)) state.counts[before] = Math.max(0, state.counts[before] - 1);
        if (Object.hasOwn(state.counts, current.bucket)) state.counts[current.bucket]++;
      }
    }
    draw();
  }
  async function showWorkDetail(work, kind, bucket, provided = null) {
    const key = `${kind}:${pickId(work)}`;
    if (openingDetail === key) return;
    openingDetail = key;
    try {
      const data = provided ?? await workDetail(work);
      if (!data || !current() || openingDetail !== key) return;
      if (data.question) detailQuestions.set(data.question.id, data.question);
      const full = mergeWork(data.work), questions = questionContext();
      if (kind === 'manage') openWorkManagement(ctx, full, { questions, audit: data.audit ?? [], createEditor: reviewEditor,
        onReview: () => { if (current()) open(full, null, data); }, onContent: () => { if (current()) openHeld(full, null, data); },
        onChanged: changedWork, onRemoved: cancelLoad });
      else (kind === 'content' ? openContent : openReview)(ctx, full, { questions, onChanged: changedWork,
        onDecided: bucket === (kind === 'content' ? 'content' : 'unverified') ? nextIn(bucket, pickId(work)) : undefined });
    } finally { if (openingDetail === key) openingDetail = ''; }
  }
  const open = (work, bucket, detail) => showWorkDetail(work, 'review', bucket, detail);
  const openHeld = (work, bucket, detail) => showWorkDetail(work, 'content', bucket, detail);
  // One face switch for a row, or for every selected row of the decided list (all or none).
  let switchingFaces = false;
  async function switchFaces(action, works) {
    if (!works.length || switchingFaces) return;
    if (works.some((w) => !canDecide(w))) return toast('本人作品的展示设置需由其他管理员处理');
    const [label, faces, done] = FACE_ACTIONS[action];
    switchingFaces = true;
    try {
      if (works.length > 1 && !(await confirmDialog({ title: `${label} ${works.length} 件？`, message: works.map((w) => `「${w.title}」`).join('、'), confirm: label }))) return;
      if (works.length > 1) await api('admin/works/batch-face-settings', { method: 'POST', body: { works: works.map(({ task, id }) => ({ task, id })), ...faces } });
      else {
        const { work } = await setFaces(works[0].task, works[0].id, faces);
        if (owner === accountKey()) {
          Object.assign(works[0], work);
          updateRememberedReviewWork(works[0]);
        }
      }
      if (owner !== accountKey()) return;
      cancelLoad();
      if (!active) { await refreshPlatform('review'); return; }
      state.picked.clear();
      toast(works.length > 1 ? `${works.length} 件${done}` : `${done}：${works[0].title}`);
      await refreshPlatform('review');
    } catch (error) {
      toast(error.message);
    } finally {
      switchingFaces = false;
      if (active && owner === accountKey()) {
        syncBulk();
        $$('[data-face]', root).forEach((button) => { button.disabled = false; });
      }
    }
  }
  // One decision for every selected item of the current queue. The server decides each item on
  // its own; the ones that failed stay selected and are listed with their reasons.
  function bulkDecide(status) {
    const tab = state.tab, { path, unit, actions } = BULK[tab];
    const [, label, done, meaning] = actions.find(([s]) => s === status);
    const keyOf = (item) => (tab === 'questions' ? item.id : pickId(item));
    const items = [...state.picked].map((id) => (tab === 'questions' ? state.questions : state.works).find((item) => keyOf(item) === id)).filter(Boolean);
    const needsReason = ['rejected', 'questioned'].includes(status);
    let extra = '';
    if (tab === 'unverified' && status === 'verified') {
      const noEffort = items.filter((w) => !w.effort).length, noProvider = items.filter((w) => !ctx.providerOf(w)).length;
      const missing = [noEffort && `${noEffort} 件缺推理档位`, noProvider && `${noProvider} 件缺服务商`].filter(Boolean).join('、');
      extra = `<p class="sheet-text">${missing ? `其中 ${missing}，可以在下面统一补上，否则会失败。` :'所选作品的推理档位和服务商都已登记。'}</p>
        <div class="field-row">
          <label class="field"><span class="field-label">推理档位<small>留空保持各自原值</small></span><input class="input" name="effort" maxlength="20" data-suggest="bulk-efforts" role="combobox" aria-autocomplete="list" aria-expanded="false" autocomplete="off"><datalist id="bulk-efforts">${effortOptions().map((e) => `<option value="${esc(e)}"></option>`).join('')}</datalist></label>
          <label class="field"><span class="field-label">服务商<small>留空保持各自原值</small></span><select class="input" name="providerId"><option value="">保持原值</option>${[...ctx.PROVIDERS.values()].map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>
        </div>
        <p class="fine">填写的项会覆盖所选全部作品的对应信息；其他必填信息不完整的作品会保留待处理，需要逐件打开补齐。</p>`;
    }
    if (tab === 'questions' && status === 'approved') {
      const missing = items.filter((q) => !q.category || !domainsOf(q).length).length;
      if (missing) extra = `<p class="sheet-text">其中 ${missing} 道还没有题目类型或领域，会失败，需要先编辑或单独通过。</p>`;
    }
    const name = (item) => esc(item.title) + (tab === 'questions' ? '' : ` <span>${esc(item.modelName ?? '')}</span>`);
    const sheet = openDialog({
      title: `${label} ${items.length} ${unit}`,
      className: 'confirm-sheet bulk-sheet',
      body: `<form novalidate>
        <p class="sheet-text">${esc(meaning)}</p>
        <ul class="bulk-list">${items.map((item) => `<li>${name(item)}</li>`).join('')}</ul>
        ${extra}
        <label class="field"><span class="field-label">${status === 'questioned' ? '存疑原因' : '理由'}${needsReason ? '<i>*</i><small>所选各项共用</small>' : '<small>选填</small>'}</span><textarea data-i18n-ignore class="input" name="reason" rows="3" maxlength="500"></textarea></label>
        <p class="form-error" role="alert"></p>
        <div class="sheet-actions"><button class="btn" type="button" data-sheet-close>取消</button><button class="btn primary${status === 'rejected' ? ' danger' : ''}" type="submit">${label}</button></div>
      </form>`,
    });
    const form = $('form', sheet.el);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const error = $('.form-error', form);
      const reason = form.reason.value.trim();
      if (needsReason && !reason) { error.textContent = status === 'questioned' ? '请写明存疑原因，作者和访客都会看到' : '请写明拒绝理由'; form.reason.focus(); return; }
      const meta = {};
      if (form.effort?.value.trim()) meta.effort = form.effort.value.trim();
      if (form.providerId?.value) meta.providerId = form.providerId.value;
      const incomplete = [];
      const ready = tab === 'unverified' && status === 'verified' ? items.filter((w) => {
        const fields = document.createElement('form');
        const task = ctx.DATA.tasks.find((t) => t.id === w.task) ?? state.questions?.find((q) => q.id === w.task);
        fields.innerHTML = workFieldsHtml(ctx, task, { ...w, ...(meta.effort ? { effort: meta.effort } : {}), ...(meta.providerId ? { provider: meta.providerId } : {}) });
        const { error: problem } = readWorkFields(fields, task);
        if (problem) incomplete.push({ task: w.task, id: w.id, ok: false, error: { message: problem } });
        return !problem;
      }) : items;
      const body = tab === 'questions' ? { ids: items.map((q) => q.id), status, reason }
        : { works: ready.map(({ task, id }) => ({ task, id })), status, reason, ...(Object.keys(meta).length ? { meta } : {}) };
      const button = $('[type="submit"]', form);
      button.disabled = true;
      let results = [];
      try {
        if (ready.length) ({ results } = await api(path, { method: 'POST', body }));
        results.push(...incomplete);
      } catch (err) {
        error.textContent = err.status === 404 ? '后端暂不支持批量处理。' : err.message;
        button.disabled = false;
        return;
      }
      sheet.close();
      if (!active || owner !== accountKey()) {
        if (owner === accountKey()) await refreshPlatform(tab === 'questions' ? 'question' : 'review');
        return;
      }
      const failed = results.filter((r) => !r.ok);
      cancelLoad();
      const resultKey = (r) => (tab === 'questions' ? r.id : `${r.task}/${r.id}`);
      state.picked = new Set(failed.map(resultKey));
      const succeeded = results.length - failed.length;
      if (failed.length) {
        const title = (r) => items.find((item) => keyOf(item) === resultKey(r))?.title ?? r.id;
        openDialog({
          title: `${succeeded} ${unit}${done}，${failed.length} ${unit}未处理`,
          className: 'confirm-sheet bulk-sheet',
          body: `<p class="sheet-text">未处理的仍保持选中，可以单独打开处理。</p>
            <ul class="bulk-list">${failed.map((r) => `<li>${esc(title(r))} <span>${esc(r.error?.message ?? '处理失败')}</span></li>`).join('')}</ul>
            <div class="sheet-actions"><button class="btn primary" type="button" data-sheet-close>知道了</button></div>`,
        });
      } else {
        toast(`${succeeded} ${unit}${done}`);
      }
      await refreshPlatform(tab === 'questions' ? 'question' : 'review');
    });
  }
  // Question edits, decisions and deletions; returns false when the click is not one of them.
  async function questionAction(e) {
    const decide = e.target.closest('[data-q-decide]');
    const remove = e.target.closest('[data-q-delete]');
    const edit = e.target.closest('[data-q-edit]');
    const id = decide?.dataset.q ?? remove?.dataset.qDelete ?? edit?.dataset.qEdit;
    let q = id && state.questions?.find((item) => item.id === id);
    if (!q) return false;
    const action = edit ?? decide ?? remove;
    if (action.disabled) return true;
    action.disabled = true;
    const path = `questions/${encodeURIComponent(q.id)}`;
    try {
      if (edit) {
        const data = await readDetail(`admin/questions/${encodeURIComponent(q.id)}`);
        if (!data || !current()) return true;
        q = data.question;
        if (!(await editQuestion(q, data.works ?? [], current))) return true;
      }
      if (decide && !(await decideQuestion(q, decide.dataset.qDecide, () => active))) return true;
      if (remove) {
        if (!(await confirmDialog({ title: '删除这道题？', message: `「${q.title}」会从题库中移除并写入审核记录${q.works ? `，${q.works} 件作品随之删除` : ''}。已有投票的题目不能删除。`, confirm: '删除', danger: true }))) return true;
        if (!active || owner !== accountKey()) return true;
        await api(path, { method: 'DELETE' });
        if (active && owner === accountKey()) toast('题目已删除');
      }
    } catch (err) {
      if (active && owner === accountKey()) toast(err.message);
      return true;
    } finally {
      action.disabled = false;
    }
    if (owner !== accountKey()) return true;
    cancelLoad();
    await refreshPlatform('question');
    return true;
  }
  function updateMembers() {
    if (!current() || !root.querySelector('[data-member-results]')) return;
    clearTimeout(searchTimer);
    state.pages.members = 1;
    rememberPreferences();
    return load(false, true, true);
  }
  root.onchange = (e) => {
    const memberSelect = e.target.closest('[data-member-select]');
    if (memberSelect) {
      state.members[memberSelect.name] = memberSelect.value;
      return updateMembers();
    }
    const select = e.target.closest('[data-managed-select]');
    if (select) {
      state.managed[select.name] = select.value;
      return updateManaged();
    }
    const catalogSelect = e.target.closest('[data-catalog-select]');
    if (catalogSelect) {
      state.catalog[catalogSelect.name] = catalogSelect.value;
      return updateCatalog();
    }
    const box = e.target.closest('[data-pick], [data-pick-all]');
    if (!box) return;
    if (box.dataset.pick !== undefined) {
      if (box.checked) state.picked.add(box.dataset.pick);
      else state.picked.delete(box.dataset.pick);
    } else {
      state.picked = new Set(box.checked ? pickable() : []);
      $$('[data-pick]', root).forEach((item) => { item.checked = box.checked; });
    }
    syncBulk();
  };
  // Typing in a management list redraws its results only, so the search keeps its focus.
  root.oninput = (e) => {
    const memberSearch = e.target.closest('[data-member-search]');
    if (memberSearch) {
      state.members.query = memberSearch.value.trim();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(updateMembers, 150);
      return;
    }
    const managed = e.target.closest('[data-managed-search]');
    if (managed) {
      state.managed.query = managed.value.trim();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(updateManaged, 150);
      return;
    }
    const search = e.target.closest('[data-catalog-search]');
    if (!search) return;
    state.catalog.query = search.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(updateCatalog, 150);
  };
  root.onclick = async (e) => {
    if (e.target.closest('[data-review-retry]')) {
      state.error = '';
      draw();
      return load(false, true);
    }
    const paging = e.target.closest('[data-review-page]');
    if (paging) {
      clearTimeout(searchTimer);
      state.pages[paging.dataset.reviewPage] = Number(paging.dataset.page);
      state.picked.clear();
      rememberPreferences();
      return load(false, true, ['members', 'works', 'catalog'].includes(state.tab));
    }
    const managedFilter = e.target.closest('[data-managed-filter]');
    if (managedFilter) {
      state.managed.filter = managedFilter.dataset.managedFilter;
      return updateManaged();
    }
    if (e.target.closest('[data-managed-reset]')) {
      Object.assign(state.managed, { filter: 'all', query: '', task: '', arena: 'all' });
      state.pages.works = 1;
      state.picked.clear();
      draw();
      return load(false, true);
    }
    const memberFilter = e.target.closest('[data-member-filter]');
    if (memberFilter) {
      state.members.filter = memberFilter.dataset.memberFilter;
      return updateMembers();
    }
    if (e.target.closest('[data-member-reset]')) {
      Object.assign(state.members, { filter: 'all', query: '', email: '', active: '' });
      state.pages.members = 1;
      draw();
      return load(false, true);
    }
    const manageMember = e.target.closest('[data-manage-member]');
    if (manageMember) {
      const member = state.members.list?.find((m) => m.id === manageMember.dataset.manageMember);
      if (member) openMember(member, { audit: state.audit, onSaved: () => refreshPlatform('review') });
      return;
    }
    const manageWork = e.target.closest('[data-manage-work]');
    if (manageWork) {
      const w = state.works?.find((item) => pickId(item) === manageWork.dataset.manageWork);
      if (!w) return;
      manageWork.disabled = true;
      try { await showWorkDetail(w, 'manage'); }
      finally { manageWork.disabled = false; }
      return;
    }
    const bulk = e.target.closest('[data-bulk]');
    if (bulk) return bulkDecide(bulk.dataset.bulk);
    const filter = e.target.closest('[data-filter]');
    if (filter) {
      state.filter = filter.dataset.filter;
      state.pages.done = 1;
      state.picked.clear();
      return load(false, true);
    }
    const catalogFilter = e.target.closest('[data-catalog-filter]');
    if (catalogFilter) {
      state.catalog.filter = catalogFilter.dataset.catalogFilter;
      return updateCatalog();
    }
    if (e.target.closest('[data-catalog-reset]')) {
      Object.assign(state.catalog, { filter: 'all', query: '', category: '', domain: '' });
      state.pages.catalog = 1;
      draw();
      return load(false, true);
    }
    const bulkFace = e.target.closest('[data-bulk-face]');
    if (bulkFace) return switchFaces(bulkFace.dataset.bulkFace, (state.works ?? []).filter((w) => state.picked.has(pickId(w))));
    const face = e.target.closest('[data-face]');
    if (face) {
      const work = state.works?.find((w) => pickId(w) === face.dataset.work);
      face.disabled = true;
      return work && switchFaces(face.dataset.face, [work]);
    }
    if (await questionAction(e)) return;
    const button = e.target.closest('[data-review], [data-content], [data-delete]');
    const work = button && state.works?.find((w) => pickId(w) === (button.dataset.review ?? button.dataset.content ?? button.dataset.delete));
    if (!work) return;
    const bucket = reviewBucket(ctx, work, state.questions ?? []);
    // A sample reviewed inside its question card does not pull the next queued work.
    button.disabled = true;
    try {
      if (button.dataset.review !== undefined) await open(work, bucket);
      else if (button.dataset.content !== undefined) await openHeld(work, button.closest('.review-question') ? null : bucket);
      else await removeWork(work, { admin: true, onChanged: cancelLoad });
    } finally { button.disabled = false; }
  };
  draw();
  const loading = load(true);
  return { review: true, ready: state.works === null ? loading : null,
    onPlatformChange(reason) {
      if (['activity', 'session', 'session-ready', 'stale'].includes(reason)) return;
      if (reason === 'reconnect' && !state.error && state.works !== null) return;
      return load(false, true, false, reason === 'review');
    },
    destroy() { rememberPreferences(); active = false; cancelLoad(); clearTimeout(searchTimer); root.onclick = null; root.onchange = null; root.oninput = null; } };
}
