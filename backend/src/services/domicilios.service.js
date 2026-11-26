const { createHash } = require('node:crypto');
const { Op, QueryTypes } = require('sequelize');
const { ACCIONES_AUDITORIA, CODIGOS_MOTIVO_AUDITORIA } = require('../config/constants');
const { getPgErrorCode, sequelize, withTransaction } = require('../config/database');
const {
  CajaMovimiento,
  CajaSesion,
  Comanda,
  EstadoCaja,
  EstadoComanda,
  EstadoFactura,
  EstadoPedidoDomicilio,
  Factura,
  Ingrediente,
  MenuEspecial,
  MenuEspecialPlatillo,
  MetodoPago,
  ModalidadPagoDomicilio,
  PedidoDomicilio,
  PedidoDomicilioDetalle,
  PedidoDomicilioHistorial,
  Platillo,
  RecetaIngrediente,
  Rol,
  TipoMovimientoCaja,
  TipoServicio,
  Usuario,
  Venta,
  ZonaEntrega,
} = require('../models');
const {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} = require('../shared/errors/AppError');
const { AuditService } = require('../shared/services/audit.service');
const { normalizarCodigoMotivo } = require('../shared/utils/auditoriaSeveridad');
const { endOfDayInTimezone, nowInTimezone, startOfDayInTimezone } = require('../shared/utils/dates');
const { buildPaginationMeta, parsePagination } = require('../shared/utils/pagination');
const {
  enmascararDireccion,
  enmascararTelefono,
  puedeVerDatosContacto,
} = require('../shared/utils/privacidadDomicilio');
const { round2, round4 } = require('../shared/utils/tax');
const { verificarAutorizacionAnulacionDomicilio } = require('./autorizacion-supervisor.service');
const { CheckoutService } = require('./checkout.service');
const { ClientesDomicilioService } = require('./clientes-domicilio.service');
const {
  ESTADOS_ACTIVOS_DOMICILIO,
  ESTADOS_ASIGNABLES_DOMICILIO,
  esPendienteDeLiquidar,
  esTransicionValida,
  mapearEstadoComanda,
  requiereMermaAlCerrar,
  validarPermisoTransicion,
} = require('./domicilios-estados');
const { FacturasService } = require('./facturas.service');
const { ORDEN_PRECEDENCIA_MENU_ESPECIAL } = require('./menu.service');
const { MermasService } = require('./mermas.service');

const INCLUDE_PEDIDO_LISTA = [
  { model: Usuario, as: 'creadoPor', attributes: ['id', 'nombreCompleto', 'username'] },
  { model: Usuario, as: 'repartidor', attributes: ['id', 'nombreCompleto', 'username'] },
  { model: Usuario, as: 'liquidadoPor', attributes: ['id', 'nombreCompleto', 'username'] },
  { model: ZonaEntrega, as: 'zonaEntrega', attributes: ['id', 'nombre', 'costoEnvio', 'tiempoEstimadoMin'] },
  {
    model: Comanda,
    as: 'comanda',
    attributes: ['id', 'numeroComanda', 'estadoCocina', 'createdAt'],
  },
  {
    model: Venta,
    as: 'venta',
    attributes: ['id', 'metodoPago', 'estado', 'total', 'costoEnvio', 'referenciaPago', 'createdAt'],
    include: [
      {
        model: Factura,
        as: 'factura',
        attributes: ['id', 'numeroCompleto', 'estado', 'total', 'costoEnvio', 'createdAt'],
      },
    ],
  },
  {
    model: PedidoDomicilioDetalle,
    as: 'detalles',
    separate: true,
    order: [['id', 'ASC']],
  },
];

function soloVePropios(user) {
  const permisos = Array.isArray(user?.permisos) ? user.permisos : [];
  return !permisos.includes('domicilios:ver') && permisos.includes('domicilios:ver_propios');
}

function formatearPedido(pedido, user, incluirHistorial = false) {
  const plain = typeof pedido.get === 'function' ? pedido.get({ plain: true }) : pedido;
  const mostrarContacto = puedeVerDatosContacto(user, plain);

  const resultado = {
    id: plain.id,
    sucursalId: plain.sucursalId,
    numeroPedido: plain.numeroPedido,
    clienteId: plain.clienteId,
    direccionEntregaId: plain.direccionEntregaId,
    zonaEntregaId: plain.zonaEntregaId,
    creadoPorId: plain.creadoPorId ?? null,
    repartidorId: plain.repartidorId ?? null,
    ventaId: plain.ventaId ?? null,
    tipoEntrega: plain.tipoEntrega || 'DELIVERY',
    origen: plain.origen || 'POS',
    trackingToken: plain.trackingToken ?? null,
    estado: plain.estado,
    modalidadPago: plain.modalidadPago,
    metodoPagoEsperado: plain.metodoPagoEsperado,
    subtotalPlatillos: round2(Number(plain.subtotalPlatillos)),
    costoEnvio: round2(Number(plain.costoEnvio)),
    total: round2(Number(plain.total)),
    zonaNombre: plain.zonaNombreSnapshot,
    tiempoEstimadoMin: Number(plain.tiempoEstimadoMin),
    clienteNombre: plain.clienteNombreSnapshot,
    clienteNit: plain.clienteNitSnapshot || 'CF',
    clienteTelefono: mostrarContacto
      ? plain.clienteTelefonoSnapshot
      : enmascararTelefono(plain.clienteTelefonoSnapshot),
    direccion: mostrarContacto
      ? plain.direccionSnapshot
      : enmascararDireccion(plain.direccionSnapshot),
    referencia: mostrarContacto ? (plain.referenciaSnapshot ?? null) : null,
    observaciones: plain.observaciones ?? null,
    montoConQuePaga: plain.montoConQuePaga !== null && plain.montoConQuePaga !== undefined
      ? round2(Number(plain.montoConQuePaga))
      : null,
    montoRecibidoRepartidor:
      plain.montoRecibidoRepartidor !== null && plain.montoRecibidoRepartidor !== undefined
        ? round2(Number(plain.montoRecibidoRepartidor))
        : null,
    diferenciaLiquidacion:
      plain.diferenciaLiquidacion !== null && plain.diferenciaLiquidacion !== undefined
        ? round2(Number(plain.diferenciaLiquidacion))
        : null,
    referenciaPagoLiquidacion: plain.referenciaPagoLiquidacion ?? null,
    liquidadoPorId: plain.liquidadoPorId ?? null,
    liquidadoEn: plain.liquidadoEn ?? null,
    motivoCierre: plain.motivoCierre ?? null,
    mermaGenerada: Boolean(plain.mermaGenerada),
    facturaAnuladaCierre: Boolean(plain.facturaAnuladaCierre),
    pendienteLiquidar: esPendienteDeLiquidar(plain),
    asignadoEn: plain.asignadoEn ?? null,
    despachadoEn: plain.despachadoEn ?? null,
    entregadoEn: plain.entregadoEn ?? null,
    canceladoEn: plain.canceladoEn ?? null,
    fallidoEn: plain.fallidoEn ?? null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    creadoPor: plain.creadoPor ?? null,
    repartidor: plain.repartidor ?? null,
    liquidadoPor: plain.liquidadoPor ?? null,
    comanda: plain.comanda ?? null,
    venta: plain.venta
      ? {
          id: plain.venta.id,
          metodoPago: plain.venta.metodoPago,
          estado: plain.venta.estado,
          total: round2(Number(plain.venta.total)),
          costoEnvio: round2(Number(plain.venta.costoEnvio ?? 0)),
          referenciaPago: plain.venta.referenciaPago ?? null,
          createdAt: plain.venta.createdAt,
          factura: plain.venta.factura
            ? {
                id: plain.venta.factura.id,
                numeroCompleto: plain.venta.factura.numeroCompleto,
                estado: plain.venta.factura.estado,
                total: round2(Number(plain.venta.factura.total)),
                costoEnvio: round2(Number(plain.venta.factura.costoEnvio ?? 0)),
                createdAt: plain.venta.factura.createdAt,
              }
            : null,
        }
      : null,
    detalles: (plain.detalles ?? []).map((d) => ({
      id: d.id,
      platilloId: d.platilloId,
      nombrePlatillo: d.nombrePlatillo,
      cantidad: Number(d.cantidad),
      cantidadCortesia: Number(d.cantidadCortesia ?? 0),
      precioUnitario: round2(Number(d.precioUnitario)),
      subtotal: round2(Number(d.subtotal)),
      notas: d.notas ?? null,
    })),
  };

  if (incluirHistorial) {
    resultado.historial = (plain.historial ?? []).map((h) => ({
      id: h.id,
      estadoAnterior: h.estadoAnterior ?? null,
      estadoNuevo: h.estadoNuevo,
      usuarioId: h.usuarioId,
      usuarioNombre: h.usuario?.nombreCompleto ?? null,
      observacion: h.observacion ?? null,
      createdAt: h.createdAt,
    }));
  }

  return resultado;
}

