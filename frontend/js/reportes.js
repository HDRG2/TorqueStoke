/* =========================================================
   TorqueStock — Reportes ejecutivos y de auditoría
   (Jefe de almacén e Ingeniero de calidad, Secciones 1.2 y 8)
   ========================================================= */

const usuario = Sesion.exigir();
if (!usuario) throw new Error("Sin sesión activa");
await DB.listo;   // espera los datos de los archivos JSON (se carga como módulo)
if (!DB.permisos(usuario.rol).reportes) {
  window.location.replace("panel.html");
  throw new Error("Sin permiso para reportes");
}
const E = DB.ESTADOS;

$("nombreUsuario").textContent = usuario.nombre;
$("rolUsuario").textContent = NOMBRE_ROL[usuario.rol] || usuario.rol;
$("btnSalir").onclick = () => Sesion.cerrar();
$("fechaReporte").textContent = new Date().toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" });
$("usuarioReporte").textContent = `${usuario.nombre} (${usuario.rol})`;

// ---------- Resumen ----------
const k = DB.indicadores();
$("rTotal").textContent = k.total;
$("rDisp").textContent = k.disponibles;
$("rPrest").textContent = k.enPrestamo;
$("rVenc").textContent = k.vencidas;
$("rRep").textContent = k.enReparacion;
$("rExc").textContent = k.excedidas;

// ---------- Utilización (barras) ----------
function barras(id, datos, max = 8) {
  const top = datos.slice(0, max);
  const mayor = top.length ? top[0][1] : 1;
  $(id).innerHTML = top.length
    ? top.map(([nombre, n]) => `
        <li><span>${escapar(nombre)}</span><b>${n}</b>
          <span class="barra"><span style="width:${(n / mayor) * 100}%"></span></span></li>`).join("")
    : '<li class="vacio">Sin préstamos registrados.</li>';
}
const uso = DB.reporteUtilizacion();
barras("usoHerramienta", uso.porHerramienta.map(([c, n]) => {
  const h = DB.buscar(c);
  return [h ? `${c} · ${h.nombre}` : c, n];
}));
barras("usoLinea", uso.porLinea);
barras("usoOperador", uso.porOperador);

// ---------- Agenda de calibración ----------
const agenda = DB.activas()
  .filter((h) => DB.semaforo(h).color !== "verde")
  .sort((a, b) => a.proximaCalibracion.localeCompare(b.proximaCalibracion));
$("tablaAgenda").innerHTML = agenda.length
  ? agenda.map((h) => `<tr>
      <td class="m-cab"><span class="codigo">${escapar(h.codigo)}</span></td>
      <td class="m-nombre">${escapar(h.nombre)}</td>
      <td data-label="Calibración">${etiquetaSemaforo(h)}</td>
      <td data-label="Estado">${etiquetaEstado(h, false)}</td></tr>`).join("")
  : '<tr><td colspan="4" class="vacio">Todas las herramientas tienen calibración vigente.</td></tr>';

// ---------- Responsables pendientes ----------
const pendientes = DB.activas().filter((h) => DB.excedeTurno(h));
$("tablaResponsables").innerHTML = pendientes.length
  ? pendientes.map((h) => {
      const p = h.prestamo || {};
      const situacion = `<span class="etiqueta sem-rojo">Excede turno</span><span class="sub">Hace ${fmtDuracion(DB.horasPrestada(h))}</span>`;
      return `<tr>
        <td class="m-cab"><span class="codigo">${escapar(h.codigo)}</span><span class="sub">${escapar(h.nombre)}</span></td>
        <td data-label="Responsable">${escapar(p.operador || "—")}<span class="sub">#${escapar(p.empleado || "—")}</span></td>
        <td data-label="Línea">${escapar(p.linea || "—")}</td>
        <td data-label="Situación">${situacion}</td></tr>`;
    }).join("")
  : '<tr><td colspan="4" class="vacio">Todas las herramientas prestadas están dentro del turno.</td></tr>';

