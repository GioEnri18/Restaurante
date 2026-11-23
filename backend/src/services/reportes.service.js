const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { env } = require('../config/env');
const { EstadoVenta, Sucursal } = require('../models');
const {
    formatDateTimeInTimezone,
    parseDateRangeInTimezone,
} = require('../shared/utils/dates');
const { BadRequestError } = require('../shared/errors/AppError');
const { round2 } = require('../shared/utils/tax');
const { buildPaginationMeta, parsePagination } = require('../shared/utils/pagination');
const { MAX_RANGO_DIAS } = require('../shared/validators/common.validators');
/**
 * Las replacements de consultas crudas formatean un Date en la hora LOCAL del proceso
 * ('... 00:00 -06:00') y PostgreSQL descarta ese desfase al comparar contra TIMESTAMP sin zona.
 * Por eso los límites se envían como texto UTC, igual que los escribe el ORM.
 */
const aTextoUtc = (fecha) => fecha.toISOString().replace('T', ' ').replace('Z', '');
function parseDateRange(fechaDesde, fechaHasta) {
    const rango = parseDateRangeInTimezone(fechaDesde, fechaHasta, 30);
    // El validador HTTP solo puede comparar cuando llegan ambas fechas. Aquí se valida el rango
    // EFECTIVO, ya con el valor por defecto aplicado (ej. solo fechaHasta=2030-01-01).
    if (rango.desde > rango.hasta) {
        throw new BadRequestError('fechaDesde no puede ser posterior a fechaHasta');
    }
    const dias = (rango.hasta.getTime() - rango.desde.getTime()) / 86_400_000;
    if (dias > MAX_RANGO_DIAS + 1) {
        throw new BadRequestError(`El rango de fechas no puede superar ${MAX_RANGO_DIAS} días`);
    }
    return { ...rango, desde: aTextoUtc(rango.desde), hasta: aTextoUtc(rango.hasta) };
}
/**
 * Reportes agregados en PostgreSQL (antes se cargaban todas las ventas con sus detalles en memoria
 * y se sumaban en JavaScript). Con 30 000 ventas: resumen de ~2,3 s / 207 MB de heap a milisegundos.
 * Los importes se suman como NUMERIC (exactos) y se redondean a 2 decimales al final.
 * `created_at` es TIMESTAMP sin zona en UTC; el día calendario se calcula en env.DEFAULT_TIMEZONE.
 */
