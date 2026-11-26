const crypto = require('node:crypto');
const { Op, QueryTypes, UniqueConstraintError } = require('sequelize');
const { ACCIONES_AUDITORIA } = require('../config/constants');
const { getPgErrorCode, sequelize, withTransaction } = require('../config/database');
const {
  CajaMovimiento,
  CajaSesion,
  Comanda,
  EstadoCaja,
  EstadoComanda,
  EstadoFactura,
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
const { calcularDesgloseIvaIncluido, round2, round4 } = require('../shared/utils/tax');
const { verificarAutorizacionCortesia } = require('./autorizacion-supervisor.service');
const { alcanceTurnoCajero } = require('./facturas.service');
const { ORDEN_PRECEDENCIA_MENU_ESPECIAL } = require('./menu.service');

/**
 * Servicio de checkout transaccional del POS:
 * confirmación idempotente de ventas, bloqueo pesimista de stock (FOR UPDATE),
 * comandas y estado de mesas. La factura es un comprobante interno (no se certifica ante la SAT).
 */
/**
 * Huella SHA-256 del cobro: define cuándo dos peticiones con la misma idempotencyKey son
 * "el mismo cobro". Incluye el pedido y los datos de pago que quedan registrados en la venta:
 * - platillos y cantidades (agregados y ordenados), tipo de servicio y mesa;
 * - método de pago, efectivo recibido (solo EFECTIVO: con TARJETA se registra el total) y la
 *   referencia/autorización del pago.
 * Si la venta ya se confirmó y el reintento trae otros datos de pago, responde 409 en lugar de
 * devolver una venta registrada con datos distintos a los que el cajero ve en pantalla.
 */
function calcularHuellaPedido(input) {
  const cantidades = new Map();
  for (const item of input.items ?? []) {
    cantidades.set(item.platilloId, (cantidades.get(item.platilloId) ?? 0) + item.cantidad);
  }
  const esEfectivo = input.metodoPago === MetodoPago.EFECTIVO;
  const normalizado = {
    items: Array.from(cantidades.entries()).sort((a, b) => a[0] - b[0]),
    tipoServicio: input.tipoServicio,
    mesaId: input.tipoServicio === TipoServicio.MESA ? input.mesaId ?? null : null,
    metodoPago: input.metodoPago,
    montoRecibido:
      esEfectivo && input.montoRecibido !== undefined && input.montoRecibido !== null
        ? round2(input.montoRecibido)
        : null,
    referenciaPago: input.referenciaPago?.trim() || null,
    ...((input.items ?? []).some((item) => item.cantidadCortesia) ? {
      cortesias: input.items.filter((item) => item.cantidadCortesia)
        .map((item) => [item.platilloId, item.cantidadCortesia]).sort((a, b) => a[0] - b[0] || a[1] - b[1]),
      motivoCortesia: input.cortesia?.motivo?.trim(),
    } : {}),
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalizado)).digest('hex');
}

class CheckoutService {
  static async obtenerVentaExistentePorIdempotencyKey(sucursalId, idempotencyKey, huella) {
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

    if (huella && existente.idempotencyHuella && existente.idempotencyHuella !== huella) {
      // Con esta clave YA hay una venta confirmada, pero con otro pedido o datos de pago.
      // No se cobra de nuevo: el cajero debe revisar la venta registrada antes de reintentar.
      throw new ConflictError(
        `Este cobro ya fue registrado como la factura ${existente.factura.numeroCompleto} con otros datos de pedido o de pago. Revísala en el historial antes de volver a cobrar.`,
        { facturaId: existente.factura.id, numeroCompleto: existente.factura.numeroCompleto },
      );
    }

    const plain = existente.get({ plain: true });
    const { factura, comanda, sucursal, ...venta } = plain;
    return { venta, factura, comanda, sucursal };
  }

