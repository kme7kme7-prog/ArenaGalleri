// 全部成员 for senior admins: the member list and its role sheet. The backend enforces the same rules.
import { $, esc, formatDate, formatTime, icon } from './ui.js';
import { api, avatarFace, levelBadge, levelOf, levelText, openDialog, platform, toast } from './platform.js';

const FILTERS = [['all', '全部'], ['3', 'Lv3 高级管理员'], ['2', 'Lv2 普通管理员'], ['1', 'Lv1 认证成员'], ['0', 'Lv0 成员'], ['trusted', '可信成员']];
const SORTS = { seen: '最近活跃', latest: '最新注册', oldest: '最早注册', works: '投稿最多', votes: '计票最多' };
const DAY = 86400e3;
// What each level may do: [text, allowed]. Levels run from the most to the least.
const RIGHTS = {
  3: [['审核题目与作品，可以审核本人发布的', true], ['管理全部题目、全部作品，删除作品', true], ['精选题目、精选分区与资格考试', true], ['调整其他成员的等级', true], ['投稿不限量，单独发起题目不受限制', true]],
  2: [['内容审核与核验他人作品，管理展示与盲评', true], ['编辑作品信息；本人作品的审核与展示由其他管理员处理', true], ['投稿不限量，发起题目不受限制', true], ['不能审核或管理题目、删除作品、调整等级', false]],
  1: [['盲评选择计入大众榜与精选榜', true], ['发起题目、投稿', true], ['待审投稿最多 8 件；已核验满 3 件且近 90 天无存疑的可信成员 20 件', true], ['不能进入审核页', false]],
  0: [['盲评选择计入大众榜', true], ['可以查看、撤回、管理已有的题目和作品', true], ['不能发起题目和上传作品，通过资格考试升为 Lv1', false], ['不能进入审核页', false]],
};
const CHANGES = {
  '0>1': '保存后即可发起题目和上传作品，之后的盲评选择同时计入精选榜，此前的选择不追溯。相当于跳过资格考试，会写入审核记录。',
  '1>0': '保存后不能再发起题目和上传作品，之后的选择只计入大众榜；已发起的题目和已计入精选榜的选择都保留。可以重新参加资格考试。',
  '0>2': '保存后立即可以进入审核页，审核与核验他人作品、管理展示；投稿不再限量。之后的选择同时计入精选榜。',
  '0>3': '保存后立即获得全部管理权限，包括题目审核与管理、精选与资格考试、删除作品和调整其他成员的等级。之后的选择同时计入精选榜。',
  '1>2': '保存后立即可以进入审核页，审核与核验他人作品、管理展示；投稿不再限量。',
  '1>3': '保存后立即获得全部管理权限，包括题目审核与管理、精选与资格考试、删除作品和调整其他成员的等级。',
  '2>3': '保存后增加题目审核与管理、精选与资格考试、删除作品和调整其他成员的等级。',
  '3>2': '保存后立即失去题目审核与管理、精选与资格考试、删除作品和调整等级；仍可审核与核验他人作品。',
  '2>1': '保存后立即不能进入审核页。已做出的审核决定和记录保留；待审投稿按成员规则计算。保留认证成员身份，可以发起题目。',
  '3>1': '保存后立即失去全部管理权限，不能进入审核页。已做出的审核决定和记录保留；待审投稿按成员规则计算。保留认证成员身份，可以发起题目。',
  '2>0': '保存后立即不能进入审核页。已做出的审核决定和记录保留；待审投稿按成员规则计算。之后的选择只计入大众榜，不能再发起题目。',
  '3>0': '保存后立即失去全部管理权限，不能进入审核页。已做出的审核决定和记录保留；待审投稿按成员规则计算。之后的选择只计入大众榜，不能再发起题目。',
};

export const membersState = () => ({ list: null, error: '', filter: 'all', query: '', email: '', active: '', sort: 'seen', paged: false, total: 0, scopeTotal: 0, filterCounts: {} });

const level = (m) => levelOf(m);
const self = (m) => m.id === platform.user?.id;
const lockReason = (m) => (self(m) ? '不能修改自己的等级，需由其他高级管理员调整。'
  : m.fixed ? '该账号由服务器配置 ADMIN_USERNAMES 固定为高级管理员，需先修改服务器配置。' : '');
