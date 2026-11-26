-- ============================================================================
-- Migración: Store compartido de rate limiting en PostgreSQL (Fase 3)
-- - Crea la tabla UNLOGGED `rate_limit_entries` para compartir contadores entre
--   múltiples instancias/reinicios de la API sin sobrecargar el WAL.
-- - Índice por `expira_en` para limpieza periódica no bloqueante de ventanas vencidas.
-- - Otorga a `pos_app_rol` únicamente SELECT, INSERT, UPDATE y DELETE sobre esta
--   tabla efímera (sin tocar `auditoria_logs` ni ninguna tabla contable).
-- ============================================================================

CREATE UNLOGGED TABLE IF NOT EXISTS "rate_limit_entries" (
  "clave" VARCHAR(255) NOT NULL,
  "conteo" INTEGER NOT NULL,
  "expira_en" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "rate_limit_entries_pkey" PRIMARY KEY ("clave"),
  CONSTRAINT "rate_limit_entries_conteo_chk" CHECK ("conteo" >= 0)
);

CREATE INDEX IF NOT EXISTS "idx_rate_limit_entries_expira_en"
  ON "rate_limit_entries" ("expira_en");

-- Privilegios mínimos para pos_app_rol únicamente sobre rate_limit_entries
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pos_app_rol')
     AND pg_has_role(current_user, 'pos_app_rol', 'USAGE') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "rate_limit_entries" TO pos_app_rol;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Privilegios insuficientes para ajustar grants de rate_limit_entries (entorno gestionado).';
END
$$;
