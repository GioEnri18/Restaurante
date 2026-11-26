import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, Lock, Clock } from 'lucide-react';
import { CajaSesionModel, PaginationMeta } from '../../models';
import { cajaService } from '../../services/caja.service';
import { useAuthStore } from '../../store/auth.store';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { AperturaCajaPanel } from '../components/caja/AperturaCajaPanel';
import { ArqueoCierreModal } from '../components/caja/ArqueoCierreModal';
import { AutorizacionSupervisor } from '../components/caja/AutorizacionSupervisorFields';
import { HistorialCierresTable } from '../components/caja/HistorialCierresTable';
import { MovimientosTurnoPanel } from '../components/caja/MovimientosTurnoPanel';
import { ResumenCajaTurno } from '../components/caja/ResumenCajaTurno';
import { Alert } from '../components/common/Alert';

export const CajaPage: React.FC = () => {
  const canOpen = useAuthStore((s) => s.can('caja:abrir'));
  const canClose = useAuthStore((s) => s.can('caja:cerrar'));
  const canRegisterWaste = useAuthStore((s) => s.can('mermas:ver') && s.can('mermas:crear'));
  const esCajero = useAuthStore((s) => s.usuario?.rol?.codigo === 'CAJERO');
  const puedeVerHistorial = !esCajero;
  // Control dual: sin caja:autorizar (p. ej. un cajero) se piden credenciales de un supervisor
  const requiereAutorizacion = !useAuthStore((s) => s.can('caja:autorizar'));

  const [actual, setActual] = useState<CajaSesionModel | null>(null);
  const [historial, setHistorial] = useState<CajaSesionModel[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [closeModal, setCloseModal] = useState(false);

  const cargar = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const [cajaActual, hist] = await Promise.all([
        cajaService.obtenerActual(),
        puedeVerHistorial ? cajaService.listarHistorial(page) : Promise.resolve(null),
      ]);
      setActual(cajaActual);
      if (hist) {
        setHistorial(hist.items);
        setMeta(hist.meta);
      } else {
        setHistorial([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando información de caja');
    } finally {
      setLoading(false);
    }
  }, [puedeVerHistorial]);

  useEffect(() => {
    void cargar(1);
  }, [cargar]);

  const handleAbrirCaja = async (
    montoInicial: number,
    observaciones?: string,
    autorizacion?: AutorizacionSupervisor,
  ): Promise<boolean> => {
    setError(null);
    setSuccess(null);
    try {
      await cajaService.abrir(montoInicial, observaciones, autorizacion);
      setSuccess('Turno de caja abierto correctamente. El punto de venta ya está habilitado.');
      await cargar(1);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir la caja');
      return false;
    }
  };

  const handleCerrarCaja = async (payload: Parameters<typeof cajaService.cerrar>[0]) => {
    setError(null);
    setSuccess(null);
    const cerrada = await cajaService.cerrar(payload);
    setCloseModal(false);
    const totalCobros = cerrada.totalVentasEfectivo + cerrada.totalVentasTarjeta;
    const textoAnulaciones =
      cerrada.totalEgresos > 0 ? ` · Anulaciones: −${formatCurrency(cerrada.totalEgresos)}` : '';
    setSuccess(
      `Turno #${cerrada.id} cerrado. Cobros por ventas: ${formatCurrency(totalCobros)} (${formatCurrency(cerrada.totalVentasEfectivo)} efectivo + ${formatCurrency(cerrada.totalVentasTarjeta)} tarjeta)${textoAnulaciones}. Esperado en gaveta: ${formatCurrency(cerrada.montoEsperadoEfectivo)} · Contado: ${formatCurrency(cerrada.montoContadoEfectivo ?? 0)} · Diferencia: ${formatCurrency(cerrada.diferencia ?? 0)}.`,
    );
    await cargar(1);
  };

  return (
    <div className="space-y-5">
      {/* ==================== HEADER PROFESIONAL DE TURNO ==================== */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
              actual
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            <Wallet className="h-7 w-7" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-extrabold text-slate-900">Caja del turno</h1>
              {actual ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-100 px-3 py-1 text-xs font-extrabold text-teal-800">
                  <span className="h-2 w-2 rounded-full bg-teal-700" aria-hidden="true" />
                  TURNO #{actual.id} ABIERTO
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-3 py-1 text-xs font-extrabold text-slate-700">
                  CAJA CERRADA
                </span>
              )}
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
              {actual ? (
                <>
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  Abierta el {formatDateTime(actual.fechaApertura)} por{' '}
                  <strong className="text-slate-700">{actual.usuarioAperturaNombre}</strong>
                </>
              ) : (
                'Abre un turno con fondo inicial para habilitar las ventas y el registro de cobros.'
              )}
            </p>
          </div>
        </div>

        {actual && (
          <div className="flex flex-wrap gap-2.5">
            {canRegisterWaste && (
              <Link to="/mermas" className="inline-flex min-h-[46px] items-center rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-800 hover:bg-slate-50">
                Registrar merma de hoy
              </Link>
            )}
            {canClose && (
              <button
                type="button"
                onClick={() => setCloseModal(true)}
                className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-extrabold text-white shadow-md shadow-red-600/20 transition hover:bg-red-700"
              >
                <Lock className="h-4 w-4" aria-hidden="true" />
                Cuadrar y cerrar turno
              </button>
            )}
          </div>
        )}
      </div>

      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      {actual?.domiciliosPendientesLiquidar &&
        (actual.domiciliosPendientesLiquidar.cantidad > 0 ||
          actual.domiciliosPendientesLiquidar.enRutaCantidad > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <div>
              {actual.domiciliosPendientesLiquidar.cantidad > 0 && (
                <p className="font-extrabold">
                  Hay {actual.domiciliosPendientesLiquidar.cantidad} entrega(s) a domicilio contra entrega
                  pendientes de liquidar ({formatCurrency(actual.domiciliosPendientesLiquidar.montoTotal)}).
                  {actual.domiciliosPendientesLiquidar.bloquearCierre &&
                    ' Debes liquidarlas antes de cerrar la caja.'}
                </p>
              )}
              {actual.domiciliosPendientesLiquidar.enRutaCantidad > 0 && (
                <p className="text-xs text-amber-800">
                  Pedidos actualmente en ruta: {actual.domiciliosPendientesLiquidar.enRutaCantidad}
                </p>
              )}
            </div>
            <Link
              to="/domicilios?pendientes=true"
              className="inline-flex min-h-[40px] items-center rounded-xl bg-amber-700 px-3.5 text-xs font-extrabold text-white hover:bg-amber-800"
            >
              Ir a liquidar entregas
            </Link>
          </div>
        )}

      {loading ? (
        <div className="rounded-2xl bg-white p-12 text-center text-slate-600">Cargando estado de caja...</div>
      ) : !actual ? (
        <AperturaCajaPanel
          canOpen={canOpen}
          requiereAutorizacion={requiereAutorizacion}
          onAbrirCaja={handleAbrirCaja}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <ResumenCajaTurno actual={actual} />
          <MovimientosTurnoPanel key={actual.id} />
        </div>
      )}

      {puedeVerHistorial && (
        <HistorialCierresTable
          historial={historial}
          loading={loading}
          meta={meta}
          onPageChange={(p) => void cargar(p)}
        />
      )}

      <ArqueoCierreModal
        open={closeModal}
        actual={actual}
        requiereAutorizacion={requiereAutorizacion}
        onClose={() => setCloseModal(false)}
        onConfirmarCierre={handleCerrarCaja}
      />
    </div>
  );
};
