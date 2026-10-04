// 全部成员 for senior admins: the member list and its role sheet. The backend enforces the same rules.
import { $, esc, formatDate, formatTime, icon } from './ui.js';
import { api, avatarFace, openDialog, platform, ROLE_LABELS, toast } from './platform.js';

const FILTERS = { all: '全部', admin: '高级管理员', moderator: '普通管理员', user: '成员', trusted: '可信成员' };
const SORTS = { seen: '最近活跃', latest: '最新注册', oldest: '最早注册', works: '投稿最多', votes: '计票最多' };
const RANK = { admin: 2, moderator: 1, user: 0 };
const DAY = 86400e3;
// What each role may do: [text, allowed].
const RIGHTS = {
  admin: [['审核题目与作品，可以审核本人发布的', true], ['管理全部题目、全部作品，删除作品', true], ['调整其他成员的角色', true], ['投稿不限量，单独发起题目不受参与门槛限制', true]],
  moderator: [['内容审核与核验他人作品，管理展示与盲评', true], ['编辑作品信息；本人作品的审核与展示由其他管理员处理', true], ['投稿不限量，单独发起题目不受参与门槛限制', true], ['不能审核或管理题目、删除作品、调整角色', false]],
  user: [['发起题目、投稿、参加盲评计票', true], ['待审投稿最多 8 件；已核验满 3 件且近 90 天无存疑的可信成员 20 件', true], ['单独发起题目需计票满 100 次或已提交作品满 10 件', true], ['不能进入审核页', false]],
};
const CHANGES = {
  'user>moderator': '保存后立即可以进入审核页，审核与核验他人作品、管理展示；投稿不再限量。',
  'user>admin': '保存后立即获得全部管理权限，包括题目审核与管理、删除作品和调整其他成员的角色。',
  'moderator>admin': '保存后增加题目审核与管理、删除作品和调整其他成员的角色。',
  'admin>moderator': '保存后立即失去题目审核与管理、删除作品和调整角色；仍可审核与核验他人作品。',
  'moderator>user': '保存后立即不能进入审核页。已做出的审核决定和记录保留；待审投稿按成员规则计算。',
  'admin>user': '保存后立即失去全部管理权限，不能进入审核页。已做出的审核决定和记录保留；待审投稿按成员规则计算。',
};

export const membersState = () => ({ list: null, error: '', filter: 'all', query: '', email: '', active: '', sort: 'seen' });

const self = (m) => m.id === platform.user?.id;
const lockReason = (m) => (self(m) ? '不能修改自己的角色，需由其他高级管理员调整。'
  : m.fixed ? '该账号由服务器配置 ADMIN_USERNAMES 固定为高级管理员，需先修改服务器配置。' : '');
const workTotal = (m) => m.works.verified + m.works.questioned + m.works.pending + m.works.rejected;
const quota = (m) => (m.pendingLimit === null ? '不限' : `${m.pendingLimit} 件${m.trusted ? ' · 可信成员' : ''}`);
const idleDays = (m) => (m.lastSeenAt ? (Date.now() - Date.parse(m.lastSeenAt)) / DAY : Infinity);
const face = (m) => `<span class="avatar" aria-hidden="true">${avatarFace(m.avatar, m.nickname)}</span>`;
function seen(m) {
  const days = idleDays(m);
  return days === Infinity ? '暂无活跃记录' : days < 1 / 24 ? '刚刚活跃' : days < 1 ? `${Math.round(days * 24)} 小时前活跃`
    : days < 30 ? `${Math.round(days)} 天前活跃` : `${formatDate(m.lastSeenAt)} 最后活跃`;
}
const inFilter = (m, filter) => ({ all: true, admin: m.role === 'admin', moderator: m.role === 'moderator', user: m.role === 'user', trusted: m.trusted })[filter];

