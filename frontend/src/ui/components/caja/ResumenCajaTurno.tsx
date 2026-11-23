import React from 'react';
import { Banknote, CreditCard } from 'lucide-react';
import { CajaSesionModel } from '../../../models';
import { formatCurrency } from '../../../utils/formatters';

interface ResumenCajaTurnoProps {
  actual: CajaSesionModel;
}

export const ResumenCajaTurno: React.FC<ResumenCajaTurnoProps> = ({ actual }) => {
  const totalVentasBrutas = actual.totalVentasEfectivo + actual.totalVentasTarjeta;
  const totalAnulaciones = actual.totalEgresosEfectivo + actual.totalEgresosTarjeta;
  const totalVentasNetas = Math.max(0, totalVentasBrutas - totalAnulaciones);
  const efectivoNetoVentas = Math.max(0, actual.totalVentasEfectivo - actual.totalEgresosEfectivo);
  const tarjetaNetaVentas = Math.max(0, actual.totalTarjetaNeto);
  const baseProporcion = efectivoNetoVentas + tarjetaNetaVentas;
  const pctEfectivo =
    baseProporcion > 0 ? Math.round((efectivoNetoVentas / baseProporcion) * 100) : 0;
  const pctTarjeta = baseProporcion > 0 ? 100 - pctEfectivo : 0;

  const tieneAnulacionesEfectivo = actual.totalEgresosEfectivo > 0;
  const tieneIngresosExtraHistoricos = actual.totalIngresosExtra > 0;
  const columnasGaveta =
    2 + (tieneAnulacionesEfectivo ? 1 : 0) + (tieneIngresosExtraHistoricos ? 1 : 0);

  return (
    <>
      {/* Bloque Izquierdo (7 cols): Ecuación limpia del efectivo físico esperado en gaveta */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-7">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            <h2 className="text-base font-extrabold text-slate-900">
              Flujo de Efectivo en Gaveta
            </h2>
          </div>
          <span className="text-xs font-semibold text-slate-600">Cálculo en tiempo real</span>
        </div>

        <div
          className={`grid grid-cols-1 gap-3 ${
            columnasGaveta === 2
              ? 'sm:grid-cols-2'
              : columnasGaveta === 3
                ? 'sm:grid-cols-3'
                : 'sm:grid-cols-4'
          }`}
        >
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <p className="text-xs font-bold uppercase text-slate-600">Fondo Inicial</p>
            <p className="mt-1 text-lg font-black text-slate-900">
              {formatCurrency(actual.montoInicial)}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
            <p className="text-xs font-bold uppercase text-emerald-700">+ Ventas Efectivo</p>
            <p className="mt-1 text-lg font-black text-emerald-700">
              {formatCurrency(actual.totalVentasEfectivo)}
            </p>
          </div>
          {tieneIngresosExtraHistoricos && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3.5">
              <p className="text-xs font-bold uppercase text-sky-700">+ Ingresos previos</p>
              <p className="mt-1 text-lg font-black text-sky-700">
                {formatCurrency(actual.totalIngresosExtra)}
              </p>
            </div>
          )}
          {tieneAnulacionesEfectivo && (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-3.5">
              <p className="text-xs font-bold uppercase text-red-700">− Anulaciones Efec.</p>
              <p className="mt-1 text-lg font-black text-red-600">
                {formatCurrency(actual.totalEgresosEfectivo)}
              </p>
            </div>
          )}
        </div>

        {/* Resultado principal de gaveta */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 p-4 text-white">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-300">
              Efectivo Esperado en Gaveta
            </p>
            <p className="text-xs text-slate-300">
              Monto que debe existir físicamente al hacer el arqueo
            </p>
          </div>
          <p className="text-3xl font-black text-white">
            {formatCurrency(actual.montoEsperadoEfectivo)}
          </p>
        </div>
      </div>

      {/* Bloque Derecho (5 cols): Resumen de Cobros del Turno y Tarjetas */}
      <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-5">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-sky-600" aria-hidden="true" />
            <h2 className="text-base font-extrabold text-slate-900">
              Resumen de Cobros del Turno
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 p-3.5">
              <p className="text-xs font-bold uppercase text-slate-600">
                {totalAnulaciones > 0 ? 'Ventas Netas' : 'Total Vendido'}
              </p>
              <p className="mt-1 text-2xl font-black text-slate-900">
                {formatCurrency(totalVentasNetas)}
              </p>
              {totalAnulaciones > 0 && (
                <p className="mt-0.5 text-xs font-semibold text-red-700">
                  Bruto {formatCurrency(totalVentasBrutas)} · Anul. −{formatCurrency(totalAnulaciones)}
                </p>
              )}
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5">
              <p className="text-xs font-bold uppercase text-sky-700">Vouchers Tarjeta Neto</p>
              <p className="mt-1 text-2xl font-black text-sky-700">
                {formatCurrency(actual.totalTarjetaNeto)}
              </p>
              {actual.totalEgresosTarjeta > 0 && (
                <p className="mt-0.5 text-xs font-semibold text-red-700">
                  Anulaciones tarj.: −{formatCurrency(actual.totalEgresosTarjeta)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Barra proporcional Efectivo vs Tarjeta */}
        <div className="mt-4 rounded-xl bg-slate-50 p-3.5">
          <div className="mb-2 flex justify-between text-xs font-bold">
            <span className="text-emerald-700">Efectivo ({pctEfectivo}%)</span>
            <span className="text-sky-700">Tarjeta ({pctTarjeta}%)</span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="bg-emerald-500 transition-all"
              style={{ width: `${pctEfectivo}%` }}
            />
            <div className="bg-sky-500 transition-all" style={{ width: `${pctTarjeta}%` }} />
          </div>
          <p className="mt-2.5 text-xs text-slate-600">
            Total general esperado (gaveta + tarjetas):{' '}
            <strong className="text-slate-900">
              {formatCurrency(actual.totalGeneralEsperado)}
            </strong>
          </p>
        </div>
      </div>
    </>
  );
};
