/* =========================================================
   TorqueStock — Lógica de la interfaz del panel
   Se carga como módulo para poder esperar a que lleguen los
   datos de los archivos JSON antes de pintar la pantalla.
   ========================================================= */

const usuario = Sesion.exigir();
if (!usuario) throw new Error("Sin sesión activa");
await DB.listo;
const puede = DB.permisos(usuario.rol);
const E = DB.ESTADOS;

let filtroActual = "todas";
let codigoSeleccionado = null;
let accionMotivo = null;   // acción pendiente del modal de motivo

// ---------- Modales ----------
function abrirModal(id) {
  $(id).classList.add("abierto");
  const primero = $(id).querySelector("input, select, textarea");
  if (primero) setTimeout(() => primero.focus(), 50);
}
function cerrarModal(id) {
  const m = $(id);
  m.classList.remove("abierto");
  m.querySelectorAll(".invalido").forEach((el) => el.classList.remove("invalido"));
  m.querySelectorAll(".error-form").forEach((el) => (el.textContent = ""));
}
function cerrarModales() {
  document.querySelectorAll(".modal-fondo.abierto").forEach((m) => cerrarModal(m.id));
}

// Marca en rojo los campos vacíos (RNF-05)
function validarVacios(ids) {
  let ok = true;
  ids.forEach((id) => {
    const vacio = !String($(id).value).trim();
    $(id).classList.toggle("invalido", vacio);
    if (vacio) ok = false;
  });
  return ok;
}

const resumenHerr = (h) =>
  `<strong>${escapar(h.codigo)}</strong> · ${escapar(h.nombre)}<br>Rango: ${h.torqueMin} – ${h.torqueMax} Nm · ${etiquetaSemaforo(h, false)} ${etiquetaEstado(h, false)}`;

// ---------- Encabezado ----------
$("nombreUsuario").textContent = usuario.nombre;
$("rolUsuario").textContent = NOMBRE_ROL[usuario.rol] || usuario.rol;
$("btnSalir").onclick = () => Sesion.cerrar();
if (puede.alta) $("btnNueva").classList.remove("oculto");
if (puede.restablecer) $("btnRestablecer").classList.remove("oculto");
if (puede.reportes) $("lnkReportes").classList.remove("oculto");
if (puede.acerca) $("lnkAcerca").classList.remove("oculto");

$("altaCategoria").innerHTML = '<option value="">Selecciona…</option>' + DB.CATEGORIAS.map((c) => `<option>${c}</option>`).join("");
$("presLinea").innerHTML = '<option value="">Selecciona…</option>' + DB.LINEAS.map((l) => `<option>${l}</option>`).join("");

// ---------- RF-08: Dashboard ----------
function pintarIndicadores() {
  const k = DB.indicadores();
  $("kpiTotal").textContent = k.total;
  $("kpiDisp").textContent = k.disponibles;
  $("kpiPrest").textContent = k.enPrestamo;
  $("kpiVenc").textContent = k.vencidas;
  $("kpiRep").textContent = k.enReparacion;
  $("kpiExc").textContent = k.excedidas;

  const alerta = $("alertaTurno");
  if (k.excedidas > 0) {
    alerta.innerHTML = `<strong>⚠ ${k.excedidas} préstamo${k.excedidas > 1 ? "s" : ""} excede${k.excedidas > 1 ? "n" : ""} el turno de ${DB.HORAS_TURNO} h</strong> y no ha${k.excedidas > 1 ? "n" : ""} sido devuelto${k.excedidas > 1 ? "s" : ""}. Haz clic para revisarlo${k.excedidas > 1 ? "s" : ""}.`;
    alerta.classList.remove("oculto");
  } else {
    alerta.classList.add("oculto");
  }
}

