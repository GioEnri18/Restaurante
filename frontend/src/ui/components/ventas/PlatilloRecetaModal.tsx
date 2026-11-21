import React from 'react';
import { PlatilloModel } from '../../../models';
import { formatCurrency } from '../../../utils/formatters';
import { Modal } from '../common/Modal';

interface PlatilloRecetaModalProps {
  platillo: PlatilloModel | null;
  onClose: () => void;
}

export const PlatilloRecetaModal: React.FC<PlatilloRecetaModalProps> = ({
  platillo,
  onClose,
}) => {
  return (
    <Modal
      open={Boolean(platillo)}
      title={platillo ? `Ficha de Platillo — ${platillo.nombre}` : ''}
      onClose={onClose}
      maxWidthClass="max-w-md"
    >
      {platillo && (
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5">
            <div>
              <p className="text-xs text-slate-500">Precio vigente</p>
              <p className="text-xl font-black text-brand-700">
                {formatCurrency(platillo.precioVenta)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Costo estimado receta</p>
              <p className="text-base font-bold text-slate-800">
                {formatCurrency(platillo.costoReceta)}
              </p>
            </div>
          </div>
          {platillo.descripcion && <p className="text-slate-600">{platillo.descripcion}</p>}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              Ingredientes descontados al vender (oz)
            </p>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {platillo.receta.map((r) => (
                <div key={r.ingredienteId} className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="font-semibold text-slate-800">{r.ingredienteNombre}</span>
                  <span className="text-slate-600">
                    <strong>{r.cantidadOz} oz</strong> (disp: {r.stockActualOz.toFixed(1)} oz)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
