(() => {
  'use strict';
  let handle=null,queue=Promise.resolve(),getBackup,mergeBackup;
  const note=text=>document.getElementById('file-backup-note').textContent=text;
  async function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('anthropic-reading-file-backup',1);r.onupgradeneeded=()=>r.result.createObjectStore('handles');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function stored(value){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('handles',value?'readwrite':'readonly'),s=tx.objectStore('handles'),r=value?s.put(value,'progress'):s.get('progress');let result;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
  function write(){
    if(!handle)return Promise.resolve();
    const snapshot=JSON.stringify(getBackup(),null,2);
    queue=queue.then(async()=>{
      if(await handle.queryPermission({mode:'readwrite'})!=='granted')throw new Error('请点“连接自动备份文件”恢复写入权限');
      const out=await handle.createWritable();await out.write(snapshot);await out.close();
      note('已同步到本地文件：'+handle.name+' · '+new Date().toLocaleTimeString('zh-CN'));
    }).catch(error=>note('本地文件未更新；浏览器进度仍保留。'+error.message));
    return queue;
  }
  async function restore(){
    try{
      const saved=await stored();if(!saved)return;
      if(await saved.queryPermission({mode:'readwrite'})!=='granted'){note('已有备份文件。点击连接按钮重新授权后继续自动保存。');return;}
      const file=await saved.getFile();if(file.size)mergeBackup(JSON.parse(await file.text()));
      handle=saved;note('自动备份已连接：'+handle.name);
    }catch(error){note('自动备份尚未连接；可以导出或导入 JSON 文件。');}
  }
  async function connect(){
    try{
      const saved=await stored();
      if(saved){
        if(await saved.requestPermission({mode:'readwrite'})!=='granted'){note('未获文件写入权限，浏览器仍会保存进度。');return;}
        const file=await saved.getFile();if(file.size)mergeBackup(JSON.parse(await file.text()));handle=saved;
      }else{
        const selected=await window.showSaveFilePicker({suggestedName:'Anthropic-reading-progress.json',types:[{description:'阅读进度备份',accept:{'application/json':['.json']}}]});
        const file=await selected.getFile();if(file.size)mergeBackup(JSON.parse(await file.text()));
        handle=selected;await stored(handle);
      }
      await write();
    }catch(error){if(error.name==='AbortError')note('已取消连接；浏览器进度保持不变。');else note('连接失败：'+error.message);}
  }
  window.ReadingFileBackup={write,initialize(options){getBackup=options.getBackup;mergeBackup=options.mergeBackup;const button=document.getElementById('connect-backup-file');if(!window.showSaveFilePicker){button.hidden=true;note('当前浏览器请使用“导出进度备份”保存到电脑。');return;}button.addEventListener('click',connect);void restore();}};
})();
