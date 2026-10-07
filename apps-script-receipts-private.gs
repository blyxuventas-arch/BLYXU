/* @noble/hashes 2.0.1
The MIT License (MIT)

Copyright (c) 2022 Paul Miller (https://paulmillr.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.*/
var BlyxuCrypto = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // crypto-entry.js
  var crypto_entry_exports = {};
  __export(crypto_entry_exports, {
    hmac: () => hmac,
    pbkdf2: () => pbkdf2,
    sha1: () => sha1,
    sha256: () => sha256
  });

  // noble/package/utils.js
  function isBytes(a) {
    return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
  }
  function anumber(n, title = "") {
    if (!Number.isSafeInteger(n) || n < 0) {
      const prefix = title && `"${title}" `;
      throw new Error(`${prefix}expected integer >= 0, got ${n}`);
    }
  }
  function abytes(value, length, title = "") {
    const bytes = isBytes(value);
    const len = value?.length;
    const needsLen = length !== void 0;
    if (!bytes || needsLen && len !== length) {
      const prefix = title && `"${title}" `;
      const ofLen = needsLen ? ` of length ${length}` : "";
      const got = bytes ? `length=${len}` : `type=${typeof value}`;
      throw new Error(prefix + "expected Uint8Array" + ofLen + ", got " + got);
    }
    return value;
  }
  function ahash(h) {
    if (typeof h !== "function" || typeof h.create !== "function")
      throw new Error("Hash must wrapped by utils.createHasher");
    anumber(h.outputLen);
    anumber(h.blockLen);
  }
  function aexists(instance, checkFinished = true) {
    if (instance.destroyed)
      throw new Error("Hash instance has been destroyed");
    if (checkFinished && instance.finished)
      throw new Error("Hash#digest() has already been called");
  }
  function aoutput(out, instance) {
    abytes(out, void 0, "digestInto() output");
    const min = instance.outputLen;
    if (out.length < min) {
      throw new Error('"digestInto() output" expected to be of length >=' + min);
    }
  }
  function clean(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
      arrays[i].fill(0);
    }
  }
  function createView(arr) {
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  function rotr(word, shift) {
    return word << 32 - shift | word >>> shift;
  }
  function rotl(word, shift) {
    return word << shift | word >>> 32 - shift >>> 0;
  }
  function utf8ToBytes(str) {
    if (typeof str !== "string")
      throw new Error("string expected");
    return new Uint8Array(new TextEncoder().encode(str));
  }
  function kdfInputToBytes(data, errorTitle = "") {
    if (typeof data === "string")
      return utf8ToBytes(data);
    return abytes(data, void 0, errorTitle);
  }
  function checkOpts(defaults, opts) {
    if (opts !== void 0 && {}.toString.call(opts) !== "[object Object]")
      throw new Error("options must be object or undefined");
    const merged = Object.assign(defaults, opts);
    return merged;
  }
  function createHasher(hashCons, info = {}) {
    const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
    const tmp = hashCons(void 0);
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.create = (opts) => hashCons(opts);
    Object.assign(hashC, info);
    return Object.freeze(hashC);
  }
  var oidNist = (suffix) => ({
    oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
  });

  // noble/package/hmac.js
  var _HMAC = class {
    constructor(hash, key) {
      __publicField(this, "oHash");
      __publicField(this, "iHash");
      __publicField(this, "blockLen");
      __publicField(this, "outputLen");
      __publicField(this, "finished", false);
      __publicField(this, "destroyed", false);
      ahash(hash);
      abytes(key, void 0, "key");
      this.iHash = hash.create();
      if (typeof this.iHash.update !== "function")
        throw new Error("Expected instance of class which extends utils.Hash");
      this.blockLen = this.iHash.blockLen;
      this.outputLen = this.iHash.outputLen;
      const blockLen = this.blockLen;
      const pad = new Uint8Array(blockLen);
      pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
      for (let i = 0; i < pad.length; i++)
        pad[i] ^= 54;
      this.iHash.update(pad);
      this.oHash = hash.create();
      for (let i = 0; i < pad.length; i++)
        pad[i] ^= 54 ^ 92;
      this.oHash.update(pad);
      clean(pad);
    }
    update(buf) {
      aexists(this);
      this.iHash.update(buf);
      return this;
    }
    digestInto(out) {
      aexists(this);
      abytes(out, this.outputLen, "output");
      this.finished = true;
      this.iHash.digestInto(out);
      this.oHash.update(out);
      this.oHash.digestInto(out);
      this.destroy();
    }
    digest() {
      const out = new Uint8Array(this.oHash.outputLen);
      this.digestInto(out);
      return out;
    }
    _cloneInto(to) {
      to || (to = Object.create(Object.getPrototypeOf(this), {}));
      const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
      to = to;
      to.finished = finished;
      to.destroyed = destroyed;
      to.blockLen = blockLen;
      to.outputLen = outputLen;
      to.oHash = oHash._cloneInto(to.oHash);
      to.iHash = iHash._cloneInto(to.iHash);
      return to;
    }
    clone() {
      return this._cloneInto();
    }
    destroy() {
      this.destroyed = true;
      this.oHash.destroy();
      this.iHash.destroy();
    }
  };
  var hmac = (hash, key, message) => new _HMAC(hash, key).update(message).digest();
  hmac.create = (hash, key) => new _HMAC(hash, key);

  // noble/package/pbkdf2.js
  function pbkdf2Init(hash, _password, _salt, _opts) {
    ahash(hash);
    const opts = checkOpts({ dkLen: 32, asyncTick: 10 }, _opts);
    const { c, dkLen, asyncTick } = opts;
    anumber(c, "c");
    anumber(dkLen, "dkLen");
    anumber(asyncTick, "asyncTick");
    if (c < 1)
      throw new Error("iterations (c) must be >= 1");
    const password = kdfInputToBytes(_password, "password");
    const salt = kdfInputToBytes(_salt, "salt");
    const DK = new Uint8Array(dkLen);
    const PRF = hmac.create(hash, password);
    const PRFSalt = PRF._cloneInto().update(salt);
    return { c, dkLen, asyncTick, DK, PRF, PRFSalt };
  }
  function pbkdf2Output(PRF, PRFSalt, DK, prfW, u) {
    PRF.destroy();
    PRFSalt.destroy();
    if (prfW)
      prfW.destroy();
    clean(u);
    return DK;
  }
  function pbkdf2(hash, password, salt, opts) {
    const { c, dkLen, DK, PRF, PRFSalt } = pbkdf2Init(hash, password, salt, opts);
    let prfW;
    const arr = new Uint8Array(4);
    const view = createView(arr);
    const u = new Uint8Array(PRF.outputLen);
    for (let ti = 1, pos = 0; pos < dkLen; ti++, pos += PRF.outputLen) {
      const Ti = DK.subarray(pos, pos + PRF.outputLen);
      view.setInt32(0, ti, false);
      (prfW = PRFSalt._cloneInto(prfW)).update(arr).digestInto(u);
      Ti.set(u.subarray(0, Ti.length));
      for (let ui = 1; ui < c; ui++) {
        PRF._cloneInto(prfW).update(u).digestInto(u);
        for (let i = 0; i < Ti.length; i++)
          Ti[i] ^= u[i];
      }
    }
    return pbkdf2Output(PRF, PRFSalt, DK, prfW, u);
  }

  // noble/package/_md.js
  function Chi(a, b, c) {
    return a & b ^ ~a & c;
  }
  function Maj(a, b, c) {
    return a & b ^ a & c ^ b & c;
  }
  var HashMD = class {
    constructor(blockLen, outputLen, padOffset, isLE) {
      __publicField(this, "blockLen");
      __publicField(this, "outputLen");
      __publicField(this, "padOffset");
      __publicField(this, "isLE");
      // For partial updates less than block size
      __publicField(this, "buffer");
      __publicField(this, "view");
      __publicField(this, "finished", false);
      __publicField(this, "length", 0);
      __publicField(this, "pos", 0);
      __publicField(this, "destroyed", false);
      this.blockLen = blockLen;
      this.outputLen = outputLen;
      this.padOffset = padOffset;
      this.isLE = isLE;
      this.buffer = new Uint8Array(blockLen);
      this.view = createView(this.buffer);
    }
    update(data) {
      aexists(this);
      abytes(data);
      const { view, buffer, blockLen } = this;
      const len = data.length;
      for (let pos = 0; pos < len; ) {
        const take = Math.min(blockLen - this.pos, len - pos);
        if (take === blockLen) {
          const dataView = createView(data);
          for (; blockLen <= len - pos; pos += blockLen)
            this.process(dataView, pos);
          continue;
        }
        buffer.set(data.subarray(pos, pos + take), this.pos);
        this.pos += take;
        pos += take;
        if (this.pos === blockLen) {
          this.process(view, 0);
          this.pos = 0;
        }
      }
      this.length += data.length;
      this.roundClean();
      return this;
    }
    digestInto(out) {
      aexists(this);
      aoutput(out, this);
      this.finished = true;
      const { buffer, view, blockLen, isLE } = this;
      let { pos } = this;
      buffer[pos++] = 128;
      clean(this.buffer.subarray(pos));
      if (this.padOffset > blockLen - pos) {
        this.process(view, 0);
        pos = 0;
      }
      for (let i = pos; i < blockLen; i++)
        buffer[i] = 0;
      view.setBigUint64(blockLen - 8, BigInt(this.length * 8), isLE);
      this.process(view, 0);
      const oview = createView(out);
      const len = this.outputLen;
      if (len % 4)
        throw new Error("_sha2: outputLen must be aligned to 32bit");
      const outLen = len / 4;
      const state = this.get();
      if (outLen > state.length)
        throw new Error("_sha2: outputLen bigger than state");
      for (let i = 0; i < outLen; i++)
        oview.setUint32(4 * i, state[i], isLE);
    }
    digest() {
      const { buffer, outputLen } = this;
      this.digestInto(buffer);
      const res = buffer.slice(0, outputLen);
      this.destroy();
      return res;
    }
    _cloneInto(to) {
      to || (to = new this.constructor());
      to.set(...this.get());
      const { blockLen, buffer, length, finished, destroyed, pos } = this;
      to.destroyed = destroyed;
      to.finished = finished;
      to.length = length;
      to.pos = pos;
      if (length % blockLen)
        to.buffer.set(buffer);
      return to;
    }
    clone() {
      return this._cloneInto();
    }
  };
  var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
    1779033703,
    3144134277,
    1013904242,
    2773480762,
    1359893119,
    2600822924,
    528734635,
    1541459225
  ]);

  // noble/package/sha2.js
  var SHA256_K = /* @__PURE__ */ Uint32Array.from([
    1116352408,
    1899447441,
    3049323471,
    3921009573,
    961987163,
    1508970993,
    2453635748,
    2870763221,
    3624381080,
    310598401,
    607225278,
    1426881987,
    1925078388,
    2162078206,
    2614888103,
    3248222580,
    3835390401,
    4022224774,
    264347078,
    604807628,
    770255983,
    1249150122,
    1555081692,
    1996064986,
    2554220882,
    2821834349,
    2952996808,
    3210313671,
    3336571891,
    3584528711,
    113926993,
    338241895,
    666307205,
    773529912,
    1294757372,
    1396182291,
    1695183700,
    1986661051,
    2177026350,
    2456956037,
    2730485921,
    2820302411,
    3259730800,
    3345764771,
    3516065817,
    3600352804,
    4094571909,
    275423344,
    430227734,
    506948616,
    659060556,
    883997877,
    958139571,
    1322822218,
    1537002063,
    1747873779,
    1955562222,
    2024104815,
    2227730452,
    2361852424,
    2428436474,
    2756734187,
    3204031479,
    3329325298
  ]);
  var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
  var SHA2_32B = class extends HashMD {
    constructor(outputLen) {
      super(64, outputLen, 8, false);
    }
    get() {
      const { A, B, C, D, E, F, G, H } = this;
      return [A, B, C, D, E, F, G, H];
    }
    // prettier-ignore
    set(A, B, C, D, E, F, G, H) {
      this.A = A | 0;
      this.B = B | 0;
      this.C = C | 0;
      this.D = D | 0;
      this.E = E | 0;
      this.F = F | 0;
      this.G = G | 0;
      this.H = H | 0;
    }
    process(view, offset) {
      for (let i = 0; i < 16; i++, offset += 4)
        SHA256_W[i] = view.getUint32(offset, false);
      for (let i = 16; i < 64; i++) {
        const W15 = SHA256_W[i - 15];
        const W2 = SHA256_W[i - 2];
        const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
        const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
        SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
      }
      let { A, B, C, D, E, F, G, H } = this;
      for (let i = 0; i < 64; i++) {
        const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
        const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
        const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
        const T2 = sigma0 + Maj(A, B, C) | 0;
        H = G;
        G = F;
        F = E;
        E = D + T1 | 0;
        D = C;
        C = B;
        B = A;
        A = T1 + T2 | 0;
      }
      A = A + this.A | 0;
      B = B + this.B | 0;
      C = C + this.C | 0;
      D = D + this.D | 0;
      E = E + this.E | 0;
      F = F + this.F | 0;
      G = G + this.G | 0;
      H = H + this.H | 0;
      this.set(A, B, C, D, E, F, G, H);
    }
    roundClean() {
      clean(SHA256_W);
    }
    destroy() {
      this.set(0, 0, 0, 0, 0, 0, 0, 0);
      clean(this.buffer);
    }
  };
  var _SHA256 = class extends SHA2_32B {
    constructor() {
      super(32);
      // We cannot use array here since array allows indexing by variable
      // which means optimizer/compiler cannot use registers.
      __publicField(this, "A", SHA256_IV[0] | 0);
      __publicField(this, "B", SHA256_IV[1] | 0);
      __publicField(this, "C", SHA256_IV[2] | 0);
      __publicField(this, "D", SHA256_IV[3] | 0);
      __publicField(this, "E", SHA256_IV[4] | 0);
      __publicField(this, "F", SHA256_IV[5] | 0);
      __publicField(this, "G", SHA256_IV[6] | 0);
      __publicField(this, "H", SHA256_IV[7] | 0);
    }
  };
  var sha256 = /* @__PURE__ */ createHasher(
    () => new _SHA256(),
    /* @__PURE__ */ oidNist(1)
  );

  // noble/package/legacy.js
  var SHA1_IV = /* @__PURE__ */ Uint32Array.from([
    1732584193,
    4023233417,
    2562383102,
    271733878,
    3285377520
  ]);
  var SHA1_W = /* @__PURE__ */ new Uint32Array(80);
  var _SHA1 = class extends HashMD {
    constructor() {
      super(64, 20, 8, false);
      __publicField(this, "A", SHA1_IV[0] | 0);
      __publicField(this, "B", SHA1_IV[1] | 0);
      __publicField(this, "C", SHA1_IV[2] | 0);
      __publicField(this, "D", SHA1_IV[3] | 0);
      __publicField(this, "E", SHA1_IV[4] | 0);
    }
    get() {
      const { A, B, C, D, E } = this;
      return [A, B, C, D, E];
    }
    set(A, B, C, D, E) {
      this.A = A | 0;
      this.B = B | 0;
      this.C = C | 0;
      this.D = D | 0;
      this.E = E | 0;
    }
    process(view, offset) {
      for (let i = 0; i < 16; i++, offset += 4)
        SHA1_W[i] = view.getUint32(offset, false);
      for (let i = 16; i < 80; i++)
        SHA1_W[i] = rotl(SHA1_W[i - 3] ^ SHA1_W[i - 8] ^ SHA1_W[i - 14] ^ SHA1_W[i - 16], 1);
      let { A, B, C, D, E } = this;
      for (let i = 0; i < 80; i++) {
        let F, K;
        if (i < 20) {
          F = Chi(B, C, D);
          K = 1518500249;
        } else if (i < 40) {
          F = B ^ C ^ D;
          K = 1859775393;
        } else if (i < 60) {
          F = Maj(B, C, D);
          K = 2400959708;
        } else {
          F = B ^ C ^ D;
          K = 3395469782;
        }
        const T = rotl(A, 5) + F + E + K + SHA1_W[i] | 0;
        E = D;
        D = C;
        C = rotl(B, 30);
        B = A;
        A = T;
      }
      A = A + this.A | 0;
      B = B + this.B | 0;
      C = C + this.C | 0;
      D = D + this.D | 0;
      E = E + this.E | 0;
      this.set(A, B, C, D, E);
    }
    roundClean() {
      clean(SHA1_W);
    }
    destroy() {
      this.set(0, 0, 0, 0, 0);
      clean(this.buffer);
    }
  };
  var sha1 = /* @__PURE__ */ createHasher(() => new _SHA1());
  return __toCommonJS(crypto_entry_exports);
})();
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */

