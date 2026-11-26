const { createHash, randomBytes } = require('node:crypto');
const { Op, QueryTypes } = require('sequelize');
const { ACCIONES_AUDITORIA } = require('../config/constants');
const { getPgErrorCode, sequelize, withTransaction } = require('../config/database');
const { env } = require('../config/env');
const {
  Categoria,
  Cliente,
  DireccionEntrega,
  EstadoPedidoDomicilio,
  MenuEspecial,
  MenuEspecialPlatillo,
  MetodoPago,
  ModalidadPagoDomicilio,
  PedidoDomicilio,
  PedidoDomicilioDetalle,
  PedidoDomicilioHistorial,
  Platillo,
  Sucursal,
  ZonaEntrega,
} = require('../models');
const {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
} = require('../shared/errors/AppError');
const { AuditService } = require('../shared/services/audit.service');
const { patronContiene } = require('../shared/utils/busqueda');
const { normalizarTelefono } = require('../shared/utils/privacidadDomicilio');
const { round2 } = require('../shared/utils/tax');
const { cotizarPlatillosYValidarStockLectura } = require('./domicilios.service');
const {
  ESTADOS_TERMINALES_DOMICILIO,
  calcularVencimientoTracking,
} = require('./domicilios-estados');
const {
  ORDEN_PRECEDENCIA_MENU_ESPECIAL,
  evaluarEstadoMenuEspecial,
} = require('./menu.service');

/**
 * Resuelve la sucursal activa por código (insensible a mayúsculas) o toma la primera activa.
 */
async function resolverSucursalPublica(codigoSucursal, transaction) {
  const codigoLimpio = codigoSucursal?.trim();
  const sucursal = codigoLimpio
    ? await Sucursal.findOne({
        where: { codigo: { [Op.iLike]: codigoLimpio }, activa: true },
        attributes: ['id', 'codigo', 'nombre', 'direccion', 'telefono'],
        transaction,
      })
    : await Sucursal.findOne({
        where: { activa: true },
        attributes: ['id', 'codigo', 'nombre', 'direccion', 'telefono'],
        order: [['id', 'ASC']],
        transaction,
      });

  if (!sucursal) {
    throw new NotFoundError('No se encontró una sucursal disponible para pedidos en línea');
  }
  return sucursal;
}

let ultimaPurgaTrackingMs = 0;
const INTERVALO_PURGA_TRACKING_MS = 60 * 60 * 1000; // Máximo 1 purga ligera por hora

/**
 * Limpieza periódica no bloqueante: pone `tracking_token = NULL` en pedidos vencidos
 * para liberar espacio del índice parcial único sin borrar el historial contable.
 */
function purgarTokensTrackingVencidosSiCorresponde() {
  const ahoraMs = Date.now();
  if (ahoraMs - ultimaPurgaTrackingMs < INTERVALO_PURGA_TRACKING_MS) return;
  ultimaPurgaTrackingMs = ahoraMs;

  const ttlHoras = env.DELIVERY_TRACKING_TTL_HORAS;
  const maxActivoHoras = Math.max(ttlHoras * 2, 48);
  const limiteTerminal = new Date(ahoraMs - ttlHoras * 60 * 60 * 1000);
  const limiteActivo = new Date(ahoraMs - maxActivoHoras * 60 * 60 * 1000);

  PedidoDomicilio.update(
    { trackingToken: null },
    {
      where: {
        trackingToken: { [Op.ne]: null },
        [Op.or]: [
          {
            estado: { [Op.in]: ESTADOS_TERMINALES_DOMICILIO },
            [Op.or]: [
              { entregadoEn: { [Op.lt]: limiteTerminal } },
              { canceladoEn: { [Op.lt]: limiteTerminal } },
              { fallidoEn: { [Op.lt]: limiteTerminal } },
              { updatedAt: { [Op.lt]: limiteTerminal } },
            ],
          },
          {
            createdAt: { [Op.lt]: limiteActivo },
          },
        ],
      },
    },
  ).catch(() => {
    // Limpieza oportunista: si falla por concurrencia se reintenta en el próximo ciclo
  });
}

/**
 * Formatea la respuesta pública de seguimiento sin exponer PII (ni teléfono ni dirección en claro)
 * ni información interna de empleados.
 */
