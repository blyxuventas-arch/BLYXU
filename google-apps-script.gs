/***************
 * CONFIGURACION
 ***************/
const SPREADSHEET_ID = '';

// Credenciales Mercado Pago (Checkout Pro - Catálogo Minorista)
const MERCADO_PAGO_PUBLIC_KEY = 'APP_USR-72ab41d6-5fc7-4867-8e02-564ab0ae9f99';
// Token privado de prueba. No lo subas a repositorios públicos.
const MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-6488035886423576-090622-ecbd77219d0a97a024815ad58c2b97c1-3665799663';
const SITE_URL = 'https://blyxu.online';

const SHEETS = {
  Productos: {
    primary: 'ID Variación',
    headers: [
      'ID Variación',
      'ID Producto',
      'Nombre del Producto',
      'Categoría',
      'Catalogo',
      'Precio',
      'Precio Mayor',
      'Stock Inicial',
      'Cantidad',
      'Características del producto',
      'Tamaño',
      'Color',
      'Estilo',
      'Promocion',
      'Imagen Principal',
      'Galería JSON',
      'SKU',
      'Estado',
      'Fecha de Creación'
    ]
  },

  Pedidos: {
    primary: 'ID Pedido',
    headers: [
      'ID Pedido',
      'Fecha',
      'ID Cliente',
      'Nombre Cliente',
      'Tipo Cliente',
      'Teléfono',
      'Email',
      'Dirección',
      'Ciudad',
      'Productos JSON',
      'Cantidad Total',
      'Subtotal',
      'Estado Pedido',
      'Método Contacto',
      'Nota Cliente',
      'MP Payment ID',
      'MP Preference ID',
      'Stock Descontado',
      'Fecha Actualización'
    ]
  },

  Clientes: {
    primary: 'Teléfono',
    headers: [
      'Nombre',
      'Teléfono',
      'Email',
      'Dirección',
      'Ciudad',
      'Total Pedidos',
      'Total Gastado',
      'Último Pedido',
      'Estado Cliente',
      'Fecha Registro',
      'Password Hash',
      'Password Salt',
      'Google ID',
      'Session Token',
      'Session Expira',
      'Descuento Cliente',
      'Promo Cliente',
      'Promo Expira',
      'Fecha Actualización'
    ]
  },

  Favoritos: {
    primary: 'ID Favorito',
    headers: [
      'ID Favorito',
      'Fecha',
      'Telefono',
      'Email',
      'ID Producto',
      'ID Variacion',
      'Nombre Producto',
      'Imagen',
      'Precio',
      'Estado',
      'Fecha Actualizacion'
    ]
  },

  Facturas: {
    primary: 'ID Factura',
    headers: [
      'Nombre',
      'ID Factura',
      'ID Pedido',
      'ID Cliente',
      'Tipo Cliente',
      'Fecha',
      'Productos JSON',
      'Cantidad Total',
      'Subtotal',
      'Valor Abonado',
      'Saldo Pendiente',
      'Ultimo Abono',
      'Estado Factura',
      'Método Pago',
      'Método Entrega',
      'Observaciones',
      'Fecha Actualización'
    ]
  },
  
  Configuracion: {
    primary: 'Clave',
    headers: [
      'Clave',
      'Valor',
      'Fecha Actualización'
    ]
  },

  PedidosChina: {
    primary: 'ID Pedido',
    headers: [
      'ID Pedido',
      'Fecha',
      'Fábrica',
      'TRM',
      'Total USD',
      'Total COP',
      'Total Productos',
      'Total Piezas',
      'Productos JSON',
      'Notas',
      'Mostrar USD',
      'Mostrar COP',
      'Mostrar Ref',
      'Fecha Actualización'
    ]
  }
};

/***************
 * WEB APP
 ***************/
function doGet(e) {
  return handleRequest_(e, 'GET');
}

function doPost(e) {
  return handleRequest_(e, 'POST');
}

function autorizarMercadoPago() {
  const response = UrlFetchApp.fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'get',
    muteHttpExceptions: true
  });

  return 'Permiso de llamadas externas autorizado. Respuesta Mercado Pago: ' + response.getResponseCode();
}

function handleRequest_(e, method) {
  try {
    const params = e.parameter || {};
    const body = parseBody_(e);

    const action = normalizeKey_(body.action || params.action || '');
    const resource = body.resource || body.recurso || body.sheet || body.hoja ||
      params.resource || params.recurso || params.sheet || params.hoja;

    if (action === 'setup') {
      ensureSheets_();
      return json_({ ok: true, status: 'success', message: 'Hojas verificadas correctamente.' });
    }

    // ==========================================
    // 1) LÓGICA DE SUBIDA DE IMÁGENES
    // ==========================================
    if (method === 'POST' && action === 'uploadimage') {
      const folders = DriveApp.getFoldersByName('PRODUCTOS_Images');
      const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('PRODUCTOS_Images');
      
      const blob = Utilities.newBlob(Utilities.base64Decode(body.base64Data), body.mimeType, body.fileName);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      
      const fileId = file.getId();
      return json_({
        ok: true,
        status: 'success',
        url: 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000',
        directUrl: 'https://lh3.googleusercontent.com/d/' + fileId,
        id: fileId
      });
    }

    // ==========================================
    // 2) LÓGICA DE CONFIGURACIÓN (Panel Admin)
    // ==========================================
    if (action === 'getconfig') {
      const rows = listRows_('Configuracion', {});
      const configObj = {};
      rows.forEach(r => { if (r.Clave) configObj[r.Clave] = r.Valor; });
      return json_({ ok: true, status: 'success', config: configObj });
    }
    
    if (method === 'POST' && action === 'setconfig') {
      const key = body.Clave || params.Clave;
      const val = body.Valor || params.Valor;
      upsertConfig_(key, val);
      return json_({ ok: true, status: 'success' });
    }

    if (
      action === 'registrarcliente' ||
      action === 'customerregister' ||
      action === 'registercustomer' ||
      action === 'crearcliente' ||
      action === 'crearcuenta' ||
      action === 'registrocliente' ||
      action === 'registrarse' ||
      action === 'signup' ||
      action === 'signupcliente' ||
      action === 'register' ||
      action === 'registro' ||
      action === 'createcustomer' ||
      action === 'newcustomer'
    ) {
      return handleCustomerRegister_(body);
    }

    if (
      action === 'logincliente' ||
      action === 'iniciarsesion' ||
      action === 'customerlogin' ||
      action === 'login' ||
      action === 'signin' ||
      action === 'entrarcliente' ||
      action === 'ingresarcliente'
    ) {
      return handleCustomerLogin_(body);
    }

    if (
      action === 'googlelogincliente' ||
      action === 'customergooglelogin' ||
      action === 'logincongoogle' ||
      action === 'googlelogin' ||
      action === 'signinwithgoogle'
    ) {
      return handleCustomerGoogleLogin_(body);
    }

    if (
      action === 'perfilcliente' ||
      action === 'customerprofile'
    ) {
      return handleCustomerProfile_(body, params);
    }

    if (
      action === 'cerrarsesion' ||
      action === 'customerlogout'
    ) {
      return handleCustomerLogout_(body, params);
    }

    if (
      action === 'pedidoscliente' ||
      action === 'customerorders' ||
      action === 'mispedidos'
    ) {
      return handleCustomerOrders_(body, params);
    }

    if (
      action === 'facturascliente' ||
      action === 'customerinvoices' ||
      action === 'misfacturas'
    ) {
      return handleCustomerInvoices_(body, params);
    }

    if (
      action === 'favoritoscliente' ||
      action === 'customerfavorites' ||
      action === 'misfavoritos'
    ) {
      return handleCustomerFavorites_(body, params);
    }

    if (
      action === 'guardarfavorito' ||
      action === 'addfavorite'
    ) {
      return handleCustomerFavoriteSave_(body, params);
    }

    if (
      action === 'quitarfavorito' ||
      action === 'removefavorite'
    ) {
      return handleCustomerFavoriteRemove_(body, params);
    }

    if (
      action === 'promocliente' ||
      action === 'customerpromo' ||
      action === 'guardar_promocion_cliente'
    ) {
      return handleCustomerPromotionSave_(body);
    }

    // ==========================================
    // 3) MERCADO PAGO - CHECKOUT PRO (SOLO MINORISTA)
    // ==========================================
    if (
      action === 'createpreference' ||
      action === 'create_preference' ||
      action === 'crearpreferencia' ||
      action === 'mercadopago' ||
      action === 'mpcheckout' ||
      action === 'checkoutmercadopago' ||
      action === 'pagar'
    ) {
      if (method === 'GET') {
        return json_({
          ok: true,
          status: 'success',
          message: 'Ruta de Mercado Pago activa y lista en Apps Script.',
          version: 'MercadoPago-CheckoutPro-v1'
        });
      }
      return handleMercadoPagoPreference_(body);
    }

    if (
      action === 'mpwebhook' ||
      action === 'mercadopagowebhook' ||
      action === 'verifymppayment' ||
      action === 'verificarpagomp' ||
      action === 'verificar_pago_mp' ||
      isMercadoPagoPaymentNotification_(body, params)
    ) {
      return handleMercadoPagoPaymentUpdate_(body, params);
    }

    const sheetName = sheetFromResource_(resource || action);

    if (!sheetName) {
      return json_({
        ok: false,
        status: 'error',
        error: 'Debes enviar resource: productos, pedidos, clientes o facturas.'
      });
    }

    if (method === 'GET' || action === 'listar' || action === 'list' || action === 'get') {
      const id = params.id || params.ID || params.codigo || '';

      if (id) {
        const row = getById_(sheetName, id);
        return json_({ ok: true, status: 'success', data: row });
      }

      const rows = listRows_(sheetName, params);
      return json_({ ok: true, status: 'success', data: rows });
    }

    if (method === 'POST') {
      const data = body.data || body;

      if (
        action === 'batchsave' ||
        action === 'guardarlote' ||
        action === 'batch'
      ) {
        const itemsList = Array.isArray(data) ? data : [data];
        const saved = batchSaveRows_(sheetName, itemsList);
        return json_({ ok: true, status: 'success', data: saved });
      }

      if (
        action === 'crear' ||
        action === 'create' ||
        action === 'agregar' ||
        action === 'addproduct' ||
        action === ''
      ) {
        if (sheetName === 'Clientes') {
          const hasRegisterFields = data && (
            data.cliente ||
            data.customer ||
            data.password ||
            data.contrasena ||
            data['Contraseña']
          ) && (
            data.nombre ||
            data.Nombre ||
            data.telefono ||
            data.Telefono ||
            data['Teléfono'] ||
            data.email ||
            data.Email
          );

          if (hasRegisterFields) {
            return handleCustomerRegister_(body);
          }
        }

        if (sheetName === 'Pedidos') {
          const pedido = createOrder_(data);
          return json_({ ok: true, status: 'success', data: pedido });
        }

        const created = appendRow_(sheetName, data);
        return json_({ ok: true, status: 'success', data: created });
      }

      if (
        action === 'actualizar' ||
        action === 'update' ||
        action === 'editar' ||
        action === 'editproduct'
      ) {
        const id = body.id || data.id || data['ID Variación'] || data['ID Variacion'] || data[SHEETS[sheetName].primary];
        const updated = updateRow_(sheetName, id, data);
        return json_({ ok: true, status: 'success', data: updated });
      }

      if (action === 'estado' || action === 'updateestado') {
        const id = body.id || data.id;
        const estado = body.estado || data.estado;
        const updated = updateStatus_(sheetName, id, estado);
        return json_({ ok: true, status: 'success', data: updated });
      }

      if (
        action === 'deleteproduct' ||
        action === 'delete' ||
        action === 'eliminar' ||
        action === 'borrar'
      ) {
        const id =
          body.id ||
          data.id ||
          data['ID Variación'] ||
          data['ID Variacion'] ||
          data[SHEETS[sheetName].primary];

        const deleted = deleteRow_(sheetName, id, body._rowIndex || data._rowIndex);

        return json_({
          ok: deleted > 0,
          status: deleted > 0 ? 'success' : 'error',
          deleted: deleted,
          message: deleted > 0 ? 'Producto eliminado.' : 'No se encontro el producto.'
        });
      }

      if (sheetName === 'Clientes') {
        const hasPassword = data.password || data.contrasena || data['Contraseña'];
        const hasRegisterIdentity = data.cliente || data.customer || data.nombre || data.Nombre || data.email || data.Email || data.telefono || data.Telefono || data['Teléfono'];
        const hasLoginIdentity = data.usuario || data.identifier || data.email || data.telefono;

        if (hasPassword && hasRegisterIdentity && (data.nombre || data.Nombre || data.cliente || data.customer)) {
          return handleCustomerRegister_(body);
        }

        if (hasPassword && hasLoginIdentity) {
          return handleCustomerLogin_(body);
        }
      }

      return json_({ ok: false, status: 'error', error: 'Accion no reconocida.' });
    }

    return json_({ ok: false, status: 'error', error: 'Metodo no soportado.' });

  } catch (error) {
    return json_({
      ok: false,
      status: 'error',
      error: error.message,
      stack: error.stack
    });
  }
}

