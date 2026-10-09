(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.CloudProgress=factory();
})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  function empty(){return {version:2,entries:Object.create(null),readIds:[],appliedBatches:[]};}
  function valid(e){return e&&typeof e.read==='boolean'&&Number.isSafeInteger(e.updatedAt)&&e.updatedAt>=0&&(e.completedAt===null||(typeof e.completedAt==='string'&&Number.isFinite(Date.parse(e.completedAt))));}
  function entries(state){
    if(!state||state.version!==2||!state.entries||typeof state.entries!=='object'||Array.isArray(state.entries))throw new Error('云端记录格式异常；本机记录已保留');
    const result=Object.create(null),items=Object.entries(state.entries);
    if(items.length>5000)throw new Error('记录超过当前容量；请先导出备份');
    for(const [id,e] of items){
      if(!id||id.length>500||!valid(e))throw new Error('云端记录校验失败；本机记录已保留');
      if(e.read||e.updatedAt>0)result[id]={read:e.read,updatedAt:e.updatedAt,completedAt:e.completedAt};
    }
    return result;
  }
  function merge(a,b){
    const left=entries(a),right=entries(b),out=Object.create(null);
    for(const id of [...new Set([...Object.keys(left),...Object.keys(right)])].sort()){
      const x=left[id],y=right[id];let winner=x||y;
      if(x&&y){
        if(x.updatedAt!==y.updatedAt)winner=x.updatedAt>y.updatedAt?x:y;
        else if(x.read!==y.read)winner=x.updatedAt===0?(x.read?x:y):(x.read?y:x);
        else winner=(x.completedAt||'')>=(y.completedAt||'')?x:y;
      }
      out[id]={...winner};
    }
    return {version:2,entries:out,readIds:Object.keys(out).filter(id=>out[id].read),appliedBatches:[...new Set([...(a.appliedBatches||[]),...(b.appliedBatches||[])])].sort()};
  }
  function fingerprint(state){return JSON.stringify(Object.entries(entries(state)).sort(([a],[b])=>a.localeCompare(b)));}
  function fromDocument(data){
    if(data===null||data===undefined)return empty();
    if(data.schema!==1)throw new Error('云端记录版本不兼容；本机记录已保留');
    return merge(empty(),{version:2,entries:data.entries,appliedBatches:[]});
  }
  function toDocument(state){const data={schema:1,entries:entries(state)};if(JSON.stringify(data).length>450000)throw new Error('记录过大；本机记录已保留，请先导出备份');return data;}
  function accountKey(uid){return uid?'anthropic-reading-catalog-v2:user:'+uid:'anthropic-reading-catalog-v2';}
  return {empty,merge,fingerprint,fromDocument,toDocument,accountKey};
});
