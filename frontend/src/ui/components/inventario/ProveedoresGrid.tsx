import React from 'react';
import { ProveedorModel } from '../../../models';
import { Badge } from '../common/Badge';
import { Pagination, usePaginacionLocal } from '../common/Pagination';

interface ProveedoresGridProps {
  proveedores: ProveedorModel[];
}

export const ProveedoresGrid: React.FC<ProveedoresGridProps> = ({ proveedores }) => {
  const pagina = usePaginacionLocal(proveedores);
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
