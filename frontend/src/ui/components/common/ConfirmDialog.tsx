import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Diálogo de confirmación accesible basado en <Modal>.
 * Reemplaza los confirm() nativos del navegador manteniendo foco y teclado.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  loading = false,
  onConfirm,
  onCancel,
}) => {
  const isDanger = variant === 'danger';

  return (
    <Modal
      open={open}
      title={title}
      onClose={() => {
        if (!loading) onCancel();
      }}
      maxWidthClass="max-w-md"
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          {isDanger && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
          )}
          <p className="text-sm leading-relaxed text-slate-700">{message}</p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void onConfirm()}
            className={`min-h-[44px] rounded-xl px-5 text-sm font-bold text-white transition disabled:opacity-50 ${
              isDanger
                ? 'bg-red-700 hover:bg-red-800'
                : 'bg-brand-700 hover:bg-brand-800'
            }`}
          >
            {loading ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};
