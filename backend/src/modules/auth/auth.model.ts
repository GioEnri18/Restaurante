import { prisma } from '../../config/database';

export class AuthModel {
  static async findByUsernameOrEmail(identifier: string) {
    return prisma.usuario.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }],
      },
      include: {
        rol: true,
        sucursal: true,
      },
    });
  }

  static async updateUltimoAcceso(usuarioId: number) {
    return prisma.usuario.update({
      where: { id: usuarioId },
      data: { ultimoAcceso: new Date() },
    });
  }

  static async findSucursalById(sucursalId: number) {
    return prisma.sucursal.findUnique({
      where: { id: sucursalId },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        nit: true,
        direccion: true,
        telefono: true,
        serieFactura: true,
      },
    });
  }
}
