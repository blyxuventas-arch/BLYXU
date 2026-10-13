(async()=>{
  const query=new URLSearchParams(location.search);
  const state=query.get('state'),code=query.get('code'),error=query.get('error');
  history.replaceState(null,'',location.pathname);
  const status=document.getElementById('drive-callback-status');
  let result={ok:false,error:'Esta autorización no es válida. Vuelve al administrador y conecta Drive.'};
  try{
    if(state){
      const response=await fetch('https://cufptttzflkdwizpqaot.supabase.co/functions/v1/blyxu-api',{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({action:'drivefinish',state,code,error}),credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(60000)});
      result=await response.json();
    }
  }catch{result={ok:false,error:'No se pudo confirmar la conexión. Vuelve al administrador para comprobar su estado.'};}
  document.querySelector('h1').textContent=result.ok?'Drive conectado':'Conexión pendiente';
  status.textContent=result.ok?'Tus nuevas imágenes se guardarán en la carpeta '+result.folderName+'. Puedes cerrar esta ventana.':result.error;
  if(window.opener)window.opener.postMessage({type:'blyxu-drive-result',state,ok:result.ok===true,error:result.ok?undefined:result.error},location.origin);
})();
