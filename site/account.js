// Personal center (#/me), and the admin review queue (#/review[/<tab>]).
import { $, $$, brandMark, esc, formatBytes, formatDate, formatTime, icon, img } from './ui.js';
import { api, apiRemembered, arenaText, autoRejected, avatarFace, byStaff, canDecide, confirmDialog, injected, isSenior, isStaff, moderationBadge, openBindEmail, openDialog, platform, QUESTION_LABELS, recall, refreshPlatform, requireUser, reviewCount, reviewVerdict, riskLabels, ROLE_LABELS, setFaces, statusBadge, toast } from './platform.js';
import { onWorkFieldChange, readWorkFields, workFieldsHtml } from './work-fields.js';
import { openWorkManagement } from './work-management.js';
import { categoryLabel, domainsOf, matchesQuery } from './categories.js';
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
const MANAGE_TABS = { catalog: '全部题目', works: '全部作品' };
const todoTabs = () => Object.fromEntries(Object.entries(TODO_TABS).filter(([id]) => id !== 'questions' || isSenior()));
const manageTabs = () => Object.fromEntries(Object.entries(MANAGE_TABS).filter(([id]) => id !== 'catalog' || isSenior()));
// Decided uploads by what they show now; each filter answers one question an admin asks.
const DONE_FILTERS = { all: '全部', public: '已公开', noarena: '不进盲评', off: '已撤下', questioned: '存疑', rejected: '已拒绝', machine: '机审拒绝', injection: '疑似注入' };
// Addresses that open the decided list on one filter, including the old decided tabs.
const FILTER_TABS = { verified: 'public', off: 'off', questioned: 'questioned', rejected: 'rejected', noarena: 'noarena', machine: 'machine', injection: 'injection' };
const ME_TABS = { overview: '概览', works: '我的作品', questions: '我的题目' };
const ACCOUNT = { title: '个人中心', description: '每一道提问，每一份解答，都是你的创作足迹。' };
const ACTIONS = { submit: '提交作品', verified: '通过核验', questioned: '标记存疑', unverified: '退回未验证', delete: '删除作品',
  'question-create': '发起题目', 'question-review': '审核题目', 'question-edit': '编辑题目', 'question-resubmit': '重新提交题目', 'question-delete': '删除题目',
  'content-review': '内容审核', 'content-retry': '重新自动审核', meta: '编辑信息', 'face-settings': '调整展示设置' };

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
  const inner = src ? img(src, '') : `<span class="img-empty upload-cover"><b>${esc(w.title)}</b></span>`;
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
// What an admin needs about a held work: the automatic or human verdict and any error code.
function contentNote(w) {
  if (!held(w)) return '';
  const m = w.moderation;
  const text = [autoRejected(m) ? (injected(m) ? '自动拒绝 · 提示词注入' : '自动拒绝') : '', m.reason, m.categories?.length ? `类别：${riskLabels(m.categories).join('、')}` : '',
    m.error ? `错误：${m.error}` : ''].filter(Boolean).join(' · ') || (m.status === 'pending' ? '自动审核进行中' : '');
  return text ? `<p class="result-reason">${icon(m.status === 'rejected' ? 'alert' : 'guide')}<span>${esc(text)}</span></p>` : '';
}
function heldNote(kind, item) {
  const status = item.moderation?.status;
  const hint = HELD[kind][status];
  if (!hint) return '';
  const reason = status === 'rejected' && item.moderation.reason ? `原因：${item.moderation.reason}` : '';
  return `<p class="result-reason">${icon(status === 'rejected' ? 'alert' : 'clock')}<span>${esc(hint + reason)}</span></p>`;
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
  if (content === 'rejected') return stage('内容审核', 'issue', '内容未通过', `作品不会公开。${w.moderation.reason ? `原因：${w.moderation.reason}。` : ''}可以删除后修改，再重新上传。`, true);
  if (['pending', 'review'].includes(asked)) return stage('题目审核', 'held', '题目审核中', '所属题目正在人工审核，通过后作品进入核验流程，届时可以编辑信息。');
  if (asked === 'rejected') return stage('题目审核', 'issue', '题目未通过', '所属题目没有通过审核，作品不会公开。', true);
  if (w.status === 'questioned') return stage('存疑', 'issue', '存疑', `核验存疑${w.reason ? `：${w.reason}` : ''}。存疑作品不能再修改，可以删除后重新上传。`, true);
  if (w.status === 'verified') return { ...stage('已验证', 'verified', '已验证', `${w.reviewedAt ? `${formatDate(w.reviewedAt)} ` : ''}通过核验，${faceOn(w) ? `已公开${arenaText(w.arena) ? `，${arenaText(w.arena)}` : ''}` : '已被管理员撤下'}。`), current: stages.length };
  return stage('等待核验', 'waiting', '等待核验', `等待管理员核对生成信息，公开展示以人工审核和展示设置为准。${days > 0 ? `已等待 ${days} 天。` : ''}`);
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
    rejected: `${w.moderation?.status === 'rejected' && canDecide(w) ? `<button class="btn sm" data-content="${id}">重新审核内容</button>` : ''}${isSenior() ? `<button class="icon-btn" data-delete="${id}" title="删除作品" aria-label="删除「${esc(w.title)}」">${icon('trash')}</button>` : ''}`,
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
      <p class="result-model">${brandMark(model, 'brand-mark sm')}<b>${esc(w.modelName)}</b>${w.effort ? `<span class="badge">${esc(w.effort)}</span>` : ''}${mine
        ? `<span class="status status-${tone}">${icon({ issue: 'alert', verified: 'check' }[mine.group] ?? 'clock')}${mine.badge}</span>`
        : `${moderationBadge(w.moderation, HELD.work[w.moderation?.status])}${statusBadge(w.status, { always: true, reason: w.reason })}`}</p>
      <h3><a href="${href}"${hidden ? ' target="_blank" rel="noopener"' : ''}>${esc(w.title)}</a></h3>
      <p class="work-meta">${esc(task?.title ?? questions.find((q) => q.id === w.task)?.title ?? w.task)}${variant ? ` · ${esc(variant.label)}` : ''}${ctx.sourceLine(w) ? ` · ${esc(ctx.sourceLine(w))}` : w.tool ? ` · 作者原始声明：${esc(w.tool)}` : ''}${w.addedAt ? ` · ${formatDate(w.addedAt)}` : ''}${admin ? ` · ${esc(publisher(ctx, w))}` : ''}</p>
      ${mine
        ? `${stageTrack(mine.stages, mine.current, { row: true, compact: true, failed: mine.failed })}<p class="result-reason">${icon(mine.failed ? 'alert' : mine.group === 'verified' ? 'check' : 'clock')}<span>${esc(mine.note)}</span></p>`
        : `${contentNote(w) || (bucket === 'rejected' ? `<p class="result-reason">${icon('alert')}<span>所属题目未通过审核，作品不会公开。</span></p>` : '')}
      ${['verified', 'off'].includes(bucket) ? `<p class="result-reason">${icon(bucket === 'off' ? 'alert' : 'check')}<span>${esc(doneLine(w))}</span></p>` : ''}
      ${w.reason ? `<p class="result-reason">${icon('alert')}<span>${esc(w.reason)}</span></p>` : ''}`}
    </div>
    <div class="work-side">
      ${reactionSummary(w)}
      <div class="actions">
        ${admin
          ? adminAction(w, bucket)
          : `${w.status === 'unverified' && task ? `<button class="btn sm" data-edit-work="${esc(pickId(w))}">编辑信息</button>` : ''}<button class="icon-btn" data-delete="${esc(pickId(w))}" title="删除作品" aria-label="删除「${esc(w.title)}」">${icon('trash')}</button>`}
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
      <p class="sheet-text">核验通过前可以修改。${platform.site.contentModeration ? '改动文字后会重新做内容审核，审核期间作品暂不公开。' : ''}</p>
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

async function removeWork(w, { admin }) {
  const verified = w.status === 'verified';
  const ok = await confirmDialog({
    title: '删除这件作品？',
    message: `「${w.title}」的文件会被永久删除，展厅中不再显示。${verified ? '它参与过的盲评投票会从榜单中移出。' : ''}${admin ? '操作会记入审核记录。' : ''}`,
    confirm: '删除',
    danger: true,
  });
  if (!ok) return false;
  try {
    await api(`works/${encodeURIComponent(w.task)}/${encodeURIComponent(w.id)}`, { method: 'DELETE' });
    toast('作品已删除');
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
      ? `<details class="prompt-peek question-previous"><summary>${icon('guide')}上次审核意见${m.previous.at ? ` · ${esc(formatDate(m.previous.at))}` : ''}</summary><p>${esc(m.previous.reason)}</p></details>` : ''}`
      : heldNote('question', question);
  return `<article class="submission-question${resubmit ? ' can-resubmit' : ''}">
    <span class="submission-question-mark" aria-hidden="true">${icon('text')}</span>
    <div class="submission-question-body"><h3>${hidden ? esc(question.title) : `<a href="#/${esc(question.id)}">${esc(question.title)}</a>`}${moderationBadge(m, HELD.question[m.status], QUESTION_LABELS)}${again ? `<span class="badge">第 ${m.round} 次提交</span>` : ''}</h3>
      <p class="summary">${esc(question.summary)}</p>
      <p class="work-meta">${[categoryLabel(question.category), ...domainsOf(question)].filter(Boolean).map(esc).join(' · ')}<span>${esc(question.date)}${hidden ? '' : ` · ${works} 件作品`}</span></p>
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
      </form>` : `<p class="profile-name"><b>${esc(name)}</b><button class="btn sm ghost" type="button" data-edit-name>编辑昵称</button></p>`}
      <p class="profile-account">登录账号 ${esc(user.name)}${state.joinedAt ? ` · ${formatDate(state.joinedAt)} 加入` : ''}</p>
    </div><button class="link profile-logout" type="button" data-logout>退出登录</button>
  </section>
  <section class="profile-bindings" aria-labelledby="bindings-title">
    <div class="profile-section-head"><h2 id="bindings-title">账号绑定</h2><p>注册时绑定，用于找回密码与账号安全验证，可随时更换</p></div>
    <div class="binding-list">
      <div class="binding-row"><span class="binding-icon">${icon('mail')}</span><div class="binding-main"><b>邮箱</b><span>${state.email === undefined ? '正在载入…' : state.email ? esc(maskEmail(state.email)) : '未绑定 · 绑定后才能上传、发起题目和投票'}</span></div>
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
      ? `<p class="sheet-text">每件作品都对应一道题目，请按它的提示词生成后上传。</p><div class="upload-picks">${tasks.map((t) => `<a class="upload-pick" href="#/submit/${esc(t.id)}"><b>${esc(t.title)}</b><span>${t.results.filter(ctx.interactive).length} 件作品</span>${icon('next')}</a>`).join('')}</div>`
      : '<p class="sheet-text">暂时没有接受投稿的题目。</p>',
  });
  sheet.el.addEventListener('click', (e) => { if (e.target.closest('a')) sheet.close(); });
}

// ---- personal center: profile, activity, questions, works -------------------------------------
function mine(root, ctx) {
  const empty = { questions: null, works: null, votes: 0, activity: null, receivedReactions: null, joinedAt: null, email: undefined, error: '' };
  // The first draw already shows this account's loading state, so the first load does not redraw it.
  const state = { owner: platform.user?.id ?? null, editing: false, filter: 'all', ...empty };
  const settle = (data, account) => Object.assign(state, { questions: data.questions, works: data.works, votes: data.votes, activity: data.activity, receivedReactions: data.receivedReactions, joinedAt: data.joinedAt, email: account.user?.email ?? null, error: '' });
  // A return to the page draws what it showed last time, and the arrival load redraws only if that changed.
  const known = platform.user ? [recall('me'), recall('auth/me')] : [];
  if (known.length && known.every(Boolean)) settle(...known);
  let active = true, request = 0;
  async function load(arriving = false) {
    const version = ++request;
    if (state.owner !== (platform.user?.id ?? null)) {
      Object.assign(state, { owner: platform.user?.id ?? null, ...empty });
      draw();
    }
    if (!platform.user) return draw();
    const before = JSON.stringify(state);
    try {
      const [data, account] = await Promise.all([apiRemembered('me'), apiRemembered('auth/me')]);
      if (!active || version !== request) return;
      settle(data, account);
    } catch (error) {
      if (!active || version !== request) return;
      state.error = error.message;
    }
    if (!arriving || JSON.stringify(state) !== before) draw();
    watch();
  }
  let poll = 0, polls = 0;
  const statusKey = () => JSON.stringify((state.works ?? []).map((w) => [w.id, w.status, w.moderation?.status]));
  function watch() {
    clearTimeout(poll);
    if (!active || polls >= 40 || !(state.works ?? []).some((w) => w.moderation?.status === 'pending')) return;
    poll = setTimeout(async () => {
      polls++;
      const before = statusKey();
      try {
        const data = await api('me');
        if (!active) return;
        Object.assign(state, { questions: data.questions, works: data.works });
      } catch { /* try again next round */ }
      if (statusKey() !== before) draw();
      watch();
    }, 15000);
  }
  const tab = Object.hasOwn(ME_TABS, ctx.param ?? '') ? ctx.param : 'overview';
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
      ${state.error ? `<p class="form-error submissions-error" role="alert">${esc(state.error)}</p>` : ''}
      ${body}
    ${ctx.pageEnd()}`;
    const calendar = root.querySelector('.activity-scroll');
    if (calendar) calendar.scrollLeft = calendar.scrollWidth;
    ctx.settleImages();
    document.title = `个人中心 · ${ctx.DATA.title}`;
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
  const loading = load(true);
  return { ready: state.works === null ? loading : null, onPlatformChange: () => load(), destroy() { active = false; request++; clearTimeout(poll); root.onsubmit = null; } };
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
  const { work } = await api(`admin/works/${encodeURIComponent(w.task)}/${encodeURIComponent(w.id)}/meta`, { method: 'POST', body: meta });
  Object.assign(w, work);
  return true;
}

// Save information fixes before the decision; only verification needs a complete record.
export function openReview(ctx, w, { questions = [], onDecided } = {}) {
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
        <div class="review-head">${thumb(ctx, w, { link: shown })}<div><h3>${esc(w.title)}</h3><p class="result-model">${statusBadge(w.status, { always: true })}<span>${esc(task?.title ?? w.task)}</span></p>
          <div class="actions"><a class="btn sm" href="${esc(w.scene)}" target="_blank" rel="noopener">打开作品${icon('arrow')}</a>${shown ? `<a class="btn sm" href="#/${esc(w.task)}/${esc(w.id)}">在展厅中查看</a>` : ''}</div></div></div>
        <dl class="facts">
          <div><dt>发布者</dt><dd>${esc(publisher(ctx, w))}${w.addedAt ? ` · ${formatTime(w.addedAt)}` : ''}</dd></div>
          <div><dt>声明的模型</dt><dd>${esc(w.modelName)}${w.vendor ? ` · ${esc(w.vendor)}` : ''}${w.model ? '' : `（未收录${guess ? `，按名称推断为 ${esc(guess)}` : ''}，可在数据仓注册表补录）`}</dd></div>
          <div><dt>推理档位</dt><dd>${esc(w.effort || '默认 / 未设置')}</dd></div>
          <div><dt>Harness</dt><dd>${esc(ctx.harnessOf(w)?.name ?? '未注明')}</dd></div>
          <div><dt>服务商</dt><dd>${esc(ctx.providerOf(w)?.name ?? '未注明')}</dd></div>
          <div><dt>作者原始声明</dt><dd>${esc(w.tool || '未注明')}</dd></div>
          ${w.files ? `<div><dt>文件</dt><dd>${esc(w.sourceName ?? '')} · ${w.files} 个 · ${formatBytes(w.bytes)} · 入口 ${esc(w.root ? `${w.root}/` : '')}${esc(w.entry ?? '')}</dd></div>` : ''}
          ${w.reviewer ? `<div><dt>上次核验</dt><dd>${esc(w.reviewer)} · ${formatTime(w.reviewedAt)}</dd></div>` : ''}
        </dl>
        ${w.summary ? `<p class="review-text">${esc(w.summary)}</p>` : ''}
        <h4>生成说明</h4><p class="review-text">${w.note ? esc(w.note) : '<span class="muted">作者没有填写。</span>'}</p>
        ${w.checks ? `<h4>上传检查</h4><ul class="checks">${w.checks.map((c) => `<li class="check is-${c.state}">${icon(c.state === 'ok' ? 'check' : c.state === 'info' ? 'guide' : 'alert')}<span><b>${esc(c.label)}</b>${esc(c.detail)}</span></li>`).join('')}</ul>` : ''}
        ${w.trial ? `<h4>作者浏览器中的试加载</h4><ul class="checks">${trialRows(w.trial)}</ul>` : ''}
      </div>
      <form class="review-form" novalidate>
        ${held(w) ? `<div class="review-blocked">${icon('alert')}<p>内容审核还没通过，通过后才能核验。</p><button type="button" class="btn sm primary" data-open-content${canDecide(w) ? '' : ' disabled'}>审核内容</button></div>` : ''}
        <details class="review-meta" open><summary>作品信息<small>与上传表单一致，必填项补齐后才能通过核验</small></summary>
          ${workFieldsHtml(ctx, task, w, { expanded: true })}
          <div class="review-meta-actions"><button type="button" class="btn sm" data-save-meta>只保存信息</button></div>
        </details>
        <p class="fine">${w.status === 'verified' ? `现在：${esc(doneLine(w))}` : '通过后公开到展览馆；单轮生成且无人工介入的作品同时进入盲评。'}</p>
        ${w.status === 'verified' ? '' : '<label class="field"><span class="field-label"><input type="checkbox" name="toInbox"> 娱乐作品（进竞技场收件箱）</span><small>勾选后不进展览馆，也不进任何池子</small></label>'}
        <label class="field"><span class="field-label">存疑原因<small>标记存疑时必填，作者与访客都能看到</small></span><textarea class="input" name="reason" rows="3" maxlength="500">${esc(w.status === 'questioned' ? w.reason : '')}</textarea></label>
        <p class="form-error" role="alert"></p>
        ${canDecide(w) ? '' : `<div class="review-blocked">${icon('alert')}<p>这是你发布的作品，需要由其他管理员核验。</p></div>`}
        <div class="sheet-actions">
          ${isSenior() ? `<button type="button" class="btn danger ghost" data-remove>${icon('trash')}删除</button>` : ''}
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
    if (e.target.closest('[data-open-content]') && canDecide(w)) { sheet.close(); openContent(ctx, w, { questions }); return; }
    const decide = e.target.closest('[data-decide]');
    if (e.target.closest('[data-remove]')) {
      if (await removeWork(w, { admin: true })) sheet.close();
      return;
    }
    const error = $('.form-error:not(.field-error)', form);
    if (e.target.closest('[data-save-meta]')) {
      const button = e.target.closest('[data-save-meta]');
      error.textContent = '';
      button.disabled = true;
      try {
        toast(await editor.save(editor.collect()) ? `已保存：${w.title}` : '信息没有改动');
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
        await setFaces(w.task, w.id, FACE_ACTIONS.hide[1]);
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
      await editor.save(meta);
      await api(`works/${encodeURIComponent(w.task)}/${encodeURIComponent(w.id)}/review`, { method: 'POST', body });
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
function openContent(ctx, w, { questions = [], onDecided } = {}) {
  const m = w.moderation ?? {};
  const listed = ctx.DATA.tasks.find((t) => t.id === w.task);
  const task = listed ?? questions.find((q) => q.id === w.task);
  const source = m.source === 'human' ? `人工 · ${m.reviewer ?? ''}` : m.status === 'pending' ? '自动审核进行中' : `自动 · ${m.model ?? '6 Luna'}`;
  const sheet = openDialog({
    title: '审核内容',
    className: 'review-sheet',
    body: `<div class="review">
      <div class="review-facts">
        <div class="review-head">${thumb(ctx, w, { link: false })}<div><h3>${esc(w.title)}</h3><p class="result-model">${moderationBadge(m)}<span>${esc(task?.title ?? w.task)}</span></p>
          <div class="actions"><a class="btn sm" href="${esc(w.scene)}" target="_blank" rel="noopener">打开作品${icon('arrow')}</a></div></div></div>
        <dl class="facts">
          <div><dt>发布者</dt><dd>${esc(publisher(ctx, w))}${w.addedAt ? ` · ${formatTime(w.addedAt)}` : ''}</dd></div>
          <div><dt>审核来源</dt><dd>${esc(source)}</dd></div>
          <div><dt>结论</dt><dd>${esc(m.reason || '暂无')}</dd></div>
          ${m.categories?.length ? `<div><dt>风险类别</dt><dd>${esc(riskLabels(m.categories).join('、'))}</dd></div>` : ''}
          ${m.error ? `<div><dt>未完成原因</dt><dd>${esc(m.error)}</dd></div>` : ''}
        </dl>
        ${listed ? '' : '<p class="fine">这是新题目的示例结果：题目和内容通过审核后，结果才会进入核验。</p>'}
      </div>
      <form class="review-form" novalidate>
        <p class="fine">这一步只看能否公开：违法、色情、仇恨、诈骗、恶意脚本等。作品质量和生成信息在「核验」里判断。</p>
        <details class="review-meta" open><summary>作品信息<small>可补充或纠正信息，内容通过后仍需核验</small></summary>
          ${workFieldsHtml(ctx, task, w, { expanded: true })}
          <div class="review-meta-actions"><button type="button" class="btn sm" data-save-meta>只保存信息</button></div>
        </details>
        <label class="field"><span class="field-label">理由<small>拒绝时必填，作者会看到</small></span><textarea class="input" name="reason" rows="3" maxlength="500"></textarea></label>
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
        toast(await editor.save(editor.collect()) ? `已保存：${w.title}` : '信息没有改动');
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
      await editor.save(meta);
      if (act === 'retry') await api(`${path}/retry`, { method: 'POST' });
      else await api(path, { method: 'POST', body: { status: act, reason: reason || '人工复核通过' } });
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
    .map(([key, label]) => `<li><b>${label}</b><del>${esc(text(key, before[key]))}</del><span>${esc(text(key, q[key]))}</span></li>`).join('');
  const prompt = fields.some(([key]) => key === 'prompt') ? `<div class="line-diff">${lineDiff(before.prompt, q.prompt ?? '')
    .map(([op, line]) => `<div class="is-${DIFF_LINES[op][0]}"><span class="line-op">${DIFF_LINES[op][1]}</span><span>${esc(line)}</span></div>`).join('')}</div>` : '';
  const decided = [before.reviewer, before.at ? `${formatDate(before.at)} 拒绝` : ''].filter(Boolean).join(' · ');
  return `${before.reason ? `<div class="question-history"><p class="question-history-head">${icon('alert')}上次意见${decided ? `<span>· ${esc(decided)}</span>` : ''}</p><p>${esc(before.reason)}</p></div>` : ''}
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
    <div class="submission-question-body"><h3>${shown ? `<a href="#/${esc(q.id)}">${esc(q.title)}</a>` : esc(q.title)}${moderationBadge(q.moderation, '', QUESTION_LABELS)}${q.moderation?.previous ? `<span class="badge">重新提交 · 第 ${q.moderation.round} 次</span>` : ''}</h3>
      <p class="summary">${esc(q.summary)}</p>
      <p class="work-meta">${esc(publisher(ctx, q))}<span>${esc(q.date)} · ${q.works ?? 0} 件作品</span>${q.category ? `<span>${esc(categoryLabel(q.category))}</span>` : ''}${domainsOf(q).map((d) => `<span>${esc(d)}</span>`).join('')}</p>
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
  const n = (...names) => buckets.filter((b) => names.includes(b)).length;
  const shown = questionShown(q), waiting = questionWaiting(q);
  const pool = platform.arena[q.id];
  const counts = [['已公开', n('verified')], ['待处理', n('content', 'auto', 'unverified')], ['存疑', n('questioned')], ['已撤下', n('off')]]
    .filter(([, k]) => k).map(([text, k]) => `${text} ${k}`);
  return `<article class="submission-question review-question">
    <span class="submission-question-mark" aria-hidden="true">${icon('text')}</span>
    <div class="submission-question-body"><h3>${shown ? `<a href="#/${esc(q.id)}">${esc(q.title)}</a>` : esc(q.title)}${shown ? '' : `<span class="status status-${waiting ? 'unverified' : 'questioned'}">${icon(waiting ? 'clock' : 'alert')}${waiting ? '待审核' : '未公开'}</span>`}${shown && !q.acceptsUploads ? '<span class="badge">不收投稿</span>' : ''}</h3>
      <p class="summary">${esc(q.summary)}</p>
      <p class="work-meta">${esc(publisher(ctx, q))}${q.date ? `<span>${esc(q.date)}</span>` : ''}${q.category ? `<span>${esc(categoryLabel(q.category))}</span>` : ''}${domainsOf(q).map((d) => `<span>${esc(d)}</span>`).join('')}</p>
      <p class="work-meta">${q.works ?? buckets.length} 件作品${counts.length ? ` · ${counts.join(' · ')}` : ''}${shown ? `<span>盲评池 ${pool?.works ?? 0} 件 · ${pool?.entries ?? 0} 个配置</span>` : ''}</p>
      ${q.moderation?.status === 'rejected' && q.moderation.reason ? `<p class="result-reason">${icon('alert')}<span>${esc(q.moderation.reason)}</span></p>` : ''}
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
function decideQuestion(q, status) {
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
        <label class="field"><span class="field-label">理由${status === 'rejected' ? '<i>*</i>' : '<small>选填</small>'}</span><textarea class="input" name="reason" rows="3" maxlength="500"></textarea></label>
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
        toast(status === 'approved' ? '题目已通过' : '题目已拒绝');
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
function editQuestion(q, works = []) {
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
        <label class="field"><span class="field-label">测试简述<i>*</i></span><textarea class="input" name="summary" maxlength="400" rows="2" required>${esc(q.summary ?? '')}</textarea></label>
        ${categoryFields(q)}
        <label class="field"><span class="field-label">完整提示词<i>*</i>${locked ? `<small>已有 ${q.works} 件作品，不能再改</small>` : ''}</span><textarea class="input" name="prompt" maxlength="20000" rows="10" required${locked ? ' readonly' : ''}>${esc(q.prompt ?? '')}</textarea></label>
        ${refs ? '<div data-ref-host></div>' : referenceSheet(q.references, { key: q.id, credit: q.referenceCredit, still: true })}
        <label class="field"><span class="field-label"><input type="checkbox" name="acceptsUploads"${q.acceptsUploads ? ' checked' : ''}> 接受投稿</span><small>关闭后题目照常展示，上传入口停用</small></label>
        ${covers.length ? `<label class="field"><span class="field-label">封面作品<small>题库卡片显示这件作品</small></span><select class="input" name="cover"><option value="">自动（票选代表作，否则按默认规则）</option>${covers.map((w) => `<option value="${esc(w.id)}"${w.id === q.cover ? ' selected' : ''}>${esc(w.modelName)}${w.effort ? ` · ${esc(w.effort)}` : ''} · ${esc(w.title)}</option>`).join('')}</select></label>` : ''}
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
        toast(`已保存：${body.title ?? q.title}`);
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

function review(root, ctx) {
  const [routeTab = '', routeQuery = ''] = (ctx.param ?? '').split('?');
  const state = { works: null, audit: [], questions: null, questionsError: '', error: '', tab: null, filter: FILTER_TABS[routeTab] ?? 'all', picked: new Set(),
    catalog: { filter: 'all', query: '' }, managed: { filter: 'all', query: '', task: new URLSearchParams(routeQuery).get('task') ?? '', arena: 'all', sort: 'latest' } };
  // Packaged works come without media; they show the data pack's screenshots and scene.
  const settle = (data, questions) => Object.assign(state, { works: data.works.map((w) => ({ ...ctx.packagedWork(w.task, w.id), ...w })), audit: data.audit, error: '',
    questions: questions.list ?? state.questions ?? [], questionsError: questions.error ?? '' });
  // A return to the queue draws what it showed last time, and the arrival load redraws only if that changed.
  const known = isStaff() ? recall('review') : null;
  if (known) settle(known, { list: isSenior() ? recall('admin/questions')?.questions : [] });
  let active = true, request = 0;
  async function load(arriving = false) {
    const version = ++request;
    if (!isStaff()) return draw();
    const before = JSON.stringify(state);
    try {
      // Questions belong to senior admins.
      const [data, questions] = await Promise.all([apiRemembered('review'),
        isSenior() ? apiRemembered('admin/questions').then((body) => ({ list: body.questions }), (error) => ({ error: error.message })) : { list: [] }]);
      if (!active || version !== request) return;
      settle(data, questions);
    } catch (error) {
      if (!active || version !== request) return;
      state.error = error.message;
    }
    if (!arriving || JSON.stringify(state) !== before) draw();
  }
  // Uploads of one bucket: the queues oldest first, decided lists newest first. The decided
  // list (done) gathers four buckets and narrows them by the current filter.
  const inDone = (w, bucket, filter = state.filter) => ({ all: ['verified', 'off', 'questioned', 'rejected'].includes(bucket), public: bucket === 'verified',
    noarena: bucket === 'verified' && w.arena?.state !== 'in_pool', off: bucket === 'off', questioned: bucket === 'questioned', rejected: bucket === 'rejected',
    machine: bucket === 'rejected' && autoRejected(w.moderation), injection: bucket === 'rejected' && injected(w.moderation) })[filter];
  const filterCount = (filter) => (state.works ?? []).filter((w) => inDone(w, reviewBucket(ctx, w, state.questions ?? []), filter)).length;
  const queue = (bucket) => (state.works ?? []).filter((w) => {
    const own = reviewBucket(ctx, w, state.questions ?? []);
    return bucket === 'done' ? inDone(w, own) : own === bucket;
  }).sort((a, b) => (['content', 'auto', 'unverified'].includes(bucket) ? 1 : -1) * (Date.parse(a.addedAt) - Date.parse(b.addedAt)));
  const tabCount = (id) => (id === 'questions' ? (state.questions ?? []).filter(questionWaiting).length : queue(id).length);
  // Batch switches on the decided list: only where every row needs the same next step.
  const doneBulk = () => (state.tab === 'done' ? { noarena: 'arena-on', off: 'restore' }[state.filter] : null);
  // What the batch checkboxes of the current queue can select.
  const pickable = () => (state.tab === 'questions' ? (state.questions ?? []).filter(questionWaiting).map((q) => q.id)
    : state.tab === 'works' ? managedWorks().filter(displayReady).filter(canDecide).map(pickId)
    : state.tab === 'done' ? (doneBulk() ? queue('done').filter(canDecide).filter((w) => doneBulk() !== 'arena-on' || w.arena?.state === 'off').map(pickId) : [])
      : BULK[state.tab] ? queue(state.tab).filter(canDecide).map(pickId) : []);
  const taskOf = (w) => ctx.DATA.tasks.find((t) => t.id === w.task) ?? state.questions?.find((q) => q.id === w.task);
  const displayReady = (w) => w.status === 'verified' && !held(w) && !w.entertainment_route && ctx.DATA.tasks.some((t) => t.id === w.task);
  const arenaState = (w) => !displayReady(w) ? 'not_ready' : w.arena?.state ?? 'not_ready';
  const managedIn = (w, filter) => {
    const bucket = reviewBucket(ctx, w, state.questions ?? []);
    return { all: true, public: bucket === 'verified', content: ['content', 'auto'].includes(bucket),
      unverified: ['unverified', 'sample'].includes(bucket), questioned: bucket === 'questioned', off: bucket === 'off', rejected: bucket === 'rejected' }[filter];
  };
  function managedWorks({ filtered = true } = {}) {
    const { filter, query, task, arena, sort } = state.managed;
    const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return (state.works ?? []).filter((w) => {
      if (task && w.task !== task || arena !== 'all' && arenaState(w) !== arena || filtered && !managedIn(w, filter)) return false;
      const text = [w.title, w.modelName, w.vendor, publisher(ctx, w), taskOf(w)?.title ?? w.task].join(' ').toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    }).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'zh-CN', { numeric: true })
      : (sort === 'oldest' ? 1 : -1) * ((Date.parse(a.addedAt) || 0) - (Date.parse(b.addedAt) || 0)));
  }
  function managedRow(w) {
    const key = esc(pickId(w)), task = taskOf(w), model = ctx.modelOf(w);
    const bucket = reviewBucket(ctx, w, state.questions ?? []);
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
        <p class="result-model">${brandMark(model, 'brand-mark sm')}<b>${esc(model.name)}</b>${w.effort ? `<span class="badge">${esc(w.effort)}</span>` : ''}</p>
        <h3><a href="${href}"${hidden && w.scene ? ' target="_blank" rel="noopener"' : ''}>${esc(w.title)}</a></h3>
        <p class="work-meta">${esc(task?.title ?? w.task)} · ${esc(publisher(ctx, w))}${w.addedAt ? ` · ${formatDate(w.addedAt)}` : ''}${w.mine ? ' · 本人作品' : ''}</p>
        <p class="work-state"><span${issue ? ' class="is-issue"' : ''}><small>${checkLabel}</small>${esc(checkText)}</span><span${ready && galleryOn(w) ? '' : ' class="is-muted"'}><small>展览馆</small>${ready && galleryOn(w) ? '已公开' : '未公开'}</span><span${arena === 'in_pool' ? '' : ' class="is-muted"'}${w.arena?.reason ? ` title="${esc(w.arena.reason)}"` : ''}><small>盲评</small>${arenaText}</span></p>
      </div><div class="work-side"><button class="btn sm" type="button" data-manage-work="${key}">管理</button></div>
    </article>`;
  }
  function managedChips() {
    const scope = managedWorks({ filtered: false });
    return Object.entries(WORK_FILTERS).map(([id, label]) => `<button class="chip" type="button" data-managed-filter="${id}" aria-pressed="${state.managed.filter === id}">${label}<span>${scope.filter((w) => managedIn(w, id)).length}</span></button>`).join('');
  }
  function managedResults() {
    const works = managedWorks(), total = (state.works ?? []).length;
    const bulk = pickable().length ? `<div class="bulk-bar" data-bulk-bar><label class="row-pick"><input type="checkbox" data-pick-all aria-label="全选可管理展示的作品"></label><span data-bulk-count></span>${['gallery-on', 'hide', 'arena-off'].map((action, i) => `<button class="btn sm${i ? '' : ' primary'}" type="button" data-bulk-face="${action}" disabled>${FACE_ACTIONS[action][0]}</button>`).join('')}</div>` : '';
    return `<p class="work-manage-list-meta">显示 ${works.length} / ${total} 件作品${works.some((w) => !canDecide(w)) ? ' · 本人作品可编辑信息，展示设置由其他管理员处理' : ''}</p>${bulk}
      ${works.length ? `<div class="work-list">${works.map(managedRow).join('')}</div>` : '<div class="board-empty"><p class="board-empty-title">没有匹配的作品</p><button class="btn sm" type="button" data-managed-reset>清除筛选</button></div>'}`;
  }
  function managedList() {
    const taskTitles = new Map([...ctx.DATA.tasks, ...(state.questions ?? [])].map((t) => [t.id, t.title]));
    for (const w of state.works ?? []) if (!taskTitles.has(w.task)) taskTitles.set(w.task, w.task);
    const options = (items, current) => items.map(([id, label]) => `<option value="${esc(id)}"${id === current ? ' selected' : ''}>${esc(label)}</option>`).join('');
    return `<div class="work-management"><div class="work-manage-heading"><h3>全部作品<span>${state.works?.length ?? 0}</span></h3><p>信息、核验与展示状态分别管理</p></div>
      <div class="work-manage-tools"><label class="collection-search">${icon('search')}<input type="search" data-managed-search aria-label="搜索作品、模型或发布者" placeholder="搜索作品、模型或发布者" value="${esc(state.managed.query)}"></label>
        <select name="task" data-managed-select aria-label="按题目筛选">${options([['', '全部题目'], ...taskTitles], state.managed.task)}</select>
        <select name="arena" data-managed-select aria-label="按盲评状态筛选">${options(Object.entries(ARENA_FILTERS), state.managed.arena)}</select>
        <select name="sort" data-managed-select aria-label="作品排序">${options([['latest', '最新在前'], ['oldest', '最早在前'], ['title', '按作品名称']], state.managed.sort)}</select></div>
      <div class="chips work-manage-filters" data-managed-chips>${managedChips()}</div><div class="work-manage-results" data-managed-results>${managedResults()}</div></div>`;
  }
  // Preserve input focus while filters and search redraw only the result area.
  function updateManaged() {
    state.picked.clear();
    root.querySelector('[data-managed-chips]').innerHTML = managedChips();
    root.querySelector('[data-managed-results]').innerHTML = managedResults();
    syncBulk();
    ctx.settleImages();
  }
  // 全部题目, narrowed by the filter and the search; redrawn alone while typing.
  function catalogList() {
    const { filter, query } = state.catalog;
    const questions = (state.questions ?? []).filter((q) => catalogIn(q, filter) && (!query || matchesQuery(q, query)));
    const buckets = new Map();
    for (const w of state.works ?? []) {
      if (!buckets.has(w.task)) buckets.set(w.task, []);
      buckets.get(w.task).push(reviewBucket(ctx, w, state.questions ?? []));
    }
    return questions.length ? `<div class="submission-questions">${questions.map((q) => catalogRow(ctx, q, buckets.get(q.id) ?? [])).join('')}</div>`
      : `<div class="board-empty"><p class="board-empty-title">${query ? '没有匹配的题目' : `没有${CATALOG_FILTERS[filter]}的题目`}</p></div>`;
  }
  function draw() {
    if (!platform.user) return signedOut(root, ctx, '请先登录管理员账号');
    if (!isStaff()) {
      root.innerHTML = `${ctx.pageStart({ ...ACCOUNT, section: 'me', heading: '审核', nav: accountNav(ctx, 'review'), crumbs: [{ text: '个人中心', href: '#/me' }, { text: '审核' }] })}<section class="account-empty">${icon('shield')}<h2>只有管理员可以审核作品</h2><p>管理员由高级管理员授予。</p><a class="btn primary" href="#/questions">回到题库${icon('right')}</a></section>${ctx.pageEnd()}`;
      return;
    }
    // Without a tab in the address, open the first queue that has work waiting.
    const param = routeTab;
    const todo = todoTabs(), manage = manageTabs();
    const tab = Object.hasOwn(todo, param) || Object.hasOwn(DONE_TABS, param) || Object.hasOwn(manage, param) ? param : Object.hasOwn(FILTER_TABS, param) ? 'done'
      : (state.works && Object.keys(todo).find((id) => tabCount(id))) || 'unverified';
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
    const bulk = bulkButtons && ids.length ? `<div class="bulk-bar" data-bulk-bar><label class="row-pick"><input type="checkbox" data-pick-all aria-label="全选"></label><span data-bulk-count></span>${bulkButtons}</div>` : '';
    const works = state.works ?? [];
    const byKey = new Map(works.map((w) => [pickId(w), w]));
    const questions = state.questions ?? [];
    const questionTitles = new Map([...ctx.DATA.tasks, ...questions].map((q) => [q.id, q.title]));
    const rows = (bucket) => queue(bucket).map((w) => workRow(ctx, w, { bucket: bucket === 'done' ? reviewBucket(ctx, w, questions) : bucket, questions,
      picked: bucket === tab && ids.includes(pickId(w)) ? state.picked.has(pickId(w)) : undefined })).join('');
    const empty = (text) => `<div class="board-empty"><p class="board-empty-title">${text}</p></div>`;
    // A logged work links to its gallery page, or to its preview while it is not in the gallery.
    const auditWork = (w, id) => !w ? `<span class="muted">${esc(id)}（已删除）</span>`
      : ctx.inGallery(w.task, w.id) ? `<a href="#/${esc(w.task)}/${esc(w.id)}">${esc(w.title)}</a>`
        : w.scene ? `<a href="${esc(w.scene)}" target="_blank" rel="noopener">${esc(w.title)}</a>` : esc(w.title);
    let list;
    if (tab === 'log') {
      list = state.audit.length ? `<ol class="audit">${state.audit.map((row) => `<li><time>${formatTime(row.at)}</time><span class="audit-actor">${esc(row.actor)}</span><b>${esc(ACTIONS[row.action] ?? row.action)}</b><span class="audit-work">${!row.work && row.action?.startsWith('question-') && row.task ? esc(questionTitles.get(row.task) ?? row.task) : ''}${row.work ? auditWork(byKey.get(`${row.task}/${row.work}`), row.work) : ''}${row.detail ? ` · ${esc(row.detail)}` : ''}</span></li>`).join('')}</ol>` : '<p class="muted">还没有记录。</p>';
    } else if (tab === 'questions') {
      const waiting = questions.filter(questionWaiting).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      list = state.questionsError ? `<p class="muted">${esc(state.questionsError)}</p>`
        : `${waiting.length ? `${bulk}<div class="submission-questions">${waiting.map((q) => reviewQuestionRow(ctx, q, state.picked.has(q.id))).join('')}</div>` : empty(REVIEW_EMPTY.questions)}
          <p class="fine">处理过的题目在<a href="#/review/catalog">全部题目</a>里。</p>`;
    } else if (tab === 'catalog') {
      const chips = `<div class="chips review-filters">${Object.entries(CATALOG_FILTERS).map(([id, text]) => `<button class="chip${id === state.catalog.filter ? ' on' : ''}" type="button" data-catalog-filter="${id}" aria-pressed="${id === state.catalog.filter}">${text} · ${questions.filter((q) => catalogIn(q, id)).length}</button>`).join('')}</div>`;
      list = state.questionsError ? `<p class="muted">${esc(state.questionsError)}</p>`
        : `<div class="catalog-tools"><label class="collection-search">${icon('search')}<input type="search" data-catalog-search aria-label="搜索题目或提示词" placeholder="搜索题目或提示词" value="${esc(state.catalog.query)}"></label>${chips}</div><div data-catalog-list>${catalogList()}</div>`;
    } else if (tab === 'works') {
      list = managedList();
    } else if (tab === 'content') {
      const waiting = rows('content'), auto = rows('auto');
      list = `${waiting ? `${bulk}<div class="work-list">${waiting}</div>` : empty(REVIEW_EMPTY.content)}
        ${auto ? `<h3 class="review-subhead">自动审核中 · ${queue('auto').length}<small>完成后会自动转入「核验」或回到这里，也可以提前人工审核</small></h3><div class="work-list is-muted">${auto}</div>` : ''}`;
    } else if (tab === 'done') {
      const chips = `<div class="chips review-filters">${Object.entries(DONE_FILTERS).map(([id, text]) => `<button class="chip${id === state.filter ? ' on' : ''}" type="button" data-filter="${id}" aria-pressed="${id === state.filter}">${text} · ${filterCount(id)}</button>`).join('')}</div>`;
      list = `${chips}${rows('done') ? `${bulk}<div class="work-list">${rows('done')}</div>` : empty(state.filter === 'all' ? '还没有核验过的作品' : `没有${DONE_FILTERS[state.filter]}的作品`)}`;
    } else {
      list = rows(tab) ? `${bulk}<div class="work-list">${rows(tab)}</div>` : empty(REVIEW_EMPTY[tab]);
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
        ${state.error ? `<p class="form-error">${esc(state.error)}</p>` : ''}
        ${state.works === null ? '<p class="muted">正在载入…</p>' : list}
      </section>
    ${ctx.pageEnd()}`;
    document.title = `审核 · ${ctx.DATA.title}`;
    syncBulk();
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
    bar.querySelector('[data-bulk-count]').textContent = `${n ? `已选 ${n} ${unit}` : `全选（${total} ${unit}）`}${faces && (n > 200 || total > 200) ? ' · 每批最多 200 件，请缩小选择范围' : ''}`;
    $$('[data-bulk], [data-bulk-face]', bar).forEach((button) => { button.disabled = !n || faces && n > 200; });
  }
  // After a decision in a queue, the oldest remaining work of that queue opens right away.
  const nextIn = (bucket, doneKey) => () => {
    const next = queue(bucket).find((w) => pickId(w) !== doneKey && canDecide(w));
    if (next) { (bucket === 'content' ? openHeld : open)(next, bucket); return ''; }
    return bucket === 'content' ? ' · 内容队列已清空' : ' · 核验队列已清空';
  };
  const open = (work, bucket) => openReview(ctx, work, { questions: state.questions ?? [], onDecided: bucket === 'unverified' ? nextIn(bucket, pickId(work)) : undefined });
  const openHeld = (work, bucket) => openContent(ctx, work, { questions: state.questions ?? [], onDecided: bucket === 'content' ? nextIn(bucket, pickId(work)) : undefined });
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
      else await setFaces(works[0].task, works[0].id, faces);
      state.picked.clear();
      toast(works.length > 1 ? `${works.length} 件${done}` : `${done}：${works[0].title}`);
      await refreshPlatform('review');
    } catch (error) {
      toast(error.message);
    } finally {
      switchingFaces = false;
      syncBulk();
      $$('[data-face]', root).forEach((button) => { button.disabled = false; });
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
          <label class="field"><span class="field-label">推理档位<small>留空保持各自原值</small></span><input class="input" name="effort" maxlength="20" list="bulk-efforts"><datalist id="bulk-efforts">${['Default', ...(platform.site.efforts ?? [])].map((e) => `<option value="${esc(e)}"></option>`).join('')}</datalist></label>
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
        <label class="field"><span class="field-label">${status === 'questioned' ? '存疑原因' : '理由'}${needsReason ? '<i>*</i><small>所选各项共用</small>' : '<small>选填</small>'}</span><textarea class="input" name="reason" rows="3" maxlength="500"></textarea></label>
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
      const failed = results.filter((r) => !r.ok);
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
    const q = id && state.questions?.find((item) => item.id === id);
    if (!q) return false;
    const path = `questions/${encodeURIComponent(q.id)}`;
    try {
      if (edit && !(await editQuestion(q, (state.works ?? []).filter((w) => w.task === q.id)))) return true;
      if (decide && !(await decideQuestion(q, decide.dataset.qDecide))) return true;
      if (remove) {
        if (!(await confirmDialog({ title: '删除这道题？', message: `「${q.title}」会从题库中移除并写入审核记录${q.works ? `，${q.works} 件作品随之删除` : ''}。已有投票的题目不能删除。`, confirm: '删除', danger: true }))) return true;
        await api(path, { method: 'DELETE' });
        toast('题目已删除');
      }
    } catch (err) {
      toast(err.message);
      return true;
    }
    await refreshPlatform('question');
    return true;
  }
  root.onchange = (e) => {
    const select = e.target.closest('[data-managed-select]');
    if (select) {
      state.managed[select.name] = select.value;
      return updateManaged();
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
  // Typing in 全部题目 redraws the list only, so the search keeps its focus.
  root.oninput = (e) => {
    const managed = e.target.closest('[data-managed-search]');
    if (managed) {
      state.managed.query = managed.value.trim();
      return updateManaged();
    }
    const search = e.target.closest('[data-catalog-search]');
    if (!search) return;
    state.catalog.query = search.value.trim();
    const list = root.querySelector('[data-catalog-list]');
    if (list) list.innerHTML = catalogList();
  };
  root.onclick = async (e) => {
    const managedFilter = e.target.closest('[data-managed-filter]');
    if (managedFilter) {
      state.managed.filter = managedFilter.dataset.managedFilter;
      return updateManaged();
    }
    if (e.target.closest('[data-managed-reset]')) {
      Object.assign(state.managed, { filter: 'all', query: '', task: '', arena: 'all' });
      state.picked.clear();
      return draw();
    }
    const manageWork = e.target.closest('[data-manage-work]');
    if (manageWork) {
      const w = state.works?.find((item) => pickId(item) === manageWork.dataset.manageWork);
      if (w) openWorkManagement(ctx, w, { questions: state.questions ?? [], audit: state.audit, createEditor: reviewEditor,
        onReview: () => open(w), onContent: () => openHeld(w) });
      return;
    }
    const bulk = e.target.closest('[data-bulk]');
    if (bulk) return bulkDecide(bulk.dataset.bulk);
    const filter = e.target.closest('[data-filter]');
    if (filter) {
      state.filter = filter.dataset.filter;
      state.picked.clear();
      return draw();
    }
    const catalogFilter = e.target.closest('[data-catalog-filter]');
    if (catalogFilter) {
      state.catalog.filter = catalogFilter.dataset.catalogFilter;
      return draw();
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
    if (button.dataset.review !== undefined) open(work, bucket);
    else if (button.dataset.content !== undefined) openHeld(work, button.closest('.review-question') ? null : bucket);
    else await removeWork(work, { admin: true });
  };
  draw();
  const loading = load(true);
  return { ready: state.works === null ? loading : null, onPlatformChange: () => load(), destroy() { active = false; request++; root.onchange = null; root.oninput = null; } };
}
