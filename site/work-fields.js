// The description of an upload, shared by submission, author editing and admin review.
// Field names follow the API body of POST /api/works and PATCH /api/works/:task/:id.
import { $, $$, byName, esc, icon } from './ui.js';
import { isStaff, platform } from './platform.js';
import './suggest.js';

const GENERATION_MODES = [
  ['single-turn', '一轮（智能体自主迭代也算一轮）'],
  ['multi-turn', '多轮'],
];
const INTERVENTIONS = [
  ['none', '只给了题目提示词，没有改代码'],
  ['prompt-guided', '追加过人工提示，但没有改代码'],
  ['code-edited', '人工改过代码'],
];

// Efforts the site offers on top of the server's list; free text still accepts any other.
export const effortOptions = () => ['Default', ...new Set([...(platform.site.efforts ?? []), 'Ultra', 'Ultracode'])];
// The suggestion list behind a datalist (see suggest.js); the datalist still names registered entries.
const suggest = (list) => `data-suggest="${list}" role="combobox" aria-autocomplete="list" aria-expanded="false" autocomplete="off"`;

const option = (value, text, selected) => `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(text)}</option>`;
let workInputId = 0;

// How many works on the site use each model, harness and effort, and when a model's first
// work arrived (the registry has no release dates). Suggestions put common and new ones first.
function usage(ctx) {
  const count = (map, key) => key && map.set(key, (map.get(key) ?? 0) + 1);
  const models = new Map(), harnesses = new Map(), efforts = new Map(), since = new Map();
  for (const r of ctx.DATA.tasks.flatMap((t) => t.results)) {
    const model = ctx.modelOf(r).name;
    count(models, model);
    const added = Date.parse(r.addedAt);
    if (added && !(since.get(model) <= added)) since.set(model, added);
    count(harnesses, ctx.harnessOf(r)?.name);
    count(efforts, String(r.effort ?? '').trim().toLowerCase());
  }
  return { models, harnesses, efforts, since };
}
const used = (map, key) => ` data-count="${map.get(key) ?? 0}"`;

function modelOptions(ctx, use) {
  return [...ctx.DATA.models].sort((a, b) => byName(a.name, b.name)).map((m) => `<option value="${esc(m.name)}" data-model-id="${esc(m.id)}" data-keys="${esc((m.aliases ?? []).join(' '))}"${used(use.models, m.name)}${use.since.has(m.name) ? ` data-since="${use.since.get(m.name)}"` : ''}>${esc(m.vendor)}</option>`).join('');
}

// A name that matches no registered model is a custom model and carries its own vendor.
const registeredModel = (form, name) => [...$('datalist[data-models]', form).options].find((o) => o.value === name)?.dataset.modelId;
// Its vendor field starts from the vendor its name suggests (see models.js); set by workFieldsHtml.
let guessVendor = () => '';

function harnessOptions(ctx, selected, use) {
  const listed = [...ctx.HARNESSES.values()].filter((h) => h.listed || h.id === selected);
  if (selected && !ctx.HARNESSES.has(selected)) listed.push({ id: selected, name: selected });
  // The data registry orders common tools first; keep that order in every work form.
  return listed.map((h) => `<option value="${esc(h.name)}" data-harness-id="${esc(h.id)}"${used(use.harnesses, h.name)}></option>`).join('')
    + ['Pi', 'OMP', 'Xiaomi MiMo Desktop', 'Xiaomi MiMo Code']
      .filter((name) => !listed.some((h) => h.name === name))
      .map((name) => `<option value="${esc(name)}"${used(use.harnesses, name)}></option>`).join('');
}

const registeredHarness = (form, name) => [...$('datalist[data-harnesses]', form).options].find((o) => o.value === name)?.dataset.harnessId;

function providerOptions(ctx, selected) {
  return [...ctx.PROVIDERS.values()].map((p) => option(p.id, p.name, p.id === selected)).join('');
}

