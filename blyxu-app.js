// ========== BLYXU E-COMMERCE ENGINE ==========
// Google Sheets integration + Cart + Particles + UI

// -- CONFIG: Google Sheets --
// Para conectar tu Google Sheet:
// 1. Ve a tu hoja de calculo de Google
// 2. Menu Extensiones ? Apps Script
// 3. Pega el codigo del archivo google-apps-script.gs
// 4. Despliega como aplicacion web
// 5. Pega la URL aqui abajo:
const GOOGLE_SHEET_API = 'https://script.google.com/macros/s/AKfycbyMytX5vDXXvNxywckgVmGObGfjLLJEo5iFkJdfqOoDdomVmJ--tnPsOPcmXVSyP9BzuQ/exec';
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
const PRODUCT_PROMOTION_FIELD_KEYS = ['Promocion', 'Promoci\u00f3n', 'Promoci\u00c3\u00b3n', 'Promoci\u00c3\u0192\u00c2\u00b3n', 'promo', 'Promo'];
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
let activePriceFilter = 'todos';
let activeWholesalePriceFilter = 'todos';
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

// -- WHOLESALE PARTICLES LEGACY --
function initWholesaleParticlesLegacy() {
    const canvas = document.getElementById('wholesale-particles');
    if (!canvas) return;
    
    // Configurar estilos del canvas dinámicamente
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '1';
    canvas.style.pointerEvents = 'none';

    const ctx = canvas.getContext('2d');
    let width, height;
    let particles = [];
    let animationId = null;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    const mouse = { x: -9999, y: -9999, active: false };
    
    const overlay = canvas.closest('.wholesale-overlay') || document.getElementById('wholesale-overlay') || document.getElementById('qr-login-overlay');

    function hexToRgba(hex, alpha) {
        const clean = String(hex || '#ffffff').replace('#', '');
        const value = parseInt(clean.length === 3
            ? clean.split('').map(char => char + char).join('')
            : clean, 16);
        const r = (value >> 16) & 255;
        const g = (value >> 8) & 255;
        const b = value & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
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

function initWholesaleParticles() {
    const canvas = document.getElementById('wholesale-particles');
    if (!canvas) return;

    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '1';
    canvas.style.pointerEvents = 'none';

    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let drops = [];
    let animationId = null;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const overlay = canvas.closest('.wholesale-overlay') || document.getElementById('qr-login-overlay') || document.getElementById('wholesale-overlay');
    const mouse = { x: -9999, y: -9999, active: false };

    function hexToRgba(hex, alpha) {
        const clean = String(hex || '#ffffff').replace('#', '');
        const value = parseInt(clean.length === 3 ? clean.split('').map(char => char + char).join('') : clean, 16);
        const r = (value >> 16) & 255;
        const g = (value >> 8) & 255;
        const b = value & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function setPointer(e) {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
        mouse.active = true;
    }

    overlay?.addEventListener('mousemove', setPointer);
    overlay?.addEventListener('mouseleave', () => { mouse.active = false; });
    overlay?.addEventListener('touchmove', (e) => {
        if (!e.touches.length) return;
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.touches[0].clientX - rect.left;
        mouse.y = e.touches[0].clientY - rect.top;
        mouse.active = true;
    }, { passive: true });
    overlay?.addEventListener('touchend', () => { mouse.active = false; });

    function resetDrops() {
        drops = [];
        if (reduceMotion) return;
        const isMobile = window.innerWidth < 768;
        const count = isMobile ? 42 : 86;
        const palette = ['#f4c441', '#a855f7', '#22d3ee', '#ffffff'];

        for (let i = 0; i < count; i++) {
            drops.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.45,
                vy: 1.4 + Math.random() * (isMobile ? 2.2 : 3.4),
                radius: Math.random() * 1.7 + 0.8,
                length: 22 + Math.random() * 60,
                alpha: 0.32 + Math.random() * 0.48,
                color: palette[Math.floor(Math.random() * palette.length)]
            });
        }
    }

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        resetDrops();
    }

    function draw() {
        const isHidden = overlay && (overlay.getAttribute('aria-hidden') === 'true' || overlay.style.display === 'none') && !overlay.classList.contains('open');
        if (isHidden) {
            animationId = requestAnimationFrame(draw);
            return;
        }

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(4, 1, 10, 0.22)';
        ctx.fillRect(0, 0, width, height);

        for (const drop of drops) {
            drop.x += drop.vx;
            drop.y += drop.vy;

            if (drop.y > height + drop.length) {
                drop.y = -drop.length;
                drop.x = Math.random() * width;
                drop.vy = 1.4 + Math.random() * (window.innerWidth < 768 ? 2.2 : 3.4);
            }
            if (drop.x < -30) drop.x = width + 30;
            if (drop.x > width + 30) drop.x = -30;

            if (mouse.active) {
                const dx = mouse.x - drop.x;
                const dy = mouse.y - drop.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < 180) {
                    drop.x += dx * 0.006;
                    ctx.beginPath();
                    ctx.moveTo(drop.x, drop.y);
                    ctx.lineTo(mouse.x, mouse.y);
                    ctx.strokeStyle = `rgba(244, 196, 65, ${(1 - distance / 180) * 0.26})`;
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }

            const gradient = ctx.createLinearGradient(drop.x, drop.y - drop.length, drop.x, drop.y);
            gradient.addColorStop(0, 'rgba(255,255,255,0)');
            gradient.addColorStop(1, hexToRgba(drop.color, drop.alpha));

            ctx.beginPath();
            ctx.moveTo(drop.x, drop.y - drop.length);
            ctx.lineTo(drop.x + drop.vx * 12, drop.y);
            ctx.strokeStyle = gradient;
            ctx.lineWidth = drop.radius;
            ctx.lineCap = 'round';
            ctx.shadowBlur = 10;
            ctx.shadowColor = drop.color;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2);
            ctx.fillStyle = hexToRgba(drop.color, Math.min(0.9, drop.alpha + 0.18));
            ctx.shadowBlur = 8;
            ctx.shadowColor = drop.color;
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        animationId = requestAnimationFrame(draw);
    }

    window.addEventListener('resize', resize);
    resize();

    if (!reduceMotion) {
        draw();
    }

    window.stopWholesaleParticles = function () {
        if (animationId) cancelAnimationFrame(animationId);
        window.removeEventListener('resize', resize);
    };
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
    const num = parseCatalogAmount(n);
    return '$' + num.toLocaleString('es-CO', { minimumFractionDigits: 0 });
}

function parseCatalogAmount(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const clean = String(value ?? '').trim();
    if (!clean) return 0;
    const numeric = clean.replace(/[^\d,.-]/g, '');
    const separators = numeric.match(/[,.]/g) || [];
    if (!separators.length) return parseFloat(numeric) || 0;

    const lastComma = numeric.lastIndexOf(',');
    const lastDot = numeric.lastIndexOf('.');
    const decimalIndex = Math.max(lastComma, lastDot);
    const decimalDigits = numeric.length - decimalIndex - 1;
    const decimalSeparator = numeric[decimalIndex];
    const hasDecimal = decimalDigits > 0 && decimalDigits !== 3;
    const normalized = hasDecimal
        ? numeric
            .slice(0, decimalIndex)
            .replace(/[,.]/g, '') + '.' + numeric.slice(decimalIndex + 1)
        : numeric.replace(/[,.]/g, '');
    return parseFloat(normalized) || 0;
}

