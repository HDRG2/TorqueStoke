# TorqueStock

Sistema Web de Gestión de Almacén de Herramientas de Torque — Grupo Industrial Par-Tec.
PIA · Lic. en Tecnologías de Información · FACPYA UANL · Equipo OOZMA KAPPA.

## Cómo ejecutarlo (sin internet)

Una computadora del almacén hace de **servidor** y guarda todo en una base de datos **SQLite**. Las tablets y computadoras se conectan a ella por la **red local**: el mismo módem o router por WiFi o cable, aunque no tenga internet. Si no hay router, la computadora puede crear su propia red con la *Zona con cobertura inalámbrica móvil* de Windows.

1. La computadora servidor necesita **Python 3** (python.org). No hace falta instalar nada más: usa `http.server`, `sqlite3` y `hashlib`, que ya vienen con Python.
2. Doble clic en `Iniciar servidor.bat` y acepta el permiso de administrador (solo sirve para abrir el puerto 8080 en el Firewall de Windows la primera vez).
3. La ventana muestra direcciones como `http://192.168.1.50:8080`: ábrelas en las tablets y computadoras. En la misma computadora usa `http://localhost:8080`.
4. Deja la ventana abierta mientras se use el sistema. Ahí se anota cada inicio de sesión y cada movimiento.

En el login aparece *"Conectado al servidor del almacén"*. Si la página se abre sin el servidor (con doble clic en el HTML, con *Go Live* o en GitHub Pages) muestra el aviso *"Se necesita el servidor del almacén"*.

| Rol | Usuario | Contraseña |
|---|---|---|
| Jefe de almacén (Administrador) | `jefe` | `jefe123` |
| Almacenista de ventanilla | `almacen` | `almacen123` |
| Ingeniero de calidad | `calidad` | `calidad123` |

## Base de datos (`backend/torquestock.db`)

Todo vive en SQLite. Se puede abrir con cualquier visor de SQLite (por ejemplo, la extensión *SQLite Viewer* de VS Code).

| Tabla | Contenido |
|---|---|
| `usuarios` | Usuario, nombre, rol, **sal** y **hash** de la contraseña (nunca la contraseña) |
| `roles` | Administrador, Almacenista, Calidad y su nombre en pantalla |
| `permisos` | Qué puede hacer cada rol (`alta`, `prestar`, `calibrar`, `reparar`, `reincorporar`, `baja`, `reportes`, `acerca`): 1 = sí, 0 = no |
| `lineas` | Líneas de producción para los préstamos |
| `categorias` | Tipos de herramienta |
| `configuracion` | Días de aviso del semáforo (15), horas del turno (8) y repeticiones del cifrado |
| `herramientas` | Inventario con su estado actual y el préstamo activo |
| `movimientos` | Bitácora: préstamos, devoluciones, reparaciones, calibraciones, altas y bajas |
| `sesiones` | Sesiones abiertas (duran 12 horas) |
| `meta` | Número de versión de los datos (sirve para que los equipos sepan cuándo actualizar) |

- **Primera vez:** si la base no existe, el servidor la crea con `backend/base-inicial.sql` (tablas y datos de ejemplo). Las fechas del ejemplo son relativas al día en que se crea, para que siempre haya herramientas en verde, amarillo y rojo.
- **Empezar de cero:** cierra el servidor y borra `backend/torquestock.db`; al volver a abrirlo se crea de nuevo.
- **Base de una versión anterior:** el servidor la guarda como `torquestock-anterior-<fecha>.db` y crea una nueva.
- Cambios a líneas, categorías, permisos o configuración hechos directamente en la base se ven al recargar la página.

## Usuarios y contraseñas

Las contraseñas **no se guardan**: la tabla `usuarios` solo tiene una *sal* aleatoria y el *hash* PBKDF2-SHA256 (100 000 repeticiones). Al iniciar sesión, el servidor cifra lo que escribió el usuario con su sal y lo compara con el hash.

**Registrar un empleado o cambiar su contraseña:** doble clic en `Registrar usuario.bat`. Muestra los usuarios actuales y pide usuario, nombre, rol y contraseña (dos veces, sin mostrarla). La guarda cifrada en la base y sirve al momento, aunque el servidor esté abierto. Al cambiar una contraseña se cierran las sesiones abiertas de ese usuario.

## Qué hace el servidor (`backend/servidor.py`)

