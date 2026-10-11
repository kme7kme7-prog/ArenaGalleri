// Submitting to a fixed task (#/submit/<task>): 01 choose file → 02 trial load in the
// platform sandbox → 03 describe the work and submit. The staged draft runs from its own
// origin with a small probe that reports load time, errors and blocked requests.
// After submitting, one stage track shows where the work is and follows it while it waits.
import { $, $$, esc, formatBytes, formatTime, icon } from './ui.js';
import { setPageTitle } from './i18n.js';
import { api, isStaff, needsEmail, platform, refreshPlatform, toast } from './platform.js';
import { createUploadRequest, resolveApiMedia } from './platform-api.js';
import { onWorkFieldChange, readWorkFields, workFieldsHtml } from './work-fields.js';
import { TEMPLATE_LABELS, templatesOf } from './categories.js';
import { linkReferences, referenceSheet } from './references.js';

const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-downloads';
const VIEWS = { desktop: { width: 1440, height: 900, label: '桌面 1440×900' }, phone: { width: 390, height: 844, label: '手机 390×844' } };
const TRIAL_TIMEOUT = 30000;
// A waiting result is checked every 15 s for up to 10 minutes; past that the author looks in 我的作品.
const POLL_MS = 15000;
const POLL_LIMIT = 40;

// What each format's dropzone accepts: the picker filter, the name check and its message.
const FILES = {
  text: { accept: '.txt,.md,.markdown,text/plain,text/markdown', pattern: /\.(txt|md|markdown)$/i, prompt: '拖入 .txt 或 .md 文本文件', error: '文学作品请上传 .txt 或 .md 文本文件' },
  static: { accept: '.html,.htm,text/html', pattern: /\.html?$/i, prompt: '拖入单个 HTML 文件', error: '设计和三维作品请上传单个 .html 文件' },
};
// A page is one HTML file of at most 30 MB, whatever the server would take.
const HTML_BYTES = 30 * 1024 * 1024;
// Text is pasted or dropped into one box; pasted text goes up as a file of the chosen format.
const TEXT_CHARS = 200000;
const TEXT_FORMATS = [['md', 'Markdown'], ['txt', '纯文本']];

const freshTrial = () => ({ booted: false, loaded: false, loadMs: null, errors: [], failed: [], blocked: [], paint: null, timedOut: false, manual: false });

function checkRow({ state, label, detail }) {
  const mark = { ok: 'check', warn: 'alert', info: 'guide', fail: 'close', wait: 'clock' }[state] ?? 'clock';
  return `<li class="check is-${state}">${icon(mark)}<span><b>${esc(label)}</b>${esc(detail)}</span></li>`;
}

// Content moderation may be on without a working automatic check (no screenshots, no key);
// then an admin reviews every upload. Older servers do not report the difference. Staff uploads
// skip content moderation and wait for verification at once.
export const moderated = () => Boolean(platform.site.contentModeration) && !isStaff();
// null means unlimited; staff never use the regular member quota.
export const pendingLimit = () => isStaff() || platform.me?.pendingLimit === null
  ? null : platform.me?.pendingLimit ?? platform.site.limits.pendingPerUser ?? 8;
const automatic = () => moderated() && platform.site.autoModeration !== false;
export const contentStage = () => ['内容审核', automatic() ? '自动检查，通过前仅你可见' : '管理员检查，通过前仅你可见'];

// stages: [label, hint] pairs; current: index of the stage in progress, -1 for none, past the end when
// all are done. failed: the current stage stopped there. compact: a one-line track inside a list row.
export function stageTrack(stages, current = -1, { row = false, compact = false, failed = false } = {}) {
  return `<ol class="timeline${row ? ' is-row' : ''}${compact ? ' is-compact' : ''}" style="--n:${stages.length}">${stages.map(([label, hint], i) => {
    const cls = current < 0 ? '' : i < current ? 'is-done' : i === current ? (failed ? 'is-failed' : 'is-current') : 'is-next';
    return `<li${cls ? ` class="${cls}"` : ''}${i === current ? ' aria-current="step"' : ''}><b>${esc(label)}</b><span>${esc(hint)}</span></li>`;
  }).join('')}</ol>`;
}

const workStages = () => [...(moderated() ? [contentStage()] : []), ['等待核验', '管理员核对生成信息，可修改'], ['已验证', '公开到展览馆']];
// Where a submitted work stands, for its done page. shown: the work is in the public gallery;
// an automatic content approval alone does not put an unverified upload there.
function workStage(w, shown) {
  const offset = moderated() ? 1 : 0;
  const status = w.moderation?.status;
  if (status === 'pending') return { kicker: '内容审核中', title: `「${w.title}」正在内容审核`,
    text: automatic() ? '通常几分钟，排队较多时会更久。这一页会自动更新。' : '管理员会检查内容，通过前只有你能看到。', current: 0 };
  if (status === 'review') return { kicker: '等待人工复核', title: `「${w.title}」等待人工复核`,
    text: '自动审核没能确定结果，管理员会人工查看。通过前仍然只有你能看到。', current: 0 };
  if (status === 'rejected') return { kicker: '未通过', title: `「${w.title}」没有通过内容审核`,
    text: '作品不会公开。可以在「我的作品」删除后修改，再重新上传。', current: -1, rejected: true };
  if (w.status === 'verified') return { kicker: '已验证', title: `「${w.title}」已通过验证`, text: shown ? '它已公开到展览馆，排在题目页前面。' : '它目前没有公开到展览馆。', current: offset + 1, live: shown };
  if (shown) return { kicker: '未验证', title: `「${w.title}」已经进入展厅`,
    text: '所有人都可以浏览它、给它贴表情。管理员核对生成信息后会标为已验证。', current: offset, live: true };
  return { kicker: '等待核验', title: `「${w.title}」等待核验`,
    text: '管理员核对生成信息后公开到展览馆，在此之前只有你能看到。核验前可以在「我的作品」修改信息。', current: offset };
}

