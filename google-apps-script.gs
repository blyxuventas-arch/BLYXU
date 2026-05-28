/***************
 * CONFIGURACION
 ***************/
const SPREADSHEET_ID = '';

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
      'Fecha',
      'Productos JSON',
      'Cantidad Total',
      'Subtotal',
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
    ensureSheets_();

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
      
      return json_({
        ok: true,
        status: 'success',
        url: 'https://drive.google.com/uc?export=view&id=' + file.getId()
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
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
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
      nota: 'Nota Cliente'
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
      pago: 'Método Pago',
      entrega: 'Método Entrega'
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
    config: 'Configuracion'
  };

  return map[key] || null;
}

function getStatusHeader_(sheetName) {
  if (sheetName === 'Productos') return 'Estado';
  if (sheetName === 'Pedidos') return 'Estado Pedido';
  if (sheetName === 'Clientes') return 'Estado Cliente';
  if (sheetName === 'Facturas') return 'Estado Factura';
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
