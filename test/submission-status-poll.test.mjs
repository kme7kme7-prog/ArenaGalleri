import assert from 'node:assert/strict';import {readFileSync}from'node:fs';import test from'node:test';import vm from'node:vm';
const source=readFileSync(new URL('../site/submit.js',import.meta.url),'utf8'),start=source.indexOf('  let pollRun ='),end=source.indexOf('  async function submit(form)',start);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};const flush=()=>new Promise(r=>setImmediate(r));
function environment(){const timers=new Map(),reads=[],draws=[];let id=0,version=1,refreshes=0;const state={resultOwner:1,polls:0,result:{work:{id:'work',task:'task',title:'Keep title',scene:'keep-scene',moderation:{status:'pending'}},question:{id:'question',title:'Keep question',moderation:{status:'pending'}}}};const ctx={state,active:true,suspended:false,document:{hidden:false},AbortController,URLSearchParams,accountVersion:()=>version,POLL_MS:15000,POLL_LIMIT:40,waiting:r=>r.work.moderation.status==='pending'||r.question.moderation.status==='pending',setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id},clearTimeout:n=>timers.delete(n),api:(path,options)=>{const d=deferred();reads.push({path,...options,...d});return d.promise},refreshPlatform:async()=>{refreshes++},draw:()=>draws.push(state.result)};vm.runInNewContext(source.slice(start,end)+'\nglobalThis.followStatus=follow;globalThis.stopStatus=stopFollow;globalThis.visibility=followVisibility;',ctx);return{ctx,state,reads,timers,draws,refreshes:()=>refreshes,identity:()=>version++,async fire(ms){const entry=[...timers].find(([,t])=>t.ms===ms);assert.ok(entry,'expected scheduled delay '+ms);timers.delete(entry[0]);entry[1].fn();await flush();}};}
test('status checks use only the current submission, pause when hidden and retain submitted metadata',async()=>{const e=environment();e.ctx.document.hidden=true;e.ctx.followStatus();assert.equal(e.timers.size,0);e.ctx.document.hidden=false;e.ctx.visibility();await e.fire(0);assert.equal(e.reads[0].path,'me?view=submission&task=task&work=work&question=question');e.ctx.followStatus();assert.equal(e.reads.length,1);e.ctx.document.hidden=true;e.ctx.visibility();assert.equal(e.reads[0].signal.aborted,true);e.reads[0].resolve({work:{status:'verified',moderation:{status:'approved'}}});await flush();assert.equal(e.state.result.work.moderation.status,'pending');e.ctx.document.hidden=false;e.ctx.visibility();await e.fire(0);e.reads[1].resolve({work:{status:'verified',moderation:{status:'approved'}},question:{moderation:{status:'approved'}}});await flush();assert.equal(e.state.result.work.title,'Keep title');assert.equal(e.state.result.work.scene,'keep-scene');assert.equal(e.state.result.question.title,'Keep question');assert.equal(e.refreshes(),1);assert.equal(e.draws.length,1);assert.equal(e.timers.size,0);e.ctx.stopStatus();});
test('failed status checks retry; removed submissions stop and late reads after departure or identity are ignored',async()=>{const e=environment();e.ctx.followStatus();await e.fire(15000);e.reads[0].reject(new Error('offline'));await flush();await e.fire(15000);e.identity();e.reads[1].resolve({work:{status:'verified'}});await flush();assert.equal(e.draws.length,0);assert.equal(e.timers.size,0);e.ctx.stopStatus();const removed=environment();removed.ctx.followStatus();await removed.fire(15000);removed.reads[0].reject({status:404});await flush();assert.equal(removed.state.polls,40);assert.equal(removed.timers.size,0);const left=environment();left.ctx.followStatus();await left.fire(15000);left.ctx.active=false;left.ctx.stopStatus();assert.equal(left.reads[0].signal.aborted,true);left.reads[0].resolve({work:{status:'verified'}});await flush();assert.equal(left.draws.length,0);assert.equal(left.timers.size,0);});

test('a submission cannot draw the previous account after its catalog refresh settles', async () => {
  const begin = source.indexOf('  async function submit(form)');
  const finish = source.indexOf('  // A draft survives', begin);
  const refresh = deferred(), started = deferred();
  let owner = 1;
  const draws = [], button = {}, label = { textContent: 'Submit' }, error = {};
  const context = { active: true, accountVersion: () => owner, state: { draft: { id: 'draft' } }, task: {}, options: {},
    readWorkFields: () => ({ body: { modelName: 'Fixture' } }), trialSummary: () => ({}), clearTimeout() {},
    api: async () => ({ work: { task: 'task', id: 'work', moderation: { status: 'pending' } } }),
    refreshPlatform: () => { started.resolve(); return refresh.promise; }, toast() {},
    $: (selector) => selector === '[type="submit"]' ? button : selector === '[data-submit-label]' ? label : error,
    draw: () => draws.push('draw'), follow: () => draws.push('follow'), scrollTo() {} };
  vm.runInNewContext(`${source.slice(begin, finish)}\nglobalThis.send = submit;`, context);
  const sending = context.send({ attest: { checked: true } });
  await started.promise;
  owner = 2;
  refresh.resolve();
  await sending;
  assert.deepEqual(draws, []);
});
