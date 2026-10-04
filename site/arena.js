// Blind comparison: a lobby of tasks (#/arena) and the match itself (#/arena/<task>).
// The server picks every pair and hands out opaque frame addresses; nothing on this page
// knows which work is which until the vote comes back with the reveal.
import { $, $$, brandMark, esc, icon, pad, themeButton } from './ui.js';
import { api, isStaff, needsEmail, platform, reactionBar, toast } from './platform.js';
import { aigcLabel } from './legal.js';
import { domainsOf, matchesQuery, tracksOf } from './categories.js';
import { linkReferences, referenceSheet } from './references.js';

const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-downloads';
const VERDICT = { a: '你认为 A 更好', b: '你认为 B 更好', tie: '你认为不分伯仲', skip: '你跳过了这一组' };
const REASON = {
  counted: '已计入榜单',
  anonymous: '未登录，这一票没有计入榜单',
  unbound: '账号未绑定邮箱，这一票没有计入榜单',
  duplicate: '这一对作品你评过了，这次不重复计入',
  changed: '作品的核验状态刚刚变化，这一票没有计入',
  own: '其中有你上传的作品，不计入',
  skipped: '跳过的组合不计入榜单',
};

export function mount(root, ctx) {
  if (!ctx.param) return lobby(root, ctx);
  const task = ctx.DATA.tasks.find((t) => t.id === ctx.param);
  if (!task) {
    location.replace('#/arena');
    return {};
  }
  return match(root, ctx, task);
}

