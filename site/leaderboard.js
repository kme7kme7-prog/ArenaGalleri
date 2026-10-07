// Leaderboard: the full page (#/leaderboard[/<category>|/<task>][/<domain>], or #/leaderboard/<domain>)
// and the panel on each task page.
import { $, brandMark, esc, icon, pad, store, vendorLine } from './ui.js';
import { apiRemembered, platform, recall } from './platform.js';
import { domainsIn, domainList, domainsOf, tracksOf, votedTask } from './categories.js';

const UNITS = { config: '按配置', model: '按模型' };
// A domain board below either line is shown, but flagged as too thin to rank on.
const THIN = { tasks: 2, votes: 50 };
export const boardNotes = (open = false) => `<details class="board-notes"${open ? ' open' : ''}>
  <summary>计分方法${icon('next')}</summary>
  <dl>
    <div><dt>比较</dt><dd>盲评每次展示同一道题的两件作品，左右随机、身份隐藏，投票之后才揭晓模型。</dd></div>
    <div><dt>计分</dt><dd>Bradley–Terry 模型根据全部有效比较，估计每个配置被偏好的强度，「不分伯仲」计为双方各得半场。分数折算到 Elo 刻度：1000 为平均水平，高出 400 分约等于被偏好的机会高十倍。结果与投票先后顺序无关。</dd></div>
    <div><dt>区间</dt><dd>分数后的 ± 与横条表示约 95% 的不确定范围，横条颜色越接近朱红，在本榜的位置越高；比较少于 ${platform.site?.limits.provisionalGames ?? 30} 次的配置标为「暂定」。</dd></div>
    <div><dt>范围</dt><dd>「综合」合并全部题目的比较；各类型（文本 / 设计 / 三维）只统计该类题目，选择具体题目时只统计这道题。比较本身始终发生在同一道题之内。票数多的类型对综合影响更大，所以综合榜在厂商之后列出各类型名次。</dd></div>
    <div><dt>领域</dt><dd>选择领域时只统计属于该领域的题目，可以和类型叠加；一道题属于两个领域时，它的比较在两边都完整计入。领域内少于 ${THIN.tasks} 道题有比较、或有效比较少于 ${THIN.votes} 次时标为「样本不足」，名次仅供参考。</dd></div>
    <div><dt>计入</dt><dd>只统计登录用户对两件已验证作品的选择；同一用户对同一对作品只计一次，跳过不计。同一配置（按模型时为同一模型）的两件作品之间的比较不参与计分，也不计入有效比较数。作品被标记存疑或删除后，相关投票自动移出，恢复后重新计入。</dd></div>
    <div><dt>单位</dt><dd>「按配置」把同一模型的不同推理档位分开计分；「按模型」把它们合并。</dd></div>
    <div><dt>来源筛选</dt><dd>按 Harness 或服务商筛选时，只统计两件作品在投票当时都满足条件的比较；计分单位不变。服务商分为官方、非官方，未填写的为「未注明」；只填了「其他」的 Harness 和未记录来源的较早投票按「未注明」统计。</dd></div>
    <div><dt>不计分</dt><dd>表情互动与浏览次数都不影响榜单。</dd></div>
  </dl>
</details>`;

// Each interval shows its own stretch of one grey-to-ink ramp spanning the axis; vermilion is kept
// for the top three places.
const tone = (at) => `color-mix(in srgb, var(--ink) ${Math.round(at)}%, var(--line-2))`;

