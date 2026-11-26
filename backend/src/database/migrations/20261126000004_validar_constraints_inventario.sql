-- ============================================================================
-- Migración: Validar constraints de saldo negativo en inventario (Fase 4)
-- - Verifica previamente que ninguna fila existente viole las restricciones
--   `ingredientes_saldos_validos` ni `inventario_movimientos_saldo_coherente`
--   (migración 20261126000001) antes de ejecutar VALIDATE CONSTRAINT.
-- - Agrega índice parcial para consultar ingredientes en saldo negativo (< 0).
-- - No altera `auditoria_logs` ni sus privilegios append-only.
-- ============================================================================

DO $$
DECLARE
  v_ing_invalidos INTEGER;
  v_mov_invalidos INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_ing_invalidos
  FROM "ingredientes"
  WHERE NOT (
    "stock_actual_oz" BETWEEN -99999999.9999 AND 99999999.9999
    AND "stock_minimo_oz" BETWEEN 0 AND 99999999.9999
    AND "costo_promedio_oz" BETWEEN 0 AND 99999999.9999
  );

  IF v_ing_invalidos > 0 THEN
    RAISE EXCEPTION
      'No se puede validar ingredientes_saldos_validos: existen % fila(s) en ingredientes fuera de rango válido.',
      v_ing_invalidos;
  END IF;

  SELECT COUNT(*) INTO v_mov_invalidos
  FROM "inventario_movimientos"
  WHERE NOT (
    "cantidad_oz" BETWEEN -99999999.9999 AND 99999999.9999
    AND "cantidad_oz" <> 0
    AND "stock_anterior_oz" BETWEEN -99999999.9999 AND 99999999.9999
    AND "stock_nuevo_oz" BETWEEN -99999999.9999 AND 99999999.9999
    AND "costo_unitario_oz" BETWEEN 0 AND 99999999.9999
    AND "stock_nuevo_oz" = "stock_anterior_oz" + "cantidad_oz"
    AND CASE
      WHEN "tipo" IN ('SALIDA_VENTA', 'SALIDA_MERMA') THEN "cantidad_oz" < 0
      WHEN "tipo" IN ('ENTRADA_COMPRA', 'REVERSION_ANULACION') THEN "cantidad_oz" > 0
      ELSE true
    END
  );

  IF v_mov_invalidos > 0 THEN
    RAISE EXCEPTION
      'No se puede validar inventario_movimientos_saldo_coherente: existen % fila(s) en inventario_movimientos inconsistentes.',
      v_mov_invalidos;
  END IF;
END
$$;

ALTER TABLE "ingredientes"
  VALIDATE CONSTRAINT "ingredientes_saldos_validos";

ALTER TABLE "inventario_movimientos"
  VALIDATE CONSTRAINT "inventario_movimientos_saldo_coherente";

-- Índice parcial para listado rápido de ingredientes en saldo negativo (< 0)
CREATE INDEX IF NOT EXISTS "idx_ingredientes_sucursal_stock_negativo"
  ON "ingredientes" ("sucursal_id", "stock_actual_oz" ASC)
  WHERE "activo" = true AND "stock_actual_oz" < 0;
