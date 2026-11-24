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
            <Fila concepto="Cortesías (costo de los productos)" monto={balance.costoCortesias} />
            <Fila concepto="Mermas" monto={balance.mermas} />
            <Fila concepto="Nómina mensual" monto={balance.sueldos} />
            <Fila concepto="Gastos registrados" monto={balance.alquiler + balance.otrosGastos} />
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
      </section>
    </div>
  );
}
