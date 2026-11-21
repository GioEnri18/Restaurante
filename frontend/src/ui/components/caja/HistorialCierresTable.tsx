import React from 'react';
import { History } from 'lucide-react';
import { CajaSesionModel, PaginationMeta } from '../../../models';
import { formatCurrency, formatDateTime } from '../../../utils/formatters';
import { Badge } from '../common/Badge';
import { Pagination } from '../common/Pagination';

interface HistorialCierresTableProps {
  historial: CajaSesionModel[];
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
}

export const HistorialCierresTable: React.FC<HistorialCierresTableProps> = ({
  historial,
  meta,
  onPageChange,
}) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <History className="h-5 w-5 text-slate-600" />
        <h2 className="text-lg font-extrabold text-slate-900">Historial de Cierres y Cuadres</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <th className="py-3 px-2">Turno / Fecha</th>
              <th className="py-3 px-2">Responsables</th>
              <th className="py-3 px-2 text-right">Inicial</th>
              <th className="py-3 px-2 text-right">Ventas Totales</th>
              <th className="py-3 px-2 text-right">Esperado Efec.</th>
              <th className="py-3 px-2 text-right">Contado</th>
              <th className="py-3 px-2 text-right">Diferencia</th>
              <th className="py-3 px-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {historial.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-400">
                  Aún no hay sesiones de caja registradas.
                </td>
              </tr>
            ) : (
              historial.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="py-3 px-2">
                    <p className="font-bold text-slate-900">Turno #{s.id}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(s.fechaApertura)}</p>
                  </td>
                  <td className="py-3 px-2 text-xs text-slate-600">
                    <p>Abre: {s.usuarioAperturaNombre}</p>
                    {s.usuarioCierreNombre && <p>Cierra: {s.usuarioCierreNombre}</p>}
                  </td>
                  <td className="py-3 px-2 text-right">{formatCurrency(s.montoInicial)}</td>
                  <td className="py-3 px-2 text-right font-semibold text-slate-800">
                    {formatCurrency(s.totalVentasEfectivo + s.totalVentasTarjeta)}
                  </td>
                  <td className="py-3 px-2 text-right font-semibold">
                    {formatCurrency(s.montoEsperadoEfectivo)}
                  </td>
                  <td className="py-3 px-2 text-right">
                    {s.montoContadoEfectivo !== null ? formatCurrency(s.montoContadoEfectivo) : '—'}
                  </td>
                  <td className="py-3 px-2 text-right">
                    {s.diferencia === null ? (
                      <span className="text-slate-400">—</span>
                    ) : s.diferencia === 0 ? (
                      <Badge variant="success">Exacto Q 0.00</Badge>
                    ) : s.diferencia > 0 ? (
                      <Badge variant="info">+{formatCurrency(s.diferencia)}</Badge>
                    ) : (
                      <Badge variant="danger">{formatCurrency(s.diferencia)}</Badge>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    <Badge variant={s.estado === 'ABIERTA' ? 'success' : 'neutral'}>
                      {s.estado}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination meta={meta} onPageChange={onPageChange} />
    </div>
  );
};
