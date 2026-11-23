import React from 'react';
import { formatCurrency } from '../../../utils/formatters';
import { Field } from '../common/Field';

// Denominaciones oficiales de billetes y monedas de Guatemala (GTQ) para arqueo profesional
export const DENOMINACIONES_GTQ = [
  { key: '200', label: 'Q 200', valor: 200, tipo: 'Billete' },
  { key: '100', label: 'Q 100', valor: 100, tipo: 'Billete' },
  { key: '50', label: 'Q 50', valor: 50, tipo: 'Billete' },
  { key: '20', label: 'Q 20', valor: 20, tipo: 'Billete' },
  { key: '10', label: 'Q 10', valor: 10, tipo: 'Billete' },
  { key: '5', label: 'Q 5', valor: 5, tipo: 'Billete' },
  { key: '1', label: 'Q 1', valor: 1, tipo: 'Moneda' },
  { key: '0.5', label: 'Q 0.50', valor: 0.5, tipo: 'Moneda' },
  { key: '0.25', label: 'Q 0.25', valor: 0.25, tipo: 'Moneda' },
] as const;

interface ContadorBilletesGTQProps {
  conteoBilletes: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export const ContadorBilletesGTQ: React.FC<ContadorBilletesGTQProps> = ({
  conteoBilletes,
  onChange,
}) => {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {DENOMINACIONES_GTQ.map((d) => {
        const qty = Number(conteoBilletes[d.key] || 0);
        const sub = qty > 0 ? qty * d.valor : 0;
        return (
          <div
            key={d.key}
            className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
          >
            <div>
              <p className="text-sm font-black text-slate-900">{d.label}</p>
              <p className="text-xs font-semibold text-slate-600">
                {sub > 0 ? formatCurrency(sub) : d.tipo}
              </p>
            </div>
            <Field label={`Cantidad de ${d.tipo.toLowerCase()}s de ${d.label}`} srOnlyLabel>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={conteoBilletes[d.key] ?? ''}
                onChange={(e) => onChange(d.key, e.target.value)}
                className="h-10 w-20 rounded-lg border border-slate-300 bg-white px-2 text-center text-sm font-extrabold"
              />
            </Field>
          </div>
        );
      })}
    </div>
  );
};
