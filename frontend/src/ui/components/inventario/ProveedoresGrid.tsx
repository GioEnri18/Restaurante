import React from 'react';
import { Truck } from 'lucide-react';
import { ProveedorModel } from '../../../models';
import { Badge } from '../common/Badge';
import { EmptyState } from '../common/EmptyState';
import { Pagination, usePaginacionLocal } from '../common/Pagination';

interface ProveedoresGridProps {
  proveedores: ProveedorModel[];
  cargando?: boolean;
  onNuevoProveedor?: () => void;
}

export const ProveedoresGrid: React.FC<ProveedoresGridProps> = ({
  proveedores,
  cargando = false,
  onNuevoProveedor,
}) => {
  const pagina = usePaginacionLocal(proveedores);

  if (cargando) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        <p role="status" className="sr-only">
          Cargando proveedores...
        </p>
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            aria-hidden="true"
            className="animate-pulse space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="h-5 w-40 rounded bg-slate-200" />
            <div className="h-3 w-28 rounded bg-slate-200" />
            <div className="h-3 w-36 rounded bg-slate-200" />
            <div className="flex gap-2 pt-2">
              <div className="h-5 w-24 rounded-full bg-slate-200" />
              <div className="h-5 w-20 rounded-full bg-slate-200" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (proveedores.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <EmptyState
          icon={Truck}
          title="Sin proveedores registrados"
          description="Agrega tus proveedores para asociarlos a ingredientes y compras de inventario."
          action={
            onNuevoProveedor
              ? { label: 'Registrar primer proveedor', onClick: onNuevoProveedor }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pagina.items.map((p) => (
          <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="font-bold text-slate-900">{p.nombre}</h3>
            <p className="mt-1 text-xs text-slate-500">NIT: {p.nit || 'N/A'}</p>
            <p className="text-xs text-slate-600">Contacto: {p.contacto || '—'}</p>
            <p className="text-xs text-slate-600">Tel: {p.telefono || '—'}</p>
            <div className="mt-3 flex gap-2">
              <Badge variant="neutral">{p.ingredientesCount} ingredientes</Badge>
              <Badge variant="info">{p.comprasCount} compras</Badge>
            </div>
          </div>
        ))}
      </div>
      {pagina.meta.totalPages > 1 && <Pagination meta={pagina.meta} onPageChange={pagina.onPageChange} />}
    </>
  );
};
