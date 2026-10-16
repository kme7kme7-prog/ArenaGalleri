// Turnstile is loaded only when the API enables it for authentication.
import { locale } from './i18n.js';

let scriptTask;

export function loadTurnstile() {
  if (globalThis.turnstile) return Promise.resolve(globalThis.turnstile);
  if (!scriptTask) {
    scriptTask = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => {
        if (globalThis.turnstile) resolve(globalThis.turnstile);
        else { script.remove(); reject(new Error('人机验证加载失败，请稍后重试。')); }
      };
      script.onerror = () => { script.remove(); reject(new Error('人机验证加载失败，请检查网络后重试。')); };
      document.head.append(script);
    }).catch((error) => { scriptTask = null; throw error; });
  }
  return scriptTask;
}

export function mountTurnstile(container, siteKey, onState) {
  const turnstile = globalThis.turnstile;
  let token = '';
  let removed = false;
  let widgetId;
  let language;
  let size;
  let generation = 0;
  const widgetSize = () => container.clientWidth > 0 && container.clientWidth < 300 ? 'compact' : 'flexible';
  function render() {
    const activeGeneration = ++generation;
    token = '';
    if (widgetId) turnstile.remove(widgetId);
    widgetId = undefined;
    language = locale() === 'en' ? 'en' : 'zh-CN';
    size = widgetSize();
    const active = () => !removed && activeGeneration === generation;
    widgetId = turnstile.render(container, {
      sitekey: siteKey,
      size,
      theme: globalThis.document?.documentElement?.dataset.theme === 'dark' ? 'dark' : 'light',
      language,
      callback(value) { if (active()) { token = value; onState(''); } },
      'expired-callback'() {
        if (!active()) return;
        token = '';
        onState('人机验证已过期，正在重新获取。');
        queueMicrotask(() => { if (active()) turnstile.reset(widgetId); });
      },
      'error-callback'() {
        if (!active()) return true;
        token = '';
        onState('人机验证暂时失败，请稍候重试。');
        return false; // Turnstile retries transient errors automatically.
      },
    });
    if (!widgetId) throw new Error('人机验证无法显示，请刷新页面后重试。');
  }
  function changeLanguage() {
    if (removed || language === locale()) return;
    onState('');
    try { render(); } catch (error) { onState(error.message); }
  }
  render();
  // Flexible widgets need at least 300px; narrow forms use Cloudflare's compact layout.
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (removed || size === widgetSize()) return;
    onState('');
    try { render(); } catch (error) { onState(error.message); }
  }) : null;
  resize?.observe(container);
  globalThis.window?.addEventListener('localechange', changeLanguage);
  return {
    get token() { return token; },
    reset() { if (!removed) { token = ''; turnstile.reset(widgetId); } },
    remove() {
      if (removed) return;
      removed = true;
      generation++;
      token = '';
      resize?.disconnect();
      globalThis.window?.removeEventListener('localechange', changeLanguage);
      if (widgetId) turnstile.remove(widgetId);
    },
  };
}
