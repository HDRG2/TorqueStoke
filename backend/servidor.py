"""
TorqueStock - Servidor del almacén (backend real)

Corre en una computadora del almacén y las tablets y computadoras de la
planta se conectan a ella por la red local. No necesita internet ni
instalar nada: solo usa lo que ya trae Python (http.server, sqlite3,
hashlib).

  - Entrega la página (carpeta frontend/) y los catálogos (backend/data/).
  - Guarda herramientas y movimientos en una base de datos SQLite
    (backend/torquestock.db), compartida por todos los equipos.
  - Revisa contraseñas (PBKDF2-SHA256) y permisos por rol en el
    servidor: aunque alguien modifique la página, no puede saltárselos.

Uso:  python backend/servidor.py   (o doble clic en "Iniciar servidor.bat")
"""

import hashlib
import hmac
import json
import mimetypes
import posixpath
import re
import secrets
import socket
import sqlite3
import sys
import threading
import time
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
BACKEND = Path(__file__).resolve().parent
RAIZ = BACKEND.parent
DATOS = BACKEND / "data"
BASE = BACKEND / "torquestock.db"
HORAS_SESION = 12
MAX_MOVIMIENTOS = 2000

DISPONIBLE, PRESTAMO, REPARACION, BAJA = "Disponible", "En préstamo", "En reparación", "Baja"

# Qué permiso pide cada acción (los permisos por rol están en usuarios.json)
PERMISO_DE = {
    "alta": "alta", "prestar": "prestar", "devolver": "prestar", "devolverConDanio": "prestar",
    "reparar": "reparar", "reincorporar": "reincorporar", "baja": "baja", "calibrar": "calibrar",
    "restablecer": "restablecer",
}

candado = threading.Lock()   # una acción a la vez: dos equipos no pueden prestar la misma herramienta


class ErrorRegla(Exception):
    """Error que se le muestra al usuario tal cual (validaciones y reglas de negocio)."""
    def __init__(self, mensaje, codigo_http=400):
        super().__init__(mensaje)
        self.codigo_http = codigo_http


# ---------------------------------------------------------------- utilidades
def leer_json(nombre):
    with open(DATOS / nombre, encoding="utf-8-sig") as f:
        return json.load(f)

def ahora_iso(horas_atras=0):
    t = datetime.now(timezone.utc) - timedelta(hours=horas_atras)
    return t.isoformat(timespec="milliseconds").replace("+00:00", "Z")

def sumar_dias(n):
    return (date.today() + timedelta(days=n)).isoformat()

def numero(x):
    return int(x) if float(x).is_integer() else x

def leer_fecha(texto):
    try:
        return date.fromisoformat(str(texto))
    except ValueError:
        raise ErrorRegla("La fecha no es válida.")

def texto(valor, campo, maximo=200):
    v = str(valor or "").strip()
    if not v:
        raise ErrorRegla(f"Escribe {campo}.")
    if len(v) > maximo:
        raise ErrorRegla(f"El texto de {campo} es demasiado largo (máx. {maximo}).")
    return v


# ---------------------------------------------------------------- base de datos
@contextmanager
def conectar():
    """Abre la base, guarda los cambios si todo salió bien (o los deshace si hubo error) y la cierra."""
    con = sqlite3.connect(BASE, timeout=10)
    con.row_factory = sqlite3.Row
    try:
        with con:
            yield con
    finally:
        con.close()

def crear_tablas():
    with conectar() as con:
        con.executescript("""
            CREATE TABLE IF NOT EXISTS herramientas (
                codigo TEXT PRIMARY KEY, nombre TEXT NOT NULL, categoria TEXT NOT NULL,
                torque_min REAL NOT NULL, torque_max REAL NOT NULL, proxima_calibracion TEXT NOT NULL,
                estado TEXT NOT NULL, nota TEXT NOT NULL DEFAULT '',
                prestamo_empleado TEXT, prestamo_operador TEXT, prestamo_linea TEXT, prestamo_fecha TEXT);
            CREATE TABLE IF NOT EXISTS movimientos (
                id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, tipo TEXT NOT NULL,
                codigo TEXT NOT NULL, detalle TEXT NOT NULL, usuario TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS idx_mov_fecha ON movimientos (fecha);
            CREATE TABLE IF NOT EXISTS sesiones (
                token TEXT PRIMARY KEY, usuario TEXT NOT NULL, expira REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS meta (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
        """)
        if con.execute("SELECT COUNT(*) FROM herramientas").fetchone()[0] == 0:
            cargar_demo(con)

