import {
  EstadoCaja,
  EstadoComanda,
  EstadoFactura,
  EstadoVenta,
  MetodoPago,
  Prisma,
  TipoMovimientoCaja,
  TipoMovimientoInventario,
  TipoServicio,
} from '@prisma/client';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { ACCIONES_AUDITORIA } from '../../config/constants';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../shared/errors/AppError';
import { AuditService } from '../../shared/services/audit.service';
import { FelAdapter } from '../../shared/services/fel.adapter';
import { calcularDesgloseIvaIncluido, round2, round4 } from '../../shared/utils/tax';
import { AuthenticatedUser, ClientMeta } from '../../types/express';
import { VentasModel } from './ventas.model';

export interface ItemVentaInput {
  platilloId: number;
  cantidad: number;
  notas?: string;
}

export interface ConfirmarVentaInput {
  tipoServicio: TipoServicio;
  mesaId?: number | null;
  nombreTurno?: string;
  metodoPago: MetodoPago;
  montoRecibido?: number;
  referenciaPago?: string;
  clienteNit?: string;
  clienteNombre?: string;
  clienteDireccion?: string;
  observaciones?: string;
  datosDeliveryJson?: Record<string, unknown>;
  items: ItemVentaInput[];
}

export interface PlatilloInput {
  categoriaId: number;
  sku: string;
  nombre: string;
  descripcion?: string;
  precioVenta: number;
  disponible?: boolean;
  receta?: Array<{ ingredienteId: number; cantidadOz: number }>;
}

export interface MenuEspecialInput {
  nombre: string;
  descripcion?: string;
  fechaInicio: string;
  fechaFin: string;
  diasAvisoPrevio?: number;
  activo?: boolean;
  esMenuPrincipal?: boolean;
  platillos?: Array<{ platilloId: number; precioEspecial?: number | null }>;
}

type EstadoMenuEspecial = 'ACTIVO_HOY' | 'PROXIMO_AVISO' | 'PROGRAMADO' | 'FINALIZADO' | 'INACTIVO';

function evaluarEstadoMenuEspecial(menu: {
  nombre: string;
  activo: boolean;
  fechaInicio: Date;
  fechaFin: Date;
  diasAvisoPrevio: number;
  platillos: Array<unknown>;
}): { estado: EstadoMenuEspecial; diasRestantes: number; requiereAtencion: boolean; mensajeAviso: string | null } {
  const ahora = new Date();
  const hoyInicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const inicioDia = new Date(
    menu.fechaInicio.getFullYear(),
    menu.fechaInicio.getMonth(),
    menu.fechaInicio.getDate(),
  );
  const finDia = new Date(
    menu.fechaFin.getFullYear(),
    menu.fechaFin.getMonth(),
    menu.fechaFin.getDate(),
    23,
    59,
    59,
    999,
  );

  const msDia = 1000 * 60 * 60 * 24;
  const diasRestantes = Math.ceil((inicioDia.getTime() - hoyInicio.getTime()) / msDia);

  if (!menu.activo) {
    return { estado: 'INACTIVO', diasRestantes, requiereAtencion: false, mensajeAviso: null };
  }

  if (ahora >= inicioDia && ahora <= finDia) {
    const sinPlatillos = menu.platillos.length === 0;
    return {
      estado: 'ACTIVO_HOY',
      diasRestantes: 0,
      requiereAtencion: sinPlatillos,
      mensajeAviso: sinPlatillos
        ? `¡El menú especial "${menu.nombre}" está activo hoy pero aún no tiene platillos asignados!`
        : 'Menú especial activo y vigente hoy en el punto de venta.',
    };
  }

  if (ahora > finDia) {
    return { estado: 'FINALIZADO', diasRestantes, requiereAtencion: false, mensajeAviso: null };
  }

  if (diasRestantes <= menu.diasAvisoPrevio) {
    const faltanPlatillos = menu.platillos.length === 0;
    return {
      estado: 'PROXIMO_AVISO',
      diasRestantes,
      requiereAtencion: true,
      mensajeAviso: faltanPlatillos
        ? `Inicia en ${diasRestantes} día(s) y aún falta agregar platillos al menú.`
        : `Inicia en ${diasRestantes} día(s) con ${menu.platillos.length} platillo(s) listo(s) para el cambio.`,
    };
  }

  return { estado: 'PROGRAMADO', diasRestantes, requiereAtencion: false, mensajeAviso: null };
}

