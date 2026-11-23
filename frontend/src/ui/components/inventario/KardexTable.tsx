import React from 'react';
import { History } from 'lucide-react';
import { InventarioMovimientoModel, PaginationMeta } from '../../../models';
import { formatDateTime } from '../../../utils/formatters';
import { Badge } from '../common/Badge';
import { EmptyState } from '../common/EmptyState';
import { Pagination } from '../common/Pagination';
import { TableSkeleton } from '../common/TableSkeleton';

interface KardexTableProps {
  movimientos: InventarioMovimientoModel[];
  cargando?: boolean;
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  onIrACompras?: () => void;
}

const ETIQUETA_MOVIMIENTO: Record<string, string> = {
  ENTRADA_COMPRA: 'Compra',
  SALIDA_VENTA: 'Venta',
  SALIDA_MERMA: 'Merma',
  AJUSTE_MANUAL: 'Ajuste de conteo',
  AJUSTE_POSITIVO: 'Ajuste (+)',
  AJUSTE_NEGATIVO: 'Ajuste (−)',
  REINTEGRO_ANULACION: 'Reintegro por anulación',
};

function formatearTipoMovimiento(tipo: string): string {
  if (ETIQUETA_MOVIMIENTO[tipo]) return ETIQUETA_MOVIMIENTO[tipo];
  const limpio = tipo.toLowerCase().replaceAll('_', ' ');
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

export const KardexTable: React.FC<KardexTableProps> = ({
  movimientos,
  cargando = false,
  meta,
  onPageChange,
  onIrACompras,
}) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-xs sm:text-sm">
          <caption className="sr-only">
            Historial de movimientos de inventario (Kardex en onzas)
          </caption>
          <thead>
            <tr className="border-b text-xs uppercase text-slate-500">
              <th scope="col" className="py-3 px-2">Fecha</th>
              <th scope="col" className="py-3 px-2">Ingrediente</th>
              <th scope="col" className="py-3 px-2">Tipo</th>
              <th scope="col" className="py-3 px-2 text-right">Movimiento (oz)</th>
              <th scope="col" className="py-3 px-2 text-right">Anterior → Nuevo</th>
              <th scope="col" className="py-3 px-2">Motivo / Responsable</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando ? (
              <TableSkeleton rows={6} cols={6} label="Cargando historial de movimientos..." />
            ) : movimientos.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={History}
                    title="Sin movimientos de inventario"
                    description="Las compras, consumos por venta, ajustes y mermas aparecerán aquí automáticamente."
                    action={
                      onIrACompras
                        ? { label: 'Registrar una compra', onClick: onIrACompras, variant: 'secondary' }
                        : undefined
                    }
                  />
                </td>
              </tr>
            ) : (
              movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="py-2.5 px-2 text-slate-500">{formatDateTime(m.createdAt)}</td>
                  <td className="py-2.5 px-2 font-semibold">{m.ingredienteNombre}</td>
                  <td className="py-2.5 px-2">
                    <Badge
                      variant={
                        m.cantidadOz >= 0
                          ? 'success'
                          : m.tipo === 'SALIDA_MERMA'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {formatearTipoMovimiento(m.tipo)}
                    </Badge>
                  </td>
                  <td
                    className={`py-2.5 px-2 text-right font-bold ${
                      m.cantidadOz >= 0 ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    {m.cantidadOz >= 0 ? '+' : ''}
                    {m.cantidadOz.toFixed(2)} oz
                  </td>
                  <td className="py-2.5 px-2 text-right text-slate-600">
                    {m.stockAnteriorOz.toFixed(1)} → <strong>{m.stockNuevoOz.toFixed(1)} oz</strong>
                  </td>
                  <td className="py-2.5 px-2 text-xs text-slate-600">
                    <p>{m.motivo || '—'}</p>
                    <p className="text-slate-600">{m.usuarioNombre}</p>
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
