import { languageButton, translateText } from './i18n.js';
// Platform layer: session, uploads, reactions and the dialogs they share. The gallery runs
// without it as a static archive; `platform.available` is false when no API answers.
import { $, $$, esc, formatDate, icon } from './ui.js';
import { compatibleBuild, fetchApi, resolveApiMedia, retryRead, setDatapackVersion, staleBuild } from './platform-api.js';
import { loadTurnstile, mountTurnstile } from './turnstile.js';
import { CONTACT } from './legal.js';
import { openAuthDialog } from './auth-dialog.js';
import { sticker, stickerName } from './stickers.js';
import { aiJudged } from './categories.js';

export const platform = {
  available: false,
  mismatch: false,
  stale: false,
  connecting: false,
  connectionError: null,
  serverVersion: null,
  serverDatapack: null,
  user: null,
  site: null,
  works: [],
  questions: [],
  reactions: { counts: {}, mine: {} },
  arena: {},
  arenaModels: [],
  featured: {},
  totals: { votes: 0, voters: 0, entries: 0 },
  me: null,
  qualification: null,
  review: null,
  sessionReady: false,
  sessionConnecting: false,
  sessionError: null,
  activityReady: false,
  activityConnecting: false,
  activityError: null,
};

// Only a standalone host's missing API opts back into the packaged archive.
export function catalogState() {
  if (platform.mismatch) return 'error';
  if (platform.available) return 'ready';
  const base = globalThis.SAME_PROMPT_CONFIG?.apiBaseUrl;
  if (platform.connectionError?.kind === 'missing' && (!base || base === 'api/')) return 'static';
  return platform.connecting || !platform.connectionError ? 'loading' : 'error';
}

const listeners = new Set();
export const onPlatformChange = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const emit = (reason) => listeners.forEach((listener) => listener(reason));

