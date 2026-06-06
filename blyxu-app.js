// ========== BLYXU E-COMMERCE ENGINE ==========
// Google Sheets integration + Cart + Particles + UI

// -- CONFIG: Google Sheets --
// Para conectar tu Google Sheet:
// 1. Ve a tu hoja de calculo de Google
// 2. Menu Extensiones ? Apps Script
// 3. Pega el codigo del archivo google-apps-script.gs
// 4. Despliega como aplicacion web
// 5. Pega la URL aqui abajo:
const GOOGLE_SHEET_API = 'https://script.google.com/macros/s/AKfycbx7ofcNdOvxv07cvLZkSemb2mTyBlzs3a7VHbTk7QNIRitLjWQPFjnYl2PnEfEDGHYo3w/exec';
const GOOGLE_SHEET_PRODUCTS_URL = `${GOOGLE_SHEET_API}?resource=productos`;
const BLYXU_WHATSAPP_PHONE = '573112368622';
const BLYXU_DEFAULT_MAP_URL = 'https://maps.app.goo.gl/xa5Ebxsc7MDwUz5a6';
const LOW_STOCK_THRESHOLD = 3;

// Columnas esperadas en tu Google Sheet:
// Nombre | Categoria | Catalogo | Precio | Precio_Mayorista | Stock | Imagen | Color | Descripcion

// -- STATE --
let allProducts = [];
let activeFilter = 'todos';
let productsLoadPromise = null;
let bannerProducts = [];
let productsLoadError = '';
const RETAIL_PRICE_VISIBILITY_KEY = 'blyxu_show_retail_prices';
const RETAIL_PRICE_CONFIG_KEY = 'Mostrar_Precios_Minorista';
const PRODUCTS_CACHE_KEY = 'blyxu_products_cache_v2';
const SITE_CONFIG_CACHE_KEY = 'blyxu_site_config_cache_v1';
const PRODUCTS_CACHE_TTL = 5 * 60 * 1000;
const SITE_CONFIG_CACHE_TTL = 5 * 60 * 1000;
const LEGACY_CART_KEY = 'blyxu_cart';
const CART_STORAGE_KEYS = {
    retail: 'blyxu_cart_retail',
    wholesale: 'blyxu_cart_wholesale'
};
const CATALOG_BATCH_SIZE = 12;
let activeCatalogMode = getInitialCartMode();
let activeCartMode = activeCatalogMode;
let cart = loadCart(activeCartMode);
let showRetailPrices = localStorage.getItem(RETAIL_PRICE_VISIBILITY_KEY) !== '0';
let siteConfig = {};
let configLoadPromise = null;
let catalogRenderToken = 0;
let catalogBatchState = null;
const catalogBatchMemory = new Map();
let activeSearchQuery = '';
let activeWholesaleFilter = 'todos';
let activeWholesaleSearchQuery = '';
let heroProductCarouselTimer = null;
let mainBannerCarouselTimer = null;
let inventorySpotlightTimer = null;
let inventorySpotlightRendered = false;
const catalogShuffleSeed = Math.floor(Math.random() * 1000000000);

// -- PARTICLES --
function initParticles() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    for (let i = 0; i < 50; i++) {
        particles.push({
            x: Math.random() * canvas.width, y: Math.random() * canvas.height,
            r: Math.random() * 1.5 + .3, dx: (Math.random() - .5) * .3, dy: (Math.random() - .5) * .3,
            o: Math.random() * .3 + .05
        });
    }
    (function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.x += p.dx; p.y += p.dy;
            if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
            if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(180,120,255,${p.o})`; ctx.fill();
        });
        requestAnimationFrame(animate);
    })();
}

// -- WHOLESALE PARTICLES (ANTIGRAVITY STYLE) --
function initWholesaleParticles() {
    const canvas = document.getElementById('wholesale-particles');
    if (!canvas) return;
    
    // Configurar estilos del canvas dinámicamente
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '0';
    canvas.style.pointerEvents = 'none'; // Deja que los clics pasen al panel

    const ctx = canvas.getContext('2d');
    let width, height;
    let particles = [];
    
    const mouse = { x: -9999, y: -9999, active: false };
    
    const overlay = document.getElementById('wholesale-overlay');
    if(overlay) {
        overlay.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            mouse.x = e.clientX - rect.left;
            mouse.y = e.clientY - rect.top;
            mouse.active = true;
        });
        overlay.addEventListener('mouseleave', () => { mouse.active = false; });
        overlay.addEventListener('touchmove', (e) => {
            if(e.touches.length > 0) {
                const rect = canvas.getBoundingClientRect();
                mouse.x = e.touches[0].clientX - rect.left;
                mouse.y = e.touches[0].clientY - rect.top;
                mouse.active = true;
            }
        });
        overlay.addEventListener('touchend', () => { mouse.active = false; });
    }

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        initNodes();
    }

    function initNodes() {
        particles = [];
        const isMobile = window.innerWidth < 768;
        const count = isMobile ? 50 : 120; // Menos partículas en móvil por rendimiento
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 1.5,
                vy: (Math.random() - 0.5) * 1.5,
                radius: Math.random() * 2 + 1,
                color: Math.random() > 0.5 ? '#a855f7' : '#3b82f6' // Tonos morados y azules (Antigravity vibe)
            });
        }
    }

    window.addEventListener('resize', resize);
    resize();

    function draw() {
        // Overlay semitransparente para efecto de estela (trail effect)
        ctx.fillStyle = 'rgba(10, 2, 20, 0.35)';
        ctx.fillRect(0, 0, width, height);

        const connectionDistance = 120;
        const mouseConnectionDistance = 180;

        for (let i = 0; i < particles.length; i++) {
            let p = particles[i];

            // Movimiento
            p.x += p.vx;
            p.y += p.vy;

            // Rebote en bordes
            if (p.x < 0 || p.x > width) p.vx *= -1;
            if (p.y < 0 || p.y > height) p.vy *= -1;

            // Interacción con mouse
            if (mouse.active) {
                const dx = mouse.x - p.x;
                const dy = mouse.y - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < mouseConnectionDistance) {
                    // Atracción suave al mouse
                    p.x += dx * 0.015;
                    p.y += dy * 0.015;

                    // Dibujar conexión con mouse
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(mouse.x, mouse.y);
                    const opacity = 1 - (dist / mouseConnectionDistance);
                    ctx.strokeStyle = `rgba(59, 130, 246, ${opacity * 0.5})`; // Azul brillante
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }

            // Dibujar conexiones entre partículas
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
                    ctx.strokeStyle = `rgba(168, 85, 247, ${opacity * 0.3})`; // Morado sutil
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                }
            }

            // Dibujar partícula
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = p.color;
            ctx.fill();
            ctx.shadowBlur = 0; // reset
        }

        // Si el modal está visible, animamos, sino nos saltamos frames o seguimos lento (usamos requestAnimationFrame siempre)
        requestAnimationFrame(draw);
    }

    draw();
}

// -- NAVBAR --
function initNavbar() {
    const navbar = document.getElementById('navbar');
    const toggle = document.getElementById('nav-toggle');
    const navLinks = document.getElementById('nav-links');
    const links = navLinks ? [...navLinks.querySelectorAll('a')] : [];
    const sectionLinks = links.filter(link => {
        const href = link.getAttribute('href') || '';
        return href.startsWith('#') && href.length > 1;
    });

    function setActiveLink(activeLink) {
        links.forEach(link => link.classList.toggle('active', link === activeLink));
    }

    window.addEventListener('scroll', () => {
        if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 50);

        let currentLink = null;
        sectionLinks.forEach(link => {
            const section = document.querySelector(link.getAttribute('href'));
            if (!section) return;
            const rect = section.getBoundingClientRect();
            if (rect.top <= 120 && rect.bottom > 120) currentLink = link;
        });
        if (currentLink) setActiveLink(currentLink);
    });

    if (toggle && navLinks) {
        const toggleMenu = () => {
            toggle.classList.toggle('open');
            navLinks.classList.toggle('open');
            toggle.setAttribute('aria-expanded', navLinks.classList.contains('open') ? 'true' : 'false');
        };

        toggle.setAttribute('aria-expanded', 'false');
        toggle.addEventListener('click', toggleMenu);
        toggle.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            toggleMenu();
        });
        links.forEach(a => {
            a.addEventListener('click', () => {
                setActiveLink(a);
                toggle.classList.remove('open');
                navLinks.classList.remove('open');
                toggle.setAttribute('aria-expanded', 'false');
            });
        });
    }
}

// -- SCROLL REVEAL --
function initReveal(scope = document) {
    const root = scope && typeof scope.querySelectorAll === 'function' ? scope : document;
    const revealItems = root.querySelectorAll('.reveal:not(.visible)');
    if (!('IntersectionObserver' in window)) {
        revealItems.forEach(el => el.classList.add('visible'));
        return;
    }

    const obs = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
    }, { threshold: 0.08 });
    revealItems.forEach(el => obs.observe(el));
}

// -- FORMAT MONEY (COP) --
function formatMoney(n) {
    const num = parseFloat(n) || 0;
    return '$' + num.toLocaleString('es-CO', { minimumFractionDigits: 0 });
}

function getProductField(product, fields, fallback = '') {
    const names = Array.isArray(fields) ? fields : [fields];
    for (const name of names) {
        if (product && product[name] !== undefined && product[name] !== null && product[name] !== '') {
            return product[name];
        }
    }
    return fallback;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function hashText(value) {
    let hash = 0;
    const text = String(value || '');
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

function getProductIdentity(product, fallback = '') {
    return [
        product?.idVariacion,
        product?.idProducto,
        product?.SKU,
        product?.Nombre,
        product?.Imagen,
        fallback
    ].filter(Boolean).join('|');
}

function getShuffledProducts(products, seed = catalogShuffleSeed) {
    return [...products].sort((a, b) => {
        const aHash = hashText(`${seed}|${getProductIdentity(a)}`);
        const bHash = hashText(`${seed}|${getProductIdentity(b)}`);
        return aHash - bHash;
    });
}

function readCache(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || 'null');
        return value && typeof value === 'object' ? value : null;
    } catch (error) {
        return null;
    }
}

function writeCache(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
    } catch (error) {
        console.warn('No se pudo guardar cache local:', error);
    }
}

function isCacheFresh(key, ttlMs) {
    const cached = readCache(key);
    return Boolean(cached?.savedAt && Date.now() - cached.savedAt < ttlMs);
}

function setProductsLoading(isLoading) {
    const loading = document.getElementById('loading-products');
    if (loading) loading.style.display = isLoading ? 'flex' : 'none';
}

function hydrateProductsFromCache() {
    const cached = readCache(PRODUCTS_CACHE_KEY);
    const products = cached?.data?.products;
    const banners = cached?.data?.banners;

    if (!Array.isArray(products) || !products.length) return false;

    allProducts = products;
    bannerProducts = Array.isArray(banners) ? banners : [];
    productsLoadError = '';
    setProductsLoading(false);
    return true;
}

function hydrateSiteConfigFromCache() {
    const cached = readCache(SITE_CONFIG_CACHE_KEY);
    const config = cached?.data;

    if (!config || typeof config !== 'object') return false;

    siteConfig = config;
    if (siteConfig[RETAIL_PRICE_CONFIG_KEY] !== undefined) {
        showRetailPrices = String(siteConfig[RETAIL_PRICE_CONFIG_KEY]) === '1';
        localStorage.setItem(RETAIL_PRICE_VISIBILITY_KEY, showRetailPrices ? '1' : '0');
    }
    return true;
}

function parseGallery(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'object') return [value];

    const text = String(value).trim();
    if (!text) return [];

    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
        return [text];
    }
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
        return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveMatch[1])}&sz=w1000`;
    }

    if (firstUrl.startsWith('//')) return `https:${firstUrl}`;

    return firstUrl;
}

