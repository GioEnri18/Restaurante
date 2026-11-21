import { EstadoVenta } from '@prisma/client';
import { prisma } from '../../config/database';

export class ReportesModel {
  static async findSucursal(sucursalId: number) {
    return prisma.sucursal.findUnique({
      where: { id: sucursalId },
      select: { id: true, nombre: true, nit: true, direccion: true },
    });
  }

  static async findVentasCompletadas(sucursalId: number, desde: Date, hasta: Date) {
    return prisma.venta.findMany({
      where: {
        sucursalId,
        estado: EstadoVenta.COMPLETADA,
        createdAt: { gte: desde, lte: hasta },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        detalles: true,
      },
    });
  }

  static async findMermasPeriodo(sucursalId: number, desde: Date, hasta: Date) {
    return prisma.merma.aggregate({
      where: {
        sucursalId,
        fecha: { gte: desde, lte: hasta },
      },
      _sum: { costoEstimado: true, cantidadOz: true },
      _count: { id: true },
    });
  }

  static async findComprasPeriodo(sucursalId: number, desde: Date, hasta: Date) {
    return prisma.compra.aggregate({
      where: {
        sucursalId,
        fechaCompra: { gte: desde, lte: hasta },
      },
      _sum: { total: true },
      _count: { id: true },
    });
  }
}
