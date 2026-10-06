// Private Apps Script code. Never publish this file to the storefront.
let receiptRowsMemo_;
function receiptFind_(id) {
  if(!receiptRowsMemo_)receiptRowsMemo_=caRows_('ComprobantesPrivados');
  return receiptRowsMemo_.find(row=>row.id===String(id||'')) || null;
}
function receiptRegister_(order, sessionToken) {
  const id=String(order['ID Pedido']), expires=Date.now()+300000;
  const owner=caSessionOwner_(sessionToken);
  caWithLock_(()=>{
    receiptRowsMemo_=null;
    if(!receiptFind_(id))caWrite_('ComprobantesPrivados',null,{id,created:Date.now(),seen:false,owner:owner?.data?._accountId||'',order});
    receiptRowsMemo_=null;
  });
  const token=authRandom_();
  CacheService.getScriptCache().put('receipt-'+authDigest_(token),JSON.stringify({id,expires}),300);
  return {token,expires,orderId:id};
}
function receiptAction_(body, action) {
  if(action==='ordertempreceipt') {
    const token=String(body.receiptToken||'');
    if(!/^[a-f0-9]{64}$/.test(token))throw new Error('El acceso temporal no es válido o venció.');
    const raw=CacheService.getScriptCache().get('receipt-'+authDigest_(token));
    const grant=raw?JSON.parse(raw):null;
    if(!grant||grant.expires<=Date.now()||grant.id!==String(body.orderId||''))throw new Error('El acceso temporal venció. Consulta Pedidos y facturas con tu cuenta validada.');
    const row=receiptFind_(grant.id);
    if(!row)throw new Error('Comprobante no disponible.');
    return {ok:true,data:row.data.order,expires:grant.expires};
  }
  if(action==='ordercustomerreceipt') {
    const owner=caSessionOwner_(body.token), row=receiptFind_(body.orderId);
    if(!owner||!row||!row.data.owner||row.data.owner!==owner.data._accountId)throw new Error('Inicia sesión con la cuenta autorizada para este pedido.');
    return {ok:true,data:row.data.order};
  }
  if(!securityAdminIdentity_(body))throw new Error('Acceso administrativo no autorizado.');
  if(action==='orderadminnotifications') {
    const rows=caRows_('ComprobantesPrivados').filter(row=>!row.data.seen).sort((a,b)=>b.data.created-a.data.created);
    return {ok:true,count:rows.length,notifications:rows.slice(0,100).map(row=>({id:row.id,created:row.data.created,name:row.data.order['Nombre Cliente'],type:row.data.order['Tipo Cliente']}))};
  }
  const row=receiptFind_(body.orderId);
  if(action==='orderadminreceipt')return {ok:true,data:row?row.data.order:getById_('Pedidos',body.orderId)};
  if(!row)throw new Error('Pedido no disponible.');
  return caWithLock_(()=>{
    receiptRowsMemo_=null;
    const fresh=receiptFind_(body.orderId);
    if(action==='orderadminseen')fresh.data.seen=true;
    else if(action==='orderadminlink') {
      if(body.confirmed!==true)throw new Error('Confirma la identidad del cliente por contacto directo.');
      const account=caAccount_(caPhone_(body.telefono));
      if(!account||account.data.status!=='Activo'||caPhone_(getCustomerPhoneValue_(fresh.data.order))!==account.data.phone)throw new Error('Necesitas una cuenta activa y validada con el celular del pedido.');
      fresh.data.owner=account.id;
    } else throw new Error('Consulta no válida.');
    caWrite_('ComprobantesPrivados',fresh,fresh.data);
    receiptRowsMemo_=null;
    return {ok:true};
  });
}
