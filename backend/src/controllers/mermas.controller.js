const { MotivoMerma } = require('../models');
const { MermasService } = require('../services/mermas.service');
const { toIsoDateInTimezone } = require('../shared/utils/dates');
class MermasController {
    static async listar(req, res, next) {
        try {
            const esCajero = req.user.rolCodigo === 'CAJERO';
            const diaCajero = esCajero ? toIsoDateInTimezone() : undefined;
            const { items, resumen, meta } = await MermasService.listar(req.user.sucursalId, {
                page: req.query.page,
                limit: req.query.limit,
                motivo: typeof req.query.motivo === 'string' &&
                    Object.values(MotivoMerma).includes(req.query.motivo)
                    ? req.query.motivo
                    : undefined,
                ingredienteId: typeof req.query.ingredienteId === 'string' ? req.query.ingredienteId : undefined,
                // El cajero solo puede consultar las mermas que él mismo registró hoy
                usuarioId: esCajero ? req.user.id : undefined,
                fechaDesde: diaCajero ?? req.query.fechaDesde,
                fechaHasta: diaCajero ?? req.query.fechaHasta,
            });
            res.status(200).json({ ok: true, data: { items, resumen }, meta });
        }
        catch (error) {
            next(error);
        }
    }
    static async registrar(req, res, next) {
        try {
            const data = await MermasService.registrar(req.user, req.body, req.clientMeta);
            res.status(201).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
}

module.exports = { MermasController };
