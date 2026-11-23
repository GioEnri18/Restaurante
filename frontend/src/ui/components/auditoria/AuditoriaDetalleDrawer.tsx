import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Link2, Loader2 } from 'lucide-react';
import {
  calcularDiffCampos,
  etiquetaAccionAuditoria,
  etiquetaCampoAuditoria,
  etiquetaCodigoMotivo,
} from '../../../adapters/auditoria.adapter';
import { AuditoriaDetalleModel, AuditoriaLogModel } from '../../../models';
import { useAuthStore } from '../../../store/auth.store';
import { formatCurrency, formatDateTime } from '../../../utils/formatters';
import { Alert } from '../common/Alert';
import { Modal } from '../common/Modal';
import { SeveridadBadge } from './AuditoriaTabla';

interface AuditoriaDetalleDrawerProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  detalle: AuditoriaDetalleModel | null;
  fallbackLog: AuditoriaLogModel | null;
  onClose: () => void;
  onAbrirCorrelacionado: (log: AuditoriaLogModel) => void;
}

const PATRON_MONEDA = /precio|monto|total|diferencia|sueldo|costo|impacto|egreso|ingreso/i;
const PATRON_FECHA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function formatearPrimitivo(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'number') {
    if (PATRON_MONEDA.test(campo)) return formatCurrency(valor);
    if (/oz$/i.test(campo)) return `${valor} oz`;
    if (/lb$/i.test(campo)) return `${valor} lb`;
    return String(valor);
  }
  if (typeof valor === 'string') {
    if (PATRON_FECHA_ISO.test(valor)) return formatDateTime(valor);
    return valor;
  }
  return String(valor);
}

