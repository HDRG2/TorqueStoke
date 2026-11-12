"""Errores para el usuario, fechas, textos y mensajes en la ventana del servidor."""

from datetime import date, datetime, timedelta, timezone


class ErrorRegla(Exception):
    """Error que se le muestra al usuario tal cual (validaciones y reglas de negocio)."""

    def __init__(self, mensaje, codigo_http=400):
        super().__init__(mensaje)
        self.codigo_http = codigo_http


def ahora_iso(horas_atras=0):
    """Fecha y hora UTC en formato ISO 8601, igual que JavaScript: 2026-11-11T22:45:28.795Z"""
    t = datetime.now(timezone.utc) - timedelta(hours=horas_atras)
    return t.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def numero(x):
    """300.0 -> 300 (para mostrar rangos de torque sin decimales de más)."""
    return int(x) if float(x).is_integer() else x


def leer_fecha(texto):
    try:
        return date.fromisoformat(str(texto))
    except ValueError:
        raise ErrorRegla("La fecha no es válida.")


def texto(valor, campo, maximo=200):
    """Texto obligatorio con largo máximo (RNF-05: validación de campos)."""
    v = str(valor or "").strip()
    if not v:
        raise ErrorRegla(f"Escribe {campo}.")
    if len(v) > maximo:
        raise ErrorRegla(f"El texto de {campo} es demasiado largo (máx. {maximo}).")
    return v


def anotar(mensaje):
    """Anota en la ventana del servidor con la hora (inicios de sesión, movimientos, errores)."""
    try:
        print(f"  [{datetime.now():%H:%M:%S}] {mensaje}", flush=True)
    except Exception:
        pass   # un problema al escribir en la ventana nunca debe detener una acción
