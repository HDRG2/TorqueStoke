/* =========================================================
   TorqueStock — Service Worker (modo sin internet)
   Guarda todos los archivos de la app en el celular la primera
   vez que se abre; después funciona sin conexión.
   Si cambias algún archivo, sube el número de VERSION.
   ========================================================= */
const VERSION = "torquestock-v6";
const ARCHIVOS = [
  "./", "./index.html", "./panel.html", "./reportes.html", "./ayuda.html", "./acerca.html",
  "./css/styles.css",
  "../backend/data/usuarios.json", "../backend/data/catalogos.json", "../backend/data/herramientas.json", "../backend/data/historial-demo.json",
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

// Primero internet (siempre la versión más nueva); sin conexión, la copia guardada.
// Si la red tarda más de ESPERA_MS (señal débil), también se usa la copia guardada.
const ESPERA_MS = 4000;

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(responder(e.request));
});

async function responder(request) {
  const cache = await caches.open(VERSION);
  const guardada = () => cache.match(request, { ignoreSearch: true });

  // "no-cache": pregunta al servidor si hay versión nueva en vez de usar la caché normal del navegador
  const deRed = fetch(request.url, { cache: "no-cache", credentials: "same-origin" })
    .then((resp) => {
      if (resp.redirected) return fetch(request);   // las páginas redirigidas se piden de forma normal
      if (resp.ok) cache.put(request, resp.clone());
      return resp;
    });

  try {
    const lenta = new Promise((_, rechazar) => setTimeout(() => rechazar(new Error("lenta")), ESPERA_MS));
    return await Promise.race([deRed, lenta]);
  } catch (err) {
    const copia = await guardada();
    if (copia) return copia;
    try { return await deRed; }                     // sin copia: espera a la red aunque tarde
    catch (e) { return (await cache.match("./index.html")) || Response.error(); }
  }
}