function normalizeGoogleProduct(product) {
    const galeria = parseGallery(getProductField(product, ['Galer\u00eda JSON', 'Galeria JSON', 'Galería JSON', 'galeria'], []))
        .map(normalizeImageUrl)
        .filter(Boolean);
    const imageUrl = normalizeImageUrl(getProductField(product, ['Imagen Principal', 'Imagen', 'imagen', 'Foto'], galeria[0] || ''));

    return {
        ...product,
        idVariacion: getProductField(product, ['ID Variaci\u00f3n', 'ID Variacion', 'ID Variación', 'idVariacion', 'id', 'SKU']),
        idProducto: getProductField(product, ['ID Producto', ' ID Producto', 'idProducto']),
        Nombre: getProductField(product, ['Nombre del Producto', 'Nombre', 'nombre', 'Producto'], 'Producto'),
        Catalogo: getProductField(product, ['Catalogo', 'Catálogo', 'CatÃ¡logo', 'catalogo', 'Publicacion'], ''),
        Categoria: getProductField(product, ['Categor\u00eda', 'Categoria', 'Categoría', 'categoria'], ''),
        Precio: getProductField(product, ['Precio', 'precio'], 0),
        Precio_Mayorista: getProductField(product, ['Precio Mayor', 'Precio Mayorista', 'Precio_Mayorista', 'precio_mayorista', 'Mayorista'], 0),
        Stock: getProductField(product, ['Cantidad', 'Stock', 'stock', 'Stock Inicial'], 0),
        Imagen: imageUrl,
        Galeria: galeria,
        Color: getProductField(product, ['Color', 'Color ', 'color'], ''),
        Tamano: getProductField(product, ['Tama\u00f1o', 'Tamano', 'Tamaño', 'tamano'], ''),
        Estilo: cleanProductStyleValue(getProductField(product, ['Estilo', 'estilo'], '')),
        Descripcion: getProductField(product, ['Caracter\u00edsticas del producto', 'Caracteristicas del producto', 'Características del producto', 'Caractreristicas del producto', 'Descripcion', 'descripcion'], ''),
        SKU: getProductField(product, ['SKU', 'sku'], ''),
        Estado: getProductField(product, ['Estado', 'estado'], 'Activo')
    };
}
function isActiveProduct(product) {
    const estado = String(getProductField(product, ['Estado', 'estado'], 'Activo')).toLowerCase();
    return !estado || estado === 'activo' || estado === 'disponible' || estado === 'agotado';
}

function cleanProductStyleValue(value) {
    const raw = String(value || '').trim();
    const clean = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return ['ambos', 'minorista', 'mayorista', 'minorista y mayorista'].includes(clean) ? '' : raw;
}

function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function productSearchBlob(product) {
    return normalizeSearchText([
        product.Nombre,
        product.Categoria,
        product.SKU,
        product.Color,
        product.Estilo,
        product.Tamano,
        product.Descripcion,
        product.idVariacion,
        product.idProducto
    ].join(' '));
}

function getStemmedVariants(term) {
    const variants = [term];
    if (term.length > 3) {
        if (term.endsWith('es')) variants.push(term.slice(0, -2));
        if (term.endsWith('s')) variants.push(term.slice(0, -1));
    }
    return variants;
}

function scoreProductSearch(product, query) {
    const q = normalizeSearchText(query);
    if (!q) return 1;

    const terms = q.split(/\s+/).filter(Boolean);
    const name = normalizeSearchText(product.Nombre);
    const category = normalizeSearchText(product.Categoria);
    const sku = normalizeSearchText(product.SKU || product.idVariacion);
    const blob = productSearchBlob(product);

    // Búsqueda inteligente: permite que "espejos" encuentre "espejo"
    const allTermsMatch = terms.every(term => {
        const variants = getStemmedVariants(term);
        return variants.some(v => blob.includes(v));
    });

    if (!allTermsMatch) return 0;

    let score = 10;
    terms.forEach(term => {
        const variants = getStemmedVariants(term);
        variants.forEach(v => {
            if (name.startsWith(v)) score += 60;
            else if (name.includes(v)) score += 35;
            if (category.includes(v)) score += 20;
            if (sku.includes(v)) score += 25;
        });
    });

    return score;
}

