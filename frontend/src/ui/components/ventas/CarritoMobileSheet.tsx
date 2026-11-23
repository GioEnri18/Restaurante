import React, { useEffect, useId, useRef } from 'react';
import { ShoppingCart, ChevronUp } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatters';
import { CarritoOrdenPanel, CarritoOrdenPanelProps } from './CarritoOrdenPanel';

interface CarritoMobileSheetProps extends Omit<CarritoOrdenPanelProps, 'mode' | 'onCloseSheet' | 'titleId'> {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Barra inferior fija + panel deslizable (bottom sheet) accesible para móvil y tablet vertical (< lg).
 * Incluye gestión de foco, atrapa-foco, cierre con Escape/fondo, bloqueo de scroll y safe-area inferior.
 */
export const CarritoMobileSheet: React.FC<CarritoMobileSheetProps> = ({
  open,
  onOpen,
  onClose,
  onAbrirCobro,
  ...carritoProps
}) => {
  const sheetTitleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const mouseDownOnBackdropRef = useRef(false);

  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.requestAnimationFrame(() => {
      const sheetEl = sheetRef.current;
      if (!sheetEl) return;
      const focusable = Array.from(sheetEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        sheetEl.focus();
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab' && sheetRef.current) {
        const focusable = Array.from(
          sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (focusable.length === 0) {
          e.preventDefault();
          sheetRef.current.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && (document.activeElement === first || !sheetRef.current.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !sheetRef.current.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    // Si la pantalla cambia a >= lg (1024px), cerrar el sheet móvil automáticamente
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const handleMediaChange = (event: MediaQueryListEvent) => {
      if (event.matches) onCloseRef.current();
    };

    window.addEventListener('keydown', handleKeyDown);
    mediaQuery.addEventListener('change', handleMediaChange);

    return () => {
      window.cancelAnimationFrame(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      mediaQuery.removeEventListener('change', handleMediaChange);
      document.body.style.overflow = prevOverflow;
      if (triggerRef.current && triggerRef.current.isConnected) {
        triggerRef.current.focus();
      }
    };
  }, [open]);

  const handleCobrarDesdeSheet = () => {
    onClose();
    onAbrirCobro();
  };

  return (
    <>
      {/* Barra fija inferior para pantallas < lg */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-6px_24px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden">
        <button
          ref={triggerRef}
          type="button"
          onClick={onOpen}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl bg-brand-700 px-4 text-sm font-extrabold text-white shadow-md transition hover:bg-brand-800"
        >
          <span className="flex items-center gap-2.5">
            <ShoppingCart className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>
              Ver pedido ({carritoProps.totals.totalUnidades}) · {formatCurrency(carritoProps.totals.total)}
            </span>
          </span>
          <ChevronUp className="h-5 w-5 shrink-0" aria-hidden="true" />
        </button>
      </div>

      {/* Bottom sheet deslizable */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-slate-900/60 backdrop-blur-sm lg:hidden"
          onMouseDown={(e) => {
            mouseDownOnBackdropRef.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            if (mouseDownOnBackdropRef.current && e.target === e.currentTarget) {
              onClose();
            }
            mouseDownOnBackdropRef.current = false;
          }}
        >
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={sheetTitleId}
            tabIndex={-1}
            className="w-full max-h-[88dvh] overflow-hidden rounded-t-3xl bg-white shadow-2xl outline-none"
          >
            <CarritoOrdenPanel
              {...carritoProps}
              mode="sheet"
              titleId={sheetTitleId}
              onCloseSheet={onClose}
              onAbrirCobro={handleCobrarDesdeSheet}
            />
          </div>
        </div>
      )}
    </>
  );
};
