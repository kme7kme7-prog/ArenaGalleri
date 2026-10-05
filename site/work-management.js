// Work metadata and display settings share a sheet; review decisions keep their own dialogs.
import { $, $$, brandMark, esc, formatTime, icon, img } from './ui.js';
import { api, byStaff, canDecide, isSenior, moderationBadge, openDialog, refreshPlatform, ROLE_LABELS, setFaces, statusBadge, toast } from './platform.js';
import { templatesOf } from './categories.js';
import { workFieldsHtml } from './work-fields.js';

const held = (w) => ['pending', 'review', 'rejected'].includes(w.moderation?.status);
const flagsOf = (w) => ({
  show_gallery: Boolean(w.show_gallery ?? ['show2', 'both'].includes(w.audience)),
  show_arena: Boolean(w.show_arena ?? ['show1', 'both'].includes(w.audience)),
});
const ACTIONS = { submit: '提交作品', verified: '通过核验', questioned: '标记存疑', unverified: '退回未验证',
  delete: '删除作品', 'content-review': '内容审核', 'content-retry': '重新自动审核', meta: '编辑信息', 'face-settings': '调整展示设置' };

function auditDetail(row) {
  if (row.action !== 'face-settings') return row.detail ?? '';
  try {
    const faces = JSON.parse(row.detail);
    return [['show_gallery', '展览馆'], ['show_arena', '盲评']]
      .filter(([key]) => Object.hasOwn(faces, key)).map(([key, label]) => `${label}${faces[key] ? '开启' : '关闭'}`).join(' · ');
  } catch { return row.detail ?? ''; }
}