function pintarBitacora() {
  const movs = DB.movimientos().slice(0, 40);
  $("bitacora").innerHTML = movs.length
    ? movs.map((m) => `
        <li>
          <span class="mov-tipo mov-${m.tipo}">${m.tipo}</span> · <span class="codigo">${escapar(m.codigo)}</span><br>
          ${escapar(m.detalle)}<br>
          <span class="mov-fecha">${fmtFechaHora(m.fecha)} · ${escapar(m.usuario)}</span>
        </li>`).join("")
    : '<li class="vacio">Sin movimientos registrados.</li>';
}

// ---------- RF-03 + RF-06: Tabla con buscador, filtros y semáforo ----------
function cumpleFiltro(h) {
  const s = DB.semaforo(h).color;
  if (filtroActual === "baja") return h.estado === E.BAJA;
  if (h.estado === E.BAJA) return false;   // las bajas solo aparecen en su filtro
  switch (filtroActual) {
    case "disponible": return h.estado === E.DISPONIBLE;
    case "prestamo":   return h.estado === E.PRESTAMO;
    case "excedida":   return DB.excedeTurno(h);
    case "porvencer":  return s === "amarillo";
    case "vencida":    return s === "rojo";
    case "reparacion": return h.estado === E.REPARACION;
    default:           return true;
  }
}

function cumpleBusqueda(h, texto) {
  if (!texto) return true;
  const p = h.prestamo || {};
  return normalizar([h.codigo, h.nombre, h.categoria, h.estado, h.nota, p.operador, p.empleado, p.linea]
    .filter(Boolean).join(" ")).includes(texto);
}

// Todas las acciones disponibles para la herramienta según su estado y el rol
function accionesDe(h) {
  const a = [];
  const vencida = DB.semaforo(h).color === "rojo";
  switch (h.estado) {
    case E.DISPONIBLE:
      if (puede.prestar) a.push({ id: "prestar", texto: "Prestar", clase: "btn-naranja", deshabilitada: vencida, titulo: vencida ? "Bloqueada: calibración vencida" : "" });
      if (puede.calibrar) a.push({ id: "calibrar", texto: "Calibración", clase: "btn-borde" });
      if (puede.reparar) a.push({ id: "reparar", texto: "Enviar a reparación", clase: "btn-borde" });
      if (puede.baja) a.push({ id: "baja", texto: "Dar de baja", clase: "btn-rojo-borde" });
      break;
    case E.PRESTAMO:
      if (puede.prestar) a.push({ id: "devolver", texto: "Devolver", clase: "btn-verde" });
      if (puede.prestar) a.push({ id: "danio", texto: "Devolver con daño", clase: "btn-borde" });
      if (puede.calibrar) a.push({ id: "calibrar", texto: "Calibración", clase: "btn-borde" });
      break;
    case E.REPARACION:
      if (puede.reincorporar) a.push({ id: "reincorporar", texto: "Reincorporar", clase: "btn-verde" });
      if (puede.calibrar) a.push({ id: "calibrar", texto: "Calibración", clase: "btn-borde" });
      if (puede.baja) a.push({ id: "baja", texto: "Dar de baja", clase: "btn-rojo-borde" });
      break;
  }
  return a;
}

const botonAccion = (h, acc, extra = "") =>
  `<button class="btn ${acc.clase} btn-sm" data-accion="${acc.id}" data-codigo="${escapar(h.codigo)}"
     ${acc.deshabilitada ? "disabled" : ""} ${acc.titulo ? `title="${escapar(acc.titulo)}"` : ""} ${extra}>${acc.texto}</button>`;

function botonesFila(h) {
  const acciones = accionesDe(h);
  const principal = acciones[0];
  return `<div class="acciones">
      ${principal ? botonAccion(h, principal) : ""}
      <button class="btn btn-borde btn-sm" data-accion="ficha" data-codigo="${escapar(h.codigo)}" title="Más acciones e historial">⋯ Ficha</button>
    </div>`;
}