export class VentasService {
  static async obtenerMenu(sucursalId: number, search?: string, categoriaId?: number) {
    const { categorias, platillos, mesas, cajaAbierta, menusEspeciales } =
      await VentasModel.getMenuData(sucursalId, search, categoriaId);

    // Evaluar menús especiales activos hoy y avisos próximos
    const menusEvaluados = menusEspeciales.map((m) => ({
      ...m,
      eval: evaluarEstadoMenuEspecial(m),
    }));

    const menuEspecialActivo =
      menusEvaluados.find((m) => m.eval.estado === 'ACTIVO_HOY') ?? null;

    const alertasMenusEspeciales = menusEvaluados
      .filter((m) => m.eval.estado === 'PROXIMO_AVISO' || m.eval.estado === 'ACTIVO_HOY')
      .map((m) => ({
        id: m.id,
        nombre: m.nombre,
        fechaInicio: m.fechaInicio,
        fechaFin: m.fechaFin,
        estado: m.eval.estado,
        diasRestantes: m.eval.diasRestantes,
        platillosCount: m.platillos.length,
        requiereAtencion: m.eval.requiereAtencion,
        mensaje: m.eval.mensajeAviso,
      }));

    // Mapa de precios especiales vigentes hoy (si hay menú especial activo)
    const mapaEspecialHoy = new Map<number, { precioEspecial: number | null }>();
    if (menuEspecialActivo) {
      for (const mp of menuEspecialActivo.platillos) {
        mapaEspecialHoy.set(mp.platilloId, {
          precioEspecial: mp.precioEspecial !== null ? Number(mp.precioEspecial) : null,
        });
      }
    }

    const platillosFormateados = platillos.map((p) => {
      const costoReceta = round2(
        p.receta.reduce(
          (acc, item) => acc + Number(item.cantidadOz) * Number(item.ingrediente.costoPromedioOz),
          0,
        ),
      );

      const stockDisponible = p.receta.every(
        (item) => Number(item.ingrediente.stockActualOz) >= Number(item.cantidadOz),
      );

      const especial = mapaEspecialHoy.get(p.id);
      const precioBase = Number(p.precioVenta);
      const precioVigente = especial?.precioEspecial ?? precioBase;

      return {
        id: p.id,
        categoriaId: p.categoriaId,
        categoriaNombre: p.categoria.nombre,
        sku: p.sku,
        nombre: p.nombre,
        descripcion: p.descripcion,
        precioVenta: precioVigente,
        precioRegular: precioBase,
        esEspecialHoy: Boolean(especial),
        costoReceta,
        disponible: p.disponible,
        stockDisponible,
        receta: p.receta.map((r) => ({
          ingredienteId: r.ingredienteId,
          ingredienteNombre: r.ingrediente.nombre,
          cantidadOz: Number(r.cantidadOz),
          stockActualOz: Number(r.ingrediente.stockActualOz),
        })),
      };
    });

    return {
      cajaAbierta: Boolean(cajaAbierta),
      cajaSesionId: cajaAbierta?.id ?? null,
      habilitarMesas: env.ENABLE_TABLE_SERVICE,
      tipoServicioDefault: env.DEFAULT_SERVICE_TYPE,
      categorias,
      platillos: platillosFormateados,
      mesas,
      menuEspecialActivo: menuEspecialActivo
        ? {
            id: menuEspecialActivo.id,
            nombre: menuEspecialActivo.nombre,
            descripcion: menuEspecialActivo.descripcion,
            fechaInicio: menuEspecialActivo.fechaInicio,
            fechaFin: menuEspecialActivo.fechaFin,
            esMenuPrincipal: menuEspecialActivo.esMenuPrincipal,
            platillosIds: menuEspecialActivo.platillos.map((mp) => mp.platilloId),
          }
        : null,
      alertasMenusEspeciales,
    };
  }

