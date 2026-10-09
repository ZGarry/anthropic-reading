(() => {
  'use strict';
  const articles=window.ARTICLES,meta=window.CATALOG_META,P=window.ReadingProgress;
  const names={alignment:'对齐',interpretability:'可解释性',economics:'经济','societal-impacts':'社会影响','frontier-red-team':'前沿红队',science:'科学',engineering:'工程',other:'其他研究',announcements:'公告',product:'产品',policy:'政策',education:'教育',events:'活动','beneficial-deployments':'公益应用','case-studies':'案例',features:'专题',research:'综合研究',evaluations:'评测'};
  const sourceNames={all:'全部栏目',News:'News 新闻',Research:'Research 研究',Engineering:'Engineering 工程'};
  const key='anthropic-reading-catalog-v2',prefsKey='anthropic-reading-preferences-v1';
  const $=id=>document.getElementById(id);
  const escape=text=>String(text).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const storageGet=k=>{try{return localStorage.getItem(k);}catch(_){return null;}};
  let state=P.initialize(articles,storageGet(key),storageGet('anthropic-reading-188-v1'),meta.readBatch);
  let read=new Set(state.readIds),observer;
  const topicKeys=[...Object.keys(names).filter(c=>articles.some(a=>a.categories.includes(c))),...new Set(articles.flatMap(a=>a.categories).filter(c=>!names[c]))];
  $('category').innerHTML='<option value="all">全部类别</option>'+topicKeys.map(c=>`<option value="${escape(c)}">${escape(names[c]||c)}</option>`).join('');
  try{
    const prefs=JSON.parse(storageGet(prefsKey));
    if(prefs)for(const id of ['source','category','read-filter','sort','new-filter']){
      if([...$(id).options].some(o=>o.value===prefs[id]))$(id).value=prefs[id];
    }
  }catch(_){}
  document.title=`Anthropic 阅读目录 · ${articles.length} 篇`;
  $('total-count').textContent=articles.length;
  $('progress-total').textContent=articles.length;
  $('progress').max=articles.length;
  $('intro').textContent=`Research ${meta.researchCount} · Engineering ${meta.engineeringCount} · News ${meta.newsCount} · 重合文章已合并`;
  const lastDay=meta.lastSuccessfulDay||new Date(meta.checkedAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
  $('checked-at').textContent=`最近成功核对：${lastDay}（北京时间）`;
  const checks=window.DAILY_CHECKS||[],latest=checks[0];
  const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
  const stale=(Date.parse(today)-Date.parse(lastDay))/86400000>1;
  $('check-health').textContent=latest?.status==='failed'?'最近一次失败，保留上次目录':stale?'超过一天未成功更新':'已更新至 '+lastDay;
  $('check-health').classList.toggle('check-warning',latest?.status==='failed'||stale);
  $('daily-check-list').innerHTML=checks.slice(0,30).map(c=>`<div class="check-row"><time>${escape(c.date)}</time><span>${c.status==='success'?'成功':'失败'}</span><span>新增收录 ${c.newIds.length} 篇</span><small>${c.attempts} 次核对</small></div>`).join('')||'<p>尚无每日核对记录。</p>';
  function announce(message){$('backup-message').textContent=message;}
  function refreshBackupDetails(){
    if(!$('backup-details').open)return;
    const payload=P.backup(state,articles),done=articles.filter(a=>state.entries[a.id]?.read).length;
    $('backup-json').value=JSON.stringify(payload,null,2);
    $('backup-summary').textContent=`已读 ${done} 篇 / 共 ${articles.length} 篇 · 备份生成于 ${new Date(payload.exportedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}（北京时间）`;
  }
  function save(){
    read=new Set(state.readIds);
    try{localStorage.setItem(key,JSON.stringify(state));$('storage-note').textContent='已读状态自动保存在此浏览器。';}
    catch(_){$('storage-note').textContent='浏览器无法保存，请导出备份。';announce('本次修改仅在页面中保留，请立即导出备份。');}
    void window.ReadingFileBackup?.write();
  }
  function prefs(){try{localStorage.setItem(prefsKey,JSON.stringify(Object.fromEntries(['source','category','read-filter','sort','new-filter'].map(id=>[id,$(id).value]))));}catch(_){} }
  function reloadState(){state=P.initialize(articles,storageGet(key)||JSON.stringify(state),null,meta.readBatch);}
  function mark(ids,done){reloadState();for(const id of ids)P.setRead(state,id,done);save();render();}
  function scope(a){return ($('source').value==='all'||a.sources.includes($('source').value))&&($('category').value==='all'||a.categories.includes($('category').value));}
  function matches(a){
    const query=$('search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const haystack=[a.title,a.date,a.source,...a.categories.map(c=>`${c} ${names[c]||c}`)].join(' ').toLowerCase();
    return scope(a)&&query.every(q=>haystack.includes(q))&&($('read-filter').value==='all'||($('read-filter').value==='read'?read.has(a.id):!read.has(a.id)))&&($('new-filter').value==='all'||(a.addedOn&&!read.has(a.id)));
  }
  function row(a){
    const done=read.has(a.id),entry=state.entries[a.id];
    const completed=entry?.completedAt?new Date(entry.completedAt).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'}):null;
    return `<article class="article${done?' is-read':''}" data-id="${escape(a.id)}"><label class="check-area"><input type="checkbox" data-read="${escape(a.id)}" ${done?'checked':''} aria-label="已读：${escape(a.title)}"></label><span class="number">${String(a.number).padStart(3,'0')}</span><time datetime="${a.date}">${a.date.replaceAll('-','.')}</time><div class="article-content"><a class="article-title" href="${escape(a.url)}" target="_blank" rel="noopener noreferrer">${escape(a.title)}</a><div class="article-tags"><span class="tag source-tag">${escape(a.source)}</span>${a.categories.map(c=>`<span class="tag">${escape(names[c]||c)}</span>`).join('')}${a.addedOn&&!done?`<span class="new-badge" title="${a.addedOn} 加入目录，不一定是新发布的文章">新增收录</span>`:''}${done?`<span class="read-text">已读${completed?' · '+completed:''}</span>`:''}</div></div><span class="article-arrow" aria-hidden="true">↗</span></article>`;
  }
  function render(){
    const list=articles.filter(matches).sort((a,b)=>$('sort').value==='asc'?a.number-b.number:b.number-a.number);
    const groups=new Map();
    for(const a of list){const year=a.date.slice(0,4);if(!groups.has(year))groups.set(year,[]);groups.get(year).push(a);}
    $('articles').innerHTML=[...groups].map(([year,items])=>`<section class="year-section" id="year-${year}" aria-labelledby="heading-${year}"><div class="year-heading"><h2 id="heading-${year}">${year}</h2><span>${items.length} 篇文章</span></div>${items.map(row).join('')}</section>`).join('');
    $('year-nav').innerHTML=[...groups].map(([year,items],i)=>`<a class="year-link${i===0?' active':''}" href="#year-${year}"><strong>${year}</strong><span>${items.length}</span></a>`).join('');
    $('result-count').textContent=`${sourceNames[$('source').value]} · ${names[$('category').value]||'全部类别'} · ${list.length} 篇 · ${$('sort').value==='asc'?'从早到晚':'从晚到早'}`;
    $('empty').hidden=list.length!==0;
    $('read-count').textContent=articles.filter(a=>read.has(a.id)).length;
    $('progress').value=Number($('read-count').textContent);
    const newsRead=articles.filter(a=>a.sources.includes('News')&&read.has(a.id)).length;
    $('news-progress').textContent=`News 已读 ${newsRead} / ${meta.newsCount} · 新文章保留未读`;
    $('source-buttons').innerHTML=Object.entries(sourceNames).map(([source,label])=>{
      const subset=articles.filter(a=>source==='all'||a.sources.includes(source));
      const pending=subset.filter(a=>!read.has(a.id)).length;
      return `<button type="button" class="category-button source-button" data-source="${source}" aria-pressed="${$('source').value===source}"><span>${label}</span><small>${subset.length} 篇 · ${pending} 篇未读</small></button>`;
    }).join('');
    const sourceArticles=articles.filter(a=>$('source').value==='all'||a.sources.includes($('source').value));
    const newsTopics=['announcements','product','policy','education','events','beneficial-deployments','case-studies','features'];
    const featuredTopics=$('source').value==='News'?[...new Set([...newsTopics,...topicKeys])]:topicKeys;
    $('category-buttons').innerHTML=['all',...featuredTopics.filter(c=>sourceArticles.some(a=>a.categories.includes(c))).slice(0,8)].map(c=>{
      const subset=sourceArticles.filter(a=>c==='all'||a.categories.includes(c));
      const pending=subset.filter(a=>!read.has(a.id)).length;
      return `<button type="button" class="category-button" data-category="${c}" aria-pressed="${$('category').value===c}"><span>${names[c]||'全部'}</span><small>${pending} / ${subset.length} 未读</small></button>`;
    }).join('');
    const selected=articles.filter(scope),pending=selected.filter(a=>!read.has(a.id));
    $('category-progress').textContent=`当前类别与栏目：${selected.length-pending.length} / ${selected.length} 篇已读，剩余 ${pending.length} 篇`;
    const next=pending[0],link=$('continue-reading');
    if(next){link.hidden=false;link.href=next.url;link.textContent=`继续阅读：${next.title}`;$('next-date').textContent=`${next.date} · 最早未读`;}
    else{link.hidden=true;$('next-date').textContent=selected.length?'该类别已读完':'该组合下暂无文章';}
    const newUnread=articles.filter(a=>a.addedOn&&!read.has(a.id)).length;
    $('show-new').textContent=`新增未读 ${newUnread} 篇`;
    $('show-new').setAttribute('aria-pressed',$('new-filter').value==='new');
    refreshBackupDetails();
    if(observer)observer.disconnect();
    if('IntersectionObserver'in window){observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting)document.querySelectorAll('.year-link').forEach(a=>a.classList.toggle('active',a.hash==='#'+e.target.id));},{rootMargin:'-15% 0px -65% 0px'});document.querySelectorAll('.year-section').forEach(e=>observer.observe(e));}
  }
  function clear(){for(const id of ['source','category','read-filter','new-filter'])$(id).value='all';$('search').value='';$('sort').value='asc';}
  $('search').addEventListener('input',render);
  for(const id of ['source','category','read-filter','sort','new-filter'])$(id).addEventListener('change',()=>{if(id==='source')$('category').value='all';if(id==='category'||id==='source')$('sort').value='asc';prefs();render();});
  $('clear-filters').addEventListener('click',()=>{clear();prefs();render();$('search').focus();});
  $('source-buttons').addEventListener('click',e=>{const b=e.target.closest('[data-source]');if(!b)return;clear();$('source').value=b.dataset.source;prefs();render();document.querySelector(`[data-source="${b.dataset.source}"]`)?.focus({preventScroll:true});});
  $('category-buttons').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(!b)return;const source=$('source').value;clear();$('source').value=source;$('category').value=b.dataset.category;prefs();render();document.querySelector(`[data-category="${b.dataset.category}"]`)?.focus({preventScroll:true});});
  $('show-new').addEventListener('click',()=>{clear();$('new-filter').value='new';$('read-filter').value='unread';prefs();render();});
  $('articles').addEventListener('change',e=>{const input=e.target.closest('[data-read]');if(!input)return;const id=input.dataset.read;mark([id],input.checked);[...document.querySelectorAll('[data-read]')].find(e=>e.dataset.read===id)?.focus({preventScroll:true});});
  $('export-progress').addEventListener('click',()=>{
    reloadState();
    const payload=P.backup(state,articles),blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download=`Anthropic-reading-progress-${new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'})}.json`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    announce('已生成备份下载，包含已读、未读和完成时间。换浏览器时可导入恢复。');
  });
  $('import-progress').addEventListener('click',()=>$('backup-file').click());
  $('backup-details').addEventListener('toggle',()=>{if($('backup-details').open){reloadState();read=new Set(state.readIds);render();}});
  $('copy-backup').addEventListener('click',async()=>{
    reloadState();refreshBackupDetails();
    try{await navigator.clipboard.writeText($('backup-json').value);$('copy-backup-status').textContent='已复制，请粘贴保存到你的备份文件。';}
    catch(_){$('backup-json').focus();$('backup-json').select();$('copy-backup-status').textContent='已选中备份内容，请手动复制。';}
  });
  $('backup-file').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      if(file.size>8*1024*1024)throw new Error('备份文件过大，未导入。');
      const payload=JSON.parse(await file.text());reloadState();
      const result=P.mergeBackup(state,payload);state=result.state;save();render();
      announce(`已合并备份，更新 ${result.changed} 条记录；相同文章保留较新的修改。`);
    }catch(error){announce(error instanceof SyntaxError?'文件不是有效 JSON，原有记录未改动。':error.message);}finally{e.target.value='';}
  });
  window.addEventListener('storage',event=>{if(event.key===key&&event.newValue){state=P.initialize(articles,event.newValue,null,meta.readBatch);read=new Set(state.readIds);render();}});
  save();render();
  window.ReadingFileBackup.initialize({getBackup:()=>P.backup(state,articles),mergeBackup:payload=>{reloadState();state=P.mergeBackup(state,payload).state;save();render();}});
  if(document.modelContext?.registerTool){
    const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
    try{void Promise.resolve(document.modelContext.registerTool({name:'set_article_read_status',title:'设置文章已读状态',description:'按目录文章编号批量设置已读或未读，并自动保存在当前浏览器。编号会随目录新增而变化，请先核对当前编号。',inputSchema:{type:'object',properties:{article_numbers:{type:'array',items:{type:'integer',minimum:1,maximum:articles.length},minItems:1,maxItems:articles.length,uniqueItems:true},read:{type:'boolean'}},required:['article_numbers','read'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['article_numbers','read'].includes(k))||typeof input.read!=='boolean'||!Array.isArray(input.article_numbers)||!input.article_numbers.length||input.article_numbers.length>articles.length||new Set(input.article_numbers).size!==input.article_numbers.length||!input.article_numbers.every(n=>Number.isInteger(n)&&n>=1&&n<=articles.length))throw new Error('请提供有效且不重复的文章编号和 read 布尔值。');const selected=input.article_numbers.map(n=>articles.find(a=>a.number===n));mark(selected.map(a=>a.id),input.read);return{updated:selected.map(a=>({number:a.number,title:a.title,read:input.read})),totalRead:articles.filter(a=>read.has(a.id)).length};}},{signal:lifecycle.signal})).catch(()=>{});}catch(_){}
  }
})();
