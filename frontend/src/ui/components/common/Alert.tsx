import React from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';

type AlertType = 'error' | 'success' | 'warning' | 'info';

const config: Record<AlertType, { wrapper: string; Icon: React.ElementType }> = {
  error: { wrapper: 'bg-red-50 border-red-200 text-red-800', Icon: AlertCircle },
  success: { wrapper: 'bg-emerald-50 border-emerald-200 text-emerald-800', Icon: CheckCircle2 },
  warning: { wrapper: 'bg-amber-50 border-amber-200 text-amber-900', Icon: AlertTriangle },
  info: { wrapper: 'bg-sky-50 border-sky-200 text-sky-900', Icon: Info },
};

export const Alert: React.FC<{ type?: AlertType; message: string; className?: string }> = ({
  type = 'info',
  message,
  className = '',
}) => {
  const { wrapper, Icon } = config[type];
  const role = type === 'error' || type === 'warning' ? 'alert' : 'status';
  return (
    <div
      role={role}
      className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${wrapper} ${className}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="font-medium">{message}</span>
    </div>
  );
};
