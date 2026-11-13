/* =========================================================
   TorqueStock — Capa de datos (conexión con el servidor)
   Todos los datos viven en la base SQLite del servidor del
   almacén (backend/servidor.py) y los comparten todos los
   equipos de la red. El servidor revisa contraseñas, permisos
   y reglas de negocio; esta capa solo los pide y los muestra.
   Aquí quedan los cálculos para la pantalla (semáforo, turno,
   indicadores), separados de la vista (RNF-05: código modular).
   ========================================================= */

const DB = (() => {
  const API = "api/";
  const CADA_MS = 3000;     // cada cuánto se pregunta al servidor si otro equipo hizo cambios

  // Estados del ciclo de vida de una herramienta
  const ESTADOS = {
    DISPONIBLE: "Disponible",
    PRESTAMO: "En préstamo",
    REPARACION: "En reparación",
    BAJA: "Baja",
  };

  // Llegan del servidor (tablas permisos, lineas, categorias y configuracion)
  let PERMISOS = {};        // Qué puede hacer cada rol (Secciones 1.2 y 8)
  let LINEAS = [];
  let CATEGORIAS = [];
  let DIAS_AVISO = 15;      // RF-06: amarillo = vence en estos días o menos
  let HORAS_TURNO = 8;      // Préstamo que excede un turno = no devuelto al cierre de jornada (Sección 1.2)

  let estado = { herramientas: [], movimientos: [] };
  let versionDatos = 0;     // número de versión de los datos del servidor

  // ---------- Utilidades de fecha ----------
  const hoy = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const sumarDias = (n) => { const d = hoy(); d.setDate(d.getDate() + n); return aISO(d); };
  const parseFecha = (iso) => { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d); };

  // ---------- Arranque ----------
  async function iniciar() {
    if (location.protocol === "file:") throw new Error("SIN_SERVIDOR");
    let config;
    try { config = await api("config", { conSesion: false }); }
    catch (e) { throw new Error("SIN_SERVIDOR"); }
    PERMISOS = config.permisos;
    LINEAS = config.lineas;
    CATEGORIAS = config.categorias;
    DIAS_AVISO = config.diasAviso;
    HORAS_TURNO = config.horasTurno;
    if (sesionActual()) { await traerEstado(); vigilarCambios(); }
  }

  const sesionActual = () => (typeof Sesion !== "undefined" ? Sesion.actual() : null);

  async function api(ruta, { metodo = "GET", cuerpo, conSesion = true } = {}) {
    const u = sesionActual();
    const encabezados = { "Content-Type": "application/json" };
    if (u && u.token) encabezados.Authorization = `Bearer ${u.token}`;
    let r;
    try {
      r = await fetch(API + ruta, {
        method: metodo, cache: "no-store", headers: encabezados,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });
    } catch (e) {
      conexion(false);
      throw new Error("No hay conexión con el servidor del almacén. Revisa la red e intenta de nuevo.");
    }
    let datos = null;
    try { datos = await r.json(); } catch (e) { /* no es una respuesta del servidor de TorqueStock */ }
    if (!datos) throw new Error(`El servidor no respondió como se esperaba (${r.status}).`);
    conexion(true);
    if (r.status === 401 && conSesion) {
      // La sesión ya no es válida (expiró o se borró la base): de vuelta al login
      Sesion.olvidar();
      window.location.replace("index.html");
      return new Promise(() => {});   // no sigue ni muestra errores: la página ya se va al login
    }
    if (!r.ok) throw new Error(datos.error || `Error del servidor (${r.status}).`);
    return datos;
  }

  function aplicar(r) {
    estado = { herramientas: r.herramientas, movimientos: r.movimientos };
    versionDatos = r.version;
  }
  async function traerEstado() { aplicar(await api("estado")); }

  // Cada pocos segundos pregunta si hubo cambios en otro equipo; si los hay, avisa a la página
  function vigilarCambios() {
    let revisando = false;
    const revisar = async () => {
      if (revisando || document.hidden || !sesionActual()) return;
      revisando = true;
      try {
        const { version } = await api("version");
        if (version !== versionDatos) {
          await traerEstado();
          window.dispatchEvent(new Event("torquestock:datos"));
        }
      } catch (e) { /* sin red: ya se muestra el aviso de conexión */ }
      revisando = false;
    };
    setInterval(revisar, CADA_MS);
    document.addEventListener("visibilitychange", revisar);
  }

  // Aviso fijo mientras no hay conexión con el servidor
  function conexion(ok) {
    let barra = document.getElementById("avisoConexion");
    if (ok) { if (barra) barra.remove(); return; }
    if (barra || !document.body) return;
    barra = document.createElement("div");
    barra.id = "avisoConexion";
    barra.className = "aviso-conexion";
    barra.setAttribute("role", "alert");
    barra.textContent = "Sin conexión con el servidor del almacén. Reintentando…";
    document.body.appendChild(barra);
  }

  // Aviso a pantalla completa cuando la página no se abrió desde el servidor del almacén
  function mostrarErrorCarga(error) {
    const sinServidor = error.message === "SIN_SERVIDOR";
    const fondo = document.createElement("div");
    fondo.className = "modal-fondo abierto";
    fondo.innerHTML = `
      <div class="modal" role="alertdialog" aria-modal="true">
        <div class="modal-cab"><h3>${sinServidor ? "Se necesita el servidor del almacén" : "No se pudieron cargar los datos"}</h3></div>
        <div class="modal-cuerpo">
          ${sinServidor ? `
            <p style="margin-top:0">TorqueStock guarda sus datos en la base de datos del servidor del almacén,
            así que la página debe abrirse desde ese servidor.</p>
            <ol>
              <li>En la computadora del almacén, doble clic en <strong>Iniciar servidor.bat</strong>.</li>
              <li>Abre la dirección que muestra la ventana, por ejemplo <strong>http://localhost:8080</strong>
                  o <strong>http://192.168.1.50:8080</strong> desde una tablet.</li>
            </ol>` : `<p style="margin-top:0" class="error-form"></p>`}
        </div>
      </div>`;
    if (!sinServidor) fondo.querySelector(".error-form").textContent = error.message;
    const poner = () => document.body.appendChild(fondo);
    if (document.body) poner(); else document.addEventListener("DOMContentLoaded", poner);
  }

  // Promesa que se cumple cuando ya están los datos: las páginas esperan con "await DB.listo"
  const listo = iniciar().catch((e) => { mostrarErrorCarga(e); throw e; });
  listo.catch(() => { /* el aviso ya se mostró */ });

  // ---------- RF-06: Semáforo de calibración ----------
  function diasParaVencer(herr) {
    return Math.round((parseFecha(herr.proximaCalibracion) - hoy()) / 86400000);
  }
  function semaforo(herr) {
    const d = diasParaVencer(herr);
    // Pasó por reparación: no se presta hasta que Calidad registre una nueva calibración (ISO 6789)
    if (herr.requiereCalibracion) return { color: "rojo", texto: "Recalibrar", dias: d, recalibrar: true };
    if (d < 0) return { color: "rojo", texto: "Vencida", dias: d };
    if (d <= DIAS_AVISO) return { color: "amarillo", texto: "Por vencer", dias: d };
    return { color: "verde", texto: "Vigente", dias: d };
  }

  // ---------- Préstamo no devuelto al cierre del turno ----------
  function horasPrestada(herr) {
    if (!herr.prestamo) return 0;
    return (Date.now() - new Date(herr.prestamo.fecha).getTime()) / 3600000;
  }
  const excedeTurno = (herr) => herr.estado === ESTADOS.PRESTAMO && horasPrestada(herr) > HORAS_TURNO;

  // ---------- Consultas ----------
  const listar = () => estado.herramientas;
  const activas = () => estado.herramientas.filter((x) => x.estado !== ESTADOS.BAJA);
  const buscar = (codigo) => estado.herramientas.find((x) => x.codigo === codigo);
  const movimientos = () => estado.movimientos;
  const historial = (codigo) => estado.movimientos.filter((m) => m.codigo === codigo);

  function indicadores() {
    const lista = activas();
    const cuenta = (fn) => lista.filter(fn).length;
    return {
      total: lista.length,
      disponibles: cuenta((x) => x.estado === ESTADOS.DISPONIBLE),
      enPrestamo: cuenta((x) => x.estado === ESTADOS.PRESTAMO),
      vencidas: cuenta((x) => semaforo(x).color === "rojo"),
      porVencer: cuenta((x) => semaforo(x).color === "amarillo"),
      enReparacion: cuenta((x) => x.estado === ESTADOS.REPARACION),
      excedidas: cuenta(excedeTurno),
      bajas: estado.herramientas.length - lista.length,
    };
  }

  // Reportes ejecutivos de utilización (Jefe de almacén, Sección 1.2)
  function reporteUtilizacion() {
    const contar = (clave) => {
      const r = {};
      estado.movimientos.filter((m) => m.tipo === "Préstamo").forEach((m) => {
        const k = clave(m);
        if (k) r[k] = (r[k] || 0) + 1;
      });
      return Object.entries(r).sort((a, b) => b[1] - a[1]);
    };
    const partes = (m) => {
      const x = m.detalle.match(/^(.*) \(#(\w+)\) → (.*)$/);
      return x ? { operador: `${x[1]} (#${x[2]})`, linea: x[3] } : {};
    };
    return {
      porHerramienta: contar((m) => m.codigo),
      porLinea: contar((m) => partes(m).linea),
      porOperador: contar((m) => partes(m).operador),
      totalPrestamos: estado.movimientos.filter((m) => m.tipo === "Préstamo").length,
      totalDevoluciones: estado.movimientos.filter((m) => m.tipo === "Devolución").length,
    };
  }

  // ---------- Acciones (RF-02, RF-04, RF-05, RF-07…) ----------
  // Las hace el servidor: revisa el permiso del rol y las reglas, guarda en la base y responde
  // con los datos actualizados. Si algo no se permite, el mensaje del servidor llega como error.
  async function accion(nombre, codigo, datos) {
    const r = await api("accion", { metodo: "POST", cuerpo: { accion: nombre, codigo, datos } });
    aplicar(r);
    return r.codigo ? buscar(r.codigo) : null;
  }
  const altaHerramienta = (datos) => accion("alta", null, datos);
  const prestar = (codigo, datos) => accion("prestar", codigo, datos);
  const devolver = (codigo) => accion("devolver", codigo);
  const devolverConDanio = (codigo, texto) => accion("devolverConDanio", codigo, { texto });
  const enviarReparacion = (codigo, texto) => accion("reparar", codigo, { texto });
  const reincorporar = (codigo) => accion("reincorporar", codigo);
  const darDeBaja = (codigo, texto) => accion("baja", codigo, { texto });
  const actualizarCalibracion = (codigo, fecha) => accion("calibrar", codigo, { fecha });

  // ---------- RF-01: Autenticación ----------
  // El servidor compara la contraseña con el hash guardado en la tabla usuarios y entrega una sesión.
  async function autenticar(usuario, clave) {
    try {
      return await api("login", { metodo: "POST", cuerpo: { usuario, clave }, conSesion: false });
    } catch (e) {
      if (/incorrectos/.test(e.message)) return null;
      throw e;
    }
  }
  const permisos = (rol) => PERMISOS[rol] || {};

  // Avisa al servidor que la sesión terminó (la página se va al login de inmediato)
  function cerrarSesion(u) {
    if (!u || !u.token) return;
    try {
      fetch(API + "logout", { method: "POST", keepalive: true, body: "{}",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${u.token}` } });
    } catch (e) { /* no importa: la sesión expira sola */ }
  }

  return {
    listo, ESTADOS,
    // Llegan del servidor al abrir la página, por eso se piden al momento
    get LINEAS() { return LINEAS; },
    get CATEGORIAS() { return CATEGORIAS; },
    get DIAS_AVISO() { return DIAS_AVISO; },
    get HORAS_TURNO() { return HORAS_TURNO; },
    listar, activas, buscar, movimientos, historial, indicadores, reporteUtilizacion,
    semaforo, excedeTurno, horasPrestada,
    altaHerramienta, prestar, devolver, devolverConDanio, enviarReparacion, reincorporar,
    darDeBaja, actualizarCalibracion,
    autenticar, cerrarSesion, permisos, sumarDias,
  };
})();
