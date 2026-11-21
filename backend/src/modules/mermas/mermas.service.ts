import { MotivoMerma, TipoMovimientoInventario, UnidadMedida } from '@prisma/client';
import { prisma } from '../../config/database';
import { ACCIONES_AUDITORIA } from '../../config/constants';
import { BadRequestError, NotFoundError } from '../../shared/errors/AppError';
import { AuditService } from '../../shared/services/audit.service';
import { UnitConversionService } from '../../shared/services/unitConversion.service';
import { buildPaginationMeta, parsePagination } from '../../shared/utils/pagination';
import { round2, round4 } from '../../shared/utils/tax';
import { AuthenticatedUser, ClientMeta } from '../../types/express';
import { MermasModel } from './mermas.model';

export class MermasService {
  static async listar(
    sucursalId: number,
    query: {
      page?: unknown;
      limit?: unknown;
      motivo?: MotivoMerma;
      ingredienteId?: string;
      fechaDesde?: string;
      fechaHasta?: string;
    },
  ) {
    const { page, limit, skip } = parsePagination(query.page, query.limit, 10);
    const { items, total, costoTotalMermas, totalOzMermadas } = await MermasModel.findPaginated(
      {
        sucursalId,
        motivo: query.motivo,
        ingredienteId: query.ingredienteId ? Number(query.ingredienteId) : undefined,
        fechaDesde: query.fechaDesde ? new Date(`${query.fechaDesde}T00:00:00.000`) : undefined,
        fechaHasta: query.fechaHasta ? new Date(`${query.fechaHasta}T23:59:59.999`) : undefined,
      },
      skip,
      limit,
    );

    return {
      items: items.map((m) => ({
        ...m,
        cantidadOriginal: Number(m.cantidadOriginal),
        cantidadOz: Number(m.cantidadOz),
        costoEstimado: Number(m.costoEstimado),
      })),
      resumen: {
        costoTotalMermas: round2(costoTotalMermas),
        totalOzMermadas: round4(totalOzMermadas),
        totalLbMermadas: UnitConversionService.ozToLb(totalOzMermadas),
      },
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  /**
   * Cada merma descuenta automáticamente del inventario (convertida a oz) y genera
   * tanto un movimiento SALIDA_MERMA en Kardex como su registro en auditoría.
   */
  static async registrar(
    user: AuthenticatedUser,
    input: {
      ingredienteId: number;
      cantidad: number;
      unidad: UnidadMedida;
      motivo: MotivoMerma;
      observacion?: string;
      fecha?: string;
    },
    clientMeta: ClientMeta,
  ) {
    return prisma.$transaction(async (tx) => {
      const ingrediente = await tx.ingrediente.findFirst({
        where: { id: input.ingredienteId, sucursalId: user.sucursalId, activo: true },
      });

      if (!ingrediente) {
        throw new NotFoundError('Ingrediente no encontrado');
      }

      const cantidadOz = UnitConversionService.toBaseOz(input.cantidad, input.unidad);
      const stockAnteriorOz = Number(ingrediente.stockActualOz);

      if (cantidadOz > stockAnteriorOz) {
        throw new BadRequestError(
          `La merma (${cantidadOz} oz) supera las existencias actuales (${stockAnteriorOz} oz)`,
        );
      }

      const stockNuevoOz = round4(stockAnteriorOz - cantidadOz);
      const costoUnitarioOz = Number(ingrediente.costoPromedioOz);
      const costoEstimado = round2(cantidadOz * costoUnitarioOz);

      const merma = await tx.merma.create({
        data: {
          sucursalId: user.sucursalId,
          ingredienteId: ingrediente.id,
          usuarioId: user.id,
          cantidadOriginal: round4(input.cantidad),
          unidadOriginal: input.unidad,
          cantidadOz,
          costoEstimado,
          motivo: input.motivo,
          observacion: input.observacion?.trim() || null,
          fecha: input.fecha ? new Date(input.fecha) : new Date(),
        },
        include: {
          ingrediente: { select: { id: true, codigo: true, nombre: true } },
          usuario: { select: { id: true, nombreCompleto: true } },
        },
      });

      await tx.ingrediente.update({
        where: { id: ingrediente.id },
        data: { stockActualOz: stockNuevoOz },
      });

      await tx.inventarioMovimiento.create({
        data: {
          sucursalId: user.sucursalId,
          ingredienteId: ingrediente.id,
          usuarioId: user.id,
          tipo: TipoMovimientoInventario.SALIDA_MERMA,
          cantidadOz: -cantidadOz,
          stockAnteriorOz,
          stockNuevoOz,
          costoUnitarioOz,
          referenciaTipo: 'MERMA',
          referenciaId: merma.id,
          motivo: `Merma (${input.motivo}): ${input.observacion?.trim() || 'Sin observación'}`,
        },
      });

      await AuditService.registrar(
        {
          sucursalId: user.sucursalId,
          usuarioId: user.id,
          accion: ACCIONES_AUDITORIA.REGISTRO_MERMA,
          entidad: 'Merma',
          entidadId: merma.id,
          valorAnterior: {
            ingrediente: ingrediente.nombre,
            stockActualOz: stockAnteriorOz,
          },
          valorNuevo: {
            ingrediente: ingrediente.nombre,
            stockActualOz: stockNuevoOz,
            cantidadMermada: `${input.cantidad} ${input.unidad} (${cantidadOz} oz)`,
            motivo: input.motivo,
            costoEstimado,
          },
          motivo: input.observacion?.trim() || input.motivo,
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return merma;
    });
  }
}
