import { setPageTitle } from './i18n.js';
// Leaderboard: the full page (#/leaderboard[/<category>|/<task>][/<domain>], or #/leaderboard/<domain>)
// and the panel on each task page.
import { $, brandMark, esc, formatDate, formatTime, icon, pad, store, vendorLine } from './ui.js';
import { apiRemembered, arenaScope, levelOf, platform, recall } from './platform.js';
import { curatedInfo, curatedKnown } from './curated.js';
import { domainsIn, domainList, domainsOf, tracksOf, votedTask } from './categories.js';
import { textMatches } from './match.js';

const UNITS = { config: '按配置', model: '按模型' };
// A domain board below either line is shown, but flagged as too thin to rank on.
const THIN = { tasks: 2, votes: 50 };
const MIN_WORKS = 5;

export function visibleBoardEntries(data, showSmallSamples = false) {
  const visible = (row) => showSmallSamples || row.works >= MIN_WORKS;
  return { rows: data.rows.filter(visible), unranked: data.unranked.filter(visible) };
}

export function watchBoardRefresh(reload) {
  let pending = false, stopped = false, timer, nextAt;
  const schedule = (data) => {
    if (stopped) return;
    const next = Date.parse(data?.nextUpdateAt);
    nextAt = Number.isFinite(next) ? Math.max(Date.now() + 1000, next) : Date.now() + 10 * 60_000;
    clearTimeout(timer);
    timer = setTimeout(refresh, nextAt - Date.now());
  };
  const refresh = async () => {
    if (stopped || document.visibilityState === 'hidden' || pending || Date.now() < nextAt) return;
    pending = true;
    try { schedule(await reload()); } catch { schedule(); } finally { pending = false; }
  };
  schedule();
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('online', refresh);
  return { refresh, update: schedule, destroy() {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', refresh);
    window.removeEventListener('focus', refresh);
    window.removeEventListener('online', refresh);
  } };
}
export function boardTaskOptions(tasks, selected, activityReady, arena) {
  return `<option value="">全部题目（${tasks.length}）</option>${tasks.map((t) => {
    const ready = (arena[t.id]?.entries ?? 0) >= 2;
    const note = !activityReady ? '（统计加载中）' : ready ? `（${arena[t.id].works}）` : '（作品不足）';
    return `<option data-i18n-ignore data-i18n-option-original="${esc(t.title)}" data-i18n-option-suffix="${esc(note)}" value="${esc(t.id)}"${t.id === selected ? ' selected' : ''}${!activityReady || ready || t.id === selected ? '' : ' disabled'}>${esc(t.title)}${note}</option>`;
  }).join('')}`;
}
// curated: { since, threshold } when the page shows a curated board, else null.
export const boardNotes = (open = false, curated = null) => `<details class="board-notes"${open ? ' open' : ''}>
  <summary>计分方法${icon('next')}</summary>
  <dl>
    <div><dt>比较</dt><dd>盲评每次展示同一道题的两件作品，左右随机、身份隐藏，投票之后才揭晓模型。</dd></div>
    <div><dt>计分</dt><dd>Bradley–Terry 模型根据全部有效比较，估计每个配置被偏好的强度，「不分伯仲」计为双方各得半场。分数折算到 Elo 刻度：1000 为平均水平，高出 400 分约等于被偏好的机会高十倍。结果与投票先后顺序无关。</dd></div>
    <div><dt>区间</dt><dd>分数后的 ± 与横条表示约 95% 的不确定范围，横条颜色越接近朱红，在本榜的位置越高；比较少于 ${platform.site?.limits.provisionalGames ?? 30} 次的配置标为「暂定」。</dd></div>
    ${curated ? `<div><dt>范围</dt><dd>精选总榜合并全部精选题，各分区只合并本分区的题，各自重新计算，不截取总榜。只计同题比较，不平均各题分数。题目加入、移出或换分区后，下一次计算（10 分钟内）生效。</dd></div>
    <div><dt>计入</dt><dd>${curated.since ? `只统计 ${formatDate(curated.since)} 之后、投票当时为 Lv1 及以上的成员的选择` : '只统计投票当时为 Lv1 及以上的成员的选择'}；Lv0 和访客的选择只进大众榜。同一用户对同一对作品只计一次，跳过不计。同一配置（按模型时为同一模型）的两件作品之间的比较不参与计分，也不计入有效比较数。作品被标记存疑或删除后，相关投票自动移出，恢复后重新计入。</dd></div>
    <div><dt>入榜</dt><dd>模型在本榜范围内有效比较满 ${curated.threshold} 次才入榜（总榜和每个分区分别判断，不借用大众榜的比较数）；按配置沿用模型资格。</dd></div>
    <div><dt>与大众榜</dt><dd>两张榜用的是同一批盲评，计票范围不同。Lv1+ 在精选题上的一票同时计入两张榜。</dd></div>` : `<div><dt>范围</dt><dd>「综合」合并全部题目的比较；各类型（文本 / 设计 / 三维）只统计该类题目，选择具体题目时只统计这道题。比较本身始终发生在同一道题之内。票数多的类型对综合影响更大，所以综合榜在厂商之后列出各类型名次。</dd></div>
    <div><dt>领域</dt><dd>选择领域时只统计属于该领域的题目，可以和类型叠加；一道题属于两个领域时，它的比较在两边都完整计入。领域内少于 ${THIN.tasks} 道题有比较、或有效比较少于 ${THIN.votes} 次时标为「样本不足」，名次仅供参考。</dd></div>
    <div><dt>计入</dt><dd>统计全部计票的选择，包括 Lv0 成员、未绑定邮箱的账号和未登录的访客（访客按浏览器区分）；同一用户对同一对作品只计一次，跳过不计。同一配置（按模型时为同一模型）的两件作品之间的比较不参与计分，也不计入有效比较数。作品被标记存疑或删除后，相关投票自动移出，恢复后重新计入。</dd></div>`}
    <div><dt>单位</dt><dd>「按配置」把同一模型的不同推理档位分开计分；「按模型」把它们合并。</dd></div>
    <div><dt>显示</dt><dd>默认隐藏当前榜单作品少于 5 件的条目，可勾选显示。评分和名次保留，「暂定」仍按比较次数标记。</dd></div>
    <div><dt>来源筛选</dt><dd>按 Harness 或服务商筛选时，只统计两件作品在投票当时都满足条件的比较；计分单位不变。服务商分为官方、非官方，未填写的为「未注明」；只填了「其他」的 Harness 和未记录来源的较早投票按「未注明」统计。</dd></div>
    <div><dt>不计分</dt><dd>表情互动与浏览次数都不影响榜单。</dd></div>
    <div><dt>更新</dt><dd>每 10 分钟计算一次，新投票将在下一次更新时计入。</dd></div>
  </dl>
</details>`;

