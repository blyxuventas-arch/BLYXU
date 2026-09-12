// BLYXU lightweight runtime for informational pages.
const GOOGLE_SHEET_API = 'https://script.google.com/macros/s/AKfycbyMytX5vDXXvNxywckgVmGObGfjLLJEo5iFkJdfqOoDdomVmJ--tnPsOPcmXVSyP9BzuQ/exec';
const BLYXU_WHATSAPP_PHONE = '573112368622';
const SITE_CONFIG_CACHE_KEY = 'blyxu_site_config_cache_v1';
const SITE_CONFIG_TTL = 5 * 60 * 1000;
const CART_KEYS = ['blyxu_cart_retail', 'blyxu_cart_wholesale', 'blyxu_cart'];
let siteConfig = {};
let configLoadPromise = null;
let cart = loadLiteCart();

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

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function readConfigCache() {
    try {
        const cached = JSON.parse(localStorage.getItem(SITE_CONFIG_CACHE_KEY) || 'null');
        return cached && typeof cached === 'object' ? cached : null;
    } catch (_) {
        return null;
    }
}

function writeConfigCache(config) {
    try {
        localStorage.setItem(SITE_CONFIG_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data: config }));
    } catch (_) {}
}

async function fetchSiteConfig() {
    const cached = readConfigCache();
    if (cached?.data && Date.now() - Number(cached.savedAt || 0) < SITE_CONFIG_TTL) {
        siteConfig = cached.data;
        return siteConfig;
    }

    if (!configLoadPromise) {
        configLoadPromise = fetch(`${GOOGLE_SHEET_API}?action=get_config&_=${Date.now()}`, { cache: 'no-store' })
            .then(response => response.json())
            .then(data => {
                if (data?.status === 'success' && data.config) {
                    siteConfig = data.config;
                    writeConfigCache(siteConfig);
                }
                return siteConfig;
            })
            .catch(error => {
                console.warn('No se pudo cargar configuracion del sitio:', error);
                return siteConfig;
            });
    }
    return configLoadPromise;
}

function getSiteConfigValue(key, fallback = '') {
    const value = siteConfig[key];
    return value === undefined || value === null || value === '' ? fallback : String(value);
}

function getCommerceWhatsAppPhone() {
    return String(getSiteConfigValue('WhatsApp_Comercial', getSiteConfigValue('Contacto_WhatsApp', BLYXU_WHATSAPP_PHONE))).replace(/\D/g, '');
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
    return baseUrl + clean.replace(/^@+/, '').replace(/^\/+/, '');
}

function normalizeImageUrl(value) {
    const clean = String(value || '').trim();
    if (!clean) return '';
    if (/^https?:\/\//i.test(clean) || clean.startsWith('data:') || clean.startsWith('blob:')) return clean;
    return clean;
}

function renderFooterSocialLinks() {
    const phone = getCommerceWhatsAppPhone();
    const whatsappHref = phone ? `https://wa.me/${phone}` : '';
    setLinkById('footer-whatsapp', whatsappHref, 'WhatsApp');
    setLinkById('footer-facebook', normalizeSocialUrl(getSiteConfigValue('Contacto_Facebook', 'blyxu'), 'https://facebook.com/'), 'Facebook');
    setLinkById('footer-tiktok', normalizeSocialUrl(getSiteConfigValue('Contacto_TikTok', 'blyxu'), 'https://www.tiktok.com/@'), 'TikTok');
    setLinkById('footer-instagram', normalizeSocialUrl(getSiteConfigValue('Contacto_Instagram', 'blyxu'), 'https://instagram.com/'), 'Instagram');
}

function renderContactPage() {
    if (document.body?.dataset.page !== 'contact') return;
    const days = getSiteConfigValue('Contacto_Dias', 'Lunes a Sabado');
    const hours = getSiteConfigValue('Contacto_Horarios', '10:00 a.m. - 7:00 p.m.');
    const phone = getCommerceWhatsAppPhone();
    const whatsappHref = phone ? `https://wa.me/${phone}` : '';
    const phoneDisplay = phone ? '+' + phone.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3 $4') : '+57 311 2368622';

    setTextById('contact-days', days);
    setTextById('contact-hours', hours);
    setTextById('contact-note', 'Escribenos por nuestro numero oficial o visita nuestras redes sociales BLYXU.');
    setTextById('contact-phone-number', phoneDisplay);
    setLinkById('contact-hero-whatsapp', whatsappHref, 'Escribir ahora');
    setLinkById('contact-whatsapp', whatsappHref, 'WhatsApp');
    setLinkById('contact-facebook', normalizeSocialUrl(getSiteConfigValue('Contacto_Facebook', 'blyxu'), 'https://facebook.com/'));
    setLinkById('contact-tiktok', normalizeSocialUrl(getSiteConfigValue('Contacto_TikTok', 'blyxu'), 'https://www.tiktok.com/@'));
    setLinkById('contact-instagram', normalizeSocialUrl(getSiteConfigValue('Contacto_Instagram', 'blyxu'), 'https://instagram.com/'));
}

function initNavbar() {
    const navbar = document.getElementById('navbar');
    const toggle = document.getElementById('nav-toggle');
    const navLinks = document.getElementById('nav-links');
    window.addEventListener('scroll', () => navbar?.classList.toggle('scrolled', window.scrollY > 50), { passive: true });
    if (!toggle || !navLinks) return;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
        toggle.classList.toggle('open');
        navLinks.classList.toggle('open');
        toggle.setAttribute('aria-expanded', navLinks.classList.contains('open') ? 'true' : 'false');
    });
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            toggle.classList.remove('open');
            navLinks.classList.remove('open');
            toggle.setAttribute('aria-expanded', 'false');
        });
    });
}

