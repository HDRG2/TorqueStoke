/* =========================================================
   TorqueStock — Cifrado de contraseñas (RF-01)
   PBKDF2 con SHA-256: la contraseña + una "sal" aleatoria se
   pasan miles de veces por SHA-256. En usuarios.json solo se
   guarda el resultado (hash) y la sal, nunca la contraseña.

   Usa el cifrado del navegador (crypto.subtle) cuando existe.
   Este solo funciona en https o localhost; al abrir la app por la
   red local (http://192.168…) se usa la versión en JavaScript de
   abajo, que da exactamente el mismo resultado.
   ========================================================= */

const Cifrado = (() => {
  const K = Int32Array.of(
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2);
  const INICIO = Int32Array.of(
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19);
  const W = new Int32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  // Procesa un bloque de 64 bytes de SHA-256 sobre el estado H
  function bloque(H, m, o) {
    for (let i = 0; i < 16; i++, o += 4) W[i] = (m[o] << 24) | (m[o + 1] << 16) | (m[o + 2] << 8) | m[o + 3];
    for (let i = 16; i < 64; i++) {
      const x = W[i - 15], y = W[i - 2];
      W[i] = (W[i - 16] + (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) + W[i - 7] + (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10))) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }

  // SHA-256 de "datos", partiendo de un estado que ya procesó "previos" bytes
  function sha256(estado, previos, datos) {
    const H = Int32Array.from(estado);
    const largo = ((datos.length + 72) >> 6) << 6;
    const m = new Uint8Array(largo);
    m.set(datos);
    m[datos.length] = 0x80;
    const bits = (previos + datos.length) * 8;
    const v = new DataView(m.buffer);
    v.setUint32(largo - 8, Math.floor(bits / 0x100000000));
    v.setUint32(largo - 4, bits >>> 0);
    for (let o = 0; o < largo; o += 64) bloque(H, m, o);
    const salida = new Uint8Array(32);
    const vs = new DataView(salida.buffer);
    for (let i = 0; i < 8; i++) vs.setInt32(i * 4, H[i]);
    return salida;
  }

  // PBKDF2-HMAC-SHA256 en JavaScript (32 bytes de salida)
  function pbkdf2JS(clave, sal, iteraciones) {
    let k = clave;
    if (k.length > 64) k = sha256(INICIO, 0, k);
    const ipad = new Uint8Array(64).fill(0x36);
    const opad = new Uint8Array(64).fill(0x5c);
    for (let i = 0; i < k.length; i++) { ipad[i] ^= k[i]; opad[i] ^= k[i]; }
    const Hi = Int32Array.from(INICIO); bloque(Hi, ipad, 0);
    const Ho = Int32Array.from(INICIO); bloque(Ho, opad, 0);
    const hmac = (m) => sha256(Ho, 64, sha256(Hi, 64, m));

    const primero = new Uint8Array(sal.length + 4);
    primero.set(sal);
    primero[sal.length + 3] = 1;
    let u = hmac(primero);
    const t = u.slice();
    for (let i = 1; i < iteraciones; i++) {
      u = hmac(u);
      for (let j = 0; j < 32; j++) t[j] ^= u[j];
    }
    return t;
  }

  const aHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  const deHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));

  // Devuelve el hash (hexadecimal) de la contraseña con la sal indicada
  async function derivar(clave, salHex, iteraciones) {
    const bytes = new TextEncoder().encode(clave);
    const sal = deHex(salHex);
    if (window.isSecureContext && window.crypto && crypto.subtle) {
      try {
        const llave = await crypto.subtle.importKey("raw", bytes, "PBKDF2", false, ["deriveBits"]);
        const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iteraciones }, llave, 256);
        return aHex(new Uint8Array(bits));
      } catch (e) { /* si falla, se usa la versión en JavaScript */ }
    }
    return aHex(pbkdf2JS(bytes, sal, iteraciones));
  }

  // Compara sin cortar en la primera diferencia (no revela cuántos caracteres coinciden)
  function iguales(a, b) {
    if (a.length !== b.length) return false;
    let r = 0;
    for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
  }

  return { derivar, iguales };
})();
