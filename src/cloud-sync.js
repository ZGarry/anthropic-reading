import {initializeApp} from 'firebase/app';
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged,browserLocalPersistence,setPersistence} from 'firebase/auth';
import {getFirestore,doc,onSnapshot,runTransaction,serverTimestamp,getDocFromServer} from 'firebase/firestore';
import model from '../dist/cloud-model.js';
import {createSyncEngine} from './sync-engine.mjs';

const $=id=>document.getElementById(id),host=window.ReadingAccount;
const get=k=>{try{return localStorage.getItem(k);}catch{return null;}};
const set=(k,v)=>{try{localStorage.setItem(k,v);}catch{}};
const day=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});
let auth,db,user=null,engine=null,unsubscribe=null,generation=0;
const configured=window.READING_FIREBASE_CONFIG;
const time=value=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});
function status(kind,value){
  const local=host.isLocalSaved()?'已保存在本机':'浏览器无法保存，请保持页面打开并导出备份';
  const labels={offline:'离线：'+local+'；联网后自动同步',pending:local+'；等待同步',syncing:'正在保存到云端…',saved:value?'云端已保存 · '+time(value)+'（北京时间）':'云端已连接',error:'云端同步失败；'+local+'，请重试'};
  if(kind==='error'&&value?.code==='permission-denied')labels.error='云端访问被拒绝；'+local+'，请联系站点维护者';
  $('cloud-status').textContent=labels[kind]||value;$('cloud-status').dataset.state=kind;
  $('cloud-retry').hidden=!user||!['error','offline','pending'].includes(kind);
}
function stop(){generation++;unsubscribe?.();unsubscribe=null;engine?.close();engine=null;}
function migrationPrompt(uid){
  const owner=get('anthropic-reading-guest-owner'),seen=get('anthropic-reading-migrated:'+uid);
  const guest=host.getGuestState(),count=guest.readIds.length;
  $('cloud-migration').hidden=!count||!!seen||(owner&&owner!==uid);
  $('migration-count').textContent=count;
}
async function start(nextUser){
  stop();user=nextUser;const turn=generation;
  host.activate(nextUser?.uid||null);host.setLoading(false);
  $('cloud-login').hidden=!!user;$('cloud-logout').hidden=!user;
  $('cloud-account').textContent=user?(user.email||user.displayName||'已登录'):'尚未登录';
  $('cloud-migration').hidden=true;
  if(!user){status('guest','本机保存中 · 登录后可自动同步到其他设备');return;}
  migrationPrompt(user.uid);
  status('pending');const uid=user.uid,ref=doc(db,'users',uid,'progress','current');
  engine=createSyncEngine({
    getState:host.getState,mergeState:host.mergeCloudState,status,isOnline:()=>navigator.onLine,
    commit:async local=>{
      if(turn!==generation||auth.currentUser?.uid!==uid)throw Object.assign(new Error('账号已切换'),{code:'unauthenticated'});
      const merged=await runTransaction(db,async tx=>{
        const current=await tx.get(ref),remote=model.fromDocument(current.exists()?current.data():null);
        const state=model.merge(remote,local);
        if(model.fingerprint(state)!==model.fingerprint(remote)){
          const data={...model.toDocument(state),savedAt:serverTimestamp()};
          tx.set(ref,data);tx.set(doc(db,'users',uid,'daily',day()),data);
        }
        return state;
      });
      const verified=await getDocFromServer(ref);
      return {state:model.merge(merged,model.fromDocument(verified.exists()?verified.data():null)),savedAt:verified.data()?.savedAt?.toMillis()||null};
    }
  });
  unsubscribe=onSnapshot(ref,{includeMetadataChanges:true},snapshot=>{
    if(turn!==generation||snapshot.metadata.hasPendingWrites)return;
    try{engine.receive(model.fromDocument(snapshot.exists()?snapshot.data():null),snapshot.data()?.savedAt?.toMillis()||null,snapshot.metadata.fromCache);}
    catch(error){status('error',error);}
  },error=>{if(turn===generation)status('error',error);});
}
$('cloud-login').addEventListener('click',async()=>{
  if(!auth)return;
  $('cloud-login').disabled=true;
  try{const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});await signInWithPopup(auth,provider);}
  catch(error){const messages={'auth/popup-blocked':'请允许登录弹窗，或在 Chrome 中打开此网页后再试','auth/popup-closed-by-user':'已取消登录，阅读记录仍保存在本机','auth/unauthorized-domain':'本站登录域名尚未启用，请联系站点维护者','auth/operation-not-allowed':'Google 登录尚未启用，请联系站点维护者'};status('error');$('cloud-status').textContent=messages[error.code]||'Google 登录未完成，请检查网络后重试';}
  finally{$('cloud-login').disabled=false;}
});
$('cloud-logout').addEventListener('click',async()=>{
  if(!auth)return;
  try{await engine?.flush();await signOut(auth);}catch{status('error');}
});
$('cloud-retry').addEventListener('click',()=>{if(user)void start(user);});
$('migrate-local').addEventListener('click',()=>{
  if(!user)return;
  host.mergeCloudState(host.getGuestState());set('anthropic-reading-guest-owner',user.uid);set('anthropic-reading-migrated:'+user.uid,'yes');$('cloud-migration').hidden=true;engine?.schedule();
});
$('skip-migration').addEventListener('click',()=>{if(user)set('anthropic-reading-migrated:'+user.uid,'skipped');$('cloud-migration').hidden=true;});
window.addEventListener('reading-progress-changed',()=>engine?.schedule());
window.addEventListener('online',()=>engine?.schedule());
window.addEventListener('offline',()=>{if(user)status('offline');});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')engine?.schedule();});
if(configured?.apiKey&&configured?.projectId&&configured?.appId&&configured?.authDomain){
  host.setLoading(true);
  try{
    const app=initializeApp(configured);auth=getAuth(app);db=getFirestore(app);
    await setPersistence(auth,browserLocalPersistence);
    $('cloud-login').disabled=false;
    onAuthStateChanged(auth,next=>void start(next),()=>{host.setLoading(false);status('error');});
  }catch{host.setLoading(false);status('error');$('cloud-status').textContent='登录服务连接失败；现有记录仍保存在本机';}
}else{
  $('cloud-login').disabled=true;
  status('unconfigured','云同步等待启用；现有阅读记录继续保存在本机');
}
