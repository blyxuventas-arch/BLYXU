(() => {
 const track=document.getElementById('inicio'),scene=document.getElementById('blyxu-video-scene'),video=document.getElementById('blyxu-intro-video'),status=document.getElementById('blyxu-video-status');
 if(!track||!scene||!video)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let frame=0,targetTime=0,ready=false;
 function seek(){if(ready&&!video.seeking&&Number.isFinite(targetTime)&&Math.abs(video.currentTime-targetTime)>.045)video.currentTime=targetTime;}
 function update(){
  frame=0;
  const rect=track.getBoundingClientRect(),range=Math.max(1,track.offsetHeight-scene.offsetHeight),progress=Math.max(0,Math.min(1,-rect.top/range));
  // The storefront body's overflow rules create a separate sticky container.
  // Pin only this banner while its scroll track is in view.
  const pinned=rect.top<=0&&-rect.top<=range;
  scene.classList.toggle('is-pinned',pinned);
  scene.classList.toggle('is-after',-rect.top>range);
  scene.style.width=rect.width+'px';scene.style.left=(pinned?rect.left:0)+'px';
  scene.style.setProperty('--banner-progress',progress);
  scene.style.setProperty('--banner-pan',Math.min(50,progress/.35*50)+'%');
  scene.style.setProperty('--banner-scale',reduced?1:1.025+progress*.04);
  scene.style.setProperty('--banner-shift',(reduced?0:progress*30)+'px');
  scene.style.setProperty('--banner-copy',Math.max(0,1-Math.max(0,progress-.68)/.23));
  scene.style.setProperty('--banner-end',Math.max(0,(progress-.87)/.13)*.4);
  if(ready){targetTime=Math.min(Math.max(0,video.duration-.06),progress*video.duration);seek();}
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(update);}
 video.addEventListener('loadeddata',()=>{ready=Number.isFinite(video.duration);status.textContent='';schedule();});
 video.addEventListener('seeked',seek);
 video.addEventListener('error',()=>{status.textContent='Puedes continuar hacia la colección.';});
 addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);
 // These links retain their original catalog and wholesale destinations.
 const collectionLink=document.querySelector('.blyxu-video-actions a[href="#coleccion"]');
 collectionLink?.addEventListener('click',event=>{event.preventDefault();document.getElementById('coleccion')?.scrollIntoView({behavior:reduced?'instant':'smooth'});});
 schedule();
})();
