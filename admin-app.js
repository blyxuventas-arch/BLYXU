const GOOGLE_SHEET_API = 'https://script.google.com/macros/s/AKfycbx7ofcNdOvxv07cvLZkSemb2mTyBlzs3a7VHbTk7QNIRitLjWQPFjnYl2PnEfEDGHYo3w/exec';
const GOOGLE_SHEET_PRODUCTS_URL = `${GOOGLE_SHEET_API}?resource=productos`;
let inventario = [];
const RETAIL_PRICE_VISIBILITY_KEY = 'blyxu_show_retail_prices';
const RETAIL_PRICE_CONFIG_KEY = 'Mostrar_Precios_Minorista';
const CONTACT_CONFIG_FIELDS = [
    ['Contacto_Direccion', 'contact-config-address'],
    ['Contacto_Ciudad', 'contact-config-city'],
    ['Contacto_Dias', 'contact-config-days'],
    ['Contacto_Horarios', 'contact-config-hours'],
    ['Contacto_WhatsApp', 'contact-config-whatsapp'],
    ['Contacto_Instagram', 'contact-config-instagram'],
    ['Contacto_Email', 'contact-config-email'],
    ['Contacto_Mapa_URL', 'contact-config-map'],
    ['Contacto_Nota', 'contact-config-note'],
    ['Contacto_Titulo_Atencion', 'contact-config-service-title'],
    ['Contacto_Detalle_Atencion', 'contact-config-service-detail']
];
const INVOICE_CONFIG_FIELDS = [
    ['Factura_Logo', 'inv-config-logo'],
    ['Factura_Empresa', 'inv-config-empresa'],
    ['Factura_NIT', 'inv-config-nit'],
    ['Factura_Direccion', 'inv-config-direccion'],
    ['Factura_Telefono', 'inv-config-telefono'],
    ['Factura_Email', 'inv-config-email']
];
const INVENTORY_CACHE_KEY = 'blyxu_admin_inventory_cache_v2';
const INVENTORY_BATCH_SIZE = 25;
const MAX_CAROUSEL_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_UPLOAD_MAX_EDGE = 1800;
const IMAGE_UPLOAD_QUALITY = 0.82;
let inventoryRenderedRows = 0;
let inventoryRenderToken = 0;
let inventoryLoadMoreObserver = null;
let filteredInventario = [];
let adminInventorySearchQuery = '';
let isEditingProduct = false;
let inventoryFetchToken = 0;

function updateLivePreview() {
    const nombre = document.getElementById('prod-nombre')?.value || 'Nombre del Producto';
    const categoria = document.getElementById('prod-categoria')?.value || 'CATEGORÍA';
    const precio = document.getElementById('prod-precio')?.value || '0';
    const precioMayorista = document.getElementById('prod-precio-mayorista')?.value || '';
    const imagenUrl = document.getElementById('prod-imagen')?.value || 'Logo2.png';
    const estado = document.getElementById('prod-estado')?.value || 'Activo';
    var idVar = document.getElementById('prod-id')?.value || '';
    var idProd = document.getElementById('prod-id-producto')?.value || '';

    var idBadge = document.getElementById('preview-id-badge');
    if (!idBadge) {
        idBadge = document.getElementById('preview-badge-el');
    }
    if (idBadge && (idProd || idVar)) {
        var idText = idProd ? 'ID: ' + idProd : '';
        if (idVar && idVar !== idProd) idText += ' | VAR: ' + idVar;
        if (idText) {
            idBadge.textContent = idText;
            idBadge.style.display = 'block';
            idBadge.style.background = 'rgba(0,0,0,0.6)';
            idBadge.style.fontSize = '9px';
            idBadge.style.right = '10px';
            idBadge.style.left = 'auto';
        }
    }

    const titleEl = document.getElementById('preview-title-el');
    const catEl = document.getElementById('preview-cat-el');
    if (titleEl) titleEl.textContent = nombre;
    if (catEl) catEl.textContent = categoria;

    const parsedPrecio = parseAmount(precio);
    const parsedMayorista = parseAmount(precioMayorista);

    let priceHtml = '';
    if (parsedPrecio > 0) {
        priceHtml = `$${parsedPrecio.toLocaleString('es-CO')}`;
        if (parsedMayorista > 0) {
            priceHtml += ` <span style="font-size:11px; font-weight:600; color:var(--text-muted); margin-left:8px; border: 1px solid rgba(255,255,255,0.1); padding: 2px 6px; border-radius:4px;">Por mayor: $${parsedMayorista.toLocaleString('es-CO')}</span>`;
        }
    } else {
        priceHtml = '$0';
    }
    const priceEl = document.getElementById('preview-price-el');
    if (priceEl) priceEl.innerHTML = priceHtml;

    const imgEl = document.getElementById('preview-img-el');
    if (imgEl) {
        const currentSrc = imgEl.getAttribute('src');
        if (currentSrc !== imagenUrl) {
            // Evitar parpadeo: solo actualizar si el origen realmente cambió
            imgEl.style.transition = 'opacity 0.2s';
            imgEl.style.opacity = '0.4';

            loadImageWithRetry(imagenUrl, 3, 700).then(() => {
                const localPreviewSrc = imgEl.dataset.localPreviewSrc;
                imgEl.src = imagenUrl;
                imgEl.style.opacity = '1';
                delete imgEl.dataset.localPreviewSrc;
                if (localPreviewSrc) URL.revokeObjectURL(localPreviewSrc);
            }).catch(() => {
                if (imgEl.dataset.localPreviewSrc) {
                    imgEl.src = imgEl.dataset.localPreviewSrc;
                    imgEl.style.opacity = '0.85';
                    return;
                }
                imgEl.src = 'hero_necklace.png';
                imgEl.style.opacity = '0.3';
            });
        }
    }

    const badgeEl = document.getElementById('preview-badge-el');
    if (badgeEl) {
        if (estado === 'Agotado') {
            badgeEl.textContent = 'AGOTADO';
            badgeEl.style.display = 'block';
            badgeEl.style.background = 'rgba(239,68,68,0.85)';
        } else if (estado === 'Inactivo') {
            badgeEl.textContent = 'OCULTO';
            badgeEl.style.display = 'block';
            badgeEl.style.background = 'rgba(100,100,100,0.85)';
        } else {
            badgeEl.style.display = 'none';
        }
    }
}

function loadImageWithRetry(src, attempts = 2, delayMs = 500) {
    return new Promise((resolve, reject) => {
        if (!src) {
            reject(new Error('Imagen vacia'));
            return;
        }

        let attempt = 0;
        const tryLoad = () => {
            const tempImg = new Image();
            tempImg.onload = () => resolve(src);
            tempImg.onerror = () => {
                attempt += 1;
                if (attempt >= attempts) {
                    reject(new Error('No se pudo cargar la imagen'));
                    return;
                }
                setTimeout(tryLoad, delayMs);
            };
            tempImg.src = src;
        };

        tryLoad();
    });
}

function getProductField(product, fields, fallback = '') {
    const names = Array.isArray(fields) ? fields : [fields];

    // Exact match first
    for (const name of names) {
        if (product && product[name] !== undefined && product[name] !== null && product[name] !== '') {
            return product[name];
        }
    }

    // Fuzzy match for broken keys (spaces, accents, etc.)
    if (product) {
        for (const key in product) {
            const cleanKey = key.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            for (const name of names) {
                const cleanName = name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                if (cleanKey === cleanName && product[key] !== undefined && product[key] !== null && product[key] !== '') {
                    return product[key];
                }
            }
        }
    }

    return fallback;
}

