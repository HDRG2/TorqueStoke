"""
Reglas de negocio del almacén. Cada acción revisa sus datos y el estado de
la herramienta, la actualiza en la base y deja su registro en la bitácora.
Los permisos por rol se revisan antes, en api.py.
"""

import re
from datetime import date

from .base_datos import catalogos, leer_config, registrar_movimiento
from .config import BAJA, DISPONIBLE, PRESTAMO, REPARACION
from .utilidades import ErrorRegla, ahora_iso, leer_fecha, numero, texto

QUITAR_PRESTAMO = "prestamo_empleado = NULL, prestamo_operador = NULL, prestamo_linea = NULL, prestamo_fecha = NULL"


# ---------------------------------------------------------------- ayudas
def semaforo(con, h):
    """RF-06: verde (vigente), amarillo (vence pronto) o rojo (vencida o pendiente de recalibrar)."""
    if h["requiere_calibracion"]:
        return "rojo"
    dias = (date.fromisoformat(h["proxima_calibracion"]) - date.today()).days
    if dias < 0:
        return "rojo"
    return "amarillo" if dias <= leer_config(con, "diasAviso", 15) else "verde"


def obtener(con, codigo):
    f = con.execute("SELECT * FROM herramientas WHERE codigo = ?", (str(codigo or ""),)).fetchone()
    if not f:
        raise ErrorRegla("Herramienta no encontrada.", 404)
    return f


def exigir_estado(herramienta, *permitidos):
    if herramienta["estado"] not in permitidos:
        raise ErrorRegla(f'Acción no permitida: la herramienta está "{herramienta["estado"]}".')


# ---------------------------------------------------------------- acciones
def alta(con, datos, quien):
    """RF-02: registrar una herramienta nueva en el inventario."""
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
    if categoria not in catalogos(con)["categorias"]:
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
    registrar_movimiento(con, "Alta", codigo, f"{nombre} ({numero(minimo)}-{numero(maximo)} Nm)", quien)
    return codigo


def prestar(con, h, datos, quien):
    """RF-04: préstamo a una línea, con el bloqueo por calibración vencida (RF-06)."""
    if h["estado"] != DISPONIBLE:
        raise ErrorRegla("La herramienta no está disponible.")
    if h["requiere_calibracion"]:
        raise ErrorRegla("BLOQUEADO: la herramienta pasó por reparación y Calidad debe recalibrarla "
                         "antes de prestarla (ISO 6789).")
    if semaforo(con, h) == "rojo":
        raise ErrorRegla("BLOQUEADO: la calibración está vencida. No se puede prestar (IATF 16949 / ISO 6789).")
    empleado = str(datos.get("empleado") or "").strip()
    operador = str(datos.get("operador") or "").strip()
    linea = datos.get("linea")
    if not empleado or not operador or not linea:
        raise ErrorRegla("Captura número de empleado, nombre y línea.")
    if not re.fullmatch(r"\d{1,10}", empleado):
        raise ErrorRegla("El número de empleado solo admite dígitos.")
    operador = texto(operador, "el nombre del operador", 60)
    if linea not in catalogos(con)["lineas"]:
        raise ErrorRegla("Línea no válida.")

    con.execute("UPDATE herramientas SET estado = ?, prestamo_empleado = ?, prestamo_operador = ?, "
                "prestamo_linea = ?, prestamo_fecha = ? WHERE codigo = ?",
                (PRESTAMO, empleado, operador, linea, ahora_iso(), h["codigo"]))
    registrar_movimiento(con, "Préstamo", h["codigo"], f"{operador} (#{empleado}) → {linea}", quien)


def _recibida(h):
    return f'Recibida de {h["prestamo_operador"]} (#{h["prestamo_empleado"]}), {h["prestamo_linea"]}'


def devolver(con, h, datos, quien):
    """RF-05: devolución en un clic."""
    exigir_estado(h, PRESTAMO)
    con.execute(f"UPDATE herramientas SET estado = ?, {QUITAR_PRESTAMO} WHERE codigo = ?", (DISPONIBLE, h["codigo"]))
    registrar_movimiento(con, "Devolución", h["codigo"], _recibida(h), quien)


