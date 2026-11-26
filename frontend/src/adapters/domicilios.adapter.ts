import {
  ClienteDomicilioModel,
  DireccionEntregaModel,
  DomiciliosResumenModel,
  EstadoPedidoDomicilio,
  MetodoPago,
  ModalidadPagoDomicilio,
  PedidoDomicilioModel,
  ReporteDomiciliosModel,
  ZonaEntregaModel,
} from '../models';

function asRecord<T>(raw: unknown): T {
  return (raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as T;
}

function asArray<T>(raw: unknown): T[] {
  return Array.isArray(raw) ? (raw as T[]) : [];
}

const ESTADOS_VALIDOS: readonly EstadoPedidoDomicilio[] = [
  'NUEVO',
  'EN_PREPARACION',
  'LISTO',
  'EN_RUTA',
  'ENTREGADO',
  'CANCELADO',
  'FALLIDO',
];

function toEstado(value: unknown): EstadoPedidoDomicilio {
  return ESTADOS_VALIDOS.includes(value as EstadoPedidoDomicilio)
    ? (value as EstadoPedidoDomicilio)
    : 'NUEVO';
}

function toModalidad(value: unknown): ModalidadPagoDomicilio {
  return value === 'PREPAGADO' ? 'PREPAGADO' : 'CONTRA_ENTREGA';
}

function toMetodoPago(value: unknown): MetodoPago {
  return value === 'TARJETA' || value === 'SIN_COBRO' ? value : 'EFECTIVO';
}

export const domiciliosAdapter = {
  fromZonaJson(raw: unknown): ZonaEntregaModel {
    const d = asRecord<Record<string, unknown>>(raw);
    return {
      id: Number(d.id),
      nombre: String(d.nombre ?? ''),
      descripcion: typeof d.descripcion === 'string' ? d.descripcion : null,
      costoEnvio: Number(d.costoEnvio ?? 0),
      tiempoEstimadoMin: Number(d.tiempoEstimadoMin ?? 30),
      pedidoMinimo: Number(d.pedidoMinimo ?? 0),
      activa: Boolean(d.activa),
    };
  },

  fromDireccionJson(raw: unknown): DireccionEntregaModel {
    const d = asRecord<Record<string, unknown>>(raw);
    return {
      id: Number(d.id),
      clienteId: Number(d.clienteId ?? 0),
      zonaEntregaId: d.zonaEntregaId !== null && d.zonaEntregaId !== undefined ? Number(d.zonaEntregaId) : null,
      alias: String(d.alias ?? 'Principal'),
      direccion: String(d.direccion ?? ''),
      referencia: typeof d.referencia === 'string' ? d.referencia : null,
      esPrincipal: Boolean(d.esPrincipal),
      activa: d.activa !== undefined ? Boolean(d.activa) : true,
      zonaEntrega: d.zonaEntrega ? this.fromZonaJson(d.zonaEntrega) : null,
    };
  },

  fromClienteJson(raw: unknown): ClienteDomicilioModel {
    const d = asRecord<Record<string, unknown>>(raw);
    return {
      id: Number(d.id),
      nombre: String(d.nombre ?? ''),
      telefono: String(d.telefono ?? ''),
      nit: typeof d.nit === 'string' ? d.nit : null,
      notas: typeof d.notas === 'string' ? d.notas : null,
      activo: d.activo !== undefined ? Boolean(d.activo) : true,
      direcciones: asArray<unknown>(d.direcciones).map((dir) => this.fromDireccionJson(dir)),
    };
  },

  fromPedidoJson(raw: unknown): PedidoDomicilioModel {
    const d = asRecord<Record<string, unknown>>(raw);
    const mapUsuario = (u: unknown) => {
      if (!u || typeof u !== 'object') return null;
      const r = u as Record<string, unknown>;
      return {
        id: Number(r.id),
        nombreCompleto: String(r.nombreCompleto ?? ''),
        username: String(r.username ?? ''),
      };
    };
    const comandaRaw = d.comanda && typeof d.comanda === 'object' ? (d.comanda as Record<string, unknown>) : null;
    const ventaRaw = d.venta && typeof d.venta === 'object' ? (d.venta as Record<string, unknown>) : null;
    const facturaRaw = ventaRaw?.factura && typeof ventaRaw.factura === 'object'
      ? (ventaRaw.factura as Record<string, unknown>)
      : null;

    return {
      id: Number(d.id),
      numeroPedido: String(d.numeroPedido ?? ''),
      clienteId: Number(d.clienteId ?? 0),
      direccionEntregaId:
        d.direccionEntregaId !== null && d.direccionEntregaId !== undefined
          ? Number(d.direccionEntregaId)
          : null,
      zonaEntregaId:
        d.zonaEntregaId !== null && d.zonaEntregaId !== undefined ? Number(d.zonaEntregaId) : null,
      creadoPorId:
        d.creadoPorId !== null && d.creadoPorId !== undefined ? Number(d.creadoPorId) : null,
      repartidorId: d.repartidorId !== null && d.repartidorId !== undefined ? Number(d.repartidorId) : null,
      ventaId: d.ventaId !== null && d.ventaId !== undefined ? Number(d.ventaId) : null,
      tipoEntrega: d.tipoEntrega === 'LLEVAR' ? 'LLEVAR' : 'DELIVERY',
      origen: d.origen === 'WEB' ? 'WEB' : 'POS',
      trackingToken: typeof d.trackingToken === 'string' ? d.trackingToken : null,
      estado: toEstado(d.estado),
      modalidadPago: toModalidad(d.modalidadPago),
      metodoPagoEsperado: toMetodoPago(d.metodoPagoEsperado),
      subtotalPlatillos: Number(d.subtotalPlatillos ?? 0),
      costoEnvio: Number(d.costoEnvio ?? 0),
      total: Number(d.total ?? 0),
      zonaNombre: String(d.zonaNombre ?? ''),
      tiempoEstimadoMin: Number(d.tiempoEstimadoMin ?? 30),
      clienteNombre: String(d.clienteNombre ?? ''),
      clienteNit: String(d.clienteNit ?? 'CF'),
      clienteTelefono: String(d.clienteTelefono ?? ''),
      direccion: typeof d.direccion === 'string' ? d.direccion : null,
      referencia: typeof d.referencia === 'string' ? d.referencia : null,
      observaciones: typeof d.observaciones === 'string' ? d.observaciones : null,
      montoConQuePaga:
        d.montoConQuePaga !== null && d.montoConQuePaga !== undefined ? Number(d.montoConQuePaga) : null,
      montoRecibidoRepartidor:
        d.montoRecibidoRepartidor !== null && d.montoRecibidoRepartidor !== undefined
          ? Number(d.montoRecibidoRepartidor)
          : null,
      diferenciaLiquidacion:
        d.diferenciaLiquidacion !== null && d.diferenciaLiquidacion !== undefined
          ? Number(d.diferenciaLiquidacion)
          : null,
      referenciaPagoLiquidacion:
        typeof d.referenciaPagoLiquidacion === 'string' ? d.referenciaPagoLiquidacion : null,
      liquidadoEn: typeof d.liquidadoEn === 'string' ? d.liquidadoEn : null,
      motivoCierre: typeof d.motivoCierre === 'string' ? d.motivoCierre : null,
      mermaGenerada: Boolean(d.mermaGenerada),
      facturaAnuladaCierre: Boolean(d.facturaAnuladaCierre),
      pendienteLiquidar: Boolean(d.pendienteLiquidar),
      asignadoEn: typeof d.asignadoEn === 'string' ? d.asignadoEn : null,
      despachadoEn: typeof d.despachadoEn === 'string' ? d.despachadoEn : null,
      entregadoEn: typeof d.entregadoEn === 'string' ? d.entregadoEn : null,
      canceladoEn: typeof d.canceladoEn === 'string' ? d.canceladoEn : null,
      fallidoEn: typeof d.fallidoEn === 'string' ? d.fallidoEn : null,
      createdAt: String(d.createdAt ?? ''),
      updatedAt: String(d.updatedAt ?? ''),
      creadoPor: mapUsuario(d.creadoPor),
      repartidor: mapUsuario(d.repartidor),
      liquidadoPor: mapUsuario(d.liquidadoPor),
      comanda: comandaRaw
        ? {
          id: Number(comandaRaw.id),
          numeroComanda: String(comandaRaw.numeroComanda ?? ''),
          estadoCocina: String(comandaRaw.estadoCocina ?? 'PENDIENTE'),
          createdAt: String(comandaRaw.createdAt ?? ''),
        }
        : null,
      venta: ventaRaw
        ? {
          id: Number(ventaRaw.id),
          metodoPago: toMetodoPago(ventaRaw.metodoPago),
          estado: String(ventaRaw.estado ?? 'COMPLETADA'),
          total: Number(ventaRaw.total ?? 0),
          costoEnvio: Number(ventaRaw.costoEnvio ?? 0),
          referenciaPago: typeof ventaRaw.referenciaPago === 'string' ? ventaRaw.referenciaPago : null,
          createdAt: String(ventaRaw.createdAt ?? ''),
          factura: facturaRaw
            ? {
              id: Number(facturaRaw.id),
              numeroCompleto: String(facturaRaw.numeroCompleto ?? ''),
              estado: String(facturaRaw.estado ?? 'EMITIDA'),
              total: Number(facturaRaw.total ?? 0),
              costoEnvio: Number(facturaRaw.costoEnvio ?? 0),
              createdAt: String(facturaRaw.createdAt ?? ''),
            }
            : null,
        }
        : null,
      detalles: asArray<unknown>(d.detalles).map((item) => {
        const det = asRecord<Record<string, unknown>>(item);
        return {
          id: Number(det.id),
          platilloId: Number(det.platilloId),
          nombrePlatillo: String(det.nombrePlatillo ?? ''),
          cantidad: Number(det.cantidad ?? 0),
          cantidadCortesia: Number(det.cantidadCortesia ?? 0),
          precioUnitario: Number(det.precioUnitario ?? 0),
          subtotal: Number(det.subtotal ?? 0),
          notas: typeof det.notas === 'string' ? det.notas : null,
        };
      }),
      historial: Array.isArray(d.historial)
        ? d.historial.map((h) => {
          const hr = asRecord<Record<string, unknown>>(h);
          return {
            id: Number(hr.id),
            estadoAnterior: hr.estadoAnterior ? toEstado(hr.estadoAnterior) : null,
            estadoNuevo: toEstado(hr.estadoNuevo),
            usuarioId: Number(hr.usuarioId ?? 0),
            usuarioNombre: typeof hr.usuarioNombre === 'string' ? hr.usuarioNombre : null,
            observacion: typeof hr.observacion === 'string' ? hr.observacion : null,
            createdAt: String(hr.createdAt ?? ''),
          };
        })
        : undefined,
    };
  },

  fromResumenJson(raw: unknown): DomiciliosResumenModel {
    const d = asRecord<Record<string, unknown>>(raw);
    const porEstadoRaw = asRecord<Record<string, unknown>>(d.porEstado);
    const porEstado = Object.fromEntries(
      ESTADOS_VALIDOS.map((est) => [est, Number(porEstadoRaw[est] ?? 0)]),
    ) as Record<EstadoPedidoDomicilio, number>;
    return {
      porEstado,
      activosCount: Number(d.activosCount ?? 0),
      pendientesLiquidarCount: Number(d.pendientesLiquidarCount ?? 0),
    };
  },

  fromReporteDomiciliosJson(raw: unknown): ReporteDomiciliosModel {
    const d = asRecord<Record<string, unknown>>(raw);
    const periodo = asRecord<Record<string, unknown>>(d.periodo);
    const k = asRecord<Record<string, unknown>>(d.kpis);
    return {
      periodo: {
        fechaDesde: String(periodo.fechaDesde ?? ''),
        fechaHasta: String(periodo.fechaHasta ?? ''),
      },
      kpis: {
        totalPedidos: Number(k.totalPedidos ?? 0),
        entregados: Number(k.entregados ?? 0),
        cancelados: Number(k.cancelados ?? 0),
        fallidos: Number(k.fallidos ?? 0),
        activos: Number(k.activos ?? 0),
        pendientesLiquidar: Number(k.pendientesLiquidar ?? 0),
        tasaCancelacionPct: Number(k.tasaCancelacionPct ?? 0),
        tasaFalloPct: Number(k.tasaFalloPct ?? 0),
        tiempoPromedioEntregaMin: Number(k.tiempoPromedioEntregaMin ?? 0),
        ingresosTotalesDomicilio: Number(k.ingresosTotalesDomicilio ?? 0),
        ingresosEnvioTotal: Number(k.ingresosEnvioTotal ?? 0),
        costoMermasDomicilio: Number(k.costoMermasDomicilio ?? 0),
        diferenciaLiquidacionNeta: Number(k.diferenciaLiquidacionNeta ?? 0),
      },
      porEstado: asArray<unknown>(d.porEstado).map((item) => {
        const r = asRecord<Record<string, unknown>>(item);
        return {
          estado: toEstado(r.estado),
          cantidad: Number(r.cantidad ?? 0),
          total: Number(r.total ?? 0),
        };
      }),
      porZona: asArray<unknown>(d.porZona).map((item) => {
        const r = asRecord<Record<string, unknown>>(item);
        return {
          zonaEntregaId: Number(r.zonaEntregaId ?? 0),
          zonaNombre: String(r.zonaNombre ?? ''),
          totalPedidos: Number(r.totalPedidos ?? 0),
          entregados: Number(r.entregados ?? 0),
          fallidos: Number(r.fallidos ?? 0),
          cancelados: Number(r.cancelados ?? 0),
          ingresosEnvio: Number(r.ingresosEnvio ?? 0),
          totalFacturado: Number(r.totalFacturado ?? 0),
          tiempoPromedioMin: Number(r.tiempoPromedioMin ?? 0),
        };
      }),
      porRepartidor: asArray<unknown>(d.porRepartidor).map((item) => {
        const r = asRecord<Record<string, unknown>>(item);
        return {
          repartidorId: Number(r.repartidorId ?? 0),
          nombreCompleto: String(r.nombreCompleto ?? ''),
          username: String(r.username ?? ''),
          asignados: Number(r.asignados ?? 0),
          entregados: Number(r.entregados ?? 0),
          fallidos: Number(r.fallidos ?? 0),
          pendientesLiquidar: Number(r.pendientesLiquidar ?? 0),
          tiempoPromedioRutaMin: Number(r.tiempoPromedioRutaMin ?? 0),
          diferenciaAcumulada: Number(r.diferenciaAcumulada ?? 0),
        };
      }),
    };
  },
};
