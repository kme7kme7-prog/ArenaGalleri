import test from 'node:test';
import assert from 'node:assert/strict';
import { lineDiff } from '../site/line-diff.js';

test('lineDiff keeps shared lines and puts removals before their replacements', () => {
  assert.deepEqual(lineDiff('intro\nvague\nend', 'intro\nsize\ncontrols\nend'),
    [[' ', 'intro'], ['-', 'vague'], ['+', 'size'], ['+', 'controls'], [' ', 'end']]);
  assert.deepEqual(lineDiff('same', 'same'), [[' ', 'same']]);
  assert.deepEqual(lineDiff('a', 'a\nb'), [[' ', 'a'], ['+', 'b']]);
});
