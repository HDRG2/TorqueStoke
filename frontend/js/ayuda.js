/* =========================================================
   TorqueStock — Manual de usuario
   Muestra solo las secciones del rol de quien inició sesión.
   ========================================================= */

// Si hay sesión, "Volver" regresa al panel y se resalta el rol del usuario
const u = Sesion.actual();
if (u) {
  document.getElementById("btnVolver").href = "panel.html";
  document.querySelector("#btnVolver span").textContent = "Volver al panel";
  const fila = document.querySelector(`tr[data-rol="${u.rol}"]`);
  if (fila) fila.classList.add("mi-rol");
  if (u.rol === "Administrador") document.getElementById("lnkAcerca").hidden = false;
}

// ---------- Manual por rol (automático) ----------
// Cada sección tiene data-roles con los roles que la usan; se ocultan las que no son del rol.
// Rol: el de la sesión. Sin sesión, el de la dirección (?rol=Almacenista); si tampoco, el manual completo.
const NOMBRES = { Administrador: "Jefe de almacén", Almacenista: "Almacenista", Calidad: "Ingeniero de calidad" };
let rol = u ? u.rol : new URLSearchParams(location.search).get("rol");
if (!NOMBRES[rol]) rol = "";

if (rol) {
  document.querySelectorAll("[data-roles]").forEach((el) =>
    el.classList.toggle("oculto", !el.dataset.roles.split(" ").includes(rol)));

  // Numera de nuevo solo las secciones visibles (1, 2, 3… sin saltos)
  let n = 0;
  document.querySelectorAll(".manual-contenido section").forEach((s) => {
    if (s.classList.contains("oculto")) return;
    const h = s.querySelector("h2");
    h.textContent = `${++n}. ${h.textContent.replace(/^\d+\.\s*/, "")}`;
  });
}

const nombre = rol ? `del ${NOMBRES[rol]}` : "de usuario";
document.getElementById("subtituloManual").textContent = `Manual ${nombre}`;
document.getElementById("tituloImpresion").textContent = `TorqueStock — Manual ${nombre}`;
document.title = `TorqueStock — Manual ${nombre}`;

// Imprimir o guardar como PDF
document.getElementById("btnImprimirManual").addEventListener("click", () => window.print());