// work is an existing upload when editing; its values prefill the form. Required facts stay
// in view; the optional ones fold away (open when editing a work that already has them).
// extra is appended inside the fold, e.g. the submit page's cover picker.
// expanded keeps optional information visible during admin review.
export function workFieldsHtml(ctx, task, work = null, { extra = '', expanded = false } = {}) {
  // Staff upload mostly standard works by hand, so a new upload starts from the usual answers.
  const w = work ?? (isStaff() ? { provider: 'official', generationMode: 'single-turn', humanIntervention: 'none' } : {});
  const variants = task?.promptVariants ?? [];
  const modelName = ctx.MODELS.get(w.model)?.name ?? w.modelName ?? '';
  const custom = Boolean(modelName) && ![...ctx.DATA.models].some((m) => m.name === modelName);
  guessVendor = (name) => ctx.modelOf({ modelName: name }).vendor;
  const guess = custom && !w.vendor ? guessVendor(modelName) : '';
  const efforts = effortOptions();
  const use = usage(ctx);
  const inputId = ++workInputId;
  const modelList = `work-models-${inputId}`;
  const effortList = `work-efforts-${inputId}`;
  const harnessList = `work-harnesses-${inputId}`;
  const harnessName = ctx.HARNESSES.get(w.harness)?.name ?? w.harnessName ?? w.harness ?? '';
  const provider = ctx.providerOf(w)?.id ?? '';
  const filled = ['summary', 'note'].some((key) => w[key]);
  // A title that is only the default name follows later model and effort edits.
  const autoTitle = Boolean(w.title) && w.title === defaultTitle(modelName, w.effort ?? '');
  return `
    <label class="field"><span class="field-label">作品标题<small>选填</small></span><input class="input" name="title" maxlength="40" placeholder="例如：云山古刹" value="${esc(w.title ?? '')}"${autoTitle ? ` data-auto-title="${esc(w.title)}"` : ''}><span class="field-hint">不填则显示为「模型名称 · 推理档位」。</span></label>
    ${variants.length ? `<label class="field"><span class="field-label">提示词版本<i>*</i></span><select class="input" name="promptVariant" required><option value="">选择生成时用的版本</option>${variants.map((v) => option(v.id, v.label, v.id === w.promptVariant)).join('')}</select><span class="field-hint">展厅会把同一模型的各版本合成一张卡片，可切换对比。</span></label>` : ''}
    <div class="field-row">
      <label class="field"><span class="field-label">模型名称<i>*</i></span><input class="input" name="modelName" required maxlength="60" ${suggest(modelList)} value="${esc(modelName)}" placeholder="选择或填写模型名称"><datalist id="${modelList}" data-models>${modelOptions(ctx, use)}</datalist><span class="field-hint">输入名称或版本号查找，如 56 即 5.6；列表里没有就直接输入新模型名称。</span></label>
      <label class="field"><span class="field-label">推理档位<i>*</i></span><input class="input" name="effort" required maxlength="20" ${suggest(effortList)} value="${esc(w.effort ?? '')}" placeholder="选择或填写档位"><datalist id="${effortList}">${efforts.map((e) => `<option value="${esc(e)}"${used(use.efforts, e.toLowerCase())}>${e === 'Default' ? '默认（Default）' : esc(e)}</option>`).join('')}</datalist><span class="field-hint">可选常用档位，也可直接手填；使用默认设置请填 Default。</span></label>
    </div>
    <label class="field" data-other-model${custom ? '' : ' hidden'}><span class="field-label">模型厂商</span><input class="input" name="vendor" maxlength="40" placeholder="例如 OpenAI、DeepSeek" value="${esc(custom ? w.vendor || guess : '')}" data-guess="${esc(guess)}"><span class="field-hint">这是未登记的自定义模型，填写厂商便于展厅归类；能从名称判断时已预填，可修改，不清楚可留空。</span></label>
    <div class="field-row">
      <label class="field"><span class="field-label">Harness<i>*</i></span><input class="input" name="harnessName" required maxlength="40" ${suggest(harnessList)} value="${esc(harnessName)}" placeholder="选择或填写 Harness"><datalist id="${harnessList}" data-harnesses>${harnessOptions(ctx, w.harness, use)}</datalist><span class="field-hint">选择生成用的工具或环境；列表里没有就直接填写名称。</span></label>
      <label class="field"><span class="field-label">服务商<i>*</i></span><select class="input" name="providerId" required><option value="">选择服务商</option>${providerOptions(ctx, provider)}</select><span class="field-hint">「官方」指模型厂商自己的 API、网页或 App。</span></label>
    </div>
    <div class="field-row">
      <label class="field"><span class="field-label">生成方式<i>*</i></span><select class="input" name="generationMode" required><option value="">请选择</option>${GENERATION_MODES.map(([value, text]) => option(value, text, value === w.generationMode)).join('')}</select></label>
      <label class="field"><span class="field-label">人工介入<i>*</i></span><select class="input" name="humanIntervention" required><option value="">请选择</option>${INTERVENTIONS.map(([value, text]) => option(value, text, value === w.humanIntervention)).join('')}</select></label>
    </div>
    <p class="field-hint">只发了一次题目提示词、也没有改代码的作品会进入盲评；多轮或有人工介入的作品只在展厅展示。</p>
    <details class="more-fields"${expanded || filled ? ' open' : ''}><summary>${icon('right')}补充信息<small>选填 · 简介与补充说明，填了核验更快</small></summary><div class="step-body">
      <label class="field"><span class="field-label">简介</span><textarea class="input" name="summary" maxlength="200" rows="2" placeholder="一两句话介绍作品的看点">${esc(w.summary ?? '')}</textarea></label>
      <label class="field"><span class="field-label">补充说明</span><textarea class="input" name="note" maxlength="1000" rows="3" placeholder="对话轮次、追加了哪些提示、改了哪些代码等。">${esc(w.note ?? '')}</textarea></label>
      ${extra}
    </div></details>`;
}

