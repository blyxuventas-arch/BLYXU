async function adminAccessJson(api, nativeFetch, options = {}) {
 const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
 try {
  const response = await nativeFetch(api, {...options, cache:'no-store', signal:controller.signal});
  if (!response.ok) throw new Error('El servidor no respondió correctamente. Intenta nuevamente.');
  return await response.json();
 } catch (error) {
  if (error.name === 'AbortError') throw new Error('El acceso tardó demasiado. Revisa tu conexión y pulsa Reintentar acceso.');
  if (error instanceof TypeError) throw new Error('No se pudo conectar con el acceso seguro. Revisa tu conexión e intenta nuevamente.');
  throw error;
 } finally { clearTimeout(timeout); }
}
// Credentials stay in memory and are submitted only to the private server over HTTPS.
async function initializeAdminPasswordAccess(api, nativeFetch, form, onAccess) {
    form.parentElement.querySelector('.admin-secure-access')?.remove();
    const area = document.createElement('div');
    area.className = 'admin-secure-access';
    const style = document.getElementById('admin-secure-access-style') || document.createElement('style');
    style.id = 'admin-secure-access-style';
    style.textContent = `.admin-secure-access{text-align:left;display:grid;gap:16px;width:100%;color:#eee}.admin-secure-access form{display:grid;gap:16px}.admin-secure-access label{display:grid;gap:8px;font-size:13px;font-weight:600}.admin-secure-access input{box-sizing:border-box;width:100%;min-height:48px;padding:12px 14px;border:1px solid #444;border-radius:12px;background:#222228;color:#fff;font:inherit}.admin-secure-access button{width:100%;min-height:48px;padding:12px;border:1px solid #555;border-radius:12px;background:#eee;color:#171719;font:600 13px inherit;cursor:pointer}.admin-secure-access button:disabled{opacity:.55}.admin-secure-access p,.admin-secure-access li{font-size:13px;line-height:1.65}.admin-secure-access ol{padding-left:22px;margin:0}.admin-secure-access img{display:block;max-width:100%;margin:auto;border:8px solid #fff;border-radius:12px}.admin-secure-access pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:16px;background:#24242b;border-radius:12px}.admin-secure-access [role=status]{margin:0;color:#e8c8ff}#admin-login-screen{overflow-y:auto;padding:24px 12px;box-sizing:border-box}#admin-login-box{max-height:none!important;margin:auto!important}`;
    document.head.append(style);
    form.hidden = true;
    form.style.display = 'none';
    form.after(area);
    const request = async payload => {
        const data = await adminAccessJson(api,nativeFetch,{method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(payload)});
        if (!data.ok) throw new Error(data.error || 'No se pudo completar el acceso.');
        return data;
    };
    area.innerHTML = '<p role="status">Cargando acceso seguro…</p>';
    try {
        const data = await adminAccessJson(api + '?action=get_config&_=' + Date.now(),nativeFetch);
        if(data.status !== 'success' || !data.config || typeof data.config !== 'object')throw new Error(data.error || 'No se pudo cargar la configuración del acceso.');
        const config = data.config;
        if (config.Auth_Admin_Mode === 'password-totp') {
            area.innerHTML = `<form class="customer-auth-form" id="admin-secure-login">
                <label>Usuario<input name="usuario" type="email" autocomplete="username" required></label>
                <label>Contraseña<input name="password" type="password" autocomplete="current-password" minlength="12" maxlength="128" required></label>
                <label>Código del autenticador o de respaldo<input name="codigo" type="text" autocomplete="one-time-code" maxlength="20" required></label>
                <button type="submit">Entrar al administrador</button><p role="status"></p>
            </form>`;
            area.querySelector('form').addEventListener('submit', async event => {
                event.preventDefault();const login = event.currentTarget, button = login.querySelector('button'), message = login.querySelector('[role=status]');
                button.disabled = true;message.textContent = 'Verificando acceso…';
                try {const auth = await request({action:'adminpasswordlogin', usuario:login.elements.usuario.value, password:login.elements.password.value, codigo:login.elements.codigo.value});login.reset();onAccess(auth.token);}
                catch(error){message.textContent=error.message;login.elements.password.value='';login.elements.codigo.value='';}
                finally{button.disabled=false;}
            });
            return;
        }
        area.innerHTML = '<p>Inicia sesión con tu cuenta de Google autorizada.</p><div id="admin-bootstrap-google"></div><p role="status"></p>';
        const message = area.querySelector('[role=status]');
        if (!config.Google_Client_ID) throw new Error('Falta configurar el acceso actual del administrador.');
        if (!window.google?.accounts?.id) await new Promise((resolve,reject)=>{
            const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';const timeout=setTimeout(()=>{script.remove();reject(new Error('Google tardó demasiado en cargar. Revisa tu conexión y pulsa Reintentar acceso.'));},20000);script.onload=()=>{clearTimeout(timeout);if(window.google?.accounts?.id)resolve();else reject(new Error('No se pudo iniciar el acceso de Google.'));};script.onerror=()=>{clearTimeout(timeout);script.remove();reject(new Error('No se pudo cargar el acceso de Google.'));};document.head.appendChild(script);
        });
        let verifyingAccount = false;
        window.google.accounts.id.initialize({client_id:config.Google_Client_ID,callback:async result=>{
            if (verifyingAccount) return;
            verifyingAccount = true;
            message.textContent = 'Verificando cuenta…';
            try {
                await request({action:'adminsession',adminCredential:result.credential});
                onAccess(result.credential);
            }catch(error){message.textContent=error.message;verifyingAccount=false;}
        }});
        window.google.accounts.id.renderButton(area.querySelector('#admin-bootstrap-google'),{type:'standard',theme:'outline',size:'large',text:'continue_with',locale:'es'});
    } catch(error) {area.replaceChildren();const message=document.createElement('p');message.role='status';message.textContent=error.message;const retry=document.createElement('button');retry.type='button';retry.textContent='Reintentar acceso';retry.onclick=()=>initializeAdminPasswordAccess(api,nativeFetch,form,onAccess);area.append(message,retry);}
}
