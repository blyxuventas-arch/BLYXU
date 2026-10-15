/* One camera, one in-flight frame, local worker decoding. */
(() => {
    'use strict';
    const base = document.currentScript.src;
    function region(width, height, iteration, qrOnly = false) {
        if (qrOnly && iteration % 3 !== 0) {
            const side = Math.min(width,height) * (iteration % 3 === 1 ? .9 : .65);
            return [(width-side)/2,(height-side)/2,side,side];
        }
        // Alternate full frame with wide and square crops. Never stretch bar widths.
        if (!qrOnly && iteration % 3 === 1) return [width*.04,height*.28,width*.92,height*.44];
        if (!qrOnly && iteration % 3 === 2) {
            const side=Math.min(width,height)*.85;
            return [(width-side)/2,(height-side)/2,side,side];
        }
        return [0,0,width,height];
    }
    async function start({video,container,onDetected,onFailure=()=>{},qrOnly=false}) {
        if (!window.Worker || !window.WebAssembly) throw new Error('Usar lector compatible.');
        const worker = new Worker(new URL('barcode-fast-worker.js?v=20261014-pairing-2',base));
        let stopped=false,timer,deadline,sequence=0,inFlight=0,sentAt=0,failures=0,lastMediaTime=-1;
        const canvas=document.createElement('canvas');
        const context=canvas.getContext('2d',{willReadFrequently:true,alpha:false});
        const active=()=>!stopped&&container.isConnected&&video.isConnected;
        function stop(){if(stopped)return;stopped=true;clearTimeout(timer);clearTimeout(deadline);worker.terminate();canvas.width=canvas.height=1;}
        const schedule=ms=>{clearTimeout(timer);if(active())timer=setTimeout(tick,ms);};
        function fail(){if(!active()){stop();return;}stop();onFailure();}
        function tick(){
            if(!active()){stop();return;}
            if(inFlight)return;
            if(document.hidden||video.readyState<2||!video.videoWidth||video.currentTime===lastMediaTime){schedule(60);return;}
            try{
                lastMediaTime=video.currentTime;
                const crop=region(video.videoWidth,video.videoHeight,sequence,qrOnly);
                const scale=Math.min(1,1440/Math.max(crop[2],crop[3]));
                canvas.width=Math.max(1,Math.round(crop[2]*scale));canvas.height=Math.max(1,Math.round(crop[3]*scale));
                context.drawImage(video,...crop,0,0,canvas.width,canvas.height);
                const pixels=context.getImageData(0,0,canvas.width,canvas.height);
                sentAt=performance.now();inFlight=++sequence;
                worker.postMessage({type:'frame',id:inFlight,width:canvas.width,height:canvas.height,buffer:pixels.data.buffer,harder:qrOnly||sequence%4===0,qrOnly},[pixels.data.buffer]);
                // A failed worker must never freeze the camera indefinitely.
                deadline=setTimeout(fail,5000);
            }catch(_){if(++failures>=3)fail();else schedule(150);}
        }
        try{
            await new Promise((resolve,reject)=>{
                deadline=setTimeout(()=>reject(new Error('El lector rápido tardó demasiado.')),8000);
                worker.onerror=()=>reject(new Error('No se pudo cargar el lector rápido.'));
                worker.onmessage=({data})=>{
                    if(data.type==='ready'){clearTimeout(deadline);resolve();}
                    else if(data.type==='fatal')reject(new Error(data.error));
                };
            });
            if(!active()){stop();return stop;}
            worker.onerror=fail;
            worker.onmessage=({data})=>{
                if(!active()){stop();return;}
                if(data.type!=='result'||data.id!==inFlight)return;
                clearTimeout(deadline);inFlight=0;
                failures=data.error?failures+1:0;
                if(failures>=3){fail();return;}
                if(data.text)onDetected(data.text,data.format);
                // Slow phones automatically process fewer frames instead of building a queue.
                schedule(Math.max(25,100-(performance.now()-sentAt)));
            };
            tick();return stop;
        }catch(error){stop();throw error;}
    }
    window.BlyxuFastScanner={start,region};
})();
