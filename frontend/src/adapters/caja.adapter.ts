import { CajaMovimientoModel, CajaSesionModel, MetodoPago } from '../models';

/** Referencia mínima de usuario incluida en movimientos y sesiones de caja. */
interface RawCajaUsuarioRefJson {
  nombreCompleto?: string;
}

/** Respuesta JSON cruda de un movimiento de caja. */
interface RawCajaMovimientoJson {
  id?: number | string;
  tipo?: string;
  metodoPago?: string;
  monto?: number | string;
  descripcion?: string;
  usuario?: RawCajaUsuarioRefJson | null;
  createdAt?: string;
}

/** Respuesta JSON cruda de una sesión de caja (/api/v1/caja/actual, /historial, etc.). */
interface RawCajaSesionJson {
  id?: number | string;
  estado?: string;
  montoInicial?: number | string;
  totalVentasEfectivo?: number | string;
  totalVentasTarjeta?: number | string;
  totalIngresosExtra?: number | string;
  totalEgresos?: number | string;
  totalEgresosTarjeta?: number | string;
  totalEgresosEfectivo?: number | string | null;
  totalTarjetaNeto?: number | string | null;
  montoEsperadoEfectivo?: number | string | null;
  montoContadoEfectivo?: number | string | null;
  diferencia?: number | string | null;
  totalGeneralEsperado?: number | string | null;
  observacionesCierre?: string | null;
  fechaApertura?: string;
  fechaCierre?: string | null;
  usuarioApertura?: RawCajaUsuarioRefJson | null;
  usuarioCierre?: RawCajaUsuarioRefJson | null;
  domiciliosPendientesLiquidar?: {
    cantidad?: number | string;
    montoTotal?: number | string;
    enRutaCantidad?: number | string;
    bloquearCierre?: boolean;
  } | null;
  movimientos?: unknown[];
}

/** Estrecha un valor desconocido a un objeto plano tipado (o vacío si no es objeto). */
function asRecord<T>(raw: unknown): T {
  return (raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as T;
}

/** Estrecha un valor desconocido a un arreglo tipado (o vacío si no es arreglo). */
function asArray<T>(raw: unknown): T[] {
  return Array.isArray(raw) ? (raw as T[]) : [];
}

/** Normaliza el tipo de movimiento de caja a la unión de dominio permitida. */
function toTipoMovimiento(value: unknown): CajaMovimientoModel['tipo'] {
  if (
    value === 'INGRESO_VENTA' ||
    value === 'INGRESO_MANUAL' ||
    value === 'EGRESO_MANUAL' ||
    value === 'EGRESO_ANULACION' ||
    value === 'INGRESO_DIFERENCIA_REPARTIDOR' ||
    value === 'EGRESO_DIFERENCIA_REPARTIDOR'
  ) {
    return value;
  }
  return 'INGRESO_MANUAL';
}

/** Normaliza el método de pago a la unión de dominio permitida. */
function toMetodoPago(value: unknown): MetodoPago {
  return value === 'TARJETA' ? 'TARJETA' : 'EFECTIVO';
}

/** Normaliza el estado de la sesión de caja. */
function toEstadoCaja(value: unknown): CajaSesionModel['estado'] {
  return value === 'ABIERTA' ? 'ABIERTA' : 'CERRADA';
}

// Adaptador de Caja: traduce JSON de sesiones activas, movimientos e historial de cuadres
export const cajaAdapter = {
  fromMovimientoJson(raw: unknown): CajaMovimientoModel {
    const data = asRecord<RawCajaMovimientoJson>(raw);
    const usuario = asRecord<RawCajaUsuarioRefJson>(data.usuario);

    return {
      id: Number(data.id),
      tipo: toTipoMovimiento(data.tipo),
      metodoPago: toMetodoPago(data.metodoPago),
      monto: Number(data.monto ?? 0),
      descripcion: String(data.descripcion ?? ''),
      usuarioNombre: String(usuario.nombreCompleto ?? '—'),
      createdAt: String(data.createdAt ?? ''),
    };
  },

  fromSesionJson(raw: unknown): CajaSesionModel {
    const data = asRecord<RawCajaSesionJson>(raw);
    const usuarioApertura = asRecord<RawCajaUsuarioRefJson>(data.usuarioApertura);
    const usuarioCierre = asRecord<RawCajaUsuarioRefJson>(data.usuarioCierre);

    const montoInicial = Number(data.montoInicial ?? 0);
    const totalVentasEfectivo = Number(data.totalVentasEfectivo ?? 0);
    const totalVentasTarjeta = Number(data.totalVentasTarjeta ?? 0);
    const totalIngresosExtra = Number(data.totalIngresosExtra ?? 0);
    const totalEgresos = Number(data.totalEgresos ?? 0);
    const totalEgresosTarjeta = Number(data.totalEgresosTarjeta ?? 0);
    const totalEgresosEfectivo =
      data.totalEgresosEfectivo !== undefined && data.totalEgresosEfectivo !== null
        ? Number(data.totalEgresosEfectivo)
        : Math.max(0, totalEgresos - totalEgresosTarjeta);
    const totalTarjetaNeto =
      data.totalTarjetaNeto !== undefined && data.totalTarjetaNeto !== null
        ? Number(data.totalTarjetaNeto)
        : totalVentasTarjeta - totalEgresosTarjeta;
    const montoEsperadoEfectivo =
      data.montoEsperadoEfectivo !== undefined && data.montoEsperadoEfectivo !== null
        ? Number(data.montoEsperadoEfectivo)
        : montoInicial + totalVentasEfectivo + totalIngresosExtra - totalEgresosEfectivo;

    return {
      id: Number(data.id),
      estado: toEstadoCaja(data.estado),
      montoInicial,
      totalVentasEfectivo,
      totalVentasTarjeta,
      totalIngresosExtra,
      totalEgresos,
      totalEgresosTarjeta,
      totalEgresosEfectivo,
      totalTarjetaNeto,
      montoEsperadoEfectivo,
      montoContadoEfectivo:
        data.montoContadoEfectivo !== null && data.montoContadoEfectivo !== undefined
          ? Number(data.montoContadoEfectivo)
          : null,
      diferencia:
        data.diferencia !== null && data.diferencia !== undefined ? Number(data.diferencia) : null,
      totalGeneralEsperado:
        data.totalGeneralEsperado !== undefined && data.totalGeneralEsperado !== null
          ? Number(data.totalGeneralEsperado)
          : montoEsperadoEfectivo + totalTarjetaNeto,
      observacionesCierre: data.observacionesCierre ?? null,
      fechaApertura: String(data.fechaApertura ?? ''),
      fechaCierre: data.fechaCierre ?? null,
      usuarioAperturaNombre: String(usuarioApertura.nombreCompleto ?? '—'),
      usuarioCierreNombre: usuarioCierre.nombreCompleto ?? null,
      domiciliosPendientesLiquidar: data.domiciliosPendientesLiquidar
        ? {
            cantidad: Number(data.domiciliosPendientesLiquidar.cantidad ?? 0),
            montoTotal: Number(data.domiciliosPendientesLiquidar.montoTotal ?? 0),
            enRutaCantidad: Number(data.domiciliosPendientesLiquidar.enRutaCantidad ?? 0),
            bloquearCierre: Boolean(data.domiciliosPendientesLiquidar.bloquearCierre),
          }
        : undefined,
      movimientos: asArray<unknown>(data.movimientos).map((m) => this.fromMovimientoJson(m)),
    };
  },
};
