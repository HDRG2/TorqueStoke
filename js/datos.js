/* =========================================================
   TorqueStock — Capa de datos y reglas de negocio
   Persistencia local con LocalStorage (Sección 9 del PIA).
   Toda la lógica (semáforo, bloqueo, préstamos, estados)
   vive aquí, separada de la vista (RNF-05: código modular).
   ========================================================= */

const DB = (() => {
  const CLAVE = "torquestock_db_v3";
  const DIAS_AVISO = 15;    // RF-06: amarillo = vence en 15 días o menos
  const HORAS_TURNO = 8;    // Préstamo que excede un turno = no devuelto al cierre de jornada (Sección 1.2)

  // Estados del ciclo de vida de una herramienta
  const ESTADOS = {
    DISPONIBLE: "Disponible",
    PRESTAMO: "En préstamo",
    REPARACION: "En reparación",
    BAJA: "Baja",
  };

  // Usuarios por rol (Sección 8: clases de usuarios)
  const USUARIOS = [
    { usuario: "jefe",    clave: "jefe123",    nombre: "Jefe de Almacén",     rol: "Administrador" },
    { usuario: "almacen", clave: "almacen123", nombre: "Almacenista Turno 1", rol: "Almacenista" },
    { usuario: "calidad", clave: "calidad123", nombre: "Ing. de Calidad",     rol: "Calidad" },
  ];

  // Qué puede hacer cada rol (Secciones 1.2 y 8)
  const PERMISOS = {
    Administrador: { alta: true,  prestar: true,  calibrar: true,  reparar: true,  reincorporar: true,  baja: true,  reportes: true,  restablecer: true },
    Almacenista:   { alta: false, prestar: true,  calibrar: false, reparar: false, reincorporar: true,  baja: false, reportes: false, restablecer: false },
    Calidad:       { alta: false, prestar: false, calibrar: true,  reparar: false, reincorporar: false, baja: false, reportes: true,  restablecer: false },
  };

  const LINEAS = ["Línea 1", "Línea 2", "Línea 3", "Línea 4", "Línea 5", "Línea 6", "Mantenimiento"];
  const CATEGORIAS = [
    "Llave dinamométrica de clic",
    "Torquímetro digital",
    "Desarmador dinamométrico",
    "Multiplicador de par",
    "Atornillador neumático",
  ];

  // ---------- Utilidades de fecha ----------
  const hoy = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const sumarDias = (n) => { const d = hoy(); d.setDate(d.getDate() + n); return aISO(d); };
  const parseFecha = (iso) => { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d); };
  const haceHoras = (h) => new Date(Date.now() - h * 3600000).toISOString();

  // ---------- Datos de demostración ----------
  function datosIniciales() {
    const h = (codigo, nombre, categoria, min, max, dias) => ({
      codigo, nombre, categoria, torqueMin: min, torqueMax: max,
      proximaCalibracion: sumarDias(dias), estado: ESTADOS.DISPONIBLE, prestamo: null, nota: "",
    });
    const herramientas = [
      h("TQ-001", "Llave de clic 3/8\" Norbar",         CATEGORIAS[0], 20, 100, 120),
      h("TQ-002", "Llave de clic 1/2\" Tohnichi",       CATEGORIAS[0], 40, 200, 75),
      h("TQ-003", "Torquímetro digital CDI 2503",       CATEGORIAS[1], 10, 340, 9),
      h("TQ-004", "Torquímetro digital Snap-on ATECH",  CATEGORIAS[1], 5, 135, 200),
      h("TQ-005", "Desarmador dinamométrico Wera",      CATEGORIAS[2], 1, 5, -4),
      h("TQ-006", "Desarmador dinamométrico Wiha",      CATEGORIAS[2], 0.5, 3, 45),
      h("TQ-007", "Multiplicador de par Norbar HT",     CATEGORIAS[3], 300, 1500, 160),
      h("TQ-008", "Atornillador neumático Atlas Copco", CATEGORIAS[4], 8, 40, 13),
      h("TQ-009", "Llave de clic 3/4\" Proto",          CATEGORIAS[0], 100, 600, -20),
      h("TQ-010", "Torquímetro digital Stahlwille",     CATEGORIAS[1], 20, 400, 90),
      h("TQ-011", "Llave de clic 1/4\" Gedore",         CATEGORIAS[0], 5, 25, 60),
      h("TQ-012", "Atornillador neumático Ingersoll",   CATEGORIAS[4], 10, 60, 30),
      h("TQ-013", "Llave de clic 1/2\" CDI",            CATEGORIAS[0], 30, 150, 100),
      h("TQ-014", "Multiplicador de par Hytorc",        CATEGORIAS[3], 500, 3000, 140),
    ];
    const buscarSeed = (c) => herramientas.find((x) => x.codigo === c);
    const movs = [];
    const mov = (horas, tipo, codigo, detalle, usuario) =>
      movs.push({ fecha: haceHoras(horas), tipo, codigo, detalle, usuario });

    // Historial de los últimos días (para reportes y auditoría)
    const historia = [
      ["TQ-001", "Carlos Treviño", "30115", "Línea 1"], ["TQ-003", "María López", "41208", "Línea 3"],
      ["TQ-010", "José Garza", "28844", "Línea 4"],    ["TQ-001", "Carlos Treviño", "30115", "Línea 1"],
      ["TQ-004", "Ana Martínez", "20871", "Mantenimiento"], ["TQ-011", "Pedro Ruiz", "15530", "Línea 5"],
      ["TQ-003", "Luis Hernández", "10452", "Línea 2"], ["TQ-012", "María López", "41208", "Línea 3"],
      ["TQ-001", "José Garza", "28844", "Línea 4"],    ["TQ-006", "Rosa Salinas", "33620", "Línea 6"],
      ["TQ-010", "Carlos Treviño", "30115", "Línea 1"], ["TQ-013", "Pedro Ruiz", "15530", "Línea 5"],
    ];
    historia.forEach(([codigo, op, emp, linea], i) => {
      const inicio = 150 - i * 11;
      mov(inicio, "Préstamo", codigo, `${op} (#${emp}) → ${linea}`, "almacen");
      mov(inicio - 7, "Devolución", codigo, `Recibida de ${op} (#${emp}), ${linea}`, "almacen");
    });
    mov(60, "Recalibración", "TQ-004", `Vigencia ${sumarDias(-2)} → ${sumarDias(200)}`, "calidad");

    // Estado actual de algunas herramientas
    const prestar = (codigo, empleado, operador, linea, horas) => {
      const x = buscarSeed(codigo);
      x.estado = ESTADOS.PRESTAMO;
      x.prestamo = { empleado, operador, linea, fecha: haceHoras(horas) };
      mov(horas, "Préstamo", codigo, `${operador} (#${empleado}) → ${linea}`, "almacen");
    };
    prestar("TQ-002", "10452", "Luis Hernández", "Línea 2", 2);
    prestar("TQ-007", "20871", "Ana Martínez", "Mantenimiento", 1);
    prestar("TQ-012", "33620", "Rosa Salinas", "Línea 6", 11);   // excede el turno

    const rep = buscarSeed("TQ-011");
    rep.estado = ESTADOS.REPARACION;
    rep.nota = "Mecanismo de clic no dispara. Enviada a mantenimiento.";
    mov(30, "Devolución", "TQ-011", "Recibida de Pedro Ruiz (#15530), Línea 5 — CON DAÑO: mecanismo de clic no dispara", "almacen");
    mov(30, "Reparación", "TQ-011", "Mecanismo de clic no dispara. Enviada a mantenimiento.", "almacen");

    prestar("TQ-013", "15530", "Pedro Ruiz", "Línea 5", 9);    // excede el turno

    movs.sort((a, b) => b.fecha.localeCompare(a.fecha));
    return { herramientas, movimientos: movs };
  }

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
    if (!u || !PERMISOS[u.rol][accion]) throw new Error("Tu rol no tiene permiso para esta acción.");
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

  cargar();

  return {
    ESTADOS, LINEAS, CATEGORIAS, DIAS_AVISO, HORAS_TURNO,
    listar, activas, buscar, movimientos, historial, indicadores, reporteUtilizacion,
    semaforo, excedeTurno, horasPrestada,
    altaHerramienta, prestar, devolver, devolverConDanio, enviarReparacion, reincorporar,
    darDeBaja, actualizarCalibracion,
    autenticar, permisos, restablecer, recargar, sumarDias,
  };
})();
