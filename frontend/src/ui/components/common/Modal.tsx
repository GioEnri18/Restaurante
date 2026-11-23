import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClass?: string;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Pila global para soportar modales anidados (p. ej. NuevoPlatilloModal + NuevaCategoriaModal)
const openModalStack: string[] = [];
let previousBodyOverflow: string | null = null;

function lockBodyScroll(id: string) {
  if (openModalStack.length === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  if (!openModalStack.includes(id)) {
    openModalStack.push(id);
  }
}

function unlockBodyScroll(id: string) {
  const index = openModalStack.indexOf(id);
  if (index !== -1) {
    openModalStack.splice(index, 1);
  }
  if (openModalStack.length === 0 && previousBodyOverflow !== null) {
    document.body.style.overflow = previousBodyOverflow;
    previousBodyOverflow = null;
  }
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Diálogo modal accesible (WCAG 2.1 AA):
 * - Atributos ARIA: role="dialog", aria-modal="true" y aria-labelledby al título.
 * - Gestión de foco: foco inicial dentro del contenido, atrapa-foco (Tab/Shift+Tab) y
 *   restauración del foco al elemento que lo abrió al cerrarse.
 * - Cierre con tecla Escape (solo el modal superior) y clic en el fondo.
 * - Bloqueo seguro del scroll del body compatible con modales anidados e impresión.
 */
export const Modal: React.FC<ModalProps> = ({
  open,
  title,
  onClose,
  children,
  maxWidthClass = 'max-w-2xl',
}) => {
  const modalId = useId();
  const titleId = `${modalId}-title`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const mouseDownOnBackdropRef = useRef(false);

  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    // Guardar foco actual para restaurarlo al cerrar
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lockBodyScroll(modalId);

    // Mover el foco inicial al primer control enfocable del contenido o al diálogo
    const focusTimer = window.requestAnimationFrame(() => {
      const dialogEl = dialogRef.current;
      if (!dialogEl) return;
      if (dialogEl.contains(document.activeElement)) return;

      const bodyFocusable = bodyRef.current ? getFocusableElements(bodyRef.current) : [];
      if (bodyFocusable.length > 0) {
        bodyFocusable[0].focus();
      } else {
        const allFocusable = getFocusableElements(dialogEl);
        if (allFocusable.length > 0) {
          allFocusable[0].focus();
        } else {
          dialogEl.focus();
        }
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      // Solo el modal superior en la pila procesa Escape y Tab
      if (openModalStack[openModalStack.length - 1] !== modalId) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab') {
        const dialogEl = dialogRef.current;
        if (!dialogEl) return;
        const focusable = getFocusableElements(dialogEl);
        if (focusable.length === 0) {
          e.preventDefault();
          dialogEl.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (e.shiftKey) {
          if (active === first || !dialogEl.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || !dialogEl.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      unlockBodyScroll(modalId);

      // Restaurar el foco al disparador original si aún está en el DOM
      const prev = previousFocusRef.current;
      if (prev && prev.isConnected) {
        prev.focus();
      }
      previousFocusRef.current = null;
    };
  }, [open, modalId]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[90vh] w-full ${maxWidthClass} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 id={titleId} className="text-lg font-bold text-slate-900">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Cerrar ventana"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div ref={bodyRef} className="overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>
  );
};
