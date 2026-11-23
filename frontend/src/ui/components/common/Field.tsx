import React, { useId } from 'react';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  required?: boolean;
}

export interface FieldProps {
  label: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  /** Oculta visualmente la etiqueta manteniendo asociación accesible (ideal para filtros compactos) */
  srOnlyLabel?: boolean;
  className?: string;
  labelClassName?: string;
  /** Acción secundaria alineada junto a la etiqueta (p. ej. "+ Nueva categoría") */
  labelExtra?: React.ReactNode;
  children:
    | ((controlProps: FieldControlProps) => React.ReactNode)
    | React.ReactElement<Record<string, unknown>>;
}

/**
 * Componente base accesible para campos de formulario (<input>, <select>, <textarea>).
 * Asocia un <label htmlFor> real mediante useId() y propaga aria-describedby / aria-invalid.
 */
export const Field: React.FC<FieldProps> = ({
  label,
  error,
  hint,
  required,
  srOnlyLabel = false,
  className,
  labelClassName,
  labelExtra,
  children,
}) => {
  const generatedId = useId();
  const hintId = hint ? `${generatedId}-hint` : undefined;
  const errorId = error ? `${generatedId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const controlProps: FieldControlProps = {
    id: generatedId,
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    ...(error ? { 'aria-invalid': true } : {}),
    ...(required !== undefined ? { required } : {}),
  };

  const renderedControl =
    typeof children === 'function'
      ? children(controlProps)
      : React.cloneElement(children, {
          ...controlProps,
          ...(children.props as Record<string, unknown>),
          id: (children.props as { id?: string }).id ?? generatedId,
          'aria-describedby':
            [
              (children.props as { 'aria-describedby'?: string })['aria-describedby'],
              describedBy,
            ]
              .filter(Boolean)
              .join(' ') || undefined,
          'aria-invalid':
            (children.props as { 'aria-invalid'?: boolean })['aria-invalid'] ??
            (error ? true : undefined),
        });

  return (
    <div className={className}>
      {srOnlyLabel ? (
        <label htmlFor={generatedId} className="sr-only">
          {label}
        </label>
      ) : labelExtra ? (
        <div className="mb-1 flex items-center justify-between gap-2">
          <label
            htmlFor={generatedId}
            className={labelClassName ?? 'block text-xs font-bold text-slate-600'}
          >
            {label}
          </label>
          {labelExtra}
        </div>
      ) : (
        <label
          htmlFor={generatedId}
          className={labelClassName ?? 'mb-1 block text-xs font-bold text-slate-600'}
        >
          {label}
        </label>
      )}

      {renderedControl}

      {hint && (
        <p id={hintId} className="mt-1 text-xs text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  );
};
