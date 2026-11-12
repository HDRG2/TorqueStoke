"""
TorqueStock - Registrar empleado o cambiar su contraseña

Pide los datos, cifra la contraseña (PBKDF2-SHA256 con sal aleatoria)
y la guarda en la tabla "usuarios" de la base de datos. La contraseña
nunca se guarda, solo su hash. Sirve aunque el servidor esté abierto:
el cambio se usa desde el siguiente inicio de sesión.

Uso:  python backend/registrar_usuario.py   (o doble clic en "Registrar usuario.bat")
"""

import getpass
import hashlib
import re
import secrets
import sys

from servidor import ahora_iso, config, conectar, crear_base

REGLA = re.compile(r"[A-Za-z0-9]{1,15}")   # RF-01: máximo 15, solo letras y números


def pedir(mensaje, valido, error):
    while True:
        valor = input(f"  {mensaje}: ").strip()
        if valido(valor):
            return valor
        print(f"    {error}")


def leer_oculto(mensaje):
    # En una ventana normal la contraseña no se ve al escribirla; si los datos llegan
    # de otro programa (sin ventana), se leen como texto normal.
    return getpass.getpass(mensaje) if sys.stdin.isatty() else input(mensaje)


def pedir_clave():
    while True:
        clave = leer_oculto("  Contraseña (máx. 15, solo letras y números; no se ve al escribir): ")
        if not REGLA.fullmatch(clave):
            print("    Solo letras y números, máximo 15.")
        elif leer_oculto("  Repite la contraseña: ") != clave:
            print("    No coinciden, intenta de nuevo.")
        else:
            return clave


def main():
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    crear_base()   # por si es la primera vez y la base todavía no existe

    print("\n  TorqueStock - Registro de empleados")
    print("  -----------------------------------")
    with conectar() as con:
        roles = con.execute("SELECT rol, nombre FROM roles ORDER BY rowid").fetchall()
        actuales = con.execute("SELECT u.usuario, u.nombre, r.nombre AS rol FROM usuarios u "
                               "JOIN roles r ON r.rol = u.rol ORDER BY u.rowid").fetchall()
    print("\n  Usuarios actuales:")
    for u in actuales:
        print(f"    {u['usuario']:<16}{u['nombre']}  ({u['rol']})")
    print()

    usuario = pedir("Usuario (máx. 15, solo letras y números)", REGLA.fullmatch,
                    "Solo letras y números, máximo 15.").lower()
    with conectar() as con:
        existente = con.execute("SELECT nombre, rol FROM usuarios WHERE usuario = ?", (usuario,)).fetchone()

    if existente:
        print(f"\n  '{usuario}' ya existe: {existente['nombre']}.")
        if not input("  ¿Cambiar su contraseña? (s/n): ").strip().lower().startswith("s"):
            print("  Sin cambios.\n")
            return
        nombre, rol = existente["nombre"], existente["rol"]
    else:
        nombre = pedir("Nombre completo", lambda v: 3 <= len(v) <= 60, "Escribe entre 3 y 60 caracteres.")
        print()
        for i, r in enumerate(roles, 1):
            print(f"    {i}) {r['nombre']}")
        opcion = pedir(f"Rol (1 a {len(roles)})", lambda v: v.isdigit() and 1 <= int(v) <= len(roles),
                       f"Escribe un número del 1 al {len(roles)}.")
        rol = roles[int(opcion) - 1]["rol"]

    print()
    clave = pedir_clave()
    sal = secrets.token_bytes(16)
    with conectar() as con:
        iteraciones = config(con, "iteraciones", 100000)
        hash_ = hashlib.pbkdf2_hmac("sha256", clave.encode(), sal, iteraciones).hex()
        if existente:
            con.execute("UPDATE usuarios SET sal = ?, hash = ? WHERE usuario = ?", (sal.hex(), hash_, usuario))
            # Por seguridad, se cierran las sesiones que tenía abiertas con la contraseña anterior
            con.execute("DELETE FROM sesiones WHERE usuario = ?", (usuario,))
        else:
            con.execute("INSERT INTO usuarios (usuario, nombre, rol, sal, hash, creado) VALUES (?, ?, ?, ?, ?, ?)",
                        (usuario, nombre, rol, sal.hex(), hash_, ahora_iso()))
    clave = None

    if existente:
        print(f"\n  Contraseña de '{usuario}' actualizada. Ya puede entrar con la nueva.\n")
    else:
        nombre_rol = next(r["nombre"] for r in roles if r["rol"] == rol)
        print(f"\n  Empleado '{usuario}' registrado como {nombre_rol}. Ya puede iniciar sesión.\n")


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print("\n  Cancelado. No se guardó nada.\n")
