/* Local frame analysis for desktop webcams. Images never leave the browser. */
(function () {
    'use strict';
    function prepare(source, variant) {
        const width = source.videoWidth || source.naturalWidth || source.width;
        const height = source.videoHeight || source.naturalHeight || source.height;
        if (!width || !height) throw new Error('La cámara todavía no entrega imagen.');
        const region = variant === 0 ? [0, 0, width, height]
            : variant === 1 || variant === 2 ? [width * .06, height * .30, width * .88, height * .40]
            : [width * .18, height * .10, width * .64, height * .80];
        const rotated = variant === 4;
        const scale = Math.min(2, 1600 / Math.max(region[2], region[3]));
        const w = Math.round(region[2] * scale), h = Math.round(region[3] * scale);
        const canvas = document.createElement('canvas');
        canvas.width = rotated ? h : w; canvas.height = rotated ? w : h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        if (rotated) { ctx.translate(h, 0); ctx.rotate(Math.PI / 2); }
        ctx.drawImage(source, ...region, 0, 0, w, h);
        if (variant === 2 || variant === 3) {
            const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = image.data, histogram = new Uint32Array(256);
            for (let i = 0; i < pixels.length; i += 4) histogram[Math.round(.299 * pixels[i] + .587 * pixels[i + 1] + .114 * pixels[i + 2])]++;
            const total = pixels.length / 4; let sum = 0, low = 0, high = 255;
            for (let i = 0; i < 256; i++) { sum += histogram[i]; if (sum >= total * .03) { low = i; break; } }
            sum = 0;
            for (let i = 255; i >= 0; i--) { sum += histogram[i]; if (sum >= total * .03) { high = i; break; } }
            const range = Math.max(32, high - low);
            for (let i = 0; i < pixels.length; i += 4) {
                const gray = Math.round(.299 * pixels[i] + .587 * pixels[i + 1] + .114 * pixels[i + 2]);
                const value = Math.max(0, Math.min(255, (gray - low) * 255 / range));
                pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
            }
            ctx.putImageData(image, 0, 0);
        }
        return canvas;
    }
    function fileFromCanvas(canvas) {
        return new Promise((resolve, reject) => canvas.toBlob(blob => blob
            ? resolve(new File([blob], 'fotograma.png', { type: 'image/png' }))
            : reject(new Error('No se pudo capturar la imagen.')), 'image/png'));
    }
    function decoded(result) {
        return { text: result.decodedText || '', format: result.result?.format?.formatName || '' };
    }
    function start({ video, container, formats, onDetected, onCaptured }) {
        if (!video || !container || !window.Html5Qrcode) return () => {};
        let closed = false, busy = false, frozen = null, sequence = 0, timer = 0;
        const decoderHost = document.createElement('div');
        decoderHost.id = 'barcode-frame-decoder-' + Math.random().toString(36).slice(2);
        decoderHost.hidden = true; container.append(decoderHost);
        const decoder = new window.Html5Qrcode(decoderHost.id, { formatsToSupport: formats, useBarCodeDetectorIfSupported: false });
        const controls = document.createElement('section'); controls.className = 'barcode-frame-controls';
        controls.innerHTML = '<div class="barcode-frame-actions"><button type="button" class="admin-btn secondary" data-frame-capture>Capturar y analizar</button><button type="button" class="admin-btn secondary" data-frame-resume hidden>Volver a cámara en vivo</button></div><p data-frame-status aria-live="polite">Análisis automático de fotogramas: recorte, contraste y orientación. Las imágenes se procesan solo en este dispositivo.</p><img data-frame-preview alt="Captura del código para revisar su lectura" hidden>';
        container.append(controls);
        const capture = controls.querySelector('[data-frame-capture]'), resume = controls.querySelector('[data-frame-resume]');
        const message = controls.querySelector('[data-frame-status]'), preview = controls.querySelector('[data-frame-preview]');
        const active = () => !closed && container.isConnected && video.isConnected;
        function cleanup() { try { decoder.clear(); } catch (_) {} decoderHost.remove(); controls.remove(); }
        async function decodeCanvas(canvas) {
            try {
                const file = await fileFromCanvas(canvas);
                if (!active()) return null;
                return decoded(await decoder.scanFileV2(file, false));
            } catch (_) { return null; }
            finally { if (closed) cleanup(); }
        }
        async function tick() {
            if (!active()) return;
            if (!busy && !frozen && !document.hidden && video.readyState >= 2) {
                busy = true;
                try {
                    const result = await decodeCanvas(prepare(video, sequence++ % 5));
                    if (active() && !frozen && result?.text) onDetected(result.text, result.format);
                } catch (_) {} finally { busy = false; }
            }
            if (active()) timer = setTimeout(tick, 650);
        }
        capture.addEventListener('click', async () => {
            if (busy || !active()) { message.textContent = 'Espera un instante y vuelve a capturar.'; return; }
            busy = true; capture.disabled = true; resume.disabled = true;
            try {
                // Capture once: every enhanced pass uses exactly the same picture.
                const still = document.createElement('canvas'); still.width = video.videoWidth; still.height = video.videoHeight;
                if (!still.width || !still.height) throw new Error('Espera a que aparezca la imagen de la cámara.');
                still.getContext('2d').drawImage(video, 0, 0); frozen = still;
                preview.src = still.toDataURL('image/jpeg', .85); preview.hidden = false; resume.hidden = false;
                message.textContent = 'Analizando captura: imagen completa, recortes, contraste y giro…';
                let result = null;
                for (let i = 0; i < 5 && active(); i++) { result = await decodeCanvas(prepare(still, i)); if (result?.text) break; }
                if (!active()) return;
                if (result?.text) { onCaptured(result.text, result.format); message.textContent = 'Código leído. Revisa la referencia y pulsa Confirmar para usarla.'; }
                else message.textContent = 'No pude leer esta captura. Vuelve a la cámara, mejora la luz o el enfoque y captura otra vez. Si solo hay una referencia escrita, introdúcela manualmente; no se inventan códigos.';
            } catch (error) { if (active()) message.textContent = error.message; }
            finally { busy = false; capture.disabled = false; resume.disabled = false; }
        });
        resume.addEventListener('click', () => { frozen = null; preview.removeAttribute('src'); preview.hidden = true; resume.hidden = true; message.textContent = 'Análisis automático activo. Mantén el código completo y enfocado.'; });
        tick();
        return () => { closed = true; clearTimeout(timer); frozen = null; preview.removeAttribute('src'); if (!busy) cleanup(); };
    }
    window.BlyxuBarcodeFrames = { start, prepare };
})();