function initReveal() {
    const items = document.querySelectorAll('.reveal:not(.visible)');
    if (!('IntersectionObserver' in window)) {
        items.forEach(item => item.classList.add('visible'));
        return;
    }
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.12 });
    items.forEach(item => observer.observe(item));
}

function initFooterPageSearch() {
    const input = document.getElementById('footer-page-search');
    const results = document.getElementById('footer-page-search-results');
    if (!input || !results) return;
    const items = Array.from(results.querySelectorAll('[data-footer-search-item]'));
    const empty = results.querySelector('.footer-search-empty');
    const update = () => {
        const terms = normalizeSearchText(input.value).split(/\s+/).filter(Boolean);
        let visible = 0;
        items.forEach(item => {
            const text = normalizeSearchText(`${item.textContent || ''} ${item.dataset.keywords || ''}`);
            const match = !terms.length || terms.every(term => text.includes(term));
            item.style.display = match ? '' : 'none';
            if (match) visible++;
        });
        if (empty) empty.style.display = visible ? 'none' : 'flex';
    };
    input.addEventListener('input', update);
    input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        const first = items.find(item => item.style.display !== 'none');
        if (first) {
            event.preventDefault();
            first.click();
        }
    });
    update();
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

function initParticles() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas || !window.matchMedia('(min-width: 768px)').matches) return;
    canvas.remove();
    return;
    const ctx = canvas.getContext('2d');
    const particles = [];
    const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize, { passive: true });
    for (let i = 0; i < 26; i++) {
        particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 1.4 + .4, dx: (Math.random() - .5) * .25, dy: (Math.random() - .5) * .25 });
    }
    (function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(168,85,247,.22)';
        particles.forEach(p => {
            p.x += p.dx;
            p.y += p.dy;
            if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
            if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        });
        requestAnimationFrame(draw);
    })();
}

function loadLiteCart() {
    const items = [];
    CART_KEYS.forEach(key => {
        try {
            const value = JSON.parse(localStorage.getItem(key) || '[]');
            if (Array.isArray(value)) items.push(...value);
        } catch (_) {}
    });
    return items;
}

function updateCartUI() {
    cart = loadLiteCart();
    const count = cart.reduce((sum, item) => sum + (Number(item.qty || item.cantidad || item.quantity || 1) || 1), 0);
    const badge = document.getElementById('cart-count');
    if (badge) {
        badge.textContent = String(count);
        badge.style.display = count ? 'inline-flex' : 'none';
    }
}

function openCart() {
    window.location.href = 'carrito.html#carrito';
}

function closeCart() {
    document.getElementById('cart-overlay')?.classList.remove('open');
    document.getElementById('cart-sidebar')?.classList.remove('open');
}

function openCatalogSearch() {
    window.location.href = 'index.html#coleccion';
}

window.openCatalogSearch = openCatalogSearch;

function renderFloatingWhatsApp() {
    const phone = getCommerceWhatsAppPhone();
    if (!phone || document.getElementById('floating-whatsapp')) return;
    const button = document.createElement('a');
    button.id = 'floating-whatsapp';
    button.className = 'floating-whatsapp';
    button.target = '_blank';
    button.rel = 'noopener';
    button.href = `https://wa.me/${phone}?text=${encodeURIComponent('Hola BLYXU, quiero hacer una consulta sobre sus productos.')}`;
    button.innerHTML = '<span class="floating-whatsapp-logo"><img src="Logo2-nav.png" alt="" loading="lazy"></span><span>WhatsApp</span>';
    document.body.appendChild(button);
}

function renderPromoWidget() {}

document.addEventListener('DOMContentLoaded', () => {
    cleanBrowserUrl();
    window.addEventListener('hashchange', cleanBrowserUrl);
    initCustomCursor();
    initParticles();
    initNavbar();
    initReveal();
    initFooterPageSearch();
    updateCartUI();
    fetchSiteConfig().then(() => {
        renderContactPage();
        renderFooterSocialLinks();
        renderFloatingWhatsApp();
    });
});
