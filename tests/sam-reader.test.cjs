const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const model=require('../dist/cloud-model.js');
function reader(){
  const dom=new JSDOM(fs.readFileSync('dist/sam/index.html','utf8'),{url:'https://zgarry.github.io/anthropic-reading/sam/',runScripts:'outside-only'}),w=dom.window;
  w.structuredClone=structuredClone;
  w.ReadingFileBackup={write(){},setScope(){},initialize(){}};
  for(const file of ['sam/catalog.js','sam/checks.js','sam/directory.js','progress.js','cloud-model.js','reader.js'])w.eval(fs.readFileSync('dist/'+file,'utf8'));
  return {w,api:w.ReadingAccount,close:()=>w.close()};
}
test('Sam page renders full catalogue, correct dates, independent counts and title',()=>{
  const f=reader(),{w}=f;
  assert.equal(w.document.querySelectorAll('[data-read]').length,w.ARTICLES.length);
  assert.match(w.document.title,/Sam Altman/);
  assert.match(w.document.getElementById('intro').textContent,/13 页/);
  assert.equal(w.document.getElementById('read-count').textContent,'0');
  assert.equal(w.document.getElementById('continue-reading').dataset.openArticle,w.ARTICLES[0].id);
  assert(!w.document.body.textContent.includes('undefined'));
  f.close();
});
test('cloud round trip preserves Anthropic IDs and Sam cancellation without merging counts',()=>{
  const f=reader(),{w,api}=f;api.activate('alice');
  const samId=w.ARTICLES[0].id;
  const remote={version:2,entries:{'core-views-on-ai-safety':{read:true,updatedAt:100,completedAt:null}},appliedBatches:[]};
  api.mergeCloudState(remote);
  assert.equal(w.document.getElementById('read-count').textContent,'0');
  const checkbox=w.document.querySelector('[data-read="'+samId+'"]');checkbox.checked=true;checkbox.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(w.document.getElementById('read-count').textContent,'1');
  const merged=model.fromDocument(model.toDocument(model.merge(remote,api.getState())));
  assert.equal(merged.entries['core-views-on-ai-safety'].read,true);
  assert.equal(merged.entries[samId].read,true);
  const backup=w.ReadingProgress.backup(api.getState(),w.ARTICLES);
  assert.equal(backup.progress.entries['core-views-on-ai-safety'].read,true);
  api.activate('bob');assert.equal(w.document.getElementById('read-count').textContent,'0');
  api.activate('alice');
  const undo=w.document.querySelector('[data-read="'+samId+'"]');undo.checked=false;undo.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(api.getState().entries['core-views-on-ai-safety'].read,true);
  assert.equal(api.getState().entries[samId].read,false);
  f.close();
});
test('Sam topic and keyword filters find matching posts and retain chronological continuation',()=>{
  const f=reader(),{w}=f;
  const category=w.document.getElementById('category');category.value='ai';category.dispatchEvent(new w.Event('change'));
  assert(w.document.querySelectorAll('[data-read]').length>0);
  assert([...w.document.querySelectorAll('[data-read]')].every(el=>w.ARTICLES.find(a=>a.id===el.dataset.read).categories.includes('ai')));
  const expected=w.ARTICLES.find(a=>a.categories.includes('ai'));
  assert.equal(w.document.getElementById('continue-reading').dataset.openArticle,expected.id);
  category.value='all';category.dispatchEvent(new w.Event('change'));
  const search=w.document.getElementById('search');search.value='How To Be Successful';search.dispatchEvent(new w.Event('input'));
  assert.equal(w.document.querySelectorAll('[data-read]').length,1);
  f.close();
});