const workTotal = (m) => m.works.verified + m.works.questioned + m.works.pending + m.works.rejected;
const quota = (m) => (m.pendingLimit === null ? '不限' : `${m.pendingLimit} 件${m.trusted ? ' · 可信成员' : ''}`);
const idleDays = (m) => (m.lastSeenAt ? (Date.now() - Date.parse(m.lastSeenAt)) / DAY : Infinity);
const dateHtml = (value) => `<time data-i18n-date="${esc(value)}">${formatDate(value)}</time>`;
const timeHtml = (value) => `<time data-i18n-time="${esc(value)}">${formatTime(value)}</time>`;
const face = (m) => `<span class="avatar" aria-hidden="true">${avatarFace(m.avatar, m.nickname)}</span>`;
function seen(m) {
  const days = idleDays(m);
  return days === Infinity ? '暂无活跃记录' : days < 1 / 24 ? '刚刚活跃' : days < 1 ? `${Math.round(days * 24)} 小时前活跃`
    : days < 30 ? `${Math.round(days)} 天前活跃` : `${dateHtml(m.lastSeenAt)} <span>最后活跃</span>`;
}
const inFilter = (m, filter) => (filter === 'all' ? true : filter === 'trusted' ? m.trusted : level(m) === Number(filter));
// How far the member got with the qualification test.
const examLine = (m) => (m.exam?.passedAt ? '通过考试' : m.exam?.attempts ? `${m.exam.attempts} 次 · 最高 ${m.exam.bestCorrect}/${m.exam.questionCount}` : '未参加');

// The search and selects set the scope the chips count within.
function members(state, { filtered = true } = {}) {
  if (state.paged) return state.list ?? [];
  const { filter, query, email, active, sort } = state;
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return (state.list ?? []).filter((m) => (!filtered || inFilter(m, filter)) && (!email || (email === 'bound') === m.emailVerified)
    && (!active || (active === 'week' ? idleDays(m) <= 7 : active === 'month' ? idleDays(m) <= 30 : idleDays(m) > 30))
    && terms.every((term) => `${m.name} ${m.nickname}`.toLocaleLowerCase().includes(term)))
    .sort((a, b) => sort === 'works' ? workTotal(b) - workTotal(a) : sort === 'votes' ? b.votes - a.votes
      : sort === 'seen' ? (Date.parse(b.lastSeenAt) || 0) - (Date.parse(a.lastSeenAt) || 0)
        : (sort === 'oldest' ? 1 : -1) * (Date.parse(a.createdAt) - Date.parse(b.createdAt)));
}

function row(m) {
  const tags = [self(m) ? '<span class="badge">当前账号</span>' : '', m.fixed ? '<span class="badge" title="由服务器配置固定">固定</span>' : '',
    m.trusted ? '<span class="badge is-accent">可信成员</span>' : ''].join('');
  const { verified, questioned, pending, rejected } = m.works, total = workTotal(m);
  const parts = [`已核验 ${verified}`, questioned && `存疑 ${questioned}`, pending && `待审 ${pending}`, rejected && `拒绝 ${rejected}`].filter(Boolean).map((text) => `<span>${text}</span>`).join(' · ');
  return `<article class="work-row work-managed-row member-row">
    ${face(m)}<div class="work-main">
      <h3><span data-i18n-ignore>${esc(m.nickname)}</span><small data-i18n-ignore>@${esc(m.name)}</small>${tags}</h3>
      <p class="work-meta"><span>注册于</span> ${dateHtml(m.createdAt)} · <span>${seen(m)}</span> · <span>${m.emailVerified ? '已绑定邮箱' : '未绑定邮箱'}</span></p>
      <p class="work-state"><span><small>等级</small>${icon(level(m) < 2 ? 'user' : 'shield')}${levelBadge(level(m))}</span>${level(m) < 2 ? `<span${m.exam?.attempts ? '' : ' class="is-muted"'}><small>考试</small>${examLine(m)}</span>` : ''}<span${questioned ? ' class="is-issue"' : total ? '' : ' class="is-muted"'}><small>投稿</small>${total ? `${total} 件<small class="member-parts">${parts}</small>` : '0'}</span><span${m.questions ? '' : ' class="is-muted"'}><small>题目</small>${m.questions}</span><span${m.votes ? '' : ' class="is-muted"'}><small>计票</small>${m.votes}</span><span><small>待审额度</small>${quota(m)}</span></p>
    </div><div class="work-side"><button class="btn sm" type="button" data-manage-member="${esc(m.id)}">管理</button></div>
  </article>`;
}

