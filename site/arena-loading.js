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

// Timeout changes the recovery UI, never the voting gate. A late document load
// can still recover; replacing a side or leaving removes every old listener.
export function watchFrameLoad(frame, { onLoad, onSlow, timeout = 45_000 }) {
  let loaded = false, stopped = false;
  const slow = () => { if (!stopped && !loaded) onSlow(); };
  const load = () => {
    if (stopped || loaded) return;
    loaded = true;
    stop();
    onLoad();
  };
  const timer = setTimeout(slow, timeout);
  function stop() {
    stopped = true;
    clearTimeout(timer);
    frame.removeEventListener('load', load);
    frame.removeEventListener('error', slow);
  }
  frame.addEventListener('load', load);
  frame.addEventListener('error', slow);
  return stop;
}
