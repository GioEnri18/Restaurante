import React from 'react';
import { Link } from 'react-router-dom';
import { Store, Printer, AlertTriangle, Sparkles } from 'lucide-react';
import { MenuDataModel, TicketImprimibleModel } from '../../../models';

interface VentasStatusHeaderProps {
  menu: MenuDataModel | null;
  habilitarMesas: boolean;
  canOpenCaja: boolean;
  ultimoTicket: TicketImprimibleModel | null;
  selectedCat: number | 'ESPECIAL' | null;
  onReimprimirUltimo: (ticket: TicketImprimibleModel) => void;
  onToggleEspecial: () => void;
}

export const VentasStatusHeader: React.FC<VentasStatusHeaderProps> = ({
  menu,
  habilitarMesas,
  canOpenCaja,
  ultimoTicket,
  selectedCat,
  onReimprimirUltimo,
  onToggleEspecial,
}) => {
  return (
    <>
      {/* BARRA SUPERIOR DE ESTADO POS (MOSTRADOR) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold ${
              menu?.cajaAbierta
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                : 'bg-red-50 text-red-700 ring-1 ring-red-200'
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                menu?.cajaAbierta ? 'animate-pulse bg-emerald-500' : 'bg-red-500'
              }`}
            />
            {menu?.cajaAbierta ? `Caja Abierta (Turno #${menu.cajaSesionId})` : 'Caja Cerrada'}
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
            <Store className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
            {habilitarMesas ? 'Servicio: Mostrador y Mesas' : 'Servicio en Mostrador'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {ultimoTicket && (
            <button
              type="button"
              onClick={() => onReimprimirUltimo(ultimoTicket)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              <Printer className="h-4 w-4 text-brand-600" aria-hidden="true" />
              Último ticket ({ultimoTicket.factura.numeroCompleto})
            </button>
          )}
          {menu && !menu.cajaAbierta && (
            canOpenCaja ? (
              <Link
                to="/caja"
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700"
              >
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                Abrir Caja para Vender
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                Solicita al Administrador abrir caja
              </span>
            )
          )}
        </div>
      </div>

      {/* BANNER FESTIVO SI HAY UN MENÚ ESPECIAL ACTIVO HOY */}
      {menu?.menuEspecialActivo && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-brand-700 to-rose-700 px-5 py-3.5 text-white shadow-md">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 shrink-0 text-amber-200" aria-hidden="true" />
            <div>
              <p className="text-sm font-black uppercase tracking-wide">
                Menú Especial Vigente Hoy: {menu.menuEspecialActivo.nombre}
              </p>
              {menu.menuEspecialActivo.descripcion && (
                <p className="text-xs text-white/90">{menu.menuEspecialActivo.descripcion}</p>
              )}
            </div>
          </div>
          {menu.menuEspecialActivo.platillosIds.length > 0 && (
            <button
              type="button"
              onClick={onToggleEspecial}
              className="rounded-xl bg-white px-3.5 py-2 text-xs font-extrabold text-brand-700 shadow-sm hover:bg-amber-50"
            >
              {selectedCat === 'ESPECIAL' ? 'Ver menú general' : 'Ver menú de temporada'}
            </button>
          )}
        </div>
      )}
    </>
  );
};