// Older backends still expose a combined bootstrap; keep that fallback in memory only.
export const requestBootstrap = (timeout = 15000) => fetchApi('bootstrap', { cache: 'no-store', signal: AbortSignal.timeout(timeout) });
const requestCatalog = (timeout = 15000) => fetchApi('catalog', { credentials: 'omit', cache: 'no-cache', signal: AbortSignal.timeout(timeout) });
const requestSession = (timeout = 15000) => fetchApi('session', { cache: 'no-store', signal: AbortSignal.timeout(timeout) });
export function requestPlatform() {
  const catalog = requestCatalog();
  const session = sessionConnection ? null : requestSession();
  catalog.catch(() => {});
  session?.catch(() => {});
  return { catalog, session };
}
let frontendBuildInfo = null;
let connection = null;
let sessionConnection = null;
let activityConnection = null;
let legacy = false;
let accountGeneration = 0;
export const accountVersion = () => accountGeneration;
let activityGeneration = 0;
let activityNeedsRefresh = true;
let activityNeeded = false;
let publicWorks = [];
let workAccess = [];
const cooling = (error) => Date.now() < (error?.retryAt ?? 0);
const LEGACY = Symbol('legacy session'), MISMATCH = Symbol('version mismatch');
function clearPrivate() {
  accountGeneration++;
  invalidateActivity();
  platform.me = platform.review = platform.qualification = null;
  platform.reactions = { counts: {}, mine: {} };
  platform.arenaModels = [];
  workAccess = [];
  platform.activityReady = false;
  remembered.clear();
  rememberedReads.clear();
  overlayWorks();
}
function invalidateActivity() {
  activityGeneration++;
  activityNeedsRefresh = true;
  activityConnection = null;
  platform.activityConnecting = false;
  platform.activityError = null;
}
function overlayWorks() {
  const access = new Map(workAccess.map((w) => [`${w.task}/${w.id}`, w]));
  platform.works = publicWorks.map((w) => {
    const own = access.get(`${w.task}/${w.id}`);
    return own ? { ...w, mine: own.mine, ...(own.arena ? { arena: own.arena } : {}) } : { ...w };
  });
}
// `me` carries the vote and quota counters; the level gate and any exam in progress ride beside it.
function acceptMe(data) {
  platform.me = data.me ? { ...data.me, ...(data.questionEligibility ? { questionEligibility: data.questionEligibility } : {}) } : null;
  platform.qualification = data.qualification ?? null;
}
function acceptUser(user) {
  if ((user?.id ?? null) !== (platform.user?.id ?? null) || user?.role !== platform.user?.role || levelOf(user) !== levelOf(platform.user)) clearPrivate();
  platform.user = user ?? null;
}
function connectionFailure(error) {
  return { kind: 'network', message: ['TimeoutError', 'AbortError'].includes(error.name)
    ? '连接超时，请重试。' : '连接失败，请检查网络后重试。', retryAt: Date.now() + 2000 };
}
async function responseData(response) {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const limited = response.status === 429;
    throw { kind: response.status === 404 ? 'missing' : limited ? 'limited' : 'http', status: response.status,
      message: limited ? '访问较频繁，请稍后再试。' : '服务暂时不可用，请稍后重试。',
      retryAt: Date.now() + (limited ? Number(data.retryAfter ?? response.headers.get('Retry-After')) || 30 : 2) * 1000 };
  }
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Invalid platform response');
  return response.json();
}
function acceptCatalog(data, buildInfo) {
  platform.serverVersion = data.serverVersion ?? null;
  platform.serverDatapack = data.datapack ?? null;
  if (!compatibleBuild(buildInfo, data) || !Array.isArray(data.questions) || !Array.isArray(data.works)) {
    platform.available = false;
    platform.mismatch = true;
    return false;
  }
  const catalog = resolveApiMedia(data, 'catalog');
  for (const name of ['site', 'providers', 'domains', 'domainGroups', 'questions']) if (Object.hasOwn(catalog, name)) platform[name] = catalog[name];
  publicWorks = catalog.works.map(({ mine, arena, ...w }) => w);
  overlayWorks();
  Object.assign(platform, { available: true, mismatch: false, stale: staleBuild(buildInfo, data), connectionError: null });
  return true;
}
function acceptActivity(data) {
  const graded = new Set(platform.questions.filter(aiJudged).map((q) => q.id));
  platform.arena = Object.fromEntries(Object.entries(data.arena ?? {}).filter(([id]) => !graded.has(id)));
  platform.arenaModels = data.arenaModels ?? [];
  platform.featured = data.featured ?? {};
  platform.totals = data.totals ?? { votes: 0, voters: 0, entries: 0 };
  platform.reactions = data.reactions ?? { counts: {}, mine: {} };
  if (Object.hasOwn(data, 'review')) platform.review = data.review;
  workAccess = data.workAccess ?? data.works?.map(({ task, id, mine, arena }) => ({ task, id, mine, arena })) ?? [];
  overlayWorks();
  platform.activityReady = true;
  activityNeedsRefresh = false;
  platform.activityError = null;
}
const activityVisible = () => document.visibilityState !== 'hidden';
// The mounted route declares whether it uses these statistics. Catalog and session
// reads stay independent, so authoring/legal pages never download the whole block.
export function setActivityNeeded(needed) {
  activityNeeded = Boolean(needed);
  return ensureActivity();
}
export function ensureActivity() {
  if (!activityNeeded || !activityVisible() || platform.mismatch || legacy) return Promise.resolve(false);
  if (sessionConnection) return sessionConnection.then(() => ensureActivity());
  if (!platform.available || !platform.sessionReady) return Promise.resolve(false);
  if (platform.activityReady && !activityNeedsRefresh && !platform.activityError) return Promise.resolve(true);
  return loadActivity();
}
function loadActivity() {
  if (!activityNeeded || !activityVisible()) return Promise.resolve(false);
  if (activityConnection || cooling(platform.activityError)) return activityConnection ?? Promise.resolve(false);
  const generation = accountGeneration;
  const readGeneration = activityGeneration;
  const current = () => generation === accountGeneration && readGeneration === activityGeneration;
  platform.activityConnecting = true;
  const task = (async () => {
    try {
      const data = await retryRead(async (timeout) => {
        // A retry budget can span a route change or a backgrounded tab.
        if (!activityNeeded || !activityVisible()) throw { kind: 'deferred' };
        return responseData(await fetchApi('activity', { cache: 'no-store', signal: AbortSignal.timeout(timeout) }));
      });
      if (!current()) return false;
      if (!compatibleBuild(frontendBuildInfo, data)) throw new Error('Invalid platform response');
      acceptActivity(data);
      return true;
    } catch (error) {
      if (error.kind === 'deferred') return false;
      if (current()) {
        platform.activityError = error.kind ? error : connectionFailure(error);
        if (recoveryStarted) startPlatformRecovery();
      }
      return false;
    } finally {
      if (activityConnection === task) { activityConnection = null; platform.activityConnecting = false; }
      if (current()) emit('activity');
    }
  })();
  activityConnection = task;
  return task;
}
function loadSession(request, catalogConnection, refreshActivity = false) {
  if (sessionConnection) return sessionConnection;
  platform.sessionConnecting = true;
  const generation = accountGeneration;
  const task = (async () => {
    try {
      const data = await retryRead(async (timeout, tries) => {
        const response = await (tries ? requestSession(timeout) : request);
        if (response.status === 404) {
          await catalogConnection;
          if (legacy && platform.sessionReady) return LEGACY;
        }
        return responseData(response);
      });
      if (data === LEGACY) return true;
      if (generation !== accountGeneration) return false;
      if (!compatibleBuild(frontendBuildInfo, data) || !Object.hasOwn(data, 'user')
        || (data.user !== null && !data.user?.id)) throw new Error('Invalid platform response');
      const identityChanged = (data.user?.id ?? null) !== (platform.user?.id ?? null) || data.user?.role !== platform.user?.role || levelOf(data.user) !== levelOf(platform.user);
      acceptUser(data.user);
      acceptMe(data);
      if (Object.hasOwn(data, 'review')) platform.review = data.review;
      platform.sessionReady = true;
      platform.sessionError = null;
      const resolvedGeneration = accountGeneration;
      emit(identityChanged ? 'identity' : 'session');
      await catalogConnection;
      if (platform.available && !legacy && resolvedGeneration === accountGeneration && (!platform.activityReady || activityNeedsRefresh || refreshActivity)) void loadActivity();
      return true;
    } catch (error) {
      if (generation === accountGeneration) platform.sessionError = error.kind ? error : connectionFailure(error);
      if (recoveryStarted) startPlatformRecovery();
      return false;
    } finally {
      if (sessionConnection === task) { sessionConnection = null; platform.sessionConnecting = false; }
      emit('session-ready');
    }
  })();
  sessionConnection = task;
  return task;
}
export function connectPlatform(buildInfo = frontendBuildInfo, request) {
  if (connection) return connection;
  frontendBuildInfo = buildInfo;
  setDatapackVersion(buildInfo?.datapack);
  platform.connecting = true;
  const requests = request ?? (legacy ? requestBootstrap() : requestPlatform());
  connection = readPlatform(buildInfo, requests.catalog ?? requests, !requests.catalog).finally(() => {
    platform.connecting = false;
    connection = null;
  });
  if (requests.session) void loadSession(requests.session, connection, true);
  return connection;
}
async function readPlatform(buildInfo, request, bootstrap = false) {
  const generation = accountGeneration;
  try {
    const data = await retryRead(async (timeout, tries) => {
      let response = await (tries ? (bootstrap ? requestBootstrap : requestCatalog)(timeout) : request);
      if (!bootstrap && response.status === 404) { legacy = true; bootstrap = true; response = await requestBootstrap(timeout); }
      return response.status === 409 ? MISMATCH : responseData(response);
    });
    if (data === MISMATCH) { platform.available = false; platform.mismatch = true; return false; }
    if (!acceptCatalog(data, buildInfo)) return false;
    if (bootstrap && generation === accountGeneration) {
      const identityChanged = (data.user?.id ?? null) !== (platform.user?.id ?? null) || data.user?.role !== platform.user?.role || levelOf(data.user) !== levelOf(platform.user);
      acceptUser(data.user);
      acceptMe(data);
      platform.review = data.review ?? null;
      platform.sessionReady = true;
      platform.sessionError = null;
      acceptActivity(data);
      if (identityChanged) emit('identity');
    }
    return true;
  } catch (error) {
    platform.connectionError = error.kind ? error : connectionFailure(error);
    return false;
  }
}

export async function refreshPlatform(reason = 'refresh') {
  if (!frontendBuildInfo || platform.mismatch) return false;
  if (platform.available && !platform.connectionError && !legacy && reason === 'reconnect') {
    if (!cooling(platform.sessionError)) await (sessionConnection ?? loadSession(requestSession(), Promise.resolve(true)));
    if (platform.sessionReady && (!platform.activityReady || activityNeedsRefresh || platform.activityError) && !cooling(platform.activityError)) void loadActivity();
    emit(reason);
    return true;
  }
  if (reason !== 'reconnect') invalidateActivity();
  if (cooling(platform.connectionError)) return false;
  // A mutation may finish while an older catalog read is still in flight.
  // Follow that read with a new one so its pre-write snapshot cannot win.
  if (reason !== 'reconnect' && connection) await connection;
  const connected = await connectPlatform();
  emit(reason);
  return connected;
}

