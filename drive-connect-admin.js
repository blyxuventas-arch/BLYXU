window.initializeBlyxuDriveConnection=function(getCredential){
  if(document.getElementById('drive-connect-card'))return;
  const panel=document.querySelector('#view-settings > .admin-panel');if(!panel)return;
  const card=document.createElement('section');card.className='drive-card';card.id='drive-connect-card';
  card.innerHTML='<span class="drive-eyebrow">ALMACENAMIENTO MULTIMEDIA</span><h3>Google Drive</h3><p>Conecta la cuenta donde guardarás las nuevas imágenes. Tus imágenes actuales conservan sus enlaces.</p><div class="drive-controls"><label>Nombre de la carpeta<input id="drive-folder-name" value="BLYXU Imágenes" maxlength="100"></label><button type="button" id="drive-connect-button">Conectar Drive</button><button type="button" id="drive-refresh-button">Comprobar conexión</button></div><p id="drive-connect-status" class="drive-status" data-state="checking" role="status" aria-live="polite"><span class="drive-status-dot" aria-hidden="true"></span><span id="drive-status-text">Comprobando conexión…</span></p>';
  panel.insertBefore(card,panel.querySelector('.settings-tabs'));
  const status=card.querySelector('[role=status]'),button=card.querySelector('#drive-connect-button'),refresh=card.querySelector('#drive-refresh-button');
  const message=card.querySelector('#drive-status-text');
  function showStatus(state,text){status.dataset.state=state;message.textContent=text;}
  async function api(action,data={}){
    const credential=getCredential();if(!credential)throw new Error('Inicia sesión nuevamente para conectar Drive.');
    const response=await fetch(window.BLYXU_BACKEND.supabase,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({action,adminCredential:credential,...data}),signal:AbortSignal.timeout(30000)});
    const result=await response.json();if(!result.ok)throw new Error(result.error||'No se pudo comprobar la conexión.');return result;
  }
  async function check(){
    refresh.disabled=true;
    showStatus('checking','Comprobando conexión…');
    try{const value=await api('drivestatus');showStatus(value.connected?'connected':'disconnected',value.connected?'Conectado · '+value.folderName:value.configured?'Desconectado · Autoriza tu cuenta de Google para conectar Drive.':'Desconectado · Falta configurar el cliente de Drive.');button.textContent=value.connected?'Reconectar Drive':'Conectar Drive';button.disabled=!value.configured;}
    catch(error){showStatus('unverified','Sin comprobar · '+error.message);button.disabled=true;}finally{refresh.disabled=false;}
  }
  button.addEventListener('click',async()=>{
    button.disabled=true;refresh.disabled=true;
    showStatus('checking','Preparando la autorización de Google…');
    try{
      const value=await api('drivebegin',{folderName:card.querySelector('input').value});
      const target=new URL(value.url);
      if(target.origin!=='https://accounts.google.com'||target.pathname!=='/o/oauth2/v2/auth')throw new Error('No se pudo confirmar el destino de Google.');
      location.assign(target.href);
    }catch(error){button.disabled=false;refresh.disabled=false;showStatus('unverified',error.message);}
  });
  refresh.addEventListener('click',check);check();
};
