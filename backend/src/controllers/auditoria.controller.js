const { ROL_ADMIN_CODIGO } = require('../config/constants');
const { AuditoriaService } = require('../services/auditoria.service');
const { ForbiddenError } = require('../shared/errors/AppError');

function alcanceAuditoria(user, query) {
  if (user.rolCodigo === ROL_ADMIN_CODIGO) return query?.ambito === 'economica' ? 'economica' : true;
  if (user.permisos.includes('auditoria:sistema')) return 'sistema';
  if (user.permisos.includes('auditoria:economica')) return 'economica';
  throw new ForbiddenError('No tienes acceso al ámbito de auditoría');
}

function extraerFiltrosQuery(query) {
  return {
    page: query.page,
    limit: query.limit,
    usuarioId: typeof query.usuarioId === 'string' ? query.usuarioId : undefined,
    aprobadorId: typeof query.aprobadorId === 'string' ? query.aprobadorId : undefined,
    cajaSesionId: typeof query.cajaSesionId === 'string' ? query.cajaSesionId : undefined,
    accion: typeof query.accion === 'string' ? query.accion : undefined,
    severidad: typeof query.severidad === 'string' ? query.severidad : undefined,
    entidad: typeof query.entidad === 'string' ? query.entidad : undefined,
    entidadId: typeof query.entidadId === 'string' ? query.entidadId : undefined,
    impactoMin: typeof query.impactoMin === 'string' ? query.impactoMin : undefined,
    impactoMax: typeof query.impactoMax === 'string' ? query.impactoMax : undefined,
    fechaDesde: typeof query.fechaDesde === 'string' ? query.fechaDesde : undefined,
    fechaHasta: typeof query.fechaHasta === 'string' ? query.fechaHasta : undefined,
  };
}

class AuditoriaController {
  static async listar(req, res, next) {
    try {
      const conNomina = alcanceAuditoria(req.user, req.query);
      const { items, meta } = await AuditoriaService.listar(
        req.user.sucursalId,
        extraerFiltrosQuery(req.query),
        conNomina,
      );
      res.set('Cache-Control', 'no-store').json({ ok: true, data: items, meta });
    } catch (error) {
      next(error);
    }
  }

  static async resumen(req, res, next) {
    try {
      const conNomina = alcanceAuditoria(req.user, req.query);
      const data = await AuditoriaService.obtenerResumen(
        req.user.sucursalId,
        extraerFiltrosQuery(req.query),
        conNomina,
      );
      res.set('Cache-Control', 'no-store').json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async detalle(req, res, next) {
    try {
      const conNomina = alcanceAuditoria(req.user, req.query);
      const data = await AuditoriaService.obtenerDetalle(
        req.user.sucursalId,
        Number(req.params.id),
        conNomina,
      );
      res.set('Cache-Control', 'no-store').json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async exportar(req, res, next) {
    try {
      const conNomina = alcanceAuditoria(req.user, req.query);
      await AuditoriaService.exportarCsv(
        req.user,
        extraerFiltrosQuery(req.query),
        req.clientMeta,
        res,
        conNomina,
      );
    } catch (error) {
      next(error);
    }
  }

  static async catalogo(req, res, next) {
    try {
      const conNomina = alcanceAuditoria(req.user, req.query);
      const data = await AuditoriaService.obtenerCatalogoFiltros(req.user.sucursalId, conNomina);
      res.status(200).json({ ok: true, data });
    } catch (error) {
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
