"""
TorqueStock - Servidor del almacén

Corre en una computadora del almacén. Las tablets y computadoras de la
planta se conectan a ella por la red local; no necesita internet ni
instalar nada: solo usa lo que ya trae Python.

  - Entrega la página (carpeta frontend/: HTML, CSS y JavaScript).
  - Guarda todo en la base SQLite backend/database/torquestock.db.
  - Revisa contraseñas, permisos por rol y reglas de negocio.

Uso:  python backend/servidor.py [puerto]   (o doble clic en "Iniciar servidor.bat")
"""

import mimetypes
import socket
import sys

from app import config
from app.api import Manejador, Servidor
from app.base_datos import preparar_base


def direcciones_locales():
    """IPs de esta computadora en la red local, para abrirlas desde las tablets."""
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
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else config.PUERTO
    for flujo in (sys.stdout, sys.stderr):   # acentos en la ventana aunque la consola no sea UTF-8
        try:
            flujo.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    mimetypes.add_type("text/javascript", ".js")
    mimetypes.add_type("image/svg+xml", ".svg")
    mimetypes.add_type("application/manifest+json", ".webmanifest")

    # Primero el puerto: si ya hay otro servidor abierto, este se cierra SIN tocar la base de datos
    try:
        servidor = Servidor(("0.0.0.0", puerto), Manejador)
    except OSError:
        print(f"\n  El puerto {puerto} ya está en uso: ya hay otro servidor de TorqueStock abierto.")
        print("  Ciérralo (Ctrl + C en su ventana o terminal) y vuelve a abrir este.\n")
        sys.exit(1)
    try:
        estado = preparar_base()
    except Exception:
        servidor.server_close()
        raise

    print()
    print("  TorqueStock - Servidor del almacén")
    print("  ----------------------------------")
    print(f"  Base de datos: {config.BASE.relative_to(config.RAIZ)}"
          + {"nueva": "  (nueva, con datos de ejemplo)", "migrada": "  (pasada al formato nuevo)"}.get(estado, ""))
    print()
    print("  En esta computadora abre:")
    print(f"     http://localhost:{puerto}")
    print("  En las tablets y computadoras de la misma red abre:")
    for ip in direcciones_locales() or ["(no se encontró red: conecta el WiFi o el cable)"]:
        print(f"     http://{ip}:{puerto}" if ip[0].isdigit() else f"     {ip}")
    print()
    print("  Deja esta ventana abierta mientras se use el sistema. Para apagarlo: Ctrl + C")
    print()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\n  Servidor detenido.")


if __name__ == "__main__":
    main()