const defaultTitle = (modelName, effort) => [modelName.trim(), effort.trim()].filter(Boolean).join(' · ').slice(0, 40);

// Shows the "other" inputs that belong to the changed field.
export function onWorkFieldChange(form, target) {
  const title = form.elements.title;
  if (['modelName', 'effort'].includes(target.name) && title?.dataset.autoTitle && title.value === title.dataset.autoTitle) {
    title.value = title.dataset.autoTitle = defaultTitle(form.elements.modelName.value, form.elements.effort.value);
  }
  if (target.name === 'modelName') {
    const name = target.value.trim();
    $('[data-other-model]', form).hidden = !name || Boolean(registeredModel(form, name));
    // Refill only a vendor the uploader has not typed themselves.
    const vendor = form.elements.vendor;
    if (!vendor.value.trim() || vendor.value === vendor.dataset.guess) vendor.value = vendor.dataset.guess = name ? guessVendor(name) : '';
    return;
  }
}

function fail(form, name, message) {
  const input = form.elements[name];
  input?.closest('details')?.setAttribute('open', '');
  input?.setAttribute('aria-invalid', 'true');
  input?.closest('.field')?.insertAdjacentHTML('beforeend', `<p class="form-error field-error">${esc(message)}</p>`);
  input?.focus();
  return { error: message };
}

// Checks the form and returns { body } for the API, or { error } after marking the field.
// Admin saves and negative decisions may keep existing missing selections.
export function readWorkFields(form, task, { requireComplete = true } = {}) {
  $$('.field-error', form).forEach((el) => el.remove());
  $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
  const data = Object.fromEntries(new FormData(form));
  const text = (name) => (data[name] ?? '').trim();
  const modelName = text('modelName');
  const modelId = registeredModel(form, modelName);
  const harnessName = text('harnessName');
  const harnessId = registeredHarness(form, harnessName);
  const title = text('title') || defaultTitle(modelName, text('effort'));
  if (!title) return fail(form, 'modelName', '请填写作品标题，或填写模型名称作为默认标题');
  if (requireComplete && (task?.promptVariants ?? []).length && !data.promptVariant) return fail(form, 'promptVariant', '请选择生成时用的提示词版本');
  if (requireComplete && !modelName) return fail(form, 'modelName', '请选择或填写模型名称');
  if (requireComplete && !text('effort')) return fail(form, 'effort', '请选择或填写推理档位');
  if (requireComplete && !harnessName) return fail(form, 'harnessName', '请选择或填写 Harness');
  if (requireComplete && !['official', 'unofficial'].includes(data.providerId)) return fail(form, 'providerId', '请选择服务商');
  if (requireComplete && !data.generationMode) return fail(form, 'generationMode', '请选择生成方式');
  if (requireComplete && !data.humanIntervention) return fail(form, 'humanIntervention', '请选择人工介入程度');
  return { body: {
    title,
    summary: data.summary ?? '',
    ...(data.promptVariant !== undefined ? { promptVariant: data.promptVariant } : {}),
    ...(modelId ? { modelId } : { modelName, vendor: text('vendor') }),
    effort: text('effort'),
    ...(harnessId ? { harnessId } : harnessName ? { harnessOther: harnessName } : { harnessId: '' }),
    providerId: data.providerId,
    generationMode: data.generationMode,
    humanIntervention: data.humanIntervention,
    note: data.note ?? '',
  } };
}
