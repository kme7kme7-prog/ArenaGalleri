// A draw has one deadline across random-task fallbacks. Cancelled/late responses
// must never install a pair after the reader has left or started another draw.
export function loadPair(read, { timeout = 30_000 } = {}) {
  const controller = new AbortController();
  let reject;
  const cancelled = new Promise((_, fail) => { reject = fail; });
  const onAbort = () => reject(controller.signal.reason);
  controller.signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(Object.assign(new Error('抽取作品超时，请重试'), { code: 'match-timeout' })), timeout);
  const promise = Promise.race([Promise.resolve().then(() => {
    controller.signal.throwIfAborted();
    return read(controller.signal);
  }), cancelled]).finally(() => {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
  });
  return { promise, cancel: () => controller.abort(new DOMException('Pair cancelled', 'AbortError')) };
}

// A side is ready only when its own document says so: the work shell forwards the plain
// 'aob:work-ready' message from the work frame (after load, paint and settle, or the 8s fallback).
// The native load event is only a hint. Timeout changes the recovery UI, never the voting gate; a
// late ready can still recover, and replacing a side or leaving removes every old listener.
export function watchFrameLoad(frame, { onReady, onLoad = () => {}, onSlow, timeout = 45_000, target = globalThis }) {
  let done = false, stopped = false;
  const slow = () => { if (!stopped && !done) onSlow(); };
  const message = (event) => {
    if (stopped || done || event.data !== 'aob:work-ready') return;
    if (event.source !== frame.contentWindow || event.origin !== new URL(frame.src).origin) return;
    done = true;
    stop();
    onReady();
  };
  const timer = setTimeout(slow, timeout);
  function stop() {
    stopped = true;
    clearTimeout(timer);
    target.removeEventListener('message', message);
    frame.removeEventListener('load', onLoad);
    frame.removeEventListener('error', slow);
  }
  target.addEventListener('message', message);
  frame.addEventListener('load', onLoad);
  frame.addEventListener('error', slow);
  return stop;
}

// How long a reader has really looked at a loaded pair: a count that stands still while the page is
// hidden, plus deadlines the server named (`mark`). `left(key, ms)` is what remains of a hold of `ms`;
// the local count never opens it sooner than the server's own clock would.
export function createHold(onTick = () => {}, { now = () => performance.now(), hidden = () => globalThis.document?.hidden === true, every = 200 } = {}) {
  let waited = 0, last = 0, timer = 0;
  const until = {};
  const hold = {
    get running() { return timer !== 0; },
    get waited() { return waited; },
    begin() { hold.reset(); last = now(); timer = setInterval(hold.tick, every); },
    resume() { if (!timer) { last = now(); timer = setInterval(hold.tick, every); } },
    stop() { clearInterval(timer); timer = 0; },
    reset() { hold.stop(); waited = 0; for (const key of Object.keys(until)) delete until[key]; },
    mark(key, at) { until[key] = at; },
    touch() { last = now(); },
    left: (key, ms) => Math.max(ms - waited, (until[key] ?? 0) - now(), 0),
    tick() {
      const t = now();
      if (!hidden()) waited += t - last;
      last = t;
      onTick();
    },
  };
  return hold;
}