export function mountBoard(container, ctx) {
  let unit = store.get('board-unit') === 'model' ? 'model' : 'config';
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
      .map((entry) => `<option value="${esc(entry.id)}"${entry.id === filters[field] ? ' selected' : ''}>${esc(entry.name)}</option>`).join('')}
  </select></label>`;
  const standingsOf = (data, row) => (ctx.tracks ?? [])
    .filter((track) => data.standings?.[track.name]?.[row.key])
    .map((track) => `${track.label}第 ${data.standings[track.name][row.key]}`);

  function table(data) {
    const { rows, unranked, totals } = data;
    const unsupported = (filterActive() && !data.filters) || (ctx.category && data.category === undefined) || (ctx.domain && data.domain === undefined);
    const thin = ctx.domain && data.domain !== undefined && rows.length && ((totals.tasks ?? 0) < THIN.tasks || totals.votes < THIN.votes);
    const meta = `${totals.votes} 次有效比较 · ${totals.voters} 位参与者 · ${rows.length} 个${unit === 'model' ? '模型' : '配置'}有评分${data.filters ? ' · 仅统计两件作品来源都符合筛选的比较' : ''}`;
    // On the full page the sidebar already counts comparisons and voters, so search leads the toolbar.
    const search = `<label class="collection-search">${icon('search')}<input type="search" data-board-search aria-label="搜索模型" placeholder="搜索模型" value="${esc(text)}"></label>`;
    const unitControl = `<div class="seg" role="group" aria-label="计分单位">${Object.entries(UNITS).map(([value, text]) => `<button data-board-unit="${value}" aria-pressed="${value === unit}">${text}</button>`).join('')}</div>`;
    const head = (filterable
      ? `<div class="collection-toolbar">${search}<div class="toolbar-actions">${ctx.toolbar ?? ''}${filterSelect('harness', 'Harness', ctx.HARNESSES)}${filterSelect('provider', '服务商', ctx.PROVIDERS)}${unitControl}</div></div>${data.filters ? '<p class="muted">仅统计两件作品来源都符合筛选的比较。</p>' : ''}`
      : `<div class="board-head"><p class="board-meta">${meta}</p>${unitControl}</div>`)
      + (unsupported ? '<p class="muted">后端暂不支持这项筛选，下面是未筛选的榜单。</p>' : '')
      + (thin ? `<p class="muted">样本不足：「${esc(ctx.domain)}」目前只有 ${totals.tasks ?? 0} 道题、${totals.votes} 次有效比较参与计分，名次可能随新票大幅变动，仅供参考。</p>` : '');
    if (!rows.length && data.filters) {
      return `${head}<div class="board-empty">
        <p class="board-empty-title">这个筛选下还没有可计分的比较</p>
        <p>只有两件作品在投票时来源都符合筛选的比较才计入。${unranked.length ? `符合条件的${unit === 'model' ? '模型' : '配置'}有 ${unranked.length} 个。` : ''}</p>
      </div>`;
    }
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
      <td class="c-model"><span class="board-model">${brandMark(m, 'brand-mark sm')}<span class="board-name"><b>${esc(row.modelName)}</b>${row.effort ? `<span class="badge">${esc(row.effort)}</span>` : ''}${row.provisional ? `<span class="badge provisional" title="比较少于 ${data.provisionalGames} 次">暂定</span>` : ''}<small>${[vendorLine(m), ...standingsOf(data, row)].join(' · ')}</small></span></span></td>
      <td class="c-score"><b>${row.score}</b><small>±${row.interval}</small></td>
      <td class="c-range" aria-hidden="true"><span class="range"><s style="left:${at(1000)}%"></s><i style="left:${from}%;width:${(to - from).toFixed(2)}%;background:linear-gradient(90deg, ${tone(from)}, ${tone(to)})"></i><em style="left:${at(row.score)}%"></em></span></td>
      <td class="c-games">${row.games}</td>
      <td class="c-record">${row.wins}<span>·</span>${row.draws}<span>·</span>${row.losses}</td>
      <td class="c-rate">${Math.round(row.winRate * 100)}%</td>
      <td class="c-works">${row.works}</td>
    </tr>`;
    }).join('');
    return `${head}<div class="board-wrap"><table class="board">
      <thead><tr><th class="c-rank" scope="col">名次</th><th class="c-model" scope="col">${unit === 'model' ? '模型' : '模型 · 档位'}</th><th class="c-score" scope="col">评分</th><th class="c-range" scope="col"><span class="sr">区间</span></th><th class="c-games" scope="col">比较</th><th class="c-record" scope="col">胜 · 平 · 负</th><th class="c-rate" scope="col">胜率</th><th class="c-works" scope="col">作品</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    <p class="muted filter-empty" data-board-none hidden>没有匹配的模型，请换个关键词。</p>
    ${unranked.length ? `<details class="board-unranked"><summary>还没有比较数据的${unit === 'model' ? '模型' : '配置'} · ${unranked.length}${icon('next')}</summary><p>${unranked.map((row) => `${esc(row.modelName)}${row.effort ? ` · ${esc(row.effort)}` : ''}`).join('、')}</p></details>` : ''}`;
  }

  function applyQuery() {
    const rows = [...container.querySelectorAll('[data-board-row]')];
    let shown = 0;
    for (const row of rows) {
      row.hidden = !row.dataset.boardRow.includes(query);
      if (!row.hidden) shown++;
    }
    const none = $('[data-board-none]', container);
    if (none) none.hidden = shown > 0 || !rows.length;
  }

  let drawn = false;
  function draw(data) {
    // A fresh board can land while the reader types; the search keeps its focus.
    const typing = document.activeElement?.matches('[data-board-search]');
    container.innerHTML = table(data) + (ctx.embedded ? boardNotes() : '');
    if (typing) $('[data-board-search]', container)?.focus();
    applyQuery();
    ctx.onData?.(data);
    drawn = true;
  }
  // A board seen before draws at once from memory; the fresh one replaces it only if it differs.
  async function load() {
    controller?.abort();
    controller = new AbortController();
    const params = new URLSearchParams({ by: unit, ...(ctx.task ? { task: ctx.task.id } : { ...(ctx.category ? { category: ctx.category } : {}), ...(ctx.domain ? { domain: ctx.domain } : {}) }) });
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
    } catch (error) {
      if (error.name === 'AbortError' || destroyed || fromMemory) return;
      container.innerHTML = `<p class="muted">榜单暂时无法载入：${esc(error.message)}</p>`;
    } finally {
      container.removeAttribute('aria-busy');
    }
  }

  const onClick = (e) => {
    const button = e.target.closest('[data-board-unit]');
    if (!button || button.dataset.boardUnit === unit) return;
    unit = button.dataset.boardUnit;
    store.set('board-unit', unit);
    load();
  };
  const onChange = (e) => {
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
// AI-graded questions are not ranked here.
export function mount(root, ctx) {
  const tasks = ctx.DATA.tasks.filter(votedTask);
  const tracks = tracksOf(tasks);
  const [first = null, second = null] = location.hash.replace(/^#\/?/, '').split('#')[0].split('/').filter(Boolean).map(decodeURIComponent).slice(1);
  const task = first ? tasks.find((t) => t.id === first) ?? null : null;
  const track = task ? tracks.find((x) => x.name === task.category) ?? null : first ? tracks.find((x) => x.slug === first) ?? null : null;
  const hasDomain = (name) => tasks.some((t) => domainsOf(t).includes(name));
  const domain = task ? null : !track && hasDomain(first) ? first : track && hasDomain(second) ? second : null;
  if (first && !task && !track && !domain) {
    location.replace('#/leaderboard');
    return {};
  }
  const base = track ? `#/leaderboard/${encodeURIComponent(track.slug)}` : '#/leaderboard';
  const scopeTitle = task?.title ?? (domain ? `${track ? `${track.label} · ` : ''}${domain}排行` : track ? `${track.label}排行` : '综合排行');
  const crumbs = [{ text: '排行榜', ...(task || track || domain ? { href: '#/leaderboard' } : {}) }];
  if (track) crumbs.push(task || domain ? { text: track.label, href: base } : { text: track.label });
  if (domain) crumbs.push({ text: domain });
  if (task) crumbs.push({ text: task.title });
  const ready = (t) => (platform.arena[t.id]?.entries ?? 0) >= 2;
  // Tasks of the current category (and domain), in the task page's select idiom: the option text carries the count.
  const listed = track ? track.tasks.filter((t) => !domain || domainsOf(t).includes(domain)) : [];
  const taskSelect = track ? `<label class="result-sort">题目<select data-board-task aria-label="按题目查看">
      <option value="">全部题目（${listed.length}）</option>
      ${listed.map((t) => `<option value="${esc(t.id)}"${t === task ? ' selected' : ''}${ready(t) || t === task ? '' : ' disabled'}>${esc(t.title)}${ready(t) ? `（${platform.arena[t.id].works}）` : '（作品不足）'}</option>`).join('')}
    </select></label>` : '';
  const domains = task ? [] : domainsIn(track?.tasks ?? tasks, domainList(platform));
  const domainSelect = domains.length ? `<label class="result-sort">领域<select data-board-domain aria-label="按领域查看">
      <option value="">全部领域</option>
      ${domains.map((d) => `<option value="${esc(d.name)}"${d.name === domain ? ' selected' : ''}>${esc(d.name)}（${d.tasks.length} 题）</option>`).join('')}
    </select></label>` : '';

  root.innerHTML = `${ctx.pageStart({ title: '排行榜', section: 'leaderboard', heading: scopeTitle, crumbs,
    description: '由真实盲评投票计算。分数反映作品在同题比较中被偏好的程度，区间越窄，结论越可靠。',
    meta: `<dl class="side-stats" data-stats>
          <div><dt>有效比较</dt><dd>${pad(platform.totals.votes)}</dd></div>
          <div><dt>参与者</dt><dd>${pad(platform.totals.voters)}</dd></div>
        </dl>`,
    nav: ctx.sideNav('榜单范围', [['#/leaderboard', 'rank', '综合', !track && !task && !domain, tasks.length],
      ...tracks.map((x) => [`#/leaderboard/${encodeURIComponent(x.slug)}`, x.glyph, x.label, x === track, x.tasks.length])]) })}
    <section class="block wrap">
      <div data-board><p class="muted">正在载入榜单…</p></div>
      ${boardNotes()}
    </section>
  ${ctx.pageEnd()}`;
  const board = mountBoard($('[data-board]', root), {
    ...ctx,
    task,
    category: task ? null : track?.name ?? null,
    domain,
    tracks: task || track || domain ? null : tracks,
    toolbar: domainSelect + taskSelect,
    emptyTitle: domain ? `${domain}榜单还在等第一批盲评` : track && !task ? `${track.label}榜单还在等第一批盲评` : undefined,
    onData: (data) => {
      const stats = $('[data-stats]', root);
      if (stats) stats.innerHTML = `<div><dt>有效比较</dt><dd>${pad(data.totals.votes)}</dd></div><div><dt>参与者</dt><dd>${pad(data.totals.voters)}</dd></div><div><dt>${data.by === 'model' ? '上榜模型' : '上榜配置'}</dt><dd>${pad(data.rows.length)}</dd></div>`;
    },
  });
  const onChange = (e) => {
    const select = e.target.closest('[data-board-task]');
    if (select) location.hash = select.value ? `#/leaderboard/${encodeURIComponent(select.value)}` : domain ? `${base}/${encodeURIComponent(domain)}` : base;
    const scope = e.target.closest('[data-board-domain]');
    if (scope) location.hash = scope.value ? `${base}/${encodeURIComponent(scope.value)}` : base;
  };
  const onInput = (e) => { if (e.target.matches('[data-board-search]')) board.search(e.target.value); };
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  document.title = `榜单 · ${scopeTitle} · ${ctx.DATA.title}`;
  return {
    ready: board.ready,
    onPlatformChange: () => board.reload(),
    destroy: () => {
      board.destroy();
      root.removeEventListener('change', onChange);
      root.removeEventListener('input', onInput);
    },
  };
}