function normalizeImageUrl(value) {
    if (!value) return '';

    if (Array.isArray(value)) {
        return normalizeImageUrl(value[0]);
    }

    if (typeof value === 'object') {
        return normalizeImageUrl(value.url || value.src || value.imagen || value.image || '');
    }

    const raw = String(value).split('\n')[0].trim();
    if (!raw) return '';

    const firstUrl = raw.includes(',http') ? raw.split(',http')[0].trim() : raw;
    const driveMatch = firstUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/) || firstUrl.match(/[?&]id=([^&]+)/);

    if (firstUrl.includes('drive.google.com') && driveMatch && driveMatch[1]) {
        return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveMatch[1])}&sz=w300`;
    }

    if (firstUrl.startsWith('//')) return `https:${firstUrl}`;

    return firstUrl;
}

function normalizeGoogleProduct(product) {
    return {
        ...product,
        ID: getProductField(product, ['ID Variacion', 'ID Variación', 'ID', 'id'], ''),
        idVariacion: getProductField(product, ['ID Variacion', 'ID Variación', 'ID', 'id'], ''),
        idProducto: getProductField(product, ['ID Producto', 'ID_Producto', 'idProducto'], ''),
        Nombre: getProductField(product, ['Nombre del Producto', 'Nombre', 'Producto'], ''),
        Categoria: getProductField(product, ['Categoría', 'Categoria'], ''),
        Precio: getProductField(product, ['Precio'], 0),
        Precio_Mayorista: getProductField(product, ['Precio Mayor', 'Precio Mayorista', 'Precio_Mayorista'], 0),
        Catalogo: getProductField(product, ['Catalogo', 'Catálogo', 'Estilo'], 'Ambos'),
        Stock: getProductField(product, ['Cantidad', 'Stock'], 0),
        Imagen: normalizeImageUrl(getProductField(product, ['Imagen Principal', 'Imagen'], '')),
        Color: getProductField(product, ['Color'], ''),
        Stock_Inicial: getProductField(product, ['Stock Inicial', 'Stock_Inicial'], 0),
        Galeria: getProductField(product, ['Galeria JSON', 'Galería JSON', 'Galeria'], ''),
        Descripcion: getProductField(product, ['Caracteristicas del producto', 'Características del producto', 'Descripcion'], ''),
        Tamano: getProductField(product, ['Tamano', 'Tamaño', 'Talla'], ''),
        Estilo: getProductField(product, ['Estilo'], ''),
        SKU: getProductField(product, ['SKU'], ''),
        Estado: getProductField(product, ['Estado'], 'Activo'),
        Fecha_Creacion: getProductField(product, ['Fecha de Creacion', 'Fecha de Creación'], '')
    };
}

function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function inventorySearchBlob(product) {
    return normalizeSearchText([
        product.Nombre,
        product.Categoria,
        product.Catalogo,
        product.Color,
        product.Tamano,
        product.Estilo,
        product.SKU,
        product.Estado,
        product.Stock,
        product.Precio
    ].join(' '));
}

function scoreInventorySearch(product, query) {
    const q = normalizeSearchText(query);
    if (!q) return 1;

    const terms = q.split(/\s+/).filter(Boolean);
    const name = normalizeSearchText(product.Nombre);
    const category = normalizeSearchText(product.Categoria);
    const sku = normalizeSearchText(product.SKU || product['ID Variación'] || product['ID Variacion']);
    const blob = inventorySearchBlob(product);

    if (!terms.every(term => blob.includes(term))) return 0;

    let score = 10;
    terms.forEach(term => {
        if (name.startsWith(term)) score += 60;
        else if (name.includes(term)) score += 35;
        if (category.includes(term)) score += 20;
        if (sku.includes(term)) score += 25;
    });

    return score;
}

async function postProductToGoogleSheets(data, isEditingOverride = null) {
    data = normalizeProductPayloadForSubmit(data);
    if (!data['ID Producto']) {
        throw new Error('Falta ID Producto Madre. No se puede enviar al inventario.');
    }
    const isEditing = isEditingOverride !== null ? isEditingOverride : Boolean(data['ID Variacion'] || data.id || data.editId);
    const payload = {
        resource: 'productos',
        action: isEditing ? 'editar' : 'crear',
        data
    };

    const res = await fetch(GOOGLE_SHEET_API, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result && (result.ok || result.status === 'success')) {
        return result.data || result;
    }

    throw new Error(result?.error || result?.message || 'No se pudo guardar el producto');
}

function getFilteredInventory() {
    const query = normalizeSearchText(adminInventorySearchQuery);
    const indexed = inventario.map((product, index) => ({ product, index }));

    function getMid(p) {
        var id = String(p.idProducto || p['ID Producto'] || p.idVariacion || p.ID || p['ID Variacion'] || '').trim();
        if (!id) {
            if (!p._fallbackId) p._fallbackId = 'no-id-' + Math.random().toString(36).substr(2, 9);
            id = p._fallbackId;
        }
        return id;
    }

    function isMother(p) {
        var idv = String(p.idVariacion || p.ID || p['ID Variacion'] || '').trim();
        var idp = String(p.idProducto || p['ID Producto'] || '').trim();
        return !idp || !idv || idv === idp;
    }

    let resultList = indexed;
    if (query) {
        var scored = indexed
            .map(function (item) { return { product: item.product, index: item.index, score: scoreInventorySearch(item.product, query) }; })
            .filter(function (item) { return item.score > 0; })
            .sort(function (a, b) { return b.score - a.score; });

        var matchedMids = new Set();
        scored.forEach(function (item) { matchedMids.add(getMid(item.product)); });

        var seen = new Set();
        resultList = [];
        scored.forEach(function (item) {
            var mid = getMid(item.product);
            indexed.forEach(function (sib) {
                var sibMid = getMid(sib.product);
                var key = sibMid + '|' + sib.index;
                if (mid === sibMid && !seen.has(key)) {
                    seen.add(key);
                    resultList.push(sib);
                }
            });
        });
        indexed.forEach(function (item) {
            var mid = getMid(item.product);
            var key = mid + '|' + item.index;
            if (matchedMids.has(mid) && !seen.has(key)) {
                seen.add(key);
                resultList.push(item);
            }
        });
    }

    var grouped = new Map();
    resultList.forEach(function (item) {
        var mid = getMid(item.product);
        if (!grouped.has(mid)) grouped.set(mid, []);
        grouped.get(mid).push(item);
    });

    var finalFlatList = [];
    grouped.forEach(function (items, motherId) {
        items.sort(function (a, b) {
            var aIsMother = isMother(a.product) ? 1 : 0;
            var bIsMother = isMother(b.product) ? 1 : 0;
            return bIsMother - aIsMother;
        });

        var totalStock = items.reduce(function (s, item) { return s + (Number(item.product.Stock || item.product.Cantidad) || 0); }, 0);
        var prices = items.map(function (i) { return Number(i.product.Precio || 0); }).filter(function (p) { return p > 0; });
        var minPrice = prices.length ? Math.min.apply(null, prices) : 0;
        var maxPrice = prices.length ? Math.max.apply(null, prices) : 0;

        items.forEach(function (item, idx) {
            finalFlatList.push({
                product: item.product,
                index: item.index,
                isChild: idx > 0,
                groupSize: items.length,
                motherId: motherId,
                totalStock: totalStock,
                minPrice: minPrice,
                maxPrice: maxPrice
            });
        });
    });

    return finalFlatList;
}

function el(id) {
    return document.getElementById(id);
}

function setInputValue(id, value = '') {
    const input = el(id);
    if (input) input.value = value ?? '';
}

function setMotherProductId(value = '') {
    setInputValue('prod-id-producto', value);
    setInputValue('prod-id-producto-hidden', value);
}

function getInputValue(id) {
    return el(id)?.value?.trim() || '';
}

function generateMotherProductId() {
    const shortTime = Date.now().toString(36).toUpperCase().slice(-6);
    const randId = Math.floor(1000 + Math.random() * 9000);
    return `PROD-${shortTime}${randId}`;
}

function ensureProductHierarchyIds() {
    let idProducto = getInputValue('prod-id-producto');
    if (!idProducto) {
        idProducto = generateMotherProductId();
        setMotherProductId(idProducto);
    } else {
        setMotherProductId(idProducto);
    }

    let idVariacion = getInputValue('prod-id');
    if (!idVariacion || /^VAR-/i.test(idVariacion)) {
        idVariacion = `${idProducto}-V01`;
        setInputValue('prod-id', idVariacion);
    }

    return { idProducto, idVariacion };
}

function normalizeProductPayloadForSubmit(data) {
    const payload = { ...(data || {}) };
    const ids = ensureProductHierarchyIds();
    const idProducto = payload['ID Producto'] || payload['ID Producto Madre'] || payload.ID_Producto || payload.ID_PRODUCTO || payload.IdProducto || payload.id_producto || payload.idProducto || ids.idProducto;
    const idVariacion = payload['ID Variacion'] || payload['ID Variación'] || payload.idVariacion || payload.id || ids.idVariacion;

    payload['ID Producto'] = idProducto;
    payload['ID Producto Madre'] = idProducto;
    payload.ID_Producto = idProducto;
    payload.ID_PRODUCTO = idProducto;
    payload.IdProducto = idProducto;
    payload.id_producto = idProducto;
    payload.idProducto = idProducto;
    payload['ID Variacion'] = idVariacion;
    payload['ID Variación'] = idVariacion;
    payload.idVariacion = idVariacion;

    return payload;
}

function buildProductPayload() {
    const ids = ensureProductHierarchyIds();
    const stock = Number(getInputValue('prod-stock-inicial') || 0);
    const stockInicial = stock;
    const idVariacion = ids.idVariacion;
    const idProducto = ids.idProducto;
    const nombre = getInputValue('prod-nombre');
    const categoria = getInputValue('prod-categoria');
    const descripcion = getInputValue('prod-descripcion');
    const imagen = getInputValue('prod-imagen');

    return {
        'ID Variacion': idVariacion,
        'ID Variación': idVariacion,
        'ID Producto': idProducto,
        ID_Producto: idProducto,
        'Nombre del Producto': nombre,
        Nombre: nombre,
        Categoria: categoria,
        'Categoría': categoria,
        'Catálogo': getInputValue('prod-catalogo') || 'Ambos',
        Precio: parseAmount(getInputValue('prod-precio')),
        'Precio Mayor': parseAmount(getInputValue('prod-precio-mayorista')),
        'Stock Inicial': stockInicial,
        Cantidad: stock,
        Descripcion: descripcion,
        'Caracteristicas del producto': descripcion,
        Tamano: getInputValue('prod-tamano'),
        Talla: getInputValue('prod-tamano'),
        'Tamaño': getInputValue('prod-tamano'),
        Color: getInputValue('prod-color'),
        Estilo: getInputValue('prod-estilo') || idVariacion,
        Promocion: document.getElementById('prod-promocion')?.checked ? 'VERDADERO' : 'FALSO',
        'Imagen Principal': imagen,
        Imagen: imagen,
        'Galería JSON': getInputValue('prod-galeria'),
        SKU: getInputValue('prod-sku'),
        Estado: getInputValue('prod-estado') || 'Activo',
        'Fecha de Creación': getInputValue('prod-fecha-creacion')
    };
}

function splitVariationOptions(value) {
    const items = String(value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
    return items.length ? items : [''];
}

function makeVariantSlug(value) {
    return String(value || 'VAR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toUpperCase()
        .slice(0, 18) || 'VAR';
}

function buildVariantPayloadFromCard(card) {
    const ids = ensureProductHierarchyIds();
    const variantId = card.querySelector('.var-id')?.value?.trim() || '';
    if (!variantId) return null;
    const stock = Number(card.querySelector('.var-stock')?.value || 0);
    const imagen = card.querySelector('.var-imagen')?.value?.trim() || getInputValue('prod-imagen');
    const tamano = card.querySelector('.var-tamano')?.value?.trim() || '';
    const color = card.querySelector('.var-color')?.value?.trim() || '';
    const estilo = card.querySelector('.var-estilo')?.value?.trim() || variantId;

    return {
        'ID Variacion': variantId,
        'ID Variación': variantId,
        'ID Producto': ids.idProducto,
        ID_Producto: ids.idProducto,
        idProducto: ids.idProducto,
        'Nombre del Producto': card.querySelector('.var-nombre')?.value?.trim() || getInputValue('prod-nombre'),
        Nombre: card.querySelector('.var-nombre')?.value?.trim() || getInputValue('prod-nombre'),
        Precio: parseAmount(card.querySelector('.var-precio')?.value || getInputValue('prod-precio')),
        'Precio Mayor': parseAmount(card.querySelector('.var-precio-mayor')?.value || getInputValue('prod-precio-mayorista')),
        Categoria: getInputValue('prod-categoria'),
        'CategorÃ­a': getInputValue('prod-categoria'),
        Cantidad: stock,
        'Stock Inicial': stock,
        Descripcion: getInputValue('prod-descripcion'),
        'Caracteristicas del producto': getInputValue('prod-descripcion'),
        Tamano: tamano,
        Talla: tamano,
        'TamaÃ±o': tamano,
        Color: color,
        Estilo: estilo,
        SKU: card.querySelector('.var-sku')?.value?.trim() || '',
        Imagen: imagen,
        'Imagen Principal': imagen,
        Catalogo: getInputValue('prod-catalogo') || 'Ambos',
        'Galeria JSON': getInputValue('prod-galeria'),
        'GalerÃ­a JSON': getInputValue('prod-galeria'),
        Promocion: document.getElementById('prod-promocion')?.checked ? 'VERDADERO' : 'FALSO',
        Estado: getInputValue('prod-estado') || 'Activo',
        'Fecha de CreaciÃ³n': getInputValue('prod-fecha-creacion')
    };
}

function collectVariantPayloads() {
    const cards = Array.from(document.querySelectorAll('#variants-container .admin-panel'));
    return cards
        .filter(card => card.dataset.saved !== '1')
        .map(buildVariantPayloadFromCard)
        .filter(Boolean);
}

function setProductFormMode(isEditing) {
    isEditingProduct = isEditing;
    const title = el('product-form-title');
    const mode = el('product-form-mode');
    const btn = el('btn-save');
    if (title) title.textContent = isEditing ? 'Editar Producto' : 'Nuevo Producto';
    if (mode) mode.textContent = isEditing ? 'Editando' : 'Creando';
    if (btn) btn.textContent = isEditing ? 'Guardar cambios' : 'Guardar producto y variantes';
}

function resetProductForm() {
    const form = el('product-form');
    if (form) form.reset();
    
    setMotherProductId(generateMotherProductId());
    const currentMotherId = getInputValue('prod-id-producto');
    setInputValue('prod-id', `${currentMotherId}-V01`);
    setInputValue('prod-fecha-creacion', '');
    setInputValue('prod-stock-inicial', '0');
    setInputValue('prod-stock', '0');
    setInputValue('prod-catalogo', 'Ambos');
    setInputValue('prod-estado', 'Activo');
    setInputValue('prod-estilo', '');
    setInputValue('variation-styles', '');
    setInputValue('variation-sizes', '');
    setInputValue('variation-colors', '');
    const generatorSummary = document.getElementById('variation-generator-summary');
    if (generatorSummary) generatorSummary.textContent = 'Genera tarjetas editables para cada combinacion antes de guardar.';
    const variationPanel = document.getElementById('variation-options-panel');
    if (variationPanel) variationPanel.style.display = 'none';
    const variationFields = document.getElementById('variation-generator-fields');
    if (variationFields) variationFields.style.display = 'none';
    const promoCheck = document.getElementById('prod-promocion');
    if (promoCheck) promoCheck.checked = false;
    setProductFormMode(false);
    updateLivePreview();
    var badge = document.getElementById('variant-editing-badge');
    if (badge) badge.style.display = 'none';
    var vc = document.getElementById('variants-container');
    if (vc) vc.innerHTML = '';
    var grpBtn = document.getElementById('btn-save-group');
    if (grpBtn) grpBtn.remove();
}

function updateCategoryOptions() {
    const list = el('admin-category-options');
    const select = el('prod-categoria');

    const defaults = ['Collares', 'Pulseras', 'Aretes', 'Anillos', 'Sets', 'Dijes', 'BANNER'];
    const categories = [...new Set([
        ...defaults,
        ...inventario.map(p => p.Categoria).filter(Boolean)
    ])].sort((a, b) => String(a).localeCompare(String(b), 'es'));

    if (list) {
        list.innerHTML = categories.map(category => `<option value="${String(category).replace(/"/g, '&quot;')}"></option>`).join('');
    }
    if (select && select.tagName === 'SELECT') {
        const current = select.value;
        select.innerHTML = categories.map(category => `<option value="${String(category).replace(/"/g, '&quot;')}">${category}</option>`).join('');
        if (current && categories.includes(current)) select.value = current;
    }
}

function initAdminCustomCursor() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (document.getElementById('blyxu-cursor')) return;

    const cursor = document.createElement('div');
    cursor.id = 'blyxu-cursor';
    cursor.innerHTML = '<span class="cursor-dot"></span><span class="cursor-ring"></span>';
    document.body.appendChild(cursor);

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let ringX = x;
    let ringY = y;

    function move() {
        ringX += (x - ringX) * 0.2;
        ringY += (y - ringY) * 0.2;
        cursor.style.setProperty('--cursor-x', `${x}px`);
        cursor.style.setProperty('--cursor-y', `${y}px`);
        cursor.style.setProperty('--ring-x', `${ringX}px`);
        cursor.style.setProperty('--ring-y', `${ringY}px`);
        requestAnimationFrame(move);
    }

    window.addEventListener('mousemove', event => {
        x = event.clientX;
        y = event.clientY;
        cursor.classList.add('is-visible');
    }, { passive: true });

    window.addEventListener('mouseout', event => {
        if (!event.relatedTarget) cursor.classList.remove('is-visible');
    });

    document.addEventListener('mouseover', event => {
        const target = event.target;
        cursor.classList.toggle('is-hovering', Boolean(target?.closest?.('a, button, input, textarea, select, [role="button"], .sidebar-btn, .admin-btn, .form-control')));
    });

    move();
}

// -- ADMIN LOGIN PARTICLES --
function initAdminParticles() {
    const canvas = document.getElementById('admin-particles');
    if (!canvas) return;
    
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '0';
    canvas.style.pointerEvents = 'none';

    const ctx = canvas.getContext('2d');
    let width, height;
    let particles = [];
    
    const mouse = { x: -9999, y: -9999, active: false };
    
    const loginScreen = document.getElementById('admin-login-screen');
    if(loginScreen) {
        loginScreen.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            mouse.x = e.clientX - rect.left;
            mouse.y = e.clientY - rect.top;
            mouse.active = true;
        });
        loginScreen.addEventListener('mouseleave', () => { mouse.active = false; });
        loginScreen.addEventListener('touchmove', (e) => {
            if(e.touches.length > 0) {
                const rect = canvas.getBoundingClientRect();
                mouse.x = e.touches[0].clientX - rect.left;
                mouse.y = e.touches[0].clientY - rect.top;
                mouse.active = true;
            }
        });
        loginScreen.addEventListener('touchend', () => { mouse.active = false; });
    }

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        initNodes();
    }

    function initNodes() {
        particles = [];
        const isMobile = window.innerWidth < 768;
        const count = isMobile ? 50 : 120;
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 1.5,
                vy: (Math.random() - 0.5) * 1.5,
                radius: Math.random() * 2 + 1,
                color: Math.random() > 0.5 ? '#a855f7' : '#3b82f6'
            });
        }
    }

    window.addEventListener('resize', resize);
    resize();

    function draw() {
        ctx.fillStyle = 'rgba(10, 2, 20, 0.35)';
        ctx.fillRect(0, 0, width, height);

        const connectionDistance = 120;
        const mouseConnectionDistance = 180;

        for (let i = 0; i < particles.length; i++) {
            let p = particles[i];

            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0 || p.x > width) p.vx *= -1;
            if (p.y < 0 || p.y > height) p.vy *= -1;

            if (mouse.active) {
                const dx = mouse.x - p.x;
                const dy = mouse.y - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < mouseConnectionDistance) {
                    p.x += dx * 0.015;
                    p.y += dy * 0.015;

                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(mouse.x, mouse.y);
                    const opacity = 1 - (dist / mouseConnectionDistance);
                    ctx.strokeStyle = `rgba(59, 130, 246, ${opacity * 0.5})`;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }

            for (let j = i + 1; j < particles.length; j++) {
                let p2 = particles[j];
                const dx = p.x - p2.x;
                const dy = p.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < connectionDistance) {
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p2.x, p2.y);
                    const opacity = 1 - (dist / connectionDistance);
                    ctx.strokeStyle = `rgba(168, 85, 247, ${opacity * 0.3})`;
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                }
            }

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.shadowBlur = 10;
            ctx.shadowColor = p.color;
        }

        requestAnimationFrame(draw);
    }

    draw();
}