  // ==================== MENÚS ESPECIALES POR FECHA (SOLO ADMIN) ====================

  static async listarMenusEspeciales(sucursalId: number) {
    const menus = await VentasModel.findMenusEspeciales(sucursalId);
    return menus.map((m) => {
      const ev = evaluarEstadoMenuEspecial(m);
      return {
        id: m.id,
        nombre: m.nombre,
        descripcion: m.descripcion,
        fechaInicio: m.fechaInicio,
        fechaFin: m.fechaFin,
        diasAvisoPrevio: m.diasAvisoPrevio,
        activo: m.activo,
        esMenuPrincipal: m.esMenuPrincipal,
        creadoPor: m.creadoPor?.nombreCompleto ?? 'Sistema',
        estado: ev.estado,
        diasRestantes: ev.diasRestantes,
        requiereAtencion: ev.requiereAtencion,
        mensajeAviso: ev.mensajeAviso,
        platillos: m.platillos.map((mp) => ({
          platilloId: mp.platilloId,
          sku: mp.platillo.sku,
          nombre: mp.platillo.nombre,
          categoriaNombre: mp.platillo.categoria.nombre,
          precioRegular: Number(mp.platillo.precioVenta),
          precioEspecial: mp.precioEspecial !== null ? Number(mp.precioEspecial) : null,
        })),
      };
    });
  }

  static async obtenerAlertasMenusEspeciales(sucursalId: number) {
    const todos = await this.listarMenusEspeciales(sucursalId);
    return todos.filter((m) => m.estado === 'ACTIVO_HOY' || m.estado === 'PROXIMO_AVISO');
  }

