import {RETAIL_MODE_KEY, parsePercent, retailMode, calculateRetail} from './retail-pricing.mjs';

let percent=null, revision=null, loading=null;
const controls=new WeakMap();
const $=id=>document.getElementById(id);
const money=n=>'$'+Number(n).toLocaleString('es-CO');
const amount=value=>typeof parseAmount==='function'?parseAmount(value):Number(value);
function notify(message){$('retail-pricing-status').textContent=message;}
async function request(data){
    const response=await fetch(GOOGLE_SHEET_API,{method:'POST',body:JSON.stringify({action:'retailpricing',...data})});
    const result=await response.json();
    if(!response.ok||result.ok!==true)throw new Error(result.error||'No se pudo guardar el precio.');
    return result;
}
async function load(){
    if(loading)return loading;
    const retry=$('retail-pricing-retry');if(retry)retry.disabled=true;
    loading=(async()=>{try{
        const state=await request({operation:'read'});
        if(!Object.prototype.hasOwnProperty.call(state,'percent')||state.revision===undefined)throw new Error('Debes enviar resource: productos, pedidos, clientes o facturas.');
        percent=parsePercent(state.percent);revision=state.revision;
        $('retail-pricing-percent').value=percent??'';$('retail-pricing-percent').disabled=false;$('retail-pricing-save').disabled=false;
        if(retry)retry.hidden=true;
        notify(percent===null?'Todavía no hay porcentaje general. Tus precios actuales se conservan.':`Porcentaje guardado: ${percent} %. Los precios manuales se conservan.`);
        if(!$('product-form')?.dataset.originalVariationId&&!$('prod-precio').value&&percent!==null)$('prod-retail-mode').value='percentage';
        bindMain();refreshControls();decorateInventory();
    }catch(error){
        $('retail-pricing-percent').disabled=true;$('retail-pricing-save').disabled=true;
        if(retry)retry.hidden=false;
        notify(/debes enviar resource|resource: productos, pedidos, clientes o facturas/i.test(error.message)
            ? 'Servidor pendiente de actualizar: la función blyxu-api de Supabase todavía no admite el porcentaje minorista. Actualiza esa función con el código entregado y pulsa Reintentar conexión. Publicar solo los archivos de la página no activa este cálculo.'
            : error.message+' Pulsa Reintentar conexión para volver a comprobarlo.');
    }
    finally{loading=null;if(retry)retry.disabled=false;}})();return loading;
}
function makeSelect(mode){const select=document.createElement('select');select.className='form-control retail-mode';select.setAttribute('aria-label','Cálculo del precio minorista');select.innerHTML='<option value="percentage">Usar porcentaje general</option><option value="manual">Precio manual</option>';select.value=mode;return select;}
function bind(container,price,wholesale,select){
    if(!price||!wholesale||controls.has(price))return;
    const hint=document.createElement('small');hint.className='retail-price-hint';price.after(hint);
    const state={container,price,wholesale,select,hint,manual:price.value};controls.set(price,state);
    const update=()=>{
        const auto=select.value==='percentage';price.readOnly=auto;price.toggleAttribute('data-retail-auto',auto);
        price.setCustomValidity('');
        if(auto){try{const value=calculateRetail(amount(wholesale.value),percent);price.value=value;hint.textContent=`${money(amount(wholesale.value))} + ${percent} % = ${money(value)}`;}
        catch(error){price.value='';hint.textContent=error.message;price.setCustomValidity(error.message);}}
        else hint.textContent='Precio personalizado. No cambia al modificar el porcentaje general.';
    };
    state.update=update;
    select.addEventListener('change',()=>{if(select.value==='manual')price.value=state.manual;else state.manual=price.value;update();window.updateLivePreview?.();});
    price.addEventListener('input',()=>{if(select.value==='manual')state.manual=price.value;});
    wholesale.addEventListener('input',()=>{update();window.updateLivePreview?.();});update();
}
function bindMain(){bind($('product-form'),$('prod-precio'),$('prod-precio-mayorista'),$('prod-retail-mode'));}
function bindVariants(){
    document.querySelectorAll('.var-edit-expanded,[id^="variant-card-"]').forEach(row=>{
        const price=row.querySelector('.ve-precio,.var-precio'),wholesale=row.querySelector('.ve-precio-mayorista,.var-precio-mayor');
        if(!price||controls.has(price))return;
        const id=row.dataset.originalVarid;
        const original=id?inventario.find(p=>getInventoryVariationId(p)===id):null;
        const select=makeSelect(original?retailMode(original):$('prod-retail-mode').value);select.classList.add('var-retail-mode');
        const label=document.createElement('label');label.textContent='Precio minorista';label.append(select);price.before(label);
        bind(row,price,wholesale,select);
    });
}
function refreshControls(){document.querySelectorAll('#prod-precio,.ve-precio,.var-precio').forEach(input=>{const state=controls.get(input);if(!state)return;if(state.select.value==='manual')state.manual=input.value;state.update();});}
function preparePayload(payload){
    const id=String(payload['ID Variacion']||payload['ID Variación']||'');
    let state;
    if(id===$('prod-id')?.value)state=controls.get($('prod-precio'));
    else for(const input of document.querySelectorAll('.ve-id,.var-id'))if(input.value===id){state=controls.get(input.closest('.var-edit-expanded,[id^="variant-card-"]')?.querySelector('.ve-precio,.var-precio'));break;}
    if(state)payload[RETAIL_MODE_KEY]=state.select.value;
    if(payload[RETAIL_MODE_KEY]==='percentage'){
        payload.Precio=calculateRetail(payload['Precio Mayor'],percent);
        for(const alias of ['precio','Precio_Minorista','precio_minorista'])if(alias in payload)payload[alias]=payload.Precio;
    }
    return payload;
}
function edit(product){bindMain();const state=controls.get($('prod-precio'));state.manual=$('prod-precio').value;$('prod-retail-mode').value=retailMode(product);state.update();}
function reset(){const state=controls.get($('prod-precio'));if(!state)return;state.manual='';$('prod-retail-mode').value=percent===null?'manual':'percentage';state.update();}
function decorateInventory(){
    document.querySelectorAll('#inventory-tbody tr').forEach(tr=>{
        const existing=tr.querySelector('.retail-price-control');if(existing){existing.__refreshRetailPrice?.();return;}
        const button=tr.querySelector('[data-inventory-action="edit"],[onclick*="editarProducto("]');
        if(!button)return;
        const match=button.getAttribute('onclick')?.match(/editarProducto\((\d+)\)/);
        const product=match?inventario[Number(match[1])]:getInventoryProductByKey(button.dataset.productKey);if(!product)return;
        const details=document.createElement('details');details.className='retail-price-control';
        const summary=document.createElement('summary');summary.textContent='Precio minorista de esta referencia';details.append(summary);
        const ref=document.createElement('p');ref.textContent=getInventoryVariationId(product);details.append(ref);
        const mode=makeSelect(retailMode(product));details.append(mode);
        const input=document.createElement('input');input.className='form-control';input.inputMode='decimal';input.value=product.Precio??'';input.setAttribute('aria-label','Precio minorista personalizado');details.append(input);
        const hint=document.createElement('p');details.append(hint);
        const preview=()=>{input.hidden=mode.value==='percentage';try{hint.textContent=mode.value==='percentage'?`Precio calculado: ${money(calculateRetail(product.Precio_Mayorista??product['Precio Mayor'],percent))}`:'Solo modifica esta referencia. Las demás se conservan.';}catch(e){hint.textContent=e.message;}};
        details.__refreshRetailPrice=preview;mode.addEventListener('change',preview);preview();
        const save=document.createElement('button');save.type='button';save.className='admin-btn secondary';save.textContent='Guardar precio';details.append(save);
        save.addEventListener('click',async()=>{save.disabled=true;try{
            const result=await request({operation:'product',expectedRevision:revision,id:getInventoryVariationId(product),mode:mode.value,price:input.value.trim()?amount(input.value):''});revision=result.revision;
            clearPublicProductsCache();await cargarInventario({force:true,silent:true});notify('Precio de la referencia actualizado.');
        }catch(e){hint.textContent=e.message;}finally{save.disabled=false;}});
        button.closest('td').append(details);
    });
}
window.BlyxuRetailAdmin={load,edit,reset,preparePayload,decorateInventory,refreshControls};
document.addEventListener('DOMContentLoaded',()=>{
    bindMain();bindVariants();
    $('retail-pricing-retry')?.addEventListener('click',()=>load());
    new MutationObserver(bindVariants).observe($('variants-container'),{childList:true,subtree:true});
    $('retail-pricing-form').addEventListener('submit',async event=>{
        event.preventDefault();const button=$('retail-pricing-save');button.disabled=true;
        try{
            const next=parsePercent($('retail-pricing-percent').value);if(next===null)throw new Error('Escribe el porcentaje.');
            const result=await request({operation:'save',percent:next,expectedRevision:revision});percent=next;revision=result.revision;
            clearPublicProductsCache();await cargarInventario({force:true,silent:true});
            if(!$('product-form')?.dataset.originalVariationId&&!$('prod-precio').value)reset();else refreshControls();
            notify(`Porcentaje ${percent} % guardado. ${result.count} ${result.count===1?'referencia actualizada':'referencias actualizadas'}. Precios manuales conservados.`);
        }catch(e){notify(e.message);}finally{button.disabled=false;}
    });
});