document.addEventListener('DOMContentLoaded', () => {
    initAdminParticles();
    initAdminCustomCursor();
    initRetailPriceToggle();
    initContactConfigAdmin();
    initInvoiceConfigAdmin();
    initPromoConfigAdmin();
    initQRConfigAdmin();
    initInventorySearch();
    initInventoryActions();
    initCarouselImageAdmin();
    resetProductForm(); // Initialize the form with auto-generated IDs
    const adminPasswordInput = document.getElementById('admin-password');
    if (adminPasswordInput) adminPasswordInput.placeholder = 'Clave de acceso';
    const adminLoginButton = document.querySelector('#admin-login-form .admin-btn');
    if (adminLoginButton) adminLoginButton.textContent = 'Autenticar';

    // Configurar Drag & Drop para Productos
    setupDragAndDrop('prod-image-drop-zone', (url) => {
        const input = document.getElementById('prod-imagen');
        if (input) {
            input.value = url;
            input.dispatchEvent(new Event('input')); // Para actualizar preview con URL final
        }
    }, (localUrl) => {
        // Vista previa local inmediata antes de que termine de subir
        const imgEl = document.getElementById('preview-img-el');
        if (imgEl) {
            imgEl.src = localUrl;
            imgEl.dataset.localPreviewSrc = localUrl;
            imgEl.style.opacity = '0.7';
        }
        const saveBtn = document.getElementById('btn-save');
        if (saveBtn) {
            saveBtn.dataset.readyText = saveBtn.textContent || 'Guardar producto';
            saveBtn.disabled = true;
            saveBtn.textContent = 'Subiendo imagen...';
        }
        showToast('Subiendo imagen a Google Drive...');
    }, () => {
        const saveBtn = document.getElementById('btn-save');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = saveBtn.dataset.readyText || 'Guardar producto';
            delete saveBtn.dataset.readyText;
        }
    });

    // Delegación de eventos para drag & drop en variantes dinámicas
    document.addEventListener('dragover', (e) => {
        if (e.target.closest('.var-drop-zone')) {
            e.preventDefault();
            e.target.closest('.var-drop-zone').classList.add('drag-over');
        }
    });
    document.addEventListener('dragleave', (e) => {
        if (e.target.closest('.var-drop-zone')) {
            e.target.closest('.var-drop-zone').classList.remove('drag-over');
        }
    });
    document.addEventListener('drop', async (e) => {
        const zone = e.target.closest('.var-drop-zone');
        if (zone) {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                const input = zone.querySelector('.var-imagen');
                const imgPreview = zone.querySelector('.var-preview-thumb');

                // Preview local
                if (imgPreview) {
                    const localUrl = URL.createObjectURL(file);
                    imgPreview.src = localUrl;
                    imgPreview.style.display = 'block';
                }

                try {
                    showToast('Subiendo variante...');
                    const url = await uploadCarouselImage(file);
                    if (input) input.value = url;
                    showToast('Imagen de variante lista', 'success');
                } catch (err) {
                    showToast('Error: ' + err.message, 'error');
                }
            }
        }
    });

    // Configurar listeners para la Vista Previa
    const inputsToWatch = ['prod-nombre', 'prod-categoria', 'prod-precio', 'prod-precio-mayorista', 'prod-imagen', 'prod-estado'];
    inputsToWatch.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateLivePreview);
            el.addEventListener('change', updateLivePreview);
        }
    });
    updateLivePreview(); // Actualización inicial

    document.getElementById('prod-id-producto')?.addEventListener('change', () => {
        const motherId = getInputValue('prod-id-producto');
        setMotherProductId(motherId);
        const currentChildId = getInputValue('prod-id');
        if (motherId && (!currentChildId || /^VAR-/i.test(currentChildId) || /-V01$/i.test(currentChildId))) {
            setInputValue('prod-id', `${motherId}-V01`);
        }
        updateLivePreview();
    });

    // --- LOGIN LOGIC ---
    const loginForm = document.getElementById('admin-login-form');
    const loginError = document.getElementById('login-error');
    const loginScreen = document.getElementById('admin-login-screen');
    const mainContent = document.getElementById('admin-main-content');

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const pass = document.getElementById('admin-password').value;

            if (pass === '2015690') {
                loginError.style.display = 'none';
                loginForm.style.display = 'none';

                const loader = document.getElementById('login-loader');
                const loaderBar = document.getElementById('login-loader-bar');
                const loaderText = document.getElementById('login-loader-text');

                loader.style.display = 'block';
                loaderText.style.display = 'block';

                // Animate loader
                let progress = 0;
                const interval = setInterval(() => {
                    progress += Math.random() * 15;
                    if (progress >= 100) {
                        progress = 100;
                        clearInterval(interval);
                        setTimeout(() => {
                            loginScreen.style.opacity = '0';
                            setTimeout(() => {
                                loginScreen.style.display = 'none';
                                mainContent.style.display = ''; // Permite que actúe el CSS grid (dashboard-layout)
                                cargarInventario(); // Load only after login
                            }, 500);
                        }, 400);
                    }
                    loaderBar.style.width = progress + '%';
                }, 200);
            } else {
                loginError.style.display = 'block';
                // Shake effect
                document.getElementById('login-box').style.transform = 'translateX(10px)';
                setTimeout(() => document.getElementById('login-box').style.transform = 'translateX(-10px)', 100);
                setTimeout(() => document.getElementById('login-box').style.transform = 'translateX(10px)', 200);
                setTimeout(() => document.getElementById('login-box').style.transform = 'translateX(0)', 300);
            }
        });
    }
    // -------------------

    document.getElementById('product-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = document.getElementById('btn-save');
        btn.disabled = true;
        btn.textContent = 'Enviando...';
        ensureProductHierarchyIds();

        const rawPrecio = document.getElementById('prod-precio').value;
        const cleanPrecio = parseAmount(rawPrecio);
        const rawPrecioMayorista = document.getElementById('prod-precio-mayorista').value;
        const cleanPrecioMayorista = parseAmount(rawPrecioMayorista);

        const stock = Number(document.getElementById('prod-stock-inicial').value || 0);
        const estado = document.getElementById('prod-estado').value;

        const data = {
            'Nombre del Producto': document.getElementById('prod-nombre').value,
            Categoria: document.getElementById('prod-categoria').value,
            'Categoría': document.getElementById('prod-categoria').value,
            Precio: cleanPrecio,
            'Precio Mayor': cleanPrecioMayorista,
            'Stock Inicial': stock,
            Cantidad: stock,
            'Imagen Principal': document.getElementById('prod-imagen').value,
            Color: document.getElementById('prod-color').value,
            Estilo: document.getElementById('prod-id').value,
            Estado: estado
        };
        Object.assign(data, buildProductPayload());
        const motherProductId = getInputValue('prod-id-producto') || ensureProductHierarchyIds().idProducto;
        data['ID Producto'] = motherProductId;
        data.ID_Producto = motherProductId;
        data.idProducto = motherProductId;

        async function proceedSubmit(finalData) {
            try {
                const savedProducts = [];
                const savedMain = await postProductToGoogleSheets(finalData, isEditingProduct);
                if (savedMain) savedProducts.push(savedMain);
                const variants = collectVariantPayloads();
                let savedVariants = 0;
                for (const variantData of variants) {
                    const savedVariant = await postProductToGoogleSheets(variantData, isEditingProduct);
                    if (savedVariant) savedProducts.push(savedVariant);
                    savedVariants++;
                }
                try {
                    mergeSavedProductsIntoInventory(savedProducts);
                } catch (renderError) {
                    console.warn('Producto guardado, pero no se pudo refrescar el inventario local:', renderError);
                }
                showToast(savedVariants ? `Producto y ${savedVariants} variante(s) guardados en Google Sheets` : 'Producto guardado en Google Sheets', 'success');
                resetProductForm();
                btn.disabled = false;
                btn.textContent = 'Guardar producto y variantes';
                if (document.getElementById('edit-product-modal')?.style.display === 'flex') {
                    cerrarModalEdicion();
                }
                setTimeout(function () { cargarInventario({ silent: true }); }, 1000);
            } catch (err) {
                showToast('Error: ' + err.message, 'error');
                btn.disabled = false;
                btn.textContent = 'Guardar / Enviar';
            }
        }

        if (stock === 0 && estado === 'Activo') {
            showModal('Stock en Cero', 'El stock es 0. ¿Marcar como "Agotado"?', 'Sí, marcar Agotado',
                function () {
                    closeModal();
                    data['Estado'] = 'Agotado';
                    document.getElementById('prod-estado').value = 'Agotado';
                    proceedSubmit(data);
                },
                function () {
                    proceedSubmit(data);
                }
            );
            btn.disabled = false;
            btn.textContent = 'Guardar / Enviar';
            return;
        }

        proceedSubmit(data);
    });

    document.getElementById('btn-reset-product')?.addEventListener('click', resetProductForm);

    document.getElementById('btn-add-variant')?.addEventListener('click', () => {
        document.getElementById('btn-add-manual-variant')?.click();
    });

    document.getElementById('btn-show-variation-generator')?.addEventListener('click', () => {
        const fields = document.getElementById('variation-generator-fields');
        if (fields) {
            fields.style.display = 'block';
            fields.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });

    document.getElementById('btn-add-manual-variant')?.addEventListener('click', () => {
        const container = document.getElementById('variants-container');
        if (!container) return;

        const ids = ensureProductHierarchyIds();

        const cardId = Date.now();
        const variantNumber = document.querySelectorAll('#variants-container .admin-panel').length + 2;
        const autoVariantId = `${ids.idProducto}-V${String(variantNumber).padStart(2, '0')}`;
        
        const card = document.createElement('div');
        card.className = 'admin-panel';
        card.id = `variant-card-${cardId}`;
        card.style.cssText = `
            border-top: 4px solid var(--primary);
            padding: 24px;
            animation: fadeIn 0.4s ease;
            position: relative;
            background: rgba(255,255,255,0.02);
            margin-bottom: 20px;
        `;

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h4 style="margin:0; font-size:12px; text-transform:uppercase; letter-spacing:1px; color:var(--primary); font-weight:800;">🛠 Nueva Variante</h4>
                <button type="button" class="admin-btn secondary" style="width:auto; padding:6px 12px; font-size:10px; border-radius:10px;" onclick="this.closest('.admin-panel').remove()">Cerrar / Quitar</button>
            </div>
            <div class="admin-form-grid">
                <div class="form-group">
                    <label>ID Variante / Hijo</label>
                    <input type="text" class="form-control var-id" value="${autoVariantId}" placeholder="Ej: ESTAMPADO-01">
                </div>
                <div class="form-group">
                    <label>Nombre del Producto</label>
                    <input type="text" class="form-control var-nombre" placeholder="${getInputValue('prod-nombre')}" value="${getInputValue('prod-nombre')}">
                </div>
                <div class="form-group">
                    <label>Precio</label>
                    <input type="text" class="form-control var-precio" placeholder="${getInputValue('prod-precio')}" value="${getInputValue('prod-precio')}">
                </div>
                <div class="form-group">
                    <label>Precio Mayorista</label>
                    <input type="text" class="form-control var-precio-mayor" placeholder="${getInputValue('prod-precio-mayorista')}" value="${getInputValue('prod-precio-mayorista')}">
                </div>
                <div class="form-group">
                    <label>SKU Variante</label>
                    <input type="text" class="form-control var-sku">
                </div>
                <div class="form-group">
                    <label>Estilo</label>
                    <input type="text" class="form-control var-estilo" value="${getInputValue('prod-estilo')}" placeholder="Ej: flor, corazon">
                </div>
                <div class="form-group">
                    <label>Tamaño / Medida</label>
                    <input type="text" class="form-control var-tamano">
                </div>

                <div class="form-group">
                    <label>Color</label>
                    <input type="text" class="form-control var-color">
                </div>
                <div class="form-group">
                    <label>Stock</label>
                    <input type="number" class="form-control var-stock" value="0">
                </div>
                <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Imagen de Variante (Arrastra o URL)</label>
                    <div class="var-drop-zone" style="background:rgba(0,0,0,0.2); border:1px dashed rgba(255,255,255,0.1); border-radius:12px; padding:8px; display:flex; gap:10px; align-items:center; min-height:45px;">
                        <img class="var-preview-thumb" src="" style="width:30px; height:30px; border-radius:4px; object-fit:cover; display:none; border:1px solid rgba(255,255,255,0.1);">
                        <input type="text" class="form-control var-imagen" placeholder="URL o Arrastra aquí..." style="margin:0; border:none; background:transparent; flex:1;">
                    </div>
                </div>
            </div>
            <button type="button" class="admin-btn btn-save-individual-variant" style="background:linear-gradient(135deg, #6C5CE7, #9B2CFA); margin-top:10px;">Guardar esta Variante</button>
        `;

        container.appendChild(card);
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Evento de guardado para esta tarjeta específica
        card.querySelector('.btn-save-individual-variant').addEventListener('click', async (e) => {
            const btn = e.target;
            var motherId = ensureProductHierarchyIds().idProducto;
            if (!motherId) {
                showToast('Error: Debes especificar un ID Producto (Madre) antes de guardar una variante');
                btn.disabled = false;
                return;
            }
            btn.disabled = true;
            const originalText = btn.textContent;
            btn.textContent = 'Guardando...';

                const data = {
                    'ID Variacion': card.querySelector('.var-id').value,
                    'ID Variación': card.querySelector('.var-id').value,
                    'ID Producto': getInputValue('prod-id-producto') || getInputValue('prod-id'),
                    ID_Producto: getInputValue('prod-id-producto') || getInputValue('prod-id'),
                    'Nombre del Producto': card.querySelector('.var-nombre')?.value || getInputValue('prod-nombre'),
                    Nombre: card.querySelector('.var-nombre')?.value || getInputValue('prod-nombre'),
                    Precio: parseAmount(card.querySelector('.var-precio')?.value || getInputValue('prod-precio')),
                    'Precio Mayor': parseAmount(card.querySelector('.var-precio-mayor')?.value || getInputValue('prod-precio-mayorista')),
                    Categoria: getInputValue('prod-categoria'),
                    'Categoría': getInputValue('prod-categoria'),
                    Cantidad: Number(card.querySelector('.var-stock').value || 0),
                    'Stock Inicial': Number(card.querySelector('.var-stock').value || 0),
                    Descripcion: getInputValue('prod-descripcion'),
                    'Caracteristicas del producto': getInputValue('prod-descripcion'),
                    Tamano: card.querySelector('.var-tamano').value,
                    Talla: card.querySelector('.var-tamano').value,
                    'TamaÃ±o': card.querySelector('.var-tamano').value,
                    Color: card.querySelector('.var-color').value,
                    Estilo: card.querySelector('.var-estilo')?.value || card.querySelector('.var-id').value || getInputValue('prod-estilo'),
                    SKU: card.querySelector('.var-sku').value,
                    Imagen: card.querySelector('.var-imagen').value || getInputValue('prod-imagen'),
                    'Imagen Principal': card.querySelector('.var-imagen').value || getInputValue('prod-imagen'),
                    Catalogo: getInputValue('prod-catalogo') || 'Ambos',
                    'Galeria JSON': getInputValue('prod-galeria'),
                    'GalerÃ­a JSON': getInputValue('prod-galeria'),
                    Estado: getInputValue('prod-estado') || 'Activo'
                };

            try {
                await postProductToGoogleSheets(data, false);
                card.dataset.saved = '1';
                showToast('¡Variante guardada!');
                btn.style.background = '#00c853';
                btn.textContent = '✅ Guardado';
                setTimeout(() => {
                    btn.disabled = false;
                    btn.style.background = 'linear-gradient(135deg, #6C5CE7, #9B2CFA)';
                    btn.textContent = originalText;
                }, 3000);
                setTimeout(() => cargarInventario({ silent: true }), 1500);
            } catch (err) {
                console.error(err);
                showToast('Error al guardar');
                btn.disabled = false;
                btn.textContent = 'Reintentar';
            }
        });
    });

    document.getElementById('btn-generate-variations')?.addEventListener('click', () => {
        const addButton = document.getElementById('btn-add-manual-variant');
        const container = document.getElementById('variants-container');
        if (!addButton || !container) return;

        const styles = splitVariationOptions(getInputValue('variation-styles') || getInputValue('prod-estilo'));
        const sizes = splitVariationOptions(getInputValue('variation-sizes') || getInputValue('prod-tamano'));
        const colors = splitVariationOptions(getInputValue('variation-colors') || getInputValue('prod-color'));
        const combinations = [];

        styles.forEach(styleValue => {
            sizes.forEach(sizeValue => {
                colors.forEach(colorValue => {
                    if (styleValue || sizeValue || colorValue) {
                        combinations.push({ styleValue, sizeValue, colorValue });
                    }
                });
            });
        });

        if (!combinations.length) {
            showToast('Escribe al menos un estilo, tamaño o color para generar variantes');
            return;
        }

        container.innerHTML = '';
        const motherId = ensureProductHierarchyIds().idProducto;
        const firstCombo = combinations[0];
        setInputValue('prod-id', `${motherId}-V01`);
        setInputValue('prod-estilo', firstCombo.styleValue || '');
        setInputValue('prod-tamano', firstCombo.sizeValue || '');
        setInputValue('prod-color', firstCombo.colorValue || '');

        combinations.slice(1).forEach((combo, index) => {
            addButton.click();
            const card = container.lastElementChild;
            if (!card) return;
            const variantId = `${motherId}-V${String(index + 2).padStart(2, '0')}`;

            card.querySelector('.var-id').value = variantId;
            card.querySelector('.var-nombre').value = getInputValue('prod-nombre');
            card.querySelector('.var-estilo').value = combo.styleValue || getInputValue('prod-estilo');
            card.querySelector('.var-tamano').value = combo.sizeValue || getInputValue('prod-tamano');
            card.querySelector('.var-color').value = combo.colorValue || getInputValue('prod-color');
        });

        const summary = document.getElementById('variation-generator-summary');
        if (summary) summary.textContent = `${combinations.length} variante(s) hijas listas: V01 en la variante inicial y ${Math.max(combinations.length - 1, 0)} tarjeta(s) adicional(es).`;
        showToast(`${combinations.length} variacion(es) generadas`, 'success');
    });
});

function initRetailPriceToggle() {
    const toggle = document.getElementById('toggle-retail-prices');
    if (!toggle) return;

    function renderState(enabled) {
        if (enabled === undefined) enabled = localStorage.getItem(RETAIL_PRICE_VISIBILITY_KEY) !== '0';
        toggle.textContent = enabled ? 'ON' : 'OFF';
        toggle.classList.toggle('active', enabled);
        toggle.title = enabled ? 'Precios minoristas visibles' : 'Precios minoristas ocultos';
    }

    toggle.addEventListener('click', async () => {
        const enabled = localStorage.getItem(RETAIL_PRICE_VISIBILITY_KEY) === '1';
        const nextEnabled = !enabled;
        localStorage.setItem(RETAIL_PRICE_VISIBILITY_KEY, nextEnabled ? '1' : '0');
        renderState(nextEnabled);
        await saveSiteConfig(RETAIL_PRICE_CONFIG_KEY, nextEnabled ? '1' : '0');
        showToast(nextEnabled ? 'Precios minoristas visibles' : 'Precios minoristas ocultos');
    });

    renderState();
    loadSiteConfigForAdmin().then(config => {
        if (config && config[RETAIL_PRICE_CONFIG_KEY] !== undefined) {
            const enabled = String(config[RETAIL_PRICE_CONFIG_KEY]) === '1';
            localStorage.setItem(RETAIL_PRICE_VISIBILITY_KEY, enabled ? '1' : '0');
            renderState(enabled);
        }
    });
}

async function loadSiteConfigForAdmin() {
    try {
        const res = await fetch(`${GOOGLE_SHEET_API}?action=get_config`);
        const data = await res.json();
        return data && data.status === 'success' ? (data.config || {}) : {};
    } catch (err) {
        clearTimeout(timeout);
        clearTimeout(timeout);
        console.warn('No se pudo cargar configuración:', err);
        return {};
    }
}

async function saveSiteConfig(key, value) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
        const formData = new FormData();
        formData.append('action', 'set_config');
        formData.append('Clave', key);
        formData.append('Valor', value);

        await fetch(GOOGLE_SHEET_API, {
            method: 'POST',
            body: formData,
            mode: 'no-cors',
            signal: controller.signal
        });
        clearTimeout(timeout);
    } catch (err) {
        clearTimeout(timeout);
        console.error('No se pudo guardar configuración:', err);
        showToast('No se pudo guardar configuración en Google Sheets');
    }
}

function fillContactConfigForm(config) {
    CONTACT_CONFIG_FIELDS.forEach(([key, id]) => {
        const input = document.getElementById(id);
        if (input) input.value = config?.[key] || '';
    });
}

function initContactConfigAdmin() {
    const form = document.getElementById('contact-config-form');
    if (!form) return;

    loadSiteConfigForAdmin().then(fillContactConfigForm);

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const btn = document.getElementById('btn-save-contact-config');
        const originalText = btn ? btn.textContent : '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Guardando...';
        }

        try {
            await Promise.all(CONTACT_CONFIG_FIELDS.map(([key, id]) => {
                const value = document.getElementById(id)?.value?.trim() || '';
                return saveSiteConfig(key, value);
            }));
            showToast('Contacto actualizado');
        } catch (err) {
            console.error('No se pudo guardar contacto:', err);
            showToast('No se pudo guardar contacto');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText || 'Guardar Contacto';
            }
        }
    });
}

function fillInvoiceConfigForm(config) {
    INVOICE_CONFIG_FIELDS.forEach(([key, id]) => {
        const input = document.getElementById(id);
        if (input) input.value = config?.[key] || '';
    });
}

function initInvoiceConfigAdmin() {
    const form = document.getElementById('invoice-config-form');
    if (!form) return;

    loadSiteConfigForAdmin().then(fillInvoiceConfigForm);

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const btn = document.getElementById('btn-save-invoice-config');
        const originalText = btn ? btn.textContent : '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Guardando...';
        }

        try {
            await Promise.all(INVOICE_CONFIG_FIELDS.map(([key, id]) => {
                const value = document.getElementById(id)?.value?.trim() || '';
                return saveSiteConfig(key, value);
            }));
            
            window.storeConfig = window.storeConfig || {};
            INVOICE_CONFIG_FIELDS.forEach(([key, id]) => {
                window.storeConfig[key] = document.getElementById(id)?.value?.trim() || '';
            });
            
            showToast('Configuración de factura actualizada');
        } catch (err) {
            console.error('No se pudo guardar configuración de factura:', err);
            showToast('No se pudo guardar la configuración');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText || 'Guardar Ajustes de Factura';
            }
        }
    });
}

const PROMO_CONFIG_FIELDS = [
    ['Promo_Enabled', 'promo-config-enabled'],
    ['Promo_Title', 'promo-config-title'],
    ['Promo_Date', 'promo-config-date'],
    ['Promo_Message', 'promo-config-message']
];

function fillPromoConfigForm(config) {
    if (!config) return;
    PROMO_CONFIG_FIELDS.forEach(([key, id]) => {
        const input = document.getElementById(id);
        if (input) {
            if (input.type === 'checkbox') {
                input.checked = config[key] === 'true';
            } else {
                input.value = config[key] || '';
            }
        }
    });
}

function initPromoConfigAdmin() {
    const form = document.getElementById('promo-config-form');
    if (!form) return;

    loadSiteConfigForAdmin().then(fillPromoConfigForm);

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const btn = document.getElementById('btn-save-promo-config');
        const originalText = btn ? btn.textContent : '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Guardando...';
        }

        try {
            await Promise.all(PROMO_CONFIG_FIELDS.map(([key, id]) => {
                const input = document.getElementById(id);
                let value = '';
                if (input) {
                    if (input.type === 'checkbox') {
                        value = input.checked ? 'true' : 'false';
                    } else {
                        value = input.value.trim();
                    }
                }
                return saveSiteConfig(key, value);
            }));
            showToast('Banner promocional guardado correctamente');
        } catch (error) {
            console.error('Error guardando banner promocional:', error);
            showToast('Error al guardar: ' + error.message, true);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
    });
}

const QR_CONFIG_FIELDS = [
    ['QR_Password', 'qr-config-password'],
    ['QR_Image', 'qr-config-image']
];

function initQRConfigAdmin() {
    const form = document.getElementById('qr-config-form');
    if (!form) return;

    // Llenar campos con la config actual
    loadSiteConfigForAdmin().then(config => {
        if (!config) return;
        QR_CONFIG_FIELDS.forEach(([key, id]) => {
            const input = document.getElementById(id);
            if (input) input.value = config[key] || '';
        });
        
        // Vista previa si hay imagen
        if (config['QR_Image']) {
            const preview = document.getElementById('qr-preview');
            if (preview) {
                preview.innerHTML = `<img src="${config['QR_Image']}" style="width:100%; height:100%; object-fit:contain; border-radius:12px;">`;
            }
        }
    });

    // Configurar Drag & Drop para subir la imagen del QR
    setupDragAndDrop('qr-preview', (url) => {
        const input = document.getElementById('qr-config-image');
        if (input) {
            input.value = url;
            input.dispatchEvent(new Event('input'));
        }
    }, (localUrl) => {
        const preview = document.getElementById('qr-preview');
        if (preview) {
            preview.innerHTML = `<img src="${localUrl}" style="width:100%; height:100%; object-fit:contain; border-radius:12px; opacity:0.7;">`;
        }
    });

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const btn = document.getElementById('btn-save-qr-config');
        const originalText = btn ? btn.textContent : '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Guardando...';
        }

        try {
            await Promise.all(QR_CONFIG_FIELDS.map(([key, id]) => {
                const input = document.getElementById(id);
                return saveSiteConfig(key, input ? input.value.trim() : '');
            }));
            showToast('Configuración de QR guardada correctamente');
        } catch (error) {
            console.error('Error guardando QR:', error);
            showToast('Error al guardar: ' + error.message, true);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
    });
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
        reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen'));
        reader.readAsDataURL(file);
    });
}

function loadImageFile(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('No se pudo preparar la imagen'));
        };
        img.src = url;
    });
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error('No se pudo comprimir la imagen'));
        }, type, quality);
    });
}

async function prepareImageForUpload(file) {
    if (file.size <= MAX_CAROUSEL_IMAGE_SIZE || file.type === 'image/gif') {
        return file;
    }

    const img = await loadImageFile(file);
    const scale = Math.min(1, IMAGE_UPLOAD_MAX_EDGE / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('No se pudo preparar la imagen');
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let blob = await canvasToBlob(canvas, 'image/jpeg', IMAGE_UPLOAD_QUALITY);
    if (blob.size > MAX_CAROUSEL_IMAGE_SIZE) {
        blob = await canvasToBlob(canvas, 'image/jpeg', 0.68);
    }
    if (blob.size > MAX_CAROUSEL_IMAGE_SIZE) {
        throw new Error('La imagen sigue pesando mas de 5 MB despues de comprimirla');
    }

    const cleanName = String(file.name || 'imagen').replace(/\.[^.]+$/, '') || 'imagen';
    return new File([blob], `${cleanName}.jpg`, { type: 'image/jpeg' });
}

async function uploadCarouselImage(file) {
    if (!file) return '';
    if (!file.type.startsWith('image/')) {
        throw new Error('Selecciona un archivo de imagen valido');
    }

    const uploadFile = await prepareImageForUpload(file);
    if (uploadFile.size > MAX_CAROUSEL_IMAGE_SIZE) {
        throw new Error('La imagen pesa mas de 5 MB');
    }

    const base64Data = await fileToBase64(uploadFile);
    const res = await fetch(GOOGLE_SHEET_API, {
        method: 'POST',
        body: JSON.stringify({
            action: 'upload_image',
            fileName: uploadFile.name,
            mimeType: uploadFile.type,
            base64Data
        })
    });
    const result = await res.json();

    if (!(result && (result.ok || result.status === 'success'))) {
        throw new Error(result?.error || result?.message || 'No se pudo subir la imagen');
    }

    const uploadedUrl = normalizeImageUrl(result.url || result.data?.url || '');
    if (!uploadedUrl) {
        throw new Error('Google Drive no devolvio la URL de la imagen');
    }

    return uploadedUrl;
}

/**
 * Configura el comportamiento de Arrastrar y Soltar en un elemento
 */
function setupDragAndDrop(containerId, onFileProcessed, onLocalPreview, onUploadEnd) {
    const container = document.getElementById(containerId);
    if (!container) return;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        container.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        container.addEventListener(eventName, () => container.classList.add('drag-over'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        container.addEventListener(eventName, () => container.classList.remove('drag-over'), false);
    });

    container.addEventListener('drop', async (e) => {
        const dt = e.dataTransfer;
        const file = dt.files[0];

        if (file && file.type.startsWith('image/')) {
            try {
                // Notificar preview local inmediata si existe el callback
                if (typeof onLocalPreview === 'function') {
                    const localUrl = URL.createObjectURL(file);
                    onLocalPreview(localUrl, file);
                }

                const imageUrl = await uploadCarouselImage(file);
                onFileProcessed(imageUrl, file);
                showToast('Imagen subida con éxito', 'success');
            } catch (err) {
                console.error(err);
                showToast('Error al subir imagen: ' + err.message, 'error');
            } finally {
                if (typeof onUploadEnd === 'function') {
                    onUploadEnd(file);
                }
            }
        } else {
            showToast('Por favor, arrastra solo archivos de imagen', 'warning');
        }
    }, false);
}

function initCarouselImageAdmin() {
    const form = document.getElementById('carousel-image-form');
    const fileInput = document.getElementById('carousel-file');
    const imageUrlInput = document.getElementById('carousel-image-url');
    const preview = document.getElementById('carousel-preview');
    const titleInput = document.getElementById('carousel-title');
    const descriptionInput = document.getElementById('carousel-description');
    const btn = document.getElementById('btn-save-carousel');
    if (!form || !fileInput || !imageUrlInput || !preview || !btn) return;

    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) {
            preview.innerHTML = '<span>Selecciona una imagen para previsualizarla</span>';
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            preview.innerHTML = `<img src="${reader.result}" alt="Preview carrusel">`;
        };
        reader.readAsDataURL(file);
    });

    imageUrlInput.addEventListener('input', () => {
        const url = imageUrlInput.value.trim();
        if (url) {
            preview.innerHTML = `<img src="${url}" alt="Preview carrusel" onerror="this.parentElement.innerHTML='<span>No se pudo cargar la URL</span>'">`;
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Guardando banner...';

        try {
            const file = fileInput.files?.[0];
            let imageUrl = imageUrlInput.value.trim();
            if (file) {
                btn.textContent = 'Subiendo imagen...';
                imageUrl = await uploadCarouselImage(file);
                imageUrlInput.value = imageUrl;
            }

            if (!imageUrl) {
                throw new Error('Sube una imagen o pega una URL');
            }

            const title = titleInput.value.trim() || 'BLYXU';
            const description = descriptionInput.value.trim() || 'Nueva imagen del carrusel de inicio';
            await postProductToGoogleSheets({
                'Nombre del Producto': title,
                Nombre: title,
                Categoria: 'BANNER',
                Precio: 0,
                'Precio Mayor': 0,
                'Stock Inicial': 1,
                Cantidad: 1,
                'Imagen Principal': imageUrl,
                Imagen: imageUrl,
                Color: description,
                'Caracteristicas del producto': description,
                Estilo: 'Ambos',
                Catalogo: 'Ambos',
                Estado: 'Activo'
            });

            showToast('Banner guardado para el carrusel de inicio');
            form.reset();
            preview.innerHTML = '<span>Selecciona una imagen para previsualizarla</span>';
            setTimeout(() => cargarInventario({ silent: true }), 2000);
        } catch (error) {
            console.error(error);
            showToast(error.message || 'No se pudo guardar el banner');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });

    // Configurar Drag & Drop para Banner
    setupDragAndDrop('carousel-preview', (url, file) => {
        imageUrlInput.value = url;
        const reader = new FileReader();
        reader.onload = () => {
            preview.innerHTML = `<img src="${reader.result}" alt="Preview carrusel">`;
        };
        reader.readAsDataURL(file);
    });
}

function initInventorySearch() {
    const input = document.getElementById('admin-inventory-search');
    if (!input) return;

    let searchTimer = null;
    input.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            adminInventorySearchQuery = input.value;
            renderInventoryInBatches();
        }, 180);
    });
}

function initInventoryActions() {
    const tbody = document.getElementById('inventory-tbody');
    if (!tbody || tbody.dataset.actionsReady === 'true') return;
    tbody.dataset.actionsReady = 'true';

    tbody.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-inventory-action]');
        if (!btn) return;

        const action = btn.dataset.inventoryAction;
        const key = btn.dataset.productKey || '';
        const motherId = btn.dataset.motherId || '';

        if (action === 'load-more') {
            loadMoreInventoryBatch();
            return;
        }

        if (action === 'toggle') {
            toggleVariants(motherId, btn);
            return;
        }

        if (action === 'edit') {
            const index = getInventoryIndexByKey(key);
            if (index === -1) {
                showToast('No se encontro el producto para editar', 'error');
                return;
            }
            editarProducto(index);
            return;
        }

        if (action === 'delete') {
            eliminarProductoPorClave(key);
            return;
        }

        if (action === 'delete-group') {
            eliminarGrupo(motherId);
        }
    });
}

function normalizeInventoryList(rawProducts) {
    return (Array.isArray(rawProducts) ? rawProducts : [])
        .map(normalizeGoogleProduct)
        .filter(function (p) {
            var estado = (p.Estado || '').toUpperCase();
            var nombre = (p.Nombre || p.Producto || '').toUpperCase();
            return estado !== 'ELIMINADO' && !nombre.includes('[ELIMINADO]');
        })
        .reverse();
}

function mergeSavedProductsIntoInventory(savedProducts) {
    var products = (Array.isArray(savedProducts) ? savedProducts : [savedProducts])
        .filter(Boolean)
        .map(normalizeGoogleProduct);

    if (!products.length) return;

    var byKey = new Map();
    products.concat(inventario || []).forEach(function (product) {
        var key = getInventoryProductKey(product);
        if (key && !byKey.has(key)) {
            byKey.set(key, product);
        }
    });

    inventario = Array.from(byKey.values());
    adminInventorySearchQuery = '';
    var searchInput = document.getElementById('admin-inventory-search');
    if (searchInput) searchInput.value = '';
    writeInventoryCache(inventario);
    renderInventoryInBatches();
}

function readInventoryCache() {
    try {
        var cached = JSON.parse(localStorage.getItem(INVENTORY_CACHE_KEY) || 'null');
        return cached && Array.isArray(cached.data) ? cached.data : [];
    } catch (e) {
        return [];
    }
}

function writeInventoryCache(list) {
    try {
        localStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify({
            savedAt: Date.now(),
            data: list
        }));
    } catch (e) {
        console.warn('No se pudo guardar cache de inventario:', e.message);
    }
}

function paintInventory(list) {
    const tbody = document.getElementById('inventory-tbody');
    inventario = Array.isArray(list) ? list : [];
    updateCategoryOptions();

    if (!tbody) return;

    if (inventario.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No hay productos en el inventario.</td></tr>';
        return;
    }

    renderInventoryInBatches();
}

async function cargarInventario(options) {
    options = options || {};
    const tbody = document.getElementById('inventory-tbody');
    const currentToken = ++inventoryFetchToken;
    const canKeepCurrentRows = inventario.length > 0 || options.silent === true;

    try {
        if (!canKeepCurrentRows) {
            var cachedList = readInventoryCache();
            if (cachedList.length) {
                paintInventory(cachedList);
            }
        }

        if (tbody && !canKeepCurrentRows && inventario.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;"><div style="display:flex;align-items:center;justify-content:center;gap:12px;"><div class="spinner" style="width:20px;height:20px;border-width:2px;"></div><span style="font-size:13px;color:rgba(255,255,255,0.4);">Cargando inventario...</span></div></td></tr>';
        }

        const res = await fetch(GOOGLE_SHEET_PRODUCTS_URL + '&_=' + Date.now(), {
            cache: 'no-store'
        });
        const data = await res.json();
        if (currentToken !== inventoryFetchToken) return;

        if (data && (data.status === 'error' || data.ok === false)) {
            throw new Error(data.message || data.error || 'Error del Apps Script');
        }

        var rawProducts = Array.isArray(data) ? data : (data.data || data.productos || []);
        var nextInventory = normalizeInventoryList(rawProducts);
        writeInventoryCache(nextInventory);
        paintInventory(nextInventory);
        return;
    } catch (err) {
        console.error("Error al cargar datos:", err);
        if (tbody && inventario.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#ff6b6b;">Error al cargar el inventario: ${err.message}</td></tr>`;
        } else {
            showToast('No se pudo actualizar inventario: ' + err.message, 'error');
        }
    }
}

