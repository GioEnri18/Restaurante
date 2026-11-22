-- Garantiza de forma idempotente la existencia de los roles base del POS
-- (ADMIN, CAJERO, MESERO y AUDITOR) y sus permisos esenciales, incluyendo
-- `caja:autorizar` para ADMIN y AUDITOR (control dual de apertura/cierre de caja).
-- No sobrescribe ni borra permisos personalizados ya configurados por el administrador.

INSERT INTO "roles" ("codigo", "nombre", "descripcion", "vista_inicial", "es_sistema", "activo", "updated_at")
VALUES
  ('ADMIN', 'Administrador', 'Control total del restaurante, reportes, auditoría y administración de accesos', '/reportes', true, true, CURRENT_TIMESTAMP),
  ('CAJERO', 'Cajero', 'Toma de órdenes en mostrador y control/cuadre de caja diaria', '/ventas', true, true, CURRENT_TIMESTAMP),
  ('MESERO', 'Mesero', 'Atención en mesa y pedidos para llevar desde el menú táctil', '/ventas', true, true, CURRENT_TIMESTAMP),
  ('AUDITOR', 'Auditor', 'Supervisión de caja y consulta de solo lectura sobre reportes, auditoría, facturas, inventario y mermas', '/auditoria', false, true, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO NOTHING;

-- Garantizar que ADMIN tenga todos los permisos registrados
INSERT INTO "rol_permisos" ("rol_id", "permiso_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permisos" p
WHERE r."codigo" = 'ADMIN'
ON CONFLICT DO NOTHING;

-- Garantizar que AUDITOR conserve `caja:autorizar` y permisos base de consulta
INSERT INTO "rol_permisos" ("rol_id", "permiso_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permisos" p ON p."codigo" IN (
  'reportes:ver',
  'reportes:exportar',
  'auditoria:ver',
  'facturas:ver',
  'caja:ver',
  'caja:autorizar',
  'inventario:ver',
  'mermas:ver'
)
WHERE r."codigo" = 'AUDITOR'
ON CONFLICT DO NOTHING;

-- Garantizar permisos base de CAJERO si el rol recién fue creado sin permisos
INSERT INTO "rol_permisos" ("rol_id", "permiso_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permisos" p ON p."codigo" IN (
  'ventas:ver',
  'ventas:crear',
  'caja:ver',
  'caja:abrir',
  'caja:movimiento',
  'caja:cerrar'
)
WHERE r."codigo" = 'CAJERO'
  AND NOT EXISTS (SELECT 1 FROM "rol_permisos" rp WHERE rp."rol_id" = r."id")
ON CONFLICT DO NOTHING;

-- Garantizar permisos base de MESERO si el rol recién fue creado sin permisos
INSERT INTO "rol_permisos" ("rol_id", "permiso_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permisos" p ON p."codigo" IN (
  'ventas:ver',
  'ventas:crear',
  'facturas:ver'
)
WHERE r."codigo" = 'MESERO'
  AND NOT EXISTS (SELECT 1 FROM "rol_permisos" rp WHERE rp."rol_id" = r."id")
ON CONFLICT DO NOTHING;
