"""
Contraseñas, inicio de sesión y sesiones (RF-01).

Las contraseñas nunca se guardan: en la tabla usuarios solo hay una sal
aleatoria y el hash PBKDF2-SHA256 de la contraseña con esa sal.
"""

import hashlib
import hmac
import secrets
import time

from . import config
from .base_datos import candado, conectar, leer_config
from .utilidades import ahora_iso


def cifrar(clave, sal, iteraciones):
    """Hash PBKDF2-SHA256 (hexadecimal) de la contraseña con la sal."""
    return hashlib.pbkdf2_hmac("sha256", str(clave).encode(), sal, iteraciones).hex()


def autenticar(usuario, clave):
    """Si la contraseña es correcta, abre una sesión y devuelve el usuario con su token."""
    with conectar() as con:
        u = con.execute("SELECT * FROM usuarios WHERE usuario = ?", (str(usuario or "").strip().lower(),)).fetchone()
        iteraciones = leer_config(con, "iteraciones", 100000)
    # Si el usuario no existe se cifra igual: tarda lo mismo y no revela qué usuarios existen
    sal = bytes.fromhex(u["sal"]) if u else bytes(16)
    calculado = cifrar(clave or "", sal, iteraciones)
    if not u or not hmac.compare_digest(calculado, u["hash"]):
        return None
    token = secrets.token_urlsafe(32)
    with candado, conectar() as con:
        con.execute("DELETE FROM sesiones WHERE expira < ?", (time.time(),))
        con.execute("INSERT INTO sesiones VALUES (?, ?, ?)",
                    (token, u["usuario"], time.time() + config.HORAS_SESION * 3600))
    return {"usuario": u["usuario"], "nombre": u["nombre"], "rol": u["rol"], "token": token}


def usuario_de_token(token):
    """El usuario de una sesión vigente, con los permisos actuales de su rol (o None)."""
    if not token:
        return None
    with conectar() as con:
        u = con.execute("SELECT u.usuario, u.nombre, u.rol FROM sesiones s JOIN usuarios u ON u.usuario = s.usuario "
                        "WHERE s.token = ? AND s.expira > ?", (token, time.time())).fetchone()
        if not u:
            return None
        permisos = {f["permiso"]: bool(f["permitido"])
                    for f in con.execute("SELECT permiso, permitido FROM permisos WHERE rol = ?", (u["rol"],))}
    return {"usuario": u["usuario"], "nombre": u["nombre"], "rol": u["rol"], "permisos": permisos}


def cerrar_sesion(token):
    with candado, conectar() as con:
        con.execute("DELETE FROM sesiones WHERE token = ?", (token,))


def guardar_usuario(usuario, nombre, rol, clave):
    """Registra un empleado nuevo o cambia la contraseña de uno existente (lo usa Registrar usuario.bat)."""
    sal = secrets.token_bytes(16)
    with candado, conectar() as con:
        hash_ = cifrar(clave, sal, leer_config(con, "iteraciones", 100000))
        if con.execute("SELECT 1 FROM usuarios WHERE usuario = ?", (usuario,)).fetchone():
            con.execute("UPDATE usuarios SET sal = ?, hash = ? WHERE usuario = ?", (sal.hex(), hash_, usuario))
            # Por seguridad, se cierran las sesiones que tenía abiertas con la contraseña anterior
            con.execute("DELETE FROM sesiones WHERE usuario = ?", (usuario,))
        else:
            con.execute("INSERT INTO usuarios (usuario, nombre, rol, sal, hash, creado) VALUES (?, ?, ?, ?, ?, ?)",
                        (usuario, nombre, rol, sal.hex(), hash_, ahora_iso()))
