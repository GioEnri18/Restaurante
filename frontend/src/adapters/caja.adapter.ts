import { CajaMovimientoModel, CajaSesionModel } from '../models';

// Adaptador de Caja: traduce JSON de sesiones activas, movimientos e historial de cuadres
export const cajaAdapter = {
  fromMovimientoJson(raw: any): CajaMovimientoModel {
    return {
      id: Number(raw.id),
      tipo: raw.tipo ?? 'INGRESO_MANUAL',
      metodoPago: raw.metodoPago ?? 'EFECTIVO',
      monto: Number(raw.monto ?? 0),
      descripcion: String(raw.descripcion ?? ''),
      usuarioNombre: String(raw.usuario?.nombreCompleto ?? '—'),
      createdAt: String(raw.createdAt ?? ''),
    };
  },

  fromSesionJson(raw: any): CajaSesionModel {
    const montoInicial = Number(raw.montoInicial ?? 0);
    const totalVentasEfectivo = Number(raw.totalVentasEfectivo ?? 0);
    const totalVentasTarjeta = Number(raw.totalVentasTarjeta ?? 0);
    const totalIngresosExtra = Number(raw.totalIngresosExtra ?? 0);
    const totalEgresos = Number(raw.totalEgresos ?? 0);
    const montoEsperadoEfectivo =
      raw.montoEsperadoEfectivo !== undefined && raw.montoEsperadoEfectivo !== null
        ? Number(raw.montoEsperadoEfectivo)
        : montoInicial + totalVentasEfectivo + totalIngresosExtra - totalEgresos;

    return {
      id: Number(raw.id),
      estado: raw.estado ?? 'CERRADA',
      montoInicial,
      totalVentasEfectivo,
      totalVentasTarjeta,
      totalIngresosExtra,
      totalEgresos,
      montoEsperadoEfectivo,
      montoContadoEfectivo:
        raw.montoContadoEfectivo !== null && raw.montoContadoEfectivo !== undefined
          ? Number(raw.montoContadoEfectivo)
          : null,
      diferencia:
        raw.diferencia !== null && raw.diferencia !== undefined ? Number(raw.diferencia) : null,
      totalGeneralEsperado:
        raw.totalGeneralEsperado !== undefined
          ? Number(raw.totalGeneralEsperado)
          : montoEsperadoEfectivo + totalVentasTarjeta,
      observacionesCierre: raw.observacionesCierre ?? null,
      fechaApertura: String(raw.fechaApertura ?? ''),
      fechaCierre: raw.fechaCierre ?? null,
      usuarioAperturaNombre: String(raw.usuarioApertura?.nombreCompleto ?? '—'),
      usuarioCierreNombre: raw.usuarioCierre?.nombreCompleto ?? null,
      movimientos: (raw.movimientos ?? []).map((m: any) => this.fromMovimientoJson(m)),
    };
  },
};
