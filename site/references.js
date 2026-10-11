// Reference images given to every model with a question: the sheet shown with the prompt, its
// viewer and zip download, and the editor used when publishing or editing a question.
import { $, esc, formatBytes, icon, pad, versionedMedia } from './ui.js';
import { createUploadRequest } from './platform-api.js';
import { platform, toast } from './platform.js';
import { REFERENCE_TYPES, referenceAdvice, referenceName, referenceNote, referenceStem, zipStore } from './reference-files.js';

// Object URLs of local previews must not get a version query.
const media = (src) => (String(src).startsWith('blob:') ? src : versionedMedia(src));
const caption = (ref, i) => `${pad(i + 1)}${ref.caption ? ` · ${ref.caption}` : ''}`;

// Sheets and file-name mentions name their set by key; one listener serves every page.
const sets = new Map();
let openViewer = null;
export const useReferenceViewer = (open) => { openViewer = open; };

// refs: [{ name, src, thumb?, caption? }]. key also names the zip, so a question passes its ID.
// still: inside a modal dialog, which the viewer cannot cover, the pictures do not open.
export function referenceSheet(refs = [], { key, credit = '', download = true, still = false } = {}) {
  if (!refs.length) return '';
  sets.set(key, { refs, credit, key });
  const tile = (ref, i) => `<img data-i18n-ignore src="${esc(media(ref.thumb ?? ref.src))}" alt="${still ? esc(caption(ref, i)) : ''}" loading="lazy" decoding="async"><span class="ref-no">${pad(i + 1)}${ref.caption ? `<span data-i18n-ignore>${esc(ref.caption)}</span>` : ''}</span>`;
  return `<div class="ref-sheet">
    <div class="ref-sheet-head"><b>参考图</b><span class="ref-count">${refs.length}</span>${download && !still ? `<button class="text-action" type="button" data-ref-key="${esc(key)}" data-ref-download>${icon('download')}<span>全部下载</span></button>` : ''}</div>
    <div class="ref-grid">${refs.map((ref, i) => (still ? `<span class="ref-tile">${tile(ref, i)}</span>`
      : `<button type="button" class="ref-tile" data-ref-key="${esc(key)}" data-ref="${i}" aria-label="查看参考图 ${esc(caption(ref, i))}">${tile(ref, i)}</button>`)).join('')}</div>
    <p class="ref-credit">${credit ? `<span>图片来源：</span><span data-i18n-ignore>${esc(credit)}</span> · ` : ''}<span>按顺序一并提供给模型</span></p></div>`;
}

