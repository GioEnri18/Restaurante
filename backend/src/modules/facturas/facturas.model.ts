import { EstadoFactura, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';

export interface FacturasFiltro {
  sucursalId: number;
  numero?: string;
  cliente?: string;
  fechaDesde?: Date;
  fechaHasta?: Date;
  montoMin?: number;
  montoMax?: number;
  estado?: EstadoFactura;
}

export class FacturasModel {
  static buildWhere(filtro: FacturasFiltro): Prisma.FacturaWhereInput {
    const where: Prisma.FacturaWhereInput = {
      sucursalId: filtro.sucursalId,
    };

    if (filtro.numero) {
      where.numeroCompleto = { contains: filtro.numero, mode: 'insensitive' };
    }

    if (filtro.cliente) {
      where.OR = [
        { clienteNombre: { contains: filtro.cliente, mode: 'insensitive' } },
        { clienteNit: { contains: filtro.cliente, mode: 'insensitive' } },
      ];
    }

    if (filtro.estado) {
      where.estado = filtro.estado;
    }

    if (filtro.fechaDesde || filtro.fechaHasta) {
      where.createdAt = {
        ...(filtro.fechaDesde ? { gte: filtro.fechaDesde } : {}),
        ...(filtro.fechaHasta ? { lte: filtro.fechaHasta } : {}),
      };
    }

    if (filtro.montoMin !== undefined || filtro.montoMax !== undefined) {
      where.total = {
        ...(filtro.montoMin !== undefined ? { gte: filtro.montoMin } : {}),
        ...(filtro.montoMax !== undefined ? { lte: filtro.montoMax } : {}),
      };
    }

    return where;
  }

  static async findPaginated(filtro: FacturasFiltro, skip: number, take: number) {
    const where = this.buildWhere(filtro);
    const [items, total] = await Promise.all([
      prisma.factura.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          venta: {
            select: {
              id: true,
              tipoServicio: true,
              metodoPago: true,
              usuario: { select: { id: true, nombreCompleto: true } },
              mesa: { select: { numero: true } },
              comanda: { select: { numeroComanda: true } },
            },
          },
          anuladaPor: { select: { id: true, nombreCompleto: true } },
        },
      }),
      prisma.factura.count({ where }),
    ]);

    return { items, total };
  }

  static async findDetailById(id: number, sucursalId: number) {
    return prisma.factura.findFirst({
      where: { id, sucursalId },
      include: {
        sucursal: {
          select: {
            id: true,
            nombre: true,
            nit: true,
            direccion: true,
            telefono: true,
          },
        },
        anuladaPor: { select: { id: true, nombreCompleto: true } },
        venta: {
          include: {
            usuario: { select: { id: true, nombreCompleto: true } },
            mesa: { select: { id: true, numero: true } },
            comanda: true,
            detalles: true,
          },
        },
      },
    });
  }
}
