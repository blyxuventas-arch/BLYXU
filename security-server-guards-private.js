function securityAdminIdentity_(body) {
  const credential = String(body.adminCredential || '').trim();
  if (!credential) return null;
  const identity = verifyGoogleIdToken_(credential);
  const allowed = String(PropertiesService.getScriptProperties().getProperty('BLYXU_ADMIN_EMAILS') || 'blyxu.ventas@gmail.com').toLowerCase().split(',').map(function(email) { return email.trim(); }).filter(Boolean);
  if (allowed.indexOf(String(identity.email || '').toLowerCase()) < 0) throw new Error('Cuenta sin permiso de administrador.');
  return identity;
}
function securityPublicConfig_(config) {
  const result = {};
  Object.keys(config || {}).forEach(function(key) {
    if (/^(Google_Client_ID|Mostrar_Precios_Minorista|Mercado_Pago_Publico_Activo|Catalogo_Solo_WhatsApp|Contacto_[A-Za-z]+|WhatsApp_Comercial|Factura_(Logo|Empresa|NIT|Direccion|Telefono|Email)|Promo_(Enabled|Title|Discount|Message|EndDate|Clientes_(Enabled|Title|Discount|Expire))|Wholesale_Promo_(Enabled|Title|Discount|Message|EndDate)|Banner_[A-Za-z0-9_]+|Home_[A-Za-z0-9_]+|QR_(Title|Subtitle|Image|Methods|Year|Enabled|Payments_JSON))$/.test(key)) result[key] = config[key];
  });
  return result;
}
function securityAuthorizeRequest_(body, params, action, resource, method) {
  const admin = securityAdminIdentity_(body);
  if (action === 'adminsession') {
    if (!admin) throw new Error('Inicia sesión con una cuenta administradora.');
    return { response: {ok:true,status:'success',email:admin.email}, admin:admin };
  }
  if (admin) return {admin:admin};
  const publicActions = ['customerrecords','getconfig','registrarcliente','customerregister','registercustomer','crearcliente','crearcuenta','registrocliente','registrarse','signup','signupcliente','register','registro','createcustomer','newcustomer','logincliente','iniciarsesion','customerlogin','login','signin','entrarcliente','ingresarcliente','googlelogincliente','customergooglelogin','logincongoogle','googlelogin','signinwithgoogle','perfilcliente','customerprofile','cerrarsesion','customerlogout','pedidoscliente','customerorders','mispedidos','facturascliente','customerinvoices','misfacturas','favoritoscliente','customerfavorites','misfavoritos','guardarfavorito','addfavorite','quitarfavorito','removefavorite','createpreference','crearpreferencia','mercadopago','mpcheckout','checkoutmercadopago','pagar','mpwebhook','mercadopagowebhook','verifymppayment','verificarpagomp'];
  if (publicActions.indexOf(action) >= 0 || (!action && isMercadoPagoPaymentNotification_(body,params))) return {admin:null};
  const sheet = sheetFromResource_(resource || action);
  const reading = method === 'GET' || ['listar','list','get'].indexOf(action) >= 0;
  if (sheet === 'Productos' && reading) return {admin:null};
  if (sheet === 'Pedidos' && method === 'POST' && ['crear','create','agregar',''].indexOf(action) >= 0) return {admin:null};
  throw new Error('Acceso no autorizado. Inicia sesión con una cuenta administradora.');
}

function securityCustomerOwnsRecord_(customer, row) {
  // Un teléfono o correo escrito en un formulario no acredita su propiedad.
  const verified = String(customer['Google ID'] || '').trim();
  const email = normalizeEmail_(customer.Email);
  return !!verified && !!email && email === normalizeEmail_(row.Email || row.email);
}
function securityCustomerRecords_(body, params) {
  const found = getAuthenticatedCustomer_(body,params);
  if (!found || !found.data['Google ID']) return json_({ok:false,status:'error',error:'Ingresa con Google para verificar tu identidad y consultar tus documentos.'});
  const orders = listRows_('Pedidos',{}).filter(function(row){return securityCustomerOwnsRecord_(found.data,row);});
  const ids = {}; orders.forEach(function(row){ids[String(row['ID Pedido'] || '')]=true;});
  const invoices = listRows_('Facturas',{}).filter(function(row){return securityCustomerOwnsRecord_(found.data,row) || !!ids[String(row['ID Pedido'] || '')];});
  const resource = sheetFromResource_(body.resource || params.resource);
  if (resource !== 'Pedidos' && resource !== 'Facturas') return json_({ok:false,status:'error',error:'Consulta no válida.'});
  return json_({ok:true,status:'success',data:resource==='Pedidos'?orders:invoices});
}