/***************
 * MERCADO PAGO (CHECKOUT PRO - SOLO MINORISTAS)
 ***************/
function handleMercadoPagoPreference_(body) {
  ensureSheets_();
  const token = getMercadoPagoAccessToken_();
  if (!token || token.indexOf('PEGA_AQUÍ') >= 0 || token.trim() === '') {
    return json_({
      ok: false,
      status: 'error',
      error: 'Mercado Pago no está configurado. Por favor ingresa el Access Token en el Apps Script.'
    });
  }

  // 1) VALIDACIÓN ESTRICTA: Exclusivo para catálogo público / minoristas (Detal)
  const explicitType = String(body.tipoCliente || body.TipoCliente || body.customerType || (body.cliente && body.cliente.tipo) || '').trim();
  const explicitMode = String(body.mode || body.modo || '').trim();
  const customerType = inferCustomerType_({
    'Tipo Cliente': explicitType,
    'Productos JSON': body.items || body.productos || body.cart || []
  });

  const isWholesale = customerType === 'Mayor' ||
    normalizeKey_(explicitType).indexOf('mayor') >= 0 ||
    normalizeKey_(explicitMode) === 'wholesale';

  if (isWholesale) {
    return json_({
      ok: false,
      status: 'error',
      error: 'Mercado Pago está reservado exclusivamente para compras del catálogo público minorista. Las órdenes mayoristas deben gestionarse mediante el canal mayorista privado.'
    });
  }

  // 2) Parsear datos del cliente y carrito
  const cliente = body.cliente || body.customer || {};
  const rawItems = body.items || body.productos || body.cart || [];
  const items = Array.isArray(rawItems) ? rawItems : parseMaybeJson_(rawItems);

  if (!items || items.length === 0) {
    return json_({
      ok: false,
      status: 'error',
      error: 'El carrito no contiene productos para procesar el pago.'
    });
  }

  const stockValidation = validateStockAvailability_(items);
  if (!stockValidation.ok) {
    return json_({
      ok: false,
      status: 'error',
      error: 'No hay stock suficiente para completar el pago.',
      details: stockValidation.errors
    });
  }

  const clientName = String(cliente.nombre || body.nombre || body['Nombre Cliente'] || 'Cliente Minorista').trim();
  const clientPhone = String(cliente.telefono || body.telefono || body['Teléfono'] || '').trim();
  const clientEmail = String(cliente.email || body.email || '').trim();
  const clientAddress = String(cliente.direccion || body.direccion || body['Dirección'] || '').trim();
  const clientCity = String(cliente.ciudad || body.ciudad || body['Ciudad'] || '').trim();
  const clientNote = String(cliente.nota || body.nota || body['Nota Cliente'] || '').trim();
  const sessionToken = String(body.token || body.customerToken || cliente.token || '').trim();
  const registeredCustomer = sessionToken ? findCustomerBySessionToken_(sessionToken) : null;
  const customerPromotion = getActiveCustomerPromotion_(registeredCustomer ? registeredCustomer.data : null);
  const pricedCart = applyCustomerPromotionToItems_(items, customerPromotion);
  const orderItems = pricedCart.items;

  // 3) Pre-registrar pedido en la hoja 'Pedidos'
  const now = new Date();
  const orderId = body['ID Pedido'] || body.idPedido || makeId_('DET');

  const totalQty = orderItems.reduce((sum, item) => sum + toNumber_(item.cantidad || item.qty || item.quantity || 1), 0);
  const calculatedTotal = orderItems.reduce((sum, item) => {
    const qty = toNumber_(item.cantidad || item.qty || item.quantity || 1);
    const price = toNumber_(item.precio || item.price || 0);
    return sum + (qty * price);
  }, 0);
  const total = calculatedTotal;
  const noteWithPromo = customerPromotion.percent > 0
    ? [clientNote, 'Promo cliente registrado: ' + customerPromotion.label + ' (-' + customerPromotion.percent + '%)'].filter(Boolean).join(' | ')
    : clientNote;

  const orderData = {
    'ID Pedido': orderId,
    'Fecha': now,
    'Nombre Cliente': clientName,
    'Tipo Cliente': 'Detal',
    'Teléfono': clientPhone,
    'Email': clientEmail,
    'Dirección': clientAddress,
    'Ciudad': clientCity,
    'Productos JSON': JSON.stringify(orderItems),
    'Cantidad Total': totalQty,
    'Subtotal': total,
    'Estado Pedido': 'Pendiente de Pago',
    'Método Contacto': 'Mercado Pago Checkout Pro',
    'Nota Cliente': noteWithPromo,
    'Fecha Actualización': now
  };

  try {
    const pedidoGuardado = appendRow_('Pedidos', orderData);
    upsertClientFromOrder_(pedidoGuardado);
  } catch (sheetErr) {
    Logger.log('Aviso al guardar pedido previo a MP: ' + sheetErr.message);
  }

  // 4) Armar Items para la API de Preferencias de Mercado Pago
  const mpItems = orderItems.map((item, idx) => {
    const qty = Math.max(1, parseInt(item.cantidad || item.qty || item.quantity || 1, 10));
    const price = toNumber_(item.precio || item.price || 0);
    const title = String(item.nombre || item.name || item.title || ('Producto ' + (idx + 1))).trim().substring(0, 250);
    const desc = String(item.opcion || item.variantLabel || item.descripcion || item.description || '').trim().substring(0, 250);
    const img = item.img || item.imagen || item.picture_url || '';

    const mpItem = {
      id: String(item.idVariacion || item.sku || item.id || ('item-' + (idx + 1))),
      title: title,
      quantity: qty,
      currency_id: 'COP',
      unit_price: price
    };

    if (desc) mpItem.description = desc;
    if (img && typeof img === 'string' && img.indexOf('http') === 0) {
      mpItem.picture_url = img;
    }

    return mpItem;
  });

  // 5) Payer y URLs de retorno
  const rawOrigin = String(body.origin || '').trim();
  const origin = (rawOrigin.indexOf('http') === 0 && !rawOrigin.includes('localhost') && !rawOrigin.includes('127.0.0.1') && !rawOrigin.includes('file:'))
    ? rawOrigin
    : SITE_URL;

  const backUrls = {
    success: origin + '/facturas-pedidos.html?status=approved&id=' + orderId,
    pending: origin + '/facturas-pedidos.html?status=pending&id=' + orderId,
    failure: origin + '/facturas-pedidos.html?status=failure&id=' + orderId
  };

  const payerData = {
    name: clientName,
    email: clientEmail && clientEmail.indexOf('@') >= 0 ? clientEmail : 'compras@blyxu.online'
  };

  const cleanPh = cleanPhone_(clientPhone);
  if (cleanPh) {
    payerData.phone = {
      number: cleanPh
    };
  }

  if (clientAddress || clientCity) {
    payerData.address = {
      street_name: [clientAddress, clientCity].filter(Boolean).join(', ')
    };
  }

  const mpPayload = {
    items: mpItems,
    payer: payerData,
    back_urls: backUrls,
    auto_return: 'approved',
    external_reference: orderId,
    statement_descriptor: 'BLYXU',
    payment_methods: {
      excluded_payment_types: [],
      installments: 12
    }
  };

  const notificationUrl = getWebAppUrl_();
  if (notificationUrl) {
    mpPayload.notification_url = notificationUrl + '?action=mpwebhook';
  }

  // 6) Petición HTTP a Mercado Pago mediante UrlFetchApp
  const mpUrl = 'https://api.mercadopago.com/checkout/preferences';
  const response = UrlFetchApp.fetch(mpUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + token
    },
    payload: JSON.stringify(mpPayload),
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();
  let resultJson = {};

  try {
    resultJson = JSON.parse(responseText);
  } catch (e) {
    return json_({
      ok: false,
      status: 'error',
      error: 'Respuesta inválida de Mercado Pago: ' + responseText
    });
  }

  if (statusCode >= 200 && statusCode < 300 && resultJson.init_point) {
    try {
      updateRow_('Pedidos', orderId, {
        'MP Preference ID': resultJson.id || '',
        'Estado Pedido': 'Pendiente de Pago'
      });
    } catch (updateErr) {
      Logger.log('Aviso al guardar preference ID: ' + updateErr.message);
    }

    return json_({
      ok: true,
      status: 'success',
      idPedido: orderId,
      preferenceId: resultJson.id,
      promotion: customerPromotion.percent > 0 ? customerPromotion : null,
      init_point: resultJson.init_point,
      sandbox_init_point: resultJson.sandbox_init_point || resultJson.init_point
    });
  } else {
    return json_({
      ok: false,
      status: 'error',
      error: resultJson.message || resultJson.error || 'Error al generar la preferencia de pago en Mercado Pago.',
      details: resultJson
    });
  }
}

