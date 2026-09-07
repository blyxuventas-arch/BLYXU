/***************
 * CONFIGURACION
 ***************/
const SPREADSHEET_ID = '';

// Credenciales Mercado Pago (Checkout Pro - Catálogo Minorista)
const MERCADO_PAGO_PUBLIC_KEY = 'APP_USR-72ab41d6-5fc7-4867-8e02-564ab0ae9f99';
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
      'Dirección',
      'Ciudad',
      'Productos JSON',
      'Cantidad Total',
      'Subtotal',
      'Estado Pedido',
      'Método Contacto',
      'Nota Cliente',
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
      'Fecha Registro'
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
  const token = MERCADO_PAGO_ACCESS_TOKEN;
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

  const clientName = String(cliente.nombre || body.nombre || body['Nombre Cliente'] || 'Cliente Minorista').trim();
  const clientPhone = String(cliente.telefono || body.telefono || body['Teléfono'] || '').trim();
  const clientEmail = String(cliente.email || body.email || '').trim();
  const clientAddress = String(cliente.direccion || body.direccion || body['Dirección'] || '').trim();
  const clientCity = String(cliente.ciudad || body.ciudad || body['Ciudad'] || '').trim();
  const clientNote = String(cliente.nota || body.nota || body['Nota Cliente'] || '').trim();

  // 3) Pre-registrar pedido en la hoja 'Pedidos'
  const now = new Date();
  const orderId = body['ID Pedido'] || body.idPedido || makeId_('DET');

  const totalQty = items.reduce((sum, item) => sum + toNumber_(item.cantidad || item.qty || item.quantity || 1), 0);
  const calculatedTotal = items.reduce((sum, item) => {
    const qty = toNumber_(item.cantidad || item.qty || item.quantity || 1);
    const price = toNumber_(item.precio || item.price || 0);
    return sum + (qty * price);
  }, 0);
  const total = toNumber_(body.total || body.subtotal) || calculatedTotal;

  const orderData = {
    'ID Pedido': orderId,
    'Fecha': now,
    'Nombre Cliente': clientName,
    'Tipo Cliente': 'Detal',
    'Teléfono': clientPhone,
    'Dirección': clientAddress,
    'Ciudad': clientCity,
    'Productos JSON': JSON.stringify(items),
    'Cantidad Total': totalQty,
    'Subtotal': total,
    'Estado Pedido': 'Pendiente de Pago',
    'Método Contacto': 'Mercado Pago Checkout Pro',
    'Nota Cliente': clientNote,
    'Fecha Actualización': now
  };

  try {
    const pedidoGuardado = appendRow_('Pedidos', orderData);
    upsertClientFromOrder_(pedidoGuardado);
  } catch (sheetErr) {
    Logger.log('Aviso al guardar pedido previo a MP: ' + sheetErr.message);
  }

  // 4) Armar Items para la API de Preferencias de Mercado Pago
  const mpItems = items.map((item, idx) => {
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
    return json_({
      ok: true,
      status: 'success',
      idPedido: orderId,
      preferenceId: resultJson.id,
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
  return SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
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
      nombre: 'Nombre'
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
