const { ROL_ADMIN_CODIGO } = require('../config/constants');
const { EstadoComanda, EstadoPedidoDomicilio, ModalidadPagoDomicilio } = require('../models/enums');
const { ForbiddenError } = require('../shared/errors/AppError');

const {
  NUEVO,
  EN_PREPARACION,
  LISTO,
  EN_RUTA,
  ENTREGADO,
  CANCELADO,
  FALLIDO,
} = EstadoPedidoDomicilio;

/**
 * Única tabla oficial de transiciones válidas del ciclo de vida de un pedido a domicilio.
 * - Flujo principal: NUEVO → EN_PREPARACION → LISTO → EN_RUTA → ENTREGADO
 * - Salidas: CANCELADO (solo antes de despachar: NUEVO, EN_PREPARACION, LISTO) y FALLIDO (solo desde EN_RUTA)
 */
const TRANSICIONES_PEDIDO_DOMICILIO = Object.freeze({
  [NUEVO]: Object.freeze([EN_PREPARACION, CANCELADO]),
  [EN_PREPARACION]: Object.freeze([LISTO, CANCELADO]),
  [LISTO]: Object.freeze([EN_RUTA, CANCELADO]),
  [EN_RUTA]: Object.freeze([ENTREGADO, FALLIDO]),
  [ENTREGADO]: Object.freeze([]),
  [CANCELADO]: Object.freeze([]),
  [FALLIDO]: Object.freeze([]),
});

/** Transiciones específicas cuando el pedido es PARA LLEVAR / RECOGER EN SUCURSAL */
const TRANSICIONES_PEDIDO_LLEVAR = Object.freeze({
  [NUEVO]: Object.freeze([EN_PREPARACION, CANCELADO]),
  [EN_PREPARACION]: Object.freeze([LISTO, CANCELADO]),
  [LISTO]: Object.freeze([ENTREGADO, CANCELADO]),
  [EN_RUTA]: Object.freeze([]),
  [ENTREGADO]: Object.freeze([]),
  [CANCELADO]: Object.freeze([]),
  [FALLIDO]: Object.freeze([]),
});

/** Estados considerados activos en el tablero operativo y en la vista móvil del repartidor */
const ESTADOS_ACTIVOS_DOMICILIO = Object.freeze([NUEVO, EN_PREPARACION, LISTO, EN_RUTA]);

/** Estados en los que todavía se puede asignar o reasignar repartidor */
const ESTADOS_ASIGNABLES_DOMICILIO = Object.freeze([NUEVO, EN_PREPARACION, LISTO]);

/** Mapeo 1:1 para sincronizar `comandas.estado_cocina` con el estado del pedido a domicilio */
const MAPA_ESTADO_COMANDA = Object.freeze({
  [NUEVO]: EstadoComanda.PENDIENTE,
  [EN_PREPARACION]: EstadoComanda.EN_PREPARACION,
  [LISTO]: EstadoComanda.LISTA,
  [EN_RUTA]: EstadoComanda.ENTREGADA,
  [ENTREGADO]: EstadoComanda.ENTREGADA,
});

/** Estados permitidos por rol especializado cuando no es ADMIN ni CAJERO */
const ESTADOS_PERMITIDOS_CHEF = new Set([EN_PREPARACION, LISTO]);
const ESTADOS_PERMITIDOS_REPARTIDOR = new Set([EN_RUTA, ENTREGADO, FALLIDO]);

function esTransicionValida(estadoActual, estadoNuevo, tipoEntrega = 'DELIVERY') {
  const tabla = tipoEntrega === 'LLEVAR' ? TRANSICIONES_PEDIDO_LLEVAR : TRANSICIONES_PEDIDO_DOMICILIO;
  const permitidos = tabla[estadoActual];
  return Array.isArray(permitidos) && permitidos.includes(estadoNuevo);
}

/**
 * Valida las reglas RBAC finas por rol/permiso para una transición de estado:
 * - CANCELADO exige `domicilios:cancelar`
 * - Otros cambios exigen `domicilios:actualizar_estado`
 * - CHEF solo puede mover a EN_PREPARACION o LISTO
 * - REPARTIDOR solo puede mover a EN_RUTA, ENTREGADO o FALLIDO, y únicamente en SUS pedidos asignados
 */
