// Temporary scan leases live in the existing private, revision-checked server cache.
// Only the authenticated server joins Realtime. No database or service key reaches a browser.
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
const TTL=30*60*1000, LIVE=45000;
const hash=v=>createHash('sha256').update(String(v||'')).digest('hex');
const secret=()=>randomBytes(24).toString('hex');
const equal=(a,b)=>{const x=new TextEncoder().encode(String(a)),y=new TextEncoder().encode(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(v);
function fail(message){throw new Error(message);}
export async function sharedScanAction({body,owner,cache,checkpoint,now,env,fetcher,subscribe,headers,signal}){
  const action=body.action,time=now(),email=String(owner||'').toLowerCase();
  if(!email)fail('Inicia sesión como administrador.');
  const save=async s=>{s.revision=(s.revision||0)+1;cache.put('shared-scan-'+s.id,JSON.stringify(s),Math.max(1,Math.ceil((s.expires-time)/1000)));await checkpoint([]);};
  const view=s=>({id:s.id,revision:s.revision,tab:s.tab,form:s.form,target:s.target,expires:s.expires,phone:!!s.phone,pcOnline:time-s.pcSeen<LIVE,lastAck:s.lastAck||null});
  const broadcast=async(event,payload)=>{
    try{
      const key=env('SUPABASE_SERVICE_ROLE_KEY');if(!key)return false;
      const response=await fetcher(env('SUPABASE_URL')+'/realtime/v1/api/broadcast',{method:'POST',headers:{'Content-Type':'application/json',apikey:key,Authorization:'Bearer '+key},body:JSON.stringify({messages:[{topic:s.topic,event,private:true,payload}]}),signal:AbortSignal.timeout(8000)});
      return response.ok;
    }catch{return false;}
  };
  const pc=s=>{if(!equal(hash(body.pcToken),s.pcHash)||body.tab!==s.tab)fail('Esta pestaña no pertenece a la sesión.');};
  const phone=s=>{if(!s.phone||!equal(hash(body.phoneToken),s.phone.hash))fail('El celular no está vinculado.');};
  if(action==='scancreate'){
    if(!validId(body.tab))fail('Pestaña no válida.');
    const id=crypto.randomUUID(),pairCode=secret(),pcToken=secret();
    const s={id,owner:email,tab:body.tab,form:null,target:null,expires:time+TTL,pcSeen:time,pcHash:hash(pcToken),pairHash:hash(pairCode),topic:'blyxu-scan-'+secret(),seq:0,pending:null};
    await save(s);return {ok:true,...view(s),pairCode,pcToken};
  }
  if(!validId(body.id))fail('Sesión de escaneo no válida.');
  const raw=cache.get('shared-scan-'+body.id),s=raw?JSON.parse(raw):null;
  if(!s||s.expires<=time||s.closed)fail('La sesión terminó. Vincula de nuevo desde el PC.');
  if(s.owner!==email)fail('Usa la misma cuenta administradora en ambos dispositivos.');
  if(action==='scanjoin'){
    if(!equal(hash(body.pairCode),s.pairHash)||!validId(body.device))fail('El código de vinculación no es válido.');
    if(time-s.pcSeen>=LIVE)fail('El PC está desconectado. Abre de nuevo el formulario.');
    if(s.phone&&s.phone.device!==body.device)fail('Ya hay un celular vinculado. Desvincúlalo desde el PC.');
    const phoneToken=secret();s.phone={device:body.device,hash:hash(phoneToken)};await save(s);await broadcast('target',view(s));
    return {ok:true,...view(s),phoneToken};
  }
  if(action==='scanstream'&&body.role==='phone')phone(s);
  else if(['scantarget','scanack','scanclose','scanunlink','scanstream'].includes(action))pc(s);else phone(s);
  if(action==='scanclose'){s.closed=true;s.target=null;s.pending=null;await save(s);await broadcast('closed',{});return {ok:true};}
  if(action==='scanunlink'){s.phone=null;s.pending=null;s.pairHash=hash(body.newPairCode||secret());await save(s);return {ok:true,...view(s)};}
  if(action==='scantarget'){
    if(!validId(body.form)||!validId(body.epoch)||!validId(body.targetId))fail('Formulario o campo no válido.');
    // Discard an unconsumed scan when its exact destination changes.
    const superseded=s.form!==body.form||s.target?.epoch!==body.epoch||s.target?.id!==body.targetId;
    if(superseded&&s.pending){s.lastAck={eventId:s.pending.eventId,accepted:false};s.pending=null;}
    s.form=body.form;s.target=body.active?{id:body.targetId,epoch:body.epoch,label:String(body.label||'Código del producto').slice(0,160),reference:String(body.reference||'').slice(0,100),mother:String(body.mother||'').slice(0,100),code:String(body.code||'').slice(0,512)}:null;
    s.pcSeen=time;await save(s);await broadcast('target',view(s));return {ok:true,...view(s),pending:s.pending};
  }
  if(action==='scanack'){
    if(s.pending?.eventId===body.eventId){s.lastAck={eventId:body.eventId,accepted:body.accepted===true};s.pending=null;await save(s);await broadcast('ack',s.lastAck);}
    return {ok:true,...view(s)};
  }
  if(action==='scanstatus')return {ok:true,...view(s)};
  if(action==='scansend'){
    if(!s.target||time-s.pcSeen>=LIVE)fail('El PC no tiene un formulario listo. Espera a que esté conectado.');
    if(body.form!==s.form||body.epoch!==s.target.epoch||body.targetId!==s.target.id)fail('El formulario cambió. Espera y vuelve a escanear.');
    if(!validId(body.eventId))fail('Lectura no válida.');
    if(s.pending?.eventId===body.eventId||s.lastAck?.eventId===body.eventId)return {ok:true,eventId:body.eventId};
    if(s.pending)fail('Espera a que el PC reciba el código anterior.');
    const value=String(body.value||'').trim();
    if(!value||value.length>512||/[\x00-\x1f\x7f]/.test(value))fail('El código está vacío o no es válido.');
    s.pending={session:s.id,tab:s.tab,form:s.form,targetId:s.target.id,epoch:s.target.epoch,eventId:body.eventId,sequence:++s.seq,value,created:time};
    await save(s);
    const queued=!(await broadcast('scan',s.pending));
    return {ok:true,eventId:body.eventId,queued};
  }
  if(action==='scanstream'){
    if(typeof subscribe!=='function')fail('Realtime no está configurado en el servidor.');
    let cleanup=()=>{},timer,ping,closed=false;
    const encoder=new TextEncoder();
    const stream=new ReadableStream({start(controller){
      const send=(event,data)=>{if(!closed)controller.enqueue(encoder.encode('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n'));};
      const end=()=>{if(closed)return;closed=true;clearTimeout(timer);clearInterval(ping);cleanup();signal?.removeEventListener('abort',end);try{controller.close();}catch{}};
      cleanup=subscribe({topic:s.topic,onMessage:(event,payload)=>{if(s.expires<=now()){send('expired',{error:'La sesión terminó. Vincula de nuevo desde el PC.'});end();return;}if(['scan','target','ack','closed'].includes(event))send(event,payload);if(event==='closed')end();},onReady:()=>send('ready',{}),onError:()=>{send('reconnect',{});end();}});
      ping=setInterval(()=>send('ping',{}),12000);timer=setTimeout(()=>{if(s.expires<=now())send('expired',{error:'La sesión terminó. Vincula de nuevo desde el PC.'});end();},Math.min(90000,Math.max(1,s.expires-time)));signal?.addEventListener('abort',end,{once:true});
      this.finish=end;
    },cancel(){this.finish?.();}});
    return new Response(stream,{headers:{...headers,'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store, no-transform'}});
  }
  fail('Operación de escaneo no válida.');
}
