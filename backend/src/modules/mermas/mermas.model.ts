import { MotivoMerma, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';

export class MermasModel {
  static async findPaginated(
    filtro: {
      sucursalId: number;
      motivo?: MotivoMerma;
      ingredienteId?: number;
      fechaDesde?: Date;
      fechaHasta?: Date;
    },
    skip: number,
    take: number,
  ) {
    const where: Prisma.MermaWhereInput = {
      sucursalId: filtro.sucursalId,
      ...(filtro.motivo ? { motivo: filtro.motivo } : {}),
      ...(filtro.ingredienteId ? { ingredienteId: filtro.ingredienteId } : {}),
      ...(filtro.fechaDesde || filtro.fechaHasta
        ? {
            fecha: {
              ...(filtro.fechaDesde ? { gte: filtro.fechaDesde } : {}),
              ...(filtro.fechaHasta ? { lte: filtro.fechaHasta } : {}),
            },
          }
        : {}),
    };

    const [items, total, agregado] = await Promise.all([
      prisma.merma.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip,
        take,
        include: {
          ingrediente: { select: { id: true, codigo: true, nombre: true } },
          usuario: { select: { id: true, nombreCompleto: true } },
        },
      }),
      prisma.merma.count({ where }),
      prisma.merma.aggregate({
        where,
        _sum: { costoEstimado: true, cantidadOz: true },
      }),
    ]);

    return {
      items,
      total,
      costoTotalMermas: Number(agregado._sum.costoEstimado ?? 0),
      totalOzMermadas: Number(agregado._sum.cantidadOz ?? 0),
    };
  }
}
