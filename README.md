# TorqueStock

Sistema Web de Gestión de Almacén de Herramientas de Torque — Grupo Industrial Par-Tec.
PIA · Lic. en Tecnologías de Información · FACPYA UANL · Equipo OOZMA KAPPA.

TorqueStock funciona **de forma local, sin internet**. Una computadora del almacén corre el servidor y guarda todo en una base de datos; las tablets y computadoras de la planta lo usan desde el navegador por la red local.

## Estructura

```
TorqueStock/
├── Iniciar servidor.bat        Doble clic para arrancar el sistema
├── Registrar usuario.bat       Doble clic para dar de alta un empleado o cambiar su contraseña
├── README.md
│
├── frontend/                   Lo que ve el usuario: HTML, CSS y JavaScript
│   ├── index.html              Inicio de sesión (RF-01)
│   ├── panel.html              Panel: indicadores, inventario, préstamos, ficha e historial
│   ├── reportes.html           Reportes, agenda de calibración, bitácora, CSV e impresión
│   ├── ayuda.html              Manual de usuario (se adapta al rol)
│   ├── acerca.html             Ficha del proyecto y trazabilidad de requerimientos
│   ├── manifest.json           Nombre e ícono al agregarlo a la pantalla de inicio
│   ├── css/
│   │   └── styles.css          Estilos, diseño responsivo (RNF-04) e impresión
│   ├── js/
│   │   ├── datos.js            Conexión con el servidor; semáforo, turno e indicadores
│   │   ├── sesion.js           Sesión del usuario
│   │   ├── util.js             Utilidades de pantalla (etiquetas, fechas, avisos, CSV)
│   │   ├── login.js            Página de inicio de sesión
│   │   ├── panel.js            Página del panel
│   │   ├── reportes.js         Página de reportes
│   │   ├── ayuda.js            Página del manual
│   │   └── acerca.js           Página "Acerca del proyecto"
│   └── img/                    Logotipo e íconos
│
└── backend/                    Servidor (Python) y base de datos (SQLite)
    ├── servidor.py             Arranca el servidor
    ├── registrar_usuario.py    Registra empleados con la contraseña cifrada
    ├── iniciar.ps1             Abre el puerto en el Firewall y arranca servidor.py
    ├── app/
    │   ├── config.py           Rutas, puerto y constantes
    │   ├── utilidades.py       Errores, fechas, textos y mensajes en la ventana
    │   ├── base_datos.py       Conexión con SQLite, creación de la base y consultas
    │   ├── seguridad.py        Contraseñas (PBKDF2-SHA256), inicio de sesión y sesiones
    │   ├── reglas.py           Reglas de negocio: alta, préstamo, devolución, reparación, baja, calibración
    │   └── api.py              Entrega el frontend y responde las peticiones /api/
    └── database/
        ├── esquema.sql         Tablas de la base de datos
        ├── datos-ejemplo.sql   Datos iniciales (solo para una base nueva)
        └── torquestock.db      LA BASE DE DATOS (se crea sola; no se sube a GitHub)
```

Las páginas HTML solo tienen estructura; los estilos están en `css/` y el código en `js/` (RNF-05: código separado).

## Cómo usarlo

1. La computadora servidor necesita **Python 3** (python.org; al instalar marca *Add python.exe to PATH*). No hace falta instalar nada más: usa `http.server`, `sqlite3` y `hashlib`, que ya vienen con Python.
2. Doble clic en **`Iniciar servidor.bat`** y acepta el permiso de administrador (solo sirve para abrir el puerto 8080 en el Firewall de Windows la primera vez).
3. En esa computadora abre **`http://localhost:8080`**. En las tablets y computadoras conectadas a la misma red (mismo módem o router por WiFi o cable, aunque no tenga internet) abre la dirección que muestra la ventana, por ejemplo `http://192.168.1.50:8080`. Si no hay router, la computadora puede crear su propia red con la *Zona con cobertura inalámbrica móvil* de Windows.
4. Deja la ventana abierta mientras se use el sistema. Ahí se anota cada inicio de sesión y cada movimiento. Para apagarlo: **Ctrl + C**.

Solo puede haber un servidor abierto a la vez: si abres otro, avisa que el puerto ya está en uso y se cierra sin tocar la base de datos.

| Rol | Usuario | Contraseña |
|---|---|---|
| Jefe de almacén (Administrador) | `jefe` | `jefe123` |
| Almacenista de ventanilla | `almacen` | `almacen123` |
| Ingeniero de calidad | `calidad` | `calidad123` |

## Base de datos (`backend/database/torquestock.db`)

Todo se guarda en SQLite: cada herramienta que se registra con **+ Nueva herramienta**, cada préstamo, devolución, calibración y baja. Se puede abrir con cualquier visor de SQLite (por ejemplo, la extensión *SQLite Viewer* de VS Code; presiona *actualizar* para ver los cambios recientes).

