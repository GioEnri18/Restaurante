-- ============================================================================
-- Migración: Soporte para pedidos desde menú público web (Para llevar y Domicilio)
-- Agrega tipo_entrega ('DELIVERY' | 'LLEVAR'), origen ('POS' | 'WEB') y tracking_token
-- en pedidos_domicilio, permitiendo pedidos Para llevar sin dirección/zona ni usuario empleado.
-- Compatible con pos_app_rol (no altera triggers ni privilegios de auditoria_logs).
-- ============================================================================

ALTER TABLE "pedidos_domicilio"
  ADD COLUMN IF NOT EXISTS "tipo_entrega" VARCHAR(20) NOT NULL DEFAULT 'DELIVERY',
  ADD COLUMN IF NOT EXISTS "origen" VARCHAR(20) NOT NULL DEFAULT 'POS',
  ADD COLUMN IF NOT EXISTS "tracking_token" VARCHAR(40) NULL;

-- Permitir NULL en direccion_entrega_id, zona_entrega_id y creado_por_id para pedidos web / Para llevar
ALTER TABLE "pedidos_domicilio"
  ALTER COLUMN "direccion_entrega_id" DROP NOT NULL,
  ALTER COLUMN "zona_entrega_id" DROP NOT NULL,
  ALTER COLUMN "creado_por_id" DROP NOT NULL;

ALTER TABLE "pedido_domicilio_historial"
  ALTER COLUMN "usuario_id" DROP NOT NULL;

-- Restricciones de integridad (idempotentes mediante bloque DO)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_pedidos_domicilio_tipo_entrega'
  ) THEN
    ALTER TABLE "pedidos_domicilio"
      ADD CONSTRAINT "chk_pedidos_domicilio_tipo_entrega"
      CHECK ("tipo_entrega" IN ('DELIVERY', 'LLEVAR'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_pedidos_domicilio_origen'
  ) THEN
    ALTER TABLE "pedidos_domicilio"
      ADD CONSTRAINT "chk_pedidos_domicilio_origen"
      CHECK ("origen" IN ('POS', 'WEB'));
  END IF;
END $$;

-- Índice único parcial para seguimiento público por tracking_token sin exponer IDs internos
CREATE UNIQUE INDEX IF NOT EXISTS "uq_pedidos_domicilio_tracking_token"
  ON "pedidos_domicilio" ("tracking_token")
  WHERE "tracking_token" IS NOT NULL;

-- Índice compuesto para filtrar por sucursal + tipo_entrega + estado en el tablero POS
CREATE INDEX IF NOT EXISTS "idx_pedidos_domicilio_sucursal_tipo_estado"
  ON "pedidos_domicilio" ("sucursal_id", "tipo_entrega", "estado", "created_at" DESC);
