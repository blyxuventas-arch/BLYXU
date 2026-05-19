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

// Columnas esperadas en tu Google Sheet:
// Nombre | Categoria | Catalogo | Precio | Precio_Mayorista | Stock | Imagen | Color | Descripcion

// -- STATE --
let allProducts = [];
let cart = JSON.parse(localStorage.getItem('blyxu_cart') || '[]');
let activeFilter = 'todos';
let productsLoadPromise = null;
let bannerProducts = [];
let productsLoadError = '';
const RETAIL_PRICE_VISIBILITY_KEY = 'blyxu_show_retail_prices';
const RETAIL_PRICE_CONFIG_KEY = 'Mostrar_Precios_Minorista';
const PRODUCTS_CACHE_KEY = 'blyxu_products_cache_v1';
const SITE_CONFIG_CACHE_KEY = 'blyxu_site_config_cache_v1';
const CATALOG_BATCH_SIZE = 12;
let activeCatalogMode = 'retail';
let showRetailPrices = localStorage.getItem(RETAIL_PRICE_VISIBILITY_KEY) !== '0';
let siteConfig = {};
let configLoadPromise = null;
let catalogRenderToken = 0;
let catalogBatchState = null;
let activeSearchQuery = '';
let heroProductCarouselTimer = null;
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

// -- NAVBAR --
function initNavbar() {
    const navbar = document.getElementById('navbar');
    const toggle = document.getElementById('nav-toggle');
    const navLinks = document.getElementById('nav-links');

    window.addEventListener('scroll', () => {
        if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 50);
    });

    if (toggle && navLinks) {
        toggle.addEventListener('click', () => {
            toggle.classList.toggle('open');
            navLinks.classList.toggle('open');
        });
        navLinks.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', () => {
                toggle.classList.remove('open');
                navLinks.classList.remove('open');
            });
        });
    }
}