function validarPermisoTransicion(user, pedido, estadoNuevo) {
  const permisos = Array.isArray(user?.permisos) ? user.permisos : [];
  const rol = String(user?.rolCodigo || '').toUpperCase();

  if (estadoNuevo === CANCELADO) {
    if (!permisos.includes('domicilios:cancelar')) {
      throw new ForbiddenError('No tienes permiso para cancelar pedidos a domicilio');
    }
    return;
  }

  if (!permisos.includes('domicilios:actualizar_estado')) {
    throw new ForbiddenError('No tienes permiso para actualizar el estado de pedidos a domicilio');
  }

  if (rol === ROL_ADMIN_CODIGO || rol === 'CAJERO') {
    return;
  }

  if (rol === 'CHEF') {
    if (!ESTADOS_PERMITIDOS_CHEF.has(estadoNuevo)) {
      throw new ForbiddenError('El rol Chef únicamente puede cambiar pedidos a EN_PREPARACION o LISTO');
    }
    return;
  }

  if (rol === 'REPARTIDOR' || (!permisos.includes('domicilios:ver') && permisos.includes('domicilios:ver_propios'))) {
    if (Number(pedido.repartidorId) !== Number(user.id)) {
      throw new ForbiddenError('Solo puedes actualizar el estado de los pedidos asignados a tu usuario');
    }
    if (!ESTADOS_PERMITIDOS_REPARTIDOR.has(estadoNuevo)) {
      throw new ForbiddenError('El repartidor únicamente puede marcar pedidos como EN_RUTA, ENTREGADO o FALLIDO');
    }
    return;
  }
}

function mapearEstadoComanda(estadoPedido) {
  return MAPA_ESTADO_COMANDA[estadoPedido] ?? null;
}

/**
 * Regla de negocio #4:
 * - CANCELADO en NUEVO: NO genera merma (cocina no empezó a preparar).
 * - CANCELADO en EN_PREPARACION o LISTO, o FALLIDO desde EN_RUTA: SÍ genera merma automática según receta.
 */
function requiereMermaAlCerrar(estadoAnterior, estadoNuevo) {
  if (estadoNuevo === FALLIDO) return true;
  if (estadoNuevo === CANCELADO && (estadoAnterior === EN_PREPARACION || estadoAnterior === LISTO)) {
    return true;
  }
  return false;
}

/**
 * Regla de negocio #3:
 * Pendiente de liquidar = ENTREGADO + CONTRA_ENTREGA + sin venta asociada.
 */
function esPendienteDeLiquidar(pedido) {
  if (!pedido) return false;
  return (
    pedido.modalidadPago === ModalidadPagoDomicilio.CONTRA_ENTREGA
    && pedido.estado === ENTREGADO
    && !pedido.ventaId
  );
}

const ESTADOS_TERMINALES_DOMICILIO = Object.freeze([ENTREGADO, CANCELADO, FALLIDO]);

/**
 * Calcula si el enlace público de seguimiento ya venció y su fecha límite:
 * - En estados terminales (ENTREGADO, CANCELADO, FALLIDO): vence `ttlHoras` después del cierre.
 * - En pedidos activos olvidados: vence a las `max(ttlHoras * 2, 48)` horas desde su creación.
 */
function calcularVencimientoTracking(pedido, ahora = new Date(), ttlHoras = 24) {
  const ahoraMs = ahora instanceof Date ? ahora.getTime() : new Date(ahora).getTime();
  const ttlMs = ttlHoras * 60 * 60 * 1000;
  const esTerminal = ESTADOS_TERMINALES_DOMICILIO.includes(pedido.estado);

  if (esTerminal) {
    const fechaCierreRaw =
      pedido.entregadoEn || pedido.canceladoEn || pedido.fallidoEn || pedido.updatedAt || pedido.createdAt;
    const cierreMs = new Date(fechaCierreRaw).getTime();
    const expiraMs = cierreMs + ttlMs;
    return {
      vencido: ahoraMs > expiraMs,
      expiraEn: new Date(expiraMs).toISOString(),
    };
  }

  const maxActivoMs = Math.max(ttlHoras * 2, 48) * 60 * 60 * 1000;
  const creadoMs = new Date(pedido.createdAt || ahora).getTime();
  const expiraMs = creadoMs + maxActivoMs;
  return {
    vencido: ahoraMs > expiraMs,
    expiraEn: null,
  };
}

module.exports = {
  TRANSICIONES_PEDIDO_DOMICILIO,
  ESTADOS_ACTIVOS_DOMICILIO,
  ESTADOS_ASIGNABLES_DOMICILIO,
  ESTADOS_TERMINALES_DOMICILIO,
  MAPA_ESTADO_COMANDA,
  esTransicionValida,
  validarPermisoTransicion,
  mapearEstadoComanda,
  requiereMermaAlCerrar,
  esPendienteDeLiquidar,
  calcularVencimientoTracking,
};
