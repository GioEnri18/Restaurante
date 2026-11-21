-- Rol de base de datos de mínimo privilegio para la API (la migración la ejecuta el dueño del esquema).
-- pos_app_rol es un rol de GRUPO sin login: el usuario de login de la API se crea con
-- `npm run db:crear-rol-app` (toma usuario y contraseña de variables de entorno, nunca de archivos).
--
-- Qué puede hacer la API con este rol:
--   - SELECT / INSERT / UPDATE en las tablas de negocio.
--   - DELETE solo en las 5 tablas de configuración que el código reemplaza por completo.
--   - auditoria_logs: solo SELECT e INSERT (sin UPDATE, DELETE ni TRUNCATE).
-- Qué NO puede: borrar ventas, facturas, caja o inventario; alterar esquema; quitar triggers;
-- tocar schema_migrations.

-- En proveedores PostgreSQL gestionados sin permiso CREATEROLE (p. ej. Render Managed PostgreSQL),
-- se captura insufficient_privilege para no bloquear el despliegue manteniendo intacto el trigger
-- de inmutabilidad de auditoria_logs. En Docker/VPS propios el rol y todos sus privilegios se aplican completo.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pos_app_rol') THEN
    CREATE ROLE pos_app_rol NOLOGIN;
  END IF;

  GRANT USAGE ON SCHEMA public TO pos_app_rol;
  REVOKE CREATE ON SCHEMA public FROM pos_app_rol;

  GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO pos_app_rol;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pos_app_rol;

  -- DELETE únicamente donde el código reemplaza filas (permisos, recetas y menús especiales)
  GRANT DELETE ON "rol_permisos", "usuario_permisos", "receta_ingredientes",
    "menus_especiales", "menu_especial_platillos" TO pos_app_rol;

  -- Bitácora de auditoría: append-only también a nivel de privilegios
  REVOKE UPDATE, DELETE, TRUNCATE ON "auditoria_logs" FROM pos_app_rol;

  -- El historial de migraciones no es asunto de la API
  REVOKE ALL ON "schema_migrations" FROM pos_app_rol;

  -- Tablas y secuencias futuras creadas por el dueño heredan los permisos básicos
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO pos_app_rol;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO pos_app_rol;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'PostgreSQL gestionado sin CREATEROLE: se omite pos_app_rol y se mantiene el trigger de auditoría inmutable.';
END
$$;

-- El trigger de inmutabilidad (fase 2) solo cubría UPDATE/DELETE por fila: TRUNCATE lo saltaba
DROP TRIGGER IF EXISTS trg_auditoria_logs_no_truncate ON auditoria_logs;
CREATE TRIGGER trg_auditoria_logs_no_truncate
BEFORE TRUNCATE ON auditoria_logs
FOR EACH STATEMENT
EXECUTE FUNCTION fn_bloquear_modificacion_auditoria();
