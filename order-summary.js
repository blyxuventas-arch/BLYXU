/* Resumen visual local: no factura, no confirma pagos ni reserva existencias. */
(() => {
    'use strict';
    let libraryPromise, qrPromise;
    const imageCache = new Map();
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
            contact: [record?.Telefono || record?.['Teléfono'], record?.Email, record?.Direccion || record?.['Dirección'], record?.Ciudad].filter(Boolean).map(clean).join(' · '),
            note: clean(record?.['Nota Cliente']),
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
    function imageData(value, timeoutMs = 4000) {
        const src = value && safeImage(value);
        if (!src) return Promise.resolve(null);
        if(imageCache.has(src))return imageCache.get(src);
        const pending = new Promise(resolve => {
            const img = new Image();
            let finished = false;
            const done = result => { if (finished) return; finished = true; clearTimeout(timer); img.onload = img.onerror = null; resolve(result); };
            const timer = setTimeout(() => done(null), timeoutMs);
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
        imageCache.set(src,pending);
        if(imageCache.size>60)imageCache.delete(imageCache.keys().next().value);
        pending.then(result=>{if(!result && imageCache.get(src)===pending)imageCache.delete(src);});
        return pending;
    }
    async function loadItemImages(items) {
        const images = new Array(items.length).fill(null), deadline = performance.now()+5000;
        let next=0;
        async function worker(){while(next<items.length){const index=next++;const remaining=deadline-performance.now();if(remaining<=0)return;images[index]=await imageData(items[index].img || items[index].imagen,Math.min(4000,remaining));}}
        await Promise.all(Array.from({length:Math.min(4,items.length)},worker));
        return images;
    }
    function prepareViewer() {
        const viewer = window.open('', '_blank');
        if (!viewer) throw new Error('Permite abrir una pestaña nueva para ver el comprobante y vuelve a intentarlo.');
        viewer.opener = null;
        viewer.document.title = 'Comprobante de pedido · BLYXU';
        viewer.document.body.textContent = 'Preparando tu comprobante privado…';
        return viewer;
    }
    async function loadQr() {
        if (window.qrcode) return;
        if(qrPromise)return qrPromise;
        qrPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'qrcode-local.js?v=2.0.4';
            script.onload = () => window.qrcode ? resolve() : reject(new Error('No se pudo preparar el QR.'));
            script.onerror = () => reject(new Error('No se pudo preparar el QR del pedido.'));
            document.head.append(script);
        }).catch(error=>{qrPromise=null;throw error;});
        return qrPromise;
    }
    function warmup(){return Promise.all([loadLibrary(),loadQr()]);}
    async function download(summary, button, authorizeBeforeSave, reservedViewer) {
        if (!summary?.items?.length) throw new Error('Añade productos al carrito para generar el resumen.');
        if (button?.disabled) return;
        const viewer = reservedViewer || prepareViewer();
        const original = button?.textContent;
        if (button) { button.disabled = true; button.textContent = 'Preparando PDF…'; }
        try {
            const [Pdf, , preparedImages] = await Promise.all([loadLibrary(), summary.registered ? loadQr() : Promise.resolve(), loadItemImages(summary.items)]);
            const pdf = new Pdf({compress:true,unit: 'mm', format: 'a4'});
            const text = (value, x, y, size = 10, weight = 'normal', color = 45) => {
                pdf.setFont('helvetica', weight); pdf.setFontSize(size); pdf.setTextColor(color);
                pdf.text(clean(value), x, y);
            };
            let y = 18;
            text('BLYXU', 16, y, 20, 'bold');
            text('COMPROBANTE DE PEDIDO · ' + clean(summary.mode), 16, y += 9, 10);
            text(summary.registered ? 'Pedido realizado y registrado' : 'Selección del carrito · Sin registrar', 16, y += 11, 15, 'bold');
            if (summary.registered) text('Referencia: ' + clean(summary.id), 16, y += 7, 10);
            const date = new Date(summary.date || Date.now());
            const dateLabel = Number.isNaN(date.getTime()) ? 'Fecha no disponible' : date.toLocaleString('es-CO', {timeZone:'America/Bogota', dateStyle:'medium', timeStyle:'short'});
            text((summary.registered ? 'Fecha de registro: ' : 'Fecha del resumen: ') + dateLabel + ' (Colombia)', 16, y += 7, 9);
            if (summary.customer) text('Cliente: ' + summary.customer, 16, y += 7, 10);
            for (const value of [summary.contact, summary.note ? 'Observaciones: '+summary.note : ''].filter(Boolean)) {
                pdf.setFontSize(9);
                const lines=pdf.splitTextToSize(clean(value),178);
                if(y+lines.length*5>245){pdf.addPage();y=20;}
                pdf.text(lines,16,y+=7);y+=(lines.length-1)*5;
            }
            text(summary.consultation ? 'Consulta pendiente de respuesta y confirmación.' : 'Pendiente de confirmar disponibilidad, envío y pago.', 16, y += 9, 10);
            y += 10;
            const items = summary.items;
            let missingImages = 0;
            // Procesar en grupos pequeños evita saturar la cámara/memoria del móvil.
            for (let start = 0; start < items.length; start += 4) {
                const batch = items.slice(start, start + 4);
                const images = preparedImages.slice(start,start+4);
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
            text('Este documento resume los productos solicitados.', 16, y += 10, 9);
            text('No constituye una factura de venta ni un comprobante de pago.', 16, y += 6, 9);
            text('BLYXU te contactará para confirmar disponibilidad y envío.', 16, y += 6, 9);
            if (summary.registered && summary.id) {
                await loadQr();
                const url = new URL('https://blyxu.online/facturas-pedidos.html');
                url.searchParams.set('buscar', summary.id);
                const qr = window.qrcode(0, 'M'); qr.addData(url.href); qr.make();
                if (y + 48 > 270) { pdf.addPage(); y = 20; }
                pdf.addImage(qr.createDataURL(5, 16), 'GIF', 16, y + 5, 35, 35);
                text('Consulta de pedido', 57, y + 15, 11, 'bold');
                text('Escanea el QR para consultar por referencia.', 57, y + 22, 9);
                text('Referencia: ' + summary.id, 57, y + 29, 8);
                pdf.link(16, y + 5, 178, 35, {url:url.href});
            }
            for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
                pdf.setPage(page); text('BLYXU · ' + page + ' / ' + pdf.getNumberOfPages(), 16, 285, 8, 'normal', 120);
            }
            if(authorizeBeforeSave)await authorizeBeforeSave();
            if (viewer.closed) throw new Error('Cerraste la pestaña del comprobante. Vuelve a abrirlo.');
            const pdfUrl = URL.createObjectURL(pdf.output('blob'));
            viewer.location.replace(pdfUrl);
            setTimeout(() => URL.revokeObjectURL(pdfUrl), 600000);
            if (missingImages && button) {
                const status = document.getElementById('cart-summary-pdf-status');
                if (status) status.textContent = 'PDF abierto. Algunas imágenes no pudieron cargarse; sus códigos y opciones están incluidos.';
            }
        } catch (error) { if (!viewer.closed) viewer.close(); throw error; }
        finally { if (button) { button.disabled = false; button.textContent = original; } }
    }
    window.BlyxuOrderSummary = {fromRecord, download, prepareViewer, warmup};
})();
