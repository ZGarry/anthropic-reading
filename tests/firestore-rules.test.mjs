import {before,after,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,deleteDoc,serverTimestamp} from 'firebase/firestore';
let env;
const claims={firebase:{sign_in_provider:'google.com'}};
const data=()=>({schema:1,entries:{article:{read:true,updatedAt:1,completedAt:'1970-01-01T00:00:00.001Z'}},savedAt:serverTimestamp()});
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-reading-tests',firestore:{host:'127.0.0.1',port:8088,rules:readFileSync('firestore.rules','utf8')}});});
after(async()=>{await env?.cleanup();});
test('Google account can save and read its own current record and daily snapshot',async()=>{
  const db=env.authenticatedContext('alice',claims).firestore();
  await assertSucceeds(setDoc(doc(db,'users/alice/progress/current'),data()));
  await assertSucceeds(getDoc(doc(db,'users/alice/progress/current')));
  await assertSucceeds(setDoc(doc(db,'users/alice/daily/2026-10-09'),data()));
});
test('anonymous and other accounts cannot read or overwrite personal records',async()=>{
  for(const db of [env.unauthenticatedContext().firestore(),env.authenticatedContext('bob',claims).firestore()]){
    await assertFails(getDoc(doc(db,'users/alice/progress/current')));
    await assertFails(setDoc(doc(db,'users/alice/progress/current'),data()));
    await assertFails(getDoc(doc(db,'users/alice/daily/2026-10-09')));
  }
});
test('non-Google identities, malformed writes and deletion are denied',async()=>{
  const db=env.authenticatedContext('alice',claims).firestore();
  await assertFails(setDoc(doc(db,'users/alice/progress/current'),{...data(),savedAt:123}));
  await assertFails(setDoc(doc(db,'users/alice/progress/current'),{...data(),entries:[]}));
  await assertFails(setDoc(doc(db,'users/alice/progress/current'),{...data(),unexpected:'field'}));
  await assertFails(setDoc(doc(db,'users/alice/daily/bad-day'),data()));
  await assertFails(deleteDoc(doc(db,'users/alice/progress/current')));
  const password=env.authenticatedContext('alice',{firebase:{sign_in_provider:'password'}}).firestore();
  await assertFails(getDoc(doc(password,'users/alice/progress/current')));
});
