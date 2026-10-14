(() => {
 const track=document.getElementById('inicio'),scene=document.getElementById('blyxu-video-scene'),video=document.getElementById('blyxu-intro-video'),status=document.getElementById('blyxu-video-status');
 if(!track||!scene||!video)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const key='blyxu-cover-visit-v1';
 let saved=null;
 try{saved=JSON.parse(sessionStorage.getItem(key));}catch{}
 const navigation=performance.getEntriesByType('navigation')[0]?.type;
 let internalReferrer=false;
 try{internalReferrer=new URL(document.referrer).origin===location.origin;}catch{}
 if(navigation!=='reload'&&!internalReferrer&&(document.referrer||saved?.departure!=='internal'))saved=null;
 let done=!!saved?.done,resume=Math.max(0,Number(saved?.time)||0),internalDeparture=false;
 let frame=0,range=1,measure=true,lastProgress=-1,lastPinned=null,lastAfter=null,inView=true;
 function save(departure){try{sessionStorage.setItem(key,JSON.stringify({done,time:done?0:video.currentTime,departure}));}catch{}}
 function play(){if(!done&&inView&&!document.hidden&&video.readyState>=2){if(video.paused)video.play().catch(()=>{status.textContent='';});}else video.pause();}
 function prepare(){
  video.loop=false;
  if(done){video.pause();video.removeAttribute('src');video.poster='conejo_webp_10fps/frame_100.webp';video.load();status.textContent='';video.dataset.state='finished';}
  else{video.poster='conejo_webp_10fps/frame_015.webp';video.src=matchMedia('(max-width:700px)').matches?'blyxu-portada-movil.mp4':'blyxu-portada.mp4';video.dataset.state='playing';video.load();}
 }
 video.addEventListener('loadedmetadata',()=>{if(resume){video.currentTime=Math.min(resume,Math.max(0,video.duration-.05));resume=0;}});
 video.addEventListener('loadeddata',()=>{status.textContent='';play();});
 video.addEventListener('canplay',play);
 video.addEventListener('ended',()=>{done=true;video.pause();video.dataset.state='finished';save();});
 video.addEventListener('error',()=>{status.textContent='Puedes continuar hacia la colección.';});
 document.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(!link||event.defaultPrevented||link.target==='_blank'||event.ctrlKey||event.metaKey)return;const url=new URL(link.href,location.href);internalDeparture=url.origin===location.origin&&url.pathname!==location.pathname;});
 addEventListener('pagehide',()=>{video.pause();save(internalDeparture?'internal':'away');});
 addEventListener('pageshow',event=>{if(event.persisted){if(!internalDeparture){done=false;resume=0;prepare();}internalDeparture=false;schedule();play();}});
 function update(){
  frame=0;
  const rect=track.getBoundingClientRect();
  if(measure){range=Math.max(1,track.offsetHeight-scene.offsetHeight);scene.style.width=rect.width+'px';measure=false;}
  const progress=Math.max(0,Math.min(1,-rect.top/range));
  inView=rect.top<innerHeight&&rect.bottom>0;
  play();
  // The storefront body's overflow rules create a separate sticky container.
  // Pin only this banner while its scroll track is in view.
  const pinned=rect.top<=0&&-rect.top<=range;
  const after=-rect.top>range;
  if(pinned!==lastPinned){scene.classList.toggle('is-pinned',pinned);scene.style.left=(pinned?rect.left:0)+'px';lastPinned=pinned;}
  if(after!==lastAfter){scene.classList.toggle('is-after',after);lastAfter=after;}
  // Once outside the banner, leave the catalog's scroll frames free of style work.
  if(progress===lastProgress)return;
  lastProgress=progress;
  scene.style.setProperty('--banner-progress',progress);
  scene.style.setProperty('--banner-pan',Math.min(50,45+progress/.35*5)+'%');
  scene.style.setProperty('--banner-scale',reduced?1:1.025+progress*.04);
  scene.style.setProperty('--banner-shift',(reduced?0:progress*30)+'px');
  scene.style.setProperty('--banner-copy',Math.max(0,1-Math.max(0,progress-.68)/.23));
  scene.style.setProperty('--banner-end',Math.max(0,(progress-.87)/.13)*.4);
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(update);}
 addEventListener('scroll',schedule,{passive:true});
 function resize(){measure=true;lastProgress=-1;lastPinned=null;schedule();}
 addEventListener('resize',resize);
 if(typeof ResizeObserver==='function'){const observer=new ResizeObserver(resize);observer.observe(track);observer.observe(scene);}
 document.addEventListener('visibilitychange',()=>{if(document.hidden){video.pause();save();}else{schedule();play();}});
 document.addEventListener('pointerdown',play,{once:true,passive:true});
 // These links retain their original catalog and wholesale destinations.
 const collectionLink=document.querySelector('.blyxu-video-actions a[href="#coleccion"]');
 collectionLink?.addEventListener('click',event=>{event.preventDefault();document.getElementById('coleccion')?.scrollIntoView({behavior:reduced?'instant':'smooth'});});
 prepare();schedule();
})();