def subir_version(con):
    con.execute("INSERT INTO meta VALUES ('version', '1') "
                "ON CONFLICT(clave) DO UPDATE SET valor = CAST(valor AS INTEGER) + 1")

def version(con):
    fila = con.execute("SELECT valor FROM meta WHERE clave = 'version'").fetchone()
    return int(fila[0]) if fila else 0

def movimiento(con, tipo, codigo, detalle, usuario, fecha=None):
    con.execute("INSERT INTO movimientos (fecha, tipo, codigo, detalle, usuario) VALUES (?, ?, ?, ?, ?)",
                (fecha or ahora_iso(), tipo, codigo, detalle, usuario))

def cargar_demo(con):
    """Llena la base con el inventario y el historial de ejemplo (fechas relativas a hoy)."""
    con.execute("DELETE FROM herramientas")
    con.execute("DELETE FROM movimientos")
    for h in leer_json("herramientas.json"):
        con.execute("INSERT INTO herramientas (codigo, nombre, categoria, torque_min, torque_max, "
                    "proxima_calibracion, estado) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (h["codigo"], h["nombre"], h["categoria"], h["torqueMin"], h["torqueMax"],
                     sumar_dias(h["diasParaCalibracion"]), DISPONIBLE))
    demo = leer_json("historial-demo.json")
    movs = []
    for p in demo.get("prestamosPasados", []):
        movs.append((p["horasAtras"], "Préstamo", p["codigo"], f'{p["operador"]} (#{p["empleado"]}) → {p["linea"]}', "almacen"))
        movs.append((p["horasAtras"] - p["horasPrestada"], "Devolución", p["codigo"],
                     f'Recibida de {p["operador"]} (#{p["empleado"]}), {p["linea"]}', "almacen"))
    for r in demo.get("recalibraciones", []):
        movs.append((r["horasAtras"], "Recalibración", r["codigo"],
                     f'Vigencia {sumar_dias(r["vigenciaAnteriorDias"])} → {sumar_dias(r["vigenciaNuevaDias"])}', "calidad"))
    for p in demo.get("prestamosActivos", []):
        con.execute("UPDATE herramientas SET estado = ?, prestamo_empleado = ?, prestamo_operador = ?, "
                    "prestamo_linea = ?, prestamo_fecha = ? WHERE codigo = ?",
                    (PRESTAMO, p["empleado"], p["operador"], p["linea"], ahora_iso(p["horasAtras"]), p["codigo"]))
        movs.append((p["horasAtras"], "Préstamo", p["codigo"], f'{p["operador"]} (#{p["empleado"]}) → {p["linea"]}', "almacen"))
    for r in demo.get("reparaciones", []):
        con.execute("UPDATE herramientas SET estado = ?, nota = ? WHERE codigo = ?", (REPARACION, r["nota"], r["codigo"]))
        movs.append((r["horasAtras"], "Devolución", r["codigo"],
                     f'Recibida de {r["operador"]} (#{r["empleado"]}), {r["linea"]} — CON DAÑO: {r["danio"]}', "almacen"))
        movs.append((r["horasAtras"], "Reparación", r["codigo"], r["nota"], "almacen"))
    # Del más viejo al más nuevo (sort estable: con la misma hora, se respeta el orden de arriba)
    for horas, tipo, codigo, detalle, usuario in sorted(movs, key=lambda m: -m[0]):
        movimiento(con, tipo, codigo, detalle, usuario, ahora_iso(horas))
    subir_version(con)

def herramienta_json(f):
    prestamo = None
    if f["prestamo_fecha"]:
        prestamo = {"empleado": f["prestamo_empleado"], "operador": f["prestamo_operador"],
                    "linea": f["prestamo_linea"], "fecha": f["prestamo_fecha"]}
    return {"codigo": f["codigo"], "nombre": f["nombre"], "categoria": f["categoria"],
            "torqueMin": numero(f["torque_min"]), "torqueMax": numero(f["torque_max"]),
            "proximaCalibracion": f["proxima_calibracion"], "estado": f["estado"],
            "prestamo": prestamo, "nota": f["nota"]}