function formatearSeguimientoPublico(pedido, sucursal) {
  const plain = typeof pedido.get === 'function' ? pedido.get({ plain: true }) : pedido;
  const primerNombre = String(plain.clienteNombreSnapshot || 'Cliente').trim().split(/\s+/)[0];
  const { expiraEn } = calcularVencimientoTracking(plain, new Date(), env.DELIVERY_TRACKING_TTL_HORAS);

  return {
    trackingToken: plain.trackingToken,
    trackingExpiraEn: expiraEn,
    trackingTtlHoras: env.DELIVERY_TRACKING_TTL_HORAS,
    numeroPedido: plain.numeroPedido,
    tipoEntrega: plain.tipoEntrega || 'DELIVERY',
    origen: plain.origen || 'WEB',
    estado: plain.estado,
    modalidadPago: plain.modalidadPago,
    metodoPagoEsperado: plain.metodoPagoEsperado,
    clientePrimerNombre: primerNombre,
    zonaNombre: plain.tipoEntrega === 'LLEVAR' ? 'Para llevar (Recoger en sucursal)' : plain.zonaNombreSnapshot,
    tiempoEstimadoMin: Number(plain.tiempoEstimadoMin ?? 20),
    subtotalPlatillos: round2(Number(plain.subtotalPlatillos)),
    costoEnvio: round2(Number(plain.costoEnvio ?? 0)),
    total: round2(Number(plain.total)),
    observaciones: plain.observaciones ?? null,
    motivoCierre: plain.motivoCierre ?? null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    entregadoEn: plain.entregadoEn ?? null,
    sucursal: sucursal
      ? {
          codigo: sucursal.codigo,
          nombre: sucursal.nombre,
          direccion: sucursal.direccion ?? null,
          telefono: sucursal.telefono ?? null,
        }
      : null,
    detalles: (plain.detalles ?? []).map((d) => ({
      id: d.id,
      nombrePlatillo: d.nombrePlatillo,
      cantidad: Number(d.cantidad),
      precioUnitario: round2(Number(d.precioUnitario)),
      subtotal: round2(Number(d.subtotal)),
      notas: d.notas ?? null,
    })),
    historial: (plain.historial ?? []).map((h) => ({
      estado: h.estadoNuevo,
      createdAt: h.createdAt,
    })),
  };
}

function calcularHuellaPublica(sucursalId, input) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        sucursalId,
        tipoEntrega: input.tipoEntrega,
        zonaEntregaId: input.zonaEntregaId ?? null,
        telefono: normalizarTelefono(input.cliente?.telefono ?? ''),
        direccion: input.direccion?.trim() || null,
        metodoPagoEsperado: input.metodoPagoEsperado ?? MetodoPago.EFECTIVO,
        items: (input.items ?? []).map((i) => ({
          platilloId: i.platilloId,
          cantidad: i.cantidad,
          notas: i.notas?.trim() || null,
        })),
      }),
    )
    .digest('hex');
}

/**
 * Servicio del portal público de pedidos (clientes finales sin autenticación de empleado).
 * - Nunca expone costos de receta, stock real, usuarios ni pedidos de terceros.
 * - Siempre recalcula precios desde la base de datos (incluyendo menú especial vigente).
 * - Los pedidos caen al tablero del POS principal en estado NUEVO con origen='WEB' para
 *   confirmación del cajero antes de generar comanda en cocina.
 */
class PublicPedidosService {
  static async listarSucursales() {
    const sucursales = await Sucursal.findAll({
      where: { activa: true },
      attributes: ['id', 'codigo', 'nombre', 'direccion', 'telefono'],
      order: [['id', 'ASC']],
    });
    return sucursales.map((s) => s.get({ plain: true }));
  }

