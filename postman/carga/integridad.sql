-- Verificaciones de integridad tras la carga concurrente (cada fila debe decir OK). Revisa la última caja.
WITH
v AS (SELECT count(*) total, count(*) FILTER (WHERE estado='COMPLETADA') completadas,
             count(*) FILTER (WHERE estado='ANULADA') anuladas FROM ventas),
f AS (SELECT count(*) total, count(DISTINCT numero) distintos, min(numero) mn, max(numero) mx FROM facturas),
caja AS (
  SELECT cs.id,
         cs.total_ventas_efectivo AS acumulado,
         (SELECT COALESCE(sum(monto),0) FROM caja_movimientos m
           WHERE m.caja_sesion_id = cs.id AND m.tipo='INGRESO_VENTA' AND m.metodo_pago='EFECTIVO') AS por_movimientos,
         (SELECT COALESCE(sum(total),0) FROM ventas x WHERE x.caja_sesion_id = cs.id AND x.metodo_pago='EFECTIVO') AS por_ventas,
         cs.total_egresos AS egresos,
         (SELECT COALESCE(sum(monto),0) FROM caja_movimientos m
           WHERE m.caja_sesion_id = cs.id AND m.tipo IN ('EGRESO_ANULACION','EGRESO_MANUAL')) AS egresos_mov
  FROM caja_sesiones cs WHERE cs.id = (SELECT max(id) FROM caja_sesiones)
),
kardex AS (
  SELECT i.id, i.stock_actual_oz,
         (SELECT m.stock_nuevo_oz FROM inventario_movimientos m WHERE m.ingrediente_id = i.id ORDER BY m.id DESC LIMIT 1) AS ultimo
  FROM ingredientes i
)
SELECT 'Ventas = facturas = comandas' AS verificacion,
       CASE WHEN v.total = f.total AND f.total = (SELECT count(*) FROM comandas) THEN 'OK' ELSE 'FALLA' END AS resultado,
       format('ventas %s (completadas %s, anuladas %s) | facturas %s | comandas %s', v.total, v.completadas, v.anuladas, f.total, (SELECT count(*) FROM comandas)) AS detalle
FROM v, f
UNION ALL
SELECT 'Correlativos de factura sin huecos ni duplicados',
       CASE WHEN f.distintos = f.total AND f.mx - f.mn + 1 = f.total THEN 'OK' ELSE 'FALLA' END,
       format('del %s al %s, %s facturas', f.mn, f.mx, f.total) FROM f
UNION ALL
SELECT 'Claves de idempotencia únicas',
       CASE WHEN count(*) = count(DISTINCT idempotency_key) THEN 'OK' ELSE 'FALLA' END,
       format('%s claves', count(*)) FROM ventas WHERE idempotency_key IS NOT NULL
UNION ALL
SELECT 'Caja: acumulado de efectivo = movimientos = ventas',
       CASE WHEN acumulado = por_movimientos AND por_movimientos = por_ventas THEN 'OK' ELSE 'FALLA' END,
       format('acumulado Q%s | movimientos Q%s | ventas Q%s', acumulado, por_movimientos, por_ventas) FROM caja
UNION ALL
SELECT 'Caja: egresos acumulados = movimientos de egreso',
       CASE WHEN egresos = egresos_mov THEN 'OK' ELSE 'FALLA' END,
       format('acumulado Q%s | movimientos Q%s', egresos, egresos_mov) FROM caja
UNION ALL
SELECT 'Cada factura anulada tiene exactamente un egreso',
       CASE WHEN bool_and(n = 1) THEN 'OK' ELSE 'FALLA' END,
       format('%s anuladas', count(*))
FROM (SELECT fa.id, (SELECT count(*) FROM caja_movimientos m WHERE m.venta_id = fa.venta_id AND m.tipo='EGRESO_ANULACION') n
      FROM facturas fa WHERE fa.estado = 'ANULADA') x
UNION ALL
SELECT 'Sin stock negativo',
       CASE WHEN count(*) FILTER (WHERE stock_actual_oz < 0) = 0 THEN 'OK' ELSE 'FALLA' END,
       format('mínimo %s oz', min(stock_actual_oz)) FROM ingredientes
UNION ALL
SELECT 'Kardex: stock actual = saldo del último movimiento',
       CASE WHEN bool_and(ultimo IS NULL OR stock_actual_oz = ultimo) THEN 'OK' ELSE 'FALLA' END,
       format('%s ingredientes revisados', count(*)) FROM kardex
UNION ALL
SELECT 'Auditoría: una entrada por venta y por anulación',
       CASE WHEN (SELECT count(*) FROM auditoria_logs WHERE accion='VENTA_CONFIRMADA') = (SELECT total FROM v)
             AND (SELECT count(*) FROM auditoria_logs WHERE accion='ANULACION_FACTURA') = (SELECT anuladas FROM v)
            THEN 'OK' ELSE 'FALLA' END,
       format('VENTA_CONFIRMADA %s | ANULACION_FACTURA %s | MERMA %s',
         (SELECT count(*) FROM auditoria_logs WHERE accion='VENTA_CONFIRMADA'),
         (SELECT count(*) FROM auditoria_logs WHERE accion='ANULACION_FACTURA'),
         (SELECT count(*) FROM auditoria_logs WHERE accion='REGISTRO_MERMA'))
UNION ALL
SELECT 'Ventas del menú BX registradas',
       CASE WHEN count(*) > 0 THEN 'OK' ELSE 'FALLA' END,
       format('%s líneas de venta de platillos BX', count(*))
FROM venta_detalles d JOIN platillos p ON p.id = d.platillo_id WHERE p.sku LIKE 'BX-%'
UNION ALL
SELECT 'Inventario nuevo con código único',
       CASE WHEN count(*) = 4 AND count(DISTINCT codigo) = 4 THEN 'OK' ELSE 'FALLA' END,
       string_agg(codigo || ' ' || nombre, ', ' ORDER BY codigo)
FROM ingredientes WHERE codigo LIKE 'INV-%'
UNION ALL
SELECT 'Caja: apertura y cierre autorizados por un supervisor distinto del cajero',
       CASE WHEN cs.estado = 'CERRADA' AND cs.diferencia = 0
             AND cs.usuario_autoriza_apertura_id IS NOT NULL AND cs.usuario_autoriza_cierre_id IS NOT NULL
             AND cs.usuario_autoriza_apertura_id <> cs.usuario_apertura_id
             AND cs.usuario_autoriza_cierre_id <> cs.usuario_cierre_id
            THEN 'OK' ELSE 'FALLA' END,
       format('abrió %s (autorizó %s) | cerró %s (autorizó %s) | diferencia Q%s',
         (SELECT username FROM usuarios WHERE id = cs.usuario_apertura_id),
         (SELECT username FROM usuarios WHERE id = cs.usuario_autoriza_apertura_id),
         (SELECT username FROM usuarios WHERE id = cs.usuario_cierre_id),
         (SELECT username FROM usuarios WHERE id = cs.usuario_autoriza_cierre_id), cs.diferencia)
FROM caja_sesiones cs WHERE cs.id = (SELECT max(id) FROM caja_sesiones);