function pintarTabla() {
  const texto = normalizar($("buscador").value);
  const lista = DB.listar().filter((h) => cumpleFiltro(h) && cumpleBusqueda(h, texto));

  $("tablaCuerpo").innerHTML = lista.length
    ? lista.map((h) => `
        <tr class="${DB.excedeTurno(h) ? "fila-alerta" : ""} ${h.estado === E.BAJA ? "fila-baja" : ""}">
          <td class="m-cab"><span class="codigo">${escapar(h.codigo)}</span></td>
          <td class="m-nombre">${escapar(h.nombre)}<span class="sub">${escapar(h.categoria)}</span></td>
          <td data-label="Rango (Nm)">${h.torqueMin} – ${h.torqueMax}</td>
          <td data-label="Calibración">${etiquetaSemaforo(h)}</td>
          <td data-label="Estado">${etiquetaEstado(h)}</td>
          <td class="m-acciones">${botonesFila(h)}</td>
        </tr>`).join("")
    : '<tr><td colspan="6" class="vacio">No se encontraron herramientas con ese criterio.</td></tr>';

  $("contadorRes").textContent = `Mostrando ${lista.length} de ${DB.activas().length} herramientas activas`;
}

function refrescar() {
  pintarIndicadores();
  pintarTabla();
  pintarBitacora();
  if ($("modalFicha").classList.contains("abierto") && codigoSeleccionado) pintarFicha(codigoSeleccionado);
}

function cambiarFiltro(f) {
  filtroActual = f;
  document.querySelectorAll(".filtro").forEach((b) => b.classList.toggle("activo", b.dataset.filtro === f));
  pintarTabla();
}

// ---------- Ficha de herramienta: acciones + historial (auditoría IATF 16949) ----------
function pintarFicha(codigo) {
  const h = DB.buscar(codigo);
  if (!h) return;
  $("fichaTitulo").textContent = `${h.codigo} · ${h.nombre}`;
  $("fichaDatos").innerHTML = `
    <div><span class="sub">Categoría</span>${escapar(h.categoria)}</div>
    <div><span class="sub">Rango de torque</span>${h.torqueMin} – ${h.torqueMax} Nm</div>
    <div><span class="sub">Calibración</span>${etiquetaSemaforo(h)}</div>
    <div><span class="sub">Estado</span>${etiquetaEstado(h)}</div>`;
  const acciones = accionesDe(h);
  $("fichaAcciones").innerHTML = acciones.length
    ? acciones.map((a) => botonAccion(h, a)).join("")
    : '<span class="sub">No hay acciones disponibles para tu rol en este estado.</span>';
  const hist = DB.historial(codigo);
  $("fichaHistorial").innerHTML = hist.length
    ? hist.map((m) => `<tr>
        <td data-label="Fecha">${fmtFechaHora(m.fecha)}</td>
        <td data-label="Movimiento"><span class="mov-tipo mov-${m.tipo}">${m.tipo}</span></td>
        <td data-label="Detalle">${escapar(m.detalle)}</td>
        <td data-label="Usuario">${escapar(m.usuario)}</td></tr>`).join("")
    : '<tr><td colspan="4" class="vacio">Sin movimientos.</td></tr>';
}

$("btnExportFicha").onclick = () => {
  const h = DB.buscar(codigoSeleccionado);
  if (!h) return;
  descargarCSV(`historial_${h.codigo}_${fechaArchivo()}.csv`,
    ["Fecha", "Código", "Movimiento", "Detalle", "Usuario"],
    DB.historial(h.codigo).map((m) => [fmtFechaHora(m.fecha), m.codigo, m.tipo, m.detalle, m.usuario]));
};

// ---------- Acciones ----------
// Evita mandar dos veces la misma acción con doble clic mientras responde el servidor
let ocupado = false;
async function unaVez(fn) {
  if (ocupado) return;
  ocupado = true;
  try { await fn(); } finally { ocupado = false; }
}

function ejecutarDirecto(fn, mensaje) {
  return unaVez(async () => {
    try {
      await fn();
      avisar(mensaje, "ok");
    } catch (err) { avisar(err.message, "error"); }
    refrescar();
  });
}