function renderInventoryInBatches() {
    const tbody = document.getElementById('inventory-tbody');
    if (!tbody) return;

    inventoryRenderToken++;
    inventoryRenderedRows = 0;
    filteredInventario = getFilteredInventory();
    tbody.innerHTML = '';

    if (inventoryLoadMoreObserver) {
        inventoryLoadMoreObserver.disconnect();
        inventoryLoadMoreObserver = null;
    }

    if (!filteredInventario.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No se encontraron productos${adminInventorySearchQuery ? ' para tu busqueda' : ''}.</td></tr>`;
        return;
    }

    renderNextInventoryBatch(inventoryRenderToken);
}

function renderNextInventoryBatch(renderToken = inventoryRenderToken) {
    const tbody = document.getElementById('inventory-tbody');
    if (!tbody || renderToken !== inventoryRenderToken) return;

    tbody.querySelector('.inventory-load-more-row')?.remove();

    const start = inventoryRenderedRows;
    const end = Math.min(start + INVENTORY_BATCH_SIZE, filteredInventario.length);
    const rows = filteredInventario
        .slice(start, end)
        .map(item => inventoryRowTemplate(item.product, item.index, item))
        .join('');

    tbody.insertAdjacentHTML('beforeend', rows);
    inventoryRenderedRows = end;

    if (inventoryRenderedRows < filteredInventario.length) {
        tbody.insertAdjacentHTML('beforeend', `
            <tr class="inventory-load-more-row">
                <td colspan="7" style="text-align:center;padding:18px;">
                    <button class="admin-btn" type="button" data-inventory-action="load-more" style="max-width:240px;">Cargar mas productos</button>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:8px;">
                        Mostrando ${inventoryRenderedRows} de ${filteredInventario.length}
                    </div>
                </td>
            </tr>
        `);
        observeInventoryLoadMore(renderToken);
    }
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function cleanInventoryId(value) {
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

function getInventoryProductKey(product) {
    if (!product) return '';
    var key = product.idVariacion || product.ID || product['ID Variacion'] || product['ID Variación'] || product._rowIndex || '';
    if (!key) {
        if (!product._inventoryKey) product._inventoryKey = 'tmp-' + Math.random().toString(36).slice(2);
        key = product._inventoryKey;
    }
    return String(key);
}

function getInventoryIndexByKey(key) {
    key = String(key || '');
    return inventario.findIndex(function (product) {
        return getInventoryProductKey(product) === key;
    });
}

function getInventoryProductByKey(key) {
    var index = getInventoryIndexByKey(key);
    return index === -1 ? null : inventario[index];
}

function inventoryRowTemplate(p, index, itemMeta) {
    if (!itemMeta) itemMeta = {};
    const isChild = itemMeta.isChild;
    const groupSize = itemMeta.groupSize || 1;
    const motherId = itemMeta.motherId || (p.idProducto || p['ID Producto'] || 'desconocido');

    const isSearching = !!adminInventorySearchQuery;
    const displayStyle = (isChild && !isSearching) ? 'none' : 'table-row';
    const cleanMotherId = String(motherId).replace(/[^a-zA-Z0-9_-]/g, '');
    const rowClass = isChild ? 'variant-row mother-' + cleanMotherId : 'mother-row';

    if (!isChild) {
        var minP = itemMeta.minPrice || 0;
        var maxP = itemMeta.maxPrice || 0;
        if (!minP && !maxP) { minP = Number(p.Precio || 0); maxP = minP; }
        var priceStr = minP === maxP
            ? '$' + minP.toLocaleString('es-CO')
            : '$' + minP.toLocaleString('es-CO') + ' - $' + maxP.toLocaleString('es-CO');

        var stockTotal = itemMeta.totalStock;
        if (stockTotal === undefined) stockTotal = Number(p.Stock || p.Cantidad) || 0;
        var stockClass = stockTotal > 0 ? 'stock-positive' : 'stock-negative';
        var toggleBtnHtml = groupSize > 1
            ? '<button class="toggle-vars-btn" onclick="toggleVariants(\'' + cleanMotherId + '\', this)">Ver ' + (groupSize - 1) + ' Variantes ▼</button>'
            : '<span class="variant-count-badge">Producto Único</span>';

        var catStyle = 'background:rgba(155,44,250,0.15);color:#d946ef;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:700;display:inline-block;';

        var pIdVar = p.idVariacion || p.ID || p['ID Variacion'] || '';
        var badgeHtml = '<span class="mother-badge-id" title="ID Producto (Familia)">ID Prod: ' + motherId + '</span>';
        if (pIdVar && pIdVar !== motherId) {
            badgeHtml += ' <span class="variant-badge-id" title="ID Variación" style="margin-left:4px;">Var: ' + pIdVar + '</span>';
        }

        return '<tr class="' + rowClass + '">'
            + '<td><img src="' + (p.Imagen || 'Logo2.png') + '" width="46" height="46" loading="lazy" style="border-radius:8px;object-fit:cover;border:1px solid rgba(255,255,255,0.1);vertical-align:middle;" onerror="this.src=\'Logo2.png\'"></td>'
            + '<td><div style="font-weight:800;font-size:14px;color:#fff;">' + (p.Nombre || p.Producto || 'Producto General') + '</div>'
            + '<div style="font-size:10px;margin-top:5px;">' + badgeHtml
            + (groupSize > 1 ? ' <span class="variant-count-badge" style="margin-left:4px;">' + groupSize + ' variantes</span>' : '')
            + '</div></td>'
            + '<td><span style="' + catStyle + '">' + (p.Categoria || '-') + '</span></td>'
            + '<td style="font-weight:800;color:#fff;font-size:14px;">' + priceStr + '</td>'
            + '<td><div class="' + stockClass + '">' + stockTotal + '</div><div style="font-size:9px;color:rgba(255,255,255,0.35);font-weight:700;text-transform:uppercase;letter-spacing:1px;">en stock</div></td>'
            + '<td>' + toggleBtnHtml + '</td>'
            + '<td style="white-space:nowrap;"><button class="action-btn-edit" onclick="editarProducto(' + index + ')">Editar</button>'
            + ' <button class="action-btn-delete-sm" onclick="eliminarProducto(' + index + ')">🗑️</button>'
            + (groupSize > 1 ? ' <button class="action-btn-delete-sm" onclick="eliminarGrupo(\'' + cleanMotherId + '\')">Grupo</button>' : '')
            + '</td>'
            + '</tr>';
    } else {
        var stockVal = Number(p.Stock || p.Cantidad || 0);
        var catInfo = p.Color ? '<span style="font-size:11px;color:#9B2CFA;font-weight:600;">' + p.Color + '</span>' : '<span style="color:rgba(255,255,255,0.3);font-weight:500;">-</span>';
        var stockColor = stockVal > 0 ? '#10B981' : '#EF4444';

        return '<tr class="' + rowClass + '" style="display:' + displayStyle + ';">'
            + '<td><span class="tree-connector"></span><img src="' + (p.Imagen || 'Logo2.png') + '" width="30" height="30" loading="lazy" style="border-radius:4px;object-fit:cover;vertical-align:middle;" onerror="this.src=\'Logo2.png\'"></td>'
            + '<td><div style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.7);">' + (p.Nombre || p.Producto || '') + '</div>'
            + '<div style="font-size:10px;margin-top:3px;"><span class="mother-badge-id" style="font-size:9px;">' + motherId + '</span>'
            + ' <span class="variant-badge-id">' + (p.idVariacion || p.ID || '-') + '</span>'
            + '</div></td>'
            + '<td>' + catInfo + '</td>'
            + '<td style="font-size:13px;color:rgba(255,255,255,0.85);font-weight:700;">$' + Number(p.Precio || 0).toLocaleString('es-CO') + '</td>'
            + '<td><span style="font-size:12px;font-weight:700;color:' + stockColor + ';">' + stockVal + ' und.</span></td>'
            + '<td><span style="font-size:10px;color:rgba(255,255,255,0.4);font-weight:600;">' + (p.Catalogo || 'Ambos') + '</span></td>'
            + '<td><button class="action-btn-edit-sm" onclick="editarProducto(' + index + ')">Editar</button>'
            + ' <button class="action-btn-delete-sm" onclick="eliminarProducto(' + index + ')">Borrar</button></td>'
            + '</tr>';
    }
}

function inventoryRowTemplate(p, index, itemMeta) {
    if (!itemMeta) itemMeta = {};
    var isChild = !!itemMeta.isChild;
    var groupSize = itemMeta.groupSize || 1;
    var motherId = itemMeta.motherId || p.idProducto || p['ID Producto'] || p.idVariacion || p.ID || 'sin-id';
    var cleanMotherId = cleanInventoryId(motherId);
    var rowClass = isChild ? 'variant-row mother-' + cleanMotherId : 'mother-row';
    var productKey = escapeHtml(getInventoryProductKey(p));
    var displayStyle = isChild && !adminInventorySearchQuery ? 'none' : 'table-row';
    var stockVal = Number(p.Stock || p.Cantidad || 0) || 0;
    var stockTotal = itemMeta.totalStock === undefined ? stockVal : itemMeta.totalStock;
    var stockClass = stockTotal > 0 ? 'stock-positive' : 'stock-negative';
    var image = escapeHtml(p.Imagen || 'Logo2.png');
    var name = escapeHtml(p.Nombre || p.Producto || 'Producto General');
    var category = escapeHtml(p.Categoria || p.Color || '-');
    var idVar = p.idVariacion || p.ID || p['ID Variacion'] || p['ID Variación'] || '';
    var price = Number(p.Precio || 0) || 0;
    var minP = Number(itemMeta.minPrice || price) || 0;
    var maxP = Number(itemMeta.maxPrice || price) || 0;
    var priceStr = minP && maxP && minP !== maxP
        ? '$' + minP.toLocaleString('es-CO') + ' - $' + maxP.toLocaleString('es-CO')
        : '$' + (maxP || minP || price).toLocaleString('es-CO');
    var catStyle = 'background:rgba(155,44,250,0.15);color:#d946ef;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:700;display:inline-block;';

    if (!isChild) {
        var toggleBtnHtml = groupSize > 1
            ? '<button class="toggle-vars-btn" type="button" data-inventory-action="toggle" data-mother-id="' + escapeHtml(cleanMotherId) + '">Ver ' + (groupSize - 1) + ' Variantes</button>'
            : '<span class="variant-count-badge">Producto Unico</span>';
        var badgeHtml = '<span class="mother-badge-id" title="ID Producto">ID Prod: ' + escapeHtml(motherId) + '</span>';
        if (idVar && idVar !== motherId) {
            badgeHtml += ' <span class="variant-badge-id" title="ID Variacion" style="margin-left:4px;">Var: ' + escapeHtml(idVar) + '</span>';
        }

        return '<tr class="' + rowClass + '" data-product-key="' + productKey + '">'
            + '<td><img src="' + image + '" width="46" height="46" loading="lazy" style="border-radius:8px;object-fit:cover;border:1px solid rgba(255,255,255,0.1);vertical-align:middle;" onerror="this.src=\'Logo2.png\'"></td>'
            + '<td><div style="font-weight:800;font-size:14px;color:#fff;">' + name + '</div>'
            + '<div style="font-size:10px;margin-top:5px;">' + badgeHtml
            + (groupSize > 1 ? ' <span class="variant-count-badge" style="margin-left:4px;">' + groupSize + ' variantes</span>' : '')
            + '</div></td>'
            + '<td><span style="' + catStyle + '">' + category + '</span></td>'
            + '<td style="font-weight:800;color:#fff;font-size:14px;">' + priceStr + '</td>'
            + '<td><div class="' + stockClass + '">' + stockTotal + '</div><div style="font-size:9px;color:rgba(255,255,255,0.35);font-weight:700;text-transform:uppercase;letter-spacing:1px;">en stock</div></td>'
            + '<td>' + toggleBtnHtml + '</td>'
            + '<td style="white-space:nowrap;"><button class="action-btn-edit" type="button" data-inventory-action="edit" data-product-key="' + productKey + '">Editar</button>'
            + ' <button class="action-btn-delete-sm" type="button" data-inventory-action="delete" data-product-key="' + productKey + '">Borrar</button>'
            + (groupSize > 1 ? ' <button class="action-btn-delete-sm" type="button" data-inventory-action="delete-group" data-mother-id="' + escapeHtml(cleanMotherId) + '">Grupo</button>' : '')
            + '</td></tr>';
    }

    return '<tr class="' + rowClass + '" data-product-key="' + productKey + '" style="display:' + displayStyle + ';">'
        + '<td><span class="tree-connector"></span><img src="' + image + '" width="30" height="30" loading="lazy" style="border-radius:4px;object-fit:cover;vertical-align:middle;" onerror="this.src=\'Logo2.png\'"></td>'
        + '<td><div style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.7);">' + name + '</div>'
        + '<div style="font-size:10px;margin-top:3px;"><span class="mother-badge-id" style="font-size:9px;">' + escapeHtml(motherId) + '</span>'
        + ' <span class="variant-badge-id">' + escapeHtml(idVar || '-') + '</span></div></td>'
        + '<td><span style="font-size:11px;color:#9B2CFA;font-weight:600;">' + category + '</span></td>'
        + '<td style="font-size:13px;color:rgba(255,255,255,0.85);font-weight:700;">$' + price.toLocaleString('es-CO') + '</td>'
        + '<td><span style="font-size:12px;font-weight:700;color:' + (stockVal > 0 ? '#10B981' : '#EF4444') + ';">' + stockVal + ' und.</span></td>'
        + '<td><span style="font-size:10px;color:rgba(255,255,255,0.4);font-weight:600;">' + escapeHtml(p.Catalogo || 'Ambos') + '</span></td>'
        + '<td><button class="action-btn-edit-sm" type="button" data-inventory-action="edit" data-product-key="' + productKey + '">Editar</button>'
        + ' <button class="action-btn-delete-sm" type="button" data-inventory-action="delete" data-product-key="' + productKey + '">Borrar</button></td>'
        + '</tr>';
}

var inventoryLoadingMore = false;
function loadMoreInventoryBatch() {
    if (inventoryLoadingMore) return;
    inventoryLoadingMore = true;
    var btn = document.querySelector('.inventory-load-more-row .admin-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Cargando...'; }
    renderNextInventoryBatch();
    inventoryLoadingMore = false;
}

function observeInventoryLoadMore(renderToken) {
    const marker = document.querySelector('.inventory-load-more-row');
    if (!marker || !('IntersectionObserver' in window)) return;

    if (inventoryLoadMoreObserver) {
        inventoryLoadMoreObserver.disconnect();
    }

    inventoryLoadMoreObserver = new IntersectionObserver(entries => {
        if (renderToken !== inventoryRenderToken) {
            inventoryLoadMoreObserver.disconnect();
            return;
        }

        if (entries.some(entry => entry.isIntersecting)) {
            inventoryLoadMoreObserver.disconnect();
            renderNextInventoryBatch(renderToken);
        }
    }, { rootMargin: '250px' });

    inventoryLoadMoreObserver.observe(marker);
}

function cargarVariantesAlFormulario(idProducto, idVariacionActual) {
    var container = document.getElementById('variants-container');
    if (!container) return;
    container.innerHTML = '';
    if (!idProducto) return;

    var variantes = inventario.filter(function (prod) {
        var mid = prod.idProducto || prod['ID Producto'] || '';
        var vid = prod.idVariacion || prod.ID || prod['ID Variacion'] || '';
        return mid === idProducto && vid !== idVariacionActual;
    });

    if (!variantes.length) {
        container.innerHTML = '<div style="padding:16px;text-align:center;font-size:12px;color:rgba(255,255,255,0.3);border:1px dashed rgba(255,165,0,0.2);border-radius:12px;">Este producto no tiene variantes aún</div>';
        return;
    }

    var tableHtml = '<div style="margin-bottom:12px;"><h4 style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#FFA500;font-weight:800;margin:0;padding:0 4px 10px;">🔸 VARIANTES DE ESTE ID (' + variantes.length + ')</h4></div>';
    tableHtml += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:separate;border-spacing:0 4px;font-size:11px;">';
    tableHtml += '<thead><tr style="color:rgba(255,255,255,0.25);font-size:9px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">';
    tableHtml += '<th style="padding:4px 8px;text-align:left;">ID Var</th><th style="padding:4px 8px;text-align:left;">Color</th><th style="padding:4px 8px;text-align:left;">Stock</th><th style="padding:4px 8px;text-align:left;">Precio</th><th style="padding:4px 8px;text-align:left;">SKU</th><th style="padding:4px 8px;text-align:center;">Acción</th>';
    tableHtml += '</tr></thead><tbody>';

    variantes.forEach(function (v) {
        var vid = v.idVariacion || v.ID || '-';
        var vColor = v.Color || '-';
        var vStock = v.Stock || v.Cantidad || 0;
        var vPrecio = Number(v.Precio || 0).toLocaleString('es-CO');
        var vSku = v.SKU || '-';
        tableHtml += '<tr class="var-edit-row" data-varid="' + vid + '">';
        tableHtml += '<td style="padding:6px 8px;background:rgba(255,255,255,0.02);border-radius:6px 0 0 6px;font-weight:700;color:#FFA500;white-space:nowrap;">' + vid + '</td>';
        tableHtml += '<td style="padding:6px 8px;background:rgba(255,255,255,0.02);color:#fff;">' + vColor + '</td>';
        tableHtml += '<td style="padding:6px 8px;background:rgba(255,255,255,0.02);font-weight:700;color:' + (vStock > 0 ? '#10B981' : '#EF4444') + ';">' + vStock + '</td>';
        tableHtml += '<td style="padding:6px 8px;background:rgba(255,255,255,0.02);color:#9B2CFA;font-weight:700;">$' + vPrecio + '</td>';
        tableHtml += '<td style="padding:6px 8px;background:rgba(255,255,255,0.02);color:rgba(255,255,255,0.5);">' + vSku + '</td>';
        tableHtml += '<td style="padding:6px 8px;background:rgba(255,255,255,0.02);border-radius:0 6px 6px 0;text-align:center;"><button class="admin-btn secondary" style="width:auto;padding:3px 10px;font-size:9px;border-radius:6px;" onclick="expandirVarianteEdicion(\'' + vid + '\')">Editar</button></td>';
        tableHtml += '</tr>';

        // Hidden expanded edit row
        tableHtml += '<tr class="var-edit-expanded" id="var-expand-' + vid + '" style="display:none;"><td colspan="6" style="padding:12px 16px;background:rgba(255,165,0,0.03);border-radius:8px;border-left:2px solid #FFA500;">';
        tableHtml += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px;">';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">ID</label><input class="form-control ve-id" value="' + vid + '" style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Color</label><input class="form-control ve-color" value="' + (vColor !== '-' ? vColor : '') + '" style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Stock</label><input type="number" class="form-control ve-stock" value="' + vStock + '" style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Precio</label><input class="form-control ve-precio" value="' + (v.Precio || '') + '" style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">SKU</label><input class="form-control ve-sku" value="' + (v.SKU || '') + '" style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Imagen URL</label><input class="form-control ve-imagen" value="' + (v.Imagen || '') + '" style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '</div>';
        tableHtml += '<div style="display:flex;gap:8px;"><button class="admin-btn" onclick="guardarVarianteEditada(\'' + vid + '\',\'' + idProducto + '\')" style="width:auto;padding:6px 16px;font-size:10px;background:linear-gradient(135deg,#FFA500,#FF6347);">Guardar cambios</button>';
        tableHtml += '<button class="admin-btn secondary" onclick="cerrarVarianteEdicion(\'' + vid + '\')" style="width:auto;padding:6px 16px;font-size:10px;">Cancelar</button></div>';
        tableHtml += '</td></tr>';
    });

    tableHtml += '</tbody></table></div>';
    container.innerHTML = tableHtml;
}

window.expandirVarianteEdicion = function (vid) {
    var row = document.getElementById('var-expand-' + vid);
    if (row) row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
};
window.cerrarVarianteEdicion = function (vid) {
    var row = document.getElementById('var-expand-' + vid);
    if (row) row.style.display = 'none';
};
window.guardarVarianteEditada = async function (vid, idProducto) {
    var row = document.getElementById('var-expand-' + vid);
    if (!row) return;
    var data = {
        'ID Variacion': row.querySelector('.ve-id').value,
        'ID Producto': idProducto,
        'Nombre del Producto': getInputValue('prod-nombre'),
        Nombre: getInputValue('prod-nombre'),
        Categoria: getInputValue('prod-categoria'),
        'Categoría': getInputValue('prod-categoria'),
        Precio: parseAmount(row.querySelector('.ve-precio').value || getInputValue('prod-precio')),
        'Precio Mayor': parseAmount(getInputValue('prod-precio-mayorista')),
        Cantidad: Number(row.querySelector('.ve-stock').value || 0),
        'Stock Inicial': Number(row.querySelector('.ve-stock').value || 0),
        Descripcion: getInputValue('prod-descripcion'),
        Color: row.querySelector('.ve-color').value,
        SKU: row.querySelector('.ve-sku').value,
        Imagen: row.querySelector('.ve-imagen').value || getInputValue('prod-imagen'),
        'Imagen Principal': row.querySelector('.ve-imagen').value || getInputValue('prod-imagen'),
        Catalogo: getInputValue('prod-catalogo') || 'Ambos',
        Estado: getInputValue('prod-estado') || 'Activo'
    };
    try {
        await postProductToGoogleSheets(data, true);
        showToast('Variante actualizada', 'success');
        cerrarVarianteEdicion(vid);
        setTimeout(function () { cargarInventario({ silent: true }); }, 1000);
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
};

window.guardarGrupoCompleto = async function (idProducto) {
    showToast('Guardando grupo completo...');

    // 1. Save mother product
    var motherData = buildProductPayload();
    try {
        await postProductToGoogleSheets(motherData, Boolean(motherData['ID Variacion']));
    } catch (err) {
        showToast('Error guardando producto madre: ' + err.message, 'error');
        return;
    }

    // 2. Save all visible expanded variants
    var expandedRows = document.querySelectorAll('.var-edit-expanded[style*="table-row"]');
    var saved = 0;
    var errors = 0;
    for (var i = 0; i < expandedRows.length; i++) {
        var row = expandedRows[i];
        var vid = row.querySelector('.ve-id')?.value || '';
        var vdata = {
            'ID Variacion': vid,
            'ID Producto': idProducto,
            'Nombre del Producto': getInputValue('prod-nombre'),
            Nombre: getInputValue('prod-nombre'),
            Categoria: getInputValue('prod-categoria'),
            'Categoría': getInputValue('prod-categoria'),
            Precio: parseAmount(row.querySelector('.ve-precio')?.value || getInputValue('prod-precio')),
            'Precio Mayor': parseAmount(getInputValue('prod-precio-mayorista')),
            Cantidad: Number(row.querySelector('.ve-stock')?.value || 0),
            'Stock Inicial': Number(row.querySelector('.ve-stock')?.value || 0),
            Descripcion: getInputValue('prod-descripcion'),
            Color: row.querySelector('.ve-color')?.value || '',
            SKU: row.querySelector('.ve-sku')?.value || '',
            Imagen: row.querySelector('.ve-imagen')?.value || getInputValue('prod-imagen'),
            'Imagen Principal': row.querySelector('.ve-imagen')?.value || getInputValue('prod-imagen'),
            Catalogo: getInputValue('prod-catalogo') || 'Ambos',
            Estado: getInputValue('prod-estado') || 'Activo'
        };
        try {
            await postProductToGoogleSheets(vdata, true);
            saved++;
        } catch (e) {
            errors++;
        }
    }

    showToast('Grupo guardado: madre + ' + saved + ' variante(s)' + (errors ? ' (' + errors + ' error(es))' : ''), errors ? 'error' : 'success');
    setTimeout(function () { cargarInventario({ silent: true }); }, 1500);
};

function editarProducto(index) {
    var p = inventario[index];
    var idVar = p.idVariacion || p.ID || p['ID Variacion'] || p['ID VariaciÃ³n'] || '';
    var idProd = p.idProducto || p['ID Producto'] || '';
    var isVariant = idProd && idVar && idProd !== idVar;

    setInputValue('prod-id', idVar);
    setMotherProductId(idProd);
    document.getElementById('prod-nombre').value = p.Nombre || p.Producto || '';
    document.getElementById('prod-categoria').value = p.Categoria || '';
    document.getElementById('prod-precio').value = p.Precio || '';
    document.getElementById('prod-precio-mayorista').value = p.Precio_Mayorista || p.precio_mayorista || p.Mayorista || '';
    document.getElementById('prod-catalogo').value = p.Catalogo || p.catalogo || 'Ambos';
    document.getElementById('prod-stock').value = p.Stock || p.Cantidad || '';
    document.getElementById('prod-imagen').value = p.Imagen || '';
    document.getElementById('prod-color').value = p.Color || '';
    setInputValue('prod-stock-inicial', p.Stock_Inicial || p['Stock Inicial'] || p.Stock || p.Cantidad || '');
    setInputValue('prod-descripcion', p.Descripcion || p['Caracteristicas del producto'] || '');
    setInputValue('prod-tamano', p.Tamano || p['Tamano'] || '');
    setInputValue('prod-estilo', p.Estilo || '');
    
    var isPromo = String(p.Promocion || '').toUpperCase() === 'VERDADERO' || String(p.Promocion || '').toLowerCase() === 'true';
    var promoCheck = document.getElementById('prod-promocion');
    if (promoCheck) promoCheck.checked = isPromo;

    setInputValue('prod-galeria', p.Galeria || p['Galeria JSON'] || '');
    setInputValue('prod-sku', p.SKU || '');
    setInputValue('prod-estado', p.Estado || 'Activo');
    setInputValue('prod-fecha-creacion', p.Fecha_Creacion || p['Fecha de Creacion'] || '');
    setProductFormMode(true);
    updateLivePreview();

    var variantBadge = document.getElementById('variant-editing-badge');
    if (!variantBadge) {
        var titleRow = document.querySelector('.admin-title-row');
        if (titleRow) {
            variantBadge = document.createElement('span');
            variantBadge.id = 'variant-editing-badge';
            variantBadge.style.cssText = 'font-size:10px;padding:4px 10px;border-radius:8px;font-weight:700;margin-left:8px;';
            titleRow.querySelector('h2')?.after(variantBadge);
        }
    }
    if (variantBadge) {
        if (isVariant) {
            variantBadge.textContent = '⚡ VARIANTE (' + idVar + ')';
            variantBadge.style.background = 'rgba(255,165,0,0.2)';
            variantBadge.style.color = '#FFA500';
            variantBadge.style.display = 'inline';
        } else {
            variantBadge.textContent = '⭐ PRODUCTO PRINCIPAL (' + idProd + ')';
            variantBadge.style.background = 'rgba(155,44,250,0.2)';
            variantBadge.style.color = '#9B2CFA';
            variantBadge.style.display = 'inline';
        }
    }

    if (idProd) {
        cargarVariantesAlFormulario(idProd, idVar);
        // Add "Guardar Grupo" button if not already present
        var saveGroupBtn = document.getElementById('btn-save-group');
        if (!saveGroupBtn) {
            var formFooter = document.querySelector('#product-form > div:last-child');
            if (formFooter) {
                var newBtn = document.createElement('button');
                newBtn.type = 'button';
                newBtn.className = 'admin-btn';
                newBtn.id = 'btn-save-group';
                newBtn.style.cssText = 'background:linear-gradient(135deg,#FFA500,#FF6347);margin-top:12px;';
                newBtn.textContent = '💾 Guardar Grupo Completo (Madre + Variantes)';
                newBtn.addEventListener('click', function () { guardarGrupoCompleto(idProd); });
                formFooter.parentNode.insertBefore(newBtn, formFooter.nextSibling);
            }
        }
    } else {
        var oldBtn = document.getElementById('btn-save-group');
        if (oldBtn) oldBtn.remove();
    }

    // MOVER EL FORMULARIO AL MODAL INDEPENDIENTE EN LUGAR DE CAMBIAR DE VISTA
    var modal = document.getElementById('edit-product-modal');
    var contentArea = document.getElementById('edit-modal-content-area');
    var viewProducts = document.getElementById('view-products');
    var gridSplit = viewProducts?.querySelector('.grid-split');

    if (modal && contentArea && gridSplit) {
        contentArea.appendChild(gridSplit);
        modal.style.display = 'flex';
        // Desplazarse arriba del modal
        modal.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        // Fallback al comportamiento original si no hay modal
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (typeof switchDashboardView === 'function') {
            switchDashboardView('products', 'Gestión de Productos');
        }
    }
}

window.cerrarModalEdicion = function () {
    var modal = document.getElementById('edit-product-modal');
    if (modal) modal.style.display = 'none';
    var contentArea = document.getElementById('edit-modal-content-area');
    var viewProducts = document.getElementById('view-products');
    if (contentArea && viewProducts && contentArea.firstElementChild) {
        viewProducts.appendChild(contentArea.firstElementChild);
    }
    resetProductForm();
};

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('edit-product-modal')?.addEventListener('click', function (e) {
        if (e.target === this) {
            cerrarModalEdicion();
        }
    });
});

// Limpiar formato de dinero para que la DB no se corrompa entre Precio y Stock
function parseAmount(val) {
    if (!val) return 0;
    return parseInt(String(val).replace(/[^0-9]/g, ''), 10) || 0;
}


// Modal de confirmación
var modalConfirmCallback = null;
var modalCancelCallback = null;
function showModal(title, body, confirmText, onConfirm, onCancel) {
    var el = document.getElementById('confirm-modal');
    if (!el) return;
    document.getElementById('modal-title').textContent = title || 'Confirmar';
    document.getElementById('modal-body').textContent = body || '¿Estás seguro?';
    var btn = document.getElementById('modal-confirm-btn');
    btn.textContent = confirmText || 'Eliminar';
    modalConfirmCallback = onConfirm || null;
    modalCancelCallback = onCancel || null;
    el.style.display = 'flex';
}
function closeModal() {
    var el = document.getElementById('confirm-modal');
    if (el) el.style.display = 'none';
    modalConfirmCallback = null;
    modalCancelCallback = null;
}
document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('modal-confirm-btn')?.addEventListener('click', function () {
        var cb = modalConfirmCallback;
        closeModal();
        if (cb) cb();
    });
    document.getElementById('modal-cancel-btn')?.addEventListener('click', function () {
        if (modalCancelCallback) modalCancelCallback();
        closeModal();
    });
    document.getElementById('confirm-modal')?.addEventListener('click', function (e) {
        if (e.target === this) {
            if (modalCancelCallback) modalCancelCallback();
            closeModal();
        }
    });
});

async function delFromSheet(id, idProd, rowMeta) {
    var rowIndex = rowMeta && rowMeta.rowIndex ? rowMeta.rowIndex : 0;
    if (!id && !idProd && !rowIndex) throw new Error('No hay ID para eliminar');
    var lastError = 'Google Sheets no confirmo el borrado fisico';

    var deleteStrategies = [
        {
            resource: 'productos',
            action: 'delete_product',
            id: id,
            ID_Producto: idProd,
            'ID Variacion': id,
            'ID Variación': id
        },
        {
            resource: 'productos',
            action: 'delete',
            id: id,
            ID_Producto: idProd,
            'ID Variacion': id,
            'ID Variación': id
        },
        {
            resource: 'productos',
            action: 'eliminar',
            id: id,
            ID_Producto: idProd,
            'ID Variacion': id,
            'ID Variación': id
        }
    ];

    if (rowMeta) {
        deleteStrategies.forEach(function (p) {
            if (rowMeta.nombre) p.nombre = rowMeta.nombre;
            if (!id && rowMeta.rowIndex) p._rowIndex = rowMeta.rowIndex;
        });
    }

    for (var i = 0; i < deleteStrategies.length; i++) {
        try {
            var res = await fetch(GOOGLE_SHEET_API, {
                method: 'POST',
                body: JSON.stringify(deleteStrategies[i])
            });
            var result = await res.json();
            if (result && (result.deleted > 0 || result.status === 'success' || result.ok === true)) {
                console.log('Producto eliminado fisicamente de Google Sheets');
                return true;
            }
            lastError = result?.error || result?.message || lastError;
        } catch (e) {
            lastError = e.message || lastError;
            console.warn('Delete strategy ' + i + ' failed:', e.message);
        }
    }

    throw new Error('No se pudo borrar fisicamente de Google Sheets: ' + lastError);
}

async function eliminarProducto(index) {
    var p = inventario[index];
    if (!p) { showToast('Error: producto no encontrado en el índice ' + index, 'error'); return; }
    var idVar = p.idVariacion || p.ID || p['ID Variacion'] || p['ID Variación'] || '';
    var idProd = p.idProducto || p['ID Producto'] || idVar;
    var nombre = p.Nombre || p.Producto || 'este producto';
    var rowIndex = p._rowIndex || 0;

    if (!idVar && !nombre) { showToast('Error: producto sin ID ni Nombre', 'error'); return; }

    showModal(
        'Eliminar Producto',
        '¿Eliminar permanentemente "' + nombre + '"' + (idVar ? ' (ID: ' + idVar + ')' : '') + '?',
        'Sí, eliminar',
        async function () {
            showToast('Eliminando "' + nombre + '"...');
            try {
                await delFromSheet(idVar, idProd, { nombre: nombre, rowIndex: rowIndex });
                showToast('✅ Producto "' + nombre + '" eliminado correctamente', 'success');
                // Remove the row visually immediately for better UX
                inventario.splice(index, 1);
                writeInventoryCache(inventario);
                renderInventoryInBatches();
                // Reload from server to sync
                setTimeout(function () { cargarInventario({ silent: true }); }, 2000);
            } catch (err) {
                console.error('Error eliminando producto:', err);
                showToast('❌ Error al eliminar: ' + err.message, 'error');
            }
        }
    );
}

async function eliminarProductoPorClave(key) {
    var p = getInventoryProductByKey(key);
    if (!p) {
        showToast('Error: producto no encontrado para borrar', 'error');
        return;
    }

    var idVar = p.idVariacion || p.ID || p['ID Variacion'] || p['ID Variación'] || '';
    var idProd = p.idProducto || p['ID Producto'] || idVar;
    var nombre = p.Nombre || p.Producto || 'este producto';
    var rowIndex = p._rowIndex || 0;
    var productKey = getInventoryProductKey(p);

    if (!idVar && !rowIndex && !nombre) {
        showToast('Error: producto sin ID para eliminar', 'error');
        return;
    }

    showModal(
        'Eliminar Producto',
        'Eliminar permanentemente "' + nombre + '"' + (idVar ? ' (ID: ' + idVar + ')' : '') + '?',
        'Si, eliminar',
        async function () {
            showToast('Eliminando "' + nombre + '"...');
            try {
                await delFromSheet(idVar, idProd, { nombre: nombre, rowIndex: rowIndex });
                inventario = inventario.filter(function (item) {
                    return getInventoryProductKey(item) !== productKey;
                });
                writeInventoryCache(inventario);
                renderInventoryInBatches();
                showToast('Producto "' + nombre + '" eliminado correctamente', 'success');
                setTimeout(function () { cargarInventario({ silent: true }); }, 1200);
            } catch (err) {
                console.error('Error eliminando producto:', err);
                showToast('Error al eliminar: ' + err.message, 'error');
            }
        }
    );
}

async function eliminarGrupo(motherIdClean) {
    showModal(
        'Eliminar Grupo Completo',
        '¿Eliminar TODAS las variantes de este grupo (ID: ' + motherIdClean + ')?',
        'Sí, eliminar grupo',
        async function () {
            showToast('Eliminando grupo...');
            var variants = inventario.filter(function (p) {
                var mid = p.idProducto || p['ID Producto'] || '';
                var vid = p.idVariacion || p.ID || p['ID Variacion'] || '';
                return cleanInventoryId(mid) === motherIdClean || cleanInventoryId(vid) === motherIdClean;
            });
            if (variants.length === 0) { showToast('No se encontraron productos del grupo', 'error'); return; }
            var errors = 0;
            var lastErr = '';
            for (var i = 0; i < variants.length; i++) {
                try {
                    var v = variants[i];
                    var vId = v.idVariacion || v.ID || v['ID Variacion'] || v['ID Variación'] || '';
                    if (!vId) continue;
                    await delFromSheet(vId, motherIdClean, { nombre: v.Nombre || v.Producto || '', rowIndex: v._rowIndex || 0 });
                } catch (e) { errors++; lastErr = e.message; }
            }
            if (errors === 0) {
                showToast('Grupo eliminado (' + variants.length + ' productos)', 'success');
            } else if (errors === variants.length) {
                showToast('Error en todo el grupo: ' + lastErr, 'error');
            } else {
                showToast('Grupo: ' + (variants.length - errors) + ' ok, ' + errors + ' error(es)', 'warning');
            }
            if (errors < variants.length) {
                var deletedKeys = new Set(variants.map(function (item) { return getInventoryProductKey(item); }));
                inventario = inventario.filter(function (item) {
                    return !deletedKeys.has(getInventoryProductKey(item));
                });
                writeInventoryCache(inventario);
                renderInventoryInBatches();
                setTimeout(function () { cargarInventario({ silent: true }); }, 1000);
            }
        }
    );
}

function showToast(msg, type) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast';
    if (type) t.classList.add(type);
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 3000);
}

function switchDashboardView(viewId, title) {
    document.querySelectorAll('.dashboard-section').forEach(function (el) { el.classList.remove('active'); });
    document.querySelectorAll('.sidebar-btn').forEach(function (el) { el.classList.remove('active'); });
    var target = document.getElementById('view-' + viewId);
    if (target) target.classList.add('active');
    var btn = document.querySelector('.sidebar-btn[onclick*="' + viewId + '"]');
    if (btn) btn.classList.add('active');
    var titleEl = document.getElementById('current-section-title');
    if (titleEl) titleEl.textContent = title || 'Panel';
    var area = document.querySelector('.dashboard-content-area');
    if (area) area.scrollTop = 0;

    if (viewId === 'orders') {
        cargarPedidos();
    }
}

// === LÓGICA DE PEDIDOS Y FACTURACIÓN DIGITAL ===
window.pedidosList = [];

async function cargarPedidos() {
    const tbody = document.getElementById('orders-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 40px;">Sincronizando pedidos...</td></tr>';
    
    try {
        const response = await fetch(GOOGLE_SHEET_API + "?resource=pedidos&action=get");
        const result = await response.json();
        if (result && result.status === 'success' && result.data) {
            window.pedidosList = result.data.reverse(); // Más recientes primero
            renderPedidos();
        } else {
            throw new Error(result.error || 'Error al cargar los pedidos');
        }
    } catch (err) {
        console.error(err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 40px; color: #ff4d4d;">Error conectando con la base de datos: ${err.message}</td></tr>`;
        showToast('Error cargando pedidos', 'error');
    }
}