/**
 * Calcula huella determinística de idempotencia para creación de pedido a domicilio
 * sin almacenar teléfono/dirección en claro en el hash.
 */
function calcularHuellaCreacion(userId, input) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        userId,
        clienteId: input.clienteId ?? null,
        telefono: input.cliente?.telefono ?? null,
        direccionEntregaId: input.direccionEntregaId ?? null,
        direccionNueva: input.direccionNueva?.direccion ?? null,
        zonaEntregaId: input.zonaEntregaId,
        modalidadPago: input.modalidadPago,
        metodoPago: input.metodoPago ?? null,
        items: (input.items ?? []).map((i) => ({
          platilloId: i.platilloId,
          cantidad: i.cantidad,
          cantidadCortesia: i.cantidadCortesia ?? 0,
          notas: i.notas?.trim() || null,
        })),
      }),
    )
    .digest('hex');
}

/**
 * Carga platillos, recetas y menú especial vigente hoy en America/Guatemala para cotizar el pedido
 * y evaluar faltantes de inventario en modo solo lectura (sin descontar).
 */
async function cotizarPlatillosYValidarStockLectura(tx, sucursalId, items) {
  const platilloIds = Array.from(new Set(items.map((i) => i.platilloId)));
  const hoyGt = nowInTimezone().toJSDate();

  const [platillos, menusActivos] = await Promise.all([
    Platillo.findAll({
      where: { id: { [Op.in]: platilloIds }, sucursalId, activo: true },
      include: [
        {
          model: RecetaIngrediente,
          as: 'receta',
          include: [
            {
              model: Ingrediente,
              as: 'ingrediente',
              attributes: ['id', 'codigo', 'nombre', 'stockActualOz', 'activo'],
            },
          ],
        },
      ],
      transaction: tx,
    }),
    MenuEspecial.findAll({
      where: {
        sucursalId,
        activo: true,
        fechaInicio: { [Op.lte]: hoyGt },
        fechaFin: { [Op.gte]: hoyGt },
      },
      order: ORDEN_PRECEDENCIA_MENU_ESPECIAL,
      include: [{ model: MenuEspecialPlatillo, as: 'platillos' }],
      transaction: tx,
    }),
  ]);

  const platillosMap = new Map(platillos.map((p) => [p.id, p]));
  const menuActivo = menusActivos.find((m) => (m.platillos?.length ?? 0) > 0) ?? null;
  const preciosEspeciales = new Map();
  if (menuActivo) {
    for (const mp of menuActivo.platillos ?? []) {
      if (mp.precioEspecial !== null && mp.precioEspecial !== undefined) {
        preciosEspeciales.set(mp.platilloId, round2(Number(mp.precioEspecial)));
      }
    }
  }

  const detallesPreparados = [];
  const consumoPorIngrediente = new Map();
  let subtotalPlatillos = 0;

  for (const item of items) {
    const platillo = platillosMap.get(item.platilloId);
    if (!platillo) {
      throw new NotFoundError(`El platillo #${item.platilloId} no existe en esta sucursal`);
    }
    if (!platillo.disponible) {
      throw new BadRequestError(`El platillo "${platillo.nombre}" no está disponible actualmente`);
    }
    const precioUnitario = preciosEspeciales.has(platillo.id)
      ? preciosEspeciales.get(platillo.id)
      : round2(Number(platillo.precioVenta));
    if (precioUnitario <= 0) {
      throw new BadRequestError(`El platillo "${platillo.nombre}" no tiene precio configurado`);
    }

    const cantidad = Number(item.cantidad);
    const cantidadCortesia = Number(item.cantidadCortesia ?? 0);
    if (cantidadCortesia > cantidad) {
      throw new BadRequestError(
        `Las cortesías de "${platillo.nombre}" no pueden superar la cantidad solicitada`,
      );
    }

    const unidadesCobradas = cantidad - cantidadCortesia;
    const subtotal = round2(unidadesCobradas * precioUnitario);
    subtotalPlatillos = round2(subtotalPlatillos + subtotal);

    detallesPreparados.push({
      platilloId: platillo.id,
      nombrePlatillo: platillo.nombre,
      cantidad,
      cantidadCortesia,
      precioUnitario,
      subtotal,
      notas: item.notas?.trim() || null,
    });

    for (const rec of platillo.receta ?? []) {
      if (!rec.ingrediente) continue;
      const actual = consumoPorIngrediente.get(rec.ingredienteId) ?? {
        ingredienteId: rec.ingredienteId,
        nombre: rec.ingrediente.nombre,
        stockActualOz: round4(Number(rec.ingrediente.stockActualOz)),
        requeridoOz: 0,
      };
      actual.requeridoOz = round4(actual.requeridoOz + Number(rec.cantidadOz) * cantidad);
      consumoPorIngrediente.set(rec.ingredienteId, actual);
    }
  }

  const advertenciasStock = [];
  for (const info of consumoPorIngrediente.values()) {
    if (info.requeridoOz > info.stockActualOz) {
      advertenciasStock.push({
        ingredienteId: info.ingredienteId,
        ingredienteNombre: info.nombre,
        requeridoOz: info.requeridoOz,
        stockActualOz: info.stockActualOz,
        faltanteOz: round4(info.requeridoOz - info.stockActualOz),
      });
    }
  }

  return { detallesPreparados, subtotalPlatillos, advertenciasStock };
}

