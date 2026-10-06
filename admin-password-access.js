// Credentials stay in memory and are submitted only to the private server over HTTPS.
async function initializeAdminPasswordAccess(api, nativeFetch, form, onAccess) {
    const area = document.createElement('div');
    area.className = 'admin-secure-access';
    const style = document.createElement('style');
    style.textContent = `.admin-secure-access{text-align:left;display:grid;gap:16px;width:100%;color:#eee}.admin-secure-access form{display:grid;gap:16px}.admin-secure-access label{display:grid;gap:8px;font-size:13px;font-weight:600}.admin-secure-access input{box-sizing:border-box;width:100%;min-height:48px;padding:12px 14px;border:1px solid #444;border-radius:12px;background:#222228;color:#fff;font:inherit}.admin-secure-access button{width:100%;min-height:48px;padding:12px;border:1px solid #555;border-radius:12px;background:#eee;color:#171719;font:600 13px inherit;cursor:pointer}.admin-secure-access button:disabled{opacity:.55}.admin-secure-access p,.admin-secure-access li{font-size:13px;line-height:1.65}.admin-secure-access ol{padding-left:22px;margin:0}.admin-secure-access img{display:block;max-width:100%;margin:auto;border:8px solid #fff;border-radius:12px}.admin-secure-access pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:16px;background:#24242b;border-radius:12px}.admin-secure-access [role=status]{margin:0;color:#e8c8ff}#admin-login-screen{overflow-y:auto;padding:24px 12px;box-sizing:border-box}#admin-login-box{max-height:none!important;margin:auto!important}`;
    document.head.append(style);
    form.hidden = true;
    form.style.display = 'none';
    form.after(area);
    const request = async payload => {
        const response = await nativeFetch(api, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(payload), cache:'no-store'});
        const data = await response.json();
        if (!data.ok) throw new Error(data.error || 'No se pudo completar el acceso.');
        return data;
    };
    area.innerHTML = '<p role="status">Cargando acceso seguro…</p>';
    try {
        const response = await nativeFetch(api + '?action=get_config', {cache:'no-store'});
        const config = (await response.json()).config || {};
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
        area.innerHTML = '<p>Accede con tu cuenta autorizada para configurar la contraseña y el autenticador.</p><div id="admin-bootstrap-google"></div><p role="status"></p>';
        const message = area.querySelector('[role=status]');
        if (!config.Google_Client_ID) throw new Error('Falta configurar el acceso actual del administrador.');
        if (!window.google?.accounts?.id) await new Promise((resolve,reject)=>{
            const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.onload=resolve;script.onerror=()=>reject(new Error('No se pudo cargar el acceso actual.'));document.head.appendChild(script);
        });
        window.google.accounts.id.initialize({client_id:config.Google_Client_ID,callback:async result=>{
            try {
                await request({action:'adminsession',adminCredential:result.credential});
                area.innerHTML='<button type="button" id="admin-continue-current">Entrar con el acceso actual</button><button type="button" id="admin-begin-password">Configurar contraseña y autenticador</button><p role="status"></p>';
                area.querySelector('#admin-continue-current').onclick=()=>onAccess(result.credential);
                area.querySelector('#admin-begin-password').onclick=async()=>{
                    const status=area.querySelector('[role=status]');status.textContent='Preparando configuración…';
                    try {
                        const enrollment=await request({action:'adminpasswordbegin',adminCredential:result.credential});
                        const qr=qrcode(0,'M');qr.addData(enrollment.uri);qr.make();
                        area.innerHTML=`<h2>Configura tu acceso en 3 pasos</h2><ol><li>Abre una aplicación autenticadora en tu celular (por ejemplo, Microsoft Authenticator). Selecciona añadir cuenta y escanear QR.</li><li>Escanea el QR de abajo. Si estás usando el mismo celular, abre este panel en otro dispositivo para escanearlo.</li><li>Crea tu contraseña y escribe los 6 números que aparecen en la aplicación. El código cambia cada 30 segundos.</li></ol><p>Esta configuración vence en 10 minutos. Mantén el QR privado.</p><img id="admin-enrollment-qr" alt="QR privado para configurar el autenticador" width="200" height="200"><form class="customer-auth-form"><label>Nueva contraseña<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required><small>Usa al menos 12 caracteres.</small></label><label>Repite la contraseña<input name="confirm" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>Código de 6 números de la aplicación<input name="codigo" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label><button type="submit">Activar mi acceso seguro</button><p role="status"></p></form>`;
                        area.querySelector('img').src=qr.createDataURL(4,4);
                        area.querySelector('form').onsubmit=async event=>{
                            event.preventDefault();const setup=event.currentTarget,button=setup.querySelector('button'),status=setup.querySelector('[role=status]');
                            if(setup.elements.password.value!==setup.elements.confirm.value){status.textContent='Las contraseñas no coinciden.';return;}
                            button.disabled=true;status.textContent='Activando acceso…';
                            try {
                                const saved=await request({action:'adminpasswordfinish',adminCredential:result.credential,nonce:enrollment.nonce,password:setup.elements.password.value,codigo:setup.elements.codigo.value});
                                setup.reset();area.replaceChildren();
                                const title=document.createElement('p');title.textContent='Acceso activado. Guarda estos códigos de respaldo en un lugar privado. Cada código sirve una sola vez y requiere tu contraseña.';
                                const codes=document.createElement('pre');codes.textContent=saved.recovery.join('\n');
                                const done=document.createElement('button');done.type='button';done.textContent='Ya guardé los códigos: iniciar sesión';done.onclick=()=>location.reload();area.append(title,codes,done);
                            }catch(error){status.textContent=error.message;button.disabled=false;}
                        };
                    }catch(error){status.textContent=error.message;}
                };
            }catch(error){message.textContent=error.message;}
        }});
        window.google.accounts.id.renderButton(area.querySelector('#admin-bootstrap-google'),{type:'standard',theme:'outline',size:'large',text:'continue_with',locale:'es'});
    } catch(error) {area.replaceChildren();const message=document.createElement('p');message.role='status';message.textContent=error.message;area.append(message);}
}
