// Blind comparison: a lobby of tasks (#/arena), a match on one task (#/arena/<task>) and a random
// match (#/arena/random) where every pair may come from a different task.
// The server picks every pair and hands out opaque frame addresses; nothing on this page
// knows which work is which until the vote comes back with the reveal.
import { $, $$, brandMark, esc, icon, pad, themeButton } from './ui.js';
import { api, arenaScope, isStaff, needsEmail, openAuth, openDialog, platform, reactionBar, requireUser, toast } from './platform.js';
import { aigcLabel } from './legal.js';
import { domainsOf, matchesQuery, tracksOf } from './categories.js';
import { linkReferences, referenceSheet } from './references.js';

const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-downloads';
const VERDICT = { a: '你认为 A 更好', b: '你认为 B 更好', tie: '你认为不分伯仲', skip: '你跳过了这一组' };
const NOTICE = 'arena-login-notice';
// Two boxes for the header layout switch; the filled ones are the works on view.
const layoutGlyph = (a, b) => `<svg viewBox="0 0 20 14" aria-hidden="true"><rect${a > 3 ? ' class="on"' : ''} x="1" y="1" width="${a}" height="12" rx="1.5"/><rect${b > 3 ? ' class="on"' : ''} x="${a + 3}" y="1" width="${b}" height="12" rx="1.5"/></svg>`;
const REASON = {
  counted: '已计入榜单',
  anonymous: '未登录，这一票没有计入榜单',
  unbound: '账号未绑定邮箱，这一票没有计入榜单',
  duplicate: '这一对作品你评过了，这次不重复计入',
  changed: '作品的核验状态刚刚变化，这一票没有计入',
  own: '其中有你上传的作品，不计入',
  skipped: '跳过的组合不计入榜单',
};

const RANDOM = 'random';
const isOpen = (t) => (platform.arena[t.id]?.entries ?? 0) >= 2;

export function mount(root, ctx) {
  if (!ctx.param) return lobby(root, ctx);
  const random = ctx.param === RANDOM;
  const task = random ? null : ctx.DATA.tasks.find((t) => t.id === ctx.param);
  // A random round draws from the tasks the starting page was showing, as far as they can be judged.
  const scope = random ? ctx.DATA.tasks.filter((t) => isOpen(t) && (arenaScope.get() ?? [t.id]).includes(t.id)) : [];
  if (random ? !scope.length : !task) {
    location.replace('#/arena');
    return {};
  }
  return match(root, ctx, task ?? scope[Math.floor(Math.random() * scope.length)], random ? scope : null);
}

