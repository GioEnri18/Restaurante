import React from 'react';

export interface TableSkeletonProps {
  /** Cantidad de filas simuladas a renderizar dentro del <tbody> */
  rows?: number;
  /** Cantidad de columnas que debe cubrir cada fila */
  cols: number;
  /** Texto accesible anunciado por lectores de pantalla */
  label?: string;
}

const ANCHOS_CELDA = ['w-3/4', 'w-2/3', 'w-1/2', 'w-4/5', 'w-2/5', 'w-3/5'];

/**
 * Filas skeleton reutilizables para tablas HTML.
 * Se renderiza directamente dentro de un `<tbody>` para mantener visibles
 * los encabezados de la tabla y evitar saltos de diseño durante la carga.
 */
export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 5,
  cols,
  label = 'Cargando datos...',
}) => {
  return (
    <>
      <tr className="sr-only">
        <td colSpan={cols} role="status" aria-live="polite">
          {label}
        </td>
      </tr>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <tr key={`skeleton-row-${rowIdx}`} aria-hidden="true" className="animate-pulse">
          {Array.from({ length: cols }).map((__, colIdx) => {
            const widthClass = ANCHOS_CELDA[(rowIdx + colIdx) % ANCHOS_CELDA.length];
            const isLastCol = colIdx === cols - 1;
            return (
              <td key={`skeleton-cell-${rowIdx}-${colIdx}`} className="px-2 py-3.5">
                <div
                  className={`h-4 rounded-md bg-slate-200 ${widthClass} ${
                    isLastCol ? 'ml-auto' : ''
                  }`}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
};