/***************
 * CONFIGURACION
 ***************/
const SPREADSHEET_ID = '';

// Credenciales Mercado Pago (Checkout Pro - Catálogo Minorista)
const MERCADO_PAGO_PUBLIC_KEY = 'APP_USR-72ab41d6-5fc7-4867-8e02-564ab0ae9f99';
// Token privado de prueba. No lo subas a repositorios públicos.
const MERCADO_PAGO_ACCESS_TOKEN = ''; // Configurar una credencial nueva en Propiedades del Script.
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
      'Tipo Medida',
      'Unidad Medida',
      'Ancho',
      'Largo',
      'Fondo',
      'Radio',
      'Talla Textil',
      'Color',
      'Estilo',
      'Promocion',
      'Imagen Principal',
      'Galería JSON',
      'SKU',
      'Codigo Barras',
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
    const body = parseBody_(e);
    const params = Object.assign({}, e.parameter || {}, body);

    const action = normalizeKey_(body.action || params.action || '');
    const resource = body.resource || body.recurso || body.sheet || body.hoja ||
      params.resource || params.recurso || params.sheet || params.hoja;

    const authorization = securityAuthorizeRequest_(body, params, action, resource, method);
    if (authorization.response) return json_(authorization.response);
    if (action === 'customerrecords') return securityCustomerRecords_(body,params);

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
      return json_({ ok: true, status: 'success', config: authorization.admin ? configObj : securityPublicConfig_(configObj) });
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
        return json_({ ok: true, status: 'success', data: sheetName === 'Clientes' ? securityAdminCustomer_(row) : row });
      }

      const rows = listRows_(sheetName, params);
      return json_({ ok: true, status: 'success', data: sheetName === 'Clientes' ? rows.map(securityAdminCustomer_) : rows });
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
          if (!authorization.admin) {
            data['ID Pedido'] = makeId_('PED');
            data['Estado Pedido'] = 'Pendiente'; data['Stock Descontado'] = 'NO';
            const wholesale = normalizeKey_(data['Tipo Cliente'] || '') === 'mayor';
            const items = securityCatalogItems_(parseMaybeJson_(data['Productos JSON']),wholesale);
            const customer = customerKeyOwner_(body.token);
            if(customer){data['Teléfono']=getCustomerPhoneValue_(customer.data);data.Telefono=data['Teléfono'];data['Nombre Cliente']=customer.data.Nombre;data.Email=customer.data.Email||'';}
            delete data.token;
            const promotion = wholesale ? {percent:0} : getActiveCustomerPromotion_(customer ? customer.data : null);
            const priced = applyCustomerPromotionToItems_(items,promotion).items;
            const consultation = toNumber_(data.Subtotal) === 0 && String(getConfigValue_('Mostrar_Precios_Minorista','true')) !== 'true';
            data['Productos JSON'] = JSON.stringify(priced);
            data.Subtotal = consultation ? 0 : priced.reduce(function(total,item){return total+item.precio*item.cantidad;},0);
            data['Cantidad Total'] = priced.reduce(function(total,item){return total+item.cantidad;},0);
            delete data.adminCredential; delete data['Payment Status'];
          }
          const pedido = createOrder_(data);
          return json_({ ok: true, status: 'success', data: pedido, receipt:receiptRegister_(pedido,body.token) });
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
      error: /^(Acceso no autorizado|Inicia sesión|Cuenta sin permiso|Cuenta de Google|Token de Google)/.test(error.message || '') ? error.message : 'No se pudo completar la solicitud de forma segura.'
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
      error: 'Los pagos en línea están temporalmente pausados. Puedes registrar tu pedido y consultar por WhatsApp.'
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
  const items = securityCatalogItems_(Array.isArray(rawItems) ? rawItems : parseMaybeJson_(rawItems), false);

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
  const registeredCustomer = customerKeyOwner_(sessionToken);
  const customerPromotion = getActiveCustomerPromotion_(registeredCustomer ? registeredCustomer.data : null);
  const pricedCart = applyCustomerPromotionToItems_(items, customerPromotion);
  const orderItems = pricedCart.items;

  // 3) Pre-registrar pedido en la hoja 'Pedidos'
  const now = new Date();
  const orderId = makeId_('DET');

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
  const origin = SITE_URL;

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
    if (tokenFromProperties) {
      const fingerprint = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,tokenFromProperties,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
      if (fingerprint === '5e3b73448921db57bf4801f0ca272ff65666b7434596c67d6a04dd012e0440dc') return '';
      return tokenFromProperties;
    }
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

