(() => {
  'use strict';
  let handle=null,queue=Promise.resolve(),getBackup,mergeBackup,scope='anthropic-reading-catalog-v2',epoch=0;
  const note=text=>document.getElementById('file-backup-note').textContent=text;
  const scopeKey=s=>s==='anthropic-reading-catalog-v2'?'progress':s;
  async function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('anthropic-reading-file-backup',1);r.onupgradeneeded=()=>r.result.createObjectStore('handles');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function stored(value,selectedScope=scope){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('handles',value?'readwrite':'readonly'),s=tx.objectStore('handles'),r=value?s.put(value,scopeKey(selectedScope)):s.get(scopeKey(selectedScope));let result;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
  function write(){
    if(!handle)return Promise.resolve();
    const snapshot=JSON.stringify(getBackup(),null,2),target=handle,turn=epoch;
    queue=queue.then(async()=>{
      if(turn!==epoch)return;
      if(await target.queryPermission({mode:'readwrite'})!=='granted')throw new Error('请点“连接自动备份文件”恢复写入权限');
      if(turn!==epoch)return;
      const out=await target.createWritable();await out.write(snapshot);await out.close();
      if(turn===epoch)note('已同步到本地文件：'+target.name+' · '+new Date().toLocaleTimeString('zh-CN'));
    }).catch(error=>{if(turn===epoch)note('本地文件未更新；浏览器进度仍保留。'+error.message);});
    return queue;
  }
  async function restore(){
    const turn=epoch,selectedScope=scope;
    try{
      const saved=await stored(null,selectedScope);if(turn!==epoch)return;
      if(!saved){note('此阅读账号尚未连接本地备份文件；云端同步不依赖本地文件。');return;}
      if(await saved.queryPermission({mode:'readwrite'})!=='granted'){if(turn===epoch)note('已有备份文件。点击连接按钮重新授权后继续自动保存。');return;}
      const file=await saved.getFile(),payload=file.size?JSON.parse(await file.text()):null;
      if(turn!==epoch)return;
      if(payload)mergeBackup(payload);handle=saved;note('自动备份已连接：'+handle.name);
    }catch{if(turn===epoch)note('自动备份尚未连接；可以导出或导入 JSON 文件。');}
  }
  async function connect(){
    const turn=epoch,selectedScope=scope;
    try{
      const saved=await stored(null,selectedScope);if(turn!==epoch)return;
      let selected=saved;
      if(saved){if(await saved.requestPermission({mode:'readwrite'})!=='granted'){if(turn===epoch)note('未获文件写入权限，浏览器仍会保存进度。');return;}}
      else selected=await window.showSaveFilePicker({suggestedName:'Anthropic-reading-progress.json',types:[{description:'阅读进度备份',accept:{'application/json':['.json']}}]});
      const file=await selected.getFile(),payload=file.size?JSON.parse(await file.text()):null;
      if(turn!==epoch)return;
      if(payload)mergeBackup(payload);handle=selected;await stored(handle,selectedScope);await write();
    }catch(error){if(turn===epoch)note(error.name==='AbortError'?'已取消连接；浏览器进度保持不变。':'连接失败：'+error.message);}
  }
  async function setScope(next){scope=next;epoch++;handle=null;if(window.showSaveFilePicker)await restore();}
  window.ReadingFileBackup={write,setScope,initialize(options){getBackup=options.getBackup;mergeBackup=options.mergeBackup;scope=options.scope;const button=document.getElementById('connect-backup-file');if(!window.showSaveFilePicker){button.hidden=true;note('当前浏览器请使用“导出进度备份”保存到电脑。');return;}button.addEventListener('click',connect);void restore();}};
})();
