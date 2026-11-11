/* =========================================================
   TorqueStock — Manejo de sesión (RF-01)
   Usa sessionStorage; si el navegador no lo permite (algunos
   celulares o vistas incrustadas), usa window.name como respaldo.
   ========================================================= */

const Sesion = (() => {
  const CLAVE = "torquestock_sesion";

  function escribir(valor) {
    try {
      if (valor === null) sessionStorage.removeItem(CLAVE);
      else sessionStorage.setItem(CLAVE, valor);
    } catch (e) { /* sin sessionStorage */ }
    window.name = valor === null ? "" : `${CLAVE}:${valor}`;
  }
  function leer() {
    try {
      const v = sessionStorage.getItem(CLAVE);
      if (v) return v;
    } catch (e) { /* sin sessionStorage */ }
    return window.name.startsWith(CLAVE + ":") ? window.name.slice(CLAVE.length + 1) : null;
  }

  function iniciar(usuario) { escribir(JSON.stringify(usuario)); }
  function actual() {
    try { return JSON.parse(leer()); } catch (e) { return null; }
  }
  // Borra la sesión de este navegador (sin ir a otra página)
  function olvidar() { escribir(null); }
  function cerrar() {
    if (typeof DB !== "undefined" && DB.cerrarSesion) DB.cerrarSesion(actual());   // avisa al servidor
    escribir(null);
    window.location.href = "index.html";
  }
  // Protege páginas internas: si no hay sesión, regresa al login
  function exigir() {
    const u = actual();
    if (!u) window.location.replace("index.html");
    return u;
  }

  return { iniciar, actual, cerrar, olvidar, exigir };
})();