def estado_completo(con):
    herramientas = [herramienta_json(f) for f in con.execute("SELECT * FROM herramientas ORDER BY rowid")]
    movimientos = [dict(f) for f in con.execute(
        "SELECT fecha, tipo, codigo, detalle, usuario FROM movimientos ORDER BY fecha DESC, id DESC LIMIT ?",
        (MAX_MOVIMIENTOS,))]
    return {"version": version(con), "herramientas": herramientas, "movimientos": movimientos}


# ---------------------------------------------------------------- usuarios y sesiones
def buscar_usuario(nombre):
    datos = leer_json("usuarios.json")   # se lee cada vez: lo que agregue "Registrar usuario.bat" sirve al momento
    u = next((x for x in datos["usuarios"] if x["usuario"] == nombre), None)
    return u, datos

def autenticar(usuario, clave):
    u, datos = buscar_usuario(str(usuario or "").strip().lower())
    iteraciones = datos.get("seguridad", {}).get("iteraciones", 100000)
    # Si el usuario no existe se cifra igual: tarda lo mismo y no revela qué usuarios existen
    sal = bytes.fromhex(u["sal"]) if u else bytes(16)
    calculado = hashlib.pbkdf2_hmac("sha256", str(clave or "").encode(), sal, iteraciones).hex()
    if not u or not hmac.compare_digest(calculado, u.get("hash", "")):
        return None
    token = secrets.token_urlsafe(32)
    with candado, conectar() as con:
        con.execute("DELETE FROM sesiones WHERE expira < ?", (time.time(),))
        con.execute("INSERT INTO sesiones VALUES (?, ?, ?)", (token, u["usuario"], time.time() + HORAS_SESION * 3600))
    return {"usuario": u["usuario"], "nombre": u["nombre"], "rol": u["rol"], "token": token}

def usuario_de_token(token):
    if not token:
        return None
    with conectar() as con:
        fila = con.execute("SELECT usuario FROM sesiones WHERE token = ? AND expira > ?", (token, time.time())).fetchone()
    if not fila:
        return None
    u, datos = buscar_usuario(fila["usuario"])   # el rol se toma del archivo actual
    if not u:
        return None
    return {"usuario": u["usuario"], "nombre": u["nombre"], "rol": u["rol"],
            "permisos": datos["permisos"].get(u["rol"], {})}


# ---------------------------------------------------------------- reglas de negocio
def semaforo(proxima):
    dias = (date.fromisoformat(proxima) - date.today()).days
    if dias < 0:
        return "rojo"
    return "amarillo" if dias <= leer_json("catalogos.json").get("diasAviso", 15) else "verde"

def obtener(con, codigo):
    f = con.execute("SELECT * FROM herramientas WHERE codigo = ?", (str(codigo or ""),)).fetchone()
    if not f:
        raise ErrorRegla("Herramienta no encontrada.", 404)
    return f

def exigir_estado(f, *permitidos):
    if f["estado"] not in permitidos:
        raise ErrorRegla(f'Acción no permitida: la herramienta está "{f["estado"]}".')

