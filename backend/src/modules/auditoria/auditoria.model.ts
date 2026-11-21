import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';

export class AuditoriaModel {
  static async findPaginated(
    filtro: {
      sucursalId: number;
      usuarioId?: number;
      accion?: string;
      entidad?: string;
      fechaDesde?: Date;
      fechaHasta?: Date;
    },
    skip: number,
    take: number,
  ) {
    const where: Prisma.AuditoriaLogWhereInput = {
      OR: [{ sucursalId: filtro.sucursalId }, { sucursalId: null }],
      ...(filtro.usuarioId ? { usuarioId: filtro.usuarioId } : {}),
      ...(filtro.accion ? { accion: filtro.accion } : {}),
      ...(filtro.entidad ? { entidad: filtro.entidad } : {}),
      ...(filtro.fechaDesde || filtro.fechaHasta
        ? {
            createdAt: {
              ...(filtro.fechaDesde ? { gte: filtro.fechaDesde } : {}),
              ...(filtro.fechaHasta ? { lte: filtro.fechaHasta } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditoriaLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          usuario: {
            select: {
              id: true,
              username: true,
              nombreCompleto: true,
              rol: { select: { nombre: true, codigo: true } },
            },
          },
        },
      }),
      prisma.auditoriaLog.count({ where }),
    ]);

    return { items, total };
  }

  static async findUsuariosSucursal(sucursalId: number) {
    return prisma.usuario.findMany({
      where: { sucursalId },
      orderBy: { nombreCompleto: 'asc' },
      select: { id: true, username: true, nombreCompleto: true },
    });
  }
}