function esObjetoPlano(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

/**
 * Renderiza cualquier valor de auditoría en formato humano legible (listas/tarjetas),
 * sin exponer JSON técnico crudo (llaves, corchetes ni comillas).
 */
const ValorAuditoriaLegible: React.FC<{
  campo: string;
  valor: unknown;
  tachado?: boolean;
}> = ({ campo, valor, tachado = false }) => {
  if (valor === null || valor === undefined || valor === '') {
    return <span className="text-slate-400">—</span>;
  }

  if (typeof valor !== 'object') {
    const texto = formatearPrimitivo(campo, valor);
    return tachado ? <span className="line-through text-red-700">{texto}</span> : <span>{texto}</span>;
  }

  if (Array.isArray(valor)) {
    if (valor.length === 0) {
      return <span className="text-slate-500">Sin elementos</span>;
    }

    // Arreglo de valores simples (ej. lista de códigos de permisos)
    if (valor.every((item) => item === null || typeof item !== 'object')) {
      return (
        <ul className="flex flex-wrap gap-1">
          {valor.map((item, idx) => (
            <li
              key={idx}
              className={`rounded-md border px-2 py-0.5 text-xs ${
                tachado
                  ? 'border-red-200 bg-red-50 text-red-700 line-through'
                  : 'border-slate-200 bg-slate-50 text-slate-800'
              }`}
            >
              {formatearPrimitivo(campo, item)}
            </li>
          ))}
        </ul>
      );
    }

    // Arreglo de objetos (ej. ítems de compra, receta, vouchers conciliados)
    return (
      <div className="space-y-2">
        {valor.map((item, idx) => (
          <div
            key={idx}
            className={`rounded-lg border p-2.5 text-xs ${
              tachado
                ? 'border-red-200 bg-red-50/50 text-red-800'
                : 'border-slate-200 bg-slate-50/70 text-slate-800'
            }`}
          >
            <p className="mb-1 text-xs font-extrabold text-slate-700">Registro #{idx + 1}</p>
            {esObjetoPlano(item) ? (
              <dl className="space-y-0.5">
                {Object.entries(item)
                  .filter(([, v]) => v !== null && v !== undefined && v !== '')
                  .map(([k, v]) => (
                    <div key={k} className="flex flex-wrap justify-between gap-x-2">
                      <dt className="font-semibold text-slate-600">{etiquetaCampoAuditoria(k)}:</dt>
                      <dd className={tachado ? 'font-medium line-through' : 'font-bold text-slate-900'}>
                        {typeof v === 'object' ? (
                          <ValorAuditoriaLegible campo={k} valor={v} tachado={tachado} />
                        ) : (
                          formatearPrimitivo(k, v)
                        )}
                      </dd>
                    </div>
                  ))}
              </dl>
            ) : (
              <span>{formatearPrimitivo(campo, item)}</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Objeto plano anidado
  const entradas = Object.entries(valor as Record<string, unknown>).filter(
    ([, v]) => v !== null && v !== undefined && v !== '',
  );
  if (entradas.length === 0) {
    return <span className="text-slate-400">—</span>;
  }
  return (
    <dl className="space-y-1">
      {entradas.map(([k, v]) => (
        <div key={k} className="flex flex-wrap justify-between gap-x-2">
          <dt className="font-semibold text-slate-600">{etiquetaCampoAuditoria(k)}:</dt>
          <dd className={tachado ? 'font-medium text-red-700 line-through' : 'font-bold text-slate-900'}>
            {typeof v === 'object' ? (
              <ValorAuditoriaLegible campo={k} valor={v} tachado={tachado} />
            ) : (
              formatearPrimitivo(k, v)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
};

export const AuditoriaDetalleDrawer: React.FC<AuditoriaDetalleDrawerProps> = ({
  open,
  loading,
  error,
  detalle,
  fallbackLog,
  onClose,
  onAbrirCorrelacionado,
}) => {
  const can = useAuthStore((s) => s.can);
  const isAdmin = useAuthStore((s) => s.isAdmin());

  const log = detalle ?? fallbackLog;
  const diffCampos = log ? calcularDiffCampos(log.valorAnterior, log.valorNuevo) : [];
  const motivoEtiqueta = etiquetaCodigoMotivo(log?.codigoMotivo);

  const puedeAbrirEntidad = Boolean(
    detalle?.entidadOrigen &&
      can(detalle.entidadOrigen.permisoRequerido) &&
      (!detalle.entidadOrigen.soloAdmin || isAdmin),
  );

  return (
    <Modal
      open={open}
      variant="drawer"
      maxWidthClass="max-w-2xl"
      title={log ? `${etiquetaAccionAuditoria(log.accion)} · #${log.id}` : 'Detalle de auditoría'}
      onClose={onClose}
    >
      {error && <Alert type="error" message={error} className="mb-4" />}

      {!log && loading ? (
        <div role="status" className="flex flex-col items-center justify-center gap-2 py-12 text-slate-600">
          <Loader2 className="h-6 w-6 animate-spin text-brand-700" aria-hidden="true" />
          <p className="text-sm font-semibold">Cargando detalle del evento…</p>
        </div>
      ) : log ? (
        <div className="space-y-5 text-sm">
          {/* Resumen en lenguaje natural + Severidad */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <SeveridadBadge severidad={log.severidad} />
              <span className="text-xs font-semibold text-slate-600">
                {formatDateTime(log.createdAt)}
              </span>
            </div>
            <p className="text-sm font-bold leading-relaxed text-slate-900">
              {log.resumenNatural}
            </p>
            {puedeAbrirEntidad && detalle?.entidadOrigen && (
              <div className="mt-3 border-t border-slate-200 pt-3">
                <Link
                  to={detalle.entidadOrigen.ruta}
                  onClick={onClose}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-brand-700 px-3.5 text-xs font-bold text-white hover:bg-brand-800"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Ir a {detalle.entidadOrigen.etiqueta}
                </Link>
              </div>
            )}
          </div>

          {/* Metadatos de contexto */}
          <dl className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs sm:grid-cols-2">
            <div>
              <dt className="font-semibold uppercase text-slate-600">Usuario (actor)</dt>
              <dd className="mt-0.5 font-bold text-slate-900">
                {log.usuarioNombre} (@{log.usuarioUsername})
              </dd>
              <dd className="text-slate-600">
                Rol al ejecutar: {log.actorRolCodigo ?? log.rolNombre}
              </dd>
            </div>
            <div>
              <dt className="font-semibold uppercase text-slate-600">Supervisor aprobador</dt>
              <dd className="mt-0.5 font-bold text-slate-900">
                {log.aprobadorNombre
                  ? `${log.aprobadorNombre} (@${log.aprobadorUsername})`
                  : 'Sin control dual'}
              </dd>
            </div>
            <div>
              <dt className="font-semibold uppercase text-slate-600">Entidad y turno</dt>
              <dd className="mt-0.5 font-bold text-slate-900">
                {log.entidad} {log.entidadId ? `#${log.entidadId}` : ''}
                {log.cajaSesionId !== null ? ` · Turno #${log.cajaSesionId}` : ''}
              </dd>
            </div>
            <div>
              <dt className="font-semibold uppercase text-slate-600">Impacto financiero</dt>
              <dd
                className={`mt-0.5 font-extrabold ${
                  log.impactoFinanciero === null || log.impactoFinanciero === 0
                    ? 'text-slate-700'
                    : log.impactoFinanciero < 0
                      ? 'text-red-700'
                      : 'text-emerald-700'
                }`}
              >
                {log.impactoFinanciero === null
                  ? 'Sin impacto monetario'
                  : log.impactoFinanciero > 0
                    ? `+${formatCurrency(log.impactoFinanciero)}`
                    : formatCurrency(log.impactoFinanciero)}
              </dd>
            </div>
            <div>
              <dt className="font-semibold uppercase text-slate-600">Motivo registrado</dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {motivoEtiqueta && (
                  <span className="mr-1.5 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-800">
                    {motivoEtiqueta}
                  </span>
                )}
                {log.motivo || 'Sin nota libre'}
              </dd>
            </div>
            <div>
              <dt className="font-semibold uppercase text-slate-600">Dirección IP</dt>
              <dd className="mt-0.5 font-mono text-slate-800">{log.ipAddress || '—'}</dd>
            </div>
          </dl>

          {/* Diff legible antes vs después (sin JSON crudo) */}
          <section aria-label="Comparación antes y después" className="space-y-2">
            <h4 className="text-sm font-extrabold text-slate-900">
              Cambios registrados (antes vs. después)
            </h4>
            {diffCampos.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                Este evento no registró cambios de valores anteriores o nuevos.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[460px] text-left text-xs">
                  <caption className="sr-only">
                    Tabla comparativa de valores anteriores y nuevos del evento
                  </caption>
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-bold">Campo</th>
                      <th scope="col" className="px-3 py-2 font-bold">Antes</th>
                      <th scope="col" className="px-3 py-2 font-bold">Después</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {diffCampos.map((row) => (
                      <tr
                        key={row.campo}
                        className={row.cambiado ? 'bg-amber-50/70' : 'bg-white'}
                      >
                        <th scope="row" className="px-3 py-2.5 align-top font-bold text-slate-800">
                          <span>{row.etiqueta}</span>
                          {row.cambiado && (
                            <span className="ml-1.5 inline-block rounded bg-amber-200 px-1.5 py-0.5 text-xs font-bold text-amber-950">
                              {row.estado === 'agregado'
                                ? 'Nuevo'
                                : row.estado === 'eliminado'
                                  ? 'Quitado'
                                  : 'Cambió'}
                            </span>
                          )}
                        </th>
                        <td className="px-3 py-2.5 align-top break-words text-slate-600">
                          <ValorAuditoriaLegible
                            campo={row.campo}
                            valor={row.anterior}
                            tachado={row.estado === 'modificado'}
                          />
                        </td>
                        <td className="px-3 py-2.5 align-top break-words font-semibold text-slate-900">
                          <ValorAuditoriaLegible campo={row.campo} valor={row.nuevo} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Eventos correlacionados de la misma operación */}
          {detalle && detalle.eventosCorrelacionados.length > 0 && (
            <section aria-label="Eventos relacionados de la misma operación" className="space-y-2">
              <h4 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900">
                <Link2 className="h-4 w-4 text-brand-700" aria-hidden="true" />
                Otros eventos de la misma operación ({detalle.eventosCorrelacionados.length})
              </h4>
              <div className="space-y-2">
                {detalle.eventosCorrelacionados.map((rel) => (
                  <button
                    key={rel.id}
                    type="button"
                    onClick={() => onAbrirCorrelacionado(rel)}
                    className="flex min-h-[44px] w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-left text-xs hover:bg-slate-50"
                  >
                    <span className="font-bold text-slate-900">
                      #{rel.id} · {etiquetaAccionAuditoria(rel.accion)}
                    </span>
                    <SeveridadBadge severidad={rel.severidad} />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : null}
    </Modal>
  );
};
