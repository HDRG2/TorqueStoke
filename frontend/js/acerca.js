/* =========================================================
   TorqueStock — Acerca del proyecto
   Sin sesión (desde el login) cualquiera puede consultar la
   ficha del proyecto. Ya dentro del sistema, solo el Jefe de
   almacén (permiso "acerca"). Se carga como módulo para poder
   esperar los permisos del servidor.
   ========================================================= */

const usuario = Sesion.actual();
if (usuario) {
  await DB.listo;
  if (!DB.permisos(usuario.rol).acerca) {
    window.location.replace("panel.html");
    throw new Error("Sin permiso para Acerca");
  }
  document.getElementById("btnVolver").href = "panel.html";
  document.querySelector("#btnVolver span").textContent = "Volver al panel";
}
document.body.hidden = false;