// The search and selects set the scope the chips count within.
function members(state, { filtered = true } = {}) {
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
  const parts = [`已核验 ${verified}`, questioned && `存疑 ${questioned}`, pending && `待审 ${pending}`, rejected && `拒绝 ${rejected}`].filter(Boolean).join(' · ');
  return `<article class="work-row work-managed-row member-row">
    ${face(m)}<div class="work-main">
      <h3>${esc(m.nickname)}<small>@${esc(m.name)}</small>${tags}</h3>
      <p class="work-meta">注册于 ${formatDate(m.createdAt)} · ${seen(m)} · ${m.emailVerified ? '已绑定邮箱' : '未绑定邮箱'}</p>
      <p class="work-state"><span><small>角色</small>${icon(m.role === 'user' ? 'user' : 'shield')}${ROLE_LABELS[m.role]}</span><span${questioned ? ' class="is-issue"' : total ? '' : ' class="is-muted"'}><small>投稿</small>${total ? `${total} 件<small class="member-parts">${parts}</small>` : '0'}</span><span${m.questions ? '' : ' class="is-muted"'}><small>题目</small>${m.questions}</span><span${m.votes ? '' : ' class="is-muted"'}><small>计票</small>${m.votes}</span><span><small>待审额度</small>${quota(m)}</span></p>
    </div><div class="work-side"><button class="btn sm" type="button" data-manage-member="${esc(m.id)}">管理</button></div>
  </article>`;
}

export function memberChips(state) {
  const scope = members(state, { filtered: false });
  return Object.entries(FILTERS).map(([id, label]) => `<button class="chip" type="button" data-member-filter="${id}" aria-pressed="${state.filter === id}">${label}<span>${scope.filter((m) => inFilter(m, id)).length}</span></button>`).join('');
}

export function memberResults(state) {
  const list = members(state), total = (state.list ?? []).length;
  return `<p class="work-manage-list-meta">显示 ${list.length} / ${total} 位成员 · 自己和服务器固定的账号不能在这里改角色</p>
    ${list.length ? `<div class="work-list">${list.map(row).join('')}</div>` : '<div class="board-empty"><p class="board-empty-title">没有匹配的成员</p><button class="btn sm" type="button" data-member-reset>清除筛选</button></div>'}`;
}

export function memberList(state) {
  if (state.list === null) return state.error ? `<p class="form-error">${esc(state.error)}</p>` : '<p class="muted">正在载入成员…</p>';
  const options = (items, current) => items.map(([id, label]) => `<option value="${id}"${id === current ? ' selected' : ''}>${label}</option>`).join('');
  return `<div class="work-management"><div class="work-manage-heading"><h3>全部成员<span>${state.list.length}</span></h3><p>角色与参与情况；角色调整即时生效并记入审核记录</p></div>
    <div class="work-manage-tools"><label class="collection-search">${icon('search')}<input type="search" data-member-search aria-label="搜索用户名或昵称" placeholder="搜索用户名或昵称" value="${esc(state.query)}"></label>
      <select name="email" data-member-select aria-label="按邮箱筛选">${options([['', '全部邮箱状态'], ['bound', '已绑定邮箱'], ['none', '未绑定邮箱']], state.email)}</select>
      <select name="active" data-member-select aria-label="按活跃时间筛选">${options([['', '全部活跃时间'], ['week', '7 天内活跃'], ['month', '30 天内活跃'], ['idle', '超过 30 天未活跃']], state.active)}</select>
      <select name="sort" data-member-select aria-label="成员排序">${options(Object.entries(SORTS), state.sort)}</select></div>
    <div class="chips work-manage-filters" data-member-chips>${memberChips(state)}</div><div class="work-manage-results" data-member-results>${memberResults(state)}</div></div>`;
}

