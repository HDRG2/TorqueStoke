"""
TorqueStock - Código del servidor del almacén.

  config.py       Rutas, puerto y constantes
  utilidades.py   Errores para el usuario, fechas y textos, mensajes en la ventana
  base_datos.py   Conexión con SQLite, creación de la base y consultas
  seguridad.py    Contraseñas (PBKDF2-SHA256), inicio de sesión y sesiones
  reglas.py       Reglas de negocio: alta, préstamo, devolución, reparación, baja, calibración
  api.py          Servidor web: entrega el frontend y responde las peticiones /api/
"""
