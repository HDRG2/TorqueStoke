# TorqueStock

Sistema Web de Gestión de Almacén de Herramientas de Torque — Grupo Industrial Par-Tec.
PIA · Lic. en Tecnologías de Información · FACPYA UANL · Equipo OOZMA KAPPA.

## Cómo ejecutarlo

Los datos iniciales vienen de archivos JSON, y el navegador solo los puede leer si la app se abre **desde un servidor**. Con doble clic en `index.html` aparece un aviso. Ábrela de alguna de estas formas:

- Doble clic en `Iniciar servidor.bat` (ver *Uso sin internet*).
- En VS Code, abre `index.html` y haz clic en **Go Live**.
- El link de GitHub Pages: `https://hdrg2.github.io/TorqueStoke/`.

No requiere instalar nada ni internet.

| Rol | Usuario | Contraseña |
|---|---|---|
| Jefe de almacén (Administrador) | `jefe` | `jefe123` |
| Almacenista de ventanilla | `almacen` | `almacen123` |
| Ingeniero de calidad | `calidad` | `calidad123` |

Los cambios que haces en la app se guardan en el navegador (LocalStorage). El Jefe de almacén puede usar **Restablecer demo** para volver a los datos de ejemplo.

## Datos (carpeta `data/`)

| Archivo | Contenido |
|---|---|
| `usuarios.json` | Usuarios, contraseñas y permisos por rol |
| `catalogos.json` | Líneas de producción, categorías, días de aviso del semáforo (15) y horas del turno (8) |
| `herramientas.json` | Inventario inicial |
| `historial-demo.json` | Préstamos, devoluciones, recalibraciones y reparaciones de ejemplo |

Las fechas son **relativas** para que la demo nunca se vea vieja: `"diasParaCalibracion": 9` significa "vence dentro de 9 días" y `"horasAtras": 2` significa "hace 2 horas"; un número negativo es una fecha que ya pasó.

**Cómo aplicar cambios a los JSON:** el navegador conserva los datos que ya tenía guardados, así que, después de editar un archivo, entra como Jefe y presiona **Restablecer demo**. Los cambios a `usuarios.json` y `catalogos.json` se ven con solo recargar la página. Si usas la app instalada en el celular, sube también la `VERSION` de `sw.js`.

## Uso sin internet

**A) Servidor local (sin internet, celular en el mismo WiFi o hotspot)**
1. Doble clic en `Iniciar servidor.bat` y acepta el permiso de administrador.
2. La ventana muestra una dirección como `http://192.168.1.50:8080`: ábrela en el celular.
3. Deja la ventana abierta mientras la usas.

**B) App instalada en el celular (PWA)**
1. Publica la carpeta en GitHub Pages (`https://hdrg2.github.io/TorqueStoke/`).
2. Ábrela una vez en el celular con internet y elige *Agregar a pantalla de inicio* / *Instalar app*.
3. Desde ese momento abre y funciona sin internet (`sw.js` guarda todos los archivos).
4. Si cambias archivos, sube el número de `VERSION` en `sw.js` para que el celular descargue la versión nueva.

## Estructura

```
index.html        Inicio de sesión (RF-01)
panel.html        Panel: KPIs, alerta de turno, inventario, ficha/historial, bitácora
reportes.html     Reportes de utilización, agenda de calibración, bitácora, CSV e impresión
ayuda.html        Manual de usuario
acerca.html       Ficha del proyecto, equipo y trazabilidad de requerimientos
css/styles.css    Estilos, diseño responsivo (RNF-04) e impresión
data/*.json       Datos iniciales: usuarios, catálogos, inventario e historial de ejemplo
js/datos.js       Carga de los JSON y reglas de negocio: semáforo, bloqueo, estados, permisos (RNF-05)
js/sesion.js      Manejo de sesión
js/util.js        Utilidades de interfaz (etiquetas, fechas, CSV)
js/app.js         Lógica del panel
js/reportes.js    Lógica de reportes
js/pwa.js         Registro del modo sin internet
sw.js             Service worker: guarda la app para usarla sin conexión
manifest.json     Datos para instalar la app en el celular
img/              Íconos de la app
servidor.ps1      Servidor local para abrirla desde el celular sin internet
Iniciar servidor.bat  Doble clic para arrancar el servidor
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

- **Jefe:** reparación externa, baja definitiva, alerta de préstamos que exceden el turno (8 h), reportes ejecutivos.
- **Almacenista:** préstamo, devolución, devolución con daño, reincorporación tras reparación.
- **Calidad:** semáforo, recalibración, historial por herramienta exportable, agenda de calibración.

## Incrementos (modelo incremental)

- **Incremento 1:** RF-01, RF-02, RF-03, RNF-03, RNF-04
- **Incremento 2:** RF-04, RF-05, RNF-01
- **Incremento 3:** RF-06, RF-07, RF-08, RNF-02, RNF-05
