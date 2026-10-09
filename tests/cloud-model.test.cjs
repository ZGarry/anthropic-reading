const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../dist/cloud-model.js');
const state=entries=>({version:2,entries,appliedBatches:[]});
const entry=(read,updatedAt)=>({read,updatedAt,completedAt:read&&updatedAt?new Date(updatedAt).toISOString():null});
test('two devices merge independent changes and newer unread decisions survive',()=>{
  const a=state({first:entry(true,100),second:entry(true,150)}),b=state({second:entry(false,200),third:entry(true,180)});
  const merged=M.merge(a,b);
  assert.deepEqual(merged.readIds,['first','third']);assert.equal(merged.entries.second.updatedAt,200);
  assert.deepEqual(M.merge(a,b),M.merge(b,a));
});
test('legacy read at time zero survives a fresh device with default unread',()=>{
  assert.deepEqual(M.merge(state({old:entry(true,0)}),state({old:entry(false,0)})).readIds,['old']);
});
test('equal-time conflict converges and respects an explicit unread',()=>{
  const a=state({old:entry(true,10)}),b=state({old:entry(false,10)});
  assert.deepEqual(M.merge(a,b),M.merge(b,a));assert.equal(M.merge(a,b).entries.old.read,false);
});
test('server payload rejects malformed records before applying any data',()=>{
  assert.throws(()=>M.fromDocument({schema:2,entries:{}}));
  assert.throws(()=>M.fromDocument({schema:1,entries:{bad:{read:'yes',updatedAt:1,completedAt:null}}}));
  assert.throws(()=>M.fromDocument({schema:1,entries:{bad:{read:true,updatedAt:1,completedAt:'bad-date'}}}));
});
test('separate accounts and guest mode cannot share a storage key',()=>{
  assert.equal(M.accountKey(null),'anthropic-reading-catalog-v2');
  assert.notEqual(M.accountKey('alice'),M.accountKey('bob'));assert.notEqual(M.accountKey('alice'),M.accountKey(null));
});
test('Firestore payload excludes article metadata, default-unread entries and account email',()=>{
  const d=M.toDocument(state({old:entry(true,0),untouched:entry(false,0),changed:entry(false,50)}));
  assert.deepEqual(Object.keys(d),['schema','entries']);assert.equal(Object.keys(d.entries).length,2);
  assert.equal(M.fingerprint(M.fromDocument(d)),M.fingerprint(state(d.entries)));
});