function applySmartProductSearch(products, query = activeSearchQuery) {
    const q = normalizeSearchText(query);
    if (!q) return products;

    return products
        .map(product => ({ product, score: scoreProductSearch(product, q) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(item => item.product);
}

function getProductGroupKey(product) {
    return String(product?.idProducto || product?.['ID Producto'] || product?.idVariacion || product?.SKU || product?.Nombre || '').trim();
}

function isGeneralProductReference(product) {
    const idProducto = String(product?.idProducto || product?.['ID Producto'] || '').trim();
    const idVariacion = String(product?.idVariacion || product?.['ID Variación'] || product?.['ID Variacion'] || '').trim();
    return !idProducto || !idVariacion || idProducto === idVariacion || /-v01$/i.test(idVariacion);
}

function collapseSearchResultsToGeneralReferences(results, sourceProducts) {
    const sourceByGroup = new Map();
    (sourceProducts || []).forEach(product => {
        const key = getProductGroupKey(product);
        if (!key) return;
        if (!sourceByGroup.has(key)) sourceByGroup.set(key, []);
        sourceByGroup.get(key).push(product);
    });

    const grouped = new Map();
    results.forEach(product => {
        const key = getProductGroupKey(product);
        if (!key) return;
        if (grouped.has(key)) return;

        const groupProducts = sourceByGroup.get(key) || [product];
        const representative =
            groupProducts.find(isGeneralProductReference) ||
            groupProducts[0] ||
            product;
        grouped.set(key, representative);
    });

    return Array.from(grouped.values());
}

function getCatalogRepresentativeKey(product) {
    const parentId = String(product?.idProducto || product?.['ID Producto'] || '').trim();
    if (parentId) return `parent:${parentId}`;

    const variationId = String(product?.idVariacion || product?.['ID Variacion'] || product?.['ID Variación'] || product?.SKU || '').trim();
    if (variationId) return `variation:${variationId}`;

    return [
        'product',
        normalizeSearchText(product?.Nombre || product?.Producto),
        normalizeSearchText(product?.Categoria),
        normalizeSearchText(product?.Imagen)
    ].join(':');
}

function getCatalogRepresentativeScore(product, index, mode = activeCatalogMode) {
    let score = 100000 - index;
    if (getProductStock(product) > 0) score += 50000;
    if (isGeneralProductReference(product)) score += 20000;
    if (normalizeImageUrl(product?.Imagen || product?.imagen || '')) score += 5000;
    if (getProductPrice(product, mode) > 0) score += 1000;
    return score;
}

function collapseCatalogProductsToRepresentatives(products, mode = activeCatalogMode) {
    const groups = new Map();

    products.forEach((product, index) => {
        const key = getCatalogRepresentativeKey(product);
        if (!key) return;

        const candidate = {
            product,
            score: getCatalogRepresentativeScore(product, index, mode)
        };
        const current = groups.get(key);
        if (!current || candidate.score > current.score) {
            groups.set(key, candidate);
        }
    });

    return Array.from(groups.values()).map(item => item.product);
}

function applyPromotionsToProducts() {
    const isPromoEnabled = String(getSiteConfigValue('Promo_Enabled', 'false')).trim() === 'true';
    if (!isPromoEnabled) return;
    
    const promoTitle = getSiteConfigValue('Promo_Title', '');
    const match = promoTitle.match(/(\d+)%/);
    if (!match) return; // Si no hay porcentaje en el título, no podemos aplicar descuento
    
    const discountPercentage = parseInt(match[1], 10);
    if (discountPercentage <= 0 || discountPercentage >= 100) return;
    
    const factor = 1 - (discountPercentage / 100);
    
    allProducts.forEach(product => {
        const isPromo = String(product.Promocion || '').toUpperCase() === 'VERDADERO' || String(product.Promocion || '').toLowerCase() === 'true';
        if (isPromo) {
            // Descuento en precio al detal
            if (product.Precio > 0 && !product.PrecioOriginal) {
                product.PrecioOriginal = product.Precio;
                product.Precio = product.Precio * factor;
                if (!product.Precio_Anterior) product.Precio_Anterior = product.PrecioOriginal;
            }
            
            // Descuento en precio mayorista
            const wholesaleKey = Object.keys(product).find(k => ['Precio_Mayorista', 'Precio Mayor', 'Precio Mayorista', 'precio_mayorista', 'PrecioMayorista', 'Mayorista'].includes(k));
            if (wholesaleKey && product[wholesaleKey] > 0 && !product.PrecioMayoristaOriginal) {
                product.PrecioMayoristaOriginal = product[wholesaleKey];
                product[wholesaleKey] = product[wholesaleKey] * factor;
            }
        }
    });
}

// -- LOAD PRODUCTS FROM GOOGLE SHEETS --
async function loadProducts(options = {}) {
    const { renderCatalog = true, useCache = true } = options;
    const usedProductCache = useCache && allProducts.length === 0 && hydrateProductsFromCache();
    const productCacheIsFresh = usedProductCache && isCacheFresh(PRODUCTS_CACHE_KEY, PRODUCTS_CACHE_TTL);

    const usedConfigCache = useCache && Object.keys(siteConfig).length === 0 && hydrateSiteConfigFromCache();
    const configCacheIsFresh = usedConfigCache && isCacheFresh(SITE_CONFIG_CACHE_KEY, SITE_CONFIG_CACHE_TTL);

    if (renderCatalog && usedProductCache) {
        applyPromotionsToProducts();
        renderBanners(bannerProducts);
        renderInventorySpotlight();
        renderCatalogProducts();
    }

    if (!productsLoadPromise && !productCacheIsFresh) {
        productsLoadPromise = fetchProducts({ showLoading: !usedProductCache && renderCatalog });
    }
    if (!configLoadPromise && !configCacheIsFresh) {
        configLoadPromise = fetchSiteConfig();
    }

    if (usedProductCache) {
        const backgroundLoads = [productsLoadPromise, configLoadPromise].filter(Boolean);
        if (backgroundLoads.length) {
            Promise.all(backgroundLoads).then(() => {
                applyPromotionsToProducts();
                if (renderCatalog) {
                    renderBanners(bannerProducts);
                    renderInventorySpotlight();
                    renderCatalogProducts();
                }
            });
        }
        return allProducts;
    }

    const requiredLoads = [productsLoadPromise, configLoadPromise].filter(Boolean);
    if (renderCatalog) {
        await Promise.all(requiredLoads);
        applyPromotionsToProducts();
        renderBanners(bannerProducts);
        renderInventorySpotlight();
        renderCatalogProducts();
    } else {
        await Promise.all(requiredLoads);
        applyPromotionsToProducts();
    }

    return allProducts;
}

function getInventorySpotlightCandidates() {
    const available = allProducts.filter(product => {
        const category = String(product.Categoria || product.categoria || '').toUpperCase();
        const stock = parseInt(product.Stock || product.stock || product.Cantidad || 0, 10);
        return category !== 'BANNER' && isActiveProduct(product) && stock > 0;
    });

    return available.length ? available : allProducts.filter(product => {
        const category = String(product.Categoria || product.categoria || '').toUpperCase();
        return category !== 'BANNER' && isActiveProduct(product);
    });
}

function getProductImageSet(product) {
    const images = [
        product.Imagen,
        product.imagen,
        product.Foto,
        ...(Array.isArray(product.Galeria) ? product.Galeria : [])
    ]
        .map(normalizeImageUrl)
        .filter(Boolean);

    return [...new Set(images)].slice(0, 4);
}
function renderInventorySpotlightLoading() {
    const track = document.getElementById('hero-track');
    const currentSlideEl = document.getElementById('hero-current-slide');
    const totalSlideEl = document.getElementById('hero-total-slides');
    if (!track) return;

    if (heroProductCarouselTimer) {
        clearInterval(heroProductCarouselTimer);
        heroProductCarouselTimer = null;
    }

    track.classList.add('is-loading');
    track.style.transform = '';
    track.innerHTML = `
        <div class="product-carousel-loading">
            <div class="spinner"></div>
            <span>Cargando productos del inventario...</span>
        </div>
    `;
    if (currentSlideEl) currentSlideEl.textContent = '00';
    if (totalSlideEl) totalSlideEl.textContent = '00';
}

function renderInventorySpotlightEmpty(message = 'No hay productos disponibles para destacar.') {
    const hero = document.getElementById('presentacion');
    const track = document.getElementById('hero-track');
    const currentSlideEl = document.getElementById('hero-current-slide');
    const totalSlideEl = document.getElementById('hero-total-slides');
    if (!track) return;

    if (heroProductCarouselTimer) {
        clearInterval(heroProductCarouselTimer);
        heroProductCarouselTimer = null;
    }

    track.classList.add('is-loading');
    track.style.transform = '';
    track.innerHTML = `
        <div class="product-carousel-loading">
            <span>${escapeHtml(message)}</span>
            <button type="button" class="btn-filter" onclick="document.getElementById('coleccion')?.scrollIntoView({behavior:'smooth'})">Ver cat&aacute;logo</button>
        </div>
    `;
    if (currentSlideEl) currentSlideEl.textContent = '00';
    if (totalSlideEl) totalSlideEl.textContent = '00';

    hero?.querySelector('.hero-tag') && (hero.querySelector('.hero-tag').innerHTML = '<span class="dot"></span> Inventario');
    hero?.querySelector('.hero-title') && (hero.querySelector('.hero-title').innerHTML = 'CAT&Aacute;LOGO<br><span class="gradient">BLYXU</span>');
    hero?.querySelector('.hero-subtitle') && (hero.querySelector('.hero-subtitle').textContent = message);
}

function getSpotlightProductDetails(product, index = 0) {
    const productIndex = allProducts.indexOf(product);
    const name = product.Nombre || product.nombre || product.Producto || 'Producto BLYXU';
    const category = product.Categoria || product.categoria || 'Destacado';
    const description = product.Descripcion || product.descripcion || product.Color || 'Pieza disponible en el inventario BLYXU.';
    const colors = String(product.Color || product.color || '').split(',').map(color => color.trim()).filter(Boolean);
    const tags = [category, ...colors].filter(Boolean).slice(0, 4);
    const price = getProductPrice(product, 'retail');
    const showPrice = shouldShowProductPrices('retail');
    const detailUrl = productIndex >= 0 ? `producto.html?id=${productIndex}` : '#coleccion';
    const images = getProductImageSet(product);
    const image = images[0] || 'hero_necklace.png';

    return { productIndex, name, category, description, tags, price, showPrice, detailUrl, image, number: index + 1 };
}

function updateSpotlightText(product, index = 0) {
    const hero = document.getElementById('presentacion');
    if (!hero || !product) return;

    const details = getSpotlightProductDetails(product, index);
    const tagEl = hero.querySelector('.hero-tag');
    const titleEl = hero.querySelector('.hero-title');
    const subtitleEl = hero.querySelector('.hero-subtitle');
    const tagsEl = hero.querySelector('.hero-sizes');
    const priceLabelEl = hero.querySelector('.hero-price-label');
    const priceEl = hero.querySelector('.hero-price');
    const ctaBtn = hero.querySelector('.btn-add-cart');

    if (tagEl) tagEl.innerHTML = '<span class="dot"></span> Producto del inventario';
    if (titleEl) {
        const firstLine = normalizeSearchText(details.name).includes(normalizeSearchText(details.category)) ? 'DESTACADO' : String(details.category).toUpperCase();
        titleEl.innerHTML = `${escapeHtml(firstLine)}<br><span class="gradient">${escapeHtml(details.name)}</span>`;
    }
    if (subtitleEl) subtitleEl.textContent = details.description;
    if (tagsEl) {
        tagsEl.innerHTML = details.tags.map((tag, tagIndex) => `<span class="${tagIndex === 0 ? 'active' : ''}">${escapeHtml(tag)}</span>`).join('');
        tagsEl.querySelectorAll('span').forEach(tag => {
            tag.addEventListener('click', () => {
                tagsEl.querySelectorAll('span').forEach(item => item.classList.remove('active'));
                tag.classList.add('active');
            });
        });
    }
    if (priceLabelEl) priceLabelEl.textContent = details.showPrice ? 'PRECIO' : 'CONSULTA';
    if (priceEl) priceEl.textContent = details.showPrice ? formatMoney(details.price) : 'Por consultar';
    if (ctaBtn) {
        ctaBtn.onclick = () => { window.location.href = details.detailUrl; };
        ctaBtn.innerHTML = `
            <span class="icon-circle">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
                    <path d="M3 6h18" />
                    <path d="M16 10a4 4 0 01-8 0" />
                </svg>
            </span>
            VER PRODUCTO
        `;
    }
}

function renderInventorySpotlightProducts(products) {
    const track = document.getElementById('hero-track');
    if (!track || !products.length) return;

    track.classList.remove('is-loading');
    track.innerHTML = products.map((product, index) => {
        const details = getSpotlightProductDetails(product, index);
        const priceText = details.showPrice ? formatMoney(details.price) : 'Por consultar';
        const toneClass = index % 3 === 1 ? 'neon-aqua' : index % 3 === 2 ? 'neon-gold' : '';
        const stockBadge = getProductBadgeMarkup(product, index);
        return `
            <article class="hero-carousel-slide product-glass-card ${index === 0 ? 'active' : ''}" data-detail-url="${escapeHtml(details.detailUrl)}">
                <div class="product-glass-media ${toneClass}">
                    <img src="${escapeHtml(details.image)}" alt="${escapeHtml(details.name)}" loading="lazy" onerror="this.style.display='none'; this.parentElement.classList.add('is-fallback')">
                    <span class="product-glass-badge">${escapeHtml(details.category)}</span>
                    ${stockBadge}
                </div>
                <div class="product-glass-info">
                    <span>${String(index + 1).padStart(2, '0')}</span>
                    <h3>${escapeHtml(details.name)}</h3>
                    <p>${escapeHtml(details.description)}</p>
                    <strong>${escapeHtml(priceText)}</strong>
                </div>
            </article>`;
    }).join('');

    updateSpotlightText(products[0], 0);
    initHeroCarousel(0, products);
}

function renderInventorySpotlightProduct(product) {
    renderInventorySpotlightProducts([product]);
}

function renderInventorySpotlight() {
    const marqueeContainer = document.getElementById('image-marquee-container');
    if (!marqueeContainer) return;

    // Get up to 15 random products with images
    const candidates = getShuffledProducts(allProducts, Date.now())
        .filter(p => {
            const img = getProductImageSet(p)[0];
            return img && img !== 'hero_necklace.png';
        })
        .slice(0, 15);

    if (!candidates.length) {
        document.getElementById('image-carousel').style.display = 'none';
        return;
    }

    // Generate HTML for the images
    const imagesHtml = candidates.map(p => {
        const img = getProductImageSet(p)[0];
        const detailUrl = `producto.html?id=${allProducts.indexOf(p)}`;
        const stockBadge = getProductBadgeMarkup(p);
        return `<div class="marquee-item" onclick="window.location.href='${escapeHtml(detailUrl)}'" title="${escapeHtml(p.Nombre || '')}">
                    <img src="${escapeHtml(img)}" alt="${escapeHtml(p.Nombre || '')}" loading="lazy" onerror="this.parentElement.style.display='none'">
                    ${stockBadge}
                </div>`;
    }).join('');

    // Duplicate for seamless infinite scrolling
    marqueeContainer.innerHTML = imagesHtml + imagesHtml;
    
    inventorySpotlightRendered = true;
}

async function fetchProducts(options = {}) {
    const { showLoading = true } = options;
    let dataProducts = [];

    if (!GOOGLE_SHEET_API) {
        dataProducts = getDemoProducts();
    } else {
        try {
            setProductsLoading(showLoading);
            const res = await fetch(GOOGLE_SHEET_PRODUCTS_URL + '&_=' + Date.now(), {
                cache: 'no-store'
            });
            const data = await res.json();
            if (data && (data.status === 'error' || data.ok === false)) {
                throw new Error(data.message || data.error || 'Error del Apps Script');
            }
            dataProducts = (Array.isArray(data) ? data : (data.data || data.productos || []))
                .map(normalizeGoogleProduct)
                .filter(isActiveProduct);
            
            // Si la API no retorna productos validos (por ej: error "Hoja no encontrada")
            if (dataProducts.length === 0) {
                console.warn('La API de Google retorno 0 productos o un error:', data.message);
            }
        } catch (err) {
            console.error('Error cargando productos:', err);
            productsLoadError = err.message || 'No se pudo conectar con Google Sheets';
            if (allProducts.length) {
                productsLoadError = '';
                setProductsLoading(false);
                return allProducts;
            }
            dataProducts = [];
        }
    }
    
    setProductsLoading(false);

    if (!dataProducts.length && allProducts.length) {
        return allProducts;
    }
    
    // Separar banners del catalogo regular
    bannerProducts = dataProducts.filter(p => String(p.Categoria || p.categoria || '').toUpperCase() === 'BANNER');
    allProducts = dataProducts.filter(p => String(p.Categoria || p.categoria || '').toUpperCase() !== 'BANNER');
    writeCache(PRODUCTS_CACHE_KEY, { products: allProducts, banners: bannerProducts });

    return allProducts;
}

async function fetchSiteConfig() {
    if (!GOOGLE_SHEET_API) return siteConfig;

    try {
        const url = `${GOOGLE_SHEET_API}?action=get_config&_=${Date.now()}`;
        const res = await fetch(url, {
            cache: 'no-store'
        });
        const data = await res.json();
        if (data && data.status === 'success' && data.config) {
            siteConfig = data.config;
            showRetailPrices = String(siteConfig[RETAIL_PRICE_CONFIG_KEY] || '0') === '1';
            localStorage.setItem(RETAIL_PRICE_VISIBILITY_KEY, showRetailPrices ? '1' : '0');
            writeCache(SITE_CONFIG_CACHE_KEY, siteConfig);
        }
    } catch (err) {
        console.warn('No se pudo cargar configuracion del sitio:', err);
    }

    return siteConfig;
}

function getSiteConfigValue(key, fallback = '') {
    const value = siteConfig[key];
    return value === undefined || value === null || value === '' ? fallback : String(value);
}

function setTextById(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setLinkById(id, href, label) {
    const el = document.getElementById(id);
    if (!el) return;
    el.href = href || '#';
    if (label) el.textContent = label;
    el.style.display = href ? '' : 'none';
}

function renderContactTimeline(hours) {
    const timeline = document.getElementById('contact-hours-timeline');
    if (!timeline) return;

    const parts = String(hours || '').split(/\s*-\s*|\s+a\s+/i).map(part => part.trim()).filter(Boolean);
    const open = parts[0] || '10:00 AM';
    const close = parts[1] || '7:00 PM';

    timeline.innerHTML = [
        ['Apertura', open, true],
        ['Pedidos', 'Disponible', false],
        ['Cierre', close, false]
    ].map(([label, value, active]) => `
        <div class="contact-time-node ${active ? 'active' : ''}">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
        </div>
    `).join('');
}

function startContactClock(city) {
    const clock = document.getElementById('contact-live-clock');
    if (!clock) return;

    const cityEl = document.getElementById('contact-clock-city');
    if (cityEl) cityEl.textContent = city || 'Bogota, Colombia';

    function tick() {
        clock.textContent = new Intl.DateTimeFormat('es-CO', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'America/Bogota'
        }).format(new Date());
    }

    tick();
    setInterval(tick, 1000);
}

function initContactRequestForm(whatsapp) {
    const form = document.getElementById('contact-request-form');
    if (!form) return;

    form.addEventListener('submit', e => {
        e.preventDefault();
        const name = document.getElementById('contact-request-name')?.value.trim() || '';
        const email = document.getElementById('contact-request-email')?.value.trim() || '';
        const topic = document.getElementById('contact-request-topic')?.value || 'Solicitud concierge';
        const message = document.getElementById('contact-request-message')?.value.trim() || '';
        const phone = String(whatsapp || BLYXU_WHATSAPP_PHONE).replace(/\D/g, '');

        const text = [
            '*Solicitud Concierge BLYXU*',
            '',
            `*Nombre:* ${name}`,
            email ? `*Correo:* ${email}` : '',
            `*Interes:* ${topic}`,
            message ? `*Mensaje:* ${message}` : ''
        ].filter(Boolean).join('\n');

        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
    });
}

function renderContactPage() {
    if (document.body?.dataset.page !== 'contact') return;

    const address = getSiteConfigValue('Contacto_Direccion', 'Bogota, Colombia');
    const city = getSiteConfigValue('Contacto_Ciudad', 'Atencion nacional desde Bogota');
    const days = getSiteConfigValue('Contacto_Dias', 'Lunes a Sabado');
    const hours = getSiteConfigValue('Contacto_Horarios', '10:00 a.m. - 7:00 p.m.');
    const note = getSiteConfigValue('Contacto_Nota', 'Coordina tu visita, consulta disponibilidad de piezas y recibe atencion directa para tus pedidos BLYXU.');
    const serviceTitle = getSiteConfigValue('Contacto_Titulo_Atencion', 'Pedidos privados');
    const serviceDetail = getSiteConfigValue('Contacto_Detalle_Atencion', 'Escribenos para coordinar compras, confirmar disponibilidad y programar atencion en boutique.');
    const whatsapp = getSiteConfigValue('Contacto_WhatsApp', BLYXU_WHATSAPP_PHONE);
    const instagram = getSiteConfigValue('Contacto_Instagram', '');
    const email = getSiteConfigValue('Contacto_Email', '');
    const mapUrl = getSiteConfigValue('Contacto_Mapa_URL', BLYXU_DEFAULT_MAP_URL);
    const mapFrame = document.getElementById('contact-map-frame');
    if (mapFrame) {
        mapFrame.src = `https://www.google.com/maps?q=${encodeURIComponent(`${address} ${city}`)}&output=embed`;
    }

    setTextById('contact-address', address);
    setTextById('contact-city', city);
    setTextById('contact-map-title', city || 'BLYXU Boutique');
    setTextById('contact-days', days);
    setTextById('contact-hours', hours);
    setTextById('contact-note', note);
    setTextById('contact-service-title', serviceTitle);
    setTextById('contact-service-detail', serviceDetail);

    const whatsappHref = whatsapp ? `https://wa.me/${String(whatsapp).replace(/\D/g, '')}` : '';
    const instagramHref = instagram && instagram.startsWith('http') ? instagram : (instagram ? `https://instagram.com/${instagram.replace('@', '')}` : '');
    const emailHref = email ? `mailto:${email}` : '';

    setLinkById('contact-map-link', mapUrl, 'Ver en Google Maps');
    setLinkById('contact-whatsapp', whatsappHref, 'WhatsApp');
    setLinkById('contact-instagram', instagramHref, 'Instagram');
    setLinkById('contact-email', emailHref, 'Correo');
    setLinkById('footer-whatsapp', whatsappHref, 'WhatsApp');
    setLinkById('footer-instagram', instagramHref, 'Instagram');
    setLinkById('footer-email', emailHref, 'Correo');

    renderContactTimeline(hours);
    startContactClock(city);
    initContactRequestForm(whatsapp);
}

// -- RENDER BANNERS --
function renderBanners(banners) {
    const track = document.getElementById('main-banner-track');
    const nav = document.getElementById('main-banner-nav');
    if (!track) return;

    banners = (Array.isArray(banners) ? banners : [])
        .map(normalizeGoogleProduct)
        .filter(isActiveProduct)
        .filter(b => String(b.Categoria || b.categoria || '').toUpperCase() === 'BANNER')
        .filter(b => normalizeImageUrl(b.Imagen || b.imagen || b.Foto || ''));
    
    if (!banners.length) {
        // Fallback demo banner
        banners = [{
            Nombre: 'COLECCI\u00d3N EXCLUSIVA 2026',
            Descripcion: 'Piezas artesanales con piedras naturales seleccionadas. Elegancia y poder en cada detalle.',
            Imagen: 'hero_necklace.png'
        }];
    }
    
    track.innerHTML = banners.map((b, i) => `
        <div class="main-banner-slide ${i===0?'active':''}">
            <img src="${normalizeImageUrl(b.Imagen || b.imagen || b.Foto || 'hero_necklace.png')}" alt="${escapeHtml(b.Nombre || b.nombre || 'Banner BLYXU')}" style="filter: brightness(0.6);" onerror="this.src='hero_necklace.png'">
            <div class="main-banner-overlay"></div>
            <div class="main-banner-content">
                <h1 class="main-banner-title">${escapeHtml(b.Nombre || b.nombre || '')}</h1>
                <p class="main-banner-desc">${escapeHtml(b.Descripcion || b.Color || 'Descubre nuestras \u00faltimas colecciones')}</p>
                <div style="display:flex; gap:16px; margin-top:24px; flex-wrap:wrap;">
                    <a href="#coleccion" class="main-banner-btn">Explorar Colecci\u00f3n</a>
                    <a href="javascript:void(0)" onclick="openWholesaleOverlay()" class="main-banner-btn" style="background:rgba(255,255,255,0.05); color:#fff; border:1px solid rgba(255,255,255,0.2);">Acceso Mayorista</a>
                </div>
                <div class="hero-promo-inject" style="margin-top: 32px; width: 100%;"></div>
            </div>
        </div>
    `).join('');
    
    if (nav) {
        nav.innerHTML = banners.map((b, i) => `
            <div class="main-banner-dot ${i===0?'active':''}"></div>
        `).join('');
    }
    
    initMainBannerCarousel(banners.length);
}

function initMainBannerCarousel(totalSlides) {
    if (mainBannerCarouselTimer) {
        clearInterval(mainBannerCarouselTimer);
        mainBannerCarouselTimer = null;
    }

    const prevBtn = document.getElementById('banner-prev');
    const nextBtn = document.getElementById('banner-next');
    const nav = document.getElementById('main-banner-nav');
    const track = document.getElementById('main-banner-track');

    if (totalSlides <= 1) {
        if (track) track.style.transform = 'translateX(0)';
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        if (nav) nav.style.display = 'none';
        return;
    }

    if (prevBtn) prevBtn.style.display = 'flex';
    if (nextBtn) nextBtn.style.display = 'flex';
    if (nav) nav.style.display = 'flex';
    const dots = document.querySelectorAll('.main-banner-dot');
    let currentIndex = 0;

    function update() {
        track.style.transform = `translateX(-${currentIndex * 100}%)`;
        document.querySelectorAll('.main-banner-slide').forEach((s, i) => s.classList.toggle('active', i === currentIndex));
        dots.forEach((d, i) => d.classList.toggle('active', i === currentIndex));
    }

    if (nextBtn) nextBtn.onclick = () => { currentIndex = (currentIndex + 1) % totalSlides; update(); };
    if (prevBtn) prevBtn.onclick = () => { currentIndex = (currentIndex - 1 + totalSlides) % totalSlides; update(); };
    dots.forEach((d, i) => d.onclick = () => { currentIndex = i; update(); });

    mainBannerCarouselTimer = setInterval(() => {
        currentIndex = (currentIndex + 1) % totalSlides;
        update();
    }, 6000);
}

// -- CATALOG MODES --
function getCatalogScope(product) {
    return String(product.Catalogo || product.catalogo || product['Cat\u00e1logo'] || product.catalog || product.Publicacion || product.Estilo || '').toLowerCase();
}

function getCurrentCatalogProducts() {
    if (activeCatalogMode === 'wholesale') {
        return allProducts.filter(p => {
            const scope = getCatalogScope(p);
            const hasWholesaleScope = scope && (scope.includes('mayorista') || scope.includes('ambos') || scope.includes('wholesale'));
            const wholesalePrice = getProductField(p, ['Precio_Mayorista', 'Precio Mayor', 'Precio Mayorista', 'precio_mayorista', 'PrecioMayorista', 'Mayorista'], '');
            return hasWholesaleScope || parseFloat(wholesalePrice) > 0;
        });
    }

    return allProducts.filter(p => {
        const scope = getCatalogScope(p);
        const isWholesaleOnly = scope.includes('mayorista') && !scope.includes('minorista') && !scope.includes('ambos');
        return !isWholesaleOnly;
    });
}

function getProductPrice(product, mode = activeCatalogMode) {
    const retailPrice = getProductField(product, ['Precio', 'precio', 'Precio_Publico'], 0);
    const wholesalePrice = getProductField(product, ['Precio_Mayorista', 'Precio Mayor', 'Precio Mayorista', 'precio_mayorista', 'PrecioMayorista', 'Mayorista'], retailPrice);
    return parseFloat(mode === 'wholesale' ? wholesalePrice : retailPrice) || 0;
}

function getProductStock(product) {
    return parseInt(product?.Stock || product?.stock || product?.Cantidad || 0, 10) || 0;
}

function getProductStockStatus(stock) {
    if (stock <= 0) return { type: 'out', label: 'Agotado por ahora' };
    if (stock <= LOW_STOCK_THRESHOLD) return { type: 'low', label: 'Pocas unidades' };
    return null;
}

function getProductBadgeMarkup(product, index = -1) {
    const status = getProductStockStatus(getProductStock(product));
    if (status) {
        return `<span class="product-card-badge badge-${status.type}">${escapeHtml(status.label)}</span>`;
    }
    return index >= 0 && index < 3 ? '<span class="product-card-badge badge-new">Nuevo</span>' : '';
}

function shouldShowProductPrices(mode = activeCatalogMode) {
    const savedVisibility = localStorage.getItem(RETAIL_PRICE_VISIBILITY_KEY);
    showRetailPrices = siteConfig[RETAIL_PRICE_CONFIG_KEY] !== undefined
        ? String(siteConfig[RETAIL_PRICE_CONFIG_KEY]) === '1'
        : savedVisibility !== '0';
    return mode === 'wholesale' || showRetailPrices;
}

function getProductCategory(product) {
    return String(product.Categoria || product.categoria || '').trim();
}

function isSameCategory(a, b) {
    return normalizeSearchText(a) === normalizeSearchText(b);
}

function getCatalogCategories(products) {
    const categoryMap = new Map();
    products.forEach(product => {
        const category = getProductCategory(product);
        if (!category || isSameCategory(category, 'BANNER')) return;
        const key = normalizeSearchText(category);
        if (!categoryMap.has(key)) categoryMap.set(key, category);
    });

    return Array.from(categoryMap.values()).sort((a, b) => a.localeCompare(b, 'es'));
}

function renderCategoryFilters(products, options = {}) {
    const {
        selectId = 'catalog-category-select',
        currentFilter = activeFilter,
        onChange = value => setFilter(value)
    } = options;
    const select = document.getElementById(selectId);
    if (!select) return;

    const categories = getCatalogCategories(products);
    const activeCategory = currentFilter === 'todos' ? '' : categories.find(cat => isSameCategory(cat, currentFilter));
    const normalizedFilter = currentFilter !== 'todos' && !activeCategory ? 'todos' : currentFilter;

    if (select) {
        select.innerHTML = [
            '<option value="todos">Todas las categor\u00edas</option>',
            ...categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
        ].join('');
        select.value = normalizedFilter === 'todos' ? 'todos' : (activeCategory || 'todos');
        select.onchange = () => onChange(select.value);
    }
}

function renderCatalogProducts() {
    const grid = document.getElementById('products-grid');
    const sectionTitle = document.querySelector('.collection-section .section-title');
    const products = getCurrentCatalogProducts();
    if (sectionTitle) {
        sectionTitle.textContent = activeCatalogMode === 'wholesale' ? 'CAT\u00c1LOGO MAYORISTA' : 'NUEVA COLECCI\u00d3N';
    }
    renderCategoryFilters(products);
    if (productsLoadError && grid) {
        grid.innerHTML = `<div class="cart-empty" style="grid-column:1/-1;">Error conectando Google Sheets: ${productsLoadError}</div>`;
        return;
    }
    renderProducts(products, { mode: activeCatalogMode });
}

function renderWholesaleCatalogProducts() {
    const grid = document.getElementById('wholesale-products-grid');
    if (!grid) return;

    const previousMode = activeCatalogMode;
    activeCatalogMode = 'wholesale';
    const products = getCurrentCatalogProducts();
    activeCatalogMode = previousMode;

    renderCategoryFilters(products, {
        selectId: 'wholesale-category-select',
        currentFilter: activeWholesaleFilter,
        onChange: value => setWholesaleFilter(value)
    });
    if (productsLoadError) {
        grid.innerHTML = `<div class="cart-empty" style="grid-column:1/-1;">Error conectando Google Sheets: ${productsLoadError}</div>`;
        return;
    }
    renderProducts(products, {
        mode: 'wholesale',
        gridId: 'wholesale-products-grid',
        filter: activeWholesaleFilter,
        searchQuery: activeWholesaleSearchQuery,
        featuredFirst: false
    });
}

function getVariantSummary(product) {
    function isCatalogOnlyValue(value) {
        const clean = normalizeSearchText(value);
        return ['ambos', 'minorista', 'mayorista', 'minoristaymayorista', 'retail', 'wholesale'].includes(clean);
    }

    function isReferenceValue(value) {
        const raw = String(value || '').trim();
        const clean = normalizeSearchText(raw);
        if (!raw) return false;
        if (/^prod-.+-v\d+$/i.test(raw) || /^var-/i.test(raw)) return true;
        return [product?.idVariacion, product?.idProducto, product?.ID, product?.SKU]
            .some(ref => ref && clean === normalizeSearchText(ref));
    }

    const parts = [
        product.Estilo || product.estilo,
        product.Tamano || product.tamano || product.Talla,
        product.Color || product.color
    ]
        .map(value => String(value || '').trim())
        .filter(value => value && !isCatalogOnlyValue(value) && !isReferenceValue(value));

    return Array.from(new Set(parts)).join(' / ');
}

// -- RENDER PRODUCTS --
function renderProducts(products, options = {}) {
    const {
        featuredFirst = !document.getElementById('product-detail'),
        mode = activeCatalogMode,
        gridId = 'products-grid',
        filter = activeFilter,
        searchQuery = activeSearchQuery
    } = options;
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const showPrices = shouldShowProductPrices(mode);
    const renderToken = ++catalogRenderToken;

    const filteredByCategory = filter === 'todos' ? products :
        products.filter(p => isSameCategory(getProductCategory(p), filter));
    
    const searched = applySmartProductSearch(filteredByCategory, searchQuery);
    const visibleResults = normalizeSearchText(searchQuery)
        ? collapseSearchResultsToGeneralReferences(searched, filteredByCategory)
        : searched;

    const filtered = getShuffledProducts(collapseCatalogProductsToRepresentatives(visibleResults, mode));

    if (!filtered.length) {
        grid.innerHTML = `<div class="cart-empty" style="grid-column:1/-1;">No se encontraron productos${searchQuery ? ' para tu b\u00fasqueda' : ''}</div>`;
        return;
    }

    const renderKey = [
        gridId,
        mode,
        normalizeSearchText(filter),
        normalizeSearchText(searchQuery)
    ].join('|');
    const previousBatch = catalogBatchMemory.get(renderKey);
    const initialBatchSize = Math.max(
        CATALOG_BATCH_SIZE,
        Math.min(previousBatch?.rendered || 0, filtered.length)
    );
    const shouldRestoreScroll = Boolean(previousBatch?.rendered && previousBatch.rendered > CATALOG_BATCH_SIZE);
    const previousScrollY = window.scrollY;

    grid.innerHTML = '';
    let rendered = 0;

    function productCardTemplate(p, i) {
        const name = p.Nombre || p.nombre || p.Producto || 'Producto';
        const price = getProductPrice(p, mode);
        const oldPrice = parseFloat(mode === 'wholesale' ? (p.PrecioMayoristaOriginal || 0) : (p.Precio_Anterior || 0));
        const img = normalizeImageUrl(p.Imagen || p.imagen || p.Foto || (p.Galeria && p.Galeria[0]) || '');
        const cat = p.Categoria || p.categoria || '';
        const stock = getProductStock(p);
        const colors = (p.Color || p.color || '').split(',').map(c => c.trim()).filter(Boolean);
        const variantText = getVariantSummary(p);
        const originalIndex = allProducts.indexOf(p);
        const productIndex = originalIndex >= 0 ? originalIndex : i;
        const isFeatured = featuredFirst && i === 0;
        const detailUrl = `producto.html?id=${productIndex}${mode === 'wholesale' ? '&catalogo=mayorista' : ''}`;
        const badge = getProductBadgeMarkup(p, i);

        return `
        <div class="product-card ${isFeatured ? 'featured' : ''} reveal" data-index="${productIndex}">
            <div class="product-card-img" onclick="window.location.href='${detailUrl}'">
                ${img ? `<img src="${img}" alt="${name}" loading="lazy" onerror="this.style.display='none'">` :
                  `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1a0e2e,#2d1552);font-size:48px;opacity:.3;">?</div>`}
                ${badge}
                ${stock > 0 ? `<button class="product-card-quick" onclick="event.stopPropagation(); addToCart(${productIndex}, this, '${mode}')" title="${showPrices ? 'Agregar al carrito' : 'Agregar a consulta general'}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/></svg>
                </button>` : ''}
            </div>
            <div class="product-card-info" onclick="window.location.href='${detailUrl}'">
                <div class="product-card-name">${name}</div>
                <div class="product-card-desc">${cat}</div>
                ${variantText ? `<div class="product-card-variant">${escapeHtml(variantText)}</div>` : ''}
                ${colors.length ? `<div class="product-card-colors">${colors.map(c => `<span class="color-dot" style="background:${getColorHex(c)}" title="${c}"></span>`).join('')}</div>` : ''}
                ${showPrices ? `<div class="product-card-price ${oldPrice > price ? 'discount-active' : ''}">
                    ${formatMoney(price)}
                    ${oldPrice > price ? `<span class="old">${formatMoney(oldPrice)}</span>` : ''}
                </div>` : stock > 0 ? `<button class="product-card-price price-hidden price-consult-btn" type="button" onclick="event.stopPropagation(); consultProductByWhatsApp(allProducts[${productIndex}], '${detailUrl}')">Precio por consultar</button>` :
                `<button class="product-card-price price-hidden price-consult-btn" type="button" disabled>Agotado por ahora</button>`}
            </div>
        </div>`;
    }

    function renderNextBatch(batchSize = CATALOG_BATCH_SIZE) {
        if (renderToken !== catalogRenderToken) return;

        grid.querySelector('.catalog-load-more-wrap')?.remove();
        const start = rendered;
        const end = Math.min(start + batchSize, filtered.length);
        const batch = filtered
            .slice(start, end)
            .map((product, index) => productCardTemplate(product, start + index))
            .join('');

        grid.insertAdjacentHTML('beforeend', batch);
        rendered = end;
        catalogBatchMemory.set(renderKey, { rendered, total: filtered.length });
        initReveal(grid);

        if (rendered < filtered.length) {
            grid.insertAdjacentHTML('beforeend', `
                <div class="catalog-load-more-wrap">
                    <span class="catalog-load-status">Mostrando ${rendered} de ${filtered.length} productos</span>
                    <button class="catalog-load-more btn-filter" type="button" onclick="loadMoreCatalogBatch(this)">Ver m&aacute;s</button>
                </div>
            `);
        }
    }

    catalogBatchState = { renderToken, renderKey, renderNextBatch };
    renderNextBatch(initialBatchSize);
    if (shouldRestoreScroll) {
        requestAnimationFrame(() => window.scrollTo(0, previousScrollY));
    }
}

function loadMoreCatalogBatch(trigger) {
    if (catalogBatchState) {
        const previousScrollY = window.scrollY;
        if (trigger) {
            trigger.disabled = true;
            trigger.setAttribute('aria-busy', 'true');
        }
        catalogBatchState.renderNextBatch();
        requestAnimationFrame(() => window.scrollTo(0, previousScrollY));
    }
}

function getColorHex(name) {
    const map = { blanco:'#fff', negro:'#222', rojo:'#e53e3e', azul:'#3b82f6', verde:'#22c55e',
        morado:'#9b2cfa', rosa:'#ec4899', dorado:'#d4a017', plata:'#c0c0c0', plateado:'#c0c0c0' };
    return map[name.toLowerCase()] || '#888';
}

// -- CART --
function normalizeCartMode(mode) {
    return mode === 'wholesale' ? 'wholesale' : 'retail';
}

function getInitialCartMode() {
    try {
        const params = new URLSearchParams(window.location.search);
        if (document.body?.dataset.catalogMode === 'wholesale' || params.get('catalogo') === 'mayorista') {
            return 'wholesale';
        }
    } catch (error) {
        // Mantener modo normal si no se puede leer la URL.
    }
    return 'retail';
}

function readCartFromStorage(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function migrateLegacyCartIfNeeded() {
    const legacyCart = readCartFromStorage(LEGACY_CART_KEY);
    if (!legacyCart.length) return;

    const hasSeparatedCart = readCartFromStorage(CART_STORAGE_KEYS.retail).length || readCartFromStorage(CART_STORAGE_KEYS.wholesale).length;
    if (hasSeparatedCart) {
        localStorage.removeItem(LEGACY_CART_KEY);
        return;
    }

    const grouped = { retail: [], wholesale: [] };
    legacyCart.forEach(item => {
        const mode = normalizeCartMode(item?.mode);
        grouped[mode].push({ ...item, mode });
    });
    localStorage.setItem(CART_STORAGE_KEYS.retail, JSON.stringify(grouped.retail));
    localStorage.setItem(CART_STORAGE_KEYS.wholesale, JSON.stringify(grouped.wholesale));
    localStorage.removeItem(LEGACY_CART_KEY);
}

function loadCart(mode = activeCartMode) {
    migrateLegacyCartIfNeeded();
    return readCartFromStorage(CART_STORAGE_KEYS[normalizeCartMode(mode)]);
}

function setCartMode(mode) {
    activeCartMode = normalizeCartMode(mode);
    document.body?.setAttribute('data-cart-mode', activeCartMode);
    cart = loadCart(activeCartMode);
    return cart;
}

function setCatalogCartMode(mode) {
    activeCatalogMode = normalizeCartMode(mode);
    setCartMode(activeCatalogMode);
    updateCartUI();
}

function getCartModeLabel(mode = activeCartMode) {
    return normalizeCartMode(mode) === 'wholesale' ? 'Mayorista' : 'Cat&aacute;logo';
}

function addToCart(idx, sourceButton, mode = activeCatalogMode) {
    mode = normalizeCartMode(mode);
    setCartMode(mode);
    const p = allProducts[idx];
    if (!p) return;
    const name = p.Nombre || p.nombre || p.Producto || 'Producto';
    const price = getProductPrice(p, mode);
    const img = normalizeImageUrl(p.Imagen || p.imagen || (p.Galeria && p.Galeria[0]) || '');
    const idVariacion = p.idVariacion || p['ID Variaci\u00f3n'] || p['ID Variacion'] || p.SKU || name;
    const sku = p.SKU || p.sku || '';
    const stock = parseInt(p.Stock || p.stock || p.Cantidad || 0, 10) || 0;
    const priceVisible = shouldShowProductPrices(mode);
    const existing = cart.find(c => (c.idVariacion || c.name) === idVariacion && c.mode === mode);
    if (existing) {
        existing.qty = Math.min((existing.qty || 1) + 1, stock || 999);
        existing.priceVisible = priceVisible;
    }
    else { cart.push({ idVariacion, sku, name, price, priceVisible, img, qty: 1, mode, stock }); }
    saveCart();
    updateCartUI();
    
    // Iluminar el carrito sin abrir el panel lateral
    const cartBtn = document.getElementById('cart-btn');
    if (cartBtn) {
        cartBtn.classList.remove('cart-highlight-active');
        void cartBtn.offsetWidth; // Forzar reflow para reiniciar la animación
        cartBtn.classList.add('cart-highlight-active');
        setTimeout(() => {
            cartBtn.classList.remove('cart-highlight-active');
        }, 900);
    }
    
    // Button animation
    const btn = sourceButton || document.querySelector(`.product-card[data-index="${idx}"] .product-card-quick`);
    if (btn) { btn.style.background = '#22c55e'; setTimeout(() => btn.style.background = '', 600); }
}

function removeFromCart(idx) {
    cart.splice(idx, 1);
    saveCart();
    updateCartUI();
}

function updateCartQty(idx, qty) {
    const item = cart[idx];
    if (!item) return;
    const max = parseInt(item.stock || 0, 10) || 999;
    const nextQty = Math.max(1, Math.min(max, parseInt(qty, 10) || 1));
    item.qty = nextQty;
    saveCart();
    updateCartUI();
}

function incrementCartQty(idx, delta) {
    const item = cart[idx];
    if (!item) return;
    updateCartQty(idx, (item.qty || 1) + delta);
}

function saveCart(mode = activeCartMode) {
    localStorage.setItem(CART_STORAGE_KEYS[normalizeCartMode(mode)], JSON.stringify(cart));
}

function updateCartUI() {
    const badge = document.getElementById('cart-count');
    const itemsEl = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    const consultNoteEl = document.getElementById('cart-consult-note');
    const titleEl = document.querySelector('.cart-header h3');
    const count = cart.reduce((s, c) => s + c.qty, 0);
    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
    if (titleEl) titleEl.innerHTML = `Carrito ${getCartModeLabel()}`;
    if (!itemsEl) return;
    if (!cart.length) {
        itemsEl.innerHTML = `<div class="cart-empty">Tu carrito ${getCartModeLabel()} est&aacute; vac&iacute;o</div>`;
        if (totalEl) totalEl.textContent = '$0';
        if (consultNoteEl) consultNoteEl.textContent = '';
        const checkoutBtn = document.getElementById('btn-checkout');
        const formContainer = document.getElementById('cart-wholesale-form');
        if (formContainer) formContainer.style.display = 'none';
        if (checkoutBtn) {
            checkoutBtn.textContent = activeCartMode === 'wholesale' ? 'Registrar Pedido Mayorista' : 'Enviar consulta por WhatsApp';
            checkoutBtn.style.display = 'block';
        }
        return;
    }
    itemsEl.innerHTML = cart.map((c, i) => `
        <div class="cart-item">
            ${c.img ? `<img src="${c.img}" class="cart-item-img" alt="">` : '<div class="cart-item-img" style="display:flex;align-items:center;justify-content:center;font-size:20px">?</div>'}
            <div class="cart-item-info">
                <div class="cart-item-name">${c.name}</div>
                <div class="cart-item-price">${c.priceVisible === false ? 'Precio por consultar' : `${formatMoney(c.price)} unidad`}</div>
                <div class="cart-item-qty">
                    <button type="button" onclick="incrementCartQty(${i}, -1)" aria-label="Restar cantidad">-</button>
                    <input type="number" min="1" ${c.stock ? `max="${c.stock}"` : ''} value="${c.qty}" onchange="updateCartQty(${i}, this.value)" aria-label="Cantidad">
                    <button type="button" onclick="incrementCartQty(${i}, 1)" aria-label="Sumar cantidad">+</button>
                </div>
                <div class="cart-item-subtotal">${c.priceVisible === false ? 'Por consultar' : formatMoney(c.price * c.qty)}</div>
            </div>
            <button class="cart-item-remove" onclick="removeFromCart(${i})">&times;</button>
        </div>
    `).join('');
    const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
    const hasHiddenPrices = cart.some(c => c.priceVisible === false);
    if (totalEl) totalEl.textContent = hasHiddenPrices ? 'Por consultar' : formatMoney(total);
    if (consultNoteEl) {
        consultNoteEl.textContent = hasHiddenPrices
            ? 'Este carrito se enviara como consulta general por WhatsApp. Para consultar un solo producto, usa el boton "Precio por consultar" del producto.'
            : 'Al finalizar, se enviara el listado del carrito por WhatsApp.';
    }
    const checkoutBtn = document.getElementById('btn-checkout');
    if (checkoutBtn) {
        const isWholesaleOrder = activeCartMode === 'wholesale';
        checkoutBtn.textContent = isWholesaleOrder ? 'Registrar Pedido Mayorista' : 'Enviar consulta por WhatsApp';

        // Manejo del form inline para mayoristas
        let formContainer = document.getElementById('cart-wholesale-form');
        if (!isWholesaleOrder && formContainer) formContainer.style.display = 'none';
        if (!formContainer) {
            formContainer = document.createElement('div');
            formContainer.id = 'cart-wholesale-form';
            formContainer.style.display = 'none';
            formContainer.style.marginTop = '16px';
            formContainer.innerHTML = `
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:16px; margin-bottom:12px;">
                    <h4 style="margin:0 0 12px; font-size:14px; font-weight:800; color:#fff;">Datos de Envío</h4>
                    <input type="text" id="ws-nombre" class="form-control" placeholder="Nombre completo" required style="margin-bottom:8px; font-size:13px; padding:8px 12px; border-radius:8px;">
                    <input type="tel" id="ws-telefono" class="form-control" placeholder="Número de celular" required style="margin-bottom:8px; font-size:13px; padding:8px 12px; border-radius:8px;">
                    <input type="text" id="ws-direccion" class="form-control" placeholder="Dirección de entrega (opcional)" style="margin-bottom:8px; font-size:13px; padding:8px 12px; border-radius:8px;">
                    <input type="text" id="ws-ciudad" class="form-control" placeholder="Ciudad (opcional)" style="margin-bottom:8px; font-size:13px; padding:8px 12px; border-radius:8px;">
                    <textarea id="ws-nota" class="form-control" placeholder="Nota adicional (opcional)" style="margin-bottom:12px; min-height:50px; font-size:13px; padding:8px 12px; border-radius:8px; resize:vertical;"></textarea>
                    
                    <button class="btn-checkout" id="btn-confirm-ws" type="button" style="background:linear-gradient(135deg, #10B981, #059669); margin-bottom:8px;">Confirmar y Enviar Pedido</button>
                    <button class="btn-filter" id="btn-cancel-ws" type="button" style="width:100%; border:1px solid rgba(255,255,255,0.2);">Cancelar</button>
                </div>
            `;
            const footer = document.querySelector('.cart-footer');
            if (footer) footer.insertBefore(formContainer, checkoutBtn);

            document.getElementById('btn-cancel-ws').addEventListener('click', () => {
                formContainer.style.display = 'none';
                const currentCheckoutBtn = document.getElementById('btn-checkout');
                if (currentCheckoutBtn) currentCheckoutBtn.style.display = 'block';
            });

            document.getElementById('btn-confirm-ws').addEventListener('click', () => {
                const n = document.getElementById('ws-nombre').value.trim();
                const t = document.getElementById('ws-telefono').value.trim();
                const d = document.getElementById('ws-direccion').value.trim();
                const c = document.getElementById('ws-ciudad').value.trim();
                
                let errorBox = document.getElementById('ws-form-error');
                if (!errorBox) {
                    errorBox = document.createElement('div');
                    errorBox.id = 'ws-form-error';
                    errorBox.style.cssText = 'color:#ef4444; font-size:12px; margin-bottom:12px; font-weight:600; display:none; text-align:center; background:rgba(239,68,68,0.1); padding:8px; border-radius:6px;';
                    const nameInput = document.getElementById('ws-nombre');
                    if (nameInput && nameInput.parentNode) {
                        nameInput.parentNode.insertBefore(errorBox, nameInput);
                    } else {
                        formContainer.appendChild(errorBox);
                    }
                }
                
                if(!n || !t) {
                    errorBox.textContent = '✦ Por favor completa nombre y celular.';
                    errorBox.style.display = 'block';
                    return;
                }
                
                errorBox.style.display = 'none';
                window.wsClienteTemp = { nombre: n, telefono: t, direccion: d, ciudad: c, nota: document.getElementById('ws-nota').value.trim() };
                
                // Mostrar loader premium inmediatamente
                formContainer.innerHTML = `
                    <div style="text-align:center; padding:32px 16px;">
                        <div class="loader-bar" style="height:4px; width:100%; background:rgba(255,255,255,0.1); border-radius:4px; margin-bottom:16px; overflow:hidden;">
                            <div style="height:100%; width:50%; background:linear-gradient(90deg,var(--primary),#d946ef); border-radius:4px; animation:loadSlide 1s infinite ease-in-out;"></div>
                        </div>
                        <style>@keyframes loadSlide { 0%{transform:translateX(-100%)} 100%{transform:translateX(200%)} }</style>
                        <h4 style="margin:0 0 8px; font-size:16px; font-weight:800; color:#fff;">Registrando Pedido...</h4>
                        <p style="margin:0; font-size:12px; color:rgba(255,255,255,0.5);">Sincronizando con el inventario central</p>
                    </div>
                `;
                checkout(true); // true indica que ya tenemos los datos y pasamos al flujo
            });
        }

        // Remover event listener previo limpiando el elemento
        const newBtn = checkoutBtn.cloneNode(true);
        checkoutBtn.parentNode.replaceChild(newBtn, checkoutBtn);
        
        newBtn.addEventListener('click', () => {
            if (isWholesaleOrder) {
                formContainer.style.display = 'block';
                newBtn.style.display = 'none';
            } else {
                checkout(false);
            }
        });
    }
}

function openCart() {
    setCartMode(activeCartMode);
    updateCartUI();
    document.getElementById('cart-overlay')?.classList.add('open');
    document.getElementById('cart-sidebar')?.classList.add('open');
}
function closeCart() {
    document.getElementById('cart-overlay')?.classList.remove('open');
    document.getElementById('cart-sidebar')?.classList.remove('open');
}

// -- HERO CAROUSEL --
function initHeroCarousel(initialIndex = 0, products = null) {
    const track = document.getElementById('hero-track');
    const slides = Array.from(document.querySelectorAll('.hero-carousel-slide'));
    const prevBtn = document.getElementById('hero-prev');
    const nextBtn = document.getElementById('hero-next');
    const currentSlideEl = document.getElementById('hero-current-slide');
    const totalSlideEl = document.getElementById('hero-total-slides');
    if (!track || slides.length === 0) return;

    if (heroProductCarouselTimer) {
        clearInterval(heroProductCarouselTimer);
        heroProductCarouselTimer = null;
    }

    let currentIndex = Math.min(Math.max(initialIndex, 0), slides.length - 1);
    const totalSlides = slides.length;
    if (totalSlideEl) totalSlideEl.textContent = String(totalSlides).padStart(2, '0');

    function updateCarousel() {
        const activeSlide = slides[currentIndex];
        const stage = track.parentElement;
        if (activeSlide && stage) {
            const centeredOffset = (stage.clientWidth / 2) - activeSlide.offsetLeft - (activeSlide.offsetWidth / 2);
            track.style.transform = `translateX(${centeredOffset}px)`;
        }
        if (currentSlideEl) currentSlideEl.textContent = String(currentIndex + 1).padStart(2, '0');
        slides.forEach((slide, i) => {
            slide.classList.toggle('active', i === currentIndex);
        });
        if (products && products[currentIndex]) updateSpotlightText(products[currentIndex], currentIndex);
    }

    function goTo(index) {
        currentIndex = (index + totalSlides) % totalSlides;
        updateCarousel();
    }

    slides.forEach((slide, index) => {
        slide.onclick = () => {
            if (index !== currentIndex) {
                goTo(index);
                return;
            }
            const detailUrl = slide.dataset.detailUrl;
            if (detailUrl) window.location.href = detailUrl;
        };
    });

    if (nextBtn) nextBtn.onclick = () => goTo(currentIndex + 1);
    if (prevBtn) prevBtn.onclick = () => goTo(currentIndex - 1);

    heroProductCarouselTimer = setInterval(() => goTo(currentIndex + 1), 4300);
    window.addEventListener('resize', updateCarousel, { passive: true });
    requestAnimationFrame(updateCarousel);
}

// -- FILTERS --
function setFilter(cat) {
    activeFilter = cat || 'todos';
    const select = document.getElementById('catalog-category-select');
    if (select) {
        const option = Array.from(select.options).find(opt => activeFilter === 'todos' ? opt.value === 'todos' : isSameCategory(opt.value, activeFilter));
        select.value = option ? option.value : 'todos';
    }
    renderCatalogProducts();
}

function setWholesaleFilter(cat) {
    activeWholesaleFilter = cat || 'todos';
    const select = document.getElementById('wholesale-category-select');
    if (select) {
        const option = Array.from(select.options).find(opt => activeWholesaleFilter === 'todos' ? opt.value === 'todos' : isSameCategory(opt.value, activeWholesaleFilter));
        select.value = option ? option.value : 'todos';
    }
    renderWholesaleCatalogProducts();
}

function initCatalogSearch() {
    const input = document.getElementById('catalog-search');
    const wholesaleInput = document.getElementById('wholesale-catalog-search');

    let searchTimer = null;
    if (input) {
        input.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                activeSearchQuery = input.value.trim();
                if (activeSearchQuery && activeFilter !== 'todos') {
                    activeFilter = 'todos';
                    const select = document.getElementById('catalog-category-select');
                    if (select) select.value = 'todos';
                }
                renderCatalogProducts();
            }, 180);
        });
    }

    let wholesaleSearchTimer = null;
    if (wholesaleInput) {
        wholesaleInput.addEventListener('input', () => {
            clearTimeout(wholesaleSearchTimer);
            wholesaleSearchTimer = setTimeout(() => {
                activeWholesaleSearchQuery = wholesaleInput.value.trim();
                if (activeWholesaleSearchQuery && activeWholesaleFilter !== 'todos') {
                    activeWholesaleFilter = 'todos';
                    const select = document.getElementById('wholesale-category-select');
                    if (select) select.value = 'todos';
                }
                renderWholesaleCatalogProducts();
            }, 180);
        });
    }
}

function launchWholesaleConfetti() {
    const colors = ['#9b2cfa', '#d946ef', '#ffd969', '#ffffff'];
    const container = document.createElement('div');
    container.className = 'wholesale-confetti';
    document.body.appendChild(container);

    const pieces = 80;
    for (let i = 0; i < pieces; i += 1) {
        const piece = document.createElement('span');
        const angle = (Math.random() * 120) - 60;
        const distance = 120 + Math.random() * 260;
        const x = Math.sin(angle * Math.PI / 180) * distance;
        const y = -(120 + Math.random() * 280);
        piece.style.setProperty('--x', `${x}px`);
        piece.style.setProperty('--y', `${y}px`);
        piece.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
        piece.style.setProperty('--c', colors[i % colors.length]);
        piece.style.left = `${10 + Math.random() * 80}%`;
        piece.style.animationDelay = `${Math.random() * 0.2}s`;
        piece.style.animationDuration = `${1.15 + Math.random() * 0.75}s`;
        container.appendChild(piece);
    }

    return new Promise(resolve => {
        setTimeout(() => {
            container.remove();
            resolve();
        }, 1700);
    });
}

// -- WHOLESALE --
function initWholesaleAccess() {
    const overlay = document.getElementById('wholesale-overlay');
    const form = document.getElementById('wholesale-form');
    const input = document.getElementById('wholesale-key');
    const error = document.getElementById('wholesale-error');
    const closeBtn = document.getElementById('wholesale-close');
    const triggers = document.querySelectorAll('a[href="#mayorista"]');

    initWholesaleParticles(); // Iniciar partículas

    window.openWholesaleOverlay = function() {
        if(overlay) {
            overlay.classList.add('open');
            overlay.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            if(input) setTimeout(() => input.focus(), 100);
        }
    };

    triggers.forEach(t => {
        t.addEventListener('click', (e) => {
            e.preventDefault();
            window.openWholesaleOverlay();
        });
    });
    
    const retailTriggers = document.querySelectorAll('a[href="#coleccion"]');
    const wholesaleSection = document.getElementById('catalogo-mayorista');

    if (!overlay || !form || !input) return;

    function openWholesale(e) {
        e?.preventDefault();
        error?.classList.remove('show');
        input.value = '';
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        setTimeout(() => input.focus(), 80);

        document.getElementById('nav-toggle')?.classList.remove('open');
        document.getElementById('nav-links')?.classList.remove('open');
    }

    function closeWholesale() {
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }

    triggers.forEach(trigger => trigger.addEventListener('click', openWholesale));
    retailTriggers.forEach(trigger => trigger.addEventListener('click', () => {
        setCatalogCartMode('retail');
        activeFilter = 'todos';
        wholesaleSection?.classList.remove('open');
        wholesaleSection?.setAttribute('aria-hidden', 'true');
        renderCatalogProducts();
    }));
    closeBtn?.addEventListener('click', closeWholesale);
    input.addEventListener('input', () => error?.classList.remove('show'));
    overlay.addEventListener('click', e => {
        if (e.target === overlay) closeWholesale();
    });

    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (input.value.trim() !== '53') {
            error?.classList.add('show');
            input.select();
            return;
        }

        closeWholesale();
        sessionStorage.setItem('blyxu_wholesale_access', '1');
        sessionStorage.setItem('blyxu_just_logged_in', '1');
        
        const loader = document.getElementById('brand-loader');
        if (loader) {
            loader.classList.remove('open');
            void loader.offsetWidth; // force reflow
            loader.classList.add('open');
            loader.setAttribute('aria-hidden', 'false');
        }
        
        // Esperamos a que la barra del loader avance un poco y redirigimos
        // El loader se quedará cubriendo la pantalla durante la navegación
        setTimeout(() => {
            window.location.href = 'mayorista.html';
        }, 800);
    });
}

function showBrandLoader() {
    const loader = document.getElementById('brand-loader');
    if (!loader) return Promise.resolve();

    loader.classList.remove('open');
    void loader.offsetWidth;
    loader.classList.add('open');
    loader.setAttribute('aria-hidden', 'false');

    return new Promise(resolve => {
        setTimeout(() => {
            loader.classList.remove('open');
            loader.setAttribute('aria-hidden', 'true');
            resolve();
        }, 1450);
    });
}

function openWhatsAppMessage(message) {
    window.open(`https://wa.me/${BLYXU_WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`, '_blank');
}

function renderFloatingWhatsApp() {
    const phone = String(getSiteConfigValue('Contacto_WhatsApp', BLYXU_WHATSAPP_PHONE)).replace(/\D/g, '');
    if (!phone) return;

    let button = document.getElementById('floating-whatsapp');
    if (!button) {
        button = document.createElement('a');
        button.id = 'floating-whatsapp';
        button.className = 'floating-whatsapp';
        button.target = '_blank';
        button.rel = 'noopener';
        button.setAttribute('aria-label', 'Abrir WhatsApp de BLYXU');
        button.innerHTML = `
            <span class="floating-whatsapp-logo">
                <img src="Logo2-nav.png" alt="" loading="lazy">
            </span>
            <span>WhatsApp</span>
        `;
        document.body.appendChild(button);
    }

    const message = 'Hola BLYXU, quiero hacer una consulta sobre sus productos.';
    button.href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function renderPromoWidget() {
    const isEnabled = String(getSiteConfigValue('Promo_Enabled', 'false')).trim() === 'true';
    
    // Si estaba habilitado y ahora no, limpiar todo
    if (!isEnabled) {
        document.getElementById('floating-promo')?.remove();
        document.querySelectorAll('.hero-promo-inject').forEach(el => el.innerHTML = '');
        if (window.blyxuPromoInterval) clearInterval(window.blyxuPromoInterval);
        return;
    }

    const title = getSiteConfigValue('Promo_Title', '-20%');
    const message = getSiteConfigValue('Promo_Message', 'Aprovecha nuestros descuentos especiales.');
    const promoDate = getSiteConfigValue('Promo_Date', '');
    const numberText = title.replace(/[^0-9%]/g, '');

    // Eliminar globo antiguo si existiera
    document.getElementById('floating-promo')?.remove();
    if (window.blyxuPromoInterval) clearInterval(window.blyxuPromoInterval);

    const injectContainers = document.querySelectorAll('.hero-promo-inject');
    if (injectContainers.length === 0) return;

    injectContainers.forEach((container, idx) => {
        container.innerHTML = `
            <div class="inline-promo-banner" id="inline-promo-${idx}">
                <div class="inline-promo-icon">
                    <span class="inline-promo-number">${numberText || '%'}</span>
                </div>
                <div class="inline-promo-content">
                    <h4 class="inline-promo-title">${title}</h4>
                    <p class="inline-promo-msg">${message}</p>
                </div>
                <div class="inline-promo-timer-wrap" style="${promoDate ? '' : 'display:none;'}">
                    <span class="inline-promo-timer-icon">⏳</span>
                    <span class="inline-promo-timer" id="inline-promo-timer-${idx}">--:--:--</span>
                </div>
            </div>
        `;
    });

    if (promoDate) {
        const targetDate = new Date(promoDate).getTime();
        if (isNaN(targetDate)) return;

        const updateTimer = () => {
            const now = new Date().getTime();
            const diff = targetDate - now;

            if (diff <= 0) {
                injectContainers.forEach((c, idx) => {
                    const el = document.getElementById(`inline-promo-timer-${idx}`);
                    if (el) el.textContent = '¡Promoción Terminada!';
                });
                clearInterval(window.blyxuPromoInterval);
                return;
            }

            const d = Math.floor(diff / (1000 * 60 * 60 * 24));
            const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diff % (1000 * 60)) / 1000);
            
            const timeStr = d > 0 ? `${d}d ${h}h ${m}m ${s}s` : `${h}h ${m}m ${s}s`;
            
            injectContainers.forEach((c, idx) => {
                const el = document.getElementById(`inline-promo-timer-${idx}`);
                if (el) el.textContent = timeStr;
            });
        };
        
        updateTimer();
        window.blyxuPromoInterval = setInterval(updateTimer, 1000);
    }
}


function initCustomCursor() {
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
        cursor.classList.toggle('is-hovering', Boolean(target?.closest?.('a, button, input, textarea, select, [role="button"], .nav-icon, .product-card, .marquee-item')));
    });

    move();
}

function consultProductByWhatsApp(product, pageUrl = window.location.href) {
    const name = product?.Nombre || product?.nombre || product?.Producto || 'Producto BLYXU';
    const category = product?.Categoria || product?.categoria || '';
    const sku = product?.SKU || product?.idVariacion || product?.['ID Variación'] || product?.['ID Variacion'] || '';

    let msg = '*Consulta de precio BLYXU*\n\n';
    msg += `Hola, quiero consultar el precio de:\n*${name}*\n`;
    if (category) msg += `Categoría: ${category}\n`;
    if (sku) msg += `SKU / Ref: ${sku}\n`;
    if (pageUrl) msg += `\nLink: ${pageUrl}`;

    openWhatsAppMessage(msg);
}

// -- DEMO PRODUCTS --
function getDemoProducts() {
    return [
        { Nombre:'Collar Amatista Imperial', Categoria:'Collares', Precio:89900, Stock:15, Color:'morado,dorado', Imagen:'', Descripcion:'Collar con piedra amatista autentica' },
        { Nombre:'Pulsera Crystal Violet', Categoria:'Pulseras', Precio:45900, Stock:22, Color:'morado', Imagen:'', Descripcion:'Pulsera de cristales violeta' },
        { Nombre:'Aretes Gota Purpura', Categoria:'Aretes', Precio:35900, Stock:30, Color:'morado,plata', Imagen:'', Descripcion:'Aretes lagrima con amatista' },
        { Nombre:'Anillo Constellation', Categoria:'Anillos', Precio:52900, Stock:8, Color:'dorado', Imagen:'', Descripcion:'Anillo banado en oro 18k' },
        { Nombre:'Set Aurora Boreal', Categoria:'Sets', Precio:129900, Stock:5, Color:'morado,plata', Imagen:'', Descripcion:'Set completo collar + aretes' },
        { Nombre:'Dije Corazon Amethyst', Categoria:'Dijes', Precio:28900, Stock:40, Color:'morado', Imagen:'', Descripcion:'Dije corazon con piedra natural' },
        { Nombre:'Tobillera Luna Creciente', Categoria:'Tobilleras', Precio:22900, Stock:18, Color:'plata', Imagen:'', Descripcion:'Tobillera delicada con luna' },
        { Nombre:'Collar Cadena Royal', Categoria:'Collares', Precio:67900, Stock:12, Color:'dorado,morado', Imagen:'', Descripcion:'Collar cadena gruesa premium' },
    ];
}

// -- INIT --
async function saveOrderToGoogleSheets(cliente, total) {
    const productos = cart.map(item => ({
        idVariacion: item.idVariacion || item.sku || item.name,
        id: item.idVariacion || item.sku || item.name,
        nombre: item.name,
        cantidad: item.qty,
        precio: item.price,
        subtotal: item.price * item.qty,
        sku: item.sku || '',
        modo: item.mode || activeCatalogMode
    }));

    const orderId = `MAY-${Date.now()}`;
    const payload = {
        resource: 'pedidos',
        action: 'crear',
        'ID Pedido': orderId,
        'Nombre Cliente': cliente.nombre,
        'Telefono': cliente.telefono,
        'Email': cliente.email || '',
        'Direccion': cliente.direccion,
        'Ciudad': cliente.ciudad,
        'Productos JSON': JSON.stringify(productos),
        'Cantidad Total': cart.reduce((sum, item) => sum + item.qty, 0),
        'Subtotal': total,
        'Estado Pedido': 'Pendiente',
        'Metodo Contacto': 'Sistema Mayorista',
        'Nota Cliente': cliente.nota || ''
    };

    try {
        const response = await fetch(GOOGLE_SHEET_API, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result && result.status === 'success') {
            return { ...payload, 'ID Pedido': result.id || orderId };
        }
        throw new Error(result?.message || result?.error || 'No se pudo guardar el pedido');
    } catch (error) {
        const formData = new FormData();
        Object.entries(payload).forEach(([key, value]) => formData.append(key, value));
        await fetch(GOOGLE_SHEET_API, {
            method: 'POST',
            body: formData,
            mode: 'no-cors'
        });
        return payload;
    }
}

function askCustomerInfo() {
    // Función deprecada: ahora el formulario está incrustado en el carrito
    return window.wsClienteTemp || null;
}

function askRetailQuestion() {
    const noteEl = document.getElementById('cart-note');
    return noteEl ? noteEl.value.trim() : '';
}

function buildCartWhatsAppMessage({ isWholesaleOrder, cliente = null, savedOrder = null, total = 0, note = '' }) {
    const hasHiddenPrices = cart.some(item => item.priceVisible === false);
    let msg = isWholesaleOrder ? '*Pedido Mayorista BLYXU*\n\n' : '*Consulta BLYXU*\n\n';

    if (savedOrder && savedOrder['ID Pedido']) {
        msg += `*ID Pedido:* ${savedOrder['ID Pedido']}\n`;
    }

    if (cliente) {
        msg += `*Cliente:* ${cliente.nombre}\n`;
        msg += `*Telefono:* ${cliente.telefono}\n`;
        const addressParts = [cliente.direccion, cliente.ciudad].filter(Boolean);
        if (addressParts.length) {
            msg += `*Direccion:* ${addressParts.join(', ')}\n`;
        }
        msg += '\n';
    } else {
        msg += 'Hola, quiero consultar estos productos:\n\n';
    }

    cart.forEach(c => {
        const lineTotal = c.priceVisible === false ? 'Precio por consultar' : formatMoney(c.price * c.qty);
        msg += `- ${c.name} x ${c.qty} - ${lineTotal}\n`;
        const reference = c.sku || c.idVariacion;
        if (reference && reference !== c.name) msg += `  Ref: ${reference}\n`;
    });

    msg += hasHiddenPrices ? '\n*Total:* Por consultar' : `\n*Total: ${formatMoney(total)}*`;
    const finalNote = cliente?.nota || note;
    if (finalNote) msg += `\n\n*Nota:* ${finalNote}`;

    return msg;
}

async function checkout(skipPrompt = false) {
    if (!cart.length) return;
    const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
    const isWholesaleOrder = activeCartMode === 'wholesale';
    
    const cliente = isWholesaleOrder ? window.wsClienteTemp : null;
    if (isWholesaleOrder && !cliente) return;
    
    const retailNote = isWholesaleOrder ? '' : askRetailQuestion();

    const btn = document.getElementById('btn-confirm-ws') || document.getElementById('btn-checkout');
    const originalText = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = isWholesaleOrder ? 'Registrando pedido...' : 'Preparando WhatsApp...';
    }

    let savedOrder = null;
    if (isWholesaleOrder) {
        try {
            savedOrder = await saveOrderToGoogleSheets(cliente, total);
        } catch (error) {
            console.error('Error guardando pedido:', error);
            const formContainer = document.getElementById('cart-wholesale-form');
            if (formContainer) {
                formContainer.innerHTML = `
                    <div style="text-align:center; padding:24px; background:rgba(239,68,68,0.05); border:1px solid rgba(239,68,68,0.2); border-radius:12px;">
                        <div style="font-size:32px; margin-bottom:12px;">⚠️</div>
                        <h4 style="margin:0 0 8px; color:#ef4444; font-size:15px;">Error al registrar</h4>
                        <p style="margin:0 0 16px; color:rgba(255,255,255,0.6); font-size:12px;">${error.message}</p>
                        <button class="btn-checkout" onclick="closeCart()" style="background:transparent; border:1px solid rgba(255,255,255,0.2);">Cerrar</button>
                    </div>
                `;
            }
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
            return;
        }
    }

    const msg = buildCartWhatsAppMessage({
        isWholesaleOrder,
        cliente,
        savedOrder,
        total,
        note: retailNote
    });

    cart = [];
    saveCart();
    updateCartUI();
    const noteEl = document.getElementById('cart-note');
    if (noteEl) noteEl.value = '';

    if (isWholesaleOrder) {
        // Mostrar mensaje de éxito en lugar de cerrar el carrito y hacer alert
        const formContainer = document.getElementById('cart-wholesale-form');
        if (formContainer) {
            const idText = savedOrder?.['ID Pedido'] ? `<div style="display:inline-block; margin-top:12px; padding:4px 12px; background:rgba(16,185,129,0.1); border-radius:99px; font-weight:800; color:#10B981; font-size:11px; letter-spacing:1px;">ID: ${savedOrder['ID Pedido']}</div>` : '';
            formContainer.innerHTML = `
                <div style="text-align:center; padding:32px 16px;">
                    <div style="width:64px; height:64px; background:linear-gradient(135deg, #10B981, #059669); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; box-shadow:0 12px 24px rgba(16,185,129,0.3);">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    <h4 style="margin:0 0 8px; font-size:18px; font-weight:800; color:#fff;">¡Registro Exitoso!</h4>
                    <p style="margin:0; font-size:13px; color:rgba(255,255,255,0.5); line-height:1.5;">Tu pedido mayorista ha sido guardado correctamente en el sistema.</p>
                    ${idText}
                    <button class="btn-checkout" onclick="closeCart()" style="margin-top:24px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);">Cerrar Panel</button>
                </div>
            `;
        }
    } else {
        closeCart();
        openWhatsAppMessage(msg);
    }

    if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.body?.dataset.catalogMode === 'wholesale') {
        activeCatalogMode = 'wholesale';
        setCartMode('wholesale');
    }

    initParticles();
    initNavbar();
    initReveal();
    renderInventorySpotlightLoading();
    initCatalogSearch();
    initWholesaleAccess();
    initCustomCursor();
    const isProductDetailPage = Boolean(document.getElementById('product-detail'));
    const isContactPage = document.body?.dataset.page === 'contact';
    const isPaymentsPage = document.body?.dataset.page === 'pagos';
    const isWholesalePage = document.body?.dataset.catalogMode === 'wholesale';
    
    renderFloatingWhatsApp();
    
    if (isWholesalePage && sessionStorage.getItem('blyxu_just_logged_in') === '1') {
        sessionStorage.removeItem('blyxu_just_logged_in');
        
        // Mantener el loader abierto desde el HTML (si no lo estaba, lo abrimos)
        const loader = document.getElementById('brand-loader');
        if(loader) {
            loader.classList.add('open');
            loader.setAttribute('aria-hidden', 'false');
            
            // Simular el final de la carga y cerrar
            setTimeout(() => {
                loader.classList.remove('open');
                loader.setAttribute('aria-hidden', 'true');
                launchWholesaleConfetti();
            }, 800);
        } else {
            launchWholesaleConfetti();
        }
    } else if (isWholesalePage) {
        // Si simplemente recargó la página, ocultar el loader inmediatamente si estuviera abierto
        const loader = document.getElementById('brand-loader');
        if (loader) {
            loader.classList.remove('open');
            loader.setAttribute('aria-hidden', 'true');
        }
    }

    if (isContactPage || isPaymentsPage) {
        fetchSiteConfig().then(() => {
            if (isContactPage) renderContactPage();
            renderPromoWidget();
        });
    } else {
        loadProducts({ renderCatalog: !isProductDetailPage }).then(() => {
            renderFloatingWhatsApp();
            renderPromoWidget();
        });
    }
    updateCartUI();

    // Cart events
    document.getElementById('cart-btn')?.addEventListener('click', openCart);
    document.getElementById('cart-overlay')?.addEventListener('click', closeCart);
    document.getElementById('cart-close')?.addEventListener('click', closeCart);
    // El event listener general de checkout se asigna dinámicamente en updateCartUI()

    // Hero sizes interaction
    document.querySelectorAll('.hero-sizes span').forEach(s => {
        s.addEventListener('click', () => {
            document.querySelectorAll('.hero-sizes span').forEach(x => x.classList.remove('active'));
            s.classList.add('active');
        });
    });
});









