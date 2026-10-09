import model from '../dist/cloud-model.js';

// Acknowledgement is emitted only after a server transaction has completed.
export function createSyncEngine({getState,mergeState,commit,status,isOnline=()=>true,delay=800}){
  let closed=false,timer=null,running=false,revision=0,acknowledged=null,lastSavedAt=null;
  const same=state=>model.fingerprint(state)===acknowledged;
  function schedule(){
    if(closed)return;
    revision++;clearTimeout(timer);timer=null;
    if(!isOnline()){status('offline');return;}
    if(same(getState())){status('saved',lastSavedAt);return;}
    status('pending');if(!running)timer=setTimeout(flush,delay);
  }
  async function flush(){
    clearTimeout(timer);timer=null;
    if(closed||running)return;
    if(!isOnline()){status('offline');return;}
    if(same(getState())){status('saved',lastSavedAt);return;}
    const sentRevision=revision,snapshot=structuredClone(getState());running=true;status('syncing');
    try{
      const saved=await commit(snapshot);
      if(closed)return;
      acknowledged=model.fingerprint(saved.state);lastSavedAt=saved.savedAt;
      mergeState(saved.state);
      if(same(getState()))status('saved',saved.savedAt);
      else {status('pending');timer=setTimeout(flush,delay);}
    }catch(error){if(!closed){status(isOnline()?'error':'offline',error);if(!['permission-denied','unauthenticated','invalid-argument'].includes(error.code))timer=setTimeout(flush,15000);}}
    finally{running=false;if(!closed&&revision!==sentRevision&&!same(getState())&&!timer)timer=setTimeout(flush,delay);}
  }
  function receive(remote,savedAt,fromCache=false){
    if(closed)return;
    mergeState(remote);
    if(!fromCache){acknowledged=model.fingerprint(remote);lastSavedAt=savedAt;if(same(getState()))status('saved',savedAt);else schedule();}
    else status(isOnline()?'pending':'offline');
  }
  function close(){closed=true;clearTimeout(timer);}
  return {schedule,flush,receive,close};
}
