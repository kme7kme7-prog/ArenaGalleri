import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
const app=readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('let taskBoard = null;'),app.indexOf('async function mountTaskBoard()'));
const taskPageSource=app.slice(app.indexOf('function taskPage(t)'),app.indexOf('function applySort(t)'));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
function environment(timers=null){const reads=[],sorts=[],status={hidden:true,innerHTML:''};const state={AbortController,setTimeout:timers?(fn,ms)=>{timers.push({fn,ms});return timers.length}:setTimeout,clearTimeout:timers?()=>{}:clearTimeout,platform:{available:true},DATA:{tasks:[{id:'one'},{id:'two'}]},resultSort:'added',taskState:{task:'one'},taskScores:new Map(),aiJudged:()=>false,$:()=>status,esc:String,applySort:t=>sorts.push(t.id),api:(path,options)=>{const d=deferred();reads.push({path,...options,...d});return d.promise}};vm.runInNewContext(source+taskPageSource+'\nglobalThis.load=loadTaskScores;globalThis.cancel=cancelTaskScores;globalThis.mountTask=taskPage;',state);return{state,reads,sorts,status};}
test('ordinary task views never read scores; score sorting shares one read and retries a failed read',async()=>{const e=environment(),t={id:'one'};assert.equal(e.state.load(t),undefined);assert.equal(e.reads.length,0);e.state.resultSort='score';const a=e.state.load(t),b=e.state.load(t);assert.equal(a,b);assert.equal(e.reads.length,1);e.reads[0].reject(new Error('offline'));await a;const retry=e.state.load(t);e.reads[1].resolve({rows:[{key:'model',score:123}]});await retry;assert.equal(e.state.taskScores.get('model'),123);assert.deepEqual(e.sorts,['one']);e.state.load(t);assert.equal(e.reads.length,2);e.state.cancel();});
test('leaving a task aborts its score read and late responses cannot reorder another page',async()=>{const e=environment();e.state.resultSort='score';const old=e.state.load({id:'one'});e.state.cancel();assert.equal(e.reads[0].signal.aborted,true);e.state.taskState.task='two';const next=e.state.load({id:'two'});e.reads[0].resolve({rows:[{key:'old',score:999}]});await old;assert.equal(e.state.taskScores.size,0);e.reads[1].resolve({rows:[{key:'new',score:111}]});await next;assert.deepEqual(e.sorts,['two']);e.state.cancel();});

test('a score deadline shows a retry action and a late body cannot replace the fallback',async()=>{const timers=[],e=environment(timers);e.state.resultSort='score';const old=e.state.load({id:'one'});timers[0].fn();assert.equal(e.reads[0].signal.aborted,true);assert.match(e.status.innerHTML,/data-task-score-retry/);assert.match(e.status.innerHTML,/连接超时/);e.reads[0].resolve({rows:[{key:'late',score:999}]});await old;assert.equal(e.state.taskScores.size,0);e.state.cancel();const retry=e.state.load({id:'one'});e.reads[1].resolve({rows:[{key:'fresh',score:111}]});await retry;assert.equal(e.state.taskScores.get('fresh'),111);assert.equal(e.status.hidden,true);e.state.cancel();});


test('same-task redraws retain pending and completed scores, then a real departure cancels', async () => {
  const e = environment(), oldTask = { id: 'one', revision: 'old' }, freshTask = { id: 'one', revision: 'fresh' };
  Object.assign(e.state, { renderTask() {}, activatePanel() {}, location: { hash: '#/one' }, updateResultPreviews: () => Promise.resolve(),
    previewVersion: 0, resultPreviews: null, document: { body: { classList: { remove() {} } } } });
  const sorted = [];
  e.state.applySort = (task) => sorted.push(task);
  e.state.resultSort = 'score';
  const read = e.state.load(oldTask), first = e.state.mountTask(oldTask);
  first.destroy({ keepTaskScores: true });
  assert.equal(e.reads[0].signal.aborted, false);
  e.state.DATA.tasks = [freshTask];
  const replacement = e.state.mountTask(freshTask);
  assert.equal(e.state.load(freshTask), read);
  assert.equal(e.status.hidden, false, 'the replacement page keeps its loading status');
  e.reads[0].resolve({ rows: [{ key: 'model', score: 100 }] });
  await read;
  assert.equal(sorted[0], freshTask, 'only the currently gated task may supply results');
  replacement.destroy({ keepTaskScores: true });
  const third = e.state.mountTask(freshTask);
  e.state.load(freshTask);
  assert.equal(e.reads.length, 1, 'a completed score read survives the delayed activity redraw too');
  third.destroy();
  const leaving = e.state.load(freshTask);
  const fourth = e.state.mountTask(freshTask);
  fourth.destroy();
  assert.equal(e.reads[1].signal.aborted, true);
  e.reads[1].resolve({ rows: [] });
  await leaving;
});

test('a withdrawn task cannot install scores from a response to a preserved read', async () => {
  const e = environment();
  e.state.resultSort = 'score';
  const read = e.state.load({ id: 'one' });
  e.state.DATA.tasks = [];
  e.reads[0].resolve({ rows: [{ key: 'withdrawn', score: 999 }] });
  await read;
  assert.equal(e.state.taskScores.size, 0);
  assert.deepEqual(e.sorts, []);
  e.state.cancel();
});
