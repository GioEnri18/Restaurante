import { UnidadMedida } from '@prisma/client';
import { OZ_PER_LB } from '../../config/constants';
import { BadRequestError } from '../errors/AppError';
import { round4 } from '../utils/tax';

/**
 * Servicio centralizado y ÚNICO para todas las conversiones de unidades (libras ↔ onzas).
 * Regla de negocio: 1 libra (lb) = 16 onzas (oz).
 * Todo el inventario, recetas y costeos internos se almacenan en onzas (oz).
 */
export class UnitConversionService {
  static readonly FACTOR_LB_A_OZ = OZ_PER_LB;

  /** Convierte libras a onzas */
  static lbToOz(libras: number): number {
    if (!Number.isFinite(libras) || libras < 0) {
      throw new BadRequestError('La cantidad en libras debe ser un número mayor o igual a 0');
    }
    return round4(libras * this.FACTOR_LB_A_OZ);
  }

  /** Convierte onzas a libras */
  static ozToLb(onzas: number): number {
    if (!Number.isFinite(onzas)) {
      throw new BadRequestError('La cantidad en onzas debe ser un número válido');
    }
    return round4(onzas / this.FACTOR_LB_A_OZ);
  }

  /** Convierte cualquier cantidad con unidad ('lb' | 'oz') hacia la unidad base ('oz') */
  static toBaseOz(cantidad: number, unidad: UnidadMedida | 'lb' | 'oz'): number {
    if (!Number.isFinite(cantidad) || cantidad < 0) {
      throw new BadRequestError('La cantidad a convertir debe ser mayor o igual a 0');
    }
    if (unidad === 'lb') {
      return this.lbToOz(cantidad);
    }
    if (unidad === 'oz') {
      return round4(cantidad);
    }
    throw new BadRequestError(`Unidad de medida no soportada: ${String(unidad)}`);
  }

  /** Convierte el precio por libra a costo unitario por onza */
  static pricePerLbToCostPerOz(precioPorLb: number): number {
    if (!Number.isFinite(precioPorLb) || precioPorLb < 0) {
      throw new BadRequestError('El precio por libra debe ser mayor o igual a 0');
    }
    return round4(precioPorLb / this.FACTOR_LB_A_OZ);
  }

  /** Convierte el costo por onza a equivalente por libra */
  static costPerOzToPricePerLb(costoPorOz: number): number {
    if (!Number.isFinite(costoPorOz) || costoPorOz < 0) {
      throw new BadRequestError('El costo por onza debe ser mayor o igual a 0');
    }
    return round4(costoPorOz * this.FACTOR_LB_A_OZ);
  }
}