function normalizeBarcode_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '')
    .toUpperCase()
    .slice(0, 48);
}

function makeProductBarcode_(idProducto, idVariacion) {
  const base = normalizeBarcode_(idVariacion || idProducto);
  return base ? 'BLYXU-' + base : '';
}

function ensureProductBarcode_(rowObject) {
  const current = rowObject['Codigo Barras'] ||
    rowObject['Codigo de Barras'] ||
    rowObject['Código de Barras'] ||
    rowObject['Codigo_Barras'] ||
    rowObject.codigoBarras ||
    rowObject.Barcode ||
    '';
  const code = normalizeBarcode_(current) || makeProductBarcode_(rowObject['ID Producto'], rowObject['ID Variación'] || rowObject['ID Variacion']);
  if (!code) return rowObject;

  rowObject['Codigo Barras'] = code;
  rowObject['Codigo de Barras'] = code;
  rowObject['Código de Barras'] = code;
  rowObject['Codigo_Barras'] = code;
  rowObject.codigoBarras = code;
  rowObject.Barcode = code;
  return rowObject;
}

function shouldDiscountStockForOrder_(pedido) {
  const stockFlag = normalizeKey_(pedido['Stock Descontado'] || pedido.stockDescontado || '');
  if (['no', 'false', '0', 'pendiente'].indexOf(stockFlag) >= 0) return false;

  const method = normalizeKey_(pedido['Método Contacto'] || pedido['Metodo Contacto'] || pedido['MÃ©todo Contacto'] || '');
  const status = normalizeKey_(pedido['Estado Pedido'] || '');
  return method.indexOf('consulta') < 0 && status.indexOf('consulta') < 0;
}

