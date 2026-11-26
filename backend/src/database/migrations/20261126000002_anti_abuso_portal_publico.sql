-- ============================================================================
-- Migración: Controles anti-abuso del portal público de pedidos (Fase 2)
-- - Agrega `bloqueado_pedidos_web` en `clientes` para bloqueo manual por Admin.
-- - Crea índices parciales sobre `pedidos_domicilio` (origen = 'WEB') para
--   validar límites en BD por teléfono, dirección normalizada y sucursal.
-- - No modifica `auditoria_logs` ni sus triggers/privilegios append-only.
-- - Compatible con `pos_app_rol` (las columnas heredan privilegios de tabla).
-- ============================================================================

-- 1. Marca de bloqueo de pedidos web por cliente (gestionada por Admin con domicilios:configurar)
ALTER TABLE "clientes"
  ADD COLUMN IF NOT EXISTS "bloqueado_pedidos_web" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "idx_clientes_sucursal_bloqueado_web"
  ON "clientes" ("sucursal_id", "bloqueado_pedidos_web")
  WHERE "bloqueado_pedidos_web" = true;

-- 2. Índice parcial para pedidos web pendientes sin confirmar por sucursal (protege el tablero POS)
CREATE INDEX IF NOT EXISTS "idx_pedidos_domicilio_web_sucursal_pendientes"
  ON "pedidos_domicilio" ("sucursal_id", "created_at" DESC)
  WHERE "origen" = 'WEB' AND "estado" = 'NUEVO';

-- 3. Índice parcial para límites por teléfono normalizado (pendientes en ventana y total por día)
CREATE INDEX IF NOT EXISTS "idx_pedidos_domicilio_web_sucursal_tel_fecha"
  ON "pedidos_domicilio" ("sucursal_id", "cliente_telefono_snapshot", "created_at" DESC)
  WHERE "origen" = 'WEB';

-- 4. Índice parcial funcional para límite diario por dirección normalizada en pedidos web a domicilio
CREATE INDEX IF NOT EXISTS "idx_pedidos_domicilio_web_sucursal_dir_fecha"
  ON "pedidos_domicilio" (
    "sucursal_id",
    LOWER(REGEXP_REPLACE(TRIM("direccion_snapshot"), '\s+', ' ', 'g')),
    "created_at" DESC
  )
  WHERE "origen" = 'WEB' AND "tipo_entrega" = 'DELIVERY';