let recoveryStarted = false;
let recoveryRetryUsed = false;
// One delayed retry after startup; later retries follow an explicit click or a network/focus event.
export function startPlatformRecovery() {
  recoveryStarted = true;
  if (platform.mismatch || catalogState() === 'static') return;
  if (platform.available && !platform.connectionError && !platform.sessionError && !(activityNeeded && platform.activityError)) return;
  if (recoveryRetryUsed) return;
  recoveryRetryUsed = true;
  setTimeout(() => {
    if (!platform.available || platform.connectionError || platform.sessionError || activityNeeded && platform.activityError) void refreshPlatform('reconnect');
  }, Math.max(2000, (platform.connectionError?.retryAt ?? platform.sessionError?.retryAt ?? platform.activityError?.retryAt ?? 0) - Date.now()));
}

export class ApiError extends Error {
  constructor(status, message, code, retryAfter = 0, data = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const generation = accountGeneration;
  let response;
  try {
    response = await fetchApi(path, {
      method,
      signal,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(0, '网络连接失败，请稍后再试');
  }
  const data = await response.json().catch((error) => {
    if (error.name === 'AbortError') throw error;
    return {};
  });
  if (response.headers.get('X-Datapack-Stale') === '1' && !platform.stale) {
    platform.stale = true;
    emit('stale');
  }
  if (!response.ok) {
    if (response.status === 401 && platform.user && generation === accountGeneration) {
      acceptUser(null);
      sessionConnection = null;
      platform.sessionConnecting = false;
      platform.sessionReady = true;
      platform.sessionError = null;
      emit('identity');
      if (legacy) void refreshPlatform('session').then(() => startPlatformRecovery());
      else void loadActivity();
    }
    throw new ApiError(response.status, data.error ?? `请求失败（${response.status}）`, data.code,
      Number(data.retryAfter ?? response.headers.get('Retry-After')) || 0, data);
  }
  if (['auth/login', 'auth/register', 'auth/logout'].includes(path)) {
    clearPrivate();
    platform.user = data.user ?? null;
    platform.sessionReady = false;
    platform.sessionError = null;
    sessionConnection = null;
    platform.sessionConnecting = false;
    emit('identity');
  }
  const endpoint = path === 'me' || path === 'review' ? path
    : path === 'admin/questions' ? 'questions'
    : path === 'arena/matches' ? 'match'
      : /^arena\/matches\/[^/]+\/vote$/.test(path) ? 'reveal'
      : path === 'works' || /^works\/[^/]+\/[^/]+\/(?:review|moderation(?:\/retry)?)$/.test(path)
        || /^admin\/works\/[^/]+\/[^/]+\/(?:meta|face-settings)$/.test(path) ? 'work' : null;
  return resolveApiMedia(data, endpoint);
}

// The last answer to each read a page makes on arrival, per account: going back to the page draws
// it at once, and the page refreshes it behind the scenes.
const remembered = new Map();
const rememberedReads = new Map();
const memoryKey = (path) => `${platform.user?.id ?? ''} ${path}`;
export const recall = (path) => remembered.get(memoryKey(path));
export function updateRememberedReviewWork(work) {
  const key = memoryKey('review');
  rememberedReads.set(key, (rememberedReads.get(key) ?? 0) + 1);
  const data = remembered.get(key);
  if (!data) return;
  remembered.set(key, { ...data, works: data.works.map((item) => item.task === work.task && item.id === work.id ? { ...item, ...work } : item) });
}
export async function apiRemembered(path, options) {
  const key = memoryKey(path);
  const generation = accountGeneration;
  const read = (rememberedReads.get(key) ?? 0) + 1;
  rememberedReads.set(key, read);
  const data = await api(path, options);
  if (generation === accountGeneration && read === rememberedReads.get(key)) remembered.set(key, data);
  return data;
}

// Check the lightweight session endpoint on return; reload bootstrap only if the account changed.
let sessionCheckedAt = 0;
let sessionChecking = false;
async function checkSession() {
  if (!recoveryStarted || platform.mismatch || sessionChecking || Date.now() - sessionCheckedAt < 5000) return;
  sessionCheckedAt = Date.now();
  sessionChecking = true;
  try {
    if (!platform.available || platform.connectionError || platform.sessionError || activityNeeded && platform.activityError) {
      if (catalogState() !== 'static') await refreshPlatform('reconnect');
      return;
    }
    if (!legacy) await (sessionConnection ?? loadSession(requestSession(), Promise.resolve(true)));
    else {
      const { user } = await api('auth/me');
      if ((user?.id ?? null) !== (platform.user?.id ?? null)) await refreshPlatform('session');
    }
  } catch { /* A network failure does not prove the session changed. */ }
  finally { sessionChecking = false; }
}
window.addEventListener('focus', checkSession);
window.addEventListener('online', checkSession);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void checkSession().then(ensureActivity);
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) void checkSession();
});

// ---- status -------------------------------------------------------------------------------
export const STATUS = {
  // Hints describe the review only: admin lists also show works the gallery does not.
  verified: { label: '已验证', hint: '已通过核验；单轮生成且无人工介入的作品可参与盲评', icon: 'check' },
  unverified: { label: '未验证', hint: '等待管理员核验，暂不参与盲评', icon: 'clock' },
  questioned: { label: '存疑', hint: '核验存疑：仅供参考，不参与互动与盲评', icon: 'alert' },
};
// The tasks a random blind round draws from, handed over by the page that starts it.
export const arenaScope = {
  set(ids) { try { sessionStorage.setItem('arena-scope', JSON.stringify(ids)); } catch { /* private mode */ } },
  get() { try { const ids = JSON.parse(sessionStorage.getItem('arena-scope')); return Array.isArray(ids) ? ids : null; } catch { return null; } },
};
// A work's blind-pool state as the server reports it (owner and admin views carry `arena`).
const ARENA_TEXT = { in_pool: '在盲评池', off: '不进盲评', not_qualified: '不进盲评' };
export const arenaText = (arena) => (ARENA_TEXT[arena?.state] ? `${ARENA_TEXT[arena.state]}${arena.reason ? `（${arena.reason}）` : ''}` : '');
// Admin switches for an upload's two faces; the server records each named face as decided.
export const setFaces = (task, id, faces) => api(`admin/works/${encodeURIComponent(task)}/${encodeURIComponent(id)}/face-settings`, { method: 'POST', body: faces });

