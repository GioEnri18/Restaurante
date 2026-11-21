const { Op, QueryTypes, UniqueConstraintError } = require('sequelize');
const { ACCIONES_AUDITORIA } = require('../config/constants');
const { getPgErrorCode, sequelize, withTransaction } = require('../config/database');
const { env } = require('../config/env');
const {
  CajaMovimiento,
  CajaSesion,
  Comanda,
  EstadoCaja,
  EstadoComanda,
  EstadoFactura,
  EstadoFel,
  EstadoMesa,
  EstadoVenta,
  Factura,
  InventarioMovimiento,
  MenuEspecial,
  MenuEspecialPlatillo,
  Mesa,
  MetodoPago,
  Platillo,
  RecetaIngrediente,
  Sucursal,
  TipoMovimientoCaja,
  TipoMovimientoInventario,
  TipoServicio,
  Usuario,
  Venta,
  VentaDetalle,
} = require('../models');
const { BadRequestError, ConflictError, NotFoundError } = require('../shared/errors/AppError');
const { AuditService } = require('../shared/services/audit.service');
const { FelAdapter } = require('../shared/services/fel.adapter');
const { calcularDesgloseIvaIncluido, round2, round4 } = require('../shared/utils/tax');

/**
 * Servicio de checkout transaccional del POS:
 * confirmación idempotente de ventas, bloqueo pesimista de stock (FOR UPDATE),
 * certificación FEL post-commit, comandas y estado de mesas.
 */
class CheckoutService {
  static async obtenerVentaExistentePorIdempotencyKey(sucursalId, idempotencyKey) {
    const existente = await Venta.findOne({
      where: { sucursalId, idempotencyKey },
      include: [
        { model: VentaDetalle, as: 'detalles' },
        { model: Usuario, as: 'usuario', attributes: ['id', 'nombreCompleto'] },
        { model: Factura, as: 'factura' },
        { model: Comanda, as: 'comanda' },
        {
          model: Sucursal,
          as: 'sucursal',
          attributes: ['nombre', 'nit', 'direccion', 'telefono'],
        },
      ],
    });

    if (!existente || !existente.factura || !existente.comanda) {
      return null;
    }

    const plain = existente.get({ plain: true });
    const { factura, comanda, sucursal, ...venta } = plain;
    return { venta, factura, comanda, sucursal };
  }

