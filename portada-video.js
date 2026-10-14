(() => {
 const track=document.getElementById('inicio'),scene=document.getElementById('blyxu-video-scene'),video=document.getElementById('blyxu-intro-video'),status=document.getElementById('blyxu-video-status');
 if(!track||!scene||!video)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let frame=0,targetTime=0,ready=false,range=1,measure=true,lastProgress=-1,lastPinned=null,lastAfter=null;
 // Keep one pending destination: fast scrolling never queues old video frames.
 function seek(){if(ready&&!video.seeking&&Number.isFinite(targetTime)&&Math.abs(video.currentTime-targetTime)>1/48)video.currentTime=targetTime;}
 function update(){
  frame=0;
  const rect=track.getBoundingClientRect();
  if(measure){range=Math.max(1,track.offsetHeight-scene.offsetHeight);scene.style.width=rect.width+'px';measure=false;}
  const progress=Math.max(0,Math.min(1,-rect.top/range));
  // The storefront body's overflow rules create a separate sticky container.
  // Pin only this banner while its scroll track is in view.
  const pinned=rect.top<=0&&-rect.top<=range;
  const after=-rect.top>range;
  if(pinned!==lastPinned){scene.classList.toggle('is-pinned',pinned);scene.style.left=(pinned?rect.left:0)+'px';lastPinned=pinned;}
  if(after!==lastAfter){scene.classList.toggle('is-after',after);lastAfter=after;}
  // Once outside the banner, leave the catalog's scroll frames free of style work.
  if(progress===lastProgress){seek();return;}
  lastProgress=progress;
  scene.style.setProperty('--banner-progress',progress);
  scene.style.setProperty('--banner-pan',Math.min(50,progress/.35*50)+'%');
  scene.style.setProperty('--banner-scale',reduced?1:1.025+progress*.04);
  scene.style.setProperty('--banner-shift',(reduced?0:progress*30)+'px');
  scene.style.setProperty('--banner-copy',Math.max(0,1-Math.max(0,progress-.68)/.23));
  scene.style.setProperty('--banner-end',Math.max(0,(progress-.87)/.13)*.4);
  if(ready){targetTime=Math.min(Math.max(0,video.duration-1/24),Math.round(progress*video.duration*24)/24);seek();}
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(update);}
 function loaded(){ready=Number.isFinite(video.duration);status.textContent='';lastProgress=-1;schedule();}
 video.addEventListener('loadeddata',loaded);
 video.addEventListener('seeked',schedule);
 video.addEventListener('error',()=>{status.textContent='Puedes continuar hacia la colección.';});
 addEventListener('scroll',schedule,{passive:true});
 function resize(){measure=true;lastProgress=-1;lastPinned=null;schedule();}
 addEventListener('resize',resize);
 if(typeof ResizeObserver==='function'){const observer=new ResizeObserver(resize);observer.observe(track);observer.observe(scene);}
 if(video.readyState>=2)loaded();
 // These links retain their original catalog and wholesale destinations.
 const collectionLink=document.querySelector('.blyxu-video-actions a[href="#coleccion"]');
 collectionLink?.addEventListener('click',event=>{event.preventDefault();document.getElementById('coleccion')?.scrollIntoView({behavior:reduced?'instant':'smooth'});});
 schedule();
})();
