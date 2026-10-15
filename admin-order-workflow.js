(() => {
    let state=null, busy=false, sequence=0;
    const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const money=n=>'$'+Number(n||0).toLocaleString('es-CO');
    async function request(body){const response=await fetch(GOOGLE_SHEET_API,{method:'POST',body:JSON.stringify({action:'orderworkflow',...body})});const result=await response.json();if(!response.ok||result.ok!==true)throw new Error(result.error||'No se pudo actualizar la cotización.');return result;}
    const idOf=item=>item.idVariacion||item['ID Variación']||item.id||item.sku||'';
    function close(){if(busy)return;sequence++;document.getElementById('admin-quotation-modal')?.remove();state=null;}
    function items(){return [...document.querySelectorAll('#admin-quotation-modal [data-quote-line]')].map(row=>({id:row.dataset.quoteLine,cantidad:Number(row.querySelector('[data-qty]').value),precio:row.querySelector('[data-price]').value.trim()}));}
    function updateTotal(){const total=items().reduce((sum,item)=>sum+Number(item.precio)*item.cantidad,0);document.getElementById('quote-total').textContent=money(total);}
    async function save(operation){
        const modal=document.getElementById('admin-quotation-modal'),status=modal.querySelector('[role="status"]');
        if(busy)return;busy=true;
        modal.querySelectorAll('button').forEach(b=>b.disabled=true);
        try{
            const result=await request({operation,id:state.record['ID Pedido'],items:items(),accepted:modal.querySelector('#quote-client-accepted').checked,expectedRevision:state.revision,productsRevision:state.productsRevision});
            busy=false;close();await cargarPedidos({force:true,throwOnError:true});
            showToast(operation==='convert'?'Cotización convertida en pedido. Conserva su referencia.':'Cotización actualizada. El inventario se conserva.','success');
        }catch(error){if(status.isConnected)status.textContent=error.message;else showToast('Solicitud guardada; actualiza Pedidos para ver el resultado.','warning');}
        finally{busy=false;modal.querySelectorAll('button').forEach(b=>b.disabled=false);modal.querySelector('[data-save="convert"]').disabled=!modal.querySelector('#quote-client-accepted').checked;}
    }
    async function open(index){
        const order=window.pedidosList[index];if(!order||busy)return;const current=++sequence;
        try{
            const result=await request({operation:'read',id:getOrderIdValue(order)});if(current!==sequence)return;state=result;
            document.getElementById('admin-quotation-modal')?.remove();
            const modal=document.createElement('div');modal.id='admin-quotation-modal';modal.className='modal open';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','quote-editor-title');
            modal.innerHTML=`<div class="modal-card" style="max-width:900px;max-height:90dvh;overflow:auto"><div style="display:flex;gap:16px;align-items:center;justify-content:space-between"><h2 id="quote-editor-title">Revisar cotización</h2><button class="admin-btn secondary" type="button" data-close>Cerrar</button></div>
                <p>Referencia: <strong>${escape(state.record['ID Pedido'])}</strong> · ${escape(state.record['Nombre Cliente'])}</p>
                <p>Ajusta cantidades y precios. Guardar la cotización no confirma una compra ni descuenta inventario.</p>
                <div class="quotation-lines">${state.items.map(item=>`<div data-quote-line="${escape(idOf(item))}" style="display:grid;grid-template-columns:minmax(140px,1fr) 90px 140px;gap:12px;align-items:end;padding:14px 0;border-bottom:1px solid var(--border,#493356)"><div><strong>${escape(item.nombre||item.Nombre||idOf(item))}</strong><small style="display:block">${escape(idOf(item))} · ${escape(item.opcion||'')}</small></div><label>Cantidad<input class="form-control" type="number" min="1" max="1000" data-qty value="${escape(item.cantidad||1)}"></label><label>Precio unitario<input class="form-control" type="number" min="0" step="1" data-price value="${escape(item.precio??0)}"></label></div>`).join('')}</div>
                <p style="font-size:18px">Total: <strong id="quote-total"></strong></p>
                <label style="display:flex;gap:10px;align-items:center;padding:14px 0"><input type="checkbox" id="quote-client-accepted">El cliente aceptó los productos, cantidades y precios de esta cotización.</label>
                <p role="status" aria-live="polite"></p><div style="display:flex;gap:12px;flex-wrap:wrap"><button class="admin-btn secondary" type="button" data-save="quote">Guardar cotización</button><button class="admin-btn" type="button" data-save="convert" disabled>Convertir en pedido</button></div>
                <p>La conversión conserva la referencia y revisa las existencias actuales. La factura y el pago se gestionan después.</p></div>`;
            modal.querySelector('[data-close]').onclick=close;
            modal.querySelectorAll('[data-save]').forEach(button=>button.onclick=()=>save(button.dataset.save));
            modal.querySelector('#quote-client-accepted').onchange=event=>{modal.querySelector('[data-save="convert"]').disabled=!event.target.checked;};
            modal.addEventListener('input',updateTotal);
            modal.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const all=[...modal.querySelectorAll('button:not(:disabled),input')];const first=all[0],last=all.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
            document.body.append(modal);updateTotal();modal.querySelector('[data-close]').focus();
        }catch(error){showToast(error.message,'error');}
    }
    window.BlyxuOrderWorkflow={open,close};
})();
