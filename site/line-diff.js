// Line changes between two texts, for reviewers comparing a resubmitted prompt with the last one.
// Each line is [' ' | '-' | '+', text]; removals come before the additions that replace them.
export function lineDiff(before, after) {
  const a = before.split('\n'), b = after.split('\n');
  const common = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) common[i][j] = a[i] === b[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
  }
  const lines = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { lines.push([' ', a[i]]); i++; j++; }
    else if (i < a.length && (j === b.length || common[i + 1][j] >= common[i][j + 1])) lines.push(['-', a[i++]]);
    else lines.push(['+', b[j++]]);
  }
  return lines;
}
