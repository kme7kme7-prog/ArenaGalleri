// A slow iframe keeps its recovery controls until its document actually loads. Replacing a
// pane or leaving cancels both deadlines and the delayed reveal of the previous document.
export function watchViewerFrame(frame, { onLoaded, onSlow, timeout = 45_000, revealDelay = 500 }) {
  let stopped = false, loaded = false, slow = false, reveal;
  const deadline = setTimeout(showSlow, timeout);
  function showSlow() {
    if (stopped || loaded || slow) return;
    slow = true;
    clearTimeout(deadline);
    onSlow();
  }
  function load() {
    if (stopped || loaded) return;
    loaded = true;
    clearTimeout(deadline);
    frame.removeEventListener('load', load);
    frame.removeEventListener('error', showSlow);
    reveal = setTimeout(() => { if (!stopped) onLoaded(); }, revealDelay);
  }
  frame.addEventListener('load', load);
  frame.addEventListener('error', showSlow);
  return () => {
    stopped = true;
    clearTimeout(deadline);
    clearTimeout(reveal);
    frame.removeEventListener('load', load);
    frame.removeEventListener('error', showSlow);
  };
}
