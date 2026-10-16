// One brow and two eyes keep the gallery mark recognisable in every expression.
export const authMascot = `<svg class="auth-mascot" data-auth-mascot data-state="idle" viewBox="0 0 360 320" fill="none" focusable="false" aria-hidden="true">
  <ellipse class="auth-mascot-shadow" cx="180" cy="300" rx="84" ry="7"/>
  <g class="auth-mascot-head">
    <rect class="auth-mascot-face" x="50" y="42" width="260" height="236" rx="58"/>
    <path class="auth-mascot-brow" d="M109 122h142"/>
    <g class="auth-mascot-gaze">
      <g class="auth-mascot-blink">
        <g transform="translate(139 184)"><g class="auth-mascot-eye">
          <path class="auth-mascot-stroke-a" d="M-30 0h60"/>
          <path class="auth-mascot-stroke-b" d="M-30 0h60"/>
        </g></g>
        <g transform="translate(221 184)"><g class="auth-mascot-eye auth-mascot-eye-accent">
          <path class="auth-mascot-stroke-a" d="M-30 0h60"/>
          <path class="auth-mascot-stroke-b" d="M-30 0h60"/>
        </g></g>
      </g>
    </g>
  </g>
</svg>`;

const stateOf = (field) => field?.tagName !== 'INPUT' ? 'idle'
  : field.type === 'password' ? 'password' : field.name === 'username' ? 'username' : 'idle';

export function bindAuthMascot(panel) {
  const mascot = panel.querySelector('[data-auth-mascot]');
  if (!mascot) return;
  const eyes = [...panel.querySelectorAll('.auth-mascot-eye')];
  let feedback = [];
  let closed = false;
  const stopFeedback = () => { feedback.forEach((animation) => animation.cancel()); feedback = []; };
  const sync = () => {
    if (closed) return;
    const active = panel.ownerDocument.activeElement;
    const state = panel.contains(active) ? stateOf(active) : 'idle';
    if (mascot.dataset.state !== state) { stopFeedback(); mascot.dataset.state = state; }
  };
  const blur = () => queueMicrotask(sync);
  const input = (event) => {
    sync();
    stopFeedback();
    if (stateOf(event.target) === 'idle' || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    feedback = eyes.map((eye, index) => eye.animate([
      { rotate: '0deg', translate: '0 0' },
      { rotate: `${index ? 7 : -7}deg`, translate: '0 -4px', offset: 0.4 },
      { rotate: '0deg', translate: '0 0' },
    ], { duration: 360, delay: index * 35, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' }));
  };
  const close = () => {
    closed = true;
    stopFeedback();
    panel.removeEventListener('focusin', sync);
    panel.removeEventListener('focusout', blur);
    panel.removeEventListener('input', input);
    panel.removeEventListener('close', close);
  };
  panel.addEventListener('focusin', sync);
  panel.addEventListener('focusout', blur);
  panel.addEventListener('input', input);
  panel.addEventListener('close', close);
  sync();
}