// Each interval shows its own stretch of one grey-to-ink ramp spanning the axis; vermilion is kept
// for the top three places.
const tone = (at) => `color-mix(in srgb, var(--ink) ${Math.round(at)}%, var(--line-2))`;

export function mountBoard(container, ctx) {
  let unit = store.get('board-unit') === 'model' ? 'model' : 'config';
  let showSmallSamples = store.get('board-show-small-samples') === 'true';
  let currentData = null;
  let controller = null;
  let destroyed = false;
  let query = '';
  let text = '';
  // Provenance filters live on the full page only: the embedded board also drives the task page's score sort.
  const filters = { harness: '', provider: '' };
  const filterable = !ctx.embedded;
  const filterActive = () => Boolean(filters.harness || filters.provider);

  const modelOf = (row) => ctx.modelOf({ model: row.model, modelName: row.modelName, vendor: row.vendor });
  const filterSelect = (field, label, registry) => `<label class="result-sort">${label}<select data-board-filter="${field}" aria-label="按${label}筛选榜单">
    <option value="">全部${/^[A-Za-z]/.test(label) ? ' ' : ''}${label}</option><option value="unset"${filters[field] === 'unset' ? ' selected' : ''}>未注明</option>
    ${[...(registry?.values() ?? [])].filter((entry) => entry.listed || entry.id === filters[field])
      .map((entry) => `<option${field === 'provider' ? '' : ' data-i18n-ignore'} value="${esc(entry.id)}"${entry.id === filters[field] ? ' selected' : ''}>${esc(entry.name)}</option>`).join('')}
  </select></label>`;
  const standingsOf = (data, row) => (ctx.tracks ?? [])
    .filter((track) => data.standings?.[track.name]?.[row.key])
    .map((track) => `<span data-board-standing>${esc(`${track.label}第 ${data.standings[track.name][row.key]}`)}</span>`);

  // A curated board fills from nothing, so its empty states say where it stands and where to go next.
  function curatedEmpty(data) {
    const taskIds = data.scope?.taskIds ?? [];
    const votes = data.totals?.votes ?? 0;
    const since = data.scope?.countingStartedAt ?? ctx.info?.countingStartedAt;
    const level = levelOf();
    const go = level >= 1 ? '<button class="btn primary sm" type="button" data-curated-arena>去盲评精选题</button><a class="btn sm" href="#/leaderboard">查看大众榜</a>'
      : level === 0 ? '<a class="btn primary sm" href="#/exam">参加资格考试</a><a class="btn sm" href="#/arena">去盲评（计入大众榜）</a>'
        : '<button class="btn primary sm" type="button" data-auth="login">登录</button><a class="btn sm" href="#/leaderboard">查看大众榜</a>';
    if (!taskIds.length) {
      return ctx.sectionId
        ? '<div class="board-empty"><p class="board-empty-title">这个分区还没有题目</p><p>管理员把题目放进这个分区后才开始计票。</p><div class="board-empty-actions"><a class="btn sm" href="#/leaderboard/curated">查看精选总榜</a></div></div>'
        : '<div class="board-empty"><p class="board-empty-title">还没有精选题目</p><p>管理员挑选题目后，精选榜才开始计票。</p><div class="board-empty-actions"><a class="btn sm" href="#/leaderboard">查看大众榜</a></div></div>';
    }
    const counts = `${taskIds.length} 道精选题 · ${votes} 次有效比较${since ? ` · ${formatDate(since)} 起` : ''}`;
    return votes
      ? `<div class="board-empty"><p class="board-empty-title">精选榜收集中</p><p>已有 ${votes} 次有效比较，${data.scope?.provisionalModels ?? 0} 个模型正在积累，满 ${data.scope?.provisionalGames ?? 30} 次比较后上榜。</p><p class="board-meta">${counts}</p><div class="board-empty-actions">${go}</div></div>`
      : `<div class="board-empty"><p class="board-empty-title">精选榜从零开始</p><p>这里只统计 Lv1 及以上成员在精选题上的选择，和大众榜分开计票。模型在本榜比较满 ${data.scope?.provisionalGames ?? 30} 次后上榜，在那之前不给出没有依据的名次。</p><p class="board-meta">${counts}</p><div class="board-empty-actions">${go}</div></div>`;
  }

  function table(data) {
    const { rows, unranked } = visibleBoardEntries(data, showSmallSamples);
    const { totals } = data;
    const hiddenCount = data.rows.length + data.unranked.length - rows.length - unranked.length;
    const unsupported = (filterActive() && !data.filters) || (ctx.category && data.category === undefined) || (ctx.domain && data.domain === undefined);
    const thin = ctx.domain && data.domain !== undefined && rows.length && ((totals.tasks ?? 0) < THIN.tasks || totals.votes < THIN.votes);
    const meta = `${totals.votes} 次有效比较 · ${totals.voters} 位参与者 · ${rows.length} 个${unit === 'model' ? '模型' : '配置'}有评分${data.filters ? ' · 仅统计两件作品来源都符合筛选的比较' : ''}`;
    // On the full page the sidebar already counts comparisons and voters, so search leads the toolbar.
    const search = `<label class="collection-search">${icon('search')}<input type="search" data-board-search aria-label="搜索模型" placeholder="搜索模型" value="${esc(text)}"></label>`;
    const unitControl = `<div class="seg" role="group" aria-label="计分单位">${Object.entries(UNITS).map(([value, text]) => `<button data-board-unit="${value}" aria-pressed="${value === unit}">${text}</button>`).join('')}</div>`;
    const head = (filterable
      ? `<div class="collection-toolbar">${search}<div class="toolbar-actions">${typeof ctx.toolbar === 'function' ? ctx.toolbar() : ctx.toolbar ?? ''}${filterSelect('harness', 'Harness', ctx.HARNESSES)}${filterSelect('provider', '服务商', ctx.PROVIDERS)}${unitControl}</div></div>${data.filters ? '<p class="muted">仅统计两件作品来源都符合筛选的比较。</p>' : ''}`
      : `<div class="board-head"><p class="board-meta">${meta}</p>${unitControl}</div>`)
      + `<p class="board-meta"><span>每 10 分钟更新一次</span>${data.updatedAt ? ` · <span>最近计算</span> <time datetime="${esc(data.updatedAt)}" data-i18n-time="${esc(data.updatedAt)}">${esc(formatTime(data.updatedAt))}</time>` : ''}</p>`
      + `<div class="board-display"><label class="board-sample-toggle"><input type="checkbox" data-board-small${showSmallSamples ? ' checked' : ''}><span>显示作品少于 5 件的条目</span></label>${hiddenCount ? `<span class="board-meta">已隐藏 ${hiddenCount} 个作品不足 5 件的条目</span>` : ''}</div>`
      + (ctx.curated && unit === 'config' ? '<p class="muted">入榜资格按模型判断，单独配置比较不足 30 次时仍标为暂定。</p>' : '')
      + (ctx.curated && rows.length && totals.votes < 50 ? `<p class="muted">精选榜刚开始计票：目前 ${totals.votes} 次有效比较，名次可能随新票大幅变动。</p>` : '')
      + (unsupported ? '<p class="muted">后端暂不支持这项筛选，下面是未筛选的榜单。</p>' : '')
      + (thin ? `<p class="muted">样本不足：「${esc(ctx.domain)}」目前只有 ${totals.tasks ?? 0} 道题、${totals.votes} 次有效比较参与计分，名次可能随新票大幅变动，仅供参考。</p>` : '');
    if (!rows.length && data.rows.length) {
      return `${head}<div class="board-empty"><p class="board-empty-title">当前没有作品数达到 5 件的条目</p><p>勾选「显示作品少于 5 件的条目」可查看已有评分，暂定标记仍保留。</p></div>`;
    }
    if (!rows.length && data.filters) {
      return `${head}<div class="board-empty">
        <p class="board-empty-title">这个筛选下还没有可计分的比较</p>
        <p>只有两件作品在投票时来源都符合筛选的比较才计入。${unranked.length ? `符合条件的${unit === 'model' ? '模型' : '配置'}有 ${unranked.length} 个。` : ''}</p>
      </div>`;
    }
    if (!rows.length && ctx.curated) return `${head}${curatedEmpty(data)}`;
    if (!rows.length) {
      return `${head}<div class="board-empty">
        <p class="board-empty-title">${esc(ctx.emptyTitle ?? '榜单还在等第一批盲评')}</p>
        <p>票数积累之前，这里不给出没有依据的名次。${unranked.length ? `目前有 ${unranked.length} 个${unit === 'model' ? '模型' : '配置'}的已验证作品在等待比较。` : ''}</p>
        <a class="btn primary sm" href="#/arena${ctx.task ? `/${esc(ctx.task.id)}` : ''}">${icon('blind')}去盲评</a>
      </div>`;
    }
    const low = Math.min(1000, ...rows.map((row) => row.score - row.interval));
    const high = Math.max(1000, ...rows.map((row) => row.score + row.interval));
    const at = (value) => (((value - low) / Math.max(high - low, 1)) * 100).toFixed(2);
    const body = rows.map((row) => {
      const from = at(row.score - row.interval), to = at(row.score + row.interval);
      const m = modelOf(row);
      return `<tr${row.provisional ? ' class="is-provisional"' : ''} data-board-row="${esc([row.modelName, row.effort, m.vendor].join(' ').toLowerCase())}">
      <td class="c-rank${row.rank <= 3 ? ' is-top' : ''}">${pad(row.rank)}</td>
      <td class="c-model"><span class="board-model">${brandMark(m, 'brand-mark sm')}<span class="board-name"><b data-i18n-ignore>${esc(row.modelName)}</b>${row.effort ? `<span class="badge" data-i18n-ignore>${esc(row.effort)}</span>` : ''}${row.provisional ? `<span class="badge provisional" title="比较少于 ${data.provisionalGames} 次">暂定</span>` : ''}<small>${[vendorLine(m), ...standingsOf(data, row)].join(' · ')}</small></span></span></td>
      <td class="c-score"><b><span data-i18n-number="${row.score}">${row.score}</span></b><small>±<span data-i18n-number="${row.interval}">${row.interval}</span></small></td>
      <td class="c-range" aria-hidden="true"><span class="range"><s style="left:${at(1000)}%"></s><i style="left:${from}%;width:${(to - from).toFixed(2)}%;background:linear-gradient(90deg, ${tone(from)}, ${tone(to)})"></i><em style="left:${at(row.score)}%"></em></span></td>
      <td class="c-games"><span data-i18n-number="${row.games}">${row.games}</span></td>
      <td class="c-record"><span data-i18n-number="${row.wins}">${row.wins}</span><span>·</span><span data-i18n-number="${row.draws}">${row.draws}</span><span>·</span><span data-i18n-number="${row.losses}">${row.losses}</span></td>
      <td class="c-rate">${Math.round(row.winRate * 100)}%</td>
      <td class="c-works"><span data-i18n-number="${row.works}">${row.works}</span></td>
    </tr>`;
    }).join('');
    return `${head}<div class="board-wrap"><table class="board">
      <thead><tr><th class="c-rank" scope="col">名次</th><th class="c-model" scope="col">${unit === 'model' ? '模型' : '模型 · 档位'}</th><th class="c-score" scope="col">评分</th><th class="c-range" scope="col"><span class="sr">区间</span></th><th class="c-games" scope="col">比较</th><th class="c-record" scope="col">胜 · 平 · 负</th><th class="c-rate" scope="col">胜率</th><th class="c-works" scope="col">作品</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    <p class="muted filter-empty" data-board-none hidden>没有匹配的模型，请换个关键词。</p>
    ${unranked.length ? `<details class="board-unranked"><summary>还没有比较数据的${unit === 'model' ? '模型' : '配置'} · ${unranked.length}${icon('next')}</summary><p data-i18n-ignore>${unranked.map((row) => `${esc(row.modelName)}${row.effort ? ` · ${esc(row.effort)}` : ''}`).join('、')}</p></details>` : ''}`;
  }

  function applyQuery() {
    const rows = [...container.querySelectorAll('[data-board-row]')];
    let shown = 0;
    for (const row of rows) {
      row.hidden = !textMatches(query, row.dataset.boardRow);
      if (!row.hidden) shown++;
    }
    const none = $('[data-board-none]', container);
    if (none) none.hidden = shown > 0 || !rows.length;
  }

  let drawn = false;
  function draw(data) {
    if (ctx.curated && data.audience !== 'curated') throw new Error('后端尚未支持精选榜，请更新后端后重试');
    // A fresh board can land while the reader types; the search keeps its focus.
    const typing = document.activeElement?.matches('[data-board-search]');
    const togglingSamples = document.activeElement?.matches('[data-board-small]');
    container.innerHTML = table(data) + (ctx.embedded ? boardNotes() : '');
    if (typing) $('[data-board-search]', container)?.focus();
    if (togglingSamples) $('[data-board-small]', container)?.focus();
    applyQuery();
    currentData = data;
    ctx.onData?.(data, { visibleRows: visibleBoardEntries(data, showSmallSamples).rows.length });
    drawn = true;
  }
  // A board seen before draws at once from memory; the fresh one replaces it only if it differs.
  async function load() {
    controller?.abort();
    controller = new AbortController();
    const params = new URLSearchParams({ by: unit, ...(ctx.curated ? { audience: 'curated', ...(ctx.sectionId ? { sectionId: ctx.sectionId } : {}) } : ctx.task ? { task: ctx.task.id } : { ...(ctx.category ? { category: ctx.category } : {}), ...(ctx.domain ? { domain: ctx.domain } : {}) }) });
    if (filterable) for (const [field, value] of Object.entries(filters)) if (value) params.set(field, value);
    const path = `leaderboard?${params}`;
    const known = recall(path);
    let fromMemory = false;
    container.setAttribute('aria-busy', 'true');
    try {
      if (known) { draw(known); fromMemory = true; }
      const data = await apiRemembered(path, { signal: controller.signal });
      if (destroyed) return;
      if (JSON.stringify(data) !== JSON.stringify(known)) draw(data);
      ctx.onLoad?.(data);
      return data;
    } catch (error) {
      if (error.name === 'AbortError' || destroyed || fromMemory) return;
      container.innerHTML = `<p class="muted">榜单暂时无法载入：${esc(error.message)}</p>`;
    } finally {
      container.removeAttribute('aria-busy');
    }
  }

  const onClick = (e) => {
    if (e.target.closest('[data-curated-arena]')) {
      arenaScope.set(currentData?.scope?.taskIds ?? []);
      location.hash = '#/arena/random';
      return;
    }
    const button = e.target.closest('[data-board-unit]');
    if (!button || button.dataset.boardUnit === unit) return;
    unit = button.dataset.boardUnit;
    store.set('board-unit', unit);
    load();
  };
  const onChange = (e) => {
    if (e.target.matches('[data-board-small]')) {
      showSmallSamples = e.target.checked;
      store.set('board-show-small-samples', String(showSmallSamples));
      if (currentData) draw(currentData);
      return;
    }
    const select = e.target.closest('[data-board-filter]');
    if (!select) return;
    filters[select.dataset.boardFilter] = select.value;
    load();
  };
  container.addEventListener('click', onClick);
  container.addEventListener('change', onChange);
  const loading = load();
  return {
    ready: drawn ? null : loading,
    reload: load,
    search(value) {
      text = value;
      query = value.trim().toLowerCase();
      applyQuery();
    },
    destroy() {
      destroyed = true;
      controller?.abort();
      container.removeEventListener('click', onClick);
      container.removeEventListener('change', onChange);
    },
  };
}

