/* Category removal can preserve products or delete its individual inventory rows. */
(() => {
    const configKey = 'Home_Removed_Category_Defaults_JSON';
    let removedDefaults = new Set();
    let busy = false;
    const categoryOf = product => normalizeInventoryCategoryKey(product.Categoria || product.categoria || '');
    const rowsFor = key => inventario.filter(product => categoryOf(product) === key);
    const allowed = key => key && !['banner', 'sin categoria', 'todos'].includes(key);
    const deleteProducts = () => document.getElementById('inventory-category-operation')?.value === 'delete';
    function confirmCategory(label,rows,deleting,destination) {
        return new Promise(resolve=>{
            const dialog=document.createElement('dialog');dialog.className='category-confirm-dialog';dialog.setAttribute('aria-label',deleting?'Verificar eliminación de categoría':'Verificar traslado de productos');
            dialog.innerHTML='<form method="dialog"><span class="drive-eyebrow">VERIFICAR OPERACIÓN</span><h3></h3><p class="category-confirm-impact"></p><p>Los pedidos, facturas y archivos de Drive se conservarán.</p><label>Escribe el nombre de la categoría para confirmar<strong></strong><input class="form-control" autocomplete="off" aria-label="Nombre de categoría para confirmar"></label><div class="category-confirm-actions"><button value="cancel" class="admin-btn secondary">Cancelar</button><button value="confirm" class="admin-btn danger" disabled>Confirmar</button></div></form>';
            const count=new Set(rows.map(row=>getInventoryMotherId(row)||getInventoryVariationId(row))).size;
            dialog.querySelector('h3').textContent=deleting?'Eliminar categoría y productos':'Trasladar productos y quitar categoría';
            dialog.querySelector('.category-confirm-impact').textContent=deleting?`Se eliminarán ${count} ${count===1?'producto':'productos'} y ${rows.length} registros de variantes de «${label}». Esta acción no se puede deshacer.`:`Se trasladarán ${count} ${count===1?'producto':'productos'} y ${rows.length} registros de variantes a «${destination}».`;
            dialog.querySelector('strong').textContent=label;
            const input=dialog.querySelector('input'),confirm=dialog.querySelector('[value="confirm"]');
            input.addEventListener('input',()=>{confirm.disabled=input.value!==label;});
            dialog.querySelector('form').addEventListener('submit',event=>{if(event.submitter===confirm&&input.value!==label)event.preventDefault();});
            dialog.addEventListener('close',()=>{const accepted=dialog.returnValue==='confirm'&&input.value===label;dialog.remove();resolve(accepted);},{once:true});
            document.body.appendChild(dialog);dialog.showModal();input.focus();
        });
    }

    window.isInventoryDefaultCategoryRemoved = key => removedDefaults.has(key);
    window.renderInventoryCategoryManager = () => {
        const select = document.getElementById('inventory-manage-category');
        const target = document.getElementById('inventory-category-destination');
        if (!select || !target || busy) return;
        const selected = select.value;
        const groups = getInventoryCategoryGroups().filter(group => allowed(group.key));
        select.innerHTML = '<option value="">Selecciona una categoría</option>' + groups.map(group =>
            `<option value="${escapeHtml(group.key)}">${escapeHtml(group.label)} (${rowsFor(group.key).length} registros)</option>`).join('');
        select.value = groups.some(group => group.key === selected) ? selected : '';
        updateDestination();
    };
    function updateDestination() {
        const source = document.getElementById('inventory-manage-category');
        const destination = document.getElementById('inventory-category-destination');
        if (!source || !destination) return;
        const selected = destination.value;
        const groups = getInventoryCategoryGroups().filter(group => allowed(group.key) && group.key !== source.value);
        destination.innerHTML = '<option value="">Sin categoría</option>' + groups.map(group =>
            `<option value="${escapeHtml(group.key)}">${escapeHtml(group.label)}</option>`).join('');
        destination.value = groups.some(group => group.key === selected) ? selected : '';
        const rows = rowsFor(source.value);
        const summary = document.getElementById('inventory-category-impact');
        summary.textContent = source.value && deleteProducts()
            ? `${rows.length} registros de productos y variantes se eliminarán permanentemente. Las facturas y pedidos existentes se conservarán.`
            : source.value ? (rows.length
            ? `${rows.length} registros de productos y variantes se moverán. Sus precios, fotos y existencias se conservarán.`
            : 'Esta categoría no tiene productos. Se quitará de las sugerencias.') : 'Elige la categoría que quieres quitar.';
        destination.disabled = !rows.length || deleteProducts();
        document.getElementById('inventory-delete-category').textContent = deleteProducts() ? 'Eliminar categoría y productos' : 'Eliminar categoría';
        document.getElementById('inventory-delete-category').disabled = !source.value;
    }
    async function removeCategory(event) {
        event.preventDefault();
        if (busy) return;
        const source = document.getElementById('inventory-manage-category').value;
        const target = document.getElementById('inventory-category-destination').value;
        const deleting = deleteProducts();
        if (!allowed(source) || (!deleting && source === target)) return;
        if (!secureAdminCredential) {showToast('Inicia sesión como administrador para gestionar categorías.', 'error'); return;}
        // Refresh before computing the impact so stale cached rows are not silently missed.
        busy = true;
        const form = event.currentTarget;
        const controls = [...form.querySelectorAll('button,input,select')];
        controls.forEach(control => {control.disabled = true;});
        const status = document.getElementById('inventory-category-status');
        let moved = 0;
        try {
            status.textContent = 'Verificando inventario actualizado…';
            await cargarInventario({force:true,silent:true});
            const rows = rowsFor(source);
            const groups = getInventoryCategoryGroups();
            const sourceLabel = groups.find(group=>group.key===source)?.label || source;
            const destinationLabel = target ? groups.find(group=>group.key===target)?.label : 'Sin categoría';
            if (!deleting && !destinationLabel) throw new Error('La categoría de destino cambió. Vuelve a seleccionarla.');
            const ids = rows.map(getInventoryVariationId);
            const allIds = inventario.map(getInventoryVariationId);
            if (ids.some(id=>!id || allIds.filter(value=>value===id).length!==1)) throw new Error('Hay referencias vacías o repetidas. Corrígelas antes de modificar esta categoría.');
            if (!await confirmCategory(sourceLabel,rows,deleting,destinationLabel)) {status.textContent = 'Operación cancelada.'; return;}
            status.textContent=deleting?'Eliminando categoría e inventario en una sola operación…':'Trasladando productos en una sola operación…';
            const response=await fetch(GOOGLE_SHEET_API,{method:'POST',body:JSON.stringify({action:'categorybatch',adminCredential:secureAdminCredential,category:source,categoryLabel:sourceLabel,confirmation:sourceLabel,mode:deleting?'delete':'move',destination:destinationLabel,expectedIds:ids})});
            const result=await response.json();
            if(!result.ok)throw new Error(result.error || 'No se pudo confirmar la operación.');
            moved=result.variants;
            removedDefaults=new Set(result.removedDefaults);
            updateSiteConfigCacheForAdmin(configKey,JSON.stringify([...removedDefaults]));siteConfigPromise=null;
            clearPublicProductsCache();
            await cargarInventario({force:true,silent:true});
            if (rowsFor(source).length) throw new Error('La categoría recibió nuevos productos durante el cambio. Revisa los registros restantes.');
            status.textContent = deleting ? `Categoría eliminada con ${result.products} productos y ${moved} registros de variantes.` : `Categoría quitada. ${result.products} productos y ${moved} registros trasladados a ${destinationLabel}.`;
            showToast(deleting ? 'Categoría y productos eliminados.' : 'Categoría quitada; productos conservados.', 'success');
        } catch(error) {
            status.textContent = `${moved ? `${moved} registros ya fueron ${deleting ? 'eliminados' : 'movidos'}. ` : ''}${error.message} Puedes revisar el inventario y reintentar.`;
            clearPublicProductsCache();
            await cargarInventario({force:true,silent:true}).catch(()=>{});
        } finally {
            busy = false;
            controls.forEach(control=>{control.disabled=false;});
            updateCategoryOptions();
        }
    }
    document.addEventListener('DOMContentLoaded', async () => {
        document.getElementById('inventory-clear-search')?.addEventListener('click',()=>{
            document.getElementById('admin-inventory-search').value='';
            document.getElementById('admin-inventory-category-filter').value='todos';
            adminInventorySearchQuery='';adminInventoryCategoryFilter='todos';renderInventoryInBatches();
        });
        document.getElementById('inventory-category-manager-form')?.addEventListener('submit', removeCategory);
        document.getElementById('inventory-manage-category')?.addEventListener('change', updateDestination);
        document.getElementById('inventory-category-operation')?.addEventListener('change', updateDestination);
        const config = await loadSiteConfigForAdmin();
        try {const list=JSON.parse(config[configKey] || '[]'); if(Array.isArray(list)) removedDefaults=new Set(list.map(normalizeInventoryCategoryKey));} catch (_) {}
        updateCategoryOptions();
    });
})();
