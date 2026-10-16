// Progressive controls for creation and inventory editing.
(() => {
    let editing = false;
    const features = [];
    const get = id => document.getElementById(id);
    function switchGroup(host, nodes, label, id, infer) {
        nodes = nodes.filter(Boolean);
        if (!host || !nodes.length) return null;
        const shell = document.createElement('section'); shell.className='entry-feature';
        const heading=document.createElement('label'); heading.className='entry-feature-toggle';
        const toggle=document.createElement('input');toggle.type='checkbox';toggle.role='switch';if(id)toggle.id=id;
        const title=document.createElement('span');title.textContent=label;heading.append(toggle,title);
        const body=document.createElement('div');body.className='entry-feature-body admin-form-grid';
        nodes[0].before(shell);shell.append(heading,body);nodes.forEach(node=>body.append(node));
        const sync=()=>{heading.hidden=false;body.hidden=!toggle.checked;body.querySelectorAll('input,select,textarea,button').forEach(field=>field.disabled=!toggle.checked);window.updateLivePreview?.();};
        toggle.checked=!!infer();toggle.addEventListener('change',sync);
        const feature={host,shell,toggle,sync,infer};features.push(feature);sync();return feature;
    }
    function main() {
        const form=get('product-form');if(!form || form.dataset.progressiveReady)return;
        form.dataset.progressiveReady='1';
        const group=id=>get(id)?.closest('.form-group');
        switchGroup(form,[group('prod-color')],'Diferenciar por color','prod-use-color',()=>!!get('prod-color')?.value);
        switchGroup(form,[group('prod-estilo')],'Diferenciar por estilo','prod-use-style',()=>!!get('prod-estilo')?.value);
        switchGroup(form,[group('prod-tamano'),group('prod-size-kind'),get('prod-textile-size-fields'),get('prod-physical-size-fields')],'Diferenciar por tamaño o medida','prod-use-size',()=>!!(get('prod-tamano')?.value||get('prod-size-kind')?.value));
        switchGroup(form,[form.querySelector('.angle-gallery-manager')],'Añadir fotos de ángulos','prod-use-gallery',()=>!!get('prod-galeria')?.value);
        const styleBody=get('prod-use-style')?.closest('.entry-feature')?.querySelector('.entry-feature-body');
        if(styleBody){const label=document.createElement('label');label.className='entry-feature-toggle style-photo-option';label.innerHTML='<input type="checkbox" role="switch" id="prod-style-photo"><span>Mostrar foto en los botones de variantes <small>Apagado: solo el texto del estilo.</small></span>';styleBody.append(label);label.querySelector('input').addEventListener('change',()=>window.updateLivePreview?.());}
        form.querySelectorAll('#prod-precio,#prod-precio-mayorista').forEach(field=>{field.required=false;field.placeholder='0 · precio pendiente';});
    }
    function decorateVariant(card) {
        if(!card||card.dataset.progressiveReady)return;
        card.dataset.progressiveReady='1';
        const group=selector=>card.querySelector(selector)?.closest('.form-group');
        switchGroup(card,[group('.var-color')],'Diferenciar por color',null,()=>!!card.querySelector('.var-color')?.value);
        switchGroup(card,[group('.var-estilo')],'Diferenciar por estilo',null,()=>!!card.querySelector('.var-estilo')?.value);
        switchGroup(card,[group('.var-size-mode')],'Diferenciar por tamaño o medida',null,()=>!!card.querySelector('.var-tamano')?.value);
    }
    function decorateExisting(card) {
        if(!card || card.dataset.progressiveReady)return;
        card.dataset.progressiveReady='1';
        const group=selector=>card.querySelector(selector)?.parentElement;
        switchGroup(card,[group('.ve-color')],'Diferenciar por color',null,()=>!!card.querySelector('.ve-color')?.value);
        const style=switchGroup(card,[group('.ve-estilo')],'Diferenciar por estilo',null,()=>!!card.querySelector('.ve-estilo')?.value);
        switchGroup(card,[group('.ve-tamano'),card.querySelector('.ve-size-kind')?.closest('details')],'Diferenciar por tamaño o medida',null,()=>!!(card.querySelector('.ve-tamano')?.value||card.querySelector('.ve-size-kind')?.value));
        if(style){const label=document.createElement('label');label.className='entry-feature-toggle';label.innerHTML='<input type="checkbox" role="switch" class="ve-style-photo"><span>Mostrar foto en las opciones</span>';style.shell.querySelector('.entry-feature-body').append(label);label.querySelector('input').checked=card.dataset.variantPhoto==='SI';}
    }
    function loadProduct(product) {
        hydrate();const photo=get('prod-style-photo');if(photo)photo.checked=['si','sí','true','1'].includes(String(product?.['Mostrar Foto Variante']||'').toLowerCase());
    }
    function refresh(isEditing=false) {
        for(let i=features.length-1;i>=0;i--)if(!features[i].host.isConnected)features.splice(i,1);
        editing=isEditing;main();
        get('product-form')?.classList.add('entry-create-mode');
        features.forEach(feature=>{feature.toggle.checked=!!feature.infer();feature.sync();});
        const photo=get('prod-style-photo');if(photo){photo.closest('label').hidden=false;photo.checked=false;}
        const title=document.querySelector('.main-product-fold>summary>span:last-of-type');
        if(title)title.innerHTML=(editing?'Variable seleccionada':'Variable inicial V01')+'<small>Referencia, stock, características e imagen inicial</small>';
    }
    function hydrate(){features.filter(f=>f.host.isConnected).forEach(f=>{f.toggle.checked=!!f.infer();f.sync();});}
    function preparePayload(payload) {
        const id=String(payload['ID Variacion']||payload['ID Variación']||payload.idVariacion||'');
        const card=Array.from(document.querySelectorAll('#variants-container .admin-panel,#variants-container .variant-edit-card')).find(node=>node.querySelector('.var-id,.ve-id')?.value===id);
        if (!card && id !== String(get('prod-id')?.value || '')) return payload;
        const host=card||get('product-form');
        const owned=features.filter(f=>f.host===host);
        for(const feature of owned){
            if(feature.toggle.checked)continue;
            if(feature.shell.querySelector('.var-color,.ve-color,#prod-color'))payload.Color='';
            if(feature.shell.querySelector('.var-estilo,.ve-estilo,#prod-estilo'))payload.Estilo='';
            if(feature.shell.querySelector('.var-size-mode,.ve-size-kind,#prod-size-kind'))for(const key of ['Tamano','Talla','Tamaño','Tipo Medida','TipoMedida','Unidad Medida','UnidadMedida','Ancho','Largo','Fondo','Radio','Capacidad','Talla Textil','TallaTextil'])payload[key]='';
        }
        if((!card || card.querySelector('.var-id')) && !get('prod-use-gallery')?.checked){payload['Galeria JSON']='';payload['Galería JSON']='';}
        payload['Mostrar Foto Variante']=(card?.querySelector('.ve-style-photo') || get('prod-style-photo'))?.checked?'SI':'NO';
        return payload;
    }
    window.BlyxuProductEntryUI={refresh,decorateVariant,decorateExisting,preparePayload,hydrate,loadProduct};
    document.addEventListener('DOMContentLoaded',()=>refresh(false));
})();
