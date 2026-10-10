import { $$, esc, icon, img, brandMark, reducedMotion } from './ui.js';
import { catalogState, platform } from './platform.js';
import { screenshotOf } from './work-preview-media.js';

const time = (r) => Date.parse(r.addedAt) || 0;
// Short tab names: "机械键盘 · 交互式产品配置器" → "机械键盘".
const shortTitle = (t) => t.title.split(' · ')[0];
// 36 → 三十六, so the count reads in the same register as 「回字有四样写法」.
const DIGITS = '零一二三四五六七八九';
const hanzi = (n) => (n < 10 ? DIGITS[n] : n < 100 ? `${n >= 20 ? DIGITS[Math.floor(n / 10)] : ''}十${n % 10 ? DIGITS[n % 10] : ''}` : String(n));
// A plain-text line of the prompt, skipping section heads such as 【任务】 and list markers.
const promptLine = (t) => (t.promptPending || !t.prompt ? t.summary : t.prompt.split(/\r?\n/).map((line) => line.trim())
  .filter((line) => line && !/^(【.*】|#)/.test(line)).map((line) => line.replace(/^(-|\d+[.、])\s*/, '')).join(' ').slice(0, 120));
// Resting places in the deck, front card first: the rest fan out behind it.
const SLOTS = [
  'translate(0, 0) rotate(0deg) scale(1)',
  'translate(9%, -6%) rotate(3deg) scale(.93)',
  'translate(-8%, -4%) rotate(-3.5deg) scale(.89)',
  'translate(16%, -11%) rotate(6deg) scale(.84)',
  'translate(-15%, -9%) rotate(-6.5deg) scale(.8)',
];
// Long enough to look at each shot; a question shows three of its answers before the next one comes up.
const SHUFFLE = 4800;
const QUESTION = SHUFFLE * 3;
// Every move shares one curve that starts gently and settles softly; leaving ones only speed up.
const EASE = 'cubic-bezier(.45, 0, .2, 1)', EXIT = 'cubic-bezier(.5, 0, .75, 0)';
const MOVE = 900, LEAVE = 520, SWAP = 400;
// Below the front of the stack, where a card goes as it leaves; behind the stack, where new cards come from.
const OUT = 'translate(3%, 14%) rotate(-2deg) scale(.95)';
const BEHIND = 'translate(0, -16%) scale(.74)';
// Headline couplets: an old story of one thing done many ways, then this question's answer count at {n}.
// Each line stays short enough to sit on one line; the font shrinks to the longer of the two.
// The last field picks the typeface: song for classics and poetry, kai for the painting and anecdote stories,
// wei for Western art, hei for sayings. Their woff2 subsets hold only this file's characters, so after
// adding a character, rerun scripts/verse-fonts.py.
const VERSES = [
  ['回字有四样写法，', '这道题有{n}种', '鲁迅《孔乙己》', 'song'],
  ['一月在天，万川各映其影；', '一题在此，{n}份各成其页', '朱熹 · 月印万川', 'song'],
  ['同一阵风，吹过万窍；', '同一道题，吹出{n}种声音', '《庄子·齐物论》夫吹万不同', 'song'],
  ['君子和而不同，', '这道题，{n}份各不相同', '《论语·子路》', 'song'],
  ['《兰亭》满纸「之」字，笔笔不同；', '这道题{n}份答卷，亦然', '王羲之《兰亭集序》', 'kai'],
  ['同临一本《兰亭》，虞褚各异；', '同接一道题，{n}份各异', '唐摹《兰亭》诸本', 'kai'],
  ['同一个词牌，千家填出千种词；', '同一道题，写出{n}张网页', '词牌与填词', 'song'],
  ['《璇玑图》八百余字，读出七千余首；', '一道题，写出{n}张网页', '苏蕙《璇玑图》', 'song'],
  ['李白说，眼前有景道不得；', '这道题，{n}份都道了', '相传李白题黄鹤楼', 'song'],
  ['谢安问雪，得两答：撒盐、柳絮；', '这一问，得{n}答', '《世说新语·言语》', 'kai'],
  ['嘉陵三百里，吴一日，李数月；', '同一道题，{n}份各有快慢', '朱景玄《唐朝名画录》', 'kai'],
  ['夫子问：盍各言尔志？', '一道题，{n}份各言其志', '《论语·公冶长》', 'song'],
  ['野水无人渡，众工只画空舟；', '{n}份答卷，看谁画出那支笛', '邓椿《画继》', 'kai'],
  ['旗亭画壁，三位诗人听曲较高下；', '这道题，{n}份同台较高下', '薛用弱《集异记》', 'kai'],
  ['贾岛为一个字，推敲了半日；', '这道题，{n}份各落其笔', '《刘公嘉话》', 'kai'],
  ['盲人摸象，各执一端；', '{n}份答卷，摸同一头象', '《大般涅槃经》', 'kai'],
  ['一段咏叹调，巴赫写出三十段变奏；', '一道题，写出{n}种解法', '巴赫《哥德堡变奏曲》', 'wei'],
  ['一件小事，格诺写了九十九遍；', '这道题，被写了{n}遍', '雷蒙·格诺《风格练习》', 'wei'],
  ['一座教堂，莫奈画了三十余次；', '一道题，交出{n}份', '莫奈《鲁昂大教堂》', 'wei'],
  ['一座富士山，画成三十六景；', '一道题，写成{n}张网页', '葛饰北斋《富岳三十六景》', 'wei'],
  ['一千个读者，一千个哈姆雷特；', '一道题，{n}张网页', '西谚', 'wei'],
  ['横看成岭侧成峰，', '同一道题，{n}种网页', '苏轼《题西林壁》', 'song'],
  ['八仙过海，各显神通；', '这回过海的，有{n}份', '俗语', 'hei'],
  ['龙生九子，各有不同；', '这道题，生了{n}个', '俗语', 'hei'],
  ['照葫芦画瓢，', '一个葫芦，画出{n}只瓢', '俗语', 'hei'],
  ['一样米养百样人，', '一道题，养出{n}张网页', '俗语', 'hei'],
  ['标准答案只有一个，', '这道题有{n}个', '考场', 'hei'],
  ['一题多解是数学课上的事，', '这道题，解出{n}种', '课堂', 'hei'],
  ['殊途同归？这里是同途殊归：', '一个起点，{n}个终点', '反用《周易·系辞》', 'song'],
  ['百家争鸣在两千年前，', '今天，{n}份同题争鸣', '先秦诸子', 'song'],
];
const FACES = { song: 'Verse Song', kai: 'Verse Kai', wei: 'Verse Wei', hei: 'Verse Hei' };
// A random item of the list, leaving out the ones in `recent`.
const pick = (list, recent = []) => {
  const pool = list.filter((item) => !recent.includes(item));
  return pool[Math.floor(Math.random() * pool.length)];
};

// Open the home layout before the authoritative catalog arrives. Counts and
// work links stay out of this shell until the platform has supplied them.
function mountWaiting(root, ctx) {
  const failed = catalogState() === 'error';
  root.innerHTML = `${ctx.header([], false, '', { notice: false })}<main class="landing page home-pending">
    <section class="home-hero" aria-labelledby="home-title">
      <div class="home-copy">
        <div class="home-verse" style="--len:10">
          <h1 id="home-title"><span class="home-verse-a">同一份提示词，</span><span class="home-verse-b">各有自己的答案<span class="home-stop">。</span></span></h1>
          <p class="home-cite">亿模亿样 · 模型效果对比</p>
        </div>
        <p class="home-lede">同一份提示词交给不同的 AI 模型，并排打开，<span>差距一眼可见。</span></p>
        <div class="home-actions"><a class="btn home-enter" href="#/questions"><span>浏览全部题目</span>${icon('right')}</a><a class="home-link" href="#/arena">进入盲评${icon('right')}</a></div>
        <p class="home-proof">${failed ? '连接恢复后，最新作品会显示在这里。' : '先看看这里，最新作品马上呈上。'}</p>
      </div>
      <div class="home-stage">
        <div class="home-deck-frame">
          <div class="home-deck home-pending-deck" aria-busy="${!failed}" aria-label="作品展示区">
            <div class="home-window home-placeholder" aria-hidden="true"><span class="home-window-bar"><span class="home-window-dots"><i></i><i></i><i></i></span></span><span class="home-window-shot"></span></div>
            <div class="home-pending-status" role="status">
              <span class="spinner" aria-hidden="true"${failed ? ' hidden' : ''}></span>
              <strong>${failed ? '作品暂时未能载入' : '正在摆好作品…'}</strong>
              <p>${failed ? esc(platform.mismatch ? '页面版本已更新，请刷新后继续。' : platform.connectionError?.message) : '最新题目与作品正在加载'}</p>
              ${failed ? platform.mismatch ? '<button type="button" class="btn sm" data-reload>刷新页面</button>' : '<button type="button" class="btn sm" data-platform-reconnect>重新连接</button>' : ''}
            </div>
          </div>
          <div class="home-slip home-pending-slip" aria-hidden="true"><span class="home-slip-kicker">提示词</span><span></span><span></span></div>
        </div>
      </div>
      <div class="home-foot"><span class="home-pending-caption">同一道题，多种表达。</span></div>
    </section>
    <section class="home-recent" aria-label="最近收录"><div class="home-recent-head"><h2>最近收录</h2></div><p class="muted">${failed ? '等待重新连接' : '作品加载后将在这里更新'}</p></section>
  </main>${ctx.footer()}`;
  const retry = root.querySelector('[data-platform-reconnect]');
  const update = () => {
    if (!retry) return;
    const seconds = Math.max(0, Math.ceil(((platform.connectionError?.retryAt ?? 0) - Date.now()) / 1000));
    retry.disabled = platform.connecting || seconds > 0;
    retry.textContent = platform.connecting ? '正在连接…' : seconds ? `${seconds} 秒后可重试` : '重新连接';
    root.querySelector('.home-pending-deck').setAttribute('aria-busy', String(platform.connecting));
    root.querySelector('.spinner').hidden = !platform.connecting;
  };
  update();
  const timer = retry ? setInterval(update, 1000) : null;
  document.title = `${ctx.DATA.title} · ${ctx.DATA.subtitle}`;
  return { destroy() { if (timer) clearInterval(timer); } };
}

export function mount(root, ctx) {
  const catalogReady = () => ['ready', 'static'].includes(catalogState());
  // The home page shows each answer's rendered model where there is one, not a screenshot of its interface.
  const shotOf = (r) => r.previewMode === 'screenshot'
    ? screenshotOf(r)
    : r.previewPoster || screenshotOf(r);
  const answersOf = (t) => t.results.filter((r) => ctx.interactive(r) && shotOf(r))
    .sort((a, b) => (a.status === 'verified' ? 0 : 1) - (b.status === 'verified' ? 0 : 1) || time(b) - time(a));
  // Each couplet sets a handful of old variants against the answers, so only questions with more than four lead.
  const decksOf = (tasks) => tasks.filter((t) => answersOf(t).length > 4).sort((a, b) => answersOf(b).length - answersOf(a).length);
  let decks = decksOf(catalogReady() ? ctx.DATA.tasks : ctx.heroArchive());
  if (!catalogReady() && !decks.length) return mountWaiting(root, ctx);
  const recentOf = () => ctx.DATA.tasks.flatMap((task) => answersOf(task).map((work) => ({ task, work })))
    .sort((a, b) => time(b.work) - time(a.work)).slice(0, 12);
  const connectionMarkup = () => {
    if (platform.mismatch) return '页面已更新 <button type="button" class="link" data-reload>刷新页面</button>';
    if (platform.connectionError && !platform.connecting && catalogState() !== 'static') return '最新题库暂未连上 <button type="button" class="link" data-platform-reconnect>重新连接</button>';
    if (!catalogReady()) return '<span class="spinner" aria-hidden="true"></span>首页作品预览 · 正在更新题库';
    return '';
  };
  const proofMarkup = () => {
    if (!catalogReady()) return '<span class="home-proof-counts"></span>';
    const vendors = new Map();
    ctx.DATA.tasks.forEach((t) => t.results.filter(ctx.interactive).forEach((r) => {
      const m = ctx.modelOf(r);
      if (m.vendor && m.logo) vendors.set(m.vendor, { m, n: (vendors.get(m.vendor)?.n ?? 0) + 1 });
    }));
    const marks = [...vendors.values()].sort((a, b) => b.n - a.n).slice(0, 7);
    const exhibited = ctx.exhibitedModels(), vendorCount = new Set(exhibited.map((m) => m.vendor)).size;
    const totalWorks = ctx.DATA.tasks.reduce((n, t) => n + t.results.filter(ctx.interactive).length, 0);
    return `<span class="home-proof-marks" aria-hidden="true">${marks.map(({ m }) => brandMark(m, 'home-proof-mark')).join('')}</span><span class="home-proof-counts">${vendorCount} 家厂商 · ${exhibited.length} 个模型 · ${totalWorks} 份解答</span>`;
  };
  const first = decks[0], firstCount = first ? answersOf(first).length : 0;

  // Every answer is a small browser window: the model in the title bar, its first screen below.
  const windowCard = (task, work, attrs = '', eager = false) => `<a class="home-window" data-home-task="${esc(task.id)}" data-home-work="${esc(work.id)}"${catalogReady() && ctx.inGallery(task.id, work.id) ? ` href="${ctx.viewHref(task, work.id)}"` : ' aria-disabled="true"'} aria-label="在线预览：${esc(work.title)}，${esc(ctx.label(work))}"${attrs}>
      <span class="home-window-bar"><span class="home-window-dots" aria-hidden="true"><i></i><i></i><i></i></span>${brandMark(ctx.modelOf(work), 'home-window-mark')}<b>${esc(ctx.label(work))}</b></span>
      <span class="home-window-shot">${work.previewMode !== 'screenshot' && work.previewPoster ? img(shotOf(work), '', 'is-poster', eager).replace('<img ', '<img crossorigin="anonymous" ') : img(shotOf(work), '', '', eager)}</span>
    </a>`;
  const posterFrames = new Map(), posterCanvas = document.createElement('canvas');
  const posterContext = posterCanvas.getContext('2d', { willReadFrequently: true });
  const fitPosters = (container) => $$('img.is-poster', container).forEach((image) => {
    const fit = () => {
      if (!image.naturalWidth) return;
      let frame = posterFrames.get(image.src);
      if (!frame) {
        const width = posterCanvas.width = image.naturalWidth, height = posterCanvas.height = image.naturalHeight;
        posterContext.drawImage(image, 0, 0);
        const pixels = posterContext.getImageData(0, 0, width, height).data;
        let left = width, top = height, right = -1, bottom = -1;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          if (pixels[(y * width + x) * 4 + 3] <= 8) continue;
          left = Math.min(left, x); top = Math.min(top, y);
          right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
        if (right < left) return;
        // Fit the visible model into the same 8% inset, rather than adding
        // another margin around transparent space already inside its poster.
        const visibleWidth = right - left + 1, visibleHeight = bottom - top + 1;
        const scale = .84 / Math.max(visibleWidth, visibleHeight * 1.6);
        frame = {
          width: width * scale, height: height * scale * 1.6,
          left: (1 - visibleWidth * scale) / 2 - left * scale,
          top: (1 - visibleHeight * scale * 1.6) / 2 - top * scale * 1.6,
        };
        posterFrames.set(image.src, frame);
      }
      for (const [key, value] of Object.entries(frame)) image.style.setProperty(`--poster-${key}`, `${value * 100}%`);
    };
    image.onload = fit;
    if (image.complete) fit();
  });
  // Two matching copies make the strip loop without a jump. Only the first is keyboard-focusable.
  const stripMarkup = () => [false, true].map((copy) => `<div class="home-stream-group"${copy ? ' aria-hidden="true"' : ''}>${recentOf().map(({ task, work }) =>
    `<div class="home-stream-item">${windowCard(task, work, copy ? ' tabindex="-1"' : '')}<span class="home-stream-task">${esc(shortTitle(task))}</span></div>`).join('')}</div>`).join('');
  const tabsMarkup = (selected = 0) => decks.map((t, i) => `<button class="home-tab" role="tab" aria-selected="${i === selected}" data-home-tab="${i}"><small>${String(i + 1).padStart(2, '0')}</small>${esc(shortTitle(t))}<span class="home-tab-count">${answersOf(t).length}</span></button>`).join('');

  root.innerHTML = `${ctx.header()}<main class="landing page">
    <section class="home-hero" aria-labelledby="home-title">
      <div class="home-copy">
        <div class="home-verse${decks.length ? ' is-turning' : ''}">
          <h1 id="home-title"><span class="home-verse-a">回字有四样写法，</span><span class="home-verse-b">这道题有<em>${hanzi(firstCount)}</em>种<span class="home-stop">。</span></span></h1>
          <p class="home-cite">鲁迅《孔乙己》</p>
        </div>
        <p class="home-lede">同一份提示词交给不同的 AI 模型，并排打开，<span>差距一眼可见。</span></p>
        <div class="home-actions">
          ${first ? `<a class="btn home-enter" data-home-cta href="${ctx.taskHref(first)}"><span>看看这<span data-home-n>${hanzi(firstCount)}</span>种</span>${icon('right')}</a>` : ''}
          <a class="home-link" href="#/questions">浏览全部题目${icon('right')}</a>
        </div>
        <div class="home-proof">${proofMarkup()}<span class="home-connection" role="status">${connectionMarkup()}</span></div>
      </div>
      <div class="home-stage">
        <div class="home-deck-frame">
          <div class="home-deck"></div>
          <a class="home-slip" href="#"><span class="home-slip-kicker">提示词</span><b></b><span class="home-slip-text"></span></a>
        </div>
      </div>
      <div class="home-foot">
        <a class="home-scroll" href="#" data-scroll-next aria-label="向下查看最近收录"><span class="home-scroll-track" aria-hidden="true"><i></i></span></a>
        <div class="home-tabs" role="tablist" aria-label="选择题目">${tabsMarkup()}</div>
        <button class="home-motion" type="button" data-autoplay aria-pressed="false">暂停轮播 <span aria-hidden="true">Ⅱ</span></button>
      </div>
    </section>
    <section class="home-recent" aria-label="最近收录">
      <div class="home-recent-head"><h2>最近收录</h2><button class="home-motion" type="button" data-motion aria-pressed="false">暂停流动 <span aria-hidden="true">Ⅱ</span></button></div>
      <div class="home-stream"><div class="home-stream-track">${catalogReady() ? stripMarkup() : ''}</div></div>
    </section>
    <section class="home-blind" aria-labelledby="home-blind-title"${platform.available ? '' : ' hidden'}>
      <p class="home-blind-ab" aria-hidden="true"><i>A</i><span>vs</span><i>B</i></p>
      <div><h2 id="home-blind-title">先别看名字，只看作品。</h2><p>同一道题的两份解答匿名并排，选出更好的那一个，投票后揭晓模型并汇入排行榜。</p></div>
      <a class="btn" href="#/arena">开始盲评${icon('right')}</a>
    </section>
  </main>${ctx.footer()}`;

  fitPosters(root);
  const deck = root.querySelector('.home-deck'), slip = root.querySelector('.home-slip'), hero = root.querySelector('.home-hero');
  const cta = root.querySelector('[data-home-cta]'), autoplay = root.querySelector('[data-autoplay]');
  const verse = root.querySelector('.home-verse'), tabList = root.querySelector('.home-tabs');
  let current = 0, cards = [], elapsed = 0, sinceShuffle = 0, playing = !reducedMotion(), autoQuestion = playing, hovering = false;
  let turning = 0, dealt = 0;
  const sung = [];
  const refreshLinks = () => {
    $$('[data-home-work]', root).forEach((card) => {
      const task = ctx.DATA.tasks.find((t) => t.id === card.dataset.homeTask);
      const allowed = catalogReady() && task?.results.some((r) => r.id === card.dataset.homeWork && ctx.interactive(r));
      if (allowed) { card.href = ctx.viewHref(task, card.dataset.homeWork); card.removeAttribute('aria-disabled'); }
      else { card.removeAttribute('href'); card.setAttribute('aria-disabled', 'true'); }
    });
  };
  // Updating the catalog never replaces the visible hero, its current cards,
  // headline, or motion state. New answers join the next ordinary rotation.
  const updateCatalog = () => {
    const proof = root.querySelector('.home-proof');
    proof.innerHTML = `${proofMarkup()}<span class="home-connection" role="status">${connectionMarkup()}</span>`;
    if (catalogReady()) {
      const next = decksOf(ctx.DATA.tasks), selectedId = decks[current]?.id;
      if (next.length) {
        decks = next;
        current = Math.max(0, decks.findIndex((t) => t.id === selectedId));
        const left = tabList.scrollLeft;
        tabList.innerHTML = tabsMarkup(current);
        tabList.scrollLeft = left;
        tabList.children[current]?.style.setProperty('--progress', autoQuestion ? String(Math.min(elapsed / QUESTION, 1)) : '1');
      }
      recentSection.querySelector('.home-stream-track').innerHTML = stripMarkup();
      fitPosters(recentSection);
      $$('img[loading="lazy"]', recentSection).forEach((image) => { image.loading = 'eager'; });
    }
    root.querySelector('.home-blind').hidden = !platform.available;
    refreshLinks();
    ctx.settleImages();
  };
  const retryTimer = setInterval(() => {
    const button = root.querySelector('.home-connection [data-platform-reconnect]');
    if (!button) return;
    const seconds = Math.max(0, Math.ceil(((platform.connectionError?.retryAt ?? 0) - Date.now()) / 1000));
    button.disabled = platform.connecting || seconds > 0;
    button.textContent = platform.connecting ? '正在连接…' : seconds ? `${seconds} 秒后可重试` : '重新连接';
  }, 1000);

  // A random couplet, not one of the last eight, set in its own typeface.
  // --len is the longer line in characters, which sizes the type.
  const sing = (n, [a, b, source, face]) => {
    const [pre, post] = b.split('{n}'), count = hanzi(n);
    verse.dataset.face = face;
    verse.querySelector('h1').innerHTML = `<span class="home-verse-a">${esc(a)}</span><span class="home-verse-b">${esc(pre)}<em>${count}</em>${esc(post)}<span class="home-stop">。</span></span>`;
    verse.querySelector('.home-cite').textContent = source;
    verse.style.setProperty('--len', String(Math.max([...a].length, [...`${pre}${count}${post}。`].length)));
  };
  // The next couplet fades in once its typeface has loaded (or after 1.2s), so it never flashes in a fallback font.
  const turn = (n) => {
    const next = pick(VERSES, sung);
    sung.push(next);
    if (sung.length > 8) sung.shift();
    const id = ++turning, wait = (ms) => new Promise((done) => setTimeout(done, ms));
    const loaded = Promise.race([document.fonts.load(`1em "${FACES[next[3]]}"`).catch(() => {}), wait(1200)]);
    verse.classList.add('is-turning');
    Promise.all([loaded, wait(reducedMotion() || !verse.dataset.face ? 0 : SWAP)]).then(() => {
      if (id !== turning) return;
      sing(n, next);
      // The old couplet left upward, so the new one rises from below.
      verse.classList.add('is-entering');
      verse.classList.remove('is-turning');
      void verse.offsetWidth;
      verse.classList.remove('is-entering');
    });
  };

  // One motion language for both changes: a card leaves by sliding down past the front of the stack,
  // and cards arrive from behind it. Every move starts where the card is now, so an interrupted one carries on.
  const slot = (k) => {
    const at = Math.min(k, SLOTS.length - 1);
    return { transform: SLOTS[at], filter: at ? `brightness(${1 - at * 0.12})` : 'brightness(1)', opacity: '1' };
  };
  const now = (card) => {
    const { transform, filter, opacity } = getComputedStyle(card);
    card.getAnimations().forEach((a) => a.cancel());
    return { transform, filter, opacity };
  };
  const place = () => cards.forEach((card, k) => {
    Object.assign(card.style, slot(k));
    card.style.zIndex = String(SLOTS.length - k);
    card.tabIndex = k ? -1 : 0;
    card.toggleAttribute('data-front', !k);
  });
  const show = (i) => {
    current = i; elapsed = 0; sinceShuffle = 0;
    const t = decks[i], works = answersOf(t);
    $$('[data-home-tab]', root).forEach((tab, k) => {
      tab.setAttribute('aria-selected', String(k === i));
      tab.style.setProperty('--progress', k === i && autoQuestion ? '0' : '1');
    });
    // The headline and the number in the button follow the question in the deck.
    turn(works.length);
    cta.querySelector('[data-home-n]').textContent = hanzi(works.length);
    const selected = tabList.children[i];
    tabList.scrollTo({ left: selected.offsetLeft - tabList.offsetLeft - 24, behavior: reducedMotion() ? 'auto' : 'smooth' });
    cta.href = ctx.taskHref(t);
    const motion = !reducedMotion(), old = cards, id = ++dealt;
    // The old deck leaves front card first, above the new one; the slip changes as the couplet does.
    old.forEach((card, k) => {
      if (!motion) return card.remove();
      const z = String(20 - k);
      card.removeAttribute('data-front');
      card.animate([{ ...now(card), zIndex: z }, { transform: OUT, filter: 'brightness(1)', opacity: '0', zIndex: z }],
        { duration: LEAVE, delay: k * 60, easing: EXIT, fill: 'forwards' }).finished.then(() => card.remove(), () => {});
    });
    slip.classList.toggle('is-turning', motion && old.length > 0);
    setTimeout(() => {
      if (id !== dealt) return;
      slip.href = ctx.taskHref(t);
      slip.querySelector('b').textContent = t.title;
      slip.querySelector('.home-slip-text').textContent = promptLine(t);
      slip.classList.remove('is-turning');
    }, motion && old.length ? SWAP : 0);
    // The new deck rises from behind, back cards first, so the front card is the last to settle.
    const fresh = document.createElement('template');
    fresh.innerHTML = works.slice(0, SLOTS.length).map((w, k) => windowCard(t, w, '', k === 0)).join('');
    cards = [...fresh.content.children];
    deck.append(...cards);
    cards.forEach(fitPosters);
    place();
    if (motion) cards.forEach((card, k) => card.animate([{ transform: BEHIND, filter: 'brightness(.4)', opacity: '0' }, slot(k)],
      { duration: MOVE, delay: (old.length ? 180 : 0) + (cards.length - 1 - k) * 90, easing: EASE, fill: 'backwards' }));
  };
  // The front card slides down past the stack while the rest step forward, then tucks in at the back.
  const tuck = (moving) => {
    const start = new Map(cards.map((card) => [card, now(card)]));
    cards = [...cards.slice(moving.length), ...moving];
    sinceShuffle = 0;
    place();
    if (reducedMotion()) return;
    cards.forEach((card, k) => {
      const m = moving.indexOf(card), to = slot(k);
      if (m < 0) return card.animate([start.get(card), to], { duration: MOVE, delay: 120, easing: EASE, fill: 'backwards' });
      const z = String(10 - m), down = { transform: OUT, filter: 'brightness(1)', opacity: '1' };
      card.animate([
        { ...start.get(card), zIndex: z, easing: EASE },
        { ...down, zIndex: z, offset: .42 },
        { ...down, zIndex: '0', offset: .421, easing: EASE },
        { ...to, zIndex: '0' },
      ], { duration: MOVE + 500, delay: m * 90, fill: 'backwards' });
    });
  };
  const bringToFront = (card) => {
    const at = cards.indexOf(card);
    if (at > 0) tuck(cards.slice(0, at));
  };
  const setPlaying = (on) => {
    playing = on;
    autoplay.setAttribute('aria-pressed', String(!on));
    autoplay.innerHTML = on ? '暂停轮播 <span aria-hidden="true">Ⅱ</span>' : '继续轮播 <span aria-hidden="true">▷</span>';
  };

  // Cards shuffle and a random other question comes up on its own, pausing while the pointer or focus is on the hero.
  const TICK = 100;
  const timer = setInterval(() => {
    if (!playing || hovering || document.visibilityState !== 'visible') return;
    sinceShuffle += TICK;
    if (autoQuestion) {
      elapsed += TICK;
      root.querySelector('[data-home-tab][aria-selected="true"]')?.style.setProperty('--progress', String(Math.min(elapsed / QUESTION, 1)));
      if (elapsed >= QUESTION) return show(decks.length > 1 ? pick([...decks.keys()], [current]) : current);
    }
    // No shuffle just before the question changes, so the two never overlap.
    const soon = autoQuestion && QUESTION - elapsed < SHUFFLE / 2;
    if (sinceShuffle >= SHUFFLE && cards.length > 1 && !soon) tuck([cards[0]]);
  }, TICK);
  const stage = root.querySelector('.home-stage');
  stage.addEventListener('pointerenter', () => { hovering = true; });
  stage.addEventListener('pointerleave', () => { hovering = false; });
  hero.addEventListener('focusin', () => { hovering = true; });
  hero.addEventListener('focusout', () => { hovering = false; });

  // The scroll cue on the fold fades once the page has moved; its click glides to the next section.
  const cue = root.querySelector('.home-scroll');
  const onScroll = () => {
    cue.classList.toggle('is-gone', scrollY > 60);
  };
  addEventListener('scroll', onScroll, { passive: true });

  // The strip moves by transform, so lazy shots past its right edge would only start loading as they slide in.
  // Fetch them all once the section comes near.
  const recentSection = root.querySelector('.home-recent');
  const near = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    near.disconnect();
    $$('img[loading="lazy"]', recentSection).forEach((image) => { image.loading = 'eager'; });
  }, { rootMargin: '0px 0px 800px 0px' });
  near.observe(recentSection);

  root.onclick = (event) => {
    if (event.target.closest('[data-scroll-next]')) {
      event.preventDefault();
      root.querySelector('.home-recent').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
      return;
    }
    const back = event.target.closest('.home-deck .home-window:not([data-front])');
    if (back) { event.preventDefault(); bringToFront(back); return; }
    const tab = event.target.closest('[data-home-tab]');
    if (tab) { autoQuestion = false; show(+tab.dataset.homeTab); return; }
    if (event.target.closest('[data-autoplay]')) { setPlaying(!playing); return; }
    const button = event.target.closest('[data-motion]');
    if (!button) return;
    const paused = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(paused));
    button.innerHTML = paused ? '继续流动 <span aria-hidden="true">▷</span>' : '暂停流动 <span aria-hidden="true">Ⅱ</span>';
    root.querySelector('.home-recent').classList.toggle('is-paused', paused);
  };
  root.querySelector('.home-tabs').onkeydown = (event) => {
    const tabs = $$('[data-home-tab]', root), at = tabs.indexOf(document.activeElement);
    const next = { ArrowRight: at + 1, ArrowLeft: at - 1 }[event.key];
    if (at < 0 || next === undefined) return;
    event.preventDefault();
    const i = (next + tabs.length) % tabs.length;
    autoQuestion = false; show(i); tabs[i].focus();
  };
  if (reducedMotion()) setPlaying(false);
  // Each visit opens on a different question.
  if (decks.length) show(pick([...decks.keys()]));
  else hero.classList.add('is-empty');
  document.title = `${ctx.DATA.title} · ${ctx.DATA.subtitle}`;
  return {
    home: true,
    onPlatformChange: updateCatalog,
    destroy() {
      clearInterval(timer);
      clearInterval(retryTimer);
      removeEventListener('scroll', onScroll);
      near.disconnect();
    },
  };
}