function getMercadoPagoAccessToken_() {
  try {
    const tokenFromProperties = PropertiesService.getScriptProperties().getProperty('MERCADO_PAGO_ACCESS_TOKEN');
    if (tokenFromProperties) return tokenFromProperties;
  } catch (error) {
    Logger.log('No se pudo leer Script Properties: ' + error.message);
  }
  return MERCADO_PAGO_ACCESS_TOKEN;
}

function getWebAppUrl_() {
  try {
    return ScriptApp.getService().getUrl();
  } catch (error) {
    return '';
  }
}

function isMercadoPagoPaymentNotification_(body, params) {
  const paymentId = getMercadoPagoPaymentId_(body, params);
  const type = normalizeKey_((body && (body.type || body.topic)) || (params && (params.type || params.topic)) || '');
  const action = normalizeKey_((body && body.action) || (params && params.action) || '');
  return Boolean(paymentId && (type.indexOf('payment') >= 0 || action.indexOf('payment') >= 0 || action.indexOf('pago') >= 0));
}

function getMercadoPagoPaymentId_(body, params) {
  body = body || {};
  params = params || {};
  const data = body.data || {};
  return String(
    data.id ||
    body.payment_id ||
    body.paymentId ||
    body.collection_id ||
    body.id ||
    body['data.id'] ||
    params['data.id'] ||
    params.payment_id ||
    params.paymentId ||
    params.collection_id ||
    params.id ||
    ''
  ).trim();
}

function handleMercadoPagoPaymentUpdate_(body, params) {
  ensureSheets_();
  const paymentId = getMercadoPagoPaymentId_(body, params);
  if (!paymentId) {
    return json_({
      ok: false,
      status: 'error',
      error: 'No se recibio el ID del pago de Mercado Pago.'
    });
  }

  const payment = fetchMercadoPagoPayment_(paymentId);
  const result = applyMercadoPagoPaymentToOrder_(payment);
  return json_({
    ok: true,
    status: 'success',
    paymentStatus: payment.status || '',
    data: result
  });
}

function fetchMercadoPagoPayment_(paymentId) {
  const token = getMercadoPagoAccessToken_();
  const response = UrlFetchApp.fetch('https://api.mercadopago.com/v1/payments/' + encodeURIComponent(paymentId), {
    method: 'get',
    headers: {
      'Authorization': 'Bearer ' + token
    },
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();
  let payment = {};

  try {
    payment = JSON.parse(responseText);
  } catch (error) {
    throw new Error('Respuesta invalida de Mercado Pago al verificar pago: ' + responseText);
  }

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(payment.message || payment.error || 'No se pudo verificar el pago en Mercado Pago.');
  }

  return payment;
}

function applyMercadoPagoPaymentToOrder_(payment) {
  const orderId = String(payment.external_reference || '').trim();
  if (!orderId) {
    return { applied: false, reason: 'El pago no tiene external_reference con ID de pedido.' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sheet = getSheet_('Pedidos');
    const headers = getHeaders_(sheet);
    const rowIndex = findRowIndex_(sheet, 'ID Pedido', orderId);
    if (!rowIndex) {
      return { applied: false, reason: 'No se encontro el pedido ' + orderId + '.' };
    }

    const current = rowToObject_(headers, sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0]);
    const paymentStatus = String(payment.status || '').toLowerCase();
    const alreadyDiscounted = ['si', 'sí', 'true', '1', 'descontado'].indexOf(normalizeKey_(current['Stock Descontado'])) >= 0;
    const updates = {
      'MP Payment ID': payment.id || '',
      'MP Preference ID': payment.preference_id || current['MP Preference ID'] || ''
    };

    if (paymentStatus === 'approved') {
      updates['Estado Pedido'] = 'Pagado';
      updates['Stock Descontado'] = 'SI';
      updateRow_('Pedidos', orderId, updates);
      if (!alreadyDiscounted) {
        updateStockFromOrder_(current['Productos JSON']);
      }
      return { applied: true, orderId: orderId, stockDiscounted: !alreadyDiscounted, orderStatus: 'Pagado' };
    }

    if (paymentStatus === 'pending' || paymentStatus === 'in_process') {
      updates['Estado Pedido'] = 'Pendiente de Pago';
    } else if (paymentStatus === 'rejected') {
      updates['Estado Pedido'] = 'Pago Rechazado';
    } else if (paymentStatus === 'cancelled') {
      updates['Estado Pedido'] = 'Pago Cancelado';
    } else if (paymentStatus === 'refunded' || paymentStatus === 'charged_back') {
      updates['Estado Pedido'] = 'Pago Devuelto';
    } else {
      updates['Estado Pedido'] = 'Pago ' + (payment.status || 'Actualizado');
    }

    updateRow_('Pedidos', orderId, updates);
    return { applied: true, orderId: orderId, stockDiscounted: false, orderStatus: updates['Estado Pedido'] };
  } finally {
    lock.releaseLock();
  }
}

function validateStockAvailability_(items) {
  const sheet = getSheet_('Productos');
  const headers = getHeaders_(sheet);
  const idHeader = resolveHeader_(headers, 'ID Variación', 'Productos');
  const qtyHeader = resolveHeader_(headers, 'Cantidad', 'Productos');
  const nameHeader = resolveHeader_(headers, 'Nombre del Producto', 'Productos');
  const idCol = headers.indexOf(idHeader);
  const qtyCol = headers.indexOf(qtyHeader);
  const nameCol = headers.indexOf(nameHeader);
  const errors = [];

  if (idCol < 0 || qtyCol < 0) {
    return { ok: true, errors: [] };
  }

  const lastRow = sheet.getLastRow();
  const values = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues() : [];
  const stockById = {};

  values.forEach(row => {
    const id = String(row[idCol] || '').trim();
    if (!id) return;
    stockById[id] = {
      qty: toNumber_(row[qtyCol]),
      name: nameCol >= 0 ? String(row[nameCol] || '') : id
    };
  });

  items.forEach(item => {
    const id = String(item.idVariacion || item.id || item.sku || item['ID Variación'] || item['ID Variacion'] || '').trim();
    const requested = Math.max(1, toNumber_(item.cantidad || item.Cantidad || item.qty || item.quantity || 1));
    if (!id || !stockById[id]) return;
    if (stockById[id].qty < requested) {
      errors.push({
        id: id,
        nombre: stockById[id].name,
        disponible: stockById[id].qty,
        solicitado: requested
      });
    }
  });

  return { ok: errors.length === 0, errors: errors };
}

/***************
 * OPERACIONES PRINCIPALES
 ***************/
function upsertConfig_(key, val) {
  if (!key) return;
  const sheet = getSheet_('Configuracion');
  const rowIndex = findRowIndex_(sheet, 'Clave', key);
  const now = new Date();
  
  if (!rowIndex) {
    appendRow_('Configuracion', {
      Clave: key,
      Valor: val,
      'Fecha Actualización': now
    });
  } else {
    updateRow_('Configuracion', key, {
      Valor: val,
      'Fecha Actualización': now
    });
  }
}

function getConfigValue_(key, fallback) {
  const rows = listRows_('Configuracion', {});
  const found = rows.find(row => normalizeKey_(row.Clave) === normalizeKey_(key));
  return found ? String(found.Valor || '') : (fallback || '');
}

function createOrder_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const pedido = appendRow_('Pedidos', data);

    upsertClientFromOrder_(pedido);
    updateStockFromOrder_(pedido['Productos JSON']);

    return pedido;
  } finally {
    lock.releaseLock();
  }
}

function batchSaveRows_(sheetName, itemsList) {
  const sheet = getSheet_(sheetName);
  const headers = getHeaders_(sheet);
  const primary = SHEETS[sheetName].primary;
  const primaryHeader = resolveHeader_(headers, primary, sheetName);
  const now = new Date();
  
  const lastRow = sheet.getLastRow();
  const allValues = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues() : [];
  
  const existingRowsMap = new Map();
  allValues.forEach((rowValues, idx) => {
    const rowObj = rowToObject_(headers, rowValues);
    const primaryId = String(getObjectValueByHeader_(rowObj, primaryHeader, '')).trim();
    if (primaryId) {
      existingRowsMap.set(primaryId, {
        rowIndex: idx + 2,
        data: rowObj
      });
    }
  });
  
  const savedResults = [];
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  
  try {
    itemsList.forEach(inputData => {
      const rowObject = normalizeDataForSheet_(sheetName, inputData);
      const originalId = String(
        (inputData && (inputData.__adminOriginalId || inputData.originalId || inputData.editId)) || ''
      ).trim();
      
      if (sheetName === 'Productos') {
        rowObject['ID Variación'] = rowObject['ID Variación'] || rowObject['ID Variacion'] || makeId_('VAR');
        rowObject['ID Producto'] = rowObject['ID Producto'] || rowObject['ID Variación'];
        rowObject['Estado'] = rowObject['Estado'] || 'Activo';
        rowObject['Fecha de Creación'] = rowObject['Fecha de Creación'] || now;
      }
      
      const primaryId = String(getObjectValueByHeader_(rowObject, primaryHeader, '') || getObjectValueByHeader_(rowObject, primary, '')).trim();
      const existing = existingRowsMap.get(originalId || primaryId);
      
      if (existing) {
        headers.forEach(header => {
          const value = getObjectValueByHeader_(rowObject, header);
          if (value !== undefined) {
            existing.data[header] = value;
          }
        });
        
        if (headers.includes('Fecha Actualización')) {
          existing.data['Fecha Actualización'] = now;
        }
        
        const mergedRow = headers.map(header => getObjectValueByHeader_(existing.data, header, ''));
        sheet.getRange(existing.rowIndex, 1, 1, headers.length).setValues([mergedRow]);
        savedResults.push(existing.data);
      } else {
        const row = headers.map(header => getObjectValueByHeader_(rowObject, header, ''));
        sheet.appendRow(row);
        
        const newRowIndex = sheet.getLastRow();
        existingRowsMap.set(primaryId, {
          rowIndex: newRowIndex,
          data: rowObject
        });
        
        savedResults.push(rowObject);
      }
    });
    
    return savedResults;
  } finally {
    lock.releaseLock();
  }
}

