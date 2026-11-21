-- Se aplican a nuevas escrituras sin alterar movimientos historicos.
ALTER TABLE ingredientes
  ADD CONSTRAINT ingredientes_saldos_validos CHECK (
    stock_actual_oz BETWEEN 0 AND 99999999.9999 AND
    stock_minimo_oz BETWEEN 0 AND 99999999.9999 AND
    costo_promedio_oz BETWEEN 0 AND 99999999.9999
  ) NOT VALID;

ALTER TABLE inventario_movimientos
  ADD CONSTRAINT inventario_movimientos_saldo_coherente CHECK (
    cantidad_oz BETWEEN -99999999.9999 AND 99999999.9999 AND cantidad_oz <> 0 AND
    stock_anterior_oz BETWEEN 0 AND 99999999.9999 AND
    stock_nuevo_oz BETWEEN 0 AND 99999999.9999 AND
    costo_unitario_oz BETWEEN 0 AND 99999999.9999 AND
    stock_nuevo_oz = stock_anterior_oz + cantidad_oz AND
    CASE
      WHEN tipo IN ('SALIDA_VENTA', 'SALIDA_MERMA') THEN cantidad_oz < 0
      WHEN tipo IN ('ENTRADA_COMPRA', 'REVERSION_ANULACION') THEN cantidad_oz > 0
      ELSE true
    END
  ) NOT VALID;

ALTER TABLE mermas
  ADD CONSTRAINT mermas_cantidades_validas CHECK (
    cantidad_original > 0 AND cantidad_original <= 999999.9999 AND
    cantidad_oz > 0 AND cantidad_oz <= 99999999.9999 AND
    costo_estimado BETWEEN 0 AND 9999999999.99
  ) NOT VALID,
  ADD COLUMN idempotency_key UUID,
  ADD COLUMN idempotency_huella VARCHAR(64);

CREATE UNIQUE INDEX mermas_sucursal_idempotency_key_uq
  ON mermas (sucursal_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
