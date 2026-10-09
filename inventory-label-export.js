/* Export the complete on-screen label locally; nothing is uploaded. */
(() => {
    let cachedKey = '', cachedImage = null;
    const notify = (text, type = 'info') => window.showToast?.(text, type);
    async function setPrintResolution(blob) {
        const bytes = new Uint8Array(await blob.arrayBuffer()), view = new DataView(bytes.buffer);
        const chunk = new Uint8Array(21), data = new DataView(chunk.buffer);
        data.setUint32(0,9); chunk.set([112,72,89,115],4); // PNG pHYs
        data.setUint32(8,Math.round(600/0.0254)); data.setUint32(12,Math.round(600/0.0254)); chunk[16]=1;
        let crc=0xffffffff;
        for(let i=4;i<17;i++){crc^=chunk[i];for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
        data.setUint32(17,(crc^0xffffffff)>>>0);
        for(let offset=8;offset+12<=bytes.length;){
            const length=view.getUint32(offset);
            if(bytes[offset+4]===112&&bytes[offset+5]===72&&bytes[offset+6]===89&&bytes[offset+7]===115)
                return new Blob([bytes.slice(0,offset),chunk,bytes.slice(offset+length+12)],{type:'image/png'});
            offset+=length+12;
        }
        return new Blob([bytes.slice(0,33),chunk,bytes.slice(33)],{type:'image/png'});
    }
    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('No se pudo cargar el logo o el QR de la etiqueta'));
            image.src = src;
        });
    }
    async function renderLabel(label) {
        const bounds = label.getBoundingClientRect(), scale = 600 / 96;
        if (!bounds.width || !bounds.height) throw new Error('Abre primero la etiqueta del producto');
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bounds.width * scale);
        canvas.height = Math.round(bounds.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, bounds.width, bounds.height);
        const text = [], pictures = [];
        // Read each character's actual layout, including wrapped IDs and references.
        const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            if (!node.textContent.trim()) continue;
            const style = getComputedStyle(node.parentElement), fontSize = Number.parseFloat(style.fontSize);
            for (let index = 0; index < node.length; index++) {
                const range = document.createRange(); range.setStart(node, index); range.setEnd(node, index + 1);
                const rect = range.getBoundingClientRect();
                const parentBounds = node.parentElement.getBoundingClientRect();
                if (!rect.width || rect.top >= parentBounds.bottom || rect.bottom > bounds.bottom) continue;
                text.push({character:node.textContent[index],x:rect.left-bounds.left,y:rect.top-bounds.top+(rect.height-fontSize)/2+fontSize*.8,font:`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,color:style.color});
            }
        }
        label.querySelectorAll('img').forEach(image => {
            const rect = image.getBoundingClientRect(), style = getComputedStyle(image);
            pictures.push({src:image.src,x:rect.left-bounds.left,y:rect.top-bounds.top,width:rect.width,height:rect.height,filter:style.filter,left:style.objectPosition.startsWith('0%')||style.objectPosition.startsWith('left')});
        });
        const images = await Promise.all(pictures.map(picture => loadImage(picture.src)));
        pictures.forEach((picture,index) => {
            const image = images[index], ratio = Math.min(picture.width/image.naturalWidth,picture.height/image.naturalHeight);
            const width = image.naturalWidth*ratio, height = image.naturalHeight*ratio;
            ctx.save(); ctx.filter = picture.filter; ctx.imageSmoothingEnabled = index !== 0;
            ctx.drawImage(image,picture.x+(picture.left?0:(picture.width-width)/2),picture.y+(picture.height-height)/2,width,height); ctx.restore();
        });
        text.forEach(item => {ctx.font=item.font;ctx.fillStyle=item.color;ctx.fillText(item.character,item.x,item.y);});
        const blob = await new Promise((resolve,reject) => canvas.toBlob(blob => blob?resolve(blob):reject(new Error('No se pudo crear la imagen')), 'image/png'));
        return setPrintResolution(blob);
    }
    window.prepareInventoryLabelImage = () => {
        const label = document.querySelector('#inventory-label-preview .iq-label');
        if (!label) return Promise.reject(new Error('No se encontró la etiqueta'));
        const key = label.outerHTML;
        if (key !== cachedKey || !cachedImage) {
            cachedKey = key;
            cachedImage = renderLabel(label).catch(error => { if (cachedKey === key) cachedImage = null; throw error; });
        }
        return cachedImage;
    };
    function fileName() {
        const reference = document.getElementById('inventory-qr-modal')?.dataset.reference || 'producto';
        const label = document.querySelector("#inventory-label-preview .iq-label"); return `Etiqueta-${reference.replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,90)}-${label?.dataset.width || 50}x${label?.dataset.height || 30}.png`;
    }
    function download(blob) {
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = fileName(); document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    window.downloadInventoryLabelImage = async () => {
        try { download(await window.prepareInventoryLabelImage()); }
        catch (error) { notify(error.message,'error'); }
    };
    window.shareInventoryLabelImage = async () => {
        window.open('https://wa.me/573222431225', '_blank', 'noopener');
        try {
            download(await window.prepareInventoryLabelImage());
            notify('Imagen descargada. Adjunta el PNG en el chat de WhatsApp del 3222431225.');
        } catch (error) { notify(error.message,'error'); }
    };
})();
