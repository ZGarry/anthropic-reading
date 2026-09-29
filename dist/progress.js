(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.ReadingProgress=factory();
})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const parse=value=>{try{return JSON.parse(value);}catch(_){return null;}};
  const validEntry=e=>e&&typeof e.read==='boolean'&&Number.isFinite(e.updatedAt)&&e.updatedAt>=0&&(e.completedAt===null||typeof e.completedAt==='string');
  function initialize(articles,savedRaw,legacyRaw,batch){
    const saved=parse(savedRaw),legacy=parse(legacyRaw);
    const valid=saved&&saved.version===2&&Array.isArray(saved.readIds)&&Array.isArray(saved.appliedBatches);
    const readIds=new Set((valid?saved.readIds:Array.isArray(legacy)?legacy:[]).filter(id=>typeof id==='string'));
    const entries=Object.create(null);
    if(valid&&saved.entries&&typeof saved.entries==='object'){
      for(const [id,e] of Object.entries(saved.entries))if(validEntry(e))entries[id]={...e};
    }
    for(const id of readIds)if(!entries[id])entries[id]={read:true,updatedAt:0,completedAt:null};
    const appliedBatches=new Set(valid?saved.appliedBatches.filter(x=>typeof x==='string'):[]);
    if(!appliedBatches.has(batch)){
      for(const a of articles)if(a.defaultRead&&!entries[a.id])entries[a.id]={read:true,updatedAt:0,completedAt:null};
      appliedBatches.add(batch);
    }
    for(const a of articles)if(!entries[a.id])entries[a.id]={read:false,updatedAt:0,completedAt:null};
    return normalize({version:2,entries,appliedBatches:[...appliedBatches]});
  }
  function normalize(state){
    state.readIds=Object.keys(state.entries).filter(id=>state.entries[id].read);
    return state;
  }
  function setRead(state,id,read,now=Date.now()){
    state.entries[id]={read,updatedAt:now,completedAt:read?new Date(now).toISOString():null};
    return normalize(state);
  }
  function backup(state,articles,now=new Date().toISOString()){
    return {format:'anthropic-reading-backup',version:1,exportedAt:now,
      note:'历史已读记录的完成时间未知；updatedAt 为 0 表示初始记录。',
      progress:state,articles:articles.map(a=>({id:a.id,title:a.title,date:a.date,url:a.url,categories:a.categories}))};
  }
  function mergeBackup(state,payload){
    if(!payload||payload.format!=='anthropic-reading-backup'||payload.version!==1||!payload.progress||payload.progress.version!==2||!payload.progress.entries||typeof payload.progress.entries!=='object'||Array.isArray(payload.progress.entries))throw new Error('这不是有效的阅读进度备份。原有记录未改动。');
    const incoming=Object.entries(payload.progress.entries);
    if(incoming.length>50000||incoming.some(([id,e])=>!id||id.length>500||!validEntry(e)))throw new Error('备份中的记录格式不正确。原有记录未改动。');
    const entries=Object.assign(Object.create(null),state.entries);
    let changed=0;
    for(const [id,e] of incoming){
      if(!entries[id]||e.updatedAt>entries[id].updatedAt||(e.updatedAt===0&&entries[id].updatedAt===0)){
        if(!entries[id]||JSON.stringify(entries[id])!==JSON.stringify(e))changed++;
        entries[id]={...e};
      }
    }
    const batches=Array.isArray(payload.progress.appliedBatches)?payload.progress.appliedBatches.filter(x=>typeof x==='string'):[];
    return {state:normalize({...state,entries,appliedBatches:[...new Set([...state.appliedBatches,...batches])]}),changed};
  }
  return {initialize,setRead,backup,mergeBackup};
});
