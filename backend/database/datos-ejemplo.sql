-- =========================================================
--  TorqueStock - Datos de ejemplo
--  El servidor carga este archivo SOLO cuando crea una base nueva.
--  Las fechas son relativas al día en que se crea la base, para
--  que la demo siempre muestre herramientas en verde, amarillo y rojo.
--
--  Contraseñas de los usuarios de ejemplo (solo se guarda su
--  hash PBKDF2-SHA256): jefe123, almacen123, calidad123.
-- =========================================================

PRAGMA foreign_keys = ON;

BEGIN;

INSERT INTO roles (rol, nombre) VALUES
    ('Administrador', 'Jefe de almacén'),
    ('Almacenista', 'Almacenista'),
    ('Calidad', 'Ingeniero de calidad');

INSERT INTO permisos (rol, permiso, permitido) VALUES
    ('Administrador', 'alta', 1),
    ('Administrador', 'prestar', 1),
    ('Administrador', 'calibrar', 1),
    ('Administrador', 'reparar', 1),
    ('Administrador', 'reincorporar', 1),
    ('Administrador', 'baja', 1),
    ('Administrador', 'reportes', 1),
    ('Administrador', 'acerca', 1),
    ('Almacenista', 'alta', 0),
    ('Almacenista', 'prestar', 1),
    ('Almacenista', 'calibrar', 0),
    ('Almacenista', 'reparar', 0),
    ('Almacenista', 'reincorporar', 1),
    ('Almacenista', 'baja', 0),
    ('Almacenista', 'reportes', 0),
    ('Almacenista', 'acerca', 0),
    ('Calidad', 'alta', 0),
    ('Calidad', 'prestar', 0),
    ('Calidad', 'calibrar', 1),
    ('Calidad', 'reparar', 0),
    ('Calidad', 'reincorporar', 0),
    ('Calidad', 'baja', 0),
    ('Calidad', 'reportes', 1),
    ('Calidad', 'acerca', 0);