// The lobby follows the leaderboard: category views in the sidebar, one list on the right with the
// open tasks first and the ones still short of works folded away, the rules folded at the end.
function lobby(root, ctx) {
  const tracks = tracksOf(ctx.DATA.tasks);
  const view = { track: '', query: '' };
  const pool = (t) => platform.arena[t.id] ?? { works: 0, entries: 0 };
  const ready = (t) => pool(t).entries >= 2;
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
      <span class="arena-task-go">${open ? `开始${icon('right')}` : (p.works ? `还差 ${2 - p.entries} 个配置` : '暂无作品')}</span>
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
          </dl>${open.length ? `<button class="btn primary side-cta" data-random>${icon('blind')}随机一道题</button>` : ''}
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
    const open = openTasks();
    if (!e.target.closest('[data-random]') || !open.length) return;
    location.hash = `#/arena/${open[Math.floor(Math.random() * open.length)].id}`;
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

function match(root, ctx, task) {
  const state = { match: null, result: null, ready: {}, seen: {}, controls: {}, controlsShown: false, side: 'a', round: 0, counted: 0, busy: false, prompt: false, slow: false, error: null };
  const mobile = () => matchMedia('(max-width: 860px)').matches;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };

  document.body.classList.add('is-viewer');
  document.title = `盲评 · ${task.title}`;
  root.innerHTML = `<div class="viewer arena">
    <header class="vbar">
      ${ctx.backLink('vback')}
      <div class="arena-heading"><b>${esc(task.title)}</b><span data-round>正在准备</span></div>
      <div class="vtools">
        <button class="vtool" data-a="prompt" aria-pressed="false" title="查看提示词">${icon('guide')}<span class="vtool-text">提示词</span></button>
        <button class="vtool" data-a="controls" aria-pressed="false" aria-label="显示作品控件" title="显示作品控件" hidden>${icon('menu')}<span class="vtool-text">显示作品控件</span></button>
        <a class="vtool" href="#/leaderboard/${esc(task.id)}" title="这道题的榜单">${icon('rank')}<span class="vtool-text">榜单</span></a>
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
      <button class="pane-close" data-a="reload" title="重新载入当前作品" aria-label="重新载入当前作品">${icon('reload')}</button>
    </div>
    <div class="vmain">
      <div class="stage arena-stage">${['a', 'b'].map((side) => `<section class="pane arena-pane" data-side="${side}">
        <div class="arena-head" data-head="${side}"></div>
        <div class="pane-body" data-body="${side}"></div>
      </section>`).join('')}</div>
      <aside class="guide arena-prompt" aria-label="提示词"><div class="guide-in">
        <div class="guide-head"><div><p class="eyebrow">本题提示词</p><h2>${esc(task.title)}</h2></div><button class="icon-btn" data-a="prompt" aria-label="收起提示词">${icon('close')}</button></div>
        ${referenceSheet(task.references, { key: task.id, credit: task.referenceCredit })}
        <pre class="arena-prompt-text">${linkReferences(task.prompt, task.references, task.id)}</pre>
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
      <button class="pane-close" data-a="reload" data-side="${side}" title="重新载入作品 ${letter(side)}" aria-label="重新载入作品 ${letter(side)}">${icon('reload')}</button>`;
  }
  function revealHead(side, unseal) {
    const work = state.result[side];
    if (!work) return `<span class="pane-letter">${letter(side)}</span><span class="arena-who">作品已不可用</span>`;
    const model = ctx.modelOf({ model: work.model, modelName: work.modelName, vendor: work.vendor });
    const chosen = state.result.choice === side;
    return `<span class="pane-letter">${letter(side)}</span>${brandMark(model, 'brand-mark sm')}
      <span class="arena-who revealed"><b>${esc(work.modelName)}</b>${work.effort ? `<span class="badge">${esc(work.effort)}</span>` : ''}<small>${esc(work.title)}</small></span>
      ${chosen ? '<span class="arena-pick-seal" title="你的选择"><span>所</span><span>选</span></span>' : ''}
      ${reactionBar(`${task.id}/${work.id}`, { locked: work.status === 'questioned' })}
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
    }
    el.classList.toggle('is-revealed', Boolean(state.result));
    $('[data-round]', el).textContent = state.match ? `第 ${state.round} 组${state.result ? ' · 已揭晓' : ' · 匿名'}` : '正在准备';
  }

  function drawSide() {
    el.dataset.side = state.side;
    $$('[data-a="side"]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.side === state.side)));
  }

  function drawControls() {
    const button = $('[data-a="controls"]', el);
    const label = state.controlsShown ? '隐藏作品控件' : '显示作品控件';
    button.hidden = !Object.values(state.controls).some((count) => count > 0);
    button.setAttribute('aria-pressed', String(state.controlsShown));
    button.setAttribute('aria-label', label);
    button.title = label;
    $('.vtool-text', button).textContent = label;
  }

  function syncControls(frame) {
    frame.contentWindow?.postMessage({ source: 'sp-arena', fold: !state.controlsShown }, '*');
  }

  const onFold = (event) => {
    if (!state.match || event.data?.source !== 'sp-fold' || !(event.data.count > 0)) return;
    for (const side of ['a', 'b']) {
      const current = $(`[data-body="${side}"] iframe`, el);
      if (!current || event.source !== current.contentWindow) continue;
      state.controls[side] = event.data.count;
      drawControls();
      syncControls(current);
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
      syncControls(iframe);
      later(() => $('.loader', body)?.classList.add('gone'), 300);
      update();
    }, { once: true });
  }

  function showError(error) {
    state.error = error;
    state.controls = {};
    drawControls();
    const others = ctx.DATA.tasks.filter((t) => t !== task && (platform.arena[t.id]?.entries ?? 0) >= 2);
    const exhausted = error.code === 'exhausted';
    $('.arena-stage', el).innerHTML = `<div class="board-empty arena-empty">
      <p class="board-empty-title">${esc(exhausted ? '这道题的组合你都评过了' : error.message)}</p>
      <p>${exhausted ? '感谢你的每一次选择。换一道题继续，或去看看榜单的变化。' : '稍后再来，或者先去看看其他题目。'}</p>
      <div class="board-empty-actions">${others.slice(0, 3).map((t) => `<a class="btn" href="#/arena/${esc(t.id)}">${esc(t.title)}${icon('right')}</a>`).join('')}<a class="btn primary" href="#/leaderboard/${esc(task.id)}">${icon('rank')}查看榜单</a></div>
    </div>`;
    drawBar();
  }

  async function next() {
    if (state.busy || state.error) return;
    state.busy = true;
    const previous = state.match?.id;
    Object.assign(state, { match: null, result: null, unsealed: false, ready: {}, seen: { a: true }, controls: {}, controlsShown: false, side: 'a', slow: false });
    $$('[data-body]', el).forEach((body) => { body.innerHTML = `<div class="loader blind"><span class="loader-letter" aria-hidden="true">${letter(body.dataset.body)}</span><div class="spinner" aria-hidden="true"></div><span>正在抽取一组作品</span></div>`; });
    update();
    try {
      state.match = await api('arena/matches', { method: 'POST', body: { task: task.id, previous } });
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
    const action = e.target.closest('[data-a]');
    if (!action) return;
    const kind = action.dataset.a;
    if (kind === 'next') next();
    else if (kind === 'prompt') togglePrompt();
    else if (kind === 'controls') {
      state.controlsShown = !state.controlsShown;
      $$('[data-body] iframe', el).forEach(syncControls);
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
    else if (key === 'escape' && state.prompt) togglePrompt(false);
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  const onResize = () => { if (!state.result) drawBar(); };
  addEventListener('resize', onResize);

  next();
  return {
    fullscreen: true,
    onPlatformChange() { if (!state.error) update(); },
    destroy() {
      document.removeEventListener('keydown', onKey);
      removeEventListener('message', onFold);
      removeEventListener('resize', onResize);
      timers.forEach(clearTimeout);
      document.body.classList.remove('is-viewer');
    },
  };
}