// Role history comes from the shared audit log, whose 'role' entries read "name → 角色".
export function openMember(m, { audit = [], onSaved }) {
  const locked = lockReason(m);
  const { verified, questioned, pending, rejected } = m.works;
  const log = audit.filter((entry) => entry.action === 'role' && entry.detail?.startsWith(`${m.name} → `));
  const sheet = openDialog({ title: '管理成员', className: 'member-sheet', body: `<form novalidate>
    <div class="member-body"><div class="member-grid">
      <aside class="member-facts">
        <div class="member-id">${face(m)}<div><h3>${esc(m.nickname)}</h3><p>@${esc(m.name)}</p></div></div>
        <dl class="facts">
          <div><dt>当前角色</dt><dd>${ROLE_LABELS[m.role]}${m.fixed ? ' · 服务器固定' : ''}${m.trusted ? ' · 可信成员' : ''}</dd></div>
          <div><dt>邮箱</dt><dd>${m.email ? `${esc(m.email)} · ${m.emailVerified ? '已验证' : '未验证'}` : '未绑定'}${m.emailVerified ? '' : '<p>未绑定邮箱不能投稿或发起题目。</p>'}</dd></div>
          <div><dt>注册时间</dt><dd>${formatDate(m.createdAt)}</dd></div>
          <div><dt>最近活跃</dt><dd>${m.lastSeenAt ? formatTime(m.lastSeenAt) : '暂无活跃记录'}</dd></div>
          <div><dt>投稿</dt><dd>${workTotal(m)} 件<p>已核验 ${verified} · 存疑 ${questioned} · 待审 ${pending} · 拒绝 ${rejected}</p></dd></div>
          <div><dt>发起题目</dt><dd>${m.questions} 道</dd></div>
          <div><dt>盲评计票</dt><dd>${m.votes} 次</dd></div>
          <div><dt>待审额度</dt><dd>${quota(m)}${m.role === 'user' && !m.trusted ? `<p>可信成员需已核验满 3 件且近 90 天无存疑（现在已核验 ${verified} 件）。</p>` : ''}</dd></div>
        </dl>
        <div class="actions"><a class="btn sm" href="#/review/works?q=${encodeURIComponent(m.nickname)}">在全部作品中查看${icon('right')}</a></div>
        <details><summary>角色记录 · ${log.length}</summary>
          ${log.length ? `<ol class="audit">${log.map((entry) => `<li><time>${formatTime(entry.at)}</time><span class="audit-actor">${esc(entry.actor)}</span><b>调整角色</b><span>${esc(entry.detail)}</span></li>`).join('')}</ol>` : '<p class="muted">最近的审核记录里没有角色调整。</p>'}
        </details>
      </aside>
      <section class="member-roles">
        <h3>角色</h3><p>决定能否进入审核页，以及能处理哪些内容。</p>
        ${locked ? `<p class="role-locked">${icon('shield')}${esc(locked)}</p>` : ''}
        ${Object.keys(RIGHTS).map((role) => `<label class="role-option"><input type="radio" name="role" value="${role}"${role === m.role ? ' checked' : ''}${locked ? ' disabled' : ''}>
          <span><b>${ROLE_LABELS[role]}${role === m.role ? '<small>当前</small>' : ''}</b><ul>${RIGHTS[role].map(([text, allowed]) => `<li${allowed ? '' : ' class="is-no"'}>${esc(text)}</li>`).join('')}</ul></span></label>`).join('')}
        <div data-role-change></div>
      </section>
    </div></div>
    <footer class="member-actions"><p class="form-error" role="alert"></p><span class="spacer"></span><button type="button" class="btn" data-sheet-close>${locked ? '关闭' : '取消'}</button>${locked ? '' : '<button type="submit" class="btn primary" disabled>保存角色</button>'}</footer>
  </form>` });
  const form = $('form', sheet.el);
  if (locked) return;
  const submit = $('[type="submit"]', form);
  function sync() {
    const role = form.elements.role.value, down = RANK[role] < RANK[m.role];
    $('[data-role-change]', form).innerHTML = role === m.role ? ''
      : `<div class="role-change${down ? ' is-down' : ''}"><b>${esc(m.nickname)}：${ROLE_LABELS[m.role]} → ${ROLE_LABELS[role]}</b><br>${CHANGES[`${m.role}>${role}`]}</div>`;
    submit.disabled = role === m.role;
    submit.textContent = role === m.role ? '保存角色' : `改为${ROLE_LABELS[role]}`;
    submit.classList.toggle('danger', down);
  }
  form.addEventListener('change', sync);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const role = form.elements.role.value;
    submit.disabled = true;
    try {
      await api(`admin/users/${encodeURIComponent(m.id)}/role`, { method: 'POST', body: { role } });
    } catch (err) {
      $('.form-error', form).textContent = err.message;
      submit.disabled = false;
      return;
    }
    sheet.close();
    toast(`已将 ${m.nickname} 改为${ROLE_LABELS[role]}`);
    onSaved?.();
  });
}