/**
 * Núcleo de negocio del módulo de Servicio a Domicilio:
 * - Tablero y polling incremental (?desde=)
 * - Creación idempotente con validación de zona activa, pedido mínimo y snapshots inmutables
 * - Asignación de repartidor
 * - Máquina de estados con bloqueo optimista, sincronización de comanda e historial inmutable
 *
 * Puntos de extensión documentados (fuera de alcance actual):
 * - Tracking GPS / mapas: conectar suscripción por `pedido.id` y `repartidorId`
 * - Notificaciones WhatsApp/SMS: disparar en callback post-commit de `withTransaction` al cambiar estado
 * - Integraciones con apps de terceros: crear adaptador que invoque `DomiciliosService.crearPedido`
 */
class DomiciliosService {
  static async listarRepartidores(sucursalId) {
    const usuarios = await Usuario.findAll({
      where: { sucursalId, activo: true },
      attributes: ['id', 'nombreCompleto', 'username'],
      include: [
        {
          model: Rol,
          as: 'rol',
          where: { codigo: 'REPARTIDOR', activo: true },
          attributes: ['id', 'codigo', 'nombre'],
        },
      ],
      order: [['nombreCompleto', 'ASC']],
    });

    return usuarios.map((u) => ({
      id: u.id,
      nombreCompleto: u.nombreCompleto,
      username: u.username,
      rolCodigo: u.rol?.codigo ?? 'REPARTIDOR',
    }));
  }

  static async listar(user, query = {}) {
    const { sucursalId } = user;
    const { page, limit, skip } = parsePagination(query.page, query.limit, 20, 50);
    const restringidoAPropios = soloVePropios(user);

    const where = { sucursalId };

    if (restringidoAPropios) {
      if (query.repartidorId && Number(query.repartidorId) !== Number(user.id)) {
        throw new ForbiddenError('Solo puedes consultar los pedidos asignados a tu usuario');
      }
      where.repartidorId = user.id;
    } else if (query.repartidorId) {
      where.repartidorId = Number(query.repartidorId);
    }

    if (query.estado) {
      where.estado = query.estado;
    } else if (query.soloActivos === 'true' || (restringidoAPropios && query.soloActivos !== 'false')) {
      where.estado = { [Op.in]: ESTADOS_ACTIVOS_DOMICILIO };
    }

    if (query.modalidadPago) {
      where.modalidadPago = query.modalidadPago;
    }
    if (query.tipoEntrega) {
      where.tipoEntrega = query.tipoEntrega;
    }
    if (query.origen) {
      where.origen = query.origen;
    }
    if (query.zonaEntregaId) {
      where.zonaEntregaId = Number(query.zonaEntregaId);
    }
    if (query.pendientesLiquidar === 'true') {
      where.modalidadPago = ModalidadPagoDomicilio.CONTRA_ENTREGA;
      where.estado = EstadoPedidoDomicilio.ENTREGADO;
      where.ventaId = { [Op.is]: null };
    }

    if (query.fechaDesde || query.fechaHasta) {
      const rango = {};
      if (query.fechaDesde) rango[Op.gte] = startOfDayInTimezone(query.fechaDesde);
      if (query.fechaHasta) rango[Op.lte] = endOfDayInTimezone(query.fechaHasta);
      where.createdAt = rango;
    }

    // Polling incremental: solo pedidos actualizados estrictamente después de `desde`
    if (query.desde) {
      const fechaDesdePoll = new Date(query.desde);
      if (Number.isNaN(fechaDesdePoll.getTime())) {
        throw new BadRequestError('El parámetro "desde" debe ser una fecha ISO válida');
      }
      where.updatedAt = { [Op.gt]: fechaDesdePoll };
    }

    const serverTime = new Date().toISOString();

    const [{ rows, count }, resumenRows] = await Promise.all([
      PedidoDomicilio.findAndCountAll({
        where,
        order: [
          ['updatedAt', 'DESC'],
          ['id', 'DESC'],
        ],
        offset: skip,
        limit,
        include: INCLUDE_PEDIDO_LISTA,
      }),
      sequelize.query(
        `SELECT
           "estado",
           COUNT(*)::int AS "cantidad",
           COUNT(*) FILTER (
             WHERE "modalidad_pago" = 'CONTRA_ENTREGA'
               AND "estado" = 'ENTREGADO'
               AND "venta_id" IS NULL
           )::int AS "pendientes_liquidar"
         FROM "pedidos_domicilio"
         WHERE "sucursal_id" = :sucursalId
           ${restringidoAPropios ? 'AND "repartidor_id" = :repartidorId' : ''}
         GROUP BY "estado"`,
        {
          replacements: {
            sucursalId,
            ...(restringidoAPropios ? { repartidorId: user.id } : {}),
          },
          type: QueryTypes.SELECT,
        },
      ),
    ]);

    const conteoPorEstado = Object.fromEntries(
      Object.values(EstadoPedidoDomicilio).map((est) => [est, 0]),
    );
    let pendientesLiquidarCount = 0;
    for (const row of resumenRows) {
      conteoPorEstado[row.estado] = Number(row.cantidad);
      pendientesLiquidarCount += Number(row.pendientes_liquidar ?? 0);
    }

    return {
      items: rows.map((p) => formatearPedido(p, user, false)),
      resumen: {
        porEstado: conteoPorEstado,
        activosCount: ESTADOS_ACTIVOS_DOMICILIO.reduce((acc, e) => acc + (conteoPorEstado[e] ?? 0), 0),
        pendientesLiquidarCount,
      },
      serverTime,
      meta: buildPaginationMeta(count, page, limit),
    };
  }

  static async obtenerDetalle(user, pedidoId) {
    const pedido = await PedidoDomicilio.findOne({
      where: { id: pedidoId, sucursalId: user.sucursalId },
      include: [
        ...INCLUDE_PEDIDO_LISTA,
        {
          model: PedidoDomicilioHistorial,
          as: 'historial',
          separate: true,
          order: [
            ['createdAt', 'ASC'],
            ['id', 'ASC'],
          ],
          include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombreCompleto'] }],
        },
      ],
    });

    if (!pedido) {
      throw new NotFoundError('Pedido a domicilio no encontrado');
    }

    if (soloVePropios(user) && Number(pedido.repartidorId) !== Number(user.id)) {
      throw new ForbiddenError('No tienes permiso para ver un pedido asignado a otro repartidor');
    }

    return formatearPedido(pedido, user, true);
  }