async function consultar(sql, replacements) {
    return sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
}
const num = (v) => round2(Number(v ?? 0));
class ReportesService {
    static async obtenerResumen(sucursalId, fechaDesde, fechaHasta) {
        const { desde, hasta, labelDesde, labelHasta } = parseDateRange(fechaDesde, fechaHasta);
        const rango = { sucursalId, desde, hasta };
        const [totales, porMetodo, porServicio, [anuladas], [mermas], [compras], [inventario]] = await Promise.all([
            consultar(`SELECT COUNT(*) AS cantidad,
                    COALESCE(SUM(total), 0) AS ingresos,
                    COALESCE(SUM(subtotal_sin_iva), 0) AS subtotal,
                    COALESCE(SUM(iva_monto), 0) AS iva,
                    COALESCE(SUM(costo_total_receta), 0) AS costo
                FROM ventas
                WHERE sucursal_id = :sucursalId AND estado = :estado
                  AND created_at >= :desde AND created_at <= :hasta`, { ...rango, estado: EstadoVenta.COMPLETADA }),
            consultar(`SELECT metodo_pago AS clave, COUNT(*) AS cantidad, SUM(total) AS total
                FROM ventas
                WHERE sucursal_id = :sucursalId AND estado = :estado
                  AND created_at >= :desde AND created_at <= :hasta
                GROUP BY metodo_pago`, { ...rango, estado: EstadoVenta.COMPLETADA }),
            consultar(`SELECT tipo_servicio AS clave, COUNT(*) AS cantidad, SUM(total) AS total
                FROM ventas
                WHERE sucursal_id = :sucursalId AND estado = :estado
                  AND created_at >= :desde AND created_at <= :hasta
                GROUP BY tipo_servicio`, { ...rango, estado: EstadoVenta.COMPLETADA }),
            consultar(`SELECT COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS "sumTotal"
                FROM ventas
                WHERE sucursal_id = :sucursalId AND estado = :estado
                  AND created_at >= :desde AND created_at <= :hasta`, { ...rango, estado: EstadoVenta.ANULADA }),
            consultar(`SELECT COUNT(*) AS cnt, COALESCE(SUM(costo_estimado), 0) AS "sumCosto"
                FROM mermas
                WHERE sucursal_id = :sucursalId AND fecha >= :desde AND fecha <= :hasta`, rango),
            consultar(`SELECT COALESCE(SUM(total), 0) AS "sumTotal"
                FROM compras
                WHERE sucursal_id = :sucursalId AND fecha_compra >= :desde AND fecha_compra <= :hasta`, rango),
            consultar(`SELECT COALESCE(SUM(stock_actual_oz * costo_promedio_oz), 0) AS valor,
                    COUNT(*) FILTER (WHERE costo_promedio_oz <= 0) AS "sinCosto"
                FROM ingredientes
                WHERE sucursal_id = :sucursalId AND stock_actual_oz > 0`, { sucursalId }),
        ]);
        const t = totales[0];
        const cantidadVentas = Number(t.cantidad);
        const ingresosTotales = num(t.ingresos);
        const subtotalSinIva = num(t.subtotal);
        const costoRecetasTotal = num(t.costo);
        const agrupar = (filas, claves) => {
            const base = Object.fromEntries(claves.map((c) => [c, { cantidad: 0, total: 0 }]));
            for (const f of filas) {
                base[f.clave] = { cantidad: Number(f.cantidad), total: num(f.total) };
            }
            return base;
        };
        const costoMermasTotal = num(mermas?.sumCosto);
        const totalCompras = num(compras?.sumTotal);
        const utilidadBruta = round2(subtotalSinIva - costoRecetasTotal - costoMermasTotal);
        const margenBrutoPct = subtotalSinIva > 0 ? round2((utilidadBruta / subtotalSinIva) * 100) : 0;
        const ticketPromedio = cantidadVentas > 0 ? round2(ingresosTotales / cantidadVentas) : 0;
        return {
            periodo: { fechaDesde: labelDesde, fechaHasta: labelHasta },
            kpis: {
                cantidadVentas,
                cantidadAnuladas: Number(anuladas?.cnt ?? 0),
                totalAnulado: num(anuladas?.sumTotal),
                ingresosTotales,
                subtotalSinIva,
                ivaTotal: num(t.iva),
                costoRecetasTotal,
                costoMermasTotal,
                cantidadMermas: Number(mermas?.cnt ?? 0),
                totalCompras,
                valorInventarioActual: num(inventario.valor),
                insumosConStockSinCosto: Number(inventario.sinCosto),
                utilidadBruta,
                margenBrutoPct,
                ticketPromedio,
            },
            porMetodoPago: agrupar(porMetodo, ['EFECTIVO', 'TARJETA']),
            porTipoServicio: agrupar(porServicio, ['MOSTRADOR', 'LLEVAR', 'MESA', 'DELIVERY']),
        };
    }
    static async ventasPorPeriodo(sucursalId, fechaDesde, fechaHasta, rawPage) {
        const { desde, hasta } = parseDateRange(fechaDesde, fechaHasta);
        const paginacion = rawPage === undefined ? null : parsePagination(rawPage, 15, 15);
        const consulta = `WITH ventas_por_dia AS (
                SELECT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE :zona, 'YYYY-MM-DD') AS fecha,
                    COUNT(*) AS cantidad, SUM(total) AS ingresos, SUM(subtotal_sin_iva) AS ingresos_sin_iva,
                    SUM(costo_total_receta) AS costos
                FROM ventas
                WHERE sucursal_id = :sucursalId AND estado = :estado
                  AND created_at >= :desde AND created_at <= :hasta
                GROUP BY 1
            ), mermas_por_dia AS (
                SELECT to_char((fecha AT TIME ZONE 'UTC') AT TIME ZONE :zona, 'YYYY-MM-DD') AS fecha,
                    SUM(costo_estimado) AS mermas
                FROM mermas
                WHERE sucursal_id = :sucursalId AND fecha >= :desde AND fecha <= :hasta
                GROUP BY 1
            ), diario AS (
                SELECT fecha, cantidad, ingresos, ingresos_sin_iva, costos, mermas
                FROM ventas_por_dia FULL JOIN mermas_por_dia USING (fecha)
            )`;
        const resultado = await consultar(`${consulta}
            ${paginacion ? `SELECT (SELECT COUNT(*) FROM diario) AS total,
                COALESCE(jsonb_agg(p ORDER BY p.fecha), '[]'::jsonb) AS filas
                FROM (SELECT * FROM diario ORDER BY fecha LIMIT :limit OFFSET :skip) p`
            : 'SELECT * FROM diario ORDER BY fecha'}`, {
            sucursalId,
            desde,
            hasta,
            estado: EstadoVenta.COMPLETADA,
            zona: env.DEFAULT_TIMEZONE,
            ...(paginacion ?? {}),
        });
        const filas = paginacion ? resultado[0].filas : resultado;
        const data = filas.map((f) => {
            const ingresos = num(f.ingresos);
            const ingresosSinIva = num(f.ingresos_sin_iva);
            const costos = num(f.costos);
            const mermas = num(f.mermas);
            return {
                fecha: f.fecha,
                cantidadVentas: Number(f.cantidad ?? 0),
                ingresos,
                ingresosSinIva,
                costos,
                mermas,
                utilidad: round2(ingresosSinIva - costos - mermas),
            };
        });
        return paginacion
            ? { data, meta: buildPaginationMeta(Number(resultado[0].total), paginacion.page, paginacion.limit) }
            : data;
    }
    static async productosMasVendidos(sucursalId, fechaDesde, fechaHasta, limit = 10, rawPage) {
        const { desde, hasta } = parseDateRange(fechaDesde, fechaHasta);
        const paginacion = rawPage === undefined ? null : parsePagination(rawPage, 15, 15);
        const ordenar = 'cantidad DESC, ingresos DESC, "platilloId" ASC';
        const resultado = await consultar(`WITH ranking AS (
            SELECT
                d.platillo_id AS "platilloId",
                (array_agg(d.nombre_platillo ORDER BY v.created_at, d.id))[1] AS nombre,
                SUM(d.cantidad) AS cantidad,
                SUM(d.subtotal) AS ingresos,
                SUM(ROUND(d.costo_unitario_receta * d.cantidad, 2)) AS costo
            FROM venta_detalles d
            JOIN ventas v ON v.id = d.venta_id
            WHERE v.sucursal_id = :sucursalId AND v.estado = :estado
              AND v.created_at >= :desde AND v.created_at <= :hasta
            GROUP BY d.platillo_id
        )
        ${paginacion ? `SELECT (SELECT COUNT(*) FROM ranking) AS total,
            COALESCE(jsonb_agg(p ORDER BY ${ordenar}), '[]'::jsonb) AS filas
            FROM (SELECT * FROM ranking ORDER BY ${ordenar} LIMIT :limit OFFSET :skip) p`
        : `SELECT * FROM ranking ORDER BY ${ordenar} LIMIT :limit`}`, {
            sucursalId,
            desde,
            hasta,
            estado: EstadoVenta.COMPLETADA,
            limit: paginacion?.limit ?? Math.min(Math.max(Number(limit) || 10, 1), 100),
            ...(paginacion ? { skip: paginacion.skip } : {}),
        });
        const filas = paginacion ? resultado[0].filas : resultado;
        const data = filas.map((f) => {
            const ingresos = num(f.ingresos);
            const costoTotal = num(f.costo);
            return {
                platilloId: f.platilloId,
                nombre: f.nombre,
                cantidadVendida: Number(f.cantidad),
                ingresos,
                costoTotal,
                utilidad: round2(ingresos - costoTotal),
            };
        });
        return paginacion
            ? { data, meta: buildPaginationMeta(Number(resultado[0].total), paginacion.page, paginacion.limit) }
            : data;
    }
    static async exportarPdf(sucursalId, fechaDesde, fechaHasta) {
        const [sucursal, resumen, serie, topProductos] = await Promise.all([
            Sucursal.findByPk(sucursalId),
            this.obtenerResumen(sucursalId, fechaDesde, fechaHasta),
            this.ventasPorPeriodo(sucursalId, fechaDesde, fechaHasta),
            this.productosMasVendidos(sucursalId, fechaDesde, fechaHasta, 15),
        ]);
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ margin: 45, size: 'LETTER' });
            const chunks = [];
            doc.on('data', (chunk) => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            const q = (val) => `Q ${val.toFixed(2)}`;
            doc.fontSize(18).font('Helvetica-Bold').text(sucursal?.nombre ?? 'POS Restaurante', { align: 'left' });
            doc.fontSize(10).font('Helvetica').fillColor('#444444');
            doc.text(`NIT: ${sucursal?.nit ?? 'N/A'} | ${sucursal?.direccion ?? ''}`);
            doc.moveDown(0.5);
            doc
                .fontSize(14)
                .font('Helvetica-Bold')
                .fillColor('#111111')
                .text('Reporte Ejecutivo de Ventas, Costos y Rentabilidad');
            doc
                .fontSize(10)
                .font('Helvetica')
                .fillColor('#555555')
                .text(`Período: ${resumen.periodo.fechaDesde} al ${resumen.periodo.fechaHasta}  |  Generado: ${formatDateTimeInTimezone(new Date())}`);
            doc.moveDown(1);
            doc.fontSize(12).font('Helvetica-Bold').fillColor('#111111').text('1. Resumen Financiero');
            doc.moveDown(0.4);
            doc.fontSize(10).font('Helvetica');
            const k = resumen.kpis;
            doc.text(`• Ventas completadas: ${k.cantidadVentas}   |   Ticket promedio: ${q(k.ticketPromedio)}`);
            doc.text(`• Facturas anuladas: ${k.cantidadAnuladas}   |   Total anulado: ${q(k.totalAnulado)}`);
            doc.text(`• Ingresos totales (IVA incluido): ${q(k.ingresosTotales)}   (Base: ${q(k.subtotalSinIva)} | IVA 12%: ${q(k.ivaTotal)})`);
            doc.text(`• Costo por recetas vendidas: ${q(k.costoRecetasTotal)}   |   Costo por mermas: ${q(k.costoMermasTotal)}`);
            doc.text(`• Ganancia antes de salarios y otros gastos: ${q(k.utilidadBruta)}   |   Margen: ${k.margenBrutoPct.toFixed(2)}%`);
            doc.text(`• Compras del período: ${q(k.totalCompras)}   |   Inventario actual al costo: ${q(k.valorInventarioActual)}`);
            if (k.insumosConStockSinCosto > 0) doc.text(`• Insumos con existencia y costo pendiente: ${k.insumosConStockSinCosto}`);
            doc.text(`• Efectivo: ${q(resumen.porMetodoPago.EFECTIVO?.total ?? 0)} (${resumen.porMetodoPago.EFECTIVO?.cantidad ?? 0})   |   Tarjeta: ${q(resumen.porMetodoPago.TARJETA?.total ?? 0)} (${resumen.porMetodoPago.TARJETA?.cantidad ?? 0})`);
            doc.moveDown(1);
            doc.fontSize(12).font('Helvetica-Bold').text('2. Productos Más Vendidos');
            doc.moveDown(0.4);
            doc.fontSize(9).font('Helvetica');
            if (topProductos.length === 0) {
                doc.text('Sin ventas registradas en el período seleccionado.');
            }
            else {
                for (const [idx, prod] of topProductos.entries()) {
                    doc.text(`${idx + 1}. ${prod.nombre} — Cant: ${prod.cantidadVendida} | Ingresos: ${q(prod.ingresos)} | Costo: ${q(prod.costoTotal)} | Utilidad: ${q(prod.utilidad)}`);
                }
            }
            doc.moveDown(1);
            doc.fontSize(12).font('Helvetica-Bold').text('3. Desglose Diario de Ventas');
            doc.moveDown(0.4);
            doc.fontSize(9).font('Helvetica');
            if (serie.length === 0) {
                doc.text('Sin movimientos diarios en el período.');
            }
            else {
                for (const dia of serie) {
                    doc.text(`${dia.fecha} | Ventas sin IVA: ${q(dia.ingresosSinIva)} | Costos: ${q(dia.costos + dia.mermas)} | Ganancia: ${q(dia.utilidad)}`);
                }
            }
            doc.end();
        });
    }
    static async exportarExcel(sucursalId, fechaDesde, fechaHasta) {
        const [sucursal, resumen, serie, topProductos] = await Promise.all([
            Sucursal.findByPk(sucursalId),
            this.obtenerResumen(sucursalId, fechaDesde, fechaHasta),
            this.ventasPorPeriodo(sucursalId, fechaDesde, fechaHasta),
            this.productosMasVendidos(sucursalId, fechaDesde, fechaHasta, 50),
        ]);
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'POS Restaurante Guatemala';
        workbook.created = new Date();
        const wsResumen = workbook.addWorksheet('Resumen');
        wsResumen.columns = [
            { header: 'Indicador', key: 'indicador', width: 36 },
            { header: 'Valor', key: 'valor', width: 22 },
        ];
        wsResumen.getRow(1).font = { bold: true };
        wsResumen.addRows([
            { indicador: 'Sucursal', valor: sucursal?.nombre ?? '' },
            { indicador: 'Período', valor: `${resumen.periodo.fechaDesde} a ${resumen.periodo.fechaHasta}` },
            { indicador: 'Cantidad de Ventas', valor: resumen.kpis.cantidadVentas },
            { indicador: 'Cantidad de Anuladas', valor: resumen.kpis.cantidadAnuladas },
            { indicador: 'Total Anulado (GTQ)', valor: resumen.kpis.totalAnulado },
            { indicador: 'Ingresos Totales (GTQ)', valor: resumen.kpis.ingresosTotales },
            { indicador: 'Base Imponible sin IVA (GTQ)', valor: resumen.kpis.subtotalSinIva },
            { indicador: 'IVA 12% Incluido (GTQ)', valor: resumen.kpis.ivaTotal },
            { indicador: 'Costo por Recetas (GTQ)', valor: resumen.kpis.costoRecetasTotal },
            { indicador: 'Costo por Mermas (GTQ)', valor: resumen.kpis.costoMermasTotal },
            { indicador: 'Ganancia antes de salarios y otros gastos (GTQ)', valor: resumen.kpis.utilidadBruta },
            { indicador: 'Compras del período (GTQ)', valor: resumen.kpis.totalCompras },
            { indicador: 'Inventario actual al costo (GTQ)', valor: resumen.kpis.valorInventarioActual },
            { indicador: 'Insumos con existencia y costo pendiente', valor: resumen.kpis.insumosConStockSinCosto },
            { indicador: 'Margen Bruto (%)', valor: resumen.kpis.margenBrutoPct },
            { indicador: 'Ticket Promedio (GTQ)', valor: resumen.kpis.ticketPromedio },
            { indicador: 'Ventas Efectivo (GTQ)', valor: resumen.porMetodoPago.EFECTIVO?.total ?? 0 },
            { indicador: 'Ventas Tarjeta (GTQ)', valor: resumen.porMetodoPago.TARJETA?.total ?? 0 },
        ]);
        const wsSerie = workbook.addWorksheet('Ventas por Día');
        wsSerie.columns = [
            { header: 'Fecha', key: 'fecha', width: 16 },
            { header: 'Cantidad Ventas', key: 'cantidadVentas', width: 18 },
            { header: 'Ingresos (Q)', key: 'ingresos', width: 18 },
            { header: 'Ventas sin IVA (Q)', key: 'ingresosSinIva', width: 20 },
            { header: 'Costo Recetas (Q)', key: 'costos', width: 18 },
            { header: 'Mermas (Q)', key: 'mermas', width: 18 },
            { header: 'Utilidad (Q)', key: 'utilidad', width: 18 },
        ];
        wsSerie.getRow(1).font = { bold: true };
        wsSerie.addRows(serie);
        const wsTop = workbook.addWorksheet('Productos Más Vendidos');
        wsTop.columns = [
            { header: 'Platillo', key: 'nombre', width: 34 },
            { header: 'Unidades', key: 'cantidadVendida', width: 14 },
            { header: 'Ingresos (Q)', key: 'ingresos', width: 16 },
            { header: 'Costo Receta (Q)', key: 'costoTotal', width: 18 },
            { header: 'Utilidad (Q)', key: 'utilidad', width: 16 },
        ];
        wsTop.getRow(1).font = { bold: true };
        wsTop.addRows(topProductos);
        const arrayBuffer = await workbook.xlsx.writeBuffer();
        return Buffer.from(arrayBuffer);
    }
}

module.exports = { ReportesService };
