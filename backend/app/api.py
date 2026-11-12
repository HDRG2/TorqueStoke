"""
Servidor web: entrega la carpeta frontend/ y responde las peticiones /api/.

  GET  /api/config    permisos y catálogos para armar la pantalla (público)
  POST /api/login     inicia sesión y devuelve un token
  POST /api/logout    cierra la sesión
  GET  /api/estado    inventario y bitácora
  GET  /api/version   número que cambia con cada movimiento (para actualizar las pantallas)
  POST /api/accion    alta, prestar, devolver, devolverConDanio, reparar, reincorporar, baja, calibrar

Todas, menos config y login, piden "Authorization: Bearer <token>".
"""

import json
import os
import posixpath
import socket
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

from . import config, reglas, seguridad
from .base_datos import candado, catalogos, conectar, estado_completo, subir_version, tabla_permisos, version
from .utilidades import ErrorRegla, anotar


class Manejador(SimpleHTTPRequestHandler):
    server_version = "TorqueStock"
    sys_version = ""

    def __init__(self, *args, **kwargs):
        # Solo se entrega frontend/: la base de datos y el código del servidor nunca salen
        super().__init__(*args, directory=str(config.FRONTEND), **kwargs)

    def log_message(self, formato, *args):
        pass   # sin una línea por cada archivo; los movimientos se anotan aparte

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def ruta(self):
        return posixpath.normpath(unquote(urlsplit(self.path).path))

    def list_directory(self, path):
        self.send_error(404, "No encontrado")   # no se muestra la lista de archivos de una carpeta
        return None

    # ---------------------------------------------------------------- respuestas
    def responder_json(self, datos, codigo=200):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def leer_cuerpo(self):
        largo = int(self.headers.get("Content-Length") or 0)
        if largo > config.MAX_CUERPO:
            raise ErrorRegla("Solicitud demasiado grande.", 413)
        try:
            return json.loads(self.rfile.read(largo) or b"{}")
        except ValueError:
            raise ErrorRegla("Solicitud no válida.")

    def sesion(self):
        token = (self.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
        u = seguridad.usuario_de_token(token)
        if not u:
            raise ErrorRegla("Tu sesión terminó. Vuelve a iniciar sesión.", 401)
        return u, token

    # ---------------------------------------------------------------- GET
    def do_GET(self):
        ruta = self.ruta()
        if not ruta.startswith("/api/"):
            return super().do_GET()   # archivos de frontend/ ("/" entrega index.html, el login)
        try:
            if ruta == "/api/config":
                with conectar() as con:
                    return self.responder_json({**catalogos(con), "permisos": tabla_permisos(con)})
            self.sesion()
            with conectar() as con:
                if ruta == "/api/version":
                    return self.responder_json({"version": version(con)})
                if ruta == "/api/estado":
                    return self.responder_json(estado_completo(con))
            raise ErrorRegla("No encontrado.", 404)
        except ErrorRegla as e:
            return self.responder_json({"error": str(e)}, e.codigo_http)

    def do_HEAD(self):
        if self.ruta().startswith("/api/"):
            return self.send_error(404, "No encontrado")
        return super().do_HEAD()

    # ---------------------------------------------------------------- POST
    def do_POST(self):
        ruta = self.ruta()
        try:
            cuerpo = self.leer_cuerpo()
            if ruta == "/api/login":
                return self.login(cuerpo)
            u, token = self.sesion()
            if ruta == "/api/logout":
                seguridad.cerrar_sesion(token)
                anotar(f'{u["usuario"]} cerró sesión')
                return self.responder_json({"ok": True})
            if ruta == "/api/accion":
                return self.accion(u, cuerpo)
            raise ErrorRegla("No encontrado.", 404)
        except ErrorRegla as e:
            return self.responder_json({"error": str(e)}, e.codigo_http)
        except Exception as e:   # error inesperado: se anota y el servidor sigue funcionando
            anotar(f"ERROR: {e!r}")
            return self.responder_json({"error": "Error interno del servidor."}, 500)

    def login(self, cuerpo):
        u = seguridad.autenticar(cuerpo.get("usuario"), cuerpo.get("clave"))
        if not u:
            anotar(f'Intento fallido de inicio de sesión: "{str(cuerpo.get("usuario"))[:15]}"')
            raise ErrorRegla("Usuario o contraseña incorrectos.", 401)
        anotar(f'{u["usuario"]} inició sesión desde {self.client_address[0]}')
        return self.responder_json(u)

    def accion(self, u, cuerpo):
        accion = cuerpo.get("accion")
        if accion not in config.PERMISO_DE:
            raise ErrorRegla("Acción desconocida.")
        # El permiso se revisa aquí, en el servidor: aunque alguien modifique la página no se lo salta
        if not u["permisos"].get(config.PERMISO_DE[accion]):
            anotar(f'{u["usuario"]} intentó "{accion}" sin permiso')
            raise ErrorRegla("Tu rol no tiene permiso para esta acción.", 403)
        with candado, conectar() as con:
            codigo = reglas.ejecutar(con, accion, cuerpo.get("codigo"), cuerpo.get("datos"), u["usuario"])
            subir_version(con)
            respuesta = estado_completo(con)
        respuesta["codigo"] = codigo
        anotar(f'{u["usuario"]}: {accion} {codigo or ""}'.rstrip())
        return self.responder_json(respuesta)


class Servidor(ThreadingHTTPServer):
    daemon_threads = True   # al cerrar con Ctrl + C no espera a las conexiones abiertas
    # En Windows, "reusar la dirección" deja que DOS servidores escuchen el mismo puerto a la vez
    # (uno viejo y uno nuevo) y las peticiones caen en cualquiera. Ahí el puerto se pide en exclusiva.
    allow_reuse_address = os.name != "nt"

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

    def handle_error(self, request, client_address):
        # Si el navegador corta una descarga a la mitad (recargó o cambió de página) no es un error
        # del servidor: se ignora en vez de llenar la ventana con mensajes que asustan.
        error = sys.exc_info()[1]
        if isinstance(error, (ConnectionAbortedError, ConnectionResetError, BrokenPipeError, TimeoutError)):
            return
        anotar(f"ERROR con {client_address[0]}: {error!r}")
