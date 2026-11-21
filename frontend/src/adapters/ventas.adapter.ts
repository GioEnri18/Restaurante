import {
  AlertaMenuEspecialModel,
  MenuDataModel,
  MenuEspecialModel,
  TicketImprimibleModel,
} from '../models';

// Adaptador de Ventas / Menú / Menús Especiales: traduce JSON del backend a modelos limpios
export const ventasAdapter = {
  fromMenuEspecialJson(raw: any): MenuEspecialModel {
    return {
      id: Number(raw.id),
      nombre: String(raw.nombre ?? ''),
      descripcion: raw.descripcion ?? null,
      fechaInicio: String(raw.fechaInicio ?? ''),
      fechaFin: String(raw.fechaFin ?? ''),
      diasAvisoPrevio: Number(raw.diasAvisoPrevio ?? 5),
      activo: Boolean(raw.activo),
      esMenuPrincipal: Boolean(raw.esMenuPrincipal),
      creadoPor: String(raw.creadoPor ?? 'Sistema'),
      estado: raw.estado ?? 'PROGRAMADO',
      diasRestantes: Number(raw.diasRestantes ?? 0),
      requiereAtencion: Boolean(raw.requiereAtencion),
      mensajeAviso: raw.mensajeAviso ?? null,
      platillos: (raw.platillos ?? []).map((p: any) => ({
        platilloId: Number(p.platilloId),
        sku: String(p.sku ?? ''),
        nombre: String(p.nombre ?? ''),
        categoriaNombre: String(p.categoriaNombre ?? ''),
        precioRegular: Number(p.precioRegular ?? 0),
        precioEspecial:
          p.precioEspecial !== null && p.precioEspecial !== undefined
            ? Number(p.precioEspecial)
            : null,
      })),
    };
  },

  fromAlertaMenuEspecialJson(raw: any): AlertaMenuEspecialModel {
    return {
      id: Number(raw.id),
      nombre: String(raw.nombre ?? ''),
      fechaInicio: String(raw.fechaInicio ?? ''),
      fechaFin: String(raw.fechaFin ?? ''),
      estado: raw.estado ?? 'PROXIMO_AVISO',
      diasRestantes: Number(raw.diasRestantes ?? 0),
      platillosCount: Number(raw.platillosCount ?? (raw.platillos?.length ?? 0)),
      requiereAtencion: Boolean(raw.requiereAtencion),
      mensaje: raw.mensaje ?? raw.mensajeAviso ?? null,
    };
  },

  fromMenuJson(raw: any): MenuDataModel {
    return {
      cajaAbierta: Boolean(raw.cajaAbierta),
      cajaSesionId: raw.cajaSesionId ? Number(raw.cajaSesionId) : null,
      habilitarMesas: Boolean(raw.habilitarMesas),
      tipoServicioDefault: raw.tipoServicioDefault ?? 'MOSTRADOR',
      categorias: (raw.categorias ?? []).map((c: any) => ({
        id: Number(c.id),
        nombre: String(c.nombre),
        descripcion: c.descripcion ?? null,
        orden: Number(c.orden ?? 0),
      })),
      platillos: (raw.platillos ?? []).map((p: any) => ({
        id: Number(p.id),
        categoriaId: Number(p.categoriaId),
        categoriaNombre: String(p.categoriaNombre ?? ''),
        sku: String(p.sku ?? ''),
        nombre: String(p.nombre ?? ''),
        descripcion: p.descripcion ?? null,
        precioVenta: Number(p.precioVenta ?? 0),
        precioRegular: Number(p.precioRegular ?? p.precioVenta ?? 0),
        esEspecialHoy: Boolean(p.esEspecialHoy),
        costoReceta: Number(p.costoReceta ?? 0),
        disponible: Boolean(p.disponible),
        stockDisponible: Boolean(p.stockDisponible),
        receta: (p.receta ?? []).map((r: any) => ({
          ingredienteId: Number(r.ingredienteId),
          ingredienteNombre: String(r.ingredienteNombre ?? ''),
          cantidadOz: Number(r.cantidadOz ?? 0),
          stockActualOz: Number(r.stockActualOz ?? 0),
        })),
      })),
      mesas: (raw.mesas ?? []).map((m: any) => ({
        id: Number(m.id),
        numero: String(m.numero),
        capacidad: Number(m.capacidad ?? 4),
        estado: m.estado ?? 'DISPONIBLE',
      })),
      menuEspecialActivo: raw.menuEspecialActivo
        ? {
            id: Number(raw.menuEspecialActivo.id),
            nombre: String(raw.menuEspecialActivo.nombre ?? ''),
            descripcion: raw.menuEspecialActivo.descripcion ?? null,
            fechaInicio: String(raw.menuEspecialActivo.fechaInicio ?? ''),
            fechaFin: String(raw.menuEspecialActivo.fechaFin ?? ''),
            esMenuPrincipal: Boolean(raw.menuEspecialActivo.esMenuPrincipal),
            platillosIds: (raw.menuEspecialActivo.platillosIds ?? []).map(Number),
          }
        : null,
      alertasMenusEspeciales: (raw.alertasMenusEspeciales ?? []).map((a: any) =>
        this.fromAlertaMenuEspecialJson(a),
      ),
    };
  },

  fromConfirmarVentaJson(raw: any): TicketImprimibleModel {
    const venta = raw.venta ?? {};
    const factura = raw.factura ?? {};
    const comanda = raw.comanda ?? undefined;
    const sucursal = raw.sucursal ?? {};

    return {
      sucursal: {
        nombre: String(sucursal.nombre ?? ''),
        nit: String(sucursal.nit ?? ''),
        direccion: String(sucursal.direccion ?? ''),
        telefono: sucursal.telefono ?? null,
      },
      factura: {
        id: Number(factura.id),
        numeroCompleto: String(factura.numeroCompleto ?? ''),
        serie: String(factura.serie ?? 'A'),
        clienteNit: String(factura.clienteNit ?? 'CF'),
        clienteNombre: String(factura.clienteNombre ?? 'Consumidor Final'),
        clienteDireccion: String(factura.clienteDireccion ?? 'Ciudad'),
        subtotalSinIva: Number(factura.subtotalSinIva ?? 0),
        ivaMonto: Number(factura.ivaMonto ?? 0),
        total: Number(factura.total ?? 0),
        estado: factura.estado ?? 'EMITIDA',
        reimpresionesCount: Number(factura.reimpresionesCount ?? 0),
        felEstado: String(factura.felEstado ?? 'NO_APLICA'),
        felUuid: factura.felUuid ?? null,
        createdAt: String(factura.createdAt ?? new Date().toISOString()),
      },
      comanda: comanda
        ? {
            numeroComanda: String(comanda.numeroComanda ?? ''),
            tipoServicio: comanda.tipoServicio ?? 'MOSTRADOR',
            mesaNumero: comanda.mesaNumero ?? null,
            nombreTurno: comanda.nombreTurno ?? null,
            createdAt: String(comanda.createdAt ?? new Date().toISOString()),
          }
        : undefined,
      venta: {
        id: Number(venta.id),
        tipoServicio: venta.tipoServicio ?? 'MOSTRADOR',
        metodoPago: venta.metodoPago ?? 'EFECTIVO',
        montoRecibido: Number(venta.montoRecibido ?? 0),
        cambio: Number(venta.cambio ?? 0),
        cajeroNombre: String(venta.usuario?.nombreCompleto ?? ''),
        detalles: (venta.detalles ?? []).map((d: any) => ({
          id: Number(d.id),
          nombrePlatillo: String(d.nombrePlatillo ?? ''),
          cantidad: Number(d.cantidad ?? 0),
          precioUnitario: Number(d.precioUnitario ?? 0),
          subtotal: Number(d.subtotal ?? 0),
          notas: d.notas ?? null,
        })),
      },
    };
  },
};