  /**
   * Crea un pedido a domicilio de forma idempotente y transaccional.
   * - PREPAGADO: reutiliza `CheckoutService.ejecutarVentaEnTransaccion` dentro de la misma transacción
   *   (venta + factura + comanda + movimiento de caja + descuento de inventario + auditoría).
   * - CONTRA_ENTREGA: valida stock solo lectura (advertencias), crea comanda sin venta y registra historial.
   */
  static async crearPedido(user, input, clientMeta) {
    const idempotencyKey = input.idempotencyKey;
    const huella = calcularHuellaCreacion(user.id, input);

    const buscarPrevio = async (transaction) => {
      const previo = await PedidoDomicilio.findOne({
        where: { sucursalId: user.sucursalId, idempotencyKey },
        include: INCLUDE_PEDIDO_LISTA,
        transaction,
      });
      if (!previo) return null;
      if (previo.idempotencyHuella !== huella) {
        throw new ConflictError('La clave de idempotencia ya fue utilizada para otro pedido a domicilio');
      }
      return { pedido: formatearPedido(previo, user, false), advertenciasStock: [], idempotente: true };
    };

    const yaExiste = await buscarPrevio();
    if (yaExiste) return yaExiste;

    // En PREPAGADO validamos autorización de cortesías ANTES de abrir la transacción (bcrypt)
    const cortesiaInput = input.cortesiaMotivo
      ? {
          motivo: input.cortesiaMotivo,
          autorizacion: input.autorizacionCortesia
            ? {
                identifier: input.autorizacionCortesia.identifier ?? input.autorizacionCortesia.username,
                password: input.autorizacionCortesia.password,
              }
            : undefined,
        }
      : undefined;
    const aprobadorCortesia = input.modalidadPago === ModalidadPagoDomicilio.PREPAGADO
      ? await CheckoutService.validarAutorizacionCortesiaPreTx(
          user,
          { items: input.items, cortesia: cortesiaInput },
          clientMeta,
        )
      : null;

    try {
      return await withTransaction(async (tx) => {
        const concurrente = await buscarPrevio(tx);
        if (concurrente) return concurrente;

        // 1. Validar zona activa y obtener snapshot de tarifa
        const zona = await ZonaEntrega.findOne({
          where: { id: input.zonaEntregaId, sucursalId: user.sucursalId },
          transaction: tx,
        });
        if (!zona || !zona.activa) {
          throw new BadRequestError('La zona de entrega seleccionada no existe o está inactiva');
        }

        // 2. Cotizar platillos (con menú especial activo) y validar stock solo lectura
        const { detallesPreparados, subtotalPlatillos, advertenciasStock } =
          await cotizarPlatillosYValidarStockLectura(tx, user.sucursalId, input.items);

        const pedidoMinimo = round2(Number(zona.pedidoMinimo));
        if (subtotalPlatillos < pedidoMinimo) {
          throw new BadRequestError(
            `El subtotal de platillos (Q ${subtotalPlatillos.toFixed(2)}) no alcanza el pedido mínimo de Q ${pedidoMinimo.toFixed(2)} para ${zona.nombre}`,
          );
        }

        const costoEnvio = round2(Number(zona.costoEnvio));
        const total = round2(subtotalPlatillos + costoEnvio);

        // 3. Resolver o crear cliente y dirección de entrega
        const { cliente, direccion } = await ClientesDomicilioService.resolverClienteYDireccionEnTx(
          tx,
          user.sucursalId,
          input,
        );

        // 4. Correlativo atómico de pedido a domicilio por sucursal
        const [corrPedido] = await sequelize.query(
          `UPDATE "sucursales"
           SET "correlativo_domicilio" = "correlativo_domicilio" + 1
           WHERE "id" = :sucursalId
           RETURNING "correlativo_domicilio" AS "correlativo"`,
          {
            replacements: { sucursalId: user.sucursalId },
            type: QueryTypes.SELECT,
            transaction: tx,
          },
        );
        const numeroPedido = `DOM-${String(corrPedido.correlativo).padStart(6, '0')}`;
        const metodoPagoEsperado = input.metodoPago ?? MetodoPago.EFECTIVO;
        const correlacionId = AuditService.crearCorrelacionId();

        // 5. Crear encabezado de pedido con snapshots inmutables
        const pedido = await PedidoDomicilio.create(
          {
            sucursalId: user.sucursalId,
            numeroPedido,
            clienteId: cliente.id,
            direccionEntregaId: direccion.id,
            zonaEntregaId: zona.id,
            creadoPorId: user.id,
            repartidorId: null,
            ventaId: null,
            estado: EstadoPedidoDomicilio.NUEVO,
            modalidadPago: input.modalidadPago,
            metodoPagoEsperado,
            subtotalPlatillos,
            costoEnvio,
            total,
            zonaNombreSnapshot: zona.nombre,
            tiempoEstimadoMin: Number(zona.tiempoEstimadoMin),
            direccionSnapshot: direccion.direccion,
            referenciaSnapshot: direccion.referencia ?? null,
            clienteNombreSnapshot: cliente.nombre,
            clienteTelefonoSnapshot: cliente.telefono,
            clienteNitSnapshot: cliente.nit?.trim() || 'CF',
            observaciones: input.observaciones?.trim() || null,
            montoConQuePaga:
              input.montoConQuePaga !== undefined && input.montoConQuePaga !== null
                ? round2(Number(input.montoConQuePaga))
                : null,
            idempotencyKey,
            idempotencyHuella: huella,
          },
          { transaction: tx },
        );

        await PedidoDomicilioDetalle.bulkCreate(
          detallesPreparados.map((d) => ({
            pedidoDomicilioId: pedido.id,
            ...d,
          })),
          { transaction: tx },
        );

        // 6. Historial inicial (NULL -> NUEVO)
        await PedidoDomicilioHistorial.create(
          {
            pedidoDomicilioId: pedido.id,
            sucursalId: user.sucursalId,
            estadoAnterior: null,
            estadoNuevo: EstadoPedidoDomicilio.NUEVO,
            usuarioId: user.id,
            observacion: `Pedido creado (${input.modalidadPago})`,
          },
          { transaction: tx },
        );

        // 7. Cobro inmediato (PREPAGADO) o comanda sin venta (CONTRA_ENTREGA)
        let ticket = null;
        let cajaSesionId = null;

        if (input.modalidadPago === ModalidadPagoDomicilio.PREPAGADO) {
          const checkoutRes = await CheckoutService.ejecutarVentaEnTransaccion(
            tx,
            user,
            {
              tipoServicio: TipoServicio.DELIVERY,
              metodoPago: metodoPagoEsperado,
              montoRecibido: input.montoRecibido ?? total,
              referenciaPago: input.referenciaPago ?? null,
              clienteNit: cliente.nit?.trim() || 'CF',
              clienteNombre: cliente.nombre,
              clienteDireccion: direccion.direccion,
              nombreTurno: `${numeroPedido} · ${cliente.nombre}`.slice(0, 80),
              observaciones: input.observaciones?.trim() || `Pedido a domicilio ${numeroPedido}`,
              cortesia: cortesiaInput,
              items: detallesPreparados.map((d) => ({
                platilloId: d.platilloId,
                cantidad: d.cantidad,
                cantidadCortesia: d.cantidadCortesia,
                precioUnitarioSnapshot: d.precioUnitario,
                notas: d.notas,
              })),
            },
            clientMeta,
            {
              aprobador: aprobadorCortesia,
              idempotencyKey,
              huella,
              costoEnvio,
              pedidoDomicilioId: pedido.id,
              zonaEntregaNombre: zona.nombre,
              direccionEntrega: direccion.direccion,
              referenciaEntrega: direccion.referencia ?? null,
              correlacionId,
            },
          );
          await pedido.update({ ventaId: checkoutRes.venta.id }, { transaction: tx });
          cajaSesionId = checkoutRes.cajaAbierta.id;
          ticket = {
            venta: checkoutRes.venta,
            factura: checkoutRes.factura,
            comanda: checkoutRes.comanda,
            sucursal: checkoutRes.sucursal,
          };
        } else {
          const [corrComanda] = await sequelize.query(
            `UPDATE "sucursales"
             SET "correlativo_comanda" = "correlativo_comanda" + 1
             WHERE "id" = :sucursalId
             RETURNING "correlativo_comanda" AS "correlativo"`,
            {
              replacements: { sucursalId: user.sucursalId },
              type: QueryTypes.SELECT,
              transaction: tx,
            },
          );
          const numeroComanda = `CMD-${String(corrComanda.correlativo).padStart(5, '0')}`;
          await Comanda.create(
            {
              sucursalId: user.sucursalId,
              ventaId: null,
              pedidoDomicilioId: pedido.id,
              numeroComanda,
              tipoServicio: TipoServicio.DELIVERY,
              mesaNumero: null,
              nombreTurno: `${numeroPedido} · ${cliente.nombre}`.slice(0, 80),
              costoEnvio,
              direccionEntrega: direccion.direccion,
              referenciaEntrega: direccion.referencia ?? null,
              zonaEntregaNombre: zona.nombre,
              estadoCocina: EstadoComanda.PENDIENTE,
            },
            { transaction: tx },
          );
          const cajaAbierta = await CajaSesion.findOne({
            where: { sucursalId: user.sucursalId, estado: EstadoCaja.ABIERTA },
            attributes: ['id'],
            transaction: tx,
          });
          cajaSesionId = cajaAbierta?.id ?? null;
        }

        // 8. Auditoría sin PII en claro (solo IDs y teléfono enmascarado)
        await AuditService.registrarEvento(
          {
            user,
            clientMeta,
            cajaSesionId,
            correlacionId,
          },
          {
            accion: ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_CREADO,
            entidad: 'PedidoDomicilio',
            entidadId: pedido.id,
            valorAnterior: null,
            valorNuevo: {
              numeroPedido,
              estado: EstadoPedidoDomicilio.NUEVO,
              modalidadPago: input.modalidadPago,
              metodoPagoEsperado,
              clienteId: cliente.id,
              telefonoMask: enmascararTelefono(cliente.telefono),
              direccionEntregaId: direccion.id,
              zonaEntregaId: zona.id,
              zonaNombre: zona.nombre,
              subtotalPlatillos,
              costoEnvio,
              total,
              ventaId: ticket?.venta?.id ?? null,
              cantidadItems: detallesPreparados.length,
            },
            motivo: `Creación de pedido a domicilio ${numeroPedido} (${input.modalidadPago})`,
            impactoFinanciero: input.modalidadPago === ModalidadPagoDomicilio.PREPAGADO ? total : 0,
          },
          tx,
        );

        const completo = await PedidoDomicilio.findByPk(pedido.id, {
          include: INCLUDE_PEDIDO_LISTA,
          transaction: tx,
        });

        return {
          pedido: formatearPedido(completo ?? pedido, user, false),
          advertenciasStock,
          ...(ticket ? { ticket } : {}),
        };
      });
    } catch (error) {
      if (getPgErrorCode(error) === '23505') {
        const previo = await buscarPrevio();
        if (previo) return previo;
      }
      throw error;
    }
  }