// -- SCROLL REVEAL --
function initReveal() {
    const revealItems = document.querySelectorAll('.reveal');
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
        Categoria: getProductField(product, ['Categor\u00eda', 'Categoria', 'Categoría', 'categoria'], ''),
        Precio: getProductField(product, ['Precio', 'precio'], 0),
        Precio_Mayorista: getProductField(product, ['Precio Mayor', 'Precio Mayorista', 'Precio_Mayorista', 'precio_mayorista', 'Mayorista'], 0),
        Stock: getProductField(product, ['Cantidad', 'Stock', 'stock', 'Stock Inicial'], 0),
        Imagen: imageUrl,
        Galeria: galeria,
        Color: getProductField(product, ['Color', 'Color ', 'color'], ''),
        Tamano: getProductField(product, ['Tama\u00f1o', 'Tamano', 'Tamaño', 'tamano'], ''),
        Estilo: getProductField(product, ['Estilo', 'estilo'], ''),
        Descripcion: getProductField(product, ['Caracter\u00edsticas del producto', 'Caracteristicas del producto', 'Características del producto', 'Caractreristicas del producto', 'Descripcion', 'descripcion'], ''),
        SKU: getProductField(product, ['SKU', 'sku'], ''),
        Estado: getProductField(product, ['Estado', 'estado'], 'Activo')
    };
}
function isActiveProduct(product) {
    const estado = String(getProductField(product, ['Estado', 'estado'], 'Activo')).toLowerCase();
    return !estado || estado === 'activo' || estado === 'disponible';
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

function scoreProductSearch(product, query) {
    const q = normalizeSearchText(query);
    if (!q) return 1;

    const terms = q.split(/\s+/).filter(Boolean);
    const name = normalizeSearchText(product.Nombre);
    const category = normalizeSearchText(product.Categoria);
    const sku = normalizeSearchText(product.SKU || product.idVariacion);
    const blob = productSearchBlob(product);

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

function applySmartProductSearch(products) {
    const q = normalizeSearchText(activeSearchQuery);
    if (!q) return products;

    return products
        .map(product => ({ product, score: scoreProductSearch(product, q) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(item => item.product);
}

// -- LOAD PRODUCTS FROM GOOGLE SHEETS --
async function loadProducts(options = {}) {
    const { renderCatalog = true, useCache = true } = options;
    const usedProductCache = useCache && allProducts.length === 0 && hydrateProductsFromCache();

    if (useCache && Object.keys(siteConfig).length === 0) {
        hydrateSiteConfigFromCache();
    }

    if (renderCatalog && usedProductCache) {
        renderBanners(bannerProducts);
        renderInventorySpotlight();
        renderCatalogProducts();
    }

    if (!productsLoadPromise) {
        productsLoadPromise = fetchProducts({ showLoading: !usedProductCache && renderCatalog });
    }
    if (!configLoadPromise) {
        configLoadPromise = fetchSiteConfig();
    }

    if (usedProductCache) {
        Promise.all([productsLoadPromise, configLoadPromise]).then(() => {
            if (renderCatalog) {
                renderBanners(bannerProducts);
                renderInventorySpotlight();
                renderCatalogProducts();
            }
        });
        return allProducts;
    }

    if (renderCatalog) {
        await Promise.all([productsLoadPromise, configLoadPromise]);
        renderBanners(bannerProducts);
        renderInventorySpotlight();
        renderCatalogProducts();
    } else {
        await productsLoadPromise;
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
        return `
            <article class="hero-carousel-slide product-glass-card ${index === 0 ? 'active' : ''}" data-detail-url="${escapeHtml(details.detailUrl)}">
                <div class="product-glass-media ${toneClass}">
                    <img src="${escapeHtml(details.image)}" alt="${escapeHtml(details.name)}" loading="lazy" onerror="this.style.display='none'; this.parentElement.classList.add('is-fallback')">
                    <span class="product-glass-badge">${escapeHtml(details.category)}</span>
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
        return `<div class="marquee-item" onclick="window.location.href='${escapeHtml(detailUrl)}'" title="${escapeHtml(p.Nombre || '')}">
                    <img src="${escapeHtml(img)}" alt="${escapeHtml(p.Nombre || '')}" loading="lazy" onerror="this.parentElement.style.display='none'">
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
            const res = await fetch(GOOGLE_SHEET_PRODUCTS_URL);
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
        const url = `${GOOGLE_SHEET_API}?action=get_config`;
        const res = await fetch(url);
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

// -- RENDER BANNERS --
function renderBanners(banners) {
    const track = document.getElementById('main-banner-track');
    const nav = document.getElementById('main-banner-nav');
    if (!track) return;
    
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
            <img src="${b.Imagen || b.imagen || 'hero_necklace.png'}" alt="Banner" style="filter: brightness(0.6);" onerror="this.src='hero_necklace.png'">
            <div class="main-banner-overlay"></div>
            <div class="main-banner-content">
                <h1 class="main-banner-title">${b.Nombre || b.nombre || ''}</h1>
                <p class="main-banner-desc">${b.Descripcion || b.Color || 'Descubre nuestras \u00faltimas colecciones'}</p>
                <a href="#coleccion" class="main-banner-btn">Explorar Colecci\u00f3n</a>
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
    if (totalSlides <= 1) {
        document.getElementById('banner-prev').style.display = 'none';
        document.getElementById('banner-next').style.display = 'none';
        return;
    }

    const track = document.getElementById('main-banner-track');
    const prevBtn = document.getElementById('banner-prev');
    const nextBtn = document.getElementById('banner-next');
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

    setInterval(() => {
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
        const explicitWholesale = allProducts.filter(p => {
            const scope = getCatalogScope(p);
            return scope && (scope.includes('mayorista') || scope.includes('ambos') || scope.includes('wholesale'));
        });
        return explicitWholesale.length ? explicitWholesale : allProducts;
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

function renderCategoryFilters(products) {
    const select = document.getElementById('catalog-category-select');
    if (!select) return;

    const categories = getCatalogCategories(products);
    const activeCategory = activeFilter === 'todos' ? '' : categories.find(cat => isSameCategory(cat, activeFilter));
    if (activeFilter !== 'todos' && !activeCategory) activeFilter = 'todos';

    if (select) {
        select.innerHTML = [
            '<option value="todos">Todas las categor\u00edas</option>',
            ...categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
        ].join('');
        select.value = activeFilter === 'todos' ? 'todos' : (activeCategory || 'todos');
        select.onchange = () => setFilter(select.value);
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

// -- RENDER PRODUCTS --
function renderProducts(products, options = {}) {
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    const { featuredFirst = !document.getElementById('product-detail'), mode = activeCatalogMode } = options;
    const showPrices = shouldShowProductPrices(mode);
    const renderToken = ++catalogRenderToken;

    const filteredByCategory = activeFilter === 'todos' ? products :
        products.filter(p => isSameCategory(getProductCategory(p), activeFilter));
    
    const searched = applySmartProductSearch(filteredByCategory);

    // Agrupar por idProducto (referencia madre)
    const groupedMap = new Map();
    searched.forEach(p => {
        const parentId = p.idProducto;
        if (parentId) {
            // Solo agregar si no existe o si queremos darle prioridad al que coincida mejor con la búsqueda
            if (!groupedMap.has(parentId)) {
                groupedMap.set(parentId, p);
            }
        } else {
            groupedMap.set(p.idVariacion || p.Nombre || Math.random().toString(), p);
        }
    });

    const filtered = getShuffledProducts(Array.from(groupedMap.values()));

    if (!filtered.length) {
        grid.innerHTML = `<div class="cart-empty" style="grid-column:1/-1;">No se encontraron productos${activeSearchQuery ? ' para tu b\u00fasqueda' : ''}</div>`;
        return;
    }

    grid.innerHTML = '';
    let rendered = 0;

    function productCardTemplate(p, i) {
        const name = p.Nombre || p.nombre || p.Producto || 'Producto';
        const price = getProductPrice(p, mode);
        const oldPrice = parseFloat(p.Precio_Anterior || 0);
        const img = normalizeImageUrl(p.Imagen || p.imagen || p.Foto || (p.Galeria && p.Galeria[0]) || '');
        const cat = p.Categoria || p.categoria || '';
        const stock = parseInt(p.Stock || p.stock || p.Cantidad || 0);
        const colors = (p.Color || p.color || '').split(',').map(c => c.trim()).filter(Boolean);
        const originalIndex = allProducts.indexOf(p);
        const productIndex = originalIndex >= 0 ? originalIndex : i;
        const isFeatured = featuredFirst && i === 0;
        const detailUrl = `producto.html?id=${productIndex}${mode === 'wholesale' ? '&catalogo=mayorista' : ''}`;
        const badge = stock <= 0 ? '<span class="product-card-badge badge-out">Agotado</span>' :
                       i < 3 ? '<span class="product-card-badge badge-new">Nuevo</span>' : '';

        return `
        <div class="product-card ${isFeatured ? 'featured' : ''} reveal" data-index="${productIndex}">
            <div class="product-card-img" onclick="window.location.href='${detailUrl}'">
                ${img ? `<img src="${img}" alt="${name}" loading="lazy" onerror="this.style.display='none'">` :
                  `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1a0e2e,#2d1552);font-size:48px;opacity:.3;">?</div>`}
                ${badge}
                ${stock > 0 && showPrices ? `<button class="product-card-quick" onclick="event.stopPropagation(); addToCart(${productIndex}, this, '${mode}')" title="Agregar al carrito">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/></svg>
                </button>` : ''}
            </div>
            <div class="product-card-info" onclick="window.location.href='${detailUrl}'">
                <div class="product-card-name">${name}</div>
                <div class="product-card-desc">${cat}</div>
                ${colors.length ? `<div class="product-card-colors">${colors.map(c => `<span class="color-dot" style="background:${getColorHex(c)}" title="${c}"></span>`).join('')}</div>` : ''}
                ${showPrices ? `<div class="product-card-price">
                    ${formatMoney(price)}
                    ${oldPrice > price ? `<span class="old">${formatMoney(oldPrice)}</span>` : ''}
                </div>` : `<button class="product-card-price price-hidden price-consult-btn" type="button" onclick="event.stopPropagation(); consultProductByWhatsApp(allProducts[${productIndex}], '${detailUrl}')">Precio por consultar</button>`}
            </div>
        </div>`;
    }

    function renderNextBatch() {
        if (renderToken !== catalogRenderToken) return;

        grid.querySelector('.catalog-load-more-wrap')?.remove();
        const start = rendered;
        const end = Math.min(start + CATALOG_BATCH_SIZE, filtered.length);
        const batch = filtered
            .slice(start, end)
            .map((product, index) => productCardTemplate(product, start + index))
            .join('');

        grid.insertAdjacentHTML('beforeend', batch);
        rendered = end;
        initReveal();

        if (rendered < filtered.length) {
            grid.insertAdjacentHTML('beforeend', `
                <div class="catalog-load-more-wrap">
                    <span class="catalog-load-status">Mostrando ${rendered} de ${filtered.length} productos</span>
                    <button class="catalog-load-more btn-filter" type="button" onclick="loadMoreCatalogBatch()">Ver m&aacute;s</button>
                </div>
            `);
        }
    }

    catalogBatchState = { renderToken, renderNextBatch };
    renderNextBatch();
}

function loadMoreCatalogBatch() {
    if (catalogBatchState) {
        catalogBatchState.renderNextBatch();
    }
}

function getColorHex(name) {
    const map = { blanco:'#fff', negro:'#222', rojo:'#e53e3e', azul:'#3b82f6', verde:'#22c55e',
        morado:'#9b2cfa', rosa:'#ec4899', dorado:'#d4a017', plata:'#c0c0c0', plateado:'#c0c0c0' };
    return map[name.toLowerCase()] || '#888';
}

// -- CART --
function addToCart(idx, sourceButton, mode = activeCatalogMode) {
    const p = allProducts[idx];
    if (!p) return;
    const name = p.Nombre || p.nombre || p.Producto || 'Producto';
    const price = getProductPrice(p, mode);
    const img = normalizeImageUrl(p.Imagen || p.imagen || (p.Galeria && p.Galeria[0]) || '');
    const idVariacion = p.idVariacion || p['ID Variaci\u00f3n'] || p['ID Variacion'] || p.SKU || name;
    const sku = p.SKU || p.sku || '';
    const existing = cart.find(c => (c.idVariacion || c.name) === idVariacion && c.mode === mode);
    if (existing) { existing.qty++; }
    else { cart.push({ idVariacion, sku, name, price, img, qty: 1, mode }); }
    saveCart();
    updateCartUI();
    openCart();
    // Button animation
    const btn = sourceButton || document.querySelector(`.product-card[data-index="${idx}"] .product-card-quick`);
    if (btn) { btn.style.background = '#22c55e'; setTimeout(() => btn.style.background = '', 600); }
}

function removeFromCart(idx) {
    cart.splice(idx, 1);
    saveCart();
    updateCartUI();
}

function saveCart() { localStorage.setItem('blyxu_cart', JSON.stringify(cart)); }

function updateCartUI() {
    const badge = document.getElementById('cart-count');
    const itemsEl = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    const count = cart.reduce((s, c) => s + c.qty, 0);
    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
    if (!itemsEl) return;
    if (!cart.length) {
        itemsEl.innerHTML = '<div class="cart-empty">Tu carrito est&aacute; vac&iacute;o</div>';
        if (totalEl) totalEl.textContent = '$0';
        return;
    }
    itemsEl.innerHTML = cart.map((c, i) => `
        <div class="cart-item">
            ${c.img ? `<img src="${c.img}" class="cart-item-img" alt="">` : '<div class="cart-item-img" style="display:flex;align-items:center;justify-content:center;font-size:20px">?</div>'}
            <div class="cart-item-info">
                <div class="cart-item-name">${c.name}</div>
                <div class="cart-item-price">${formatMoney(c.price)} x ${c.qty}</div>
            </div>
            <button class="cart-item-remove" onclick="removeFromCart(${i})">&times;</button>
        </div>
    `).join('');
    const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
    if (totalEl) totalEl.textContent = formatMoney(total);
}

function openCart() {
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

function initCatalogSearch() {
    const input = document.getElementById('catalog-search');
    if (!input) return;

    let searchTimer = null;
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

// -- WHOLESALE ACCESS --
function initWholesaleAccess() {
    const overlay = document.getElementById('wholesale-overlay');
    const form = document.getElementById('wholesale-form');
    const input = document.getElementById('wholesale-key');
    const error = document.getElementById('wholesale-error');
    const closeBtn = document.getElementById('wholesale-close');
    const triggers = document.querySelectorAll('a[href="#mayorista"]');
    const retailTriggers = document.querySelectorAll('a[href="#coleccion"]');

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
        activeCatalogMode = 'retail';
        activeFilter = 'todos';
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
        activeCatalogMode = 'wholesale';
        activeFilter = 'todos';
        await Promise.all([
            showBrandLoader(),
            loadProducts({ renderCatalog: false })
        ]);
        renderCatalogProducts();
        document.querySelectorAll('.section-tags span').forEach(s => {
            s.classList.toggle('active', s.dataset.cat === 'todos');
        });
        document.getElementById('coleccion')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

function consultProductByWhatsApp(product, pageUrl = window.location.href) {
    const name = product?.Nombre || product?.nombre || product?.Producto || 'Producto BLYXU';
    const category = product?.Categoria || product?.categoria || '';
    const sku = product?.SKU || product?.idVariacion || product?.['ID Variación'] || product?.['ID Variacion'] || '';
    const stock = product?.Stock || product?.stock || product?.Cantidad || '';

    let msg = '*Consulta de precio BLYXU*\n\n';
    msg += `Hola, quiero consultar el precio de:\n*${name}*\n`;
    if (category) msg += `Categoría: ${category}\n`;
    if (sku) msg += `SKU / Ref: ${sku}\n`;
    if (stock) msg += `Disponibilidad vista: ${stock} unidades\n`;
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
        id: item.idVariacion || item.sku || item.name,
        nombre: item.name,
        cantidad: item.qty,
        precio: item.price,
        sku: item.sku || '',
        modo: item.mode || activeCatalogMode
    }));

    const response = await fetch(GOOGLE_SHEET_API, {
        method: 'POST',
        body: JSON.stringify({
            resource: 'pedidos',
            action: 'crear',
            data: {
                nombre: cliente.nombre,
                telefono: cliente.telefono,
                email: cliente.email || '',
                direccion: cliente.direccion,
                ciudad: cliente.ciudad,
                productos,
                'Cantidad Total': cart.reduce((sum, item) => sum + item.qty, 0),
                subtotal: total,
                metodoContacto: 'WhatsApp',
                nota: cliente.nota || ''
            }
        })
    });
    const result = await response.json();

    if (!result.ok) {
        throw new Error(result.error || 'No se pudo guardar el pedido');
    }

    return result.data;
}

function askCustomerInfo() {
    const nombre = prompt('Nombre del cliente');
    if (!nombre) return null;
    const telefono = prompt('Telefono / WhatsApp');
    if (!telefono) return null;
    const direccion = prompt('Direccion de entrega');
    if (!direccion) return null;
    const ciudad = prompt('Ciudad');
    if (!ciudad) return null;
    const nota = prompt('Nota para el pedido (opcional)') || '';

    return { nombre, telefono, direccion, ciudad, nota };
}

async function checkout() {
    if (!cart.length) return;
    const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
    const cliente = askCustomerInfo();
    if (!cliente) return;

    const btn = document.getElementById('btn-checkout');
    const originalText = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Guardando pedido...';
    }

    let savedOrder = null;
    try {
        savedOrder = await saveOrderToGoogleSheets(cliente, total);
    } catch (error) {
        console.error('Error guardando pedido:', error);
        alert(`No se pudo guardar el pedido en Google Sheets: ${error.message}`);
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
        return;
    }

    let msg = '*Pedido BLYXU*\n\n';
    if (savedOrder && savedOrder['ID Pedido']) {
        msg += `*ID Pedido:* ${savedOrder['ID Pedido']}\n`;
    }
    msg += `*Cliente:* ${cliente.nombre}\n`;
    msg += `*Telefono:* ${cliente.telefono}\n`;
    msg += `*Direccion:* ${cliente.direccion}, ${cliente.ciudad}\n\n`;
    cart.forEach(c => { msg += `- ${c.name} x ${c.qty} - ${formatMoney(c.price * c.qty)}\n`; });
    msg += `\n*Total: ${formatMoney(total)}*`;
    if (cliente.nota) msg += `\n\n*Nota:* ${cliente.nota}`;

    cart = [];
    saveCart();
    updateCartUI();
    closeCart();

    openWhatsAppMessage(msg);

    if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    initNavbar();
    initReveal();
    renderInventorySpotlightLoading();
    initCatalogSearch();
    initWholesaleAccess();
    const isProductDetailPage = Boolean(document.getElementById('product-detail'));
    loadProducts({ renderCatalog: !isProductDetailPage });
    updateCartUI();

    // Cart events
    document.getElementById('cart-btn')?.addEventListener('click', openCart);
    document.getElementById('cart-overlay')?.addEventListener('click', closeCart);
    document.getElementById('cart-close')?.addEventListener('click', closeCart);
    document.getElementById('btn-checkout')?.addEventListener('click', checkout);

    // Hero sizes interaction
    document.querySelectorAll('.hero-sizes span').forEach(s => {
        s.addEventListener('click', () => {
            document.querySelectorAll('.hero-sizes span').forEach(x => x.classList.remove('active'));
            s.classList.add('active');
        });
    });
});









