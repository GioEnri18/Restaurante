import { EstadoCaja } from '@prisma/client';
import { prisma } from '../../config/database';

export class CajaModel {
  static async findOpenSession(sucursalId: number) {
    return prisma.cajaSesion.findFirst({
      where: { sucursalId, estado: EstadoCaja.ABIERTA },
      include: {
        usuarioApertura: { select: { id: true, nombreCompleto: true, username: true } },
        movimientos: {
          orderBy: { createdAt: 'desc' },
          include: {
            usuario: { select: { id: true, nombreCompleto: true } },
          },
        },
      },
    });
  }

  static async findHistory(sucursalId: number, skip: number, take: number) {
    const [items, total] = await Promise.all([
      prisma.cajaSesion.findMany({
        where: { sucursalId },
        orderBy: { fechaApertura: 'desc' },
        skip,
        take,
        include: {
          usuarioApertura: { select: { id: true, nombreCompleto: true } },
          usuarioCierre: { select: { id: true, nombreCompleto: true } },
          _count: { select: { ventas: true, movimientos: true } },
        },
      }),
      prisma.cajaSesion.count({ where: { sucursalId } }),
    ]);

    return { items, total };
  }
}
