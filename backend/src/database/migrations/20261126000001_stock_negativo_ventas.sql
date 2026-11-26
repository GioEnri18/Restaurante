-- ============================================================================
-- Migración: Permitir saldo negativo en inventario cuando se vende sin existencias
-- Permite que las ventas descuenten el 100% de la receta aunque stock_actual_oz quede < 0,
-- y que al ingresar compras nuevas el saldo negativo se empareje automáticamente con lo comprado.
-- Mantiene intactas las validaciones de stock_minimo_oz >= 0, costo_promedio_oz >= 0 y
-- la ecuación contable stock_nuevo_oz = stock_anterior_oz + cantidad_oz en Kardex.
-- ============================================================================

ALTER TABLE "ingredientes"
  DROP CONSTRAINT IF EXISTS "ingredientes_saldos_validos";

ALTER TABLE "ingredientes"
  ADD CONSTRAINT "ingredientes_saldos_validos" CHECK (
    "stock_actual_oz" BETWEEN -99999999.9999 AND 99999999.9999 AND
    "stock_minimo_oz" BETWEEN 0 AND 99999999.9999 AND
    "costo_promedio_oz" BETWEEN 0 AND 99999999.9999
  ) NOT VALID;

ALTER TABLE "inventario_movimientos"
  DROP CONSTRAINT IF EXISTS "inventario_movimientos_saldo_coherente";

ALTER TABLE "inventario_movimientos"
  ADD CONSTRAINT "inventario_movimientos_saldo_coherente" CHECK (
    "cantidad_oz" BETWEEN -99999999.9999 AND 99999999.9999 AND "cantidad_oz" <> 0 AND
    "stock_anterior_oz" BETWEEN -99999999.9999 AND 99999999.9999 AND
    "stock_nuevo_oz" BETWEEN -99999999.9999 AND 99999999.9999 AND
    "costo_unitario_oz" BETWEEN 0 AND 99999999.9999 AND
    "stock_nuevo_oz" = "stock_anterior_oz" + "cantidad_oz" AND
    CASE
      WHEN "tipo" IN ('SALIDA_VENTA', 'SALIDA_MERMA') THEN "cantidad_oz" < 0
      WHEN "tipo" IN ('ENTRADA_COMPRA', 'REVERSION_ANULACION') THEN "cantidad_oz" > 0
      ELSE true
    END
  ) NOT VALID;
