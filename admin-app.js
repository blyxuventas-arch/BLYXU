const GOOGLE_SHEET_API = 'https://script.google.com/macros/s/AKfycbx7ofcNdOvxv07cvLZkSemb2mTyBlzs3a7VHbTk7QNIRitLjWQPFjnYl2PnEfEDGHYo3w/exec';
const GOOGLE_SHEET_PRODUCTS_URL = `${GOOGLE_SHEET_API}?resource=productos`;
let inventario = [];
const RETAIL_PRICE_VISIBILITY_KEY = 'blyxu_show_retail_prices';
const RETAIL_PRICE_CONFIG_KEY = 'Mostrar_Precios_Minorista';
const INVENTORY_BATCH_SIZE = 25;
const MAX_CAROUSEL_IMAGE_SIZE = 5 * 1024 * 1024;
let inventoryRenderedRows = 0;
let inventoryRenderToken = 0;
let inventoryLoadMoreObserver = null;
let filteredInventario = [];
let adminInventorySearchQuery = '';

function getProductField(product, fields, fallback = '') {
    const names = Array.isArray(fields) ? fields : [fields];
    for (const name of names) {
        if (product && product[name] !== undefined && product[name] !== null && product[name] !== '') {
            return product[name];
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
        ID: getProductField(product, ['ID Variacion', 'ID VariaciÃ³n', 'ID', 'id'], ''),
        idVariacion: getProductField(product, ['ID Variacion', 'ID VariaciÃ³n', 'ID', 'id'], ''),
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
        Galeria: getProductField(product, ['Galeria JSON', 'GalerÃ­a JSON', 'Galeria'], ''),
        Descripcion: getProductField(product, ['Caracteristicas del producto', 'CaracterÃ­sticas del producto', 'Descripcion'], ''),
        Tamano: getProductField(product, ['Tamano', 'TamaÃ±o', 'Talla'], ''),
        Estilo: getProductField(product, ['Estilo'], ''),
        SKU: getProductField(product, ['SKU'], ''),
        Estado: getProductField(product, ['Estado'], 'Activo'),
        Fecha_Creacion: getProductField(product, ['Fecha de Creacion', 'Fecha de CreaciÃ³n'], '')
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

async function postProductToGoogleSheets(data) {
    const isEditing = Boolean(data['ID Variacion'] || data.id || data.editId);
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

    if (!query) return indexed;

    return indexed
        .map(item => ({ ...item, score: scoreInventorySearch(item.product, query) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);
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
        'CategorÃ­a': categoria,
        Catalogo: getInputValue('prod-catalogo') || 'Ambos',
        Precio: parseAmount(getInputValue('prod-precio')),
        'Precio Mayor': parseAmount(getInputValue('prod-precio-mayorista')),
        'Stock Inicial': stockInicial,
        Cantidad: stock,
        'Caracteristicas del producto': descripcion,
        Descripcion: descripcion,
        Tamano: getInputValue('prod-tamano'),
        Color: getInputValue('prod-color'),
        Estilo: getInputValue('prod-estilo'),
        'Imagen Principal': imagen,
        Imagen: imagen,
        'Galeria JSON': getInputValue('prod-galeria'),
        SKU: getInputValue('prod-sku'),
        Estado: getInputValue('prod-estado') || 'Activo',
        'Fecha de Creacion': getInputValue('prod-fecha-creacion')
    };
}

function setProductFormMode(isEditing) {
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
    initInventorySearch();
    initCarouselImageAdmin();
    
    // --- LOGIN LOGIC ---
    const loginForm = document.getElementById('admin-login-form');
    const loginError = document.getElementById('login-error');
    const loginScreen = document.getElementById('admin-login-screen');
    const mainContent = document.getElementById('admin-main-content');
    
    if(loginForm) {
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
                                mainContent.style.display = 'block';
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
                setTimeout(()=>document.getElementById('login-box').style.transform = 'translateX(-10px)', 100);
                setTimeout(()=>document.getElementById('login-box').style.transform = 'translateX(10px)', 200);
                setTimeout(()=>document.getElementById('login-box').style.transform = 'translateX(0)', 300);
            }
        });
    }
    // -------------------

    document.getElementById('product-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btn = document.getElementById('btn-save');
        btn.disabled = true;
        btn.textContent = 'Enviando...';

        // Evitar corrupción de datos (Precio vs Stock) usando parseAmount
        const rawPrecio = document.getElementById('prod-precio').value;
        const cleanPrecio = parseAmount(rawPrecio);
        const rawPrecioMayorista = document.getElementById('prod-precio-mayorista').value;
        const cleanPrecioMayorista = parseAmount(rawPrecioMayorista);
        
        const stock = Number(document.getElementById('prod-stock').value || 0);
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
            Estado: 'Activo'
        };

        Object.assign(data, buildProductPayload());

        try {
            // Se envía mediante POST formData porque App Script lo recibe mejor
            await postProductToGoogleSheets(data);

            showToast('Producto guardado en Google Sheets');
            resetProductForm();
            
            // Recargamos el inventario tras 2 segundos para dar tiempo a que Google Sheets actualice
            setTimeout(() => {
                cargarInventario();
            }, 2000);

        } catch (error) {
            console.error(error);
            showToast('Ocurrió un error en la red. Intenta nuevamente.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Guardar / Enviar';
        }
    });

    document.getElementById('btn-reset-product')?.addEventListener('click', resetProductForm);

    document.getElementById('btn-add-variant')?.addEventListener('click', () => {
        // Keep: Nombre, Categoria, Precio, Precio Mayorista, Catalogo, Estado, ID Producto
        const idVariacion = getInputValue('prod-id');
        const idProducto = getInputValue('prod-id-producto');
        
        // If it doesn't have an ID Producto yet, use the ID Variacion of the current product as the parent ID
        if (!idProducto && idVariacion) {
            setInputValue('prod-id-producto', idVariacion);
        }
        
        // Clear variation specific fields to allow entering a new variation quickly
        setInputValue('prod-id', '');
        setInputValue('prod-color', '');
        setInputValue('prod-tamano', '');
        setInputValue('prod-estilo', '');
        setInputValue('prod-imagen', '');
        setInputValue('prod-galeria', '');
        setInputValue('prod-sku', '');
        setInputValue('prod-stock', '0');
        setInputValue('prod-stock-inicial', '0');
        
        setProductFormMode(false); // Switch back to 'Creating' mode
        showToast('Listo para nueva variante (Nombre, precio e ID Producto mantenidos)');
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
        console.warn('No se pudo cargar configuración:', err);
        return {};
    }
}

async function saveSiteConfig(key, value) {
    try {
        const formData = new FormData();
        formData.append('action', 'set_config');
        formData.append('Clave', key);
        formData.append('Valor', value);

        await fetch(GOOGLE_SHEET_API, {
            method: 'POST',
            body: formData,
            mode: 'no-cors'
        });
    } catch (err) {
        console.error('No se pudo guardar configuración:', err);
        showToast('No se pudo guardar configuración en Google Sheets');
    }
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
            setTimeout(() => cargarInventario(), 2000);
        } catch (error) {
            console.error(error);
            showToast(error.message || 'No se pudo guardar el banner');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
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

async function cargarInventario() {
    const tbody = document.getElementById('inventory-tbody');
    try {
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Cargando inventario de Google Sheets...</td></tr>';
        }

        const res = await fetch(GOOGLE_SHEET_PRODUCTS_URL);
        const data = await res.json();
        if (data && (data.status === 'error' || data.ok === false)) {
            throw new Error(data.message || data.error || 'Error del Apps Script');
        }
        inventario = (Array.isArray(data) ? data : (data.data || data.productos || []))
            .map(normalizeGoogleProduct);
        updateCategoryOptions();
        
        if (inventario.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No hay productos en el inventario.</td></tr>';
            return;
        }

        renderInventoryInBatches();
        return;

        tbody.innerHTML = inventario.map((p, i) => `
            <tr>
                <td><img src="${p.Imagen || 'Logo2.png'}" width="40" height="40" style="border-radius:6px; object-fit:cover;" onerror="this.src='Logo2.png'"></td>
                <td style="font-weight:600;">${p.Nombre || p.Producto || ''}</td>
                <td><span style="background:rgba(155,44,250,0.15); color:var(--secondary); padding:4px 8px; border-radius:10px; font-size:10px;">${p.Categoria || ''}</span></td>
                <td>${p.Catalogo || p.catalogo || 'Ambos'}</td>
                <td>$${Number(p.Precio || 0).toLocaleString('es-CO')}</td>
                <td>$${Number(p.Precio_Mayorista || p.precio_mayorista || p.Mayorista || 0).toLocaleString('es-CO')}</td>
                <td>${p.Stock || p.Cantidad || 0}</td>
                <td>
                    <button class="action-btn" onclick="editarProducto(${i})" title="Cargar al formulario">✏️</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error("Error al cargar datos:", err);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#ff6b6b;">Error al cargar el inventario: ${err.message}</td></tr>`;
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
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">No se encontraron productos${adminInventorySearchQuery ? ' para tu busqueda' : ''}.</td></tr>`;
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
        .map(item => inventoryRowTemplate(item.product, item.index))
        .join('');

    tbody.insertAdjacentHTML('beforeend', rows);
    inventoryRenderedRows = end;

    if (inventoryRenderedRows < filteredInventario.length) {
        tbody.insertAdjacentHTML('beforeend', `
            <tr class="inventory-load-more-row">
                <td colspan="8" style="text-align:center;padding:18px;">
                    <button class="admin-btn" type="button" onclick="loadMoreInventoryBatch()" style="max-width:240px;">Cargar mas productos</button>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:8px;">
                        Mostrando ${inventoryRenderedRows} de ${filteredInventario.length}
                    </div>
                </td>
            </tr>
        `);
        observeInventoryLoadMore(renderToken);
    }
}

function inventoryRowTemplate(p, index) {
    return `
        <tr>
            <td><img src="${p.Imagen || 'Logo2.png'}" width="40" height="40" loading="lazy" style="border-radius:6px; object-fit:cover;" onerror="this.src='Logo2.png'"></td>
            <td style="font-weight:600;">${p.Nombre || p.Producto || ''}</td>
            <td><span style="background:rgba(155,44,250,0.15); color:var(--secondary); padding:4px 8px; border-radius:10px; font-size:10px;">${p.Categoria || ''}</span></td>
            <td>${p.Catalogo || p.catalogo || 'Ambos'}</td>
            <td>$${Number(p.Precio || 0).toLocaleString('es-CO')}</td>
            <td>$${Number(p.Precio_Mayorista || p.precio_mayorista || p.Mayorista || 0).toLocaleString('es-CO')}</td>
            <td>${p.Stock || p.Cantidad || 0}</td>
            <td>
                <button class="action-btn" onclick="editarProducto(${index})" title="Cargar al formulario">Editar</button>
            </td>
        </tr>
    `;
}

function loadMoreInventoryBatch() {
    renderNextInventoryBatch();
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

function editarProducto(index) {
    const p = inventario[index];
    setInputValue('prod-id', p.idVariacion || p.ID || p['ID Variacion'] || p['ID VariaciÃ³n'] || '');
    setInputValue('prod-id-producto', p.idProducto || p['ID Producto'] || '');
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
    
    // Si manejas edición real, aquí cargarías el id
    // document.getElementById('prod-id').value = p.id || p.fila || '';
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Limpiar formato de dinero para que la DB no se corrompa entre Precio y Stock
function parseAmount(val) {
    if (!val) return 0;
    return parseInt(String(val).replace(/[^0-9]/g, ''), 10) || 0;
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}