function getProductField(product, fields, fallback = '') {
    const names = Array.isArray(fields) ? fields : [fields];
    if (!product || typeof product !== 'object') return fallback;

    const keyMap = new Map();
    Object.keys(product).forEach(key => {
        const normalizedKey = normalizeSearchText(key).replace(/\s+/g, '');
        if (!keyMap.has(normalizedKey)) keyMap.set(normalizedKey, key);
    });

    for (const name of names) {
        const actualKey = keyMap.get(normalizeSearchText(name).replace(/\s+/g, ''));
        if (actualKey && product[actualKey] !== undefined && product[actualKey] !== null && product[actualKey] !== '') {
            return product[actualKey];
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
        Estado: getProductField(product, ['Estado', 'estado'], 'Activo'),
        Fecha_Creacion: getProductField(product, ['Fecha de Creaci\u00f3n', 'Fecha de Creacion', 'Fecha_Creacion', 'Fecha de CreaciÃ³n', 'Fecha de CreaciÃ³n', 'createdAt', 'created_at'], ''),
        Promocion: normalizePromotionValue(getProductField(product, PRODUCT_PROMOTION_FIELD_KEYS, false))
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

function normalizePromotionValue(value) {
    if (typeof value === 'boolean') return value ? 'VERDADERO' : 'FALSO';
    const clean = String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    return ['verdadero', 'true', 'si', 's', '1', 'yes', 'activo', 'activa'].includes(clean) ? 'VERDADERO' : 'FALSO';
}

function isProductPromotionEnabled(product) {
    return normalizePromotionValue(getProductField(product || {}, PRODUCT_PROMOTION_FIELD_KEYS, false)) === 'VERDADERO';
}

function getPromotionDiscountPercent() {
    const promoTitle = getSiteConfigValue('Promo_Title', '');
    const match = String(promoTitle || '').match(/(\d+)%/);
    if (!match) return 0;

    const discountPercentage = parseInt(match[1], 10);
    return discountPercentage > 0 && discountPercentage < 100 ? discountPercentage : 0;
}

function getProductDisplayOldPrice(product, mode = activeCatalogMode, currentPrice = 0) {
    const oldPrice = parseCatalogAmount(mode === 'wholesale'
        ? (product?.PrecioMayoristaOriginal || 0)
        : (product?.Precio_Anterior || product?.PrecioOriginal || 0));
    return oldPrice > currentPrice ? oldPrice : 0;
}

function getProductPromotionBadgeMarkup(product) {
    const discountPercentage = getPromotionDiscountPercent();
    if (!discountPercentage || !isProductPromotionEnabled(product)) return '';
    return `<span class="product-card-badge badge-sale">-${discountPercentage}%</span>`;
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
    const promoTitle = getSiteConfigValue('Promo_Title', '');
    const match = promoTitle.match(/(\d+)%/);
    if (!match) return; // Si no hay porcentaje en el título, no podemos aplicar descuento
    
    const discountPercentage = getPromotionDiscountPercent();
    if (!discountPercentage) return;
    
    const factor = 1 - (discountPercentage / 100);
    
    allProducts.forEach(product => {
        const isPromo = isProductPromotionEnabled(product);
        if (isPromo) {
            // Descuento en precio al detal
            const retailPrice = parseCatalogAmount(product.PrecioOriginal || product.Precio);
            if (retailPrice > 0) {
                product.PrecioOriginal = retailPrice;
                product.Precio = Math.round(retailPrice * factor);
                if (!product.Precio_Anterior) product.Precio_Anterior = product.PrecioOriginal;
            }
            
            // Descuento en precio mayorista
            const wholesaleKey = Object.keys(product).find(k => ['Precio_Mayorista', 'Precio Mayor', 'Precio Mayorista', 'precio_mayorista', 'PrecioMayorista', 'Mayorista'].includes(k));
            const wholesalePrice = wholesaleKey ? parseCatalogAmount(product.PrecioMayoristaOriginal || product[wholesaleKey]) : 0;
            if (wholesaleKey && wholesalePrice > 0) {
                product.PrecioMayoristaOriginal = wholesalePrice;
                product[wholesaleKey] = Math.round(wholesalePrice * factor);
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
                renderFloatingWhatsApp();
                renderFooterSocialLinks();
                renderPromoWidget();
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

function parseProductDateTime(value) {
    if (value instanceof Date) {
        const time = value.getTime();
        return Number.isNaN(time) ? 0 : time;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        if (value > 100000000000) return value;
        if (value > 1000000000) return value * 1000;
        if (value > 20000 && value < 80000) return Math.round((value - 25569) * 86400 * 1000);
    }

    const text = String(value || '').trim();
    if (!text) return 0;

    const dateMatch = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!dateMatch) {
        const direct = Date.parse(text);
        return Number.isNaN(direct) ? 0 : direct;
    }

    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1;
    const year = parseInt(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3], 10);
    const hour = parseInt(dateMatch[4] || '0', 10);
    const minute = parseInt(dateMatch[5] || '0', 10);
    const second = parseInt(dateMatch[6] || '0', 10);
    const parsed = new Date(year, month, day, hour, minute, second).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
}

function getProductCreatedTime(product) {
    return parseProductDateTime(getProductField(product, [
        'Fecha_Creacion',
        'Fecha de Creaci\u00f3n',
        'Fecha de Creacion',
        'Fecha de CreaciÃ³n',
        'Fecha de CreaciÃ³n',
        'Fecha',
        'createdAt',
        'created_at'
    ], ''));
}

function getNewestProductsForMarquee(products, limit = 15) {
    const uniqueByGeneralReference = new Map();

    products
        .map((product, index) => ({ product, index, createdTime: getProductCreatedTime(product) }))
        .filter(item => {
            const img = getProductImageSet(item.product)[0];
            return img && img !== 'hero_necklace.png';
        })
        .sort((a, b) => {
            if (b.createdTime !== a.createdTime) return b.createdTime - a.createdTime;
            return b.index - a.index;
        })
        .forEach(item => {
            const key = getProductGroupKey(item.product) || getCatalogRepresentativeKey(item.product);
            if (!uniqueByGeneralReference.has(key)) {
                uniqueByGeneralReference.set(key, item.product);
            }
        });

    return Array.from(uniqueByGeneralReference.values()).slice(0, limit);
}

function renderInventorySpotlight() {
    const marqueeContainer = document.getElementById('image-marquee-container');
    const marqueeSection = document.getElementById('image-carousel');
    if (!marqueeContainer) return;

    const candidates = getNewestProductsForMarquee(allProducts, 15);

    if (!candidates.length) {
        if (marqueeSection) marqueeSection.style.display = 'none';
        return;
    }
    if (marqueeSection) marqueeSection.style.display = '';

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
            if (typeof updateCartUI === 'function') updateCartUI();
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

function getCommerceWhatsAppPhone() {
    return String(
        getSiteConfigValue('WhatsApp_Comercial', getSiteConfigValue('Contacto_WhatsApp', BLYXU_WHATSAPP_PHONE))
    ).replace(/\D/g, '');
}

function setTextById(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setLinkById(id, href, label) {
    const el = document.getElementById(id);
    if (!el) return;
    el.href = href || '#';
    if (label && !el.hasAttribute('data-preserve-content')) el.textContent = label;
    el.style.display = href ? '' : 'none';
}

function normalizeSocialUrl(value, baseUrl) {
    const clean = String(value || '').trim();
    if (!clean) return '';
    if (/^https?:\/\//i.test(clean)) return clean;
    const handle = clean.replace(/^@+/, '').replace(/^\/+/, '');
    return handle ? baseUrl + handle : '';
}

function setSocialLinkById(id, href) {
    const el = document.getElementById(id);
    if (!el) return;
    el.href = href || '#';
    el.style.display = href ? '' : 'none';
}

function renderFooterSocialLinks() {
    const whatsapp = getCommerceWhatsAppPhone();
    const facebook = getSiteConfigValue('Contacto_Facebook', 'blyxu');
    const tiktok = getSiteConfigValue('Contacto_TikTok', 'blyxu');
    const instagram = getSiteConfigValue('Contacto_Instagram', 'blyxu');
    const whatsappHref = whatsapp ? `https://wa.me/${String(whatsapp).replace(/\D/g, '')}` : '';

    setLinkById('footer-whatsapp', whatsappHref, 'WhatsApp');
    setLinkById('footer-facebook', normalizeSocialUrl(facebook, 'https://facebook.com/'), 'Facebook');
    setLinkById('footer-tiktok', normalizeSocialUrl(tiktok, 'https://www.tiktok.com/@'), 'TikTok');
    setLinkById('footer-instagram', normalizeSocialUrl(instagram, 'https://instagram.com/'), 'Instagram');
}

function renderContactTimeline(hours) {
    const timeline = document.getElementById('contact-hours-timeline');
    if (!timeline) return;

    const parts = String(hours || '').split(/\s*-\s*|\s+a\s+/i).map(part => part.trim()).filter(Boolean);
    const open = parts[0] || '10:00 AM';
    const close = parts[1] || '7:00 PM';

    timeline.innerHTML = [
        ['Apertura', open, true],
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
        const phone = String(whatsapp || getCommerceWhatsAppPhone()).replace(/\D/g, '');

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

    const days = getSiteConfigValue('Contacto_Dias', 'Lunes a Sabado');
    const hours = getSiteConfigValue('Contacto_Horarios', '10:00 a.m. - 7:00 p.m.');
    const note = 'Escribenos por nuestro numero oficial o visita nuestras redes sociales BLYXU.';
    const whatsapp = getCommerceWhatsAppPhone();
    const facebook = getSiteConfigValue('Contacto_Facebook', 'blyxu');
    const tiktok = getSiteConfigValue('Contacto_TikTok', 'blyxu');
    const instagram = getSiteConfigValue('Contacto_Instagram', 'blyxu');

    setTextById('contact-days', days);
    setTextById('contact-hours', hours);
    setTextById('contact-note', note);

    const whatsappHref = whatsapp ? `https://wa.me/${String(whatsapp).replace(/\D/g, '')}` : '';
    const phoneDisplay = whatsapp
        ? '+' + String(whatsapp).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3 $4')
        : '+57 311 2368622';
    const facebookHref = normalizeSocialUrl(facebook, 'https://facebook.com/');
    const tiktokHref = normalizeSocialUrl(tiktok, 'https://www.tiktok.com/@');
    const instagramHref = normalizeSocialUrl(instagram, 'https://instagram.com/');

    setTextById('contact-phone-number', phoneDisplay);
    setLinkById('contact-hero-whatsapp', whatsappHref, 'Escribir ahora');
    setLinkById('contact-whatsapp', whatsappHref, 'WhatsApp');
    setSocialLinkById('contact-facebook', facebookHref);
    setSocialLinkById('contact-tiktok', tiktokHref);
    setSocialLinkById('contact-instagram', instagramHref);
    renderFooterSocialLinks();

    renderContactTimeline(hours);
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
    
    track.innerHTML = banners.map((b, i) => {
        const rawDesc = String(b.Descripcion || b.Color || '').trim();
        const isPlaceholder = !rawDesc || rawDesc.toLowerCase().includes('nueva imagen');
        const descHtml = isPlaceholder ? '' : `<p class="main-banner-desc">${escapeHtml(rawDesc)}</p>`;

        return `
        <div class="main-banner-slide ${i===0?'active':''}">
            <img src="${normalizeImageUrl(b.Imagen || b.imagen || b.Foto || 'hero_necklace.png')}" alt="${escapeHtml(b.Nombre || b.nombre || 'Banner BLYXU')}" style="filter: brightness(0.6);" onerror="this.src='hero_necklace.png'">
            <div class="main-banner-overlay"></div>
            <div class="main-banner-content">
                <h1 class="main-banner-title">${escapeHtml(b.Nombre || b.nombre || '')}</h1>
                ${descHtml}
                <div class="main-banner-actions">
                    <a href="#coleccion" class="main-banner-btn">Explorar Colecci\u00f3n</a>
                    <a href="javascript:void(0)" onclick="openWholesaleOverlay()" class="main-banner-btn" style="background:rgba(255,255,255,0.05); color:#fff; border:1px solid rgba(255,255,255,0.2);">Acceso Mayorista</a>
                </div>
                <div class="hero-promo-inject" style="margin-top: 32px; width: 100%;"></div>
            </div>
        </div>
        `;
    }).join('');
    
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
    return parseCatalogAmount(mode === 'wholesale' ? wholesalePrice : retailPrice);
}

function getProductStock(product) {
    return parseInt(product?.Stock || product?.stock || product?.Cantidad || 0, 10) || 0;
}

function getProductStockStatus(stock) {
    if (stock <= 0) return { type: 'out', label: 'Agotado por ahora' };
    if (stock <= LOW_STOCK_THRESHOLD) return { type: 'low', label: 'Pocas unidades' };
    return null;
}

function parseProductDate(rawDate) {
    if (rawDate === undefined || rawDate === null || rawDate === '') return null;

    if (typeof rawDate === 'number' && !Number.isNaN(rawDate) && rawDate > 0) {
        return new Date(rawDate < 1e11 ? rawDate * 1000 : rawDate);
    }

    if (rawDate instanceof Date) {
        return Number.isNaN(rawDate.getTime()) ? null : rawDate;
    }

    if (typeof rawDate === 'string' && rawDate.trim()) {
        const str = rawDate.trim();
        const parsed = Date.parse(str);
        if (!Number.isNaN(parsed)) {
            return new Date(parsed);
        }

        const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
        if (match) {
            const day = parseInt(match[1], 10);
            const month = parseInt(match[2], 10) - 1;
            const year = parseInt(match[3], 10);
            const hours = parseInt(match[4] || '0', 10);
            const minutes = parseInt(match[5] || '0', 10);
            const seconds = parseInt(match[6] || '0', 10);
            const d = new Date(year, month, day, hours, minutes, seconds);
            if (!Number.isNaN(d.getTime())) return d;
        }
    }

    return null;
}

function isProductNew(product) {
    if (!product) return false;
    const rawDate = getProductField(product, [
        'Fecha_Creacion',
        'Fecha de Creación',
        'Fecha de Creacion',
        'Fecha_Creacion',
        'Fecha de CreaciÃ³n',
        'Fecha de CreaciÃ³n',
        'Fecha',
        'createdAt',
        'created_at'
    ], '');

    const dateObj = parseProductDate(rawDate);
    if (!dateObj) return false;

    const ageInMs = Date.now() - dateObj.getTime();
    const maxAgeInMs = 7 * 24 * 60 * 60 * 1000; // 7 días (168 horas)

    return ageInMs >= 0 && ageInMs <= maxAgeInMs;
}

function getProductBadgeMarkup(product, index = -1) {
    const status = getProductStockStatus(getProductStock(product));
    if (status) {
        return `<span class="product-card-badge badge-${status.type}">${escapeHtml(status.label)}</span>`;
    }
    if (isProductNew(product)) {
        return '<span class="product-card-badge badge-new">Nuevo</span>';
    }
    return '';
}

function shouldShowProductPrices(mode = activeCatalogMode) {
    const savedVisibility = localStorage.getItem(RETAIL_PRICE_VISIBILITY_KEY);
    showRetailPrices = siteConfig[RETAIL_PRICE_CONFIG_KEY] !== undefined
        ? String(siteConfig[RETAIL_PRICE_CONFIG_KEY]) === '1'
        : savedVisibility !== '0';
    return mode === 'wholesale' || showRetailPrices;
}

async function syncRetailPriceVisibility() {
    if (activeCartMode !== 'retail') return;

    try {
        if (configLoadPromise) {
            await configLoadPromise;
        }
        await fetchSiteConfig();
    } catch (error) {
        console.warn('No se pudo sincronizar estado de precios minoristas:', error);
    }
}

function getProductCategory(product) {
    return String(product.Categoria || product.categoria || '').trim();
}

function isSameCategory(a, b) {
    return normalizeSearchText(a) === normalizeSearchText(b);
}

function getCatalogCategories(products) {
    const sourceProducts = Array.isArray(products) && products.length ? products : allProducts;
    const categoryMap = new Map();
    sourceProducts.forEach(product => {
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

    const categorySource = Array.isArray(allProducts) && allProducts.length ? allProducts : products;
    const categories = getCatalogCategories(categorySource);
    const activeCategory = currentFilter === 'todos' ? '' : categories.find(cat => isSameCategory(cat, currentFilter));
    const normalizedFilter = currentFilter !== 'todos' && !activeCategory ? 'todos' : currentFilter;

    if (select) {
        select.innerHTML = [
            '<option value="todos">Todas las categor\u00edas</option>',
            ...categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
        ].join('');
        select.value = normalizedFilter === 'todos' ? 'todos' : (activeCategory || 'todos');
        select.onchange = () => onChange(select.value);

        if (typeof syncGlassSelect === 'function') {
            syncGlassSelect(select);
        }
    }
}

/* ===== CUSTOM GLASS DROPDOWN COMPONENT ===== */
function initGlassSelects() {
    const selectorWraps = document.querySelectorAll('.category-select-wrap, .inventory-category-filter');
    selectorWraps.forEach(wrap => {
        const select = wrap.querySelector('select');
        if (!select) return;
        setupGlassSelectWrapper(wrap, select);
    });
}

function syncGlassSelect(selectElement) {
    if (!selectElement) return;
    const wrap = selectElement.closest('.category-select-wrap') || selectElement.closest('.inventory-category-filter') || selectElement.parentElement;
    if (wrap) {
        setupGlassSelectWrapper(wrap, selectElement);
        if (typeof wrap._updateGlassMenu === 'function') {
            wrap._updateGlassMenu();
        }
    }
}

function setupGlassSelectWrapper(wrap, select) {
    if (!wrap || !select) return;

    let textSpan = wrap.querySelector('.glass-select-text');
    if (!textSpan) {
        textSpan = document.createElement('span');
        textSpan.className = 'glass-select-text';
        const svg = wrap.querySelector('svg');
        if (svg && svg.nextSibling) {
            wrap.insertBefore(textSpan, svg.nextSibling);
        } else {
            wrap.insertBefore(textSpan, select);
        }
    }

    select.style.cssText = 'opacity:0 !important; position:absolute !important; width:1px !important; height:1px !important; pointer-events:none !important; clip:rect(0,0,0,0) !important;';

    let menu = wrap.querySelector('.custom-glass-dropdown-menu');
    if (!menu) {
        menu = document.createElement('div');
        menu.className = 'custom-glass-dropdown-menu';
        wrap.appendChild(menu);
    }

    const updateMenuAndLabel = () => {
        const selectedOption = select.options[select.selectedIndex] || select.options[0];
        if (selectedOption && textSpan) {
            textSpan.textContent = selectedOption.text;
        }

        const optionsArray = Array.from(select.options);
        menu.innerHTML = optionsArray.map(opt => {
            const isActive = opt.value === select.value;
            return `
                <div class="glass-dropdown-item ${isActive ? 'active' : ''}" data-value="${escapeHtml(opt.value)}">
                    <span>${escapeHtml(opt.text)}</span>
                </div>
            `;
        }).join('');

        menu.querySelectorAll('.glass-dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const val = item.getAttribute('data-value');
                select.value = val;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof select.onchange === 'function') {
                    select.onchange();
                }
                updateMenuAndLabel();
                closeAllGlassDropdowns();
            });
        });
    };

    wrap._updateGlassMenu = updateMenuAndLabel;
    updateMenuAndLabel();

    if (!select.dataset.glassInited) {
        select.dataset.glassInited = 'true';

        select.addEventListener('change', () => {
            updateMenuAndLabel();
        });

        wrap.addEventListener('click', (e) => {
            if (e.target.closest('.custom-glass-dropdown-menu')) return;
            e.preventDefault();
            e.stopPropagation();

            const isOpen = wrap.classList.contains('is-open');
            closeAllGlassDropdowns();

            if (!isOpen) {
                updateMenuAndLabel();
                wrap.classList.add('is-open');
                menu.classList.add('open');
            }
        });
    }
}

function closeAllGlassDropdowns() {
    document.querySelectorAll('.category-select-wrap.is-open, .inventory-category-filter.is-open').forEach(wrap => {
        wrap.classList.remove('is-open');
        const menu = wrap.querySelector('.custom-glass-dropdown-menu');
        if (menu) menu.classList.remove('open');
    });
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.category-select-wrap') && !e.target.closest('.inventory-category-filter')) {
        closeAllGlassDropdowns();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAllGlassDropdowns();
    }
});

function roundPriceSliderMax(value) {
    const price = parseCatalogAmount(value);
    if (!price) return 0;
    const step = price <= 100000 ? 5000 : 10000;
    return Math.ceil(price / step) * step;
}

function getCatalogMaxPrice(products, mode = activeCatalogMode) {
    return roundPriceSliderMax(Math.max(
        0,
        ...(products || []).map(product => getProductPrice(product, mode)).filter(price => price > 0)
    ));
}

function normalizePriceFilterValue(value, maxPrice) {
    if (value === 'todos' || value === undefined || value === null || value === '') return 'todos';
    const numeric = parseCatalogAmount(value);
    if (!numeric || !maxPrice || numeric >= maxPrice) return 'todos';
    return Math.max(0, numeric);
}

function renderPriceFilters(options = {}) {
    const {
        sliderId = 'catalog-price-slider',
        labelId = 'catalog-price-label',
        products = [],
        mode = activeCatalogMode,
        currentFilter = activePriceFilter,
        onChange = value => setPriceFilter(value)
    } = options;
    const slider = document.getElementById(sliderId);
    const label = document.getElementById(labelId);
    if (!slider) return;

    const maxPrice = getCatalogMaxPrice(products, mode);
    const normalizedFilter = normalizePriceFilterValue(currentFilter, maxPrice);
    const sliderValue = normalizedFilter === 'todos' ? maxPrice : normalizedFilter;

    slider.min = '0';
    slider.max = String(maxPrice);
    slider.step = maxPrice > 100000 ? '10000' : '1000';
    slider.value = String(sliderValue);
    slider.disabled = maxPrice <= 0;
    slider.style.setProperty('--price-progress', maxPrice > 0 ? `${(sliderValue / maxPrice) * 100}%` : '0%');

    if (label) {
        label.textContent = maxPrice <= 0
            ? 'Sin precios'
            : normalizedFilter === 'todos'
                ? 'Todos los precios'
                : `Hasta ${formatMoney(sliderValue)}`;
    }

    slider.oninput = () => {
        const value = normalizePriceFilterValue(slider.value, maxPrice);
        const currentValue = value === 'todos' ? maxPrice : value;
        slider.style.setProperty('--price-progress', maxPrice > 0 ? `${(currentValue / maxPrice) * 100}%` : '0%');
        if (label) label.textContent = value === 'todos' ? 'Todos los precios' : `Hasta ${formatMoney(currentValue)}`;
        onChange(value);
    };
}

function isProductInPriceRange(product, priceFilter, mode = activeCatalogMode) {
    if (priceFilter === 'todos' || priceFilter === undefined || priceFilter === null || priceFilter === '') return true;
    const maxPrice = parseCatalogAmount(priceFilter);
    if (!maxPrice) return true;

    const price = getProductPrice(product, mode);
    return price > 0 && price <= maxPrice;
}

function syncActiveCategoryControls(filterValue) {
    const normalizedFilter = normalizeSearchText(filterValue || 'todos');
    document.querySelectorAll('[data-cat]').forEach(control => {
        const controlValue = normalizeSearchText(control.getAttribute('data-cat') || 'todos');
        control.classList.toggle('active', controlValue === normalizedFilter);
    });
}

function renderCatalogProducts() {
    const grid = document.getElementById('products-grid');
    const sectionTitle = document.querySelector('.collection-section .section-title');
    const products = getCurrentCatalogProducts();
    if (sectionTitle) {
        sectionTitle.textContent = activeCatalogMode === 'wholesale' ? 'CAT\u00c1LOGO MAYORISTA' : 'NUEVA COLECCI\u00d3N';
    }
    renderCategoryFilters(products);
    renderPriceFilters({
        products,
        mode: activeCatalogMode,
        currentFilter: activePriceFilter,
        onChange: value => setPriceFilter(value)
    });
    if (productsLoadError && grid) {
        grid.innerHTML = `<div class="cart-empty" style="grid-column:1/-1;">Error conectando Google Sheets: ${productsLoadError}</div>`;
        return;
    }
    renderProducts(products, { mode: activeCatalogMode, priceFilter: activePriceFilter });
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
    renderPriceFilters({
        sliderId: 'wholesale-price-slider',
        labelId: 'wholesale-price-label',
        products,
        mode: 'wholesale',
        currentFilter: activeWholesalePriceFilter,
        onChange: value => setWholesalePriceFilter(value)
    });
    if (productsLoadError) {
        grid.innerHTML = `<div class="cart-empty" style="grid-column:1/-1;">Error conectando Google Sheets: ${productsLoadError}</div>`;
        return;
    }
    renderProducts(products, {
        mode: 'wholesale',
        gridId: 'wholesale-products-grid',
        filter: activeWholesaleFilter,
        priceFilter: activeWholesalePriceFilter,
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
        priceFilter = activePriceFilter,
        searchQuery = activeSearchQuery
    } = options;
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const showPrices = shouldShowProductPrices(mode);
    const renderToken = ++catalogRenderToken;

    const filteredByCategory = filter === 'todos' ? products :
        products.filter(p => isSameCategory(getProductCategory(p), filter));

    const filteredByPrice = filteredByCategory.filter(p => isProductInPriceRange(p, priceFilter, mode));
    const searched = applySmartProductSearch(filteredByPrice, searchQuery);
    const visibleResults = normalizeSearchText(searchQuery)
        ? collapseSearchResultsToGeneralReferences(searched, filteredByPrice)
        : searched;

    const filtered = getShuffledProducts(collapseCatalogProductsToRepresentatives(visibleResults, mode));

    if (!filtered.length) {
        const categoryLabel = filter !== 'todos' ? ` en la categor\u00eda ${escapeHtml(filter)}` : '';
        const priceLabel = priceFilter !== 'todos' ? ' en ese rango de precio' : '';
        grid.innerHTML = `<div class="cart-empty" style="grid-column:1/-1;">No se encontraron productos${searchQuery ? ' para tu b\u00fasqueda' : categoryLabel}${priceLabel}</div>`;
        return;
    }

    const renderKey = [
        gridId,
        mode,
        normalizeSearchText(filter),
        priceFilter,
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
        const oldPrice = getProductDisplayOldPrice(p, mode, price);
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
                ${getProductPromotionBadgeMarkup(p)}
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

function getCartCustomerType(mode = activeCartMode) {
    return normalizeCartMode(mode) === 'wholesale' ? 'Mayor' : 'Detal';
}

function getCartOrderLabel(mode = activeCartMode) {
    return getCartCustomerType(mode) === 'Mayor' ? 'Mayorista' : 'Detal';
}

function shouldRegisterCartOrder(mode = activeCartMode) {
    const normalizedMode = normalizeCartMode(mode);
    return normalizedMode === 'wholesale' || shouldShowProductPrices('retail');
}

function cartItemShowsPrice(item) {
    return shouldShowProductPrices(normalizeCartMode(item?.mode || activeCartMode));
}

function getProductVariationId(product) {
    return product?.idVariacion || product?.['ID Variaci\u00f3n'] || product?.['ID Variacion'] || product?.SKU || product?.Nombre || '';
}

function getCartProductIndex(item) {
    const itemVariationId = String(item?.idVariacion || '').trim();
    const itemSku = String(item?.sku || '').trim();
    const itemName = String(item?.name || '').trim();

    const matchedIndex = allProducts.findIndex(product => {
        const variationId = String(getProductVariationId(product) || '').trim();
        const sku = String(product?.SKU || product?.sku || '').trim();
        const name = String(product?.Nombre || product?.nombre || product?.Producto || '').trim();
        return (itemVariationId && variationId === itemVariationId) ||
            (itemSku && sku === itemSku) ||
            (itemName && name === itemName && variationId === itemVariationId);
    });

    if (matchedIndex >= 0) return matchedIndex;
    if (Number.isInteger(item?.productIndex) && allProducts[item.productIndex]) return item.productIndex;
    return -1;
}

function getCartProduct(item) {
    const index = getCartProductIndex(item);
    return index >= 0 ? allProducts[index] : null;
}

function getCartModeProducts(mode = activeCartMode) {
    const previousMode = activeCatalogMode;
    activeCatalogMode = normalizeCartMode(mode);
    const products = getCurrentCatalogProducts();
    activeCatalogMode = previousMode;
    return products;
}

function getCartVariantOptions(item) {
    const product = getCartProduct(item);
    if (!product) return [];

    const mode = normalizeCartMode(item?.mode || activeCartMode);
    const groupKey = getCatalogRepresentativeKey(product);
    const siblings = getCartModeProducts(mode)
        .filter(candidate => getCatalogRepresentativeKey(candidate) === groupKey)
        .filter(candidate => getProductStock(candidate) > 0 || String(getProductVariationId(candidate)) === String(item?.idVariacion || ''));

    return siblings.length > 1 ? siblings : [];
}

function getCartVariantLabel(product, siblings = []) {
    const summary = getVariantSummary(product);
    if (summary) return summary;

    const productIndex = allProducts.indexOf(product);
    const groupIndex = siblings.indexOf(product);
    if (productIndex >= 0 && groupIndex >= 0) return `Opci\u00f3n ${groupIndex + 1}`;
    return product?.SKU || product?.idVariacion || product?.Nombre || 'Opci\u00f3n';
}

function getCartItemFromProduct(product, mode = activeCartMode, qty = 1) {
    const name = product.Nombre || product.nombre || product.Producto || 'Producto';
    const price = getProductPrice(product, mode);
    const img = normalizeImageUrl(product.Imagen || product.imagen || (product.Galeria && product.Galeria[0]) || '');
    const idVariacion = getProductVariationId(product) || name;
    const sku = product.SKU || product.sku || '';
    const stock = getProductStock(product);
    const priceVisible = shouldShowProductPrices(mode);
    const productIndex = allProducts.indexOf(product);
    const variantLabel = getVariantSummary(product);

    return {
        idVariacion,
        sku,
        name,
        variantLabel,
        price,
        priceVisible,
        img,
        qty: Math.max(1, Math.min(qty || 1, stock || 999)),
        mode,
        stock,
        productIndex
    };
}

function addToCart(idx, sourceButton, mode = activeCatalogMode) {
    mode = normalizeCartMode(mode);
    setCartMode(mode);
    const p = allProducts[idx];
    if (!p) return;
    const nextItem = getCartItemFromProduct(p, mode, 1);
    const idVariacion = nextItem.idVariacion;
    const stock = nextItem.stock;
    const priceVisible = shouldShowProductPrices(mode);
    const existing = cart.find(c => (c.idVariacion || c.name) === idVariacion && c.mode === mode);
    if (existing) {
        existing.qty = Math.min((existing.qty || 1) + 1, stock || 999);
        existing.priceVisible = priceVisible;
        Object.assign(existing, getCartItemFromProduct(p, mode, existing.qty));
    }
    else { cart.push(nextItem); }
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

function changeCartVariant(idx, productIndex) {
    const item = cart[idx];
    const product = allProducts[parseInt(productIndex, 10)];
    if (!item || !product) return -1;

    const mode = normalizeCartMode(item.mode || activeCartMode);
    const nextItem = getCartItemFromProduct(product, mode, item.qty || 1);
    let updatedIndex = idx;
    const existingIndex = cart.findIndex((candidate, candidateIndex) =>
        candidateIndex !== idx &&
        normalizeCartMode(candidate.mode || mode) === mode &&
        String(candidate.idVariacion || candidate.name) === String(nextItem.idVariacion || nextItem.name)
    );

    if (existingIndex >= 0) {
        const existing = cart[existingIndex];
        existing.qty = Math.min((existing.qty || 1) + nextItem.qty, nextItem.stock || 999);
        Object.assign(existing, getCartItemFromProduct(product, mode, existing.qty));
        cart.splice(idx, 1);
        updatedIndex = existingIndex > idx ? existingIndex - 1 : existingIndex;
    } else {
        cart[idx] = nextItem;
    }

    saveCart();
    updateCartUI();
    return updatedIndex;
}

function ensureCartPreviewModal() {
    let modal = document.getElementById('cart-preview-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'cart-preview-modal';
    modal.className = 'cart-preview-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
        <div class="cart-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="cart-preview-title">
            <button class="cart-preview-close" type="button" aria-label="Cerrar vista">×</button>
            <div class="cart-preview-content"></div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', event => {
        if (event.target === modal || event.target.closest('.cart-preview-close')) {
            closeCartPreview();
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal.classList.contains('open')) {
            closeCartPreview();
        }
    });

    return modal;
}

function closeCartPreview() {
    const modal = document.getElementById('cart-preview-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
}

function getCartProductDetailUrl(product, mode = activeCartMode) {
    const productIndex = allProducts.indexOf(product);
    if (productIndex < 0) return '#';
    return `producto.html?id=${productIndex}${normalizeCartMode(mode) === 'wholesale' ? '&catalogo=mayorista' : ''}`;
}

function openCartItemPreview(idx) {
    const item = cart[idx];
    if (!item) return;

    const modal = ensureCartPreviewModal();
    const content = modal.querySelector('.cart-preview-content');
    const product = getCartProduct(item);
    const mode = normalizeCartMode(item.mode || activeCartMode);
    const variants = getCartVariantOptions(item);
    const currentProductIndex = getCartProductIndex(item);
    const detailUrl = product ? getCartProductDetailUrl(product, mode) : '#';
    const image = item.img || normalizeImageUrl(product?.Imagen || product?.imagen || '');
    const priceText = cartItemShowsPrice(item) ? formatMoney(item.price) : 'Precio por consultar';

    const variantGrid = variants.length ? `
        <div class="cart-preview-variants">
            <span>Estilos disponibles</span>
            <div class="cart-preview-variant-grid">
                ${variants.map(variant => {
                    const variantProductIndex = allProducts.indexOf(variant);
                    const variantImage = normalizeImageUrl(variant.Imagen || variant.imagen || (variant.Galeria && variant.Galeria[0]) || '');
                    const isActive = variantProductIndex === currentProductIndex;
                    const disabled = getProductStock(variant) <= 0 && !isActive;
                    return `
                        <button class="cart-preview-variant ${isActive ? 'active' : ''}" type="button" ${disabled ? 'disabled' : ''} onclick="changeCartPreviewVariant(${idx}, ${variantProductIndex})">
                            ${variantImage ? `<img src="${escapeHtml(variantImage)}" alt="">` : '<span class="cart-preview-variant-empty">?</span>'}
                            <strong>${escapeHtml(getCartVariantLabel(variant, variants))}</strong>
                        </button>
                    `;
                }).join('')}
            </div>
        </div>
    ` : '';

    content.innerHTML = `
        <div class="cart-preview-media">
            ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.name)}">` : '<div class="cart-preview-empty">Sin imagen</div>'}
        </div>
        <div class="cart-preview-info">
            <p class="cart-preview-kicker">Vista del carrito</p>
            <h3 id="cart-preview-title">${escapeHtml(item.name)}</h3>
            ${item.variantLabel ? `<p class="cart-preview-selected">Opcion actual: <strong>${escapeHtml(item.variantLabel)}</strong></p>` : ''}
            <div class="cart-preview-price">${priceText}</div>
            ${variantGrid}
            ${detailUrl !== '#' ? `<a class="cart-preview-link" href="${detailUrl}">Ver ficha completa</a>` : ''}
        </div>
    `;

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

function changeCartPreviewVariant(idx, productIndex) {
    const nextIndex = changeCartVariant(idx, productIndex);
    if (nextIndex >= 0 && cart[nextIndex]) {
        openCartItemPreview(nextIndex);
    } else {
        closeCartPreview();
    }
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
    let cartNeedsSave = false;
    cart.forEach(item => {
        const productIndex = getCartProductIndex(item);
        const product = productIndex >= 0 ? allProducts[productIndex] : null;
        if (!product) return;
        const variantLabel = getVariantSummary(product);
        if (variantLabel && item.variantLabel !== variantLabel) {
            item.variantLabel = variantLabel;
            cartNeedsSave = true;
        }
        if (item.productIndex !== productIndex) {
            item.productIndex = productIndex;
            cartNeedsSave = true;
        }
    });
    if (cartNeedsSave) saveCart();
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
            checkoutBtn.textContent = shouldRegisterCartOrder() ? `Registrar Pedido ${getCartOrderLabel()}` : 'Enviar consulta por WhatsApp';
            checkoutBtn.style.display = 'block';
        }
        return;
    }
    itemsEl.innerHTML = cart.map((c, i) => {
        const variants = getCartVariantOptions(c);
        const currentProductIndex = getCartProductIndex(c);
        const variantSelect = variants.length ? `
                <label class="cart-item-variant">
                    <span>Opci&oacute;n</span>
                    <select onchange="changeCartVariant(${i}, this.value)" aria-label="Cambiar opci&oacute;n de ${escapeHtml(c.name)}">
                        ${variants.map((variant, variantIndex) => {
                            const variantProductIndex = allProducts.indexOf(variant);
                            const disabled = getProductStock(variant) <= 0 && variantProductIndex !== currentProductIndex;
                            return `<option value="${variantProductIndex}" ${variantProductIndex === currentProductIndex ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${escapeHtml(getCartVariantLabel(variant, variants))}</option>`;
                        }).join('')}
                    </select>
                </label>` : '';

        return `
        <div class="cart-item">
            <button class="cart-item-preview-btn" type="button" onclick="openCartItemPreview(${i})" aria-label="Ampliar imagen de ${escapeHtml(c.name)}" title="Ampliar imagen">
                ${c.img ? `<img src="${escapeHtml(c.img)}" class="cart-item-img" alt="">` : '<span class="cart-item-img cart-item-img-empty">?</span>'}
            </button>
            <div class="cart-item-info">
                <div class="cart-item-name">${escapeHtml(c.name)}</div>
                <div class="cart-item-price">${cartItemShowsPrice(c) ? `${formatMoney(c.price)} unidad` : 'Precio por consultar'}</div>
                ${variantSelect}
                <div class="cart-item-qty">
                    <button type="button" onclick="incrementCartQty(${i}, -1)" aria-label="Restar cantidad">-</button>
                    <input type="number" min="1" ${c.stock ? `max="${c.stock}"` : ''} value="${c.qty}" onchange="updateCartQty(${i}, this.value)" aria-label="Cantidad">
                    <button type="button" onclick="incrementCartQty(${i}, 1)" aria-label="Sumar cantidad">+</button>
                </div>
                <div class="cart-item-subtotal">${cartItemShowsPrice(c) ? formatMoney(c.price * c.qty) : 'Por consultar'}</div>
            </div>
            <button class="cart-item-remove" type="button" onclick="removeFromCart(${i})" aria-label="Eliminar producto" title="Eliminar producto">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 6h18"></path>
                    <path d="M8 6V4h8v2"></path>
                    <path d="M19 6l-1 15H6L5 6"></path>
                    <path d="M10 11v6"></path>
                    <path d="M14 11v6"></path>
                </svg>
            </button>
        </div>
    `;
    }).join('');
    const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
    const hasHiddenPrices = cart.some(c => !cartItemShowsPrice(c));
    if (totalEl) totalEl.textContent = hasHiddenPrices ? 'Por consultar' : formatMoney(total);
    if (consultNoteEl) {
        consultNoteEl.textContent = hasHiddenPrices
            ? 'Este carrito se enviara como consulta general por WhatsApp. Para consultar un solo producto, usa el boton "Precio por consultar" del producto.'
            : `Al finalizar, se registrara el pedido ${getCartOrderLabel().toLowerCase()} en el sistema.`;
    }
    const checkoutBtn = document.getElementById('btn-checkout');
    if (checkoutBtn) {
        const isRegisteredOrder = shouldRegisterCartOrder();
        checkoutBtn.textContent = isRegisteredOrder ? `Registrar Pedido ${getCartOrderLabel()}` : 'Enviar consulta por WhatsApp';

        // Manejo del form inline para pedidos registrados
        let formContainer = document.getElementById('cart-wholesale-form');
        if (!isRegisteredOrder && formContainer) formContainer.style.display = 'none';
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

            const customerCard = formContainer.firstElementChild;
            if (customerCard) {
                customerCard.classList.add('cart-customer-card');
                customerCard.removeAttribute('style');
            }
            const customerTitle = customerCard?.querySelector('h4');
            if (customerTitle) {
                customerTitle.className = 'cart-customer-title';
                customerTitle.removeAttribute('style');
                customerTitle.innerHTML = `<span>Datos de Envio</span><span class="cart-required-pill">${getCartOrderLabel()}</span>`;
            }

            const decorateCartField = (id, label, required = false) => {
                const input = document.getElementById(id);
                if (!input || input.closest('.cart-field')) return;
                const field = document.createElement('div');
                field.className = 'cart-field';
                if (required) field.dataset.requiredField = id;
                const labelEl = document.createElement('label');
                labelEl.setAttribute('for', id);
                labelEl.innerHTML = required
                    ? `${label} <span class="cart-field-required">Requerido</span>`
                    : label;
                input.removeAttribute('style');
                input.parentNode.insertBefore(field, input);
                field.appendChild(labelEl);
                field.appendChild(input);
            };
            decorateCartField('ws-nombre', 'Nombre', true);
            decorateCartField('ws-telefono', 'Numero de celular', true);
            decorateCartField('ws-direccion', 'Direccion de entrega');
            decorateCartField('ws-ciudad', 'Ciudad');
            decorateCartField('ws-nota', 'Nota adicional');
            const placeholderText = {
                'ws-nombre': 'Nombre',
                'ws-telefono': 'Numero de celular',
                'ws-direccion': 'Direccion de entrega (opcional)',
                'ws-ciudad': 'Ciudad (opcional)',
                'ws-nota': 'Nota adicional (opcional)'
            };
            Object.entries(placeholderText).forEach(([id, placeholder]) => {
                const field = document.getElementById(id);
                if (field) field.placeholder = placeholder;
            });

            let initialErrorBox = document.getElementById('ws-form-error');
            if (!initialErrorBox && customerCard) {
                initialErrorBox = document.createElement('div');
                initialErrorBox.id = 'ws-form-error';
                initialErrorBox.className = 'cart-form-error';
                initialErrorBox.setAttribute('aria-live', 'polite');
                const firstField = customerCard.querySelector('.cart-field');
                customerCard.insertBefore(initialErrorBox, firstField || customerCard.firstChild);
            }

            document.getElementById('btn-cancel-ws').addEventListener('click', () => {
                formContainer.style.display = 'none';
                const currentCheckoutBtn = document.getElementById('btn-checkout');
                if (currentCheckoutBtn) currentCheckoutBtn.style.display = 'block';
            });

            ['ws-nombre', 'ws-telefono'].forEach(inputId => {
                document.getElementById(inputId)?.addEventListener('input', event => {
                    event.currentTarget.closest('.cart-field')?.classList.remove('is-invalid');
                    const errorBox = document.getElementById('ws-form-error');
                    if (errorBox) errorBox.style.display = 'none';
                });
            });

            document.getElementById('btn-confirm-ws').addEventListener('click', () => {
                const nameInput = document.getElementById('ws-nombre');
                const phoneInput = document.getElementById('ws-telefono');
                const n = nameInput.value.trim();
                const t = phoneInput.value.trim();
                const d = document.getElementById('ws-direccion').value.trim();
                const c = document.getElementById('ws-ciudad').value.trim();
                [nameInput, phoneInput].forEach(input => input.closest('.cart-field')?.classList.remove('is-invalid'));
                
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
                    if (!n) nameInput.closest('.cart-field')?.classList.add('is-invalid');
                    if (!t) phoneInput.closest('.cart-field')?.classList.add('is-invalid');
                    errorBox.textContent = '✦ Por favor completa nombre y celular.';
                    errorBox.textContent = 'Completa el nombre y el numero de celular para registrar el pedido.';
                    errorBox.style.display = 'block';
                    (n ? phoneInput : nameInput).focus();
                    return;
                }
                
                errorBox.style.display = 'none';
                window.wsClienteTemp = { nombre: n, telefono: t, direccion: d, ciudad: c, nota: document.getElementById('ws-nota').value.trim() };
                
                formContainer.innerHTML = `
                    <div class="cart-customer-card cart-registering">
                        <div class="cart-loading-track"><span></span></div>
                        <h4>Registrando pedido...</h4>
                        <p>Un momento, ya casi queda listo.</p>
                    </div>
                `;
                checkout(true);
            });
        }

        // Remover event listener previo limpiando el elemento
        const newBtn = checkoutBtn.cloneNode(true);
        checkoutBtn.parentNode.replaceChild(newBtn, checkoutBtn);
        
        newBtn.addEventListener('click', () => {
            if (isRegisteredOrder) {
                formContainer.style.display = 'block';
                newBtn.style.display = 'none';
                const customerTitle = formContainer.querySelector('.cart-customer-title');
                if (customerTitle) customerTitle.innerHTML = `<span>Datos de Envio</span><span class="cart-required-pill">${getCartOrderLabel()}</span>`;
            } else {
                checkout(false);
            }
        });
    }
}

function openCart() {
    setCartMode(activeCartMode);
    updateCartUI();
    syncRetailPriceVisibility().then(updateCartUI);
    document.getElementById('cart-overlay')?.classList.add('open');
    document.getElementById('cart-sidebar')?.classList.add('open');
}
function closeCart() {
    clearWholesaleOrderNotice();
    document.getElementById('cart-overlay')?.classList.remove('open');
    document.getElementById('cart-sidebar')?.classList.remove('open');
}

function clearWholesaleOrderNotice() {
    const formContainer = document.getElementById('cart-wholesale-form');
    if (!formContainer || !formContainer.querySelector('.cart-success-card')) return;
    formContainer.innerHTML = '';
    formContainer.style.display = 'none';
    window.wsClienteTemp = null;
}

function dismissWholesaleOrderNotice() {
    clearWholesaleOrderNotice();
    document.getElementById('cart-overlay')?.classList.remove('open');
    document.getElementById('cart-sidebar')?.classList.remove('open');
}

function copyOrderReference(reference, button) {
    const text = String(reference || '').trim();
    if (!text) return;
    const done = () => {
        if (!button) return;
        const original = button.dataset.originalText || button.textContent;
        button.dataset.originalText = original;
        button.textContent = 'Referencia copiada';
        setTimeout(() => { button.textContent = original; }, 1600);
    };
    const fallbackCopy = () => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
        done();
    };
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(fallbackCopy);
    } else {
        fallbackCopy();
    }
}
window.dismissWholesaleOrderNotice = dismissWholesaleOrderNotice;
window.copyOrderReference = copyOrderReference;

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
    syncActiveCategoryControls(activeFilter);
    const select = document.getElementById('catalog-category-select');
    if (select) {
        const option = Array.from(select.options).find(opt => activeFilter === 'todos' ? opt.value === 'todos' : isSameCategory(opt.value, activeFilter));
        select.value = option ? option.value : 'todos';
    }
    renderCatalogProducts();
}

function setWholesaleFilter(cat) {
    activeWholesaleFilter = cat || 'todos';
    syncActiveCategoryControls(activeWholesaleFilter);
    const select = document.getElementById('wholesale-category-select');
    if (select) {
        const option = Array.from(select.options).find(opt => activeWholesaleFilter === 'todos' ? opt.value === 'todos' : isSameCategory(opt.value, activeWholesaleFilter));
        select.value = option ? option.value : 'todos';
    }
    renderWholesaleCatalogProducts();
}

function setPriceFilter(priceFilter) {
    activePriceFilter = priceFilter || 'todos';
    const slider = document.getElementById('catalog-price-slider');
    if (slider && activePriceFilter !== 'todos') slider.value = activePriceFilter;
    renderCatalogProducts();
}

function setWholesalePriceFilter(priceFilter) {
    activeWholesalePriceFilter = priceFilter || 'todos';
    const slider = document.getElementById('wholesale-price-slider');
    if (slider && activeWholesalePriceFilter !== 'todos') slider.value = activeWholesalePriceFilter;
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

function initFooterPageSearch() {
    const input = document.getElementById('footer-page-search');
    const results = document.getElementById('footer-page-search-results');
    if (!input || !results) return;

    const items = Array.from(results.querySelectorAll('[data-footer-search-item]'));
    const empty = results.querySelector('.footer-search-empty');

    const updateResults = () => {
        const terms = normalizeSearchText(input.value).split(/\s+/).filter(Boolean);
        let visibleCount = 0;

        items.forEach(item => {
            const searchable = normalizeSearchText(`${item.textContent || ''} ${item.dataset.keywords || ''}`);
            const isMatch = !terms.length || terms.every(term => searchable.includes(term));
            item.style.display = isMatch ? '' : 'none';
            if (isMatch) visibleCount++;
        });

        if (empty) empty.style.display = visibleCount ? 'none' : 'flex';
    };

    input.addEventListener('input', updateResults);
    input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        const firstVisible = items.find(item => item.style.display !== 'none');
        if (!firstVisible) return;
        event.preventDefault();
        firstVisible.click();
    });

    updateResults();
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
    const backBtn = document.getElementById('wholesale-back-btn');
    const triggers = document.querySelectorAll('a[href="#mayorista"], a[href="mayorista.html"]');

    initWholesaleParticles(); // Iniciar partículas

    let isModalHistoryPushed = false;

    function openWholesale(e) {
        e?.preventDefault();
        if (!overlay) {
            window.location.href = 'index.html#mayorista';
            return;
        }
        error?.classList.remove('show');
        if (input) input.value = '';

        if (!overlay.classList.contains('open')) {
            overlay.classList.add('open');
            overlay.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            if (input) setTimeout(() => input.focus(), 80);

            if (window.history && window.history.pushState) {
                try {
                    history.pushState({ modal: 'wholesale' }, '', window.location.pathname + window.location.search + '#mayorista');
                    isModalHistoryPushed = true;
                } catch (err) {}
            }
        }

        document.getElementById('nav-toggle')?.classList.remove('open');
        document.getElementById('nav-links')?.classList.remove('open');
    }

    function closeWholesale(goHome = false) {
        if (overlay) {
            overlay.classList.remove('open');
            overlay.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        }

        if (isModalHistoryPushed && window.history.state?.modal === 'wholesale') {
            isModalHistoryPushed = false;
            try {
                window.history.back();
            } catch (err) {}
        } else if (window.location.hash === '#mayorista' && window.history.replaceState) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }

        if (goHome) {
            if (window.location.pathname.includes('mayorista.html')) {
                window.location.href = 'index.html';
            } else if (!window.location.hash || window.location.hash === '#mayorista') {
                window.location.hash = 'inicio';
            }
        }
    }

    window.openWholesaleOverlay = openWholesale;

    window.addEventListener('popstate', () => {
        if (overlay && overlay.classList.contains('open')) {
            isModalHistoryPushed = false;
            overlay.classList.remove('open');
            overlay.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            if (window.location.hash === '#mayorista' && window.history.replaceState) {
                history.replaceState(null, '', window.location.pathname + window.location.search);
            }
        }
    });

    triggers.forEach(t => {
        t.addEventListener('click', (e) => {
            if (sessionStorage.getItem('blyxu_wholesale_access') === '1') {
                return;
            }
            e.preventDefault();
            openWholesale(e);
        });
    });

    const retailTriggers = document.querySelectorAll('a[href="#coleccion"]');
    const wholesaleSection = document.getElementById('catalogo-mayorista');

    retailTriggers.forEach(trigger => trigger.addEventListener('click', () => {
        setCatalogCartMode('retail');
        activeFilter = 'todos';
        wholesaleSection?.classList.remove('open');
        wholesaleSection?.setAttribute('aria-hidden', 'true');
        renderCatalogProducts();
    }));

    closeBtn?.addEventListener('click', () => closeWholesale(true));
    backBtn?.addEventListener('click', () => closeWholesale(true));

    if (input) {
        input.addEventListener('input', () => error?.classList.remove('show'));
    }

    if (overlay) {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closeWholesale(true);
        });
    }

    if (form) {
        form.addEventListener('submit', async e => {
            e.preventDefault();
            if (input.value.trim() !== '53') {
                error?.classList.add('show');
                input.select();
                return;
            }

            closeWholesale(false);
            sessionStorage.setItem('blyxu_wholesale_access', '1');
            sessionStorage.setItem('blyxu_just_logged_in', '1');

            const loader = document.getElementById('brand-loader');
            if (loader) {
                loader.classList.remove('open');
                void loader.offsetWidth;
                loader.classList.add('open');
                loader.setAttribute('aria-hidden', 'false');
            }

            setTimeout(() => {
                window.location.href = 'mayorista.html';
            }, 800);
        });
    }

    if (window.location.hash === '#mayorista' && sessionStorage.getItem('blyxu_wholesale_access') !== '1') {
        setTimeout(() => openWholesale(), 150);
    }
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
    const phone = getCommerceWhatsAppPhone();
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
}

function renderFloatingWhatsApp() {
    const phone = getCommerceWhatsAppPhone();
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
async function saveOrderToGoogleSheets(cliente, total, customerType = getCartCustomerType()) {
    const normalizedType = customerType === 'Mayor' ? 'Mayor' : 'Detal';
    const orderLabel = normalizedType === 'Mayor' ? 'Mayorista' : 'Detal';
    const productos = cart.map(item => ({
        idVariacion: item.idVariacion || item.sku || item.name,
        id: item.idVariacion || item.sku || item.name,
        nombre: item.name,
        opcion: item.variantLabel || '',
        cantidad: item.qty,
        precio: item.price,
        subtotal: item.price * item.qty,
        sku: item.sku || '',
        modo: item.mode || activeCatalogMode
    }));

    const orderId = `${normalizedType === 'Mayor' ? 'MAY' : 'DET'}-${Date.now()}`;
    const payload = {
        resource: 'pedidos',
        action: 'crear',
        'ID Pedido': orderId,
        'Nombre Cliente': cliente.nombre,
        'Tipo Cliente': normalizedType,
        'Telefono': cliente.telefono,
        'Email': cliente.email || '',
        'Direccion': cliente.direccion,
        'Ciudad': cliente.ciudad,
        'Productos JSON': JSON.stringify(productos),
        'Cantidad Total': cart.reduce((sum, item) => sum + item.qty, 0),
        'Subtotal': total,
        'Estado Pedido': 'Pendiente',
        'Metodo Contacto': `Sistema ${orderLabel}`,
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

function buildCartWhatsAppMessage({ isRegisteredOrder, customerType = 'Detal', cliente = null, savedOrder = null, total = 0, note = '' }) {
    const hasHiddenPrices = cart.some(item => !cartItemShowsPrice(item));
    const orderLabel = customerType === 'Mayor' ? 'Mayorista' : 'Detal';
    let msg = isRegisteredOrder ? `*Pedido ${orderLabel} BLYXU*\n\n` : '*Consulta BLYXU*\n\n';

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
        const lineTotal = cartItemShowsPrice(c) ? formatMoney(c.price * c.qty) : 'Precio por consultar';
        msg += `- ${c.name} x ${c.qty} - ${lineTotal}\n`;
        if (c.variantLabel) msg += `  Opci\u00f3n: ${c.variantLabel}\n`;
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
    await syncRetailPriceVisibility();
    const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
    const isRegisteredOrder = shouldRegisterCartOrder();
    const customerType = getCartCustomerType();
    const orderLabel = getCartOrderLabel();
    
    const cliente = isRegisteredOrder ? window.wsClienteTemp : null;
    if (isRegisteredOrder && !cliente) {
        updateCartUI();
        const formContainer = document.getElementById('cart-wholesale-form');
        const checkoutBtn = document.getElementById('btn-checkout');
        if (formContainer) formContainer.style.display = 'block';
        if (checkoutBtn) checkoutBtn.style.display = 'none';
        return;
    }
    
    const retailNote = isRegisteredOrder ? '' : askRetailQuestion();

    const btn = document.getElementById('btn-confirm-ws') || document.getElementById('btn-checkout');
    const originalText = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = isRegisteredOrder ? 'Registrando pedido...' : 'Preparando WhatsApp...';
    }

    let savedOrder = null;
    if (isRegisteredOrder) {
        try {
            savedOrder = await saveOrderToGoogleSheets(cliente, total, customerType);
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
        isRegisteredOrder,
        customerType,
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

    if (isRegisteredOrder) {
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
            const orderId = savedOrder?.['ID Pedido'] || 'Pedido registrado';
            const whatsappHref = `https://wa.me/${getCommerceWhatsAppPhone()}?text=${encodeURIComponent(msg)}`;
            formContainer.style.display = 'block';
            document.getElementById('btn-checkout')?.style && (document.getElementById('btn-checkout').style.display = 'none');
            formContainer.innerHTML = `
                <div class="cart-customer-card cart-success-card">
                    <div class="cart-success-icon">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    <h4>Gracias por tu pedido</h4>
                    <p>Tu pedido ${orderLabel.toLowerCase()} quedo registrado correctamente. Copia la referencia para cualquier duda.</p>
                    <div class="cart-order-id">Pedido ${escapeHtml(orderId)}</div>
                    <div class="cart-success-actions">
                        <button class="cart-copy-reference-btn" type="button" data-order-reference="${escapeHtml(orderId)}" onclick="copyOrderReference(this.dataset.orderReference, this)">
                            Copiar referencia
                        </button>
                        <a class="cart-whatsapp-link" href="${whatsappHref}" target="_blank" rel="noopener">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-5.2A8.5 8.5 0 1 1 21 11.5Z"></path><path d="M9.2 8.8c.2 2.8 2.3 5 5.1 5.5"></path></svg>
                            Dudas por WhatsApp
                        </a>
                        <button class="btn-checkout" onclick="dismissWholesaleOrderNotice()" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);">Cerrar</button>
                    </div>
                </div>
            `;
            if (typeof launchWholesaleConfetti === 'function') launchWholesaleConfetti();
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
    initFooterPageSearch();
    initWholesaleAccess();
    initCustomCursor();
    initGlassSelects();
    const isProductDetailPage = Boolean(document.getElementById('product-detail'));
    const isContactPage = document.body?.dataset.page === 'contact';
    const isPaymentsPage = document.body?.dataset.page === 'pagos';
    const isOrdersLookupPage = document.body?.dataset.page === 'facturas-pedidos';
    const isWholesalePage = document.body?.dataset.catalogMode === 'wholesale';
    
    if (isWholesalePage && sessionStorage.getItem('blyxu_wholesale_access') !== '1') {
        window.location.replace('index.html#mayorista');
        return;
    }

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

    if (isContactPage || isPaymentsPage || isOrdersLookupPage) {
        fetchSiteConfig().then(() => {
            if (isContactPage) renderContactPage();
            renderFooterSocialLinks();
            renderPromoWidget();
        });
    } else {
        loadProducts({ renderCatalog: !isProductDetailPage }).then(() => {
            renderFloatingWhatsApp();
            renderFooterSocialLinks();
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









