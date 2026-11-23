import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PaginationMeta } from '../../../models';

interface PaginationProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
}

export function usePaginacionLocal<T>(items: readonly T[], filtro = '') {
  const [seleccion, setSeleccion] = useState({ filtro, pagina: 1 });
  const limit = 15;
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = seleccion.filtro === filtro ? Math.min(seleccion.pagina, totalPages) : 1;
  return {
    items: items.slice((page - 1) * limit, page * limit),
    meta: { page, limit, total, totalPages },
    onPageChange: (pagina: number) => setSeleccion({ filtro, pagina }),
  };
}

export const Pagination: React.FC<PaginationProps> = ({ meta, onPageChange }) => {
  if (meta.totalPages <= 1 && meta.total <= meta.limit) {
    return (
      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>Mostrando {meta.total} registro(s)</span>
        <span>Página 1 de 1</span>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-sm">
      <span className="text-slate-600">
        Total: <strong>{meta.total}</strong> registros ({meta.limit} por página)
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
          aria-label="Página anterior"
          className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Anterior
        </button>
        <span className="px-2 font-semibold text-slate-800">
          {meta.page} / {meta.totalPages}
        </span>
        <button
          type="button"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
          aria-label="Página siguiente"
          className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Siguiente
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
