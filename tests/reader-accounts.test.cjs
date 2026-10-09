const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
function reader(){
  const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{url:'https://example.test/reading/',runScripts:'outside-only'}),w=dom.window;
  w.structuredClone=structuredClone;
  w.ARTICLES=[{id:'news',title:'News',date:'2026-01-01',number:1,url:'https://example.test/news',source:'News',sources:['News'],categories:['announcements'],defaultRead:false},{id:'research',title:'Research',date:'2026-01-02',number:2,url:'https://example.test/research',source:'Research',sources:['Research'],categories:['alignment'],defaultRead:false}];
  w.CATALOG_META={readBatch:'public-catalog-v1',researchCount:1,engineeringCount:0,newsCount:1,lastSuccessfulDay:'2026-10-09'};w.DAILY_CHECKS=[];
  w.ReadingFileBackup={write(){},setScope(){},initialize(){}};
  for(const file of ['progress.js','cloud-model.js'])w.eval(fs.readFileSync('dist/'+file,'utf8'));
  const state=w.ReadingProgress.initialize(w.ARTICLES,null,null,'public-catalog-v1');w.ReadingProgress.setRead(state,'news',true,100);w.localStorage.setItem('anthropic-reading-catalog-v2',JSON.stringify(state));
  w.eval(fs.readFileSync('dist/reader.js','utf8'));
  return {w,close:()=>w.close(),api:w.ReadingAccount};
}
test('login uses isolated storage; guest migration is explicit and does not leak to another account',()=>{
  const f=reader(),{w,api}=f;
  assert.equal(w.document.getElementById('read-count').textContent,'1');
  api.activate('alice');assert.equal(w.document.getElementById('read-count').textContent,'0');
  api.mergeCloudState(api.getGuestState());assert.equal(w.document.getElementById('read-count').textContent,'1');
  const input=w.document.querySelector('[data-read="news"]');input.checked=false;input.dispatchEvent(new w.Event('change',{bubbles:true}));
  api.activate('bob');assert.equal(w.document.getElementById('read-count').textContent,'0');
  api.activate(null);assert.equal(w.document.getElementById('read-count').textContent,'1');
  api.activate('alice');assert.equal(w.document.getElementById('read-count').textContent,'0');assert(api.getState().entries.news.updatedAt>100);f.close();
});
test('cloud corruption leaves the existing reading state intact',()=>{
  const f=reader(),before=JSON.stringify(f.api.getState());
  assert.throws(()=>f.api.mergeCloudState({version:2,entries:{news:{read:'bad',updatedAt:5,completedAt:null}}}));
  assert.equal(JSON.stringify(f.api.getState()),before);f.close();
});
test('local storage write failure does not erase the newest in-memory edit',()=>{
  const f=reader(),{w,api}=f;
  w.Storage.prototype.setItem=()=>{throw new Error('quota');};
  const input=w.document.querySelector('[data-read="research"]');input.checked=true;input.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(api.getState().readIds.length,2);assert.equal(w.document.getElementById('read-count').textContent,'2');f.close();
});

test('an import started before switching accounts cannot merge into the new account',async()=>{
  const f=reader(),{w,api}=f;let complete;
  const payload=JSON.stringify(w.ReadingProgress.backup(api.getGuestState(),w.ARTICLES));
  const file=w.document.getElementById('backup-file');
  Object.defineProperty(file,'files',{value:[{size:payload.length,text:()=>new Promise(resolve=>complete=resolve)}]});
  file.dispatchEvent(new w.Event('change'));api.activate('bob');complete(payload);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(api.getState().readIds.length,0);assert.match(w.document.getElementById('backup-message').textContent,/账号已切换/);f.close();
});

test('a new manual edit wins even if a synced device clock was slightly ahead',()=>{
  const f=reader(),{w,api}=f,future=Date.now()+10000;
  api.mergeCloudState({version:2,entries:{news:{read:true,updatedAt:future,completedAt:new Date(future).toISOString()}},appliedBatches:[]});
  const input=w.document.querySelector('[data-read="news"]');input.checked=false;input.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(api.getState().entries.news.read,false);assert(api.getState().entries.news.updatedAt>future);f.close();
});
