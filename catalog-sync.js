/* Revalidate open catalogs after inventory changes, returning, and while visible. */
(() => {
    let busy=false,lastCheck=Date.now();
    async function refresh(force=false) {
        if(busy || document.hidden || !document.getElementById('coleccion'))return;
        if(document.body.dataset.catalogMode==='wholesale' && !document.body.classList.contains('wholesale-unlocked'))return;
        if(!force && Date.now()-lastCheck<45000)return;
        busy=true;lastCheck=Date.now();
        try {
            // An in-flight snapshot may predate the deletion; finish it before requesting a fresh one.
            if(productsLoadPromise)await productsLoadPromise;
            const previous=JSON.stringify(allProducts);
            await requestFreshProducts({showLoading:false});
            applyPromotionsToProducts();
            if(JSON.stringify(allProducts)!==previous){
                if(document.body.dataset.catalogMode==='wholesale')renderCatalogProducts();
                else await renderHomeSectionsStaggered({renderCatalog:true});
                updateCartUI();
            }
        }catch(error){console.warn('No se pudo sincronizar el catálogo:',error);}
        finally{busy=false;}
    }
    window.addEventListener('storage',event=>{
        if(event.key==='blyxu_catalog_revision_v1' || (event.key===PRODUCTS_CACHE_KEY && !event.newValue))refresh(true);
    });
    window.addEventListener('pageshow',event=>{if(event.persisted)refresh(true);});
    window.addEventListener('focus',()=>refresh());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
    const timer=setInterval(()=>refresh(),60000);
    window.addEventListener('pagehide',event=>{if(!event.persisted)clearInterval(timer);});
})();
