// Publish a question: 01 describe it (title / summary / form / domains / prompt / formats), then either
// submit it alone or attach an optional first result through the shared upload steps. The
// question waits for an admin; an attached result also goes through content moderation.
// The result steps sit on their own history entry: going back edits the question and keeps the
// attached result, which is checked again when the prompt or the format changed.
// #/new/<id> reopens the author's rejected question in the same form to resubmit it.
import { $, $$, esc, formatDate, icon, pad } from './ui.js';
import { setPageTitle } from './i18n.js';
import { api, confirmDialog, moderationBadge, openDialog, platform, refreshPlatform, requireUser, reviewVerdict, toast } from './platform.js';
import { contentStage, moderated, stageTrack, uploadFlow } from './submit.js';
import { TEMPLATE_LABELS, categoryLabel, categoryOf } from './categories.js';
import { categoryField, domainField, syncDomains } from './question-fields.js';
import { referenceEditor, referenceSheet, referencesEnabled } from './references.js';
import { replaceReferenceNote } from './reference-files.js';
// Drafts staged for a question that does not exist yet.
const NEW_QUESTION = '__new__';
const blank = () => ({ title: '', summary: '', category: '', domains: [], prompt: '', templates: [] });
// kept: the result held while the question is edited; its steps lead back to it.
const sideSteps = (current, kept = null) => `<ol class="side-steps">${['题目信息', '选择文件', '试加载', '结果信息'].map((label, i) => {
  const text = `<span>0${i + 1}</span>${label}`;
  const done = kept && (i === 1 || (i === 2 && kept.confirmed));
  return `<li${i === current ? ' aria-current="step"' : ''}${done ? ' class="is-done"' : ''}>${kept && i > 0 ? `<button type="button" data-act="to-sample">${text}</button>` : text}</li>`;
}).join('')}</ol>`;

