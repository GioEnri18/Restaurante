import { TipoMovimientoInventario, UnidadMedida } from '@prisma/client';
import { prisma } from '../../config/database';
import { ACCIONES_AUDITORIA } from '../../config/constants';
import { BadRequestError, NotFoundError } from '../../shared/errors/AppError';
import { AuditService } from '../../shared/services/audit.service';
import { UnitConversionService } from '../../shared/services/unitConversion.service';
import { buildPaginationMeta, parsePagination } from '../../shared/utils/pagination';
import { round2, round4 } from '../../shared/utils/tax';
import { AuthenticatedUser, ClientMeta } from '../../types/express';
import { InventarioModel } from './inventario.model';

export class InventarioService {
  private static enrichIngrediente<
    T extends {
      stockActualOz: unknown;
      stockMinimoOz: unknown;
      costoPromedioOz: unknown;
    },
  >(ing: T) {
    const stockActualOz = Number(ing.stockActualOz);
    const stockMinimoOz = Number(ing.stockMinimoOz);
    const costoPromedioOz = Number(ing.costoPromedioOz);

    return {
      ...ing,
      stockActualOz,
      stockActualLb: UnitConversionService.ozToLb(stockActualOz),
      stockMinimoOz,
      stockMinimoLb: UnitConversionService.ozToLb(stockMinimoOz),
      costoPromedioOz,
      costoPromedioLb: UnitConversionService.costPerOzToPricePerLb(costoPromedioOz),
      bajoStock: stockActualOz <= stockMinimoOz,
    };
  }

  static async listarIngredientes(sucursalId: number, search?: string) {
    const ingredientes = await InventarioModel.findIngredientes(sucursalId, search);
    return ingredientes.map((i) => this.enrichIngrediente(i));
  }

  static async obtenerAlertas(sucursalId: number) {
    const todos = await this.listarIngredientes(sucursalId);
    return todos.filter((i) => i.bajoStock);
  }