def ejecutar(con, accion, codigo, datos, quien):
    datos = datos if isinstance(datos, dict) else {}
    catalogos = leer_json("catalogos.json")

    if accion == "restablecer":
        cargar_demo(con)
        return None

    if accion == "alta":
        codigo = str(datos.get("codigo") or "").strip().upper()
        nombre = texto(datos.get("nombre"), "el nombre", 80)
        categoria = datos.get("categoria")
        if not codigo or not categoria or datos.get("torqueMin") in ("", None) \
                or datos.get("torqueMax") in ("", None) or not datos.get("proximaCalibracion"):
            raise ErrorRegla("Todos los campos son obligatorios.")
        if not re.fullmatch(r"[A-Z0-9-]{2,15}", codigo):
            raise ErrorRegla("El código solo admite letras, números y guion (máx. 15).")
        if con.execute("SELECT 1 FROM herramientas WHERE codigo = ?", (codigo,)).fetchone():
            raise ErrorRegla(f"Ya existe una herramienta con el código {codigo}.")
        if categoria not in catalogos["categorias"]:
            raise ErrorRegla("Categoría no válida.")
        try:
            minimo, maximo = float(datos["torqueMin"]), float(datos["torqueMax"])
        except (TypeError, ValueError):
            raise ErrorRegla("El rango de torque debe ser numérico y positivo.")
        if minimo < 0 or maximo <= 0:
            raise ErrorRegla("El rango de torque debe ser numérico y positivo.")
        if minimo >= maximo:
            raise ErrorRegla("El torque mínimo debe ser menor que el máximo.")
        fecha = leer_fecha(datos["proximaCalibracion"]).isoformat()
        con.execute("INSERT INTO herramientas (codigo, nombre, categoria, torque_min, torque_max, "
                    "proxima_calibracion, estado) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (codigo, nombre, categoria, minimo, maximo, fecha, DISPONIBLE))
        movimiento(con, "Alta", codigo, f"{nombre} ({numero(minimo)}-{numero(maximo)} Nm)", quien)
        return codigo

    f = obtener(con, codigo)
    codigo = f["codigo"]

    if accion == "prestar":   # RF-04 con el bloqueo de RF-06
        if f["estado"] != DISPONIBLE:
            raise ErrorRegla("La herramienta no está disponible.")
        if semaforo(f["proxima_calibracion"]) == "rojo":
            raise ErrorRegla("BLOQUEADO: la calibración está vencida. No se puede prestar (IATF 16949 / ISO 6789).")
        empleado = str(datos.get("empleado") or "").strip()
        operador = str(datos.get("operador") or "").strip()
        linea = datos.get("linea")
        if not empleado or not operador or not linea:
            raise ErrorRegla("Captura número de empleado, nombre y línea.")
        if not re.fullmatch(r"\d{1,10}", empleado):
            raise ErrorRegla("El número de empleado solo admite dígitos.")
        operador = texto(operador, "el nombre del operador", 60)
        if linea not in catalogos["lineas"]:
            raise ErrorRegla("Línea no válida.")
        con.execute("UPDATE herramientas SET estado = ?, prestamo_empleado = ?, prestamo_operador = ?, "
                    "prestamo_linea = ?, prestamo_fecha = ? WHERE codigo = ?",
                    (PRESTAMO, empleado, operador, linea, ahora_iso(), codigo))
        movimiento(con, "Préstamo", codigo, f"{operador} (#{empleado}) → {linea}", quien)

    elif accion in ("devolver", "devolverConDanio"):   # RF-05
        exigir_estado(f, PRESTAMO)
        recibida = f'Recibida de {f["prestamo_operador"]} (#{f["prestamo_empleado"]}), {f["prestamo_linea"]}'
        if accion == "devolver":
            con.execute("UPDATE herramientas SET estado = ?, prestamo_empleado = NULL, prestamo_operador = NULL, "
                        "prestamo_linea = NULL, prestamo_fecha = NULL WHERE codigo = ?", (DISPONIBLE, codigo))
            movimiento(con, "Devolución", codigo, recibida, quien)
        else:
            obs = texto(datos.get("texto"), "el daño encontrado")
            con.execute("UPDATE herramientas SET estado = ?, nota = ?, prestamo_empleado = NULL, prestamo_operador = NULL, "
                        "prestamo_linea = NULL, prestamo_fecha = NULL WHERE codigo = ?", (REPARACION, obs, codigo))
            movimiento(con, "Devolución", codigo, f"{recibida} — CON DAÑO: {obs}", quien)
            movimiento(con, "Reparación", codigo, obs, quien)

    elif accion == "reparar":
        exigir_estado(f, DISPONIBLE)
        motivo = texto(datos.get("texto"), "el motivo")
        con.execute("UPDATE herramientas SET estado = ?, nota = ? WHERE codigo = ?", (REPARACION, motivo, codigo))
        movimiento(con, "Reparación", codigo, motivo, quien)

    elif accion == "reincorporar":
        exigir_estado(f, REPARACION)
        con.execute("UPDATE herramientas SET estado = ?, nota = '' WHERE codigo = ?", (DISPONIBLE, codigo))
        movimiento(con, "Reincorporación", codigo, "Reparada y reincorporada al servicio", quien)

    elif accion == "baja":
        exigir_estado(f, DISPONIBLE, REPARACION)
        motivo = texto(datos.get("texto"), "el motivo de la baja")
        con.execute("UPDATE herramientas SET estado = ?, nota = ? WHERE codigo = ?", (BAJA, motivo, codigo))
        movimiento(con, "Baja", codigo, motivo, quien)

    elif accion == "calibrar":   # RF-07
        if f["estado"] == BAJA:
            raise ErrorRegla("La herramienta está dada de baja.")
        if not datos.get("fecha"):
            raise ErrorRegla("Selecciona la nueva fecha de calibración.")
        nueva = leer_fecha(datos["fecha"])
        if nueva <= date.today():
            raise ErrorRegla("La nueva fecha debe ser posterior a hoy.")
        con.execute("UPDATE herramientas SET proxima_calibracion = ? WHERE codigo = ?", (nueva.isoformat(), codigo))
        movimiento(con, "Recalibración", codigo, f'Vigencia {f["proxima_calibracion"]} → {nueva.isoformat()}', quien)

    return codigo


# ---------------------------------------------------------------- servidor HTTP
DATOS_PUBLICOS = {"catalogos.json", "herramientas.json", "historial-demo.json", "usuarios.json"}

def permitido(ruta):
    """Solo se entregan la página y los catálogos; nunca la base de datos ni los scripts del servidor."""
    return (ruta in ("/", "/index.html") or ruta.startswith("/frontend/")
            or (ruta.startswith("/backend/data/") and posixpath.basename(ruta) in DATOS_PUBLICOS))


class Manejador(SimpleHTTPRequestHandler):
    server_version = "TorqueStock"
    sys_version = ""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(RAIZ), **kwargs)

    def log_message(self, formato, *args):
        pass   # sin una línea por cada archivo; las acciones se anotan aparte

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    # ----- respuestas
    def responder_json(self, datos, codigo=200):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def leer_cuerpo(self):
        largo = int(self.headers.get("Content-Length") or 0)
        if largo > 100_000:
            raise ErrorRegla("Solicitud demasiado grande.", 413)
        try:
            return json.loads(self.rfile.read(largo) or b"{}")
        except ValueError:
            raise ErrorRegla("Solicitud no válida.")

    def sesion(self):
        token = (self.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
        u = usuario_de_token(token)
        if not u:
            raise ErrorRegla("Tu sesión terminó. Vuelve a iniciar sesión.", 401)
        return u, token

    # ----- archivos
    def do_GET(self):
        ruta = posixpath.normpath(unquote(urlsplit(self.path).path))
        try:
            if ruta.startswith("/api/"):
                return self.api_get(ruta)
        except ErrorRegla as e:
            return self.responder_json({"error": str(e)}, e.codigo_http)
        if ruta == "/backend/data/usuarios.json":
            return self.usuarios_sin_claves()
        if not permitido(ruta):
            return self.send_error(404, "No encontrado")
        return super().do_GET()

    def do_HEAD(self):
        ruta = posixpath.normpath(unquote(urlsplit(self.path).path))
        if not permitido(ruta) or ruta.startswith("/api/") or ruta.endswith("usuarios.json"):
            return self.send_error(404, "No encontrado")
        return super().do_HEAD()

    def usuarios_sin_claves(self):
        # La página necesita los permisos por rol, pero nunca recibe sales ni hashes
        datos = leer_json("usuarios.json")
        datos["usuarios"] = [{k: u[k] for k in ("usuario", "nombre", "rol")} for u in datos["usuarios"]]
        datos.pop("seguridad", None)
        self.responder_json(datos)

    # ----- API
    def api_get(self, ruta):
        if ruta == "/api/ping":
            return self.responder_json({"servidor": "TorqueStock", "version": 1})
        u, _ = self.sesion()
        with conectar() as con:
            if ruta == "/api/version":
                return self.responder_json({"version": version(con)})
            if ruta == "/api/estado":
                return self.responder_json(estado_completo(con))
        raise ErrorRegla("No encontrado.", 404)

    def do_POST(self):
        ruta = posixpath.normpath(unquote(urlsplit(self.path).path))
        try:
            cuerpo = self.leer_cuerpo()
            if ruta == "/api/login":
                u = autenticar(cuerpo.get("usuario"), cuerpo.get("clave"))
                if not u:
                    anotar(f'Intento fallido de inicio de sesión: "{str(cuerpo.get("usuario"))[:15]}"')
                    raise ErrorRegla("Usuario o contraseña incorrectos.", 401)
                anotar(f'{u["usuario"]} inició sesión desde {self.client_address[0]}')
                return self.responder_json(u)

            u, token = self.sesion()
            if ruta == "/api/logout":
                with candado, conectar() as con:
                    con.execute("DELETE FROM sesiones WHERE token = ?", (token,))
                anotar(f'{u["usuario"]} cerró sesión')
                return self.responder_json({"ok": True})

            if ruta == "/api/accion":
                accion = cuerpo.get("accion")
                if accion not in PERMISO_DE:
                    raise ErrorRegla("Acción desconocida.")
                if not u["permisos"].get(PERMISO_DE[accion]):
                    anotar(f'{u["usuario"]} intentó "{accion}" sin permiso')
                    raise ErrorRegla("Tu rol no tiene permiso para esta acción.", 403)
                with candado, conectar() as con:
                    codigo = ejecutar(con, accion, cuerpo.get("codigo"), cuerpo.get("datos"), u["usuario"])
                    subir_version(con)
                    respuesta = estado_completo(con)
                respuesta["codigo"] = codigo
                anotar(f'{u["usuario"]}: {accion} {codigo or ""}'.rstrip())
                return self.responder_json(respuesta)

            raise ErrorRegla("No encontrado.", 404)
        except ErrorRegla as e:
            return self.responder_json({"error": str(e)}, e.codigo_http)
        except Exception as e:   # error inesperado: se anota y no se cae el servidor
            anotar(f"ERROR: {e!r}")
            return self.responder_json({"error": "Error interno del servidor."}, 500)


def anotar(texto):
    try:
        print(f"  [{datetime.now():%H:%M:%S}] {texto}", flush=True)
    except Exception:
        pass   # un problema al escribir en la ventana nunca debe detener una acción

class Servidor(ThreadingHTTPServer):
    daemon_threads = True   # al cerrar con Ctrl + C no espera a las conexiones abiertas

    def handle_error(self, request, client_address):
        # Si el navegador corta una descarga a la mitad (recargó o cambió de página) no es un error
        # del servidor: se ignora en vez de llenar la ventana con mensajes que asustan.
        error = sys.exc_info()[1]
        if isinstance(error, (ConnectionAbortedError, ConnectionResetError, BrokenPipeError, TimeoutError)):
            return
        anotar(f"ERROR con {client_address[0]}: {error!r}")


def direcciones_locales():
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    try:   # la IP con la que sale a la red (no envía nada)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("192.168.0.1", 1))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith(("127.", "169.254.")))


def main():
    for flujo in (sys.stdout, sys.stderr):   # acentos en la ventana aunque la consola no sea UTF-8
        try:
            flujo.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    mimetypes.add_type("text/javascript", ".js")
    mimetypes.add_type("image/svg+xml", ".svg")
    crear_tablas()
    try:
        servidor = Servidor(("0.0.0.0", PUERTO), Manejador)
    except OSError:
        print(f"\n  El puerto {PUERTO} ya está en uso. ¿Ya hay otro servidor de TorqueStock abierto?\n")
        sys.exit(1)

    print()
    print("  TorqueStock - Servidor del almacén")
    print("  ----------------------------------")
    print(f"  Base de datos: {BASE}")
    print()
    print("  En esta computadora abre:")
    print(f"     http://localhost:{PUERTO}")
    print("  En las tablets y computadoras de la misma red abre:")
    for ip in direcciones_locales() or ["(no se encontró red: conecta el WiFi o el cable)"]:
        print(f"     http://{ip}:{PUERTO}" if ip[0].isdigit() else f"     {ip}")
    print()
    print("  Deja esta ventana abierta mientras se use el sistema. Para apagarlo: Ctrl + C")
    print()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\n  Servidor detenido.")


if __name__ == "__main__":
    main()
