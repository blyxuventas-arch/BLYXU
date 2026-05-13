// CONFIGURACION GENERAL
// Si el Apps Script NO esta creado desde la hoja, pega aqui el ID del Google Sheet.
// Si si esta creado desde la hoja, dejalo vacio.
var SPREADSHEET_ID = '';

// CONFIGURACION DE PESTANAS
var HOJA_VARIANTES = 'VARIANTES';
var HOJA_PEDIDOS = 'PEDIDOS';
var HOJA_CLIENTES = 'CLIENTES';
var HOJA_FACTURAS = 'FACTURAS';
var HOJA_CONFIG = 'CONFIGURACION';

var HEADERS_VARIANTES = [
  'ID Variacion',
  'ID Producto',
  'Nombre del Producto',
  'Categoria',
  'Catalogo',
  'Precio',
  'Precio Mayor',
  'Stock Inicial',
  'Cantidad',
  'Caracteristicas del producto',
  'Tamano',
  'Color',
  'Estilo',
  'Imagen Principal',
  'Galeria JSON',
  'SKU',
  'Estado',
  'Fecha de Creacion'
];

var HEADERS_PEDIDOS = [
  'ID Pedido',
  'Fecha',
  'ID Cliente',
  'Nombre Cliente',
  'Telefono',
  'Direccion',
  'Ciudad',
  'Productos JSON',
  'Cantidad Total',
  'Subtotal',
  'Estado Pedido',
  'Metodo Contacto',
  'Nota Cliente',
  'Fecha Actualizacion'
];

var HEADERS_CLIENTES = [
  'ID Cliente',
  'Nombre',
  'Telefono',
  'Email',
  'Direccion',
  'Ciudad',
  'Total Pedidos',
  'Total Gastado',
  'Ultimo Pedido',
  'Estado Cliente',
  'Fecha Registro'
];

var HEADERS_FACTURAS = [
  'ID Factura',
  'ID Pedido',
  'ID Cliente',
  'Fecha',
  'Productos JSON',
  'Cantidad Total',
  'Subtotal',
  'Estado Factura',
  'Metodo Pago',
  'Metodo Entrega',
  'Observaciones',
  'Fecha Actualizacion'
];

var HEADERS_CONFIG = [
  'Clave',
  'Valor',
  'Fecha Actualizacion'
];

function doOptions(e) {
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  try {
    var doc = getSpreadsheet_();
    var action = getParam_(e, 'action') || '';

    if (action === 'get_config') {
      return createJsonResponse({
        status: 'success',
        config: getConfig_(doc)
      });
    }

    var sheetName = getParam_(e, 'sheet') || HOJA_VARIANTES;
    var headers = getHeadersForSheet_(sheetName);
    var sheet = headers
      ? getOrCreateSheet(doc, sheetName, headers)
      : doc.getSheetByName(sheetName);

    if (!sheet) {
      return createJsonResponse({
        status: 'error',
        message: 'Hoja no encontrada: ' + sheetName
      });
    }

    var rows = sheetToObjects_(sheet);

    if (sheetName === HOJA_VARIANTES) {
      rows = rows.map(normalizeVariantForStore_);
    }

    return createJsonResponse({
      status: 'success',
      data: rows.reverse()
    });
  } catch (error) {
    return createJsonResponse({
      status: 'error',
      message: String(error && error.message ? error.message : error)
    });
  }
}

