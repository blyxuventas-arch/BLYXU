(() => {
  'use strict';
  const accessKey='blyxu-admin-tab-access-v1',draftKey='blyxu-admin-tab-draft-v1',idleMs=30*60*1000;
  let state=null,timer,lastTouch=0;
  const read=key=>{try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return null;}};
  const remove=key=>{try{sessionStorage.removeItem(key);}catch{}};
  const write=(key,value)=>{try{sessionStorage.setItem(key,JSON.stringify(value));}catch{}};
  function tokenExpiry(token){
    try{const part=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'),payload=JSON.parse(atob(part));return Number(payload.exp)*1000;}catch{return Date.now()+idleMs;}
  }
  // Credentials stay in memory. Only the owner-bound draft is stored.
  remove(accessKey);
  function rememberDraft(){
    if(!state?.email)return;
    const draft=window.BlyxuSharedScanBridge?.captureDraft();
    if(draft)write(draftKey,{email:state.email,draft,expires:Date.now()+8*60*60*1000});
  }
  function notice(message,renew=false){
    let node=document.getElementById('admin-work-session-notice');
    if(!node){node=document.createElement('div');node.id='admin-work-session-notice';node.setAttribute('role','status');node.style.cssText='position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:999999;background:#24182f;color:#f4eaff;border:1px solid #ad82da;border-radius:14px;padding:14px 18px;max-width:90vw;box-shadow:0 8px 30px #0008;font:13px/1.6 Arial';document.body.append(node);}
    node.replaceChildren();const text=document.createElement('span');text.textContent=message;node.append(text);
    const button=document.createElement('button');button.type='button';button.textContent=renew?'Renovar acceso':'Continuar trabajando';button.style.cssText='margin-left:12px;padding:8px 12px;border-radius:8px;border:0;cursor:pointer';button.onclick=()=>renew?lock('Renueva tu acceso. Tu formulario está conservado.'):touch(true);node.append(button);
  }
  function lock(message){
    if(!state)return;rememberDraft();const callback=state.onLock;state=null;clearTimeout(timer);remove(accessKey);document.getElementById('admin-work-session-notice')?.remove();callback?.(message);
  }
  function check(){
    if(!state)return;const now=Date.now(),idle=now-state.lastActivity,remaining=state.expires-now;
    if(remaining<=0){lock('Tu acceso venció. Inicia sesión para continuar con el mismo formulario.');return;}
    if(idle>=idleMs){lock('El panel se pausó por inactividad. Tu formulario está conservado.');return;}
    if(remaining<=120000)notice('Google o el servidor necesita renovar el acceso pronto. Tu formulario se conserva.',true);
    else if(idle>=idleMs-120000)notice('El panel se pausará por inactividad.');
    else document.getElementById('admin-work-session-notice')?.remove();
    timer=setTimeout(check,Math.min(60000,remaining,idleMs-idle));
  }
  function touch(force=false){if(!state)return;const now=Date.now();if(!force&&now-lastTouch<1000)return;lastTouch=now;state.lastActivity=now;if(force){clearTimeout(timer);check();}}
  for(const event of ['pointerdown','keydown','input','wheel','touchstart'])document.addEventListener(event,()=>touch(),{passive:true});
  window.BlyxuAdminWorkSession={
    start({credential,identity={},onLock}){
      clearTimeout(timer);const expires=Math.min(tokenExpiry(credential),Number(identity.expires)||Infinity);
      state={email:String(identity.email||'').toLowerCase(),expires,lastActivity:Date.now(),onLock};check();
      return state!==null;
    },
    draft(email){const value=read(draftKey);if(!value||value.expires<=Date.now()){remove(draftKey);return null;}if(value.email!==String(email||'').toLowerCase())return null;return value.draft;},
    clearDraft(){remove(draftKey);},
    rememberDraft,
    activity:()=>touch(),
    suspend(){rememberDraft();clearTimeout(timer);state=null;},
    clear(){clearTimeout(timer);state=null;remove(accessKey);remove(draftKey);document.getElementById('admin-work-session-notice')?.remove();},
    lock
  };
})();
