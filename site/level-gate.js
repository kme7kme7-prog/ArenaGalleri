// Lv0 members cannot start questions or upload works yet. The block that stands in for those forms says
// so, and leads to the qualification test. Numbers come from /api/qualification, never from this file.
import { esc, formatDate, icon } from './ui.js';
import { api, needsEmail, platform } from './platform.js';

const WHAT = {
  question: { title: '通过资格考试，就能出题', action: '发起题目', can: '可以发起题目' },
  work: { title: '通过资格考试，就能上传作品', action: '上传作品', can: '可以上传作品' },
};

function gateHtml(what, info, failed) {
  const { title, action, can } = WHAT[what];
  const exam = info?.exam;
  const resuming = Boolean(info?.activeAttemptId);
  const answered = platform.qualification;
  const last = info?.lastResult;
  const open = exam?.ready || resuming; // a started answer sheet can always be continued
  const numbers = open
    ? `<dl class="gate-numbers"><div><dt>题量</dt><dd>${exam.questionCount}<small> 组</small></dd></div><div><dt>及格线</dt><dd>${exam.correctRequired}<small> 组</small></dd></div><div><dt>次数</dt><dd>${exam.unlimitedAttempts === false ? '有限' : '不限'}</dd></div><div><dt>时间</dt><dd>${exam.timeLimitSeconds ? `${Math.round(exam.timeLimitSeconds / 60)} 分钟` : '不限'}</dd></div></dl>`
    : info || failed ? '<p class="gate-wait">资格考试正在准备题目，开放后会在这里通知</p>' : '<p class="gate-wait" role="status">正在载入…</p>';
  return `<section class="question-gate" aria-label="${action}资格">
    <h3>${title}</h3>
    <p>${action}需要 Lv1 认证成员。考试是一组盲评判断：每组两件作品质量差距明显，选出更好的一件。通过后：</p>
    <ul class="checks"><li>${can}</li><li>你的盲评选择同时计入精选榜</li></ul>
    ${numbers}
    ${last ? `<p class="gate-last">上次：${last.correctCount} / ${last.questionCount}${last.finishedAt ?? last.at ? ` · <time data-i18n-date="${esc(last.finishedAt ?? last.at)}">${esc(formatDate(last.finishedAt ?? last.at))}</time>` : ''}</p>` : ''}
    <div class="gate-actions">
      ${open ? `<a class="btn primary" href="#/exam">${resuming ? `继续考试${answered ? ` · 已答 ${answered.activeAnswered} / ${answered.questionCount}` : ''}` : '开始考试'}${icon('right')}</a>` : '<button class="btn primary" type="button" disabled>开始考试</button>'}
      <a class="btn" href="#/arena">先去盲评</a>
    </div>
    ${needsEmail() ? `<p class="fine">${action}还需要绑定邮箱 <button class="link" type="button" data-bind-email>绑定邮箱</button></p>` : ''}
  </section>`;
}

// Draws the block into `host` and fills in the test's numbers once they arrive.
export function levelGate(host, what) {
  let alive = true;
  host.innerHTML = gateHtml(what, null, false);
  api('qualification').then((info) => info, () => null).then((info) => {
    if (alive && host.isConnected) host.innerHTML = gateHtml(what, info, !info);
  });
  return () => { alive = false; };
}