INSERT INTO usuarios (usuario, nombre, rol, sal, hash, creado) VALUES
    ('jefe', 'Jefe de Almacén', 'Administrador',
     'c1b1d5168372d070da06b9d713525eb6',
     '5abdd9f35917650a5f62db3abcb65b6ec90468499f4ea7018cbb204c08ec24df', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+0 hours')),
    ('almacen', 'Almacenista Turno 1', 'Almacenista',
     'dd4aa51f252b98dda191fc799ae52aa2',
     '09d22ddcb0b43b084433d7af840b91a1e743507a9fc7c32eff1d856257af196f', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+0 hours')),
    ('calidad', 'Ing. de Calidad', 'Calidad',
     '128ae1afab7842ee50f209c492e02887',
     '6b25f0d07e32363871d669e1413531b01757f8bc1468df2e6bdee6c0e1f3427a', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+0 hours'));

INSERT INTO lineas (nombre, orden) VALUES
    ('Línea 1', 1),
    ('Línea 2', 2),
    ('Línea 3', 3),
    ('Línea 4', 4),
    ('Línea 5', 5),
    ('Línea 6', 6),
    ('Mantenimiento', 7);

INSERT INTO categorias (nombre, orden) VALUES
    ('Llave dinamométrica de clic', 1),
    ('Torquímetro digital', 2),
    ('Desarmador dinamométrico', 3),
    ('Multiplicador de par', 4),
    ('Atornillador neumático', 5);

INSERT INTO configuracion (clave, valor, descripcion) VALUES
    ('diasAviso', '15', 'Semáforo amarillo: la calibración vence en estos días o menos (RF-06)'),
    ('horasTurno', '8', 'Un préstamo que pasa de estas horas excede el turno'),
    ('iteraciones', '100000', 'Repeticiones de PBKDF2-SHA256 al cifrar contraseñas');

INSERT INTO herramientas (codigo, nombre, categoria, torque_min, torque_max, proxima_calibracion,
                          estado, nota, prestamo_empleado, prestamo_operador, prestamo_linea, prestamo_fecha) VALUES
    ('TQ-001', 'Llave de clic 3/8" Norbar', 'Llave dinamométrica de clic', 20, 100, date('now', 'localtime', '+120 days'),
     'Disponible', '', NULL, NULL, NULL, NULL),
    ('TQ-002', 'Llave de clic 1/2" Tohnichi', 'Llave dinamométrica de clic', 40, 200, date('now', 'localtime', '+75 days'),
     'En préstamo', '', '10452', 'Luis Hernández', 'Línea 2', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours')),
    ('TQ-003', 'Torquímetro digital CDI 2503', 'Torquímetro digital', 10, 340, date('now', 'localtime', '+9 days'),
     'Disponible', '', NULL, NULL, NULL, NULL),
    ('TQ-004', 'Torquímetro digital Snap-on ATECH', 'Torquímetro digital', 5, 135, date('now', 'localtime', '+200 days'),
     'Disponible', '', NULL, NULL, NULL, NULL),
    ('TQ-005', 'Desarmador dinamométrico Wera', 'Desarmador dinamométrico', 1, 5, date('now', 'localtime', '-4 days'),
     'Disponible', '', NULL, NULL, NULL, NULL),
    ('TQ-006', 'Desarmador dinamométrico Wiha', 'Desarmador dinamométrico', 0.5, 3, date('now', 'localtime', '+45 days'),
     'Disponible', '', NULL, NULL, NULL, NULL),
    ('TQ-007', 'Multiplicador de par Norbar HT', 'Multiplicador de par', 300, 1500, date('now', 'localtime', '+160 days'),
     'En préstamo', '', '20871', 'Ana Martínez', 'Mantenimiento', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hours')),
    ('TQ-008', 'Atornillador neumático Atlas Copco', 'Atornillador neumático', 8, 40, date('now', 'localtime', '+13 days'),
     'Disponible', '', NULL, NULL, NULL, NULL),
    ('TQ-009', 'Llave de clic 3/4" Proto', 'Llave dinamométrica de clic', 100, 600, date('now', 'localtime', '-20 days'),
     'Disponible', '', NULL, NULL, NULL, NULL),
    ('TQ-010', 'Torquímetro digital Stahlwille', 'Torquímetro digital', 20, 400, date('now', 'localtime', '+90 days'),
     'Disponible', '', NULL, NULL, NULL, NULL),
    ('TQ-011', 'Llave de clic 1/4" Gedore', 'Llave dinamométrica de clic', 5, 25, date('now', 'localtime', '+60 days'),
     'En reparación', 'Mecanismo de clic no dispara. Enviada a mantenimiento.', NULL, NULL, NULL, NULL),
    ('TQ-012', 'Atornillador neumático Ingersoll', 'Atornillador neumático', 10, 60, date('now', 'localtime', '+30 days'),
     'En préstamo', '', '33620', 'Rosa Salinas', 'Línea 6', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-11 hours')),
    ('TQ-013', 'Llave de clic 1/2" CDI', 'Llave dinamométrica de clic', 30, 150, date('now', 'localtime', '+100 days'),
     'En préstamo', '', '15530', 'Pedro Ruiz', 'Línea 5', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-9 hours')),
    ('TQ-014', 'Multiplicador de par Hytorc', 'Multiplicador de par', 500, 3000, date('now', 'localtime', '+140 days'),
     'Disponible', '', NULL, NULL, NULL, NULL);

INSERT INTO movimientos (fecha, tipo, codigo, detalle, usuario) VALUES
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-150 hours'), 'Préstamo', 'TQ-001', 'Carlos Treviño (#30115) → Línea 1', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-143 hours'), 'Devolución', 'TQ-001', 'Recibida de Carlos Treviño (#30115), Línea 1', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-139 hours'), 'Préstamo', 'TQ-003', 'María López (#41208) → Línea 3', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-132 hours'), 'Devolución', 'TQ-003', 'Recibida de María López (#41208), Línea 3', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-128 hours'), 'Préstamo', 'TQ-010', 'José Garza (#28844) → Línea 4', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-121 hours'), 'Devolución', 'TQ-010', 'Recibida de José Garza (#28844), Línea 4', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-117 hours'), 'Préstamo', 'TQ-001', 'Carlos Treviño (#30115) → Línea 1', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-110 hours'), 'Devolución', 'TQ-001', 'Recibida de Carlos Treviño (#30115), Línea 1', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-106 hours'), 'Préstamo', 'TQ-004', 'Ana Martínez (#20871) → Mantenimiento', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-99 hours'), 'Devolución', 'TQ-004', 'Recibida de Ana Martínez (#20871), Mantenimiento', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-95 hours'), 'Préstamo', 'TQ-011', 'Pedro Ruiz (#15530) → Línea 5', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-88 hours'), 'Devolución', 'TQ-011', 'Recibida de Pedro Ruiz (#15530), Línea 5', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-84 hours'), 'Préstamo', 'TQ-003', 'Luis Hernández (#10452) → Línea 2', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-77 hours'), 'Devolución', 'TQ-003', 'Recibida de Luis Hernández (#10452), Línea 2', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-73 hours'), 'Préstamo', 'TQ-012', 'María López (#41208) → Línea 3', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-66 hours'), 'Devolución', 'TQ-012', 'Recibida de María López (#41208), Línea 3', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-62 hours'), 'Préstamo', 'TQ-001', 'José Garza (#28844) → Línea 4', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-60 hours'), 'Recalibración', 'TQ-004', 'Vigencia ' || date('now', 'localtime', '-2 days') || ' → ' || date('now', 'localtime', '+200 days'), 'calidad'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-55 hours'), 'Devolución', 'TQ-001', 'Recibida de José Garza (#28844), Línea 4', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-51 hours'), 'Préstamo', 'TQ-006', 'Rosa Salinas (#33620) → Línea 6', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-44 hours'), 'Devolución', 'TQ-006', 'Recibida de Rosa Salinas (#33620), Línea 6', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-40 hours'), 'Préstamo', 'TQ-010', 'Carlos Treviño (#30115) → Línea 1', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-33 hours'), 'Devolución', 'TQ-010', 'Recibida de Carlos Treviño (#30115), Línea 1', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 hours'), 'Devolución', 'TQ-011', 'Recibida de Pedro Ruiz (#15530), Línea 5 — CON DAÑO: mecanismo de clic no dispara', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 hours'), 'Reparación', 'TQ-011', 'Mecanismo de clic no dispara. Enviada a mantenimiento.', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-29 hours'), 'Préstamo', 'TQ-013', 'Pedro Ruiz (#15530) → Línea 5', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-22 hours'), 'Devolución', 'TQ-013', 'Recibida de Pedro Ruiz (#15530), Línea 5', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-11 hours'), 'Préstamo', 'TQ-012', 'Rosa Salinas (#33620) → Línea 6', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-9 hours'), 'Préstamo', 'TQ-013', 'Pedro Ruiz (#15530) → Línea 5', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours'), 'Préstamo', 'TQ-002', 'Luis Hernández (#10452) → Línea 2', 'almacen'),
    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hours'), 'Préstamo', 'TQ-007', 'Ana Martínez (#20871) → Mantenimiento', 'almacen');

INSERT INTO meta (clave, valor) VALUES ('version', '1');

-- Las herramientas en reparación deben recalibrarse antes de volver a prestarse
UPDATE herramientas SET requiere_calibracion = 1 WHERE estado = 'En reparación';

COMMIT;
