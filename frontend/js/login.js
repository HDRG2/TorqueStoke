/* =========================================================
   TorqueStock — Inicio de sesión (RF-01)
   Usuario y contraseña: máximo 15 caracteres, solo letras y
   números. El servidor revisa la contraseña y abre la sesión.
   ========================================================= */

// Si ya hay sesión activa, entra directo al panel
if (Sesion.actual()) window.location.replace("panel.html");

const MAX = 15;
const VALIDO = /^[A-Za-z0-9]+$/;          // solo letras y números
const NO_PERMITIDOS = /[^A-Za-z0-9]/g;

const usuario = document.getElementById("usuario");
const clave = document.getElementById("clave");
const error = document.getElementById("errorLogin");

// Filtra en vivo: quita caracteres especiales y corta a 15
function filtrar(input, contador) {
  const original = input.value;
  const limpio = original.replace(NO_PERMITIDOS, "").slice(0, MAX);
  if (limpio !== original) {
    input.value = limpio;
    error.textContent = "Solo se permiten letras y números (sin espacios, acentos ni símbolos).";
  } else if (error.textContent.startsWith("Solo se permiten")) {
    error.textContent = "";
  }
  input.classList.remove("invalido");
  document.getElementById(contador).textContent = `${input.value.length}/${MAX}`;
}
usuario.addEventListener("input", () => filtrar(usuario, "contUsuario"));
clave.addEventListener("input", () => filtrar(clave, "contClave"));

// Devuelve el mensaje de error del campo, o "" si es válido (RNF-05)
function validarCampo(input, nombre) {
  const v = input.value;
  let msg = "";
  if (!v) msg = `Ingresa ${nombre}.`;
  else if (v.length > MAX) msg = `El campo ${nombre} no puede tener más de ${MAX} caracteres.`;
  else if (!VALIDO.test(v)) msg = `El campo ${nombre} solo puede tener letras y números.`;
  input.classList.toggle("invalido", !!msg);
  return msg;
}

// Enter en "Usuario": si es válido pasa a "Contraseña"; si no, muestra el error y se queda ahí.
// Enter en "Contraseña" envía el formulario (comportamiento normal) y se valida abajo.
usuario.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const msg = validarCampo(usuario, "usuario");
  if (msg) {
    error.textContent = msg;
    usuario.focus();
    return;
  }
  error.textContent = "";
  clave.focus();
});

// Confirma que la página está conectada al servidor del almacén
DB.listo.then(() => {
  const modo = document.getElementById("loginModo");
  modo.className = "login-modo conectado";
  modo.textContent = "Conectado al servidor del almacén";
  modo.hidden = false;
}).catch(() => { /* sin servidor: ya se muestra el aviso */ });

document.getElementById("formLogin").addEventListener("submit", async (e) => {
  e.preventDefault();
  try { await DB.listo; } catch (err) { return; }   // sin servidor: ya se muestra el aviso

  const msgUsuario = validarCampo(usuario, "usuario");
  const msgClave = validarCampo(clave, "contraseña");
  if (msgUsuario || msgClave) {
    error.textContent = msgUsuario || msgClave;
    (msgUsuario ? usuario : clave).focus();   // regresa al campo con error
    return;
  }

  const boton = e.submitter || document.querySelector("#formLogin button[type=submit]");
  boton.disabled = true;
  boton.textContent = "Verificando…";
  // Deja que se vea el mensaje. Si el navegador pausa el dibujado (pestaña en segundo plano),
  // el temporizador de respaldo sigue de todos modos para que el login nunca se quede atorado.
  await new Promise((r) => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 100); });
  let u;
  try { u = await DB.autenticar(usuario.value, clave.value); }
  catch (err) { error.textContent = err.message; }   // p. ej. sin conexión con el servidor
  boton.disabled = false;
  boton.textContent = "Iniciar sesión";
  if (u === undefined) return;
  if (!u) {
    error.textContent = "Usuario o contraseña incorrectos.";
    clave.value = "";
    clave.focus();
    return;
  }
  Sesion.iniciar(u);
  window.location.href = "panel.html";
});
