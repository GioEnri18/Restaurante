const { ReportesService } = require('../services/reportes.service');
class ReportesController {
    static async balance(req, res, next) {
        try {
            const data = await ReportesService.obtenerBalance(req.user.sucursalId, req.query.fechaDesde, req.query.fechaHasta);
            res.set('Cache-Control', 'no-store').json({ ok: true, data });
        } catch (error) {
            next(error);
        }
    }
    static async resumen(req, res, next) {
        try {
            const fechaDesde = typeof req.query.fechaDesde === 'string' ? req.query.fechaDesde : undefined;
            const fechaHasta = typeof req.query.fechaHasta === 'string' ? req.query.fechaHasta : undefined;
            const data = await ReportesService.obtenerResumen(req.user.sucursalId, fechaDesde, fechaHasta);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async ventasPeriodo(req, res, next) {
        try {
            const fechaDesde = typeof req.query.fechaDesde === 'string' ? req.query.fechaDesde : undefined;
            const fechaHasta = typeof req.query.fechaHasta === 'string' ? req.query.fechaHasta : undefined;
            const resultado = await ReportesService.ventasPorPeriodo(req.user.sucursalId, fechaDesde, fechaHasta, req.query.page);
            res.status(200).json({ ok: true, ...(Array.isArray(resultado) ? { data: resultado } : resultado) });
        }
        catch (error) {
            next(error);
        }
    }
    static async productosMasVendidos(req, res, next) {
        try {
            const fechaDesde = typeof req.query.fechaDesde === 'string' ? req.query.fechaDesde : undefined;
            const fechaHasta = typeof req.query.fechaHasta === 'string' ? req.query.fechaHasta : undefined;
            const limit = req.query.limit ? Number(req.query.limit) : 10;
            const resultado = await ReportesService.productosMasVendidos(req.user.sucursalId, fechaDesde, fechaHasta, limit, req.query.page);
            res.status(200).json({ ok: true, ...(Array.isArray(resultado) ? { data: resultado } : resultado) });
        }
        catch (error) {
            next(error);
        }
    }
    static async exportarPdf(req, res, next) {
        try {
            const fechaDesde = typeof req.query.fechaDesde === 'string' ? req.query.fechaDesde : undefined;
            const fechaHasta = typeof req.query.fechaHasta === 'string' ? req.query.fechaHasta : undefined;
            const buffer = await ReportesService.exportarPdf(req.user.sucursalId, fechaDesde, fechaHasta);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="reporte-pos-restaurante.pdf"');
            res.send(buffer);
        }
        catch (error) {
            next(error);
        }
    }
    static async exportarExcel(req, res, next) {
        try {
            const fechaDesde = typeof req.query.fechaDesde === 'string' ? req.query.fechaDesde : undefined;
            const fechaHasta = typeof req.query.fechaHasta === 'string' ? req.query.fechaHasta : undefined;
            const buffer = await ReportesService.exportarExcel(req.user.sucursalId, fechaDesde, fechaHasta);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename="reporte-pos-restaurante.xlsx"');
            res.send(buffer);
        }
        catch (error) {
            next(error);
        }
    }
}

module.exports = { ReportesController };