function appendRow_(sheetName, inputData) {
  const sheet = getSheet_(sheetName);
  const headers = getHeaders_(sheet);
  const rowObject = normalizeDataForSheet_(sheetName, inputData);
  const now = new Date();

  if (sheetName === 'Productos') {
    rowObject['ID Variación'] = rowObject['ID Variación'] || rowObject['ID Variacion'] || makeId_('VAR');
    rowObject['ID Producto'] = rowObject['ID Producto'] || rowObject['ID Variación'];
    rowObject['Estado'] = rowObject['Estado'] || 'Activo';
    rowObject['Fecha de Creación'] = rowObject['Fecha de Creación'] || now;
  }

  if (sheetName === 'Pedidos') {
    rowObject['ID Pedido'] = rowObject['ID Pedido'] || makeId_('PED');
    rowObject['Fecha'] = rowObject['Fecha'] || now;
    rowObject['Fecha Actualización'] = now;
    rowObject['Estado Pedido'] = rowObject['Estado Pedido'] || 'Nuevo';
    rowObject['Tipo Cliente'] = rowObject['Tipo Cliente'] || inferCustomerType_(rowObject);

    if (!rowObject['ID Cliente'] && rowObject['Teléfono']) {
      rowObject['ID Cliente'] = cleanPhone_(rowObject['Teléfono']);
    }

    fillOrderTotals_(rowObject);
  }

  if (sheetName === 'Clientes') {
    rowObject['Fecha Registro'] = rowObject['Fecha Registro'] || now;
    rowObject['Estado Cliente'] = rowObject['Estado Cliente'] || 'Activo';
    rowObject['Total Pedidos'] = rowObject['Total Pedidos'] || 0;
    rowObject['Total Gastado'] = rowObject['Total Gastado'] || 0;
  }

  if (sheetName === 'Favoritos') {
    rowObject['ID Favorito'] = rowObject['ID Favorito'] || makeId_('FAV');
    rowObject['Fecha'] = rowObject['Fecha'] || now;
    rowObject['Estado'] = rowObject['Estado'] || 'Activo';
    rowObject['Fecha Actualizacion'] = now;
  }

  if (sheetName === 'Facturas') {
    rowObject['ID Factura'] = rowObject['ID Factura'] || makeId_('FAC');
    rowObject['Fecha'] = rowObject['Fecha'] || now;
    rowObject['Fecha Actualización'] = now;
    rowObject['Estado Factura'] = rowObject['Estado Factura'] || 'Pendiente';
    rowObject['Tipo Cliente'] = rowObject['Tipo Cliente'] || inferCustomerType_(rowObject);
    const subtotal = toNumber_(rowObject['Subtotal']);
    const abonado = Math.max(0, toNumber_(rowObject['Valor Abonado']));
    rowObject['Valor Abonado'] = abonado;
    rowObject['Saldo Pendiente'] = rowObject['Saldo Pendiente'] === undefined || rowObject['Saldo Pendiente'] === ''
      ? Math.max(0, subtotal - abonado)
      : Math.max(0, toNumber_(rowObject['Saldo Pendiente']));
    rowObject['Ultimo Abono'] = Math.max(0, toNumber_(rowObject['Ultimo Abono']));
  }

  if (sheetName === 'PedidosChina') {
    rowObject['ID Pedido'] = rowObject['ID Pedido'] || makeId_('CHN');
    rowObject['Fecha'] = rowObject['Fecha'] || now;
    rowObject['Fecha Actualización'] = now;
  }

  const row = headers.map(header => getObjectValueByHeader_(rowObject, header, ''));

  if (sheetName === 'Productos' && rowObject['ID Variación']) {
    const existingRow = findRowIndex_(sheet, 'ID Variación', rowObject['ID Variación']);

    if (existingRow) {
      const current = rowToObject_(headers, sheet.getRange(existingRow, 1, 1, headers.length).getValues()[0]);

      headers.forEach(header => {
        const value = getObjectValueByHeader_(rowObject, header);
        if (value !== undefined) {
          current[header] = value;
        }
      });

      const mergedRow = headers.map(header => getObjectValueByHeader_(current, header, ''));
      sheet.getRange(existingRow, 1, 1, headers.length).setValues([mergedRow]);
      return current;
    }
  }

  sheet.appendRow(row);
  return rowObject;
}

function updateRow_(sheetName, id, inputData) {
  if (!id) throw new Error('Falta el id para actualizar.');

  const sheet = getSheet_(sheetName);
  const headers = getHeaders_(sheet);
  const primary = SHEETS[sheetName].primary;
  const primaryHeader = resolveHeader_(headers, primary, sheetName);
  const rowIndex = findRowIndex_(sheet, primaryHeader, id);

  if (!rowIndex) throw new Error('No se encontro registro con id: ' + id);

  const current = rowToObject_(headers, sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0]);
  const changes = normalizeDataForSheet_(sheetName, inputData);

  Object.keys(changes).forEach(key => {
    current[key] = changes[key];
  });

  if (headers.includes('Fecha Actualización')) {
    current['Fecha Actualización'] = new Date();
  }

  const row = headers.map(header => getObjectValueByHeader_(current, header, ''));
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);

  return current;
}

function deleteRow_(sheetName, id, rowIndex) {
  const sheet = getSheet_(sheetName);

  if (rowIndex && Number(rowIndex) > 1) {
    sheet.deleteRow(Number(rowIndex));
    return 1;
  }

  if (!id) throw new Error('Falta el id para eliminar.');

  const primary = SHEETS[sheetName].primary;
  const foundRow = findRowIndex_(sheet, primary, id);

  if (!foundRow) return 0;

  sheet.deleteRow(foundRow);
  return 1;
}

function updateStatus_(sheetName, id, estado) {
  if (!estado) throw new Error('Falta el estado.');

  const statusHeader = getStatusHeader_(sheetName);
  const data = {};
  data[statusHeader] = estado;

  return updateRow_(sheetName, id, data);
}

function getById_(sheetName, id) {
  const sheet = getSheet_(sheetName);
  const headers = getHeaders_(sheet);
  const primary = SHEETS[sheetName].primary;
  const rowIndex = findRowIndex_(sheet, primary, id);

  if (!rowIndex) return null;

  const values = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  return parseJsonFields_(rowToObject_(headers, values));
}

function listRows_(sheetName, filters) {
  const sheet = getSheet_(sheetName);
  const headers = getHeaders_(sheet);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  let rows = values
    .filter(row => row.some(cell => cell !== ''))
    .map(row => parseJsonFields_(rowToObject_(headers, row)));

  if (filters.estado) {
    const statusHeader = getStatusHeader_(sheetName);
    rows = rows.filter(row => normalizeKey_(row[statusHeader]) === normalizeKey_(filters.estado));
  }

  if (filters.categoria && sheetName === 'Productos') {
    rows = rows.filter(row => normalizeKey_(row['Categoría']) === normalizeKey_(filters.categoria));
  }

  if (filters.q) {
    const q = normalizeKey_(filters.q);
    rows = rows.filter(row => normalizeKey_(JSON.stringify(row)).includes(q));
  }

  return rows;
}

/***************
 * CUENTAS DE CLIENTES
 ***************/
function handleCustomerRegister_(body) {
  ensureSheets_();

  const cliente = body.cliente || body.customer || body;
  const nombre = String(cliente.nombre || cliente.Nombre || '').trim();
  const telefono = cleanPhone_(cliente.telefono || cliente.Telefono || cliente['Teléfono']);
  const email = normalizeEmail_(cliente.email || cliente.Email);
  const direccion = String(cliente.direccion || cliente.Direccion || cliente['Dirección'] || '').trim();
  const ciudad = String(cliente.ciudad || cliente.Ciudad || '').trim();
  const password = String(cliente.password || cliente.contrasena || cliente['Contraseña'] || '').trim();

  if (!nombre || !telefono || !email || !password) {
    return json_({
      ok: false,
      status: 'error',
      error: 'Completa nombre, telefono, correo y contraseña.'
    });
  }

  if (telefono.length < 7) {
    return json_({ ok: false, status: 'error', error: 'Ingresa un telefono valido.' });
  }

  if (!isValidEmail_(email)) {
    return json_({ ok: false, status: 'error', error: 'Ingresa un correo valido.' });
  }

  if (password.length < 6) {
    return json_({ ok: false, status: 'error', error: 'La contraseña debe tener minimo 6 caracteres.' });
  }

  const sheet = getSheet_('Clientes');
  const headers = getHeaders_(sheet);
  const existingByPhone = findRowIndex_(sheet, 'Teléfono', telefono);
  const existingByEmail = findCustomerRowByEmail_(email);
  const existingRow = existingByPhone || existingByEmail;

  if (existingByEmail && existingByPhone && existingByEmail !== existingByPhone) {
    return json_({ ok: false, status: 'error', error: 'Ese correo ya esta registrado con otro telefono.' });
  }

  const salt = makeCustomerSalt_();
  const token = makeSessionToken_();
  const now = new Date();
  const sessionExpires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
  const data = {
    'Nombre': nombre,
    'Teléfono': telefono,
    'Email': email,
    'Dirección': direccion,
    'Ciudad': ciudad,
    'Estado Cliente': 'Activo',
    'Password Hash': hashCustomerPassword_(password, salt),
    'Password Salt': salt,
    'Session Token': token,
    'Session Expira': sessionExpires,
    'Fecha Actualización': now
  };

  let saved;
  if (existingRow) {
    const current = rowToObject_(headers, sheet.getRange(existingRow, 1, 1, headers.length).getValues()[0]);
    saved = Object.assign({}, current, data);
    saved['Total Pedidos'] = current['Total Pedidos'] || 0;
    saved['Total Gastado'] = current['Total Gastado'] || 0;
    saved['Último Pedido'] = current['Último Pedido'] || current['Ãšltimo Pedido'] || '';
    saved['Fecha Registro'] = current['Fecha Registro'] || now;
    sheet.getRange(existingRow, 1, 1, headers.length).setValues([headers.map(header => getObjectValueByHeader_(saved, header, ''))]);
  } else {
    data['Total Pedidos'] = 0;
    data['Total Gastado'] = 0;
    data['Fecha Registro'] = now;
    saved = appendRow_('Clientes', data);
  }

  return json_({
    ok: true,
    status: 'success',
    token: token,
    cliente: publicCustomer_(saved || data)
  });
}

