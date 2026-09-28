// BLYXU lightweight runtime for informational pages.
const GOOGLE_SHEET_API = 'https://script.google.com/macros/s/AKfycbyMytX5vDXXvNxywckgVmGObGfjLLJEo5iFkJdfqOoDdomVmJ--tnPsOPcmXVSyP9BzuQ/exec';
const BLYXU_WHATSAPP_PHONE = '573112368622';
const SITE_CONFIG_CACHE_KEY = 'blyxu_site_config_cache_v1';
const SITE_CONFIG_TTL = 5 * 60 * 1000;
const CART_KEYS = ['blyxu_cart_retail', 'blyxu_cart_wholesale', 'blyxu_cart'];
let siteConfig = (function() {
    try {
        const cached = JSON.parse(localStorage.getItem(SITE_CONFIG_CACHE_KEY) || 'null');
        return cached && typeof cached === 'object' && cached.data && typeof cached.data === 'object' ? cached.data : {};
    } catch (_) {
        return {};
    }
})();
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

async function fetchSiteConfig(options = {}) {
    const { force = false } = options;
    const cached = readConfigCache();
    if (!force && cached?.data && Date.now() - Number(cached.savedAt || 0) < SITE_CONFIG_TTL) {
        siteConfig = Object.assign(siteConfig, cached.data);
        return siteConfig;
    }

    if (force) configLoadPromise = null;
    if (!configLoadPromise) {
        configLoadPromise = fetch(`${GOOGLE_SHEET_API}?action=get_config&_=${Date.now()}`, { cache: 'no-store' })
            .then(response => response.json())
            .then(data => {
                if (data?.status === 'success' && data.config) {
                    siteConfig = Object.assign(siteConfig, data.config);
                    writeConfigCache(siteConfig);
                    try {
                        window.dispatchEvent(new CustomEvent('blyxu:config-loaded', { detail: siteConfig }));
                    } catch (_) {}
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

function parseContactTimeToMinutes(value) {
    const raw = String(value || '').trim().toLowerCase();
    const match = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)?/i);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const period = String(match[3] || '').replace(/\s|\./g, '');
    if (period === 'pm' && hour < 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return null;
    return (hour * 60) + minute;
}

function splitContactHours(hours) {
    const parts = String(hours || '').split(/\s*-\s*|\s+a\s+/i).map(part => part.trim()).filter(Boolean);
    return {
        open: parts[0] || '10:00 AM',
        close: parts[1] || '7:00 PM'
    };
}

function isContactDayEnabled(days, dayKey) {
    const normalized = normalizeSearchText(days);
    if (!normalized) return true;
    if (normalized.includes('lunes a sabado')) return dayKey !== 'domingo';
    if (normalized.includes('lunes a domingo') || normalized.includes('todos')) return true;
    return normalized.includes(dayKey);
}

function isTodayInContactDays(days) {
    const today = new Date().toLocaleDateString('es-CO', { weekday: 'long', timeZone: 'America/Bogota' });
    return isContactDayEnabled(days, normalizeSearchText(today));
}

function getBogotaTimeParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('es-CO', {
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'America/Bogota'
    }).formatToParts(date);
    const rawHour = Number(parts.find(part => part.type === 'hour')?.value || 0);
    return {
        weekday: normalizeSearchText(parts.find(part => part.type === 'weekday')?.value || ''),
        hour: rawHour === 24 ? 0 : rawHour,
        minute: Number(parts.find(part => part.type === 'minute')?.value || 0),
        second: Number(parts.find(part => part.type === 'second')?.value || 0)
    };
}

function formatContactTimeLabel(value) {
    const minutes = parseContactTimeToMinutes(value);
    if (minutes === null) return String(value || '').trim();
    const hour24 = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const period = hour24 >= 12 ? 'p.m.' : 'a.m.';
    let hour12 = hour24 % 12;
    if (hour12 === 0) hour12 = 12;
    return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

function setRollingClockValue(clock, value) {
    if (!clock) return;
    clock.setAttribute('aria-label', `Hora actual en Bogotá ${value}`);
    const previous = clock.dataset.clockValue || '';
    if (previous === value && clock.children.length) return;
    clock.dataset.clockValue = value;
    clock.innerHTML = value.split('').map((char, index) => {
        const isDigit = /\d/.test(char);
        const changed = previous[index] !== char;
        const className = isDigit
            ? `contact-clock-char${changed ? ' is-changing' : ''}`
            : 'contact-clock-separator';
        return `<span class="${className}">${escapeHtml(char)}</span>`;
    }).join('');
}

function renderContactTimeline(hours) {
    const timeline = document.getElementById('contact-hours-timeline');
    if (!timeline) return;
    const { open, close } = splitContactHours(hours);
    setTextById('contact-open-time', formatContactTimeLabel(open));
    setTextById('contact-close-time', formatContactTimeLabel(close));

    const ticks = document.getElementById('contact-clock-ticks');
    if (ticks && !ticks.children.length) {
        ticks.innerHTML = Array.from({ length: 60 }, (_, index) =>
            `<i class="contact-clock-tick" style="--tick:${index}" aria-hidden="true"></i>`
        ).join('');
    }
}

function renderContactWeek(days) {
    const week = document.getElementById('contact-week');
    if (!week) return;
    const today = getBogotaTimeParts().weekday;
    const labels = [
        ['lunes', 'Lun'],
        ['martes', 'Mar'],
        ['miercoles', 'Mié'],
        ['jueves', 'Jue'],
        ['viernes', 'Vie'],
        ['sabado', 'Sáb'],
        ['domingo', 'Dom']
    ];
    week.innerHTML = labels.map(([key, label]) => {
        const classNames = ['contact-day'];
        if (isContactDayEnabled(days, key)) classNames.push('is-service-day');
        if (today === key) classNames.push('is-today');
        return `<span class="${classNames.join(' ')}" data-day="${key}">${label}</span>`;
    }).join('');
}

function startContactClock(days, hours) {
    const clock = document.getElementById('contact-live-clock');
    const status = document.getElementById('contact-open-status');
    const city = document.getElementById('contact-clock-city');
    const timeline = document.getElementById('contact-hours-timeline');
    if (city) city.textContent = 'Bogotá, Colombia';
    if (!clock && !status) return;

    const { open, close } = splitContactHours(hours);
    const openMinutes = parseContactTimeToMinutes(open);
    const closeMinutes = parseContactTimeToMinutes(close);

    function tick() {
        const { hour, minute, second, weekday } = getBogotaTimeParts();
        const clockValue = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        setRollingClockValue(clock, clockValue);

        const currentMinutes = (hour * 60) + minute;
        const validDay = isTodayInContactDays(days) && weekday !== 'domingo';
        const validHours = openMinutes !== null && closeMinutes !== null
            ? (openMinutes <= closeMinutes
                ? currentMinutes >= openMinutes && currentMinutes < closeMinutes
                : currentMinutes >= openMinutes || currentMinutes < closeMinutes)
            : true;
        const isOpen = validDay && validHours;
        if (status) {
            status.textContent = isOpen ? 'Abierto ahora' : 'Cerrado';
            status.classList.toggle('is-open', isOpen);
        }
        if (timeline && openMinutes !== null && closeMinutes !== null) {
            let progress = 0;
            if (validDay) {
                const duration = openMinutes <= closeMinutes ? closeMinutes - openMinutes : (1440 - openMinutes) + closeMinutes;
                const elapsed = openMinutes <= closeMinutes
                    ? currentMinutes - openMinutes
                    : (currentMinutes >= openMinutes ? currentMinutes - openMinutes : (1440 - openMinutes) + currentMinutes);
                progress = Math.max(0, Math.min(1, elapsed / Math.max(duration, 1)));
            }
            if (validDay && currentMinutes >= closeMinutes && openMinutes < closeMinutes) progress = 1;
            timeline.style.setProperty('--timeline-progress', `${Math.round(progress * 1000) / 10}%`);
            timeline.classList.toggle('is-open', isOpen);
            timeline.classList.toggle('is-closed', !isOpen);
            timeline.classList.toggle('is-sunday', weekday === 'domingo');
            const activeTicks = Math.round(progress * 60);
            timeline.querySelectorAll('.contact-clock-tick').forEach((tick, index) => {
                tick.classList.toggle('is-active', validDay && index < activeTicks);
                tick.classList.toggle('is-sweep', index === second);
            });
        }
    }

    tick();
    clearInterval(window.__blyxuContactClockTimer);
    window.__blyxuContactClockTimer = setInterval(tick, 1000);
}

function renderContactPage() {
    if (document.body?.dataset.page !== 'contact') return;
    const days = getSiteConfigValue('Contacto_Dias', 'Lunes a Sábado');
    const hours = getSiteConfigValue('Contacto_Horarios', '10:00 a.m. - 7:00 p.m.');
    const phone = getCommerceWhatsAppPhone();
    const whatsappText = 'Hola BLYXU, quiero recibir asesoría sobre sus productos.';
    const whatsappHref = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(whatsappText)}` : '';
    const phoneDisplay = phone ? '+' + phone.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3 $4') : '+57 311 2368622';

    setTextById('contact-days', days);
    setTextById('contact-hours', hours);
    setTextById('contact-note', 'Elige el canal que prefieras y te acompañamos con productos, pagos, pedidos o compras al por mayor.');
    setTextById('contact-phone-number', phoneDisplay);
    setLinkById('contact-hero-whatsapp', whatsappHref, 'Escribir ahora');
    setLinkById('contact-whatsapp', whatsappHref, 'WhatsApp');
    setLinkById('contact-facebook', normalizeSocialUrl(getSiteConfigValue('Contacto_Facebook', 'blyxu'), 'https://facebook.com/'));
    setLinkById('contact-tiktok', normalizeSocialUrl(getSiteConfigValue('Contacto_TikTok', 'blyxu'), 'https://www.tiktok.com/@'));
    setLinkById('contact-instagram', normalizeSocialUrl(getSiteConfigValue('Contacto_Instagram', 'blyxu'), 'https://instagram.com/'));
    renderContactTimeline(hours);
    renderContactWeek(days);
    startContactClock(days, hours);
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
        results.classList.toggle('is-active', terms.length > 0);
        items.forEach(item => {
            const text = normalizeSearchText(`${item.textContent || ''} ${item.dataset.keywords || ''}`);
            const match = terms.length > 0 && terms.every(term => text.includes(term));
            item.style.display = match ? '' : 'none';
            if (match) visible++;
        });
        if (empty) empty.style.display = terms.length && !visible ? 'flex' : 'none';
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
    document.documentElement.classList.add('native-cursor');
    document.getElementById('blyxu-cursor')?.remove();
    return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    document.documentElement.classList.remove('native-cursor');
    let cursor = document.getElementById('blyxu-cursor');
    if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = 'blyxu-cursor';
        cursor.innerHTML = '<span class="cursor-dot"></span><span class="cursor-ring"></span>';
        document.body.appendChild(cursor);
    }

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let ringX = x;
    let ringY = y;
    let rafId = 0;
    let isVisible = false;

    function move() {
        if (!isVisible || document.visibilityState === 'hidden') {
            rafId = 0;
            return;
        }
        ringX += (x - ringX) * 0.42;
        ringY += (y - ringY) * 0.42;
        cursor.style.setProperty('--cursor-x', `${x}px`);
        cursor.style.setProperty('--cursor-y', `${y}px`);
        cursor.style.setProperty('--ring-x', `${ringX}px`);
        cursor.style.setProperty('--ring-y', `${ringY}px`);
        rafId = requestAnimationFrame(move);
    }

    function startCursorLoop() {
        if (!rafId && document.visibilityState !== 'hidden') {
            rafId = requestAnimationFrame(move);
        }
    }

    window.addEventListener('mousemove', event => {
        x = event.clientX;
        y = event.clientY;
        isVisible = true;
        cursor.classList.add('is-visible');
        startCursorLoop();
    }, { passive: true });

    window.addEventListener('mouseout', event => {
        if (!event.relatedTarget) {
            isVisible = false;
            cursor.classList.remove('is-visible');
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            isVisible = false;
            cursor.classList.remove('is-visible');
        }
    });

    document.addEventListener('mouseover', event => {
        const target = event.target;
        cursor.classList.toggle('is-hovering', Boolean(target?.closest?.('a, button, input, textarea, select, [role="button"], .nav-icon, .product-card, .global-search-item')));
    });
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
    document.documentElement.style.backgroundColor = '#05030a';
    document.body?.classList.add('cart-navigation-pending');
    window.location.href = 'carrito.html#carrito';
}

function closeCart() {
    document.getElementById('cart-overlay')?.classList.remove('open');
    document.getElementById('cart-sidebar')?.classList.remove('open');
}

const LITE_GLOBAL_SEARCH_PAGES = [
    { title: 'Inicio', detail: 'Banner principal y novedades', href: './', keywords: 'inicio home principal novedades banner' },
    { title: 'Catálogo', detail: 'Productos minoristas, categorías y filtros', href: './#coleccion', keywords: 'catalogo coleccion productos comprar accesorios joyeria' },
    { title: 'Mayorista', detail: 'Acceso y catalogo por mayor', href: 'mayorista.html', keywords: 'mayorista por mayor wholesale precios acceso clave' },
    { title: 'Carrito', detail: 'Revisar productos seleccionados', href: 'carrito.html#carrito', keywords: 'carrito bolsa compra pedido checkout' },
    { title: 'Pagos', detail: 'QR, transferencia y comprobantes', href: 'pagos.html', keywords: 'pagos pagar qr transferencia cuenta comprobante mercado pago' },
    { title: 'Facturas y pedidos', detail: 'Consultar ordenes y comprobantes', href: 'facturas-pedidos.html', keywords: 'facturas pedidos ordenes consultar comprobantes historial' },
    { title: 'Contacto', detail: 'WhatsApp, horarios y redes', href: 'contacto.html', keywords: 'contacto whatsapp telefono horario redes instagram tiktok facebook' },
    { title: 'Administrativo', detail: 'Panel interno BLYXU', href: 'administrativo.html', keywords: 'admin administrativo inventario dashboard productos pedidos' }
];

function getLiteGlobalSearchResults(query) {
    const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return LITE_GLOBAL_SEARCH_PAGES.filter(item => {
        const blob = normalizeSearchText(`${item.title} ${item.detail} ${item.keywords}`);
        return terms.every(term => blob.includes(term));
    });
}

function ensureLiteGlobalSearchModal() {
    let modal = document.getElementById('global-search-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'global-search-modal';
    modal.className = 'global-search-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
        <div class="global-search-dialog" role="dialog" aria-modal="true" aria-labelledby="global-search-title">
            <div class="global-search-head">
                <input class="global-search-input" id="global-search-input" type="search" placeholder="Buscar catalogo, pagos, pedidos, contacto..." autocomplete="off">
                <button class="global-search-close" type="button" aria-label="Cerrar busqueda">&times;</button>
            </div>
            <div class="global-search-results" id="global-search-results" aria-live="polite"></div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', event => {
        if (event.target === modal || event.target.closest('.global-search-close')) closeGlobalSearch();
    });
    modal.querySelector('#global-search-input')?.addEventListener('input', renderLiteGlobalSearchResults);
    modal.querySelector('#global-search-input')?.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeGlobalSearch();
        if (event.key === 'Enter') {
            const first = modal.querySelector('.global-search-item');
            if (first) {
                event.preventDefault();
                first.click();
            }
        }
    });

    return modal;
}

function renderLiteGlobalSearchResults() {
    const input = document.getElementById('global-search-input');
    const results = document.getElementById('global-search-results');
    if (!input || !results) return;
    const query = input.value.trim();
    const matches = getLiteGlobalSearchResults(query).slice(0, 10);

    if (!query) {
        results.innerHTML = '<div class="global-search-empty">Escribe para buscar catalogo, pagos, pedidos o contacto.</div>';
        return;
    }

    results.innerHTML = matches.length
        ? matches.map(item => `
            <a class="global-search-item" href="${escapeHtml(item.href)}">
                <span class="global-search-icon">B</span>
                <span><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.detail)}</span></span>
                <em>Pagina</em>
            </a>
        `).join('')
        : '<div class="global-search-empty">Sin resultados. Prueba con catalogo, pedidos, pagos o contacto.</div>';
}

function closeGlobalSearch() {
    const modal = document.getElementById('global-search-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('global-search-open');
}

function openGlobalSearch() {
    const modal = ensureLiteGlobalSearchModal();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('global-search-open');
    renderLiteGlobalSearchResults();
    setTimeout(() => {
        const input = document.getElementById('global-search-input');
        input?.focus({ preventScroll: true });
        input?.select?.();
    }, 40);
}

function openCatalogSearch() {
    openGlobalSearch();
}

window.openGlobalSearch = openGlobalSearch;
window.closeGlobalSearch = closeGlobalSearch;
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

function initLoginBokehBackgrounds(options = {}) {
    document.querySelectorAll('.login-bokeh-canvas').forEach(canvas => canvas.remove());
    return;
    const { onlyVisible = true } = options;
    document.querySelectorAll('.login-bokeh-canvas').forEach(canvas => {
        const overlay = canvas.closest('.wholesale-overlay');
        if (onlyVisible && overlay && !overlay.classList.contains('open')) return;
        if (canvas.dataset.ready === 'login-bokeh') {
            if (typeof canvas.__blyxuBokehStart === 'function') canvas.__blyxuBokehStart();
            return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.dataset.ready = 'login-bokeh';

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const lights = [];
        const count = 15;
        let width = 0;
        let height = 0;
        let dpr = 1;
        let rafId = 0;

        function isActive() {
            if (document.visibilityState === 'hidden') return false;
            if (!overlay) return true;
            if (overlay.style.display === 'none') return false;
            return overlay.classList.contains('open');
        }

        function makeLight() {
            const size = Math.random() * 170 + 120;
            return {
                size,
                x: Math.random() * width,
                y: Math.random() * height,
                hue: 246 + Math.random() * 46,
                sat: 58 + Math.random() * 28,
                light: 26 + Math.random() * 22,
                alpha: .18 + Math.random() * .16,
                speed: .18 + Math.random() * .28,
                angleX: Math.random() * Math.PI * 2,
                angleY: Math.random() * Math.PI * 2
            };
        }

        function resize() {
            const rect = canvas.parentElement?.getBoundingClientRect();
            width = Math.max(320, rect?.width || window.innerWidth);
            height = Math.max(420, rect?.height || window.innerHeight);
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            if (!lights.length) {
                for (let i = 0; i < count; i += 1) lights.push(makeLight());
            }
        }

        function drawLight(light) {
            const gradient = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.size);
            gradient.addColorStop(0, `hsla(${light.hue}, ${light.sat}%, ${light.light + 28}%, ${light.alpha})`);
            gradient.addColorStop(.45, `hsla(${light.hue}, ${light.sat}%, ${light.light}%, ${light.alpha * .62})`);
            gradient.addColorStop(1, `hsla(${light.hue}, ${light.sat}%, ${light.light}%, 0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(light.x, light.y, light.size, 0, Math.PI * 2);
            ctx.fill();
        }

        function tick() {
            if (!isActive()) {
                rafId = 0;
                return;
            }
            ctx.clearRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'lighter';
            lights.forEach(light => {
                drawLight(light);
                if (!reduceMotion) {
                    light.x += Math.cos(light.angleX) * light.speed;
                    light.y += Math.sin(light.angleY) * light.speed;
                    light.angleX += .0022;
                    light.angleY += .0017;
                    if (light.x < -light.size) light.x = width + light.size;
                    if (light.x > width + light.size) light.x = -light.size;
                    if (light.y < -light.size) light.y = height + light.size;
                    if (light.y > height + light.size) light.y = -light.size;
                }
            });
            ctx.globalCompositeOperation = 'source-over';
            rafId = reduceMotion ? 0 : requestAnimationFrame(tick);
        }

        function start() {
            resize();
            if (!rafId) tick();
        }

        canvas.__blyxuBokehStart = start;
        window.addEventListener('resize', () => {
            if (isActive()) resize();
        }, { passive: true });
        document.addEventListener('visibilitychange', () => {
            if (isActive()) start();
        });
        start();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    cleanBrowserUrl();
    initCustomCursor();
    window.addEventListener('hashchange', cleanBrowserUrl);

    const isPaymentsPage = document.body?.dataset.page === 'pagos';
    const navbar = document.getElementById('navbar');

    function initLitePageAfterAuth() {
        if (initLitePageAfterAuth.done) return;
        initLitePageAfterAuth.done = true;
        if (navbar) navbar.style.display = '';
        initNavbar();
        initFooterPageSearch();
        updateCartUI();
        renderContactPage();
        renderFooterSocialLinks();
        renderFloatingWhatsApp();
        fetchSiteConfig({ force: document.body?.dataset.page === 'contact' }).then(() => {
            renderContactPage();
            renderFooterSocialLinks();
            renderFloatingWhatsApp();
        });
    }

    if (isPaymentsPage && !document.body.classList.contains('payments-unlocked')) {
        if (navbar) navbar.style.display = 'none';
        const obs = new MutationObserver(() => {
            if (!document.body.classList.contains('payments-unlocked')) return;
            obs.disconnect();
            initLitePageAfterAuth();
        });
        obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        return;
    }

    initLitePageAfterAuth();
});