function createOrder_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const pedido = appendRow_('Pedidos', data);

    upsertClientFromOrder_(pedido);
    if (shouldDiscountStockForOrder_(pedido)) {
      updateStockFromOrder_(pedido['Productos JSON']);
    }

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
        ensureProductBarcode_(rowObject);
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
    ensureProductBarcode_(rowObject);
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

  if (password.length < 12 || password.length > 128) {
    return json_({ ok: false, status: 'error', error: 'Usa una contraseña de 12 a 128 caracteres.' });
  }

  const sheet = getSheet_('Clientes');
  const headers = getHeaders_(sheet);
  const existingByPhone = findRowIndex_(sheet, 'Teléfono', telefono);
  const existingByEmail = findCustomerRowByEmail_(email);
  const existingRow = existingByPhone || existingByEmail;
  if (existingRow) return json_({ok:false,status:'error',error:'Esta cuenta ya existe. Inicia sesión para continuar.'});

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
  if (customer['Google ID']) return json_({ok:false,status:'error',error:'Esta cuenta usa acceso seguro con Google. Selecciona Continuar con Google.'});
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
    const linkedGoogleId = String(found.data['Google ID'] || '');
    const authoritativeEmail = /@gmail\.com$/i.test(email) || Boolean(googleProfile.hd);
    if ((linkedGoogleId && linkedGoogleId !== googleProfile.sub) || (!linkedGoogleId && !authoritativeEmail)) {
      return json_({ ok: false, status: 'error', error: 'Ingresa con tu contraseña para acceder a esta cuenta existente.' });
    }
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
  if (!payload.sub || !['accounts.google.com', 'https://accounts.google.com'].includes(String(payload.iss || '')) || Number(payload.exp || 0) <= Date.now() / 1000) {
    throw new Error('La credencial de Google no es válida o ya venció.');
  }

  return {
    sub: payload.sub || '',
    hd: payload.hd || '',
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
    return securityCustomerOwnsRecord_(found.data,row);
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
    return securityCustomerOwnsRecord_(found.data,row);
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
    return securityCustomerOwnsRecord_(found.data,row) || (orderId && securityCustomerOwnsRecord_(found.data,getById_('Pedidos',orderId) || {}));
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
    return active && securityCustomerOwnsRecord_(found.data,row);
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
  if (!token || !String(token).startsWith('BLYXU-S2-')) return null;
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
  return 'BLYXU-S2-' + Utilities.getUuid() + '-' + Utilities.getUuid();
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
      codigobarras: 'Codigo Barras',
      codigodebarras: 'Codigo Barras',
      barcode: 'Codigo Barras',
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
      tipomedida: 'Tipo Medida',
      unidadmedida: 'Unidad Medida',
      ancho: 'Ancho',
      largo: 'Largo',
      fondo: 'Fondo',
      radio: 'Radio',
      tallatextil: 'Talla Textil',
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

function securityAdminIdentity_(body) {
  const credential = String(body.adminCredential || '').trim();
  if (credential.startsWith('BLYXU-A3-')) return authAdminSession_(credential);
  if (authAdminEnabled_()) return null;
  if (!credential) return null;
  const identity = verifyGoogleIdToken_(credential);
  const allowed = String(PropertiesService.getScriptProperties().getProperty('BLYXU_ADMIN_EMAILS') || 'blyxu.ventas@gmail.com').toLowerCase().split(',').map(function(email) { return email.trim(); }).filter(Boolean);
  if (allowed.indexOf(String(identity.email || '').toLowerCase()) < 0) throw new Error('Cuenta sin permiso de administrador.');
  return identity;
}
function securityPublicConfig_(config) {
  const result = {Auth_Admin_Mode: authAdminEnabled_() ? 'password-totp' : 'google-bootstrap'};
  Object.keys(config || {}).forEach(function(key) {
    if (/^(Google_Client_ID|Mostrar_Precios_Minorista|Mercado_Pago_Publico_Activo|Catalogo_Solo_WhatsApp|Contacto_[A-Za-z]+|WhatsApp_Comercial|Factura_(Logo|Empresa|NIT|Direccion|Telefono|Email)|Promo_(Enabled|Title|Discount|Message|EndDate|Clientes_(Enabled|Title|Discount|Expire))|Wholesale_Promo_(Enabled|Title|Discount|Message|Date|EndDate)|Banner_[A-Za-z0-9_]+|Home_[A-Za-z0-9_]+|QR_(Title|Subtitle|Image|Methods|Year|Enabled|Payments_JSON))$/.test(key)) result[key] = config[key];
  });
  return result;
}
function securityAuthorizeRequest_(body, params, action, resource, method) {
  if(action === 'publicreference') {
    if(method !== 'POST')throw new Error('Consulta no válida.');
    return {response:securityPublicReference_(body)};
  }
  if(['ordertempreceipt','ordercustomerreceipt','orderadminnotifications','orderadminseen','orderadminreceipt','orderadminlink'].includes(action)) {
    if(method!=='POST')throw new Error('Consulta no válida.');
    return {response:receiptAction_(body,action)};
  }
  if (/^ca(register|login|recover|reset|logout|adminlist|adminreview)$/.test(action)) {
    if(method!=='POST')throw new Error('Consulta no válida.');
    const caAdmin=/^caadmin/.test(action)?securityAdminIdentity_(body):null;
    if(/^caadmin/.test(action)&&!caAdmin)throw new Error('Acceso no autorizado.');
    return {response:caAction_(action,body,caAdmin)};
  }
  if (/^customerkey/.test(action)) {
    return {response:{ok:false,error:'Usa celular y contraseña para entrar a tu cuenta.'}};
    if(method!=='POST')throw new Error('Consulta no válida.');
    const keyAdmin = securityAdminIdentity_(body);
    if (['customerkeyissue','customerkeyrevoke'].indexOf(action)>=0) {
      if (!keyAdmin) throw new Error('Acceso no autorizado.');
      return {response:customerKeyManage_(body,action),admin:keyAdmin};
    }
    if (action==='customerkeylogin') return {response:customerKeyLogin_(body)};
    throw new Error('Consulta no válida.');
  }
  if (['customerdashboard','perfilcliente','customerprofile','pedidoscliente','customerorders','mispedidos','facturascliente','customerinvoices','misfacturas','favoritoscliente','customerfavorites','misfavoritos','guardarfavorito','addfavorite','quitarfavorito','removefavorite','customerrecords'].indexOf(action)>=0) {
    return {response:customerKeyDashboard_(body,action,params)};
  }
  if (action === 'adminlogout') {
    var logoutCredential=String(body.adminCredential||'');
    if(authAdminSession_(logoutCredential))CacheService.getScriptCache().remove('admin-session-'+authDigest_(logoutCredential));
    return {response:{ok:true,status:'success'}};
  }
  if (action === 'adminpasswordlogin') return {response:authAdminLogin_(body)};
  const admin = securityAdminIdentity_(body);
  if (action === 'adminpasswordbegin') return {response:authAdminBegin_(admin)};
  if (action === 'adminpasswordfinish') return {response:authAdminFinish_(body,admin)};
  if (/^(registrarcliente|customerregister|registercustomer|crearcliente|crearcuenta|registrocliente|registrarse|signup|signupcliente|register|registro|createcustomer|newcustomer|logincliente|iniciarsesion|customerlogin|login|signin|entrarcliente|ingresarcliente|googlelogincliente|customergooglelogin|logincongoogle|googlelogin|signinwithgoogle|perfilcliente|customerprofile|pedidoscliente|customerorders|mispedidos|facturascliente|customerinvoices|misfacturas|favoritoscliente|customerfavorites|misfavoritos|guardarfavorito|addfavorite|quitarfavorito|removefavorite|customerrecords)$/.test(action) && !admin) return {response:{ok:false,status:'error',error:'La tienda usa datos de contacto para pedidos. No hay acceso público a cuentas ni documentos.'}};
  if (action === 'adminsession') {
    if (!admin) throw new Error('Inicia sesión con una cuenta administradora.');
    return { response: {ok:true,status:'success',email:admin.email}, admin:admin };
  }
  if (admin) return {admin:admin};
  const publicActions = ['customerrecords','getconfig','registrarcliente','customerregister','registercustomer','crearcliente','crearcuenta','registrocliente','registrarse','signup','signupcliente','register','registro','createcustomer','newcustomer','logincliente','iniciarsesion','customerlogin','login','signin','entrarcliente','ingresarcliente','googlelogincliente','customergooglelogin','logincongoogle','googlelogin','signinwithgoogle','perfilcliente','customerprofile','cerrarsesion','customerlogout','pedidoscliente','customerorders','mispedidos','facturascliente','customerinvoices','misfacturas','favoritoscliente','customerfavorites','misfavoritos','guardarfavorito','addfavorite','quitarfavorito','removefavorite','createpreference','crearpreferencia','mercadopago','mpcheckout','checkoutmercadopago','pagar','mpwebhook','mercadopagowebhook','verifymppayment','verificarpagomp'];
  if (['logincliente','iniciarsesion','customerlogin','login','signin','entrarcliente','ingresarcliente','registrarcliente','customerregister','registercustomer','crearcliente','crearcuenta','registrocliente','registrarse','signup','signupcliente','register','registro','createcustomer','newcustomer'].indexOf(action) >= 0) securityLimitLogin_(body);
  if (publicActions.indexOf(action) >= 0 || (!action && isMercadoPagoPaymentNotification_(body,params))) return {admin:null};
  const sheet = sheetFromResource_(resource || action);
  const reading = method === 'GET' || ['listar','list','get'].indexOf(action) >= 0;
  if (sheet === 'Productos' && reading) return {admin:null};
  if (sheet === 'Pedidos' && method === 'POST' && ['crear','create','agregar',''].indexOf(action) >= 0) return {admin:null};
  throw new Error('Acceso no autorizado. Inicia sesión con una cuenta administradora.');
}

function securityCustomerOwnsRecord_(customer, row) {
  const receiptId=String(row['ID Pedido']||'');
  if(receiptId) {
    const receipt=receiptFind_(receiptId);
    if(receipt)return !!receipt.data.owner && receipt.data.owner===customer._accountId;
  }
  if (customer._keyVerified) {
    try {const phone=caPhone_(getCustomerPhoneValue_(customer));return phone===caPhone_(row['ID Cliente'] || getCustomerPhoneValue_(row));}catch(error){return false;}
  }
  // Un teléfono o correo escrito en un formulario no acredita su propiedad.
  const verified = String(customer['Google ID'] || '').trim();
  const email = normalizeEmail_(customer.Email);
  return !!verified && !!email && email === normalizeEmail_(row.Email || row.email);
}

// Exact reference access exposes a single commercial summary, never contact details.
function securityPublicReference_(body) {
  const reference = String(body.reference || '').trim().toUpperCase();
  if(!/^(PED|FAC)-[0-9]{14}-[0-9]{4}$/.test(reference))return {ok:false,status:'error',error:'Escribe el ID completo del pedido o factura, o escanea su QR.'};
  caWithLock_(() => {
    const cache=CacheService.getScriptCache(),key='reference-burst-'+Math.floor(Date.now()/60000),count=Number(cache.get(key)||0);
    if(count>=60)throw new Error('Hay muchas consultas. Intenta nuevamente en un minuto.');
    cache.put(key,String(count+1),120);
  });
  const resource=reference.startsWith('PED-')?'Pedidos':'Facturas';
  const row=getById_(resource,reference);
  if(!row)return {ok:true,status:'success',orders:[],invoices:[]};
  const summary={};
  ['ID Pedido','ID Factura','Fecha','Fecha Pedido','Estado','Estado Pedido','Estado Factura','Subtotal','Total','Cantidad Total'].forEach(key=>{if(row[key]!==undefined)summary[key]=row[key];});
  let items=row['Productos JSON'];
  if(typeof items==='string'){try{items=JSON.parse(items);}catch(_){items=[];}}
  const itemKeys=['id','sku','SKU','idVariacion','nombre','Nombre','Producto','cantidad','Cantidad','qty','quantity','precio','Precio','price','subtotal','img','imagen','Imagen','image','foto','Foto','color','Color','talla','Talla','tamano','tamaño','size','variante','variacion','opcion','opciones','variant','option'];
  summary['Productos JSON']=(Array.isArray(items)?items:[]).map(item=>{const safe={};itemKeys.forEach(key=>{if(['string','number','boolean'].includes(typeof item?.[key]))safe[key]=item[key];});return safe;});
  return {ok:true,status:'success',orders:resource==='Pedidos'?[summary]:[],invoices:resource==='Facturas'?[summary]:[]};
}
function securityCustomerRecords_(body, params) {
  const found = getAuthenticatedCustomer_(body,params);
  if (!found || !found.data['Google ID']) return json_({ok:false,status:'error',error:'Ingresa con Google para verificar tu identidad y consultar tus documentos.'});
  const orders = listRows_('Pedidos',{}).filter(function(row){return securityCustomerOwnsRecord_(found.data,row);});
  const ids = {}; orders.forEach(function(row){ids[String(row['ID Pedido'] || '')]=true;});
  const invoices = listRows_('Facturas',{}).filter(function(row){return securityCustomerOwnsRecord_(found.data,row) || securityCustomerOwnsRecord_(found.data,getById_('Pedidos',String(row['ID Pedido'] || '')) || {});});
  const resource = sheetFromResource_(body.resource || params.resource);
  if (resource !== 'Pedidos' && resource !== 'Facturas') return json_({ok:false,status:'error',error:'Consulta no válida.'});
  return json_({ok:true,status:'success',data:resource==='Pedidos'?orders:invoices});
}

function securityLimitLogin_(body) {
  const customer = body.cliente || body.customer || body;
  const identity = String(customer.usuario || customer.identifier || customer.email || customer.Email || customer.telefono || '').trim().toLowerCase();
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,identity,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
  const cache = CacheService.getScriptCache(); const key = 'auth-attempts-' + digest;
  const count = Number(cache.get(key) || 0);
  if (count >= 15) throw new Error('Inicia sesión más tarde: se alcanzó el límite de intentos.');
  cache.put(key,String(count+1),600);
}

function securityCatalogItems_(items, wholesale) {
  if (!Array.isArray(items) || !items.length || items.length > 100) throw new Error('Carrito no válido.');
  // One snapshot per request; prices and stock still come from the server.
  const products = items.length>1 ? listRows_('Productos',{}) : null;
  const catalog = new Map();
  if(products)products.forEach(product=>{const id=String(product['ID Variación'] || product['ID Variacion'] || '').trim();if(id && !catalog.has(id))catalog.set(id,product);});
  const prefix = wholesale ? 'Wholesale_Promo_' : 'Promo_';
  const enabled = String(getConfigValue_(prefix+'Enabled','false')) === 'true';
  const expiry = String(getConfigValue_(prefix+'Date',''));
  const discount = Math.max(0,Math.min(90,toNumber_(getConfigValue_(prefix+'Discount',0))));
  const active = enabled && discount > 0 && (!expiry || new Date(expiry).getTime()>Date.now());
  return items.map(function(item) {
    const id = String(item.idVariacion || item['ID Variación'] || item['ID Variacion'] || item.id || item.sku || '').trim();
    const product = products ? catalog.get(id) : getById_('Productos',id);
    const qty = Number(item.cantidad || item.qty || item.quantity || 1);
    if (!product || !Number.isInteger(qty) || qty < 1 || qty > 1000) throw new Error('Producto o cantidad no válida.');
    let price = toNumber_(product[wholesale ? 'Precio Mayor' : 'Precio']);
    const tagged = ['si','true','1'].indexOf(normalizeKey_(product.Promocion || ''))>=0;
    if (active && (wholesale || tagged)) price=Math.round(price*(1-discount/100));
    return {id:id,idVariacion:id,sku:product.SKU || id,nombre:product['Nombre del Producto'] || product.Nombre || 'Producto',opcion:String(product.Estilo || product.Color || ''),color:String(product.Color||''),talla:String(product.Talla||product['Tamaño']||product.Tamano||''),cantidad:qty,precio:Math.max(0,price),imagen:product['Imagen Principal'] || ''};
  });
}

function securityAdminCustomer_(customer) {
  const safe = Object.assign({},customer || {});
  ['Password Hash','Password Salt','Session Token','Session Expira','Google ID'].forEach(function(key){delete safe[key];});
  return safe;
}

// Private bearer keys: generated by an authenticated admin after identity verification.
// Only their digest is persisted. Rotation revokes every previous session immediately.
function customerKeyManage_(body,action) {
  ensureSheets_();
  const phone=cleanPhone_(String(body.telefono||''));
  if (!/^\d{7,15}$/.test(phone)) throw new Error('Escribe un celular válido.');
  const props=PropertiesService.getScriptProperties(),index='customer-key-owner-'+authDigest_(phone);
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    if(action==='customerkeyissue' && body.confirmed!==true) throw new Error('Verifica la identidad del cliente antes de entregar su acceso.');
    const found=findCustomerByIdentifier_(phone);
    if(!found) throw new Error('Primero registra un pedido de este cliente para que aparezca en Clientes.');
    const previous=props.getProperty(index);
    if(previous)props.deleteProperty('customer-key-'+previous);
    props.deleteProperty(index);
    if(action==='customerkeyrevoke')return {ok:true,message:'Acceso revocado.'};
    const token='BLYXU-C4-'+authRandom_(),digest=authDigest_(token),expires=Date.now()+30*86400000;
    props.setProperty('customer-key-'+digest,JSON.stringify({phone:phone,expires:expires}));props.setProperty(index,digest);
    return {ok:true,key:token,expires:expires,cliente:publicCustomer_(found.data)};
  } finally {lock.releaseLock();}
}
function customerKeyOwner_(token) {
  if(String(token||'').startsWith('BLYXU-P5-'))return caSessionOwner_(token);
  return null;
  if(!/^BLYXU-C4-[a-f0-9]{64}$/.test(String(token||'')))return null;
  const props=PropertiesService.getScriptProperties(),digest=authDigest_(token),raw=props.getProperty('customer-key-'+digest);
  if(!raw)return null;
  const grant=JSON.parse(raw);
  if(grant.expires<=Date.now()||props.getProperty('customer-key-owner-'+authDigest_(grant.phone))!==digest)return null;
  const found=findCustomerByIdentifier_(grant.phone);if(!found)return null;
  found.data=Object.assign({},found.data,{_keyVerified:true});return found;
}
function customerKeyLogin_(body) {
  const found=customerKeyOwner_(body.key);
  return found?{ok:true,token:body.key,cliente:publicCustomer_(found.data)}:{ok:false,error:'La llave no es válida o venció. Solicita un nuevo acceso a BLYXU.'};
}
function customerKeyDashboard_(body,action,params) {
  const found=customerKeyOwner_(body.token);
  if(!found)return {ok:false,error:'Tu acceso venció o fue revocado. Solicita una nueva llave.'};
  const owns=row=>securityCustomerOwnsRecord_(found.data,row);
  if(['guardarfavorito','addfavorite'].indexOf(action)>=0)return customerKeyFavorite_(found,body,false);
  if(['quitarfavorito','removefavorite'].indexOf(action)>=0)return customerKeyFavorite_(found,body,true);
  const orders=listRows_('Pedidos',{}).filter(owns),ids={};orders.forEach(row=>ids[String(row['ID Pedido'])]=true);
  const invoices=listRows_('Facturas',{}).filter(row=>owns(row)||!!ids[String(row['ID Pedido'])]);
  const favorites=listRows_('Favoritos',{}).filter(row=>owns(row)&&normalizeKey_(row.Estado||'Activo')!=='inactivo');
  if(action==='customerrecords') {
    const resource=sheetFromResource_(body.resource||(params||{}).resource);
    if(!['Pedidos','Facturas'].includes(resource))return {ok:false,error:'Consulta no válida.'};
    return {ok:true,data:resource==='Pedidos'?orders:invoices};
  }
  const newest=(a,b)=>new Date(b.Fecha||0)-new Date(a.Fecha||0);
  return {ok:true,cliente:publicCustomer_(found.data),orders:orders.sort(newest).slice(0,60).map(publicCustomerOrder_),invoices:invoices.sort(newest).slice(0,60).map(publicCustomerInvoice_),favorites:favorites.map(publicCustomerFavorite_)};
}
function customerKeyFavorite_(found,body,remove) {
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const rows=listRows_('Favoritos',{}),productInput=body.producto||{},id=String(productInput.idVariacion||'');
    const old=rows.find(row=>securityCustomerOwnsRecord_(found.data,row)&&(remove?String(row['ID Favorito'])===String(body.idFavorito):String(row['ID Variacion'])===id));
    if(remove) {if(old)updateRow_('Favoritos',old['ID Favorito'],{Estado:'Inactivo'});return {ok:true,removed:!!old};}
    const product=getById_('Productos',id);if(!product)throw new Error('Producto no disponible.');
    if(old)updateRow_('Favoritos',old['ID Favorito'],{Estado:'Activo'});
    else appendRow_('Favoritos',{'ID Favorito':makeId_('FAV'),Fecha:new Date(),Telefono:getCustomerPhoneValue_(found.data),'ID Producto':product['ID Producto']||'','ID Variacion':id,'Nombre Producto':product['Nombre del Producto']||product.Nombre||'',Imagen:product['Imagen Principal']||product.Imagen||'',Precio:product.Precio||product['Precio']||0,Estado:'Activo'});
    return {ok:true};
  } finally {lock.releaseLock();}
}

