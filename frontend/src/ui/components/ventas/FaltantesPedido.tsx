import { FaltanteStock } from '../../../utils/stockPedido';

const onzas = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 4, minimumFractionDigits: 2 });

export function FaltantesPedido({ faltantes }: { faltantes: FaltanteStock[] }) {
  return (
    <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-bold">Consumo pendiente de inventario</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {faltantes.map(({ ingrediente, requeridoOz, disponibleOz }, index) => (
          <li key={`${ingrediente}-${index}`}>
            <strong>{ingrediente}</strong>
            {' · '}Necesitas {onzas.format(requeridoOz)} oz y hay {onzas.format(disponibleOz)} oz.
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs">Puedes cobrar ahora. El sistema descontará lo que esté registrado y dejará el resto pendiente.</p>
    </div>
  );
}
