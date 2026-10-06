/* Resumen visual local: no factura, no confirma pagos ni reserva existencias. */
(() => {
    'use strict';
    let libraryPromise;
    const clean = value => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 500);
    const money = value => '$' + (Number(value) || 0).toLocaleString('es-CO');
    function fromRecord(record) {
        let items = record?.['Productos JSON'] || record?.items || [];
        if (typeof items === 'string') { try { items = JSON.parse(items); } catch (_) { items = []; } }
        return {
            registered: Boolean(record?.['ID Pedido']),
            id: clean(record?.['ID Pedido']),
            mode: record?.['Tipo Cliente'] === 'Mayor' ? 'Mayorista' : 'Minorista',
            date: record?.Fecha || record?.['Fecha Registro'] || record?.summaryCreatedAt || '',
            consultation: /consulta/i.test(record?.['Estado Pedido'] || ''),
            customer: clean(record?.['Nombre Cliente']),
            items: Array.isArray(items) ? items : [],
            total: Number(record?.Subtotal) || 0
        };
    }
    function loadLibrary() {
        if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
        if (libraryPromise) return libraryPromise;
        libraryPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'jspdf.umd.min.js?v=2.5.1';
            script.referrerPolicy = 'no-referrer';
            script.onload = () => window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('No se pudo preparar el PDF.'));
            script.onerror = () => { script.remove(); reject(new Error('No se pudo cargar el PDF. Revisa tu conexión e inténtalo otra vez.')); };
            document.head.append(script);
        }).catch(error => { libraryPromise = null; throw error; });
        return libraryPromise;
    }
    function safeImage(value) {
        try {
            const url = new URL(value, location.href);
            if (url.hostname === 'drive.google.com') {
                const id = url.searchParams.get('id') || url.pathname.match(/\/file\/d\/([^/]+)/)?.[1];
                if (id) return 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(id) + '=w420';
            }
            return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
        } catch (_) { return ''; }
    }
    function imageData(value) {
        const src = value && safeImage(value);
        if (!src) return Promise.resolve(null);
        return new Promise(resolve => {
            const img = new Image();
            let finished = false;
            const done = result => { if (finished) return; finished = true; clearTimeout(timer); img.onload = img.onerror = null; resolve(result); };
            const timer = setTimeout(() => done(null), 8000);
            img.crossOrigin = 'anonymous';
            img.referrerPolicy = 'no-referrer';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const ratio = Math.min(320 / img.naturalWidth, 320 / img.naturalHeight, 1);
                    canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
                    canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    done({data: canvas.toDataURL('image/jpeg', 0.88), ratio: canvas.width / canvas.height});
                } catch (_) { done(null); }
            };
            img.onerror = () => done(null);
            img.src = src;
        });
    }
    async function download(summary, button) {
        if (!summary?.items?.length) throw new Error('Añade productos al carrito para generar el resumen.');
        if (button?.disabled) return;
        const original = button?.textContent;
        if (button) { button.disabled = true; button.textContent = 'Preparando PDF…'; }
        try {
            const Pdf = await loadLibrary();
            const pdf = new Pdf({unit: 'mm', format: 'a4'});
            const text = (value, x, y, size = 10, weight = 'normal', color = 45) => {
                pdf.setFont('helvetica', weight); pdf.setFontSize(size); pdf.setTextColor(color);
                pdf.text(clean(value), x, y);
            };
            let y = 18;
            text('BLYXU', 16, y, 20, 'bold');
            text('RESUMEN VISUAL · ' + clean(summary.mode), 16, y += 9, 10);
            text(summary.registered ? 'Pedido realizado y registrado' : 'Selección del carrito · Sin registrar', 16, y += 11, 15, 'bold');
            if (summary.registered) text('Referencia: ' + clean(summary.id), 16, y += 7, 10);
            const date = new Date(summary.date || Date.now());
            const dateLabel = Number.isNaN(date.getTime()) ? 'Fecha no disponible' : date.toLocaleString('es-CO', {timeZone:'America/Bogota', dateStyle:'medium', timeStyle:'short'});
            text((summary.registered ? 'Fecha de registro: ' : 'Fecha del resumen: ') + dateLabel + ' (Colombia)', 16, y += 7, 9);
            if (summary.customer) text('Cliente: ' + summary.customer, 16, y += 7, 10);
            text(summary.consultation ? 'Consulta pendiente de respuesta y confirmación.' : 'Pendiente de confirmar disponibilidad, envío y pago.', 16, y += 9, 10);
            y += 10;
            const items = summary.items;
            let missingImages = 0;
            // Procesar en grupos pequeños evita saturar la cámara/memoria del móvil.
            for (let start = 0; start < items.length; start += 4) {
                const batch = items.slice(start, start + 4);
                const images = await Promise.all(batch.map(item => imageData(item.img || item.imagen)));
                for (let offset = 0; offset < batch.length; offset++) {
                    const item = batch[offset], picture = images[offset];
                    const name = clean(item.nombre || item.name || 'Producto');
                    const code = clean(item.sku || item.idVariacion || item.id || 'Sin código');
                    const option = clean(item.opcion || item.variantLabel);
                    const extras = [option, item.color ? 'Color: ' + clean(item.color) : '', item.talla ? 'Talla / tamaño: ' + clean(item.talla) : ''].filter(Boolean).join(' · ');
                    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
                    const titleLines = pdf.splitTextToSize(name, 127);
                    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
                    const metaLines = pdf.splitTextToSize('Código: ' + code + (extras ? '\n' + extras : ''), 127);
                    const height = Math.max(38, 21 + titleLines.length * 5 + metaLines.length * 4);
                    if (y + height > 265) { pdf.addPage(); y = 20; text('BLYXU · Resumen visual', 16, 12, 9); }
                    pdf.setDrawColor(215); pdf.line(16, y, 194, y);
                    if (picture) {
                        const w = Math.min(29, 29 * picture.ratio), h = w / picture.ratio;
                        pdf.addImage(picture.data, 'JPEG', 16 + (29 - w) / 2, y + 5 + (29 - h) / 2, w, h);
                    } else { text('Sin imagen', 17, y + 18, 8, 'normal', 130); missingImages++; }
                    pdf.setFont('helvetica','bold'); pdf.setFontSize(11); pdf.setTextColor(35); pdf.text(titleLines, 51, y + 7);
                    let rowY = y + 7 + titleLines.length * 5;
                    pdf.setFont('helvetica','normal'); pdf.setFontSize(9); pdf.text(metaLines, 51, rowY);
                    rowY += metaLines.length * 4 + 4;
                    const quantity = Math.max(1, Number(item.cantidad ?? item.qty) || 1);
                    const quoted = summary.consultation || item.precioEstado === 'Por consultar' || item.priceVisible === false || Number(item.precio ?? item.price) <= 0;
                    text('Cantidad: ' + quantity + '  |  ' + (quoted ? 'Precio: por consultar' : 'Unidad: ' + money(item.precio ?? item.price) + '  |  Subtotal: ' + money(quantity * Number(item.precio ?? item.price))), 51, rowY, 9);
                    y += height;
                }
            }
            if (y > 238) { pdf.addPage(); y = 20; }
            pdf.setDrawColor(190); pdf.line(16, y, 194, y);
            text('Productos: ' + items.reduce((sum, item) => sum + Math.max(1, Number(item.cantidad ?? item.qty) || 1), 0), 16, y += 8, 11, 'bold');
            const unpriced = summary.consultation || items.some(item => item.precioEstado === 'Por consultar' || item.priceVisible === false || Number(item.precio ?? item.price) <= 0);
            text(unpriced ? 'Valor pendiente de cotización' : 'Valor de productos: ' + money(summary.total), 16, y += 7, 11, 'bold');
            text('Este resumen no es una factura ni un comprobante de pago.', 16, y += 10, 9);
            text('El envío y la disponibilidad se confirman con BLYXU por WhatsApp.', 16, y += 6, 9);
            for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
                pdf.setPage(page); text('BLYXU · ' + page + ' / ' + pdf.getNumberOfPages(), 16, 285, 8, 'normal', 120);
            }
            pdf.save('BLYXU-' + (clean(summary.id) || 'carrito').replace(/[^a-zA-Z0-9_-]/g, '-') + '.pdf');
            if (missingImages && button) {
                const status = document.getElementById('cart-summary-pdf-status');
                if (status) status.textContent = 'PDF descargado. Algunas imágenes no pudieron cargarse; sus códigos y opciones están incluidos.';
            }
        } finally { if (button) { button.disabled = false; button.textContent = original; } }
    }
    window.BlyxuOrderSummary = {fromRecord, download};
})();
