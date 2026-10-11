// Arrival gate. It runs before app modules, so failure copy also selects its language here.
(() => {
  if (new URLSearchParams(location.search).get('entry') !== 'portal') return;
  const html = document.documentElement;
  const gallery = html.dataset.entry === 'gallery';
  let phase = 'loading';
  let cover;
  let appRoot;
  const english = () => {
    let saved;
    try { saved = localStorage.getItem('gallery-locale'); } catch { /* storage unavailable */ }
    if (saved === 'en' || saved === 'zh-CN') return saved === 'en';
    return !/^zh\b/i.test(navigator.languages?.[0] ?? navigator.language ?? 'zh-CN');
  };
  const style = document.createElement('style');
  style.textContent = `
    #site-entry-cover { position:fixed; inset:0; z-index:2147483647; background:${gallery ? '#121211' : '#d9ddda'}; color:${gallery ? '#ecebe6' : '#1d2423'}; display:grid; place-items:center; font:16px/1.7 system-ui,sans-serif; }
    #site-entry-cover .entry-message { max-width:400px; padding:32px; opacity:0; transition:opacity .25s; }
    #site-entry-cover[data-failed] .entry-message { opacity:1; }
    #site-entry-cover h1 { font-size:28px; margin:0 0 12px; }
    #site-entry-cover p { margin:0 0 24px; }
    #site-entry-cover nav { display:flex; flex-wrap:wrap; gap:12px; }
    #site-entry-cover button, #site-entry-cover a { font:inherit; color:inherit; background:transparent; border:1px solid currentColor; padding:9px 18px; text-decoration:none; cursor:pointer; }
    html[data-entry] { overflow:hidden; }
  `;
  document.head.append(style);
  function mount() {
    if (cover) return;
    cover = document.createElement('div');
    cover.id = 'site-entry-cover';
    cover.innerHTML = english()
      ? '<section class="entry-message" role="alert"><h1>Unable to load</h1><p>The page could not finish loading. Try again or return to the portal.</p><nav><button type="button">Reload</button><a href="https://arenaofbias.icu/">Back to portal</a></nav></section>'
      : '<section class="entry-message" role="alert"><h1>加载失败</h1><p>页面未能加载完成，请重试或返回入口。</p><nav><button type="button">重新加载</button><a href="https://arenaofbias.icu/">返回入口</a></nav></section>';
    cover.querySelector('button').onclick = () => location.reload();
    document.body.append(cover);
    appRoot = document.querySelector('#root, #app');
    if (appRoot) appRoot.inert = true;
    if (phase === 'failed') showFailure();
  }
  function showFailure() {
    if (!cover) return;
    cover.setAttribute('data-failed', '');
    cover.querySelector('button').focus({ preventScroll:true });
  }
  function fail() {
    if (phase === 'done' || phase === 'revealing' || phase === 'failed') return;
    phase = 'failed';
    clearTimeout(deadline);
    showFailure();
  }
  const deadline = setTimeout(fail, 25000);
  const domReady = new Promise(resolve => {
    if (document.readyState !== 'loading') { mount(); resolve(); }
    else addEventListener('DOMContentLoaded', () => { mount(); resolve(); }, { once:true });
  });
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
  function imageReady(img) {
    img.loading = 'eager';
    const decoded = () => img.naturalWidth ? (img.decode ? img.decode() : Promise.resolve()) : Promise.reject(new Error('Image failed'));
    if (img.complete) return decoded();
    return new Promise((resolve, reject) => {
      img.addEventListener('load', () => decoded().then(resolve, reject), { once:true });
      img.addEventListener('error', reject, { once:true });
    });
  }
  async function ready(root) {
    if (phase !== 'loading') return;
    phase = 'settling';
    try {
      await domReady;
      await nextFrame();
      // Wait for the visible first-screen images, including Gallery's lazy deck cards.
      const images = [...root.querySelectorAll('img')].filter(img => {
        const rect = img.getBoundingClientRect();
        return rect.width && rect.height && rect.top < innerHeight && rect.bottom > 0 && rect.left < innerWidth && rect.right > 0;
      });
      await Promise.all([document.fonts.ready, ...images.map(imageReady)]);
      await nextFrame();
      await nextFrame();
      if (phase !== 'settling') return;
      phase = 'revealing';
      clearTimeout(deadline);
      delete html.dataset.entry;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduced) await cover.animate([{ transform:'translateX(0)' }, { transform:`translateX(${gallery ? '-' : ''}100%)` }], { duration:650, easing:'cubic-bezier(.65,0,.25,1)', fill:'forwards' }).finished;
      cover.remove();
      style.remove();
      if (appRoot) appRoot.inert = false;
      phase = 'done';
      const url = new URL(location.href);
      url.searchParams.delete('entry');
      history.replaceState(history.state, '', url);
      dispatchEvent(new Event('portal-entry-done'));
    } catch { fail(); }
  }
  window.ArenaEntry = { ready, fail, get phase() { return phase; } };
  addEventListener('error', event => {
    const target = event.target;
    if (target instanceof HTMLScriptElement || (target instanceof HTMLLinkElement && target.rel === 'stylesheet') || target === window) fail();
  }, true);
})();
