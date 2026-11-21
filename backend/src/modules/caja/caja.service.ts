import { EstadoCaja, MetodoPago, TipoMovimientoCaja } from '@prisma/client';
import { prisma } from '../../config/database';
import { ACCIONES_AUDITORIA } from '../../config/constants';
import { BadRequestError, ConflictError } from '../../shared/errors/AppError';
import { AuditService } from '../../shared/services/audit.service';
import { buildPaginationMeta, parsePagination } from '../../shared/utils/pagination';
import { round2 } from '../../shared/utils/tax';
import { AuthenticatedUser, ClientMeta } from '../../types/express';
import { CajaModel } from './caja.model';

export class CajaService {
  static calcularEsperadoEfectivo(sesion: {
    montoInicial: unknown;
    totalVentasEfectivo: unknown;
    totalIngresosExtra: unknown;
    totalEgresos: unknown;
  }): number {
    return round2(
      Number(sesion.montoInicial) +
        Number(sesion.totalVentasEfectivo) +
        Number(sesion.totalIngresosExtra) -
        Number(sesion.totalEgresos),
    );
  }

  static async obtenerCajaActual(sucursalId: number) {
    const sesion = await CajaModel.findOpenSession(sucursalId);
    if (!sesion) {
      return null;
    }

    const montoEsperadoEfectivo = this.calcularEsperadoEfectivo(sesion);

    return {
      ...sesion,
      montoInicial: Number(sesion.montoInicial),
      totalVentasEfectivo: Number(sesion.totalVentasEfectivo),
      totalVentasTarjeta: Number(sesion.totalVentasTarjeta),
      totalIngresosExtra: Number(sesion.totalIngresosExtra),
      totalEgresos: Number(sesion.totalEgresos),
      montoEsperadoEfectivo,
      totalGeneralEsperado: round2(montoEsperadoEfectivo + Number(sesion.totalVentasTarjeta)),
    };
  }