  /**
   * Asigna o reasigna un repartidor activo a un pedido antes de ser entregado/cerrado.
   */
  static async asignarRepartidor(user, pedidoId, repartidorId, clientMeta) {
    return withTransaction(async (tx) => {
      const pedido = await PedidoDomicilio.findOne({
        where: { id: pedidoId, sucursalId: user.sucursalId },
        lock: tx.LOCK.UPDATE,
        transaction: tx,
      });
      if (!pedido) {
        throw new NotFoundError('Pedido a domicilio no encontrado');
      }

      if (pedido.tipoEntrega === 'LLEVAR') {
        throw new BadRequestError('Los pedidos Para llevar se recogen en sucursal y no requieren repartidor');
      }

      if (!ESTADOS_ASIGNABLES_DOMICILIO.includes(pedido.estado)) {
        throw new ConflictError(
          `No se puede asignar repartidor a un pedido en estado ${pedido.estado}`,
        );
      }

      const repartidor = await Usuario.findOne({
        where: { id: repartidorId, sucursalId: user.sucursalId, activo: true },
        include: [{ model: Rol, as: 'rol', attributes: ['id', 'codigo', 'nombre', 'activo'] }],
        transaction: tx,
      });
      if (!repartidor || !repartidor.rol?.activo || repartidor.rol.codigo !== 'REPARTIDOR') {
        throw new BadRequestError('El usuario seleccionado no es un repartidor activo de esta sucursal');
      }

      const repartidorAnteriorId = pedido.repartidorId ?? null;
      await pedido.update(
        {
          repartidorId: repartidor.id,
          asignadoEn: new Date(),
        },
        { transaction: tx },
      );

      await AuditService.registrarEvento(
        { user, clientMeta },
        {
          accion: ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_ASIGNADO,
          entidad: 'PedidoDomicilio',
          entidadId: pedido.id,
          valorAnterior: {
            numeroPedido: pedido.numeroPedido,
            repartidorId: repartidorAnteriorId,
          },
          valorNuevo: {
            numeroPedido: pedido.numeroPedido,
            repartidorId: repartidor.id,
            repartidorUsername: repartidor.username,
            estado: pedido.estado,
          },
          motivo: `Asignación de repartidor ${repartidor.username} al pedido ${pedido.numeroPedido}`,
          impactoFinanciero: 0,
        },
        tx,
      );

      const actualizado = await PedidoDomicilio.findByPk(pedido.id, {
        include: INCLUDE_PEDIDO_LISTA,
        transaction: tx,
      });
      return formatearPedido(actualizado ?? pedido, user, false);
    });
  }

