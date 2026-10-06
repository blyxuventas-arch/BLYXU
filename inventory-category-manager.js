/* Categories are product labels. Removing a label preserves each product. */
(() => {
    const configKey = 'Home_Removed_Category_Defaults_JSON';
    let removedDefaults = new Set();
    let busy = false;
    const categoryOf = product => normalizeInventoryCategoryKey(product.Categoria || product.categoria || '');
    const rowsFor = key => inventario.filter(product => categoryOf(product) === key);
    const allowed = key => key && !['banner', 'sin categoria', 'todos'].includes(key);

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
        summary.textContent = source.value ? (rows.length
            ? `${rows.length} registros de productos y variantes se moverán. Sus precios, fotos y existencias se conservarán.`
            : 'Esta categoría no tiene productos. Se quitará de las sugerencias.') : 'Elige la categoría que quieres quitar.';
        destination.disabled = !rows.length;
        document.getElementById('inventory-delete-category').disabled = !source.value;
    }
    async function saveRemovedDefaults(next) {
        const value = JSON.stringify([...next]);
        const response = await fetch(GOOGLE_SHEET_API, {method:'POST', body:JSON.stringify({action:'set_config',Clave:configKey,Valor:value})});
        const result = await response.json();
        if (!(result.ok || result.status === 'success')) throw new Error(result.error || 'No se pudo guardar la categoría.');
        removedDefaults = next;
        updateSiteConfigCacheForAdmin(configKey, value);
        siteConfigPromise = null;
    }
    async function removeCategory(event) {
        event.preventDefault();
        if (busy) return;
        const source = document.getElementById('inventory-manage-category').value;
        const target = document.getElementById('inventory-category-destination').value;
        if (!allowed(source) || source === target) return;
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
            if (!destinationLabel) throw new Error('La categoría de destino cambió. Vuelve a seleccionarla.');
            const ids = rows.map(getInventoryVariationId);
            const allIds = inventario.map(getInventoryVariationId);
            if (ids.some(id=>!id || allIds.filter(value=>value===id).length!==1)) throw new Error('Hay referencias vacías o repetidas. Corrígelas antes de mover esta categoría.');
            if (!window.confirm(`¿Quitar «${sourceLabel}»?\n${rows.length} registros pasarán a «${destinationLabel}».\nNo se eliminarán productos ni variantes.`)) {status.textContent = 'Operación cancelada.'; return;}
            for (let index=0;index<rows.length;index++) {
                status.textContent = `Moviendo registros: ${index+1} de ${rows.length}…`;
                const response = await fetch(GOOGLE_SHEET_API,{method:'POST',body:JSON.stringify({resource:'productos',action:'editar',id:ids[index],data:{Categoria:destinationLabel,'Categoría':destinationLabel}})});
                const result = await response.json();
                if (!(result.ok || result.status === 'success')) throw new Error(result.error || 'No se pudo mover un producto.');
                rows[index].Categoria = destinationLabel;
                rows[index].categoria = destinationLabel;
                moved++;
            }
            await saveRemovedDefaults(new Set([...removedDefaults,source]));
            clearPublicProductsCache();
            await cargarInventario({force:true,silent:true});
            if (rowsFor(source).length) throw new Error('La categoría recibió nuevos productos durante el cambio. Revisa los registros restantes.');
            status.textContent = `Categoría quitada. ${moved} registros movidos a ${destinationLabel}.`;
            showToast('Categoría quitada; productos conservados.', 'success');
        } catch(error) {
            status.textContent = `${moved ? `${moved} registros ya fueron movidos. ` : ''}${error.message} Puedes revisar el inventario y reintentar.`;
            clearPublicProductsCache();
            await cargarInventario({force:true,silent:true}).catch(()=>{});
        } finally {
            busy = false;
            controls.forEach(control=>{control.disabled=false;});
            updateCategoryOptions();
        }
    }
    document.addEventListener('DOMContentLoaded', async () => {
        document.getElementById('inventory-category-manager-form')?.addEventListener('submit', removeCategory);
        document.getElementById('inventory-manage-category')?.addEventListener('change', updateDestination);
        const config = await loadSiteConfigForAdmin();
        try {const list=JSON.parse(config[configKey] || '[]'); if(Array.isArray(list)) removedDefaults=new Set(list.map(normalizeInventoryCategoryKey));} catch (_) {}
        updateCategoryOptions();
    });
})();
