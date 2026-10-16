// Text options are the default. A product may explicitly enable photo options.
function shouldShowVariantPhoto(product) {
    return ['si','sí','true','1'].includes(String(product?.['Mostrar Foto Variante'] ?? '').trim().toLowerCase());
}
