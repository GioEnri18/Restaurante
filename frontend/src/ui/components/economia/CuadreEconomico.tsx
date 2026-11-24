import { BalanceEconomico } from '../../../services/reportes.service';
import { formatCurrency } from '../../../utils/formatters';

function Fila({ concepto, monto, total = false }: {
  concepto: string;
  monto: number;
  total?: boolean;
}) {
  return (
    <tr className={total ? 'bg-slate-100 font-bold' : 'border-b border-slate-100'}>
      <th scope="row" className={`px-3 py-2 text-left ${total ? 'font-bold' : 'font-normal'}`}>{concepto}</th>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatCurrency(monto)}</td>
    </tr>
  );
}

export function CuadreEconomico({ balance }: { balance: BalanceEconomico }) {
  const parcial = balance.lineasCostoPendiente > 0 || balance.personalConDatosPendientes > 0 ||
    balance.egresosSinClasificar > 0;
  const resultado = parcial ? 'Resultado parcial' : balance.resultado < 0 ? 'Pérdida del período' : 'Ganancia del período';

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">Gastos del mes</h2>
        <table className="mt-3 w-full text-sm" aria-label="Costos y gastos del mes">
          <thead className="bg-slate-100 text-slate-700">
            <tr><th scope="col" className="px-3 py-2 text-left">Concepto</th><th scope="col" className="px-3 py-2 text-right">Monto</th></tr>
          </thead>
          <tbody>
            <Fila concepto="Costo de inventario usado en ventas" monto={balance.costoVendido} />
            <Fila concepto="Costo de cortesías" monto={balance.costoCortesias} />
            <Fila concepto="Mermas" monto={balance.mermas} />
            <Fila concepto="Nómina mensual" monto={balance.sueldos} />
            <Fila concepto="Alquiler" monto={balance.alquiler} />
            <Fila concepto="Otros gastos registrados" monto={balance.otrosGastos} />
          </tbody>
          <tfoot><Fila concepto="Total de costos y gastos" monto={balance.gastosTotales} total /></tfoot>
        </table>
      </section>
      <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">Ganancia</h2>
        <table className="mt-3 w-full text-sm" aria-label="Ganancia o pérdida del mes">
          <thead className="bg-slate-100 text-slate-700">
            <tr><th scope="col" className="px-3 py-2 text-left">Concepto</th><th scope="col" className="px-3 py-2 text-right">Monto</th></tr>
          </thead>
          <tbody>
            <Fila concepto="Ventas de todos los platillos (sin IVA)" monto={balance.ventasSinIva} />
            <Fila concepto="Menos costos y gastos" monto={-balance.gastosTotales} />
          </tbody>
          <tfoot className={balance.resultado < 0 ? 'text-red-800' : 'text-teal-950'}>
            <Fila concepto={resultado} monto={balance.resultado} total />
          </tfoot>
        </table>
        {parcial && <p className="mt-3 text-sm text-amber-800">
          Pendientes del mes · {balance.lineasCostoPendiente} líneas sin costo completo · {balance.personalConDatosPendientes} personas con datos de nómina pendientes · {formatCurrency(balance.egresosSinClasificar)} en salidas de caja sin clasificar.
        </p>}
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold text-slate-700">Cobros, caja e inventario</summary>
          <table className="mt-2 w-full" aria-label="Cobros y movimientos registrados">
            <tbody>
              <Fila concepto="Ventas cobradas en efectivo" monto={balance.cobrosEfectivo} />
              <Fila concepto="Ventas cobradas con tarjeta" monto={balance.cobrosTarjeta} />
              <Fila concepto="Total vendido con IVA" monto={balance.totalCobrado} total />
              <Fila concepto="IVA de las ventas" monto={balance.iva} />
              <Fila concepto="Entradas manuales de caja" monto={balance.ingresosManuales} />
              <Fila concepto="Total de entradas registradas" monto={balance.totalEntradasRegistradas} total />
              <Fila concepto="Compras de inventario" monto={balance.compras} />
              <Fila concepto="Valor del inventario actual" monto={balance.inventarioActual} />
              <Fila concepto="Salidas manuales de caja sin clasificar" monto={balance.egresosSinClasificar} />
              <Fila concepto="Importe de ventas anuladas" monto={balance.totalAnulado} />
              <Fila concepto="Ticket promedio" monto={balance.ticketPromedio} />
              <Fila concepto="Valor de venta de las cortesías" monto={balance.valorCortesias} />
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-600">Las compras se llevan al gasto a medida que se consume el inventario. Usa los movimientos de caja para conciliación.</p>
          <p className="mt-2 text-xs text-slate-600">
            {balance.cantidadVentas} ventas completadas · {balance.cantidadAnuladas} anuladas · {balance.cantidadMermas} mermas · {balance.unidadesCortesia} unidades de cortesía · {balance.lineasConsumoPendiente} líneas con consumo pendiente.
          </p>
        </details>
      </section>
    </div>
  );
}