// Configuración de las acciones que piden motivo u observación
const ACCIONES_MOTIVO = {
  danio: {
    titulo: "Devolución con daño", etiqueta: "Daño encontrado en la inspección", boton: "Registrar y enviar a reparación",
    placeholder: "Ej. mecanismo de clic no dispara, golpe en el cabezal…",
    fn: (c, t) => DB.devolverConDanio(c, t, usuario.usuario), ok: (c) => `${c} recibida y enviada a reparación.`,
  },
  reparar: {
    titulo: "Enviar a reparación", etiqueta: "Motivo / proveedor de reparación", boton: "Enviar a reparación",
    placeholder: "Ej. ajuste de mecanismo en taller externo…",
    fn: (c, t) => DB.enviarReparacion(c, t, usuario.usuario), ok: (c) => `${c} enviada a reparación.`,
  },
  baja: {
    titulo: "Baja definitiva", etiqueta: "Motivo de la baja", boton: "Dar de baja",
    placeholder: "Ej. daño irreparable, fuera de tolerancia…",
    fn: (c, t) => DB.darDeBaja(c, t, usuario.usuario), ok: (c) => `${c} dada de baja.`,
  },
};

function iniciarAccion(accion, codigo) {
  const h = DB.buscar(codigo);
  if (!h) return;
  codigoSeleccionado = h.codigo;

  if (accion === "ficha") { pintarFicha(h.codigo); abrirModal("modalFicha"); return; }

  if (accion === "prestar") {
    cerrarModal("modalFicha");
    $("prestamoResumen").innerHTML = resumenHerr(h);
    $("formPrestamo").reset();
    abrirModal("modalPrestamo");
    return;
  }
  // RF-05: devolución en un solo clic
  if (accion === "devolver")
    return ejecutarDirecto(() => DB.devolver(h.codigo, usuario.usuario), `${h.codigo} devuelta y disponible.`);

  if (accion === "reincorporar")
    return ejecutarDirecto(() => DB.reincorporar(h.codigo, usuario.usuario), `${h.codigo} reincorporada: disponible.`);

  if (accion === "calibrar") {
    cerrarModal("modalFicha");
    $("calibResumen").innerHTML = resumenHerr(h) + `<br>Vigencia actual: ${fmtFecha(h.proximaCalibracion)}`;
    $("formCalib").reset();
    $("calibFecha").value = DB.sumarDias(180);   // sugerencia: 6 meses
    abrirModal("modalCalib");
    return;
  }

  const cfg = ACCIONES_MOTIVO[accion];
  if (cfg) {
    accionMotivo = accion;
    cerrarModal("modalFicha");
    $("motivoTitulo").textContent = cfg.titulo;
    $("motivoEtiqueta").textContent = cfg.etiqueta;
    $("motivoConfirmar").textContent = cfg.boton;
    $("motivoConfirmar").className = `btn ${accion === "baja" ? "btn-rojo" : "btn-primario"}`;
    $("motivoTexto").placeholder = cfg.placeholder;
    $("motivoResumen").innerHTML = resumenHerr(h);
    $("formMotivo").reset();
    abrirModal("modalMotivo");
  }
}

// ---------- Eventos ----------
$("buscador").addEventListener("input", pintarTabla);
document.querySelectorAll(".filtro").forEach((b) => (b.onclick = () => cambiarFiltro(b.dataset.filtro)));
document.querySelectorAll(".kpi").forEach((k) => (k.onclick = () => cambiarFiltro(k.dataset.filtro)));
$("alertaTurno").onclick = () => cambiarFiltro("excedida");
$("alertaTurno").onkeydown = (e) => { if (e.key === "Enter") cambiarFiltro("excedida"); };

document.querySelectorAll("[data-cerrar]").forEach((b) =>
  (b.onclick = () => cerrarModal(b.closest(".modal-fondo").id)));
document.querySelectorAll(".modal-fondo").forEach((m) =>
  m.addEventListener("mousedown", (e) => { if (e.target === m) cerrarModal(m.id); }));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarModales(); });

// Delegación de eventos para los botones de la tabla y de la ficha
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-accion]");
  if (!btn || btn.disabled) return;
  iniciarAccion(btn.dataset.accion, btn.dataset.codigo);
});

