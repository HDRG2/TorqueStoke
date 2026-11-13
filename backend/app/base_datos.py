"""
Base de datos SQLite del almacén (backend/database/torquestock.db).

Aquí se guarda todo: usuarios, roles y permisos, líneas, categorías,
configuración, herramientas (las que se registran con "+ Nueva herramienta")
y la bitácora de movimientos.
"""

import shutil
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime

from . import config
from .utilidades import ahora_iso, numero

# Una escritura a la vez: dos equipos no pueden prestar la misma herramienta al mismo tiempo
candado = threading.Lock()


@contextmanager
def conectar():
    """Abre la base, guarda los cambios si todo salió bien (o los deshace si hubo error) y la cierra."""
    con = sqlite3.connect(config.BASE, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    try:
        with con:
            yield con
    finally:
        con.close()


# ---------------------------------------------------------------- preparar la base al arrancar
def preparar_base():
    """
    Deja la base lista. Devuelve qué pasó:
      ""          ya existía y está al día
      "nueva"     no existía: se creó con esquema.sql y datos-ejemplo.sql
      "migrada"   era de una versión anterior (sin usuarios ni catálogos): se pasó al
                  formato nuevo conservando herramientas y movimientos, con respaldo
    """
    config.CARPETA_BD.mkdir(exist_ok=True)
    _mudar_de_ubicacion_anterior()

    with conectar() as con:
        tablas = {f[0] for f in con.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}

    if "usuarios" in tablas:
        with conectar() as con:   # por si el esquema agregó tablas o índices nuevos
            con.executescript(config.ESQUEMA.read_text(encoding="utf-8"))
            _agregar_columnas_nuevas(con)
        return ""
    if "herramientas" in tablas:
        return _migrar_formato_anterior()

    with conectar() as con:
        con.executescript(config.ESQUEMA.read_text(encoding="utf-8"))
        con.executescript(config.DATOS_EJEMPLO.read_text(encoding="utf-8"))
    return "nueva"


def _agregar_columnas_nuevas(con):
    """Columnas que se agregaron después de crear la base (CREATE TABLE IF NOT EXISTS no las agrega)."""
    columnas = {f["name"] for f in con.execute("PRAGMA table_info(herramientas)")}
    if "requiere_calibracion" not in columnas:
        con.execute("ALTER TABLE herramientas ADD COLUMN requiere_calibracion INTEGER NOT NULL DEFAULT 0 "
                    "CHECK (requiere_calibracion IN (0, 1))")
        # Las que ya estaban en reparación deberán recalibrarse antes de volver a prestarse
        con.execute("UPDATE herramientas SET requiere_calibracion = 1 WHERE estado = 'En reparación'")
        print("\n  Se agregó a la base el control de recalibración después de una reparación.")


def _mudar_de_ubicacion_anterior():
    """Antes la base vivía en backend/; ahora vive en backend/database/."""
    vieja = config.BACKEND / "torquestock.db"
    if vieja.exists() and not config.BASE.exists():
        shutil.move(vieja, config.BASE)
        print(f"\n  La base de datos se movió a {config.BASE.relative_to(config.RAIZ)}")
    for respaldo in config.BACKEND.glob("torquestock-anterior-*.db"):
        destino = config.CARPETA_BD / "respaldos"
        destino.mkdir(exist_ok=True)
        shutil.move(respaldo, destino / respaldo.name)


def _migrar_formato_anterior():
    """Base de la primera versión (solo herramientas y movimientos): se pasa al formato nuevo."""
    respaldos = config.CARPETA_BD / "respaldos"
    respaldos.mkdir(exist_ok=True)
    respaldo = respaldos / f"torquestock-anterior-{datetime.now():%Y%m%d-%H%M%S}.db"
    shutil.copy2(config.BASE, respaldo)
    config.BASE.unlink()
    try:
        with conectar() as con:
            con.executescript(config.ESQUEMA.read_text(encoding="utf-8"))
            con.executescript(config.DATOS_EJEMPLO.read_text(encoding="utf-8"))
            con.execute("ATTACH DATABASE ? AS vieja", (str(respaldo),))
            con.executescript("""
                BEGIN;
                DELETE FROM movimientos;
                DELETE FROM herramientas;
                -- Si usaban una categoría o línea que no está en los catálogos, se agrega
                INSERT INTO categorias (nombre, orden)
                    SELECT DISTINCT categoria, 100 FROM vieja.herramientas
                    WHERE categoria NOT IN (SELECT nombre FROM categorias);
                INSERT INTO lineas (nombre, orden)
                    SELECT DISTINCT prestamo_linea, 100 FROM vieja.herramientas
                    WHERE prestamo_linea IS NOT NULL AND prestamo_linea NOT IN (SELECT nombre FROM lineas);
                INSERT INTO herramientas (codigo, nombre, categoria, torque_min, torque_max, proxima_calibracion,
                                          estado, nota, prestamo_empleado, prestamo_operador, prestamo_linea, prestamo_fecha)
                    SELECT codigo, nombre, categoria, torque_min, torque_max, proxima_calibracion,
                           estado, nota, prestamo_empleado, prestamo_operador, prestamo_linea, prestamo_fecha
                    FROM vieja.herramientas ORDER BY rowid;
                INSERT INTO movimientos (fecha, tipo, codigo, detalle, usuario)
                    SELECT fecha, tipo, codigo, detalle, usuario FROM vieja.movimientos
                    WHERE codigo IN (SELECT codigo FROM herramientas) ORDER BY id;
                UPDATE herramientas SET requiere_calibracion = 1 WHERE estado = 'En reparación';
                UPDATE meta SET valor = '2' WHERE clave = 'version';
                COMMIT;
            """)
            con.execute("DETACH DATABASE vieja")
    except Exception:
        config.BASE.unlink(missing_ok=True)   # algo salió mal: se deja la base como estaba
        shutil.copy2(respaldo, config.BASE)
        raise
    print("\n  La base de datos era de una versión anterior: se pasó al formato nuevo conservando")
    print(f"  herramientas y movimientos. Copia de cómo estaba: {respaldo.relative_to(config.RAIZ)}")
    return "migrada"


# ---------------------------------------------------------------- consultas
def leer_config(con, clave, defecto):
    """Un valor numérico de la tabla configuracion (días de aviso, horas de turno, iteraciones)."""
    fila = con.execute("SELECT valor FROM configuracion WHERE clave = ?", (clave,)).fetchone()
    return int(fila[0]) if fila else defecto


def catalogos(con):
    return {
        "lineas": [f[0] for f in con.execute("SELECT nombre FROM lineas ORDER BY orden, nombre")],
        "categorias": [f[0] for f in con.execute("SELECT nombre FROM categorias ORDER BY orden, nombre")],
        "diasAviso": leer_config(con, "diasAviso", 15),
        "horasTurno": leer_config(con, "horasTurno", 8),
    }


def tabla_permisos(con):
    """{rol: {permiso: True/False}} para que la página muestre solo los botones de cada rol."""
    r = {f["rol"]: {} for f in con.execute("SELECT rol FROM roles ORDER BY rowid")}
    for f in con.execute("SELECT rol, permiso, permitido FROM permisos"):
        r.setdefault(f["rol"], {})[f["permiso"]] = bool(f["permitido"])
    return r


def version(con):
    fila = con.execute("SELECT valor FROM meta WHERE clave = 'version'").fetchone()
    return int(fila[0]) if fila else 0


def subir_version(con):
    """Cada cambio sube el número; así los demás equipos saben que deben actualizar su pantalla."""
    con.execute("INSERT INTO meta VALUES ('version', '1') "
                "ON CONFLICT(clave) DO UPDATE SET valor = CAST(valor AS INTEGER) + 1")


def registrar_movimiento(con, tipo, codigo, detalle, usuario):
    con.execute("INSERT INTO movimientos (fecha, tipo, codigo, detalle, usuario) VALUES (?, ?, ?, ?, ?)",
                (ahora_iso(), tipo, codigo, detalle, usuario))


def _herramienta_json(f):
    prestamo = None
    if f["prestamo_fecha"]:
        prestamo = {"empleado": f["prestamo_empleado"], "operador": f["prestamo_operador"],
                    "linea": f["prestamo_linea"], "fecha": f["prestamo_fecha"]}
    return {"codigo": f["codigo"], "nombre": f["nombre"], "categoria": f["categoria"],
            "torqueMin": numero(f["torque_min"]), "torqueMax": numero(f["torque_max"]),
            "proximaCalibracion": f["proxima_calibracion"], "estado": f["estado"],
            "prestamo": prestamo, "nota": f["nota"],
            "requiereCalibracion": bool(f["requiere_calibracion"])}


def estado_completo(con):
    """Inventario y bitácora tal como los usa la página."""
    herramientas = [_herramienta_json(f) for f in con.execute("SELECT * FROM herramientas ORDER BY rowid")]
    movimientos = [dict(f) for f in con.execute(
        "SELECT fecha, tipo, codigo, detalle, usuario FROM movimientos ORDER BY fecha DESC, id DESC LIMIT ?",
        (config.MAX_MOVIMIENTOS,))]
    return {"version": version(con), "herramientas": herramientas, "movimientos": movimientos}