function renderPedidos() {
    const tbody = document.getElementById('orders-tbody');
    if (!tbody) return;

    if (window.pedidosList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 40px;">No hay pedidos registrados.</td></tr>';
        return;
    }

    const html = window.pedidosList.map((p, idx) => {
        const id = p['ID Pedido'] || p.ID || '-';
        const fecha = p.Fecha || '-';
        const cliente = p['Nombre Cliente'] || p.Nombre || '-';
        const total = parseFloat(p.Subtotal || p.Total || 0);
        const estado = p['Estado Pedido'] || p.Estado || 'Pendiente';
        
        let colorEstado = '#9ca3af';
        if(estado.toLowerCase().includes('completado') || estado.toLowerCase().includes('enviado')) colorEstado = '#10B981';
        if(estado.toLowerCase().includes('cancelado')) colorEstado = '#EF4444';

        return `
            <tr style="background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="font-weight:700;">${id}</td>
                <td style="font-size:12px; color:var(--text-muted);">${new Date(fecha).toLocaleDateString()}</td>
                <td style="font-weight:600;">${cliente} <br><span style="font-size:10px; color:var(--primary);">${p['Teléfono'] || p.Telefono || ''}</span></td>
                <td style="font-weight:800; color:#fff;">$${total.toLocaleString('es-CO')}</td>
                <td><span style="background:rgba(255,255,255,0.1); color:${colorEstado}; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:700;">${estado}</span></td>
                <td>
                    <button class="action-btn" onclick="abrirEditorFactura(${idx})" style="background:rgba(155,44,250,0.8); color:#fff; width:100%; justify-content:center;">Ver / Editar Factura</button>
                </td>
            </tr>
        `;
    }).join('');
    
    tbody.innerHTML = html;
}

