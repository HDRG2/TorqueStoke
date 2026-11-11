/* =========================================================
   TorqueStock — Capa de datos y reglas de negocio
   Los datos de arranque vienen de archivos JSON (carpeta backend/data/):
     usuarios.json        Usuarios y permisos por rol
     catalogos.json       Líneas, categorías, días de aviso y horas de turno
     herramientas.json    Inventario inicial
     historial-demo.json  Movimientos de ejemplo
   Los cambios que se hacen en la app se guardan en el navegador
   (LocalStorage, Sección 9 del PIA).
   Toda la lógica (semáforo, bloqueo, préstamos, estados)
   vive aquí, separada de la vista (RNF-05: código modular).
   ========================================================= */

const DB = (() => {
  const CLAVE = "torquestock_db_v3";
  const DATOS = "../backend/data/";
  const ARCHIVOS = ["usuarios.json", "catalogos.json", "herramientas.json", "historial-demo.json"].map((f) => DATOS + f);

  // Estados del ciclo de vida de una herramienta (son parte de la lógica, no de los datos)
  const ESTADOS = {
    DISPONIBLE: "Disponible",
    PRESTAMO: "En préstamo",
    REPARACION: "En reparación",
    BAJA: "Baja",
  };

  // Se llenan al leer los archivos JSON
  let USUARIOS = [];        // Sección 8: clases de usuarios
  let PERMISOS = {};        // Qué puede hacer cada rol (Secciones 1.2 y 8)
  let LINEAS = [];
  let CATEGORIAS = [];
  let DIAS_AVISO = 15;      // RF-06: amarillo = vence en estos días o menos
  let HORAS_TURNO = 8;      // Préstamo que excede un turno = no devuelto al cierre de jornada (Sección 1.2)
  let semilla = null;       // Inventario e historial de ejemplo, para "Restablecer demo"

  // ---------- Utilidades de fecha ----------
  const hoy = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const sumarDias = (n) => { const d = hoy(); d.setDate(d.getDate() + n); return aISO(d); };
  const parseFecha = (iso) => { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d); };
  const haceHoras = (h) => new Date(Date.now() - h * 3600000).toISOString();

  // ---------- Datos de demostración (armados con los JSON) ----------
  // Las fechas del JSON son relativas ("dentro de 120 días", "hace 9 horas"),
  // así la demo siempre muestra herramientas en verde, amarillo y rojo.
  function datosIniciales() {
    const herramientas = semilla.herramientas.map((x) => ({
      codigo: x.codigo, nombre: x.nombre, categoria: x.categoria, torqueMin: x.torqueMin, torqueMax: x.torqueMax,
      proximaCalibracion: sumarDias(x.diasParaCalibracion), estado: ESTADOS.DISPONIBLE, prestamo: null, nota: "",
    }));
    const buscarSeed = (c) => {
      const x = herramientas.find((y) => y.codigo === c);
      if (!x) console.warn(`historial-demo.json menciona ${c}, que no está en herramientas.json`);
      return x;
    };
    const movs = [];
    const mov = (horas, tipo, codigo, detalle, usuario) =>
      movs.push({ fecha: haceHoras(horas), tipo, codigo, detalle, usuario });
    const demo = semilla.demo;

    // Historial de los últimos días (para reportes y auditoría)
    (demo.prestamosPasados || []).forEach((p) => {
      mov(p.horasAtras, "Préstamo", p.codigo, `${p.operador} (#${p.empleado}) → ${p.linea}`, "almacen");
      mov(p.horasAtras - p.horasPrestada, "Devolución", p.codigo, `Recibida de ${p.operador} (#${p.empleado}), ${p.linea}`, "almacen");
    });
    (demo.recalibraciones || []).forEach((r) =>
      mov(r.horasAtras, "Recalibración", r.codigo, `Vigencia ${sumarDias(r.vigenciaAnteriorDias)} → ${sumarDias(r.vigenciaNuevaDias)}`, "calidad"));

    // Estado actual: herramientas prestadas ahora mismo
    (demo.prestamosActivos || []).forEach((p) => {
      const x = buscarSeed(p.codigo);
      if (!x) return;
      x.estado = ESTADOS.PRESTAMO;
      x.prestamo = { empleado: p.empleado, operador: p.operador, linea: p.linea, fecha: haceHoras(p.horasAtras) };
      mov(p.horasAtras, "Préstamo", p.codigo, `${p.operador} (#${p.empleado}) → ${p.linea}`, "almacen");
    });

    // Estado actual: herramientas devueltas con daño y en reparación
    (demo.reparaciones || []).forEach((r) => {
      const x = buscarSeed(r.codigo);
      if (!x) return;
      x.estado = ESTADOS.REPARACION;
      x.nota = r.nota;
      mov(r.horasAtras, "Devolución", r.codigo, `Recibida de ${r.operador} (#${r.empleado}), ${r.linea} — CON DAÑO: ${r.danio}`, "almacen");
      mov(r.horasAtras, "Reparación", r.codigo, r.nota, "almacen");
    });

    movs.sort((a, b) => b.fecha.localeCompare(a.fecha));
    return { herramientas, movimientos: movs };
  }

  // ---------- Lectura de los archivos JSON ----------
  async function leerJSON(ruta) {
    let r;
    try { r = await fetch(ruta, { cache: "no-cache" }); }
    catch (e) { throw new Error(`No se pudo leer ${ruta}.`); }
    if (!r.ok) throw new Error(`No se encontró ${ruta} (error ${r.status}).`);
    try { return await r.json(); }
    catch (e) { throw new Error(`${ruta} tiene un error de formato (revisa comas, comillas y llaves).`); }
  }

  async function iniciar() {
    // Abierta con doble clic: el navegador no deja leer archivos JSON
    if (location.protocol === "file:") throw new Error("ABIERTA_COMO_ARCHIVO");
    const [usuarios, catalogos, herramientas, demo] = await Promise.all(ARCHIVOS.map(leerJSON));
    USUARIOS = usuarios.usuarios;
    PERMISOS = usuarios.permisos;
    LINEAS = catalogos.lineas;
    CATEGORIAS = catalogos.categorias;
    DIAS_AVISO = catalogos.diasAviso;
    HORAS_TURNO = catalogos.horasTurno;
    semilla = { herramientas, demo };
    cargar();
  }

  // Aviso a pantalla completa cuando los datos no se pueden cargar
  function mostrarErrorCarga(error) {
    const comoArchivo = error.message === "ABIERTA_COMO_ARCHIVO";
    const fondo = document.createElement("div");
    fondo.className = "modal-fondo abierto";
    fondo.innerHTML = `
      <div class="modal" role="alertdialog" aria-modal="true">
        <div class="modal-cab"><h3>No se pudieron cargar los datos</h3></div>
        <div class="modal-cuerpo">
          ${comoArchivo ? `
            <p style="margin-top:0">Abriste TorqueStock con doble clic. Los datos vienen de archivos JSON
            y el navegador solo los puede leer si la app se abre desde un servidor.</p>
            <p>Ábrela de alguna de estas formas:</p>
            <ul>
              <li>Doble clic en <strong>Iniciar servidor.bat</strong></li>
              <li><strong>Go Live</strong> en VS Code</li>
              <li>El link de GitHub Pages</li>
            </ul>` : `
            <p style="margin-top:0">Revisa que la carpeta <strong>backend/data/</strong> esté completa y que los archivos JSON no tengan errores.</p>
            <p class="error-form"></p>`}
        </div>
      </div>`;
    if (!comoArchivo) fondo.querySelector(".error-form").textContent = error.message;
    const poner = () => document.body.appendChild(fondo);
    if (document.body) poner(); else document.addEventListener("DOMContentLoaded", poner);
  }

  // Promesa que se cumple cuando ya están los datos: las páginas esperan con "await DB.listo"
  const listo = iniciar().catch((e) => { mostrarErrorCarga(e); throw e; });
  listo.catch(() => { /* el aviso ya se mostró */ });

  // ---------- Persistencia ----------
  let estado;
  function cargar() {
    try {
      const txt = localStorage.getItem(CLAVE);
      estado = txt ? JSON.parse(txt) : datosIniciales();
    } catch (e) {
      estado = datosIniciales();
    }
    guardar();
  }
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) { /* almacenamiento no disponible */ }
  }
  // Vuelve a leer lo guardado, por si otra pestaña hizo cambios.
  // Si no hay nada guardado o no se puede leer, conserva lo que hay en memoria.
  function recargar() {
    try {
      const txt = localStorage.getItem(CLAVE);
      if (txt) estado = JSON.parse(txt);
    } catch (e) { /* se queda con los datos en memoria */ }
  }

  // ---------- Permisos por rol (Secciones 1.2 y 8) ----------
  // La regla vive aquí y no solo en la pantalla: si el rol no tiene permiso, la acción se rechaza.
  function exigirPermiso(usuario, accion) {
    const u = USUARIOS.find((x) => x.usuario === usuario);
    if (!u || !(PERMISOS[u.rol] || {})[accion]) throw new Error("Tu rol no tiene permiso para esta acción.");
  }
  // Antes de cualquier cambio: revisa el permiso y parte de los datos más recientes
  function preparar(usuario, accion) {
    exigirPermiso(usuario, accion);
    recargar();
  }

  function restablecer(usuario) { exigirPermiso(usuario, "restablecer"); estado = datosIniciales(); guardar(); }

  function registrarMovimiento(tipo, codigo, detalle, usuario) {
    estado.movimientos.unshift({ fecha: new Date().toISOString(), tipo, codigo, detalle, usuario });
    if (estado.movimientos.length > 2000) estado.movimientos.length = 2000;
  }

  // ---------- RF-06: Semáforo de calibración ----------
  function diasParaVencer(herr) {
    return Math.round((parseFecha(herr.proximaCalibracion) - hoy()) / 86400000);
  }
  function semaforo(herr) {
    const d = diasParaVencer(herr);
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

  // ---------- Validaciones comunes ----------
  function obtener(codigo) {
    const herr = buscar(codigo);
    if (!herr) throw new Error("Herramienta no encontrada.");
    return herr;
  }
  function exigirEstado(herr, ...permitidos) {
    if (!permitidos.includes(herr.estado))
      throw new Error(`Acción no permitida: la herramienta está "${herr.estado}".`);
  }
  function exigirTexto(t, campo) {
    const v = (t || "").trim();
    if (!v) throw new Error(`Escribe ${campo}.`);
    return v;
  }

  // ---------- RF-02: Alta de herramienta ----------
  function altaHerramienta(datos, usuario) {
    preparar(usuario, "alta");
    const codigo = (datos.codigo || "").trim().toUpperCase();
    const nombre = (datos.nombre || "").trim();
    const min = Number(datos.torqueMin), max = Number(datos.torqueMax);

    // RNF-05: validación de campos obligatorios
    if (!codigo || !nombre || !datos.categoria || datos.torqueMin === "" || datos.torqueMax === "" || !datos.proximaCalibracion)
      throw new Error("Todos los campos son obligatorios.");
    if (!/^[A-Z0-9-]{2,15}$/.test(codigo)) throw new Error("El código solo admite letras, números y guion (máx. 15).");
    if (buscar(codigo)) throw new Error(`Ya existe una herramienta con el código ${codigo}.`);
    if (isNaN(min) || isNaN(max) || min < 0 || max <= 0) throw new Error("El rango de torque debe ser numérico y positivo.");
    if (min >= max) throw new Error("El torque mínimo debe ser menor que el máximo.");

    const herr = {
      codigo, nombre, categoria: datos.categoria, torqueMin: min, torqueMax: max,
      proximaCalibracion: datos.proximaCalibracion, estado: ESTADOS.DISPONIBLE, prestamo: null, nota: "",
    };
    estado.herramientas.push(herr);
    registrarMovimiento("Alta", codigo, `${nombre} (${min}-${max} Nm)`, usuario);
    guardar();
    return herr;
  }

  // ---------- RF-04: Préstamo (con bloqueo de RF-06) ----------
  function prestar(codigo, datos, usuario) {
    preparar(usuario, "prestar");
    const herr = obtener(codigo);
    if (herr.estado !== ESTADOS.DISPONIBLE) throw new Error("La herramienta no está disponible.");
    if (semaforo(herr).color === "rojo")
      throw new Error("BLOQUEADO: la calibración está vencida. No se puede prestar (IATF 16949 / ISO 6789).");

    const empleado = (datos.empleado || "").trim();
    const operador = (datos.operador || "").trim();
    if (!empleado || !operador || !datos.linea) throw new Error("Captura número de empleado, nombre y línea.");
    if (!/^\d{1,10}$/.test(empleado)) throw new Error("El número de empleado solo admite dígitos.");

    herr.estado = ESTADOS.PRESTAMO;
    herr.prestamo = { empleado, operador, linea: datos.linea, fecha: new Date().toISOString() };
    registrarMovimiento("Préstamo", codigo, `${operador} (#${empleado}) → ${datos.linea}`, usuario);
    guardar();
    return herr;
  }

  // ---------- RF-05: Devolución en un clic ----------
  function devolver(codigo, usuario) {
    preparar(usuario, "prestar");
    const herr = obtener(codigo);
    exigirEstado(herr, ESTADOS.PRESTAMO);
    const p = herr.prestamo;
    herr.estado = ESTADOS.DISPONIBLE;
    herr.prestamo = null;
    registrarMovimiento("Devolución", codigo, `Recibida de ${p.operador} (#${p.empleado}), ${p.linea}`, usuario);
    guardar();
    return herr;
  }

  // Devolución con daño detectado en la inspección física (Almacenista, Sección 1.2)
  function devolverConDanio(codigo, observacion, usuario) {
    preparar(usuario, "prestar");
    const herr = obtener(codigo);
    exigirEstado(herr, ESTADOS.PRESTAMO);
    const obs = exigirTexto(observacion, "el daño encontrado");
    const p = herr.prestamo;
    herr.estado = ESTADOS.REPARACION;
    herr.prestamo = null;
    herr.nota = obs;
    registrarMovimiento("Devolución", codigo, `Recibida de ${p.operador} (#${p.empleado}), ${p.linea} — CON DAÑO: ${obs}`, usuario);
    registrarMovimiento("Reparación", codigo, obs, usuario);
    guardar();
    return herr;
  }

  // Enviar a reparación externa o mantenimiento (Jefe de almacén)
  function enviarReparacion(codigo, motivo, usuario) {
    preparar(usuario, "reparar");
    const herr = obtener(codigo);
    exigirEstado(herr, ESTADOS.DISPONIBLE);
    herr.nota = exigirTexto(motivo, "el motivo");
    herr.estado = ESTADOS.REPARACION;
    registrarMovimiento("Reparación", codigo, herr.nota, usuario);
    guardar();
    return herr;
  }

  // Reincorporar al servicio tras reparación (Técnico de mantenimiento → almacén)
  function reincorporar(codigo, usuario) {
    preparar(usuario, "reincorporar");
    const herr = obtener(codigo);
    exigirEstado(herr, ESTADOS.REPARACION);
    const detalle = "Reparada y reincorporada al servicio";
    herr.estado = ESTADOS.DISPONIBLE;
    herr.prestamo = null;
    herr.nota = "";
    registrarMovimiento("Reincorporación", codigo, detalle, usuario);
    guardar();
    return herr;
  }

  // Baja definitiva (Jefe de almacén)
  function darDeBaja(codigo, motivo, usuario) {
    preparar(usuario, "baja");
    const herr = obtener(codigo);
    exigirEstado(herr, ESTADOS.DISPONIBLE, ESTADOS.REPARACION);
    herr.nota = exigirTexto(motivo, "el motivo de la baja");
    herr.estado = ESTADOS.BAJA;
    registrarMovimiento("Baja", codigo, herr.nota, usuario);
    guardar();
    return herr;
  }

  // ---------- RF-07: Actualizar calibración ----------
  function actualizarCalibracion(codigo, nuevaFecha, usuario) {
    preparar(usuario, "calibrar");
    const herr = obtener(codigo);
    if (herr.estado === ESTADOS.BAJA) throw new Error("La herramienta está dada de baja.");
    if (!nuevaFecha) throw new Error("Selecciona la nueva fecha de calibración.");
    if (parseFecha(nuevaFecha) <= hoy()) throw new Error("La nueva fecha debe ser posterior a hoy.");
    const anterior = herr.proximaCalibracion;
    herr.proximaCalibracion = nuevaFecha;
    registrarMovimiento("Recalibración", codigo, `Vigencia ${anterior} → ${nuevaFecha}`, usuario);
    guardar();
    return herr;
  }

  // ---------- RF-01: Autenticación ----------
  function autenticar(usuario, clave) {
    const u = USUARIOS.find((x) => x.usuario === usuario.trim().toLowerCase() && x.clave === clave);
    return u ? { usuario: u.usuario, nombre: u.nombre, rol: u.rol } : null;
  }
  const permisos = (rol) => PERMISOS[rol] || {};

  return {
    listo, ESTADOS,
    // Se leen de catalogos.json, por eso se piden al momento
    get LINEAS() { return LINEAS; },
    get CATEGORIAS() { return CATEGORIAS; },
    get DIAS_AVISO() { return DIAS_AVISO; },
    get HORAS_TURNO() { return HORAS_TURNO; },
    listar, activas, buscar, movimientos, historial, indicadores, reporteUtilizacion,
    semaforo, excedeTurno, horasPrestada,
    altaHerramienta, prestar, devolver, devolverConDanio, enviarReparacion, reincorporar,
    darDeBaja, actualizarCalibracion,
    autenticar, permisos, restablecer, recargar, sumarDias,
  };
})();