  /**
   * Valida reglas de cortesía y credenciales de supervisor ANTES de abrir una transacción SQL
   * (evita sostener locks mientras corre bcrypt). Reutilizable por mostrador y por domicilio.
   */
  static async validarAutorizacionCortesiaPreTx(user, input, clientMeta) {
    if (input.items.some((item) => !Number.isInteger(item.cantidadCortesia ?? 0)
      || (item.cantidadCortesia ?? 0) < 0 || (item.cantidadCortesia ?? 0) > item.cantidad)) {
      throw new BadRequestError('La cantidad de cortesía debe estar entre cero y las unidades pedidas');
    }
    const tieneCortesia = input.items.some((item) => (item.cantidadCortesia ?? 0) > 0);
    if (tieneCortesia && (input.cortesia?.motivo?.trim().length ?? 0) < 3) {
      throw new BadRequestError('Ingresa el motivo de la cortesía');
    }
    return tieneCortesia
      ? verificarAutorizacionCortesia(user, input.cortesia.autorizacion, clientMeta)
      : null;
  }

  /**
   * Núcleo transaccional reutilizable de confirmación de venta:
   * invocado por `confirmarVenta` (MOSTRADOR/LLEVAR/MESA/DELIVERY legado),
   * por pedidos a domicilio PREPAGADO al crear y por CONTRA_ENTREGA al liquidar.
   *
   * @param {import('sequelize').Transaction} tx Transacción activa
   * @param {object} user Usuario autenticado
   * @param {object} input Datos del pedido y pago
   * @param {object} clientMeta Metadatos HTTP (IP / User-Agent)
   * @param {object} [opciones] Extensiones opcionales para domicilio
   */
  static async ejecutarVentaEnTransaccion(tx, user, input, clientMeta, opciones = {}) {
    const aprobador = opciones.aprobador ?? null;
    const idempotencyKey = opciones.idempotencyKey ?? null;
    const huella = opciones.huella ?? null;
    const costoEnvio = round2(Number(opciones.costoEnvio ?? 0));
    const pedidoDomicilioId = opciones.pedidoDomicilioId ?? null;
    const comandaExistente = opciones.comandaExistente ?? null;
    const correlacionId = opciones.correlacionId ?? null;
    const zonaEntregaNombre = opciones.zonaEntregaNombre ?? null;
    const direccionEntrega = opciones.direccionEntrega ?? null;
    const referenciaEntrega = opciones.referenciaEntrega ?? null;
    const permitirEfectivoMenorEnLiquidacion = Boolean(opciones.permitirEfectivoMenorEnLiquidacion);

    // 1. Validar que exista caja abierta en la sucursal
    // Bloqueo de la sesión de caja (mismo FOR UPDATE que cerrarCaja): si el cierre se está
    // ejecutando, la venta espera y luego ve la caja CERRADA; si la venta va primero, el
    // cierre espera y su arqueo incluye la venta. Ninguna venta queda fuera del cuadre.
    const cajaAbierta = await CajaSesion.findOne({
      where: { sucursalId: user.sucursalId, estado: EstadoCaja.ABIERTA },
      lock: tx.LOCK.UPDATE,
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
      // Misma precedencia que el catálogo: el precio cobrado es el mismo que el mostrado
      order: ORDEN_PRECEDENCIA_MENU_ESPECIAL,
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
      where: { id: { [Op.in]: platilloIds }, sucursalId: user.sucursalId, activo: true },
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
      // En liquidación CONTRA_ENTREGA el pedido ya fue entregado aunque el platillo se haya desactivado después
      if (!platillo.disponible && !comandaExistente) {
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
         WHERE id IN (:ids) AND sucursal_id = :sucursalId AND activo = true
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
    let totalPlatillosConIva = 0;
    let costoTotalReceta = 0;
    const detallesData = [];

    for (const item of input.items) {
      const platillo = platillosMap.get(item.platilloId);
      // Si el item trae precioSnapshot (liquidación de pedido a domicilio), respeta el precio pactado al pedir
      const precioUnitario = item.precioUnitarioSnapshot !== undefined && item.precioUnitarioSnapshot !== null
        ? round2(Number(item.precioUnitarioSnapshot))
        : (preciosEspeciales.get(platillo.id) ?? Number(platillo.precioVenta));
      if (precioUnitario < 0.01) {
        throw new BadRequestError(`Configura un precio de venta válido para "${platillo.nombre}"`);
      }
      const cantidadCortesia = item.cantidadCortesia ?? 0;
      const subtotalItem = round2(precioUnitario * (item.cantidad - cantidadCortesia));
      totalPlatillosConIva = round2(totalPlatillosConIva + subtotalItem);

      let costoUnitarioReceta = 0;
      let costoPendiente = !platillo.receta?.length;
      let consumoPendiente = !platillo.receta?.length;
      const consumoReceta = [];
      for (const r of platillo.receta ?? []) {
        const ingBloqueado = ingredientesBloqueadosMap.get(r.ingredienteId);
        const ozPorUnidad = Number(r.cantidadOz);
        if (!(ozPorUnidad > 0)) throw new BadRequestError('La receta contiene una cantidad inválida');
        const costoOz = ingBloqueado?.costoPromedioOz ?? 0;
        if (costoOz <= 0) costoPendiente = true;
        costoUnitarioReceta = round4(costoUnitarioReceta + ozPorUnidad * costoOz);
        const requeridoOz = round4(ozPorUnidad * item.cantidad);
        const prev = consumoIngredientes.get(r.ingredienteId);
        const stockBloqueadoOz = Math.max(0, ingBloqueado?.stockActualOz ?? 0);
        const descontadoTotal = prev?.cantidadDescontadaOz ?? 0;
        const descontadoOz = round4(Math.min(requeridoOz, round4(stockBloqueadoOz - descontadoTotal)));
        const pendienteOz = round4(requeridoOz - descontadoOz);
        consumoPendiente ||= pendienteOz > 0;
        consumoReceta.push({ ingredienteId: r.ingredienteId, requeridoOz, descontadoOz, pendienteOz, costoOz });
        consumoIngredientes.set(r.ingredienteId, {
          nombre: ingBloqueado?.nombre ?? String(r.ingredienteId),
          cantidadDescontadaOz: round4(descontadoTotal + descontadoOz),
          stockBloqueadoOz,
          costoUnitarioOz: costoOz,
        });
      }
      costoTotalReceta = round2(costoTotalReceta + costoUnitarioReceta * item.cantidad);
      detallesData.push({
        platilloId: platillo.id,
        nombrePlatillo: platillo.nombre,
        cantidad: item.cantidad,
        precioUnitario,
        costoUnitarioReceta,
        cantidadCortesia,
        costoPendiente,
        consumoPendiente,
        consumoReceta,
        subtotal: subtotalItem,
        notas: item.notas?.trim() || null,
      });
    }

    // 7. Desglose fiscal Guatemala (IVA 12% incluido, sumando costo de envío si aplica)
    const totalConIva = round2(totalPlatillosConIva + costoEnvio);
    const { subtotalSinIva, ivaMonto, total } = calcularDesgloseIvaIncluido(totalConIva);

    // 8. Validación de cobro y cálculo de cambio
    let montoRecibido = total;
    let cambio = 0;

    if ((total === 0) !== (input.metodoPago === MetodoPago.SIN_COBRO)) {
      throw new BadRequestError('El método sin cobro corresponde únicamente a pedidos completos de cortesía');
    }
    if (input.metodoPago === MetodoPago.EFECTIVO) {
      montoRecibido = round2(input.montoRecibido ?? total);
      if (!permitirEfectivoMenorEnLiquidacion && montoRecibido < total) {
        throw new BadRequestError(
          `El efectivo recibido (Q ${montoRecibido.toFixed(2)}) es menor al total (Q ${total.toFixed(2)})`,
        );
      }
      cambio = permitirEfectivoMenorEnLiquidacion ? 0 : round2(Math.max(0, montoRecibido - total));
    } else if (input.metodoPago === MetodoPago.TARJETA && !input.referenciaPago?.trim()) {
      throw new BadRequestError(
        'La referencia o autorización de pago es obligatoria para pagos con tarjeta',
      );
    }

    // 9. Incremento atómico de correlativos de factura (y comanda solo si no existe ya)
    const [sucursalRow] = await sequelize.query(
      comandaExistente
        ? `UPDATE sucursales
           SET correlativo_actual = correlativo_actual + 1,
               updated_at = NOW()
           WHERE id = :sucursalId
           RETURNING id, nombre, nit, direccion, telefono, serie_factura, correlativo_actual, correlativo_comanda`
        : `UPDATE sucursales
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
    const numeroComanda = comandaExistente
      ? comandaExistente.numeroComanda
      : `CMD-${String(sucursalRow.correlativo_comanda).padStart(5, '0')}`;

    // 10. Crear Venta + Detalles
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
        referenciaPago: total > 0 ? input.referenciaPago?.trim() || null : null,
        cortesiaAutorizadaPorId: aprobador?.id ?? null,
        cortesiaMotivo: aprobador ? input.cortesia.motivo.trim() : null,
        observaciones: input.observaciones?.trim() || null,
        idempotencyKey: idempotencyKey ?? null,
        idempotencyHuella: huella,
        pedidoDomicilioId,
        costoEnvio,
        datosDeliveryJson: input.datosDeliveryJson ?? null,
      },
      { transaction: tx },
    );

    await VentaDetalle.bulkCreate(
      detallesData.map((d) => ({ ventaId: venta.id, ...d })),
      { transaction: tx },
    );

    // 11. Emitir Factura inmutable (comprobante interno)
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
        costoEnvio,
        zonaEntregaNombre,
        total,
        estado: EstadoFactura.EMITIDA,
      },
      { transaction: tx },
    );

    // 12. Reutilizar y vincular comanda existente (CONTRA_ENTREGA) o crear nueva comanda
    let comanda;
    if (comandaExistente) {
      await comandaExistente.update({ ventaId: venta.id }, { transaction: tx });
      comanda = comandaExistente;
    } else {
      comanda = await Comanda.create(
        {
          sucursalId: user.sucursalId,
          ventaId: venta.id,
          pedidoDomicilioId,
          numeroComanda,
          tipoServicio: input.tipoServicio,
          mesaNumero,
          nombreTurno: input.nombreTurno?.trim() || null,
          costoEnvio,
          direccionEntrega,
          referenciaEntrega,
          zonaEntregaNombre,
          estadoCocina: EstadoComanda.PENDIENTE,
        },
        { transaction: tx },
      );
    }

    // 13. Movimiento de Caja (incrementa totales brutos de venta del turno por el total facturado)
    const montoNetoCaja = permitirEfectivoMenorEnLiquidacion ? total : round2(montoRecibido - cambio);
    const detalleVuelto = cambio > 0
      ? ` · Recibido Q${montoRecibido.toFixed(2)}, vuelto Q${cambio.toFixed(2)}`
      : '';
    if (total > 0) await CajaMovimiento.create(
      {
        sucursalId: user.sucursalId,
        cajaSesionId: cajaAbierta.id,
        usuarioId: user.id,
        ventaId: venta.id,
        tipo: TipoMovimientoCaja.INGRESO_VENTA,
        metodoPago: input.metodoPago,
        monto: montoNetoCaja,
        descripcion: `Venta ${numeroCompleto} (${input.tipoServicio})${detalleVuelto}`,
      },
      { transaction: tx },
    );

    if (input.metodoPago === MetodoPago.EFECTIVO) {
      await cajaAbierta.increment('totalVentasEfectivo', { by: montoNetoCaja, transaction: tx });
    } else if (input.metodoPago === MetodoPago.TARJETA) {
      await cajaAbierta.increment('totalVentasTarjeta', { by: total, transaction: tx });
    }

    // 14. Descuento atómico condicionado en orden ascendente + Kardex desde saldo bloqueado
    for (const ingredienteId of sortedIngredienteIds) {
      const consumo = consumoIngredientes.get(ingredienteId);
      if (!consumo?.cantidadDescontadaOz) continue;

      const stockAnteriorOz = consumo.stockBloqueadoOz;
      const stockNuevoOz = round4(stockAnteriorOz - consumo.cantidadDescontadaOz);

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
            qty: consumo.cantidadDescontadaOz,
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
          cantidadOz: -consumo.cantidadDescontadaOz,
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
    await AuditService.registrarEvento(
      {
        user,
        clientMeta,
        cajaSesionId: cajaAbierta.id,
        correlacionId,
      },
      {
        accion: ACCIONES_AUDITORIA.VENTA_CONFIRMADA,
        entidad: 'Venta',
        entidadId: venta.id,
        valorNuevo: {
          factura: numeroCompleto,
          comanda: numeroComanda,
          total,
          costoEnvio,
          ivaMonto,
          metodoPago: input.metodoPago,
          tipoServicio: input.tipoServicio,
          mesaNumero,
          nombreTurno: comanda.nombreTurno,
          pedidoDomicilioId,
          items: detallesData.length,
          lineasCostoPendiente: detallesData.filter((d) => d.costoPendiente).length,
          lineasConsumoPendiente: detallesData.filter((d) => d.consumoPendiente).length,
        },
        impactoFinanciero: total,
      },
      tx,
    );

    if (aprobador) {
      const lineas = detallesData.filter((d) => d.cantidadCortesia > 0).map((d) => ({
        platillo: d.nombrePlatillo, cantidad: d.cantidadCortesia,
        valorHabitual: round2(d.cantidadCortesia * d.precioUnitario),
        costo: round2(d.cantidadCortesia * d.costoUnitarioReceta),
        costoPendiente: d.costoPendiente, consumoPendiente: d.consumoPendiente,
      }));
      await AuditService.registrarEvento({
        user,
        clientMeta,
        cajaSesionId: cajaAbierta.id,
        aprobadorId: aprobador.id,
        correlacionId,
      }, {
        accion: ACCIONES_AUDITORIA.CORTESIA_APLICADA,
        entidad: 'Venta',
        entidadId: venta.id,
        valorNuevo: { factura: numeroCompleto, lineas },
        motivo: input.cortesia.motivo.trim(),
        impactoFinanciero: -round2(lineas.reduce((suma, linea) => suma + linea.valorHabitual, 0)),
      }, tx);
    }

    const ventaCompleta = await Venta.findByPk(venta.id, {
      include: [
        { model: VentaDetalle, as: 'detalles' },
        { model: Usuario, as: 'usuario', attributes: ['id', 'nombreCompleto'] },
      ],
      transaction: tx,
    });

    return {
      cajaAbierta,
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
  }

  static async confirmarVenta(user, input, clientMeta) {
    if (!input.items || input.items.length === 0) {
      throw new BadRequestError('El carrito debe contener al menos un platillo');
    }

    const idempotencyKey = input.idempotencyKey?.trim() || undefined;
    const huella = idempotencyKey ? calcularHuellaPedido(input) : null;

    // 0. Comprobación rápida de idempotencia antes de abrir transacción
    if (idempotencyKey) {
      const previa = await this.obtenerVentaExistentePorIdempotencyKey(
        user.sucursalId,
        idempotencyKey,
        huella,
      );
      if (previa) {
        return previa;
      }
    }

    const aprobador = await this.validarAutorizacionCortesiaPreTx(user, input, clientMeta);

    try {
      const resultado = await withTransaction((tx) =>
        this.ejecutarVentaEnTransaccion(tx, user, input, clientMeta, {
          aprobador,
          idempotencyKey,
          huella,
        }),
      );
      return {
        venta: resultado.venta,
        factura: resultado.factura,
        comanda: resultado.comanda,
        sucursal: resultado.sucursal,
      };
    } catch (error) {
      // Si dos peticiones simultáneas enviaron la misma idempotencyKey, devolver la venta original
      if (
        idempotencyKey &&
        (error instanceof UniqueConstraintError || getPgErrorCode(error) === '23505')
      ) {
        const previa = await this.obtenerVentaExistentePorIdempotencyKey(
          user.sucursalId,
          idempotencyKey,
          huella,
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

  static async obtenerComanda(ventaId, sucursalId, user) {
    const turno = await alcanceTurnoCajero(user);
    const comanda = await Comanda.findOne({
      where: { ventaId, sucursalId },
      include: [
        { model: Sucursal, as: 'sucursal', attributes: ['nombre', 'direccion', 'telefono'] },
        {
          model: Venta,
          as: 'venta',
          ...(turno ? { where: { cajaSesionId: turno.id, createdAt: turno.fecha } } : {}),
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
