-- ============================================================================
-- Migración: Almacenamiento persistente de fotos de platillos en BD (Fase 5)
-- - Crea la tabla `platillo_fotos` para almacenar miniaturas WebP (<= 10 KB)
--   en PostgreSQL cuando `MEDIA_STORAGE=db` (evita pérdida en discos efímeros
--   como Render).
-- - Otorga a `pos_app_rol` únicamente SELECT, INSERT, UPDATE y DELETE sobre
--   `platillo_fotos` y USAGE/SELECT en su secuencia.
-- - No altera `auditoria_logs` ni sus privilegios append-only.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "platillo_fotos" (
  "id" SERIAL NOT NULL,
  "platillo_id" INTEGER,
  "nombre" VARCHAR(80) NOT NULL,
  "mime" VARCHAR(40) NOT NULL DEFAULT 'image/webp',
  "bytes" BYTEA NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "platillo_fotos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platillo_fotos_platillo_fkey" FOREIGN KEY ("platillo_id")
    REFERENCES "platillos"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "platillo_fotos_bytes_len_chk" CHECK (octet_length("bytes") BETWEEN 1 AND 100000)
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_platillo_fotos_nombre"
  ON "platillo_fotos" ("nombre");

CREATE INDEX IF NOT EXISTS "idx_platillo_fotos_platillo_id"
  ON "platillo_fotos" ("platillo_id")
  WHERE "platillo_id" IS NOT NULL;

-- Privilegios mínimos para pos_app_rol sobre platillo_fotos únicamente
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pos_app_rol')
     AND pg_has_role(current_user, 'pos_app_rol', 'USAGE') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "platillo_fotos" TO pos_app_rol;
    GRANT USAGE, SELECT ON SEQUENCE "platillo_fotos_id_seq" TO pos_app_rol;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Privilegios insuficientes para ajustar grants de platillo_fotos (entorno gestionado).';
END
$$;
