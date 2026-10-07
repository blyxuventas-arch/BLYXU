/* Catalog access only: never stores a PIN or a customer/admin credential. */
(() => {
    const KEY='blyxu_wholesale_access_v2',DURATION=4*60*60*1000;
    let timer,guarded=false;
    function read() {
        try {
            const value=JSON.parse(localStorage.getItem(KEY)||'null');
            if(Number.isFinite(value?.startedAt) && Number.isFinite(value?.expires) && value.startedAt<=Date.now() && value.expires-value.startedAt===DURATION && value.expires>Date.now())return value;
            localStorage.removeItem(KEY);
        } catch (_) {}
        return null;
    }
    function start() {
        const value={startedAt:Date.now(),expires:Date.now()+DURATION};
        // Use the same instant so the lifetime is precisely four hours.
        value.expires=value.startedAt+DURATION;
        try {localStorage.setItem(KEY,JSON.stringify(value));}catch(_){return false;}
        return true;
    }
    function watch() {
        if(timer)return;
        const label=document.createElement('div');label.className='wholesale-session-clock';label.setAttribute('role','timer');
        document.querySelector('.wholesale-page-section')?.prepend(label);
        function update() {
            const access=read();
            if(!access){clearInterval(timer);location.reload();return;}
            const remaining=new Date(access.expires).toLocaleTimeString('en-US',{timeZone:'America/Bogota',hour:'numeric',minute:'2-digit',hour12:true});
            label.textContent='Renovación de inicio de sesión mayorista · '+remaining+'\nNo se perderán los productos añadidos a la bolsa del pedido.';
        }
        update();timer=setInterval(update,30000);
        window.addEventListener('pageshow',update);
        document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
        // One history entry absorbs accidental Back; ordinary links and the logo remain usable.
        if(!guarded){
            guarded=true;
            try {if(!history.state?.blyxuWholesaleGuard)history.pushState({...history.state,blyxuWholesaleGuard:true},'',location.href);}catch(_){}
            window.addEventListener('popstate',()=>{
                if(read())try{history.pushState({...history.state,blyxuWholesaleGuard:true},'',location.href);}catch(_){}
            });
        }
    }
    window.BlyxuWholesaleSession={read,start,watch};
})();