function handleCustomerLogin_(body) {
  ensureSheets_();

  const emailOrPhone = String(body.email || body.telefono || body.usuario || body.identifier || '').trim();
  const password = String(body.password || body.contrasena || body['Contraseña'] || '').trim();

  if (!emailOrPhone || !password) {
    return json_({ ok: false, status: 'error', error: 'Ingresa tu correo o telefono y contraseña.' });
  }

  const found = findCustomerByIdentifier_(emailOrPhone);
  if (!found) {
    return json_({ ok: false, status: 'error', error: 'No encontramos una cuenta con esos datos.' });
  }

  const customer = found.data;
  const salt = String(customer['Password Salt'] || '').trim();
  const expectedHash = String(customer['Password Hash'] || '').trim();
  if (!salt || !expectedHash || hashCustomerPassword_(password, salt) !== expectedHash) {
    return json_({ ok: false, status: 'error', error: 'Contraseña incorrecta.' });
  }

  const token = makeSessionToken_();
  const sessionExpires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  const telefono = customer['Teléfono'] || customer['Telefono'];
  const saved = updateRow_('Clientes', telefono, {
    'Session Token': token,
    'Session Expira': sessionExpires,
    'Estado Cliente': 'Activo'
  });

  return json_({
    ok: true,
    status: 'success',
    token: token,
    cliente: publicCustomer_(saved)
  });
}

function handleCustomerGoogleLogin_(body) {
  ensureSheets_();

  const credential = String(body.credential || body.idToken || body.tokenGoogle || '').trim();
  if (!credential) {
    return json_({ ok: false, status: 'error', error: 'No recibimos la credencial de Google.' });
  }

  const googleProfile = verifyGoogleIdToken_(credential);
  if (!googleProfile || !googleProfile.email) {
    return json_({ ok: false, status: 'error', error: 'No se pudo validar tu cuenta de Google.' });
  }

  const email = normalizeEmail_(googleProfile.email);
  const found = findCustomerByIdentifier_(email);
  const token = makeSessionToken_();
  const now = new Date();
  const sessionExpires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
  let saved;

  if (found) {
    const phone = found.data['Teléfono'] || found.data['Telefono'];
    saved = updateRow_('Clientes', phone, {
      'Nombre': googleProfile.name || found.data.Nombre || email,
      'Email': email,
      'Google ID': googleProfile.sub || '',
      'Session Token': token,
      'Session Expira': sessionExpires,
      'Estado Cliente': 'Activo'
    });
  } else {
    const phoneFromEmail = 'GOOGLE-' + String(googleProfile.sub || makeId_('G')).slice(0, 18);
    saved = appendRow_('Clientes', {
      'Nombre': googleProfile.name || email,
      'Teléfono': phoneFromEmail,
      'Email': email,
      'Google ID': googleProfile.sub || '',
      'Estado Cliente': 'Activo',
      'Session Token': token,
      'Session Expira': sessionExpires,
      'Total Pedidos': 0,
      'Total Gastado': 0,
      'Fecha Registro': now
    });
  }

  return json_({
    ok: true,
    status: 'success',
    token: token,
    cliente: publicCustomer_(saved)
  });
}

function verifyGoogleIdToken_(credential) {
  const clientId = getConfigValue_('Google_Client_ID');
  if (!clientId) {
    throw new Error('Google Login no esta configurado. Agrega el Google Client ID en el panel administrativo.');
  }

  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential), {
    method: 'get',
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();
  let payload = {};
  try {
    payload = JSON.parse(responseText);
  } catch (error) {
    throw new Error('Google no respondio una validacion valida.');
  }

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(payload.error_description || payload.error || 'No se pudo validar la cuenta de Google.');
  }

  if (String(payload.aud || '') !== String(clientId)) {
    throw new Error('El Google Client ID no coincide con esta pagina.');
  }

  if (payload.email_verified !== true && String(payload.email_verified) !== 'true') {
    throw new Error('Tu correo de Google no esta verificado.');
  }

  return {
    sub: payload.sub || '',
    email: payload.email || '',
    name: payload.name || payload.given_name || ''
  };
}

function handleCustomerProfile_(body, params) {
  ensureSheets_();
  const token = String((body && body.token) || (params && params.token) || '').trim();
  const found = findCustomerBySessionToken_(token);
  if (!found) {
    return json_({ ok: false, status: 'error', error: 'Sesion vencida. Inicia sesion nuevamente.' });
  }

  return json_({
    ok: true,
    status: 'success',
    cliente: publicCustomer_(found.data)
  });
}

function handleCustomerLogout_(body, params) {
  ensureSheets_();
  const token = String((body && body.token) || (params && params.token) || '').trim();
  const found = findCustomerBySessionToken_(token, true);
  if (found) {
    updateRow_('Clientes', found.data['Teléfono'] || found.data['Telefono'], {
      'Session Token': '',
      'Session Expira': ''
    });
  }
  return json_({ ok: true, status: 'success' });
}

function handleCustomerOrders_(body, params) {
  ensureSheets_();
  const found = getAuthenticatedCustomer_(body, params);
  if (!found) {
    return json_({ ok: false, status: 'error', error: 'Sesion vencida. Inicia sesion nuevamente.' });
  }

  const customerPhone = cleanPhone_(found.data['Teléfono'] || found.data['Telefono']);
  const customerEmail = normalizeEmail_(found.data.Email);
  const safeCustomerPhone = customerPhone || cleanPhone_(getCustomerPhoneValue_(found.data));
  const rows = listRows_('Pedidos', {});
  const orders = rows.filter(row => {
    const phone = cleanPhone_(row['Teléfono'] || row.Telefono || row.telefono);
    const email = normalizeEmail_(row.Email || row.email);
    const safePhone = phone || cleanPhone_(getCustomerPhoneValue_(row));
    return (safeCustomerPhone && safePhone === safeCustomerPhone) || (customerEmail && email === customerEmail);
  }).sort((a, b) => new Date(b.Fecha || 0) - new Date(a.Fecha || 0));

  return json_({
    ok: true,
    status: 'success',
    cliente: publicCustomer_(found.data),
    orders: orders.slice(0, 60).map(publicCustomerOrder_)
  });
}

function handleCustomerInvoices_(body, params) {
  ensureSheets_();
  const found = getAuthenticatedCustomer_(body, params);
  if (!found) {
    return json_({ ok: false, status: 'error', error: 'Sesion vencida. Inicia sesion nuevamente.' });
  }

  const customerPhone = cleanPhone_(found.data['TelÃ©fono'] || found.data['Telefono']);
  const customerEmail = normalizeEmail_(found.data.Email);
  const safeCustomerPhone = customerPhone || cleanPhone_(getCustomerPhoneValue_(found.data));
  const customerOrders = listRows_('Pedidos', {}).filter(function(row) {
    const phone = cleanPhone_(row['TelÃ©fono'] || row.Telefono || row.telefono);
    const email = normalizeEmail_(row.Email || row.email);
    const safePhone = phone || cleanPhone_(getCustomerPhoneValue_(row));
    return (safeCustomerPhone && safePhone === safeCustomerPhone) || (customerEmail && email === customerEmail);
  });
  const orderIds = {};
  customerOrders.forEach(function(order) {
    const id = String(order['ID Pedido'] || '').trim();
    if (id) orderIds[id] = true;
  });

  const invoices = listRows_('Facturas', {}).filter(function(row) {
    const invoiceCustomerPhone = cleanPhone_(row['ID Cliente'] || row.Telefono || row['TelÃ©fono'] || row.Celular);
    const invoiceEmail = normalizeEmail_(row.Email || row.email);
    const orderId = String(row['ID Pedido'] || '').trim();
    const safeInvoiceCustomerPhone = invoiceCustomerPhone || cleanPhone_(row['ID Cliente'] || getCustomerPhoneValue_(row));
    return (safeCustomerPhone && safeInvoiceCustomerPhone === safeCustomerPhone) ||
      (customerEmail && invoiceEmail === customerEmail) ||
      (orderId && orderIds[orderId]);
  }).sort(function(a, b) {
    return new Date(b.Fecha || 0) - new Date(a.Fecha || 0);
  });

  return json_({
    ok: true,
    status: 'success',
    cliente: publicCustomer_(found.data),
    invoices: invoices.slice(0, 60).map(publicCustomerInvoice_)
  });
}

function handleCustomerFavorites_(body, params) {
  ensureSheets_();
  const found = getAuthenticatedCustomer_(body, params);
  if (!found) {
    return json_({ ok: false, status: 'error', error: 'Sesion vencida. Inicia sesion nuevamente.' });
  }

  const customerPhone = cleanPhone_(found.data['Teléfono'] || found.data['Telefono']);
  const customerEmail = normalizeEmail_(found.data.Email);
  const rows = listRows_('Favoritos', {});
  const favorites = rows.filter(row => {
    const active = normalizeKey_(row.Estado || 'Activo') !== 'inactivo';
    const phone = cleanPhone_(row.Telefono || row['Teléfono']);
    const email = normalizeEmail_(row.Email);
    return active && ((customerPhone && phone === customerPhone) || (customerEmail && email === customerEmail));
  }).sort((a, b) => new Date(b.Fecha || 0) - new Date(a.Fecha || 0));

  return json_({
    ok: true,
    status: 'success',
    favorites: favorites.map(publicCustomerFavorite_)
  });
}

function handleCustomerFavoriteSave_(body, params) {
  ensureSheets_();
  const found = getAuthenticatedCustomer_(body, params);
  if (!found) {
    return json_({ ok: false, status: 'error', error: 'Debes iniciar sesion para guardar favoritos.' });
  }

  const product = body.producto || body.product || body.item || body;
  const idProducto = String(product.idProducto || product['ID Producto'] || product.referencia || product.SKU || '').trim();
  const idVariacion = String(product.idVariacion || product['ID Variación'] || product['ID Variacion'] || product.sku || product.id || '').trim();
  const nombre = String(product.nombre || product.name || product.Nombre || product['Nombre del Producto'] || 'Producto BLYXU').trim();
  const imagen = String(product.imagen || product.img || product.Imagen || product['Imagen Principal'] || '').trim();
  const precio = toNumber_(product.precio || product.price || product.Precio || 0);

  if (!idProducto && !idVariacion && !nombre) {
    return json_({ ok: false, status: 'error', error: 'No se pudo identificar el producto.' });
  }

  const customerPhone = cleanPhone_(found.data['Teléfono'] || found.data['Telefono']);
  const customerEmail = normalizeEmail_(found.data.Email);
  const sheet = getSheet_('Favoritos');
  const headers = getHeaders_(sheet);
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (let i = 0; i < values.length; i++) {
      const row = rowToObject_(headers, values[i]);
      const sameCustomer = (customerPhone && cleanPhone_(row.Telefono || row['Teléfono']) === customerPhone) ||
        (customerEmail && normalizeEmail_(row.Email) === customerEmail);
      const sameProduct = idVariacion
        ? String(row['ID Variacion']) === idVariacion
        : (idProducto && String(row['ID Producto']) === idProducto);
      if (sameCustomer && sameProduct) {
        const saved = updateRow_('Favoritos', row['ID Favorito'], {
          Estado: 'Activo',
          'Fecha Actualizacion': new Date()
        });
        return json_({ ok: true, status: 'success', favorite: publicCustomerFavorite_(saved), message: 'Producto guardado en favoritos.' });
      }
    }
  }

  const saved = appendRow_('Favoritos', {
    'ID Favorito': makeId_('FAV'),
    Fecha: new Date(),
    Telefono: customerPhone,
    Email: customerEmail,
    'ID Producto': idProducto,
    'ID Variacion': idVariacion,
    'Nombre Producto': nombre,
    Imagen: imagen,
    Precio: precio,
    Estado: 'Activo',
    'Fecha Actualizacion': new Date()
  });

  return json_({ ok: true, status: 'success', favorite: publicCustomerFavorite_(saved), message: 'Producto guardado en favoritos.' });
}

