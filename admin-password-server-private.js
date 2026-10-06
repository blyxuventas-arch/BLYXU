// Administrator password + TOTP. This file belongs only in Apps Script.
function authBytes_(text) {
  return Uint8Array.from(Utilities.newBlob(String(text)).getBytes().map(function(b){return (b+256)%256;}));
}
function authHex_(bytes) {return Array.from(bytes).map(function(b){return ('0'+b.toString(16)).slice(-2);}).join('');}
function authDigest_(text) {return authHex_(BlyxuCrypto.sha256(authBytes_(text)));}
function authEqual_(a,b) {a=String(a);b=String(b);var difference=a.length^b.length;for(var i=0;i<Math.max(a.length,b.length);i++)difference|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return difference===0;}
function authPasswordHash_(password,salt) {
  return authHex_(BlyxuCrypto.pbkdf2(BlyxuCrypto.sha256,authBytes_(password),authBytes_(salt),{c:600000,dkLen:32}));
}
function authRandom_() {return Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');}
function authBase32_(bytes) {
  var alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=0,value=0,out='';
  bytes.forEach(function(b){value=(value<<8)|b;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}});
  if(bits)out+=alphabet[(value<<(5-bits))&31];return out;
}
function authBase32Decode_(text) {
  var alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=0,value=0,out=[];
  String(text).replace(/=+$/,'').split('').forEach(function(c){var n=alphabet.indexOf(c);if(n<0)throw new Error('Acceso no autorizado.');value=(value<<5)|n;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}});return Uint8Array.from(out);
}
function authTotp_(secret,step,digits) {
  var counter=new Uint8Array(8);for(var i=7;i>=0;i--){counter[i]=step%256;step=Math.floor(step/256);}
  var mac=BlyxuCrypto.hmac(BlyxuCrypto.sha1,authBase32Decode_(secret),counter),offset=mac[mac.length-1]&15;
  var number=((mac[offset]&127)<<24)|(mac[offset+1]<<16)|(mac[offset+2]<<8)|mac[offset+3];
  return String(number%Math.pow(10,digits||6)).padStart(digits||6,'0');
}
function authValidStep_(secret,code,previous) {
  if(!/^\d{6}$/.test(String(code)))return -1;
  var step=Math.floor(Date.now()/30000);for(var delta=-1;delta<=1;delta++){var candidate=step+delta;if(candidate>Number(previous||-1)&&authEqual_(authTotp_(secret,candidate),code))return candidate;}return -1;
}
function authAdminConfig_(){return PropertiesService.getScriptProperties();}
function authAdminEnabled_(){return authAdminConfig_().getProperty('BLYXU_ADMIN_PASSWORD_ENABLED')==='true';}
function authAdminSession_(token) {
  if(!/^BLYXU-A3-[a-f0-9]{64}$/.test(String(token||'')))return null;
  var data=CacheService.getScriptCache().get('admin-session-'+authDigest_(token));
  if(!data)return null;var session=JSON.parse(data);
  if(session.expires<Date.now()||session.version!==authAdminConfig_().getProperty('BLYXU_ADMIN_AUTH_VERSION'))return null;
  return {email:session.email,method:'password-totp'};
}
function authAdminLogin_(body) {
  var props=authAdminConfig_();if(!authAdminEnabled_())return {ok:false,error:'Primero configura el acceso del administrador.'};
  var lock=LockService.getScriptLock();if(!lock.tryLock(1000))return {ok:false,error:'Intenta de nuevo en unos segundos.'};
  try {
    var attempts=JSON.parse(props.getProperty('BLYXU_ADMIN_ATTEMPTS')||'{"count":0,"start":0}');
    if(Date.now()-attempts.start>900000)attempts={count:0,start:Date.now()};
    if(attempts.count>=5)return {ok:false,error:'Demasiados intentos. Espera 15 minutos.'};
    attempts.count++;props.setProperty('BLYXU_ADMIN_ATTEMPTS',JSON.stringify(attempts));
    var password=String(body.password||''),user=String(body.usuario||'').trim().toLowerCase();
    if(password.length<12||password.length>128||!authEqual_(user,props.getProperty('BLYXU_ADMIN_USERNAME')))return {ok:false,error:'Datos de acceso incorrectos.'};
    if(!authEqual_(authPasswordHash_(password,props.getProperty('BLYXU_ADMIN_PASSWORD_SALT')),props.getProperty('BLYXU_ADMIN_PASSWORD_HASH')))return {ok:false,error:'Datos de acceso incorrectos.'};
    var step=authValidStep_(props.getProperty('BLYXU_ADMIN_TOTP_SECRET'),String(body.codigo||''),props.getProperty('BLYXU_ADMIN_TOTP_LAST_STEP'));
    if(step<0){
      var recovery=String(body.codigo||'').trim().toUpperCase(),hashes=JSON.parse(props.getProperty('BLYXU_ADMIN_RECOVERY_HASHES')||'[]'),match=hashes.indexOf(authDigest_(recovery));
      if(match<0)return {ok:false,error:'Datos de acceso incorrectos.'};hashes.splice(match,1);props.setProperty('BLYXU_ADMIN_RECOVERY_HASHES',JSON.stringify(hashes));
    } else props.setProperty('BLYXU_ADMIN_TOTP_LAST_STEP',String(step));
    props.deleteProperty('BLYXU_ADMIN_ATTEMPTS');
    var token='BLYXU-A3-'+authRandom_(),email=props.getProperty('BLYXU_ADMIN_USERNAME');
    CacheService.getScriptCache().put('admin-session-'+authDigest_(token),JSON.stringify({email:email,expires:Date.now()+1800000,version:props.getProperty('BLYXU_ADMIN_AUTH_VERSION')}),1800);
    return {ok:true,status:'success',token:token,email:email};
  } finally {lock.releaseLock();}
}
function authAdminBegin_(admin) {
  if(authAdminEnabled_()||!admin||admin.method==='password-totp')throw new Error('Acceso no autorizado.');
  var seed=authBase32_(BlyxuCrypto.sha256(authBytes_(authRandom_())).slice(0,20)),nonce=authRandom_();
  CacheService.getScriptCache().put('admin-enrollment-'+authDigest_(nonce),JSON.stringify({email:admin.email,secret:seed,expires:Date.now()+600000}),600);
  return {ok:true,nonce:nonce,uri:'otpauth://totp/'+encodeURIComponent('BLYXU:'+admin.email)+'?secret='+seed+'&issuer=BLYXU&algorithm=SHA1&digits=6&period=30'};
}
function authAdminFinish_(body,admin) {
  if(!admin||admin.method==='password-totp'||authAdminEnabled_())throw new Error('Acceso no autorizado.');
  var key='admin-enrollment-'+authDigest_(String(body.nonce||'')),cache=CacheService.getScriptCache(),raw=cache.get(key);
  if(!raw)throw new Error('La configuración venció. Vuelve a comenzar.');var pending=JSON.parse(raw);
  var password=String(body.password||''),step=authValidStep_(pending.secret,String(body.codigo||''),-1);
  if(pending.email!==admin.email||pending.expires<Date.now()||password.length<12||password.length>128||step<0)return {ok:false,error:'Comprueba la contraseña y el código de seis dígitos.'};
  var hash=authPasswordHash_(password,authDigest_(pending.secret+'password-salt'));
  var lock=LockService.getScriptLock();lock.waitLock(1000);
  try {
    if(authAdminEnabled_()||!cache.get(key))throw new Error('Acceso no autorizado.');
    var recovery=[];for(var i=0;i<8;i++)recovery.push(authRandom_().slice(0,20).toUpperCase());
    authAdminConfig_().setProperties({BLYXU_ADMIN_USERNAME:admin.email.toLowerCase(),BLYXU_ADMIN_PASSWORD_SALT:authDigest_(pending.secret+'password-salt'),BLYXU_ADMIN_PASSWORD_HASH:hash,BLYXU_ADMIN_TOTP_SECRET:pending.secret,BLYXU_ADMIN_TOTP_LAST_STEP:String(step),BLYXU_ADMIN_AUTH_VERSION:authRandom_(),BLYXU_ADMIN_RECOVERY_HASHES:JSON.stringify(recovery.map(authDigest_)),BLYXU_ADMIN_PASSWORD_ENABLED:'true'});
    cache.remove(key);return {ok:true,recovery:recovery};
  } finally {lock.releaseLock();}
}
