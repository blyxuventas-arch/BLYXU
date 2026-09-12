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
const MERCADO_PAGO_PUBLIC_KEY = 'APP_USR-72ab41d6-5fc7-4867-8e02-564ab0ae9f99';
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
const CUSTOMER_SESSION_KEY = 'blyxu_customer_session_v1';
const PRODUCTS_CACHE_TTL = 5 * 60 * 1000;
const SITE_CONFIG_CACHE_TTL = 5 * 60 * 1000;
const HOME_CATEGORY_INTERVAL_MS = 3200;
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
let homeCategoryCarouselTimer = null;
let inventorySpotlightTimer = null;
let inventorySpotlightRendered = false;
let googleIdentityLoadPromise = null;
const catalogShuffleSeed = Math.floor(Math.random() * 1000000000);

function cleanBrowserUrl() {
    try {
        if (!window.history?.replaceState) return;
        if (!/^https?:$/.test(window.location.protocol)) return;
        const { pathname, search, hash } = window.location;
        const nextPath = pathname.replace(/\/index\.html$/i, '/');
        const nextHash = (hash === '#' || hash === '#inicio') ? '' : hash;
        if (nextPath !== pathname || nextHash !== hash) {
            history.replaceState(null, '', `${nextPath}${search}${nextHash}`);
        }
    } catch (error) {
        console.warn('No se pudo limpiar la URL:', error);
    }
}

// -- PARTICLES --
function initParticles() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;
    canvas.remove();
    return;
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
    canvas.remove();
    return;
    
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
    canvas.remove();
    return;

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

function getCategoryVariedProducts(products, seed = catalogShuffleSeed) {
    const groups = new Map();

    products.forEach(product => {
        const categoryKey = normalizeSearchText(getProductCategory(product) || 'sin categoria');
        if (!groups.has(categoryKey)) groups.set(categoryKey, []);
        groups.get(categoryKey).push(product);
    });

    const categoryGroups = Array.from(groups.entries())
        .map(([categoryKey, items]) => ({
            categoryKey,
            items: getShuffledProducts(items, `${seed}|${categoryKey}`)
        }))
        .sort((a, b) => hashText(`${seed}|category|${a.categoryKey}`) - hashText(`${seed}|category|${b.categoryKey}`));

    const mixed = [];
    let hasProducts = true;

    while (hasProducts) {
        hasProducts = false;
        categoryGroups.forEach(group => {
            const product = group.items.shift();
            if (product) {
                mixed.push(product);
                hasProducts = true;
            }
        });
    }

    return mixed;
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
        TipoMedida: getProductField(product, ['Tipo Medida', 'TipoMedida'], ''),
        UnidadMedida: getProductField(product, ['Unidad Medida', 'UnidadMedida'], ''),
        Ancho: getProductField(product, ['Ancho'], ''),
        Largo: getProductField(product, ['Largo'], ''),
        Fondo: getProductField(product, ['Fondo'], ''),
        Radio: getProductField(product, ['Radio'], ''),
        TallaTextil: getProductField(product, ['Talla Textil', 'TallaTextil'], ''),
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
    if (value === true) return 'Ambos';
    if (value === false || value === null || value === undefined) return 'FALSO';
    const clean = String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    if (['ambos', 'todos', 'verdadero', 'true', 'si', 's', '1', 'yes', 'activo', 'activa', 'ambas'].includes(clean)) {
        return 'Ambos';
    }
    if (['minorista', 'detal', 'retail', 'solo minorista', 'solo detal'].includes(clean)) {
        return 'Minorista';
    }
    if (['mayorista', 'mayor', 'wholesale', 'solo mayorista', 'solo mayor'].includes(clean)) {
        return 'Mayorista';
    }
    return 'FALSO';
}

function isProductPromotionEnabled(product, mode = activeCatalogMode) {
    const promo = normalizePromotionValue(getProductField(product || {}, PRODUCT_PROMOTION_FIELD_KEYS, false));
    if (promo === 'FALSO') return false;
    if (promo === 'Ambos') return true;
    if (mode === 'wholesale' && promo === 'Mayorista') return true;
    if ((mode === 'retail' || mode === 'detal') && promo === 'Minorista') return true;
    return false;
}

function getPromotionDiscountPercent() {
    const promoTitle = getSiteConfigValue('Promo_Title', '');
    const match = String(promoTitle || '').match(/(\d+)%/);
    if (match) {
        const discountPercentage = parseInt(match[1], 10);
        if (discountPercentage > 0 && discountPercentage < 100) return discountPercentage;
    }

    const promoDiscount = parseInt(getSiteConfigValue('Promo_Discount', ''), 10);
    if (promoDiscount > 0 && promoDiscount < 100) return promoDiscount;

    return 20;
}

function getProductDisplayOldPrice(product, mode = activeCatalogMode, currentPrice = 0) {
    const oldPrice = parseCatalogAmount(mode === 'wholesale'
        ? (product?.PrecioMayoristaOriginal || product?.Precio_Mayorista_Original || product?.Precio_Anterior || product?.PrecioOriginal || 0)
        : (product?.Precio_Anterior || product?.PrecioOriginal || 0));
    return oldPrice > currentPrice ? oldPrice : 0;
}