export function memberChips(state) {
  const scope = members(state, { filtered: false });
  return FILTERS.map(([id, label]) => `<button class="chip" type="button" data-member-filter="${id}" aria-pressed="${state.filter === id}">${label}<span>${state.paged ? state.filterCounts[id] ?? 0 : scope.filter((m) => inFilter(m, id)).length}</span></button>`).join('');
}

export function memberResults(state) {
  const list = members(state), total = state.paged ? state.scopeTotal : (state.list ?? []).length;
  return `<p class="work-manage-list-meta">显示 ${state.paged ? state.total : list.length} / ${total} 位成员 · 自己和服务器固定的账号不能在这里改等级</p>
    ${list.length ? `<div class="work-list">${list.map(row).join('')}</div>` : '<div class="board-empty"><p class="board-empty-title">没有匹配的成员</p><button class="btn sm" type="button" data-member-reset>清除筛选</button></div>'}`;
}

export function memberList(state, pagination = '') {
  if (state.list === null) return state.error ? `<p class="form-error">${esc(state.error)}</p>` : '<p class="muted">正在载入成员…</p>';
  const options = (items, current) => items.map(([id, label]) => `<option value="${id}"${id === current ? ' selected' : ''}>${label}</option>`).join('');
  return `<div class="work-management"><div class="work-manage-heading"><h3>全部成员<span>${state.paged ? state.scopeTotal : state.list.length}</span></h3><p>等级与参与情况；等级调整即时生效并记入审核记录</p></div>
    <div class="work-manage-tools"><label class="collection-search">${icon('search')}<input type="search" data-member-search aria-label="搜索用户名或昵称" placeholder="搜索用户名或昵称" value="${esc(state.query)}"></label>
      <select name="email" data-member-select aria-label="按邮箱筛选">${options([['', '全部邮箱状态'], ['bound', '已绑定邮箱'], ['none', '未绑定邮箱']], state.email)}</select>
      <select name="active" data-member-select aria-label="按活跃时间筛选">${options([['', '全部活跃时间'], ['week', '7 天内活跃'], ['month', '30 天内活跃'], ['idle', '超过 30 天未活跃']], state.active)}</select>
      <select name="sort" data-member-select aria-label="成员排序">${options(Object.entries(SORTS), state.sort)}</select></div>
    <div class="chips work-manage-filters" data-member-chips>${memberChips(state)}</div><div class="work-manage-results" data-member-results>${memberResults(state)}${pagination}</div></div>`;
}