// The page's views are 综合 plus one per voted category; a task narrows its category's view.
// A domain narrows 综合 or a category (never a task) and rides as the last part of the address.
// The curated rankings sit beside them: #/leaderboard/curated (overall) and .../curated/<sectionId>.
// AI-graded questions are not ranked here.
export function mount(root, ctx) {
  const tasks = ctx.DATA.tasks.filter(votedTask);
  const tracks = tracksOf(tasks);
  const [first = null, second = null] = location.hash.replace(/^#\/?/, '').split('#')[0].split('/').filter(Boolean).map(decodeURIComponent).slice(1);
  const curated = first === 'curated';
  if (curated && second === 'frontend') {
    location.replace('#/leaderboard/curated');
    return {};
  }
  const sectionId = curated ? second : null;
  const task = !curated && first ? tasks.find((t) => t.id === first) ?? null : null;
  const track = curated ? null : task ? tracks.find((x) => x.name === task.category) ?? null : first ? tracks.find((x) => x.slug === first) ?? null : null;
  const hasDomain = (name) => tasks.some((t) => domainsOf(t).includes(name));
  const domain = curated || task ? null : !track && hasDomain(first) ? first : track && hasDomain(second) ? second : null;
  if (first && !curated && !task && !track && !domain) {
    location.replace('#/leaderboard');
    return {};
  }
  const base = track ? `#/leaderboard/${encodeURIComponent(track.slug)}` : '#/leaderboard';
  // Tasks of the current category (and domain), in the task page's select idiom: the option text carries the count.
  const listed = track ? track.tasks.filter((t) => !domain || domainsOf(t).includes(domain)) : [];
  const taskSelect = () => track ? `<label class="result-sort">题目<select data-board-task aria-label="按题目查看">${boardTaskOptions(listed, task?.id, platform.activityReady, platform.arena)}</select></label>` : '';
  const domains = task || curated ? [] : domainsIn(track?.tasks ?? tasks, domainList(platform));
  const domainSelect = domains.length ? `<label class="result-sort">领域<select data-board-domain aria-label="按领域查看">
      <option value="">全部领域</option>
      ${domains.map((d) => `<option value="${esc(d.name)}"${d.name === domain ? ' selected' : ''}>${esc(d.name)}（${d.tasks.length} 题）</option>`).join('')}
    </select></label>` : '';

  // The curated group is drawn from what the server says; sections without questions stay out of public view.
  const curatedNav = (info) => {
    const sections = (info?.sections ?? []).filter((section) => section.questionCount > 0);
    const total = (info?.sections ?? []).reduce((sum, section) => sum + (section.questionCount ?? 0), 0);
    const link = (href, glyph, text, current, count) => `<a class="side-link" href="${esc(href)}"${current ? ' aria-current="page"' : ''}>${icon(glyph)}<span data-i18n-ignore>${esc(text)}</span><span class="nav-count">${count}</span></a>`;
    if (info && !total) return `<nav class="side-nav section-nav" aria-label="精选榜"><button class="side-link" type="button" disabled>${icon('rank')}总榜 · 暂无精选题</button></nav>`;
    return `<nav class="side-nav section-nav" aria-label="精选榜">${info ? [
      `<a class="side-link" href="#/leaderboard/curated"${curated && !sectionId ? ' aria-current="page"' : ''}>${icon('rank')}总榜<span class="nav-count">${total}</span></a>`,
      ...sections.map((section) => link(`#/leaderboard/curated/${encodeURIComponent(section.id)}`, 'bookmark', section.name, section.id === sectionId, section.questionCount)),
    ].join('') : `<a class="side-link" href="#/leaderboard/curated"${curated && !sectionId ? ' aria-current="page"' : ''}>${icon('rank')}总榜</a>`}</nav>`;
  };
  const stat = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;

  let board = null, live = null, destroyed = false, drawn = null;
  const onChange = (e) => {
    const select = e.target.closest('[data-board-task]');
    if (select) location.hash = select.value ? `#/leaderboard/${encodeURIComponent(select.value)}` : domain ? `${base}/${encodeURIComponent(domain)}` : base;
    const scope = e.target.closest('[data-board-domain]');
    if (scope) location.hash = scope.value ? `${base}/${encodeURIComponent(scope.value)}` : base;
  };
  const onInput = (e) => { if (e.target.matches('[data-board-search]')) board?.search(e.target.value); };
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);

  // Draw the page. A curated view needs the structure first (names, counts, since-date); the others only
  // refresh the curated group of the side nav once it arrives.
  function render(info) {
    live?.destroy();
    board?.destroy();
    const section = sectionId ? info?.sections.find((x) => x.id === sectionId) ?? null : null;
    const scopeTitle = curated ? (sectionId ? `精选 · ${section?.name ?? ''}` : '精选总榜')
      : task?.title ?? (domain ? `${track ? `${track.label} · ` : ''}${domain}排行` : track ? `${track.label}排行` : '综合排行');
    const crumbs = [{ text: '排行榜', ...(task || track || domain || curated ? { href: '#/leaderboard' } : {}) }];
    if (curated) crumbs.push(sectionId ? { text: '精选榜', href: '#/leaderboard/curated' } : { text: '精选榜' }, ...(sectionId ? [{ text: section?.name ?? '', original: true }] : []));
    if (track) crumbs.push(task || domain ? { text: track.label, href: base } : { text: track.label });
    if (domain) crumbs.push({ text: domain });
    if (task) crumbs.push({ text: task.title, original: true });
    const since = info?.countingStartedAt;
    const description = !curated ? '由全部计票的盲评选择计算。分数反映作品在同题比较中被偏好的程度，区间越窄，结论越可靠。'
      : sectionId ? `精选总榜中「${section?.name ?? ''}」分区的 ${section?.questionCount ?? 0} 道题，单独计算名次。`
        : `只统计 Lv1 及以上成员（通过资格考试）在精选题上的选择，题目由管理员挑选。和大众榜分开计票${since ? `，${formatDate(since)} 起从零累计` : ''}。`;
    root.innerHTML = `${ctx.pageStart({ title: '排行榜', section: 'leaderboard', heading: scopeTitle, headingOriginal: Boolean(task), crumbs, description,
      meta: `<dl class="side-stats" data-stats>
          ${stat('有效比较', !curated && platform.activityReady ? pad(platform.totals.votes) : '—')}
          ${stat('参与者', !curated && platform.activityReady ? pad(platform.totals.voters) : '—')}
        </dl>`,
      nav: `<div class="board-nav-groups">
      <section class="board-nav-group">
        <h2 class="board-nav-title">大众榜</h2>
        ${ctx.sideNav('大众榜', [['#/leaderboard', 'rank', '综合', !curated && !track && !task && !domain, tasks.length],
          ...tracks.map((x) => [`#/leaderboard/${encodeURIComponent(x.slug)}`, x.glyph, x.label, x === track, x.tasks.length])])}
      </section>
      <section class="board-nav-group" data-curated-nav>
        <h2 class="board-nav-title">精选榜</h2>
        ${curatedNav(info)}
      </section>
    </div>` })}
    <section class="block wrap">
      <div data-board><p class="muted">正在载入榜单…</p></div>
      ${boardNotes(false, curated ? { since, threshold: 30 } : null)}
    </section>
  ${ctx.pageEnd()}`;
    drawn = info;
    if (curated && !info) return;
    board = mountBoard($('[data-board]', root), {
      ...ctx,
      task,
      curated,
      sectionId,
      info,
      category: task ? null : track?.name ?? null,
      domain,
      tracks: task || track || domain || curated ? null : tracks,
      toolbar: () => domainSelect + taskSelect(),
      emptyTitle: domain ? `${domain}榜单还在等第一批盲评` : track && !task ? `${track.label}榜单还在等第一批盲评` : undefined,
      onLoad: (data) => live?.update(data),
      onData: (data, { visibleRows }) => {
        const stats = $('[data-stats]', root);
        if (stats) stats.innerHTML = stat('有效比较', pad(data.totals.votes)) + stat('参与者', pad(data.totals.voters)) + stat(data.by === 'model' ? '上榜模型' : '上榜配置', pad(visibleRows));
      },
    });
    live = watchBoardRefresh(() => board.reload());
    return board.ready;
  }
  setPageTitle(['榜单', curated ? (sectionId ? '精选榜' : '精选总榜') : { text: task?.title ?? (domain ? `${track ? `${track.label} · ` : ''}${domain}排行` : track ? `${track.label}排行` : '综合排行'), original: Boolean(task) }, ctx.DATA.title]);
  const known = curatedKnown();
  let ready = render(known);
  const loaded = curatedInfo().then((info) => {
    if (destroyed) return;
    if (sectionId && !info.sections.some((section) => section.id === sectionId && section.questionCount >= 0)) {
      location.replace('#/leaderboard/curated');
      return;
    }
    // Curated views depend on the structure; others only refresh the curated group.
    if (curated && !known) return render(info);
    if (curated && JSON.stringify(info.sections) !== JSON.stringify(known.sections)) return render(info);
    const group = $('[data-curated-nav]', root);
    if (group) group.innerHTML = `<h2 class="board-nav-title">精选榜</h2>${curatedNav(info)}`;
  }, () => { if (curated && !destroyed && !drawn) { $('[data-board]', root).innerHTML = '<p class="muted">精选榜暂时无法载入，请稍后重试。</p>'; } });
  if (curated && !known) ready = loaded;
  return {
    ready,
    onPlatformChange: (reason) => {
      if (reason === 'activity' || reason === 'identity') {
        const select = $('[data-board-task]', root);
        if (select) select.innerHTML = boardTaskOptions(listed, select.value, platform.activityReady, platform.arena);
        return live?.refresh();
      }
      if (!['session', 'session-ready'].includes(reason)) return live?.refresh();
    },
    destroy: () => {
      destroyed = true;
      live?.destroy();
      board?.destroy();
      root.removeEventListener('change', onChange);
      root.removeEventListener('input', onInput);
    },
  };
}
