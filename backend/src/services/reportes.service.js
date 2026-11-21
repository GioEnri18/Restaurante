const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { Op, col, fn } = require('sequelize');
const { Compra, EstadoVenta, Merma, Sucursal, Venta, VentaDetalle } = require('../models');
const {
    formatDateTimeInTimezone,
    parseDateRangeInTimezone,
    toIsoDateInTimezone,
} = require('../shared/utils/dates');
const { round2 } = require('../shared/utils/tax');
function parseDateRange(fechaDesde, fechaHasta) {
    return parseDateRangeInTimezone(fechaDesde, fechaHasta, 30);
}
class ReportesService {
    static async findVentasCompletadas(sucursalId, desde, hasta) {
        return Venta.findAll({
            where: {
                sucursalId,
                estado: EstadoVenta.COMPLETADA,
                createdAt: { [Op.gte]: desde, [Op.lte]: hasta },
            },
            include: [{ model: VentaDetalle, as: 'detalles' }],
            order: [['createdAt', 'ASC']],
        });
    }
    static async obtenerResumen(sucursalId, fechaDesde, fechaHasta) {
        const { desde, hasta, labelDesde, labelHasta } = parseDateRange(fechaDesde, fechaHasta);
        const [ventas, anuladas, mermas, compras] = await Promise.all([
            this.findVentasCompletadas(sucursalId, desde, hasta),
            Venta.findOne({
                where: {
                    sucursalId,
                    estado: EstadoVenta.ANULADA,
                    createdAt: { [Op.gte]: desde, [Op.lte]: hasta },
                },
                attributes: [
                    [fn('COUNT', col('id')), 'cnt'],
                    [fn('COALESCE', fn('SUM', col('total')), 0), 'sumTotal'],
                ],
                raw: true,
            }),
            Merma.findOne({
                where: {
                    sucursalId,
                    fecha: { [Op.gte]: desde, [Op.lte]: hasta },
                },
                attributes: [
                    [fn('COUNT', col('id')), 'cnt'],
                    [fn('COALESCE', fn('SUM', col('costo_estimado')), 0), 'sumCosto'],
                ],
                raw: true,
            }),
            Compra.findOne({
                where: {
                    sucursalId,
                    fechaCompra: { [Op.gte]: desde, [Op.lte]: hasta },
                },
                attributes: [[fn('COALESCE', fn('SUM', col('total')), 0), 'sumTotal']],
                raw: true,
            }),
        ]);
        let ingresosTotales = 0;
        let subtotalSinIva = 0;
        let ivaTotal = 0;
        let costoRecetasTotal = 0;
        const porMetodoPago = {
            EFECTIVO: { cantidad: 0, total: 0 },
            TARJETA: { cantidad: 0, total: 0 },
        };
        const porTipoServicio = {
            MOSTRADOR: { cantidad: 0, total: 0 },
            LLEVAR: { cantidad: 0, total: 0 },
            MESA: { cantidad: 0, total: 0 },
            DELIVERY: { cantidad: 0, total: 0 },
        };
        for (const v of ventas) {
            const total = Number(v.total);
            ingresosTotales = round2(ingresosTotales + total);
            subtotalSinIva = round2(subtotalSinIva + Number(v.subtotalSinIva));
            ivaTotal = round2(ivaTotal + Number(v.ivaMonto));
            costoRecetasTotal = round2(costoRecetasTotal + Number(v.costoTotalReceta));
            if (!porMetodoPago[v.metodoPago]) {
                porMetodoPago[v.metodoPago] = { cantidad: 0, total: 0 };
            }
            porMetodoPago[v.metodoPago].cantidad += 1;
            porMetodoPago[v.metodoPago].total = round2(porMetodoPago[v.metodoPago].total + total);
            if (!porTipoServicio[v.tipoServicio]) {
                porTipoServicio[v.tipoServicio] = { cantidad: 0, total: 0 };
            }
            porTipoServicio[v.tipoServicio].cantidad += 1;
            porTipoServicio[v.tipoServicio].total = round2(porTipoServicio[v.tipoServicio].total + total);
        }
        const costoMermasTotal = round2(Number(mermas?.sumCosto ?? 0));
        const totalCompras = round2(Number(compras?.sumTotal ?? 0));
        const utilidadBruta = round2(ingresosTotales - costoRecetasTotal - costoMermasTotal);
        const margenBrutoPct = ingresosTotales > 0 ? round2((utilidadBruta / ingresosTotales) * 100) : 0;
        const ticketPromedio = ventas.length > 0 ? round2(ingresosTotales / ventas.length) : 0;
        return {
            periodo: { fechaDesde: labelDesde, fechaHasta: labelHasta },
            kpis: {
                cantidadVentas: ventas.length,
                cantidadAnuladas: Number(anuladas?.cnt ?? 0),
                totalAnulado: round2(Number(anuladas?.sumTotal ?? 0)),
                ingresosTotales,
                subtotalSinIva,
                ivaTotal,
                costoRecetasTotal,
                costoMermasTotal,
                cantidadMermas: Number(mermas?.cnt ?? 0),
                totalCompras,
                utilidadBruta,
                margenBrutoPct,
                ticketPromedio,
            },
            porMetodoPago,
            porTipoServicio,
        };
    }
    static async ventasPorPeriodo(sucursalId, fechaDesde, fechaHasta) {
        const { desde, hasta } = parseDateRange(fechaDesde, fechaHasta);
        const ventas = await this.findVentasCompletadas(sucursalId, desde, hasta);
        const mapaDias = new Map();
        for (const v of ventas) {
            const key = toIsoDateInTimezone(v.createdAt);
            const prev = mapaDias.get(key) ?? {
                fecha: key,
                cantidadVentas: 0,
                ingresos: 0,
                costos: 0,
                utilidad: 0,
            };
            const ing = Number(v.total);
            const cost = Number(v.costoTotalReceta);
            prev.cantidadVentas += 1;
            prev.ingresos = round2(prev.ingresos + ing);
            prev.costos = round2(prev.costos + cost);
            prev.utilidad = round2(prev.ingresos - prev.costos);
            mapaDias.set(key, prev);
        }
        return Array.from(mapaDias.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
    }
    static async productosMasVendidos(sucursalId, fechaDesde, fechaHasta, limit = 10) {
        const { desde, hasta } = parseDateRange(fechaDesde, fechaHasta);
        const ventas = await this.findVentasCompletadas(sucursalId, desde, hasta);
        const mapaProductos = new Map();
        for (const v of ventas) {
            for (const det of v.detalles ?? []) {
                const prev = mapaProductos.get(det.platilloId) ?? {
                    platilloId: det.platilloId,
                    nombre: det.nombrePlatillo,
                    cantidadVendida: 0,
                    ingresos: 0,
                    costoTotal: 0,
                    utilidad: 0,
                };
                const ing = Number(det.subtotal);
                const cost = round2(Number(det.costoUnitarioReceta) * det.cantidad);
                prev.cantidadVendida += det.cantidad;
                prev.ingresos = round2(prev.ingresos + ing);
                prev.costoTotal = round2(prev.costoTotal + cost);
                prev.utilidad = round2(prev.ingresos - prev.costoTotal);
                mapaProductos.set(det.platilloId, prev);
            }
        }
        return Array.from(mapaProductos.values())
            .sort((a, b) => b.cantidadVendida - a.cantidadVendida || b.ingresos - a.ingresos)
            .slice(0, limit);
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
            doc.text(`• Utilidad bruta estimada: ${q(k.utilidadBruta)}   |   Margen bruto: ${k.margenBrutoPct.toFixed(2)}%`);
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
                    doc.text(`${dia.fecha} — Tickets: ${dia.cantidadVentas} | Ingresos: ${q(dia.ingresos)} | Costo Receta: ${q(dia.costos)} | Utilidad: ${q(dia.utilidad)}`);
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
            { indicador: 'Utilidad Bruta Estimada (GTQ)', valor: resumen.kpis.utilidadBruta },
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
            { header: 'Costo Recetas (Q)', key: 'costos', width: 18 },
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
