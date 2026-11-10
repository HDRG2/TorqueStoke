# TorqueStock

Sistema Web de Gestión de Almacén de Herramientas de Torque — Grupo Industrial Par-Tec.
PIA · Lic. en Tecnologías de Información · FACPYA UANL · Equipo OOZMA KAPPA.

## Cómo ejecutarlo

En la terminal de VS Code, dentro de la carpeta del proyecto:

```powershell
start msedge "$PWD\index.html"
```

o abre `index.html` y haz clic en **Go Live**. No requiere instalar nada ni internet.

| Rol | Usuario | Contraseña |
|---|---|---|
| Jefe de almacén (Administrador) | `jefe` | `jefe123` |
| Almacenista de ventanilla | `almacen` | `almacen123` |
| Ingeniero de calidad | `calidad` | `calidad123` |

Los datos se guardan en el navegador (LocalStorage). El Jefe de almacén puede usar **Restablecer demo** para volver a los datos de ejemplo.

## Estructura

```
index.html        Inicio de sesión (RF-01)
panel.html        Panel: KPIs, alerta de turno, inventario, ficha/historial, bitácora
reportes.html     Reportes de utilización, agenda de calibración, bitácora, CSV e impresión
ayuda.html        Manual de usuario
acerca.html       Ficha del proyecto, equipo y trazabilidad de requerimientos
css/styles.css    Estilos, diseño responsivo (RNF-04) e impresión
js/datos.js       Datos y reglas de negocio: semáforo, bloqueo, estados, permisos (RNF-05)
js/sesion.js      Manejo de sesión
js/util.js        Utilidades de interfaz (etiquetas, fechas, CSV)
js/app.js         Lógica del panel
js/reportes.js    Lógica de reportes
```

## Requerimientos cubiertos

| ID | Dónde |
|---|---|
| RF-01 Login | `index.html` (máx. 15 caracteres, solo letras y números, Enter para avanzar), permisos por rol |
| RF-02 Alta | **+ Nueva herramienta** (Jefe) |
| RF-03 Búsqueda y filtros | Buscador + filtros por estado, semáforo y turno |
| RF-04 Préstamos | **Prestar** → empleado, nombre, línea |
| RF-05 Devoluciones | **Devolver** en un clic; **Devolver con daño** tras inspección |
| RF-06 Semáforo + bloqueo | Verde / Amarillo (≤ 15 días) / Rojo (préstamo bloqueado) |
| RF-07 Recalibración | **Calibración** (Calidad / Jefe) |
| RF-08 Dashboard | 6 tarjetas KPI + movimientos recientes |
| RNF-01 a RNF-05 | Ver `acerca.html` → Trazabilidad |

## Funciones por rol (Sección 1.2 del PIA)

- **Jefe:** reparación externa, baja definitiva, reporte de extravío con responsable, alerta de préstamos que exceden el turno (8 h), reportes ejecutivos.
- **Almacenista:** préstamo, devolución, devolución con daño, reincorporación tras reparación.
- **Calidad:** semáforo, recalibración, historial por herramienta exportable, agenda de calibración.

## Incrementos (modelo incremental)

- **Incremento 1:** RF-01, RF-02, RF-03, RNF-03, RNF-04
- **Incremento 2:** RF-04, RF-05, RNF-01
- **Incremento 3:** RF-06, RF-07, RF-08, RNF-02, RNF-05
