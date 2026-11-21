const { AuditoriaService } = require('../services/auditoria.service');
class AuditoriaController {
    static async listar(req, res, next) {
        try {
            const { items, meta } = await AuditoriaService.listar(req.user.sucursalId, {
                page: req.query.page,
                limit: req.query.limit,
                usuarioId: typeof req.query.usuarioId === 'string' ? req.query.usuarioId : undefined,
                accion: typeof req.query.accion === 'string' ? req.query.accion : undefined,
                entidad: typeof req.query.entidad === 'string' ? req.query.entidad : undefined,
                fechaDesde: typeof req.query.fechaDesde === 'string' ? req.query.fechaDesde : undefined,
                fechaHasta: typeof req.query.fechaHasta === 'string' ? req.query.fechaHasta : undefined,
            });
            res.status(200).json({ ok: true, data: items, meta });
        }
        catch (error) {
            next(error);
        }
    }
    static async catalogo(req, res, next) {
        try {
            const data = await AuditoriaService.obtenerCatalogoFiltros(req.user.sucursalId);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
}

module.exports = { AuditoriaController };