// The lobby follows the leaderboard: category views in the sidebar, one list on the right with the
// open tasks first and the ones still short of works folded away, the rules folded at the end.
function lobby(root, ctx) {
  const tracks = tracksOf(ctx.DATA.tasks);
  const view = { track: '', query: '' };
  const pool = (t) => platform.arena[t.id] ?? { works: 0, entries: 0 };
  const ready = isOpen;
  const openTasks = () => ctx.DATA.tasks.filter(ready);

  const row = (t) => {
    const p = pool(t);
    const open = ready(t);
    // Admins follow a closed task to its page, where the sidebar shows what keeps the pool short.
    const admin = !open && isStaff();
    return `<li class="arena-task${open ? '' : ' is-closed'}"><a ${open ? `href="#/arena/${esc(t.id)}"` : admin ? `href="#/${esc(t.id)}" title="查看这道题的盲评池"` : 'aria-disabled="true"'}>
      <span class="num">No.${pad(ctx.DATA.tasks.indexOf(t) + 1)}</span>
      <span class="arena-task-title"><b>${esc(t.title)}</b><small>${esc([domainsOf(t).join('、'), t.summary].filter(Boolean).join(' · '))}</small></span>
      <span class="arena-task-meta">可盲评 ${p.works} 件<br>${p.entries} 个配置</span>
      <span class="arena-task-go">${open ? `只评这题${icon('right')}` : (p.works ? `还差 ${2 - p.entries} 个配置` : '暂无作品')}</span>
    </a></li>`;
  };

  // The tasks in view: the chosen category, narrowed by the search.
  function scope() {
    const query = view.query.trim().toLowerCase();
    const scoped = ctx.DATA.tasks.filter((t) => (!view.track || t.category === view.track)
      && matchesQuery(t, query));
    return { scoped, open: scoped.filter(ready), closed: scoped.filter((t) => !ready(t)) };
  }
  const meta = ({ open, closed }) => `${open.length} 道题可以开始${closed.length ? ` · ${closed.length} 道作品不足` : ''}`;

  function list() {
    const { scoped, open, closed } = scope();
    if (!scoped.length) {
      return `<div class="board-empty">
        <p class="board-empty-title">没有找到相关题目</p><p>换个关键词，或切换到全部题目。</p></div>`;
    }
    return `${open.length ? `<ul class="arena-tasks">${open.map(row).join('')}</ul>` : `<div class="board-empty">
        <p class="board-empty-title">这里还没有可以盲评的题目</p>
        <p>一道题至少要有两个不同模型配置的作品进入盲评池，才能开始盲评。核验通过、单轮生成且无人工介入的作品会自动进入。</p></div>`}
      ${closed.length ? `<details class="result-group is-questioned arena-closed"><summary><div class="group-head">
        <h3>作品不足<span class="group-count">${closed.length}</span></h3><p>至少需要两个不同模型配置的作品进入盲评池</p>
        <span class="group-toggle" aria-hidden="true"><span class="when-open">收起</span><span class="when-closed">展开</span>${icon('next')}</span>
      </div></summary><ul class="arena-tasks">${closed.map(row).join('')}</ul></details>` : ''}`;
  }

  // Typing redraws the list only, so the search in the toolbar keeps its focus.
  const drawList = () => {
    $('[data-arena-list]', root).innerHTML = list();
    $('[data-arena-meta]', root).textContent = meta(scope());
  };

  const draw = () => {
    const open = openTasks();
    const track = tracks.find((x) => x.name === view.track);
    const link = (name, glyph, text, count) => `<button class="side-link" data-arena-track="${esc(name)}" aria-pressed="${view.track === name}">${icon(glyph)}${esc(text)}<span class="nav-count">${count}</span></button>`;
    root.innerHTML = `${ctx.pageStart({ title: '盲评', section: 'arena', heading: track ? `${track.label}题目` : '全部题目',
      description: '同一道题，两件匿名作品。只凭体验选出你更认可的一件，投票后揭晓模型身份。',
      meta: `<dl class="side-stats">
            <div><dt>可评题目</dt><dd>${pad(open.length)}</dd></div>
            <div><dt>有效比较</dt><dd>${pad(platform.totals.votes)}</dd></div>
            ${platform.user ? `<div><dt>你已评</dt><dd>${pad(platform.me?.votes ?? 0)}</dd></div>` : ''}
          </dl>${open.length ? `<button class="btn primary side-cta" data-random>${icon('blind')}随机一组</button><p class="side-cta-note">${view.track || view.query.trim() ? `在当前范围的 ${scope().open.length} 道题里` : `在全部 ${open.length} 道题里`}随机抽组，每一组都可能换题。想专心评一道，点右侧的题目。</p>` : ''}
          ${platform.user ? '' : '<p class="side-note">未登录可以体验，选择不计入榜单。<button class="link" data-auth="login">登录</button></p>'}`,
      nav: `<nav class="side-nav section-nav" aria-label="盲评题型">${link('', 'grid', '全部', open.length)}${tracks.map((x) => link(x.name, x.glyph, x.label, x.tasks.filter(ready).length)).join('')}</nav>` })}
      <section class="block wrap">
        <div class="collection-toolbar"><label class="collection-search">${icon('search')}<input type="search" data-arena-search aria-label="搜索题目" placeholder="搜索题目" value="${esc(view.query)}"></label><span data-arena-meta>${meta(scope())}</span></div>
        <div data-arena-list>${list()}</div>
        <details class="board-notes">
          <summary>盲评规则${icon('next')}</summary>
          <dl>
            <div><dt>匿名</dt><dd>两件作品来自同一道题、不同的模型配置。左右位置随机，作品地址也不透露身份，投票后才揭晓。</dd></div>
            <div><dt>体验</dt><dd>分别打开、操作两件作品，再选「A 更好」「B 更好」或「不分伯仲」。认出作品或页面异常时，请跳过这一组。</dd></div>
            <div><dt>计入</dt><dd>登录且绑定邮箱后的选择计入榜单，每对作品每人计一次。只有已验证作品参与；普通用户会回避本人投稿，普通管理员和高级管理员可以评本人投稿。</dd></div>
            <div><dt>快捷键</dt><dd><kbd>A</kbd> A 更好，<kbd>S</kbd> 不分伯仲，<kbd>D</kbd> B 更好，揭晓后 <kbd>N</kbd> 下一组。</dd></div>
          </dl>
        </details>
      </section>
    ${ctx.pageEnd()}`;
  };

  root.onclick = (e) => {
    const trackButton = e.target.closest('[data-arena-track]');
    if (trackButton) {
      view.track = trackButton.dataset.arenaTrack;
      return draw();
    }
    if (!e.target.closest('[data-random]')) return;
    const { open } = scope();
    if (!open.length) return;
    arenaScope.set(open.map((t) => t.id));
    location.hash = `#/arena/${RANDOM}`;
  };
  root.oninput = (e) => {
    if (!e.target.matches('[data-arena-search]')) return;
    view.query = e.target.value;
    drawList();
  };
  document.title = `盲评 · ${ctx.DATA.title}`;
  draw();
  return { onPlatformChange: draw, destroy() { root.onclick = null; root.oninput = null; } };
}

