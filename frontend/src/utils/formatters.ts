import { env } from '../config/env';

/** Formatea montos en Quetzales de Guatemala (ej. Q 125.50) */
export function formatCurrency(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${env.CURRENCY_SYMBOL} ${safe.toLocaleString(env.LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Calcula el desglose fiscal Guatemala (IVA incluido en precio) usando VITE_IVA_RATE */
export function calcularIvaIncluido(totalConIva: number) {
  const total = Math.round((totalConIva + Number.EPSILON) * 100) / 100;
  const subtotalSinIva = Math.round((total / (1 + env.IVA_RATE) + Number.EPSILON) * 100) / 100;
  const ivaMonto = Math.round((total - subtotalSinIva + Number.EPSILON) * 100) / 100;
  return { subtotalSinIva, ivaMonto, total };
}

/** Conversión informativa lb -> oz en UI usando VITE_OZ_PER_LB */
export function lbToOzPreview(libras: number): number {
  if (!Number.isFinite(libras) || libras < 0) return 0;
  return Math.round(libras * env.OZ_PER_LB * 10000) / 10000;
}

/** Formatea fecha y hora en zona horaria Guatemala */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(env.LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(env.LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function getTodayISO(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

export function getDaysAgoISO(days: number): string {
  const now = new Date();
  now.setDate(now.getDate() - days);
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}
