-- =========================================================
--  TorqueStock - Esquema de la base de datos (SQLite)
--  Tablas del sistema. El servidor aplica este archivo cada vez
--  que arranca; como todo es "IF NOT EXISTS", nunca borra datos.
--  Archivo de la base: backend/database/torquestock.db
-- =========================================================

PRAGMA foreign_keys = ON;

-- Sección 8 del PIA: clases de usuarios y lo que puede hacer cada una
CREATE TABLE IF NOT EXISTS roles (
    rol     TEXT PRIMARY KEY,          -- nombre interno (Administrador, Almacenista, Calidad)
    nombre  TEXT NOT NULL              -- nombre en pantalla (Jefe de almacén…)
);

CREATE TABLE IF NOT EXISTS permisos (
    rol        TEXT NOT NULL REFERENCES roles (rol),
    permiso    TEXT NOT NULL,          -- alta, prestar, calibrar, reparar, reincorporar, baja, reportes, acerca
    permitido  INTEGER NOT NULL DEFAULT 0 CHECK (permitido IN (0, 1)),
    PRIMARY KEY (rol, permiso)
);

CREATE TABLE IF NOT EXISTS usuarios (
    usuario  TEXT PRIMARY KEY,         -- máx. 15, solo letras y números (RF-01)
    nombre   TEXT NOT NULL,
    rol      TEXT NOT NULL REFERENCES roles (rol),
    sal      TEXT NOT NULL,            -- sal aleatoria (hexadecimal)
    hash     TEXT NOT NULL,            -- PBKDF2-SHA256 de la contraseña con la sal
    creado   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sesiones (
    token    TEXT PRIMARY KEY,
    usuario  TEXT NOT NULL REFERENCES usuarios (usuario) ON DELETE CASCADE,
    expira   REAL NOT NULL             -- segundos desde 1970
);

-- Catálogos y configuración
CREATE TABLE IF NOT EXISTS lineas (
    nombre  TEXT PRIMARY KEY,
    orden   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS categorias (
    nombre  TEXT PRIMARY KEY,
    orden   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS configuracion (
    clave        TEXT PRIMARY KEY,
    valor        TEXT NOT NULL,
    descripcion  TEXT NOT NULL
);

-- Inventario (RF-02) con su estado actual y, si está prestada, el préstamo (RF-04)
CREATE TABLE IF NOT EXISTS herramientas (
    codigo               TEXT PRIMARY KEY,
    nombre               TEXT NOT NULL,
    categoria            TEXT NOT NULL REFERENCES categorias (nombre),
    torque_min           REAL NOT NULL,
    torque_max           REAL NOT NULL,
    proxima_calibracion  TEXT NOT NULL,   -- AAAA-MM-DD (RF-06 / RF-07)
    estado               TEXT NOT NULL CHECK (estado IN ('Disponible', 'En préstamo', 'En reparación', 'Baja')),
    nota                 TEXT NOT NULL DEFAULT '',
    prestamo_empleado    TEXT,
    prestamo_operador    TEXT,
    prestamo_linea       TEXT REFERENCES lineas (nombre),
    prestamo_fecha       TEXT
);

-- Bitácora: cada préstamo, devolución, reparación, calibración, alta y baja
CREATE TABLE IF NOT EXISTS movimientos (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha    TEXT NOT NULL,            -- fecha y hora UTC (ISO 8601)
    tipo     TEXT NOT NULL,
    codigo   TEXT NOT NULL REFERENCES herramientas (codigo),
    detalle  TEXT NOT NULL,
    usuario  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mov_fecha ON movimientos (fecha);
CREATE INDEX IF NOT EXISTS idx_mov_codigo ON movimientos (codigo);

-- Número que sube con cada cambio: así los equipos saben cuándo actualizar la pantalla
CREATE TABLE IF NOT EXISTS meta (
    clave  TEXT PRIMARY KEY,
    valor  TEXT NOT NULL
);