export function statusBadge(status, { always = false, reason = '' } = {}) {
  const info = STATUS[status];
  if (!info || (status === 'verified' && !always)) return '';
  return `<span class="status status-${status}" title="${esc(reason || info.hint)}">${icon(info.icon)}${info.label}</span>`;
}
// Content moderation holds works and questions back until they pass; only authors and admins see it.
export const MODERATION = {
  pending: { label: '内容审核中', icon: 'clock', tone: 'unverified' },
  review: { label: '等待人工复核', icon: 'clock', tone: 'unverified' },
  rejected: { label: '内容未通过', icon: 'alert', tone: 'questioned' },
};
export function moderationBadge(moderation, hint = '', labels = {}) {
  const info = MODERATION[moderation?.status];
  return info ? `<span class="status status-${info.tone}" title="${esc(hint)}">${icon(info.icon)}${labels[moderation.status] ?? info.label}</span>` : '';
}
// Admin-facing names for the categories the backend returns: the schema enum plus rule signals.
const RISK_LABELS = { sexual: '色情', violence: '暴力', hate: '仇恨', fraud: '诈骗', gambling: '赌博', 'malicious-ads': '恶意广告', privacy: '隐私',
  'illegal-harm': '违法伤害', 'prompt-injection': '提示词注入', other: '其他', 'signal:injection': '规则命中：提示词注入',
  'signal:password': '规则命中：密码输入框', 'signal:automation': '规则命中：检测自动化浏览器', 'signal:navigation': '规则命中：跳转外部地址',
  'signal:mutable-cdn': '规则命中：可变 CDN', 'signal:unscanned': '规则命中：脚本过大未扫描' };
export const riskLabels = (list = []) => list.map((id) => RISK_LABELS[id] ?? id);
// A rejection nobody decided by hand, and one that came from an injection attempt aimed at the reviewer.
export const autoRejected = (moderation) => moderation?.status === 'rejected' && moderation.source !== 'human';
export const injected = (moderation) => Boolean(moderation?.categories?.includes('prompt-injection'));
// Three tiers: senior admins run the site; moderators review and verify works only, never their own.
export const ROLE_LABELS = { admin: '高级管理员', moderator: '普通管理员', user: '成员' };
// Levels: 0 member, 1 certified member, 2 moderator, 3 senior admin. Older servers send only a role.
export const LEVEL_NAMES = ['成员', '认证成员', '普通管理员', '高级管理员'];
export const levelOf = (user = platform.user) => (!user ? null : Number.isInteger(user.level) ? user.level : user.role === 'admin' ? 3 : user.role === 'moderator' ? 2 : 0);
// "Lv1" in the mono badge, then the name: levels belong to the ink palette, never the red pen.
export const levelBadge = (level, { name = true } = {}) => `<span class="badge level" aria-hidden="true">Lv${level}</span>${name ? `<span class="level-name">${LEVEL_NAMES[level]}</span>` : ''}`;
export const levelText = (level) => `Lv${level} ${LEVEL_NAMES[level]}`;
// What the server lets this account do; an older server without capabilities leaves levels to the role.
export const can = (name, user = platform.user) => Boolean(user && (user.capabilities ? user.capabilities[name] : name === 'canTakeQualificationExam' ? levelOf(user) === 0 : true));
export const isStaff = (user = platform.user) => user?.role === 'admin' || user?.role === 'moderator';
export const isSenior = (user = platform.user) => user?.role === 'admin';
export const canDecide = (w) => platform.sessionReady && (isSenior() || (isStaff() && w.mine === false));
// Staff permissions are separate from public authorship.
export const byStaff = (item) => (item?.author?.role ?? 'admin') !== 'user';
// Packaged items have no personal publisher; uploaded works keep their author's name.
export const bySite = (item) => byStaff(item) && !item?.author?.name;
// Questions are always reviewed by a person, so a pending one waits for a senior admin.
export const QUESTION_LABELS = { pending: '等待人工审核', rejected: '未通过' };
// A reviewer's reason as its author reads it: the 朱批 on a rejected question, with when it was decided.
export const reviewVerdict = (moderation, label = '审核意见') => `<div class="question-verdict"><p class="question-verdict-head">${icon('alert')}${label}${moderation.at ? `<span>· <time data-i18n-date="${esc(moderation.at)}">${esc(formatDate(moderation.at))}</time></span>` : ''}</p><p data-i18n-ignore>${esc(moderation.reason)}</p></div>`;
// Everything waiting on an admin: unverified or held works, and questions under review.
export const reviewCount = () => (platform.review?.unverified ?? 0) + (platform.review?.questions ?? 0) + (platform.review?.content ?? 0);

// ---- toast and dialogs ------------------------------------------------------------------
let toastTimer = 0;
export function toast(message) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

export function openDialog({ title, body, className = '', onClose }) {
  const dialog = document.createElement('dialog');
  dialog.className = `sheet ${className}`;
  dialog.innerHTML = `<div class="sheet-in">
    <header class="sheet-head"><h2>${esc(title)}</h2><div class="sheet-head-tools">${languageButton()}<button class="icon-btn" type="button" data-sheet-close aria-label="关闭">${icon('close')}</button></div></header>
    <div class="sheet-body">${body}</div>
  </div>`;
  document.body.append(dialog);
  const close = () => { if (dialog.open) dialog.close(); };
  dialog.addEventListener('close', () => { dialog.remove(); onClose?.(); });
  dialog.addEventListener('click', (e) => { if (e.target === dialog || e.target.closest('[data-sheet-close]')) close(); });
  dialog.showModal();
  return { el: dialog, close, setTitle: (text) => { $('.sheet-head h2', dialog).textContent = text; } };
}

export function confirmDialog({ title, message, confirm = '确认', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    const sheet = openDialog({
      title,
      className: 'confirm-sheet',
      body: `<p class="sheet-text">${esc(message)}</p><div class="sheet-actions"><button class="btn" type="button" data-sheet-close>取消</button><button class="btn primary${danger ? ' danger' : ''}" type="button" data-confirm>${esc(confirm)}</button></div>`,
      onClose: () => resolve(answer),
    });
    $('[data-confirm]', sheet.el).addEventListener('click', () => { answer = true; sheet.close(); });
  });
}

