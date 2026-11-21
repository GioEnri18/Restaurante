import { ACCIONES_AUDITORIA } from '../../config/constants';
import { buildPaginationMeta, parsePagination } from '../../shared/utils/pagination';
import { AuditoriaModel } from './auditoria.model';

export class AuditoriaService {
  static async listar(
    sucursalId: number,
    query: {
      page?: unknown;
      limit?: unknown;
      usuarioId?: string;
      accion?: string;
      entidad?: string;
      fechaDesde?: string;
      fechaHasta?: string;
    },
  ) {
    const { page, limit, skip } = parsePagination(query.page, query.limit, 15, 100);
    const { items, total } = await AuditoriaModel.findPaginated(
      {
        sucursalId,
        usuarioId: query.usuarioId ? Number(query.usuarioId) : undefined,
        accion: query.accion?.trim() || undefined,
        entidad: query.entidad?.trim() || undefined,
        fechaDesde: query.fechaDesde ? new Date(`${query.fechaDesde}T00:00:00.000`) : undefined,
        fechaHasta: query.fechaHasta ? new Date(`${query.fechaHasta}T23:59:59.999`) : undefined,
      },
      skip,
      limit,
    );

    return {
      items,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  static async obtenerCatalogoFiltros(sucursalId: number) {
    const usuarios = await AuditoriaModel.findUsuariosSucursal(sucursalId);
    return {
      acciones: Object.values(ACCIONES_AUDITORIA),
      usuarios,
    };
  }
}