export function mount(root, ctx) {
  let question = blank();
  // showing: 'form', 'upload' (the flow is on screen) or 'done'. skipGuard: the next popstate is our own back.
  let flow = null, flowTask = null, active = true, showing = 'form', skipGuard = false, proceed = null;
  // Resubmitting: the rejected question as last submitted, its sample results and whether to drop them.
  const resubmitId = ctx.param;
  let original = null, samples = [], removeSamples = false;
  let eligibility = platform.me?.questionEligibility ?? null, eligibilityDialog = null, checking = false;
  const rule = '单独提交题目需完成 100 次有效盲评，或上传 10 件作品，满足任一即可。附带示例结果可直接发起。';
  function progress() {
    return `<div class="question-progress">${[
      ['有效盲评', eligibility.votes, eligibility.requiredVotes, '次'],
      ['已上传作品', eligibility.uploads, eligibility.requiredUploads, '件'],
    ].map(([label, value, target, unit]) => `<div class="question-progress-item"><div><b>${label}</b><span><strong>${value}</strong> / ${target} ${unit}</span></div><progress value="${Math.min(value, target)}" max="${target}" aria-label="${label}"></progress><small>${value >= target ? '已达标' : `还差 ${target - value} ${unit}`}</small></div>`).join('<span class="question-progress-or">或</span>')}</div>`;
  }
  function updateEligibility() {
    const host = $('[data-question-eligibility]', root);
    if (!host) return;
    host.innerHTML = `<div class="question-eligibility-head"><b>${eligibility?.allowed ? '已可单独提交题目' : '附带示例，即可发起题目'}</b>${platform.user ? '<button type="button" class="link" data-check-eligibility>刷新进度</button>' : ''}</div><p>${eligibility?.exempt ? '管理员可直接发起题目。' : rule}</p>${eligibility && !eligibility.exempt ? progress() : ''}<p class="fine">有效盲评只统计成功计票，跳过不计；作品按已提交且未删除的数量计算，待审核也计入，试上传不计。</p><p class="form-error" role="alert" data-eligibility-error></p>`;
  }
  function showEligibilityDialog() {
    if (!active || eligibilityDialog || !eligibility || eligibility.allowed) return;
    eligibilityDialog = openDialog({ title: '附上一份示例，就能发起题目', className: 'question-eligibility-sheet',
      body: `<p class="sheet-text">${rule}</p>${progress()}<p class="fine">跳过和未计票的盲评不计入；待审核作品计入上传数，已删除作品和试上传不计。</p><div class="question-eligibility-actions"><button class="btn primary question-sample-action" type="button" data-sheet-close>继续填写并附上示例</button><a class="btn" href="#/arena/random">${icon('split')}去盲评</a><a class="btn" href="#/questions">${icon('upload')}去上传作品</a></div><p class="fine">上传作品请先在题库选题。关闭提示后，本页已填写的内容会保留。</p>`,
      onClose: () => { eligibilityDialog = null; },
    });
    eligibilityDialog.el.addEventListener('click', (event) => { if (event.target.closest('a')) eligibilityDialog?.close(); });
  }
  async function checkEligibility(showDialog = true) {
    const userId = platform.user?.id;
    if (!userId) return false;
    const { eligibility: current } = await api('questions/eligibility');
    if (!active || platform.user?.id !== userId) return false;
    eligibility = current;
    updateEligibility();
    if (showDialog && !current.allowed) showEligibilityDialog();
    return current.allowed;
  }
  async function refreshEligibility() {
    if (checking) return;
    checking = true;
    try { await checkEligibility(); }
    catch (err) { const error = $('[data-eligibility-error]', root); if (error) error.textContent = err.message; }
    finally { checking = false; }
  }
  // Reference images upload as they are picked and outlive a return to the form.
  const promptArea = () => $('.publish-form [name="prompt"]', root);
  function insertNote(text) {
    const area = promptArea();
    if (!area) return;
    const replaced = replaceReferenceNote(area.value, text);
    if (replaced !== null) { area.value = replaced; area.focus(); return; }
    const start = area.selectionStart ?? area.value.length, end = area.selectionEnd ?? start;
    const before = area.value.slice(0, start), after = area.value.slice(end);
    // The section stands as its own paragraph wherever the cursor is.
    const lead = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const block = `${lead}${text}${!after || after.startsWith('\n') ? '' : '\n\n'}`;
    area.value = before + block + after;
    area.focus();
    area.setSelectionRange(before.length + block.length, before.length + block.length);
  }
  const newEditor = () => (referencesEnabled() ? referenceEditor({ prompt: () => promptArea()?.value ?? question.prompt, insert: insertNote }) : null);
  let refs = newEditor();

  // Formats follow the category: a text question takes text, web and 3D questions one HTML file.
  function formatField() {
    const category = categoryOf(question.category);
    if (!category) return '<span class="field-label">允许的提交格式 *</span><p class="fine">选择题目类型后显示可用格式。</p>';
    const [only] = category.templates;
    if (category.templates.length === 1) return `<span class="field-label">提交格式</span><input type="hidden" name="templates" value="${only}"><p class="format-fixed">${esc(TEMPLATE_LABELS[only])}</p><p class="fine">${only === 'text' ? '直接粘贴原文，或上传 .txt / .md 文件，站内按统一版式展示；Markdown 支持表格与 LaTeX 公式。' : '上传单个 .html 文件，资源需写进页面。'}</p>`;
    return `<span class="field-label">允许的提交格式 *</span><div class="format-options">
      ${category.templates.map((value) => `<label><input type="checkbox" name="templates" value="${value}"${question.templates.includes(value) ? ' checked' : ''}>${TEMPLATE_LABELS[value]}</label>`).join('')}
    </div>`;
  }

  // The page around a resubmission: where it sits under 我的题目 and which round this is.
  function resubmitPage() {
    const round = original?.moderation?.round ?? 1;
    return { title: '重新提交', section: 'me', heading: '按审核意见修改', description: '修改后重新提交，管理员会对照上次意见审核。',
      crumbs: [{ text: '个人中心', href: '#/me' }, { text: '我的题目', href: '#/me/questions' }, { text: '修改后重新提交' }],
      meta: original ? `<ol class="side-steps"><li><span>${pad(round)}</span><span data-i18n-date="${esc(original.moderation.at)}">${esc(formatDate(original.moderation.at))}</span> <span>未通过</span></li><li aria-current="step"><span>${pad(round + 1)}</span>本次修改</li></ol>` : '' };
  }
  function showResubmitNote(title, text, login = false) {
    root.innerHTML = `${ctx.pageStart(resubmitPage())}<section class="account-empty">${icon('text')}<h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="actions">${login ? '<button class="btn primary" data-auth="login">登录 / 注册</button>' : ''}<a class="btn${login ? '' : ' primary'}" href="#/me/questions">回到我的题目</a></div></section>${ctx.pageEnd()}`;
  }
  async function loadResubmit() {
    if (!platform.user) return showResubmitNote('登录后修改你的题目', '只有题目的发起人可以修改后重新提交。', true);
    showResubmitNote('正在载入题目…', '');
    try {
      const data = await api('me');
      if (!active || flow) return;
      const found = data.questions?.find((item) => item.id === resubmitId);
      if (!found) return showResubmitNote('没有找到这道题', '它可能已经被删除。');
      if (found.moderation?.status !== 'rejected' || !found.resubmittable) {
        return showResubmitNote('这道题不能修改后重新提交', found.moderation?.status === 'pending' ? '它已经在等待审核。' : '只有未通过审核、且从未公开的题目可以修改后重新提交。');
      }
      original = found;
      samples = (data.works ?? []).filter((work) => work.task === resubmitId);
      removeSamples = false;
      question = { title: found.title, summary: found.summary ?? '', category: found.category ?? '', domains: found.domains ?? [], prompt: found.prompt ?? '', templates: found.templates ?? [] };
      refs?.destroy();
      refs = referencesEnabled() ? referenceEditor({ refs: found.references ?? [], credit: found.referenceCredit ?? '', prompt: () => promptArea()?.value ?? question.prompt, insert: insertNote }) : null;
      showForm();
    } catch (err) {
      if (active) showResubmitNote('题目暂时未能载入', err.message);
    }
  }
  // The sample results kept with a resubmitted question, or dropped with it.
  function sampleField() {
    if (!samples.length) return '';
    return `<div class="field publish-samples" data-samples><span class="field-label">示例结果</span>
      <ul class="question-samples">${samples.map((work) => `<li${removeSamples ? ' class="is-removed"' : ''}><span data-i18n-ignore>${esc(work.modelName)}${work.effort ? ` · ${esc(work.effort)}` : ''} · ${esc(work.title)}</span>${moderationBadge(work.moderation)}${work.scene && !removeSamples ? `<a class="text-link" href="${esc(work.scene)}" target="_blank" rel="noopener">预览结果${icon('arrow')}</a>` : ''}</li>`).join('')}</ul>
      <p class="fine">${removeSamples ? '重新提交后，示例结果会被删除。' : '示例结果保留不变，题目通过后作为第一份作品展示。如果它和修改后的提示词不再对应，可以先移除。'}</p>
      <div><button class="btn sm" type="button" data-act="toggle-samples">${removeSamples ? '保留示例结果' : '移除示例结果'}</button></div></div>`;
  }
  const changedMark = (name) => (original ? `<span class="badge" data-changed="${name}" hidden>已修改</span>` : '');

  function showForm() {
    showing = 'form';
    root.innerHTML = `${ctx.pageStart(original ? resubmitPage() : { title: '发起题目', section: 'new', heading: '让每份答案，从同一题开始',
      description: '写清要测试的能力，提供完整提示词；也可以附上一份模型结果展示它的效果。', meta: sideSteps(0) })}
      <section class="block wrap publish-layout">
        <form class="publish-form" novalidate>
          <div data-sample-kept></div>
          ${original ? `${reviewVerdict(original.moderation)}<p class="fine">下面是你上次提交的内容，改过的项会标出「已修改」。</p>`
            : `<div class="notice publish-auth" data-publish-auth${platform.user ? ' hidden' : ''}>${icon('user')}<p>登录后查看发起资格，已填写的内容会保留。</p><button class="btn sm" type="button" data-auth="login">登录 / 注册</button></div>
          <section class="question-eligibility" data-question-eligibility aria-label="发起题目资格"></section>`}
          <label class="field"><span class="field-label">题目标题 *${changedMark('title')}</span><input class="input" name="title" required maxlength="70" placeholder="例如：体素中国古典建筑群" value="${esc(question.title)}"></label>
          <label class="field"><span class="field-label">测试简述 *${changedMark('summary')}</span><textarea class="input" name="summary" required maxlength="400" rows="3" placeholder="需要完成什么？能测出模型的哪些能力？">${esc(question.summary)}</textarea></label>
          ${categoryField(question.category)}
          ${domainField(platform, question.domains)}
          <label class="field"><span class="field-label">完整提示词 *${changedMark('prompt')}</span><textarea class="input" name="prompt" required maxlength="20000" rows="12" placeholder="粘贴所有参与模型需要使用的同一份完整提示词。">${esc(question.prompt)}</textarea><p class="fine">题库搜索会匹配提示词全文，技术栈、主题等写在提示词里即可，不另设标签。</p></label>
          ${refs ? '<div data-ref-host></div>' : ''}
          <div class="field" data-formats>${formatField()}</div>
          ${original ? sampleField() : ''}
          <p class="form-error" role="alert"></p>
          ${original ? `<div class="form-actions"><button class="btn primary" type="submit" value="resubmit">重新提交审核${icon('right')}</button><a class="btn" href="#/me/questions">取消</a><span class="fine">内容和上次相同时不能提交。</span></div>`
            : `<div class="form-actions" data-form-actions></div>`}
        </form>
        ${original ? '<aside class="publish-note"><h3>重新提交会怎样</h3><p>题目回到「等待人工审核」，管理员会看到上次意见和你改了哪些地方。</p><p>不再检查发起资格；重新进入待审，计入待审数量。</p><p>通过前只有你能看到。也可以回到「我的题目」删除这道题。</p></aside>'
          : '<aside class="publish-note"><h3>一道可比较的题目</h3><p>简述说明测试目标。<br>类型决定提交格式，领域方便读者找到它。<br>提示词作为所有作品的共同依据。</p><p>可以选择附上一份用这份提示词生成的模型结果，让管理员和大家更快看到它能做出什么。</p><p>题目由管理员人工审核，示例结果另做内容审核；通过前只有你能看到。测试文字、灌水或广告不会通过。</p></aside>'}
      </section>${ctx.pageEnd()}`;
    setPageTitle([original ? '修改后重新提交' : '发起题目', ctx.DATA.title]);
    const form = $('.publish-form', root);
    const error = $('.form-error', form);
    syncKept();
    syncDomains(form);
    if (refs) refs.mount($('[data-ref-host]', form));
    const markChanged = () => {
      if (original) error.textContent = '';
      for (const name of original ? ['title', 'summary', 'prompt'] : []) $(`[data-changed="${name}"]`, form).hidden = $(`[name="${name}"]`, form).value.trim() === (original[name] ?? '').trim();
    };
    markChanged();
    root.oninput = (event) => { if (event.target.matches('[name="prompt"]')) refs?.advise(); markChanged(); };
    root.onchange = (event) => {
      if (event.target.matches('[name="domains"]')) { syncDomains(form); error.textContent = ''; return; }
      if (!event.target.matches('[name="category"]')) return;
      question.category = event.target.value;
      question.templates = [...categoryOf(question.category).templates];
      $('[data-formats]', form).innerHTML = formatField();
      error.textContent = '';
    };
    updateEligibility();
    root.onclick = (event) => {
      if (event.target.closest('[data-check-eligibility]')) void refreshEligibility();
      if (event.target.closest('[data-act="to-sample"]')) form.requestSubmit($('button[value="sample"]', form));
      if (event.target.closest('[data-act="toggle-samples"]')) { removeSamples = !removeSamples; $('[data-samples]', form).outerHTML = sampleField(); }
    };
    root.onkeydown = null;
    // Resolves true once the page moved on: to the result steps, or to the submitted question.
    proceed = async (mode, { fromHistory = false } = {}) => {
      if (checking) return false;
      error.textContent = '';
      checking = true;
      try {
        if (!(await requireUser('登录后即可附带示例发起题目')) || !active) return false;
        if (!original && mode !== 'sample' && !(await checkEligibility())) return false;
      } catch (err) { error.textContent = err.message; return false; }
      finally { checking = false; }
      const data = new FormData(form);
      for (const [name, label] of [['title', '题目标题'], ['summary', '测试简述'], ['prompt', '完整提示词']]) {
        if (!String(data.get(name)).trim()) { error.textContent = `请填写${label}`; $(`[name="${name}"]`, form).focus(); return false; }
      }
      if (!categoryOf(data.get('category'))) { error.textContent = '请选择题目类型'; $('[name="category"]', form).focus(); return false; }
      if (!data.getAll('domains').length) { error.textContent = '请选择所属领域'; $('[name="domains"]', form).focus(); return false; }
      if (!data.getAll('templates').length) { error.textContent = '请至少选择一种提交格式'; return false; }
      if (refs?.blocker()) { error.textContent = refs.blocker(); return false; }
      const before = JSON.stringify(question);
      question = { title: String(data.get('title')).trim(), summary: String(data.get('summary')).trim(), category: String(data.get('category')), domains: data.getAll('domains'), prompt: String(data.get('prompt')).trim(),
        templates: data.getAll('templates'), ...(refs?.value().length ? { references: refs.value(), referenceCredit: refs.credit() } : {}) };
      if (mode === 'sample') { enterSample({ fromHistory, changed: before !== JSON.stringify(question) }); return true; }
      const kept = flow?.kept();
      if (kept && !(await confirmDialog({ title: '单独提交题目？', message: `已附上的示例结果「${kept.file}」会被丢弃，题目单独进入审核。`, confirm: '丢弃示例并提交' }))) return false;
      if (!active) return false;
      const buttons = $$('button[type="submit"]', form);
      buttons.forEach((button) => { button.disabled = true; });
      if (original) {
        // Unchanged references stay out of the request; the server rejects a resubmission that changes nothing.
        const { title, summary, category, domains, prompt, templates } = question;
        try {
          const { question: saved } = await api(`questions/${encodeURIComponent(original.id)}/resubmit`, { method: 'POST',
            body: { title, summary, category, domains, prompt, templates, ...(refs?.changed() ? { references: refs.value(), referenceCredit: refs.credit() } : {}), removeSamples } });
          toast('已重新提交，等待人工审核');
          await refreshPlatform('question');
          if (active) showResubmitted(saved);
        } catch (err) {
          error.textContent = err.message;
          buttons.forEach((button) => { button.disabled = false; });
        }
        return;
      }
      try {
        const result = await api('questions', { method: 'POST', body: question });
        toast('题目已提交，等待人工审核');
        flow?.drop();
        flow = null;
        await refreshPlatform('question');
        if (active) showDone(result);
        return true;
      } catch (err) {
        error.textContent = err.message;
        if (err.code === 'question_ineligible') void refreshEligibility();
        buttons.forEach((button) => { button.disabled = false; });
        return false;
      }
    };
    root.onsubmit = (event) => {
      if (event.target !== form) return;
      event.preventDefault();
      void proceed(event.submitter?.value === 'sample' ? 'sample' : 'plain');
    };
  }

  // The form says what it holds of a result left to edit the question, and leads back to it.
  function syncKept() {
    if (original) return;
    const form = $('.publish-form', root);
    if (!form) return;
    const kept = flow?.kept();
    $('[data-sample-kept]', form).innerHTML = kept ? `<div class="notice sample-kept">${icon('file')}<p><b>示例结果已保留</b>${['<span data-i18n-ignore>' + esc(kept.file) + '</span>', kept.confirmed ? '<span>试加载已确认</span>' : '<span>试加载待确认</span>', ...(kept.filled ? ['<span>结果信息已填写</span>'] : [])].join(' · ')}。改完题目后回到示例继续；改了提示词需要重新确认试加载。</p><button class="btn sm" type="button" data-act="to-sample">回到示例结果${icon('right')}</button></div>` : '';
    $('[data-form-actions]', form).innerHTML = `${kept
      ? `<button class="btn primary" type="submit" value="sample">回到示例结果${icon('right')}</button><button class="btn" type="submit" value="plain">单独提交题目</button>`
      : `<button class="btn primary" type="submit" value="plain">单独提交题目</button><button class="btn" type="submit" value="sample">附上示例结果${icon('right')}</button>`}<a class="btn" href="#/questions">取消</a><span class="fine">发起即表示你同意 <a href="#/terms" target="_blank" rel="noopener">《使用条款》</a> 与 <a href="#/privacy" target="_blank" rel="noopener">《隐私政策》</a>。</span>`;
    $('.side-steps', root).outerHTML = sideSteps(0, kept);
  }

  function enterSample({ fromHistory = false, changed = false } = {}) {
    if (!fromHistory) history.pushState({ ...history.state, publish: 'sample' }, '');
    showing = 'upload';
    if (!flow) { showUpload(); scrollTo({ top: 0 }); return; }
    Object.assign(flowTask, { title: question.title, prompt: question.prompt, templates: question.templates });
    if (flow.resume()) { $('[data-sample-notice]', root)?.scrollIntoView({ block: 'center' }); return; }
    scrollTo({ top: 0 });
    if (changed) toast('题目信息已更新，示例结果已保留');
  }

  // Leaving the result steps mid-upload ends the upload; asked first, staying is the default.
  function confirmLeave() {
    return new Promise((resolve) => {
      let leave = false;
      const sheet = openDialog({ title: '文件还在上传', className: 'confirm-sheet',
        body: '<p class="sheet-text">返回修改题目会中断这次上传。题目内容会保留，改完后需要重新选择文件。</p><div class="sheet-actions"><button class="btn" type="button" data-leave>中断并返回</button><button class="btn primary" type="button" data-sheet-close>继续上传</button></div>',
        onClose: () => resolve(leave) });
      $('[data-leave]', sheet.el).addEventListener('click', () => { leave = true; sheet.close(); });
    });
  }
  function backToForm() {
    flow.suspend();
    if (!flow.kept()) { flow.destroy(); flow = null; }
    showForm();
    scrollTo({ top: 0 });
  }
  async function editQuestion() {
    if (flow.uploading() && !(await confirmLeave())) return;
    if (!active || showing !== 'upload') return;
    if (history.state?.publish !== 'sample') return backToForm();
    skipGuard = true;
    history.back();
  }
  // Back from the result steps edits the question; forward from the form returns to them.
  const onPopState = (event) => {
    if (!active) return;
    if (event.state?.publish === 'sample') {
      if (showing === 'form') void proceed('sample', { fromHistory: true }).then((moved) => { if (!moved && active) history.back(); });
      return;
    }
    if (showing !== 'upload') return;
    if (skipGuard) { skipGuard = false; backToForm(); return; }
    // A submitted question is not edited again; back goes on to where the author came from.
    if (flow.finished()) { history.back(); return; }
    if (!flow.uploading()) { backToForm(); return; }
    void confirmLeave().then((leave) => {
      if (!active || showing !== 'upload') return;
      if (leave) backToForm();
      else history.pushState({ ...history.state, publish: 'sample' }, '');
    });
  };
  addEventListener('popstate', onPopState);
  // A return to this page from elsewhere starts on the form, whichever of its entries it lands on.
  if (history.state?.publish) history.replaceState({ ...history.state, publish: null }, '');

  function brief() {
    return `<section class="step is-done" data-step="0">
      <header class="step-head"><span class="num">01</span><h2>题目信息</h2><button class="btn sm step-action" type="button" data-act="edit-question">${icon('prev')}修改题目</button><p>管理员会对照这些内容人工审核</p></header>
      <div class="step-body question-brief">
        <h3 data-i18n-ignore>${esc(question.title)}</h3>
        <p data-i18n-ignore>${esc(question.summary)}</p>
        <p class="work-meta">${[esc(categoryLabel(question.category)), ...question.domains.map(esc), question.templates.map((t) => TEMPLATE_LABELS[t]).join(' / ')].join(' · ')}</p>
        ${refs ? referenceSheet(refs.previews(), { key: 'new-question', download: false }) : ''}
        <details class="prompt-peek"><summary>${icon('guide')}完整提示词 · 示例结果需按它生成</summary><pre>${esc(question.prompt)}</pre></details>
      </div>
    </section>`;
  }

  // A question always waits for a person; its sample result is moderated alongside it.
  function questionStages(work) {
    const status = work?.moderation?.status;
    const sample = !work ? null : status === 'rejected' ? '未通过内容审核，不会展示'
      : status === 'review' ? '等待人工复核' : status === 'pending' ? contentStage()[1] : '已通过';
    return [['题目审核', '管理员人工审核，通过前仅你可见'], ...(sample ? [['示例结果', sample]] : []),
      ['进入题库', work ? '示例结果作为第一份作品展示' : '其他人可以上传各自的结果']];
  }
  function done({ question: saved, work }) {
    const q = saved.moderation?.status ?? 'pending';
    const sampleWaiting = work && ['pending', 'review'].includes(work.moderation?.status);
    const passed = ['approved', 'legacy'].includes(q);
    const current = !passed ? 0 : sampleWaiting ? 1 : -1;
    const view = q === 'rejected'
      ? ['未通过', `「${saved.title}」没有通过审核`, '题目不会公开。可以在「我的题目」按意见修改后重新提交。']
      : !passed ? ['等待人工审核', `「${saved.title}」已提交审核`, work ? '管理员审核题目的同时，示例结果做内容审核。通过前只有你能看到，这一页会自动更新。' : '管理员审核通过后，题目进入题库并开放投稿。']
      : sampleWaiting ? ['题目已通过', `「${saved.title}」已进入题库`, '示例结果还在内容审核，通过后作为第一份作品展示。']
      : ['已公开', `「${saved.title}」已进入题库`, '其他人现在可以上传各自模型的结果。'];
    const reason = q === 'rejected' && saved.moderation?.reason ? `<p class="result-reason">${icon('alert')}<span><span>原因：</span><span data-i18n-ignore>${esc(saved.moderation.reason)}</span></span></p>` : '';
    const stages = questionStages(work);
    return `<section class="submit-done">
      <p class="kicker"><span class="num">已提交</span><span>${view[0]}</span></p>
      <h2>${esc(view[1])}</h2><p>${view[2]}</p>${reason}
      ${q === 'rejected' ? '' : stageTrack(stages, current < 0 ? stages.length - 1 : current, { row: true })}
      <div class="actions"><a class="btn primary" href="#/me/questions">查看我的题目${icon('right')}</a>${work?.scene && q !== 'rejected' ? `<a class="btn" href="${esc(work.scene)}" target="_blank" rel="noopener">预览示例结果${icon('arrow')}</a>` : ''}<button class="btn" type="button" data-act="new-question">再发起一道题</button></div>
    </section>`;
  }

  // Shown after a question is submitted without a result; the upload flow draws its own.
  function showDone(result) {
    showing = 'done';
    root.innerHTML = `${ctx.pageStart({ title: '发起题目', section: 'new', heading: '题目已提交审核', meta: sideSteps(0) })}
      <section class="block wrap">${done(result)}</section>${ctx.pageEnd()}`;
    root.onclick = (event) => {
      if (event.target.closest('[data-act="new-question"]')) newQuestion();
    };
    scrollTo({ top: 0 });
  }
  function newQuestion() {
    flow?.destroy();
    flow = null;
    question = blank();
    refs?.destroy();
    refs = newEditor();
    showForm();
  }
  function showResubmitted(saved) {
    showing = 'done';
    const kept = samples.length && !removeSamples;
    root.innerHTML = `${ctx.pageStart({ ...resubmitPage(), heading: '已重新提交审核' })}<section class="block wrap"><section class="submit-done">
      <p class="kicker"><span class="num">已重新提交</span><span>第 ${saved.moderation?.round ?? 2} 次 · 等待人工审核</span></p>
      <h2>${esc(`「${saved.title}」已重新提交审核`)}</h2><p>管理员会对照上次意见审核，通过后进入题库并开放投稿。通过前只有你能看到。</p>
      ${stageTrack([['按意见修改', '已完成'], ['题目审核', '管理员人工审核，通过前仅你可见'], ['进入题库', kept ? '示例结果作为第一份作品展示' : '其他人可以上传各自的结果']], 1, { row: true })}
      <div class="actions"><a class="btn primary" href="#/me/questions">查看我的题目${icon('right')}</a></div>
    </section></section>${ctx.pageEnd()}`;
    root.onclick = null;
    root.onsubmit = null;
    scrollTo({ top: 0 });
  }

  function showUpload() {
    flowTask = { id: NEW_QUESTION, title: question.title, prompt: question.prompt, templates: question.templates, promptVariants: [] };
    flow = uploadFlow(root, ctx, {
      task: flowTask,
      draftTask: NEW_QUESTION,
      lead: { label: '题目信息', html: brief, act: 'edit-question' },
      page: (finished) => ({ title: '发起题目', section: 'new', heading: finished ? '题目已提交审核' : '附上一份示例结果',
        description: '选填：用这道题的提示词让模型生成一份结果，展示题目的效果。' }),
      fileNote: '上传用这份提示词让模型生成的结果',
      infoLabel: '结果信息',
      submitLabel: '提交题目与结果',
      submitNote: '通过审核前只有你能看到题目和结果。',
      stages: [['题目审核', '管理员人工审核，通过前仅你可见'], ['示例结果', moderated() ? contentStage()[1] : '随题目一起公开'], ['进入题库', '示例结果作为第一份作品展示']],
      waiting: ({ question: saved, work }) => ['pending', 'review'].includes(saved.moderation?.status ?? 'pending') || ['pending', 'review'].includes(work?.moderation?.status),
      async submit({ draftId, confirmed, ...work }) {
        const result = await api('questions', { method: 'POST', body: { ...question, draftId, confirmed, work } });
        toast('题目已提交，等待人工审核');
        await refreshPlatform('question');
        return result;
      },
      done,
      onAct(act) {
        if (act === 'edit-question') void editQuestion();
        if (act === 'new-question') newQuestion();
      },
    });
  }

  if (resubmitId) void loadResubmit();
  else {
    showForm();
    if (platform.user) void refreshEligibility();
  }
  return {
    onPlatformChange(reason) {
      if (resubmitId) {
        if (reason === 'session') void loadResubmit();
        return;
      }
      if (showing === 'upload') flow.onPlatformChange?.(reason);
      else {
        const auth = $('[data-publish-auth]', root);
        if (auth) auth.hidden = Boolean(platform.user);
        // A result held for the form follows the account too; signing out discards it.
        if (flow) {
          flow.onPlatformChange(reason);
          if (!flow.kept()) { flow.destroy(); flow = null; }
          syncKept();
        }
      }
      if (reason === 'session') {
        eligibilityDialog?.close();
        eligibility = platform.me?.questionEligibility ?? null;
        updateEligibility();
        if (platform.user && showing === 'form') void refreshEligibility();
      }
    },
    destroy() {
      active = false;
      removeEventListener('popstate', onPopState);
      eligibilityDialog?.close();
      flow?.destroy();
      refs?.destroy();
      root.oninput = null;
      root.onsubmit = null;
      root.onkeydown = null;
    },
  };
}
