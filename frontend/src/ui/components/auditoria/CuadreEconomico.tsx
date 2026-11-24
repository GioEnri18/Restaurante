import { BalanceEconomico } from '../../../services/reportes.service';
import { formatCurrency } from '../../../utils/formatters';

function Montos({ filas }: { filas: ReadonlyArray<readonly [string, number]> }) {
  return (
    <dl className="space-y-2 text-sm">
      {filas.map(([etiqueta, monto]) => (
        <div key={etiqueta} className="flex justify-between gap-3">
          <dt className="text-slate-600">{etiqueta}</dt>
          <dd className="shrink-0 font-semibold text-slate-900">{formatCurrency(monto)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CuadreEconomico({ balance }: { balance: BalanceEconomico }) {
  const parcial = balance.lineasCostoPendiente > 0 || balance.personalConDatosPendientes > 0 ||
    balance.egresosSinClasificar > 0;
  return (
    <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold text-slate-900">Cuadre general</h2>
      <p className="text-sm text-slate-600">{balance.periodo.fechaDesde} al {balance.periodo.fechaHasta}</p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="mb-3 text-sm font-bold text-slate-900">Entradas del restaurante</h3>
          <Montos filas={[
            ['Cobros en efectivo', balance.cobrosEfectivo],
            ['Cobros con tarjeta', balance.cobrosTarjeta],
            ['Total cobrado (IVA incluido)', balance.totalCobrado],
            ['Entradas manuales de caja', balance.ingresosManuales],
            ['Total de entradas registradas', balance.totalEntradasRegistradas],
            ['IVA incluido en los cobros', balance.iva],
            ['Ingresos por ventas sin IVA', balance.ventasSinIva],
          ]} />
        </section>
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="mb-3 text-sm font-bold text-slate-900">Costos y gastos del período</h3>
          <Montos filas={[
            ['Costo de lo vendido', balance.costoVendido],
            ['Costo de cortesías', balance.costoCortesias],
            ['Mermas', balance.mermas],
            ['Nómina del período', balance.sueldos],
            ['Alquiler', balance.alquiler],
            ['Otros gastos indirectos', balance.otrosGastos],
            ['Total de costos y gastos', balance.gastosTotales],
          ]} />
        </section>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-teal-50 p-4 text-teal-950">
        <div>
          <p className="text-sm font-bold">
            {parcial ? 'Resultado parcial' : balance.resultado < 0 ? 'Pérdida del período' : 'Ganancia del período'}
          </p>
          <p className="text-xs">Ingresos por ventas sin IVA menos costos y gastos</p>
        </div>
        <strong className="text-xl">{formatCurrency(balance.resultado)}</strong>
      </div>

      <div className="mt-4">
        <Montos filas={[
          ['Ticket promedio', balance.ticketPromedio],
          ['Importe de ventas anuladas', balance.totalAnulado],
          ['Compras de inventario', balance.compras],
          ['Valor del inventario actual', balance.inventarioActual],
          ['Salidas manuales de caja sin clasificar', balance.egresosSinClasificar],
        ]} />
        <p className="mt-2 text-xs text-slate-600">
          {balance.cantidadVentas} ventas completadas · {balance.cantidadAnuladas} anuladas · {balance.cantidadMermas} mermas registradas.
        </p>
        <p className="mt-2 text-xs text-slate-600">
          Las compras se reflejan en el resultado a medida que se consume el inventario. Las entradas y salidas manuales de caja se muestran para conciliación.
        </p>
        <p className="mt-2 text-xs text-slate-600">
          {balance.unidadesCortesia} unidades de cortesía por un valor habitual de {formatCurrency(balance.valorCortesias)}.
          {' '}{balance.lineasCostoPendiente} líneas con costo pendiente y {balance.lineasConsumoPendiente} con consumo pendiente.
          {' '}{balance.personalConDatosPendientes} personas con datos de nómina pendientes.
        </p>
      </div>
    </section>
  );
}
