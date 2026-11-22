const { AuditoriaService } = require('../services/auditoria.service');
const { ROL_ADMIN_CODIGO } = require('../config/constants');
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
            }, req.user.rolCodigo === ROL_ADMIN_CODIGO);
            res.set('Cache-Control', 'no-store').json({ ok: true, data: items, meta });
        }
        catch (error) {
            next(error);
        }
    }
    static async catalogo(req, res, next) {
        try {
            const data = await AuditoriaService.obtenerCatalogoFiltros(req.user.sucursalId, req.user.rolCodigo === ROL_ADMIN_CODIGO);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async nomina(req, res, next) {
        try {
            const data = await AuditoriaService.listarNomina(req.user.sucursalId);
            res.set('Cache-Control', 'no-store').json({ ok: true, data });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = { AuditoriaController };
