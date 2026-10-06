/* Camera tuning stays on the device; unsupported controls are optional. */
window.BlyxuQrCamera = {
    constraints(deviceId = '') {
        return { width: { ideal: 1920 }, height: { ideal: 1080 },
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }) };
    },
    async tune({ capabilities, apply, container }) {
        let caps;
        try { caps = capabilities(); } catch (_) { return; }
        if (caps.focusMode?.includes('continuous')) {
            try { await apply({ advanced: [{ focusMode: 'continuous' }] }); } catch (_) {}
        }
        if (!container?.isConnected) return;
        container.querySelector('.qr-camera-controls')?.remove();
        const controls = document.createElement('div');
        controls.className = 'qr-camera-controls';
        const hint = document.createElement('p');
        hint.textContent = 'Mantén el código completo a la vista y espera a que enfoque. Evita reflejos; no lo pegues a la cámara.';
        controls.append(hint);
        if (Number.isFinite(caps.zoom?.min) && caps.zoom.max > caps.zoom.min) {
            const label = document.createElement('label');
            label.textContent = 'Acercamiento de cámara';
            const slider = document.createElement('input');
            slider.type = 'range'; slider.min = caps.zoom.min; slider.max = Math.min(caps.zoom.max, 4);
            slider.max = Math.max(Number(slider.max), caps.zoom.min);
            slider.step = caps.zoom.step || 0.1;
            slider.value = Math.min(Number(slider.max), Math.max(caps.zoom.min, 1));
            slider.setAttribute('aria-label', 'Acercamiento de cámara');
            slider.addEventListener('change', async () => {
                slider.disabled = true;
                try { await apply({ advanced: [{ zoom: Number(slider.value) }] }); }
                catch (_) { hint.textContent = 'Esta cámara no permite ajustar el acercamiento. Prueba con mejor luz o usa la referencia manual.'; }
                finally { slider.disabled = false; }
            });
            label.append(slider); controls.append(label);
        }
        container.append(controls);
    },
    async scanner(scanner, container) {
        await this.tune({ capabilities: () => scanner.getRunningTrackCapabilities(),
            apply: constraints => scanner.applyVideoConstraints(constraints), container });
    },
    async stream(stream, container) {
        const track = stream?.getVideoTracks?.()[0];
        if (track?.getCapabilities && track?.applyConstraints)
            await this.tune({ capabilities: () => track.getCapabilities(), apply: constraints => track.applyConstraints(constraints), container });
    }
};