function doPost(e) {
  try {
    var doc = getSpreadsheet_();
    var data = parsePayload_(e);
    var action = data.action || '';

    // Alias usado por tu admin actual.
    if (action === 'agregar') action = 'add_product';

    // 1. INVENTARIO / VARIANTES
    if (action === 'add_product' || action === 'edit_product') {
      var sheetVariantes = getOrCreateSheet(doc, HOJA_VARIANTES, HEADERS_VARIANTES);
      var productData = normalizeProductPayload_(data);
      var searchId = productData['ID Variacion'] || data.editId || data.id;

      if (!searchId) searchId = Utilities.getUuid();
      productData['ID Variacion'] = searchId;
      if (!productData['ID Producto']) productData['ID Producto'] = searchId;
      if (!productData['Fecha de Creacion']) productData['Fecha de Creacion'] = new Date().toISOString();
      if (!productData['Estado']) productData['Estado'] = 'Activo';

      upsertRow(sheetVariantes, 'ID Variacion', searchId, productData);
      return createJsonResponse({
        status: 'success',
        id: searchId
      });
    }

    if (action === 'delete_product') {
      var sheetDelete = doc.getSheetByName(HOJA_VARIANTES);
      var deleted = deleteRowsByColumnMatch(sheetDelete, 'ID Variacion', data.id);
      if (!deleted && data.ID_Producto) deleted = deleteRowsByColumnMatch(sheetDelete, 'ID Producto', data.ID_Producto);
      return createJsonResponse({
        status: deleted ? 'success' : 'error'
      });
    }

    // 2. PEDIDOS Y CLIENTES
    if (action === 'add_order' || action === 'edit_order') {
      var sheetPedidos = getOrCreateSheet(doc, HOJA_PEDIDOS, HEADERS_PEDIDOS);
      var orderId = data['ID Pedido'] || Utilities.getUuid();
      data['ID Pedido'] = orderId;
      data['Fecha Actualizacion'] = new Date().toISOString();
      if (!data['Fecha']) data['Fecha'] = new Date().toISOString();
      if (!data['Estado Pedido']) data['Estado Pedido'] = 'Pendiente';
      upsertRow(sheetPedidos, 'ID Pedido', orderId, data);

      saveOrUpdateClient_(doc, data);
      discountStockFromOrder_(doc, data);

      return createJsonResponse({
        status: 'success',
        id: orderId
      });
    }

    if (action === 'update_order_status') {
      var updated = updateOrderStatus_(doc, data);
      return createJsonResponse({
        status: updated ? 'success' : 'error'
      });
    }

    // 3. FACTURAS
    if (action === 'add_invoice') {
      var sheetFacturas = getOrCreateSheet(doc, HOJA_FACTURAS, HEADERS_FACTURAS);
      var invoiceId = data['ID Factura'] || Utilities.getUuid();
      data['ID Factura'] = invoiceId;
      if (!data['Fecha']) data['Fecha'] = new Date().toISOString();
      data['Fecha Actualizacion'] = new Date().toISOString();
      upsertRow(sheetFacturas, 'ID Factura', invoiceId, data);
      return createJsonResponse({
        status: 'success',
        id: invoiceId
      });
    }

    // 4. CONFIGURACION
    if (action === 'set_config') {
      var sheetConfig = getOrCreateSheet(doc, HOJA_CONFIG, HEADERS_CONFIG);
      var key = data.Clave || data.key;
      var value = data.Valor || data.value;
      if (!key) throw new Error('Falta Clave en set_config');
      upsertRow(sheetConfig, 'Clave', key, {
        Clave: key,
        Valor: value,
        'Fecha Actualizacion': new Date().toISOString()
      });
      return createJsonResponse({
        status: 'success'
      });
    }

    // 5. IMAGENES
    if (action === 'upload_image') {
      var folders = DriveApp.getFoldersByName('PRODUCTOS_Images');
      var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('PRODUCTOS_Images');
      var file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(data.base64Data), data.mimeType, data.fileName));
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return createJsonResponse({
        status: 'success',
        url: 'https://drive.google.com/uc?export=view&id=' + file.getId()
      });
    }

    return createJsonResponse({
      status: 'error',
      message: 'Accion no valida: ' + action
    });
  } catch (error) {
    return createJsonResponse({
      status: 'error',
      message: String(error && error.message ? error.message : error)
    });
  }
}

function getSpreadsheet_() {
  var doc = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();

  if (!doc) {
    throw new Error('No se pudo abrir el Google Sheet. Pega el ID en SPREADSHEET_ID o crea el Apps Script desde la hoja.');
  }

  return doc;
}

function getParam_(e, name) {
  return e && e.parameter && e.parameter[name] ? e.parameter[name] : '';
}

function parsePayload_(e) {
  if (e && e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (err) {
      // Si no era JSON, Apps Script igual puede traer e.parameter.
    }
  }
  return e && e.parameter ? e.parameter : {};
}

function getHeadersForSheet_(sheetName) {
  if (sheetName === HOJA_VARIANTES) return HEADERS_VARIANTES;
  if (sheetName === HOJA_PEDIDOS) return HEADERS_PEDIDOS;
  if (sheetName === HOJA_CLIENTES) return HEADERS_CLIENTES;
  if (sheetName === HOJA_FACTURAS) return HEADERS_FACTURAS;
  if (sheetName === HOJA_CONFIG) return HEADERS_CONFIG;
  return null;
}

function getOrCreateSheet(doc, name, headers) {
  var sheet = doc.getSheetByName(name);
  if (!sheet) {
    sheet = doc.insertSheet(name);
  }
  ensureHeaders_(sheet, headers);
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  if (!headers || !headers.length) return;

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  var lastColumn = Math.max(sheet.getLastColumn(), headers.length);
  var currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(header) {
    return String(header || '').trim();
  });

  if (currentHeaders.join('') === '') {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    currentHeaders = headers.slice();
  }

  var changed = false;
  headers.forEach(function(header) {
    if (currentHeaders.indexOf(header) === -1) {
      currentHeaders.push(header);
      changed = true;
    }
  });

  if (changed) {
    sheet.getRange(1, 1, 1, currentHeaders.length).setValues([currentHeaders]);
  }

  sheet.getRange(1, 1, 1, currentHeaders.length)
    .setFontWeight('bold')
    .setBackground('#d9d2e9');
  sheet.setFrozenRows(1);
}

function sheetToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0].map(function(header) {
    return String(header || '').trim();
  });
  var result = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var obj = {};
    var empty = true;

    for (var j = 0; j < headers.length; j++) {
      var key = headers[j];
      if (!key) continue;
      obj[key] = row[j];
      if (row[j] !== '' && row[j] !== null) empty = false;
    }

    if (!empty) result.push(obj);
  }

  return result;
}

function normalizeProductPayload_(data) {
  var product = {};

  product['ID Variacion'] = pick_(data, ['ID Variacion', 'ID Variación', 'id', 'editId']);
  product['ID Producto'] = pick_(data, ['ID Producto', 'ID_Producto']);
  product['Nombre del Producto'] = pick_(data, ['Nombre del Producto', 'Nombre', 'Producto', 'nombre']);
  product['Categoria'] = pick_(data, ['Categoria', 'Categoría', 'categoria']);
  product['Catalogo'] = pick_(data, ['Catalogo', 'Catálogo', 'catalogo']) || 'Ambos';
  product['Precio'] = pick_(data, ['Precio', 'precio', 'Precio_Publico']);
  product['Precio Mayor'] = pick_(data, ['Precio Mayor', 'Precio_Mayorista', 'PrecioMayorista', 'Mayorista', 'precio_mayorista']);
  product['Stock Inicial'] = pick_(data, ['Stock Inicial', 'Stock', 'stock', 'Cantidad']);
  product['Cantidad'] = pick_(data, ['Cantidad', 'Stock', 'stock', 'Stock Inicial']);
  product['Caracteristicas del producto'] = pick_(data, ['Caracteristicas del producto', 'Características del producto', 'Descripcion', 'Descripción', 'descripcion']);
  product['Tamano'] = pick_(data, ['Tamano', 'Tamaño', 'Talla', 'Size']);
  product['Color'] = pick_(data, ['Color', 'color']);
  product['Estilo'] = pick_(data, ['Estilo', 'estilo']);
  product['Imagen Principal'] = pick_(data, ['Imagen Principal', 'Imagen', 'imagen', 'Foto']);
  product['Galeria JSON'] = pick_(data, ['Galeria JSON', 'Galería JSON', 'Galeria', 'Galería']);
  product['SKU'] = pick_(data, ['SKU', 'sku']);
  product['Estado'] = pick_(data, ['Estado', 'estado']) || 'Activo';
  product['Fecha de Creacion'] = pick_(data, ['Fecha de Creacion', 'Fecha de Creación']);

  return product;
}

function normalizeVariantForStore_(row) {
  var normalized = {};

  // Conserva tambien las columnas originales para paneles avanzados.
  Object.keys(row).forEach(function(key) {
    normalized[key] = row[key];
  });

  normalized.ID = pick_(row, ['ID Variacion', 'ID Variación']);
  normalized.Nombre = pick_(row, ['Nombre', 'Nombre del Producto', 'Producto']);
  normalized.Categoria = pick_(row, ['Categoria', 'Categoría']);
  normalized.Catalogo = pick_(row, ['Catalogo', 'Catálogo']) || 'Ambos';
  normalized.Precio = pick_(row, ['Precio']);
  normalized.Precio_Mayorista = pick_(row, ['Precio_Mayorista', 'Precio Mayor', 'PrecioMayorista', 'Mayorista']);
  normalized.Stock = pick_(row, ['Stock', 'Cantidad', 'Stock Inicial']);
  normalized.Imagen = pick_(row, ['Imagen', 'Imagen Principal', 'Foto']);
  normalized.Color = pick_(row, ['Color']);
  normalized.Descripcion = pick_(row, ['Descripcion', 'Descripción', 'Caracteristicas del producto', 'Características del producto']);
  normalized.Estado = pick_(row, ['Estado']) || 'Activo';

  return normalized;
}

function pick_(obj, keys) {
  for (var i = 0; i < keys.length; i++) {
    if (obj[keys[i]] !== undefined && obj[keys[i]] !== null && obj[keys[i]] !== '') {
      return obj[keys[i]];
    }
  }
  return '';
}

