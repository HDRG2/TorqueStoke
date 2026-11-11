/* =========================================================
   TorqueStock — Registro del modo sin internet (PWA)
   Solo se activa cuando la app se abre desde un servidor
   (GitHub Pages o el servidor local), no desde un archivo.
   ========================================================= */
(function () {
  try {
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(() => { /* no disponible en esta vista */ });
      });
    }
  } catch (e) { /* sin soporte */ }
})();