export function openWorkManagement(ctx, w, { questions = [], audit = [], createEditor, onReview, onContent } = {}) {
  const listed = ctx.DATA.tasks.find((t) => t.id === w.task);
  const task = listed ?? questions.find((q) => q.id === w.task);
  const packaged = Boolean(ctx.packagedWork(w.task, w.id));
  const publisher = byStaff(w) ? `${w.author?.name ?? ctx.DATA.title} · ${ROLE_LABELS[w.author?.role ?? 'admin']}` : w.author?.name ?? '已注销的用户';
  const screenshot = Object.values(w.captures ?? {})[0] ?? w.cover;
  const model = ctx.modelOf(w);
  const records = audit.filter((row) => row.task === w.task && row.work === w.id);
  const questionHidden = !listed || (task.moderation?.status && !['legacy', 'approved'].includes(task.moderation.status));
  const blockedReason = held(w) ? '通过内容审核和作品核验后可开启。'
    : questionHidden ? '所属题目尚未公开，暂不能开启展示。'
      : w.status !== 'verified' ? '通过作品核验后可开启。'
        : w.entertainment_route ? '这是娱乐收件箱作品，暂不能开启展示。' : '';
  const ownReason = canDecide(w) ? '' : '这是你发布的作品。可以编辑信息，审核和展示设置需要由其他管理员处理。';
  const initial = flagsOf(w);
  const decision = held(w) ? 'content' : 'review';
  const canOpenDecision = canDecide(w) && (decision === 'content' ? Boolean(onContent) : !questionHidden && Boolean(onReview));
  // Uploads can be re-homed to another question; package works keep the question the data pack gives them.
  const movable = !packaged && canDecide(w);
  const homes = new Map([...ctx.DATA.tasks, ...questions].map((q) => [q.id, q.title]));
  if (!homes.has(w.task)) homes.set(w.task, task?.title ?? w.task);
  const homeHint = packaged ? '数据包作品的归属题目由数据仓库维护。' : !movable ? '你发布的作品需由其他管理员调整归属题目。'
    : '改到其他题目后，这件作品的盲评记录、评论和表情一起迁移。';
  const sheet = openDialog({
    title: '管理作品',
    className: 'work-manage-sheet',
    body: `<form class="work-manage-form" novalidate>
      <div class="work-manage-body"><div class="work-manage-grid">
        <aside class="work-manage-facts">
          ${img(screenshot, `${w.title}预览`, 'work-manage-preview', true)}
          <div class="work-manage-heading"><p class="result-model">${brandMark(model)}<span>${esc(model.name)}</span>${w.effort ? `<span class="badge">${esc(w.effort)}</span>` : ''}</p>
            <h3>${esc(w.title)}</h3><p class="muted">${esc(task?.title ?? w.task)}</p></div>
          <dl class="facts">
            <div><dt>发布者</dt><dd>${esc(publisher)}</dd></div>
            ${w.addedAt ? `<div><dt>发布日期</dt><dd>${formatTime(w.addedAt)}</dd></div>` : ''}
            <div><dt>内容审核</dt><dd>${moderationBadge(w.moderation) || '已通过'}${w.moderation?.reason ? `<p>${esc(w.moderation.reason)}</p>` : ''}</dd></div>
            <div><dt>作品核验</dt><dd>${statusBadge(w.status, { always: true })}${w.reason ? `<p>${esc(w.reason)}</p>` : ''}</dd></div>
            ${w.reviewer ? `<div><dt>上次核验</dt><dd>${esc(w.reviewer)} · ${formatTime(w.reviewedAt)}</dd></div>` : ''}
          </dl>
          <div class="actions work-manage-links">
            ${w.scene ? `<a class="btn sm" href="${esc(w.scene)}" target="_blank" rel="noopener">打开作品${icon('arrow')}</a>` : '<span class="fine">暂无可用的作品预览。</span>'}
            <button type="button" class="btn sm ghost" data-work-decision${canOpenDecision ? '' : ' disabled'}>${decision === 'content' ? '审核内容' : w.status === 'verified' ? '重新核验' : '核验作品'}</button>
          </div>
          ${ownReason ? `<p class="fine work-manage-own">${esc(ownReason)}</p>` : ''}
          <details class="work-manage-audit"><summary>审核与管理记录</summary>
            ${records.length ? `<ol class="audit">${records.map((row) => `<li><time>${formatTime(row.at)}</time><span class="audit-actor">${esc(row.actor)}</span><b>${esc(ACTIONS[row.action] ?? row.action)}</b>${row.detail ? `<span>${esc(auditDetail(row))}</span>` : ''}</li>`).join('')}</ol>` : '<p class="muted">还没有记录。</p>'}
          </details>
        </aside>
        <section class="work-manage-fields">
          <h3 class="mini-heading">作品信息</h3>
          <label class="field"><span class="field-label">所属题目</span><select class="input" name="task"${movable ? '' : ' disabled'}>${[...homes].map(([id, title]) => `<option value="${esc(id)}"${id === w.task ? ' selected' : ''}>${esc(title)}</option>`).join('')}</select><span class="field-hint">${homeHint}</span></label>
          ${workFieldsHtml(ctx, task, w, { expanded: true })}
          <div class="work-display-settings"><h3 class="mini-heading">展示设置</h3>
            <label class="work-display-setting"><span><b>展览馆公开展示</b><small data-gallery-hint></small></span><input type="checkbox" role="switch" name="show_gallery" aria-label="展览馆公开展示"${initial.show_gallery ? ' checked' : ''}></label>
            <label class="work-display-setting"><span><b>参加盲评</b><small data-arena-hint></small></span><input type="checkbox" role="switch" name="show_arena" aria-label="参加盲评"${initial.show_arena ? ' checked' : ''}></label>
            <p class="fine work-display-note">保存信息与展示设置不改变审核决定。</p>
          </div>
        </section>
      </div></div>
      <footer class="work-manage-actions">
        <p class="form-error" role="alert"></p>
        ${isSenior() ? `<button type="button" class="btn ghost danger" data-work-delete>${icon('trash')}下架作品</button>` : ''}
        <span class="spacer"></span><button type="button" class="btn" data-sheet-close>取消</button><button type="submit" class="btn primary">保存修改</button>
      </footer>
    </form>`,
  });
  const form = $('form', sheet.el);
  const editor = createEditor(form, task, w);
  const error = $('.form-error:not(.field-error)', form);
  let busy = false;
  // Text questions retain the backend's earlier blind-pool rules.
  const textTask = task && (task.kind === 'text' || templatesOf(task).every((type) => type === 'text'));
  const generationOkay = () => textTask || form.elements.generationMode.value === 'single-turn' && form.elements.humanIntervention.value === 'none';
  function syncSettings({ generationChanged = false } = {}) {
    const allowed = canDecide(w) && !blockedReason;
    const qualified = generationOkay();
    // Explicit generation edits remove an incompatible blind flag; viewing a legacy record does not rewrite it.
    if (generationChanged && allowed && !qualified) form.elements.show_arena.checked = false;
    form.elements.show_gallery.disabled = !allowed || busy;
    // An incompatible saved flag may be turned off, but cannot be turned back on.
    form.elements.show_arena.disabled = !allowed || !qualified && !form.elements.show_arena.checked || busy;
    $('[data-gallery-hint]', form).textContent = ownReason || blockedReason || '关闭后，展览馆不再展示这件作品。';
    $('[data-arena-hint]', form).textContent = ownReason || blockedReason || (qualified
      ? textTask ? '文本作品沿用本题的盲评规则。' : '只允许一轮生成且无人工介入的已验证作品。'
      : form.elements.generationMode.value === 'multi-turn' || ['prompt-guided', 'code-edited'].includes(form.elements.humanIntervention.value)
        ? '多轮生成或有人工介入，不能参加盲评。' : '请先填写一轮生成且无人工介入的生成信息。');
    $('[data-arena-hint]', form).classList.toggle('is-issue', !ownReason && !blockedReason && !qualified);
  }
  function setBusy(value) {
    busy = value;
    $('.work-manage-body', form).inert = value;
    $$('button', form).forEach((button) => { button.disabled = value; });
    $('[data-work-decision]', form).disabled = value || !canOpenDecision;
    syncSettings();
  }
  form.addEventListener('change', (event) => {
    syncSettings({ generationChanged: ['generationMode', 'humanIntervention'].includes(event.target.name) });
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    error.textContent = '';
    let meta;
    try { meta = editor.collect(); } catch (err) { error.textContent = err.message; return; }
    if (movable && form.elements.task.value !== w.task) meta.task = form.elements.task.value;
    const faces = {};
    if (canDecide(w) && !blockedReason) {
      for (const key of ['show_gallery', 'show_arena']) {
        const checked = form.elements[key].checked;
        if (checked !== initial[key] && (key !== 'show_arena' || !checked || generationOkay())) faces[key] = checked;
      }
    }
    setBusy(true);
    let metadataSaved = false;
    try {
      metadataSaved = await editor.save(meta);
      if (Object.keys(faces).length) {
        const { work } = await setFaces(w.task, w.id, faces);
        Object.assign(w, work);
      }
      sheet.close();
      toast(metadataSaved || Object.keys(faces).length ? `已保存：${w.title}` : '信息与展示设置没有改动');
      await refreshPlatform('review');
    } catch (err) {
      error.textContent = metadataSaved ? `作品信息已保存，展示设置未保存：${err.message}。请重试保存。` : err.message;
      if (metadataSaved) await refreshPlatform('review');
    } finally { setBusy(false); }
  });
  $('[data-work-decision]', form).addEventListener('click', () => {
    if (busy || !canOpenDecision || !canDecide(w)) return;
    sheet.close();
    (decision === 'content' ? onContent : onReview)?.();
  });
  $('[data-work-delete]', form)?.addEventListener('click', async () => {
    if (busy || !isSenior()) return;
    setBusy(true);
    error.textContent = '';
    try {
      const body = await withdrawDialog(w, packaged);
      if (!body || !sheet.el.open) return;
      await api(`works/${encodeURIComponent(w.task)}/${encodeURIComponent(w.id)}`, { method: 'DELETE', body });
      sheet.close();
      toast(body.void ? '作品已下架，对局已作废' : '作品已下架');
      await refreshPlatform('delete');
    } catch (err) { error.textContent = err.message; }
    finally { setBusy(false); }
  });
  syncSettings();
  return sheet;
}