  /**
   * Ejecuta una transición de estado usando bloqueo optimista (`UPDATE ... WHERE estado = :anterior`),
   * sincronizando `comandas.estado_cocina`, `pedido_domicilio_historial`, anulación de factura PREPAGADO
   * (con autorización de supervisor + reintegro de stock), merma automática `PEDIDO_NO_ENTREGADO` y auditoría
   * en la misma transacción.
   */
  static async actualizarEstado(user, pedidoId, input, clientMeta) {
    const estadoNuevo = input.estadoNuevo;
    const motivo = input.motivo?.trim() || null;
    const esCancelado = estadoNuevo === EstadoPedidoDomicilio.CANCELADO;
    const esFallido = estadoNuevo === EstadoPedidoDomicilio.FALLIDO;

    // Lectura previa fuera de transacción para validar credenciales de supervisor (bcrypt) si es PREPAGADO
    let aprobadorAnulacion = null;
    if (esCancelado || esFallido) {
      const pedidoPrevio = await PedidoDomicilio.findOne({
        where: { id: pedidoId, sucursalId: user.sucursalId },
        include: [
          {
            model: Venta,
            as: 'venta',
            attributes: ['id'],
            include: [{ model: Factura, as: 'factura', attributes: ['id', 'estado'] }],
          },
        ],
      });
      if (!pedidoPrevio) {
        throw new NotFoundError('Pedido a domicilio no encontrado');
      }
      if (!esTransicionValida(pedidoPrevio.estado, estadoNuevo, pedidoPrevio.tipoEntrega)) {
        throw new ConflictError(
          `Transición inválida de ${pedidoPrevio.estado} a ${estadoNuevo} para el pedido ${pedidoPrevio.numeroPedido}`,
        );
      }
      validarPermisoTransicion(user, pedidoPrevio, estadoNuevo);
      if (!motivo || motivo.length < 5) {
        throw new BadRequestError(
          `Debes indicar un motivo de al menos 5 caracteres para marcar el pedido como ${estadoNuevo}`,
        );
      }
      if (
        pedidoPrevio.modalidadPago === ModalidadPagoDomicilio.PREPAGADO
        && pedidoPrevio.venta?.factura?.estado === EstadoFactura.EMITIDA
      ) {
        aprobadorAnulacion = await verificarAutorizacionAnulacionDomicilio(
          user,
          input.autorizacionSupervisor,
          clientMeta,
        );
      }
    }

    return withTransaction(async (tx) => {
      const pedido = await PedidoDomicilio.findOne({
        where: { id: pedidoId, sucursalId: user.sucursalId },
        include: [
          { model: Comanda, as: 'comanda' },
          {
            model: Venta,
            as: 'venta',
            attributes: ['id'],
            include: [{ model: Factura, as: 'factura', attributes: ['id', 'numeroCompleto', 'estado', 'total'] }],
          },
        ],
        transaction: tx,
      });
      if (!pedido) {
        throw new NotFoundError('Pedido a domicilio no encontrado');
      }

      const estadoAnterior = pedido.estado;
      if (!esTransicionValida(estadoAnterior, estadoNuevo, pedido.tipoEntrega)) {
        throw new ConflictError(
          `Transición inválida de ${estadoAnterior} a ${estadoNuevo} para el pedido ${pedido.numeroPedido}`,
        );
      }

      // Validar permisos granulares según rol (ADMIN, CAJERO, CHEF, REPARTIDOR)
      validarPermisoTransicion(user, pedido, estadoNuevo);

      // Asignación opcional de repartidor al marcar salida (EN_RUTA); no es obligatoria para despachar
      let repartidorFinalId = pedido.repartidorId;
      if (
        estadoNuevo === EstadoPedidoDomicilio.EN_RUTA
        && !repartidorFinalId
        && input.repartidorId
        && user.permisos.includes('domicilios:asignar')
      ) {
        const repartidor = await Usuario.findOne({
          where: { id: input.repartidorId, sucursalId: user.sucursalId, activo: true },
          include: [{ model: Rol, as: 'rol', where: { codigo: 'REPARTIDOR', activo: true } }],
          transaction: tx,
        });
        if (!repartidor) {
          throw new BadRequestError('El repartidor indicado no es válido o está inactivo');
        }
        repartidorFinalId = repartidor.id;
      }

      if ((esCancelado || esFallido) && (!motivo || motivo.length < 5)) {
        throw new BadRequestError(
          `Debes indicar un motivo de al menos 5 caracteres para marcar el pedido como ${estadoNuevo}`,
        );
      }

      const ahora = new Date();
      const correlacionId = AuditService.crearCorrelacionId();
      const necesitaMerma = requiereMermaAlCerrar(estadoAnterior, estadoNuevo);
      let facturaAnulada = false;
      let mermaGenerada = false;
      let costoMermasTotal = 0;

      // Bloqueo optimista estricto: garantiza que nadie cambió el estado concurrentemente
      const camposUpdate = {
        estado: estadoNuevo,
        ...(repartidorFinalId !== pedido.repartidorId
          ? { repartidorId: repartidorFinalId, asignadoEn: ahora }
          : {}),
        ...(estadoNuevo === EstadoPedidoDomicilio.EN_RUTA ? { despachadoEn: ahora } : {}),
        ...(estadoNuevo === EstadoPedidoDomicilio.ENTREGADO ? { entregadoEn: ahora } : {}),
        ...(esCancelado ? { canceladoEn: ahora, motivoCierre: motivo } : {}),
        ...(esFallido ? { fallidoEn: ahora, motivoCierre: motivo } : {}),
      };

      const [affectedCount] = await PedidoDomicilio.update(camposUpdate, {
        where: {
          id: pedido.id,
          sucursalId: user.sucursalId,
          estado: estadoAnterior,
        },
        transaction: tx,
      });

      if (affectedCount === 0) {
        throw new ConflictError(
          'El estado del pedido cambió por otra operación simultánea. Actualiza el tablero e intenta de nuevo.',
        );
      }

      // Flujo PREPAGADO en CANCELADO o FALLIDO: anular factura reintegrando inventario antes de generar merma
      if (
        (esCancelado || esFallido)
        && pedido.modalidadPago === ModalidadPagoDomicilio.PREPAGADO
        && pedido.venta?.factura?.estado === EstadoFactura.EMITIDA
      ) {
        await FacturasService.anularEnTransaccion(
          tx,
          user,
          pedido.venta.factura.id,
          {
            motivo: `Pedido domicilio ${pedido.numeroPedido} (${estadoNuevo}): ${motivo}`.slice(0, 300),
            codigoMotivo: CODIGOS_MOTIVO_AUDITORIA.PEDIDO_NO_ENTREGADO,
            reintegrarInventario: true,
          },
          clientMeta,
          {
            correlacionId,
            aprobadorId: aprobadorAnulacion && !aprobadorAnulacion.autoAutorizado
              ? aprobadorAnulacion.id
              : null,
          },
        );
        facturaAnulada = true;
      }

      // Merma automática según receta (CANCELADO tras preparación o FALLIDO): efecto neto = -1 receta
      if ((esCancelado || esFallido) && necesitaMerma) {
        const resMerma = await MermasService.registrarMermasPorPedidoDomicilioEnTx(
          tx,
          user,
          pedido,
          motivo,
          clientMeta,
          { correlacionId },
        );
        mermaGenerada = resMerma.cantidadMermas > 0;
        costoMermasTotal = resMerma.costoTotalMermas;
      }

      if (facturaAnulada || mermaGenerada) {
        await PedidoDomicilio.update(
          { facturaAnuladaCierre: facturaAnulada, mermaGenerada },
          { where: { id: pedido.id, sucursalId: user.sucursalId }, transaction: tx },
        );
      }

      // Sincronizar `comandas.estado_cocina` (o crear la comanda al confirmar un pedido WEB que entra a cocina)
      const nuevoEstadoComanda = mapearEstadoComanda(estadoNuevo);
      if (nuevoEstadoComanda && pedido.comanda) {
        await Comanda.update(
          { estadoCocina: nuevoEstadoComanda },
          { where: { id: pedido.comanda.id, sucursalId: user.sucursalId }, transaction: tx },
        );
      } else if (
        estadoNuevo === EstadoPedidoDomicilio.EN_PREPARACION
        && !pedido.comanda
      ) {
        const [corrComanda] = await sequelize.query(
          `UPDATE "sucursales"
           SET "correlativo_comanda" = "correlativo_comanda" + 1
           WHERE "id" = :sucursalId
           RETURNING "correlativo_comanda" AS "correlativo"`,
          {
            replacements: { sucursalId: user.sucursalId },
            type: QueryTypes.SELECT,
            transaction: tx,
          },
        );
        const numeroComanda = `CMD-${String(corrComanda.correlativo).padStart(5, '0')}`;
        await Comanda.create(
          {
            sucursalId: user.sucursalId,
            ventaId: pedido.ventaId ?? null,
            pedidoDomicilioId: pedido.id,
            numeroComanda,
            tipoServicio: pedido.tipoEntrega === 'LLEVAR' ? TipoServicio.LLEVAR : TipoServicio.DELIVERY,
            mesaNumero: null,
            nombreTurno: `${pedido.numeroPedido} · ${pedido.clienteNombreSnapshot}`.slice(0, 80),
            costoEnvio: round2(Number(pedido.costoEnvio ?? 0)),
            direccionEntrega: pedido.tipoEntrega === 'LLEVAR' ? null : pedido.direccionSnapshot,
            referenciaEntrega: pedido.tipoEntrega === 'LLEVAR' ? null : pedido.referenciaSnapshot,
            zonaEntregaNombre: pedido.tipoEntrega === 'LLEVAR' ? null : pedido.zonaNombreSnapshot,
            estadoCocina: EstadoComanda.EN_PREPARACION,
          },
          { transaction: tx },
        );
      }

      // Registrar en historial inmutable dentro de la misma transacción
      await PedidoDomicilioHistorial.create(
        {
          pedidoDomicilioId: pedido.id,
          sucursalId: user.sucursalId,
          estadoAnterior,
          estadoNuevo,
          usuarioId: user.id,
          observacion: motivo || `Cambio de estado a ${estadoNuevo}`,
        },
        { transaction: tx },
      );

      // Determinar acción y metadatos de auditoría sin exponer PII
      const accionAuditoria = esCancelado
        ? ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_CANCELADO
        : esFallido
          ? ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_FALLIDO
          : ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_ESTADO;

      const codigoMotivo = esCancelado || esFallido
        ? normalizarCodigoMotivo(input.codigoMotivo, CODIGOS_MOTIVO_AUDITORIA.PEDIDO_NO_ENTREGADO)
        : null;

      const cajaAbierta = await CajaSesion.findOne({
        where: { sucursalId: user.sucursalId, estado: EstadoCaja.ABIERTA },
        attributes: ['id'],
        transaction: tx,
      });

      await AuditService.registrarEvento(
        {
          user,
          clientMeta,
          cajaSesionId: cajaAbierta?.id ?? null,
          aprobadorId: aprobadorAnulacion && !aprobadorAnulacion.autoAutorizado
            ? aprobadorAnulacion.id
            : null,
          correlacionId,
        },
        {
          accion: accionAuditoria,
          entidad: 'PedidoDomicilio',
          entidadId: pedido.id,
          valorAnterior: {
            numeroPedido: pedido.numeroPedido,
            estado: estadoAnterior,
            repartidorId: pedido.repartidorId ?? null,
          },
          valorNuevo: {
            numeroPedido: pedido.numeroPedido,
            estado: estadoNuevo,
            repartidorId: repartidorFinalId ?? null,
            estadoComanda: nuevoEstadoComanda,
            mermaGenerada,
            costoMermasTotal,
            facturaAnulada,
          },
          codigoMotivo,
          motivo: motivo || `Transición ${estadoAnterior} → ${estadoNuevo} en ${pedido.numeroPedido}`,
          impactoFinanciero: costoMermasTotal > 0 ? round2(-costoMermasTotal) : 0,
        },
        tx,
      );

      const actualizado = await PedidoDomicilio.findByPk(pedido.id, {
        include: [
          ...INCLUDE_PEDIDO_LISTA,
          {
            model: PedidoDomicilioHistorial,
            as: 'historial',
            separate: true,
            order: [
              ['createdAt', 'ASC'],
              ['id', 'ASC'],
            ],
            include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombreCompleto'] }],
          },
        ],
        transaction: tx,
      });

      return formatearPedido(actualizado ?? pedido, user, true);
    });
  }

