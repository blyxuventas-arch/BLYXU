// Detail links identify a product by its persisted reference, never by a mutable list position.
(function(root){
    const value=(product,keys)=>{for(const key of keys){const v=product?.[key];if(v!==undefined&&v!==null&&String(v).trim())return String(v).trim();}return '';};
    function identity(product){return {ref:value(product,['idVariacion','ID Variación','ID Variacion','ID','id','SKU']),family:value(product,['idProducto','ID Producto','ID_Producto','ID Producto Madre'])};}
    function resolve(products, params, preview=null, mode='retail'){
        let ref=params.get('ref')||'',family=params.get('family')||'';
        const raw=params.get('id');const index=raw!==null&&/^\d+$/.test(raw)?Number(raw):-1;
        if(!ref&&preview&&preview.id===index&&preview.mode===mode&&Date.now()-Number(preview.savedAt||0)<120000){ref=preview.ref||'';family=preview.family||'';}
        if(ref){const matches=products.map((p,i)=>({i,...identity(p)})).filter(p=>p.ref===ref&&(!family||p.family===family));return matches.length===1?matches[0].i:-1;}
        return Number.isSafeInteger(index)&&products[index]?index:-1;
    }
    function url(product,index,mode='retail'){
        const key=identity(product),params=new URLSearchParams();
        if(key.ref){params.set('ref',key.ref);if(key.family)params.set('family',key.family);}
        if(Number.isSafeInteger(index)&&index>=0)params.set('id',String(index));
        if(mode==='wholesale')params.set('catalogo','mayorista');
        return 'producto.html?'+params.toString();
    }
    root.BlyxuProductIdentity={identity,resolve,url};
})(typeof window!=='undefined'?window:globalThis);