// === CREADOR Y EDITOR DE FACTURAS ===
window.invoiceItems = [];
window.invoiceEditIndex = null; // null si es nueva, o el index de pedidosList

window.abrirEditorFactura = function(idx = null) {
    window.invoiceItems = [];
    window.invoiceEditIndex = idx;
    
    document.getElementById('inv-edit-nombre').value = '';
    document.getElementById('inv-edit-tel').value = '';
    document.getElementById('inv-edit-dir').value = '';
    document.getElementById('inv-edit-ciudad').value = '';
    document.getElementById('inv-product-search').value = '';
    document.getElementById('inv-search-results').classList.remove('active');
    
    if (idx !== null) {
        // Editando existente
        const p = window.pedidosList[idx];
        document.getElementById('inv-editor-title').textContent = 'Editar Factura: ' + (p['ID Pedido'] || p.ID);
        document.getElementById('inv-edit-id').value = p['ID Pedido'] || p.ID;
        
        document.getElementById('inv-edit-nombre').value = p['Nombre Cliente'] || p.Nombre || '';
        document.getElementById('inv-edit-tel').value = p['Teléfono'] || p.Telefono || '';
        document.getElementById('inv-edit-dir').value = p['Dirección'] || p.Direccion || '';
        document.getElementById('inv-edit-ciudad').value = p.Ciudad || '';
        
        try {
            const jsonStr = p['Productos JSON'] || p.Productos;
            let items = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : (Array.isArray(jsonStr) ? jsonStr : []);
            window.invoiceItems = items.map(i => ({
                idVariacion: i.idVariacion || i.id || i.sku || Date.now(),
                nombre: i.nombre || i.Nombre || i.Producto || 'Producto',
                sku: i.sku || i.id || '',
                cantidad: parseInt(i.cantidad || i.Cantidad || i.qty || 1),
                precio: parseFloat(i.precio || i.Precio || 0)
            }));
        } catch(e) { console.error("Error cargando ítems", e); }
    } else {
        // Nueva
        document.getElementById('inv-editor-title').textContent = 'Nueva Factura';
        document.getElementById('inv-edit-id').value = '';
    }
    
    renderItemsFactura();
    document.getElementById('invoice-editor-modal').classList.add('open');
};

