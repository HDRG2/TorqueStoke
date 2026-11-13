"""
TorqueStock - Pruebas de aceptación (Sección 5 del PIA: simulación de escenarios)

Arranca el servidor con una base de datos TEMPORAL (no toca torquestock.db),
simula los casos de uso con datos de prueba y revisa cada requerimiento.
Al final muestra cuántas pruebas pasaron.

Uso:  python backend/pruebas.py
"""

import json
import sqlite3
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path

from app import config

# ---------- Base de datos temporal: las pruebas nunca tocan la base real
_temporal = tempfile.TemporaryDirectory()
config.CARPETA_BD = Path(_temporal.name)
config.BACKEND = Path(_temporal.name)
config.BASE = config.CARPETA_BD / "pruebas.db"

from app import api                       # noqa: E402  (después de cambiar la ruta de la base)
from app.api import Manejador, Servidor   # noqa: E402
from app.base_datos import preparar_base  # noqa: E402

api.anotar = lambda mensaje: None          # sin los mensajes del servidor: solo se ven los resultados

resultados = []


def revisar(requerimiento, descripcion, condicion, detalle=""):
    resultados.append(bool(condicion))
    marca = "✔" if condicion else "✘"
    print(f"  {marca} {requerimiento:<8} {descripcion}" + (f"  ({detalle})" if detalle and not condicion else ""))


