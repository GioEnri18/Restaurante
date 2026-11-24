import { BalanceEconomico } from '../../../services/reportes.service';
import { formatCurrency } from '../../../utils/formatters';

function Fila({ concepto, ingreso, egreso, total = false }: {
  concepto: string;
  ingreso?: number;
  egreso?: number;
  total?: boolean;
}) {
  return (
    <tr className={total ? 'bg-slate-100 font-bold' : 'border-b border-slate-100'}>
      <th scope="row" className={`px-3 py-2 text-left ${total ? 'font-bold' : 'font-normal'}`}>{concepto}</th>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{ingreso === undefined ? '—' : formatCurrency(ingreso)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{egreso === undefined ? '—' : formatCurrency(egreso)}</td>
    </tr>
  );
}

export function CuadreEconomico({ balance, mensual = false }: { balance: BalanceEconomico; mensual?: boolean }) {
  const parcial = balance.lineasCostoPendiente > 0 || balance.personalConDatosPendientes > 0 ||
    balance.egresosSinClasificar > 0;
  const resultado = parcial ? 'Resultado parcial' : balance.resultado < 0 ? 'Pérdida del período' : 'Ganancia del período';

  return (
    <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm">
      <h2 className="font-bold text-slate-900">{mensual ? 'Cuadre general del mes' : 'Cuadre general'}</h2>
      <p className="text-sm text-slate-600">{balance.periodo.fechaDesde} al {balance.periodo.fechaHasta}</p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[430px] text-sm text-slate-900" aria-label="Ingresos, egresos y resultado">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th scope="col" className="px-3 py-2 text-left">Concepto</th>
              <th scope="col" className="px-3 py-2 text-right">Ingresos</th>
              <th scope="col" className="px-3 py-2 text-right">Egresos</th>
            </tr>
          </thead>
          <tbody>
            <Fila concepto="Ventas sin IVA" ingreso={balance.ventasSinIva} />
            <Fila concepto="Costo de lo vendido" egreso={balance.costoVendido} />
            <Fila concepto="Costo de cortesías" egreso={balance.costoCortesias} />
            <Fila concepto="Mermas" egreso={balance.mermas} />
            <Fila concepto={mensual ? 'Nómina mensual' : 'Nómina del período'} egreso={balance.sueldos} />
            <Fila concepto={balance.alquilerMensual > 0 ? 'Alquiler mensual configurado' : 'Alquiler'} egreso={balance.alquiler} />
            <Fila concepto="Otros gastos indirectos" egreso={balance.otrosGastos} />
            <Fila concepto="Totales del resultado" ingreso={balance.ventasSinIva} egreso={balance.gastosTotales} total />
            <tr className="bg-teal-50 font-bold text-teal-950">
              <th scope="row" className="px-3 py-3 text-left">{resultado}</th>
              <td colSpan={2} className="px-3 py-3 text-right text-lg tabular-nums">{formatCurrency(balance.resultado)}</td>
            </tr>
          </tbody>
          <tbody>
            <tr>
              <th scope="rowgroup" colSpan={3} className="px-3 pb-2 pt-5 text-left text-slate-600">Cobros y movimientos registrados</th>
            </tr>
            <Fila concepto="Ventas cobradas en efectivo" ingreso={balance.cobrosEfectivo} />
            <Fila concepto="Ventas cobradas con tarjeta" ingreso={balance.cobrosTarjeta} />
            <Fila concepto="Total vendido con IVA" ingreso={balance.totalCobrado} total />
            <Fila concepto="IVA incluido en las ventas" ingreso={balance.iva} />
            <Fila concepto="Entradas manuales de caja" ingreso={balance.ingresosManuales} />
            <Fila concepto="Total de entradas registradas" ingreso={balance.totalEntradasRegistradas} total />
            <Fila concepto="Compras de inventario" egreso={balance.compras} />
            <Fila concepto="Salidas manuales de caja sin clasificar" egreso={balance.egresosSinClasificar} />
          </tbody>
        </table>
      </div>

      <div className="mt-4 space-y-2 text-xs text-slate-600">
        <p>El resultado usa ventas sin IVA y resta el costo del inventario consumido. Los movimientos manuales de caja se muestran para conciliación.</p>
        <p>{balance.cantidadVentas} ventas completadas · {balance.cantidadAnuladas} anuladas por {formatCurrency(balance.totalAnulado)} · {balance.cantidadMermas} mermas.</p>
        <p>Ticket promedio {formatCurrency(balance.ticketPromedio)} · Inventario actual {formatCurrency(balance.inventarioActual)} · {balance.unidadesCortesia} unidades de cortesía por {formatCurrency(balance.valorCortesias)}.</p>
        <p>{balance.lineasCostoPendiente} líneas con costo pendiente · {balance.lineasConsumoPendiente} con consumo pendiente · {balance.personalConDatosPendientes} personas con datos de nómina pendientes.</p>
      </div>
    </section>
  );
}