// Administrator password + TOTP. This file belongs only in Apps Script.
function authBytes_(text) {
  return Uint8Array.from(Utilities.newBlob(String(text)).getBytes().map(function(b){return (b+256)%256;}));
}
function authHex_(bytes) {return Array.from(bytes).map(function(b){return ('0'+b.toString(16)).slice(-2);}).join('');}
function authDigest_(text) {return authHex_(BlyxuCrypto.sha256(authBytes_(text)));}
function authEqual_(a,b) {a=String(a);b=String(b);var difference=a.length^b.length;for(var i=0;i<Math.max(a.length,b.length);i++)difference|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return difference===0;}
function authPasswordHash_(password,salt) {
  return authHex_(BlyxuCrypto.pbkdf2(BlyxuCrypto.sha256,authBytes_(password),authBytes_(salt),{c:600000,dkLen:32}));
}
function authRandom_() {return Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');}
function authBase32_(bytes) {
  var alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=0,value=0,out='';
  bytes.forEach(function(b){value=(value<<8)|b;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}});
  if(bits)out+=alphabet[(value<<(5-bits))&31];return out;
}
function authBase32Decode_(text) {
  var alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=0,value=0,out=[];
  String(text).replace(/=+$/,'').split('').forEach(function(c){var n=alphabet.indexOf(c);if(n<0)throw new Error('Acceso no autorizado.');value=(value<<5)|n;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}});return Uint8Array.from(out);
}
function authTotp_(secret,step,digits) {
  var counter=new Uint8Array(8);for(var i=7;i>=0;i--){counter[i]=step%256;step=Math.floor(step/256);}
  var mac=BlyxuCrypto.hmac(BlyxuCrypto.sha1,authBase32Decode_(secret),counter),offset=mac[mac.length-1]&15;
  var number=((mac[offset]&127)<<24)|(mac[offset+1]<<16)|(mac[offset+2]<<8)|mac[offset+3];
  return String(number%Math.pow(10,digits||6)).padStart(digits||6,'0');
}
function authValidStep_(secret,code,previous) {
  if(!/^\d{6}$/.test(String(code)))return -1;
  var step=Math.floor(Date.now()/30000);for(var delta=-1;delta<=1;delta++){var candidate=step+delta;if(candidate>Number(previous||-1)&&authEqual_(authTotp_(secret,candidate),code))return candidate;}return -1;
}
function authAdminConfig_(){return PropertiesService.getScriptProperties();}
function authAdminEnabled_(){return authAdminConfig_().getProperty('BLYXU_ADMIN_PASSWORD_ENABLED')==='true';}
function authAdminSession_(token) {
  if(!/^BLYXU-A3-[a-f0-9]{64}$/.test(String(token||'')))return null;
  var data=CacheService.getScriptCache().get('admin-session-'+authDigest_(token));
  if(!data)return null;var session=JSON.parse(data);
  if(session.expires<Date.now()||session.version!==authAdminConfig_().getProperty('BLYXU_ADMIN_AUTH_VERSION'))return null;
  return {email:session.email,method:'password-totp'};
}
function authAdminLogin_(body) {
  var props=authAdminConfig_();if(!authAdminEnabled_())return {ok:false,error:'Primero configura el acceso del administrador.'};
  var lock=LockService.getScriptLock();if(!lock.tryLock(1000))return {ok:false,error:'Intenta de nuevo en unos segundos.'};
  try {
    var attempts=JSON.parse(props.getProperty('BLYXU_ADMIN_ATTEMPTS')||'{"count":0,"start":0}');
    if(Date.now()-attempts.start>900000)attempts={count:0,start:Date.now()};
    if(attempts.count>=5)return {ok:false,error:'Demasiados intentos. Espera 15 minutos.'};
    attempts.count++;props.setProperty('BLYXU_ADMIN_ATTEMPTS',JSON.stringify(attempts));
    var password=String(body.password||''),user=String(body.usuario||'').trim().toLowerCase();
    if(password.length<12||password.length>128||!authEqual_(user,props.getProperty('BLYXU_ADMIN_USERNAME')))return {ok:false,error:'Datos de acceso incorrectos.'};
    if(!authEqual_(authPasswordHash_(password,props.getProperty('BLYXU_ADMIN_PASSWORD_SALT')),props.getProperty('BLYXU_ADMIN_PASSWORD_HASH')))return {ok:false,error:'Datos de acceso incorrectos.'};
    var step=authValidStep_(props.getProperty('BLYXU_ADMIN_TOTP_SECRET'),String(body.codigo||''),props.getProperty('BLYXU_ADMIN_TOTP_LAST_STEP'));
    if(step<0){
      var recovery=String(body.codigo||'').trim().toUpperCase(),hashes=JSON.parse(props.getProperty('BLYXU_ADMIN_RECOVERY_HASHES')||'[]'),match=hashes.indexOf(authDigest_(recovery));
      if(match<0)return {ok:false,error:'Datos de acceso incorrectos.'};hashes.splice(match,1);props.setProperty('BLYXU_ADMIN_RECOVERY_HASHES',JSON.stringify(hashes));
    } else props.setProperty('BLYXU_ADMIN_TOTP_LAST_STEP',String(step));
    props.deleteProperty('BLYXU_ADMIN_ATTEMPTS');
    var token='BLYXU-A3-'+authRandom_(),email=props.getProperty('BLYXU_ADMIN_USERNAME');
    CacheService.getScriptCache().put('admin-session-'+authDigest_(token),JSON.stringify({email:email,expires:Date.now()+1800000,version:props.getProperty('BLYXU_ADMIN_AUTH_VERSION')}),1800);
    return {ok:true,status:'success',token:token,email:email};
  } finally {lock.releaseLock();}
}
function authAdminBegin_(admin) {
  if(authAdminEnabled_()||!admin||admin.method==='password-totp')throw new Error('Acceso no autorizado.');
  var seed=authBase32_(BlyxuCrypto.sha256(authBytes_(authRandom_())).slice(0,20)),nonce=authRandom_();
  CacheService.getScriptCache().put('admin-enrollment-'+authDigest_(nonce),JSON.stringify({email:admin.email,secret:seed,expires:Date.now()+600000}),600);
  return {ok:true,nonce:nonce,uri:'otpauth://totp/'+encodeURIComponent('BLYXU:'+admin.email)+'?secret='+seed+'&issuer=BLYXU&algorithm=SHA1&digits=6&period=30'};
}
function authAdminFinish_(body,admin) {
  if(!admin||admin.method==='password-totp'||authAdminEnabled_())throw new Error('Acceso no autorizado.');
  var key='admin-enrollment-'+authDigest_(String(body.nonce||'')),cache=CacheService.getScriptCache(),raw=cache.get(key);
  if(!raw)throw new Error('La configuración venció. Vuelve a comenzar.');var pending=JSON.parse(raw);
  var password=String(body.password||''),step=authValidStep_(pending.secret,String(body.codigo||''),-1);
  if(pending.email!==admin.email||pending.expires<Date.now()||password.length<12||password.length>128||step<0)return {ok:false,error:'Comprueba la contraseña y el código de seis dígitos.'};
  var hash=authPasswordHash_(password,authDigest_(pending.secret+'password-salt'));
  var lock=LockService.getScriptLock();lock.waitLock(1000);
  try {
    if(authAdminEnabled_()||!cache.get(key))throw new Error('Acceso no autorizado.');
    var recovery=[];for(var i=0;i<8;i++)recovery.push(authRandom_().slice(0,20).toUpperCase());
    authAdminConfig_().setProperties({BLYXU_ADMIN_USERNAME:admin.email.toLowerCase(),BLYXU_ADMIN_PASSWORD_SALT:authDigest_(pending.secret+'password-salt'),BLYXU_ADMIN_PASSWORD_HASH:hash,BLYXU_ADMIN_TOTP_SECRET:pending.secret,BLYXU_ADMIN_TOTP_LAST_STEP:String(step),BLYXU_ADMIN_AUTH_VERSION:authRandom_(),BLYXU_ADMIN_RECOVERY_HASHES:JSON.stringify(recovery.map(authDigest_)),BLYXU_ADMIN_PASSWORD_ENABLED:'true'});
    cache.remove(key);return {ok:true,recovery:recovery};
  } finally {lock.releaseLock();}
}