def devolver_con_danio(con, h, datos, quien):
    """Devolución con daño detectado en la inspección: la herramienta pasa a reparación."""
    exigir_estado(h, PRESTAMO)
    danio = texto(datos.get("texto"), "el daño encontrado")
    con.execute(f"UPDATE herramientas SET estado = ?, nota = ?, requiere_calibracion = 1, {QUITAR_PRESTAMO} "
                "WHERE codigo = ?", (REPARACION, danio, h["codigo"]))
    registrar_movimiento(con, "Devolución", h["codigo"], f"{_recibida(h)} — CON DAÑO: {danio}", quien)
    registrar_movimiento(con, "Reparación", h["codigo"], danio, quien)


def reparar(con, h, datos, quien):
    """Enviar a reparación externa o mantenimiento (Jefe de almacén)."""
    exigir_estado(h, DISPONIBLE)
    motivo = texto(datos.get("texto"), "el motivo")
    con.execute("UPDATE herramientas SET estado = ?, nota = ?, requiere_calibracion = 1 WHERE codigo = ?",
                (REPARACION, motivo, h["codigo"]))
    registrar_movimiento(con, "Reparación", h["codigo"], motivo, quien)


def reincorporar(con, h, datos, quien):
    """Regresa al servicio una herramienta reparada. Si Calidad todavía no la recalibra,
    queda Disponible pero en rojo ("Recalibrar") y no se puede prestar."""
    exigir_estado(h, REPARACION)
    con.execute("UPDATE herramientas SET estado = ?, nota = '' WHERE codigo = ?", (DISPONIBLE, h["codigo"]))
    registrar_movimiento(con, "Reincorporación", h["codigo"], "Reparada y reincorporada al servicio", quien)


def baja(con, h, datos, quien):
    """Baja definitiva (Jefe de almacén)."""
    exigir_estado(h, DISPONIBLE, REPARACION)
    motivo = texto(datos.get("texto"), "el motivo de la baja")
    con.execute("UPDATE herramientas SET estado = ?, nota = ? WHERE codigo = ?", (BAJA, motivo, h["codigo"]))
    registrar_movimiento(con, "Baja", h["codigo"], motivo, quien)


def calibrar(con, h, datos, quien):
    """RF-07: registrar la nueva fecha de calibración (reactiva el verde)."""
    if h["estado"] == BAJA:
        raise ErrorRegla("La herramienta está dada de baja.")
    if not datos.get("fecha"):
        raise ErrorRegla("Selecciona la nueva fecha de calibración.")
    nueva = leer_fecha(datos["fecha"])
    if nueva <= date.today():
        raise ErrorRegla("La nueva fecha debe ser posterior a hoy.")
    con.execute("UPDATE herramientas SET proxima_calibracion = ?, requiere_calibracion = 0 WHERE codigo = ?",
                (nueva.isoformat(), h["codigo"]))
    detalle = f'Vigencia {h["proxima_calibracion"]} → {nueva.isoformat()}'
    if h["requiere_calibracion"]:
        detalle += " (después de reparación)"
    registrar_movimiento(con, "Recalibración", h["codigo"], detalle, quien)


# Acciones sobre una herramienta que ya existe
SOBRE_HERRAMIENTA = {
    "prestar": prestar,
    "devolver": devolver,
    "devolverConDanio": devolver_con_danio,
    "reparar": reparar,
    "reincorporar": reincorporar,
    "baja": baja,
    "calibrar": calibrar,
}


def ejecutar(con, accion, codigo, datos, quien):
    """Ejecuta una acción y devuelve el código de la herramienta afectada."""
    datos = datos if isinstance(datos, dict) else {}
    if accion == "alta":
        return alta(con, datos, quien)
    h = obtener(con, codigo)
    SOBRE_HERRAMIENTA[accion](con, h, datos, quien)
    return h["codigo"]