  static async crearMenuEspecial(
    user: AuthenticatedUser,
    input: MenuEspecialInput,
    clientMeta: ClientMeta,
  ) {
    const fechaInicio = new Date(`${input.fechaInicio.slice(0, 10)}T00:00:00.000`);
    const fechaFin = new Date(`${input.fechaFin.slice(0, 10)}T23:59:59.999`);

    if (fechaFin < fechaInicio) {
      throw new BadRequestError('La fecha fin no puede ser anterior a la fecha inicio');
    }

    return prisma.$transaction(async (tx) => {
      const creado = await tx.menuEspecial.create({
        data: {
          sucursalId: user.sucursalId,
          creadoPorId: user.id,
          nombre: input.nombre.trim(),
          descripcion: input.descripcion?.trim() || null,
          fechaInicio,
          fechaFin,
          diasAvisoPrevio: input.diasAvisoPrevio ?? env.SPECIAL_MENU_DEFAULT_NOTICE_DAYS,
          activo: input.activo ?? true,
          esMenuPrincipal: input.esMenuPrincipal ?? false,
          platillos: input.platillos?.length
            ? {
                create: input.platillos.map((p) => ({
                  platilloId: p.platilloId,
                  precioEspecial:
                    p.precioEspecial !== undefined && p.precioEspecial !== null
                      ? round2(p.precioEspecial)
                      : null,
                })),
              }
            : undefined,
        },
        include: { platillos: true },
      });

      await AuditService.registrar(
        {
          sucursalId: user.sucursalId,
          usuarioId: user.id,
          accion: ACCIONES_AUDITORIA.GESTION_MENU_ESPECIAL,
          entidad: 'MenuEspecial',
          entidadId: creado.id,
          valorAnterior: null,
          valorNuevo: {
            nombre: creado.nombre,
            fechaInicio: input.fechaInicio,
            fechaFin: input.fechaFin,
            diasAvisoPrevio: creado.diasAvisoPrevio,
            platillosCount: creado.platillos.length,
          },
          motivo: 'Creación de menú por fecha especial',
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return creado;
    });
  }

  static async actualizarMenuEspecial(
    user: AuthenticatedUser,
    menuId: number,
    input: Partial<MenuEspecialInput>,
    clientMeta: ClientMeta,
  ) {
    return prisma.$transaction(async (tx) => {
      const actual = await tx.menuEspecial.findFirst({
        where: { id: menuId, sucursalId: user.sucursalId },
        include: { platillos: true },
      });
      if (!actual) {
        throw new NotFoundError('Menú especial no encontrado');
      }

      const fechaInicio = input.fechaInicio
        ? new Date(`${input.fechaInicio.slice(0, 10)}T00:00:00.000`)
        : actual.fechaInicio;
      const fechaFin = input.fechaFin
        ? new Date(`${input.fechaFin.slice(0, 10)}T23:59:59.999`)
        : actual.fechaFin;

      if (fechaFin < fechaInicio) {
        throw new BadRequestError('La fecha fin no puede ser anterior a la fecha inicio');
      }

      if (input.platillos !== undefined) {
        await tx.menuEspecialPlatillo.deleteMany({ where: { menuEspecialId: menuId } });
      }

      const actualizado = await tx.menuEspecial.update({
        where: { id: menuId },
        data: {
          nombre: input.nombre ? input.nombre.trim() : actual.nombre,
          descripcion:
            input.descripcion !== undefined ? input.descripcion.trim() || null : actual.descripcion,
          fechaInicio,
          fechaFin,
          diasAvisoPrevio: input.diasAvisoPrevio ?? actual.diasAvisoPrevio,
          activo: input.activo ?? actual.activo,
          esMenuPrincipal: input.esMenuPrincipal ?? actual.esMenuPrincipal,
          platillos:
            input.platillos !== undefined
              ? {
                  create: input.platillos.map((p) => ({
                    platilloId: p.platilloId,
                    precioEspecial:
                      p.precioEspecial !== undefined && p.precioEspecial !== null
                        ? round2(p.precioEspecial)
                        : null,
                  })),
                }
              : undefined,
        },
        include: { platillos: true },
      });

      await AuditService.registrar(
        {
          sucursalId: user.sucursalId,
          usuarioId: user.id,
          accion: ACCIONES_AUDITORIA.GESTION_MENU_ESPECIAL,
          entidad: 'MenuEspecial',
          entidadId: menuId,
          valorAnterior: {
            nombre: actual.nombre,
            activo: actual.activo,
            platillosCount: actual.platillos.length,
          },
          valorNuevo: {
            nombre: actualizado.nombre,
            activo: actualizado.activo,
            platillosCount: actualizado.platillos.length,
          },
          motivo: 'Actualización de menú especial por fecha',
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return actualizado;
    });
  }

  static async eliminarMenuEspecial(
    user: AuthenticatedUser,
    menuId: number,
    clientMeta: ClientMeta,
  ) {
    return prisma.$transaction(async (tx) => {
      const actual = await tx.menuEspecial.findFirst({
        where: { id: menuId, sucursalId: user.sucursalId },
      });
      if (!actual) {
        throw new NotFoundError('Menú especial no encontrado');
      }

      await tx.menuEspecial.delete({ where: { id: menuId } });

      await AuditService.registrar(
        {
          sucursalId: user.sucursalId,
          usuarioId: user.id,
          accion: ACCIONES_AUDITORIA.GESTION_MENU_ESPECIAL,
          entidad: 'MenuEspecial',
          entidadId: menuId,
          valorAnterior: { nombre: actual.nombre, fechaInicio: actual.fechaInicio },
          valorNuevo: null,
          motivo: 'Eliminación de menú especial',
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return { id: menuId, eliminado: true };
    });
  }

  static async crearPlatillo(user: AuthenticatedUser, input: PlatilloInput, clientMeta: ClientMeta) {
    return prisma.$transaction(async (tx) => {
      const platillo = await tx.platillo.create({
        data: {
          categoriaId: input.categoriaId,
          sku: input.sku.trim().toUpperCase(),
          nombre: input.nombre.trim(),
          descripcion: input.descripcion?.trim() || null,
          precioVenta: round2(input.precioVenta),
          disponible: input.disponible ?? true,
          receta: input.receta?.length
            ? {
                create: input.receta.map((r) => ({
                  ingredienteId: r.ingredienteId,
                  cantidadOz: round4(r.cantidadOz),
                })),
              }
            : undefined,
        },
        include: {
          categoria: true,
          receta: { include: { ingrediente: true } },
        },
      });

      await AuditService.registrar(
        {
          sucursalId: user.sucursalId,
          usuarioId: user.id,
          accion: ACCIONES_AUDITORIA.CAMBIO_PRECIO,
          entidad: 'Platillo',
          entidadId: platillo.id,
          valorAnterior: null,
          valorNuevo: {
            sku: platillo.sku,
            nombre: platillo.nombre,
            precioVenta: Number(platillo.precioVenta),
            recetaCount: platillo.receta.length,
          },
          motivo: 'Creación de platillo en menú',
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return platillo;
    });
  }

  static async actualizarPlatillo(
    user: AuthenticatedUser,
    platilloId: number,
    input: Partial<PlatilloInput> & { motivo?: string },
    clientMeta: ClientMeta,
  ) {
    return prisma.$transaction(async (tx) => {
      const actual = await tx.platillo.findUnique({
        where: { id: platilloId },
        include: { receta: true },
      });

      if (!actual) {
        throw new NotFoundError('Platillo no encontrado');
      }

      const precioAnterior = Number(actual.precioVenta);
      const precioNuevo =
        input.precioVenta !== undefined ? round2(input.precioVenta) : precioAnterior;

      if (input.receta) {
        await tx.recetaIngrediente.deleteMany({ where: { platilloId } });
      }

      const actualizado = await tx.platillo.update({
        where: { id: platilloId },
        data: {
          categoriaId: input.categoriaId ?? actual.categoriaId,
          nombre: input.nombre ? input.nombre.trim() : actual.nombre,
          descripcion:
            input.descripcion !== undefined ? input.descripcion.trim() || null : actual.descripcion,
          precioVenta: precioNuevo,
          disponible: input.disponible ?? actual.disponible,
          receta: input.receta
            ? {
                create: input.receta.map((r) => ({
                  ingredienteId: r.ingredienteId,
                  cantidadOz: round4(r.cantidadOz),
                })),
              }
            : undefined,
        },
        include: {
          categoria: true,
          receta: { include: { ingrediente: true } },
        },
      });

      if (precioNuevo !== precioAnterior) {
        await AuditService.registrar(
          {
            sucursalId: user.sucursalId,
            usuarioId: user.id,
            accion: ACCIONES_AUDITORIA.CAMBIO_PRECIO,
            entidad: 'Platillo',
            entidadId: platilloId,
            valorAnterior: { nombre: actual.nombre, precioVenta: precioAnterior },
            valorNuevo: { nombre: actualizado.nombre, precioVenta: precioNuevo },
            motivo: input.motivo || 'Actualización de precio en menú',
            ipAddress: clientMeta.ipAddress,
            userAgent: clientMeta.userAgent,
          },
          tx,
        );
      }

      return actualizado;
    });
  }

  /**
   * REGLA DE NEGOCIO CLAVE:
   * Una venta confirmada genera: VENTA, FACTURA, COMANDA, MOVIMIENTO DE CAJA
   * y DESCUENTO DE INVENTARIO (según receta en onzas), TODO EN UNA SOLA TRANSACCIÓN ATÓMICA.
   * Aplica automáticamente precios de Menú Especial si existe uno vigente hoy.
   */
  static async confirmarVenta(
    user: AuthenticatedUser,
    input: ConfirmarVentaInput,
    clientMeta: ClientMeta,
  ) {
    if (!input.items || input.items.length === 0) {
      throw new BadRequestError('El carrito debe contener al menos un platillo');
    }

    return prisma.$transaction(async (tx) => {
      // 1. Validar que exista caja abierta en la sucursal
      const cajaAbierta = await tx.cajaSesion.findFirst({
        where: { sucursalId: user.sucursalId, estado: EstadoCaja.ABIERTA },
      });

      if (!cajaAbierta) {
        throw new BadRequestError(
          'No se permite vender sin caja abierta. Solicita abrir una sesión de caja primero.',
        );
      }

      // 2. Validar mesa únicamente si el servicio elegido es MESA
      let mesaNumero: string | null = null;
      if (input.tipoServicio === TipoServicio.MESA && input.mesaId) {
        const mesa = await tx.mesa.findFirst({
          where: { id: input.mesaId, sucursalId: user.sucursalId, activa: true },
        });
        if (!mesa) {
          throw new NotFoundError('La mesa seleccionada no existe en esta sucursal');
        }
        mesaNumero = mesa.numero;
      }

      // 3. Verificar si existe menú especial activo hoy para aplicar precios especiales
      const ahora = new Date();
      const menuEspecialHoy = await tx.menuEspecial.findFirst({
        where: {
          sucursalId: user.sucursalId,
          activo: true,
          fechaInicio: { lte: ahora },
          fechaFin: { gte: ahora },
        },
        include: { platillos: true },
      });
      const preciosEspeciales = new Map<number, number>();
      if (menuEspecialHoy) {
        for (const mp of menuEspecialHoy.platillos) {
          if (mp.precioEspecial !== null) {
            preciosEspeciales.set(mp.platilloId, Number(mp.precioEspecial));
          }
        }
      }

      // 4. Cargar platillos y recetas
      const platilloIds = Array.from(new Set(input.items.map((i) => i.platilloId)));
      const platillos = await tx.platillo.findMany({
        where: { id: { in: platilloIds }, activo: true },
        include: {
          receta: {
            include: { ingrediente: true },
          },
        },
      });

      const platillosMap = new Map(platillos.map((p) => [p.id, p]));

      const consumoIngredientes = new Map<
        number,
        { nombre: string; cantidadRequeridaOz: number; stockActualOz: number; costoUnitarioOz: number }
      >();

      let totalConIva = 0;
      let costoTotalReceta = 0;

      const detallesData: Array<{
        platilloId: number;
        nombrePlatillo: string;
        cantidad: number;
        precioUnitario: number;
        costoUnitarioReceta: number;
        subtotal: number;
        notas: string | null;
      }> = [];

      for (const item of input.items) {
        const platillo = platillosMap.get(item.platilloId);
        if (!platillo) {
          throw new NotFoundError(`El platillo ID ${item.platilloId} no existe o está inactivo`);
        }
        if (!platillo.disponible) {
          throw new BadRequestError(`El platillo "${platillo.nombre}" no está disponible`);
        }

        const precioUnitario = preciosEspeciales.get(platillo.id) ?? Number(platillo.precioVenta);
        const subtotalItem = round2(precioUnitario * item.cantidad);
        totalConIva = round2(totalConIva + subtotalItem);

        let costoUnitarioReceta = 0;
        for (const r of platillo.receta) {
          const ozPorUnidad = Number(r.cantidadOz);
          const costoOz = Number(r.ingrediente.costoPromedioOz);
          costoUnitarioReceta = round4(costoUnitarioReceta + ozPorUnidad * costoOz);

          const consumoTotalItemOz = round4(ozPorUnidad * item.cantidad);
          const prev = consumoIngredientes.get(r.ingredienteId);
          if (prev) {
            prev.cantidadRequeridaOz = round4(prev.cantidadRequeridaOz + consumoTotalItemOz);
          } else {
            consumoIngredientes.set(r.ingredienteId, {
              nombre: r.ingrediente.nombre,
              cantidadRequeridaOz: consumoTotalItemOz,
              stockActualOz: Number(r.ingrediente.stockActualOz),
              costoUnitarioOz: costoOz,
            });
          }
        }

        costoTotalReceta = round2(costoTotalReceta + costoUnitarioReceta * item.cantidad);

        detallesData.push({
          platilloId: platillo.id,
          nombrePlatillo: platillo.nombre,
          cantidad: item.cantidad,
          precioUnitario,
          costoUnitarioReceta,
          subtotal: subtotalItem,
          notas: item.notas?.trim() || null,
        });
      }

      // 5. Validar existencias suficientes
      const faltantes: Array<{ ingrediente: string; requeridoOz: number; disponibleOz: number }> = [];
      for (const [, consumo] of consumoIngredientes.entries()) {
        if (consumo.stockActualOz < consumo.cantidadRequeridaOz) {
          faltantes.push({
            ingrediente: consumo.nombre,
            requeridoOz: consumo.cantidadRequeridaOz,
            disponibleOz: consumo.stockActualOz,
          });
        }
      }

      if (faltantes.length > 0) {
        throw new ConflictError('Inventario insuficiente para preparar el pedido', { faltantes });
      }

      // 6. Desglose fiscal Guatemala (IVA 12% incluido)
      const { subtotalSinIva, ivaMonto, total } = calcularDesgloseIvaIncluido(totalConIva);

      // 7. Validación de cobro y cálculo de cambio
      let montoRecibido = total;
      let cambio = 0;

      if (input.metodoPago === MetodoPago.EFECTIVO) {
        montoRecibido = round2(input.montoRecibido ?? total);
        if (montoRecibido < total) {
          throw new BadRequestError(
            `El efectivo recibido (Q ${montoRecibido.toFixed(2)}) es menor al total (Q ${total.toFixed(2)})`,
          );
        }
        cambio = round2(montoRecibido - total);
      }

      // 8. Incremento atómico de correlativos
      const sucursal = await tx.sucursal.update({
        where: { id: user.sucursalId },
        data: {
          correlativoActual: { increment: 1 },
          correlativoComanda: { increment: 1 },
        },
      });

      const numeroFactura = sucursal.correlativoActual;
      const numeroCompleto = `${sucursal.serieFactura}-${String(numeroFactura).padStart(6, '0')}`;
      const numeroComanda = `CMD-${String(sucursal.correlativoComanda).padStart(5, '0')}`;

      // 9. Crear Venta + Detalles
      const venta = await tx.venta.create({
        data: {
          sucursalId: user.sucursalId,
          cajaSesionId: cajaAbierta.id,
          usuarioId: user.id,
          mesaId: input.tipoServicio === TipoServicio.MESA ? input.mesaId ?? null : null,
          tipoServicio: input.tipoServicio,
          estado: EstadoVenta.COMPLETADA,
          subtotalSinIva,
          ivaMonto,
          total,
          costoTotalReceta,
          metodoPago: input.metodoPago,
          montoRecibido,
          cambio,
          referenciaPago: input.referenciaPago?.trim() || null,
          observaciones: input.observaciones?.trim() || null,
          datosDeliveryJson: input.datosDeliveryJson
            ? (input.datosDeliveryJson as Prisma.InputJsonValue)
            : undefined,
          detalles: {
            create: detallesData,
          },
        },
        include: {
          detalles: true,
          usuario: { select: { id: true, nombreCompleto: true } },
        },
      });

      // 10. Emitir Factura inmutable
      const felInfo = await FelAdapter.certificar({
        facturaId: venta.id,
        numeroCompleto,
        clienteNit: input.clienteNit?.trim() || 'CF',
        clienteNombre: input.clienteNombre?.trim() || 'Consumidor Final',
        total,
        ivaMonto,
      });

      const factura = await tx.factura.create({
        data: {
          sucursalId: user.sucursalId,
          ventaId: venta.id,
          serie: sucursal.serieFactura,
          numero: numeroFactura,
          numeroCompleto,
          clienteNit: input.clienteNit?.trim() || 'CF',
          clienteNombre: input.clienteNombre?.trim() || 'Consumidor Final',
          clienteDireccion: input.clienteDireccion?.trim() || 'Ciudad',
          subtotalSinIva,
          ivaMonto,
          total,
          estado: EstadoFactura.EMITIDA,
          felEstado: felInfo.felEstado,
          felUuid: felInfo.felUuid,
          felSerie: felInfo.felSerie,
          felNumero: felInfo.felNumero,
          felCertificadoEn: felInfo.felCertificadoEn,
        },
      });

      // 11. Generar Comanda de cocina (con nombre/turno en mostrador)
      const comanda = await tx.comanda.create({
        data: {
          sucursalId: user.sucursalId,
          ventaId: venta.id,
          numeroComanda,
          tipoServicio: input.tipoServicio,
          mesaNumero,
          nombreTurno: input.nombreTurno?.trim() || null,
          estadoCocina: EstadoComanda.PENDIENTE,
        },
      });

      // 12. Movimiento de Caja
      await tx.cajaMovimiento.create({
        data: {
          sucursalId: user.sucursalId,
          cajaSesionId: cajaAbierta.id,
          usuarioId: user.id,
          ventaId: venta.id,
          tipo: TipoMovimientoCaja.INGRESO_VENTA,
          metodoPago: input.metodoPago,
          monto: total,
          descripcion: `Venta ${numeroCompleto} (${input.tipoServicio})`,
        },
      });

      await tx.cajaSesion.update({
        where: { id: cajaAbierta.id },
        data:
          input.metodoPago === MetodoPago.EFECTIVO
            ? { totalVentasEfectivo: { increment: total } }
            : { totalVentasTarjeta: { increment: total } },
      });

      // 13. Descontar ingredientes del inventario según recetas y registrar Kardex
      for (const [ingredienteId, consumo] of consumoIngredientes.entries()) {
        const stockNuevoOz = round4(consumo.stockActualOz - consumo.cantidadRequeridaOz);

        await tx.ingrediente.update({
          where: { id: ingredienteId },
          data: { stockActualOz: stockNuevoOz },
        });

        await tx.inventarioMovimiento.create({
          data: {
            sucursalId: user.sucursalId,
            ingredienteId,
            usuarioId: user.id,
            tipo: TipoMovimientoInventario.SALIDA_VENTA,
            cantidadOz: -consumo.cantidadRequeridaOz,
            stockAnteriorOz: consumo.stockActualOz,
            stockNuevoOz,
            costoUnitarioOz: consumo.costoUnitarioOz,
            referenciaTipo: 'VENTA',
            referenciaId: venta.id,
            motivo: `Consumo por receta - Factura ${numeroCompleto}`,
          },
        });
      }

      // 14. Auditoría
      await AuditService.registrar(
        {
          sucursalId: user.sucursalId,
          usuarioId: user.id,
          accion: ACCIONES_AUDITORIA.VENTA_CONFIRMADA,
          entidad: 'Venta',
          entidadId: venta.id,
          valorNuevo: {
            factura: numeroCompleto,
            comanda: numeroComanda,
            total,
            ivaMonto,
            metodoPago: input.metodoPago,
            tipoServicio: input.tipoServicio,
            nombreTurno: comanda.nombreTurno,
            items: detallesData.length,
          },
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return {
        venta,
        factura,
        comanda,
        sucursal: {
          nombre: sucursal.nombre,
          nit: sucursal.nit,
          direccion: sucursal.direccion,
          telefono: sucursal.telefono,
        },
      };
    });
  }

  static async obtenerComanda(ventaId: number, sucursalId: number) {
    const comanda = await VentasModel.findComandaByVentaId(ventaId, sucursalId);
    if (!comanda) {
      throw new NotFoundError('Comanda no encontrada');
    }
    return comanda;
  }
}
