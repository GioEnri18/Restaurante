const { FacturasService } = require('../services/facturas.service');
class FacturasController {
    static async listar(req, res, next) {
        try {
            const { items, meta } = await FacturasService.listar(req.user.sucursalId, {
                page: req.query.page,
                limit: req.query.limit,
                numero: typeof req.query.numero === 'string' ? req.query.numero : undefined,
                cliente: typeof req.query.cliente === 'string' ? req.query.cliente : undefined,
                fechaDesde: typeof req.query.fechaDesde === 'string' ? req.query.fechaDesde : undefined,
                fechaHasta: typeof req.query.fechaHasta === 'string' ? req.query.fechaHasta : undefined,
                montoMin: typeof req.query.montoMin === 'string' ? req.query.montoMin : undefined,
                montoMax: typeof req.query.montoMax === 'string' ? req.query.montoMax : undefined,
                estado: req.query.estado === 'EMITIDA' || req.query.estado === 'ANULADA'
                    ? req.query.estado
                    : undefined,
            }, req.user);
            res.status(200).json({ ok: true, data: items, meta });
        }
        catch (error) {
            next(error);
        }
    }
    static async detalle(req, res, next) {
        try {
            const id = Number(req.params.id);
            const data = await FacturasService.obtenerDetalle(id, req.user.sucursalId, req.user);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async reimprimir(req, res, next) {
        try {
            const id = Number(req.params.id);
            const data = await FacturasService.reimprimir(req.user, id, req.clientMeta, req.body.documento);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async anular(req, res, next) {
        try {
            const id = Number(req.params.id);
            const data = await FacturasService.anular(req.user, id, req.body, req.clientMeta);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
}

module.exports = { FacturasController };
