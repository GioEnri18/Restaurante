import React from 'react';
import { RotateCcw } from 'lucide-react';
import { etiquetaAccionAuditoria } from '../../../adapters/auditoria.adapter';
import { env } from '../../../config/env';
import { AuditoriaCatalogoModel, AuditoriaFiltrosState } from '../../../models';
import { formatDateTime } from '../../../utils/formatters';
import { Field } from '../common/Field';

interface AuditoriaFiltrosProps {
  filtros: AuditoriaFiltrosState;
  catalogo: AuditoriaCatalogoModel;
  hayFiltros: boolean;
  onChange: (parcial: Partial<AuditoriaFiltrosState>) => void;
  onLimpiar: () => void;
}

export const AuditoriaFiltros: React.FC<AuditoriaFiltrosProps> = ({
  filtros,
  catalogo,
  hayFiltros,
  onChange,
  onLimpiar,
}) => {
  return (
    <section
      aria-label="Filtros de investigación de auditoría"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Fecha inicial" labelClassName="mb-1 block text-xs font-bold text-slate-700">
          <input
            type="date"
            value={filtros.fechaDesde}
            onChange={(e) => onChange({ fechaDesde: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
        </Field>

        <Field label="Fecha final" labelClassName="mb-1 block text-xs font-bold text-slate-700">
          <input
            type="date"
            value={filtros.fechaHasta}
            onChange={(e) => onChange({ fechaHasta: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
        </Field>

        <Field label="Severidad" labelClassName="mb-1 block text-xs font-bold text-slate-700">
          <select
            value={filtros.severidad}
            onChange={(e) => onChange({ severidad: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          >
            <option value="">Todas las severidades</option>
            <option value="ALTA">Alta (crítica)</option>
            <option value="MEDIA">Media (atención)</option>
            <option value="BAJA">Baja (operación normal)</option>
          </select>
        </Field>

        <Field label="Acción" labelClassName="mb-1 block text-xs font-bold text-slate-700">
          <select
            value={filtros.accion}
            onChange={(e) => onChange({ accion: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          >
            <option value="">Todas las acciones</option>
            {catalogo.acciones.map((a) => (
              <option key={a} value={a}>
                {etiquetaAccionAuditoria(a)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Usuario (actor)" labelClassName="mb-1 block text-xs font-bold text-slate-700">
          <select
            value={filtros.usuarioId}
            onChange={(e) => onChange({ usuarioId: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          >
            <option value="">Todos los usuarios</option>
            {catalogo.usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombreCompleto} (@{u.username})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Supervisor aprobador" labelClassName="mb-1 block text-xs font-bold text-slate-700">
          <select
            value={filtros.aprobadorId}
            onChange={(e) => onChange({ aprobadorId: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          >
            <option value="">Todos los aprobadores</option>
            {catalogo.aprobadores.map((ap) => (
              <option key={ap.id} value={ap.id}>
                {ap.nombreCompleto} (@{ap.username})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Turno de caja" labelClassName="mb-1 block text-xs font-bold text-slate-700">
          <select
            value={filtros.cajaSesionId}
            onChange={(e) => onChange({ cajaSesionId: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          >
            <option value="">Todos los turnos</option>
            {catalogo.turnos.map((t) => (
              <option key={t.id} value={t.id}>
                Turno #{t.id} · {formatDateTime(t.fechaApertura)} ({t.estado === 'ABIERTA' ? 'Abierto' : 'Cerrado'})
              </option>
            ))}
          </select>
        </Field>

        <div className="flex items-end gap-2">
          <Field
            label={`Impacto mínimo (${env.CURRENCY_SYMBOL})`}
            labelClassName="mb-1 block text-xs font-bold text-slate-700"
            className="flex-1"
          >
            <input
              type="number"
              step="0.01"
              min="0"
              value={filtros.impactoMin}
              onChange={(e) => onChange({ impactoMin: e.target.value })}
              placeholder="Ej. 50.00"
              className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </Field>

          <button
            type="button"
            disabled={!hayFiltros}
            onClick={onLimpiar}
            aria-label="Limpiar filtros de auditoría"
            title="Limpiar filtros"
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span className="hidden xl:inline">Limpiar</span>
          </button>
        </div>
      </div>
    </section>
  );
};
