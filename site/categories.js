import { translateText } from './i18n.js';
// Questions sit on two axes. The category is the kind of work asked for (writing, reasoning, design, 3D):
// it groups the library and the leaderboard, decides which submission formats a question accepts and
// how its works are judged. Stored names stay as they are, so links and votes keep working; `label` is
// what readers see. `judging: 'ai'` keeps a category out of blind comparison and the leaderboard; its
// works will carry an AI grade (see aiScoreOf) once grading opens.
// Domains say what a question is about (数学, 化学, 建筑…): one or two per question, for browsing only.
export const CATEGORIES = [
  { name: '文学', label: '写作', note: '故事、诗歌、文案与改写', slug: 'text', glyph: 'text', templates: ['text'], judging: 'vote' },
  { name: '推理', label: '推理', note: '数学、逻辑与哲学 · AI 评分', slug: 'reasoning', glyph: 'reason', templates: ['text'], judging: 'ai' },
  { name: '静态网页', label: '设计', note: '页面布局、交互与可视化', slug: 'page', glyph: 'desktop', templates: ['static'], judging: 'vote' },
  { name: '建模', label: '三维', note: '三维场景、模型与模拟', slug: 'model', glyph: 'cube', templates: ['static'], judging: 'vote' },
];
export const TEMPLATE_LABELS = { text: '纯文本 / Markdown', static: '单个 HTML 文件' };
// The backend may send its own list in bootstrap (`domains`); this one stands in without it.
export const DOMAIN_GROUPS = [
  { title: '理工与健康', domains: ['数学', '物理', '化学', '生物', '天文', '计算机技术', '工程技术', '医学健康', '地理环境'] },
  { title: '人文与社会', domains: ['文学艺术', '哲学', '历史文化', '教育学习', '经济金融', '商业管理', '法律政务', '社会生活'] },
  { title: '空间与产品', domains: ['建筑', '自然景观', '交通与机械', '产品与品牌'] },
  { title: '生活与娱乐', domains: ['游戏娱乐', '生活服务', '餐饮美食', '旅游出行', '运动体育'] },
];
export const DOMAINS = DOMAIN_GROUPS.flatMap((group) => group.domains);
export const MAX_DOMAINS = 2;

export const categoryOf = (name) => CATEGORIES.find((c) => c.name === name) ?? null;
export const categoryLabel = (name) => categoryOf(name)?.label ?? name ?? '';
// Unknown categories are judged by vote, as every category was before AI grading.
export const aiJudged = (task) => categoryOf(task?.category)?.judging === 'ai';
export const votedTask = (task) => !aiJudged(task);
// Reserved for AI grading: { score, max, judge, rationale } on a work, null until a grade arrives.
export function aiScoreOf(work) {
  const grade = work?.aiScore;
  if (!grade || !Number.isFinite(grade.score) || !(grade.max > 0)) return null;
  return { score: grade.score, max: grade.max, judge: grade.judge ?? '', rationale: grade.rationale ?? '' };
}
// Questions that predate formats take their category's; the category itself is never a tag.
// Pages arrive as one HTML file only: questions stored with the retired ZIP format `vite` take `static`.
export const templatesOf = (task) => [...new Set((task.templates?.length ? task.templates : categoryOf(task.category)?.templates ?? ['static'])
  .map((type) => (type === 'vite' ? 'static' : type)))];
export const domainsOf = (task) => task.domains ?? [];
export const domainList = (platform) => (platform?.domains?.length ? platform.domains : DOMAINS);
// Groups organize the picker only; the API's list remains authoritative for allowed values.
export function domainGroups(platform) {
  const list = domainList(platform);
  const groups = (platform?.domainGroups ?? DOMAIN_GROUPS)
    .map((group) => ({ ...group, domains: group.domains.filter((name) => list.includes(name)) }))
    .filter((group) => group.domains.length);
  const listed = groups.flatMap((group) => group.domains);
  const other = list.filter((name) => !listed.includes(name));
  return other.length ? [...groups, { title: '其他领域', domains: other }] : groups;
}
// Questions carry no tags of their own: a search looks through their words and every version of
// the prompt, where a stack such as Three.js is already named. Each space-separated word must appear.
// Letters fold to lower case and spaces, dots, hyphens and underscores drop out, so threejs finds
// Three.js; `at` maps each folded character back to the original for the snippet.
function fold(text) {
  let folded = '';
  const at = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i].toLowerCase();
    if (/[\s.\-_]/.test(char)) continue;
    folded += char;
    for (let n = 0; n < char.length; n++) at.push(i);
  }
  return { folded, at };
}
const SNIPPET = { before: 18, after: 36 };

// Null when a word is missing. Otherwise `inPrompt` says some word was found only in a prompt, with
// the stretch of prompt around the first such word.
export function searchMatch(task, query) {
  const words = query.split(/\s+/).map((word) => fold(word).folded).filter(Boolean);
  if (!words.length) return { inPrompt: false };
  // The separator survives folding, so a word cannot run from the title into the summary.
  const own = fold([task.title, task.summary, categoryLabel(task.category), translateText(categoryLabel(task.category)), ...domainsOf(task), ...domainsOf(task).map(translateText)].join('|')).folded;
  const prompts = [task.prompt ?? '', ...(task.promptVariants ?? []).map((variant) => variant.prompt ?? '')]
    .filter(Boolean).map((text) => ({ text, ...fold(text) }));
  const promptOnly = words.filter((word) => !own.includes(word));
  if (promptOnly.some((word) => !prompts.some(({ folded }) => folded.includes(word)))) return null;
  if (!promptOnly.length) return { inPrompt: false };
  const word = promptOnly[0];
  const { text, folded, at } = prompts.find((prompt) => prompt.folded.includes(word));
  const index = folded.indexOf(word);
  const start = at[index], end = at[index + word.length - 1] + 1;
  const from = Math.max(0, start - SNIPPET.before), to = Math.min(text.length, end + SNIPPET.after);
  const flat = (part) => part.replace(/\s+/g, ' ');
  return { inPrompt: true, snippet: { before: `${from > 0 ? '…' : ''}${flat(text.slice(from, start))}`, hit: flat(text.slice(start, end)), after: `${flat(text.slice(end, to))}${to < text.length ? '…' : ''}` } };
}
export const matchesQuery = (task, query) => searchMatch(task, query) !== null;

// Categories present in the data, known ones first; an unknown category still gets a view.
export function tracksOf(tasks) {
  const present = [...new Set(tasks.map((t) => t.category).filter(Boolean))];
  const known = CATEGORIES.filter(({ name }) => present.includes(name)).map(({ name, label, slug, glyph }) => ({ name, label, slug, glyph }));
  const other = present.filter((name) => !categoryOf(name)).map((name) => ({ name, label: name, slug: name, glyph: 'grid' }));
  return [...known, ...other].map((track) => ({ ...track, tasks: tasks.filter((t) => t.category === track.name) }));
}

// Domains present in the data, in the list's order; ones off the list follow.
export function domainsIn(tasks, list = DOMAINS) {
  const present = new Set(tasks.flatMap(domainsOf));
  return [...list.filter((d) => present.has(d)), ...[...present].filter((d) => !list.includes(d))]
    .map((name) => ({ name, tasks: tasks.filter((t) => domainsOf(t).includes(name)) }));
}
