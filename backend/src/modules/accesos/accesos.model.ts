import { prisma } from '../../config/database';

export class AccesosModel {
  static async findUsuarios(sucursalId: number) {
    return prisma.usuario.findMany({
      where: { sucursalId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        sucursalId: true,
        rolId: true,
        nombreCompleto: true,
        username: true,
        email: true,
        activo: true,
        ultimoAcceso: true,
        createdAt: true,
        rol: {
          select: {
            id: true,
            codigo: true,
            nombre: true,
            vistaInicial: true,
            rolPermisos: {
              include: { permiso: { select: { id: true, codigo: true } } },
            },
          },
        },
        usuarioPermisos: {
          include: { permiso: { select: { id: true, codigo: true } } },
        },
      },
    });
  }

  static async findRoles() {
    return prisma.rol.findMany({
      orderBy: { id: 'asc' },
      include: {
        rolPermisos: {
          include: { permiso: true },
        },
        _count: { select: { usuarios: true } },
      },
    });
  }

  static async findPermisos() {
    return prisma.permiso.findMany({
      orderBy: [{ vista: 'asc' }, { accion: 'asc' }],
    });
  }
}
