-- Recupera el sueldo inicial únicamente cuando la bitácora documenta el importe
-- y la fecha de ingreso coincide con la ficha del empleado.
INSERT INTO nomina_vigencias (usuario_id, desde, sueldo_mensual)
SELECT u.id, u.fecha_ingreso, (a.valor_nuevo ->> 'sueldoMensual')::numeric
FROM usuarios u
JOIN LATERAL (
  SELECT log.valor_nuevo
  FROM auditoria_logs log
  WHERE log.sucursal_id = u.sucursal_id
    AND log.entidad = 'Usuario' AND log.entidad_id = u.id::text
    AND log.accion = 'GESTION_NOMINA'
    AND log.valor_anterior ->> 'sueldoMensual' IS NULL
    AND jsonb_typeof(log.valor_nuevo -> 'sueldoMensual') = 'number'
    AND log.valor_nuevo ->> 'fechaIngreso' = u.fecha_ingreso::text
  ORDER BY log.created_at, log.id
  LIMIT 1
) a ON true
WHERE u.fecha_ingreso IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM nomina_vigencias vig
    WHERE vig.usuario_id = u.id AND vig.desde <= u.fecha_ingreso
  )
ON CONFLICT DO NOTHING;
