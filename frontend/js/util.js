/* =========================================================
   TorqueStock — Utilidades compartidas de la interfaz
   ========================================================= */

const $ = (id) => document.getElementById(id);

const escapar = (t) => String(t ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Nombre del rol para mostrar en pantalla
const NOMBRE_ROL = { Administrador: "Jefe de almacén", Almacenista: "Almacenista", Calidad: "Ingeniero de calidad" };

// Texto para buscar: sin acentos, sin mayúsculas y con espacios simples ("Línea  2" → "linea 2")
const normalizar = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();

const fmtFecha =(iso) => { const [a, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${a}`; };
const fmtFechaHora = (iso) => new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });

function fmtDuracion(horas) {
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 24) return `${Math.floor(horas)} h ${Math.round((horas % 1) * 60)} min`;
  return `${Math.floor(horas / 24)} d ${Math.floor(horas % 24)} h`;
}

// Etiqueta de color del semáforo (RF-06)
function etiquetaSemaforo(h, conDetalle = true) {
  const s = DB.semaforo(h);
  const detalle = s.dias < 0 ? `hace ${-s.dias} d` : s.dias === 0 ? "hoy" : `en ${s.dias} d`;
  return `<span class="etiqueta sem-${s.color}">${s.texto}</span>` +
    (conDetalle ? `<span class="sub">${fmtFecha(h.proximaCalibracion)} (${detalle})</span>` : "");
}

// Etiqueta del estado de la herramienta
function etiquetaEstado(h, conDetalle = true) {
  const E = DB.ESTADOS;
  const clases = {
    [E.DISPONIBLE]: "est-disponible", [E.PRESTAMO]: "est-prestamo", [E.REPARACION]: "est-reparacion",
    [E.BAJA]: "est-baja",
  };
  let html = `<span class="etiqueta ${clases[h.estado] || ""}">${escapar(h.estado)}</span>`;
  if (!conDetalle) return html;
  if (h.estado === E.PRESTAMO) {
    const p = h.prestamo;
    const exc = DB.excedeTurno(h);
    html += `<span class="sub">${escapar(p.operador)} (#${escapar(p.empleado)}) · ${escapar(p.linea)}</span>
             <span class="sub ${exc ? "texto-rojo" : ""}">Hace ${fmtDuracion(DB.horasPrestada(h))}${exc ? " · EXCEDE TURNO" : ""}</span>`;
  } else if (h.nota) {
    html += `<span class="sub">${escapar(h.nota)}</span>`;
  }
  return html;
}

// Avisos flotantes
function avisar(texto, tipo = "") {
  const a = $("aviso");
  if (!a) return;
  a.textContent = texto;
  a.className = `aviso visible ${tipo}`;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => (a.className = "aviso"), 3500);
}

// Descarga de CSV (compatible con Excel: BOM UTF-8 y separador coma).
// En la versión publicada (claude.ai) usa la capacidad "downloads"; en la computadora, una descarga normal.
let _descargas;
function capacidadDescargas() {
  if (_descargas === undefined) {
    _descargas = (window.claude && typeof window.claude.use === "function")
      ? window.claude.use("downloads").catch(() => null)
      : Promise.resolve(null);
  }
  return _descargas;
}
async function descargarCSV(nombreArchivo, encabezados, filas) {
  const celda = (v) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const contenido = "\ufeff" + [encabezados, ...filas].map((f) => f.map(celda).join(",")).join("\r\n");

  const descargas = await capacidadDescargas();
  if (descargas) {
    try {
      await descargas.save({ filename: nombreArchivo, data: contenido });
      avisar(`Archivo ${nombreArchivo} listo.`, "ok");
    } catch (e) {
      if (e && e.code !== "declined") avisar("No se pudo descargar el archivo en esta vista.", "error");
    }
    return;
  }
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ¿La página corre dentro de otra (p. ej. publicada en claude.ai)? Ahí no se permite imprimir.
const dentroDeMarco = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

// Confirmación dentro de la página (los navegadores de celular y claude.ai bloquean window.confirm)
function confirmar(mensaje, textoBoton = "Confirmar") {
  return new Promise((resolver) => {
    const fondo = document.createElement("div");
    fondo.className = "modal-fondo abierto";
    fondo.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-cab"><h3>Confirmar</h3></div>
        <div class="modal-cuerpo"><p style="margin-top:0">${escapar(mensaje)}</p></div>
        <div class="modal-pie">
          <button type="button" class="btn btn-borde" data-r="no">Cancelar</button>
          <button type="button" class="btn btn-rojo" data-r="si">${escapar(textoBoton)}</button>
        </div>
      </div>`;
    const cerrar = (r) => { fondo.remove(); resolver(r); };
    fondo.addEventListener("click", (e) => {
      const b = e.target.closest("[data-r]");
      if (b) cerrar(b.dataset.r === "si");
      else if (e.target === fondo) cerrar(false);
    });
    document.body.appendChild(fondo);
    fondo.querySelector('[data-r="si"]').focus();
  });
}

const fechaArchivo = () => new Date().toISOString().slice(0, 10);