  static async obtenerMenuPublico(codigoSucursal, search, categoriaId) {
    const sucursal = await resolverSucursalPublica(codigoSucursal);
    const sucursalId = sucursal.id;

    const platilloWhere = {
      sucursalId,
      activo: true,
      disponible: true,
      ...(categoriaId ? { categoriaId } : {}),
      ...(search
        ? {
            [Op.or]: [
              { nombre: { [Op.iLike]: patronContiene(search) } },
              { descripcion: { [Op.iLike]: patronContiene(search) } },
            ],
          }
        : {}),
    };

    const [categorias, platillos, zonas, menusEspeciales] = await Promise.all([
      Categoria.findAll({
        where: {
          activa: true,
          [Op.or]: [{ sucursalId }, { sucursalId: null }],
        },
        attributes: ['id', 'nombre', 'orden'],
        order: [
          ['orden', 'ASC'],
          ['nombre', 'ASC'],
        ],
      }),
      Platillo.findAll({
        where: platilloWhere,
        attributes: ['id', 'categoriaId', 'sku', 'nombre', 'descripcion', 'imagenUrl', 'precioVenta', 'disponible'],
        include: [{ model: Categoria, as: 'categoria', attributes: ['id', 'nombre', 'orden'] }],
        order: [
          [{ model: Categoria, as: 'categoria' }, 'orden', 'ASC'],
          ['nombre', 'ASC'],
        ],
      }),
      ZonaEntrega.findAll({
        where: { sucursalId, activa: true },
        attributes: ['id', 'nombre', 'descripcion', 'costoEnvio', 'tiempoEstimadoMin', 'pedidoMinimo'],
        order: [['nombre', 'ASC']],
      }),
      MenuEspecial.findAll({
        where: { sucursalId, activo: true },
        order: ORDEN_PRECEDENCIA_MENU_ESPECIAL,
        include: [
          {
            model: MenuEspecialPlatillo,
            as: 'platillos',
            attributes: ['platilloId', 'precioEspecial'],
          },
        ],
      }),
    ]);

    const menuEspecialActivo =
      menusEspeciales.find((m) => evaluarEstadoMenuEspecial(m).estado === 'ACTIVO_HOY') ?? null;

    const mapaEspecialHoy = new Map();
    if (menuEspecialActivo) {
      for (const mp of menuEspecialActivo.platillos ?? []) {
        mapaEspecialHoy.set(mp.platilloId, {
          precioEspecial: mp.precioEspecial !== null ? Number(mp.precioEspecial) : null,
        });
      }
    }

    const platillosPublicos = platillos
      .map((p) => {
        const especial = mapaEspecialHoy.get(p.id);
        const precioBase = Number(p.precioVenta);
        const precioVigente = precioBase >= 0.01 ? (especial?.precioEspecial ?? precioBase) : 0;
        if (precioVigente < 0.01) return null;

        return {
          id: p.id,
          categoriaId: p.categoriaId,
          categoriaNombre: p.categoria?.nombre ?? 'General',
          sku: p.sku,
          nombre: p.nombre,
          descripcion: p.descripcion ?? null,
          imagenUrl: p.imagenUrl ?? null,
          precioVenta: round2(precioVigente),
          esEspecialHoy: Boolean(especial),
        };
      })
      .filter(Boolean);

    // Filtrar categorías que realmente tienen al menos un platillo visible cuando no hay búsqueda
    const categoriasConPlatillos = new Set(platillosPublicos.map((p) => p.categoriaId));
    const categoriasVisibles = search
      ? categorias.map((c) => c.get({ plain: true }))
      : categorias
          .filter((c) => categoriasConPlatillos.has(c.id))
          .map((c) => c.get({ plain: true }));

    return {
      sucursal: {
        codigo: sucursal.codigo,
        nombre: sucursal.nombre,
        direccion: sucursal.direccion ?? null,
        telefono: sucursal.telefono ?? null,
      },
      menuEspecialActivo: menuEspecialActivo
        ? {
            nombre: menuEspecialActivo.nombre,
            descripcion: menuEspecialActivo.descripcion ?? null,
          }
        : null,
      categorias: categoriasVisibles,
      platillos: platillosPublicos,
      zonas: zonas.map((z) => ({
        id: z.id,
        nombre: z.nombre,
        descripcion: z.descripcion ?? null,
        costoEnvio: round2(Number(z.costoEnvio)),
        tiempoEstimadoMin: Number(z.tiempoEstimadoMin),
        pedidoMinimo: round2(Number(z.pedidoMinimo)),
      })),
    };
  }

