import { createHash } from 'node:crypto';
import { createController } from './controller.js';
import {driveAction,readConnection} from './drive-connection.js';
import {categoryBatch} from './category-batch.js';
import {sharedScanAction} from './shared-scan.js';

const MAX_BODY=12*1024*1024;
export function createHandler({env,fetcher=fetch,now=()=>Date.now(),subscribe}) {
  const base=(env('SUPABASE_URL')||'https://cufptttzflkdwizpqaot.supabase.co').replace(/\/$/,'');
  const key=env('BLYXU_DB_SECRET')||env('SUPABASE_SERVICE_ROLE_KEY');
  const origins=new Set((env('BLYXU_ALLOWED_ORIGINS')||'https://blyxu.online,https://www.blyxu.online').split(',').map(v=>v.trim()).filter(Boolean));
  async function rpc(name,payload){
    if(!key)throw new Error('Servidor pendiente de configuración.');
    const headers={'Content-Type':'application/json',apikey:key};
    if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
    const response=await fetcher(`${base}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
    if(!response.ok){let code;try{code=(await response.json()).code;}catch{}if(code==='PT409'||code==='40001')throw new Error('Otra operación actualizó los datos. Actualiza y vuelve a intentar.');throw new Error('No se pudo confirmar la operación. Comprueba su estado antes de repetirla.');}
    return response.json();
  }
  return async function handler(request){
    const origin=request.headers.get('Origin');
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
    if(origin&&origins.has(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, apikey, x-client-info'});
    const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
    if(origin&&!origins.has(origin))return reply({ok:false,error:'Origen no autorizado.'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(!['GET','POST'].includes(request.method))return reply({ok:false,error:'Método no soportado.'},405);
    try {
      if(env('BLYXU_API_ENABLED')==='false')return reply({ok:false,error:'El nuevo servidor todavía no está activo.'},503);
      let bodyText='';
      if(request.method==='POST'){
        if(Number(request.headers.get('Content-Length')||0)>MAX_BODY)return reply({ok:false,error:'Archivo demasiado grande.'},413);
        // Enforce the limit while reading, rather than buffering an unbounded stream.
        const reader=request.body?.getReader(),parts=[];let size=0;
        if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();return reply({ok:false,error:'Archivo demasiado grande.'},413);}parts.push(value);}
        const joined=new Uint8Array(size);let offset=0;for(const part of parts){joined.set(part,offset);offset+=part.byteLength;}bodyText=new TextDecoder().decode(joined);
        if(bodyText)JSON.parse(bodyText);
      }
      const url=new URL(request.url),params=Object.fromEntries(url.searchParams);
      const snapshot=await rpc('blyxu_load_server',{});
      let state=snapshot.state;
      const runtime={datasets:Object.fromEntries(snapshot.datasets.map(d=>[d.name,d]))};
      let properties=structuredClone(state.properties),cache=structuredClone(state.cache);
      let originalProperties=JSON.stringify(properties),originalCache=JSON.stringify(cache);
      const hasOwn=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
      const secretNames=new Set(['MERCADO_PAGO_ACCESS_TOKEN']);
      const props={
        getProperty:k=>secretNames.has(k)?(env(k)||null):(hasOwn(properties,k)?String(properties[k]):null),
        setProperty(k,v){if(secretNames.has(k))throw new Error('La credencial se configura en secretos del servidor.');properties[k]=String(v);return this;},
        deleteProperty(k){delete properties[k];return this;},
        setProperties(p){for(const [k,v]of Object.entries(p))this.setProperty(k,v);return this;},
      };
      const persistedCache={
        get(k){const item=cache[k];return item&&Number(item.expires)>now()?item.value:null;},
        put(k,v,seconds){cache[k]={value:String(v),expires:now()+Number(seconds)*1000};},
        remove(k){delete cache[k];},
      };
      async function checkpoint(changes){
        const dirty=changes.some(c=>c.mutations.length||c.headersChanged);
        if(!dirty&&JSON.stringify(properties)===originalProperties&&JSON.stringify(cache)===originalCache)return;
        for(const [k,v]of Object.entries(cache))if(Number(v.expires)<=now())delete cache[k];
        await rpc('blyxu_commit_server',{expected_revision:state.revision,changes,server_properties:properties,server_cache:cache});
        const refreshed=await rpc('blyxu_load_server',{});
        state=refreshed.state;properties=structuredClone(state.properties);cache=structuredClone(state.cache);
        originalProperties=JSON.stringify(properties);originalCache=JSON.stringify(cache);
        runtime.datasets=Object.fromEntries(refreshed.datasets.map(d=>[d.name,d]));
      }
      runtime.checkpoint=checkpoint;
      runtime.upload=body=>{
        const connection=readConnection(props,env);
        if(connection&&connection.clientId!==env('GOOGLE_DRIVE_CLIENT_ID'))throw new Error('Vuelve a conectar Drive.');
        const connectedEnv=name=>name==='GOOGLE_DRIVE_REFRESH_TOKEN'&&connection?connection.refreshToken:name==='GOOGLE_DRIVE_FOLDER_ID'&&connection?connection.folderId:env(name);
        return uploadDrive(body,connectedEnv,fetcher);
      };
      const signed=bytes=>Array.from(bytes,b=>b>127?b-256:b);
      const lock={waitLock(){},tryLock(){return true;},releaseLock(){}};
      runtime.services={
        PropertiesService:{getScriptProperties:()=>props},CacheService:{getScriptCache:()=>persistedCache},
        // Writes are serialized and revision-checked by the database transaction, not by an isolate lock.
        LockService:{getScriptLock:()=>lock},Session:{getScriptTimeZone:()=> 'America/Bogota'},
        ScriptApp:{getService:()=>({getUrl:()=>`${base}/functions/v1/blyxu-api`})},Logger:{log(){}},
        ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({getContent:()=>text,setMimeType(){return this;}})},
        Utilities:{getUuid:()=>crypto.randomUUID(),Charset:{UTF_8:'UTF-8'},DigestAlgorithm:{SHA_256:'sha256'},
          computeDigest:(algorithm,value)=>signed(createHash(algorithm).update(typeof value==='string'?value:Uint8Array.from(value,b=>(b+256)%256)).digest()),
          newBlob:value=>({getBytes:()=>signed(new TextEncoder().encode(String(value)))}),
          formatDate(date){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));return p.year+p.month+p.day+p.hour+p.minute+p.second;}},
        UrlFetchApp:{async fetch(target,options={}){
          const u=new URL(target);
          if(u.protocol!=='https:'||!['oauth2.googleapis.com','api.mercadopago.com'].includes(u.hostname))throw new Error('Destino externo no autorizado.');
          const h={...options.headers};if(options.contentType)h['Content-Type']=options.contentType;
          const response=await fetcher(u,{method:(options.method||'GET').toUpperCase(),headers:h,body:options.payload,signal:AbortSignal.timeout(20000)}),text=await response.text();
          return {getResponseCode:()=>response.status,getContentText:()=>text};
        }},
      };
      const controller=createController(runtime);
      const body=bodyText?JSON.parse(bodyText):{};
      if(/^scan(create|join|target|ack|close|unlink|stream|status|send)$/.test(String(body.action||''))){
        if(request.method!=='POST')return reply({ok:false,error:'Utiliza POST.'},405);
        const auth=await controller.handle({parameter:{},postData:{contents:JSON.stringify({action:'adminsession',adminCredential:body.adminCredential||''})}},'POST');
        const identity=JSON.parse(auth.getContent());await checkpoint([]);
        if(identity.ok!==true||!identity.email)return reply({ok:false,error:'Inicia sesión como administrador autorizado.'},401);
        try{
          const result=await sharedScanAction({body,owner:identity.email,cache:persistedCache,checkpoint,now,env,fetcher,subscribe,headers,signal:request.signal});
          return result instanceof Response?result:reply(result);
        }catch(error){return reply({ok:false,error:error.message||'No se pudo vincular el escáner.'});}
      }
      if(body.action==='categorybatch'){
        const auth=await controller.handle({parameter:{},postData:{contents:JSON.stringify({action:'adminsession',adminCredential:body.adminCredential||''})}},'POST');
        const value=JSON.parse(auth.getContent());
        await checkpoint([]);
        if(value.ok!==true)return reply({ok:false,error:'Inicia sesión como administrador autorizado.'});
        let batch;
        try{batch=categoryBatch(runtime.datasets,body);}catch(error){return reply({ok:false,error:error.message});}
        await checkpoint(batch.changes);
        return reply({ok:true,products:batch.products,variants:batch.variants,removedDefaults:batch.removedDefaults});
      }
      if(body.action==='publicreference'){
        if(request.method!=='POST')return reply({ok:false,status:'error',error:'Utiliza POST.'},405);
        const reference=String(body.reference||'').trim().toUpperCase();
        if(!/^(PED|FAC)-[0-9]{14}-[0-9]{4}$/.test(reference))return reply({ok:false,status:'error',error:'Escribe el ID completo de pedido o factura. No se permite consultar por teléfono.'});
        const sheet=reference.startsWith('PED-')?'Pedidos':'Facturas',idKey=sheet==='Pedidos'?'ID Pedido':'ID Factura';
        const row=runtime.datasets[sheet]?.rows.find(r=>String(r.record[idKey]||'').toUpperCase()===reference)?.record;
        const orders=[],invoices=[];
        if(row){
          const summary={};
          for(const key of [idKey,'Fecha','Fecha Pedido','Estado','Estado Pedido','Estado Factura','Subtotal','Total','Descuento','Impuestos'])if(hasOwn(row,key))summary[key]=row[key];
          let items=row['Productos JSON'];if(typeof items==='string'){try{items=JSON.parse(items);}catch{items=[];}}
          summary['Productos JSON']=(Array.isArray(items)?items:[]).map(item=>{
            const safe={};if(!item||typeof item!=='object')return safe;
            for(const key of ['idVariacion','idProducto','sku','SKU','nombre','Nombre','nombreProducto','cantidad','Cantidad','precio','Precio','precioUnitario','total','Total','subtotal','Subtotal','color','talla'])if(hasOwn(item,key)&&['string','number','boolean'].includes(typeof item[key]))safe[key]=item[key];
            return safe;
          });
          (sheet==='Pedidos'?orders:invoices).push(summary);
        }
        return reply({ok:true,status:'success',orders,invoices});
      }
      if(String(body.action||'').startsWith('drive')){
        if(request.method!=='POST')return reply({ok:false,error:'Utiliza POST.'},405);
        const result=await driveAction({body,env,props,cache:persistedCache,checkpoint,fetcher,authorize:async()=>{
          const auth=await controller.handle({parameter:{},postData:{contents:JSON.stringify({action:'adminsession',adminCredential:body.adminCredential||''})}},'POST');
          const value=JSON.parse(auth.getContent());await checkpoint([]);return value.ok===true;
        }});
        if(result)return reply(result);
      }
      const response=await controller.handle({parameter:params,postData:{contents:bodyText}},request.method);
      const result=JSON.parse(response.getContent());
      // Failed logins still persist throttling counters, but failed business mutations are discarded.
      await checkpoint(result.ok===false||result.status==='error'?[]:controller.changes());
      return reply(result);
    }catch(error){
      // Never return upstream bodies, tokens, SQL records or stack traces.
      const safe=/^(Otra operación|No se pudo confirmar|Servidor pendiente)/.test(error.message||'')?error.message:'No se pudo completar la solicitud de forma segura.';
      return reply({ok:false,status:'error',error:safe});
    }
  };
}

export async function uploadDrive(body,env,fetcher=fetch){
  const folder=env('GOOGLE_DRIVE_FOLDER_ID'),client=env('GOOGLE_DRIVE_CLIENT_ID'),secret=env('GOOGLE_DRIVE_CLIENT_SECRET'),refresh=env('GOOGLE_DRIVE_REFRESH_TOKEN');
  if(!folder||!client||!secret||!refresh)throw new Error('Falta configurar el almacenamiento multimedia.');
  if(!['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(body.mimeType))throw new Error('Formato de imagen no permitido.');
  if(typeof body.base64Data!=='string'||body.base64Data.length>11*1024*1024)throw new Error('Imagen demasiado grande.');
  const binary=Uint8Array.from(atob(body.base64Data),c=>c.charCodeAt(0));
  const tokenResponse=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client,client_secret:secret,refresh_token:refresh,grant_type:'refresh_token'}),signal:AbortSignal.timeout(20000)});
  if(!tokenResponse.ok)throw new Error('No se pudo autorizar Drive.');
  const token=(await tokenResponse.json()).access_token;
  const boundary='blyxu-'+crypto.randomUUID(),encoder=new TextEncoder();
  const start=encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name:String(body.fileName||'imagen').slice(0,180),parents:[folder]})}\r\n--${boundary}\r\nContent-Type: ${body.mimeType}\r\n\r\n`),end=encoder.encode(`\r\n--${boundary}--\r\n`);
  const content=new Uint8Array(start.length+binary.length+end.length);content.set(start);content.set(binary,start.length);content.set(end,start.length+binary.length);
  const response=await fetcher('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':`multipart/related; boundary=${boundary}`},body:content,signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('No se pudo guardar la imagen en Drive.');
  const {id}=await response.json();
  const permission=await fetcher(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/permissions?supportsAllDrives=true`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({type:'anyone',role:'reader'}),signal:AbortSignal.timeout(20000)});
  if(!permission.ok)throw new Error('La imagen se guardó pero no se pudo habilitar su visualización.');
  return {ok:true,status:'success',id,url:`https://drive.google.com/thumbnail?id=${id}&sz=w1000`,directUrl:`https://lh3.googleusercontent.com/d/${id}`};
}