function handleCustomerFavoriteRemove_(body, params) {
  ensureSheets_();
  const found = getAuthenticatedCustomer_(body, params);
  if (!found) {
    return json_({ ok: false, status: 'error', error: 'Sesion vencida. Inicia sesion nuevamente.' });
  }

  const idFavorito = String(body.idFavorito || body.favoriteId || body.id || '').trim();
  const idProducto = String(body.idProducto || body.productId || '').trim();
  const idVariacion = String(body.idVariacion || body.variationId || '').trim();
  const customerPhone = cleanPhone_(found.data['Teléfono'] || found.data['Telefono']);
  const customerEmail = normalizeEmail_(found.data.Email);
  const sheet = getSheet_('Favoritos');
  const headers = getHeaders_(sheet);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return json_({ ok: true, status: 'success', removed: false });

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  for (let i = 0; i < values.length; i++) {
    const row = rowToObject_(headers, values[i]);
    const sameCustomer = (customerPhone && cleanPhone_(row.Telefono || row['Teléfono']) === customerPhone) ||
      (customerEmail && normalizeEmail_(row.Email) === customerEmail);
    const sameFavorite = idFavorito && String(row['ID Favorito']) === idFavorito;
    const sameProduct = idVariacion
      ? String(row['ID Variacion']) === idVariacion
      : (idProducto && String(row['ID Producto']) === idProducto);

    if (sameCustomer && (sameFavorite || sameProduct)) {
      const saved = updateRow_('Favoritos', row['ID Favorito'], {
        Estado: 'Inactivo',
        'Fecha Actualizacion': new Date()
      });
      return json_({ ok: true, status: 'success', removed: true, favorite: publicCustomerFavorite_(saved) });
    }
  }

  return json_({ ok: true, status: 'success', removed: false });
}

function handleCustomerPromotionSave_(body) {
  ensureSheets_();
  const identifier = String(body.identifier || body.usuario || body.email || body.telefono || '').trim();
  if (!identifier) {
    return json_({ ok: false, status: 'error', error: 'Ingresa telefono o correo del cliente.' });
  }

  const found = findCustomerByIdentifier_(identifier);
  if (!found) {
    return json_({ ok: false, status: 'error', error: 'No encontramos ese cliente registrado.' });
  }

  const discount = Math.max(0, Math.min(90, toNumber_(body.discount || body.descuento || body['Descuento Cliente'] || 0)));
  const title = String(body.title || body.promo || body['Promo Cliente'] || '').trim();
  const expires = String(body.expires || body.expira || body['Promo Expira'] || '').trim();
  const phone = found.data['Teléfono'] || found.data['Telefono'];
  const saved = updateRow_('Clientes', phone, {
    'Descuento Cliente': discount,
    'Promo Cliente': title,
    'Promo Expira': expires
  });

  return json_({
    ok: true,
    status: 'success',
    cliente: publicCustomer_(saved),
    message: discount > 0 ? 'Promocion asignada al cliente.' : 'Promocion del cliente desactivada.'
  });
}

function getAuthenticatedCustomer_(body, params) {
  const token = String((body && body.token) || (params && params.token) || '').trim();
  return findCustomerBySessionToken_(token);
}

function getCustomerPhoneValue_(row) {
  if (!row) return '';
  const direct = row.Telefono || row.telefono || row.Celular || row.celular || row.Phone || row.phone;
  if (direct) return direct;

  const phoneKey = Object.keys(row).find(function(key) {
    const lower = String(key || '').toLowerCase();
    const normalized = normalizeKey_(key);
    return normalized.indexOf('telefono') >= 0 ||
      normalized.indexOf('celular') >= 0 ||
      lower.indexOf('fono') >= 0;
  });

  return phoneKey ? row[phoneKey] : '';
}

function publicCustomerOrder_(order) {
  const products = parseMaybeJson_(order['Productos JSON']);
  return {
    id: order['ID Pedido'] || '',
    fecha: order.Fecha || '',
    estado: order['Estado Pedido'] || '',
    metodo: order['Método Contacto'] || order['Metodo Contacto'] || '',
    total: toNumber_(order.Subtotal),
    cantidadTotal: toNumber_(order['Cantidad Total']),
    productos: Array.isArray(products) ? products.slice(0, 12).map(function(item) {
      return {
        id: item.id || item.idVariacion || item['ID Variacion'] || item['ID VariaciÃ³n'] || item.sku || item.SKU || '',
        idVariacion: item.idVariacion || item['ID Variacion'] || item['ID VariaciÃ³n'] || item.id || item.sku || item.SKU || '',
        sku: item.sku || item.SKU || item.idVariacion || item.id || '',
        nombre: item.nombre || item.name || item.Producto || 'Producto',
        opcion: item.opcion || item.variantLabel || item.Estilo || '',
        cantidad: toNumber_(item.cantidad || item.qty || item.quantity || 1),
        precio: toNumber_(item.precio || item.price || 0),
        imagen: item.img || item.imagen || ''
      };
    }) : []
  };
}

function publicCustomerInvoice_(invoice) {
  const products = parseMaybeJson_(invoice['Productos JSON']);
  return {
    id: invoice['ID Factura'] || '',
    pedidoId: invoice['ID Pedido'] || '',
    fecha: invoice.Fecha || '',
    estado: invoice['Estado Factura'] || '',
    tipoCliente: invoice['Tipo Cliente'] || '',
    total: toNumber_(invoice.Subtotal),
    valorAbonado: toNumber_(invoice['Valor Abonado']),
    saldoPendiente: toNumber_(invoice['Saldo Pendiente']),
    ultimoAbono: toNumber_(invoice['Ultimo Abono']),
    metodoPago: invoice['MÃ©todo Pago'] || invoice['Metodo Pago'] || '',
    metodoEntrega: invoice['MÃ©todo Entrega'] || invoice['Metodo Entrega'] || '',
    observaciones: invoice.Observaciones || '',
    productos: Array.isArray(products) ? products.slice(0, 12).map(function(item) {
      return {
        id: item.id || item.idVariacion || item['ID Variacion'] || item['ID VariaciÃ³n'] || item.sku || item.SKU || '',
        idVariacion: item.idVariacion || item['ID Variacion'] || item['ID VariaciÃ³n'] || item.id || item.sku || item.SKU || '',
        sku: item.sku || item.SKU || item.idVariacion || item.id || '',
        nombre: item.nombre || item.name || item.Producto || 'Producto',
        opcion: item.opcion || item.variantLabel || item.Estilo || '',
        cantidad: toNumber_(item.cantidad || item.qty || item.quantity || 1),
        precio: toNumber_(item.precio || item.price || 0),
        imagen: item.img || item.imagen || ''
      };
    }) : []
  };
}

function publicCustomerFavorite_(favorite) {
  return {
    idFavorito: favorite['ID Favorito'] || '',
    fecha: favorite.Fecha || '',
    idProducto: favorite['ID Producto'] || '',
    idVariacion: favorite['ID Variacion'] || '',
    nombre: favorite['Nombre Producto'] || '',
    imagen: favorite.Imagen || '',
    precio: toNumber_(favorite.Precio),
    estado: favorite.Estado || 'Activo'
  };
}

function findCustomerByIdentifier_(identifier) {
  const cleanIdentifier = cleanPhone_(identifier);
  const email = normalizeEmail_(identifier);
  const sheet = getSheet_('Clientes');
  const headers = getHeaders_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  for (let i = 0; i < values.length; i++) {
    const data = rowToObject_(headers, values[i]);
    const phone = cleanPhone_(data['Teléfono'] || data['Telefono']);
    const customerEmail = normalizeEmail_(data.Email);
    if ((cleanIdentifier && phone === cleanIdentifier) || (email && customerEmail === email)) {
      return { rowIndex: i + 2, data: data };
    }
  }
  return null;
}

function findCustomerRowByEmail_(email) {
  const found = findCustomerByIdentifier_(email);
  return found ? found.rowIndex : null;
}

function findCustomerBySessionToken_(token, allowExpired) {
  if (!token) return null;
  const sheet = getSheet_('Clientes');
  const headers = getHeaders_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  for (let i = 0; i < values.length; i++) {
    const data = rowToObject_(headers, values[i]);
    if (String(data['Session Token'] || '').trim() !== token) continue;
    const expires = new Date(data['Session Expira']);
    if (!allowExpired && (!data['Session Expira'] || Number.isNaN(expires.getTime()) || expires.getTime() < Date.now())) {
      return null;
    }
    return { rowIndex: i + 2, data: data };
  }
  return null;
}

function publicCustomer_(customer) {
  const promotion = getActiveCustomerPromotion_(customer);
  return {
    nombre: customer['Nombre'] || '',
    telefono: customer['Teléfono'] || customer['Telefono'] || '',
    email: customer['Email'] || '',
    direccion: customer['Dirección'] || customer['Direccion'] || '',
    ciudad: customer['Ciudad'] || '',
    totalPedidos: customer['Total Pedidos'] || 0,
    totalGastado: customer['Total Gastado'] || 0,
    ultimoPedido: customer['Último Pedido'] || customer['Ãšltimo Pedido'] || '',
    descuentoCliente: promotion.percent,
    promoCliente: promotion.label,
    promoExpira: promotion.expires || ''
  };
}