def main():
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    preparar_base()
    servidor = Servidor(("127.0.0.1", 0), Manejador)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    base_url = f"http://127.0.0.1:{servidor.server_address[1]}"

    def pedir(metodo, ruta, cuerpo=None, token=None):
        encabezados = {"Content-Type": "application/json"}
        if token:
            encabezados["Authorization"] = f"Bearer {token}"
        datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
        r = urllib.request.Request(base_url + ruta, data=datos, method=metodo, headers=encabezados)
        try:
            with urllib.request.urlopen(r) as resp:
                tipo = resp.headers.get("Content-Type", "")
                return resp.status, (json.loads(resp.read()) if "json" in tipo else resp.read())
        except urllib.error.HTTPError as e:
            try:
                return e.code, json.loads(e.read())
            except ValueError:
                return e.code, {}

    def entrar(usuario, clave):
        estado, r = pedir("POST", "/api/login", {"usuario": usuario, "clave": clave})
        return r.get("token") if estado == 200 else None

    def accion(token, nombre, codigo=None, datos=None):
        return pedir("POST", "/api/accion", {"accion": nombre, "codigo": codigo, "datos": datos or {}}, token)

    def herramienta(respuesta, codigo):
        return next((h for h in respuesta.get("herramientas", []) if h["codigo"] == codigo), None)

    hoy = date.today()
    vigente = (hoy + timedelta(days=180)).isoformat()
    vencida = (hoy - timedelta(days=5)).isoformat()
    prestamo = {"empleado": "30115", "operador": "Carlos Treviño", "linea": "Línea 1"}

    print("\n  TorqueStock - Pruebas de aceptación")
    print("  -----------------------------------")

    # ---------------------------------------------------------------- RF-01 Acceso y permisos
    print("\n  Inicio de sesión y permisos")
    jefe, almacen, calidad = entrar("jefe", "jefe123"), entrar("almacen", "almacen123"), entrar("calidad", "calidad123")
    revisar("RF-01", "Los tres roles inician sesión con usuario y contraseña", jefe and almacen and calidad)
    revisar("RF-01", "Una contraseña incorrecta se rechaza", entrar("jefe", "otra123") is None)
    revisar("RF-01", "Sin sesión no se pueden ver los datos", pedir("GET", "/api/estado")[0] == 401)
    revisar("RF-01", "El almacenista no puede dar de alta herramientas",
            accion(almacen, "alta", datos={"codigo": "TQ-900"})[0] == 403)
    revisar("RF-01", "Calidad no puede prestar herramientas",
            accion(calidad, "prestar", "TQ-001", prestamo)[0] == 403)

    # ---------------------------------------------------------------- RF-02 Alta (escenario 1 del PIA)
    print("\n  Escenario 1: alta de una llave dinamométrica vigente")
    alta = {"codigo": "TQ-100", "nombre": "Llave de clic 1/2\" Prueba", "categoria": "Llave dinamométrica de clic",
            "torqueMin": "40", "torqueMax": "200", "proximaCalibracion": vigente, "estadoInicial": "Disponible"}
    estado, r = accion(jefe, "alta", datos=alta)
    h = herramienta(r, "TQ-100") if estado == 200 else None
    revisar("RF-02", "El jefe registra la herramienta con todos sus campos",
            h and h["estado"] == "Disponible" and h["torqueMin"] == 40 and h["torqueMax"] == 200, f"respuesta {estado}")
    revisar("RNF-05", "No guarda si falta un campo obligatorio",
            accion(jefe, "alta", datos={**alta, "codigo": "TQ-101", "nombre": ""})[0] == 400)
    revisar("RF-02", "No permite repetir un código", accion(jefe, "alta", datos=alta)[0] == 400)
    revisar("RNF-05", "No permite torque mínimo mayor que el máximo",
            accion(jefe, "alta", datos={**alta, "codigo": "TQ-102", "torqueMin": "300"})[0] == 400)
    estado, r = accion(jefe, "alta", datos={**alta, "codigo": "TQ-103", "estadoInicial": "En reparación"})
    h = herramienta(r, "TQ-103") if estado == 200 else None
    revisar("RF-02", "Estado inicial En reparación: entra en reparación y pendiente de recalibrar",
            h and h["estado"] == "En reparación" and h["requiereCalibracion"])

    # ---------------------------------------------------------------- RF-04 / RF-05 Préstamo y devolución
    print("\n  Escenario 3: préstamo y devolución en ventanilla")
    estado, r = accion(almacen, "prestar", "TQ-100", prestamo)
    h = herramienta(r, "TQ-100") if estado == 200 else None
    revisar("RF-04", "El préstamo registra operador y línea y cambia a En préstamo",
            h and h["estado"] == "En préstamo" and h["prestamo"]["operador"] == "Carlos Treviño"
            and h["prestamo"]["linea"] == "Línea 1")
    revisar("RF-04", "No se puede prestar dos veces la misma herramienta",
            accion(almacen, "prestar", "TQ-100", prestamo)[0] == 400)
    estado, r = accion(almacen, "devolver", "TQ-100")
    h = herramienta(r, "TQ-100") if estado == 200 else None
    revisar("RF-05", "La devolución en un clic la regresa a Disponible", h and h["estado"] == "Disponible")
    revisar("RF-05", "La devolución queda en la bitácora con el usuario",
            estado == 200 and r["movimientos"][0]["tipo"] == "Devolución" and r["movimientos"][0]["usuario"] == "almacen")

    # ---------------------------------------------------------------- RF-06 / RF-07 Semáforo (escenario 2 del PIA)
    print("\n  Escenario 2: intento de préstamo de una herramienta con calibración vencida")
    accion(jefe, "alta", datos={**alta, "codigo": "TQ-104", "proximaCalibracion": vencida})
    estado, r = accion(almacen, "prestar", "TQ-104", prestamo)
    revisar("RF-06", "El préstamo de una herramienta vencida se bloquea",
            estado == 400 and "BLOQUEADO" in r.get("error", ""), f"respuesta {estado}")
    estado, r = accion(calidad, "calibrar", "TQ-104", {"fecha": vigente})
    revisar("RF-07", "Calidad actualiza la fecha de calibración", estado == 200)
    revisar("RF-07", "Después de recalibrar ya se puede prestar",
            accion(almacen, "prestar", "TQ-104", prestamo)[0] == 200)
    revisar("RF-07", "No acepta una fecha de calibración pasada",
            accion(calidad, "calibrar", "TQ-100", {"fecha": vencida})[0] == 400)

    # ---------------------------------------------------------------- Reparación (ISO 6789)
    print("\n  Reparación y recalibración")
    accion(almacen, "devolverConDanio", "TQ-104", {"texto": "mecanismo de clic no dispara"})
    estado, r = accion(almacen, "reincorporar", "TQ-104")
    h = herramienta(r, "TQ-104") if estado == 200 else None
    revisar("ISO 6789", "Al reincorporarla queda pendiente de recalibrar",
            h and h["estado"] == "Disponible" and h["requiereCalibracion"])
    revisar("ISO 6789", "Sin recalibrar no se puede prestar", accion(almacen, "prestar", "TQ-104", prestamo)[0] == 400)
    accion(calidad, "calibrar", "TQ-104", {"fecha": vigente})
    revisar("ISO 6789", "Ya recalibrada se puede prestar", accion(almacen, "prestar", "TQ-104", prestamo)[0] == 200)

    # ---------------------------------------------------------------- RF-08 / RNF-02 Dashboard y rendimiento
    print("\n  Panel de indicadores y rendimiento")
    inicio = time.perf_counter()
    estado, r = pedir("GET", "/api/estado", token=jefe)
    segundos = time.perf_counter() - inicio
    activas = [h for h in r["herramientas"] if h["estado"] != "Baja"]
    cuenta = lambda e: sum(1 for h in activas if h["estado"] == e)
    revisar("RF-08", "Disponibles + En préstamo + En reparación = Total de herramientas",
            cuenta("Disponible") + cuenta("En préstamo") + cuenta("En reparación") == len(activas))
    revisar("RF-08", "La bitácora trae los movimientos más recientes primero",
            r["movimientos"][0]["fecha"] >= r["movimientos"][-1]["fecha"])
    revisar("RNF-02", "El inventario y la bitácora se cargan en menos de 3 segundos", segundos < 3, f"{segundos:.2f} s")

    # ---------------------------------------------------------------- Seguridad
    print("\n  Seguridad")
    revisar("RF-01", "La base de datos no se puede descargar desde el navegador",
            pedir("GET", "/../backend/database/torquestock.db")[0] == 404)
    con = sqlite3.connect(config.BASE)
    filas = con.execute("SELECT usuario, hash FROM usuarios").fetchall()
    con.close()
    revisar("RF-01", "Las contraseñas se guardan cifradas (nunca en texto)",
            all(len(hash_) == 64 and "123" not in hash_ for _, hash_ in filas))
    revisar("RF-01", "Al cerrar sesión el token deja de servir",
            pedir("POST", "/api/logout", {}, calidad)[0] == 200 and pedir("GET", "/api/estado", token=calidad)[0] == 401)

    servidor.shutdown()
    servidor.server_close()

    pasaron = sum(resultados)
    print(f"\n  Resultado: {pasaron} de {len(resultados)} pruebas pasaron.\n")
    return 0 if pasaron == len(resultados) else 1


if __name__ == "__main__":
    sys.exit(main())
