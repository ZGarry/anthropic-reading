import {test} from 'node:test';
import assert from 'node:assert/strict';
import M from '../dist/cloud-model.js';
import {createSyncEngine} from '../src/sync-engine.mjs';
const read=(id,t)=>({version:2,entries:{[id]:{read:true,updatedAt:t,completedAt:new Date(t).toISOString()}},appliedBatches:[]});
function fixture(commit){
  let state=read('a',1);const statuses=[];
  const engine=createSyncEngine({getState:()=>state,mergeState:s=>state=M.merge(state,s),commit,status:(...s)=>statuses.push(s),delay:60000});
  return {engine,statuses,get:()=>state,add:s=>state=M.merge(state,s)};
}
test('new local changes during an in-flight save are preserved and remain pending',async()=>{
  let resolve;const f=fixture(snapshot=>new Promise(r=>resolve=()=>r({state:snapshot,savedAt:10})));
  const done=f.engine.flush();f.add(read('b',2));f.engine.schedule();resolve();await done;
  assert.deepEqual(f.get().readIds,['a','b']);assert.equal(f.statuses.at(-1)[0],'pending');f.engine.close();
});
test('account switch closes the old sync before late responses can modify the next account',async()=>{
  let resolve;const f=fixture(()=>new Promise(r=>resolve=r));const done=f.engine.flush();f.engine.close();
  resolve({state:read('foreign-record',20),savedAt:20});await done;
  assert(!f.get().entries['foreign-record']);assert(!f.statuses.some(x=>x[0]==='saved'));
});
test('permission failure preserves local records and never reports cloud success',async()=>{
  const f=fixture(async()=>{throw Object.assign(new Error('Denied'),{code:'permission-denied'});});
  await f.engine.flush();assert.deepEqual(f.get().readIds,undefined);assert(f.get().entries.a.read);assert.equal(f.statuses.at(-1)[0],'error');f.engine.close();
});
test('offline edits resume on reconnect and succeed only after acknowledgement',async()=>{
  let online=false,writes=0,state=read('a',1);const statuses=[];
  const engine=createSyncEngine({getState:()=>state,mergeState:s=>state=M.merge(state,s),isOnline:()=>online,commit:async s=>{writes++;return {state:s,savedAt:22};},status:s=>statuses.push(s),delay:60000});
  await engine.flush();assert.equal(writes,0);assert.equal(statuses.at(-1),'offline');online=true;await engine.flush();assert.equal(writes,1);assert.equal(statuses.at(-1),'saved');engine.close();
});
test('unchanged server snapshots do not trigger repeated writes',async()=>{
  let writes=0;const f=fixture(async s=>{writes++;return {state:s,savedAt:1};});
  f.engine.receive(read('a',1),1,false);await f.engine.flush();assert.equal(writes,0);f.engine.close();
});

test('returning online restores the acknowledged status without a redundant write',()=>{
  let online=true,state=read('a',1);const statuses=[];
  const engine=createSyncEngine({getState:()=>state,mergeState:s=>state=M.merge(state,s),isOnline:()=>online,commit:()=>{throw new Error('unnecessary write');},status:(...s)=>statuses.push(s)});
  engine.receive(state,5,false);online=false;engine.schedule();assert.equal(statuses.at(-1)[0],'offline');
  online=true;engine.schedule();assert.deepEqual(statuses.at(-1),['saved',5]);engine.close();
});
