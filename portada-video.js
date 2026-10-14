(() => {
 const track=document.getElementById('inicio'),scene=document.getElementById('blyxu-video-scene'),image=document.getElementById('blyxu-intro-frames'),status=document.getElementById('blyxu-video-status');
 if(!track||!scene||!image)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const first=15,count=100,cache=new Map(),pending=new Set(),failed=new Map();
 let frame=0,target=first,shown=first,active=0,range=1,measure=true,lastProgress=-1,lastPinned=null,lastAfter=null,inView=true;
 const frameUrl=index=>`conejo_webp_10fps/frame_${String(index).padStart(3,'0')}.webp`;
 // Decode only nearby frames; keep memory bounded rather than expanding 100 images.
 function trim(){while(cache.size>12){let farthest=null,distance=-1;for(const index of cache.keys()){if(index===target||index===shown)continue;const d=Math.abs(index-target);if(d>distance){distance=d;farthest=index;}}if(farthest===null)break;cache.delete(farthest);}}
 function show(){const decoded=cache.get(target);if(decoded&&shown!==target){image.src=decoded.src;image.dataset.frame=String(target);shown=target;}if(decoded)status.textContent='';}
 function load(index){
  active++;pending.add(index);
  const decoded=new Image();decoded.decoding='async';decoded.fetchPriority=index===target?'high':'low';decoded.src=frameUrl(index);
  decoded.decode().then(()=>{cache.set(index,decoded);failed.delete(index);show();trim();},()=>{failed.set(index,Date.now());if(index===target)status.textContent='Puedes continuar hacia la colección.';}).finally(()=>{active--;pending.delete(index);pump();});
 }
 function pump(){
  if(!inView||document.hidden)return;
  const wanted=[target];for(let step=1;step<=6;step++){if(target+step<=count)wanted.push(target+step);if(step<=3&&target-step>=first)wanted.push(target-step);}
  for(const index of wanted){if(active>=4)break;if(!cache.has(index)&&!pending.has(index)&&(!failed.has(index)||Date.now()-failed.get(index)>30000))load(index);}
 }
 function render(){show();pump();}
 function update(){
  frame=0;
  const rect=track.getBoundingClientRect();
  if(measure){range=Math.max(1,track.offsetHeight-scene.offsetHeight);scene.style.width=rect.width+'px';measure=false;}
  const progress=Math.max(0,Math.min(1,-rect.top/range));
  inView=rect.top<innerHeight&&rect.bottom>0;
  target=first+Math.round(progress*(count-first));
  // The storefront body's overflow rules create a separate sticky container.
  // Pin only this banner while its scroll track is in view.
  const pinned=rect.top<=0&&-rect.top<=range;
  const after=-rect.top>range;
  if(pinned!==lastPinned){scene.classList.toggle('is-pinned',pinned);scene.style.left=(pinned?rect.left:0)+'px';lastPinned=pinned;}
  if(after!==lastAfter){scene.classList.toggle('is-after',after);lastAfter=after;}
  // Once outside the banner, leave the catalog's scroll frames free of style work.
  if(progress===lastProgress){render();return;}
  lastProgress=progress;
  scene.style.setProperty('--banner-progress',progress);
  scene.style.setProperty('--banner-pan',Math.min(50,45+progress/.35*5)+'%');
  scene.style.setProperty('--banner-scale',reduced?1:1.025+progress*.04);
  scene.style.setProperty('--banner-shift',(reduced?0:progress*30)+'px');
  scene.style.setProperty('--banner-copy',Math.max(0,1-Math.max(0,progress-.68)/.23));
  scene.style.setProperty('--banner-end',Math.max(0,(progress-.87)/.13)*.4);
  render();
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(update);}
 image.dataset.frame=String(first);
 image.addEventListener('load',()=>{status.textContent='';});
 image.addEventListener('error',()=>{status.textContent='Puedes continuar hacia la colección.';});
 addEventListener('scroll',schedule,{passive:true});
 function resize(){measure=true;lastProgress=-1;lastPinned=null;schedule();}
 addEventListener('resize',resize);
 if(typeof ResizeObserver==='function'){const observer=new ResizeObserver(resize);observer.observe(track);observer.observe(scene);}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
 if(image.complete&&image.naturalWidth)status.textContent='';
 // These links retain their original catalog and wholesale destinations.
 const collectionLink=document.querySelector('.blyxu-video-actions a[href="#coleccion"]');
 collectionLink?.addEventListener('click',event=>{event.preventDefault();document.getElementById('coleccion')?.scrollIntoView({behavior:reduced?'instant':'smooth'});});
 schedule();
})();