// The prompt stays verbatim; a file name it writes out opens that picture.
export function linkReferences(text, refs = [], key) {
  const html = esc(text);
  if (!refs.length) return html;
  return html.replace(/references\/([^\s`'"，。；：、）)]+)/g, (match, name) => {
    const i = refs.findIndex((ref) => ref.name === name);
    return i < 0 ? match : `<button type="button" class="ref-mention" data-ref-key="${esc(key)}" data-ref="${i}" title="查看参考图 ${esc(caption(refs[i], i))}">${match}</button>`;
  });
}

function openReference(set, index) {
  openViewer?.(set.refs.map((ref, i) => ({
    src: media(ref.src), thumb: media(ref.thumb ?? ref.src), title: caption(ref, i),
    sub: set.credit ? `图片来源：${set.credit}` : '', credit: set.credit, download: { href: media(ref.src), name: ref.name },
  })), index, null, { strip: true, label: '参考图' });
}

async function downloadAll(button, set) {
  if (button.disabled) return;
  const label = $('span', button);
  button.disabled = true;
  label.textContent = '打包中…';
  try {
    const files = await Promise.all(set.refs.map(async (ref) => {
      const response = await fetch(media(ref.src), { credentials: 'include' });
      if (!response.ok) throw new Error(String(response.status));
      return { name: ref.name, bytes: new Uint8Array(await response.arrayBuffer()) };
    }));
    const url = URL.createObjectURL(zipStore(files));
    const link = Object.assign(document.createElement('a'), { href: url, download: `${set.key}-references.zip` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch {
    toast('打包下载失败，可以在大图里逐张下载');
    openReference(set, 0);
  } finally {
    button.disabled = false;
    label.textContent = '全部下载';
  }
}

// A blob keeps the supplied filename when the image is hosted by the separate API.
export async function downloadReference({ href, name }) {
  try {
    const response = await fetch(href, { credentials: 'include' });
    if (!response.ok) throw new Error(String(response.status));
    const url = URL.createObjectURL(await response.blob());
    const link = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch {
    toast('图片下载失败，请稍后重试');
  }
}

document.addEventListener('click', (e) => {
  const button = e.target.closest('[data-ref-key]');
  const set = button && sets.get(button.dataset.refKey);
  if (!set) return;
  if (button.matches('[data-ref-download]')) downloadAll(button, set);
  else openReference(set, Number(button.dataset.ref));
});

// ---- editor ---------------------------------------------------------------------------
// Older servers report no reference limits and take no images.
export const referencesEnabled = () => Number(platform.site?.limits?.referenceCount) > 0;

const ADVICE = {
  'missing-note': '提示词还没有提到这些参考图，模型可能不知道要用它们。',
  'missing-images': '提示词提到了参考图，但还没有上传图片。',
};

// Each image uploads on its own as soon as it is picked; the question then names them by ID.
// refs: a question's saved images; prompt() reads the prompt being written; insert(text) adds
// the reference section to it.
export function referenceEditor({ refs = [], credit = '', prompt = () => '', insert = null } = {}) {
  let seq = 0, host = null;
  const items = refs.map((ref) => ({ key: ++seq, id: ref.id, stem: referenceStem(ref.name), ext: ref.name.split('.').pop(),
    caption: ref.caption ?? '', preview: media(ref.thumb ?? ref.src), status: 'done', saved: true }));
  const state = { credit };
  const limit = () => Number(platform.site.limits.referenceCount);
  const maxBytes = () => Number(platform.site.limits.referenceBytes) || 5 * 1024 * 1024;
  const value = () => items.map((item, i) => ({ id: item.id, name: referenceName(i, item.stem, item.ext), caption: item.caption.trim() }));

  const card = (item, i) => `<div class="ref-card${item.status === 'uploading' ? ' is-uploading' : ''}${item.status === 'failed' ? ' is-failed' : ''}" data-ref-card="${item.key}">
    <div class="ref-card-media"><img src="${esc(item.preview)}" alt=""><span class="ref-badge">${pad(i + 1)}</span>
      <div class="ref-card-tools"><button type="button" data-ref-act="left" aria-label="前移"${i === 0 ? ' disabled' : ''}>${icon('prev')}</button><button type="button" data-ref-act="right" aria-label="后移"${i === items.length - 1 ? ' disabled' : ''}>${icon('next')}</button><button type="button" data-ref-act="remove" aria-label="移除">${icon('trash')}</button></div>
      ${item.status === 'uploading' ? `<div class="ref-progress" style="--p:${Math.round((item.progress ?? 0) * 100)}%"><span>上传中 ${Math.round((item.progress ?? 0) * 100)}%</span><i></i></div>` : ''}
      ${item.status === 'failed' ? `<div class="ref-failed"><span>${icon('alert')}${esc(item.error)}</span><button class="link" type="button" data-ref-act="retry">重试</button></div>` : ''}</div>
    <div class="ref-card-fields">
      <label class="ref-name"><span>${pad(i + 1)}-</span><input data-ref-stem value="${esc(item.stem)}" maxlength="40" spellcheck="false" aria-label="第 ${i + 1} 张的文件名"><span>.${esc(item.ext)}</span></label>
      <input class="input" data-ref-caption value="${esc(item.caption)}" maxlength="40" placeholder="说明，如 前侧 3/4" aria-label="第 ${i + 1} 张的说明">
    </div></div>`;
  function html() {
    const full = items.length >= limit();
    return `<div class="field ref-editor" data-ref-editor>
      <span class="field-label">参考图<small>选填 · ${items.length} / ${limit()}</small></span>
      <div class="ref-editor-grid">${items.map(card).join('')}
        <button type="button" class="ref-add" data-ref-act="pick"${full ? ' disabled' : ''}>${icon('plus')}<b>${full ? '已达上限' : '添加参考图'}</b><span>${full ? `最多 ${limit()} 张` : `拖入或点击选择<br>PNG / JPEG / WebP<br>每张 ≤ ${formatBytes(maxBytes())}`}</span></button></div>
      <input type="file" accept="${Object.keys(REFERENCE_TYPES).join(',')}" multiple hidden data-ref-input>
      ${items.length ? `<div class="ref-editor-foot"><p class="fine">模型按顺序收到这些图片，作为附件或放进工作区均可。文件名用于下载与题面引用。</p>${insert ? `<button class="btn sm" type="button" data-ref-act="insert">${icon('plus')}插入参考图说明</button>` : ''}</div>` : ''}
      <div data-ref-advice></div>
      ${items.length ? `<label class="field ref-credit-field"><span class="field-label">图片来源<small>公开展示时署名</small></span><input class="input" data-ref-credit maxlength="80" value="${esc(state.credit)}" placeholder="拍摄者、网站或「自行拍摄」"></label>
      <p class="fine">上传即表示你有权公开这些图片；它们和题目一起人工审核，通过后对所有人可见。</p>` : ''}
    </div>`;
  }
  function draw() {
    if (!host) return;
    host.innerHTML = html();
    advise();
  }
  function advise() {
    const box = host && $('[data-ref-advice]', host);
    if (!box) return;
    const text = prompt();
    const kind = text.trim() ? referenceAdvice(text, items.length) : '';
    const message = kind === 'count' ? `提示词里写的张数与已上传的 ${items.length} 张不一致。` : ADVICE[kind];
    box.innerHTML = message ? `<p class="ref-warn">${icon('alert')}<span>${message}</span>${kind !== 'missing-images' && insert ? '<button class="link" type="button" data-ref-act="insert">插入说明</button>' : ''}</p>` : '';
  }
  function paintProgress(item) {
    const bar = host && $(`[data-ref-card="${item.key}"] .ref-progress`, host);
    if (!bar) return;
    const percent = Math.round(item.progress * 100);
    bar.style.setProperty('--p', `${percent}%`);
    $('span', bar).textContent = `上传中 ${percent}%`;
  }
  function upload(item) {
    Object.assign(item, { status: 'uploading', progress: 0, error: '' });
    const xhr = createUploadRequest(`references?name=${encodeURIComponent(item.file.name)}`);
    item.xhr = xhr;
    xhr.setRequestHeader('Content-Type', item.file.type);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) { item.progress = e.loaded / e.total; paintProgress(item); } };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      item.xhr = null;
      if (xhr.status === 200 && data.reference?.id) Object.assign(item, { id: data.reference.id, status: 'done' });
      else Object.assign(item, { status: 'failed', error: data.error ?? `上传失败（${xhr.status}）` });
      draw();
    };
    xhr.onerror = () => { item.xhr = null; Object.assign(item, { status: 'failed', error: '网络连接失败' }); draw(); };
    xhr.send(item.file);
  }
  function add(files) {
    for (const file of files) {
      if (items.length >= limit()) { toast(`最多 ${limit()} 张参考图`); break; }
      const ext = REFERENCE_TYPES[file.type];
      if (!ext) { toast(`「${file.name}」不是 PNG / JPEG / WebP 图片`); continue; }
      if (file.size > maxBytes()) { toast(`「${file.name}」超过 ${formatBytes(maxBytes())}`); continue; }
      const item = { key: ++seq, file, stem: referenceStem(file.name), ext, caption: '', preview: URL.createObjectURL(file) };
      items.push(item);
      upload(item);
    }
    draw();
  }
  function drop(item) {
    item.xhr?.abort();
    if (item.file) URL.revokeObjectURL(item.preview);
  }
  const onClick = (e) => {
    const act = e.target.closest('[data-ref-act]')?.dataset.refAct;
    if (!act) return;
    if (act === 'pick') return $('[data-ref-input]', host).click();
    if (act === 'insert') { insert?.(referenceNote(value())); return advise(); }
    const i = items.findIndex((item) => item.key === Number(e.target.closest('[data-ref-card]')?.dataset.refCard));
    if (i < 0) return;
    if (act === 'remove') drop(items.splice(i, 1)[0]);
    else if (act === 'retry') upload(items[i]);
    else {
      const j = act === 'left' ? i - 1 : i + 1;
      [items[i], items[j]] = [items[j], items[i]];
    }
    draw();
  };
  const onInput = (e) => {
    const item = items.find((x) => x.key === Number(e.target.closest('[data-ref-card]')?.dataset.refCard));
    if (e.target.matches('[data-ref-stem]')) item.stem = e.target.value;
    else if (e.target.matches('[data-ref-caption]')) item.caption = e.target.value;
    else if (e.target.matches('[data-ref-credit]')) state.credit = e.target.value;
  };
  // A name settles to the form the file will carry.
  const onChange = (e) => {
    if (e.target.matches('[data-ref-input]')) { add([...e.target.files]); return; }
    if (e.target.matches('[data-ref-stem]')) e.target.value = referenceStem(e.target.value);
    const item = items.find((x) => x.key === Number(e.target.closest('[data-ref-card]')?.dataset.refCard));
    if (item && e.target.matches('[data-ref-stem]')) item.stem = e.target.value;
  };
  const files = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  const onDrag = (e) => {
    if (!files(e)) return;
    e.preventDefault();
    $('.ref-add', host)?.classList.toggle('is-over', e.type === 'dragover');
    if (e.type === 'drop') add([...e.dataTransfer.files]);
  };
  const events = { click: onClick, input: onInput, change: onChange, dragover: onDrag, dragleave: onDrag, drop: onDrag };
  return {
    html,
    // container: an element the editor draws into; drawn again when the form is.
    mount(container) {
      if (host) Object.entries(events).forEach(([type, fn]) => host.removeEventListener(type, fn));
      host = container;
      Object.entries(events).forEach(([type, fn]) => host.addEventListener(type, fn));
      draw();
    },
    advise,
    value,
    credit: () => (items.length ? state.credit.trim() : ''),
    // Whether the saved images or their names changed.
    changed: () => JSON.stringify(value()) !== JSON.stringify(refs.map((ref) => ({ id: ref.id, name: ref.name, caption: ref.caption ?? '' })))
      || (items.length ? state.credit.trim() : '') !== (refs.length ? credit : ''),
    // A message when the images are not ready to submit.
    blocker: () => (items.some((item) => item.status === 'uploading') ? '参考图还在上传，请稍候'
      : items.some((item) => item.status === 'failed') ? '有参考图上传失败，请重试或移除' : ''),
    destroy() { items.forEach(drop); host = null; },
    previews: () => items.map((item, i) => ({ name: referenceName(i, item.stem, item.ext), src: item.preview, caption: item.caption.trim() })),
  };
}
