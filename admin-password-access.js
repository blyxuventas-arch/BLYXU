// Credentials stay in memory and are submitted only to the private server over HTTPS.
async function initializeAdminPasswordAccess(api, nativeFetch, form, onAccess) {
    const area = document.createElement('div');
    area.className = 'customer-auth-form';
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
                        area.innerHTML=`<p>Escanea este QR con tu aplicación autenticadora. No compartas esta pantalla.</p><img id="admin-enrollment-qr" alt="QR privado para configurar el autenticador" width="200" height="200"><form class="customer-auth-form"><label>Nueva contraseña<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>Repite la contraseña<input name="confirm" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>Código del autenticador<input name="codigo" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code" required></label><button type="submit">Activar acceso seguro sin Google</button><p role="status"></p></form>`;
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
