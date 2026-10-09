const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
function reader(extraArticles=[]){
  const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{url:'https://example.test/reading/',runScripts:'outside-only'}),w=dom.window;
  w.structuredClone=structuredClone;
  w.ARTICLES=[{id:'news',title:'News',date:'2026-01-01',number:1,url:'https://example.test/news',source:'News',sources:['News'],categories:['announcements'],defaultRead:false},{id:'research',title:'Research',date:'2026-01-02',number:2,url:'https://example.test/research',source:'Research',sources:['Research'],categories:['alignment'],defaultRead:false},...extraArticles];
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

test('opening an article saves to the active account, notifies sync, and still allows manual unread',async()=>{
  const f=reader(),{w,api}=f;api.activate('alice');let changes=0;
  w.addEventListener('reading-progress-changed',()=>changes++);
  const link=w.document.querySelector('[data-open-article="research"]');
  const event=new w.MouseEvent('click',{bubbles:true,cancelable:true,button:0,ctrlKey:true});
  link.dispatchEvent(event);
  assert.equal(event.defaultPrevented,false,'Native new-tab navigation must remain enabled');
  assert.equal(link.isConnected,true,'Do not remove the link before its default action');
  assert.equal(link.href,'https://example.test/research');
  assert.equal(api.getState().entries.research.read,true);
  assert.equal(JSON.parse(w.localStorage.getItem('anthropic-reading-catalog-v2:user:alice')).entries.research.read,true);
  assert.equal(api.getGuestState().entries.research.read,false);
  assert.equal(changes,1);
  await new Promise(resolve=>w.setTimeout(resolve,0));
  const checkbox=w.document.querySelector('[data-read="research"]');assert.equal(checkbox.checked,true);
  checkbox.checked=false;checkbox.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(api.getState().entries.research.read,false);assert.equal(changes,2);f.close();
});

test('continue-reading opens the selected article before advancing to the next unread one',async()=>{
  const f=reader([{id:'later',title:'Later',date:'2026-01-03',number:3,url:'https://example.test/later',source:'Research',sources:['Research'],categories:['alignment'],defaultRead:false}]),{w,api}=f;
  const link=w.document.getElementById('continue-reading');
  assert.equal(link.href,'https://example.test/research');
  link.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true,button:0}));
  assert.equal(link.href,'https://example.test/research','Keep the activated destination until navigation runs');
  assert.equal(api.getState().entries.research.read,true);assert.equal(api.getState().readIds.includes('later'),false);
  await new Promise(resolve=>w.setTimeout(resolve,0));
  assert.equal(link.href,'https://example.test/later');assert.equal(link.dataset.openArticle,'later');f.close();
});

test('middle-click marks read, right-click does not, and reopening preserves the original reading date',()=>{
  const f=reader(),{w,api}=f,link=w.document.querySelector('[data-open-article="research"]');
  link.dispatchEvent(new w.MouseEvent('auxclick',{bubbles:true,button:2}));
  assert.equal(api.getState().readIds.includes('research'),false);
  link.dispatchEvent(new w.MouseEvent('auxclick',{bubbles:true,button:1}));
  const original=JSON.stringify(api.getState().entries.research);assert.equal(api.getState().entries.research.read,true);
  link.dispatchEvent(new w.MouseEvent('click',{bubbles:true,button:0}));
  assert.equal(JSON.stringify(api.getState().entries.research),original);f.close();
});

test('opening a link while resolving the login account does not mark another account',()=>{
  const f=reader(),{w,api}=f;api.activate('alice');api.setLoading(true);
  w.document.querySelector('[data-open-article="research"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true,button:0}));
  assert.equal(api.getState().readIds.length,0);assert.equal(api.getGuestState().entries.research.read,false);f.close();
});