// Private account storage. Neither sheet is exposed through the public resource router.
const CA_HEADERS_=['ID','Datos'];
let caLockDepth_=0;
function caPrivateSpreadsheet_(){
  const props=PropertiesService.getScriptProperties(),key='BLYXU_CUSTOMER_AUTH_SPREADSHEET_ID';let id=props.getProperty(key);
  if(!id)id=caWithLock_(()=>{let current=props.getProperty(key);if(!current){current=SpreadsheetApp.create('BLYXU - Acceso privado de clientes').getId();props.setProperty(key,current);}return current;});
  return SpreadsheetApp.openById(id);
}
function caTable_(name){
  const ss=caPrivateSpreadsheet_();let sheet=ss.getSheetByName(name);
  if(!sheet)sheet=caWithLock_(()=>{let current=ss.getSheetByName(name);if(!current){current=ss.insertSheet(name);current.getRange(1,1,1,2).setValues([CA_HEADERS_]);}return current;});
  return sheet;
}
function caRows_(name){const s=caTable_(name),n=s.getLastRow();if(n<2)return [];return s.getRange(2,1,n-1,2).getValues().map((r,i)=>({index:i+2,id:String(r[0]),data:JSON.parse(String(r[1]))}));}
function caWrite_(name,row,data){const s=caTable_(name);s.getRange(row?row.index:s.getLastRow()+1,1,1,2).setValues([[data.id,JSON.stringify(data)]]);}
function caAccount_(phone){return caRows_('CuentasPrivadas').find(row=>row.data.phone===phone)||null;}
function caPhone_(value){let phone=cleanPhone_(value);if(phone.length===12&&phone.startsWith('57'))phone=phone.slice(2);if(!/^\d{7,15}$/.test(phone))throw new Error('Escribe un celular válido.');return phone;}
function caName_(value){const name=String(value||'').trim();if(!/^[\p{L}\p{M}][\p{L}\p{M}' -]{0,49}$/u.test(name))throw new Error('Escribe tu primer nombre y primer apellido.');return name;}
function caPassword_(value){const password=String(value||'');if(password.length<12||password.length>128)throw new Error('La contraseña debe tener entre 12 y 128 caracteres.');return password;}
function caLimit_(phone,action){caWithLock_(()=>{const cache=CacheService.getScriptCache(),key='ca-limit-'+action+'-'+authDigest_(phone),count=Number(cache.get(key)||0),globalKey='ca-burst-'+Math.floor(Date.now()/60000),globalCount=Number(cache.get(globalKey)||0);if(count>=5)throw new Error('Espera 15 minutos antes de volver a intentar.');if(globalCount>=60)throw new Error('Hay muchas solicitudes. Intenta en un minuto.');cache.put(key,String(count+1),900);cache.put(globalKey,String(globalCount+1),120);});}
function caWithLock_(fn){if(caLockDepth_)return fn();const lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw new Error('Intenta nuevamente en unos segundos.');caLockDepth_++;try{return fn();}finally{caLockDepth_--;lock.releaseLock();}}
function caRequest_(account,type,first,last,phone){
  const prior=caRows_('SolicitudesAccesoPrivadas').find(r=>r.data.phone===phone&&r.data.type===type&&r.data.status==='Pendiente');
  if(prior)return;
  const request={id:authRandom_(),accountId:account.id,type,first,last,phone,status:'Pendiente',created:Date.now()};caWrite_('SolicitudesAccesoPrivadas',null,request);
}
function caLogin_(body){
  const phone=caPhone_(body.telefono);caLimit_(phone,'login');
  const account=caAccount_(phone),data=account?.data;
  if(!data||data.status!=='Activo'||String(body.password||'').length<12||String(body.password||'').length>128)return {ok:false,error:'Datos incorrectos o cuenta pendiente de activación.'};
  if(Date.now()-(data.attemptStart||0)<900000&&(data.attempts||0)>=5)return {ok:false,error:'Espera 15 minutos antes de volver a intentar.'};
  const version=data.version,valid=authEqual_(authPasswordHash_(String(body.password||''),data.salt),data.hash);
  return caWithLock_(()=>{
    const current=caAccount_(phone);if(!current||current.data.version!==version||current.data.status!=='Activo')return {ok:false,error:'Intenta iniciar sesión nuevamente.'};
    const fresh=current.data;
    if(Date.now()-(fresh.attemptStart||0)>=900000){fresh.attempts=0;fresh.attemptStart=Date.now();}
    if(fresh.attempts>=5)return {ok:false,error:'Espera 15 minutos antes de volver a intentar.'};
    if(!valid){fresh.attempts++;caWrite_('CuentasPrivadas',current,fresh);return {ok:false,error:'Datos incorrectos o cuenta pendiente de activación.'};}
    fresh.attempts=0;
    CacheService.getScriptCache().remove('ca-limit-login-'+authDigest_(phone));
    const token='BLYXU-P5-'+authRandom_(),expires=(body.remember===true?0:Date.now()+21600000);fresh.sessions=(fresh.sessions||[]).filter(x=>(x.expires===0||x.expires>Date.now())&&x.version===version);fresh.sessions.push({hash:authDigest_(token),version,expires});caWrite_('CuentasPrivadas',current,fresh);
    const owner=caOwnerData_(fresh);return {ok:true,token,expires,cliente:publicCustomer_(owner.data)};
  });
}
function caOwnerData_(data){
  const found=findCustomerByIdentifier_(data.phone)||findCustomerByIdentifier_('57'+data.phone);
  return {data:Object.assign({},found?.data||{},{Nombre:data.first+' '+data.last,'Teléfono':data.phone,_keyVerified:true,_accountId:data.id})};
}
function caSessionOwner_(token){
  if(!/^BLYXU-P5-[a-f0-9]{64}$/.test(String(token||'')))return null;
  const digest=authDigest_(token),account=caRows_('CuentasPrivadas').find(row=>row.data.status==='Activo'&&(row.data.sessions||[]).some(x=>authEqual_(x.hash,digest)&&(x.expires===0||x.expires>Date.now())&&x.version===row.data.version));
  return account?caOwnerData_(account.data):null;
}
function caAdminList_(){
  const rows=caRows_('SolicitudesAccesoPrivadas').filter(r=>r.data.status==='Pendiente').sort((a,b)=>a.data.created-b.data.created);
  return {ok:true,users:caRows_('CuentasPrivadas').map(r=>({id:r.id,first:r.data.first,last:r.data.last,phone:r.data.phone,status:r.data.status,created:r.data.created})),count:rows.length,requests:rows.slice(0,100).map(r=>{const a=caAccount_(r.data.phone),base=findCustomerByIdentifier_(r.data.phone)||findCustomerByIdentifier_('57'+r.data.phone);return {id:r.id,type:r.data.type,first:r.data.first,last:r.data.last,phone:r.data.phone,created:r.data.created,registeredName:a?a.data.first+' '+a.data.last:'',databaseName:base?.data.Nombre||'',accountStatus:a?.data.status||''};})};
}
function caAdminReview_(body){
  return caWithLock_(()=>{
    const row=caRows_('SolicitudesAccesoPrivadas').find(r=>r.id===String(body.id||''));
    if(!row||row.data.status!=='Pendiente')throw new Error('La solicitud ya fue atendida.');
    const request=row.data,account=caAccount_(request.phone);
    if(!account||account.id!==request.accountId)throw new Error('Cuenta no disponible.');
    if(body.decision==='reject'){request.status='Rechazada';request.updated=Date.now();caWrite_('SolicitudesAccesoPrivadas',row,request);return {ok:true,message:'Solicitud rechazada.'};}
    if(body.decision!=='approve'||body.confirmed!==true)throw new Error('Confirma la identidad por contacto directo antes de aprobar.');
    const data=account.data;request.updated=Date.now();
    if(request.type==='Activación'){
      if(data.status!=='Pendiente')throw new Error('Cuenta no disponible para activación.');
      if(!data.activationHash||!authEqual_(data.activationHash,authDigest_(String(body.activationCode||'').trim())))throw new Error('El código de registro no coincide. Pídeselo al cliente por contacto directo.');
      ensureSheets_();let client=findCustomerByIdentifier_(data.phone)||findCustomerByIdentifier_('57'+data.phone);
      if(!client)appendRow_('Clientes',{Nombre:data.first+' '+data.last,'Teléfono':data.phone,'Estado Cliente':'Activo','Fecha Registro':new Date()});
      data.status='Activo';data.version=authRandom_();delete data.activationHash;request.status='Completada';caWrite_('CuentasPrivadas',account,data);caWrite_('SolicitudesAccesoPrivadas',row,request);return {ok:true,message:'Cuenta activada. El cliente puede entrar con su celular y la contraseña que eligió.'};
    }
    if(!['Activo','Verificación aprobada'].includes(data.status))throw new Error('Primero aprueba la activación de la cuenta.');
    const reset=authRandom_();data.status='Verificación aprobada';data.version=authRandom_();data.resetVersion=authRandom_();request.resetHash=authDigest_(reset);request.resetVersion=data.resetVersion;request.resetExpires=Date.now()+3600000;request.status='Enlace emitido';caWrite_('CuentasPrivadas',account,data);caWrite_('SolicitudesAccesoPrivadas',row,request);
    return {ok:true,message:'Entrega este enlace solo al cliente verificado. Vence en una hora y se usa una sola vez.',resetToken:reset};
  });
}
function caReset_(body){
  const token=String(body.resetToken||'');if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Enlace vencido o no válido.');
  const eligible=caRows_('SolicitudesAccesoPrivadas').find(r=>r.data.resetHash===authDigest_(token)&&r.data.status==='Enlace emitido'&&r.data.resetExpires>Date.now());
  if(!eligible)throw new Error('Enlace vencido o no válido.');
  const password=caPassword_(body.password),digest=authDigest_(token),salt=authRandom_(),hash=authPasswordHash_(password,salt);
  return caWithLock_(()=>{
    const row=caRows_('SolicitudesAccesoPrivadas').find(r=>r.data.resetHash===digest&&r.data.status==='Enlace emitido');
    if(!row||row.data.resetExpires<=Date.now())throw new Error('Enlace vencido o no válido.');
    const account=caAccount_(row.data.phone);if(!account||!['Activo','Verificación aprobada'].includes(account.data.status)||account.id!==row.data.accountId||account.data.resetVersion!==row.data.resetVersion)throw new Error('Enlace vencido o no válido.');
    const data=account.data;data.status='Activo';data.hash=hash;data.salt=salt;data.version=authRandom_();data.attempts=0;data.attemptStart=0;delete data.resetVersion;caWrite_('CuentasPrivadas',account,data);
    row.data.status='Completada';delete row.data.resetHash;row.data.updated=Date.now();caWrite_('SolicitudesAccesoPrivadas',row,row.data);CacheService.getScriptCache().remove('ca-limit-login-'+authDigest_(data.phone));
    return {ok:true,message:'Contraseña actualizada. Inicia sesión con tu celular y la contraseña nueva.'};
  });
}
function caAction_(action,body,admin){
  if(action==='caadminlist')return caAdminList_();
  if(action==='caadminreview')return caAdminReview_(body);
  if(action==='calogin')return caLogin_(body);
  if(action==='careset')return caReset_(body);
  if(action==='calogout'){const token=String(body.token||'');if(/^BLYXU-P5-[a-f0-9]{64}$/.test(token))caWithLock_(()=>{const digest=authDigest_(token),row=caRows_('CuentasPrivadas').find(r=>(r.data.sessions||[]).some(x=>authEqual_(x.hash,digest)));if(row){row.data.sessions=row.data.sessions.filter(x=>!authEqual_(x.hash,digest));caWrite_('CuentasPrivadas',row,row.data);}});return {ok:true};}
  const phone=caPhone_(body.telefono),first=caName_(body.nombre),last=caName_(body.apellido);caLimit_(phone,action);
  const message=action==='caregister'?'Solicitud recibida. BLYXU revisará tu identidad para activar la cuenta.':'Solicitud recibida. Contacta a BLYXU por WhatsApp para verificar tu identidad y recuperar el acceso.';
  if(action==='carecover'){
    caWithLock_(()=>{const account=caAccount_(phone);if(account)caRequest_(account.data,'Recuperación',first,last,phone);});return {ok:true,message};
  }
  const password=caPassword_(body.password),existing=caAccount_(phone);
  if(existing){
    if(existing.data.status==='Pendiente'&&authEqual_(authPasswordHash_(password,existing.data.salt),existing.data.hash))return caWithLock_(()=>{
      const current=caAccount_(phone);if(!current||current.data.status!=='Pendiente'||current.data.version!==existing.data.version)return {ok:true,message};
      const code=authRandom_().slice(0,12).toUpperCase();current.data.activationHash=authDigest_(code);caWrite_('CuentasPrivadas',current,current.data);caRequest_(current.data,'Activación',first,last,phone);return {ok:true,message:message+' Código de registro: '+code+'. Comunícalo a BLYXU por WhatsApp; no compartas tu contraseña.'};
    });
    return {ok:true,message};
  }
  const salt=authRandom_(),hash=authPasswordHash_(password,salt),code=authRandom_().slice(0,12).toUpperCase();
  return caWithLock_(()=>{if(caAccount_(phone))return {ok:true,message};const data={id:authRandom_(),phone,first,last,salt,hash,activationHash:authDigest_(code),status:'Pendiente',version:authRandom_(),attempts:0,created:Date.now()};caWrite_('CuentasPrivadas',null,data);caRequest_(data,'Activación',first,last,phone);return {ok:true,message:message+' Código de registro: '+code+'. Comunícalo a BLYXU por WhatsApp; no compartas tu contraseña.'};});
}

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
