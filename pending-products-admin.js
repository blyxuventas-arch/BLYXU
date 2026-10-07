/* Drafts use private admin configuration, never the public product feed. */
(() => {
    'use strict';
    const prefix = 'Admin_Draft_Product_';
    let drafts = [];
    async function write(key, value) {
        if (!secureAdminCredential) throw new Error('Inicia sesión como administrador.');
        const response = await fetch(GOOGLE_SHEET_API, {method:'POST',body:JSON.stringify({action:'set_config',Clave:key,Valor:JSON.stringify(value)})});
        const result = await response.json();
        if (!result.ok || result.status !== 'success') throw new Error('No se confirmó el guardado del pendiente.');
        siteConfigPromise = null;
    }
    async function refresh() {
        const list = document.getElementById('pending-products-list');
        if (!list) return;
        list.textContent = 'Cargando pendientes…';
        try {
            if (!secureAdminCredential) throw new Error('Inicia sesión y pulsa Actualizar pendientes.');
            const response = await fetch(GOOGLE_SHEET_API + '?action=get_config', {cache:'no-store'});
            const result = await response.json();
            if (result.status !== 'success') throw new Error('No se pudieron consultar los pendientes.');
            drafts = Object.entries(result.config || {}).filter(([key]) => key.startsWith(prefix)).flatMap(([key,value]) => {
                try { const draft = JSON.parse(value); return draft?.reference && draft?.fields ? [{key,...draft}] : []; } catch (_) { return []; }
            });
            list.replaceChildren();
            if (!drafts.length) list.textContent = 'No hay productos pendientes por completar.';
            for (const draft of drafts) {
                const row = document.createElement('div'); row.className = 'pending-product-row';
                const text = document.createElement('span'); text.textContent = `${draft.fields['prod-nombre'] || 'Sin nombre'} · ${draft.reference} · Pendiente por completar`;
                const button = document.createElement('button'); button.type = 'button'; button.className = 'admin-btn secondary'; button.textContent = 'Completar producto';
                button.onclick = () => {
                    resetProductForm();
                    isEditingProduct = false;
                    for (const [id,value] of Object.entries(draft.fields)) {
                        const input = document.getElementById(id);
                        if (id.startsWith('prod-') && input && input.type !== 'file') input.value = value;
                    }
                    document.getElementById('product-form').dataset.pendingKey = draft.key;
                    document.getElementById('prod-id').dataset.scannedReference = '1';
                    switchDashboardView('products', 'Completar producto pendiente');
                    updateLivePreview();
                    showToast('Completa los datos y pulsa Guardar producto y variantes para publicarlo.', 'success');
                };
                row.append(text,button); list.append(row);
            }
        } catch (error) { list.textContent = error.message; }
    }
    async function save(button) {
        const form = document.getElementById('product-form');
        if (isEditingProduct) { showToast('Este producto ya existe. Guarda sus cambios con el botón principal.', 'error'); return; }
        const reference = getInputValue('prod-barcode') || getInputValue('prod-sku') || getInputValue('prod-id');
        if (!reference) { showToast('Escanea o escribe primero la referencia.', 'error'); return; }
        button.disabled = true;
        try {
            ensureProductHierarchyIds();
            const fields = {};
            form.querySelectorAll('input[id],select[id],textarea[id]').forEach(input => {
                if (input.id.startsWith('prod-') && input.type !== 'file') fields[input.id] = input.value;
            });
            const key = form.dataset.pendingKey || prefix + encodeURIComponent(getInputValue('prod-id-producto'));
            await write(key,{reference,fields,updatedAt:new Date().toISOString()});
            resetProductForm();
            showToast('Pendiente guardado. Puedes completarlo desde el PC en Ver inventario.', 'success');
        } catch (error) { showToast(error.message, 'error'); }
        finally { button.disabled = false; }
    }
    window.BlyxuPendingProducts = {complete:async key => { if (key?.startsWith(prefix)) await write(key,null); },refresh};
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('btn-save-pending-product')?.addEventListener('click', event => save(event.currentTarget));
        document.getElementById('pending-products-refresh')?.addEventListener('click',refresh);
        document.getElementById('pending-products-panel')?.addEventListener('toggle',event => { if (event.target.open) refresh(); });
    });
})();
