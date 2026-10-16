import assert from 'node:assert/strict';
import test from 'node:test';
import { bindAuthMascot } from '../site/auth-mascot.js';

test('the mascot watches usernames, crosses its eyes for passwords and releases its feedback on close', async () => {
  const originalMedia = globalThis.matchMedia;
  let reduced = false;
  globalThis.matchMedia = () => ({ matches: reduced });
  const listeners = new Map();
  const feedback = [];
  const face = { dataset: {} };
  const eyes = [0, 1].map(() => ({ animate() {
    const animation = { cancelled: false, cancel() { this.cancelled = true; } };
    feedback.push(animation);
    return animation;
  } }));
  const doc = { activeElement: null };
  const panel = {
    ownerDocument: doc,
    querySelector: () => face,
    querySelectorAll: () => eyes,
    contains: (field) => Boolean(field?.inside),
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
  };
  const focus = (field) => { doc.activeElement = field; listeners.get('focusin')({ target: field }); };
  // Reading content would throw: the visual interaction needs only the field's identity.
  const field = (name, type = 'text') => ({ name, type, tagName: 'INPUT', inside: true,
    get value() { throw new Error('The mascot must not inspect field contents'); } });
  try {
    bindAuthMascot(panel);
    assert.equal(face.dataset.state, 'idle');
    focus(field('username'));
    assert.equal(face.dataset.state, 'username');
    listeners.get('input')({ target: doc.activeElement });
    assert.equal(feedback.length, 2);
    focus(field('password', 'password'));
    assert.equal(face.dataset.state, 'password');
    assert.ok(feedback.every((animation) => animation.cancelled));
    listeners.get('input')({ target: doc.activeElement });
    assert.equal(feedback.length, 4);
    reduced = true;
    listeners.get('input')({ target: doc.activeElement });
    assert.equal(feedback.length, 4);
    focus(field('email', 'email'));
    assert.equal(face.dataset.state, 'idle');
    focus(field('password', 'password'));
    doc.activeElement = {};
    listeners.get('focusout')();
    await Promise.resolve();
    assert.equal(face.dataset.state, 'idle');
    listeners.get('close')();
    assert.ok(feedback.every((animation) => animation.cancelled));
    assert.equal(listeners.size, 0);
  } finally {
    if (originalMedia === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = originalMedia;
  }
});
