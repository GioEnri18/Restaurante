import {
  EstadoCaja,
  EstadoFactura,
  EstadoVenta,
  MetodoPago,
  TipoMovimientoCaja,
  TipoMovimientoInventario,
} from '@prisma/client';
import { prisma } from '../../config/database';
import { ACCIONES_AUDITORIA, FACTURAS_PAGE_SIZE } from '../../config/constants';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError';
import { AuditService } from '../../shared/services/audit.service';
import { buildPaginationMeta, parsePagination } from '../../shared/utils/pagination';
import { round2, round4 } from '../../shared/utils/tax';
import { AuthenticatedUser, ClientMeta } from '../../types/express';
import { FacturasFiltro, FacturasModel } from './facturas.model';

export class FacturasService {
  static async listar(
    sucursalId: number,
    query: {
      page?: unknown;
      limit?: unknown;
      numero?: string;
      cliente?: string;
      fechaDesde?: string;
      fechaHasta?: string;
      montoMin?: string;
      montoMax?: string;
      estado?: EstadoFactura;
    },
  ) {
    // Paginación obligatoria de 10 registros por página por defecto
    const { page, limit, skip } = parsePagination(query.page, query.limit, FACTURAS_PAGE_SIZE, 50);

    const filtro: FacturasFiltro = {
      sucursalId,
      numero: query.numero?.trim() || undefined,
      cliente: query.cliente?.trim() || undefined,
      estado: query.estado,
      fechaDesde: query.fechaDesde ? new Date(`${query.fechaDesde}T00:00:00.000`) : undefined,
      fechaHasta: query.fechaHasta ? new Date(`${query.fechaHasta}T23:59:59.999`) : undefined,
      montoMin: query.montoMin ? Number(query.montoMin) : undefined,
      montoMax: query.montoMax ? Number(query.montoMax) : undefined,
    };

    const { items, total } = await FacturasModel.findPaginated(filtro, skip, limit);
    return {
      items,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  static async obtenerDetalle(id: number, sucursalId: number) {
    const factura = await FacturasModel.findDetailById(id, sucursalId);
    if (!factura) {
      throw new NotFoundError('Factura no encontrada');
    }
    return factura;
  }

  static async reimprimir(
    user: AuthenticatedUser,
    facturaId: number,
    clientMeta: ClientMeta,
  ) {
    return prisma.$transaction(async (tx) => {
      const actual = await tx.factura.findFirst({
        where: { id: facturaId, sucursalId: user.sucursalId },
      });

      if (!actual) {
        throw new NotFoundError('Factura no encontrada');
      }

      const actualizada = await tx.factura.update({
        where: { id: facturaId },
        data: { reimpresionesCount: { increment: 1 } },
        include: {
          sucursal: {
            select: { nombre: true, nit: true, direccion: true, telefono: true },
          },
          venta: {
            include: {
              usuario: { select: { nombreCompleto: true } },
              mesa: { select: { numero: true } },
              comanda: true,
              detalles: true,
            },
          },
        },
      });

      await AuditService.registrar(
        {
          sucursalId: user.sucursalId,
          usuarioId: user.id,
          accion: ACCIONES_AUDITORIA.REIMPRESION_FACTURA,
          entidad: 'Factura',
          entidadId: actual.id,
          valorAnterior: {
            numeroCompleto: actual.numeroCompleto,
            reimpresionesCount: actual.reimpresionesCount,
          },
          valorNuevo: {
            numeroCompleto: actualizada.numeroCompleto,
            reimpresionesCount: actualizada.reimpresionesCount,
          },
          motivo: `Reimpresión #${actualizada.reimpresionesCount} de factura ${actual.numeroCompleto}`,
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return actualizada;
    });
  }

  /**
   * REGLA DE NEGOCIO:
   * Las facturas nunca se editan ni se borran; solo se anulan con motivo obligatorio.
   * Revierte caja automáticamente y opcionalmente reintegra inventario si el usuario lo indica.
   */
  static async anular(
    user: AuthenticatedUser,
    facturaId: number,
    input: { motivo: string; reintegrarInventario: boolean },
    clientMeta: ClientMeta,
  ) {
    return prisma.$transaction(async (tx) => {
      const factura = await tx.factura.findFirst({
        where: { id: facturaId, sucursalId: user.sucursalId },
        include: {
          venta: true,
        },
      });

      if (!factura) {
        throw new NotFoundError('Factura no encontrada');
      }

      if (factura.estado === EstadoFactura.ANULADA) {
        throw new ConflictError(`La factura ${factura.numeroCompleto} ya se encuentra anulada`);
      }

      const motivo = input.motivo.trim();
      const fechaAnulacion = new Date();

      // 1. Marcar factura y venta como anuladas
      const facturaAnulada = await tx.factura.update({
        where: { id: factura.id },
        data: {
          estado: EstadoFactura.ANULADA,
          motivoAnulacion: motivo,
          anuladaPorId: user.id,
          anuladaEn: fechaAnulacion,
        },
      });

      await tx.venta.update({
        where: { id: factura.ventaId },
        data: { estado: EstadoVenta.ANULADA },
      });

      // 2. Revertir caja automáticamente (prioriza caja abierta actual; si no hay, registra en la sesión original)
      const cajaAbierta = await tx.cajaSesion.findFirst({
        where: { sucursalId: user.sucursalId, estado: EstadoCaja.ABIERTA },
      });
      const cajaObjetivoId = cajaAbierta ? cajaAbierta.id : factura.venta.cajaSesionId;
      const totalAnulado = round2(Number(factura.total));

      await tx.cajaMovimiento.create({
        data: {
          sucursalId: user.sucursalId,
          cajaSesionId: cajaObjetivoId,
          usuarioId: user.id,
          ventaId: factura.ventaId,
          tipo: TipoMovimientoCaja.EGRESO_ANULACION,
          metodoPago: factura.venta.metodoPago,
          monto: totalAnulado,
          descripcion: `Anulación factura ${factura.numeroCompleto}: ${motivo}`,
        },
      });

      if (factura.venta.metodoPago === MetodoPago.EFECTIVO) {
        await tx.cajaSesion.update({
          where: { id: cajaObjetivoId },
          data: { totalEgresos: { increment: totalAnulado } },
        });
      } else {
        await tx.cajaSesion.update({
          where: { id: cajaObjetivoId },
          data: { totalVentasTarjeta: { decrement: totalAnulado } },
        });
      }

      // 3. Opcional: reintegrar ingredientes al inventario si el usuario lo solicitó
      let ingredientesReintegrados = 0;
      if (input.reintegrarInventario) {
        const salidasVenta = await tx.inventarioMovimiento.findMany({
          where: {
            sucursalId: user.sucursalId,
            referenciaTipo: 'VENTA',
            referenciaId: factura.ventaId,
            tipo: TipoMovimientoInventario.SALIDA_VENTA,
          },
        });

        for (const mov of salidasVenta) {
          const cantidadReintegrarOz = round4(Math.abs(Number(mov.cantidadOz)));
          const ingrediente = await tx.ingrediente.findUnique({
            where: { id: mov.ingredienteId },
          });
          if (!ingrediente) continue;

          const stockAnteriorOz = Number(ingrediente.stockActualOz);
          const stockNuevoOz = round4(stockAnteriorOz + cantidadReintegrarOz);

          await tx.ingrediente.update({
            where: { id: ingrediente.id },
            data: { stockActualOz: stockNuevoOz },
          });

          await tx.inventarioMovimiento.create({
            data: {
              sucursalId: user.sucursalId,
              ingredienteId: ingrediente.id,
              usuarioId: user.id,
              tipo: TipoMovimientoInventario.REVERSION_ANULACION,
              cantidadOz: cantidadReintegrarOz,
              stockAnteriorOz,
              stockNuevoOz,
              costoUnitarioOz: Number(mov.costoUnitarioOz),
              referenciaTipo: 'FACTURA_ANULADA',
              referenciaId: factura.id,
              motivo: `Reintegro por anulación de factura ${factura.numeroCompleto}`,
            },
          });
          ingredientesReintegrados++;
        }
      }

      // 4. Auditoría inmutable con valor anterior y nuevo
      await AuditService.registrar(
        {
          sucursalId: user.sucursalId,
          usuarioId: user.id,
          accion: ACCIONES_AUDITORIA.ANULACION_FACTURA,
          entidad: 'Factura',
          entidadId: factura.id,
          valorAnterior: {
            numeroCompleto: factura.numeroCompleto,
            estado: EstadoFactura.EMITIDA,
            total: totalAnulado,
          },
          valorNuevo: {
            numeroCompleto: factura.numeroCompleto,
            estado: EstadoFactura.ANULADA,
            motivoAnulacion: motivo,
            cajaRevertidaId: cajaObjetivoId,
            reintegrarInventario: input.reintegrarInventario,
            ingredientesReintegrados,
          },
          motivo,
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return {
        factura: facturaAnulada,
        cajaRevertidaId: cajaObjetivoId,
        ingredientesReintegrados,
      };
    });
  }
}
