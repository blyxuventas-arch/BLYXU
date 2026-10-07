(() => {
    'use strict';
    let timer,busy=false;
    async function request(payload){
        const response=await fetch(GOOGLE_SHEET_API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),cache:'no-store'});
        const result=await response.json();if(!result.ok)throw new Error(result.error||'No se pudo consultar el pedido.');return result;
    }
    async function refresh(options = {}){
        if(busy||document.hidden||!secureAdminCredential)return;
        busy=true;
        try{
            const data=await request({action:'orderadminnotifications'});
            document.querySelectorAll('[data-new-orders-count]').forEach(el=>el.textContent=data.count);
            document.getElementById('order-notification-bell').setAttribute('aria-label','Pedidos nuevos: '+data.count);
            return data;
        }catch(error){document.getElementById('order-notifications-status').textContent=error.message;if(options.throwOnError)throw error;}
        finally{busy=false;}
    }
    async function download(id,button){
        try{const result=await request({action:'orderadminreceipt',orderId:id});if(!result.data)throw Error('Pedido no disponible.');await BlyxuOrderSummary.download(BlyxuOrderSummary.fromRecord(result.data),button);}
        catch(error){document.getElementById('order-notifications-status').textContent=error.message;}
    }
    function init(){
        if(document.getElementById('order-notification-bell'))return;
        const host=document.getElementById('admin-main-content'),sidebar=host?.querySelector('.sub-sidebar .sidebar-section');if(!sidebar)return;
        const dialog=document.createElement('dialog');dialog.id='order-notifications-dialog';dialog.style.cssText='width:min(680px,calc(100% - 30px));max-height:85vh;overflow:auto;background:#222;color:#eee;border:1px solid #555;border-radius:12px;padding:24px';
        dialog.innerHTML='<h2>Pedidos nuevos</h2><button type="button" data-close>Cerrar</button><p id="order-notifications-status" role="status"></p><div data-orders-list></div>';
        dialog.querySelector('[data-close]').onclick=()=>dialog.close();host.append(dialog);
        const open=async()=>{
            dialog.showModal();const status=dialog.querySelector('[role=status]'),list=dialog.querySelector('[data-orders-list]');status.textContent='Consultando pedidos…';list.replaceChildren();
            try{
                const data=await request({action:'orderadminnotifications'});status.textContent=data.count?data.count+' pedidos sin revisar.':'No hay pedidos nuevos.';
                for(const n of data.notifications){
                    const card=document.createElement('article');card.style.cssText='padding:18px 0;border-bottom:1px solid #555';
                    const title=document.createElement('h3');title.textContent='Nuevo pedido · '+n.id;
                    const info=document.createElement('p');info.textContent=n.name+' · '+(n.type==='Mayor'?'Mayorista':'Minorista')+' · '+new Date(n.created).toLocaleString('es-CO',{timeZone:'America/Bogota'});
                    card.append(title,info);
                    const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.className='admin-btn secondary';b.style.margin='4px';b.textContent=label;b.onclick=()=>fn(b);card.append(b);};
                    button('Abrir pedido',async b=>{b.disabled=true;try{await cargarPedidos({force:true});const index=(window.pedidosList||[]).findIndex(p=>String(p['ID Pedido'])===n.id);if(index<0)throw Error('Pedido no encontrado. Actualiza el listado.');dialog.close();switchDashboardView('orders','Pedidos');abrirEditorFactura(index);}catch(e){status.textContent=e.message;}finally{b.disabled=false;}});
                    button('Descargar comprobante',b=>download(n.id,b));
                    button('Marcar como visto',async b=>{b.disabled=true;try{await request({action:'orderadminseen',orderId:n.id});card.remove();await refresh();status.textContent='Pedido marcado como visto. Sigue disponible en Pedidos.';}catch(e){status.textContent=e.message;b.disabled=false;}});
                    button('Vincular a cuenta validada',async b=>{const phone=prompt('Celular de la cuenta activa. Primero verifica su identidad por contacto directo:');if(!phone)return;if(!confirm('¿Confirmaste por contacto directo que esta persona es titular del pedido y del celular?'))return;b.disabled=true;try{await request({action:'orderadminlink',orderId:n.id,telefono:phone,confirmed:true});status.textContent='Pedido vinculado a la cuenta validada.';}catch(e){status.textContent=e.message;}finally{b.disabled=false;}});
                    list.append(card);
                }
            }catch(error){status.textContent=error.message;}
        };
        const bell=document.createElement('button');bell.id='order-notification-bell';bell.type='button';bell.className='sidebar-btn';bell.dataset.sectionLabel='Pedidos nuevos';bell.innerHTML='<span aria-hidden="true">🔔</span><span class="sidebar-label">Pedidos nuevos</span><b data-new-orders-count>0</b>';bell.onclick=open;sidebar.append(bell);
        const mobile=host.querySelector('#admin-section-drawer .admin-section-list');if(mobile){const clone=bell.cloneNode(true);clone.removeAttribute('id');clone.onclick=open;mobile.append(clone);}
        refresh();timer=setInterval(refresh,30000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
        // A permanent action in the editor also works for orders already marked as seen.
        const footer=document.querySelector('#invoice-editor-modal .inv-footer-right');
        if(footer){
            const b=document.createElement('button');b.type='button';b.className='admin-btn secondary';b.textContent='Comprobante del pedido';
            b.onclick=()=>{const id=document.getElementById('inv-original-id')?.value;if(id)download(id,b);else alert('Abre un pedido registrado para descargar su comprobante.');};footer.prepend(b);
            const link=document.createElement('button');link.type='button';link.className='admin-btn secondary';link.textContent='Vincular cuenta validada';
            link.onclick=async()=>{const id=document.getElementById('inv-original-id')?.value;if(!id)return alert('Abre un pedido registrado.');const phone=prompt('Celular de la cuenta activa y validada:');if(!phone||!confirm('¿Verificaste por contacto directo que esta persona es titular de este pedido?'))return;try{await request({action:'orderadminlink',orderId:id,telefono:phone,confirmed:true});alert('Pedido vinculado a la cuenta validada.');}catch(e){alert(e.message);}};footer.prepend(link);
        }
    }
    window.initOrderNotifications=init;
    window.refreshOrderNotifications=refresh;
    document.addEventListener('DOMContentLoaded',init);
})();
