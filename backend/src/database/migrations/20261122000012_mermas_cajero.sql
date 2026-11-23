INSERT INTO "rol_permisos" ("rol_id", "permiso_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permisos" p ON p."codigo" IN ('mermas:ver', 'mermas:crear')
WHERE r."codigo" = 'CAJERO'
ON CONFLICT DO NOTHING;
