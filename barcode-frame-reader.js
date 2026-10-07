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
    function start({ video, container, formats, onDetected }) {
        if (!video || !container || !window.Html5Qrcode) return () => {};
        let closed = false, busy = false, timer = 0, preferredVariant = 0;
        const decoderHost = document.createElement('div');
        decoderHost.id = 'barcode-frame-decoder-' + Math.random().toString(36).slice(2);
        decoderHost.hidden = true; container.append(decoderHost);
        const decoder = new window.Html5Qrcode(decoderHost.id, { formatsToSupport: formats, useBarCodeDetectorIfSupported: false });
        const controls = document.createElement('section'); controls.className = 'barcode-frame-controls';
        controls.innerHTML = '<p data-frame-status aria-live="polite">Captura y análisis automáticos activos. Centra el código, deja visibles todas las barras y sus márgenes blancos. Acerca o aleja hasta que las líneas se vean nítidas y mantenlo quieto. No necesitas pulsar ningún botón.</p><p>Se analiza toda la imagen y también recortes del centro. Las capturas se procesan solo en este dispositivo.</p>';
        container.append(controls);
        const message = controls.querySelector('[data-frame-status]');
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
            if (!busy && !document.hidden && video.readyState >= 2) {
                busy = true;
                try {
                    // Freeze one frame automatically, then scan every enhanced version.
                    const still = document.createElement('canvas');
                    still.width = video.videoWidth; still.height = video.videoHeight;
                    if (!still.width || !still.height) throw new Error('Esperando imagen de la cámara.');
                    still.getContext('2d').drawImage(video, 0, 0);
                    const variants = [preferredVariant, ...[0, 1, 2, 3, 4].filter(v => v !== preferredVariant)];
                    for (const variant of variants) {
                        if (!active() || document.hidden) break;
                        const result = await decodeCanvas(prepare(still, variant));
                        if (active() && result?.text) {
                            preferredVariant = variant;
                            message.textContent = 'Código detectado automáticamente. Mantenlo quieto para confirmar la lectura.';
                            onDetected(result.text, result.format);
                            break; // One vote per captured frame, never one per crop.
                        }
                    }
                } catch (_) {} finally { busy = false; if (closed) cleanup(); }
            }
            if (active()) timer = setTimeout(tick, 250);
        }
        tick();
        return () => { closed = true; clearTimeout(timer); if (!busy) cleanup(); };
    }
    window.BlyxuBarcodeFrames = { start, prepare };
})();