// A random match (scope given) may draw each pair from a different task; `task` is the one on view.
function match(root, ctx, first, scope) {
  let task = first;
  const state = { random: Boolean(scope), scope: scope ?? ctx.DATA.tasks.filter(isOpen), done: new Set(), unavailable: false, match: null, result: null, ready: {}, seen: {}, controls: {}, controlsShown: {}, split: 0.5, lastSplit: 0.5, side: 'a', round: 0, counted: 0, busy: false, prompt: false, slow: false, error: null };
  const mobile = () => matchMedia('(max-width: 860px)').matches;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };

  document.body.classList.add('is-viewer');
  document.title = `盲评 · ${task.title}`;
  root.innerHTML = `<div class="viewer arena">
    <header class="vbar">
      ${ctx.backLink('vback')}
      <div class="arena-heading"><b><span data-title>${esc(task.title)}</span><span class="arena-scope" data-scope hidden></span></b><span data-round>正在准备</span></div>
      <div class="vtools">
        <div class="seg arena-mode" role="group" aria-label="出题方式">
          <button data-a="mode" data-mode="random" aria-pressed="false" title="每一组都从范围内随机换题"><span class="mode-long">随机换题</span><span class="mode-short">随机</span></button>
          <button data-a="mode" data-mode="solo" aria-pressed="false" title="下一组仍然是这道题"><span class="mode-long">只评本题</span><span class="mode-short">本题</span></button>
        </div>
        <span class="vdivider" aria-hidden="true"></span>
        <button class="vtool" data-a="prompt" aria-pressed="false" title="查看提示词">${icon('guide')}<span class="vtool-text">提示词</span></button>
        <div class="seg arena-layout" role="group" aria-label="对比布局">
          <button data-layout="a" aria-pressed="false" title="只看 A（1）" aria-label="只看作品 A">${layoutGlyph(13, 3)}</button>
          <button data-layout="ab" aria-pressed="true" title="并排（2）" aria-label="并排">${layoutGlyph(8, 8)}</button>
          <button data-layout="b" aria-pressed="false" title="只看 B（3）" aria-label="只看作品 B">${layoutGlyph(3, 13)}</button>
        </div>
        <a class="vtool" data-board href="#/leaderboard/${esc(task.id)}" title="这道题的榜单">${icon('rank')}<span class="vtool-text">榜单</span></a>
        <span class="vdivider" aria-hidden="true"></span>
        ${themeButton('vtool icon-only')}
      </div>
    </header>
    <div class="arena-mbar">
      <div class="arena-switch seg" role="group" aria-label="切换作品">
        <button data-a="side" data-side="a" aria-pressed="true"><span class="ab">A</span>作品<i data-dot="a"></i></button>
        <button data-a="side" data-side="b" aria-pressed="false"><span class="ab">B</span>作品<i data-dot="b"></i></button>
      </div>
      ${aigcLabel()}
      <button class="pane-close arena-mcontrols" data-a="controls" aria-pressed="false" hidden>${icon('menu')}</button>
      <button class="pane-close" data-a="reload" title="重新载入当前作品" aria-label="重新载入当前作品">${icon('reload')}</button>
    </div>
    <div class="vmain">
      <div class="stage arena-stage">${['a', 'b'].map((side) => `<section class="pane arena-pane" data-side="${side}">
        <button class="arena-rail" data-layout="ab" title="展开作品 ${side.toUpperCase()}"><span class="pane-letter">${side.toUpperCase()}</span><span class="arena-dot" data-rail-dot="${side}"></span><span class="arena-rail-text">展开作品 ${side.toUpperCase()}</span>${icon(side === 'a' ? 'next' : 'prev')}</button>
        <div class="arena-head" data-head="${side}"></div>
        <div class="pane-body" data-body="${side}"></div>
      </section>${side === 'a' ? `<div class="split-bar" role="separator" tabindex="0" aria-orientation="vertical" aria-label="调整作品 A、B 的宽度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" title="拖动调整宽度，双击复位">
        <span class="split-read" aria-hidden="true"></span>
        <span class="split-grip"><button data-layout="b" title="收起 A，只看 B" aria-label="收起作品 A">${icon('prev')}</button><i></i><button data-layout="a" title="收起 B，只看 A" aria-label="收起作品 B">${icon('next')}</button></span>
      </div>` : ''}`).join('')}</div>
      <aside class="guide arena-prompt" aria-label="提示词"><div class="guide-in">
        <div class="guide-head"><div><p class="eyebrow">本题提示词</p><h2 data-prompt-title>${esc(task.title)}</h2></div><button class="icon-btn" data-a="prompt" aria-label="收起提示词">${icon('close')}</button></div>
        <div data-prompt-body></div>
      </div></aside>
    </div>
    <footer class="vote-bar" data-bar></footer>
  </div>`;
  const el = $('.arena', root);

  const letter = (side) => side.toUpperCase();
  // As in an exam hall, the name is sealed under a strip (糊名) until the vote, then unsealed.
  const sealStrip = (cls = '') => `<span class="arena-seal${cls}" aria-hidden="true">糊 名<small>投票后拆封</small></span>`;
  function blindHead(side) {
    const ready = state.ready[side];
    const text = ready ? '已就绪' : '载入中';
    return `<span class="pane-letter">${letter(side)}</span><span class="arena-who"><span class="sr">匿名作品</span>${sealStrip()}</span>${aigcLabel()}
      <span class="arena-dot${ready ? ' is-ready' : ''}" title="${text}" role="img" aria-label="${text}"></span>
      ${paneTools(side)}
      <button class="pane-close" data-a="reload" data-side="${side}" title="重新载入作品 ${letter(side)}" aria-label="重新载入作品 ${letter(side)}">${icon('reload')}</button>`;
  }
  function revealHead(side, unseal) {
    const work = state.result[side];
    if (!work) return `<span class="pane-letter">${letter(side)}</span><span class="arena-who">作品已不可用</span>${paneTools(side)}`;
    const model = ctx.modelOf({ model: work.model, modelName: work.modelName, vendor: work.vendor });
    const chosen = state.result.choice === side;
    return `<span class="pane-letter">${letter(side)}</span>${brandMark(model, 'brand-mark sm')}
      <span class="arena-who revealed"><b>${esc(work.modelName)}</b>${work.effort ? `<span class="badge">${esc(work.effort)}</span>` : ''}<small>${esc(work.title)}</small></span>
      ${chosen ? '<span class="arena-pick-seal" title="你的选择"><span>所</span><span>选</span></span>' : ''}
      ${reactionBar(`${task.id}/${work.id}`, { locked: work.status === 'questioned' })}
      ${paneTools(side)}
      ${ctx.inGallery(task.id, work.id) ? `<a class="pane-close" href="#/${esc(task.id)}/${esc(work.id)}" title="在展厅中打开" aria-label="在展厅中打开 ${esc(work.title)}">${icon('arrow')}</a>` : ''}
      ${unseal ? sealStrip(' is-leaving') : ''}`;
  }

  const canVote = () => Boolean(state.match && !state.result && state.ready.a && state.ready.b && (!mobile() || (state.seen.a && state.seen.b)));

  function status() {
    if (!state.match) return '正在抽取一组作品…';
    if (!(state.ready.a && state.ready.b)) {
      const parts = ['a', 'b'].map((side) => `${letter(side)} ${state.ready[side] ? '已就绪' : '载入中'}`).join(' · ');
      return state.slow ? `载入较慢（${parts}）：可以继续等待，或跳过这一组` : `等待两件作品载入 · ${parts}`;
    }
    if (mobile() && !(state.seen.a && state.seen.b)) return `请先切换到作品 ${state.seen.a ? 'B' : 'A'} 看一看`;
    if (needsEmail()) return '账号未绑定邮箱：可以体验，但这一组的选择不会计入榜单';
    return platform.user ? '体验过两件作品后，选出你更认可的一件' : '未登录：可以体验，但这一组的选择不会计入榜单';
  }

  function drawBar() {
    const bar = $('[data-bar]', el);
    if (state.error) {
      bar.innerHTML = '';
      return;
    }
    if (state.result) {
      const { choice, counted, reason } = state.result;
      bar.innerHTML = `<div class="vote-in is-result">
        <p class="vote-verdict"><b>${VERDICT[choice]}</b><span>${REASON[counted ? 'counted' : reason] ?? ''}${state.counted ? ` · 本次已计入 ${state.counted} 组` : ''}${!counted && reason === 'anonymous' ? ' <button class="link" data-auth="login">登录</button>' : ''}${!counted && reason === 'unbound' ? ' <button class="link" data-bind-email>绑定邮箱</button>' : ''}</span></p>
        <div class="vote-actions"><a class="btn" href="#/leaderboard/${esc(task.id)}">${icon('rank')}查看榜单</a><button class="btn primary" data-a="next">下一组<kbd>N</kbd></button></div>
      </div>`;
      return;
    }
    const ready = canVote();
    const disabled = ready && !state.busy ? '' : ' disabled';
    bar.innerHTML = `<div class="vote-in">
      <p class="vote-status">${status()}${!platform.user && state.match ? ' <button class="link" data-auth="login">登录</button>' : ''}${needsEmail() && state.match ? ' <button class="link" data-bind-email>绑定邮箱</button>' : ''}</p>
      <div class="vote-actions">
        <button class="btn vote" data-vote="a"${disabled}><kbd>A</kbd><span class="ab">A</span>更好</button>
        <button class="btn vote" data-vote="tie"${disabled}><kbd>S</kbd>不分伯仲</button>
        <button class="btn vote" data-vote="b"${disabled}><span class="ab">B</span>更好<kbd>D</kbd></button>
      </div>
      <button class="link vote-skip" data-vote="skip"${state.match && !state.busy ? '' : ' disabled'}>跳过这一组</button>
    </div>`;
  }

  function drawHeads() {
    // The strip comes off once, on the draw that first shows the names.
    const unseal = Boolean(state.result) && !state.unsealed;
    if (state.result) state.unsealed = true;
    for (const side of ['a', 'b']) {
      $(`[data-head="${side}"]`, el).innerHTML = state.result ? revealHead(side, unseal) : blindHead(side);
      $(`[data-side="${side}"].arena-pane`, el).classList.toggle('chosen', state.result?.choice === side);
      const dot = $(`[data-dot="${side}"]`, el);
      if (dot) dot.className = state.ready[side] ? 'is-ready' : '';
      $(`[data-rail-dot="${side}"]`, el).classList.toggle('is-ready', Boolean(state.ready[side]));
    }
    el.classList.toggle('is-revealed', Boolean(state.result));
    $('[data-round]', el).textContent = state.match ? `第 ${state.round} 组${state.result ? ' · 已揭晓' : ' · 匿名'}` : '正在准备';
  }

  function drawSide() {
    el.dataset.side = state.side;
    $$('[data-a="side"]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.side === state.side)));
  }

  // Each pane head carries its own controls toggle (once that work reports controls) and the
  // button that gives it the whole stage or hands the stage back.
  function paneTools(side) {
    const name = `作品 ${letter(side)}`;
    const shown = Boolean(state.controlsShown[side]);
    const full = layout() === side;
    const label = `${shown ? '收起' : '显示'}${name} 的控件`;
    const controls = state.controls[side] > 0
      ? `<button class="pane-tool" data-a="controls" data-side="${side}" aria-pressed="${shown}" title="${label}" aria-label="${label}">${icon('menu')}<span>控件</span></button>`
      : '';
    const fit = full ? '恢复并排' : `只看${name}`;
    return `<span class="arena-tools" data-tools="${side}">${controls}<button class="pane-close arena-fit" data-layout="${full ? 'ab' : side}" title="${fit}" aria-label="${fit}">${icon(full ? 'split' : 'full')}</button></span>`;
  }

  function drawControls() {
    for (const side of ['a', 'b']) {
      const tools = $(`[data-tools="${side}"]`, el);
      if (tools) tools.outerHTML = paneTools(side);
    }
    // Phones show one work at a time, so the switch row carries the toggle for the work on view.
    const phone = $('.arena-mcontrols', el);
    const label = `${state.controlsShown[state.side] ? '收起' : '显示'}作品 ${letter(state.side)} 的控件`;
    phone.hidden = !(state.controls[state.side] > 0);
    phone.setAttribute('aria-pressed', String(Boolean(state.controlsShown[state.side])));
    phone.setAttribute('aria-label', label);
    phone.title = label;
  }

  function syncControls(side) {
    $(`[data-body="${side}"] iframe`, el)?.contentWindow?.postMessage({ source: 'sp-arena', fold: !state.controlsShown[side] }, '*');
  }

  // Desktop split: state.split is A's share of the stage; 0 and 1 collapse one side to a rail. The
  // collapsed frame keeps a full-size viewport out of sight, so the work neither reloads nor sees a sliver.
  const SNAP = 0.1;
  const layout = () => state.split === 1 ? 'a' : state.split === 0 ? 'b' : 'ab';
  function drawSplit() {
    const bar = $('.split-bar', el);
    if (!bar) return;
    const stage = $('.arena-stage', el);
    const percent = Math.round(state.split * 100);
    stage.style.setProperty('--split', state.split);
    stage.style.setProperty('--stage-w', `${stage.clientWidth}px`);
    $('[data-side="a"].arena-pane', el).classList.toggle('is-collapsed', state.split === 0);
    $('[data-side="b"].arena-pane', el).classList.toggle('is-collapsed', state.split === 1);
    bar.setAttribute('aria-valuenow', String(percent));
    $('.split-read', bar).textContent = `A ${percent} · B ${100 - percent}`;
    $$('.arena-layout [data-layout]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === layout() && (layout() !== 'ab' || state.split === 0.5))));
    drawControls();
  }
  function remember() {
    if (state.split > 0 && state.split < 1) state.lastSplit = state.split;
  }
  function setLayout(kind) {
    if (state.error) return;
    if (kind === 'ab') state.split = layout() === 'ab' ? 0.5 : state.lastSplit;
    else {
      remember();
      state.split = kind === 'a' ? 1 : 0;
    }
    drawSplit();
  }
  function setSplit(value) {
    state.split = value < SNAP ? 0 : value > 1 - SNAP ? 1 : Math.abs(value - 0.5) < 0.02 ? 0.5 : Math.round(value * 1000) / 1000;
    drawSplit();
  }

  const onFold = (event) => {
    if (!state.match || event.data?.source !== 'sp-fold' || !(event.data.count > 0)) return;
    for (const side of ['a', 'b']) {
      const current = $(`[data-body="${side}"] iframe`, el);
      if (!current || event.source !== current.contentWindow) continue;
      state.controls[side] = event.data.count;
      drawControls();
      syncControls(side);
      break;
    }
  };
  addEventListener('message', onFold);

  const update = () => { drawHeads(); drawBar(); drawSide(); drawControls(); };

  function frame(side) {
    const body = $(`[data-body="${side}"]`, el);
    state.ready[side] = false;
    delete state.controls[side];
    body.innerHTML = `<iframe src="${esc(state.match[side])}" title="匿名作品 ${letter(side)}" sandbox="${SANDBOX}" allow="fullscreen; autoplay" allowfullscreen referrerpolicy="no-referrer"></iframe>
      <div class="loader blind"><span class="loader-letter" aria-hidden="true">${letter(side)}</span><div class="spinner" aria-hidden="true"></div><span>作品 ${letter(side)} 正在载入</span></div>`;
    const current = state.match;
    const iframe = $('iframe', body);
    iframe.addEventListener('load', () => {
      if (state.match !== current || $('iframe', body) !== iframe) return;
      state.ready[side] = true;
      syncControls(side);
      later(() => $('.loader', body)?.classList.add('gone'), 300);
      update();
    }, { once: true });
  }

  // The page follows the task on view: heading, prompt drawer, leaderboard link.
  function setTask(t) {
    task = t;
    document.title = `盲评 · ${t.title}`;
    $('[data-title]', el).textContent = t.title;
    $('[data-prompt-title]', el).textContent = t.title;
    $('[data-board]', el).href = `#/leaderboard/${t.id}`;
    $('[data-prompt-body]', el).innerHTML = `${referenceSheet(t.references, { key: t.id, credit: t.referenceCredit })}
        <pre class="arena-prompt-text">${linkReferences(t.prompt, t.references, t.id)}</pre>`;
    $('.guide', el).scrollTop = 0;
  }

  function drawMode() {
    const tag = $('[data-scope]', el);
    tag.hidden = !state.random;
    tag.textContent = `随机 · ${state.scope.length === ctx.DATA.tasks.filter(isOpen).length ? '全部题目' : `${state.scope.length} 道题`}`;
    $('.arena-mode', el).hidden = Boolean(state.error);
    $$('.arena-mode [data-mode]', el).forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.mode === 'random') === state.random)));
  }

  // The next task of a random round: any task in range the reader has not run out of, not the same one twice.
  function pickTask(previous) {
    const live = state.scope.filter((t) => isOpen(t) && !state.done.has(t.id));
    const fresh = live.filter((t) => t !== previous);
    const list = fresh.length ? fresh : live;
    return list[Math.floor(Math.random() * list.length)];
  }

  function setMode(random) {
    if (state.error || state.random === random) return;
    state.random = random;
    history.replaceState(history.state, '', `#/arena/${random ? RANDOM : task.id}`);
    drawMode();
  }

  // A new pair brings a new task: say so, and point at the prompt, which the judgement rests on.
  function noteSwitch() {
    $('.arena-switched', el)?.remove();
    const strip = document.createElement('div');
    strip.className = 'arena-switched';
    strip.setAttribute('role', 'status');
    strip.innerHTML = `<span>这一组换成了</span><b>${esc(task.title)}</b><button class="link" type="button" data-a="open-prompt">看提示词</button>`;
    $('.arena-stage', el).append(strip);
    later(() => { strip.classList.add('is-gone'); later(() => strip.remove(), 600); }, 4500);
  }

  function showError(error) {
    state.error = error;
    state.controls = {};
    $('.arena-layout', el).hidden = true;
    drawMode();
    const others = ctx.DATA.tasks.filter((t) => t !== task && isOpen(t) && !state.done.has(t.id));
    const exhausted = error.code === 'exhausted';
    const unavailable = exhausted && state.random && state.unavailable;
    $('.arena-stage', el).innerHTML = `<div class="board-empty arena-empty">
      <p class="board-empty-title">${esc(unavailable ? '当前范围暂时没有可继续盲评的组合' : exhausted ? (state.random ? '这个范围里的组合你都评过了' : '这道题的组合你都评过了') : error.message)}</p>
      <p>${unavailable ? '部分题目当前无法配对。换个范围继续，或稍后再来。' : exhausted ? `感谢你的每一次选择。${state.random ? '换个范围继续' : '换一道题继续'}，或去看看榜单的变化。` : '稍后再来，或者先去看看其他题目。'}</p>
      <div class="board-empty-actions">${others.slice(0, 3).map((t) => `<a class="btn" href="#/arena/${esc(t.id)}">${esc(t.title)}${icon('right')}</a>`).join('')}<a class="btn primary" href="#/leaderboard${state.random ? '' : `/${esc(task.id)}`}">${icon('rank')}查看榜单</a></div>
    </div>`;
    drawBar();
  }

  async function next() {
    if (state.busy || state.error) return;
    state.busy = true;
    const previous = state.match?.id;
    const earlier = task;
    $('.arena-switched', el)?.remove();
    // Every pair starts side by side at an even split, so the last pair's layout favours neither.
    Object.assign(state, { match: null, result: null, unsealed: false, ready: {}, seen: { a: true }, controls: {}, controlsShown: {}, split: 0.5, lastSplit: 0.5, side: 'a', slow: false });
    drawSplit();
    $$('[data-body]', el).forEach((body) => { body.innerHTML = `<div class="loader blind"><span class="loader-letter" aria-hidden="true">${letter(body.dataset.body)}</span><div class="spinner" aria-hidden="true"></div><span>正在抽取一组作品</span></div>`; });
    update();
    try {
      // Random rounds change task after the first pair; a task the reader has run out of drops out of the range.
      let pick = state.random && state.round > 0;
      for (;;) {
        if (pick) {
          const chosen = pickTask(earlier);
          if (!chosen) throw Object.assign(new Error('这个范围里的组合你都评过了'), { code: 'exhausted' });
          setTask(chosen);
        }
        try {
          state.match = await api('arena/matches', { method: 'POST', body: { task: task.id, previous: task === earlier ? previous : undefined } });
          break;
        } catch (error) {
          if (!state.random || !['exhausted', 'insufficient'].includes(error.code)) throw error;
          if (error.code === 'insufficient') state.unavailable = true;
          state.done.add(task.id);
          pick = true;
        }
      }
      if (state.round > 0 && task !== earlier) noteSwitch();
      state.round++;
      frame('a');
      frame('b');
      const current = state.match;
      later(() => { if (state.match === current && !(state.ready.a && state.ready.b)) { state.slow = true; update(); } }, 25000);
    } catch (error) {
      state.busy = false;
      return showError(error);
    }
    state.busy = false;
    update();
  }

  async function vote(choice) {
    if (state.busy || state.result || !state.match || (choice !== 'skip' && !canVote())) return;
    state.busy = true;
    drawBar();
    try {
      state.result = await api(`arena/matches/${state.match.id}/vote`, { method: 'POST', body: { choice } });
      if (state.result.counted) {
        state.counted++;
        platform.totals.votes++;
        if (platform.me) platform.me.votes++;
      }
    } catch (error) {
      toast(error.message);
      if (error.status === 404) { state.busy = false; return next(); }
    }
    state.busy = false;
    update();
  }

  function togglePrompt(force) {
    state.prompt = force ?? !state.prompt;
    el.classList.toggle('guide-open', state.prompt);
    $$('[data-a="prompt"]', el).forEach((b) => b.setAttribute('aria-pressed', String(state.prompt)));
  }

  el.addEventListener('click', (e) => {
    const voteButton = e.target.closest('[data-vote]');
    if (voteButton && !voteButton.disabled) return vote(voteButton.dataset.vote);
    const layoutButton = e.target.closest('[data-layout]');
    if (layoutButton) return setLayout(layoutButton.dataset.layout);
    const action = e.target.closest('[data-a]');
    if (!action) return;
    const kind = action.dataset.a;
    if (kind === 'next') next();
    else if (kind === 'prompt') togglePrompt();
    else if (kind === 'open-prompt') togglePrompt(true);
    else if (kind === 'mode') setMode(action.dataset.mode === 'random');
    else if (kind === 'controls') {
      const side = action.dataset.side ?? state.side;
      state.controlsShown[side] = !state.controlsShown[side];
      syncControls(side);
      drawControls();
    }
    else if (kind === 'reload' && state.match && !state.result) {
      frame(action.dataset.side ?? state.side);
      update();
    }
    else if (kind === 'side') {
      state.side = action.dataset.side;
      state.seen[state.side] = true;
      update();
    }
  });
  const onKey = (e) => {
    // Keys belong to a dialog or the reference viewer while either is open.
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.target.matches('input, textarea, select') || $('dialog[open]') || !$('#lightbox').hidden) return;
    const key = e.key.toLowerCase();
    if (key === 'a' || key === 'd' || key === 's') {
      if (!canVote() || state.busy) return;
      vote(key === 'a' ? 'a' : key === 'd' ? 'b' : 'tie');
    } else if (key === 'n' && state.result) next();
    else if (['1', '2', '3'].includes(key) && !mobile() && !e.target.closest('.split-bar')) setLayout({ 1: 'a', 2: 'ab', 3: 'b' }[key]);
    else if (key === 'escape' && state.prompt) togglePrompt(false);
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  const onResize = () => {
    if (!state.result) drawBar();
    drawSplit();
  };

  // Dragging the divider: the bar captures the pointer, and a shield over both frames keeps their
  // documents from swallowing the moves.
  const bar = $('.split-bar', el);
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    e.preventDefault();
    const stage = $('.arena-stage', el);
    const box = stage.getBoundingClientRect();
    bar.setPointerCapture(e.pointerId);
    stage.classList.add('is-dragging');
    const move = (ev) => setSplit((ev.clientX - box.left) / box.width);
    const end = () => {
      stage.classList.remove('is-dragging');
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', end);
      bar.removeEventListener('pointercancel', end);
      remember();
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
  });
  bar.addEventListener('dblclick', (e) => {
    if (e.target.closest('button')) return;
    state.lastSplit = 0.5;
    setSplit(0.5);
  });
  bar.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.05;
    if (e.key === 'ArrowLeft') setSplit(state.split - step);
    else if (e.key === 'ArrowRight') setSplit(state.split + step);
    else if (e.key === 'Home' || e.key === 'End') setSplit(e.key === 'Home' ? 0 : 1);
    else return;
    e.preventDefault();
    remember();
  });
  addEventListener('resize', onResize);

  // A choice that will not count only tries the page out. Say so once a session, before the first
  // pair is drawn, so signing in (or binding the email) from here starts a match that counts.
  let notice = null;
  function countNotice() {
    const unbound = needsEmail();
    return new Promise((resolve) => {
      let answer = 'try';
      notice = openDialog({
        title: unbound ? '绑定邮箱后才计票' : '登录后投票才计入',
        className: 'arena-login-sheet',
        body: `<p class="sheet-text">盲评对所有人开放，区别只在于这一票算不算数。</p>
          <ul class="vote-ways">
            <li class="is-try"><span class="vote-way-mark" aria-hidden="true"><span>体</span><span>验</span></span>
              <span><b>${unbound ? '未绑定邮箱' : '未登录'}</b><small>可以完整体验，选择不计入榜单</small></span></li>
            <li class="is-count"><span class="vote-way-mark" aria-hidden="true"><span>计</span><span>票</span></span>
              <span><b>登录并绑定邮箱</b><small>每对作品计一票，计入模型榜单</small></span></li>
          </ul>
          <div class="sheet-actions"><button class="btn" type="button" data-sheet-close>先体验</button><button class="btn primary" type="button" data-count>${unbound ? '绑定邮箱后开始' : '登录后开始'}${icon('right')}</button></div>
          ${unbound ? '' : '<p class="vote-ways-foot">还没有账号？<button class="link" type="button" data-register>注册</button></p>'}`,
        onClose: () => { notice = null; resolve(answer); },
      });
      notice.el.addEventListener('click', (e) => {
        const pick = e.target.closest('[data-count], [data-register]');
        if (!pick) return;
        answer = pick.matches('[data-count]') ? 'count' : 'register';
        notice.close();
      });
    });
  }

  let alive = true;
  async function start() {
    let seen = false;
    try { seen = sessionStorage.getItem(NOTICE) === '1'; } catch { /* private mode */ }
    if (platform.available && (!platform.user || needsEmail()) && !seen) {
      try { sessionStorage.setItem(NOTICE, '1'); } catch { /* private mode */ }
      const answer = await countNotice();
      if (answer === 'count' && alive) await requireUser('登录后，这一轮的选择会计入榜单。');
      if (answer === 'register' && alive) await openAuth({ mode: 'register' });
    }
    if (alive) next();
  }

  setTask(task);
  drawMode();
  start();
  return {
    fullscreen: true,
    onPlatformChange() { if (!state.error) update(); },
    destroy() {
      document.removeEventListener('keydown', onKey);
      removeEventListener('message', onFold);
      removeEventListener('resize', onResize);
      alive = false;
      notice?.close();
      timers.forEach(clearTimeout);
      document.body.classList.remove('is-viewer');
    },
  };
}
