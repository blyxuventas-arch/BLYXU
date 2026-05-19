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
const INVENTORY_CACHE_KEY = 'blyxu_admin_inventory_cache_v2';
const INVENTORY_BATCH_SIZE = 25;
const MAX_CAROUSEL_IMAGE_SIZE = 5 * 1024 * 1024;
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

            const tempImg = new Image();
            tempImg.onload = () => {
                imgEl.src = imagenUrl;
                imgEl.style.opacity = '1';
            };
            tempImg.onerror = () => {
                imgEl.src = 'hero_necklace.png';
                imgEl.style.opacity = '0.3';
            };
            tempImg.src = imagenUrl;
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
    const isEditing = isEditingOverride !== null ? isEditingOverride : Boolean(data['ID Variacion'] || data.id || data.editId);
    const payloads = [
        {
            resource: 'productos',
            action: isEditing ? 'editar' : 'crear',
            data
        },
        {
            action: isEditing ? 'edit_product' : 'add_product',
            ...data
        }
    ];
    let lastError = 'No se pudo guardar el producto';

    for (const payload of payloads) {
        const res = await fetch(GOOGLE_SHEET_API, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result && (result.ok || result.status === 'success')) {
            return result.data || result;
        }

        lastError = result?.error || result?.message || lastError;
    }

    throw new Error(lastError);
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

function getInputValue(id) {
    return el(id)?.value?.trim() || '';
}

function buildProductPayload() {
    const stock = Number(getInputValue('prod-stock') || 0);
    const stockInicial = Number(getInputValue('prod-stock-inicial') || stock || 0);
    const idVariacion = getInputValue('prod-id');
    const idProducto = getInputValue('prod-id-producto') || idVariacion;
    const nombre = getInputValue('prod-nombre');
    const categoria = getInputValue('prod-categoria');
    const descripcion = getInputValue('prod-descripcion');
    const imagen = getInputValue('prod-imagen');

    return {
        'ID Variacion': idVariacion,
        'ID Producto': idProducto,
        'Nombre del Producto': nombre,
        Nombre: nombre,
        Categoria: categoria,
        'Categoría': categoria,
        'Catálogo': getInputValue('prod-catalogo') || 'Ambos',
        Precio: parseAmount(getInputValue('prod-precio')),
        'Precio Mayor': parseAmount(getInputValue('prod-precio-mayorista')),
        'Stock Inicial': stockInicial,
        Cantidad: stock,
        'Características del producto': descripcion,
        Descripcion: descripcion,
        Tamano: getInputValue('prod-tamano'),
        'Tamaño': getInputValue('prod-tamano'),
        Color: getInputValue('prod-color'),
        Estilo: getInputValue('prod-estilo'),
        'Imagen Principal': imagen,
        Imagen: imagen,
        'Galería JSON': getInputValue('prod-galeria'),
        SKU: getInputValue('prod-sku'),
        Estado: getInputValue('prod-estado') || 'Activo',
        'Fecha de Creación': getInputValue('prod-fecha-creacion')
    };
}

function setProductFormMode(isEditing) {
    isEditingProduct = isEditing;
    const title = el('product-form-title');
    const mode = el('product-form-mode');
    const btn = el('btn-save');
    if (title) title.textContent = isEditing ? 'Editar Producto' : 'Nuevo Producto';
    if (mode) mode.textContent = isEditing ? 'Editando' : 'Creando';
    if (btn) btn.textContent = isEditing ? 'Guardar cambios' : 'Guardar producto';
}