// ---- accounts -----------------------------------------------------------------------------
// The "send code" button of an email-code form: Turnstile when the API enables it (its token is
// single-use, so it resets after each send) and a 60-second cooldown. request(token) sends the
// code and returns the notice to show. widgetFor() resolves the challenge; by default the form
// mounts its own.
export function codeSender(sheet, form, request, widgetFor = formWidget(sheet, form)) {
  let deadline = 0;
  let timer = null;
  let cooldownMessage = '';
  let lastErrorText = '';
  const send = $('[data-send]', form);
  const errorLine = $('.form-error', form);
  const notice = $('.code-notice', form);
  const tick = () => {
    const countdown = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const wait = countdown >= 60 ? `${Math.floor(countdown / 60)} 分 ${countdown % 60} 秒` : `${countdown} 秒`;
    send.disabled = countdown > 0;
    send.textContent = countdown > 0 ? `${wait}后重发` : '发送验证码';
    if (cooldownMessage && (errorLine.textContent === lastErrorText || errorLine.textContent === translateText(lastErrorText))) {
      lastErrorText = countdown > 0 ? `${cooldownMessage}请在 ${wait}后重试。` : '';
      errorLine.textContent = lastErrorText;
    }
    if (!countdown) { clearInterval(timer); timer = null; }
  };
  const coolDown = (seconds) => {
    clearInterval(timer);
    deadline = Date.now() + seconds * 1000;
    tick();
    timer = setInterval(tick, 1000);
  };
  send.addEventListener('click', async () => {
    if (send.disabled) return;
    send.disabled = true;
    errorLine.textContent = '';
    cooldownMessage = '';
    notice.textContent = '';
    let widget = null;
    try {
      widget = await widgetFor();
      if (!sheet.el.isConnected) return;
      if (widget && !widget.token) { errorLine.textContent = '请先完成人机验证。'; send.disabled = false; return; }
      notice.textContent = `${await request(widget?.token)}没收到请检查垃圾邮件箱。`;
      if (!sheet.el.isConnected) return;
      coolDown(60);
      form.code.focus();
    } catch (error) {
      if (!sheet.el.isConnected) return;
      errorLine.textContent = error.message;
      if (error.status === 429 && Number.isFinite(error.retryAfter) && error.retryAfter > 0) {
        cooldownMessage = error.message;
        lastErrorText = error.message;
        coolDown(error.retryAfter);
      } else send.disabled = false;
    } finally {
      widget?.reset();
    }
  });
  const refreshCountdown = () => { if (timer !== null) tick(); };
  document.addEventListener('visibilitychange', refreshCountdown);
  sheet.el.addEventListener('close', () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', refreshCountdown);
  });
}

function formWidget(sheet, form) {
  let widget = null;
  const challenge = $('.auth-turnstile', form);
  const ready = api('auth/turnstile').then(async ({ siteKey }) => {
    if (!siteKey || !sheet.el.isConnected) return null;
    await loadTurnstile();
    if (!sheet.el.isConnected) return null;
    challenge.hidden = false;
    widget = mountTurnstile(challenge, siteKey, (message) => { $('.auth-turnstile-status', form).textContent = message; });
    return widget;
  });
  ready.catch((error) => { $('.form-error', form).textContent = error.message; });
  sheet.el.addEventListener('close', () => widget?.remove());
  return () => ready;
}

const EMAIL_FIELD = `<label class="field"><span class="field-label">邮箱</span><span class="code-row"><input class="input" name="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="254"><button class="btn" type="button" data-send>发送验证码</button></span></label>`;
const CODE_FIELD = `<label class="field"><span class="field-label">验证码</span><input class="input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 位数字"></label>`;

// Accounts bind an email when they register; this sheet changes it, or binds one for an account
// made before that. Resolves true once the address is bound.
export function openBindEmail({ change = false, reason = '' } = {}) {
  return new Promise((resolve) => {
    let bound = false;
    const sheet = openDialog({
      title: change ? '更换绑定邮箱' : '绑定邮箱',
      className: 'auth-sheet code-sheet',
      onClose: () => resolve(bound),
      body: `<form class="auth-form" novalidate>
        <p class="sheet-text"><span>${esc(reason || (change ? '验证新邮箱后，原邮箱自动解除绑定。' : '邮箱用于找回密码与账号安全验证。'))}</span><span>验证码 10 分钟内有效。</span></p>
        ${EMAIL_FIELD}
        <div class="auth-turnstile" hidden></div>
        <p class="auth-turnstile-status" role="status"></p>
        ${CODE_FIELD}
        <p class="form-error" role="alert"></p>
        <p class="code-notice" role="status"></p>
        <div class="sheet-actions"><button class="btn" type="button" data-sheet-close>取消</button><button class="btn primary" type="submit">${change ? '确认更换' : '确认绑定'}</button></div>
      </form>`,
    });
    const form = $('form', sheet.el);
    const errorLine = $('.form-error', form);
    codeSender(sheet, form, async (token) => {
      const data = await api('auth/email/send', { method: 'POST', body: { purpose: 'bind', email: form.email.value.trim(), turnstileToken: token } });
      return `验证码已发送至 ${data.email}。`;
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submit = $('[type="submit"]', form);
      errorLine.textContent = '';
      submit.disabled = true;
      try {
        const result = await api('auth/email/bind', { method: 'POST', body: { email: form.email.value.trim(), code: form.code.value.trim() } });
        platform.user = { ...platform.user, emailBound: Boolean(result.user.email) };
        bound = true;
        await refreshPlatform('profile');
        sheet.close();
        toast(change ? '绑定邮箱已更换' : '邮箱绑定成功');
      } catch (error) {
        errorLine.textContent = error.message;
        submit.disabled = false;
      }
    });
    setTimeout(() => form.email.focus());
  });
}

// Accounts made before registration required an email have none; the session says so.
export const needsEmail = () => platform.user?.emailBound === false;

