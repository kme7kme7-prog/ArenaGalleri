// The qualification test (#/exam): a Lv0 member judges standard pairs, two works of one question with a
// plain gap in quality, and picks the better one. Pass the mark and the account becomes Lv1. Nothing here
// knows which side is right; the server grades and answers only with a total.
import { $, $$, esc, formatDate, icon, themeButton } from './ui.js';
import { api, levelOf, levelText, openDialog, platform, refreshPlatform, toast } from './platform.js';
import { languageButton, setPageTitle } from './i18n.js';
import { aigcLabel } from './legal.js';
import { createHold, watchFrameLoad } from './arena-loading.js';

const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-downloads';
const HOLD_MS = 5000;
const layoutGlyph = (a, b) => `<svg viewBox="0 0 20 14" aria-hidden="true"><rect${a > 3 ? ' class="on"' : ''} x="1" y="1" width="${a}" height="12" rx="1.5"/><rect${b > 3 ? ' class="on"' : ''} x="${a + 3}" y="1" width="${b}" height="12" rx="1.5"/></svg>`;
const TIPS = ['两件作品都完整操作一遍，不只看第一屏。', '拖窄窗格或切到只看一件，看看窄屏下有没有错乱。', '打开提示词，对照要求逐条检查。'];

export function mount(root, ctx) {
  let alive = true, view = 'loading', info = null, attempt = null, outcome = null, failure = '';
  let teardownPlay = () => {};

  const exam = () => info?.exam ?? {};
  const total = () => attempt?.questionCount ?? exam().questionCount ?? 0;
  const required = () => attempt?.correctRequired ?? exam().correctRequired ?? 0;
  const answered = () => (platform.qualification?.activeAnswered ?? 0);

  // ---- the page around the test ----------------------------------------------------------
  const page = (heading, body, meta = '') => {
    document.body.classList.remove('is-viewer');
    root.innerHTML = `${ctx.pageStart({ title: '资格考试', section: 'new', heading,
      description: '看看你能不能在盲评里分辨出质量差异。通过后可以发起题目，你的选择也计入精选榜。',
      crumbs: [{ text: '资格考试' }],
      meta: `<dl class="side-stats"><div><dt>题量</dt><dd>${exam().questionCount ?? '—'}</dd></div><div><dt>及格</dt><dd>${exam().correctRequired ?? '—'}</dd></div></dl>${meta}` })}
      <section class="block wrap exam-page">${body}</section>${ctx.pageEnd()}`;
  };
  const empty = (title, text, actions) => `<div class="board-empty exam-empty"><p class="board-empty-title">${title}</p><p>${text}</p><div class="board-empty-actions">${actions}</div></div>`;

  async function loadInfo() {
    view = 'loading';
    page('资格考试', '<p class="muted" role="status">正在载入…</p>');
    setPageTitle(['资格考试', ctx.DATA.title]);
    if (!platform.user) return renderInfo();
    if (levelOf() >= 1) return renderInfo();
    try {
      info = await api('qualification');
      failure = '';
    } catch (error) {
      failure = error.message;
    }
    if (alive && view === 'loading') renderInfo();
  }

  function renderInfo() {
    view = 'info';
    if (!platform.user) {
      return page('资格考试', empty('登录后参加资格考试', '考试只有登录的成员可以参加。', '<button class="btn primary" data-auth="login">登录 / 注册</button><a class="btn" href="#/arena">去盲评</a>'));
    }
    if (levelOf() >= 1) {
      return page('资格考试', empty(`你已是 ${levelText(1)}`, '无需再考。去发起一道题吧。', `<a class="btn primary" href="#/new">发起题目${icon('right')}</a><a class="btn" href="#/arena">去盲评</a>`));
    }
    if (failure) return page('资格考试', `<p class="form-error" role="alert">${esc(failure)}</p><div class="board-empty-actions"><button class="btn primary" data-a="reload">重试</button></div>`);
    if (!exam().ready && !info.activeAttemptId) {
      return page('资格考试', empty('资格考试正在准备题目', '管理员挑好足够的标准对后就会开放。', '<a class="btn" href="#/arena">去盲评</a>'));
    }
    const resuming = Boolean(info.activeAttemptId);
    const last = info.lastResult;
    page('资格考试', `<div class="exam-intro">
      <div class="collection-heading"><h3>考什么</h3><span class="collection-caption">不限次数 · 不限时间</span></div>
      <ul class="checks">
        <li><b>${exam().questionCount} 组标准对</b>：每组是同一道题的两件作品，质量差距明显，选出更好的一件。至少选对 ${exam().correctRequired} 组。</li>
        <li><b>和真实盲评一样</b>：两件作品都载入后 5 秒才能选；可以并排、只看一件、打开提示词。</li>
        <li><b>不揭晓、不计榜</b>：考试不揭晓模型身份，选择也不计入任何榜单。交卷后只公布总分。</li>
      </ul>
      <p class="fine">中途离开会保存进度，下次从未答的地方继续。交卷前可以回看、改选。</p>
      ${last ? `<p class="exam-last">上次：<b>${last.correctCount} / ${last.questionCount}</b>${last.finishedAt ?? last.at ? ` · <time data-i18n-date="${esc(last.finishedAt ?? last.at)}">${esc(formatDate(last.finishedAt ?? last.at))}</time>` : ''}</p>` : ''}
      <div class="exam-actions">
        <button class="btn primary" data-a="start">${resuming ? `继续上次的答卷${platform.qualification ? ` · 已答 ${answered()} / ${platform.qualification.questionCount}` : ''}` : '开始考试'}${icon('right')}</button>
        ${resuming && exam().ready ? '<button class="btn" data-a="restart">放弃并重新开始</button>' : ''}
      </div></div>`);
  }

  async function begin(restart = false) {
    const buttons = $$('[data-a="start"], [data-a="restart"]', root);
    buttons.forEach((b) => { b.disabled = true; });
    try {
      const data = await api('qualification/attempts', { method: 'POST', body: restart ? { restart: true } : {} });
      if (!alive) return;
      attempt = data.attempt;
      play();
    } catch (error) {
      if (!alive) return;
      buttons.forEach((b) => { b.disabled = false; });
      if (error.code === 'exam_not_ready') { info = { ...info, exam: { ...exam(), ready: false } }; return renderInfo(); }
      toast(error.message);
    }
  }

  async function restartAsk() {
    const ok = await new Promise((resolve) => {
      let yes = false;
      const sheet = openDialog({ title: '放弃当前答卷？', className: 'confirm-sheet',
        body: '<p class="sheet-text">已答的题目不会保留，重新开始会重新抽题。</p><div class="sheet-actions"><button class="btn" type="button" data-sheet-close>取消</button><button class="btn primary danger" type="button" data-yes>放弃并重新开始</button></div>',
        onClose: () => resolve(yes) });
      $('[data-yes]', sheet.el).addEventListener('click', () => { yes = true; sheet.close(); });
    });
    if (ok && alive) void begin(true);
  }

  // ---- answering --------------------------------------------------------------------------
  function play() {
    teardownPlay();
    view = 'play';
    const items = attempt.items;
    const st = { index: Math.max(0, items.findIndex((item) => !item.answer)), ready: {}, seen: { a: true }, side: 'a', split: 0.5, last: 0.5, prompt: false, busy: false, saved: false, unavailable: false, loadErrors: {} };
    const stops = new Map();
    const timers = new Set();
    const mobile = () => matchMedia('(max-width: 860px)').matches;
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
    const hold = createHold(() => tick());
    const item = () => items[st.index];
    const bothReady = () => Boolean(st.ready.a && st.ready.b);
    const open = () => Boolean(item().answer) || hold.left('answer', HOLD_MS) <= 0;
    const canAnswer = () => bothReady() && open() && !st.busy && !st.unavailable && (!mobile() || (st.seen.a && st.seen.b));
    const letter = (side) => side.toUpperCase();
    const seconds = (ms) => Math.ceil(ms / 1000);

    document.body.classList.add('is-viewer');
    root.innerHTML = `<div class="viewer arena exam">
      <header class="vbar">
        <button class="vback" type="button" data-a="leave">${icon('prev')}<span class="back-text">退出考试</span></button>
        <div class="arena-heading"><b><span>资格考试</span></b><span data-round></span></div>
        <div class="exam-dots" role="group" aria-label="答题进度"></div>
        <div class="vtools">
          <button class="vtool" data-a="prompt" aria-pressed="false" title="查看提示词">${icon('guide')}<span class="vtool-text">提示词</span></button>
          <div class="seg arena-layout" role="group" aria-label="对比布局">
            <button data-layout="a" aria-pressed="false" title="只看 A（1）" aria-label="只看作品 A">${layoutGlyph(13, 3)}</button>
            <button data-layout="ab" aria-pressed="true" title="并排（2）" aria-label="并排">${layoutGlyph(8, 8)}</button>
            <button data-layout="b" aria-pressed="false" title="只看 B（3）" aria-label="只看作品 B">${layoutGlyph(3, 13)}</button>
          </div>
          <span class="vdivider" aria-hidden="true"></span>
          ${themeButton('vtool icon-only')}
          ${languageButton('vtool')}
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
          <button class="arena-rail" data-layout="ab" title="展开作品 ${letter(side)}"><span class="pane-letter">${letter(side)}</span><span class="arena-dot" data-rail-dot="${side}"></span><span class="arena-rail-text">展开作品 ${letter(side)}</span>${icon(side === 'a' ? 'next' : 'prev')}</button>
          <div class="arena-head"><span class="pane-letter">${letter(side)}</span><span class="arena-who">匿名作品</span>${aigcLabel()}<span class="arena-dot" data-head-dot="${side}" role="img" aria-label="载入中"></span>
            <button class="pane-close" data-a="reload" data-side="${side}" title="重新载入作品 ${letter(side)}" aria-label="重新载入作品 ${letter(side)}">${icon('reload')}</button>
            <button class="pane-close arena-fit" data-layout="${side}" title="只看作品 ${letter(side)}" aria-label="只看作品 ${letter(side)}">${icon('full')}</button></div>
          <div class="pane-body" data-body="${side}"></div>
        </section>${side === 'a' ? `<div class="split-bar" role="separator" aria-orientation="vertical" aria-label="作品 A、B 的宽度"><span class="split-read" aria-hidden="true"></span>
          <span class="split-grip"><button data-layout="b" title="收起 A，只看 B" aria-label="收起作品 A">${icon('prev')}</button><i></i><button data-layout="a" title="收起 B，只看 A" aria-label="收起作品 B">${icon('next')}</button></span></div>` : ''}`).join('')}</div>
        <aside class="guide arena-prompt" aria-label="提示词"><div class="guide-in">
          <div class="guide-head"><div><p class="eyebrow">本题提示词</p><h2 data-prompt-title data-i18n-ignore></h2></div><button class="icon-btn" data-a="prompt" aria-label="收起提示词">${icon('close')}</button></div>
          <pre class="arena-prompt-text" data-prompt-body data-i18n-ignore></pre>
        </div></aside>
      </div>
      <footer class="vote-bar" data-bar></footer>
      <p class="sr" role="status" aria-live="polite" data-live></p>
    </div>`;
    const el = $('.exam', root);
    setPageTitle(['资格考试', ctx.DATA.title]);

    const frame = (side) => $(`[data-body="${side}"] iframe`, el);
    const layoutOf = () => (st.split === 1 ? 'a' : st.split === 0 ? 'b' : 'ab');
    function drawSplit() {
      const stage = $('.arena-stage', el);
      const percent = Math.round(st.split * 100);
      stage.style.setProperty('--split', st.split);
      stage.style.setProperty('--stage-w', `${stage.clientWidth}px`);
      $('[data-side="a"].arena-pane', el).classList.toggle('is-collapsed', st.split === 0);
      $('[data-side="b"].arena-pane', el).classList.toggle('is-collapsed', st.split === 1);
      $('.split-read', el).textContent = `A ${percent} · B ${100 - percent}`;
      $$('.arena-layout [data-layout]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layout === layoutOf())));
    }
    function setLayout(kind) {
      if (kind === 'ab') st.split = layoutOf() === 'ab' ? 0.5 : st.last;
      else {
        if (st.split > 0 && st.split < 1) st.last = st.split;
        st.split = kind === 'a' ? 1 : 0;
      }
      drawSplit();
    }

    function dots() {
      $('.exam-dots', el).innerHTML = items.map((it, i) => `<button type="button" class="exam-dot${it.answer ? ' is-done' : ''}${i === st.index ? ' is-current' : ''}" data-go="${i}"${it.answer || i === st.index ? '' : ' disabled'} aria-label="第 ${i + 1} 组${it.answer ? '，已答' : ''}"${i === st.index ? ' aria-current="step"' : ''}></button>`).join('');
      $('[data-round]', el).textContent = `第 ${st.index + 1} / ${items.length} 组`;
    }

    function status() {
      if (st.unavailable) return '';
      if (st.saved) return `已记录第 ${st.index + 1} 组 · 正在载入下一组`;
      if (!bothReady()) {
        const parts = ['a', 'b'].map((side) => `${letter(side)} ${st.ready[side] ? '已就绪' : st.loadErrors[side] ? '载入超时' : '载入中'}`).join(' · ');
        return `等待两件作品载入 · ${parts}`;
      }
      const unseen = mobile() && !(st.seen.a && st.seen.b) ? (st.seen.a ? 'B' : 'A') : '';
      const wait = open() ? 0 : hold.left('answer', HOLD_MS);
      if (wait > 0) return unseen ? `${seconds(wait)} 秒后可选择 · 请先切换到作品 ${unseen} 看一看` : `先体验一下，${seconds(wait)} 秒后可以选择`;
      if (unseen) return `请先切换到作品 ${unseen} 看一看`;
      return item().answer ? `你选了 ${letter(item().answer)} · 可以改选` : '选出质量更好的一件';
    }
    let shown = '';
    function drawBar() {
      const bar = $('[data-bar]', el);
      if (st.unavailable) { bar.innerHTML = ''; return; }
      const off = canAnswer() ? '' : ' disabled';
      const mark = (side) => (item().answer === side ? ' is-held' : '');
      const counting = bothReady() && !open();
      shown = status();
      bar.innerHTML = `<div class="vote-in exam-bar">
        ${counting ? `<span class="vote-gate" data-gate style="--gate: ${HOLD_MS}ms; animation-delay: -${Math.round(hold.waited)}ms" aria-hidden="true"></span>` : ''}
        <p class="vote-status"><span data-status>${shown}</span></p>
        <div class="vote-actions">
          <button class="btn vote${mark('a')}" data-pick="a"${off}><kbd>A</kbd><span class="ab">A</span>更好</button>
          <button class="btn vote${mark('b')}" data-pick="b"${off}><span class="ab">B</span>更好<kbd>D</kbd></button>
        </div>${items.every((it) => it.answer) ? '<button class="btn" type="button" data-a="submit">交卷</button>' : '<span></span>'}</div>`;
    }
    function sync() {
      const text = status();
      const node = $('[data-status]', el);
      if (node && shown !== text) { shown = text; node.textContent = text; }
      $$('[data-pick]', el).forEach((b) => { b.disabled = !canAnswer(); });
      if (open()) $('[data-gate]', el)?.classList.add('is-done');
    }
    function tick() {
      if (view !== 'play') return hold.stop();
      sync();
      if (open()) { hold.stop(); live('现在可以选择'); }
    }
    const live = (text) => { $('[data-live]', el).textContent = text; };
    const heads = () => {
      if (st.unavailable) return;
      for (const side of ['a', 'b']) {
        $(`[data-head-dot="${side}"]`, el).classList.toggle('is-ready', Boolean(st.ready[side]));
        $(`[data-rail-dot="${side}"]`, el).classList.toggle('is-ready', Boolean(st.ready[side]));
        const dot = $(`[data-dot="${side}"]`, el);
        if (dot) dot.className = st.ready[side] ? 'is-ready' : '';
      }
      $$('[data-a="side"]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.side === st.side)));
      el.dataset.side = st.side;
    };
    const update = () => { dots(); heads(); drawBar(); };

    function layer(src, side) {
      const node = document.createElement('div');
      node.className = 'arena-layer';
      node.innerHTML = `<iframe src="${esc(src)}" title="匿名作品 ${letter(side)}" sandbox="${SANDBOX}" allow="fullscreen; autoplay" allowfullscreen referrerpolicy="no-referrer"></iframe>
        <div class="loader blind"><span class="loader-letter" aria-hidden="true">${letter(side)}</span><div class="spinner" aria-hidden="true"></div><span>作品 ${letter(side)} 正在载入</span></div>`;
      const iframe = $('iframe', node);
      stops.set(side, watchFrameLoad(iframe, {
        onReady() {
          if (!alive || !node.isConnected || frame(side) !== iframe) return;
          st.ready[side] = true;
          delete st.loadErrors[side];
          later(() => $('.loader', node)?.classList.add('gone'), 300);
          if (bothReady()) startHold();
          else update();
        },
        onSlow() {
          if (!alive || !node.isConnected || frame(side) !== iframe) return;
          st.loadErrors[side] = true;
          $('.loader', node).innerHTML = `<span>作品 ${letter(side)} 尚未完成载入</span><span>可以重新载入这一侧，或继续等待。</span><button class="btn" data-a="reload" data-side="${side}">重新载入作品 ${letter(side)}</button>`;
          update();
        },
      }));
      return node;
    }
    function load(side) {
      stops.get(side)?.();
      hold.reset();
      st.ready[side] = false;
      delete st.loadErrors[side];
      $(`[data-body="${side}"]`, el).replaceChildren(layer(item()[side], side));
    }
    function unload() {
      readyRun++;
      stops.forEach((stop) => stop());
      stops.clear();
      st.ready = {};
      st.loadErrors = {};
      hold.reset();
      for (const side of ['a', 'b']) $(`[data-body="${side}"]`, el).replaceChildren();
    }

    // An item whose works are gone ends the test where it stands; progress stays with the attempt.
    function gone() {
      unload();
      st.unavailable = true;
      for (const body of $$('[data-body]', el)) body.innerHTML = '';
      $('.arena-stage', el).innerHTML = empty('这一组的作品已下架', '需要重新开始考试。已有进度保留在记录里。', '<button class="btn primary" data-a="restart">重新开始</button><button class="btn" data-a="leave">退出考试</button>');
      live('');
      update();
    }
    // The five seconds start when the server hears both sides are ready: keep telling it until it does.
    let readyRun = 0;
    const markAnswer = ({ answerAllowedAt, serverNow }) => {
      hold.mark('answer', performance.now() + Date.parse(answerAllowedAt) - Date.parse(serverNow));
      if (!open()) hold.resume();
      sync();
    };
    function sendReady() {
      const run = ++readyRun;
      const go = () => run === readyRun && api(`qualification/attempts/${attempt.id}/items/${item().id}/ready`, { method: 'POST', body: {} }).then((r) => {
        if (run === readyRun) markAnswer(r);
      }).catch((error) => {
        if (run !== readyRun || !alive) return;
        if (error.code === 'exam_item_unavailable') gone();
        else later(go, 2000);
      });
      go();
    }
    function startHold() {
      hold.begin();
      live(item().answer ? '' : `${seconds(HOLD_MS)} 秒后可以选择`);
      sendReady();
      update();
    }

    function show(index) {
      st.index = index;
      st.saved = false;
      st.side = 'a';
      st.seen = { a: true };
      st.split = 0.5;
      st.last = 0.5;
      unload();
      $('[data-prompt-title]', el).textContent = item().question?.title ?? '';
      $('[data-prompt-body]', el).textContent = item().question?.prompt ?? '';
      $('.guide', el).scrollTop = 0;
      drawSplit();
      for (const side of ['a', 'b']) load(side);
      update();
    }

    // The links of a long test run out; the attempt hands out fresh ones without touching the answers.
    async function reloadSide(side) {
      try {
        const data = await api(`qualification/attempts/${attempt.id}`);
        if (!alive || view !== 'play') return;
        const fresh = data.attempt.items.find((it) => it.id === item().id);
        if (fresh) Object.assign(item(), { a: fresh.a, b: fresh.b });
      } catch (error) {
        if (error.code === 'exam_item_unavailable') return gone();
      }
      load(side);
      update();
    }

    function nextOpen(from) {
      const order = [...items.keys()];
      return order.slice(from + 1).concat(order.slice(0, from)).find((i) => !items[i].answer);
    }

    async function pick(choice) {
      if (!canAnswer()) return;
      const current = item();
      st.busy = true;
      drawBar();
      try {
        const saved = await api(`qualification/attempts/${attempt.id}/items/${current.id}/answer`, { method: 'PUT', body: { choice } });
        if (!alive || item() !== current) return;
        current.answer = choice;
        attempt.answeredCount = saved.answeredCount ?? items.filter((it) => it.answer).length;
        st.busy = false;
        st.saved = true;
        update();
        const next = nextOpen(st.index);
        if (next === undefined) {
          later(() => { st.saved = false; update(); submitSheet(); }, 350);
        } else later(() => { if (alive && view === 'play') show(next); }, 450);
      } catch (error) {
        if (!alive || item() !== current) return;
        st.busy = false;
        if (error.code === 'exam_item_unavailable') return gone();
        if (error.code === 'answer_too_early') {
          if (error.data?.answerAllowedAt) markAnswer(error.data);
          else sendReady();
        } else toast(error.message);
        update();
      }
    }

    function submitSheet() {
      let target = null;
      const sheet = openDialog({ title: '交卷', className: 'confirm-sheet exam-submit',
        body: `<p class="sheet-text">${items.length} 组都已作答。交卷后马上出结果，没通过可以立刻重考。</p><p class="form-error" role="alert"></p>
          <div class="sheet-actions"><button class="btn" type="button" data-review>回看答案</button><button class="btn primary" type="button" data-submit>交卷</button></div>`,
        onClose: () => { if (target !== null && alive && view === 'play') show(target); } });
      $('[data-review]', sheet.el).addEventListener('click', () => { target = 0; sheet.close(); });
      $('[data-submit]', sheet.el).addEventListener('click', async (e) => {
        const button = e.currentTarget, line = $('.form-error', sheet.el);
        button.disabled = true;
        line.textContent = '';
        try {
          const result = await api(`qualification/attempts/${attempt.id}/submit`, { method: 'POST', body: {} });
          outcome = result;
          sheet.close();
          if (!alive) return;
          if (result.passed) {
            if (result.user) platform.user = { ...platform.user, ...result.user };
            void refreshPlatform('session');
          }
          result_();
        } catch (error) {
          if (error.code === 'exam_incomplete') {
            const open = items.findIndex((it) => !it.answer);
            line.textContent = `还有 ${items.length - (error.data?.answeredCount ?? items.filter((it) => it.answer).length)} 组没答`;
            if (open >= 0) { target = open; sheet.close(); }
          } else line.textContent = `交卷没有成功：${error.message}。答案已保存，请重试`;
          button.disabled = false;
        }
      });
    }

    function leave() {
      toast('进度已保存');
      cleanup();
      view = 'loading';
      page('资格考试', '<p class="muted" role="status">正在载入…</p>');
      void refreshPlatform('session').finally(() => { if (alive) void loadInfo(); });
    }

    const onClick = (e) => {
      const go = e.target.closest('[data-go]');
      if (go) { if (!st.busy && !st.unavailable) show(Number(go.dataset.go)); return; }
      const pickButton = e.target.closest('[data-pick]');
      if (pickButton) { void pick(pickButton.dataset.pick); return; }
      const layoutButton = e.target.closest('[data-layout]');
      if (layoutButton) { setLayout(layoutButton.dataset.layout); return; }
      const action = e.target.closest('[data-a]');
      if (!action) return;
      const kind = action.dataset.a;
      if (kind === 'prompt') {
        st.prompt = !st.prompt;
        el.classList.toggle('guide-open', st.prompt);
        $$('[data-a="prompt"]', el).forEach((b) => b.setAttribute('aria-pressed', String(st.prompt)));
      } else if (kind === 'side') { st.side = action.dataset.side; st.seen[st.side] = true; update(); }
      else if (kind === 'reload') void reloadSide(action.dataset.side ?? st.side);
      else if (kind === 'leave') leave();
      else if (kind === 'submit') submitSheet();
      else if (kind === 'restart') { cleanup(); void begin(true); }
    };
    el.addEventListener('click', onClick);
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.target.matches('input, textarea, select') || $('dialog[open]')) return;
      const key = e.key.toLowerCase();
      if (key === 'a' || key === 'd') {
        if (bothReady() && !open()) {
          const node = $('[data-status]', el);
          node?.classList.remove('is-flash');
          void node?.offsetWidth;
          node?.classList.add('is-flash');
        } else void pick(key === 'a' ? 'a' : 'b');
      } else if (['1', '2', '3'].includes(key) && !mobile()) setLayout({ 1: 'a', 2: 'ab', 3: 'b' }[key]);
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    const onVisibility = () => { hold.touch(); el.classList.toggle('is-away', document.hidden); };
    document.addEventListener('visibilitychange', onVisibility);
    const onResize = () => { drawSplit(); drawBar(); };
    addEventListener('resize', onResize);

    function cleanup() {
      readyRun++;
      hold.stop();
      stops.forEach((stop) => stop());
      stops.clear();
      timers.forEach(clearTimeout);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      removeEventListener('resize', onResize);
      teardownPlay = () => {};
    }
    teardownPlay = cleanup;
    show(st.index);
  }

  // ---- the result -------------------------------------------------------------------------
  function result_() {
    teardownPlay();
    view = 'result';
    const { correctCount, questionCount, passed } = outcome;
    const need = outcome.correctRequired ?? required();
    page('资格考试', `<div class="exam-result${passed ? ' is-pass' : ''}">
      <p class="exam-score"><b>${correctCount}</b> / ${questionCount}${passed ? '<span class="exam-stamp" aria-label="及格"><span>及格</span></span>' : ''}</p>
      ${passed
    ? `<h3>你已升为 ${levelText(1)}</h3><p>现在可以发起题目，之后的盲评选择也会计入精选榜。此前的选择不追溯。</p>
        <div class="exam-actions"><a class="btn primary" href="#/new">发起题目${icon('right')}</a><a class="btn" href="#/arena">继续盲评</a></div>`
    : `<p class="exam-need">及格需要至少选对 ${need} 组</p><h3>还差一点</h3>
        <ul class="checks is-plain">${TIPS.map((tip) => `<li>${tip}</li>`).join('')}</ul>
        <div class="exam-actions"><button class="btn primary" data-a="restart">重新考试</button><a class="btn" href="#/arena">先去盲评练练</a></div>
        <p class="fine">不限次数。每次重考都会重新抽题。</p>`}
    </div>`);
  }

  root.onclick = (e) => {
    const action = e.target.closest('[data-a]');
    if (!action || view === 'play') return;
    const kind = action.dataset.a;
    if (kind === 'start') void begin(false);
    else if (kind === 'restart') { if (view === 'info') void restartAsk(); else void begin(true); }
    else if (kind === 'reload') loadInfo();
  };

  void loadInfo();
  return {
    fullscreen: false,
    onPlatformChange(reason) {
      if (reason === 'identity' && view !== 'play') { void loadInfo(); return; }
      if (reason === 'identity' && view === 'play') { teardownPlay(); void loadInfo(); }
    },
    destroy() {
      alive = false;
      teardownPlay();
      root.onclick = null;
      document.body.classList.remove('is-viewer');
    },
  };
}
