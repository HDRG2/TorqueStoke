# TorqueStock

Sistema Web de Gestión de Almacén de Herramientas de Torque — Grupo Industrial Par-Tec.
PIA · Lic. en Tecnologías de Información · FACPYA UANL · Equipo OOZMA KAPPA.

## Cómo ejecutarlo

TorqueStock funciona de dos formas y la página elige sola:

| Modo | Cómo se abre | Dónde quedan los datos |
|---|---|---|
| **Servidor del almacén** (uso real) | Doble clic en `Iniciar servidor.bat` | En la base de datos `backend/torquestock.db`, **compartida por todos los equipos** de la red |
| **Demostración** | GitHub Pages (`https://hdrg2.github.io/TorqueStoke/`) o *Go Live* de VS Code | En el navegador de cada equipo (LocalStorage) |

En el login se ve en cuál está: *"Conectado al servidor del almacén"* o *"Modo demostración"*.

Si abres `frontend/index.html` con doble clic aparece un aviso: el navegador solo puede leer los archivos JSON si la app se abre desde un servidor.

| Rol | Usuario | Contraseña |
|---|---|---|
| Jefe de almacén (Administrador) | `jefe` | `jefe123` |
| Almacenista de ventanilla | `almacen` | `almacen123` |
| Ingeniero de calidad | `calidad` | `calidad123` |

En el modo demostración, el Jefe de almacén puede usar **Restablecer demo** para volver a los datos de ejemplo. En el sistema del almacén (servidor) ese botón no existe: nadie puede borrar los datos desde la página.

## Datos (carpeta `backend/data/`)

| Archivo | Contenido |
|---|---|
| `usuarios.json` | Usuarios, contraseñas **cifradas** y permisos por rol |
| `catalogos.json` | Líneas de producción, categorías, días de aviso del semáforo (15) y horas del turno (8) |
| `herramientas.json` | Inventario inicial |
| `historial-demo.json` | Préstamos, devoluciones, recalibraciones y reparaciones de ejemplo |

Las fechas son **relativas** para que la demo nunca se vea vieja: `"diasParaCalibracion": 9` significa "vence dentro de 9 días" y `"horasAtras": 2` significa "hace 2 horas"; un número negativo es una fecha que ya pasó.

## Usuarios y contraseñas

Las contraseñas **no se guardan**: `usuarios.json` solo tiene una *sal* aleatoria y el *hash* de cada contraseña (PBKDF2-SHA256, 100 000 repeticiones). Al iniciar sesión, la app cifra lo que escribió el usuario con su sal y compara el resultado con el hash (`frontend/js/cifrado.js`).

**Registrar un empleado o cambiar su contraseña:** doble clic en `Registrar usuario.bat`. Pide usuario, nombre, rol y contraseña (dos veces, sin mostrarla), la cifra y la guarda en `usuarios.json`. Después sube el cambio (commit y push) para que lo vean los demás equipos.

**Cómo aplicar cambios a los JSON:** el navegador conserva los datos que ya tenía guardados, así que, después de editar un archivo, entra como Jefe y presiona **Restablecer demo**. Los cambios a `usuarios.json` y `catalogos.json` se ven con solo recargar la página.
## Servidor del almacén (sin internet)

Una computadora hace de servidor y las tablets y computadoras se conectan a ella por la **red local**: el mismo módem/router por WiFi o cable, aunque no tenga internet. Si no hay router, la computadora puede crear su propia red con la *Zona con cobertura inalámbrica móvil* de Windows.

1. La computadora servidor necesita **Python 3** (python.org). No hace falta instalar nada más: usa `http.server`, `sqlite3` y `hashlib`, que ya vienen con Python.
2. Doble clic en `Iniciar servidor.bat` y acepta el permiso de administrador (solo sirve para abrir el puerto 8080 en el Firewall de Windows la primera vez).
3. La ventana muestra direcciones como `http://192.168.1.50:8080`: ábrelas en las tablets y computadoras. En la misma computadora usa `http://localhost:8080`.
4. Deja la ventana abierta mientras se use el sistema. Ahí se anota cada inicio de sesión y cada movimiento.