// Password recovery in two steps: the emailed code is checked first, then spent on the new
// password. The server answers the same whether or not the account has an email.
function openReset(account = '') {
  return new Promise((resolve) => {
    let done = null;
    let verified = false;
    const sheet = openAuthDialog({
      title: '找回密码',
      className: 'auth-sheet code-sheet',
      onClose: () => resolve(done),
      body: `<form class="auth-form" novalidate>
        <div data-reset-step="1">
          <p class="sheet-text">输入账号，验证码会发到账号绑定的邮箱。没有绑定邮箱的账号，请发邮件至 <a href="mailto:${CONTACT}">${CONTACT}</a> 联系我们。</p>
          <label class="field"><span class="field-label">账号</span><span class="code-row"><input class="input" name="account" autocomplete="username" maxlength="24" value="${esc(account)}"><button class="btn" type="button" data-send>发送验证码</button></span></label>
          <div class="auth-turnstile" hidden></div>
          <p class="auth-turnstile-status" role="status"></p>
          <label class="field"><span class="field-label">验证码</span><input class="input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 位数字"></label>
        </div>
        <div data-reset-step="2" hidden>
          <p class="sheet-text">验证通过，请设置新密码。重置后，所有设备都需要重新登录。</p>
          <label class="field"><span class="field-label">新密码</span><input class="input" name="password" type="password" autocomplete="new-password" maxlength="128" placeholder="至少 8 位"></label>
          <label class="field"><span class="field-label">确认新密码</span><input class="input" name="confirm" type="password" autocomplete="new-password" maxlength="128"></label>
        </div>
        <p class="form-error" role="alert"></p>
        <p class="code-notice" role="status"></p>
        <div class="sheet-actions"><button class="btn" type="button" data-sheet-close>取消</button><button class="btn primary" type="submit">验证，继续</button></div>
      </form>`,
    });
    const form = $('form', sheet.el);
    const errorLine = $('.form-error', form);
    const username = () => form.account.value.trim();
    codeSender(sheet, form, async (token) => {
      if (!username()) throw new Error('请填写账号。');
      await api('auth/email/send', { method: 'POST', body: { purpose: 'reset', username: username(), turnstileToken: token } });
      return '如果该账号绑定了邮箱，验证码已发送到该邮箱。';
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submit = $('[type="submit"]', form);
      errorLine.textContent = '';
      if (verified && form.password.value !== form.confirm.value) { errorLine.textContent = '两次输入的密码不一致。'; return; }
      submit.disabled = true;
      try {
        if (!verified) {
          await api('auth/email/verify', { method: 'POST', body: { purpose: 'reset', username: username(), code: form.code.value.trim() } });
          verified = true;
          $('[data-reset-step="1"]', form).hidden = true;
          $('[data-reset-step="2"]', form).hidden = false;
          $('.code-notice', form).textContent = '';
          submit.textContent = '重置密码';
          form.password.focus();
        } else {
          await api('auth/password/reset', { method: 'POST', body: { username: username(), code: form.code.value.trim(), password: form.password.value } });
          done = username();
          sheet.close();
          toast('密码已重置，请用新密码登录');
        }
      } catch (error) {
        errorLine.textContent = error.message;
      }
      submit.disabled = false;
    });
    setTimeout(() => (account ? form.code : form.account).focus());
  });
}

export function openAuth({ mode = 'login', reason = '' } = {}) {
  return new Promise((resolve) => {
    let user = null;
    let widget = null;
    let widgetTask = null;
    let widgetGeneration = 0;
    const clearWidget = () => {
      widgetGeneration++;
      widget?.remove();
      widget = null;
      widgetTask = null;
    };
    const sheet = openAuthDialog({
      title: mode === 'login' ? '登录' : '注册',
      className: 'auth-sheet auth-entry',
      onClose: () => { clearWidget(); resolve(user); },
      body: `<form id="auth-form" class="auth-form" autocomplete="on" novalidate>
        ${reason ? `<p class="auth-reason">${esc(reason)}</p>` : ''}
        <label class="field" for="auth-username"><span class="field-label">用户名</span><input id="auth-username" class="input" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="24" required></label>
        <div class="field auth-password-field"><label class="field-label" for="auth-password">密码</label><input id="auth-password" class="input" name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" maxlength="128" required><button class="auth-forgot" type="button" data-forgot>忘记密码？</button></div>
        <div data-register hidden>${EMAIL_FIELD}</div>
        <div class="auth-turnstile" hidden></div>
        <p class="auth-turnstile-status" role="status"></p>
        <div data-register hidden>${CODE_FIELD}</div>
        <p class="form-error" role="alert"></p>
        <p class="code-notice" role="status"></p>
        <p class="auth-legal" hidden>注册即表示你已阅读并同意<a href="#/terms" target="_blank" rel="noopener">《使用条款》</a>与<a href="#/privacy" target="_blank" rel="noopener">《隐私政策》</a></p>
        <button class="btn primary full" type="submit"></button>
        <p class="auth-switch"><span></span><button type="button" data-switch></button></p>
      </form>`,
    });
    const form = $('form', sheet.el);
    const challenge = $('.auth-turnstile', form);
    const challengeStatus = $('.auth-turnstile-status', form);
    const prepareWidget = () => {
      const generation = ++widgetGeneration;
      widgetTask = (async () => {
        const { siteKey } = await api('auth/turnstile');
        if (siteKey !== null && (typeof siteKey !== 'string' || !siteKey)) throw new Error('人机验证加载失败，请刷新页面重试。');
        if (generation !== widgetGeneration || !sheet.el.isConnected || !siteKey) return null;
        await loadTurnstile();
        if (generation !== widgetGeneration || !sheet.el.isConnected) return null;
        challenge.hidden = false;
        const mounted = mountTurnstile(challenge, siteKey, (message) => {
          if (generation === widgetGeneration) challengeStatus.textContent = message;
        });
        widget = mounted;
        return mounted;
      })().catch((error) => {
        if (generation === widgetGeneration) widgetTask = null;
        throw error;
      });
      return widgetTask;
    };
    const setMode = (next) => {
      clearWidget();
      challenge.hidden = true;
      challengeStatus.textContent = '';
      mode = next;
      const login = mode === 'login';
      sheet.setTitle(login ? '登录' : '注册');
      form.username.placeholder = login ? '' : '2–24 位中文、字母、数字或下划线';
      form.password.placeholder = login ? '' : '至少 8 位';
      form.password.autocomplete = login ? 'current-password' : 'new-password';
      $('[type="submit"]', form).textContent = login ? '登录' : '注册并登录';
      $('.auth-switch span', form).textContent = login ? '还没有账号？' : '已有账号？';
      $('[data-switch]', form).textContent = login ? '注册' : '登录';
      $('.auth-legal', form).hidden = login;
      $('[data-forgot]', form).hidden = !login;
      $$('[data-register]', form).forEach((el) => { el.hidden = login; });
      form.email.disabled = login;
      form.code.disabled = login;
      $('.form-error', form).textContent = '';
      const generation = widgetGeneration + 1;
      prepareWidget().catch((error) => {
        if (generation === widgetGeneration && sheet.el.isConnected) $('.form-error', form).textContent = error.message;
      });
    };
    setMode(mode);
    // Registration binds the email up front: the challenge guards the code, and the code
    // proves the address when the account is created.
    codeSender(sheet, form, async (token) => {
      const data = await api('auth/email/send', { method: 'POST', body: { purpose: 'register', email: form.email.value.trim(), turnstileToken: token } });
      return `验证码已发送至 ${data.email}。`;
    }, () => widgetTask ?? prepareWidget());
    $('[data-switch]', form).addEventListener('click', () => { setMode(mode === 'login' ? 'register' : 'login'); form.username.focus(); });
    // Recovery opens above the sign-in sheet and hands the account back to it.
    $('[data-forgot]', form).addEventListener('click', async () => {
      const account = await openReset(form.username.value.trim());
      if (!account || !sheet.el.isConnected) return;
      form.username.value = account;
      form.password.value = '';
      $('.form-error', form).textContent = '';
      form.password.focus();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submit = $('[type="submit"]', form);
      const switchButton = $('[data-switch]', form);
      submit.disabled = true;
      switchButton.disabled = true;
      let loginSent = false;
      try {
        const body = { name: form.username.value, password: form.password.value };
        if (mode === 'register') {
          Object.assign(body, { email: form.email.value.trim(), code: form.code.value.trim() });
          if (!body.email) throw new Error('请填写邮箱，注册需要绑定邮箱。');
          if (!body.code) throw new Error('请先发送并填写邮箱验证码。');
        } else {
          const mounted = await (widgetTask ?? prepareWidget());
          if (mounted && !mounted.token) throw new Error('请先完成人机验证。');
          body.turnstileToken = mounted?.token ?? '';
          loginSent = true;
        }
        const result = await api(`auth/${mode}`, { method: 'POST', body });
        user = result.user;
        platform.user = { ...user, emailBound: Boolean(user.email) };
        await refreshPlatform('session');
        sheet.close();
        toast(mode === 'register' ? `账号已创建，欢迎你，${user.nickname || user.name}`
          : needsEmail() ? '欢迎回来。账号还未绑定邮箱，上传和发起题目前需要先绑定' : `欢迎回来，${user.nickname || user.name}`);
      } catch (error) {
        $('.form-error', form).textContent = error.message;
        submit.disabled = false;
        switchButton.disabled = false;
      } finally {
        if (loginSent) widget?.reset();
      }
    });
    setTimeout(() => { if (sheet.el.isConnected) form.username.focus(); });
  });
}

