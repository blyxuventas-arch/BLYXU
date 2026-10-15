/* ZXing-C++ runs only here. No camera images are uploaded. */
'use strict';
importScripts('vendor/zxing-wasm-3.1.4/reader.js');
const ready = ZXingWASM.prepareZXingModule({
    overrides: { locateFile: path => new URL('vendor/zxing-wasm-3.1.4/' + path, self.location.href).href },
    fireImmediately: true
});
ready.then(() => postMessage({type:'ready'})).catch(() => postMessage({type:'fatal',error:'No se pudo iniciar el lector rápido.'}));
let busy = false;
self.onmessage = async ({data}) => {
    if (data.type !== 'frame' || busy) return;
    busy = true;
    try {
        await ready;
        const image = new ImageData(new Uint8ClampedArray(data.buffer), data.width, data.height);
        const results = await ZXingWASM.readBarcodes(image, {
            formats: data.qrOnly ? ['QRCode'] : ['QRCode','EANUPC','Code128','Code39','Code93','Codabar','ITF','DataMatrix','PDF417','Aztec'],
            tryHarder: data.harder === true, tryRotate:true, tryInvert:true, tryDownscale:true,
            minLineCount:2, maxNumberOfSymbols:1, returnErrors:false
        });
        const result = results.find(item => item.isValid && item.text);
        postMessage({type:'result',id:data.id,text:result?.text||'',format:result?.format||''});
    } catch (_) {
        postMessage({type:'result',id:data.id,error:true});
    } finally { busy = false; }
};