  static async confirmarVenta(user, input, clientMeta) {
    if (!input.items || input.items.length === 0) {
      throw new BadRequestError('El carrito debe contener al menos un platillo');
    }

    const idempotencyKey = input.idempotencyKey?.trim() || undefined;

    // 0. Comprobación rápida de idempotencia antes de abrir transacción
    if (idempotencyKey) {
      const previa = await this.obtenerVentaExistentePorIdempotencyKey(
        user.sucursalId,
        idempotencyKey,
      );
      if (previa) {
        return previa;
      }
    }

    try {
      return await withTransaction(
        async (tx) => {
          // 1. Validar que exista caja abierta en la sucursal
          const cajaAbierta = await CajaSesion.findOne({
            where: { sucursalId: user.sucursalId, estado: EstadoCaja.ABIERTA },
            transaction: tx,
          });

          if (!cajaAbierta) {
            throw new BadRequestError(
              'No se permite vender sin caja abierta. Solicita abrir una sesión de caja primero.',
            );
          }

          // 2. Validar y ocupar mesa si el servicio elegido es MESA
          let mesaNumero = null;
          if (input.tipoServicio === TipoServicio.MESA) {
            if (!input.mesaId) {
              throw new BadRequestError('Debes seleccionar una mesa para el servicio en mesa');
            }
            const mesa = await Mesa.findOne({
              where: { id: input.mesaId, sucursalId: user.sucursalId, activa: true },
              transaction: tx,
            });
            if (!mesa) {
              throw new NotFoundError('La mesa seleccionada no existe en esta sucursal');
            }
            mesaNumero = mesa.numero;
            await mesa.update({ estado: EstadoMesa.OCUPADA }, { transaction: tx });
          }

          // 3. Verificar si existe menú especial activo hoy para aplicar precios especiales
          const ahora = new Date();
          const menuEspecialHoy = await MenuEspecial.findOne({
            where: {
              sucursalId: user.sucursalId,
              activo: true,
              fechaInicio: { [Op.lte]: ahora },
              fechaFin: { [Op.gte]: ahora },
            },
            include: [{ model: MenuEspecialPlatillo, as: 'platillos' }],
            transaction: tx,
          });

          const preciosEspeciales = new Map();
          if (menuEspecialHoy) {
            for (const mp of menuEspecialHoy.platillos ?? []) {
              if (mp.precioEspecial !== null) {
                preciosEspeciales.set(mp.platilloId, Number(mp.precioEspecial));
              }
            }
          }

          // 4. Cargar platillos y definiciones de receta
          const platilloIds = Array.from(new Set(input.items.map((i) => i.platilloId)));
          const platillos = await Platillo.findAll({
            where: { id: { [Op.in]: platilloIds }, activo: true },
            include: [{ model: RecetaIngrediente, as: 'receta' }],
            transaction: tx,
          });

          const platillosMap = new Map(platillos.map((p) => [p.id, p]));

          // Reunir y ordenar los IDs de ingredientes involucrados para bloquear en orden ascendente (evita deadlocks)
          const ingredienteIdsSet = new Set();
          for (const item of input.items) {
            const platillo = platillosMap.get(item.platilloId);
            if (!platillo) {
              throw new NotFoundError(
                `El platillo ID ${item.platilloId} no existe o está inactivo`,
              );
            }
            if (!platillo.disponible) {
              throw new BadRequestError(`El platillo "${platillo.nombre}" no está disponible`);
            }
            for (const r of platillo.receta ?? []) {
              ingredienteIdsSet.add(r.ingredienteId);
            }
          }

          const sortedIngredienteIds = Array.from(ingredienteIdsSet).sort((a, b) => a - b);

          // 5. Bloqueo pesimista FOR UPDATE sobre los ingredientes requeridos (orden ascendente por ID)
          const ingredientesBloqueadosMap = new Map();
          if (sortedIngredienteIds.length > 0) {
            const filasBloqueadas = await sequelize.query(
              `SELECT id, nombre, stock_actual_oz, costo_promedio_oz
               FROM ingredientes
               WHERE id IN (:ids) AND sucursal_id = :sucursalId
               ORDER BY id ASC
               FOR UPDATE`,
              {
                replacements: { ids: sortedIngredienteIds, sucursalId: user.sucursalId },
                type: QueryTypes.SELECT,
                transaction: tx,
              },
            );

            for (const fila of filasBloqueadas) {
              ingredientesBloqueadosMap.set(fila.id, {
                id: fila.id,
                nombre: fila.nombre,
                stockActualOz: Number(fila.stock_actual_oz),
                costoPromedioOz: Number(fila.costo_promedio_oz),
              });
            }
          }

          // Calcular totales, costos y consumo acumulado estrictamente desde las filas bloqueadas
          const consumoIngredientes = new Map();
          let totalConIva = 0;
          let costoTotalReceta = 0;
          const detallesData = [];

          for (const item of input.items) {
            const platillo = platillosMap.get(item.platilloId);
            const precioUnitario =
              preciosEspeciales.get(platillo.id) ?? Number(platillo.precioVenta);
            const subtotalItem = round2(precioUnitario * item.cantidad);
            totalConIva = round2(totalConIva + subtotalItem);

            let costoUnitarioReceta = 0;
            for (const r of platillo.receta ?? []) {
              const ingBloqueado = ingredientesBloqueadosMap.get(r.ingredienteId);
              if (!ingBloqueado) {
                throw new NotFoundError(
                  `Ingrediente ID ${r.ingredienteId} de la receta "${platillo.nombre}" no encontrado en esta sucursal`,
                );
              }
              const ozPorUnidad = Number(r.cantidadOz);
              const costoOz = ingBloqueado.costoPromedioOz;
              costoUnitarioReceta = round4(costoUnitarioReceta + ozPorUnidad * costoOz);

              const consumoTotalItemOz = round4(ozPorUnidad * item.cantidad);
              const prev = consumoIngredientes.get(r.ingredienteId);
              if (prev) {
                prev.cantidadRequeridaOz = round4(prev.cantidadRequeridaOz + consumoTotalItemOz);
              } else {
                consumoIngredientes.set(r.ingredienteId, {
                  nombre: ingBloqueado.nombre,
                  cantidadRequeridaOz: consumoTotalItemOz,
                  stockBloqueadoOz: ingBloqueado.stockActualOz,
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

          // 6. Validar existencias suficientes usando los saldos bloqueados
          const faltantes = [];
          for (const [, consumo] of consumoIngredientes.entries()) {
            if (consumo.stockBloqueadoOz < consumo.cantidadRequeridaOz) {
              faltantes.push({
                ingrediente: consumo.nombre,
                requeridoOz: consumo.cantidadRequeridaOz,
                disponibleOz: consumo.stockBloqueadoOz,
              });
            }
          }

          if (faltantes.length > 0) {
            throw new ConflictError('Inventario insuficiente para preparar el pedido', {
              faltantes,
            });
          }

          // 7. Desglose fiscal Guatemala (IVA 12% incluido)
          const { subtotalSinIva, ivaMonto, total } = calcularDesgloseIvaIncluido(totalConIva);

          // 8. Validación de cobro y cálculo de cambio
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
          } else if (!input.referenciaPago?.trim()) {
            throw new BadRequestError(
              'La referencia o autorización de pago es obligatoria para pagos con tarjeta',
            );
          }

          // 9. Incremento atómico de correlativos de factura y comanda
          const [sucursalRow] = await sequelize.query(
            `UPDATE sucursales
             SET correlativo_actual = correlativo_actual + 1,
                 correlativo_comanda = correlativo_comanda + 1,
                 updated_at = NOW()
             WHERE id = :sucursalId
             RETURNING id, nombre, nit, direccion, telefono, serie_factura, correlativo_actual, correlativo_comanda`,
            {
              replacements: { sucursalId: user.sucursalId },
              type: QueryTypes.SELECT,
              transaction: tx,
            },
          );

          if (!sucursalRow) {
            throw new NotFoundError('Sucursal no encontrada');
          }

          const numeroFactura = sucursalRow.correlativo_actual;
          const numeroCompleto = `${sucursalRow.serie_factura}-${String(numeroFactura).padStart(6, '0')}`;
          const numeroComanda = `CMD-${String(sucursalRow.correlativo_comanda).padStart(5, '0')}`;

          // 10. Crear Venta + Detalles (con idempotencyKey si se envió)
          const venta = await Venta.create(
            {
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
              idempotencyKey: idempotencyKey ?? null,
              datosDeliveryJson: input.datosDeliveryJson ?? null,
            },
            { transaction: tx },
          );

          await VentaDetalle.bulkCreate(
            detallesData.map((d) => ({ ventaId: venta.id, ...d })),
            { transaction: tx },
          );

          // 11. Emitir Factura inmutable (Fase 3.2: SIN llamar a FelAdapter dentro de la transacción)
          const felEstadoInicial = env.FEL_ENABLED ? EstadoFel.PENDIENTE : EstadoFel.NO_APLICA;
          const factura = await Factura.create(
            {
              sucursalId: user.sucursalId,
              ventaId: venta.id,
              serie: sucursalRow.serie_factura,
              numero: numeroFactura,
              numeroCompleto,
              clienteNit: input.clienteNit?.trim() || 'CF',
              clienteNombre: input.clienteNombre?.trim() || 'Consumidor Final',
              clienteDireccion: input.clienteDireccion?.trim() || 'Ciudad',
              subtotalSinIva,
              ivaMonto,
              total,
              estado: EstadoFactura.EMITIDA,
              felEstado: felEstadoInicial,
              felUuid: null,
              felSerie: null,
              felNumero: null,
              felCertificadoEn: null,
            },
            { transaction: tx },
          );

          // 12. Generar Comanda de cocina
          const comanda = await Comanda.create(
            {
              sucursalId: user.sucursalId,
              ventaId: venta.id,
              numeroComanda,
              tipoServicio: input.tipoServicio,
              mesaNumero,
              nombreTurno: input.nombreTurno?.trim() || null,
              estadoCocina: EstadoComanda.PENDIENTE,
            },
            { transaction: tx },
          );

          // 13. Movimiento de Caja (incrementa totales brutos de venta del turno)
          await CajaMovimiento.create(
            {
              sucursalId: user.sucursalId,
              cajaSesionId: cajaAbierta.id,
              usuarioId: user.id,
              ventaId: venta.id,
              tipo: TipoMovimientoCaja.INGRESO_VENTA,
              metodoPago: input.metodoPago,
              monto: total,
              descripcion: `Venta ${numeroCompleto} (${input.tipoServicio})`,
            },
            { transaction: tx },
          );

          if (input.metodoPago === MetodoPago.EFECTIVO) {
            await cajaAbierta.increment('totalVentasEfectivo', { by: total, transaction: tx });
          } else {
            await cajaAbierta.increment('totalVentasTarjeta', { by: total, transaction: tx });
          }

          // 14. Descuento atómico condicionado en orden ascendente + Kardex desde saldo bloqueado
          for (const ingredienteId of sortedIngredienteIds) {
            const consumo = consumoIngredientes.get(ingredienteId);
            if (!consumo) continue;

            const stockAnteriorOz = consumo.stockBloqueadoOz;
            const stockNuevoOz = round4(stockAnteriorOz - consumo.cantidadRequeridaOz);

            const updatedRows = await sequelize.query(
              `UPDATE ingredientes
               SET stock_actual_oz = stock_actual_oz - :qty,
                   updated_at = NOW()
               WHERE id = :id
                 AND sucursal_id = :sucursalId
                 AND stock_actual_oz >= :qty
               RETURNING id`,
              {
                replacements: {
                  qty: consumo.cantidadRequeridaOz,
                  id: ingredienteId,
                  sucursalId: user.sucursalId,
                },
                type: QueryTypes.SELECT,
                transaction: tx,
              },
            );

            if (updatedRows.length !== 1) {
              throw new ConflictError(
                `Stock insuficiente para "${consumo.nombre}" por operación concurrente`,
              );
            }

            await InventarioMovimiento.create(
              {
                sucursalId: user.sucursalId,
                ingredienteId,
                usuarioId: user.id,
                tipo: TipoMovimientoInventario.SALIDA_VENTA,
                cantidadOz: -consumo.cantidadRequeridaOz,
                stockAnteriorOz,
                stockNuevoOz,
                costoUnitarioOz: consumo.costoUnitarioOz,
                referenciaTipo: 'VENTA',
                referenciaId: venta.id,
                motivo: `Consumo por receta - Factura ${numeroCompleto}`,
              },
              { transaction: tx },
            );
          }

          // 15. Auditoría
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
                mesaNumero,
                nombreTurno: comanda.nombreTurno,
                items: detallesData.length,
              },
              ipAddress: clientMeta.ipAddress,
              userAgent: clientMeta.userAgent,
            },
            tx,
          );

          const ventaCompleta = await Venta.findByPk(venta.id, {
            include: [
              { model: VentaDetalle, as: 'detalles' },
              { model: Usuario, as: 'usuario', attributes: ['id', 'nombreCompleto'] },
            ],
            transaction: tx,
          });

          return {
            venta: (ventaCompleta ?? venta).get({ plain: true }),
            factura: factura.get({ plain: true }),
            comanda: comanda.get({ plain: true }),
            sucursal: {
              nombre: sucursalRow.nombre,
              nit: sucursalRow.nit,
              direccion: sucursalRow.direccion,
              telefono: sucursalRow.telefono,
            },
          };
        },
        async (result) => {
          // Fase 3.2: Callback post-commit — certificar FEL FUERA de la transacción de BD
          if (!env.FEL_ENABLED || !result?.factura) {
            return;
          }

          let felResultado;
          try {
            felResultado = await FelAdapter.certificar({
              facturaId: result.factura.id,
              numeroCompleto: result.factura.numeroCompleto,
              clienteNit: result.factura.clienteNit,
              clienteNombre: result.factura.clienteNombre,
              total: Number(result.factura.total),
              ivaMonto: Number(result.factura.ivaMonto),
            });
          } catch (felError) {
            felResultado = {
              felEstado: EstadoFel.RECHAZADA,
              felUuid: null,
              felSerie: null,
              felNumero: null,
              felCertificadoEn: null,
              felErrorDetalle: String(
                felError instanceof Error ? felError.message : felError,
              ).slice(0, 300),
            };
          }

          await Factura.update(
            {
              felEstado: felResultado.felEstado,
              felUuid: felResultado.felUuid ?? null,
              felSerie: felResultado.felSerie ?? null,
              felNumero: felResultado.felNumero ?? null,
              felCertificadoEn: felResultado.felCertificadoEn ?? null,
              felErrorDetalle: felResultado.felErrorDetalle ?? null,
            },
            { where: { id: result.factura.id } },
          );

          Object.assign(result.factura, {
            felEstado: felResultado.felEstado,
            felUuid: felResultado.felUuid ?? null,
            felSerie: felResultado.felSerie ?? null,
            felNumero: felResultado.felNumero ?? null,
            felCertificadoEn: felResultado.felCertificadoEn ?? null,
            felErrorDetalle: felResultado.felErrorDetalle ?? null,
          });

          await AuditService.registrar({
            sucursalId: user.sucursalId,
            usuarioId: user.id,
            accion: ACCIONES_AUDITORIA.CERTIFICACION_FEL,
            entidad: 'Factura',
            entidadId: result.factura.id,
            valorAnterior: {
              numeroCompleto: result.factura.numeroCompleto,
              felEstado: EstadoFel.PENDIENTE,
            },
            valorNuevo: {
              numeroCompleto: result.factura.numeroCompleto,
              felEstado: felResultado.felEstado,
              felUuid: felResultado.felUuid ?? null,
              felSerie: felResultado.felSerie ?? null,
              felNumero: felResultado.felNumero ?? null,
              felErrorDetalle: felResultado.felErrorDetalle ?? null,
            },
            motivo: felResultado.felErrorDetalle || 'Certificación FEL ejecutada post-commit',
            ipAddress: clientMeta.ipAddress,
            userAgent: clientMeta.userAgent,
          });
        },
      );
    } catch (error) {
      // Si dos peticiones simultáneas enviaron la misma idempotencyKey, devolver la venta original
      if (
        idempotencyKey &&
        (error instanceof UniqueConstraintError || getPgErrorCode(error) === '23505')
      ) {
        const previa = await this.obtenerVentaExistentePorIdempotencyKey(
          user.sucursalId,
          idempotencyKey,
        );
        if (previa) {
          return previa;
        }
      }
      throw error;
    }
  }

  static async actualizarEstadoMesa(user, mesaId, estado) {
    const mesa = await Mesa.findOne({
      where: { id: mesaId, sucursalId: user.sucursalId, activa: true },
    });
    if (!mesa) {
      throw new NotFoundError('Mesa no encontrada en esta sucursal');
    }

    await mesa.update({ estado });
    return mesa.get({ plain: true });
  }

  static async obtenerComanda(ventaId, sucursalId) {
    const comanda = await Comanda.findOne({
      where: { ventaId, sucursalId },
      include: [
        { model: Sucursal, as: 'sucursal', attributes: ['nombre', 'direccion', 'telefono'] },
        {
          model: Venta,
          as: 'venta',
          include: [
            { model: Usuario, as: 'usuario', attributes: ['nombreCompleto'] },
            { model: VentaDetalle, as: 'detalles' },
          ],
        },
      ],
    });
    if (!comanda) {
      throw new NotFoundError('Comanda no encontrada');
    }
    return comanda.get({ plain: true });
  }
}

module.exports = { CheckoutService };
