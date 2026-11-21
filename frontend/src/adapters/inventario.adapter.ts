import {
  CompraModel,
  IngredienteModel,
  InventarioMovimientoModel,
  ProveedorModel,
} from '../models';

/** Referencia mínima de proveedor embebida en ingredientes y compras. */
interface RawProveedorRefJson {
  nombre?: string;
}

/** Respuesta JSON cruda de un ingrediente desde /api/v1/inventario/ingredientes. */
interface RawIngredienteJson {
  id?: number | string;
  codigo?: string;
  nombre?: string;
  proveedorId?: number | string | null;
  proveedor?: RawProveedorRefJson | null;
  stockActualOz?: number | string;
  stockActualLb?: number | string;
  stockMinimoOz?: number | string;
  stockMinimoLb?: number | string;
  costoPromedioOz?: number | string;
  costoPromedioLb?: number | string;
  bajoStock?: boolean;
}

/** Contadores agregados de relaciones para un proveedor (Prisma _count). */
interface RawProveedorCountJson {
  ingredientes?: number | string;
  compras?: number | string;
}

/** Respuesta JSON cruda de un proveedor desde /api/v1/inventario/proveedores. */
interface RawProveedorJson {
  id?: number | string;
  nombre?: string;
  nit?: string | null;
  telefono?: string | null;
  email?: string | null;
  contacto?: string | null;
  _count?: RawProveedorCountJson | null;
}

/** Referencia mínima de usuario incluida en compras y movimientos de inventario. */
interface RawInventarioUsuarioRefJson {
  nombreCompleto?: string;
}

/** Referencia mínima de ingrediente incluida en detalles de compra y movimientos. */
interface RawIngredienteRefJson {
  nombre?: string;
  codigo?: string;
}

/** Detalle individual de una compra de ingredientes en JSON. */
interface RawCompraDetalleJson {
  ingrediente?: RawIngredienteRefJson | null;
  cantidadLb?: number | string;
  cantidadOz?: number | string;
  precioPorLb?: number | string;
  costoPorOz?: number | string;
  subtotal?: number | string;
}

/** Respuesta JSON cruda de una compra desde /api/v1/inventario/compras. */
interface RawCompraJson {
  id?: number | string;
  numeroDocumento?: string | null;
  proveedor?: RawProveedorRefJson | null;
  usuario?: RawInventarioUsuarioRefJson | null;
  total?: number | string;
  observaciones?: string | null;
  fechaCompra?: string;
  createdAt?: string;
  detalles?: unknown[];
}

/** Respuesta JSON cruda de un movimiento de Kardex desde /api/v1/inventario/movimientos. */
interface RawInventarioMovimientoJson {
  id?: number | string;
  ingrediente?: RawIngredienteRefJson | null;
  usuario?: RawInventarioUsuarioRefJson | null;
  tipo?: string;
  cantidadOz?: number | string;
  cantidadLb?: number | string;
  stockAnteriorOz?: number | string;
  stockNuevoOz?: number | string;
  costoUnitarioOz?: number | string;
  motivo?: string | null;
  createdAt?: string;
}

/** Estrecha un valor desconocido a un objeto plano tipado (o vacío si no es objeto). */
function asRecord<T>(raw: unknown): T {
  return (raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as T;
}

/** Estrecha un valor desconocido a un arreglo tipado (o vacío si no es arreglo). */
function asArray<T>(raw: unknown): T[] {
  return Array.isArray(raw) ? (raw as T[]) : [];
}

// Adaptador de Inventario: traduce JSON de ingredientes (lb/oz), proveedores, compras y Kardex
export const inventarioAdapter = {
  fromIngredienteJson(raw: unknown): IngredienteModel {
    const data = asRecord<RawIngredienteJson>(raw);
    const proveedor = asRecord<RawProveedorRefJson>(data.proveedor);

    return {
      id: Number(data.id),
      codigo: String(data.codigo ?? ''),
      nombre: String(data.nombre ?? ''),
      proveedorId: data.proveedorId ? Number(data.proveedorId) : null,
      proveedorNombre: proveedor.nombre ?? null,
      stockActualOz: Number(data.stockActualOz ?? 0),
      stockActualLb: Number(data.stockActualLb ?? 0),
      stockMinimoOz: Number(data.stockMinimoOz ?? 0),
      stockMinimoLb: Number(data.stockMinimoLb ?? 0),
      costoPromedioOz: Number(data.costoPromedioOz ?? 0),
      costoPromedioLb: Number(data.costoPromedioLb ?? 0),
      bajoStock: Boolean(data.bajoStock),
    };
  },

  fromProveedorJson(raw: unknown): ProveedorModel {
    const data = asRecord<RawProveedorJson>(raw);
    const count = asRecord<RawProveedorCountJson>(data._count);

    return {
      id: Number(data.id),
      nombre: String(data.nombre ?? ''),
      nit: data.nit ?? null,
      telefono: data.telefono ?? null,
      email: data.email ?? null,
      contacto: data.contacto ?? null,
      ingredientesCount: Number(count.ingredientes ?? 0),
      comprasCount: Number(count.compras ?? 0),
    };
  },

  fromCompraJson(raw: unknown): CompraModel {
    const data = asRecord<RawCompraJson>(raw);
    const proveedor = asRecord<RawProveedorRefJson>(data.proveedor);
    const usuario = asRecord<RawInventarioUsuarioRefJson>(data.usuario);

    return {
      id: Number(data.id),
      numeroDocumento: data.numeroDocumento ?? null,
      proveedorNombre: String(proveedor.nombre ?? '—'),
      usuarioNombre: String(usuario.nombreCompleto ?? '—'),
      total: Number(data.total ?? 0),
      observaciones: data.observaciones ?? null,
      fechaCompra: String(data.fechaCompra ?? data.createdAt ?? ''),
      detalles: asArray<unknown>(data.detalles).map((item) => {
        const d = asRecord<RawCompraDetalleJson>(item);
        const ingrediente = asRecord<RawIngredienteRefJson>(d.ingrediente);
        return {
          ingredienteNombre: String(ingrediente.nombre ?? ''),
          cantidadLb: Number(d.cantidadLb ?? 0),
          cantidadOz: Number(d.cantidadOz ?? 0),
          precioPorLb: Number(d.precioPorLb ?? 0),
          costoPorOz: Number(d.costoPorOz ?? 0),
          subtotal: Number(d.subtotal ?? 0),
        };
      }),
    };
  },

  fromMovimientoJson(raw: unknown): InventarioMovimientoModel {
    const data = asRecord<RawInventarioMovimientoJson>(raw);
    const ingrediente = asRecord<RawIngredienteRefJson>(data.ingrediente);
    const usuario = asRecord<RawInventarioUsuarioRefJson>(data.usuario);

    return {
      id: Number(data.id),
      ingredienteNombre: String(ingrediente.nombre ?? '—'),
      ingredienteCodigo: String(ingrediente.codigo ?? ''),
      usuarioNombre: String(usuario.nombreCompleto ?? '—'),
      tipo: String(data.tipo ?? ''),
      cantidadOz: Number(data.cantidadOz ?? 0),
      cantidadLb: Number(data.cantidadLb ?? 0),
      stockAnteriorOz: Number(data.stockAnteriorOz ?? 0),
      stockNuevoOz: Number(data.stockNuevoOz ?? 0),
      costoUnitarioOz: Number(data.costoUnitarioOz ?? 0),
      motivo: data.motivo ?? null,
      createdAt: String(data.createdAt ?? ''),
    };
  },
};
