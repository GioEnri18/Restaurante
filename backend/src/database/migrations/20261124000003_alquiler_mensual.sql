ALTER TABLE gastos_operativos
  ADD COLUMN recurrente BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN hasta_mes DATE,
  ADD CONSTRAINT gastos_operativos_alquiler_mensual_valido CHECK (
    (NOT recurrente AND hasta_mes IS NULL)
    OR (recurrente AND categoria = 'ALQUILER' AND EXTRACT(DAY FROM fecha) = 1
      AND (hasta_mes IS NULL OR (hasta_mes >= fecha AND EXTRACT(DAY FROM hasta_mes) = 1)))
  );

CREATE INDEX gastos_operativos_alquiler_mensual_idx
  ON gastos_operativos(sucursal_id, fecha DESC, id DESC)
  WHERE recurrente;