- Entrega la página (`frontend/`) y nunca la base de datos ni sus propios archivos.
- Revisa la contraseña y entrega una sesión que dura 12 horas.
- Aplica **en el servidor** los permisos por rol y las reglas (semáforo, bloqueo por calibración vencida, estados, líneas y categorías válidas). Aunque alguien modifique la página, no puede saltárselos.
- No tiene ninguna acción para borrar el almacén.
- Atiende una acción a la vez: dos equipos no pueden prestar la misma herramienta al mismo tiempo.
- Cada equipo pregunta cada 3 segundos si hubo cambios: lo que registra el almacenista aparece solo en la pantalla de Calidad y del Jefe.
- Si se pierde la red aparece una barra roja *"Sin conexión con el servidor del almacén"* y no se registra nada hasta que vuelva.

> **API:** `GET /api/config` (permisos y catálogos), `POST /api/login`, `POST /api/logout`, `GET /api/estado`, `GET /api/version`, `POST /api/accion` (`alta`, `prestar`, `devolver`, `devolverConDanio`, `reparar`, `reincorporar`, `baja`, `calibrar`). Todas, menos `config` y `login`, piden la sesión en el encabezado `Authorization: Bearer <token>`.

## Estructura

```
TorqueStock/
├── index.html              Solo redirige a frontend/
├── Iniciar servidor.bat    Doble clic para arrancar el servidor del almacén
├── Registrar usuario.bat   Doble clic para dar de alta un empleado o cambiar su contraseña
├── README.md
│
├── frontend/               Lo que corre en el navegador
│   ├── index.html          Inicio de sesión (RF-01)
│   ├── panel.html          Panel: KPIs, alerta de turno, inventario, ficha/historial, bitácora
│   ├── reportes.html       Reportes de utilización, agenda de calibración, bitácora, CSV e impresión
│   ├── ayuda.html          Manual de usuario
│   ├── acerca.html         Ficha del proyecto, equipo y trazabilidad (login y Jefe de almacén)
│   ├── css/styles.css      Estilos, diseño responsivo (RNF-04) e impresión
│   ├── js/datos.js         Conexión con el servidor y cálculos de pantalla: semáforo, turno, indicadores (RNF-05)
│   ├── js/sesion.js        Manejo de sesión
│   ├── js/util.js          Utilidades de interfaz (etiquetas, fechas, CSV)
│   ├── js/app.js           Lógica del panel
│   ├── js/reportes.js      Lógica de reportes
│   ├── js/pwa.js           Registro del service worker
│   ├── sw.js               Service worker: guarda la página para que abra más rápido
│   ├── manifest.json       Datos para instalar la app en el celular
│   └── img/                Logotipo e íconos
│
└── backend/                Servidor y base de datos
    ├── servidor.py         Servidor del almacén: API, SQLite, contraseñas y permisos
    ├── registrar_usuario.py  Registra empleados en la base con la contraseña cifrada
    ├── base-inicial.sql    Tablas y datos de ejemplo para crear una base nueva
    ├── servidor.ps1        Abre el Firewall y arranca servidor.py
    └── torquestock.db      La base de datos (se crea sola; no se sube a GitHub)
```

## Requerimientos cubiertos

| ID | Dónde |
|---|---|
| RF-01 Login | `frontend/index.html` (máx. 15 caracteres, solo letras y números, Enter para avanzar), contraseñas cifradas, permisos por rol revisados en el servidor |
| RF-02 Alta | **+ Nueva herramienta** (Jefe) |
| RF-03 Búsqueda y filtros | Buscador + filtros por estado, semáforo y turno |
| RF-04 Préstamos | **Prestar** → empleado, nombre, línea |
| RF-05 Devoluciones | **Devolver** en un clic; **Devolver con daño** tras inspección |
| RF-06 Semáforo + bloqueo | Verde / Amarillo (≤ 15 días) / Rojo (préstamo bloqueado) |
| RF-07 Recalibración | **Calibración** (Calidad / Jefe) |
| RF-08 Dashboard | 6 tarjetas KPI + movimientos recientes |
| RNF-01 a RNF-05 | Ver `frontend/acerca.html` → Trazabilidad |

## Funciones por rol (Sección 1.2 del PIA)

- **Jefe:** reparación externa, baja definitiva, alerta de préstamos que exceden el turno (8 h), reportes ejecutivos.
- **Almacenista:** préstamo, devolución, devolución con daño, reincorporación tras reparación.
- **Calidad:** semáforo, recalibración, historial por herramienta exportable, agenda de calibración.

## Incrementos (modelo incremental)

- **Incremento 1:** RF-01, RF-02, RF-03, RNF-03, RNF-04
- **Incremento 2:** RF-04, RF-05, RNF-01
- **Incremento 3:** RF-06, RF-07, RF-08, RNF-02, RNF-05
