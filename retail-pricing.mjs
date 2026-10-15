export const RETAIL_PERCENT_KEY = 'Inventario_Porcentaje_Minorista';
export const RETAIL_MODE_KEY = 'Modo Precio Minorista';
export function parsePercent(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const raw = String(value).trim().replace(',', '.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error('Escribe un porcentaje positivo con hasta dos decimales.');
    const n = Number(raw);
    if (!Number.isFinite(n) || n > 10000) throw new Error('El porcentaje debe estar entre 0 y 10.000.');
    return n;
}
export function retailMode(product = {}) {
    const mode = product[RETAIL_MODE_KEY];
    if (mode === 'manual' || mode === 'percentage') return mode;
    if (mode && String(mode).trim()) throw new Error('Selecciona porcentaje general o precio manual.');
    return Number(product.Precio ?? product.precio ?? 0) > 0 ? 'manual' : 'percentage';
}
export function calculateRetail(wholesale, percent) {
    const base = Number(wholesale), rate = parsePercent(percent);
    if (!Number.isFinite(base) || base <= 0) throw new Error('Para aplicar porcentaje necesitas un precio mayorista mayor que cero.');
    if (rate === null) throw new Error('Primero guarda el porcentaje general en Inventario.');
    const result = Math.round(base * (1 + rate / 100));
    if (!Number.isSafeInteger(result)) throw new Error('El precio calculado es demasiado grande.');
    return result;
}
export function priceRecord(product, percent) {
    const mode = retailMode(product);
    if (mode === 'manual') return {...product, [RETAIL_MODE_KEY]: mode};
    return {...product, [RETAIL_MODE_KEY]: mode, Precio: calculateRetail(product['Precio Mayor'] ?? product.Precio_Mayorista ?? 0, percent)};
}
