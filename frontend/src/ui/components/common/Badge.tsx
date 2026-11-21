import React from 'react';

type Variant = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

const styles: Record<Variant, string> = {
  success: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  danger: 'bg-red-100 text-red-800 border-red-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  info: 'bg-sky-100 text-sky-800 border-sky-200',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
};

export const Badge: React.FC<{ variant?: Variant; children: React.ReactNode }> = ({
  variant = 'neutral',
  children,
}) => (
  <span
    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${styles[variant]}`}
  >
    {children}
  </span>
);
