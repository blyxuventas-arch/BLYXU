(() => {
  'use strict';
  const uuid=()=>crypto.randomUUID();
  const storageKey='blyxu-shared-scan-tab-v2';
  let saved;try{saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(!['pc','phone'].includes(saved?.role)||!saved?.lease||typeof saved.lease.expires!=='number'||saved.lease.expires<=Date.now()||typeof saved.tab!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(saved.tab))saved=null;}catch{}
  const forget=()=>{try{sessionStorage.removeItem(storageKey);}catch{}};
  let tab=saved?.tab||uuid(),device=saved?.device||uuid(),releaseTab,canPersist=false,initialization;
  let credential,nativeFetch,scanner,pc=null,phone=null,formId=uuid(),epoch=uuid(),targetId='prod-barcode';
  let panel,pcStream,phoneStream,heartbeat,phoneHeartbeat,watchActive,publishing=false,targetDirty=false;
  let lastSequence=0,ackWait=null,receiving=Promise.resolve(),seen=new Set(),context='',applyingRemote=false;
  const form=()=>document.getElementById('product-form');
  const input=()=>document.getElementById(targetId);
  const active=()=>!!(form()?.getClientRects().length&&input()?.isConnected&&input()?.getClientRects().length&&document.visibilityState==='visible'&&!document.querySelector('#barcode-scanner-modal'));
  const status=(text,tone='idle')=>{if(!panel)return;const node=panel.querySelector('[data-share-status]');node.textContent=text;node.dataset.tone=tone;};
  async function request(action,data={}){
    if(!credential?.())throw new Error('Inicia sesión como administrador.');
    const response=await nativeFetch(window.BLYXU_API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,...data,adminCredential:credential()}),signal:AbortSignal.timeout(20000)});
    const value=await response.json();if(!response.ok||value.ok!==true)throw new Error(value.error||'No se pudo conectar el escáner.');return value;
  }
  const pcData=()=>({id:pc.id,pcToken:pc.pcToken,tab});
  const phoneData=()=>({id:phone.id,phoneToken:phone.phoneToken});
  function remember(){
    if(!canPersist||(!pc&&!phone))return;
    try{sessionStorage.setItem(storageKey,JSON.stringify({tab,device,role:pc?'pc':'phone',lease:pc||phone,targetId,draft:pc?window.BlyxuSharedScanBridge?.captureDraft():null}));}catch{}
  }
  async function claimTab(){
    // Web Locks distinguish a genuine reload from a duplicated tab whose sessionStorage was copied.
    if(!navigator.locks){saved=null;forget();return;}
    while(true){
      const acquired=await new Promise(resolve=>navigator.locks.request('blyxu-shared-scan-'+tab,{ifAvailable:true},lock=>{
        if(!lock){resolve(false);return;}canPersist=true;resolve(true);return new Promise(release=>{releaseTab=release;});
      }).catch(()=>resolve(null)));
      if(acquired===true)return;
      saved=null;forget();tab=uuid();device=uuid();if(acquired===null)return;
    }
  }
  function stream(lease,role,onEvent){
    const abort=new AbortController();let retry;
    const run=async()=>{
      try{
        const response=await nativeFetch(window.BLYXU_API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'scanstream',...lease,role,adminCredential:credential()}),signal:abort.signal});
        if(!response.ok||!response.headers.get('content-type')?.includes('text/event-stream')){const v=await response.json();onEvent('expired',{error:v.error||'La sesión terminó.'});abort.abort();return;}
        const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
        while(!abort.signal.aborted){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;
          while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const event=/^event: (.+)$/m.exec(block)?.[1],raw=/^data: (.*)$/m.exec(block)?.[1];if(event&&raw)onEvent(event,JSON.parse(raw));}
        }
      }catch(error){if(!abort.signal.aborted)onEvent('offline',{error:error.message});}
      if(!abort.signal.aborted)retry=setTimeout(run,1800);
    };run();return ()=>{abort.abort();clearTimeout(retry);};
  }
  function currentContext(){return [form()?.dataset.originalVariationId||'new',document.getElementById('prod-id-producto')?.value||'',document.getElementById('prod-id')?.value||''].join('|');}
  function options(){
    const select=panel.querySelector('[data-share-target]'),old=targetId;select.replaceChildren();
    form()?.querySelectorAll('#prod-barcode,.var-barcode,.ve-barcode').forEach((field,index)=>{
      if(!field.id)field.id='shared-barcode-'+uuid();
      const option=document.createElement('option');option.value=field.id;
      const card=field.closest('.variant-edit-card,.admin-panel');
      option.textContent=field.id==='prod-barcode'?'Producto principal':card?.querySelector('.ve-id,.var-id')?.value||'Variante '+index;select.appendChild(option);
    });
    if([...select.options].some(o=>o.value===old))select.value=old;else{targetId='prod-barcode';select.value=targetId;epoch=uuid();}
  }
  function revealTarget(){const field=input();if(field?.matches('.var-barcode')){const mode=field.closest('.admin-panel')?.querySelector('.var-barcode-mode');if(mode&&!mode.checked){mode.checked=true;mode.dispatchEvent(new Event('change',{bubbles:true}));}}let node=field?.parentElement;while(node&&node!==form()){if(node.tagName==='DETAILS')node.open=true;node=node.parentElement;}}
  async function publishTarget(){
    if(!pc)return;if(publishing){targetDirty=true;return;}publishing=true;
    const lease=pc,expectedEpoch=epoch;
    try{
      const next=currentContext();if(context!==next){context=next;formId=uuid();epoch=uuid();lastSequence=0;}
      const field=input(),card=field?.closest('.variant-edit-card,.admin-panel');
      const reference=field?.id==='prod-barcode'?document.getElementById('prod-id')?.value:card?.querySelector('.var-id,.ve-id')?.value;
      const result=await request('scantarget',{...pcData(),form:formId,epoch,targetId,active:active(),reference,code:field?.value||'',mother:document.getElementById('prod-id-producto')?.value||'',label:[document.getElementById('prod-nombre')?.value||'Producto nuevo',reference,panel.querySelector('[data-share-target]').selectedOptions[0]?.textContent].filter(Boolean).join(' · ')});
      if(pc!==lease)return;
      if(!active())status('En pausa: abre el campo de código del formulario.','idle');
      else status(result.phone?'Celular vinculado · listo para recibir códigos':'PC listo · vincula el celular con el QR','ok');
      if(result.pending)receive(result.pending);
    }catch(error){if(pc===lease)status(error.message,'error');}
    finally{publishing=false;if(targetDirty||expectedEpoch!==epoch){targetDirty=false;if(pc)queueMicrotask(publishTarget);}}
  }
  function receive(event){
    receiving=receiving.then(async()=>{
      if(!pc||event.session!==pc.id||event.tab!==tab)return;
      const accepted=seen.has(event.eventId)||!!(Date.now()<pc.expires&&currentContext()===context&&active()&&event.form===formId&&event.epoch===epoch&&event.targetId===targetId&&event.sequence>lastSequence&&Date.now()-event.created<45000&&typeof event.value==='string'&&event.value.length<=512);
      if(accepted&&!seen.has(event.eventId)){
        const field=input();
        // Same barcode + child-reference behavior as the existing local scanner, without saving.
        applyingRemote=true;
        try{
          if(field.id==='prod-barcode')window.BlyxuSharedScanBridge?.barcodeMode();
          field.value=event.value;field.dataset.autoBarcode='0';
          window.BlyxuSharedScanBridge?.syncReference(event.value,field);
          field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
          context=currentContext();
          remember();
        }finally{applyingRemote=false;}
        seen.add(event.eventId);lastSequence=event.sequence;if(seen.size>256)seen.delete(seen.values().next().value);
        field.classList.add('shared-scan-received');setTimeout(()=>field.classList.remove('shared-scan-received'),900);
        status('Código recibido: '+event.value+' · guarda el producto cuando esté listo','ok');
      }
      try{await request('scanack',{...pcData(),eventId:event.eventId,accepted});if(accepted)publishTarget();}catch(error){status('Código recibido; confirmación pendiente. '+error.message,'error');}
    }).catch(error=>status(error.message,'error'));
  }
  function updatePhone(value){
    if(!phone||value.id!==phone.id||value.revision<phone.revision)return;Object.assign(phone,value);
    panel.querySelector('[data-share-read]').disabled=!phone.target||!phone.pcOnline;
    panel.querySelector('[data-share-phone-target]').textContent=phone.target&&phone.pcOnline?'Destino: '+phone.target.label:'PC en pausa. Abre el formulario y su campo de código.';
    panel.querySelector('[data-share-phone-reference]').textContent=phone.target?'ID madre del PC: '+(phone.target.mother||'Sin ID')+'\nReferencia del PC: '+(phone.target.reference||'Sin referencia')+'\nCódigo: '+(phone.target.code||'Sin lectura'):'Esperando el formulario del PC';
    if(value.lastAck)handleAck(value.lastAck);
    remember();
  }
  function handleAck(ack){if(ackWait?.id===ack.eventId){const w=ackWait;ackWait=null;clearTimeout(w.timer);ack.accepted?w.resolve():w.reject(new Error('El formulario cambió. La lectura no se aplicó. Vuelve a escanear.'));}}
  async function phoneStatus(){if(!phone)return;try{updatePhone(await request('scanstatus',phoneData()));}catch(error){status(error.message,'error');panel.querySelector('[data-share-read]').disabled=true;}}
  async function sendScan(value){
    if(!phone)throw new Error('Primero vincula el celular.');
    await phoneStatus();
    if(!phone.target||!phone.pcOnline)throw new Error('El PC no está listo para recibir códigos.');
    const snapshot={...phone.target},eventId=uuid(),phoneLease=phone;
    const acknowledgement=new Promise((resolve,reject)=>{ackWait={id:eventId,resolve,reject,timer:setTimeout(async()=>{
      try{await phoneStatus();}catch{}if(ackWait?.id===eventId){ackWait=null;reject(new Error('Sin confirmación del PC. Revisa la conexión antes de continuar.'));}
    },12000)};});acknowledgement.catch(()=>{});
    try{
      await request('scansend',{...phoneData(),form:phone.form,epoch:snapshot.epoch,targetId:snapshot.id,eventId,value});
      await acknowledgement;
      if(phone===phoneLease)status('Recibido en el PC: '+value+' · puedes escanear el siguiente','ok');
    }catch(error){if(ackWait?.id===eventId){clearTimeout(ackWait.timer);ackWait=null;}throw error;}
  }
  async function join(text){
    let raw=String(text).trim();if(raw.includes('#scanPair='))raw=raw.split('#scanPair=')[1].split('&')[0];raw=decodeURIComponent(raw);
    const [id,pairCode]=raw.split('.');
    if(!id||!pairCode)throw new Error('Escanea el QR de vinculación que aparece en el PC.');
    if(pc)await disconnect();
    const result=await request('scanjoin',{id,pairCode,device});phoneStream?.();phone={...result};
    form().dataset.sharedRole='phone';
    panel.querySelector('[data-share-phone]').hidden=false;panel.querySelector('[data-share-pc]').hidden=true;
    updatePhone(result);status('Celular vinculado con el PC','ok');
    remember();
    phoneStream=stream(phoneData(),'phone',(event,payload)=>{
      if(event==='ready')phoneStatus();if(event==='target')updatePhone(payload);if(event==='ack')handleAck(payload);
      if(event==='closed'){disconnect();status('La sesión del PC terminó. Vincula de nuevo.','idle');}
      if(event==='offline')status('Reconectando con el PC…','error');
      if(event==='expired'){disconnect();status(payload.error,'error');}
    });clearInterval(phoneHeartbeat);phoneHeartbeat=setInterval(phoneStatus,20000);
  }
  async function create(){
    if(pc||phone)await disconnect();
    window.BlyxuSharedScanBridge?.barcodeMode();
    revealTarget();
    pc=await request('scancreate',{tab});context=currentContext();options();
    form().dataset.sharedRole='pc';
    panel.querySelector('[data-share-pc]').hidden=false;panel.querySelector('[data-share-phone]').hidden=true;
    const link=location.origin+location.pathname+'#scanPair='+pc.id+'.'+pc.pairCode;
    const qr=window.qrcode(0,'M');qr.addData(link);qr.make();panel.querySelector('[data-share-qr]').src=qr.createDataURL(5,20);
    panel.querySelector('[data-share-code]').value=pc.id+'.'+pc.pairCode;
    pcStream=stream(pcData(),'pc',(event,payload)=>{if(event==='scan')receive(payload);if(event==='ready')publishTarget();if(event==='offline')status('Reconectando el PC…','error');if(event==='expired'){disconnect();status(payload.error,'error');}});
    await publishTarget();heartbeat=setInterval(publishTarget,20000);
    let wasActive=active();watchActive=setInterval(()=>{const next=active();if(next!==wasActive){wasActive=next;epoch=uuid();publishTarget();}},1000);
    remember();
  }
  async function disconnect(){
    saved=null;forget();
    if(phone)window.BlyxuSharedScanBridge?.closeScanner();
    if(form())delete form().dataset.sharedRole;
    const previous=pc;pc=null;phone=null;pcStream?.();phoneStream?.();pcStream=null;phoneStream=null;clearInterval(heartbeat);clearInterval(phoneHeartbeat);clearInterval(watchActive);
    if(ackWait){clearTimeout(ackWait.timer);ackWait.reject(new Error('Sesión desconectada.'));ackWait=null;}
    seen.clear();lastSequence=0;formId=uuid();epoch=uuid();
    if(panel){panel.querySelector('[data-share-pc]').hidden=true;panel.querySelector('[data-share-phone]').hidden=true;status('Sin vincular · el escáner habitual sigue disponible');}
    if(previous)try{await request('scanclose',{id:previous.id,pcToken:previous.pcToken,tab});}catch{}
  }
  function invalidateForm(){formId=uuid();epoch=uuid();lastSequence=0;context='';if(pc)setTimeout(()=>{if(!pc)return;options();if(targetId==='prod-barcode')window.BlyxuSharedScanBridge?.barcodeMode();revealTarget();publishTarget();},0);}
  async function initialize({getCredential,fetcher,openScanner}){
    credential=getCredential;nativeFetch=fetcher;scanner=openScanner;if(panel)return;
    await claimTab();
    panel=document.createElement('details');panel.className='shared-scan-panel';
    panel.innerHTML=`<summary>Escáner compartido · PC + celular</summary><div class="shared-scan-body"><p>Vincula ambos equipos con la misma cuenta. El celular envía códigos y tú guardas desde el PC.</p><div class="shared-scan-controls"><button type="button" data-share-create class="admin-btn secondary">Vincular celular a este PC</button><button type="button" data-share-join class="admin-btn secondary">Leer QR de vinculación</button><button type="button" data-share-disconnect class="admin-btn secondary">Desconectar</button></div><div data-share-status role="status" data-tone="idle">Sin vincular · el escáner habitual sigue disponible</div><div data-share-pc hidden class="shared-scan-pc"><img data-share-qr alt="QR temporal para vincular el celular"><div><label>Enviar lecturas a<select data-share-target class="form-control"></select></label><p>En el celular, abre este mismo administrador y pulsa «Leer QR de vinculación».</p><label>Código de vinculación<input data-share-code readonly class="form-control"></label><small>Vence en 30 minutos. Solo funciona con la misma cuenta administradora.</small></div></div><div data-share-phone hidden><p data-share-phone-target></p><p data-share-phone-reference role="status"></p><button type="button" data-share-read class="admin-btn">Escanear para el PC</button></div><details class="shared-scan-manual"><summary>Ingresar código de vinculación</summary><input data-share-pair class="form-control" placeholder="Pega el código o enlace del PC"><button type="button" data-share-pair-use class="admin-btn secondary">Vincular</button></details></div>`;
    form().prepend(panel);
    const run=fn=>Promise.resolve().then(fn).catch(error=>status(error.message,'error'));
    panel.querySelector('[data-share-create]').onclick=()=>run(create);
    panel.querySelector('[data-share-join]').onclick=()=>scanner({preserveRawValue:true,qrOnly:true,scannerMode:'auto',onDetected:value=>run(()=>join(value))});
    panel.querySelector('[data-share-disconnect]').onclick=()=>run(disconnect);
    panel.querySelector('[data-share-pair-use]').onclick=()=>run(()=>join(panel.querySelector('[data-share-pair]').value));
    panel.querySelector('[data-share-read]').onclick=()=>scanner({continuous:true,onDetected:sendScan,getContext:()=>phone?.target?.epoch||''});
    panel.querySelector('[data-share-target]').onchange=event=>{targetId=event.target.value;epoch=uuid();revealTarget();publishTarget();};
    form().addEventListener('reset',invalidateForm);document.addEventListener('visibilitychange',()=>{epoch=uuid();publishTarget();});
    document.addEventListener('focusin',event=>{if(pc&&event.target.matches('#prod-barcode,.var-barcode,.ve-barcode')&&event.target.id!==targetId){targetId=event.target.id;epoch=uuid();options();publishTarget();}});
    form().addEventListener('input',event=>{if(pc&&!applyingRemote&&['prod-id','prod-id-producto'].includes(event.target.id))invalidateForm();});
    form().addEventListener('input',()=>{if(!applyingRemote)remember();});form().addEventListener('change',remember);
    new MutationObserver(records=>{if(!pc)return;const fieldsChanged=records.some(record=>!panel.contains(record.target)&&[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&(node.matches?.('#prod-barcode,.var-barcode,.ve-barcode')||node.querySelector?.('#prod-barcode,.var-barcode,.ve-barcode'))));if(fieldsChanged){const removed=!input()?.isConnected;options();if(removed)invalidateForm();}}).observe(form(),{childList:true,subtree:true});
    window.addEventListener('pagehide',()=>suspend(true));
    const pair=new URLSearchParams(location.hash.slice(1)).get('scanPair');if(pair){saved=null;panel.open=true;history.replaceState(null,'',location.pathname+location.search);run(()=>join(pair));}
  }
  async function resume(){
    await initialization;
    if(!saved||pc||phone)return;
    const previous=saved;saved=null;
    if(previous.lease.expires<=Date.now()){forget();return;}
    panel.open=true;
    try{
      if(previous.role==='phone'){
        phone={...previous.lease};
        // Reuse the lease only after the server revalidates the current authenticated administrator.
        const result=await request('scanstatus',phoneData());form().dataset.sharedRole='phone';
        panel.querySelector('[data-share-phone]').hidden=false;updatePhone(result);
        phoneStream=stream(phoneData(),'phone',(event,payload)=>{if(event==='ready')phoneStatus();if(event==='target')updatePhone(payload);if(event==='ack')handleAck(payload);if(event==='expired'||event==='closed'){disconnect();status(payload.error||'La sesión terminó.','error');}});
        phoneHeartbeat=setInterval(phoneStatus,20000);status('Celular reconectado al formulario del PC','ok');
      }else{
        const lease=previous.lease;
        // Pause the old destination and validate the owner before restoring its local draft.
        pc=lease;
        await request('scantarget',{...pcData(),form:uuid(),epoch:uuid(),targetId:'prod-barcode',active:false});
        pc=null;
        const ids=await window.BlyxuSharedScanBridge?.restoreDraft(previous.draft);
        pc=lease;targetId=ids?.[previous.targetId]||previous.targetId||'prod-barcode';context=currentContext();formId=uuid();epoch=uuid();options();
        form().dataset.sharedRole='pc';panel.querySelector('[data-share-pc]').hidden=false;
        const qr=window.qrcode(0,'M');qr.addData(location.origin+location.pathname+'#scanPair='+pc.id+'.'+pc.pairCode);qr.make();panel.querySelector('[data-share-qr]').src=qr.createDataURL(3,12);panel.querySelector('[data-share-code]').value=pc.id+'.'+pc.pairCode;
        window.BlyxuSharedScanBridge?.barcodeMode();revealTarget();
        pcStream=stream(pcData(),'pc',(event,payload)=>{if(event==='scan')receive(payload);if(event==='ready')publishTarget();if(event==='offline')status('Reconectando el PC…','error');if(event==='expired'){disconnect();status(payload.error,'error');}});
        await publishTarget();heartbeat=setInterval(publishTarget,20000);
        let wasActive=active();watchActive=setInterval(()=>{const next=active();if(next!==wasActive){wasActive=next;epoch=uuid();publishTarget();}},1000);
        remember();
      }
      return true;
    }catch(error){await disconnect();status('No se pudo retomar la sesión: '+error.message,'error');}
  }
  function suspend(release=false){
    remember();try{saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}
    pcStream?.();phoneStream?.();clearInterval(heartbeat);clearInterval(phoneHeartbeat);clearInterval(watchActive);pc=null;phone=null;
    if(ackWait){clearTimeout(ackWait.timer);ackWait.reject(new Error('El acceso se está renovando. Vuelve a escanear al retomar.'));ackWait=null;}
    if(release)releaseTab?.();
  }
  window.BlyxuSharedScan={initialize:options=>initialization=initialize(options),resume,invalidateForm,shutdown:disconnect,suspend,scannerOptions(options){
    if(phone&&!options.preserveRawValue&&options.targetInputId&&document.getElementById(options.targetInputId)?.matches('#prod-barcode,.var-barcode,.ve-barcode'))return {...options,targetInputId:undefined,continuous:true,onDetected:sendScan,getContext:()=>phone?.target?.epoch||''};
    return options;
  }};
})();
