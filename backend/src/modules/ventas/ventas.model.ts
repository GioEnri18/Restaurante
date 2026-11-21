import { EstadoCaja, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';

export class VentasModel {
  static async getMenuData(sucursalId: number, search?: string, categoriaId?: number) {
    const platilloWhere: Prisma.PlatilloWhereInput = {
      activo: true,
      ...(categoriaId ? { categoriaId } : {}),
      ...(search
        ? {
            OR: [
              { nombre: { contains: search, mode: 'insensitive' } },
              { descripcion: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [categorias, platillos, mesas, cajaAbierta, menusEspeciales] = await Promise.all([
      prisma.categoria.findMany({
        where: {
          activa: true,
          OR: [{ sucursalId }, { sucursalId: null }],
        },
        orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
      }),
      prisma.platillo.findMany({
        where: platilloWhere,
        orderBy: [{ categoria: { orden: 'asc' } }, { nombre: 'asc' }],
        include: {
          categoria: { select: { id: true, nombre: true } },
          receta: {
            include: {
              ingrediente: {
                select: {
                  id: true,
                  codigo: true,
                  nombre: true,
                  stockActualOz: true,
                  costoPromedioOz: true,
                },
              },
            },
          },
        },
      }),
      prisma.mesa.findMany({
        where: { sucursalId, activa: true },
        orderBy: { numero: 'asc' },
      }),
      prisma.cajaSesion.findFirst({
        where: { sucursalId, estado: EstadoCaja.ABIERTA },
        select: { id: true, fechaApertura: true, montoInicial: true },
      }),
      prisma.menuEspecial.findMany({
        where: { sucursalId },
        orderBy: [{ fechaInicio: 'asc' }, { id: 'desc' }],
        include: {
          creadoPor: { select: { id: true, nombreCompleto: true } },
          platillos: {
            include: {
              platillo: {
                select: { id: true, sku: true, nombre: true, precioVenta: true, categoriaId: true },
              },
            },
          },
        },
      }),
    ]);

    return { categorias, platillos, mesas, cajaAbierta, menusEspeciales };
  }

  static async findMenusEspeciales(sucursalId: number) {
    return prisma.menuEspecial.findMany({
      where: { sucursalId },
      orderBy: [{ fechaInicio: 'asc' }, { id: 'desc' }],
      include: {
        creadoPor: { select: { id: true, nombreCompleto: true } },
        platillos: {
          include: {
            platillo: {
              select: {
                id: true,
                sku: true,
                nombre: true,
                precioVenta: true,
                categoria: { select: { nombre: true } },
              },
            },
          },
        },
      },
    });
  }

  static async findComandaByVentaId(ventaId: number, sucursalId: number) {
    return prisma.comanda.findFirst({
      where: { ventaId, sucursalId },
      include: {
        sucursal: { select: { nombre: true, direccion: true, telefono: true } },
        venta: {
          include: {
            usuario: { select: { nombreCompleto: true } },
            detalles: true,
          },
        },
      },
    });
  }
}
