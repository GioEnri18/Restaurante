import { describe, expect, it } from 'vitest';
import {
  calcularIvaIncluido,
  formatCurrency,
  formatDateOnly,
  formatDateTime,
  lbToOzPreview,
} from '../utils/formatters';

describe('formatters y cálculos fiscales de Guatemala', () => {
  it('calcula exactamente el IVA 12% incluido sin descuadres de centavos', () => {
    expect(calcularIvaIncluido(112)).toEqual({
      subtotalSinIva: 100,
      ivaMonto: 12,
      total: 112,
    });

    const complejo = calcularIvaIncluido(33.33);
    expect(Number((complejo.subtotalSinIva + complejo.ivaMonto).toFixed(2))).toBe(33.33);
    expect(calcularIvaIncluido(0)).toEqual({ subtotalSinIva: 0, ivaMonto: 0, total: 0 });
  });

  it('formatea montos en Quetzales y maneja NaN/Infinity de forma segura', () => {
    expect(formatCurrency(125.5)).toContain('Q');
    expect(formatCurrency(125.5)).toContain('125.50');
    expect(formatCurrency(Number.NaN)).toContain('0.00');
  });

  it('convierte libras a onzas (16 oz/lb) y retorna 0 ante valores negativos o inválidos', () => {
    expect(lbToOzPreview(2.5)).toBe(40);
    expect(lbToOzPreview(-3)).toBe(0);
    expect(lbToOzPreview(Number.NaN)).toBe(0);
  });

  it('formatea fechas y horas en America/Guatemala (UTC-6) sin corrimiento de día', () => {
    expect(formatDateOnly('2026-11-26')).toBe('26/11/2026');
    expect(formatDateOnly(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
    expect(formatDateTime('fecha-invalida')).toBe('—');

    // 2026-11-27T03:30:00.000Z corresponde al 26/11/2026 21:30 en Guatemala (UTC-6)
    const gt = formatDateTime('2026-11-27T03:30:00.000Z');
    expect(gt).toContain('26');
    expect(gt).toContain('11');
    expect(gt).toContain('2026');
  });
});