function getActiveCustomerPromotion_(customer) {
  if (!customer) {
    return { percent: 0, label: '', expires: '' };
  }

  const globalPromotion = getGlobalRegisteredCustomerPromotion_();
  if (globalPromotion.percent > 0) {
    return globalPromotion;
  }

  const percent = Math.max(0, Math.min(90, toNumber_(customer['Descuento Cliente'] || customer.descuentoCliente || 0)));
  const label = String(customer['Promo Cliente'] || customer.promoCliente || 'Promo cliente registrado').trim();
  const expires = String(customer['Promo Expira'] || customer.promoExpira || '').trim();

  if (!percent) {
    return { percent: 0, label: '', expires: '' };
  }

  if (expires) {
    const expirationDate = new Date(expires);
    if (!Number.isNaN(expirationDate.getTime()) && expirationDate.getTime() < Date.now()) {
      return { percent: 0, label: '', expires: expires };
    }
  }

  return { percent: percent, label: label || 'Promo cliente registrado', expires: expires };
}

function getGlobalRegisteredCustomerPromotion_() {
  const enabled = String(getConfigValue_('Promo_Clientes_Enabled', 'false')).trim() === 'true';
  if (!enabled) {
    return { percent: 0, label: '', expires: '' };
  }

  const percent = Math.max(0, Math.min(90, toNumber_(getConfigValue_('Promo_Clientes_Discount', 0))));
  const label = String(getConfigValue_('Promo_Clientes_Title', 'Promo cliente registrado')).trim();
  const expires = String(getConfigValue_('Promo_Clientes_Expire', '')).trim();

  if (!percent) {
    return { percent: 0, label: '', expires: '' };
  }

  if (expires) {
    const expirationDate = new Date(expires);
    if (!Number.isNaN(expirationDate.getTime()) && expirationDate.getTime() < Date.now()) {
      return { percent: 0, label: '', expires: expires };
    }
  }

  return { percent: percent, label: label || 'Promo cliente registrado', expires: expires };
}

function applyCustomerPromotionToItems_(items, promotion) {
  const percent = Math.max(0, Math.min(90, toNumber_(promotion && promotion.percent)));
  const discountFactor = percent > 0 ? (1 - (percent / 100)) : 1;
  let originalTotal = 0;
  let payableTotal = 0;

  const pricedItems = (items || []).map(function(item) {
    const qty = Math.max(1, toNumber_(item.cantidad || item.qty || item.quantity || 1));
    const originalPrice = toNumber_(item.precio || item.price || 0);
    const finalPrice = Math.max(0, Math.round(originalPrice * discountFactor));
    originalTotal += originalPrice * qty;
    payableTotal += finalPrice * qty;

    const next = Object.assign({}, item);
    next.precioOriginal = originalPrice;
    next.precio = finalPrice;
    next.price = finalPrice;
    next.subtotal = finalPrice * qty;
    if (percent > 0) {
      next.descuentoCliente = percent;
      next.promoCliente = promotion.label || 'Promo cliente registrado';
    }
    return next;
  });

  return {
    items: pricedItems,
    originalTotal: originalTotal,
    discountAmount: Math.max(0, originalTotal - payableTotal),
    payableTotal: payableTotal
  };
}

function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

function makeCustomerSalt_() {
  return Utilities.getUuid() + '-' + Date.now();
}

function makeSessionToken_() {
  return Utilities.getUuid() + '-' + Utilities.getUuid();
}

function hashCustomerPassword_(password, salt) {
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + '|' + password,
    Utilities.Charset.UTF_8
  );
  return raw.map(function(byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

/***************
 * CLIENTES Y STOCK
 ***************/
function upsertClientFromOrder_(pedido) {
  const telefono = pedido['Teléfono'];
  if (!telefono) return;

  const sheet = getSheet_('Clientes');
  const headers = getHeaders_(sheet);
  const rowIndex = findRowIndex_(sheet, 'Teléfono', telefono);
  const now = new Date();
  const subtotal = toNumber_(pedido['Subtotal']);

  if (!rowIndex) {
    appendRow_('Clientes', {
      Nombre: pedido['Nombre Cliente'],
      Teléfono: telefono,
      Email: pedido.Email || pedido.email || '',
      Dirección: pedido['Dirección'],
      Ciudad: pedido['Ciudad'],
      'Total Pedidos': 1,
      'Total Gastado': subtotal,
      'Último Pedido': pedido['Fecha'] || now,
      'Estado Cliente': 'Activo',
      'Fecha Registro': now
    });
    return;
  }

  const current = rowToObject_(headers, sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0]);

  current['Nombre'] = pedido['Nombre Cliente'] || current['Nombre'];
  current['Email'] = pedido.Email || pedido.email || current['Email'];
  current['Dirección'] = pedido['Dirección'] || current['Dirección'];
  current['Ciudad'] = pedido['Ciudad'] || current['Ciudad'];
  current['Total Pedidos'] = toNumber_(current['Total Pedidos']) + 1;
  current['Total Gastado'] = toNumber_(current['Total Gastado']) + subtotal;
  current['Último Pedido'] = pedido['Fecha'] || now;
  current['Estado Cliente'] = current['Estado Cliente'] || 'Activo';

  const row = headers.map(header => current[header] !== undefined ? current[header] : '');
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);
}

function updateStockFromOrder_(productosJson) {
  const productos = parseMaybeJson_(productosJson);
  if (!Array.isArray(productos)) return;

  const sheet = getSheet_('Productos');
  const headers = getHeaders_(sheet);
  const idCol = headers.indexOf('ID Variación') + 1;
  const qtyCol = headers.indexOf('Cantidad') + 1;

  if (!idCol || !qtyCol) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  productos.forEach(item => {
    const id = item['ID Variación'] || item['ID Variacion'] || item.idVariacion || item.id || item.variationId || item.sku;
    const cantidad = toNumber_(item.cantidad || item.Cantidad || item.qty || item.quantity || 1);

    if (!id || cantidad <= 0) return;

    for (let i = 0; i < values.length; i++) {
      const currentId = values[i][idCol - 1];
      if (String(currentId) === String(id)) {
        const currentQty = toNumber_(values[i][qtyCol - 1]);
        const newQty = Math.max(0, currentQty - cantidad);
        sheet.getRange(i + 2, qtyCol).setValue(newQty);
        break;
      }
    }
  });
}

/***************
 * HELPERS
 ***************/
function ensureSheets_() {
  const ss = getSpreadsheet_();

  Object.keys(SHEETS).forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }

    const expectedHeaders = SHEETS[sheetName].headers;
    const lastCol = Math.max(sheet.getLastColumn(), expectedHeaders.length);

    let currentHeaders = [];
    if (sheet.getLastRow() >= 1 && sheet.getLastColumn() >= 1) {
      currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].filter(String);
    }

    if (currentHeaders.length === 0) {
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
      sheet.setFrozenRows(1);
      return;
    }

    const normalizedCurrentHeaders = currentHeaders.map(header => normalizeKey_(header));
    expectedHeaders.forEach(header => {
      if (!normalizedCurrentHeaders.includes(normalizeKey_(header))) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
        normalizedCurrentHeaders.push(normalizeKey_(header));
      }
    });

    sheet.setFrozenRows(1);
  });
}

function getSpreadsheet_() {
  const configuredId = SPREADSHEET_ID || PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '';
  if (configuredId) {
    return SpreadsheetApp.openById(configuredId);
  }

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  throw new Error('Falta configurar SPREADSHEET_ID. Pega el ID del Google Sheet en la constante SPREADSHEET_ID o ejecuta configurarBlyxuSpreadsheet("ID_DE_TU_SHEET").');
}

function getSheet_(sheetName) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    ensureSheets_();
    sheet = ss.getSheetByName(sheetName);
  }
  if (!sheet) throw new Error('No existe la hoja: ' + sheetName);
  return sheet;
}

function getHeaders_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].filter(String);
}

function rowToObject_(headers, row) {
  const obj = {};
  headers.forEach((header, index) => {
    obj[header] = row[index];
  });
  return obj;
}

function getObjectValueByHeader_(obj, header, fallback) {
  if (!obj) return fallback;
  if (obj[header] !== undefined) return obj[header];

  const normalizedHeader = normalizeKey_(header);
  const matchingKey = Object.keys(obj).find(key => normalizeKey_(key) === normalizedHeader);
  return matchingKey ? obj[matchingKey] : fallback;
}

function normalizeDataForSheet_(sheetName, data) {
  const headers = SHEETS[sheetName].headers;
  const output = {};

  Object.keys(data || {}).forEach(key => {
    if (['action', 'resource', 'recurso', 'sheet', 'hoja', 'data', 'id'].includes(key)) return;

    const header = findHeader_(headers, key, sheetName);
    if (!header) return;

    let value = data[key];

    if ((header === 'Productos JSON' || header === 'Galería JSON') && typeof value !== 'string') {
      value = JSON.stringify(value || []);
    }

    if (sheetName === 'Productos' && header === 'Estilo') {
      value = cleanProductStyleForSheet_(value);
    }

    output[header] = value;
  });

  return output;
}

function cleanProductStyleForSheet_(value) {
  const raw = String(value || '').trim();
  const clean = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return ['ambos', 'minorista', 'mayorista', 'minorista y mayorista'].includes(clean) ? '' : raw;
}

function inferCustomerType_(rowObject) {
  const explicit = String(rowObject['Tipo Cliente'] || rowObject.tipo || rowObject.tipoCliente || '').trim();
  const normalizedExplicit = explicit.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (normalizedExplicit.indexOf('mayor') >= 0 || normalizedExplicit.indexOf('wholesale') >= 0) return 'Mayor';
  if (normalizedExplicit.indexOf('detal') >= 0 || normalizedExplicit.indexOf('minor') >= 0 || normalizedExplicit.indexOf('retail') >= 0) return 'Detal';

  const id = String(rowObject['ID Pedido'] || '').toLowerCase();
  if (id.indexOf('may-') === 0) return 'Mayor';
  if (id.indexOf('det-') === 0) return 'Detal';

  const method = String(rowObject['Método Contacto'] || rowObject['Metodo Contacto'] || '').toLowerCase();
  if (method.indexOf('mayor') >= 0 || method.indexOf('wholesale') >= 0) return 'Mayor';
  if (method.indexOf('detal') >= 0 || method.indexOf('minor') >= 0 || method.indexOf('retail') >= 0) return 'Detal';

  const items = parseMaybeJson_(rowObject['Productos JSON']);
  if (Array.isArray(items) && items.some(item => {
    const mode = String(item.modo || item.mode || item.tipo || '').toLowerCase();
    return mode.indexOf('wholesale') >= 0 || mode.indexOf('mayor') >= 0;
  })) {
    return 'Mayor';
  }

  return 'Detal';
}