// Buscador Inteligente
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('inv-product-search');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        const resultsContainer = document.getElementById('inv-search-results');
        
        if (q.length < 2) {
            resultsContainer.classList.remove('active');
            return;
        }
        
        const results = inventario.filter(p => {
            if (String(p.Categoria || '').toLowerCase() === 'banner') return false;
            const str = (p.Nombre + ' ' + (p.SKU || '') + ' ' + (p.Categoria || '')).toLowerCase();
            return str.includes(q);
        }).slice(0, 10);
        
        if (results.length > 0) {
            resultsContainer.innerHTML = results.map(p => {
                const img = normalizeImageUrl(p.Imagen || (p.Galeria && p.Galeria[0]));
                const price = getProductPrice(p, 'wholesale'); // Usa precio mayorista como default, ajustable después
                const idVar = p.idVariacion || p.ID || p['ID Variacion'] || p['ID VariaciÃ³n'] || p.Producto || '';
                // Escapando comillas simples en el nombre
                const safeName = (p.Nombre || '').replace(/'/g, "\\'");
                return `
                    <div class="inv-search-item" onclick="agregarItemBusqueda('${idVar}', '${safeName}', '${p.SKU || ''}', ${price})">
                        <img src="${img || 'Logo2.png'}" alt="">
                        <div class="inv-search-item-info">
                            <div class="inv-search-item-title">${p.Nombre}</div>
                            <div class="inv-search-item-sub">
                                <span style="background:rgba(168,85,247,0.15); color:var(--primary-light); padding:2px 6px; border-radius:4px; font-weight:600; margin-right:6px;">Ref: ${p.SKU || 'S/N'}</span>
                                <span style="color:#10B981; font-weight:700;">$${price.toLocaleString('es-CO')}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            resultsContainer.classList.add('active');
        } else {
            resultsContainer.innerHTML = `
                <div style="padding:32px 16px; color:rgba(255,255,255,0.4); text-align:center;">
                    <div style="font-size:24px; margin-bottom:8px;">🔍</div>
                    <div>No encontramos productos que coincidan con "${q}"</div>
                </div>`;
            resultsContainer.classList.add('active');
        }
    });

    // Cerrar resultados si hace clic afuera
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.inv-search-container')) {
            const rc = document.getElementById('inv-search-results');
            if (rc) rc.classList.remove('active');
        }
    });
});

window.agregarItemBusqueda = function(idVar, nombre, sku, precio) {
    const existing = window.invoiceItems.find(i => i.idVariacion === idVar);
    if (existing) {
        existing.cantidad += 1;
    } else {
        window.invoiceItems.push({
            idVariacion: idVar,
            nombre: nombre,
            sku: sku,
            cantidad: 1,
            precio: parseFloat(precio)
        });
    }
    
    document.getElementById('inv-product-search').value = '';
    document.getElementById('inv-search-results').classList.remove('active');
    renderItemsFactura();
};

window.modificarCantidadFactura = function(index, qty) {
    const val = parseInt(qty);
    if (val > 0) {
        window.invoiceItems[index].cantidad = val;
    } else {
        window.invoiceItems[index].cantidad = 1;
    }
    renderItemsFactura();
};

window.modificarPrecioFactura = function(index, price) {
    const val = parseFloat(price);
    if (!isNaN(val)) {
        window.invoiceItems[index].precio = val;
    }
    renderItemsFactura();
};

window.eliminarItemFactura = function(index) {
    window.invoiceItems.splice(index, 1);
    renderItemsFactura();
};

function renderItemsFactura() {
    const tbody = document.getElementById('inv-edit-items');
    let total = 0;
    
    if (window.invoiceItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999; padding:20px;">Busca y añade productos para comenzar</td></tr>';
        document.getElementById('inv-edit-total').textContent = '$0';
        return;
    }
    
    tbody.innerHTML = window.invoiceItems.map((item, i) => {
        const subtotal = item.precio * item.cantidad;
        total += subtotal;
        return `
            <tr>
                <td>${item.nombre} <br><small style="color:#666;">Ref: ${item.sku || 'S/N'}</small></td>
                <td style="text-align:center;">
                    <input type="number" class="inv-qty-input" value="${item.cantidad}" min="1" onchange="modificarCantidadFactura(${i}, this.value)">
                </td>
                <td style="text-align:right;">
                    <input type="number" class="inv-qty-input" style="width:90px;" value="${item.precio}" onchange="modificarPrecioFactura(${i}, this.value)">
                </td>
                <td style="text-align:right;">$${subtotal.toLocaleString('es-CO')}</td>
                <td style="text-align:right;">
                    <button class="action-btn" style="background:rgba(239,68,68,0.2); color:#ef4444;" onclick="eliminarItemFactura(${i})">✕</button>
                </td>
            </tr>
        `;
    }).join('');
    
    document.getElementById('inv-edit-total').textContent = '$' + total.toLocaleString('es-CO');
}

window.imprimirFacturaEditor = function() {
    // Pasar los datos del modal a la plantilla oculta de la factura
    const pId = document.getElementById('inv-edit-id').value || `PED-${Date.now().toString().slice(-6)}`;
    const nombre = document.getElementById('inv-edit-nombre').value || 'Cliente Generico';
    const tel = document.getElementById('inv-edit-tel').value || '-';
    const dir = document.getElementById('inv-edit-dir').value || '-';
    const ciudad = document.getElementById('inv-edit-ciudad').value || '-';
    
    document.getElementById('inv-id').textContent = pId;
    document.getElementById('inv-date').textContent = new Date().toLocaleDateString();
    document.getElementById('inv-cliente-nombre').textContent = nombre;
    document.getElementById('inv-cliente-tel').textContent = tel;
    document.getElementById('inv-cliente-dir').textContent = dir;
    document.getElementById('inv-cliente-ciudad').textContent = ciudad;
    
    // Asignar datos dinámicos de empresa a la factura
    const cfg = window.storeConfig || {};
    const logoImg = document.getElementById('inv-company-logo');
    if (cfg['Factura_Logo']) logoImg.src = cfg['Factura_Logo'];
    
    document.getElementById('inv-company-name').textContent = cfg['Factura_Empresa'] || 'Mi Empresa';
    document.getElementById('inv-company-nit').textContent = cfg['Factura_NIT'] || '000.000.000-0';
    document.getElementById('inv-company-contact').textContent = cfg['Factura_Telefono'] || '-';
    document.getElementById('inv-company-email').textContent = cfg['Factura_Email'] || '-';
    
    const itemsTbody = document.getElementById('inv-items');
    let total = 0;
    itemsTbody.innerHTML = window.invoiceItems.map(item => {
        const sub = item.precio * item.cantidad;
        total += sub;
        return `
            <tr>
                <td style="text-align:center;">${item.cantidad}</td>
                <td>${item.nombre} <br><small style="color:#666;">Ref: ${item.sku || '-'}</small></td>
                <td style="text-align:right;">$${item.precio.toLocaleString('es-CO')}</td>
                <td style="text-align:right;">$${sub.toLocaleString('es-CO')}</td>
            </tr>
        `;
    }).join('');
    
    document.getElementById('inv-total').textContent = '$' + total.toLocaleString('es-CO');
    
    setTimeout(() => window.print(), 200);
};

window.guardarFacturaDB = async function() {
    if (window.invoiceItems.length === 0) return alert("Añade al menos un producto a la factura.");
    
    const btn = document.getElementById('btn-save-invoice');
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    
    const isUpdate = document.getElementById('inv-edit-id').value !== '';
    const idPedido = document.getElementById('inv-edit-id').value || `PED-${Date.now()}`;
    const total = window.invoiceItems.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    const cantTotal = window.invoiceItems.reduce((sum, item) => sum + item.cantidad, 0);
    
    const payload = {
        resource: 'pedidos',
        action: isUpdate ? 'actualizar' : 'crear',
        'ID Pedido': idPedido,
        'Nombre Cliente': document.getElementById('inv-edit-nombre').value,
        'Telefono': document.getElementById('inv-edit-tel').value,
        'Direccion': document.getElementById('inv-edit-dir').value,
        'Ciudad': document.getElementById('inv-edit-ciudad').value,
        'Productos JSON': JSON.stringify(window.invoiceItems),
        'Cantidad Total': cantTotal,
        'Subtotal': total,
        'Estado Pedido': isUpdate ? undefined : 'Completado', // Si es nueva, la damos por completada
        'Metodo Contacto': 'Mostrador / Manual'
    };
    
    try {
        const res = await fetch(GOOGLE_SHEET_API, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        
        if (result && result.status === 'success') {
            showToast('Factura guardada exitosamente', 'success');
            document.getElementById('invoice-editor-modal').classList.remove('open');
            cargarPedidos();
        } else {
            throw new Error(result.error || 'Error al guardar');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.textContent = '💾 Guardar Factura';
    }
};


window.toggleVariants = function (motherIdClass, btnEl) {
    var rows = document.querySelectorAll('.variant-row.mother-' + motherIdClass);
    var total = rows.length;
    var anyVisible = false;
    rows.forEach(function (row) {
        if (row.style.display !== 'none') anyVisible = true;
    });
    rows.forEach(function (row) {
        row.style.display = anyVisible ? 'none' : 'table-row';
    });
    if (btnEl) {
        if (anyVisible) {
            btnEl.innerHTML = 'Ver ' + total + ' Variantes ▼';
            btnEl.style.background = 'rgba(155,44,250,0.1)';
        } else {
            btnEl.innerHTML = 'Ocultar ▲';
            btnEl.style.background = 'rgba(155,44,250,0.25)';
        }
    }
};