export function mount(root, ctx) {
  const tasks = ctx.DATA.tasks;
  const task = tasks.find((t) => t.id === ctx.param);
  if (!task || !task.acceptsUploads) {
    root.innerHTML = `${ctx.pageStart({ title: '上传作品', section: 'questions', heading: task ? '这道题暂不接受作品' : '从一道题目开始', description: '每份作品都对应一道明确的题目。',
      crumbs: task ? [ctx.LIBRARY, { text: task.title, original: true, href: ctx.taskHref(task) }, { text: '上传作品' }] : [ctx.LIBRARY, { text: '上传作品' }] })}
      <section class="account-empty">${icon('grid')}<h2>${!task ? '请从题目内上传作品' : task.promptPending ? '提示词原文尚未公开' : '这道题暂时关闭了投稿'}</h2><p>${!task ? '在题库中打开一道题，点击「上传作品」。' : task.promptPending ? '待题目补充完整提示词后即可上传。' : '管理员重新开放后即可上传。'}</p><a class="btn primary" href="${task ? ctx.taskHref(task) : '#/questions'}">${task ? '返回题目' : '浏览题库'}</a></section>${ctx.pageEnd()}`;
    return {};
  }
  return uploadFlow(root, ctx, { task });
}

// The three upload steps, shared by uploading to a task and by publishing a new question
// together with its first result. options.task needs id, title, prompt and templates;
// the other options replace the page frame, the submit request, the stages and the finished view.
// options.waiting(result) says whether the finished view should keep following the result.
// A flow can be suspended while its page shows something else and resumed after the owner
// changes the task in place; the draft, the trial and the filled fields survive in between.
export function uploadFlow(root, ctx, options) {
  const { task } = options;
  const draftTask = options.draftTask ?? task.id;
  const offset = options.lead ? 1 : 0;
  let templates = templatesOf(task);
  const waiting = options.waiting ?? ((result) => result.work?.moderation?.status === 'pending');
  let active = true, suspended = false;
  const state = {
    task, template: templates[0],
    progress: 0, loaded: 0, total: 0, uploading: false, draft: null, error: '',
    trial: freshTrial(), view: 'desktop', confirmed: false, cover: null,
    submitting: false, work: null, result: null, xhr: null, timer: 0, poll: 0, polls: 0,
    resumable: null, peek: task.promptVariants?.[0]?.id ?? null,
    // fields: the info form's values while it is off screen; notice: why a resumed draft needs
    // another look ('prompt', or { file } when its format no longer fits).
    draftTemplate: null, confirmedPrompt: null, fields: null, notice: null,
    // text: what was pasted for a text result, kept while the author goes back to change it.
    text: '', textFormat: 'md',
  };
  const isText = () => state.template === 'text';

  const maxBytes = () => (state.template === 'text' ? platform.site.limits.uploadBytes : Math.min(platform.site.limits.uploadBytes, HTML_BYTES));
  const pendingFull = () => pendingLimit() !== null && (platform.me?.pending ?? 0) >= pendingLimit();

  // One line under the dropzone with what most often goes wrong; the rest folds away.
  function fileRules() {
    if (state.template === 'text') return {
      summary: ['UTF-8 编码', '最多 20 万字符', `最大 ${formatBytes(maxBytes())}`],
      rules: ['内容为模型生成的原文。Markdown 支持标题、段落、列表、引用、强调、代码、表格与 LaTeX 公式（$…$、$$…$$）；纯文本与 .txt 原样显示，不解析公式。',
        '从聊天界面复制时，请用回答自带的「复制」按钮，才能保留 Markdown 标记；直接选中复制只得到排版后的文字。',
        'HTML 标签、链接和图片按原文字显示；平台用统一版式排版，预览、盲评与截图都用排版后的页面。'],
    };
    return {
      summary: ['单个 <code>.html</code> 文件', `最大 ${formatBytes(maxBytes())}`],
      rules: ['脚本、样式、贴图和模型都写进这一个 HTML（内联或 data: URL）；不接受 ZIP，平台也不执行构建。',
        '使用 <code>three</code> 这类裸模块名时，需在页面里用 <code>&lt;script type="importmap"&gt;</code> 指向下面的 CDN。',
        `<span>作品不能联网，只能引用这些 CDN：</span>${platform.site.cdn.map((host) => `<code>${esc(host)}</code>`).join('、')}。`],
    };
  }

  function stepOne() {
    const taskLabel = options.lead ? '' : `<div class="upload-task"><span>当前题目 · 固定关联</span><a data-i18n-ignore href="${ctx.taskHref(task)}">${esc(task.title)}${icon('arrow')}</a></div>`;
    if (!platform.user) {
      return `<div class="step-body">${taskLabel}<div class="notice">${icon('user')}<p>登录后上传到这道题，并在「个人中心」里跟进审核结果。</p><button class="btn primary sm" data-auth="login">登录 / 注册</button></div></div>`;
    }
    if (needsEmail()) {
      return `<div class="step-body">${taskLabel}<div class="notice">${icon('mail')}<p>账号需要先绑定邮箱，才能上传作品。</p><button class="btn primary sm" data-bind-email>绑定邮箱</button></div></div>`;
    }
    if (state.draft) {
      const d = state.draft;
      return `<div class="step-body">${taskLabel}
        ${state.notice === 'prompt' ? `<div class="notice is-stale" data-sample-notice>${icon('alert')}<p><b>提示词改过了</b>示例结果需要按新的提示词生成。如果这份文件是按旧提示词生成的，请点「重新选择文件」替换；仍然适用的话，在下面重新确认试加载即可。</p></div>` : ''}
        <p class="file-line">${icon('file')}<b data-i18n-ignore>${esc(d.sourceName)}</b><span>${d.files} 个文件 · ${formatBytes(d.bytes)}</span></p>
        <ul class="checks">${d.checks.map(checkRow).join('')}</ul>
      </div>`;
    }
    const { summary, rules } = fileRules();
    const picker = state.uploading
      ? `<div class="upload-progress" data-upload-progress><b data-progress-label>${progressLabel()}</b><button class="btn sm" type="button" data-act="cancel-upload">取消</button>
          <span class="progress"><i style="width:${Math.round(state.progress * 100)}%"></i></span><span data-progress-bytes>${progressBytes()}</span></div>`
      : isText() ? textEntry()
      : `<div class="dropzone" data-drop tabindex="0" role="button" aria-label="选择或拖入作品文件">
          ${icon('upload')}<b>${FILES[state.template].prompt}</b>
          <span class="drop-meta"><span>或点击选择</span>${summary.map((item) => `<span>${item}</span>`).join('')}</span>
          <input type="file" accept="${FILES[state.template].accept}" hidden>
        </div>`;
    return `<div class="step-body">${taskLabel}
      ${templates.length > 1 ? `<label class="field"><span class="field-label">提交格式</span><select class="input" data-template${state.uploading ? ' disabled' : ''}>${templates.map((value) => `<option value="${value}"${value === state.template ? ' selected' : ''}>${TEMPLATE_LABELS[value]}</option>`).join('')}</select></label>` : ''}
      ${options.lead ? '' : promptPeek()}
      ${state.notice?.file ? `<div class="notice is-stale" data-sample-notice>${icon('alert')}<p><b>原来的文件不再适用</b><span>提交格式改为</span> <span>${esc(TEMPLATE_LABELS[state.template])}</span> · <span>已移除文件</span> <span data-i18n-ignore>${esc(state.notice.file)}</span> · <span>请重新选择文件。填过的结果信息会保留。</span></p></div>` : ''}
      ${state.resumable && !state.uploading ? `<div class="notice resume-draft">${icon('clock')}<p><span>你之前上传过</span> <span data-i18n-ignore>${esc(state.resumable.sourceName)}</span> · <span>试加载保留到</span> <span data-i18n-time="${esc(state.resumable.expiresAt)}">${esc(formatTime(state.resumable.expiresAt))}</span></p><button class="btn primary sm" type="button" data-act="resume">继续试加载</button><button class="btn sm" type="button" data-act="drop-draft">丢弃</button></div>` : ''}
      ${pendingFull() ? `<div class="notice">${icon('clock')}<p>你已有 ${platform.me.pending} 件作品在等待核验，核验之后再上传新的作品吧。</p></div>` : picker}
      ${pendingFull() ? '' : '<p class="fine">网络较慢时，上传可能需要较长时间。请保持页面打开；长时间没有进展，可取消后重试。</p>'}
      ${state.error ? `<p class="form-error" role="alert">${esc(state.error)}</p>` : ''}
      ${pendingFull() ? '' : `<details class="fold"><summary>${icon('right')}${isText() ? '全部原文要求' : '全部文件要求'}</summary><ul class="plain">${rules.map((rule) => `<li>${rule}</li>`).join('')}</ul></details>`}
    </div>`;
  }

  const textCount = () => Array.from(state.text).length;
  const textReady = () => Boolean(state.text.trim()) && textCount() <= TEXT_CHARS;
  const textCountLabel = () => `${textCount().toLocaleString()} / ${TEXT_CHARS.toLocaleString()} 字符`;

  // One box for a text result: paste the model's output, or drop a .txt / .md file on it.
  function textEntry() {
    return `<div class="text-entry" data-text-drop>
        <textarea class="input" data-text-input rows="12" spellcheck="false" aria-label="作品原文" placeholder="粘贴模型输出的完整原文，或把 .txt / .md 文件拖到这里">${esc(state.text)}</textarea>
        <div class="text-entry-bar">
          <div class="seg" role="group" aria-label="排版方式">${TEXT_FORMATS.map(([id, label]) => `<button type="button" data-text-format="${id}" aria-pressed="${id === state.textFormat}">${label}</button>`).join('')}</div>
          <span class="text-count${textCount() > TEXT_CHARS ? ' is-over' : ''}" data-text-count>${textCountLabel()}</span>
          <button class="link" type="button" data-act="pick-text-file">${icon('upload')}选择文件</button>
          <button class="btn primary sm" type="button" data-act="send-text"${textReady() ? '' : ' disabled'}>预览排版${icon('right')}</button>
        </div>
        <input type="file" accept="${FILES.text.accept}" hidden>
      </div>`;
  }

  const progressLabel = () => (state.progress < 1 ? `正在上传 ${Math.round(state.progress * 100)}%` : '正在检查文件…');
  const progressBytes = () => (state.total ? `${formatBytes(state.loaded)} / ${formatBytes(state.total)} · 请不要关闭页面` : '请不要关闭页面');

  function promptPeek() {
    const variants = task.promptVariants ?? [];
    const current = variants.find((v) => v.id === state.peek);
    const refs = task.references ?? [];
    return `<details class="prompt-peek"><summary>${icon('guide')}<span>查看本题提示词</span>${variants.length ? ` · ${variants.length} 个版本，任选其一` : ''}${refs.length ? ` · 附 ${refs.length} 张参考图` : ''}</summary>
      ${variants.length ? `<div class="seg" role="group" aria-label="提示词版本">${variants.map((v) => `<button type="button" data-i18n-ignore data-peek="${esc(v.id)}" aria-pressed="${v.id === state.peek}">${esc(v.label)}</button>`).join('')}</div>` : ''}
      ${refs.length ? `<div class="prompt-peek-refs">${referenceSheet(refs, { key: task.id, credit: task.referenceCredit })}<p class="fine">请把这 ${refs.length} 张图按顺序一并提供给模型，作为附件或放进工作区均可。</p></div>` : ''}
      <pre>${linkReferences(current?.prompt ?? task.prompt, refs, task.id)}</pre></details>`;
  }

  const confirmable = () => state.trial.loaded || state.trial.manual;

  function trialChecks() {
    const t = state.trial;
    const rows = [];
    if (t.loaded) rows.push(checkRow({ state: 'ok', label: '页面载入', detail: `${(t.loadMs / 1000).toFixed(1)} 秒内完成载入` }));
    else if (t.timedOut) {
      // The probe can miss a page that works; the author may vouch for it after opening it alone.
      rows.push(checkRow({ state: 'fail', label: '页面载入', detail: '30 秒内没有收到载入信号。在新窗口打开能正常运行就可以继续，否则请检查后重新上传。' }));
      rows.push(`<li><label class="confirm"><input type="checkbox" data-manual${t.manual ? ' checked' : ''}><span>我已在新窗口打开，作品可以正常运行</span></label></li>`);
    } else rows.push(checkRow({ state: 'wait', label: '页面载入', detail: '正在载入…' }));
    if (!t.loaded) {
      rows.push(checkRow({ state: 'wait', label: '脚本与资源', detail: '载入后检查' }));
      return rows.join('');
    }
    rows.push(checkRow(t.errors.length
      ? { state: 'warn', label: '脚本错误', detail: `捕获到 ${t.errors.length} 条：${t.errors[0]}` }
      : { state: 'ok', label: '脚本错误', detail: '没有捕获到错误' }));
    rows.push(checkRow(t.failed.length
      ? { state: 'warn', label: '资源加载', detail: `${t.failed.length} 个文件载入失败：${t.failed[0]}` }
      : { state: 'ok', label: '资源加载', detail: '引用的文件都已载入' }));
    rows.push(checkRow(t.blocked.length
      ? { state: 'warn', label: '外部请求', detail: `拦截了 ${t.blocked.length} 个外部请求：${[...new Set(t.blocked.map((url) => { try { return new URL(url).host; } catch { return url; } }))].slice(0, 3).join('、')}` }
      : { state: 'ok', label: '外部请求', detail: '没有被拦截的外部请求' }));
    if (t.paint) {
      const drawn = t.paint.canvases || t.paint.media || t.paint.words > 20;
      rows.push(checkRow(drawn
        ? { state: 'ok', label: '画面内容', detail: t.paint.canvases ? `检测到 ${t.paint.canvases} 个正在显示的画布` : '页面上有可见内容' }
        : { state: 'warn', label: '画面内容', detail: '页面看起来是空白的，请在上方确认' }));
    } else rows.push(checkRow({ state: 'wait', label: '画面内容', detail: '载入后检查' }));
    return rows.join('');
  }

  const confirmText = () => {
    const t = state.trial;
    const warned = t.errors.length || t.failed.length || t.blocked.length || state.draft?.checks.some((c) => c.state === 'warn');
    return `${isText() ? '我已看过排版后的全文' : '我已亲自操作过作品'}，它与题目相符${warned ? '，也看过了上面的提示' : ''}`;
  };

  function stepTwo() {
    if (!state.draft) return `<p class="step-placeholder">${isText() ? '填入原文后，在这里预览排版。' : '选好文件后，作品会在这里试运行。'}</p>`;
    const view = VIEWS[state.view];
    return `<div class="step-body">
      <div class="trial">
        <div class="trial-bar">
          <div class="seg" role="group" aria-label="试加载尺寸">${Object.entries(VIEWS).map(([id, v]) => `<button data-view="${id}" aria-pressed="${id === state.view}">${icon(id)}${v.label}</button>`).join('')}</div>
          <span class="trial-note">与正式展示相同的沙盒</span>
          <button class="icon-btn" data-act="reload" title="重新载入" aria-label="重新载入">${icon('reload')}</button>
          <a class="icon-btn" href="${esc(state.draft.preview)}" target="_blank" rel="noopener" title="在新窗口打开" aria-label="在新窗口打开">${icon('arrow')}</a>
        </div>
        <div class="trial-stage" data-trial-stage style="--w:${view.width};--h:${view.height}">
          <div class="trial-frame"><iframe src="${esc(state.draft.preview)}" title="试加载" sandbox="${SANDBOX}" allow="fullscreen; autoplay" allowfullscreen referrerpolicy="no-referrer"></iframe></div>
        </div>
      </div>
      <ul class="checks" data-trial-checks>${trialChecks()}</ul>
      <label class="confirm${confirmable() ? '' : ' is-disabled'}"><input type="checkbox" data-confirm${state.confirmed ? ' checked' : ''}${confirmable() ? '' : ' disabled'}>
        <span data-confirm-text>${confirmText()}</span></label>
    </div>`;
  }

  const coverPick = () => `<div class="cover-pick">${state.cover
    ? `<img src="${esc(state.cover)}" alt="封面预览"><button class="link" type="button" data-act="drop-cover">移除</button>`
    : `<button class="btn sm" type="button" data-act="pick-cover">${icon('image')}选择图片</button>`}<input type="file" accept="image/png,image/jpeg,image/webp" hidden data-cover-input></div>`;

  function stepThree() {
    if (!state.confirmed) return '<p class="step-placeholder">确认试加载后填写。</p>';
    const cover = `<div class="field"><span class="field-label">封面图片</span>${coverPick()}
      <p class="field-hint">PNG / JPEG / WebP，不超过 ${formatBytes(platform.site.limits.coverBytes)}。<span>${platform.site.capture ? '不上传时使用平台自动截图。' : '不上传时显示文字封面。'}</span></p></div>`;
    return `<form class="step-body submit-form" novalidate>
      ${workFieldsHtml(ctx, task, null, { extra: cover })}
      <label class="confirm"><input type="checkbox" name="attest" required><span>作品由所选模型按本题提示词生成，人工介入如实填写；我有权提交，并同意 <a href="#/terms" target="_blank" rel="noopener">《使用条款》</a> 与 <a href="#/privacy" target="_blank" rel="noopener">《隐私政策》</a>。</span></label>
      <p class="form-error" role="alert"></p>
      <div class="form-actions"><button class="btn primary" type="submit">${icon('upload')}<span data-submit-label>${options.submitLabel ?? '提交作品'}</span></button><span class="fine">${options.submitNote ?? '核验前可在个人中心修改信息。'}</span></div>
    </form>`;
  }

  function done() {
    if (options.done) return options.done(state.result);
    const w = state.work;
    const stage = workStage(w, ctx.inGallery(w.task, w.id));
    const reason = stage.rejected && w.moderation?.reason ? `<p class="result-reason">${icon('alert')}<span><span>原因：</span><span data-i18n-ignore>${esc(w.moderation.reason)}</span></span></p>` : '';
    const actions = stage.rejected
      ? `<a class="btn primary" href="#/me/works">去我的作品处理${icon('right')}</a><button class="btn" data-act="another">重新上传</button>`
      : stage.live
        ? `<a class="btn primary" href="#/${esc(w.task)}/${esc(w.id)}">在展厅中查看${icon('right')}</a><a class="btn" href="#/me/works">我的作品</a><button class="btn" data-act="another">再上传一件</button>`
        : `<a class="btn primary" href="${esc(w.scene)}" target="_blank" rel="noopener">预览作品${icon('arrow')}</a><a class="btn" href="#/me/works">我的作品</a><button class="btn" data-act="another">再上传一件</button>`;
    return `<section class="submit-done">
      <p class="kicker"><span class="num">已提交</span><span>${stage.kicker}</span></p>
      <h2>${esc(stage.title)}</h2><p>${stage.text}</p>${reason}
      ${stage.rejected ? '' : stageTrack(workStages(), stage.current, { row: true })}
      <div class="actions">${actions}</div>
    </section>`;
  }

  const step = (n, title, note, body, { locked = false, doneStep = false, action = '' } = {}) => `<section class="step${locked ? ' is-locked' : ''}${doneStep ? ' is-done' : ''}" data-step="${n}">
    <header class="step-head"><span class="num">0${n + offset}</span><h2>${title}</h2>${action}${note ? `<p>${note}</p>` : ''}</header>
    ${body}
  </section>`;

  function draw() {
    if (!active || suspended) return;
    const limits = platform.site.limits;
    const page = options.page?.(Boolean(state.result)) ?? { title: '上传作品', section: 'questions', heading: state.result ? '作品已提交' : '带来你的答案',
      description: task.title, descriptionOriginal: true,
      crumbs: [ctx.LIBRARY, { text: task.title, original: true, href: ctx.taskHref(task) }, { text: '上传作品' }] };
    const current = state.result ? -1 : !state.draft ? 0 : state.confirmed ? 2 : 1;
    const steps = [...(options.lead ? [options.lead.label] : []), isText() ? '填入原文' : '选择文件', isText() ? '预览排版' : '试加载', options.infoLabel ?? '作品信息'];
    root.innerHTML = `${ctx.pageStart({ ...page,
      meta: `<ol class="side-steps">${steps.map((label, i) => {
        const text = `<span>0${i + 1}</span>${label}`;
        // The lead step stays reachable from the sidebar until the result is in.
        const link = i === 0 && options.lead?.act && !state.result;
        return `<li${i === current + offset ? ' aria-current="step"' : ''}${!state.result && i < current + offset ? ' class="is-done"' : ''}>${link ? `<button type="button" data-act="${options.lead.act}">${text}</button>` : text}</li>`;
      }).join('')}</ol>` })}
      <section class="block wrap${state.result ? '' : ' submit-layout'}">
        <div class="submit-main">${state.result ? done() : [
          options.lead?.html() ?? '',
          step(1, steps[offset], options.fileNote ?? '', stepOne(), { doneStep: Boolean(state.draft), action: state.draft ? `<button class="link step-action" data-act="restart">${isText() ? '修改原文' : '重新选择文件'}</button>` : '' }),
          step(2, steps[offset + 1], state.draft && !state.confirmed ? isText() ? '请在下面通读一遍' : '请在下面亲自操作一遍' : '', stepTwo(), { locked: !state.draft, doneStep: state.confirmed }),
          step(3, options.infoLabel ?? '作品信息', state.confirmed ? '核验时会对照这些信息' : '', stepThree(), { locked: !state.confirmed }),
        ].join('')}</div>
        ${state.result ? '' : `<aside class="submit-aside">
          <div class="aside-block">
            <h3>提交之后</h3>
            ${stageTrack(options.stages ?? workStages())}
            <p class="fine">${pendingLimit() === null ? '等待核验的作品数量不限。' : `最多 ${pendingLimit()} 件作品同时等待核验。`}</p>
          </div>
        </aside>`}
      </section>
    ${ctx.pageEnd()}`;
    setPageTitle([page.title, task.title ? { text: task.title, original: true } : ctx.DATA.title]);
    fitTrial();
    restoreFields();
  }

  // The info form is rebuilt whenever its step locks or the page redraws; keep what was typed.
  function saveFields() {
    const form = $('.submit-form', root);
    if (form) state.fields = [...form.elements].filter((el) => el.name).map(({ name, value, type, checked }) => ({ name, value, check: type === 'checkbox' || type === 'radio', checked }));
  }
  function restoreFields() {
    const form = $('.submit-form', root);
    if (!form || !state.fields) return;
    for (const el of form.elements) {
      if (!el.name) continue;
      const check = el.type === 'checkbox' || el.type === 'radio';
      const saved = state.fields.find((f) => f.name === el.name && (!check || f.value === el.value));
      if (!saved) continue;
      if (check) el.checked = saved.checked;
      else el.value = saved.value;
    }
    onWorkFieldChange(form, form.elements.modelName);
    if (form.elements.summary?.value || form.elements.note?.value) $('.more-fields', form)?.setAttribute('open', '');
  }

  // The trial frame renders at the real viewport size and is scaled to fit the column.
  let resizeObserver = null;
  function fitTrial() {
    resizeObserver?.disconnect();
    const stage = $('[data-trial-stage]', root);
    if (!stage) return;
    const view = VIEWS[state.view];
    const fit = () => {
      const width = stage.clientWidth;
      const maxHeight = state.view === 'phone' ? Math.min(680, innerHeight * 0.75) : Infinity;
      const scale = Math.min(width / view.width, maxHeight / view.height, 1);
      stage.style.setProperty('--scale', scale);
      stage.style.height = `${Math.round(view.height * scale)}px`;
    };
    resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(stage);
    fit();
  }

  function drawTrial() {
    const list = $('[data-trial-checks]', root);
    if (!list) return;
    list.innerHTML = trialChecks();
    const box = $('[data-confirm]', root);
    if (box) {
      box.disabled = !confirmable();
      if (box.disabled && box.checked) { box.checked = false; setConfirmed(false); }
      box.closest('.confirm').classList.toggle('is-disabled', !confirmable());
      $('[data-confirm-text]', root).textContent = confirmText();
    }
  }

  function startTrial() {
    state.trial = freshTrial();
    clearTimeout(state.timer);
    state.timer = setTimeout(() => { if (!state.trial.loaded) { state.trial.timedOut = true; drawTrial(); } }, TRIAL_TIMEOUT);
  }

  const onMessage = (e) => {
    if (!state.draft || state.trial.settled || e.data?.source !== 'sp-probe' || e.origin !== new URL(state.draft.preview).origin) return;
    const t = state.trial;
    const d = e.data;
    if (d.type === 'boot') t.booted = true;
    else if (d.type === 'load') { t.loaded = true; t.loadMs = d.at; }
    else if (d.type === 'error' || d.type === 'console') t.errors.push(d.where ? `${d.message}（${d.where}）` : d.message);
    else if (d.type === 'resource') t.failed.push(d.url);
    else if (d.type === 'blocked') t.blocked.push(d.url);
    else if (d.type === 'paint') t.paint = { canvases: d.canvases, media: d.media, words: d.words };
    drawTrial();
  };
  addEventListener('message', onMessage);

  function upload(file) {
    if (!file || state.uploading) return;
    if (file.size > maxBytes()) { state.error = `文件超过 ${formatBytes(maxBytes())} 上限`; return draw(); }
    if (!FILES[state.template].pattern.test(file.name)) { state.error = FILES[state.template].error; return draw(); }
    Object.assign(state, { uploading: true, progress: 0, loaded: 0, total: file.size, error: '', notice: null });
    draw();
    const xhr = createUploadRequest(`drafts?task=${encodeURIComponent(draftTask)}&name=${encodeURIComponent(file.name)}&template=${state.template}`);
    state.xhr = xhr;
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      Object.assign(state, { progress: e.loaded / e.total, loaded: e.loaded, total: e.total });
      const bar = $('[data-upload-progress] .progress i', root);
      if (!bar) return;
      bar.style.width = `${Math.round(state.progress * 100)}%`;
      $('[data-progress-label]', root).textContent = progressLabel();
      $('[data-progress-bytes]', root).textContent = progressBytes();
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      state.uploading = false;
      state.xhr = null;
      if (xhr.status === 200 && data.draft) {
        state.draft = resolveApiMedia(data.draft, 'draft');
        state.draftTemplate = state.template;
        startTrial();
      } else {
        state.error = data.error ?? `上传失败（${xhr.status}）`;
      }
      draw();
    };
    xhr.onerror = () => {
      Object.assign(state, { uploading: false, xhr: null, error: '网络连接失败，请重试' });
      draw();
    };
    xhr.onabort = () => {
      Object.assign(state, { uploading: false, xhr: null, error: '' });
      if (active) draw();
    };
    xhr.send(file);
  }

  function sendText() {
    if (textReady()) upload(new File([state.text], `粘贴文本.${state.textFormat}`, { type: 'text/plain' }));
  }

  function discard() {
    if (state.draft && !state.result) api(`drafts/${state.draft.id}`, { method: 'DELETE' }).catch(() => {});
  }

  // keepFields: picking another file for the same result keeps what was filled in about it.
  function restart({ keepFields = false } = {}) {
    discard();
    clearTimeout(state.timer);
    clearTimeout(state.poll);
    if (keepFields) saveFields();
    Object.assign(state, { draft: null, error: '', trial: freshTrial(), confirmed: false, cover: null, work: null, result: null, polls: 0, notice: null,
      ...(keepFields ? {} : { fields: null, text: '' }) });
    draw();
  }

  function setConfirmed(confirmed) {
    state.confirmed = confirmed;
    if (confirmed) {
      state.confirmedPrompt = task.prompt;
      if (state.notice === 'prompt') { state.notice = null; $('[data-sample-notice]', root)?.remove(); }
    } else saveFields();
    const three = $('[data-step="3"]', root);
    three.outerHTML = step(3, options.infoLabel ?? '作品信息', confirmed ? '核验时会对照这些信息' : '', stepThree(), { locked: !confirmed });
    restoreFields();
    $('[data-step="2"]', root).classList.toggle('is-done', confirmed);
    const current = (confirmed ? 2 : 1) + offset;
    $$('.side-steps li', root).forEach((li, i) => {
      if (i === current) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
      li.classList.toggle('is-done', i < current);
    });
    if (confirmed) $('[data-step="3"]', root).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function trialSummary() {
    const t = state.trial;
    return {
      loaded: t.loaded,
      loadMs: t.loadMs,
      errors: t.errors.length,
      errorSamples: t.errors.slice(0, 3),
      failedResources: t.failed.slice(0, 5),
      blocked: t.blocked.slice(0, 5),
      canvases: t.paint?.canvases ?? null,
      media: t.paint?.media ?? null,
      words: t.paint?.words ?? null,
    };
  }

  // Follows a waiting result through GET /api/me and redraws the finished view when it moves.
  function follow() {
    clearTimeout(state.poll);
    if (!active || !state.result || !waiting(state.result) || state.polls >= POLL_LIMIT) return;
    state.poll = setTimeout(async () => {
      state.polls++;
      try {
        const me = await api('me');
        if (!active || !state.result) return;
        const { work, question } = state.result;
        const freshWork = work && me.works?.find((item) => item.id === work.id);
        const freshQuestion = question && me.questions?.find((item) => item.id === question.id);
        const key = (r) => JSON.stringify([r.work?.moderation?.status, r.work?.status, r.question?.moderation?.status]);
        const next = { ...state.result, ...(freshWork ? { work: freshWork } : {}), ...(freshQuestion ? { question: freshQuestion } : {}) };
        if (key(next) !== key(state.result)) {
          // The done page asks the catalog whether the work is in the gallery, so refresh it first.
          await refreshPlatform('upload').catch(() => {});
          if (!active || !state.result) return;
          Object.assign(state, { result: next, work: next.work });
          draw();
        }
      } catch { /* keep trying until the limit */ }
      follow();
    }, POLL_MS);
  }

  async function submit(form) {
    const error = $('.form-error:not(.field-error)', form);
    error.textContent = '';
    const { body, error: problem } = readWorkFields(form, task);
    if (!body) return void (error.textContent = problem);
    if (!form.attest.checked) return void (error.textContent = '请勾选确认生成信息真实');
    const button = $('[type="submit"]', form);
    const label = $('[data-submit-label]', form);
    const idle = label.textContent;
    button.disabled = true;
    label.textContent = '提交中…';
    state.submitting = true;
    try {
      const payload = { ...body, draftId: state.draft.id, confirmed: true, cover: state.cover, trial: trialSummary() };
      const result = options.submit ? await options.submit(payload) : await api('works', { method: 'POST', body: payload });
      Object.assign(state, { result, work: result.work, polls: 0, fields: null });
      clearTimeout(state.timer);
      if (!options.submit) toast(['pending', 'review'].includes(result.work.moderation?.status) ? '作品已提交，正在内容审核' : '作品已提交');
      await refreshPlatform('upload');
      if (!active) return;
      draw();
      scrollTo({ top: 0 });
      follow();
    } catch (e) {
      error.textContent = e.message;
      button.disabled = false;
      label.textContent = idle;
    } finally {
      state.submitting = false;
    }
  }

  // A draft survives leaving the page for its 24-hour lifetime; offer to pick it up again.
  async function findDraft() {
    if (!platform.user) return;
    try {
      const { draft } = await api(`drafts?task=${encodeURIComponent(draftTask)}`);
      if (active && draft && !state.draft && !state.uploading) { state.resumable = draft; draw(); }
    } catch { /* an older API has no draft lookup */ }
  }

  // The page handlers belong to the flow while it is on screen; a resume takes them back.
  function bind() {
    root.onclick = (e) => {
      if (e.target.matches('input[type="file"]')) return;
      const drop = e.target.closest('[data-drop]');
      if (drop && !state.uploading) { $('input[type="file"]', drop).click(); return; }
      const view = e.target.closest('[data-view]');
      if (view && view.dataset.view !== state.view) {
        state.view = view.dataset.view;
        const stage = $('[data-trial-stage]', root);
        stage.style.setProperty('--w', VIEWS[state.view].width);
        stage.style.setProperty('--h', VIEWS[state.view].height);
        $$('[data-view]', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
        fitTrial();
        return;
      }
      const peek = e.target.closest('[data-peek]');
      if (peek) {
        state.peek = peek.dataset.peek;
        $$('[data-peek]', root).forEach((b) => b.setAttribute('aria-pressed', String(b === peek)));
        $('.prompt-peek pre', root).innerHTML = linkReferences(task.promptVariants.find((v) => v.id === state.peek).prompt, task.references, task.id);
        return;
      }
      const format = e.target.closest('[data-text-format]');
      if (format) {
        state.textFormat = format.dataset.textFormat;
        $$('[data-text-format]', root).forEach((b) => b.setAttribute('aria-pressed', String(b === format)));
        return;
      }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'resume') {
        Object.assign(state, { draft: resolveApiMedia(state.resumable, 'draft'), draftTemplate: state.resumable.template ?? state.template, resumable: null, error: '', notice: null });
        startTrial();
        draw();
      } else if (act === 'drop-draft') {
        api(`drafts/${state.resumable.id}`, { method: 'DELETE' }).catch(() => {});
        state.resumable = null;
        draw();
      } else if (act === 'cancel-upload') state.xhr?.abort();
      else if (act === 'restart') restart({ keepFields: true });
      else if (act === 'another') restart();
      else if (act === 'reload') { startTrial(); drawTrial(); const frame = $('.trial iframe', root); frame.src = state.draft.preview; }
      else if (act === 'pick-cover') $('[data-cover-input]', root).click();
      else if (act === 'pick-text-file') $('[data-text-drop] input[type="file"]', root).click();
      else if (act === 'send-text') sendText();
      else if (act === 'drop-cover') { state.cover = null; $('.cover-pick', root).outerHTML = coverPick(); }
      else if (act) options.onAct?.(act);
    };
    root.onkeydown = (e) => {
      const drop = e.target.closest?.('[data-drop]');
      if (drop && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); drop.click(); }
      if (e.target.matches('[data-text-input]') && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendText(); }
    };
    // Typing in the text box updates its count and button without redrawing the box.
    root.oninput = (e) => {
      if (!e.target.matches('[data-text-input]')) return;
      state.text = e.target.value;
      const count = $('[data-text-count]', root);
      count.textContent = textCountLabel();
      count.classList.toggle('is-over', textCount() > TEXT_CHARS);
      $('[data-act="send-text"]', root).disabled = !textReady();
    };
    root.onchange = (e) => {
      if (e.target.matches('[data-template]')) {
        state.template = e.target.value;
        state.error = '';
        return draw();
      }
      if (e.target.matches('.dropzone input[type="file"], [data-text-drop] input[type="file"]')) return upload(e.target.files[0]);
      if (e.target.matches('[data-manual]')) {
        state.trial.manual = e.target.checked;
        return drawTrial();
      }
      if (e.target.matches('[data-confirm]')) return setConfirmed(e.target.checked);
      const form = e.target.closest('.submit-form');
      if (form) onWorkFieldChange(form, e.target);
      if (e.target.matches('[data-cover-input]')) {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > platform.site.limits.coverBytes) return toast(`封面不能超过 ${formatBytes(platform.site.limits.coverBytes)}`);
        const reader = new FileReader();
        reader.onload = () => { if (active) { state.cover = reader.result; $('.cover-pick', root).outerHTML = coverPick(); } };
        reader.readAsDataURL(file);
      }
    };
    root.onsubmit = (e) => {
      if (!e.target.matches('.submit-form')) return;
      e.preventDefault();
      submit(e.target);
    };
  }
  bind();
  const onDrag = (e) => {
    const drop = e.target.closest?.('[data-drop], [data-text-drop]');
    // Dragging selected text into the text box stays an ordinary edit.
    if (!drop || drop.matches('[data-text-drop]') && !e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    drop.classList.toggle('is-over', e.type === 'dragover');
    if (e.type === 'drop') upload(e.dataTransfer.files[0]);
  };
  for (const type of ['dragover', 'dragleave', 'drop']) root.addEventListener(type, onDrag);

  draw();
  findDraft();
  return {
    uploading: () => state.uploading,
    finished: () => Boolean(state.result),
    // What a suspended flow holds, for the page shown instead of it.
    kept: () => (state.draft && !state.result ? { file: state.draft.sourceName, confirmed: state.confirmed,
      filled: Boolean(state.fields?.some((f) => !f.check && f.value.trim())) } : null),
    suspend() {
      saveFields();
      suspended = true;
      state.xhr?.abort();
      resizeObserver?.disconnect();
    },
    // Called after the owner changed the task in place. Returns true when the draft needs another look.
    resume() {
      suspended = false;
      templates = templatesOf(task);
      if (!templates.includes(state.template)) state.template = templates[0];
      if (state.draft && !templates.includes(state.draftTemplate ?? state.template)) {
        const file = state.draft.sourceName;
        discard();
        Object.assign(state, { draft: null, trial: freshTrial(), confirmed: false, notice: { file } });
      } else if (state.draft && state.confirmed && state.confirmedPrompt !== task.prompt) {
        state.confirmed = false;
        state.notice = 'prompt';
        state.fields?.filter((f) => f.check).forEach((f) => { f.checked = false; });
      }
      // A confirmed trial keeps its record while the frame reloads; an unconfirmed one starts over.
      if (state.draft && state.confirmed) state.trial.settled = true;
      else if (state.draft) startTrial();
      bind();
      draw();
      return Boolean(state.notice);
    },
    // Gives up the draft with the flow, when the owner goes on without it.
    drop() {
      discard();
      this.destroy();
    },
    onPlatformChange(reason) {
      // A submit in flight already consumed the draft; redrawing would reload its dead preview.
      if (reason === 'upload' || state.submitting) return;
      if (!platform.user) restart();
      else { draw(); findDraft(); }
    },
    destroy() {
      active = false;
      state.xhr?.abort();
      clearTimeout(state.timer);
      clearTimeout(state.poll);
      resizeObserver?.disconnect();
      removeEventListener('message', onMessage);
      for (const type of ['dragover', 'dragleave', 'drop']) root.removeEventListener(type, onDrag);
      // A suspended flow no longer owns the page handlers.
      if (suspended) return;
      root.onkeydown = null;
      root.oninput = null;
      root.onsubmit = null;
    },
  };
}