function getProductPromotionBadgeMarkup(product, mode = activeCatalogMode) {
    const discountPercentage = getPromotionDiscountPercent();
    if (!discountPercentage || !isProductPromotionEnabled(product, mode)) return '';
    return `<div class="product-promo-circle badge-sale" title="-${discountPercentage}% de descuento">
        <span class="promo-circle-num">-${discountPercentage}%</span>
        <span class="promo-circle-text">DCTO</span>
    </div>`;
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

function getProductGeneralReferenceKey(product) {
    const parentId = String(product?.idProducto || product?.['ID Producto'] || product?.Referencia || product?.referencia || '').trim();
    if (parentId) return `parent:${parentId}`;

    const normalizedName = normalizeSearchText(product?.Nombre || product?.nombre || product?.['Nombre del Producto'] || product?.Producto || '');
    const normalizedCategory = normalizeSearchText(product?.Categoria || product?.categoria || '');
    if (normalizedName || normalizedCategory) return `name:${normalizedCategory}:${normalizedName}`;

    return getCatalogRepresentativeKey(product);
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
    const discountPercentage = getPromotionDiscountPercent();
    if (!discountPercentage) return;
    
    const factor = 1 - (discountPercentage / 100);
    
    allProducts.forEach(product => {
        const promoVal = normalizePromotionValue(getProductField(product || {}, PRODUCT_PROMOTION_FIELD_KEYS, false));
        if (promoVal === 'FALSO') return;

        const appliesRetail = promoVal === 'Ambos' || promoVal === 'Minorista';
        const appliesWholesale = promoVal === 'Ambos' || promoVal === 'Mayorista';

        // 1. Detal
        const rawRetail = parseCatalogAmount(product.PrecioOriginal || product.Precio || product.precio);
        if (rawRetail > 0) {
            product.PrecioOriginal = rawRetail;
            product.Precio_Anterior = rawRetail;
            if (appliesRetail) {
                product.Precio = Math.round(rawRetail * factor);
            }
        }
        
        // 2. Mayorista
        const rawWholesale = parseCatalogAmount(
            product.PrecioMayoristaOriginal || 
            product.Precio_Mayorista || 
            product['Precio Mayor'] || 
            product['Precio Mayorista'] || 
            product.precio_mayorista || 
            rawRetail
        );

        if (rawWholesale > 0) {
            product.PrecioMayoristaOriginal = rawWholesale;
            product.Precio_Mayorista_Original = rawWholesale;
            if (appliesWholesale) {
                const discountedWholesale = Math.round(rawWholesale * factor);
                product.Precio_Mayorista = discountedWholesale;
                product['Precio Mayor'] = discountedWholesale;
                product['Precio Mayorista'] = discountedWholesale;
                product.precio_mayorista = discountedWholesale;
                product.Mayorista = discountedWholesale;
            } else {
                product.Precio_Mayorista = rawWholesale;
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

    if (usedProductCache) {
        applyPromotionsToProducts();
        if (renderCatalog) {
            renderBanners(bannerProducts);
            renderHomeCategories();
            renderInventorySpotlight();
            renderHomeAdBanner();
            renderCatalogProducts();
        }
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
                    renderHomeCategories();
                    renderInventorySpotlight();
                    renderHomeAdBanner();
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
        renderHomeCategories();
        renderInventorySpotlight();
        renderHomeAdBanner();
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

    return [...new Set(images)].slice(0, 8);
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

function renderHomeCategories() {
    const track = document.getElementById('home-category-track');
    if (!track) return;
    if (homeCategoryCarouselTimer) {
        clearInterval(homeCategoryCarouselTimer);
        homeCategoryCarouselTimer = null;
    }

    const counts = new Map();
    allProducts.forEach(product => {
        const category = getProductCategory(product);
        if (!category || normalizeSearchText(category) === 'banner') return;
        if (!isActiveProduct(product)) return;
        const key = normalizeSearchText(category);
        const current = counts.get(key) || { label: category, references: new Set() };
        current.references.add(getProductGeneralReferenceKey(product));
        counts.set(key, current);
    });

    const categories = Array.from(counts.values())
        .map(category => ({ label: category.label, count: category.references.size }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'))
        .slice(0, 8);

    if (!categories.length) {
        track.innerHTML = '<a class="home-category-pill" href="#coleccion">Catalogo</a>';
        track.classList.add('is-centered');
        return;
    }

    track.classList.toggle('is-centered', categories.length <= 4);
    track.innerHTML = categories.map(category => `
        <button class="home-category-pill" type="button" data-category="${escapeHtml(category.label)}">
            <span>${escapeHtml(category.label)}</span>
            <small>${category.count}</small>
        </button>
    `).join('');

    const buttons = Array.from(track.querySelectorAll('.home-category-pill'));
    let currentIndex = 0;

    buttons.forEach(button => {
        button.addEventListener('click', () => {
            track.querySelectorAll('.home-category-pill').forEach(item => item.classList.remove('active'));
            button.classList.add('active');
            currentIndex = Math.max(0, buttons.indexOf(button));
            const category = button.dataset.category || 'todos';
            const select = document.getElementById('catalog-category-select');
            if (select) {
                select.value = category;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                activeFilter = category;
                renderCatalogProducts();
            }
            document.getElementById('coleccion')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    if (buttons.length <= 1) return;

    const goToCategory = (nextIndex) => {
        if (!buttons.length || track.matches(':hover')) return;
        currentIndex = nextIndex % buttons.length;
        const nextButton = buttons[currentIndex];
        track.scrollTo({
            left: Math.max(0, nextButton.offsetLeft - 12),
            behavior: 'smooth'
        });
    };

    const configuredSeconds = parseFloat(getSiteConfigValue('Home_Category_Seconds', '3.2'));
    const intervalMs = Number.isFinite(configuredSeconds)
        ? Math.max(1600, configuredSeconds * 1000)
        : HOME_CATEGORY_INTERVAL_MS;

    homeCategoryCarouselTimer = setInterval(() => {
        goToCategory(currentIndex + 1);
    }, intervalMs);
}

function renderHomeAdBanner() {
    const banner = document.getElementById('home-ad-banner');
    if (!banner) return;

    const enabled = String(getSiteConfigValue('Home_Ad_Enabled', 'true')).trim() !== 'false';
    if (!enabled) {
        banner.style.display = 'none';
        return;
    }

    const image = normalizeImageUrl(getSiteConfigValue('Home_Ad_Image', 'hero_necklace.png'));
    const kicker = getSiteConfigValue('Home_Ad_Kicker', 'Edicion limitada');
    const title = getSiteConfigValue('Home_Ad_Title', 'Brilla con tus favoritos');
    const message = getSiteConfigValue('Home_Ad_Message', 'Descubre piezas seleccionadas, promociones y anuncios especiales de BLYXU.');
    const cta = getSiteConfigValue('Home_Ad_Cta', 'Ver productos');
    const link = getSiteConfigValue('Home_Ad_Link', '#coleccion');

    banner.style.display = '';
    const img = document.getElementById('home-ad-image');
    if (img) {
        img.src = image || 'hero_necklace.png';
        img.onerror = () => { img.src = 'hero_necklace.png'; };
    }
    setTextById('home-ad-kicker', kicker);
    setTextById('home-ad-title', title);
    setTextById('home-ad-message', message);
    const linkEl = document.getElementById('home-ad-link');
    if (linkEl) {
        linkEl.textContent = cta;
        linkEl.href = link || '#coleccion';
    }
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
        const name = p.Nombre || p.nombre || p.Producto || 'Producto BLYXU';
        const price = getProductPrice(p, 'retail');
        const priceText = shouldShowProductPrices('retail') ? formatMoney(price) : 'Precio por consultar';
        return `<div class="marquee-item" onclick="window.location.href='${escapeHtml(detailUrl)}'" title="${escapeHtml(p.Nombre || '')}">
                    <img src="${escapeHtml(img)}" alt="${escapeHtml(name)}" loading="lazy" onerror="this.parentElement.style.display='none'">
                    ${stockBadge}
                    <div class="marquee-item-info">
                        <strong>${escapeHtml(name)}</strong>
                        <span>${escapeHtml(priceText)}</span>
                    </div>
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
            <img src="${normalizeImageUrl(b.Imagen || b.imagen || b.Foto || 'hero_necklace.png')}" alt="Banner BLYXU" style="filter: brightness(0.55);" onerror="this.src='hero_necklace.png'">
            <div class="main-banner-overlay"></div>
            <div class="main-banner-content">
                <h1 class="main-banner-title">
                    <svg class="blyxu-svg-title" viewBox="0 0 226 100" xmlns="http://www.w3.org/2000/svg" aria-label="BLYXU">
                        <defs>
                            <linearGradient id="blyxuG${i}" x1="0" y1="0" x2="226" y2="0" gradientUnits="userSpaceOnUse">
                                <stop offset="0%" stop-color="#ffffff"/>
                                <stop offset="40%" stop-color="#c4b5fd"/>
                                <stop offset="100%" stop-color="#7c3aed"/>
                            </linearGradient>
                        </defs>
                        <g class="blyxu-letter-g g1">
                            <path class="blyxu-line" stroke="url(#blyxuG${i})" d="M 8,86 L 8,14 Q 44,14 44,32 Q 44,50 8,50 Q 46,50 46,68 Q 46,86 8,86"/>
                        </g>
                        <g class="blyxu-letter-g g2">
                            <polyline class="blyxu-line" stroke="url(#blyxuG${i})" points="54,14 54,86 82,86"/>
                        </g>
                        <g class="blyxu-letter-g g3">
                            <polyline class="blyxu-line" stroke="url(#blyxuG${i})" points="90,14 106,52 106,86"/>
                            <line class="blyxu-line" stroke="url(#blyxuG${i})" x1="122" y1="14" x2="106" y2="52"/>
                        </g>
                        <g class="blyxu-letter-g g4">
                            <line class="blyxu-line" stroke="url(#blyxuG${i})" x1="130" y1="14" x2="166" y2="86"/>
                            <line class="blyxu-line" stroke="url(#blyxuG${i})" x1="166" y1="14" x2="130" y2="86"/>
                        </g>
                        <g class="blyxu-letter-g g5">
                            <path class="blyxu-line" stroke="url(#blyxuG${i})" d="M 174,14 L 174,68 Q 174,86 193,86 Q 212,86 212,68 L 212,14"/>
                        </g>
                    </svg>
                </h1>
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
            const category = String(p.Categoria || p.categoria || '').toUpperCase();
            if (category === 'BANNER') return false;
            if (!isActiveProduct(p)) return false;

            const scope = getCatalogScope(p);
            const isRetailOnly = scope.includes('solo minorista') || (scope.includes('minorista') && !scope.includes('mayorista') && !scope.includes('ambos') && !scope.includes('todos'));
            if (isRetailOnly) return false;

            return true;
        });
    }

    return allProducts.filter(p => {
        const category = String(p.Categoria || p.categoria || '').toUpperCase();
        if (category === 'BANNER') return false;
        if (!isActiveProduct(p)) return false;

        const scope = getCatalogScope(p);
        const isWholesaleOnly = scope.includes('solo mayorista') || (scope.includes('mayorista') && !scope.includes('minorista') && !scope.includes('ambos') && !scope.includes('todos'));
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

function getProductMeasurementData(product) {
    let width = String(product?.Ancho || product?.ancho || '').trim();
    let length = String(product?.Largo || product?.largo || '').trim();
    let depth = String(product?.Fondo || product?.fondo || '').trim();
    let radius = String(product?.Radio || product?.radio || '').trim();
    const sizeText = String(product?.Tamano || product?.['Tamaño'] || product?.['TamaÃ±o'] || product?.tamaño || product?.Talla || '').trim();
    let textileSize = String(product?.TallaTextil || product?.['Talla Textil'] || '').trim();
    let kind = normalizeSearchText(product?.TipoMedida || product?.['Tipo Medida'] || '');
    let unit = String(product?.UnidadMedida || product?.['Unidad Medida'] || '').trim();

    if (![width, length, depth, radius].some(Boolean)) {
        const unitMatch = sizeText.match(/\b(cm|m3|m)\b/i);
        if (unitMatch) unit = unit || unitMatch[1].toLowerCase();
        const measureMatches = Array.from(sizeText.matchAll(/(ancho|largo|fondo|radio)\s*[:\-]?\s*([\d.,]+)/gi));
        measureMatches.forEach(match => {
            const label = normalizeSearchText(match[1]);
            const value = match[2];
            if (label === 'ancho') width = value;
            if (label === 'largo') length = value;
            if (label === 'fondo') depth = value;
            if (label === 'radio') radius = value;
        });
    }

    if (!textileSize && kind === 'textil') textileSize = sizeText;
    if (!kind && textileSize) kind = 'textil';
    if (!kind && [width, length, depth, radius].some(Boolean)) kind = 'medidas';

    return {
        kind,
        unit: unit || 'cm',
        width,
        length,
        depth,
        radius,
        textileSize
    };
}

function hasPhysicalProductMeasurements(product) {
    const data = getProductMeasurementData(product);
    return data.kind === 'medidas' && [data.width, data.length, data.depth, data.radius].some(Boolean);
}

function getProductMeasurementMarkup(product) {
    const data = getProductMeasurementData(product);

    if (data.kind === 'textil' && data.textileSize) {
        const sizes = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'];
        const normalizedActive = normalizeSearchText(data.textileSize);
        const hasKnownSize = sizes.some(size => normalizeSearchText(size) === normalizedActive);
        const visibleSizes = hasKnownSize ? sizes : [data.textileSize];
        return `
            <div class="product-card-textile-size" aria-label="Talla textil ${escapeHtml(data.textileSize)}">
                ${visibleSizes.map(size => `<span class="${normalizeSearchText(size) === normalizedActive ? 'active' : ''}">${escapeHtml(size)}</span>`).join('')}
            </div>
        `;
    }

    if (!hasPhysicalProductMeasurements(product)) return '';

    const dimensionItems = data.radius
        ? [{ label: 'Radio', value: data.radius }]
        : [
            { label: 'Ancho', value: data.width },
            { label: 'Largo', value: data.length },
            { label: 'Fondo', value: data.depth }
        ].filter(item => item.value);
    const maxDimension = Math.max(...dimensionItems.map(item => parseCatalogAmount(item.value)), 1);

    return `
        <div class="product-card-measure product-card-specs" aria-label="Medidas del producto">
            <div class="product-card-specs-title">Medidas</div>
            ${dimensionItems.map(item => {
                const amount = parseCatalogAmount(item.value);
                const width = Math.max(14, Math.min(100, Math.round((amount / maxDimension) * 100)));
                return `
                    <div class="product-card-spec-row">
                        <span class="product-card-spec-label">${escapeHtml(item.label)}</span>
                        <span class="product-card-spec-bar" aria-hidden="true">
                            <span style="width:${width}%"></span>
                        </span>
                        <span class="product-card-spec-value">${escapeHtml(item.value)} ${escapeHtml(data.unit)}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
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
        hasPhysicalProductMeasurements(product) ? '' : (product.Tamano || product.tamano || product.Talla),
        product.Color || product.color
    ]
        .map(value => String(value || '').trim())
        .filter(value => value && !isCatalogOnlyValue(value) && !isReferenceValue(value));

    return Array.from(new Set(parts)).join(' / ');
}

function renderProducts(products, options = {}) {
    const {
        featuredFirst = false,
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

    const representativeProducts = collapseCatalogProductsToRepresentatives(visibleResults, mode);
    const isGeneralCatalogView = normalizeSearchText(filter) === 'todos' && !normalizeSearchText(searchQuery);
    const filtered = isGeneralCatalogView
        ? getCategoryVariedProducts(representativeProducts, `${catalogShuffleSeed}|${gridId}|${mode}|${priceFilter}`)
        : getShuffledProducts(representativeProducts);

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
                ${getProductPromotionBadgeMarkup(p, mode)}
                <button class="product-card-favorite" type="button" onclick="event.stopPropagation(); saveCustomerFavorite(${productIndex}, this)" title="Guardar favorito" aria-label="Guardar ${escapeHtml(name)} en favoritos">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>
                </button>
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
        if (document.body?.dataset.catalogMode === 'wholesale' || params.get('catalogo') === 'mayorista' || params.get('modo') === 'mayorista') {
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

    // Iluminar el icono del carrito arriba sin mostrar avisos molestos ni abrir drawer
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

let currentCartSectionPaymentMethod = 'mp';

function setCartPaymentMethod(method) {
    currentCartSectionPaymentMethod = method;
    const mpTab = document.getElementById('tab-payment-mp');
    const wsTab = document.getElementById('tab-payment-ws');
    const mpBadges = document.getElementById('cart-sec-mp-badges');
    const emailField = document.getElementById('cart-sec-field-email');
    const btnCheckout = document.getElementById('btn-cart-sec-checkout');
    const btnText = document.getElementById('btn-cart-sec-checkout-text');

    if (mpTab && wsTab) {
        if (method === 'mp') {
            mpTab.classList.add('active');
            wsTab.classList.remove('active');
            if (btnCheckout) btnCheckout.classList.remove('btn-ws-mode');
            if (btnText) btnText.textContent = 'Check Out con Mercado Pago ✦';
            if (mpBadges) mpBadges.style.display = 'flex';
            if (emailField) emailField.style.display = 'flex';
        } else {
            wsTab.classList.add('active');
            mpTab.classList.remove('active');
            if (btnCheckout) btnCheckout.classList.add('btn-ws-mode');
            if (btnText) btnText.textContent = 'Finalizar Pedido por WhatsApp 💬';
            if (mpBadges) mpBadges.style.display = 'none';
        }
    }
}
window.setCartPaymentMethod = setCartPaymentMethod;

function updateCartUI() {
    const badge = document.getElementById('cart-count');
    const itemsEl = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    const consultNoteEl = document.getElementById('cart-consult-note');
    const titleEl = document.querySelector('.cart-header h3');

    // Standalone Section Elements
    const secItemsEl = document.getElementById('cart-section-items');
    const secSubtotalEl = document.getElementById('cart-summary-subtotal');
    const secTotalEl = document.getElementById('cart-summary-total');
    const secCountLabel = document.getElementById('cart-count-label');
    const secModeBadge = document.getElementById('cart-mode-badge');
    const secCheckoutBtn = document.getElementById('btn-cart-sec-checkout');
    const secCheckoutBtnText = document.getElementById('btn-cart-sec-checkout-text');

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
    const pricingSummary = getCartPricingSummary(cart);
    const total = pricingSummary.total;
    const hasHiddenPrices = cart.some(c => !cartItemShowsPrice(c));
    const isWholesale = normalizeCartMode(activeCartMode) === 'wholesale';
    const isRegisteredOrder = shouldRegisterCartOrder();
    const showMpCheckout = !isWholesale && isRegisteredOrder;

    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
    if (titleEl) titleEl.innerHTML = `Carrito ${getCartModeLabel()}`;
    if (secCountLabel) secCountLabel.textContent = `${count} ${count === 1 ? 'producto' : 'productos'}`;
    if (secModeBadge) secModeBadge.textContent = `Catálogo ${getCartModeLabel()}`;

    // Update Standalone Section Summary Totals
    const formattedSubtotal = hasHiddenPrices ? 'Por consultar' : formatMoney(pricingSummary.subtotal);
    const formattedTotal = hasHiddenPrices ? 'Por consultar' : formatMoney(total);
    if (secSubtotalEl) secSubtotalEl.textContent = formattedSubtotal;
    if (secTotalEl) secTotalEl.textContent = formattedTotal;
    const summaryBox = secSubtotalEl?.closest('.cart-summary-box');
    if (summaryBox) {
        let discountRow = document.getElementById('cart-summary-customer-discount');
        if (!discountRow) {
            discountRow = document.createElement('div');
            discountRow.id = 'cart-summary-customer-discount';
            discountRow.className = 'cart-summary-line cart-summary-discount';
            const totalRow = summaryBox.querySelector('.cart-summary-total');
            summaryBox.insertBefore(discountRow, totalRow || null);
        }
        if (!hasHiddenPrices && pricingSummary.discount > 0) {
            discountRow.innerHTML = `<span>${escapeHtml(pricingSummary.promotion.label)}:</span><strong>-${formatMoney(pricingSummary.discount)}</strong>`;
            discountRow.style.display = 'flex';
        } else {
            discountRow.style.display = 'none';
        }
    }
    const browseCatalogUrl = document.body?.dataset.page === 'carrito'
        ? (isWholesale ? 'mayorista.html' : 'index.html#coleccion')
        : '#coleccion';
    const continueBtn = document.getElementById('cart-btn-continue');
    if (continueBtn) continueBtn.setAttribute('href', browseCatalogUrl);

    // Render Standalone Section Table Items
    if (secItemsEl) {
        if (!cart.length) {
            secItemsEl.innerHTML = `
                <div class="cart-empty-state">
                    <div class="cart-empty-icon">🛍️</div>
                    <h3>Tu carrito ${getCartModeLabel()} está vacío ✦</h3>
                    <p>Descubre nuestras joyas y accesorios exclusivos y añade tus piezas preferidas.</p>
                    <a href="${browseCatalogUrl}" class="cart-btn-browse">Explorar Catálogo</a>
                </div>
            `;
            if (secCheckoutBtn) {
                secCheckoutBtn.disabled = true;
            }
        } else {
            if (secCheckoutBtn) secCheckoutBtn.disabled = false;
            secItemsEl.innerHTML = cart.map((c, i) => {
                const variants = getCartVariantOptions(c);
                const currentProductIndex = getCartProductIndex(c);
                const variantSelect = variants.length ? `
                    <select class="cart-sec-variant-select" onchange="changeCartVariant(${i}, this.value)" aria-label="Cambiar opción de ${escapeHtml(c.name)}">
                        ${variants.map(variant => {
                            const variantProductIndex = allProducts.indexOf(variant);
                            const disabled = getProductStock(variant) <= 0 && variantProductIndex !== currentProductIndex;
                            return `<option value="${variantProductIndex}" ${variantProductIndex === currentProductIndex ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${escapeHtml(getCartVariantLabel(variant, variants))}</option>`;
                        }).join('')}
                    </select>
                ` : '<span class="cart-sec-variant-none">Única opción</span>';

                return `
                    <div class="cart-sec-row" data-cart-index="${i}">
                        <div class="cart-sec-prod-info">
                            <button class="cart-sec-thumb-wrap" type="button" onclick="openCartItemPreview(${i})" aria-label="Ampliar imagen de ${escapeHtml(c.name)}" title="Ampliar imagen">
                                ${c.img ? `<img src="${escapeHtml(c.img)}" class="cart-sec-thumb-img" alt="">` : '<span class="cart-item-img-empty">?</span>'}
                            </button>
                            <div class="cart-sec-prod-meta">
                                <h4 class="cart-sec-prod-title">${escapeHtml(c.name)}</h4>
                                <div class="cart-sec-prod-price">${cartItemShowsPrice(c) ? `${formatMoney(c.price)} c/u` : 'Precio por consultar'}</div>
                                ${c.sku || c.idVariacion ? `<div class="cart-sec-prod-ref">Ref: ${escapeHtml(c.sku || c.idVariacion)}</div>` : ''}
                            </div>
                        </div>
                        <div class="cart-sec-variant-col">
                            ${variantSelect}
                        </div>
                        <div class="cart-sec-qty-col">
                            <div class="cart-sec-qty-stepper">
                                <button class="cart-sec-qty-btn" type="button" onclick="incrementCartQty(${i}, -1)" aria-label="Restar">-</button>
                                <input class="cart-sec-qty-input" type="number" min="1" ${c.stock ? `max="${c.stock}"` : ''} value="${c.qty}" onchange="updateCartQty(${i}, this.value)" aria-label="Cantidad">
                                <button class="cart-sec-qty-btn" type="button" onclick="incrementCartQty(${i}, 1)" aria-label="Sumar">+</button>
                            </div>
                        </div>
                        <div class="cart-sec-total-col">
                            <span class="cart-sec-row-total">${cartItemShowsPrice(c) ? formatMoney(c.price * c.qty) : 'Por consultar'}</span>
                        </div>
                        <div class="cart-sec-act-col">
                            <button class="cart-sec-del-btn" type="button" onclick="removeFromCart(${i})" aria-label="Eliminar producto" title="Eliminar producto">✕</button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // Configure Standalone Section Payment Method & Button text
    if (isWholesale) {
        const mpTab = document.getElementById('tab-payment-mp');
        if (mpTab) mpTab.style.display = 'none';
        setCartPaymentMethod('ws');
        if (secCheckoutBtnText) secCheckoutBtnText.textContent = 'Confirmar y Registrar Pedido Mayorista ✦';
    } else {
        const mpTab = document.getElementById('tab-payment-mp');
        if (mpTab) mpTab.style.display = 'flex';
        if (currentCartSectionPaymentMethod === 'mp') {
            setCartPaymentMethod('mp');
        } else {
            setCartPaymentMethod('ws');
        }
    }

    // Wire Standalone Checkout Button
    if (secCheckoutBtn) {
        const newSecBtn = secCheckoutBtn.cloneNode(true);
        secCheckoutBtn.parentNode.replaceChild(newSecBtn, secCheckoutBtn);
        
        // Remove error states on input
        ['cart-sec-nombre', 'cart-sec-telefono'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', e => {
                e.currentTarget.closest('.cart-input-field')?.classList.remove('is-invalid');
                const err = document.getElementById('cart-section-form-error');
                if (err) err.style.display = 'none';
            });
        });

        newSecBtn.addEventListener('click', () => {
            if (!cart.length) {
                alert('Tu carrito está vacío. Agrega productos para continuar.');
                return;
            }

            const nameInput = document.getElementById('cart-sec-nombre');
            const phoneInput = document.getElementById('cart-sec-telefono');
            const emailInput = document.getElementById('cart-sec-email');
            const addressInput = document.getElementById('cart-sec-direccion');
            const cityInput = document.getElementById('cart-sec-ciudad');
            const notesInput = document.getElementById('cart-sec-nota');
            const errorBox = document.getElementById('cart-section-form-error');

            const n = nameInput ? nameInput.value.trim() : '';
            const t = phoneInput ? phoneInput.value.trim() : '';
            const email = emailInput ? emailInput.value.trim() : '';
            const d = addressInput ? addressInput.value.trim() : '';
            const c = cityInput ? cityInput.value.trim() : '';
            const nota = notesInput ? notesInput.value.trim() : '';

            [nameInput, phoneInput].forEach(inp => inp?.closest('.cart-input-field')?.classList.remove('is-invalid'));

            if (!n || !t) {
                if (!n) nameInput?.closest('.cart-input-field')?.classList.add('is-invalid');
                if (!t) phoneInput?.closest('.cart-input-field')?.classList.add('is-invalid');
                if (errorBox) {
                    errorBox.textContent = 'Por favor completa tu Nombre completo y Celular / WhatsApp para proceder.';
                    errorBox.style.display = 'block';
                    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                (n ? phoneInput : nameInput)?.focus();
                return;
            }

            if (errorBox) errorBox.style.display = 'none';
            window.wsClienteTemp = { nombre: n, telefono: t, email: email, direccion: d, ciudad: c, nota: nota };

            if (!isWholesale && currentCartSectionPaymentMethod === 'mp') {
                newSecBtn.disabled = true;
                const origText = newSecBtn.innerHTML;
                newSecBtn.innerHTML = '<span>Generando pago seguro... ✦</span>';
                checkoutWithMercadoPago({
                    nombre: n,
                    telefono: t,
                    email: email,
                    direccion: d,
                    ciudad: c,
                    nota: nota
                }).finally(() => {
                    newSecBtn.disabled = false;
                    newSecBtn.innerHTML = origText;
                });
            } else {
                newSecBtn.disabled = true;
                const origText = newSecBtn.innerHTML;
                newSecBtn.innerHTML = '<span>Procesando pedido... 💬</span>';
                checkout(isWholesale).finally(() => {
                    newSecBtn.disabled = false;
                    newSecBtn.innerHTML = origText;
                });
            }
        });
    }

    hydrateCustomerCheckoutFields();

    // Sidebar Fallback update (if present)
    if (itemsEl) {
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
        } else {
            itemsEl.innerHTML = cart.map((c, i) => {
                const variants = getCartVariantOptions(c);
                const currentProductIndex = getCartProductIndex(c);
                const variantSelect = variants.length ? `
                    <label class="cart-item-variant">
                        <span>Opci&oacute;n</span>
                        <select onchange="changeCartVariant(${i}, this.value)" aria-label="Cambiar opci&oacute;n de ${escapeHtml(c.name)}">
                            ${variants.map(variant => {
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
            if (totalEl) totalEl.textContent = formattedTotal;
            if (consultNoteEl) {
                consultNoteEl.textContent = hasHiddenPrices
                    ? 'Este carrito se enviará como consulta general por WhatsApp.'
                    : `Al finalizar, se registrará el pedido ${getCartOrderLabel().toLowerCase()} en el sistema.`;
            }
        }
    }
}

function openCart() {
    setCartMode(activeCartMode);
    updateCartUI();
    syncRetailPriceVisibility().then(updateCartUI);

    if (document.body?.dataset.page === 'carrito') {
        const cartSection = document.getElementById('carrito-seccion');
        if (cartSection) cartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    window.location.href = normalizeCartMode(activeCartMode) === 'wholesale'
        ? 'carrito.html?modo=mayorista'
        : 'carrito.html';
    return;

    const cartSection = document.getElementById('carrito-seccion');
    if (cartSection) {
        cartSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        cartSection.classList.remove('highlight-glow');
        void cartSection.offsetWidth;
        cartSection.classList.add('highlight-glow');
        setTimeout(() => cartSection.classList.remove('highlight-glow'), 1800);
        if (window.location.hash !== '#carrito-seccion') {
            try { history.replaceState(null, '', '#carrito-seccion'); } catch(e) {}
        }
        return;
    }

    // Si estamos en cualquier otra página, ir directamente a index.html#carrito-seccion
    window.location.href = 'carrito.html';
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

function openCatalogSearch() {
    const input = document.getElementById('catalog-search') || document.getElementById('wholesale-catalog-search');
    const target = document.getElementById('coleccion') || document.getElementById('catalogo-mayorista');

    if (!input) {
        window.location.href = 'index.html#coleccion';
        return;
    }

    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    setTimeout(() => {
        input.focus({ preventScroll: true });
        input.select?.();
    }, 360);
}

window.openCatalogSearch = openCatalogSearch;

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

    try {
        localStorage.removeItem('blyxu_wholesale_access');
    } catch (e) {}

    function hasWholesaleAuth() {
        return sessionStorage.getItem('blyxu_wholesale_access') === '1';
    }

    triggers.forEach(t => {
        t.addEventListener('click', (e) => {
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

            if (window.location.pathname.includes('mayorista.html')) {
                if (typeof launchWholesaleConfetti === 'function') launchWholesaleConfetti();
                loadProducts({ renderCatalog: true });
            } else {
                const loader = document.getElementById('brand-loader');
                if (loader) {
                    loader.classList.remove('open');
                    void loader.offsetWidth;
                    loader.classList.add('open');
                    loader.setAttribute('aria-hidden', 'false');
                }

                setTimeout(() => {
                    window.location.href = 'mayorista.html';
                }, 400);
            }
        });
    }

    const isWholesalePage = document.body?.dataset.catalogMode === 'wholesale';
    if ((isWholesalePage && sessionStorage.getItem('blyxu_just_logged_in') !== '1') || window.location.hash === '#mayorista') {
        setTimeout(() => openWholesale(), 50);
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
function ensureMercadoPagoLoadingOverlay() {
    let overlay = document.getElementById('mp-loading-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'mp-loading-overlay';
    overlay.className = 'mp-loading-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <div class="mp-loading-card" role="status" aria-live="polite">
            <div class="mp-loading-logo">
                <span>MP</span>
            </div>
            <div class="mp-loading-rings" aria-hidden="true">
                <span></span>
                <span></span>
                <span></span>
            </div>
            <p class="mp-loading-kicker">Pago seguro</p>
            <h2>Conectando con Mercado Pago</h2>
            <p class="mp-loading-copy">Estamos preparando tu pasarela. Esto puede tardar unos segundos.</p>
            <div class="mp-loading-bar"><span></span></div>
        </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
}

function showMercadoPagoLoading() {
    const overlay = ensureMercadoPagoLoadingOverlay();
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mp-loading-active');
}

function hideMercadoPagoLoading() {
    const overlay = document.getElementById('mp-loading-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mp-loading-active');
}

function getCustomerSession() {
    try {
        const session = JSON.parse(localStorage.getItem(CUSTOMER_SESSION_KEY) || 'null');
        return session && session.token && session.cliente ? session : null;
    } catch (error) {
        return null;
    }
}

function setCustomerSession(token, cliente) {
    const session = {
        token,
        cliente,
        savedAt: Date.now()
    };
    localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(session));
    renderCustomerAccountState();
    hydrateCustomerCheckoutFields();
    if (typeof updateCartUI === 'function') updateCartUI();
}

function clearCustomerSession() {
    localStorage.removeItem(CUSTOMER_SESSION_KEY);
    renderCustomerAccountState();
    if (typeof updateCartUI === 'function') updateCartUI();
}

function getCurrentCustomer() {
    return getCustomerSession()?.cliente || null;
}

function getCurrentCustomerPromotion() {
    const customer = getCurrentCustomer();
    if (!customer) {
        return { percent: 0, label: '', expires: '' };
    }

    const globalEnabled = String(getSiteConfigValue('Promo_Clientes_Enabled', 'false')).trim() === 'true';
    const globalPercent = Number(getSiteConfigValue('Promo_Clientes_Discount', '0'));
    const globalExpires = getSiteConfigValue('Promo_Clientes_Expire', '');

    if (globalEnabled && Number.isFinite(globalPercent) && globalPercent > 0) {
        if (globalExpires) {
            const expiresAt = new Date(globalExpires).getTime();
            if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
                return { percent: 0, label: '', expires: globalExpires };
            }
        }

        return {
            percent: Math.min(90, Math.max(0, globalPercent)),
            label: getSiteConfigValue('Promo_Clientes_Title', 'Promo cliente registrado'),
            expires: globalExpires
        };
    }

    const percent = Number(customer?.descuentoCliente || 0);
    if (!Number.isFinite(percent) || percent <= 0) {
        return { percent: 0, label: '', expires: '' };
    }

    if (customer.promoExpira) {
        const expiresAt = new Date(customer.promoExpira).getTime();
        if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
            return { percent: 0, label: '', expires: customer.promoExpira };
        }
    }

    return {
        percent: Math.min(90, Math.max(0, percent)),
        label: customer.promoCliente || 'Promo cliente registrado',
        expires: customer.promoExpira || ''
    };
}

function getCartPricingSummary(items = cart) {
    const subtotal = items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 1)), 0);
    const hasWholesaleItem = normalizeCartMode(activeCartMode) === 'wholesale' ||
        items.some(item => normalizeCartMode(item.mode || activeCartMode) === 'wholesale');
    const promotion = hasWholesaleItem ? { percent: 0, label: '', expires: '' } : getCurrentCustomerPromotion();
    const discount = promotion.percent > 0 ? Math.round(subtotal * (promotion.percent / 100)) : 0;
    return {
        subtotal,
        discount,
        total: Math.max(0, subtotal - discount),
        promotion
    };
}

function getProductIdentity(product, productIndex = -1) {
    return {
        idProducto: product?.idProducto || product?.['ID Producto'] || product?.Referencia || product?.referencia || product?.SKU || '',
        idVariacion: product?.idVariacion || product?.['ID Variación'] || product?.['ID Variacion'] || product?.SKU || productIndex,
        nombre: product?.Nombre || product?.nombre || product?.['Nombre del Producto'] || product?.Producto || 'Producto BLYXU',
        imagen: normalizeImageUrl(product?.Imagen || product?.imagen || product?.Foto || (product?.Galeria && product.Galeria[0]) || ''),
        precio: getProductPrice(product || {}, activeCatalogMode)
    };
}

function hydrateCustomerCheckoutFields() {
    const customer = getCurrentCustomer();
    if (!customer) return;

    const fields = [
        ['cart-sec-nombre', customer.nombre],
        ['cart-sec-telefono', customer.telefono],
        ['cart-sec-email', customer.email],
        ['cart-sec-direccion', customer.direccion],
        ['cart-sec-ciudad', customer.ciudad]
    ];

    fields.forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (input && !input.value && value) input.value = value;
    });
}

function customerAuthRequest(action, payload) {
    return fetch(GOOGLE_SHEET_API, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
            action,
            resource: 'clientes',
            ...payload
        })
    }).then(async response => {
        const text = await response.text();
        let data = null;
        try {
            data = JSON.parse(text);
        } catch (error) {
            throw new Error('No se pudo conectar con el sistema de clientes.');
        }
        if (!data || data.ok === false) {
            throw new Error(data?.error || 'No se pudo completar la solicitud.');
        }
        return data;
    });
}

async function registerCustomerAccount(cliente) {
    const registerActions = ['registrarcliente', 'registrocliente', 'customerregister'];
    let lastError = null;

    for (const action of registerActions) {
        try {
            return await customerAuthRequest(action, { cliente });
        } catch (error) {
            lastError = error;
            const message = normalizeSearchText(error.message);
            if (!message.includes('accion no reconocida') && !message.includes('action not recognized')) {
                throw error;
            }
        }
    }

    throw new Error(lastError?.message || 'No se pudo crear la cuenta.');
}

function ensureCustomerAuthModal() {
    let modal = document.getElementById('customer-auth-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'customer-auth-modal';
    modal.className = 'customer-auth-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
        <div class="customer-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="customer-auth-title">
            <button class="customer-auth-close" type="button" aria-label="Cerrar">×</button>
            <div class="customer-auth-brand">
                <img src="Logo2-nav.png" alt="BLYXU" onerror="this.style.display='none'">
                <span>Cuenta BLYXU</span>
            </div>
            <div class="customer-auth-tabs" role="tablist" aria-label="Cuenta de cliente">
                <button type="button" class="active" data-auth-view="login">Ingresar</button>
                <button type="button" data-auth-view="register">Registrarme</button>
            </div>
            <div class="customer-auth-message" id="customer-auth-message" aria-live="polite"></div>
            <div class="customer-google-box" id="customer-google-box">
                <div id="customer-google-signin" class="customer-google-signin"></div>
                <div class="customer-auth-divider"><span>o usa tu contraseña</span></div>
            </div>
            <section class="customer-auth-view active" data-auth-panel="login">
                <h2 id="customer-auth-title">Iniciar sesión</h2>
                <form id="customer-login-form" class="customer-auth-form">
                    <label>
                        <span>Correo o celular</span>
                        <input type="text" name="usuario" autocomplete="username" required>
                    </label>
                    <label>
                        <span>Contraseña</span>
                        <input type="password" name="password" autocomplete="current-password" required>
                    </label>
                    <button type="submit">Entrar a mi cuenta</button>
                </form>
            </section>
            <section class="customer-auth-view" data-auth-panel="register">
                <h2>Crear cuenta</h2>
                <form id="customer-register-form" class="customer-auth-form">
                    <label>
                        <span>Nombre completo</span>
                        <input type="text" name="nombre" autocomplete="name" required>
                    </label>
                    <label>
                        <span>Celular / WhatsApp</span>
                        <input type="tel" name="telefono" autocomplete="tel" required>
                    </label>
                    <label>
                        <span>Correo electrónico</span>
                        <input type="email" name="email" autocomplete="email" required>
                    </label>
                    <div class="customer-auth-row">
                        <label>
                            <span>Dirección</span>
                            <input type="text" name="direccion" autocomplete="street-address">
                        </label>
                        <label>
                            <span>Ciudad</span>
                            <input type="text" name="ciudad" autocomplete="address-level2">
                        </label>
                    </div>
                    <label>
                        <span>Contraseña</span>
                        <input type="password" name="password" autocomplete="new-password" minlength="6" required>
                    </label>
                    <button type="submit">Crear mi cuenta</button>
                </form>
            </section>
            <section class="customer-auth-view" data-auth-panel="profile">
                <h2>Mi cuenta</h2>
                <div class="customer-profile-card" id="customer-profile-card"></div>
                <div class="customer-dashboard-tabs" role="tablist" aria-label="Panel de cliente">
                    <button type="button" class="active" data-customer-dashboard-tab="orders">Mis pedidos</button>
                    <button type="button" data-customer-dashboard-tab="invoices">Facturas</button>
                    <button type="button" data-customer-dashboard-tab="favorites">Favoritos</button>
                </div>
                <div class="customer-dashboard-panel active" id="customer-dashboard-orders">
                    <div class="customer-dashboard-list" id="customer-orders-list">
                        <div class="customer-dashboard-empty">Cargando pedidos...</div>
                    </div>
                </div>
                <div class="customer-dashboard-panel" id="customer-dashboard-invoices">
                    <div class="customer-dashboard-list" id="customer-invoices-list">
                        <div class="customer-dashboard-empty">Cargando facturas...</div>
                    </div>
                </div>
                <div class="customer-dashboard-panel" id="customer-dashboard-favorites">
                    <div class="customer-dashboard-list" id="customer-favorites-list">
                        <div class="customer-dashboard-empty">Cargando favoritos...</div>
                    </div>
                </div>
                <button type="button" class="customer-auth-secondary" id="customer-logout-btn">Cerrar sesión</button>
            </section>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', event => {
        if (event.target === modal || event.target.closest('.customer-auth-close')) {
            closeCustomerAuthModal();
        }
    });

    modal.querySelectorAll('[data-auth-view]').forEach(button => {
        button.addEventListener('click', () => setCustomerAuthView(button.dataset.authView));
    });

    modal.querySelector('#customer-login-form')?.addEventListener('submit', handleCustomerLoginSubmit);
    modal.querySelector('#customer-register-form')?.addEventListener('submit', handleCustomerRegisterSubmit);
    modal.querySelector('#customer-logout-btn')?.addEventListener('click', handleCustomerLogout);
    modal.querySelectorAll('[data-customer-dashboard-tab]').forEach(button => {
        button.addEventListener('click', () => setCustomerDashboardTab(button.dataset.customerDashboardTab));
    });

    return modal;
}

function setCustomerAuthMessage(message, type = '') {
    const box = document.getElementById('customer-auth-message');
    if (!box) return;
    box.textContent = message || '';
    box.className = `customer-auth-message ${type}`.trim();
    box.style.display = message ? 'block' : 'none';
}

function setCustomerAuthView(view) {
    const modal = ensureCustomerAuthModal();
    modal.classList.toggle('is-profile-view', view === 'profile');
    modal.querySelectorAll('[data-auth-view]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.authView === view);
    });
    modal.querySelectorAll('[data-auth-panel]').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.authPanel === view);
    });
    setCustomerAuthMessage('');
}

function renderCustomerProfile() {
    const customer = getCurrentCustomer();
    const card = document.getElementById('customer-profile-card');
    if (!card || !customer) return;
    const promotion = getCurrentCustomerPromotion();

    card.innerHTML = `
        <strong>${escapeHtml(customer.nombre || 'Cliente BLYXU')}</strong>
        <span>${escapeHtml(customer.email || '')}</span>
        <span>${escapeHtml(customer.telefono || '')}</span>
        ${customer.direccion || customer.ciudad ? `<small>${escapeHtml([customer.direccion, customer.ciudad].filter(Boolean).join(', '))}</small>` : ''}
        ${promotion.percent > 0 ? `<div class="customer-promo-badge"><b>-${promotion.percent}%</b><span>${escapeHtml(promotion.label)}</span></div>` : ''}
    `;
}

function getCustomerOrderItemImage(item) {
    const directImage = normalizeImageUrl(item?.imagen || item?.img || item?.Imagen || item?.image || item?.foto || '');
    if (directImage) return directImage;

    const itemSku = String(item?.sku || item?.SKU || item?.idVariacion || item?.id || '').trim();
    const itemName = normalizeSearchText(item?.nombre || item?.Nombre || item?.Producto || '');
    const match = (allProducts || []).find(product => {
        const identity = getProductIdentity(product);
        const productSku = String(identity.idVariacion || product?.SKU || '').trim();
        return (itemSku && productSku && productSku === itemSku) ||
            (itemName && normalizeSearchText(identity.nombre) === itemName);
    });

    return match ? normalizeImageUrl(match.Imagen || match.imagen || match.Foto || (match.Galeria && match.Galeria[0]) || '') : '';
}

function setCustomerDashboardTab(tab = 'orders') {
    const modal = ensureCustomerAuthModal();
    modal.querySelectorAll('[data-customer-dashboard-tab]').forEach(button => {
        button.classList.toggle('active', button.dataset.customerDashboardTab === tab);
    });
    const ordersPanel = document.getElementById('customer-dashboard-orders');
    const invoicesPanel = document.getElementById('customer-dashboard-invoices');
    const favoritesPanel = document.getElementById('customer-dashboard-favorites');
    ordersPanel?.classList.toggle('active', tab === 'orders');
    invoicesPanel?.classList.toggle('active', tab === 'invoices');
    favoritesPanel?.classList.toggle('active', tab === 'favorites');
}

function formatCustomerDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return String(value);
    return date.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: '2-digit' });
}

function renderCustomerOrdersList(orders = []) {
    const list = document.getElementById('customer-orders-list');
    if (!list) return;

    if (!orders.length) {
        list.innerHTML = '<div class="customer-dashboard-empty">Todavia no tienes pedidos registrados.</div>';
        return;
    }

    list.innerHTML = orders.map(order => {
        const products = Array.isArray(order.productos) ? order.productos : [];
        const productText = products.length
            ? products.slice(0, 3).map(item => `${escapeHtml(item.nombre || 'Producto')} x${Number(item.cantidad || 1)}`).join(', ')
            : 'Productos del pedido';
        const previews = products.slice(0, 4);
        return `
            <article class="customer-order-card">
                <div>
                    <strong>${escapeHtml(order.id || 'Pedido')}</strong>
                    <span>${escapeHtml(formatCustomerDate(order.fecha))}</span>
                </div>
                ${previews.length ? `<div class="customer-order-products">
                    ${previews.map(item => `
                        <span class="customer-order-product-thumb" title="${escapeHtml(item.nombre || 'Producto')}">
                            ${getCustomerOrderItemImage(item) ? `<img src="${escapeHtml(getCustomerOrderItemImage(item))}" alt="${escapeHtml(item.nombre || 'Producto')}">` : '<em>?</em>'}
                            <b>${Number(item.cantidad || 1)}</b>
                        </span>
                    `).join('')}
                    ${products.length > previews.length ? `<span class="customer-order-more">+${products.length - previews.length}</span>` : ''}
                </div>` : ''}
                <p>${productText}${products.length > 3 ? '...' : ''}</p>
                <footer>
                    <span>${escapeHtml(order.estado || 'Pendiente')}</span>
                    <b>${formatMoney(Number(order.total || 0))}</b>
                </footer>
            </article>
        `;
    }).join('');
}

function renderCustomerInvoicesList(invoices = []) {
    const list = document.getElementById('customer-invoices-list');
    if (!list) return;

    if (!invoices.length) {
        list.innerHTML = '<div class="customer-dashboard-empty">Todavia no tienes facturas registradas.</div>';
        return;
    }

    list.innerHTML = invoices.map(invoice => {
        const products = Array.isArray(invoice.productos) ? invoice.productos : [];
        const productText = products.length
            ? products.slice(0, 3).map(item => `${escapeHtml(item.nombre || 'Producto')} x${Number(item.cantidad || 1)}`).join(', ')
            : 'Detalle de factura';
        const balance = Number(invoice.saldoPendiente || 0);
        const invoiceLookup = encodeURIComponent(invoice.id || invoice.pedidoId || '');
        const previews = products.slice(0, 4);
        return `
            <article class="customer-order-card customer-invoice-card">
                <div>
                    <strong>${escapeHtml(invoice.id || 'Factura')}</strong>
                    <span>${escapeHtml(formatCustomerDate(invoice.fecha))}</span>
                </div>
                ${previews.length ? `<div class="customer-order-products">
                    ${previews.map(item => `
                        <span class="customer-order-product-thumb" title="${escapeHtml(item.nombre || 'Producto')}">
                            ${getCustomerOrderItemImage(item) ? `<img src="${escapeHtml(getCustomerOrderItemImage(item))}" alt="${escapeHtml(item.nombre || 'Producto')}">` : '<em>?</em>'}
                            <b>${Number(item.cantidad || 1)}</b>
                        </span>
                    `).join('')}
                    ${products.length > previews.length ? `<span class="customer-order-more">+${products.length - previews.length}</span>` : ''}
                </div>` : ''}
                <p>${productText}${products.length > 3 ? '...' : ''}</p>
                <footer>
                    <span>${escapeHtml(invoice.estado || (balance > 0 ? 'Pendiente' : 'Pagada'))}</span>
                    <b>${formatMoney(Number(invoice.total || 0))}</b>
                </footer>
                <div class="customer-invoice-balance">
                    <span>Abonado: ${formatMoney(Number(invoice.valorAbonado || 0))}</span>
                    <strong>Saldo: ${formatMoney(balance)}</strong>
                </div>
                <a class="customer-dashboard-link" href="facturas-pedidos.html${invoiceLookup ? `?buscar=${invoiceLookup}` : ''}">Ver / guardar PDF</a>
            </article>
        `;
    }).join('');
}

function renderCustomerFavoritesList(favorites = []) {
    const list = document.getElementById('customer-favorites-list');
    if (!list) return;

    if (!favorites.length) {
        list.innerHTML = '<div class="customer-dashboard-empty">Aun no has guardado favoritos.</div>';
        return;
    }

    list.innerHTML = favorites.map(item => {
        const productIndex = findProductIndexForFavorite(item);
        const href = productIndex >= 0 ? `producto.html?id=${productIndex}` : 'index.html#coleccion';
        return `
            <article class="customer-favorite-card">
                <a href="${href}">
                    ${item.imagen ? `<img src="${escapeHtml(item.imagen)}" alt="">` : '<span class="customer-favorite-empty">?</span>'}
                    <div>
                        <strong>${escapeHtml(item.nombre || 'Producto BLYXU')}</strong>
                        <span>${item.precio ? formatMoney(Number(item.precio)) : 'Ver producto'}</span>
                    </div>
                </a>
                <button type="button" onclick="removeCustomerFavorite('${escapeHtml(item.idFavorito || '')}')">Quitar</button>
            </article>
        `;
    }).join('');
}

function findProductIndexForFavorite(favorite) {
    return allProducts.findIndex(product => {
        const identity = getProductIdentity(product);
        return (favorite.idVariacion && String(identity.idVariacion) === String(favorite.idVariacion)) ||
            (favorite.idProducto && String(identity.idProducto) === String(favorite.idProducto)) ||
            (favorite.nombre && normalizeSearchText(identity.nombre) === normalizeSearchText(favorite.nombre));
    });
}

async function loadCustomerDashboard() {
    const session = getCustomerSession();
    if (!session?.token) return;

    renderCustomerOrdersList([]);
    renderCustomerInvoicesList([]);
    renderCustomerFavoritesList([]);

    const ordersList = document.getElementById('customer-orders-list');
    const invoicesList = document.getElementById('customer-invoices-list');
    const favoritesList = document.getElementById('customer-favorites-list');
    if (ordersList) ordersList.innerHTML = '<div class="customer-dashboard-empty">Cargando pedidos...</div>';
    if (invoicesList) invoicesList.innerHTML = '<div class="customer-dashboard-empty">Cargando facturas...</div>';
    if (favoritesList) favoritesList.innerHTML = '<div class="customer-dashboard-empty">Cargando favoritos...</div>';

    const [ordersResult, invoicesResult, favoritesResult] = await Promise.allSettled([
        customerAuthRequest('pedidoscliente', { token: session.token }),
        customerAuthRequest('facturascliente', { token: session.token }),
        customerAuthRequest('favoritoscliente', { token: session.token })
    ]);

    if (ordersResult.status === 'fulfilled') {
        renderCustomerOrdersList(ordersResult.value.orders || []);
    } else if (ordersList) {
        ordersList.innerHTML = `<div class="customer-dashboard-empty">${escapeHtml(ordersResult.reason?.message || 'No se pudieron cargar tus pedidos.')}</div>`;
    }

    if (invoicesResult.status === 'fulfilled') {
        renderCustomerInvoicesList(invoicesResult.value.invoices || []);
    } else if (invoicesList) {
        const message = normalizeSearchText(invoicesResult.reason?.message).includes('accion no reconocida')
            ? 'Actualiza el Apps Script para activar tus facturas en Mi cuenta.'
            : (invoicesResult.reason?.message || 'No se pudieron cargar tus facturas.');
        invoicesList.innerHTML = `<div class="customer-dashboard-empty">${escapeHtml(message)}</div>`;
    }

    if (favoritesResult.status === 'fulfilled') {
        renderCustomerFavoritesList(favoritesResult.value.favorites || []);
    } else if (favoritesList) {
        favoritesList.innerHTML = `<div class="customer-dashboard-empty">${escapeHtml(favoritesResult.reason?.message || 'No se pudieron cargar tus favoritos.')}</div>`;
    }
}

async function saveCustomerFavorite(productIndex, sourceButton = null) {
    const session = getCustomerSession();
    if (!session?.token) {
        openCustomerAuthModal('login');
        setCustomerAuthMessage('Inicia sesion para guardar productos favoritos.', 'error');
        return;
    }

    const product = allProducts[Number(productIndex)];
    if (!product) return;

    const btn = sourceButton || null;
    const previousText = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.classList.add('is-saving');
    }

    try {
        await customerAuthRequest('guardarfavorito', {
            token: session.token,
            producto: getProductIdentity(product, Number(productIndex))
        });
        if (btn) {
            btn.classList.add('is-saved');
            btn.setAttribute('aria-label', 'Guardado en favoritos');
            btn.title = 'Guardado en favoritos';
        }
        setCustomerAuthMessage('');
    } catch (error) {
        openCustomerAuthModal('profile');
        setCustomerAuthMessage(error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('is-saving');
            if (previousText && btn.textContent !== previousText) btn.textContent = previousText;
        }
    }
}

async function removeCustomerFavorite(idFavorito) {
    const session = getCustomerSession();
    if (!session?.token) return;
    try {
        await customerAuthRequest('quitarfavorito', {
            token: session.token,
            idFavorito
        });
        loadCustomerDashboard();
    } catch (error) {
        setCustomerAuthMessage(error.message, 'error');
    }
}

window.saveCustomerFavorite = saveCustomerFavorite;
window.removeCustomerFavorite = removeCustomerFavorite;

function openCustomerAuthModal(view) {
    const modal = ensureCustomerAuthModal();
    const session = getCustomerSession();
    const hasSession = Boolean(session);
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('customer-auth-open');
    setCustomerAuthView(view || (hasSession ? 'profile' : 'login'));
    renderCustomerProfile();
    if (hasSession) {
        customerAuthRequest('perfilcliente', { token: session.token })
            .then(data => {
                setCustomerSession(session.token, data.cliente);
                renderCustomerProfile();
            })
            .catch(() => clearCustomerSession())
            .finally(loadCustomerDashboard);
    }
}

function closeCustomerAuthModal() {
    const modal = document.getElementById('customer-auth-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('customer-auth-open');
}

async function handleCustomerLoginSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = form.elements;
    const submit = form.querySelector('button[type="submit"]');
    const originalText = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'Ingresando...';
    setCustomerAuthMessage('');

    try {
        const data = await customerAuthRequest('logincliente', {
            usuario: fields.usuario.value.trim(),
            password: fields.password.value
        });
        setCustomerSession(data.token, data.cliente);
        setCustomerAuthMessage('Sesión iniciada correctamente.', 'success');
        setCustomerAuthView('profile');
        renderCustomerProfile();
        loadCustomerDashboard();
    } catch (error) {
        setCustomerAuthMessage(error.message, 'error');
    } finally {
        submit.disabled = false;
        submit.textContent = originalText;
    }
}

async function handleCustomerRegisterSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = form.elements;
    const submit = form.querySelector('button[type="submit"]');
    const originalText = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'Creando cuenta...';
    setCustomerAuthMessage('');

    try {
        const data = await registerCustomerAccount({
            nombre: fields.nombre.value.trim(),
            telefono: fields.telefono.value.trim(),
            email: fields.email.value.trim(),
            direccion: fields.direccion.value.trim(),
            ciudad: fields.ciudad.value.trim(),
            password: fields.password.value
        });
        setCustomerSession(data.token, data.cliente);
        setCustomerAuthMessage('Cuenta creada correctamente.', 'success');
        setCustomerAuthView('profile');
        renderCustomerProfile();
        loadCustomerDashboard();
    } catch (error) {
        const message = normalizeSearchText(error.message).includes('accion no reconocida')
            ? 'El registro de clientes necesita actualizar el Apps Script publicado. Ya deje el codigo corregido para reconocer esta accion.'
            : error.message;
        setCustomerAuthMessage(message, 'error');
    } finally {
        submit.disabled = false;
        submit.textContent = originalText;
    }
}

async function handleCustomerLogout() {
    const session = getCustomerSession();
    clearCustomerSession();
    closeCustomerAuthModal();
    if (session?.token) {
        customerAuthRequest('cerrarsesion', { token: session.token }).catch(() => {});
    }
}

function renderCustomerAccountState() {
    const button = document.getElementById('customer-account-btn');
    if (!button) return;
    const customer = getCurrentCustomer();
    const label = button.querySelector('.customer-account-label');
    const initial = button.querySelector('.customer-account-initial');
    button.classList.toggle('is-logged', Boolean(customer));
    button.setAttribute('aria-label', customer ? 'Ver mi cuenta BLYXU' : 'Iniciar sesión o registrarme');
    if (label) label.textContent = customer ? 'Mi cuenta' : 'Cuenta';
    if (initial) initial.textContent = customer?.nombre ? customer.nombre.trim().charAt(0).toUpperCase() : '';
}

function initCustomerAuth() {
    const navActions = document.querySelector('.nav-actions');
    if (navActions && !document.getElementById('customer-account-btn')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'customer-account-btn';
        button.className = 'customer-account-btn';
        button.innerHTML = `
            <span class="customer-account-initial"></span>
            <svg class="customer-account-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21a8 8 0 0 0-16 0"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span class="customer-account-label">Cuenta</span>
        `;
        button.addEventListener('click', () => openCustomerAuthModal());
        const cartBtn = document.getElementById('cart-btn');
        navActions.insertBefore(button, cartBtn || navActions.firstChild);
    }

    renderCustomerAccountState();
    hydrateCustomerCheckoutFields();

    const session = getCustomerSession();
    if (session?.token) {
        customerAuthRequest('perfilcliente', { token: session.token })
            .then(data => {
                setCustomerSession(session.token, data.cliente);
                if (document.getElementById('customer-auth-modal')?.classList.contains('open')) {
                    renderCustomerProfile();
                    loadCustomerDashboard();
                }
            })
            .catch(() => clearCustomerSession());
    }
}

async function checkoutWithMercadoPago(cliente, options = {}) {
    const checkoutItems = Array.isArray(options.items) && options.items.length ? options.items : cart;
    if (!checkoutItems.length) return;
    const shouldClearCart = options.clearCart !== false;
    const pricingSummary = getCartPricingSummary(checkoutItems);
    const total = pricingSummary.total;
    const customerSession = getCustomerSession();
    const formContainer = document.getElementById('cart-wholesale-form');
    showMercadoPagoLoading();
    
    if (formContainer) {
        formContainer.innerHTML = `
            <div class="cart-customer-card cart-registering">
                <div class="cart-loading-track"><span></span></div>
                <h4>Conectando con Mercado Pago...</h4>
                <p>Generando pasarela de pago seguro. Un momento por favor.</p>
            </div>
        `;
    }

    const payload = {
        action: 'createpreference',
        resource: 'pedidos',
        customerType: 'Detal',
        mode: 'retail',
        token: customerSession?.token || '',
        cliente: {
            nombre: cliente.nombre,
            telefono: cliente.telefono,
            email: cliente.email || '',
            direccion: cliente.direccion || '',
            ciudad: cliente.ciudad || '',
            nota: cliente.nota || ''
        },
        items: checkoutItems.map(item => ({
            idVariacion: item.idVariacion || item.sku || item.name,
            nombre: item.name,
            opcion: item.variantLabel || '',
            cantidad: item.qty,
            precio: item.price,
            img: item.img || ''
        })),
        total: total,
        origin: window.location.origin
    };

    try {
        const response = await fetch(GOOGLE_SHEET_API, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result && result.ok && result.init_point) {
            if (shouldClearCart) {
                cart = [];
                saveCart('retail');
                updateCartUI();
            }

            // Redirigir a Mercado Pago
            window.location.href = result.sandbox_init_point || result.init_point;
            return;
        }

        throw new Error(result?.error || result?.message || 'No se pudo generar la pasarela de pago.');
    } catch (error) {
        hideMercadoPagoLoading();
        console.error('Error al conectar con Mercado Pago:', error);
        const secErrorBox = document.getElementById('cart-section-form-error');
        if (secErrorBox) {
            secErrorBox.innerHTML = `⚠️ <strong>Error en pasarela:</strong> ${escapeHtml(error.message || 'No se pudo generar el pago con Mercado Pago.')}<br><small style="margin-top:4px; display:inline-block;">Puedes seleccionar <strong>WhatsApp Directo</strong> para finalizar tu pedido con un asesor.</small>`;
            secErrorBox.style.display = 'block';
            secErrorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (formContainer) {
            formContainer.innerHTML = `
                <div class="cart-customer-card cart-error-card">
                    <div style="font-size:32px; margin-bottom:12px;">⚠️</div>
                    <h4 style="color:#ef4444;">Error en la pasarela</h4>
                    <p>${escapeHtml(error.message || 'Error al conectar con Mercado Pago. Intenta nuevamente.')}</p>
                    <button class="btn-checkout" onclick="updateCartUI()" style="margin-top:16px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2);">Reintentar</button>
                </div>
            `;
        }
    }
}

function buyNowWithMercadoPago(productIndex, sourceButton, mode = activeCatalogMode) {
    const normalizedMode = normalizeCartMode(mode);
    if (normalizedMode === 'wholesale') {
        alert('Mercado Pago está disponible solo para compras del catálogo minorista.');
        return;
    }

    const product = allProducts[Number(productIndex)];
    if (!product) {
        alert('No se encontró el producto seleccionado.');
        return;
    }

    if (getProductStock(product) <= 0) {
        alert('Este producto está agotado por ahora.');
        return;
    }

    if (!shouldShowProductPrices('retail')) {
        alert('Este producto está disponible para consulta por WhatsApp.');
        return;
    }

    const item = getCartItemFromProduct(product, 'retail', 1);
    if (!item || !item.price || item.price <= 0) {
        alert('Este producto no tiene precio disponible para pago en línea.');
        return;
    }

    const btn = sourceButton || null;
    const previousHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Generando pago seguro...';
    }

    const customer = getCurrentCustomer();
    checkoutWithMercadoPago({
        nombre: customer?.nombre || 'Cliente Minorista',
        telefono: customer?.telefono || '',
        email: customer?.email || '',
        direccion: customer?.direccion || '',
        ciudad: customer?.ciudad || '',
        nota: 'Compra directa desde ficha de producto'
    }, {
        items: [item],
        clearCart: false
    }).finally(() => {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = previousHtml;
        }
    });
}

async function saveOrderToGoogleSheets(cliente, total, customerType = getCartCustomerType()) {
    const normalizedType = customerType === 'Mayor' ? 'Mayor' : 'Detal';
    const orderLabel = normalizedType === 'Mayor' ? 'Mayorista' : 'Detal';
    const pricingSummary = getCartPricingSummary(cart);
    const promotion = pricingSummary.promotion;
    const productos = cart.map(item => ({
        idVariacion: item.idVariacion || item.sku || item.name,
        id: item.idVariacion || item.sku || item.name,
        nombre: item.name,
        opcion: item.variantLabel || '',
        cantidad: item.qty,
        precioOriginal: item.price,
        precio: promotion.percent > 0 ? Math.max(0, Math.round(item.price * (1 - promotion.percent / 100))) : item.price,
        subtotal: (promotion.percent > 0 ? Math.max(0, Math.round(item.price * (1 - promotion.percent / 100))) : item.price) * item.qty,
        descuentoCliente: promotion.percent || '',
        promoCliente: promotion.label || '',
        sku: item.sku || '',
        img: item.img || '',
        imagen: item.img || '',
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
        'Subtotal': pricingSummary.total,
        'Estado Pedido': 'Pendiente',
        'Metodo Contacto': `Sistema ${orderLabel}`,
        'Nota Cliente': [cliente.nota || '', promotion.percent > 0 ? `Promo cliente registrado: ${promotion.label} (-${promotion.percent}%)` : ''].filter(Boolean).join(' | ')
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
    const total = getCartPricingSummary(cart).total;
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
    cleanBrowserUrl();
    window.addEventListener('hashchange', cleanBrowserUrl);
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
    initCustomerAuth();
    const isProductDetailPage = Boolean(document.getElementById('product-detail'));
    const isContactPage = document.body?.dataset.page === 'contact';
    const isPaymentsPage = document.body?.dataset.page === 'pagos';
    const isOrdersLookupPage = document.body?.dataset.page === 'facturas-pedidos';
    const isCartPage = document.body?.dataset.page === 'carrito';
    const isWholesalePage = document.body?.dataset.catalogMode === 'wholesale';
    
    const hasWholesaleAccess = localStorage.getItem('blyxu_wholesale_access') === '1' || sessionStorage.getItem('blyxu_wholesale_access') === '1';
    
    if (isWholesalePage && !hasWholesaleAccess) {
        const overlay = document.getElementById('wholesale-overlay');
        if (overlay && typeof window.openWholesaleOverlay === 'function') {
            window.openWholesaleOverlay();
        } else {
            window.location.replace('index.html#mayorista');
            return;
        }
    }

    renderFloatingWhatsApp();
    
    if (isWholesalePage && sessionStorage.getItem('blyxu_just_logged_in') === '1') {
        sessionStorage.removeItem('blyxu_just_logged_in');
        
        const loader = document.getElementById('brand-loader');
        if (loader) {
            loader.classList.add('open');
            loader.setAttribute('aria-hidden', 'false');
            
            setTimeout(() => {
                loader.classList.remove('open');
                loader.setAttribute('aria-hidden', 'true');
                if (typeof launchWholesaleConfetti === 'function') launchWholesaleConfetti();
            }, 600);
        } else {
            if (typeof launchWholesaleConfetti === 'function') launchWholesaleConfetti();
        }
    } else {
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
        loadProducts({ renderCatalog: !isProductDetailPage && !isCartPage }).then(() => {
            renderFloatingWhatsApp();
            renderFooterSocialLinks();
            renderPromoWidget();
            if (isCartPage) updateCartUI();
        });
    }
    updateCartUI();

    // Cart events
    document.getElementById('cart-btn')?.addEventListener('click', openCart);
    document.getElementById('cart-overlay')?.addEventListener('click', closeCart);
    document.getElementById('cart-close')?.addEventListener('click', closeCart);

    // Auto-scroll si el hash es #carrito-seccion
    const handleCartHashNavigation = () => {
        if (window.location.hash === '#carrito-seccion' || window.location.hash === '#carrito') {
            if (document.body?.dataset.page !== 'carrito') {
                window.location.replace('carrito.html');
                return;
            }
            const sec = document.getElementById('carrito-seccion');
            if (sec) {
                sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
                sec.classList.remove('highlight-glow');
                void sec.offsetWidth;
                sec.classList.add('highlight-glow');
                setTimeout(() => sec.classList.remove('highlight-glow'), 1800);
            }
        }
    };
    window.addEventListener('hashchange', handleCartHashNavigation);
    setTimeout(handleCartHashNavigation, 400);

    // Hero sizes interaction
    document.querySelectorAll('.hero-sizes span').forEach(s => {
        s.addEventListener('click', () => {
            document.querySelectorAll('.hero-sizes span').forEach(x => x.classList.remove('active'));
            s.classList.add('active');
        });
    });
});