// Uploading, publishing, voting and reactions need an account with a bound email.
export async function requireUser(reason) {
  if (!platform.sessionReady) {
    await sessionConnection;
    if (!platform.sessionReady) { toast('账户暂未连上，请重新连接后再试。'); return null; }
  }
  const user = platform.user ?? await openAuth({ reason });
  if (!user || !needsEmail()) return user;
  return (await openBindEmail({ reason: '账号需要先绑定邮箱，才能上传和发起题目。' })) ? platform.user : null;
}

async function logout() {
  try {
    await api('auth/logout', { method: 'POST' });
    await refreshPlatform('session');
    toast('已退出登录');
  } catch (error) { toast(error.message); }
}

// A library avatar when the server names one it lists; otherwise the name's first letter.
export function avatarFace(id, name) {
  if (id && platform.site?.avatars?.includes(id)) return `<img src="assets/avatars/${esc(id)}.svg" alt="" decoding="async">`;
  return `<span data-i18n-ignore>${esc([...(name || '?')][0].toUpperCase())}</span>`;
}

// Signed-in accounts open their personal center; narrow screens keep a separate navigation menu.
export function accountControl(current = false) {
  if (!platform.sessionReady) {
    if (catalogState() === 'static') return '';
    const waiting = platform.sessionConnecting || !platform.sessionError;
    return `<div class="account" data-account><button type="button" class="account-btn" data-platform-reconnect${waiting || platform.mismatch ? ' disabled' : ''} aria-label="${waiting ? '正在连接账户' : '账户连接暂不可用，重新连接'}">${icon('user')}<span class="account-name">${waiting ? '账户连接中…' : '账户连接中断'}</span></button></div>`;
  }
  const user = platform.user;
  const name = user?.nickname || user?.name;
  if (user) return `<div class="account" data-account${current ? ' data-current' : ''}>
    <a class="account-btn signed-in" href="#/me"${current ? ' aria-current="page"' : ''} aria-label="${esc(name)} · 个人中心"><span class="avatar" aria-hidden="true">${avatarFace(user.avatar, name)}</span><span class="account-name" data-i18n-ignore>${esc(name)}</span></a>
    <button class="icon-btn account-navigation" data-menu aria-haspopup="true" aria-expanded="false" aria-label="打开导航菜单">${icon('menu')}</button>
  </div>`;
  return `<div class="account" data-account>
    <button class="account-btn" data-menu aria-haspopup="true" aria-expanded="false" aria-label="登录与菜单">
      <span class="account-name">账户</span>
      ${icon('menu')}
      ${reviewCount() ? `<span class="dot" aria-hidden="true"></span>` : ''}
    </button>
  </div>`;
}

function menuHtml() {
  const user = platform.user;
  const nav = `<nav class="menu-nav" aria-label="平台">
    <a href="#/questions" role="menuitem">${icon('grid')}题库</a>
    <a href="#/arena" role="menuitem">${icon('blind')}盲评</a>
    <a href="#/leaderboard" role="menuitem">${icon('rank')}排行榜</a>
    <a href="#/new" role="menuitem">${icon('plus')}发起题目</a>
  </nav>`;
  if (!user) {
    return `${nav}<div class="menu-group"><button role="menuitem" data-auth="login">${icon('user')}登录</button><button role="menuitem" data-auth="register">${icon('plus')}注册账号</button></div>`;
  }
  const name = user.nickname || user.name;
  return `${nav}<div class="menu-user"><span class="avatar" aria-hidden="true">${avatarFace(user.avatar, name)}</span><span><b data-i18n-ignore>${esc(name)}</b><small><span class="sr">等级 ${levelOf(user)}</span>${levelBadge(levelOf(user))} · <span>已评 ${platform.me?.votes ?? 0} 组</span></small></span></div>
    <div class="menu-group">
      <a href="#/me" role="menuitem">${icon('user')}个人中心</a>
      ${levelOf(user) === 0 ? `<a href="#/exam" role="menuitem">${icon('check')}资格考试<small class="menu-hint">${platform.qualification ? `进行中 ${platform.qualification.activeAnswered}/${platform.qualification.questionCount}` : '→ Lv1'}</small></a>` : ''}
      ${isStaff(user) ? `<a href="#/review" role="menuitem">${icon('shield')}审核${reviewCount() ? `<span class="count">${reviewCount()}</span>` : ''}</a>` : ''}
      <button role="menuitem" data-logout>${icon('logout')}退出登录</button>
    </div>`;
}

