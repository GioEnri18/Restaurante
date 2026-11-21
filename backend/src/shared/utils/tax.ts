import { env } from '../../config/env';

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export interface DesgloseIva {
  subtotalSinIva: number;
  ivaMonto: number;
  total: number;
  tasaIva: number;
}

/**
 * Calcula el desglose fiscal según normativa legal de Guatemala (Decreto 27-92):
 * Los precios del menú YA incluyen el 12% de IVA.
 * Fórmula: base = total / (1 + 0.12), iva = total - base.
 */
export function calcularDesgloseIvaIncluido(totalConIva: number, tasa = env.IVA_RATE): DesgloseIva {
  const total = round2(totalConIva);
  const subtotalSinIva = round2(total / (1 + tasa));
  const ivaMonto = round2(total - subtotalSinIva);

  return {
    subtotalSinIva,
    ivaMonto,
    total,
    tasaIva: tasa,
  };
}
