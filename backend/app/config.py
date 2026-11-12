"""Rutas, puerto y constantes del sistema."""

from pathlib import Path

# ---------- Carpetas y archivos
BACKEND = Path(__file__).resolve().parent.parent       # TorqueStock/backend
RAIZ = BACKEND.parent                                   # TorqueStock
FRONTEND = RAIZ / "frontend"                            # lo que se entrega al navegador

CARPETA_BD = BACKEND / "database"
BASE = CARPETA_BD / "torquestock.db"                    # la base de datos del almacén
ESQUEMA = CARPETA_BD / "esquema.sql"                    # tablas (se aplica cada vez que arranca)
DATOS_EJEMPLO = CARPETA_BD / "datos-ejemplo.sql"        # datos iniciales (solo en una base nueva)

# ---------- Servidor
PUERTO = 8080
HORAS_SESION = 12          # una sesión dura como máximo un turno largo
MAX_MOVIMIENTOS = 2000     # movimientos que se envían a la página (los más recientes)
MAX_CUERPO = 100_000       # tamaño máximo de una petición (bytes)

# ---------- Estados de una herramienta
DISPONIBLE = "Disponible"
PRESTAMO = "En préstamo"
REPARACION = "En reparación"
BAJA = "Baja"

# ---------- Qué permiso pide cada acción (los permisos de cada rol están en la tabla "permisos")
# No existe una acción para borrar todo: nadie puede reiniciar el almacén desde la página.
PERMISO_DE = {
    "alta": "alta",
    "prestar": "prestar",
    "devolver": "prestar",
    "devolverConDanio": "prestar",
    "reparar": "reparar",
    "reincorporar": "reincorporar",
    "baja": "baja",
    "calibrar": "calibrar",
}