// ---------- Bitácora completa con filtros ----------
function movsFiltrados() {
  const texto = normalizar($("fTexto").value);
  const tipo = $("fTipo").value;
  const desde = $("fDesde").value;
  const hasta = $("fHasta").value;
  return DB.movimientos().filter((m) => {
    const dia = new Date(m.fecha);
    const diaISO = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, "0")}-${String(dia.getDate()).padStart(2, "0")}`;
    if (tipo && m.tipo !== tipo) return false;
    if (desde && diaISO < desde) return false;
    if (hasta && diaISO > hasta) return false;
    if (texto && !normalizar(`${m.codigo} ${m.tipo} ${m.detalle} ${m.usuario}`).includes(texto)) return false;
    return true;
  });
}

function pintarMovs() {
  const lista = movsFiltrados();
  $("contMovs").textContent = `${lista.length} movimiento${lista.length === 1 ? "" : "s"}`;
  $("tablaMovs").innerHTML = lista.length
    ? lista.map((m) => `<tr>
        <td class="m-titulo"><span class="codigo">${escapar(m.codigo)}</span> · <span class="mov-tipo mov-${m.tipo}">${m.tipo}</span></td>
        <td data-label="Fecha">${fmtFechaHora(m.fecha)}</td>
        <td class="solo-escritorio"><span class="codigo">${escapar(m.codigo)}</span></td>
        <td class="solo-escritorio"><span class="mov-tipo mov-${m.tipo}">${m.tipo}</span></td>
        <td data-label="Detalle">${escapar(m.detalle)}</td>
        <td data-label="Usuario">${escapar(m.usuario)}</td></tr>`).join("")
    : '<tr><td colspan="6" class="vacio">Sin movimientos con esos filtros.</td></tr>';
}
["fTexto", "fTipo", "fDesde", "fHasta"].forEach((id) => $(id).addEventListener("input", pintarMovs));
$("fLimpiar").onclick = () => { ["fTexto", "fTipo", "fDesde", "fHasta"].forEach((id) => ($(id).value = "")); pintarMovs(); };
pintarMovs();

// ---------- Exportaciones ----------
$("csvInventario").onclick = () => descargarCSV(`inventario_${fechaArchivo()}.csv`,
  ["Código", "Nombre", "Categoría", "Torque mín (Nm)", "Torque máx (Nm)", "Próx. calibración", "Semáforo", "Estado", "Operador", "No. empleado", "Línea", "Observación"],
  DB.listar().map((h) => {
    const p = h.prestamo || {};
    return [h.codigo, h.nombre, h.categoria, h.torqueMin, h.torqueMax, h.proximaCalibracion,
      DB.semaforo(h).texto, h.estado, p.operador || "", p.empleado || "", p.linea || "", h.nota || ""];
  }));

$("csvAgenda").onclick = () => descargarCSV(`agenda_calibracion_${fechaArchivo()}.csv`,
  ["Código", "Nombre", "Próx. calibración", "Días restantes", "Semáforo", "Estado"],
  agenda.map((h) => { const s = DB.semaforo(h); return [h.codigo, h.nombre, h.proximaCalibracion, s.dias, s.texto, h.estado]; }));

$("csvMovs").onclick = () => descargarCSV(`movimientos_${fechaArchivo()}.csv`,
  ["Fecha", "Código", "Movimiento", "Detalle", "Usuario"],
  movsFiltrados().map((m) => [fmtFechaHora(m.fecha), m.codigo, m.tipo, m.detalle, m.usuario]));

// Si otra pestaña cambia los datos, vuelve a armar el reporte con lo más reciente
// Otro equipo hizo un cambio: se vuelve a armar el reporte
window.addEventListener("torquestock:datos", () => window.location.reload());

if (dentroDeMarco) $("btnImprimir").classList.add("oculto");
$("btnImprimir").onclick = () => window.print();
