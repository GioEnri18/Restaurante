import { Prisma, TipoMovimientoInventario } from '@prisma/client';
import { prisma } from '../../config/database';

export class InventarioModel {
  static async findIngredientes(sucursalId: number, search?: string) {
    return prisma.ingrediente.findMany({
      where: {
        sucursalId,
        activo: true,
        ...(search
          ? {
              OR: [
                { nombre: { contains: search, mode: 'insensitive' } },
                { codigo: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { nombre: 'asc' },
      include: {
        proveedor: { select: { id: true, nombre: true, telefono: true } },
      },
    });
  }

  static async findProveedores(sucursalId: number) {
    return prisma.proveedor.findMany({
      where: { sucursalId, activo: true },
      orderBy: { nombre: 'asc' },
      include: {
        _count: { select: { ingredientes: true, compras: true } },
      },
    });
  }

  static async findCompras(sucursalId: number, skip: number, take: number) {
    const [items, total] = await Promise.all([
      prisma.compra.findMany({
        where: { sucursalId },
        orderBy: { fechaCompra: 'desc' },
        skip,
        take,
        include: {
          proveedor: { select: { id: true, nombre: true } },
          usuario: { select: { id: true, nombreCompleto: true } },
          detalles: {
            include: {
              ingrediente: { select: { id: true, codigo: true, nombre: true } },
            },
          },
        },
      }),
      prisma.compra.count({ where: { sucursalId } }),
    ]);

    return { items, total };
  }

  static async findMovimientos(
    filtro: {
      sucursalId: number;
      ingredienteId?: number;
      tipo?: TipoMovimientoInventario;
      fechaDesde?: Date;
      fechaHasta?: Date;
    },
    skip: number,
    take: number,
  ) {
    const where: Prisma.InventarioMovimientoWhereInput = {
      sucursalId: filtro.sucursalId,
      ...(filtro.ingredienteId ? { ingredienteId: filtro.ingredienteId } : {}),
      ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
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
      prisma.inventarioMovimiento.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          ingrediente: { select: { id: true, codigo: true, nombre: true } },
          usuario: { select: { id: true, nombreCompleto: true } },
        },
      }),
      prisma.inventarioMovimiento.count({ where }),
    ]);

    return { items, total };
  }
}
