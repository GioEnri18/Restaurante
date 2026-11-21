import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { round2 } from '../../shared/utils/tax';
import { ReportesModel } from './reportes.model';

function parseDateRange(fechaDesde?: string, fechaHasta?: string): { desde: Date; hasta: Date; labelDesde: string; labelHasta: string } {
  const hoy = new Date();
  const defaultHasta = hoy.toISOString().slice(0, 10);
  const hace30Dias = new Date(hoy);
  hace30Dias.setDate(hace30Dias.getDate() - 30);
  const defaultDesde = hace30Dias.toISOString().slice(0, 10);

  const labelDesde = fechaDesde || defaultDesde;
  const labelHasta = fechaHasta || defaultHasta;

  return {
    desde: new Date(`${labelDesde}T00:00:00.000`),
    hasta: new Date(`${labelHasta}T23:59:59.999`),
    labelDesde,
    labelHasta,
  };
}

export class ReportesService {
  static async obtenerResumen(sucursalId: number, fechaDesde?: string, fechaHasta?: string) {
    const { desde, hasta, labelDesde, labelHasta } = parseDateRange(fechaDesde, fechaHasta);

    const [ventas, mermas, compras] = await Promise.all([
      ReportesModel.findVentasCompletadas(sucursalId, desde, hasta),
      ReportesModel.findMermasPeriodo(sucursalId, desde, hasta),
      ReportesModel.findComprasPeriodo(sucursalId, desde, hasta),
    ]);

    let ingresosTotales = 0;
    let subtotalSinIva = 0;
    let ivaTotal = 0;
    let costoRecetasTotal = 0;

    const porMetodoPago: Record<string, { cantidad: number; total: number }> = {
      EFECTIVO: { cantidad: 0, total: 0 },
      TARJETA: { cantidad: 0, total: 0 },
    };

    const porTipoServicio: Record<string, { cantidad: number; total: number }> = {
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

    const costoMermasTotal = round2(Number(mermas._sum.costoEstimado ?? 0));
    const totalCompras = round2(Number(compras._sum.total ?? 0));
    const utilidadBruta = round2(ingresosTotales - costoRecetasTotal - costoMermasTotal);
    const margenBrutoPct =
      ingresosTotales > 0 ? round2((utilidadBruta / ingresosTotales) * 100) : 0;
    const ticketPromedio = ventas.length > 0 ? round2(ingresosTotales / ventas.length) : 0;

    return {
      periodo: { fechaDesde: labelDesde, fechaHasta: labelHasta },
      kpis: {
        cantidadVentas: ventas.length,
        ingresosTotales,
        subtotalSinIva,
        ivaTotal,
        costoRecetasTotal,
        costoMermasTotal,
        cantidadMermas: mermas._count.id,
        totalCompras,
        utilidadBruta,
        margenBrutoPct,
        ticketPromedio,
      },
      porMetodoPago,
      porTipoServicio,
    };
  }

  static async ventasPorPeriodo(sucursalId: number, fechaDesde?: string, fechaHasta?: string) {
    const { desde, hasta } = parseDateRange(fechaDesde, fechaHasta);
    const ventas = await ReportesModel.findVentasCompletadas(sucursalId, desde, hasta);

    const mapaDias = new Map<
      string,
      { fecha: string; cantidadVentas: number; ingresos: number; costos: number; utilidad: number }
    >();

    for (const v of ventas) {
      const key = v.createdAt.toISOString().slice(0, 10);
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

  static async productosMasVendidos(
    sucursalId: number,
    fechaDesde?: string,
    fechaHasta?: string,
    limit = 10,
  ) {
    const { desde, hasta } = parseDateRange(fechaDesde, fechaHasta);
    const ventas = await ReportesModel.findVentasCompletadas(sucursalId, desde, hasta);

    const mapaProductos = new Map<
      number,
      {
        platilloId: number;
        nombre: string;
        cantidadVendida: number;
        ingresos: number;
        costoTotal: number;
        utilidad: number;
      }
    >();

    for (const v of ventas) {
      for (const det of v.detalles) {
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

  static async exportarPdf(
    sucursalId: number,
    fechaDesde?: string,
    fechaHasta?: string,
  ): Promise<Buffer> {
    const [sucursal, resumen, serie, topProductos] = await Promise.all([
      ReportesModel.findSucursal(sucursalId),
      this.obtenerResumen(sucursalId, fechaDesde, fechaHasta),
      this.ventasPorPeriodo(sucursalId, fechaDesde, fechaHasta),
      this.productosMasVendidos(sucursalId, fechaDesde, fechaHasta, 15),
    ]);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 45, size: 'LETTER' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const q = (val: number) => `Q ${val.toFixed(2)}`;

      // Encabezado
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
        .text(`Período: ${resumen.periodo.fechaDesde} al ${resumen.periodo.fechaHasta}  |  Generado: ${new Date().toLocaleString('es-GT')}`);
      doc.moveDown(1);

      // KPIs
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#111111').text('1. Resumen Financiero');
      doc.moveDown(0.4);
      doc.fontSize(10).font('Helvetica');
      const k = resumen.kpis;
      doc.text(`• Ventas completadas: ${k.cantidadVentas}   |   Ticket promedio: ${q(k.ticketPromedio)}`);
      doc.text(`• Ingresos totales (IVA incluido): ${q(k.ingresosTotales)}   (Base: ${q(k.subtotalSinIva)} | IVA 12%: ${q(k.ivaTotal)})`);
      doc.text(`• Costo por recetas vendidas: ${q(k.costoRecetasTotal)}   |   Costo por mermas: ${q(k.costoMermasTotal)}`);
      doc.text(`• Utilidad bruta estimada: ${q(k.utilidadBruta)}   |   Margen bruto: ${k.margenBrutoPct.toFixed(2)}%`);
      doc.text(
        `• Efectivo: ${q(resumen.porMetodoPago.EFECTIVO?.total ?? 0)} (${resumen.porMetodoPago.EFECTIVO?.cantidad ?? 0})   |   Tarjeta: ${q(resumen.porMetodoPago.TARJETA?.total ?? 0)} (${resumen.porMetodoPago.TARJETA?.cantidad ?? 0})`,
      );
      doc.moveDown(1);

      // Top Productos
      doc.fontSize(12).font('Helvetica-Bold').text('2. Productos Más Vendidos');
      doc.moveDown(0.4);
      doc.fontSize(9).font('Helvetica');
      if (topProductos.length === 0) {
        doc.text('Sin ventas registradas en el período seleccionado.');
      } else {
        for (const [idx, prod] of topProductos.entries()) {
          doc.text(
            `${idx + 1}. ${prod.nombre} — Cant: ${prod.cantidadVendida} | Ingresos: ${q(prod.ingresos)} | Costo: ${q(prod.costoTotal)} | Utilidad: ${q(prod.utilidad)}`,
          );
        }
      }
      doc.moveDown(1);

      // Serie diaria
      doc.fontSize(12).font('Helvetica-Bold').text('3. Desglose Diario de Ventas');
      doc.moveDown(0.4);
      doc.fontSize(9).font('Helvetica');
      if (serie.length === 0) {
        doc.text('Sin movimientos diarios en el período.');
      } else {
        for (const dia of serie) {
          doc.text(
            `${dia.fecha} — Tickets: ${dia.cantidadVentas} | Ingresos: ${q(dia.ingresos)} | Costo Receta: ${q(dia.costos)} | Utilidad: ${q(dia.utilidad)}`,
          );
        }
      }

      doc.end();
    });
  }

  static async exportarExcel(
    sucursalId: number,
    fechaDesde?: string,
    fechaHasta?: string,
  ): Promise<Buffer> {
    const [sucursal, resumen, serie, topProductos] = await Promise.all([
      ReportesModel.findSucursal(sucursalId),
      this.obtenerResumen(sucursalId, fechaDesde, fechaHasta),
      this.ventasPorPeriodo(sucursalId, fechaDesde, fechaHasta),
      this.productosMasVendidos(sucursalId, fechaDesde, fechaHasta, 50),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'POS Restaurante Guatemala';
    workbook.created = new Date();

    // Hoja 1: Resumen
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

    // Hoja 2: Ventas por Día
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

    // Hoja 3: Productos Más Vendidos
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