function upsertRow(sheet, keyColumnName, keyValue, payload) {
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function(header) {
    return String(header || '').trim();
  });
  var keyColIndex = headers.indexOf(keyColumnName);
  var rowIndex = -1;

  if (keyColIndex !== -1 && keyValue) {
    for (var i = 1; i < values.length; i++) {
      if (values[i][keyColIndex] == keyValue) {
        rowIndex = i + 1;
        break;
      }
    }
  }

  var rowData = new Array(headers.length);
  for (var j = 0; j < headers.length; j++) {
    var colName = headers[j];
    if (payload[colName] !== undefined) rowData[j] = payload[colName];
    else if (rowIndex !== -1) rowData[j] = values[rowIndex - 1][j];
    else rowData[j] = '';
  }

  if (rowIndex !== -1) sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  else sheet.appendRow(rowData);
}

function deleteRowsByColumnMatch(sheet, columnName, valueToMatch) {
  if (!sheet || !valueToMatch) return false;

  var values = sheet.getDataRange().getValues();
  if (!values.length) return false;

  var headers = values[0].map(function(header) {
    return String(header || '').trim();
  });
  var colIndex = headers.indexOf(columnName);
  if (colIndex === -1) return false;

  var deleted = false;
  for (var i = values.length - 1; i >= 1; i--) {
    if (values[i][colIndex] == valueToMatch) {
      sheet.deleteRow(i + 1);
      deleted = true;
    }
  }
  return deleted;
}

function saveOrUpdateClient_(doc, data) {
  var phone = pick_(data, ['Telefono', 'Teléfono']);
  if (!phone) return;

  var sheetClientes = getOrCreateSheet(doc, HOJA_CLIENTES, HEADERS_CLIENTES);
  var rows = sheetToObjects_(sheetClientes);
  var clientId = data['ID Cliente'];

  if (!clientId) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i]['Telefono'] == phone || rows[i]['Teléfono'] == phone) {
        clientId = rows[i]['ID Cliente'];
        break;
      }
    }
  }

  var clientData = {
    'ID Cliente': clientId || Utilities.getUuid(),
    'Nombre': data['Nombre Cliente'] || '',
    'Telefono': phone,
    'Email': data.Email || '',
    'Direccion': pick_(data, ['Direccion', 'Dirección']),
    'Ciudad': data.Ciudad || '',
    'Ultimo Pedido': data.Fecha || new Date().toISOString(),
    'Estado Cliente': clientId ? 'Activo' : 'Nuevo',
    'Fecha Registro': clientId ? '' : new Date().toISOString()
  };

  upsertRow(sheetClientes, 'ID Cliente', clientData['ID Cliente'], clientData);
}

function discountStockFromOrder_(doc, data) {
  if (!data['Productos JSON']) return;

  try {
    var items = JSON.parse(data['Productos JSON']);
    var sheetVar = doc.getSheetByName(HOJA_VARIANTES);
    if (!sheetVar) return;

    var values = sheetVar.getDataRange().getValues();
    var headers = values[0].map(function(header) {
      return String(header || '').trim();
    });
    var idCol = headers.indexOf('ID Variacion');
    var stockCol = headers.indexOf('Cantidad');

    if (idCol === -1 || stockCol === -1) return;

    items.forEach(function(item) {
      if (!item.idVariacion) return;
      for (var i = 1; i < values.length; i++) {
        if (values[i][idCol] == item.idVariacion) {
          var currentStock = Number(values[i][stockCol]) || 0;
          var newStock = currentStock - (Number(item.cantidad) || 1);
          sheetVar.getRange(i + 1, stockCol + 1).setValue(Math.max(0, newStock));
          break;
        }
      }
    });
  } catch (err) {
    // No se bloquea el pedido si falla el descuento de stock.
  }
}

function updateOrderStatus_(doc, data) {
  var sheet = doc.getSheetByName(HOJA_PEDIDOS);
  if (!sheet) return false;

  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function(header) {
    return String(header || '').trim();
  });
  var statusIndex = headers.indexOf('Estado Pedido');
  var idIndex = headers.indexOf('ID Pedido');

  if (statusIndex === -1 || idIndex === -1) return false;

  for (var i = 1; i < values.length; i++) {
    if (values[i][idIndex] == data['ID Pedido']) {
      sheet.getRange(i + 1, statusIndex + 1).setValue(data['Estado Pedido']);
      return true;
    }
  }

  return false;
}

function getConfig_(doc) {
  var sheet = getOrCreateSheet(doc, HOJA_CONFIG, HEADERS_CONFIG);
  var rows = sheetToObjects_(sheet);
  var config = {};

  rows.forEach(function(row) {
    if (row.Clave) config[row.Clave] = row.Valor;
  });

  return config;
}

function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