  /**
   * Liquida un pedido CONTRA_ENTREGA ya ENTREGADO (sin venta asociada), de forma idempotente y atómica:
   * - Ejecuta el núcleo `CheckoutService.ejecutarVentaEnTransaccion` reutilizando la comanda existente.
   * - Si en efectivo `montoRecibidoRepartidor !== total`, registra movimiento automático de diferencia
   *   de repartidor en caja (manteniendo el cierre exacto en gaveta) y audita según `AUDIT_DIFERENCIA_CAJA_ALTA_Q`.
   */
  static async liquidarPedido(user, pedidoId, input, clientMeta) {
    const idempotencyKey = input.idempotencyKey;
    const huella = createHash('sha256')
      .update(
        JSON.stringify({
          pedidoId,
          metodoPago: input.metodoPago,
          montoRecibidoRepartidor:
            input.metodoPago === MetodoPago.EFECTIVO && input.montoRecibidoRepartidor !== undefined
              ? round2(Number(input.montoRecibidoRepartidor))
              : null,
          referenciaPago: input.referenciaPago?.trim() || null,
        }),
      )
      .digest('hex');

    const buscarLiquidacionPrevia = async (transaction) => {
      const previo = await PedidoDomicilio.findOne({
        where: { sucursalId: user.sucursalId, liquidacionIdempotencyKey: idempotencyKey },
        include: INCLUDE_PEDIDO_LISTA,
        transaction,
      });
      if (!previo) return null;
      if (previo.liquidacionIdempotencyHuella !== huella || previo.id !== pedidoId) {
        throw new ConflictError(
          'La clave de idempotencia de liquidación ya fue usada para otra operación',
        );
      }
      return {
        pedido: formatearPedido(previo, user, false),
        diferenciaLiquidacion: round2(Number(previo.diferenciaLiquidacion ?? 0)),
        idempotente: true,
      };
    };

    const previa = await buscarLiquidacionPrevia();
    if (previa) return previa;

    try {
      return await withTransaction(async (tx) => {
        const concurrente = await buscarLiquidacionPrevia(tx);
        if (concurrente) return concurrente;

        // Bloqueo pesimista sobre el pedido para impedir doble liquidación concurrente
        const pedido = await PedidoDomicilio.findOne({
          where: { id: pedidoId, sucursalId: user.sucursalId },
          lock: tx.LOCK.UPDATE,
          transaction: tx,
        });
        if (!pedido) {
          throw new NotFoundError('Pedido a domicilio no encontrado');
        }
        if (pedido.modalidadPago !== ModalidadPagoDomicilio.CONTRA_ENTREGA) {
          throw new BadRequestError('Solo los pedidos CONTRA_ENTREGA requieren liquidación en caja');
        }
        if (pedido.ventaId) {
          throw new ConflictError(`El pedido ${pedido.numeroPedido} ya fue liquidado anteriormente`);
        }
        if (pedido.estado !== EstadoPedidoDomicilio.ENTREGADO) {
          throw new ConflictError(
            `El pedido ${pedido.numeroPedido} debe estar en estado ENTREGADO para liquidarse (estado actual: ${pedido.estado})`,
          );
        }

        const [detalles, comandaExistente] = await Promise.all([
          PedidoDomicilioDetalle.findAll({
            where: { pedidoDomicilioId: pedido.id },
            order: [['id', 'ASC']],
            transaction: tx,
          }),
          Comanda.findOne({
            where: { pedidoDomicilioId: pedido.id, sucursalId: user.sucursalId },
            lock: tx.LOCK.UPDATE,
            transaction: tx,
          }),
        ]);

        const totalPedido = round2(Number(pedido.total));
        const costoEnvio = round2(Number(pedido.costoEnvio));
        const metodoPago = input.metodoPago;

        let montoRecibidoRepartidor = totalPedido;
        if (metodoPago === MetodoPago.EFECTIVO) {
          montoRecibidoRepartidor = round2(Number(input.montoRecibidoRepartidor ?? totalPedido));
        } else if (metodoPago === MetodoPago.TARJETA && !input.referenciaPago?.trim()) {
          throw new BadRequestError('Ingresa la referencia o número de voucher para liquidar con tarjeta');
        }

        const diferenciaLiquidacion = metodoPago === MetodoPago.EFECTIVO
          ? round2(montoRecibidoRepartidor - totalPedido)
          : 0;

        if (diferenciaLiquidacion !== 0 && (!input.observaciones?.trim() || input.observaciones.trim().length < 5)) {
          throw new BadRequestError(
            `Existe una diferencia de Q ${diferenciaLiquidacion.toFixed(2)} con el repartidor. Ingresa una observación de al menos 5 caracteres.`,
          );
        }

        const correlacionId = AuditService.crearCorrelacionId();

        // Ejecutar venta completa (factura, vínculo a comanda existente, caja e inventario)
        const esParaLlevar = pedido.tipoEntrega === 'LLEVAR';
        const checkoutRes = await CheckoutService.ejecutarVentaEnTransaccion(
          tx,
          user,
          {
            tipoServicio: esParaLlevar ? TipoServicio.LLEVAR : TipoServicio.DELIVERY,
            metodoPago,
            montoRecibido: montoRecibidoRepartidor,
            referenciaPago: input.referenciaPago?.trim() || null,
            clienteNit: pedido.clienteNitSnapshot || 'CF',
            clienteNombre: pedido.clienteNombreSnapshot,
            clienteDireccion: esParaLlevar ? 'Recoger en sucursal' : pedido.direccionSnapshot,
            nombreTurno: `${pedido.numeroPedido} · ${pedido.clienteNombreSnapshot}`.slice(0, 80),
            observaciones:
              input.observaciones?.trim() || `Liquidación ${esParaLlevar ? 'para llevar' : 'contra entrega'} ${pedido.numeroPedido}`,
            items: detalles.map((d) => ({
              platilloId: d.platilloId,
              cantidad: Number(d.cantidad),
              cantidadCortesia: Number(d.cantidadCortesia ?? 0),
              precioUnitarioSnapshot: Number(d.precioUnitario),
              notas: d.notas,
            })),
          },
          clientMeta,
          {
            idempotencyKey,
            huella,
            costoEnvio: esParaLlevar ? 0 : costoEnvio,
            pedidoDomicilioId: pedido.id,
            comandaExistente,
            zonaEntregaNombre: esParaLlevar ? null : pedido.zonaNombreSnapshot,
            direccionEntrega: esParaLlevar ? null : pedido.direccionSnapshot,
            referenciaEntrega: esParaLlevar ? null : pedido.referenciaSnapshot,
            correlacionId,
            permitirEfectivoMenorEnLiquidacion: true,
          },
        );

        // Conciliación automática de diferencia de efectivo del repartidor para preservar el cierre exacto
        if (diferenciaLiquidacion < 0) {
          const faltante = round2(Math.abs(diferenciaLiquidacion));
          await CajaMovimiento.create(
            {
              sucursalId: user.sucursalId,
              cajaSesionId: checkoutRes.cajaAbierta.id,
              usuarioId: user.id,
              ventaId: checkoutRes.venta.id,
              tipo: TipoMovimientoCaja.EGRESO_DIFERENCIA_REPARTIDOR,
              metodoPago: MetodoPago.EFECTIVO,
              monto: faltante,
              descripcion: `Faltante de repartidor en ${pedido.numeroPedido}: ${input.observaciones.trim()}`.slice(0, 250),
            },
            { transaction: tx },
          );
          await checkoutRes.cajaAbierta.increment('totalEgresos', { by: faltante, transaction: tx });
        } else if (diferenciaLiquidacion > 0) {
          await CajaMovimiento.create(
            {
              sucursalId: user.sucursalId,
              cajaSesionId: checkoutRes.cajaAbierta.id,
              usuarioId: user.id,
              ventaId: checkoutRes.venta.id,
              tipo: TipoMovimientoCaja.INGRESO_DIFERENCIA_REPARTIDOR,
              metodoPago: MetodoPago.EFECTIVO,
              monto: diferenciaLiquidacion,
              descripcion: `Excedente de repartidor en ${pedido.numeroPedido}: ${input.observaciones.trim()}`.slice(0, 250),
            },
            { transaction: tx },
          );
          await checkoutRes.cajaAbierta.increment('totalIngresosExtra', {
            by: diferenciaLiquidacion,
            transaction: tx,
          });
        }

        await pedido.update(
          {
            ventaId: checkoutRes.venta.id,
            montoRecibidoRepartidor,
            diferenciaLiquidacion,
            referenciaPagoLiquidacion: input.referenciaPago?.trim() || null,
            liquidadoPorId: user.id,
            liquidadoEn: new Date(),
            liquidacionIdempotencyKey: idempotencyKey,
            liquidacionIdempotencyHuella: huella,
          },
          { transaction: tx },
        );

        await AuditService.registrarEvento(
          {
            user,
            clientMeta,
            cajaSesionId: checkoutRes.cajaAbierta.id,
            correlacionId,
          },
          {
            accion: ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_LIQUIDADO,
            entidad: 'PedidoDomicilio',
            entidadId: pedido.id,
            valorAnterior: {
              numeroPedido: pedido.numeroPedido,
              ventaId: null,
              pendienteLiquidar: true,
            },
            valorNuevo: {
              numeroPedido: pedido.numeroPedido,
              ventaId: checkoutRes.venta.id,
              factura: checkoutRes.factura.numeroCompleto,
              repartidorId: pedido.repartidorId ?? null,
              metodoPago,
              totalEsperado: totalPedido,
              montoRecibidoRepartidor,
              diferenciaLiquidacion,
            },
            codigoMotivo: diferenciaLiquidacion !== 0
              ? CODIGOS_MOTIVO_AUDITORIA.DIFERENCIA_DE_CAJA
              : null,
            motivo:
              input.observaciones?.trim()
              || (diferenciaLiquidacion !== 0
                ? `Liquidación ${pedido.numeroPedido} con diferencia de Q ${diferenciaLiquidacion.toFixed(2)}`
                : `Liquidación exacta de pedido ${pedido.numeroPedido}`),
            impactoFinanciero: diferenciaLiquidacion,
            diferencia: diferenciaLiquidacion,
          },
          tx,
        );

        const actualizado = await PedidoDomicilio.findByPk(pedido.id, {
          include: INCLUDE_PEDIDO_LISTA,
          transaction: tx,
        });

        return {
          pedido: formatearPedido(actualizado ?? pedido, user, false),
          diferenciaLiquidacion,
          ticket: {
            venta: checkoutRes.venta,
            factura: checkoutRes.factura,
            comanda: checkoutRes.comanda,
            sucursal: checkoutRes.sucursal,
          },
        };
      });
    } catch (error) {
      if (getPgErrorCode(error) === '23505') {
        const yaLiquidado = await buscarLiquidacionPrevia();
        if (yaLiquidado) return yaLiquidado;
      }
      throw error;
    }
  }
}

module.exports = {
  DomiciliosService,
  INCLUDE_PEDIDO_LISTA,
  formatearPedido,
  calcularHuellaCreacion,
  cotizarPlatillosYValidarStockLectura,
};
