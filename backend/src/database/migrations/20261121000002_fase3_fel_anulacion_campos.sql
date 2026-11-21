-- Fase 3.2 y 3.3: Trazabilidad persistente de certificación y anulación FEL (SAT Guatemala)
-- Permite registrar el resultado asíncrono/post-commit sin bloquear ni revertir transacciones del POS.

ALTER TABLE "facturas"
  ADD COLUMN IF NOT EXISTS "fel_anulacion_estado" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "fel_anulacion_uuid" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "fel_anulada_en" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fel_error_detalle" VARCHAR(300);