function resetProductForm() {
    const form = el('product-form');
    if (form) form.reset();
    setInputValue('prod-id', '');
    setInputValue('prod-id-producto', '');
    setInputValue('prod-fecha-creacion', '');
    setInputValue('prod-stock-inicial', '0');
    setInputValue('prod-stock', '0');
    setInputValue('prod-catalogo', 'Ambos');
    setInputValue('prod-estado', 'Activo');
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

document.addEventListener('DOMContentLoaded', () => {
    initRetailPriceToggle();
    initContactConfigAdmin();
    initInventorySearch();
    initInventoryActions();
    initCarouselImageAdmin();
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
            imgEl.style.opacity = '0.7';
        }
        showToast('Subiendo imagen a Google Drive...');
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

        const rawPrecio = document.getElementById('prod-precio').value;
        const cleanPrecio = parseAmount(rawPrecio);
        const rawPrecioMayorista = document.getElementById('prod-precio-mayorista').value;
        const cleanPrecioMayorista = parseAmount(rawPrecioMayorista);

        const stock = Number(document.getElementById('prod-stock').value || 0);
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
            Estilo: document.getElementById('prod-catalogo').value,
            Estado: estado
        };
        Object.assign(data, buildProductPayload());

        async function proceedSubmit(finalData) {
            try {
                await postProductToGoogleSheets(finalData, isEditingProduct);
                showToast('Producto guardado en Google Sheets', 'success');
                resetProductForm();
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
        const container = document.getElementById('variants-container');
        if (!container) return;

        // Asegurar ID Madre
        if (!getInputValue('prod-id-producto') && getInputValue('prod-id')) {
            setInputValue('prod-id-producto', getInputValue('prod-id'));
        }

        const cardId = Date.now();
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
                    <label>ID Variable</label>
                    <input type="text" class="form-control var-id" placeholder="Auto">
                </div>
                <div class="form-group">
                    <label>SKU Variante</label>
                    <input type="text" class="form-control var-sku">
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
            var motherId = getInputValue('prod-id-producto') || getInputValue('prod-id');
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
                'ID Producto': getInputValue('prod-id-producto') || getInputValue('prod-id'),
                'Nombre del Producto': getInputValue('prod-nombre'),
                Nombre: getInputValue('prod-nombre'),
                Categoria: getInputValue('prod-categoria'),
                'Categoría': getInputValue('prod-categoria'),
                Precio: parseAmount(getInputValue('prod-precio')),
                'Precio Mayor': parseAmount(getInputValue('prod-precio-mayorista')),
                Cantidad: Number(card.querySelector('.var-stock').value || 0),
                'Stock Inicial': Number(card.querySelector('.var-stock').value || 0),
                Descripcion: getInputValue('prod-descripcion'),
                'Caracteristicas del producto': getInputValue('prod-descripcion'),
                Tamano: card.querySelector('.var-tamano').value,
                Color: card.querySelector('.var-color').value,
                SKU: card.querySelector('.var-sku').value,
                Imagen: card.querySelector('.var-imagen').value || getInputValue('prod-imagen'),
                'Imagen Principal': card.querySelector('.var-imagen').value || getInputValue('prod-imagen'),
                Catalogo: getInputValue('prod-catalogo') || 'Ambos',
                'Galeria JSON': getInputValue('prod-galeria'),
                Estado: getInputValue('prod-estado') || 'Activo'
            };

            try {
                await postProductToGoogleSheets(data, false);
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

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
        reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen'));
        reader.readAsDataURL(file);
    });
}

async function uploadCarouselImage(file) {
    if (!file) return '';
    if (!file.type.startsWith('image/')) {
        throw new Error('Selecciona un archivo de imagen valido');
    }
    if (file.size > MAX_CAROUSEL_IMAGE_SIZE) {
        throw new Error('La imagen pesa mas de 5 MB');
    }

    const base64Data = await fileToBase64(file);
    const res = await fetch(GOOGLE_SHEET_API, {
        method: 'POST',
        body: JSON.stringify({
            action: 'upload_image',
            fileName: file.name,
            mimeType: file.type,
            base64Data
        })
    });
    const result = await res.json();

    if (!(result && (result.ok || result.status === 'success'))) {
        throw new Error(result?.error || result?.message || 'No se pudo subir la imagen');
    }

    return normalizeImageUrl(result.url || result.data?.url || '');
}

/**
 * Configura el comportamiento de Arrastrar y Soltar en un elemento
 */
function setupDragAndDrop(containerId, onFileProcessed) {
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
                if (arguments[2] && typeof arguments[2] === 'function') {
                    const localUrl = URL.createObjectURL(file);
                    arguments[2](localUrl);
                }

                const imageUrl = await uploadCarouselImage(file);
                onFileProcessed(imageUrl, file);
                showToast('Imagen subida con éxito', 'success');
            } catch (err) {
                console.error(err);
                showToast('Error al subir imagen: ' + err.message, 'error');
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
    setInputValue('prod-id-producto', idProd);
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
}

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