function findHeader_(headers, key, sheetName) {
  const normalizedKey = normalizeKey_(key);

  const direct = headers.find(header => normalizeKey_(header) === normalizedKey);
  if (direct) return direct;

  const aliases = {
    Productos: {
      id: 'ID Variación',
      idvariacion: 'ID Variación',
      idvariación: 'ID Variación',
      idproducto: 'ID Producto',
      galeria: 'Galería JSON',
      galeriajson: 'Galería JSON',
      imagenes: 'Galería JSON',
      imagenPrincipal: 'Imagen Principal',
      imagenprincipal: 'Imagen Principal',
      imagen: 'Imagen Principal',
      nombre: 'Nombre del Producto',
      producto: 'Nombre del Producto',
      categoria: 'Categoría',
      catalogo: 'Catalogo',
      publicacion: 'Catalogo',
      descripcion: 'Características del producto',
      caracteristicas: 'Características del producto',
      tamano: 'Tamaño',
      tamaño: 'Tamaño',
      talla: 'Tamaño',
      promo: 'Promocion',
      promocion: 'Promocion',
      stock: 'Cantidad',
      cantidad: 'Cantidad',
      precioMayorista: 'Precio Mayor',
      preciomayorista: 'Precio Mayor',
      precioMayor: 'Precio Mayor',
      preciomayor: 'Precio Mayor'
    },
    Pedidos: {
      nombre: 'Nombre Cliente',
      cliente: 'Nombre Cliente',
      telefono: 'Teléfono',
      email: 'Email',
      direccion: 'Dirección',
      productos: 'Productos JSON',
      carrito: 'Productos JSON',
      items: 'Productos JSON',
      total: 'Subtotal',
      tipo: 'Tipo Cliente',
      tipoCliente: 'Tipo Cliente',
      tipocliente: 'Tipo Cliente',
      clienteTipo: 'Tipo Cliente',
      clientetipo: 'Tipo Cliente',
      estado: 'Estado Pedido',
      estadopedido: 'Estado Pedido',
      metodo: 'Método Contacto',
      metodocontacto: 'Método Contacto',
      metodopago: 'Método Contacto',
      nota: 'Nota Cliente',
      notacliente: 'Nota Cliente'
    },
    Clientes: {
      telefono: 'Teléfono',
      direccion: 'Dirección',
      email: 'Email',
      nombre: 'Nombre',
      descuento: 'Descuento Cliente',
      descuentocliente: 'Descuento Cliente',
      promo: 'Promo Cliente',
      promocliente: 'Promo Cliente',
      expira: 'Promo Expira',
      promoexpira: 'Promo Expira'
    },
    Favoritos: {
      id: 'ID Favorito',
      idfavorito: 'ID Favorito',
      favoriteid: 'ID Favorito',
      fecha: 'Fecha',
      telefono: 'Telefono',
      email: 'Email',
      idproducto: 'ID Producto',
      productid: 'ID Producto',
      idvariacion: 'ID Variacion',
      variationid: 'ID Variacion',
      sku: 'ID Variacion',
      nombre: 'Nombre Producto',
      producto: 'Nombre Producto',
      nombreproducto: 'Nombre Producto',
      imagen: 'Imagen',
      img: 'Imagen',
      precio: 'Precio',
      price: 'Precio',
      estado: 'Estado'
    },
    Facturas: {
      productos: 'Productos JSON',
      items: 'Productos JSON',
      total: 'Subtotal',
      abono: 'Valor Abonado',
      abonado: 'Valor Abonado',
      valorAbonado: 'Valor Abonado',
      valorabonado: 'Valor Abonado',
      totalAbonado: 'Valor Abonado',
      totalabonado: 'Valor Abonado',
      pagoRecibido: 'Valor Abonado',
      pagorecibido: 'Valor Abonado',
      pagado: 'Valor Abonado',
      saldo: 'Saldo Pendiente',
      saldoPendiente: 'Saldo Pendiente',
      saldopendiente: 'Saldo Pendiente',
      ultimoAbono: 'Ultimo Abono',
      ultimoabono: 'Ultimo Abono',
      tipo: 'Tipo Cliente',
      tipoCliente: 'Tipo Cliente',
      tipocliente: 'Tipo Cliente',
      clienteTipo: 'Tipo Cliente',
      clientetipo: 'Tipo Cliente',
      pago: 'Método Pago',
      entrega: 'Método Entrega'
    },
    PedidosChina: {
      id: 'ID Pedido',
      idpedido: 'ID Pedido',
      idPedido: 'ID Pedido',
      fecha: 'Fecha',
      fabrica: 'Fábrica',
      fábrica: 'Fábrica',
      trm: 'TRM',
      totalusd: 'Total USD',
      totalcop: 'Total COP',
      totalproductos: 'Total Productos',
      totalpiezas: 'Total Piezas',
      productos: 'Productos JSON',
      items: 'Productos JSON',
      notas: 'Notas',
      showusd: 'Mostrar USD',
      showcop: 'Mostrar COP',
      showref: 'Mostrar Ref',
      mostrarusd: 'Mostrar USD',
      mostrarcop: 'Mostrar COP',
      mostrarref: 'Mostrar Ref'
    }
  };

  const sheetAliases = aliases[sheetName] || {};
  const aliasKey = Object.keys(sheetAliases).find(alias => normalizeKey_(alias) === normalizedKey);

  return aliasKey ? sheetAliases[aliasKey] : null;
}

function resolveHeader_(headers, key, sheetName) {
  const direct = findHeader_(headers, key, sheetName);
  if (direct && headers.includes(direct)) return direct;

  const candidates = [key];
  const rawKey = String(key || '').toLowerCase();
  if ((sheetName === 'Productos' || !sheetName) && (normalizeKey_(key).includes('idvariaci') || rawKey.includes('variaci'))) {
    candidates.push('ID Variación', 'ID Variacion', 'ID');
  }

  for (let i = 0; i < candidates.length; i++) {
    const normalized = normalizeKey_(candidates[i]);
    const match = headers.find(header => normalizeKey_(header) === normalized);
    if (match) return match;
  }

  return direct || key;
}

function findRowIndex_(sheet, keyHeader, value) {
  const headers = getHeaders_(sheet);
  const resolvedHeader = resolveHeader_(headers, keyHeader, null);
  const normalizedTarget = normalizeKey_(resolvedHeader || keyHeader);
  let col = headers.indexOf(resolvedHeader) + 1;

  if (!col) {
    const idx = headers.findIndex(header => normalizeKey_(header) === normalizedTarget);
    col = idx + 1;
  }

  if (!col) throw new Error('No existe la columna: ' + keyHeader);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, col, lastRow - 1, 1).getValues();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(value)) {
      return i + 2;
    }
  }

  return null;
}

function fillOrderTotals_(pedido) {
  const productos = parseMaybeJson_(pedido['Productos JSON']);

  if (!Array.isArray(productos)) return;

  if (!pedido['Cantidad Total']) {
    pedido['Cantidad Total'] = productos.reduce((sum, item) => {
      return sum + toNumber_(item.cantidad || item.Cantidad || item.qty || item.quantity || 1);
    }, 0);
  }

  if (!pedido['Subtotal']) {
    pedido['Subtotal'] = productos.reduce((sum, item) => {
      const qty = toNumber_(item.cantidad || item.Cantidad || item.qty || item.quantity || 1);
      const price = toNumber_(item.precio || item.Precio || item.price || 0);
      return sum + qty * price;
    }, 0);
  }
}

function parseJsonFields_(obj) {
  ['Productos JSON', 'Galería JSON'].forEach(key => {
    if (obj[key]) {
      obj[key] = parseMaybeJson_(obj[key]);
    }
  });

  return obj;
}

function parseMaybeJson_(value) {
  if (!value) return [];
  if (Array.isArray(value) || typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    throw new Error('El body enviado no es JSON valido.');
  }
}

function sheetFromResource_(resource) {
  const key = normalizeKey_(resource);

  const map = {
    producto: 'Productos',
    productos: 'Productos',
    pedido: 'Pedidos',
    pedidos: 'Pedidos',
    cliente: 'Clientes',
    clientes: 'Clientes',
    favorito: 'Favoritos',
    favoritos: 'Favoritos',
    factura: 'Facturas',
    facturas: 'Facturas',
    configuracion: 'Configuracion',
    config: 'Configuracion',
    pedidoschina: 'PedidosChina',
    pedidochina: 'PedidosChina',
    chinapedidos: 'PedidosChina',
    china: 'PedidosChina'
  };

  return map[key] || null;
}

function getStatusHeader_(sheetName) {
  if (sheetName === 'Productos') return 'Estado';
  if (sheetName === 'Pedidos') return 'Estado Pedido';
  if (sheetName === 'Clientes') return 'Estado Cliente';
  if (sheetName === 'Favoritos') return 'Estado';
  if (sheetName === 'Facturas') return 'Estado Factura';
  if (sheetName === 'PedidosChina') return 'ID Pedido';
  throw new Error('Hoja no valida.');
}

function makeId_(prefix) {
  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss');
  const random = Math.floor(Math.random() * 9000) + 1000;
  return prefix + '-' + date + '-' + random;
}

function cleanPhone_(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function toNumber_(value) {
  const n = Number(String(value || 0).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function normalizeKey_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/***************
 * PRUEBAS RAPIDAS
 ***************/
function configurarBlyxuSpreadsheet(spreadsheetId) {
  const id = String(spreadsheetId || '').trim();
  if (!id) throw new Error('Pega el ID del Google Sheet.');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', id);
  ensureSheets_();
  return 'Spreadsheet configurado y hojas verificadas.';
}

function verificarSistemaClientes() {
  ensureSheets_();
  const sheet = getSheet_('Clientes');
  const headers = getHeaders_(sheet);
  const required = [
    'Nombre',
    'Telefono',
    'Email',
    'Password Hash',
    'Password Salt',
    'Session Token',
    'Session Expira'
  ];
  const missing = required.filter(function(header) {
    return !headers.some(function(currentHeader) {
      return normalizeKey_(currentHeader) === normalizeKey_(header);
    });
  });

  return {
    ok: missing.length === 0,
    hoja: 'Clientes',
    faltantes: missing,
    mensaje: missing.length
      ? 'Faltan columnas para el registro de clientes.'
      : 'Clientes listo para registro, login, pedidos, facturas y favoritos.'
  };
}

function probarRegistroCliente() {
  const now = Date.now();
  const response = handleCustomerRegister_({
    cliente: {
      nombre: 'Cliente Prueba BLYXU',
      telefono: '300000' + String(now).slice(-4),
      email: 'cliente.prueba.' + now + '@blyxu.test',
      direccion: 'Prueba',
      ciudad: 'Bogota',
      password: '123456'
    }
  });

  return response.getContent();
}