// RF-02: alta de herramienta
$("btnNueva").onclick = () => { $("formAlta").reset(); abrirModal("modalAlta"); };
$("formAlta").addEventListener("submit", (e) => {
  e.preventDefault();
  const ids = ["altaCodigo", "altaCategoria", "altaNombre", "altaMin", "altaMax", "altaFecha"];
  if (!validarVacios(ids)) { $("errorAlta").textContent = "Completa todos los campos marcados."; return; }
  unaVez(async () => { try {
    const h = await DB.altaHerramienta({
      codigo: $("altaCodigo").value, categoria: $("altaCategoria").value, nombre: $("altaNombre").value,
      torqueMin: $("altaMin").value, torqueMax: $("altaMax").value, proximaCalibracion: $("altaFecha").value,
    }, usuario.usuario);
    cerrarModal("modalAlta");
    avisar(`Herramienta ${h.codigo} registrada.`, "ok");
    refrescar();
  } catch (err) { $("errorAlta").textContent = err.message; } });
});

// RF-04: préstamo — el número de empleado solo acepta dígitos
$("presEmpleado").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, ""); });
$("formPrestamo").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!validarVacios(["presEmpleado", "presLinea", "presOperador"])) {
    $("errorPrestamo").textContent = "Captura número de empleado, línea y nombre."; return;
  }
  unaVez(async () => { try {
    await DB.prestar(codigoSeleccionado, {
      empleado: $("presEmpleado").value, operador: $("presOperador").value, linea: $("presLinea").value,
    }, usuario.usuario);
    cerrarModal("modalPrestamo");
    avisar(`${codigoSeleccionado} prestada correctamente.`, "ok");
    refrescar();
  } catch (err) { $("errorPrestamo").textContent = err.message; } });
});

// RF-07: actualizar calibración
$("formCalib").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!validarVacios(["calibFecha"])) { $("errorCalib").textContent = "Selecciona una fecha."; return; }
  unaVez(async () => { try {
    await DB.actualizarCalibracion(codigoSeleccionado, $("calibFecha").value, usuario.usuario);
    cerrarModal("modalCalib");
    avisar(`Calibración de ${codigoSeleccionado} actualizada.`, "ok");
    refrescar();
  } catch (err) { $("errorCalib").textContent = err.message; } });
});

// Acciones con motivo (daño, reparación, baja)
$("formMotivo").addEventListener("submit", (e) => {
  e.preventDefault();
  const cfg = ACCIONES_MOTIVO[accionMotivo];
  if (!cfg) return;
  if (!validarVacios(["motivoTexto"])) { $("errorMotivo").textContent = "Este campo es obligatorio."; return; }
  unaVez(async () => { try {
    await cfg.fn(codigoSeleccionado, $("motivoTexto").value);
    cerrarModal("modalMotivo");
    avisar(cfg.ok(codigoSeleccionado), "ok");
    refrescar();
  } catch (err) { $("errorMotivo").textContent = err.message; } });
});

$("btnRestablecer").onclick = async () => {
  if (await confirmar("¿Restablecer todos los datos a los de ejemplo? Se perderán los cambios.", "Restablecer")) {
    try { await DB.restablecer(usuario.usuario); } catch (err) { avisar(err.message, "error"); return; }
    avisar("Datos de demostración restablecidos.");
    refrescar();
  }
};

// Si otra pestaña cambia los datos, se muestran aquí al momento
window.addEventListener("storage", (e) => {
  if (e.key && !e.key.startsWith("torquestock_db")) return;
  DB.recargar();
  refrescar();
});
// Modo servidor: otro equipo hizo un cambio (préstamo, devolución…)
window.addEventListener("torquestock:datos", () => {
  refrescar();
  if ($("modalFicha").classList.contains("abierto") && DB.buscar(codigoSeleccionado)) pintarFicha(codigoSeleccionado);
});

refrescar();
// Actualiza tiempos de préstamo y alertas de turno cada minuto
setInterval(refrescar, 60000);
