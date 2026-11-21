import {
  CompraModel,
  IngredienteModel,
  InventarioMovimientoModel,
  ProveedorModel,
} from '../models';

// Adaptador de Inventario: traduce JSON de ingredientes (lb/oz), proveedores, compras y Kardex
export const inventarioAdapter = {
  fromIngredienteJson(raw: any): IngredienteModel {
    return {
      id: Number(raw.id),
      codigo: String(raw.codigo ?? ''),
      nombre: String(raw.nombre ?? ''),
      proveedorId: raw.proveedorId ? Number(raw.proveedorId) : null,
      proveedorNombre: raw.proveedor?.nombre ?? null,
      stockActualOz: Number(raw.stockActualOz ?? 0),
      stockActualLb: Number(raw.stockActualLb ?? 0),
      stockMinimoOz: Number(raw.stockMinimoOz ?? 0),
      stockMinimoLb: Number(raw.stockMinimoLb ?? 0),
      costoPromedioOz: Number(raw.costoPromedioOz ?? 0),
      costoPromedioLb: Number(raw.costoPromedioLb ?? 0),
      bajoStock: Boolean(raw.bajoStock),
    };
  },

  fromProveedorJson(raw: any): ProveedorModel {
    return {
      id: Number(raw.id),
      nombre: String(raw.nombre ?? ''),
      nit: raw.nit ?? null,
      telefono: raw.telefono ?? null,
      email: raw.email ?? null,
      contacto: raw.contacto ?? null,
      ingredientesCount: Number(raw._count?.ingredientes ?? 0),
      comprasCount: Number(raw._count?.compras ?? 0),
    };
  },

  fromCompraJson(raw: any): CompraModel {
    return {
      id: Number(raw.id),
      numeroDocumento: raw.numeroDocumento ?? null,
      proveedorNombre: String(raw.proveedor?.nombre ?? '—'),
      usuarioNombre: String(raw.usuario?.nombreCompleto ?? '—'),
      total: Number(raw.total ?? 0),
      observaciones: raw.observaciones ?? null,
      fechaCompra: String(raw.fechaCompra ?? raw.createdAt ?? ''),
      detalles: (raw.detalles ?? []).map((d: any) => ({
        ingredienteNombre: String(d.ingrediente?.nombre ?? ''),
        cantidadLb: Number(d.cantidadLb ?? 0),
        cantidadOz: Number(d.cantidadOz ?? 0),
        precioPorLb: Number(d.precioPorLb ?? 0),
        costoPorOz: Number(d.costoPorOz ?? 0),
        subtotal: Number(d.subtotal ?? 0),
      })),
    };
  },

  fromMovimientoJson(raw: any): InventarioMovimientoModel {
    return {
      id: Number(raw.id),
      ingredienteNombre: String(raw.ingrediente?.nombre ?? '—'),
      ingredienteCodigo: String(raw.ingrediente?.codigo ?? ''),
      usuarioNombre: String(raw.usuario?.nombreCompleto ?? '—'),
      tipo: String(raw.tipo ?? ''),
      cantidadOz: Number(raw.cantidadOz ?? 0),
      cantidadLb: Number(raw.cantidadLb ?? 0),
      stockAnteriorOz: Number(raw.stockAnteriorOz ?? 0),
      stockNuevoOz: Number(raw.stockNuevoOz ?? 0),
      costoUnitarioOz: Number(raw.costoUnitarioOz ?? 0),
      motivo: raw.motivo ?? null,
      createdAt: String(raw.createdAt ?? ''),
    };
  },
};