  static async crearPedidoPublico(input, clientMeta) {
    const sucursal = await resolverSucursalPublica(input.codigoSucursal);
    const sucursalId = sucursal.id;
    const idempotencyKey = input.idempotencyKey;
    const huella = calcularHuellaPublica(sucursalId, input);

    const buscarPrevio = async (transaction) => {
      const previo = await PedidoDomicilio.findOne({
        where: { sucursalId, idempotencyKey },
        include: [
          { model: PedidoDomicilioDetalle, as: 'detalles', separate: true, order: [['id', 'ASC']] },
          { model: PedidoDomicilioHistorial, as: 'historial', separate: true, order: [['createdAt', 'ASC']] },
        ],
        transaction,
      });
      if (!previo) return null;
      if (previo.idempotencyHuella !== huella) {
        throw new ConflictError('La clave de pedido ya fue utilizada con datos diferentes. Intenta nuevamente.');
      }
      return formatearSeguimientoPublico(previo, sucursal);
    };

    const yaExiste = await buscarPrevio();
    if (yaExiste) return yaExiste;

    const esDelivery = input.tipoEntrega === 'DELIVERY';
    const telefonoNorm = normalizarTelefono(input.cliente.telefono);
    if (telefonoNorm.length < 8) {
      throw new BadRequestError('Ingresa un número de teléfono válido de al menos 8 dígitos');
    }

    try {
      return await withTransaction(async (tx) => {
        const concurrente = await buscarPrevio(tx);
        if (concurrente) return concurrente;

        // 1. Si es domicilio, validar zona activa de la sucursal
        let zona = null;
        if (esDelivery) {
          zona = await ZonaEntrega.findOne({
            where: { id: input.zonaEntregaId, sucursalId, activa: true },
            transaction: tx,
          });
          if (!zona) {
            throw new BadRequestError('La zona de entrega seleccionada no está disponible en este momento');
          }
        }

        // 2. Cotizar platillos desde BD (ignora cualquier precio del cliente; respeta menú especial vigente)
        const { detallesPreparados, subtotalPlatillos } = await cotizarPlatillosYValidarStockLectura(
          tx,
          sucursalId,
          input.items.map((i) => ({
            platilloId: i.platilloId,
            cantidad: i.cantidad,
            cantidadCortesia: 0,
            notas: i.notas,
          })),
        );

        const costoEnvio = esDelivery ? round2(Number(zona.costoEnvio)) : 0;
        const pedidoMinimo = esDelivery ? round2(Number(zona.pedidoMinimo)) : 0;
        if (esDelivery && subtotalPlatillos < pedidoMinimo) {
          throw new BadRequestError(
            `El pedido mínimo para "${zona.nombre}" es de Q ${pedidoMinimo.toFixed(2)} en platillos`,
          );
        }

        const total = round2(subtotalPlatillos + costoEnvio);

        // 3. Crear o reutilizar cliente por teléfono único en sucursal
        let cliente = await Cliente.findOne({
          where: { sucursalId, telefono: telefonoNorm },
          transaction: tx,
        });
        if (!cliente) {
          cliente = await Cliente.create(
            {
              sucursalId,
              nombre: input.cliente.nombre.trim(),
              telefono: telefonoNorm,
              nit: input.cliente.nit?.trim() || 'CF',
              activo: true,
            },
            { transaction: tx },
          );
        } else {
          // Actualiza nombre/NIT si el cliente dio datos más recientes
          await cliente.update(
            {
              nombre: input.cliente.nombre.trim(),
              ...(input.cliente.nit?.trim() ? { nit: input.cliente.nit.trim() } : {}),
            },
            { transaction: tx },
          );
        }

        // 4. Si es domicilio, guardar dirección de entrega
        let direccionObj = null;
        if (esDelivery) {
          direccionObj = await DireccionEntrega.create(
            {
              sucursalId,
              clienteId: cliente.id,
              zonaEntregaId: zona.id,
              alias: 'Web',
              direccion: input.direccion.trim(),
              referencia: input.referencia?.trim() || null,
              esPrincipal: false,
              activa: true,
            },
            { transaction: tx },
          );
        }

        // 5. Correlativo atómico por sucursal + token aleatorio de seguimiento
        const [corrRow] = await sequelize.query(
          `UPDATE "sucursales"
           SET "correlativo_domicilio" = "correlativo_domicilio" + 1
           WHERE "id" = :sucursalId
           RETURNING "correlativo_domicilio" AS "correlativo"`,
          {
            replacements: { sucursalId },
            type: QueryTypes.SELECT,
            transaction: tx,
          },
        );
        const prefijo = esDelivery ? 'DOM' : 'LLV';
        const numeroPedido = `${prefijo}-${String(corrRow.correlativo).padStart(6, '0')}`;
        const trackingToken = randomBytes(12).toString('hex');

        const metodoPagoEsperado = input.metodoPagoEsperado || MetodoPago.EFECTIVO;

        const pedido = await PedidoDomicilio.create(
          {
            sucursalId,
            numeroPedido,
            clienteId: cliente.id,
            direccionEntregaId: direccionObj?.id ?? null,
            zonaEntregaId: zona?.id ?? null,
            creadoPorId: null,
            tipoEntrega: input.tipoEntrega,
            origen: 'WEB',
            trackingToken,
            estado: EstadoPedidoDomicilio.NUEVO,
            modalidadPago: ModalidadPagoDomicilio.CONTRA_ENTREGA,
            metodoPagoEsperado,
            subtotalPlatillos,
            costoEnvio,
            total,
            zonaNombreSnapshot: esDelivery ? zona.nombre : 'Para llevar (Sucursal)',
            tiempoEstimadoMin: esDelivery ? Number(zona.tiempoEstimadoMin) : 20,
            direccionSnapshot: esDelivery ? direccionObj.direccion : 'Recoger en sucursal',
            referenciaSnapshot: esDelivery ? direccionObj.referencia : null,
            clienteNombreSnapshot: cliente.nombre,
            clienteTelefonoSnapshot: cliente.telefono,
            clienteNitSnapshot: input.cliente.nit?.trim() || cliente.nit || 'CF',
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

        await PedidoDomicilioHistorial.create(
          {
            pedidoDomicilioId: pedido.id,
            sucursalId,
            estadoAnterior: null,
            estadoNuevo: EstadoPedidoDomicilio.NUEVO,
            usuarioId: null,
            observacion: esDelivery
              ? 'Pedido a domicilio recibido desde menú web (pendiente de confirmar en caja)'
              : 'Pedido para llevar recibido desde menú web (pendiente de confirmar en caja)',
          },
          { transaction: tx },
        );

        // Auditoría APPEND-ONLY sin PII en claro (teléfono y dirección nunca en valorNuevo)
        await AuditService.registrarEvento(
          {
            sucursalId,
            usuarioId: null,
            actorRolCodigo: 'CLIENTE_WEB',
            clientMeta,
          },
          {
            accion: ACCIONES_AUDITORIA.PEDIDO_DOMICILIO_CREADO,
            entidad: 'PedidoDomicilio',
            entidadId: pedido.id,
            valorNuevo: {
              numeroPedido,
              origen: 'WEB',
              tipoEntrega: input.tipoEntrega,
              modalidadPago: ModalidadPagoDomicilio.CONTRA_ENTREGA,
              zonaEntregaId: zona?.id ?? null,
              subtotalPlatillos,
              costoEnvio,
              total,
              cantidadItems: detallesPreparados.reduce((acc, d) => acc + d.cantidad, 0),
            },
            motivo: `Pedido web ${numeroPedido} (${input.tipoEntrega}) recibido en línea`,
            impactoFinanciero: 0,
          },
          tx,
        );

        const completo = await PedidoDomicilio.findByPk(pedido.id, {
          include: [
            { model: PedidoDomicilioDetalle, as: 'detalles', separate: true, order: [['id', 'ASC']] },
            { model: PedidoDomicilioHistorial, as: 'historial', separate: true, order: [['createdAt', 'ASC']] },
          ],
          transaction: tx,
        });

        return formatearSeguimientoPublico(completo ?? pedido, sucursal);
      });
    } catch (error) {
      if (getPgErrorCode(error) === '23505') {
        const previo = await buscarPrevio();
        if (previo) return previo;
      }
      throw error;
    } finally {
      purgarTokensTrackingVencidosSiCorresponde();
    }
  }

  static async consultarSeguimiento(trackingToken) {
    const token = String(trackingToken || '').trim().toLowerCase();
    if (!/^[a-f0-9]{16,40}$/.test(token)) {
      throw new NotFoundError('No encontramos un pedido con ese código de seguimiento');
    }

    purgarTokensTrackingVencidosSiCorresponde();

    const pedido = await PedidoDomicilio.findOne({
      where: { trackingToken: token },
      include: [
        { model: PedidoDomicilioDetalle, as: 'detalles', separate: true, order: [['id', 'ASC']] },
        { model: PedidoDomicilioHistorial, as: 'historial', separate: true, order: [['createdAt', 'ASC']] },
      ],
    });
    if (!pedido) {
      throw new NotFoundError('Este enlace de seguimiento no existe o ya venció');
    }

    const { vencido } = calcularVencimientoTracking(pedido, new Date(), env.DELIVERY_TRACKING_TTL_HORAS);
    if (vencido) {
      // Libera el token del índice parcial único sin eliminar el historial del pedido
      await PedidoDomicilio.update({ trackingToken: null }, { where: { id: pedido.id } });
      throw new AppError(
        `Este enlace de seguimiento venció (${env.DELIVERY_TRACKING_TTL_HORAS} h después de finalizar la orden).`,
        410,
        'TRACKING_EXPIRED',
      );
    }

    const sucursal = await Sucursal.findByPk(pedido.sucursalId, {
      attributes: ['id', 'codigo', 'nombre', 'direccion', 'telefono'],
    });

    return formatearSeguimientoPublico(pedido, sucursal);
  }
}

module.exports = { PublicPedidosService, calcularVencimientoTracking };
