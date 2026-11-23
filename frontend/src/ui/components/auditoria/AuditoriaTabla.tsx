import React from 'react';
import { AlertTriangle, Eye, Info, ShieldAlert, ShieldCheck } from 'lucide-react';
import { etiquetaAccionAuditoria } from '../../../adapters/auditoria.adapter';
import { AuditoriaLogModel, PaginationMeta, SeveridadAuditoria } from '../../../models';
import { formatCurrency, formatDateTime } from '../../../utils/formatters';
import { EmptyState } from '../common/EmptyState';
import { Pagination } from '../common/Pagination';
import { TableSkeleton } from '../common/TableSkeleton';

/**
 * Insignia de severidad accesible (WCAG 2.1 AA): combina texto explícito + ícono + color con contraste >= 4.5:1.
 */
export const SeveridadBadge: React.FC<{ severidad: SeveridadAuditoria }> = ({ severidad }) => {
  if (severidad === 'ALTA') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-900">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Alta
      </span>
    );
  }
  if (severidad === 'MEDIA') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-950">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Media
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Baja
    </span>
  );
};

interface AuditoriaTablaProps {
  logs: AuditoriaLogModel[];
  meta: PaginationMeta;
  loading: boolean;
  hayFiltros: boolean;
  onPageChange: (page: number) => void;
  onSelectLog: (log: AuditoriaLogModel) => void;
  onLimpiarFiltros: () => void;
}

export const AuditoriaTabla: React.FC<AuditoriaTablaProps> = ({
  logs,
  meta,
  loading,
  hayFiltros,
  onPageChange,
  onSelectLog,
  onLimpiarFiltros,
}) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <caption className="sr-only">
            Bitácora de auditoría con fecha, severidad, usuario y rol, supervisor aprobador, acción, entidad, impacto financiero y motivo
          </caption>
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-600">
              <th scope="col" className="px-2 py-3">Fecha / Hora</th>
              <th scope="col" className="px-2 py-3">Severidad</th>
              <th scope="col" className="px-2 py-3">Usuario / Rol</th>
              <th scope="col" className="px-2 py-3">Aprobador</th>
              <th scope="col" className="px-2 py-3">Acción</th>
              <th scope="col" className="px-2 py-3">Entidad</th>
              <th scope="col" className="px-2 py-3 text-right">Impacto</th>
              <th scope="col" className="px-2 py-3">Motivo</th>
              <th scope="col" className="px-2 py-3 text-right">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <TableSkeleton rows={6} cols={9} label="Cargando registros de auditoría..." />
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <EmptyState
                    icon={ShieldCheck}
                    title="Sin registros de auditoría"
                    description={
                      hayFiltros
                        ? 'No se encontraron eventos que coincidan con los filtros seleccionados.'
                        : 'Aún no se han registrado eventos en la bitácora del sistema.'
                    }
                    action={
                      hayFiltros
                        ? { label: 'Limpiar filtros', onClick: onLimpiarFiltros, variant: 'secondary' }
                        : undefined
                    }
                  />
                </td>
              </tr>
            ) : (
              logs.map((l) => {
                const impacto = l.impactoFinanciero;
                const impactoClass =
                  impacto === null || impacto === 0
                    ? 'text-slate-600'
                    : impacto < 0
                      ? 'font-bold text-red-700'
                      : 'font-bold text-emerald-700';

                return (
                  <tr
                    key={l.id}
                    onClick={() => onSelectLog(l)}
                    className="cursor-pointer transition hover:bg-slate-50"
                  >
                    <td className="whitespace-nowrap px-2 py-3 text-xs text-slate-600">
                      <p className="font-semibold text-slate-800">{formatDateTime(l.createdAt)}</p>
                      {l.cajaSesionId !== null && (
                        <p className="text-slate-600">Turno #{l.cajaSesionId}</p>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <SeveridadBadge severidad={l.severidad} />
                    </td>
                    <td className="px-2 py-3">
                      <p className="font-semibold text-slate-900">{l.usuarioNombre}</p>
                      <p className="text-xs text-slate-600">
                        {l.rolNombre}
                        {l.actorRolCodigo ? ` (${l.actorRolCodigo})` : ''}
                      </p>
                    </td>
                    <td className="px-2 py-3 text-xs text-slate-700">
                      {l.aprobadorNombre ? (
                        <>
                          <p className="font-semibold text-slate-900">{l.aprobadorNombre}</p>
                          <p className="text-slate-600">@{l.aprobadorUsername}</p>
                        </>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <p className="text-xs font-bold text-slate-900">
                        {etiquetaAccionAuditoria(l.accion)}
                      </p>
                    </td>
                    <td className="px-2 py-3 text-xs font-medium text-slate-700">
                      {l.entidad}
                      {l.entidadId ? ` #${l.entidadId}` : ''}
                    </td>
                    <td className={`whitespace-nowrap px-2 py-3 text-right text-xs ${impactoClass}`}>
                      {impacto === null
                        ? '—'
                        : impacto > 0
                          ? `+${formatCurrency(impacto)}`
                          : formatCurrency(impacto)}
                    </td>
                    <td className="max-w-[220px] px-2 py-3 text-xs text-slate-600">
                      <p className="line-clamp-2">{l.motivo || '—'}</p>
                    </td>
                    <td className="px-2 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onSelectLog(l)}
                        aria-label={`Ver detalle del evento ${l.id}: ${etiquetaAccionAuditoria(l.accion)}`}
                        className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-100"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        Ver
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination meta={meta} onPageChange={onPageChange} />
    </div>
  );
};
