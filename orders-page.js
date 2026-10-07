document.addEventListener('DOMContentLoaded', () => {
            const form = document.getElementById('orders-lookup-form');
            const input = document.getElementById('orders-phone-input');
            const btn = document.getElementById('orders-submit-btn');
            const status = document.getElementById('orders-status');
            const panel = document.getElementById('orders-panel');
            const heading = document.getElementById('orders-panel-heading');
            const summary = document.getElementById('orders-panel-summary');
            const results = document.getElementById('orders-results');
            const tabs = Array.from(document.querySelectorAll('[data-orders-view]'));
            const apiUrl = typeof GOOGLE_SHEET_API !== 'undefined'
                ? GOOGLE_SHEET_API
                : 'https://script.google.com/macros/s/AKfycbyMytX5vDXXvNxywckgVmGObGfjLLJEo5iFkJdfqOoDdomVmJ--tnPsOPcmXVSyP9BzuQ/exec';
            let currentOrders = [];
            let currentInvoices = [];
            let currentView = 'orders';
            let currentPhone = '';
            const stackIndexes = { orders: 0, invoices: 0 };
            let stackTouch = null;

            function onlyDigits(value) {
                return String(value || '').replace(/\D/g, '');
            }

            function comparablePhone(value) {
                const digits = onlyDigits(value);
                return digits.length > 10 ? digits.slice(-10) : digits;
            }

            function matchesLookup(record, lookup, phoneKeys, referenceKeys) {
                const raw = String(lookup || '').trim();
                // References must match exactly; a PED ID is never treated as a phone.
                if (/^[+\d\s().-]+$/.test(raw)) {
                    const phone = comparablePhone(raw);
                    if (phone.length >= 7 && comparablePhone(getField(record, phoneKeys)) === phone) return true;
                }
                const reference = onlyLetters(raw);
                return reference.length >= 3 && referenceKeys.some(key => onlyLetters(getField(record, [key])) === reference);
            }

            function getField(source, keys, fallback = '') {
                const item = source || {};
                for (const key of keys) {
                    if (item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== '') {
                        return item[key];
                    }
                }
                const normalized = Object.keys(item).reduce((map, key) => {
                    map[onlyLetters(key)] = key;
                    return map;
                }, {});
                for (const key of keys) {
                    const match = normalized[onlyLetters(key)];
                    if (match && item[match] !== undefined && item[match] !== null && String(item[match]).trim() !== '') {
                        return item[match];
                    }
                }
                return fallback;
            }

            function onlyLetters(value) {
                return String(value || '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9]/gi, '')
                    .toLowerCase();
            }

            function escapeHtml(value) {
                return String(value ?? '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            }

            function formatMoney(value) {
                const number = Number(value || 0);
                return '$' + number.toLocaleString('es-CO');
            }

            function parseMoneyValue(value) {
                if (value === undefined || value === null || value === '') return 0;
                if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
                const cleaned = String(value)
                    .replace(/[^\d,.-]/g, '')
                    .replace(/\.(?=\d{3}(\D|$))/g, '')
                    .replace(',', '.');
                const parsed = Number(cleaned);
                return Number.isFinite(parsed) ? parsed : 0;
            }

            function formatDate(value) {
                if (!value) return '-';
                const date = new Date(value);
                if (Number.isNaN(date.getTime())) return String(value);
                return date.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: '2-digit' });
            }

            function parseItems(order) {
                const raw = getField(order, ['Productos JSON', 'Productos', 'items', 'carrito'], []);
                if (Array.isArray(raw)) return compactOrderItems(raw);
                if (!raw) return compactOrderItems(getLooseOrderItems(order));
                try {
                    const parsed = JSON.parse(raw);
                    return compactOrderItems(Array.isArray(parsed) ? parsed : []);
                } catch (error) {
                    return compactOrderItems(getLooseOrderItems(order));
                }
            }

            function getLooseOrderItems(order) {
                const name = getField(order, [
                    'Nombre Producto',
                    'Producto',
                    'Producto Nombre',
                    'Nombre del Producto',
                    'Item',
                    'Articulo',
                    'ArtÃ­culo'
                ], '');
                const sku = getField(order, ['SKU', 'Referencia', 'Ref', 'ID Producto', 'ID Variacion', 'ID VariaciÃ³n'], '');
                if (!name && !sku) return [];
                const qty = Number(getField(order, ['Cantidad', 'cantidad', 'Qty', 'qty'], 1)) || 1;
                const price = parseMoneyValue(getField(order, ['Precio', 'Precio Unitario', 'Valor Unitario', 'price'], 0));
                const subtotal = parseMoneyValue(getField(order, ['Subtotal Producto', 'Subtotal Item', 'Subtotal'], 0));
                return [{
                    nombre: name || sku || 'Producto',
                    sku,
                    cantidad: qty,
                    precio: price || (subtotal > 0 ? Math.round(subtotal / Math.max(1, qty)) : 0),
                    subtotal,
                    imagen: getField(order, ['Imagen', 'Foto', 'img', 'image', 'thumb'], '')
                }];
            }

            function compactOrderItems(items) {
                const grouped = new Map();
                (Array.isArray(items) ? items : []).forEach(item => {
                    const name = getField(item, ['nombre', 'Nombre', 'Producto', 'name'], 'Producto');
                    const sku = getField(item, ['sku', 'SKU', 'id', 'idVariacion', 'ID Variacion', 'ID VariaciÃ³n'], '');
                    const qty = Number(getField(item, ['cantidad', 'Cantidad', 'qty', 'quantity'], 1)) || 1;
                    const price = parseMoneyValue(getField(item, ['precio', 'Precio', 'price', 'valor'], 0));
                    const image = getField(item, ['img', 'imagen', 'Imagen', 'image', 'foto', 'Foto', 'thumb'], '');
                    const key = [onlyLetters(sku), onlyLetters(name), price].join('|');
                    if (!grouped.has(key)) {
                        grouped.set(key, {
                            ...item,
                            nombre: name,
                            sku,
                            cantidad: 0,
                            precio: price,
                            imagen: image
                        });
                    }
                    const current = grouped.get(key);
                    current.cantidad += qty;
                    if (!current.imagen && image) current.imagen = image;
                });
                return Array.from(grouped.values());
            }

            function mergeRecordsByOrder(records) {
                const groups = new Map();
                (Array.isArray(records) ? records : []).forEach((record, index) => {
                    const id = getField(record, ['ID Pedido', 'ID', 'id', 'Referencia', 'Ref'], '');
                    const key = id ? 'order:' + onlyLetters(id) : 'row:' + index;
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push(record);
                });

                return Array.from(groups.values()).map(group => {
                    if (group.length === 1) return group[0];
                    const base = { ...group[0] };
                    const rawItemValues = group
                        .map(record => getField(record, ['Productos JSON', 'Productos', 'items', 'carrito'], ''))
                        .filter(Boolean)
                        .map(value => String(value));
                    const uniqueRawItems = Array.from(new Set(rawItemValues));
                    const items = uniqueRawItems.length === 1
                        ? parseItems(group[0])
                        : compactOrderItems(group.flatMap(parseItems));
                    const itemTotal = items.reduce((sum, item) => {
                        const qty = Number(getField(item, ['cantidad', 'Cantidad', 'qty'], 1)) || 1;
                        const price = parseMoneyValue(getField(item, ['precio', 'Precio', 'price'], 0));
                        return sum + (qty * price);
                    }, 0);
                    const maxStoredTotal = Math.max(...group.map(record => parseMoneyValue(getField(record, ['Subtotal', 'Total', 'total'], 0))), 0);
                    base['Productos JSON'] = JSON.stringify(items);
                    base['Cantidad Total'] = items.reduce((sum, item) => sum + (Number(getField(item, ['cantidad', 'Cantidad', 'qty'], 1)) || 1), 0);
                    base.Subtotal = itemTotal > 0 ? itemTotal : maxStoredTotal;
                    base.Total = base.Subtotal;
                    return base;
                });
            }

            function getOrderTotal(order, items) {
                const direct = parseMoneyValue(getField(order, ['Subtotal', 'Total', 'total'], 0));
                if (direct > 0) return direct;
                return items.reduce((sum, item) => {
                    const qty = Number(getField(item, ['cantidad', 'Cantidad', 'qty'], 1)) || 1;
                    const price = parseMoneyValue(getField(item, ['precio', 'Precio', 'price'], 0));
                    return sum + (qty * price);
                }, 0);
            }

            function parseInvoiceMoney(value) {
                if (value === undefined || value === null || value === '') return 0;
                if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
                const cleaned = String(value)
                    .replace(/[^\d,.-]/g, '')
                    .replace(/\.(?=\d{3}(\D|$))/g, '')
                    .replace(',', '.');
                const parsed = Number(cleaned);
                return Number.isFinite(parsed) ? parsed : 0;
            }

            function getInvoicePaidValue(order) {
                return parseInvoiceMoney(getField(order, [
                    'Valor Abonado',
                    'Total Abonado',
                    'Abonado',
                    'Pago Recibido',
                    'Pagado'
                ], 0));
            }

            function getInvoiceBalanceInfo(order, total) {
                let paid = Math.min(Math.max(0, getInvoicePaidValue(order)), Math.max(0, total));
                const storedBalance = parseInvoiceMoney(getField(order, ['Saldo Pendiente', 'Saldo', 'saldo'], 0));
                if (paid === 0 && storedBalance > 0 && total > storedBalance) {
                    paid = total - storedBalance;
                }
                return {
                    paid,
                    balance: Math.max(0, total - paid)
                };
            }

            function getConfigValue(key, fallback = '') {
                return typeof getSiteConfigValue === 'function' ? getSiteConfigValue(key, fallback) : fallback;
            }

            function statusClass(value) {
                const clean = onlyLetters(value);
                if (clean.includes('complet') || clean.includes('enviado') || clean.includes('pagado')) return 'complete';
                if (clean.includes('cancel')) return 'cancel';
                return '';
            }

            async function readOrdersResponse(response) {
                const text = await response.text();

                try {
                    return JSON.parse(text);
                } catch (error) {
                    return null;
                }
            }

            async function fetchResourceData(resource) {
                let session;
                try { session = JSON.parse(sessionStorage.getItem('blyxu_key_session_v1') || localStorage.getItem('blyxu_customer_device_session_v2') || 'null'); } catch (_) {}
                if (!session?.token) throw new Error('Inicia sesión en Cuenta para consultar tus pedidos y facturas.');
                const response = await fetch(apiUrl, {method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'customerrecords',resource,token:session.token}),cache:'no-store'});
                const data = await readOrdersResponse(response);
                if (!data || data.ok === false) throw new Error(data?.error || 'No se pudo confirmar tu sesión.');
                return data;
            }

            async function verifyMercadoPagoReturn() {
                const params = new URLSearchParams(window.location.search);
                const paymentId = params.get('payment_id') || params.get('collection_id');
                const mpStatus = params.get('status') || params.get('collection_status');
                const orderId = params.get('id') || params.get('external_reference');
                if (!paymentId) return;

                status.textContent = 'Verificando pago de Mercado Pago...';
                try {
                    const url = apiUrl
                        + '?action=verifymppayment'
                        + '&payment_id=' + encodeURIComponent(paymentId)
                        + (orderId ? '&id=' + encodeURIComponent(orderId) : '');
                    const result = await readOrdersResponse(await fetch(url, { cache: 'no-store' }));
                    if (!result || result.ok === false) {
                        throw new Error(result?.error || 'No se pudo verificar el pago.');
                    }
                    status.textContent = mpStatus === 'approved' || result.paymentStatus === 'approved'
                        ? 'Pago aprobado. Tu pedido fue actualizado y el stock fue descontado.'
                        : 'Pago recibido con estado: ' + (result.paymentStatus || mpStatus || 'pendiente') + '.';
                } catch (error) {
                    status.textContent = error.message || 'No se pudo verificar el pago de Mercado Pago.';
                }
            }

            async function fetchOrdersByPhone(phone) {
                const data = await fetchResourceData('pedidos');

                if (!data || data.status !== 'success' || !Array.isArray(data.data)) {
                    throw new Error(data?.error || 'No se pudo cargar la informacion.');
                }

                return mergeRecordsByOrder(data.data
                    .filter(order => matchesLookup(
                        order,
                        phone,
                        ['Telefono', 'Tel\u00e9fono', 'Tel\u00c3\u00a9fono', 'Telefono Cliente', 'Celular', 'ID Cliente'],
                        ['ID Pedido', 'ID', 'id', 'Referencia', 'Ref']
                    ))
                    .reverse());
            }

            async function fetchInvoicesByPhone(phone) {
                let data = null;
                try {
                    data = await fetchResourceData('facturas');
                } catch (error) {
                    console.warn('No se pudieron cargar facturas:', error);
                    return [];
                }

                if (!data || data.status !== 'success' || !Array.isArray(data.data)) {
                    return [];
                }

                return data.data
                    .filter(invoice => matchesLookup(
                        invoice,
                        phone,
                        ['ID Cliente', 'Telefono', 'Tel\u00e9fono', 'Tel\u00c3\u00a9fono', 'Celular'],
                        ['ID Factura', 'ID Pedido', 'ID', 'id', 'Referencia', 'Ref', 'Factura']
                    ))
                    .reverse();
            }

            function getItemImage(item) {
                const directImage = getField(item, ['img', 'imagen', 'Imagen', 'image', 'foto', 'Foto', 'thumb'], '');
                if (directImage) return directImage;

                const productsSource = typeof allProducts !== 'undefined' && Array.isArray(allProducts) ? allProducts : [];
                const itemSku = String(getField(item, ['sku', 'SKU', 'id', 'idVariacion', 'ID Variacion'], '')).trim();
                const itemName = onlyLetters(getField(item, ['nombre', 'Nombre', 'Producto'], ''));
                const match = productsSource.find(product => {
                    const productSku = String(getField(product, ['idVariacion', 'ID Variacion', 'ID Variaci\u00f3n', 'SKU'], '')).trim();
                    const productName = onlyLetters(getField(product, ['Nombre', 'nombre', 'Nombre del Producto', 'Producto'], ''));
                    return (itemSku && productSku && itemSku === productSku) ||
                        (itemName && productName && itemName === productName);
                });

                return match ? getField(match, ['Imagen', 'imagen', 'Imagen Principal', 'Foto'], '') : '';
            }

            function renderItemsTable(items) {
                if (!items.length) {
                    return '<div class="orders-empty">Este registro no tiene productos detallados.</div>';
                }

                const visibleItems = items.slice(0, 12);
                const totalQty = items.reduce((sum, item) => {
                    return sum + (Number(getField(item, ['cantidad', 'Cantidad', 'qty'], 1)) || 1);
                }, 0);

                return `
                    <div class="items-summary">
                        <div class="items-summary-head">
                            <span>Productos del pedido</span>
                            <strong>${totalQty} ${totalQty === 1 ? 'unidad' : 'unidades'}</strong>
                        </div>
                        <div class="items-compact-grid">
                            ${visibleItems.map(item => {
                                const name = getField(item, ['nombre', 'Nombre', 'Producto'], 'Producto');
                                const sku = getField(item, ['sku', 'SKU', 'id', 'idVariacion'], '-');
                                const qty = Number(getField(item, ['cantidad', 'Cantidad', 'qty'], 1)) || 1;
                                const price = Number(getField(item, ['precio', 'Precio', 'price'], 0)) || 0;
                                const image = getItemImage(item);
                                return `
                                    <article class="item-compact-card">
                                        ${image ? `<img class="item-compact-thumb" src="${escapeHtml(image)}" alt="${escapeHtml(name)}">` : '<span class="item-compact-thumb item-compact-empty">?</span>'}
                                        <div class="item-compact-info">
                                            <strong>${escapeHtml(name)}</strong>
                                            <span>${escapeHtml(sku || '-')}</span>
                                        </div>
                                        <div class="item-compact-total">
                                            <small>x${qty}</small>
                                            ${formatMoney(price * qty)}
                                        </div>
                                    </article>
                                `;
                            }).join('')}
                        </div>
                        ${items.length > visibleItems.length ? `<div class="items-more-note">+${items.length - visibleItems.length} productos mas en este pedido.</div>` : ''}
                    </div>
                `;
            }

            function getStackPosition(index, activeIndex, total) {
                if (!total) return 'hidden';
                const forward = (index - activeIndex + total) % total;
                const backward = (activeIndex - index + total) % total;
                if (forward === 0) return '0';
                if (forward <= 3) return String(forward);
                if (backward === 1) return '-1';
                return 'hidden';
            }

            function syncStackStageHeight() {
                const stage = results.querySelector('.orders-stack-stage');
                const activeCard = stage?.querySelector('[data-stack-pos="0"]');
                if (!stage || !activeCard) return;
                requestAnimationFrame(() => {
                    const height = activeCard.getBoundingClientRect().height;
                    if (height > 0) {
                        stage.style.minHeight = `${Math.ceil(height + 124)}px`;
                    }
                });
            }

            function updateStackPositions(view = currentView) {
                const cards = Array.from(results.querySelectorAll('.orders-stack-card'));
                const total = cards.length;
                if (!total) return;
                stackIndexes[view] = ((stackIndexes[view] % total) + total) % total;
                const activeIndex = stackIndexes[view];
                cards.forEach(card => {
                    const index = Number(card.dataset.stackIndex || 0);
                    const pos = getStackPosition(index, activeIndex, total);
                    card.dataset.stackPos = pos;
                    card.setAttribute('aria-hidden', index === activeIndex ? 'false' : 'true');
                });
                const counter = results.querySelector('[data-stack-counter]');
                if (counter) counter.textContent = `${activeIndex + 1} / ${total}`;
                syncStackStageHeight();
            }

            function moveStack(direction) {
                const total = results.querySelectorAll('.orders-stack-card').length;
                if (!total) return;
                stackIndexes[currentView] = (stackIndexes[currentView] + direction + total) % total;
                updateStackPositions(currentView);
            }

            function renderStackedCards(cardHtmlList, view, label) {
                const total = cardHtmlList.length;
                stackIndexes[view] = Math.min(stackIndexes[view] || 0, Math.max(total - 1, 0));
                results.classList.add('stack-mode');
                results.innerHTML = `
                    <div class="orders-stack" data-stack-view="${view}">
                        <div class="orders-stack-toolbar">
                            <div class="orders-stack-count">${escapeHtml(label)} <span data-stack-counter>${stackIndexes[view] + 1} / ${total}</span></div>
                            <div class="orders-stack-controls" aria-label="Navegar ${escapeHtml(label)}">
                                <button type="button" class="orders-stack-nav" data-stack-dir="-1" aria-label="Anterior">&lt;</button>
                                <button type="button" class="orders-stack-nav" data-stack-dir="1" aria-label="Siguiente">&gt;</button>
                            </div>
                        </div>
                        <div class="orders-stack-stage">
                            ${cardHtmlList.map((html, index) => `
                                <div class="orders-stack-card" data-stack-index="${index}" data-stack-pos="${getStackPosition(index, stackIndexes[view], total)}" aria-hidden="${index === stackIndexes[view] ? 'false' : 'true'}">
                                    ${html}
                                </div>
                            `).join('')}
                        </div>
                        <div class="orders-stack-hint">Usa las flechas o desliza en celular para cambiar de tarjeta.</div>
                    </div>
                `;
                syncStackStageHeight();
                results.querySelectorAll('.orders-stack-card img').forEach(img => {
                    img.addEventListener('load', syncStackStageHeight, { once: true });
                });
            }

            function renderOrders() {
                if (!currentOrders.length) {
                    results.classList.remove('stack-mode');
                    results.innerHTML = '<div class="orders-empty">No encontramos pedidos asociados a ese número de contacto.</div>';
                    return;
                }

                const cards = currentOrders.map(order => {
                    const id = getField(order, ['ID Pedido', 'ID', 'id'], 'Pedido');
                    const date = getField(order, ['Fecha', 'Fecha Pedido'], '');
                    const name = getField(order, ['Nombre Cliente', 'Nombre', 'Cliente'], 'Cliente BLYXU');
                    const city = getField(order, ['Ciudad'], '-');
                    const address = getField(order, ['Direccion', 'Direcci\u00f3n', 'Direcci\u00c3\u00b3n'], '-');
                    const state = getField(order, ['Estado Pedido', 'Estado'], 'Pendiente');
                    const method = getField(order, ['Metodo Contacto', 'M\u00e9todo Contacto', 'M\u00c3\u00a9todo Contacto', 'M\u00c3\u0192\u00c2\u00a9todo Contacto', 'Metodo'], '-');
                    const note = getField(order, ['Nota Cliente', 'Nota'], '');
                    const items = parseItems(order);
                    const total = getOrderTotal(order, items);

                    return `
                        <article class="order-card">
                            <div class="order-card-head">
                                <div>
                                    <div class="order-id">${escapeHtml(id)}</div>
                                    <div class="order-meta">${escapeHtml(name)} - ${formatDate(date)}</div>
                                </div>
                                <span class="order-status ${statusClass(state)}">${escapeHtml(state)}</span>
                            </div>
                            <div class="order-body">
                                <div class="order-grid">
                                    <div class="order-metric"><span>Total</span><strong>${formatMoney(total)}</strong></div>
                                    <div class="order-metric"><span>Ciudad</span><strong>${escapeHtml(city)}</strong></div>
                                    <div class="order-metric"><span>Entrega</span><strong>${escapeHtml(address)}</strong></div>
                                    <div class="order-metric"><span>Origen</span><strong>${escapeHtml(method)}</strong></div>
                                </div>
                                <div class="order-collapsible">
                                    ${renderItemsTable(items)}
                                    ${note ? `<div class="order-metric"><span>Nota</span><strong>${escapeHtml(note)}</strong></div>` : ''}
                                </div>
                                <button type="button" class="order-details-toggle" aria-expanded="false">Ver detalle completo</button>
                                <button type="button" class="orders-action-btn" data-order-id="${escapeHtml(id)}" onclick="BlyxuReceiptAccess.downloadCustomer(this.dataset.orderId,this)">Abrir comprobante de pedido</button>
                            </div>
                        </article>
                    `;
                });
                renderStackedCards(cards, 'orders', 'Pedidos');
            }

            function renderInvoices() {
                if (!currentInvoices.length) {
                    results.classList.remove('stack-mode');
                    results.innerHTML = '<div class="orders-empty">No encontramos facturas asociadas a ese número de contacto.</div>';
                    return;
                }

                const cards = currentInvoices.map((order, index) => {
                    const id = getField(order, ['ID Factura', 'ID', 'id'], 'Factura');
                    const orderId = getField(order, ['ID Pedido'], '-');
                    const date = getField(order, ['Fecha', 'Fecha Pedido'], '');
                    const name = getField(order, ['Nombre', 'Nombre Cliente', 'Cliente'], 'Cliente BLYXU');
                    const phone = getField(order, ['ID Cliente', 'Telefono', 'Tel\u00e9fono', 'Tel\u00c3\u00a9fono'], currentPhone);
                    const city = getField(order, ['Ciudad'], '-');
                    const address = getField(order, ['Direccion', 'Direcci\u00f3n', 'Direcci\u00c3\u00b3n', 'M\u00e9todo Entrega', 'Metodo Entrega'], '-');
                    const state = getField(order, ['Estado Factura', 'Estado'], 'Finalizada');
                    const items = parseItems(order);
                    const total = getOrderTotal(order, items);
                    const balanceInfo = getInvoiceBalanceInfo(order, total);

                    return `
                        <article class="order-card invoice-card">
                            <div class="order-card-head">
                                <div>
                                    <div class="order-id">Factura / Remision ${escapeHtml(id)}</div>
                                    <div class="order-meta">Pedido: ${escapeHtml(orderId)} - Emitida: ${formatDate(date)}</div>
                                </div>
                                <span class="order-status ${statusClass(state)}">${escapeHtml(state)}</span>
                            </div>
                            <div class="order-body">
                                <div class="order-grid">
                                    <div class="order-metric"><span>Cliente</span><strong>${escapeHtml(name)}</strong></div>
                                    <div class="order-metric"><span>Contacto</span><strong>${escapeHtml(phone)}</strong></div>
                                    <div class="order-metric"><span>Direccion</span><strong>${escapeHtml(address)}</strong></div>
                                    <div class="order-metric"><span>Ciudad</span><strong>${escapeHtml(city)}</strong></div>
                                </div>
                                <div class="order-collapsible">
                                    ${renderItemsTable(items)}
                                    <div class="invoice-total"><span>Total factura</span>${formatMoney(total)}</div>
                                    <div class="invoice-total"><span>Abonado</span>${formatMoney(balanceInfo.paid)}</div>
                                    <div class="invoice-total"><span>Saldo pendiente</span>${formatMoney(balanceInfo.balance)}</div>
                                </div>
                                <button type="button" class="order-details-toggle" aria-expanded="false">Ver detalle completo</button>
                                <div class="invoice-actions">
                                    <button type="button" class="orders-action-btn invoice-download-btn" onclick="downloadInvoicePdf(${index})">Abrir / guardar PDF</button>
                                </div>
                            </div>
                        </article>
                    `;
                });
                renderStackedCards(cards, 'invoices', 'Facturas');
            }

            function buildPrintableInvoice(order) {
                const id = getField(order, ['ID Factura', 'ID Pedido', 'ID', 'id'], 'Pedido');
                const consultationUrl = new URL('facturas-pedidos.html', window.location.href);
                consultationUrl.searchParams.set('buscar', id);
                const localQr = qrcode(0, 'M');
                localQr.addData(consultationUrl.href); localQr.make();
                const consultationQr = localQr.createDataURL(5,20);
                const orderId = getField(order, ['ID Pedido'], id);
                const date = getField(order, ['Fecha', 'Fecha Pedido'], '');
                const name = getField(order, ['Nombre', 'Nombre Cliente', 'Cliente'], 'Cliente BLYXU');
                const phone = getField(order, ['ID Cliente', 'Telefono', 'Tel\u00e9fono', 'Tel\u00c3\u00a9fono'], currentPhone);
                const city = getField(order, ['Ciudad'], '-');
                const address = getField(order, ['Direccion', 'Direcci\u00f3n', 'Direcci\u00c3\u00b3n', 'M\u00e9todo Entrega', 'Metodo Entrega'], '-');
                const state = getField(order, ['Estado Factura', 'Estado Pedido', 'Estado'], 'Finalizada');
                const method = getField(order, ['Metodo Pago', 'M\u00e9todo Pago', 'Metodo Contacto', 'M\u00e9todo Contacto', 'M\u00c3\u00a9todo Contacto', 'M\u00c3\u0192\u00c2\u00a9todo Contacto', 'Metodo'], '-');
                const note = getField(order, ['Nota Cliente', 'Nota', 'Observaciones'], '');
                const customerType = getField(order, ['Tipo Cliente', 'Tipo', 'ClienteTipo'], 'Detal');
                const items = parseItems(order);
                const total = getOrderTotal(order, items);
                const balanceInfo = getInvoiceBalanceInfo(order, total);
                const companyLogo = 'blyxu-invoice-logo.png';
                const companyName = getConfigValue('Factura_Empresa', 'BLYXU JoyerÃ­a & Accesorios');
                const companyNit = getConfigValue('Factura_NIT', '000.000.000-0');
                const companyPhone = getConfigValue('Factura_Telefono', '+57 311 2368622');
                const companyEmail = getConfigValue('Factura_Email', 'contacto@blyxu.online');
                let totalQty = 0;

                const rows = items.length ? items.map(item => {
                    const itemName = getField(item, ['nombre', 'Nombre', 'Producto'], 'Producto');
                    const sku = getField(item, ['sku', 'SKU', 'id', 'idVariacion', 'Ref'], '-');
                    const qty = Number(getField(item, ['cantidad', 'Cantidad', 'qty'], 1)) || 1;
                    const price = Number(getField(item, ['precio', 'Precio', 'price'], 0)) || 0;
                    totalQty += qty;
                    return `
                        <tr>
                            <td style="text-align:center;">
                                <span style="background:#f4f4f5; color:#09090b; font-weight:800; padding:2px 8px; border-radius:4px; font-size:12px; display:inline-block; border:1px solid #d4d4d8;">${qty}</span>
                            </td>
                            <td>
                                <strong style="font-size:14px; color:#09090b; display:block; margin-bottom:2px; font-weight:700;">${escapeHtml(itemName)}</strong>
                                <span style="display:inline-block; background:#fafafa; color:#52525b; font-size:11px; font-weight:600; padding:1px 6px; border-radius:4px; border:1px solid #e4e4e7; font-family: monospace;">Ref: ${escapeHtml(sku || '-')}</span>
                            </td>
                            <td style="text-align:right; font-variant-numeric:tabular-nums; font-weight:600; color:#3f3f46; font-size:13.5px;">${formatMoney(price)}</td>
                            <td style="text-align:right; font-variant-numeric:tabular-nums; font-weight:800; color:#09090b; font-size:14px;">${formatMoney(price * qty)}</td>
                        </tr>
                    `;
                }).join('') : `
                    <tr>
                        <td colspan="4" style="text-align:center;color:#777;">Este registro no tiene productos detallados.</td>
                    </tr>
                `;

                return `
                    <section>
                        <div class="admin-inv-top-banner">
                            <div class="admin-inv-brand-wrapper">
                                <img src="${escapeHtml(companyLogo)}" alt="BLYXU">
                                <div>
                                    <h1>${escapeHtml(companyName)}</h1>
                                    <p>
                                        <span>WhatsApp: ${escapeHtml(companyPhone)}</span> &bull;
                                        <span>${escapeHtml(companyEmail)}</span> &bull;
                                        <span>www.blyxu.online</span>
                                    </p>
                                </div>
                            </div>
                            <div class="admin-inv-badge-box">
                                <h2>FACTURA DE VENTA</h2>
                                <div class="inv-num">${escapeHtml(id)}</div>
                                <div class="inv-date">Fecha: <strong>${formatDate(date)}</strong></div>
                                <div class="inv-status-chip">
                                    <span class="status-dot"></span> <span>${escapeHtml(String(state || 'COMPROBANTE OFICIAL').toUpperCase())}</span>
                                </div>
                            </div>
                        </div>

                        <div class="invoice-details">
                            <div class="invoice-details-box inv-box-cliente">
                                <div class="box-header-title">FACTURAR A / CLIENTE</div>
                                <strong class="cliente-nombre-title">${escapeHtml(name)}</strong>
                                <p><strong>TelÃ©fono / WhatsApp:</strong> ${escapeHtml(phone || '-')}</p>
                                <p><strong>DirecciÃ³n de EnvÃ­o:</strong> ${escapeHtml(address || '-')}</p>
                                <p><strong>Ciudad:</strong> ${escapeHtml(city || '-')}</p>
                                <p><strong>Tipo de Cliente:</strong> <span style="font-weight:900; color:#000000;">${escapeHtml(customerType || 'Detal')}</span></p>
                            </div>
                            <div class="invoice-details-box inv-box-emisor">
                                <div class="box-header-title">EMISOR / DATOS CORPORATIVOS</div>
                                <strong class="emisor-nombre-title">${escapeHtml(companyName)}</strong>
                                <p><strong>Empresa:</strong> ${escapeHtml(companyName)}</p>
                                <p><strong>NIT / DOC:</strong> ${escapeHtml(companyNit)}</p>
                                <p><strong>Soporte Inmediato:</strong> ${escapeHtml(companyPhone)}</p>
                                <p><strong>MÃ©todo de Pago:</strong> ${escapeHtml(method)}</p>
                                <p><strong>ID Pedido:</strong> ${escapeHtml(orderId)}</p>
                            </div>
                        </div>

                        <table class="invoice-table">
                            <thead>
                                <tr>
                                    <th style="width:10%; text-align:center;">CANT.</th>
                                    <th style="width:52%;">DESCRIPCIÃ“N / PRODUCTO</th>
                                    <th style="width:19%; text-align:right;">P. UNITARIO</th>
                                    <th style="width:19%; text-align:right;">SUBTOTAL</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>

                        <div class="invoice-bottom-grid">
                            <div class="invoice-notes-box">
                                <div class="notes-title">OBSERVACIONES & NOTAS DE COMPRA</div>
                                <p>${escapeHtml(note || 'Gracias por preferir BLYXU JoyerÃ­a. Cada una de nuestras piezas cuenta con sello y garantÃ­a de autenticidad BLYXU.')}</p>
                            </div>
                            <div class="invoice-total-container">
                                <div class="invoice-total-box">
                                    <div class="total-row-item">
                                        <span class="total-label">TOTAL FACTURA</span>
                                        <span class="total-amount">${formatMoney(total)}</span>
                                    </div>
                                    <div class="payment-row-item">
                                        <span>ABONADO</span>
                                        <strong>${formatMoney(balanceInfo.paid)}</strong>
                                    </div>
                                    <div class="payment-row-item balance">
                                        <span>SALDO PENDIENTE</span>
                                        <strong>${formatMoney(balanceInfo.balance)}</strong>
                                    </div>
                                    <div class="total-sub-info">
                                        <span>Moneda: COP ($)</span> &bull; <span>${totalQty} ${totalQty === 1 ? 'Ãtem' : 'Ãtems'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="invoice-store-box">
                            <div style="display:flex; align-items:center; gap:14px;">
                                <img src="${escapeHtml(consultationQr)}" alt="QR para consultar esta factura">
                                <div>
                                    <strong style="font-size:13.5px; color:#000000 !important; display:block; margin-bottom:2px;">Consulta tu factura BLYXU</strong>
                                    <p style="margin:0; font-size:12px; color:#52525b !important;">Escanea este cÃ³digo QR o haz clic en el enlace:</p>
                                    <a href="${escapeHtml(consultationUrl.href)}" target="_blank" rel="noopener" style="display:inline-block; margin-top:3px; font-size:13px; font-weight:800; color:#000000 !important; text-decoration:underline;">Factura ${escapeHtml(id)}</a>
                                </div>
                            </div>
                            <div style="text-align:right; font-size:12px; color:#52525b !important;">
                                <span style="font-weight:700;">AtenciÃ³n & Pedidos</span><br>
                                <strong style="font-size:13px; color:#000000 !important;">${escapeHtml(companyPhone)}</strong>
                            </div>
                        </div>

                        <div class="invoice-footer-line"></div>
                        <div class="invoice-footer">
                            <p class="thank-you">Gracias por elegir BLYXU JoyerÃ­a & Accesorios</p>
                            <p class="footer-subtext">Comprobante expedido digitalmente por BLYXU &bull; Tienda Web: <a href="https://www.blyxu.online" target="_blank" style="color:#52525b; font-weight:700;">www.blyxu.online</a> &bull; WhatsApp Soporte: ${escapeHtml(companyPhone)}</p>
                        </div>
                    </section>
                `;
            }

            function isIOSDevice() {
                return /iPad|iPhone|iPod/.test(navigator.userAgent)
                    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            }

            function getInvoiceDocumentStyles() {
                return `
                    * { box-sizing: border-box; }
                    html, body {
                        margin: 0;
                        background: #ffffff;
                        color: #111827;
                        font-family: Outfit, "Avenir Next", "Century Gothic", Arial, sans-serif;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    body { padding: 24px; }
                    .invoice-print-toolbar {
                        position: sticky;
                        top: 0;
                        z-index: 20;
                        display: flex;
                        justify-content: flex-end;
                        gap: 12px;
                        max-width: 860px;
                        margin: 0 auto 16px;
                        padding: 8px 0;
                        background: #ffffff;
                    }
                    .invoice-print-button {
                        min-height: 42px;
                        border: 1.5px solid #000000;
                        border-radius: 8px;
                        padding: 0 20px;
                        background: #000000;
                        color: #ffffff;
                        font: inherit;
                        font-size: 12px;
                        font-weight: 800;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .invoice-print-button:hover {
                        background: #27272a;
                    }
                    #invoice-document-root {
                        max-width: 860px;
                        margin: 0 auto;
                        padding: 30px 34px;
                        background: #ffffff;
                        border: 1.5px solid #000000;
                        border-radius: 6px;
                        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
                    }
                    .admin-inv-top-banner {
                        background: #ffffff;
                        padding: 0 0 18px 0;
                        border-bottom: 2px solid #000000;
                        color: #000000;
                        display: flex;
                        justify-content: space-between;
                        gap: 20px;
                        align-items: flex-start;
                        margin-bottom: 20px;
                    }
                    .admin-inv-brand-wrapper {
                        display: flex;
                        align-items: center;
                        gap: 16px;
                    }
                    .admin-inv-brand-wrapper img {
                        height: 52px;
                        width: auto;
                        object-fit: contain;
                    }
                    .admin-inv-brand-wrapper h1 {
                        margin: 0;
                        font-size: 22px;
                        font-weight: 900;
                        letter-spacing: -0.5px;
                        color: #000000;
                        text-transform: uppercase;
                    }
                    .admin-inv-brand-wrapper p {
                        margin: 4px 0 0;
                        font-size: 11.5px;
                        color: #52525b;
                        font-weight: 500;
                        line-height: 1.4;
                    }
                    .admin-inv-badge-box {
                        background: #ffffff;
                        border: 1.5px solid #000000;
                        border-radius: 6px;
                        padding: 10px 18px;
                        text-align: right;
                        flex: 0 0 auto;
                    }
                    .admin-inv-badge-box h2 {
                        margin: 0;
                        font-size: 10.5px;
                        font-weight: 900;
                        letter-spacing: 1.5px;
                        color: #000000;
                        text-transform: uppercase;
                    }
                    .admin-inv-badge-box .inv-num {
                        font-size: 20px;
                        font-weight: 900;
                        color: #000000;
                        margin: 2px 0;
                        font-family: monospace, monospace;
                        letter-spacing: 0.5px;
                    }
                    .admin-inv-badge-box .inv-date {
                        font-size: 12px;
                        color: #52525b;
                        font-weight: 600;
                    }
                    .admin-inv-badge-box .inv-status-chip {
                        display: inline-flex;
                        align-items: center;
                        gap: 5px;
                        margin-top: 4px;
                        background: #ffffff;
                        border: 1px solid #000000;
                        color: #000000;
                        padding: 2px 8px;
                        border-radius: 4px;
                        font-size: 9.5px;
                        font-weight: 800;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .admin-inv-badge-box .status-dot {
                        width: 5px;
                        height: 5px;
                        background: #000000;
                        border-radius: 50%;
                    }
                    .invoice-details {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 16px;
                        margin-bottom: 20px;
                    }
                    .invoice-details-box {
                        background: #ffffff;
                        border: 1px solid #d4d4d8;
                        border-radius: 6px;
                        padding: 14px 18px;
                    }
                    .invoice-details-box.inv-box-cliente {
                        border-left: 3px solid #000000;
                    }
                    .invoice-details-box.inv-box-emisor {
                        border-left: 3px solid #000000;
                    }
                    .invoice-details-box .box-header-title {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin: 0 0 8px;
                        font-size: 10.5px;
                        font-weight: 900;
                        letter-spacing: 1px;
                        color: #000000;
                        text-transform: uppercase;
                        border-bottom: 1px solid #e4e4e7;
                        padding-bottom: 5px;
                    }
                    .invoice-details-box .cliente-nombre-title,
                    .invoice-details-box .emisor-nombre-title {
                        font-size: 15.5px;
                        font-weight: 800;
                        color: #000000;
                        display: block;
                        margin-bottom: 5px;
                    }
                    .invoice-details-box p {
                        margin: 3px 0;
                        font-size: 12.5px;
                        color: #3f3f46;
                        line-height: 1.45;
                        font-weight: 500;
                    }
                    .invoice-table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 20px;
                        border-top: 1.5px solid #000000;
                        border-bottom: 1.5px solid #000000;
                    }
                    .invoice-table th {
                        background: #fafafa;
                        color: #000000;
                        font-size: 10.5px;
                        font-weight: 900;
                        text-transform: uppercase;
                        letter-spacing: 0.8px;
                        padding: 10px 12px;
                        border-bottom: 1.5px solid #000000;
                        border-right: 1px solid #f0f0f0;
                    }
                    .invoice-table td {
                        padding: 11px 12px;
                        border-bottom: 1px solid #e4e4e7;
                        border-right: 1px solid #f4f4f5;
                        font-size: 13px;
                        color: #18181b;
                        background: #ffffff;
                        font-weight: 500;
                    }
                    .invoice-table th:last-child,
                    .invoice-table td:last-child { border-right: none; }
                    .invoice-bottom-grid {
                        display: grid;
                        grid-template-columns: 1fr 320px;
                        gap: 16px;
                        align-items: start;
                        margin-top: 16px;
                    }
                    .invoice-notes-box {
                        background: #ffffff;
                        border: 1px solid #d4d4d8;
                        border-left: 3px solid #000000;
                        border-radius: 6px;
                        padding: 12px 16px;
                        font-size: 12px;
                        color: #3f3f46;
                        line-height: 1.5;
                    }
                    .invoice-notes-box .notes-title {
                        font-size: 10px;
                        font-weight: 900;
                        letter-spacing: 1px;
                        color: #000000;
                        margin-bottom: 4px;
                        text-transform: uppercase;
                    }
                    .invoice-total-container { display: flex; justify-content: flex-end; }
                    .invoice-total-box {
                        background: #ffffff;
                        color: #000000;
                        padding: 16px 20px;
                        border-radius: 6px;
                        width: 100%;
                        border: 1.5px solid #000000;
                    }
                    .invoice-total-box .total-row-item {
                        display: flex;
                        align-items: baseline;
                        justify-content: space-between;
                        gap: 16px;
                    }
                    .invoice-total-box .payment-row-item {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 16px;
                        margin-top: 6px;
                        padding-top: 6px;
                        border-top: 1px solid #e4e4e7;
                        font-size: 11.5px;
                        font-weight: 700;
                        color: #52525b;
                    }
                    .invoice-total-box .payment-row-item.balance {
                        color: #000000;
                        font-weight: 900;
                        font-size: 12.5px;
                    }
                    .invoice-total-box .total-label {
                        font-size: 11px;
                        font-weight: 900;
                        letter-spacing: 1px;
                        color: #000000;
                        text-transform: uppercase;
                    }
                    .invoice-total-box .total-amount {
                        font-size: 24px;
                        font-weight: 900;
                        color: #000000;
                        font-family: monospace, monospace;
                    }
                    .invoice-total-box .total-sub-info {
                        margin-top: 8px;
                        padding-top: 6px;
                        border-top: 1px solid #e4e4e7;
                        font-size: 10.5px;
                        color: #71717a;
                        text-align: right;
                        font-weight: 600;
                    }
                    .invoice-store-box {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 16px;
                        background: #ffffff;
                        border: 1px solid #d4d4d8;
                        border-radius: 6px;
                        padding: 10px 16px;
                        margin-top: 14px;
                    }
                    .invoice-store-box img {
                        width: 54px;
                        height: 54px;
                        border-radius: 4px;
                        border: 1px solid #e4e4e7;
                        padding: 2px;
                        background: #ffffff;
                    }
                    .invoice-footer-line {
                        height: 1px;
                        background: #000000;
                        margin: 22px 0 10px;
                    }
                    .invoice-footer {
                        text-align: center;
                        font-size: 11.5px;
                        color: #52525b;
                    }
                    .invoice-footer .thank-you {
                        font-size: 13px;
                        font-weight: 800;
                        color: #000000;
                        margin-bottom: 2px;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .invoice-footer .footer-subtext {
                        margin: 0;
                        font-size: 10.5px;
                        color: #71717a;
                        font-weight: 500;
                    }
                    @media (max-width: 640px) {
                        body { padding: 0; background: #ffffff; }
                        .invoice-print-toolbar { padding: 10px 12px; margin-bottom: 0; }
                        .invoice-print-button { width: 100%; }
                        #invoice-document-root { padding: 14px; box-shadow: none; border: none; }
                        .admin-inv-top-banner,
                        .admin-inv-brand-wrapper,
                        .invoice-store-box,
                        .invoice-store-box > div {
                            align-items: flex-start !important;
                            flex-direction: column;
                        }
                        .admin-inv-badge-box { width: 100%; text-align: left; }
                        .invoice-details,
                        .invoice-bottom-grid { grid-template-columns: 1fr; }
                        .invoice-table { display: block; overflow-x: auto; white-space: nowrap; }
                        .invoice-total-box .total-row-item { align-items: flex-start; flex-direction: column; gap: 8px; }
                    }
                    @media print {
                        @page { size: A4 portrait; margin: 8mm; }
                        html, body { background: #ffffff !important; margin: 0 !important; padding: 0 !important; }
                        body { padding: 0 !important; }
                        .invoice-print-toolbar { display: none !important; }
                        #invoice-document-root { max-width: none; padding: 0; border: none; box-shadow: none; }
                        .admin-inv-top-banner,
                        .invoice-details,
                        .invoice-bottom-grid,
                        .invoice-store-box,
                        .invoice-footer { page-break-inside: avoid; }
                        .invoice-table tr { page-break-inside: avoid; }
                        * {
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }
                    }
                `;
            }

            function openInvoicePrintWindow(order) {
                const id = getField(order, ['ID Factura', 'ID Pedido', 'ID', 'id'], 'factura');
                const title = 'Factura-BLYXU-' + String(id).replace(/[^a-z0-9_-]/gi, '');
                const printWindow = window.open('', '_blank');
                if (!printWindow) return false;

                const baseUrl = window.location.href.replace(/[^/]*$/, '');
                printWindow.document.open();
                printWindow.document.write(`<!DOCTYPE html>
                    <html lang="es">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <base href="${escapeHtml(baseUrl)}">
                        <title>${escapeHtml(title)}</title>
                        <style>${getInvoiceDocumentStyles()}</style>
                    </head>
                    <body>
                        <div class="invoice-print-toolbar">
                            <button type="button" class="invoice-print-button" onclick="window.print()">Guardar / imprimir PDF</button>
                        </div>
                        <main id="invoice-document-root">${buildPrintableInvoice(order)}</main>
                        <script>
                            window.addEventListener('load', function () {
                                if (!/iPad|iPhone|iPod/.test(navigator.userAgent)) {
                                    setTimeout(function () { window.print(); }, 250);
                                }
                            });
                        <\/script>
</body>
                    </html>`);
                printWindow.document.close();
                return true;
            }

            window.downloadInvoicePdf = function(index) {
                const order = currentInvoices[index];
                const printArea = document.getElementById('invoice-print-area');
                if (!order || !printArea) return;

                if ((isIOSDevice() || window.matchMedia('(max-width: 760px)').matches) && openInvoicePrintWindow(order)) {
                    return;
                }

                const id = getField(order, ['ID Factura', 'ID Pedido', 'ID', 'id'], 'factura');
                const previousTitle = document.title;
                printArea.innerHTML = buildPrintableInvoice(order);
                document.body.classList.add('invoice-print-mode');
                document.title = 'Factura-BLYXU-' + String(id).replace(/[^a-z0-9_-]/gi, '');

                const cleanup = () => {
                    document.body.classList.remove('invoice-print-mode');
                    printArea.innerHTML = '';
                    document.title = previousTitle;
                    window.removeEventListener('afterprint', cleanup);
                };

                window.addEventListener('afterprint', cleanup);
                setTimeout(() => {
                    window.print();
                    setTimeout(cleanup, 1200);
                }, 100);
            };

            function renderCurrentView() {
                tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.ordersView === currentView));
                if (currentView === 'invoices') {
                    renderInvoices();
                } else {
                    renderOrders();
                }
            }

            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    currentView = tab.dataset.ordersView;
                    renderCurrentView();
                });
            });

            results.addEventListener('click', event => {
                const detailButton = event.target.closest('.order-details-toggle');
                if (detailButton) {
                    const card = detailButton.closest('.order-card');
                    const expanded = !card?.classList.contains('is-expanded');
                    card?.classList.toggle('is-expanded', expanded);
                    detailButton.setAttribute('aria-expanded', String(expanded));
                    detailButton.textContent = expanded ? 'Ocultar detalle' : 'Ver detalle completo';
                    syncStackStageHeight();
                    setTimeout(syncStackStageHeight, 340);
                    return;
                }
                const button = event.target.closest('[data-stack-dir]');
                if (!button) return;
                moveStack(Number(button.dataset.stackDir || 1));
            });

            results.addEventListener('touchstart', event => {
                const stage = event.target.closest('.orders-stack-stage');
                if (!stage || !event.touches.length) return;
                stackTouch = {
                    x: event.touches[0].clientX,
                    y: event.touches[0].clientY
                };
            }, { passive: true });

            results.addEventListener('touchend', event => {
                if (!stackTouch || !event.changedTouches.length) return;
                const dx = event.changedTouches[0].clientX - stackTouch.x;
                const dy = event.changedTouches[0].clientY - stackTouch.y;
                stackTouch = null;
                if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
                moveStack(dx < 0 ? 1 : -1);
            }, { passive: true });

            window.addEventListener('resize', syncStackStageHeight);

            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                const lookup = input.value.trim();
                const comparable = comparablePhone(lookup);
                const reference = onlyLetters(lookup);

                if (comparable.length < 7 && reference.length < 3) {
                    status.textContent = 'Escribe un número de contacto o referencia válido.';
                    panel.classList.remove('open');
                    return;
                }

                status.textContent = '';
                btn.disabled = true;
                btn.textContent = 'Buscando...';
                btn.classList.add('is-generating');
                input.classList.add('lookup-active');
                form.closest('.orders-login')?.classList.add('is-generating');

                try {
                    currentPhone = lookup;
                    [currentOrders, currentInvoices] = await Promise.all([
                        fetchOrdersByPhone(lookup),
                        fetchInvoicesByPhone(lookup)
                    ]);
                    stackIndexes.orders = 0;
                    stackIndexes.invoices = 0;
                    const firstRecord = currentOrders[0] || currentInvoices[0];
                    const totalRecords = currentOrders.length + currentInvoices.length;
                    const customer = firstRecord ? getField(firstRecord, ['Nombre Cliente', 'Nombre', 'Cliente'], 'Cliente BLYXU') : 'Cliente BLYXU';
                    const lookupLabel = /^[+\d\s().-]+$/.test(lookup) && comparable.length >= 7
                        ? 'contacto terminado en ' + comparable.slice(-4)
                        : 'referencia ' + lookup;
                    heading.textContent = totalRecords ? 'Panel de ' + customer : 'Sin registros';
                    summary.textContent = totalRecords === 1
                        ? '1 registro encontrado para ' + lookupLabel
                        : totalRecords + ' registros encontrados para ' + lookupLabel;
                    panel.classList.add('open');
                    currentView = currentOrders.length ? 'orders' : 'invoices';
                    renderCurrentView();
                } catch (error) {
                    status.textContent = error.message || 'No se pudo consultar el panel.';
                    panel.classList.remove('open');
                } finally {
                    btn.disabled = false;
                    btn.textContent = 'Ver mi panel';
                    btn.classList.remove('is-generating');
                    input.classList.remove('lookup-active');
                    form.closest('.orders-login')?.classList.remove('is-generating');
                }
            });

            let invoiceScanner = null;
            let scannerStarting = false;
            let scannerHandled = false;
            const scannerDialog = document.getElementById('orders-qr-dialog');
            const scannerError = document.getElementById('orders-qr-error');
            async function stopInvoiceScanner() {
                if (invoiceScanner?.isScanning) {
                    try { await invoiceScanner.stop(); } catch (_) {}
                }
            }
            document.getElementById('orders-qr-close').addEventListener('click', () => scannerDialog.close());
            scannerDialog.addEventListener('close', stopInvoiceScanner);
            document.getElementById('orders-scan-qr-btn').addEventListener('click', async () => {
                if (scannerStarting || invoiceScanner?.isScanning) return;
                scannerStarting = true;
                scannerHandled = false;
                scannerError.textContent = '';
                scannerDialog.showModal();
                try {
                    if (!window.Html5Qrcode) {
                        await new Promise((resolve, reject) => {
                            const script = document.createElement('script');
                            script.src = 'html5-qrcode.min.js';
                            script.onload = resolve;
                            script.onerror = reject;
                            document.head.appendChild(script);
                        });
                    }
                    if (!scannerDialog.open) return;
                    invoiceScanner ||= new Html5Qrcode('orders-qr-reader');
                    await invoiceScanner.start({ facingMode: 'environment' }, { fps: 12, videoConstraints: window.BlyxuQrCamera.constraints() }, async decoded => {
                        if (scannerHandled || !scannerDialog.open) return;
                        let reference = String(decoded || '').trim();
                        try {
                            const url = new URL(reference);
                            if (url.origin !== window.location.origin || !url.pathname.endsWith('/facturas-pedidos.html')) {
                                scannerError.textContent = 'Este QR no corresponde a un pedido o factura BLYXU.';
                                return;
                            }
                            reference = url.searchParams.get('buscar') || '';
                        } catch (_) {}
                        if (!reference || reference.length > 200 || /^https?:/i.test(reference)) {
                            scannerError.textContent = 'No se encontró una referencia válida en el QR.';
                            return;
                        }
                        scannerHandled = true;
                        await stopInvoiceScanner();
                        scannerDialog.close();
                        input.value = reference;
                        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    }, () => {});
                    if (!scannerDialog.open) await stopInvoiceScanner();
                    else await window.BlyxuQrCamera.scanner(invoiceScanner, document.getElementById('orders-qr-reader'));
                } catch (_) {
                    scannerError.textContent = 'No se pudo abrir la cámara. Permite el acceso o escribe la referencia de tu factura.';
                } finally { scannerStarting = false; }
            });

            verifyMercadoPagoReturn();

            const initialLookup = new URLSearchParams(window.location.search).get('buscar');
            if (initialLookup) {
                input.value = initialLookup;
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }
        });