  static async crearIngrediente(
    user: AuthenticatedUser,
    input: {
      codigo: string;
      nombre: string;
      proveedorId?: number | null;
      stockMinimo: number;
      unidadStockMinimo: UnidadMedida;
      stockInicial?: number;
      unidadStockInicial?: UnidadMedida;
      precioPorLb?: number;
    },
    clientMeta: ClientMeta,
  ) {
    return prisma.$transaction(async (tx) => {
      const stockMinimoOz = UnitConversionService.toBaseOz(
        input.stockMinimo,
        input.unidadStockMinimo,
      );
      const stockInicialOz = input.stockInicial
        ? UnitConversionService.toBaseOz(input.stockInicial, input.unidadStockInicial ?? 'lb')
        : 0;
      const costoPromedioOz = input.precioPorLb
        ? UnitConversionService.pricePerLbToCostPerOz(input.precioPorLb)
        : 0;

      const ingrediente = await tx.ingrediente.create({
        data: {
          sucursalId: user.sucursalId,
          proveedorId: input.proveedorId ?? null,
          codigo: input.codigo.trim().toUpperCase(),
          nombre: input.nombre.trim(),
          stockActualOz: stockInicialOz,
          stockMinimoOz,
          costoPromedioOz,
        },
        include: { proveedor: { select: { id: true, nombre: true } } },
      });

      if (stockInicialOz > 0) {
        await tx.inventarioMovimiento.create({
          data: {
            sucursalId: user.sucursalId,
            ingredienteId: ingrediente.id,
            usuarioId: user.id,
            tipo: TipoMovimientoInventario.AJUSTE_MANUAL,
            cantidadOz: stockInicialOz,
            stockAnteriorOz: 0,
            stockNuevoOz: stockInicialOz,
            costoUnitarioOz: costoPromedioOz,
            referenciaTipo: 'CREACION',
            referenciaId: ingrediente.id,
            motivo: 'Existencia inicial al registrar ingrediente',
          },
        });
      }

      await AuditService.registrar(
        {
          sucursalId: user.sucursalId,
          usuarioId: user.id,
          accion: ACCIONES_AUDITORIA.AJUSTE_INVENTARIO,
          entidad: 'Ingrediente',
          entidadId: ingrediente.id,
          valorAnterior: null,
          valorNuevo: {
            codigo: ingrediente.codigo,
            nombre: ingrediente.nombre,
            stockActualOz: stockInicialOz,
            stockMinimoOz,
          },
          motivo: 'Creación de ingrediente',
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return this.enrichIngrediente(ingrediente);
    });
  }

  static async actualizarIngrediente(
    user: AuthenticatedUser,
    ingredienteId: number,
    input: {
      nombre?: string;
      proveedorId?: number | null;
      stockMinimo?: number;
      unidadStockMinimo?: UnidadMedida;
      activo?: boolean;
    },
    clientMeta: ClientMeta,
  ) {
    return prisma.$transaction(async (tx) => {
      const actual = await tx.ingrediente.findFirst({
        where: { id: ingredienteId, sucursalId: user.sucursalId },
      });
      if (!actual) {
        throw new NotFoundError('Ingrediente no encontrado');
      }

      const nuevoStockMinimoOz =
        input.stockMinimo !== undefined
          ? UnitConversionService.toBaseOz(input.stockMinimo, input.unidadStockMinimo ?? 'oz')
          : Number(actual.stockMinimoOz);

      const actualizado = await tx.ingrediente.update({
        where: { id: ingredienteId },
        data: {
          nombre: input.nombre ? input.nombre.trim() : actual.nombre,
          proveedorId: input.proveedorId !== undefined ? input.proveedorId : actual.proveedorId,
          stockMinimoOz: nuevoStockMinimoOz,
          activo: input.activo ?? actual.activo,
        },
        include: { proveedor: { select: { id: true, nombre: true } } },
      });

      await AuditService.registrar(
        {
          sucursalId: user.sucursalId,
          usuarioId: user.id,
          accion: ACCIONES_AUDITORIA.AJUSTE_INVENTARIO,
          entidad: 'Ingrediente',
          entidadId: ingredienteId,
          valorAnterior: {
            nombre: actual.nombre,
            stockMinimoOz: Number(actual.stockMinimoOz),
            proveedorId: actual.proveedorId,
          },
          valorNuevo: {
            nombre: actualizado.nombre,
            stockMinimoOz: Number(actualizado.stockMinimoOz),
            proveedorId: actualizado.proveedorId,
          },
          motivo: 'Actualización de ficha de ingrediente',
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return this.enrichIngrediente(actualizado);
    });
  }

  static async ajustarStock(
    user: AuthenticatedUser,
    ingredienteId: number,
    input: {
      tipoAjuste: 'ENTRADA' | 'SALIDA';
      cantidad: number;
      unidad: UnidadMedida;
      motivo: string;
    },
    clientMeta: ClientMeta,
  ) {
    return prisma.$transaction(async (tx) => {
      const ingrediente = await tx.ingrediente.findFirst({
        where: { id: ingredienteId, sucursalId: user.sucursalId, activo: true },
      });
      if (!ingrediente) {
        throw new NotFoundError('Ingrediente no encontrado');
      }

      const cantidadOz = UnitConversionService.toBaseOz(input.cantidad, input.unidad);
      const deltaOz = input.tipoAjuste === 'ENTRADA' ? cantidadOz : -cantidadOz;
      const stockAnteriorOz = Number(ingrediente.stockActualOz);
      const stockNuevoOz = round4(stockAnteriorOz + deltaOz);

      if (stockNuevoOz < 0) {
        throw new BadRequestError(
          `El ajuste dejaría el stock negativo (disponible: ${stockAnteriorOz} oz)`,
        );
      }

      const actualizado = await tx.ingrediente.update({
        where: { id: ingredienteId },
        data: { stockActualOz: stockNuevoOz },
      });

      const movimiento = await tx.inventarioMovimiento.create({
        data: {
          sucursalId: user.sucursalId,
          ingredienteId,
          usuarioId: user.id,
          tipo: TipoMovimientoInventario.AJUSTE_MANUAL,
          cantidadOz: deltaOz,
          stockAnteriorOz,
          stockNuevoOz,
          costoUnitarioOz: Number(ingrediente.costoPromedioOz),
          referenciaTipo: 'AJUSTE',
          motivo: `${input.motivo.trim()} (${input.cantidad} ${input.unidad} = ${cantidadOz} oz)`,
        },
      });

      await AuditService.registrar(
        {
          sucursalId: user.sucursalId,
          usuarioId: user.id,
          accion: ACCIONES_AUDITORIA.AJUSTE_INVENTARIO,
          entidad: 'Ingrediente',
          entidadId: ingredienteId,
          valorAnterior: {
            nombre: ingrediente.nombre,
            stockActualOz: stockAnteriorOz,
            stockActualLb: UnitConversionService.ozToLb(stockAnteriorOz),
          },
          valorNuevo: {
            nombre: ingrediente.nombre,
            stockActualOz: stockNuevoOz,
            stockActualLb: UnitConversionService.ozToLb(stockNuevoOz),
            tipoAjuste: input.tipoAjuste,
            cantidadOriginal: `${input.cantidad} ${input.unidad}`,
          },
          motivo: input.motivo.trim(),
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return {
        ingrediente: this.enrichIngrediente(actualizado),
        movimiento,
      };
    });
  }

  static async listarProveedores(sucursalId: number) {
    return InventarioModel.findProveedores(sucursalId);
  }

  static async crearProveedor(
    sucursalId: number,
    input: { nombre: string; nit?: string; telefono?: string; email?: string; contacto?: string },
  ) {
    return prisma.proveedor.create({
      data: {
        sucursalId,
        nombre: input.nombre.trim(),
        nit: input.nit?.trim() || null,
        telefono: input.telefono?.trim() || null,
        email: input.email?.trim() || null,
        contacto: input.contacto?.trim() || null,
      },
    });
  }

  static async actualizarProveedor(
    sucursalId: number,
    id: number,
    input: { nombre?: string; nit?: string; telefono?: string; email?: string; contacto?: string },
  ) {
    const existente = await prisma.proveedor.findFirst({ where: { id, sucursalId } });
    if (!existente) {
      throw new NotFoundError('Proveedor no encontrado');
    }

    return prisma.proveedor.update({
      where: { id },
      data: {
        nombre: input.nombre ? input.nombre.trim() : existente.nombre,
        nit: input.nit !== undefined ? input.nit.trim() || null : existente.nit,
        telefono: input.telefono !== undefined ? input.telefono.trim() || null : existente.telefono,
        email: input.email !== undefined ? input.email.trim() || null : existente.email,
        contacto: input.contacto !== undefined ? input.contacto.trim() || null : existente.contacto,
      },
    });
  }

  /**
   * REGLA DE NEGOCIO:
   * Las compras se registran en LIBRAS (lb) con conversión automática centralizada a ONZAS (1 lb = 16 oz),
   * recalculando costo promedio ponderado por onza y registrando entradas en Kardex.
   */
  static async registrarCompra(
    user: AuthenticatedUser,
    input: {
      proveedorId: number;
      numeroDocumento?: string;
      observaciones?: string;
      items: Array<{ ingredienteId: number; cantidadLb: number; precioPorLb: number }>;
    },
    clientMeta: ClientMeta,
  ) {
    return prisma.$transaction(async (tx) => {
      const proveedor = await tx.proveedor.findFirst({
        where: { id: input.proveedorId, sucursalId: user.sucursalId, activo: true },
      });
      if (!proveedor) {
        throw new NotFoundError('Proveedor no encontrado');
      }

      let totalCompra = 0;
      const detallesPreparados: Array<{
        ingredienteId: number;
        cantidadLb: number;
        cantidadOz: number;
        precioPorLb: number;
        costoPorOz: number;
        subtotal: number;
      }> = [];

      for (const item of input.items) {
        const ingrediente = await tx.ingrediente.findFirst({
          where: { id: item.ingredienteId, sucursalId: user.sucursalId, activo: true },
        });
        if (!ingrediente) {
          throw new NotFoundError(`Ingrediente ID ${item.ingredienteId} no encontrado`);
        }

        // Conversión centralizada lb -> oz
        const cantidadOz = UnitConversionService.lbToOz(item.cantidadLb);
        const costoPorOz = UnitConversionService.pricePerLbToCostPerOz(item.precioPorLb);
        const subtotal = round2(item.cantidadLb * item.precioPorLb);
        totalCompra = round2(totalCompra + subtotal);

        detallesPreparados.push({
          ingredienteId: item.ingredienteId,
          cantidadLb: round4(item.cantidadLb),
          cantidadOz,
          precioPorLb: round2(item.precioPorLb),
          costoPorOz,
          subtotal,
        });
      }

      const compra = await tx.compra.create({
        data: {
          sucursalId: user.sucursalId,
          proveedorId: proveedor.id,
          usuarioId: user.id,
          numeroDocumento: input.numeroDocumento?.trim() || null,
          total: totalCompra,
          observaciones: input.observaciones?.trim() || null,
          detalles: {
            create: detallesPreparados,
          },
        },
        include: {
          proveedor: { select: { id: true, nombre: true } },
          detalles: {
            include: { ingrediente: { select: { id: true, codigo: true, nombre: true } } },
          },
        },
      });

      // Actualizar existencias (en oz), costo promedio ponderado por oz y Kardex
      for (const det of detallesPreparados) {
        const ing = await tx.ingrediente.findUniqueOrThrow({ where: { id: det.ingredienteId } });
        const stockAnteriorOz = Number(ing.stockActualOz);
        const costoAnteriorOz = Number(ing.costoPromedioOz);
        const stockNuevoOz = round4(stockAnteriorOz + det.cantidadOz);

        // Costo promedio ponderado por onza
        const valorAnterior = stockAnteriorOz * costoAnteriorOz;
        const valorEntrada = det.cantidadOz * det.costoPorOz;
        const nuevoCostoPromedioOz =
          stockNuevoOz > 0 ? round4((valorAnterior + valorEntrada) / stockNuevoOz) : det.costoPorOz;

        await tx.ingrediente.update({
          where: { id: ing.id },
          data: {
            stockActualOz: stockNuevoOz,
            costoPromedioOz: nuevoCostoPromedioOz,
          },
        });

        await tx.inventarioMovimiento.create({
          data: {
            sucursalId: user.sucursalId,
            ingredienteId: ing.id,
            usuarioId: user.id,
            tipo: TipoMovimientoInventario.ENTRADA_COMPRA,
            cantidadOz: det.cantidadOz,
            stockAnteriorOz,
            stockNuevoOz,
            costoUnitarioOz: det.costoPorOz,
            referenciaTipo: 'COMPRA',
            referenciaId: compra.id,
            motivo: `Compra #${compra.id} (${det.cantidadLb} lb = ${det.cantidadOz} oz @ Q ${det.precioPorLb.toFixed(2)}/lb)`,
          },
        });
      }

      await AuditService.registrar(
        {
          sucursalId: user.sucursalId,
          usuarioId: user.id,
          accion: ACCIONES_AUDITORIA.COMPRA_INVENTARIO,
          entidad: 'Compra',
          entidadId: compra.id,
          valorNuevo: {
            proveedor: proveedor.nombre,
            numeroDocumento: compra.numeroDocumento,
            total: totalCompra,
            items: detallesPreparados.map((d) => ({
              ingredienteId: d.ingredienteId,
              cantidadLb: d.cantidadLb,
              cantidadOz: d.cantidadOz,
              precioPorLb: d.precioPorLb,
            })),
          },
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return compra;
    });
  }

  static async listarCompras(sucursalId: number, rawPage?: unknown, rawLimit?: unknown) {
    const { page, limit, skip } = parsePagination(rawPage, rawLimit, 10);
    const { items, total } = await InventarioModel.findCompras(sucursalId, skip, limit);
    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

  static async listarMovimientos(
    sucursalId: number,
    query: {
      page?: unknown;
      limit?: unknown;
      ingredienteId?: string;
      tipo?: TipoMovimientoInventario;
      fechaDesde?: string;
      fechaHasta?: string;
    },
  ) {
    const { page, limit, skip } = parsePagination(query.page, query.limit, 15);
    const { items, total } = await InventarioModel.findMovimientos(
      {
        sucursalId,
        ingredienteId: query.ingredienteId ? Number(query.ingredienteId) : undefined,
        tipo: query.tipo,
        fechaDesde: query.fechaDesde ? new Date(`${query.fechaDesde}T00:00:00.000`) : undefined,
        fechaHasta: query.fechaHasta ? new Date(`${query.fechaHasta}T23:59:59.999`) : undefined,
      },
      skip,
      limit,
    );

    return {
      items: items.map((m) => ({
        ...m,
        cantidadOz: Number(m.cantidadOz),
        cantidadLb: UnitConversionService.ozToLb(Number(m.cantidadOz)),
        stockAnteriorOz: Number(m.stockAnteriorOz),
        stockNuevoOz: Number(m.stockNuevoOz),
        costoUnitarioOz: Number(m.costoUnitarioOz),
      })),
      meta: buildPaginationMeta(total, page, limit),
    };
  }
}
