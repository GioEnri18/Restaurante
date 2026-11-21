-- FASE 1: Integridad del dinero, control de concurrencia en caja e idempotencia de ventas

-- 1.2 Garantizar a nivel de base de datos máximo UNA caja ABIERTA por sucursal
CREATE UNIQUE INDEX uq_caja_abierta_por_sucursal
  ON "caja_sesiones" ("sucursal_id")
  WHERE "estado" = 'ABIERTA';

-- 1.4 Separar egresos/anulaciones de tarjeta para cuadrar gaveta física y POS bancario por separado
ALTER TABLE "caja_sesiones"
  ADD COLUMN "total_egresos_tarjeta" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- 1.5 Idempotencia en confirmación de ventas (única por sucursal cuando se envía clave)
ALTER TABLE "ventas"
  ADD COLUMN "idempotency_key" VARCHAR(64);

CREATE UNIQUE INDEX "ventas_sucursal_id_idempotency_key_key"
  ON "ventas"("sucursal_id", "idempotency_key");
