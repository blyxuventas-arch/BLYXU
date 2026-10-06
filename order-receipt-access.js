// Receipt credentials stay only in this page's memory, never in a URL or browser storage.
(() => {
    'use strict';
    let temporary=null, timer;
    localStorage.removeItem('blyxu-last-order');
    const session=()=>{
        try{return JSON.parse(sessionStorage.getItem('blyxu_key_session_v1')||localStorage.getItem('blyxu_customer_device_session_v2')||'null');}catch(_){return null;}
    };
    async function request(payload){
        const response=await fetch(GOOGLE_SHEET_API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),cache:'no-store'});
        const result=await response.json();
        if(!response.ok||!result.ok)throw new Error(result.error||result.message||'No se pudo autorizar el comprobante.');
        return result;
    }
    function refresh(){
        const region=document.querySelector('[data-temporary-receipt]');
        if(!region)return;
        const remaining=temporary?Math.max(0,temporary.deadline-performance.now()):0;
        const button=region.querySelector('[data-receipt-download]'),status=region.querySelector('[data-receipt-status]');
        if(!remaining){
            temporary=null;clearInterval(timer);button.hidden=true;button.disabled=true;
            status.textContent='El acceso directo terminó. Tu pedido sigue registrado. Para consultarlo después, entra a Pedidos y facturas con tu cuenta validada.';
        }else status.textContent='Descarga privada disponible por '+Math.ceil(remaining/60000)+' minuto(s). No es una factura de venta.';
    }
    function begin(grant){
        clearInterval(timer);
        temporary=grant?.token&&grant?.orderId?{...grant,deadline:performance.now()+Math.min(300000,Math.max(0,grant.expires-Date.now()))}:null;
        timer=setInterval(refresh,1000);
    }
    async function downloadTemporary(button){
        let authorized;
        try{
            refresh();if(!temporary)throw new Error('El acceso temporal venció.');
            const grant={...temporary};
            const payload={action:'ordertempreceipt',orderId:grant.orderId,receiptToken:grant.token};
            authorized=await request(payload);
            await BlyxuOrderSummary.download(BlyxuOrderSummary.fromRecord(authorized.data),button,async()=>{
                if(!temporary||temporary.token!==grant.token||performance.now()>=grant.deadline)throw new Error('El acceso temporal venció durante la preparación. Consulta tu cuenta.');
                await request(payload);
            });
        }catch(error){
            if(/venci[oó]|no es válido/i.test(error.message))temporary=null;
            const status=document.querySelector('[data-receipt-status]');if(status)status.textContent=error.message;
        }finally{authorized=null;if(!temporary||performance.now()>=temporary.deadline)refresh();}
    }
    async function downloadCustomer(orderId,button){
        try{
            const token=session()?.token;if(!token)throw new Error('Inicia sesión en Mi cuenta con tu celular y contraseña. BLYXU debe validar tu cuenta y su relación con este pedido.');
            const payload={action:'ordercustomerreceipt',orderId,token};
            const result=await request(payload);
            await BlyxuOrderSummary.download(BlyxuOrderSummary.fromRecord(result.data),button,()=>request(payload));
        }catch(error){alert(error.message);}
    }
    window.BlyxuReceiptAccess={begin,refresh,downloadTemporary,downloadCustomer,request};
    window.addEventListener('pagehide',()=>{temporary=null;clearInterval(timer);},{once:true});
})();