  static async abrirCaja(
    user: AuthenticatedUser,
    input: { montoInicial: number; observaciones?: string },
    clientMeta: ClientMeta,
  ) {
    return prisma.$transaction(async (tx) => {
      const abierta = await tx.cajaSesion.findFirst({
        where: { sucursalId: user.sucursalId, estado: EstadoCaja.ABIERTA },
      });

      if (abierta) {
        throw new ConflictError('Ya existe una caja abierta en esta sucursal');
      }

      const montoInicial = round2(input.montoInicial);

      const sesion = await tx.cajaSesion.create({
        data: {
          sucursalId: user.sucursalId,
          usuarioAperturaId: user.id,
          estado: EstadoCaja.ABIERTA,
          montoInicial,
          observacionesCierre: input.observaciones ?? null,
        },
        include: {
          usuarioApertura: { select: { id: true, nombreCompleto: true, username: true } },
        },
      });

      await AuditService.registrar(
        {
          sucursalId: user.sucursalId,
          usuarioId: user.id,
          accion: ACCIONES_AUDITORIA.APERTURA_CAJA,
          entidad: 'CajaSesion',
          entidadId: sesion.id,
          valorAnterior: null,
          valorNuevo: {
            estado: sesion.estado,
            montoInicial,
            fechaApertura: sesion.fechaApertura,
          },
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return {
        ...sesion,
        montoInicial,
        montoEsperadoEfectivo: montoInicial,
      };
    });
  }

  static async registrarMovimiento(
    user: AuthenticatedUser,
    input: {
      tipo: 'INGRESO_MANUAL' | 'EGRESO_MANUAL';
      monto: number;
      descripcion: string;
      metodoPago?: MetodoPago;
    },
    clientMeta: ClientMeta,
  ) {
    return prisma.$transaction(async (tx) => {
      const sesion = await tx.cajaSesion.findFirst({
        where: { sucursalId: user.sucursalId, estado: EstadoCaja.ABIERTA },
      });

      if (!sesion) {
        throw new BadRequestError('No hay una caja abierta para registrar movimientos');
      }

      const monto = round2(input.monto);
      const tipo =
        input.tipo === 'INGRESO_MANUAL'
          ? TipoMovimientoCaja.INGRESO_MANUAL
          : TipoMovimientoCaja.EGRESO_MANUAL;

      const movimiento = await tx.cajaMovimiento.create({
        data: {
          sucursalId: user.sucursalId,
          cajaSesionId: sesion.id,
          usuarioId: user.id,
          tipo,
          metodoPago: input.metodoPago ?? MetodoPago.EFECTIVO,
          monto,
          descripcion: input.descripcion.trim(),
        },
      });

      const sesionActualizada = await tx.cajaSesion.update({
        where: { id: sesion.id },
        data:
          tipo === TipoMovimientoCaja.INGRESO_MANUAL
            ? { totalIngresosExtra: { increment: monto } }
            : { totalEgresos: { increment: monto } },
      });

      await AuditService.registrar(
        {
          sucursalId: user.sucursalId,
          usuarioId: user.id,
          accion: ACCIONES_AUDITORIA.MOVIMIENTO_CAJA,
          entidad: 'CajaMovimiento',
          entidadId: movimiento.id,
          valorAnterior: {
            totalIngresosExtra: Number(sesion.totalIngresosExtra),
            totalEgresos: Number(sesion.totalEgresos),
          },
          valorNuevo: {
            tipo,
            monto,
            descripcion: movimiento.descripcion,
            totalIngresosExtra: Number(sesionActualizada.totalIngresosExtra),
            totalEgresos: Number(sesionActualizada.totalEgresos),
          },
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return movimiento;
    });
  }

  static async cerrarCaja(
    user: AuthenticatedUser,
    input: { montoContadoEfectivo: number; observacionesCierre?: string },
    clientMeta: ClientMeta,
  ) {
    return prisma.$transaction(async (tx) => {
      const sesion = await tx.cajaSesion.findFirst({
        where: { sucursalId: user.sucursalId, estado: EstadoCaja.ABIERTA },
      });

      if (!sesion) {
        throw new BadRequestError('No existe una caja abierta para cerrar');
      }

      const montoEsperadoEfectivo = this.calcularEsperadoEfectivo(sesion);
      const montoContadoEfectivo = round2(input.montoContadoEfectivo);
      const diferencia = round2(montoContadoEfectivo - montoEsperadoEfectivo);

      const sesionCerrada = await tx.cajaSesion.update({
        where: { id: sesion.id },
        data: {
          estado: EstadoCaja.CERRADA,
          usuarioCierreId: user.id,
          montoEsperadoEfectivo,
          montoContadoEfectivo,
          diferencia,
          observacionesCierre: input.observacionesCierre?.trim() || null,
          fechaCierre: new Date(),
        },
        include: {
          usuarioApertura: { select: { id: true, nombreCompleto: true } },
          usuarioCierre: { select: { id: true, nombreCompleto: true } },
        },
      });

      await AuditService.registrar(
        {
          sucursalId: user.sucursalId,
          usuarioId: user.id,
          accion: ACCIONES_AUDITORIA.CIERRE_CAJA,
          entidad: 'CajaSesion',
          entidadId: sesion.id,
          valorAnterior: {
            estado: EstadoCaja.ABIERTA,
            montoInicial: Number(sesion.montoInicial),
          },
          valorNuevo: {
            estado: EstadoCaja.CERRADA,
            montoEsperadoEfectivo,
            montoContadoEfectivo,
            diferencia,
            totalVentasEfectivo: Number(sesion.totalVentasEfectivo),
            totalVentasTarjeta: Number(sesion.totalVentasTarjeta),
            observacionesCierre: sesionCerrada.observacionesCierre,
          },
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return sesionCerrada;
    });
  }

  static async listarHistorial(sucursalId: number, rawPage?: unknown, rawLimit?: unknown) {
    const { page, limit, skip } = parsePagination(rawPage, rawLimit, 10);
    const { items, total } = await CajaModel.findHistory(sucursalId, skip, limit);
    return {
      items,
      meta: buildPaginationMeta(total, page, limit),
    };
  }
}
