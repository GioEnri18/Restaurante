-- Fase 1 (Auditoría de investigación): columnas de contexto de negocio, severidad,
-- aprobador, turno de caja, motivo estandarizado, impacto financiero y correlación.
--
-- Reglas estrictas:
--   - Tabla APPEND-ONLY: TODAS las columnas nuevas son NULLABLE y NO se hace backfill
--     (los triggers trg_auditoria_logs_inmutable y trg_auditoria_logs_no_truncate permanecen intactos).
--   - pos_app_rol conserva estrictamente SELECT e INSERT sobre auditoria_logs.

ALTER TABLE "auditoria_logs"
  ADD COLUMN IF NOT EXISTS "actor_rol_codigo" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "aprobador_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "caja_sesion_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "severidad" VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "codigo_motivo" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "impacto_financiero" NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS "correlacion_id" UUID;

-- Restricciones de integridad (idempotentes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auditoria_logs_severidad_check'
  ) THEN
    ALTER TABLE "auditoria_logs"
      ADD CONSTRAINT "auditoria_logs_severidad_check"
      CHECK ("severidad" IS NULL OR "severidad" IN ('BAJA', 'MEDIA', 'ALTA'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auditoria_logs_aprobador_id_fkey'
  ) THEN
    ALTER TABLE "auditoria_logs"
      ADD CONSTRAINT "auditoria_logs_aprobador_id_fkey"
      FOREIGN KEY ("aprobador_id") REFERENCES "usuarios"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auditoria_logs_caja_sesion_id_fkey'
  ) THEN
    ALTER TABLE "auditoria_logs"
      ADD CONSTRAINT "auditoria_logs_caja_sesion_id_fkey"
      FOREIGN KEY ("caja_sesion_id") REFERENCES "caja_sesiones"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- Índices compuestos para consultas de investigación, resumen y alertas de auditoría
CREATE INDEX IF NOT EXISTS "auditoria_logs_sucursal_id_created_at_idx"
  ON "auditoria_logs" ("sucursal_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "auditoria_logs_sucursal_accion_created_at_idx"
  ON "auditoria_logs" ("sucursal_id", "accion", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "auditoria_logs_sucursal_usuario_created_at_idx"
  ON "auditoria_logs" ("sucursal_id", "usuario_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "auditoria_logs_sucursal_caja_sesion_idx"
  ON "auditoria_logs" ("sucursal_id", "caja_sesion_id");

CREATE INDEX IF NOT EXISTS "auditoria_logs_sucursal_alta_created_at_idx"
  ON "auditoria_logs" ("sucursal_id", "created_at" DESC)
  WHERE "severidad" = 'ALTA';

CREATE INDEX IF NOT EXISTS "auditoria_logs_sucursal_aprobador_created_at_idx"
  ON "auditoria_logs" ("sucursal_id", "aprobador_id", "created_at" DESC)
  WHERE "aprobador_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "auditoria_logs_correlacion_id_idx"
  ON "auditoria_logs" ("correlacion_id")
  WHERE "correlacion_id" IS NOT NULL;

-- Garantizar que pos_app_rol mantenga exclusivamente SELECT e INSERT (sin UPDATE/DELETE/TRUNCATE)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pos_app_rol') THEN
    GRANT SELECT, INSERT ON "auditoria_logs" TO pos_app_rol;
    REVOKE UPDATE, DELETE, TRUNCATE ON "auditoria_logs" FROM pos_app_rol;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Sin privilegios sobre pos_app_rol en este entorno: se conservan intactos los triggers append-only.';
END
$$;
