/* =========================================================
   TorqueStock — Service Worker (modo sin internet)
   Guarda todos los archivos de la app en el celular la primera
   vez que se abre; después funciona sin conexión.
   Si cambias algún archivo, sube el número de VERSION.
   ========================================================= */
const VERSION = "torquestock-v3";
const ARCHIVOS = [
  "./", "./index.html", "./panel.html", "./reportes.html", "./ayuda.html", "./acerca.html",
  "./css/styles.css",
  "./data/usuarios.json", "./data/catalogos.json", "./data/herramientas.json", "./data/historial-demo.json",
  "./js/datos.js", "./js/sesion.js", "./js/util.js", "./js/app.js", "./js/reportes.js", "./js/pwa.js",
  "./manifest.json", "./img/icono-192.png", "./img/icono-512.png", "./img/icono-maskable.png", "./img/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primero la copia guardada (rápido y sin internet); si hay red, se actualiza en segundo plano
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const guardada = await cache.match(e.request, { ignoreSearch: true });
      const deRed = fetch(e.request)
        .then((resp) => { if (resp.ok) cache.put(e.request, resp.clone()); return resp; })
        .catch(() => null);
      return guardada || (await deRed) || cache.match("./index.html");
    })
  );
});