Qué hace el servidor (`backend/servidor.py`):
- Guarda herramientas y movimientos en SQLite (`backend/torquestock.db`). La primera vez la llena con los datos de ejemplo de `backend/data/`.
- Revisa la contraseña (PBKDF2-SHA256) y entrega una sesión que dura 12 horas.
- Aplica **en el servidor** los permisos por rol y las reglas (semáforo, bloqueo por calibración vencida, estados). Aunque alguien modifique la página, no puede saltárselos.
- Atiende una acción a la vez: dos equipos no pueden prestar la misma herramienta al mismo tiempo.
- Nunca entrega las sales ni los hashes de las contraseñas, ni la base de datos.
- Cada equipo pregunta cada 3 segundos si hubo cambios: lo que registra el almacenista aparece solo en la pantalla de Calidad y del Jefe.
- Si se pierde la red aparece una barra roja *"Sin conexión con el servidor del almacén"* y no se registra nada hasta que vuelva.

Si la computadora no tiene Python, `Iniciar servidor.bat` abre la app en modo demostración (cada equipo con sus propios datos).

Para empezar de cero, cierra el servidor y borra `backend/torquestock.db`; al volver a abrirlo se crea de nuevo con los datos de ejemplo.

## Uso sin internet en el celular (PWA, modo demostración)

1. Publica la carpeta en GitHub Pages (`https://hdrg2.github.io/TorqueStoke/`).
2. Ábrela una vez en el celular con internet y elige *Agregar a pantalla de inicio* / *Instalar app*.
3. Desde ese momento abre y funciona sin internet (`frontend/sw.js` guarda todos los archivos). Las llamadas al servidor del almacén (`/api/`) nunca se guardan en caché.
4. Con internet, la app siempre carga la versión más nueva; sin internet (o si la red tarda más de 4 segundos) usa la última copia guardada.
5. Si agregas o quitas archivos, actualiza la lista `ARCHIVOS` y sube el número de `VERSION` en `frontend/sw.js`.

## Estructura

```
TorqueStock/
├── index.html              Solo redirige a frontend/ (mantiene el link de GitHub Pages)
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
│   ├── js/datos.js         Datos y reglas: modo servidor (API) o demostración (LocalStorage) (RNF-05)
│   ├── js/sesion.js        Manejo de sesión
│   ├── js/cifrado.js       Cifrado de contraseñas (PBKDF2-SHA256)
│   ├── js/util.js          Utilidades de interfaz (etiquetas, fechas, CSV)
│   ├── js/app.js           Lógica del panel
│   ├── js/reportes.js      Lógica de reportes
│   ├── js/pwa.js           Registro del modo sin internet
│   ├── sw.js               Service worker: guarda la app para usarla sin conexión
│   ├── manifest.json       Datos para instalar la app en el celular
│   └── img/                Íconos de la app
│
└── backend/                Servidor y datos
    ├── servidor.py         Servidor del almacén: API, base de datos SQLite, contraseñas y permisos
    ├── servidor.ps1        Abre el Firewall y arranca servidor.py (sin Python: modo demostración)
    ├── torquestock.db      Base de datos (se crea sola; no se sube a GitHub)
    ├── registrar-usuario.ps1  Registra empleados con la contraseña cifrada
    └── data/               Datos iniciales en JSON: usuarios, catálogos, inventario e historial de ejemplo
```

> **API del servidor:** `POST /api/login`, `POST /api/logout`, `GET /api/estado`, `GET /api/version`, `POST /api/accion` (`alta`, `prestar`, `devolver`, `devolverConDanio`, `reparar`, `reincorporar`, `baja`, `calibrar`). Todas, menos el login, piden la sesión en el encabezado `Authorization: Bearer <token>`.

## Requerimientos cubiertos

| ID | Dónde |
|---|---|
| RF-01 Login | `frontend/index.html` (máx. 15 caracteres, solo letras y números, Enter para avanzar), contraseñas cifradas, permisos por rol |
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
