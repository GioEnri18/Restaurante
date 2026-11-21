import { FacturaDetalleModel, FacturaResumenModel } from '../models';

// Adaptador de Facturas: traduce JSON de listado, detalle y reimpresión
export const facturasAdapter = {
  fromResumenJson(raw: any): FacturaResumenModel {
    return {
      id: Number(raw.id),
      numeroCompleto: String(raw.numeroCompleto ?? ''),
      clienteNit: String(raw.clienteNit ?? 'CF'),
      clienteNombre: String(raw.clienteNombre ?? 'Consumidor Final'),
      subtotalSinIva: Number(raw.subtotalSinIva ?? 0),
      ivaMonto: Number(raw.ivaMonto ?? 0),
      total: Number(raw.total ?? 0),
      estado: raw.estado ?? 'EMITIDA',
      motivoAnulacion: raw.motivoAnulacion ?? null,
      reimpresionesCount: Number(raw.reimpresionesCount ?? 0),
      createdAt: String(raw.createdAt ?? ''),
      tipoServicio: raw.venta?.tipoServicio ?? 'MESA',
      metodoPago: raw.venta?.metodoPago ?? 'EFECTIVO',
      vendedorNombre: String(raw.venta?.usuario?.nombreCompleto ?? '—'),
      mesaNumero: raw.venta?.mesa?.numero ?? null,
      numeroComanda: raw.venta?.comanda?.numeroComanda ?? null,
      anuladaPorNombre: raw.anuladaPor?.nombreCompleto ?? null,
    };
  },

  fromDetalleJson(raw: any): FacturaDetalleModel {
    const venta = raw.venta ?? {};
    const comanda = venta.comanda ?? undefined;
    return {
      sucursal: {
        nombre: String(raw.sucursal?.nombre ?? ''),
        nit: String(raw.sucursal?.nit ?? ''),
        direccion: String(raw.sucursal?.direccion ?? ''),
        telefono: raw.sucursal?.telefono ?? null,
      },
      factura: {
        id: Number(raw.id),
        numeroCompleto: String(raw.numeroCompleto ?? ''),
        serie: String(raw.serie ?? 'A'),
        clienteNit: String(raw.clienteNit ?? 'CF'),
        clienteNombre: String(raw.clienteNombre ?? 'Consumidor Final'),
        clienteDireccion: String(raw.clienteDireccion ?? 'Ciudad'),
        subtotalSinIva: Number(raw.subtotalSinIva ?? 0),
        ivaMonto: Number(raw.ivaMonto ?? 0),
        total: Number(raw.total ?? 0),
        estado: raw.estado ?? 'EMITIDA',
        reimpresionesCount: Number(raw.reimpresionesCount ?? 0),
        felEstado: String(raw.felEstado ?? 'NO_APLICA'),
        felUuid: raw.felUuid ?? null,
        createdAt: String(raw.createdAt ?? ''),
      },
      comanda: comanda
        ? {
            numeroComanda: String(comanda.numeroComanda ?? ''),
            tipoServicio: comanda.tipoServicio ?? venta.tipoServicio ?? 'MOSTRADOR',
            mesaNumero: comanda.mesaNumero ?? venta.mesa?.numero ?? null,
            nombreTurno: comanda.nombreTurno ?? null,
            createdAt: String(comanda.createdAt ?? raw.createdAt ?? ''),
          }
        : undefined,
      venta: {
        id: Number(venta.id ?? raw.ventaId ?? 0),
        tipoServicio: venta.tipoServicio ?? 'MESA',
        metodoPago: venta.metodoPago ?? 'EFECTIVO',
        montoRecibido: Number(venta.montoRecibido ?? raw.total ?? 0),
        cambio: Number(venta.cambio ?? 0),
        cajeroNombre: String(venta.usuario?.nombreCompleto ?? '—'),
        detalles: (venta.detalles ?? []).map((d: any) => ({
          id: Number(d.id),
          nombrePlatillo: String(d.nombrePlatillo ?? ''),
          cantidad: Number(d.cantidad ?? 0),
          precioUnitario: Number(d.precioUnitario ?? 0),
          subtotal: Number(d.subtotal ?? 0),
          notas: d.notas ?? null,
        })),
      },
      motivoAnulacion: raw.motivoAnulacion ?? null,
      anuladaEn: raw.anuladaEn ?? null,
      anuladaPorNombre: raw.anuladaPor?.nombreCompleto ?? null,
    };
  },
};