// Withdrawal keeps counted ballots; voiding drops them (reason shown in the audit log) and purging
// erases hosted files. Vote-free uploads lose their files either way.
function withdrawDialog(w, packaged) {
  return new Promise((resolve) => {
    let answer = null;
    const sheet = openDialog({
      title: '下架这件作品？',
      className: 'confirm-sheet',
      body: `<form class="withdraw-form">
        <p class="sheet-text">「${esc(w.title)}」会从展厅和盲评中下架。已计入的盲评票默认继续保留在榜单中。操作会记入审核记录。</p>
        <label class="work-display-setting"><span><b>作废它参与的对局</b><small>冒名、作弊或生成方式不实时使用，相关票从榜单移出</small></span><input type="checkbox" role="switch" name="void"></label>
        <label class="field" hidden data-void-reason><span class="field-label">作废原因</span><textarea class="input" name="reason" rows="2" maxlength="500"></textarea></label>
        ${packaged ? '<p class="fine">数据包中的原始资源由数据仓库维护，不会删除。</p>' : '<label class="work-display-setting"><span><b>清除托管文件</b><small>侵权、违法或隐私问题时使用，删除后无法恢复；没有对局记录的作品总会清除</small></span><input type="checkbox" role="switch" name="purge"></label>'}
        <p class="form-error" role="alert"></p>
        <div class="sheet-actions"><button class="btn" type="button" data-sheet-close>取消</button><button class="btn primary danger" type="submit">下架</button></div>
      </form>`,
      onClose: () => resolve(answer),
    });
    const form = $('form', sheet.el);
    form.void.addEventListener('change', () => { $('[data-void-reason]', form).hidden = !form.void.checked; });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const reason = form.reason.value.trim();
      if (form.void.checked && !reason) { $('.form-error', form).textContent = '作废对局时请写明原因'; return; }
      answer = { ...(form.void.checked ? { void: true, reason } : {}), ...(form.purge?.checked ? { purge: true } : {}) };
      sheet.close();
    });
  });
}