function closeMenus() {
  $$('.menu').forEach((menu) => menu.remove());
  $$('[data-menu][aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}

export function refreshAccountControls() {
  closeMenus();
  $$('[data-account]').forEach((el) => { el.outerHTML = accountControl(el.hasAttribute('data-current')); });
}

// ---- reactions ----------------------------------------------------------------------------
export function reactionBar(key, { locked = false } = {}) {
  if (!platform.available) return '';
  if (!platform.activityReady) return `<p class="fine" role="status">${platform.activityError ? '表情暂未载入 <button class="link" type="button" data-platform-reconnect>重新连接</button>' : '表情加载中…'}</p>`;
  const counts = platform.reactions.counts[key] ?? {};
  const mine = new Set(platform.reactions.mine[key] ?? []);
  const pills = platform.site.emojis.filter((emoji) => counts[emoji]).map((emoji) => {
    const own = mine.has(emoji);
    const name = stickerName(emoji);
    return `<button class="react" type="button" data-react="${emoji}" data-key="${esc(key)}" aria-pressed="${own}" aria-label="${name} ${counts[emoji]}" ${locked ? 'disabled' : ''} title="${locked ? '存疑作品不能再互动' : own ? `撤回「${name}」` : `也贴一个「${name}」`}">${sticker(emoji)}<span class="n">${counts[emoji]}</span></button>`;
  }).join('');
  if (locked && !pills) return '';
  return `<div class="reactions" data-reactions="${esc(key)}" data-locked="${locked ? 1 : 0}">${pills}${locked ? '' : `<button class="react-add" type="button" data-react-add data-key="${esc(key)}" aria-label="贴表情" title="贴表情">${icon('smile')}</button>`}</div>`;
}

function redrawReactions(key) {
  $$('[data-reactions]').filter((el) => el.dataset.reactions === key).forEach((el) => {
    el.outerHTML = reactionBar(key, { locked: el.dataset.locked === '1' }) || '<div class="reactions" hidden></div>';
  });
}

async function toggleReaction(key, emoji) {
  if (!(await requireUser('登录后就可以给作品贴表情'))) return;
  const [task, ...rest] = key.split('/');
  try {
    const result = await api(`works/${encodeURIComponent(task)}/${encodeURIComponent(rest.join('/'))}/reactions`, { method: 'POST', body: { emoji } });
    const added = result.mine.includes(emoji) && !(platform.reactions.mine[key] ?? []).includes(emoji);
    platform.reactions.counts[key] = result.counts;
    platform.reactions.mine[key] = result.mine;
    redrawReactions(key);
    if (added) celebrate(key, emoji);
  } catch (error) {
    toast(error.message);
  }
}

// A fresh reaction pops in its pill, plays once, and a larger copy floats up from it.
function celebrate(key, emoji) {
  const pill = $$(`[data-reactions] [data-react="${CSS.escape(emoji)}"]`).find((el) => el.dataset.key === key && el.offsetParent);
  if (!pill) return;
  pill.classList.add('bump');
  pill.querySelector('.stk')?.classList.add('on');
  setTimeout(() => { pill.classList.remove('bump'); pill.querySelector('.stk')?.classList.remove('on'); }, 1600);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = pill.getBoundingClientRect();
  const fly = document.createElement('div');
  fly.className = 'react-fly';
  fly.innerHTML = sticker(emoji, { on: true });
  fly.style.left = `${box.left + 16}px`;
  fly.style.top = `${box.top + box.height / 2}px`;
  document.body.append(fly);
  fly.addEventListener('animationend', (e) => { if (e.target === fly) fly.remove(); });
}

function openPicker(button) {
  closeMenus();
  const key = button.dataset.key;
  const mine = new Set(platform.reactions.mine[key] ?? []);
  const picker = document.createElement('div');
  picker.className = 'menu react-picker';
  picker.setAttribute('role', 'menu');
  picker.innerHTML = platform.site.emojis.map((emoji) => `<button type="button" role="menuitem" data-react="${emoji}" data-key="${esc(key)}" aria-pressed="${mine.has(emoji)}" aria-label="${stickerName(emoji)}" title="${stickerName(emoji)}">${sticker(emoji)}</button>`).join('');
  document.body.append(picker);
  const box = button.getBoundingClientRect();
  const width = picker.offsetWidth;
  picker.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, box.left + box.width / 2 - width / 2))}px`;
  picker.style.top = `${box.top > picker.offsetHeight + 16 ? box.top - picker.offsetHeight - 8 + scrollY : box.bottom + 8 + scrollY}px`;
  button.setAttribute('aria-expanded', 'true');
  picker.querySelector('button')?.focus({ preventScroll: true });
}

document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-menu]');
  if (trigger) {
    const open = trigger.getAttribute('aria-expanded') === 'true';
    closeMenus();
    if (open) return;
    const menu = document.createElement('div');
    menu.className = 'menu account-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = menuHtml();
    trigger.closest('[data-account]').append(menu);
    trigger.setAttribute('aria-expanded', 'true');
    return;
  }
  const auth = e.target.closest('[data-auth]');
  if (auth) { closeMenus(); openAuth({ mode: auth.dataset.auth }); return; }
  if (e.target.closest('[data-bind-email]')) { closeMenus(); openBindEmail(); return; }
  // Signed out, the personal center has nothing to show yet: sign in first, then open it.
  if (!platform.user && platform.available && e.target.closest('a[href="#/me"]')) {
    e.preventDefault();
    closeMenus();
    openAuth({ reason: '登录后查看你发起的题目与上传的作品。' }).then((user) => { if (user) location.hash = '#/me'; });
    return;
  }
  if (e.target.closest('[data-logout]')) { closeMenus(); logout(); return; }
  const add = e.target.closest('[data-react-add]');
  if (add) { openPicker(add); return; }
  const react = e.target.closest('[data-react]');
  if (react && !react.disabled) { closeMenus(); toggleReaction(react.dataset.key, react.dataset.react); return; }
  if (!e.target.closest('.menu')) closeMenus();
  else if (e.target.closest('.menu a')) closeMenus();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('.menu')) { closeMenus(); e.stopPropagation(); } }, true);
addEventListener('hashchange', closeMenus);