// Level history comes from the shared audit log, whose 'role' entries read "name → 等级".
export function openMember(m, { audit = [], onSaved }) {
  const locked = lockReason(m);
  const { verified, questioned, pending, rejected } = m.works;
  const log = audit.filter((entry) => entry.action === 'role' && entry.detail?.startsWith(`${m.name} → `));
  const sheet = openDialog({ title: '管理成员', className: 'member-sheet', body: `<form novalidate>
    <div class="member-body"><div class="member-grid">
      <aside class="member-facts">
        <div class="member-id">${face(m)}<div><h3 data-i18n-ignore>${esc(m.nickname)}</h3><p data-i18n-ignore>@${esc(m.name)}</p></div></div>
        <dl class="facts">
          <div><dt>当前等级</dt><dd><span>${levelText(level(m))}</span>${m.fixed ? ' · <span>服务器固定</span>' : ''}${m.trusted ? ' · <span>可信成员</span>' : ''}</dd></div>
          <div><dt>邮箱</dt><dd>${m.email ? `<span data-i18n-ignore>${esc(m.email)}</span> · <span>${m.emailVerified ? '已验证' : '未验证'}</span>` : '未绑定'}${m.emailVerified ? '' : '<p>未绑定邮箱不能投稿或发起题目。</p>'}</dd></div>
          <div><dt>注册时间</dt><dd>${dateHtml(m.createdAt)}</dd></div>
          <div><dt>最近活跃</dt><dd>${m.lastSeenAt ? timeHtml(m.lastSeenAt) : '暂无活跃记录'}</dd></div>
          <div><dt>投稿</dt><dd>${workTotal(m)} 件<p><span>已核验 ${verified}</span> · <span>存疑 ${questioned}</span> · <span>待审 ${pending}</span> · <span>拒绝 ${rejected}</span></p></dd></div>
          <div><dt>发起题目</dt><dd>${m.questions} 道</dd></div>
          <div><dt>盲评计票</dt><dd>${m.votes} 次</dd></div>
          ${level(m) < 2 ? `<div><dt>资格考试</dt><dd>${m.exam?.passedAt ? `通过考试 · ${dateHtml(m.exam.passedAt)}` : examLine(m)}</dd></div>` : ''}
          <div><dt>待审额度</dt><dd>${quota(m)}${level(m) < 2 && !m.trusted ? `<p>可信成员需已核验满 3 件且近 90 天无存疑（现在已核验 ${verified} 件）。</p>` : ''}</dd></div>
        </dl>
        <div class="actions"><a class="btn sm" href="#/review/works?q=${encodeURIComponent(m.nickname)}">在全部作品中查看${icon('right')}</a></div>
        <details><summary>等级记录 · ${log.length}</summary>
          ${log.length ? `<ol class="audit">${log.map((entry) => `<li>${timeHtml(entry.at)}<span class="audit-actor" data-i18n-ignore>${esc(entry.actor)}</span><b>调整等级</b><span data-i18n-ignore>${esc(entry.detail)}</span></li>`).join('')}</ol>` : '<p class="muted">最近的审核记录里没有等级调整。</p>'}
        </details>
      </aside>
      <section class="member-roles">
        <h3>等级</h3><p>决定能否发起题目、选择计入哪张榜，以及能否进入审核页。</p>
        ${locked ? `<p class="role-locked">${icon('shield')}${esc(locked)}</p>` : ''}
        ${[3, 2, 1, 0].map((role) => `<label class="role-option"><input type="radio" name="level" value="${role}"${role === level(m) ? ' checked' : ''}${locked ? ' disabled' : ''}>
          <span><b>${levelBadge(role)}${role === level(m) ? '<small>当前</small>' : ''}</b><ul>${RIGHTS[role].map(([text, allowed]) => `<li${allowed ? '' : ' class="is-no"'}>${esc(text)}</li>`).join('')}</ul></span></label>`).join('')}
        <div data-role-change></div>
      </section>
    </div></div>
    <footer class="member-actions"><p class="form-error" role="alert"></p><span class="spacer"></span><button type="button" class="btn" data-sheet-close>${locked ? '关闭' : '取消'}</button>${locked ? '' : '<button type="submit" class="btn primary" disabled>保存等级</button>'}</footer>
  </form>` });
  const form = $('form', sheet.el);
  if (locked) return;
  const submit = $('[type="submit"]', form);
  function sync() {
    const next = Number(form.elements.level.value), down = next < level(m);
    $('[data-role-change]', form).innerHTML = next === level(m) ? ''
      : `<div class="role-change${down ? ' is-down' : ''}"><b><span data-i18n-ignore>${esc(m.nickname)}</span>：<span>${levelText(level(m))}</span> → <span>${levelText(next)}</span></b><br>${CHANGES[`${level(m)}>${next}`]}</div>`;
    submit.disabled = next === level(m);
    submit.textContent = next === level(m) ? '保存等级' : `改为 ${levelText(next)}`;
    submit.classList.toggle('danger', down);
  }
  form.addEventListener('change', sync);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const next = Number(form.elements.level.value);
    submit.disabled = true;
    try {
      await api(`admin/users/${encodeURIComponent(m.id)}/role`, { method: 'POST', body: { level: next } });
    } catch (err) {
      $('.form-error', form).textContent = err.message;
      submit.disabled = false;
      return;
    }
    sheet.close();
    toast(`已将 ${m.nickname} 改为 ${levelText(next)}`);
    onSaved?.();
  });
}
