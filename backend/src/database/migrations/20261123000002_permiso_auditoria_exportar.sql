-- Fase 3 (Auditoría de investigación): permiso dedicado para exportar la bitácora en CSV.
-- Se asigna únicamente a Administrador (ADMIN) y Auditor (AUDITOR).
-- Ningún rol operativo (CAJERO, MESERO, CHEF) recibe acceso.

INSERT INTO "permisos" ("codigo", "vista", "accion", "descripcion")
VALUES (
  'auditoria:exportar',
  'auditoria',
  'exportar',
  'Exportar bitácora de auditoría en formato CSV'
)
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "rol_permisos" ("rol_id", "permiso_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permisos" p ON p."codigo" = 'auditoria:exportar'
WHERE r."codigo" IN ('ADMIN', 'AUDITOR')
ON CONFLICT DO NOTHING;
