import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export interface EmptyStateProps {
  /** Ícono de lucide-react o nodo React decorativo */
  icon: LucideIcon | React.ReactNode;
  title: string;
  description: string;
  /** Acción opcional; solo pasar cuando el usuario tiene permiso para ejecutarla */
  action?: EmptyStateAction;
  /** Reduce el relleno vertical para tarjetas secundarias o gráficos */
  compact?: boolean;
}

/**
 * Estado vacío accesible y reutilizable para tablas, listas y paneles sin registros.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  compact = false,
}) => {
  const renderIcon = () => {
    if (React.isValidElement(icon)) {
      return icon;
    }
    const IconComponent = icon as LucideIcon;
    return <IconComponent className="h-6 w-6" aria-hidden="true" />;
  };

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'px-4 py-8' : 'px-4 py-10'
      }`}
    >
      <div
        className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600"
        aria-hidden="true"
      >
        {renderIcon()}
      </div>
      <p className="text-sm font-bold text-slate-800">{title}</p>
      <p className="mt-1 max-w-md text-xs text-slate-600">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`mt-4 inline-flex min-h-[40px] items-center justify-center rounded-xl px-4 text-xs font-bold transition ${
            action.variant === 'secondary'
              ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              : 'bg-brand-700 text-white shadow-sm hover:bg-brand-800'
          }`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
