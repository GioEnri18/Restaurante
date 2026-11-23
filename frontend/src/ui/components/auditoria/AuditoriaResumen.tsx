import React from 'react';
import {
  AlertTriangle,
  Ban,
  Info,
  Printer,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Wallet,
} from 'lucide-react';
import {
  AuditoriaAlertaModel,
  AuditoriaResumenModel,
  SeveridadAuditoria,
} from '../../../models';
import { formatCurrency } from '../../../utils/formatters';

interface AuditoriaResumenProps {
  resumen: AuditoriaResumenModel | null;
  loading: boolean;
  onFiltrarAlerta: (alerta: AuditoriaAlertaModel) => void;
  onFiltrarUsuario: (usuarioId: number) => void;
  onFiltrarAprobador: (aprobadorId: number) => void;
  onFiltrarSeveridad: (severidad: SeveridadAuditoria) => void;
}

export const AuditoriaResumen: React.FC<AuditoriaResumenProps> = ({
  resumen,
  loading,
  onFiltrarAlerta,
  onFiltrarUsuario,
  onFiltrarAprobador,
  onFiltrarSeveridad,
}) => {
  if (loading && !resumen) {
    return (
      <div className="space-y-4" aria-busy="true">
        <p role="status" className="sr-only">
          Cargando resumen de auditoría...
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              aria-hidden="true"
              className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!resumen) return null;

  const diffCaja = resumen.diferenciaNetaCaja;
  const diffColor =
    diffCaja < 0 ? 'text-red-700' : diffCaja > 0 ? 'text-sky-700' : 'text-emerald-700';

  return (
    <section aria-label="Resumen gerencial de auditoría" className="space-y-4">
      {/* Tarjetas KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Eventos filtrados
            </p>
            <ShieldCheck className="h-4 w-4 text-slate-600" aria-hidden="true" />
          </div>
          <p className="mt-1 text-2xl font-black text-slate-900">{resumen.totalEventos}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => onFiltrarSeveridad('ALTA')}
              className="inline-flex min-h-[28px] items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 text-xs font-bold text-red-800 hover:bg-red-100"
            >
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              Alta: {resumen.porSeveridad.ALTA}
            </button>
            <button
              type="button"
              onClick={() => onFiltrarSeveridad('MEDIA')}
              className="inline-flex min-h-[28px] items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              Media: {resumen.porSeveridad.MEDIA}
            </button>
            <button
              type="button"
              onClick={() => onFiltrarSeveridad('BAJA')}
              className="inline-flex min-h-[28px] items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200"
            >
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
              Baja: {resumen.porSeveridad.BAJA}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Total anulado
            </p>
            <Ban className="h-4 w-4 text-red-700" aria-hidden="true" />
          </div>
          <p className="mt-1 text-2xl font-black text-red-700">
            {formatCurrency(resumen.impactoTotalAnulado)}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Suma de facturas anuladas en el período filtrado.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Diferencia neta de caja
            </p>
            <Wallet className="h-4 w-4 text-slate-600" aria-hidden="true" />
          </div>
          <p className={`mt-1 text-2xl font-black ${diffColor}`}>
            {diffCaja > 0 ? `+${formatCurrency(diffCaja)}` : formatCurrency(diffCaja)}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {diffCaja === 0
              ? 'Cierres cuadrados sin faltante ni sobrante.'
              : diffCaja < 0
                ? 'Faltante acumulado (contado menor que esperado).'
                : 'Sobrante acumulado (contado mayor que esperado).'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Reimpresiones
            </p>
            <Printer className="h-4 w-4 text-sky-700" aria-hidden="true" />
          </div>
          <p className="mt-1 text-2xl font-black text-slate-900">{resumen.cantidadReimpresiones}</p>
          <p className="mt-1 text-xs text-slate-600">
            Copias adicionales de facturas emitidas.
          </p>
        </div>
      </div>

      {/* Bloque de alertas de patrones repetitivos */}
      {resumen.alertas.length > 0 && (
        <div
          role="region"
          aria-label="Alertas de patrones repetitivos"
          className="rounded-2xl border border-red-200 bg-red-50/70 p-4 shadow-sm"
        >
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-700" aria-hidden="true" />
            <h2 className="text-sm font-extrabold text-red-900">
              Alertas de patrones repetitivos ({resumen.alertas.length})
            </h2>
          </div>
          <div className="space-y-2">
            {resumen.alertas.map((alerta, idx) => (
              <div
                key={`${alerta.tipo}-${alerta.usuarioId ?? ''}-${alerta.aprobadorId ?? ''}-${alerta.cajaSesionId ?? idx}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-white p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">{alerta.titulo}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{alerta.detalle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onFiltrarAlerta(alerta)}
                  className="inline-flex min-h-[44px] shrink-0 items-center rounded-xl bg-brand-700 px-3.5 text-xs font-bold text-white hover:bg-brand-800"
                >
                  Investigar eventos
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rankings (usuarios con riesgo / aprobadores) */}
      {(resumen.rankingUsuariosRiesgo.length > 0 || resumen.rankingAprobadores.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-700" aria-hidden="true" />
              <h2 className="text-sm font-extrabold text-slate-900">
                Usuarios con más eventos de severidad Alta / anulaciones
              </h2>
            </div>
            {resumen.rankingUsuariosRiesgo.length === 0 ? (
              <p className="text-xs text-slate-600">
                Sin eventos de severidad alta en el período filtrado.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {resumen.rankingUsuariosRiesgo.slice(0, 5).map((u) => (
                  <li key={u.usuarioId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {u.nombreCompleto}
                      </p>
                      <p className="text-xs text-slate-600">
                        @{u.username} · {u.rolNombre ?? u.rolCodigo ?? 'Usuario'} · {u.anulaciones} anul.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onFiltrarUsuario(u.usuarioId)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-800 hover:bg-red-100"
                    >
                      {u.eventosAlta} alta(s)
                      {u.impactoAcumulado > 0 && ` · ${formatCurrency(u.impactoAcumulado)}`}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-teal-700" aria-hidden="true" />
              <h2 className="text-sm font-extrabold text-slate-900">
                Supervisores que más autorizan (control dual)
              </h2>
            </div>
            {resumen.rankingAprobadores.length === 0 ? (
              <p className="text-xs text-slate-600">
                No se registraron autorizaciones de control dual en el período filtrado.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {resumen.rankingAprobadores.slice(0, 5).map((a) => (
                  <li key={a.aprobadorId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {a.nombreCompleto}
                      </p>
                      <p className="text-xs text-slate-600">
                        @{a.username} · {a.rolNombre ?? 'Supervisor'}
                        {a.cierresConDiferencia > 0 &&
                          ` · ${a.cierresConDiferencia} cierre(s) con diferencia`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onFiltrarAprobador(a.aprobadorId)}
                      className="inline-flex min-h-[38px] items-center rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-bold text-teal-900 hover:bg-teal-100"
                    >
                      {a.totalAutorizaciones} autorización(es)
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