| Tabla | Contenido |
|---|---|
| `herramientas` | Inventario: código, nombre, categoría, rango de torque, próxima calibración, estado y préstamo activo |
| `movimientos` | Bitácora: altas, préstamos, devoluciones, reparaciones, calibraciones y bajas, con fecha y usuario |
| `usuarios` | Usuario, nombre, rol, **sal** y **hash** de la contraseña (nunca la contraseña) |
| `roles` | Administrador, Almacenista, Calidad y su nombre en pantalla |
| `permisos` | Qué puede hacer cada rol (`alta`, `prestar`, `calibrar`, `reparar`, `reincorporar`, `baja`, `reportes`, `acerca`): 1 = sí, 0 = no |
| `lineas` | Líneas de producción para los préstamos |
| `categorias` | Tipos de herramienta |
| `configuracion` | Días de aviso del semáforo (15), horas del turno (8) y repeticiones del cifrado |
| `sesiones` | Sesiones abiertas (duran 12 horas) |
| `meta` | Número de versión de los datos (para que los equipos sepan cuándo actualizar) |

- **Primera vez:** si la base no existe, el servidor la crea con `esquema.sql` y `datos-ejemplo.sql`. Las fechas del ejemplo son relativas al día en que se crea, para que haya herramientas en verde, amarillo y rojo.
- **Empezar de cero:** cierra el servidor y borra `torquestock.db`; al volver a abrirlo se crea de nuevo.
- **Bases de versiones anteriores:** si la base estaba en `backend/` se mueve sola a `backend/database/`; si tenía el formato anterior se convierte conservando herramientas y movimientos, y se guarda una copia en `backend/database/respaldos/`.
- Cambios a líneas, categorías, permisos o configuración hechos directamente en la base se ven al recargar la página.

## Usuarios y contraseñas

Las contraseñas **no se guardan**: la tabla `usuarios` solo tiene una sal aleatoria y el hash PBKDF2-SHA256 (100 000 repeticiones). Al iniciar sesión, el servidor cifra lo que escribió el usuario con su sal y lo compara con el hash.

**Registrar un empleado o cambiar su contraseña:** doble clic en `Registrar usuario.bat`. Muestra los usuarios actuales y pide usuario, nombre, rol y contraseña (dos veces, sin mostrarla). Sirve al momento, aunque el servidor esté abierto. Al cambiar una contraseña se cierran las sesiones abiertas de ese usuario.

## Qué hace el servidor

- Entrega solo la carpeta `frontend/`; la base de datos y el código del servidor nunca salen.
- Revisa la contraseña y entrega una sesión que dura 12 horas.
- Aplica **en el servidor** los permisos por rol y las reglas (semáforo, bloqueo por calibración vencida, estados, líneas y categorías válidas). Aunque alguien modifique la página, no puede saltárselos.
- No tiene ninguna acción para borrar el almacén.
- Atiende una escritura a la vez: dos equipos no pueden prestar la misma herramienta al mismo tiempo.
- Cada equipo pregunta cada 3 segundos si hubo cambios: lo que registra el almacenista aparece solo en la pantalla de Calidad y del Jefe.
- Si se pierde la red aparece una barra roja *"Sin conexión con el servidor del almacén"* y no se registra nada hasta que vuelva.
- Si la página se abre sin el servidor (con doble clic en un HTML) muestra el aviso *"Se necesita el servidor del almacén"*.

**API:** `GET /api/config` (permisos y catálogos), `POST /api/login`, `POST /api/logout`, `GET /api/estado`, `GET /api/version`, `POST /api/accion` (`alta`, `prestar`, `devolver`, `devolverConDanio`, `reparar`, `reincorporar`, `baja`, `calibrar`). Todas, menos `config` y `login`, piden la sesión en el encabezado `Authorization: Bearer <token>`.

## Requerimientos cubiertos

| ID | Dónde |
|---|---|
| RF-01 Login | `index.html` + `login.js` (máx. 15 caracteres, solo letras y números, Enter para avanzar), contraseñas cifradas, permisos por rol revisados en el servidor |
| RF-02 Alta | **+ Nueva herramienta** (Jefe) → tabla `herramientas` |
| RF-03 Búsqueda y filtros | Buscador + filtros por estado, semáforo y turno |
| RF-04 Préstamos | **Prestar** → empleado, nombre, línea |
| RF-05 Devoluciones | **Devolver** en un clic; **Devolver con daño** tras inspección |
| RF-06 Semáforo + bloqueo | Verde / Amarillo (≤ 15 días) / Rojo (préstamo bloqueado en la pantalla y en el servidor) |
| RF-07 Recalibración | **Calibración** (Calidad / Jefe) |
| RF-08 Dashboard | 6 tarjetas KPI + movimientos recientes |
| RNF-01 a RNF-05 | Ver `acerca.html` → Trazabilidad |

## Funciones por rol (Sección 1.2 del PIA)

- **Jefe:** alta de herramientas, reparación externa, baja definitiva, alerta de préstamos que exceden el turno (8 h), reportes ejecutivos.
- **Almacenista:** préstamo, devolución, devolución con daño, reincorporación tras reparación.
- **Calidad:** semáforo, recalibración, historial por herramienta exportable, agenda de calibración.

## Incrementos (modelo incremental)

- **Incremento 1:** RF-01, RF-02, RF-03, RNF-03, RNF-04
- **Incremento 2:** RF-04, RF-05, RNF-01
- **Incremento 3:** RF-06, RF-07, RF-08, RNF-02, RNF-05
