// Private account storage. Neither sheet is exposed through the public resource router.
const CA_HEADERS_=['ID','Datos'];
let caLockDepth_=0;
function caPrivateSpreadsheet_(){
  const props=PropertiesService.getScriptProperties(),key='BLYXU_CUSTOMER_AUTH_SPREADSHEET_ID';let id=props.getProperty(key);
  if(!id)id=caWithLock_(()=>{let current=props.getProperty(key);if(!current){current=SpreadsheetApp.create('BLYXU - Acceso privado de clientes').getId();props.setProperty(key,current);}return current;});
  return SpreadsheetApp.openById(id);
}
function caTable_(name){
  const ss=caPrivateSpreadsheet_();let sheet=ss.getSheetByName(name);
  if(!sheet)sheet=caWithLock_(()=>{let current=ss.getSheetByName(name);if(!current){current=ss.insertSheet(name);current.getRange(1,1,1,2).setValues([CA_HEADERS_]);}return current;});
  return sheet;
}
function caRows_(name){const s=caTable_(name),n=s.getLastRow();if(n<2)return [];return s.getRange(2,1,n-1,2).getValues().map((r,i)=>({index:i+2,id:String(r[0]),data:JSON.parse(String(r[1]))}));}
function caWrite_(name,row,data){const s=caTable_(name);s.getRange(row?row.index:s.getLastRow()+1,1,1,2).setValues([[data.id,JSON.stringify(data)]]);}
function caAccount_(phone){return caRows_('CuentasPrivadas').find(row=>row.data.phone===phone)||null;}
function caPhone_(value){let phone=cleanPhone_(value);if(phone.length===12&&phone.startsWith('57'))phone=phone.slice(2);if(!/^\d{7,15}$/.test(phone))throw new Error('Escribe un celular válido.');return phone;}
function caName_(value){const name=String(value||'').trim();if(!/^[\p{L}\p{M}][\p{L}\p{M}' -]{0,49}$/u.test(name))throw new Error('Escribe tu primer nombre y primer apellido.');return name;}
function caPassword_(value){const password=String(value||'');if(password.length<12||password.length>128)throw new Error('La contraseña debe tener entre 12 y 128 caracteres.');return password;}
function caLimit_(phone,action){caWithLock_(()=>{const cache=CacheService.getScriptCache(),key='ca-limit-'+action+'-'+authDigest_(phone),count=Number(cache.get(key)||0),globalKey='ca-burst-'+Math.floor(Date.now()/60000),globalCount=Number(cache.get(globalKey)||0);if(count>=5)throw new Error('Espera 15 minutos antes de volver a intentar.');if(globalCount>=60)throw new Error('Hay muchas solicitudes. Intenta en un minuto.');cache.put(key,String(count+1),900);cache.put(globalKey,String(globalCount+1),120);});}
function caWithLock_(fn){if(caLockDepth_)return fn();const lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw new Error('Intenta nuevamente en unos segundos.');caLockDepth_++;try{return fn();}finally{caLockDepth_--;lock.releaseLock();}}
function caRequest_(account,type,first,last,phone){
  const prior=caRows_('SolicitudesAccesoPrivadas').find(r=>r.data.phone===phone&&r.data.type===type&&r.data.status==='Pendiente');
  if(prior)return;
  const request={id:authRandom_(),accountId:account.id,type,first,last,phone,status:'Pendiente',created:Date.now()};caWrite_('SolicitudesAccesoPrivadas',null,request);
}
function caLogin_(body){
  const phone=caPhone_(body.telefono);caLimit_(phone,'login');
  const account=caAccount_(phone),data=account?.data;
  if(!data||data.status!=='Activo'||String(body.password||'').length<12||String(body.password||'').length>128)return {ok:false,error:'Datos incorrectos o cuenta pendiente de activación.'};
  if(Date.now()-(data.attemptStart||0)<900000&&(data.attempts||0)>=5)return {ok:false,error:'Espera 15 minutos antes de volver a intentar.'};
  const version=data.version,valid=authEqual_(authPasswordHash_(String(body.password||''),data.salt),data.hash);
  return caWithLock_(()=>{
    const current=caAccount_(phone);if(!current||current.data.version!==version||current.data.status!=='Activo')return {ok:false,error:'Intenta iniciar sesión nuevamente.'};
    const fresh=current.data;
    if(Date.now()-(fresh.attemptStart||0)>=900000){fresh.attempts=0;fresh.attemptStart=Date.now();}
    if(fresh.attempts>=5)return {ok:false,error:'Espera 15 minutos antes de volver a intentar.'};
    if(!valid){fresh.attempts++;caWrite_('CuentasPrivadas',current,fresh);return {ok:false,error:'Datos incorrectos o cuenta pendiente de activación.'};}
    fresh.attempts=0;caWrite_('CuentasPrivadas',current,fresh);
    CacheService.getScriptCache().remove('ca-limit-login-'+authDigest_(phone));
    const token='BLYXU-P5-'+authRandom_();CacheService.getScriptCache().put('ca-session-'+authDigest_(token),JSON.stringify({phone,version,expires:Date.now()+21600000}),21600);
    const owner=caOwnerData_(fresh);return {ok:true,token,cliente:publicCustomer_(owner.data)};
  });
}
function caOwnerData_(data){
  const found=findCustomerByIdentifier_(data.phone)||findCustomerByIdentifier_('57'+data.phone);
  return {data:Object.assign({},found?.data||{},{Nombre:data.first+' '+data.last,'Teléfono':data.phone,_keyVerified:true})};
}
function caSessionOwner_(token){
  if(!/^BLYXU-P5-[a-f0-9]{64}$/.test(String(token||'')))return null;
  const raw=CacheService.getScriptCache().get('ca-session-'+authDigest_(token));if(!raw)return null;
  const session=JSON.parse(raw),account=caAccount_(session.phone);
  if(session.expires<=Date.now()||!account||account.data.status!=='Activo'||account.data.version!==session.version)return null;
  return caOwnerData_(account.data);
}
function caAdminList_(){
  const rows=caRows_('SolicitudesAccesoPrivadas').filter(r=>r.data.status==='Pendiente').sort((a,b)=>a.data.created-b.data.created);
  return {ok:true,count:rows.length,requests:rows.slice(0,100).map(r=>{const a=caAccount_(r.data.phone),base=findCustomerByIdentifier_(r.data.phone)||findCustomerByIdentifier_('57'+r.data.phone);return {id:r.id,type:r.data.type,first:r.data.first,last:r.data.last,phone:r.data.phone,created:r.data.created,registeredName:a?a.data.first+' '+a.data.last:'',databaseName:base?.data.Nombre||'',accountStatus:a?.data.status||''};})};
}
function caAdminReview_(body){
  return caWithLock_(()=>{
    const row=caRows_('SolicitudesAccesoPrivadas').find(r=>r.id===String(body.id||''));
    if(!row||row.data.status!=='Pendiente')throw new Error('La solicitud ya fue atendida.');
    const request=row.data,account=caAccount_(request.phone);
    if(!account||account.id!==request.accountId)throw new Error('Cuenta no disponible.');
    if(body.decision==='reject'){request.status='Rechazada';request.updated=Date.now();caWrite_('SolicitudesAccesoPrivadas',row,request);return {ok:true,message:'Solicitud rechazada.'};}
    if(body.decision!=='approve'||body.confirmed!==true)throw new Error('Confirma la identidad por contacto directo antes de aprobar.');
    const data=account.data;request.updated=Date.now();
    if(request.type==='Activación'){
      if(data.status!=='Pendiente')throw new Error('Cuenta no disponible para activación.');
      ensureSheets_();let client=findCustomerByIdentifier_(data.phone)||findCustomerByIdentifier_('57'+data.phone);
      if(!client)appendRow_('Clientes',{Nombre:data.first+' '+data.last,'Teléfono':data.phone,'Estado Cliente':'Activo','Fecha Registro':new Date()});
      data.status='Verificación aprobada';data.version=authRandom_();
    }
    if(!['Activo','Verificación aprobada'].includes(data.status))throw new Error('Primero aprueba la activación de la cuenta.');
    const reset=authRandom_();data.status='Verificación aprobada';data.version=authRandom_();data.resetVersion=authRandom_();request.resetHash=authDigest_(reset);request.resetVersion=data.resetVersion;request.resetExpires=Date.now()+3600000;request.status='Enlace emitido';caWrite_('CuentasPrivadas',account,data);caWrite_('SolicitudesAccesoPrivadas',row,request);
    return {ok:true,message:'Entrega este enlace solo al cliente verificado. Vence en una hora y se usa una sola vez.',resetToken:reset};
  });
}
function caReset_(body){
  const token=String(body.resetToken||'');if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Enlace vencido o no válido.');
  const eligible=caRows_('SolicitudesAccesoPrivadas').find(r=>r.data.resetHash===authDigest_(token)&&r.data.status==='Enlace emitido'&&r.data.resetExpires>Date.now());
  if(!eligible)throw new Error('Enlace vencido o no válido.');
  const password=caPassword_(body.password),digest=authDigest_(token),salt=authRandom_(),hash=authPasswordHash_(password,salt);
  return caWithLock_(()=>{
    const row=caRows_('SolicitudesAccesoPrivadas').find(r=>r.data.resetHash===digest&&r.data.status==='Enlace emitido');
    if(!row||row.data.resetExpires<=Date.now())throw new Error('Enlace vencido o no válido.');
    const account=caAccount_(row.data.phone);if(!account||!['Activo','Verificación aprobada'].includes(account.data.status)||account.id!==row.data.accountId||account.data.resetVersion!==row.data.resetVersion)throw new Error('Enlace vencido o no válido.');
    const data=account.data;data.status='Activo';data.hash=hash;data.salt=salt;data.version=authRandom_();data.attempts=0;data.attemptStart=0;delete data.resetVersion;caWrite_('CuentasPrivadas',account,data);
    row.data.status='Completada';delete row.data.resetHash;row.data.updated=Date.now();caWrite_('SolicitudesAccesoPrivadas',row,row.data);CacheService.getScriptCache().remove('ca-limit-login-'+authDigest_(data.phone));
    return {ok:true,message:'Contraseña actualizada. Inicia sesión con tu celular y la contraseña nueva.'};
  });
}
function caAction_(action,body,admin){
  if(action==='caadminlist')return caAdminList_();
  if(action==='caadminreview')return caAdminReview_(body);
  if(action==='calogin')return caLogin_(body);
  if(action==='careset')return caReset_(body);
  if(action==='calogout'){const token=String(body.token||'');if(/^BLYXU-P5-[a-f0-9]{64}$/.test(token))CacheService.getScriptCache().remove('ca-session-'+authDigest_(token));return {ok:true};}
  const phone=caPhone_(body.telefono),first=caName_(body.nombre),last=caName_(body.apellido);caLimit_(phone,action);
  const message=action==='caregister'?'Solicitud recibida. BLYXU revisará tu identidad para activar la cuenta.':'Solicitud recibida. Contacta a BLYXU por WhatsApp para verificar tu identidad y recuperar el acceso.';
  if(action==='carecover'){
    caWithLock_(()=>{const account=caAccount_(phone);if(account)caRequest_(account.data,'Recuperación',first,last,phone);});return {ok:true,message};
  }
  const password=caPassword_(body.password);
  if(caAccount_(phone))return {ok:true,message};
  const salt=authRandom_(),hash=authPasswordHash_(password,salt);
  caWithLock_(()=>{if(caAccount_(phone))return;const data={id:authRandom_(),phone,first,last,salt,hash,status:'Pendiente',version:authRandom_(),attempts:0,created:Date.now()};caWrite_('CuentasPrivadas',null,data);caRequest_(data,'Activación',first,last,phone);});
  return {ok:true,message};
}
