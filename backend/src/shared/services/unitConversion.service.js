const { OZ_PER_LB } = require('../../config/constants');
const { BadRequestError } = require('../errors/AppError');
const { round4 } = require('../utils/tax');
/**
 * Servicio centralizado y ÚNICO para todas las conversiones de unidades (libras ↔ onzas).
 * Regla de negocio: 1 libra (lb) = 16 onzas (oz) — valor leído desde env.UNIT_OZ_PER_LB.
 */
class UnitConversionService {
    static FACTOR_LB_A_OZ = OZ_PER_LB;
    static lbToOz(libras) {
        if (!Number.isFinite(libras) || libras < 0) {
            throw new BadRequestError('La cantidad en libras debe ser un número mayor o igual a 0');
        }
        return round4(libras * this.FACTOR_LB_A_OZ);
    }
    static ozToLb(onzas) {
        if (!Number.isFinite(onzas)) {
            throw new BadRequestError('La cantidad en onzas debe ser un número válido');
        }
        return round4(onzas / this.FACTOR_LB_A_OZ);
    }
    static toBaseOz(cantidad, unidad) {
        if (!Number.isFinite(cantidad) || cantidad < 0) {
            throw new BadRequestError('La cantidad a convertir debe ser mayor o igual a 0');
        }
        if (unidad === 'lb')
            return this.lbToOz(cantidad);
        if (unidad === 'oz')
            return round4(cantidad);
        throw new BadRequestError(`Unidad de medida no soportada: ${String(unidad)}`);
    }
    static pricePerLbToCostPerOz(precioPorLb) {
        if (!Number.isFinite(precioPorLb) || precioPorLb < 0) {
            throw new BadRequestError('El precio por libra debe ser mayor o igual a 0');
        }
        return round4(precioPorLb / this.FACTOR_LB_A_OZ);
    }
    static costPerOzToPricePerLb(costoPorOz) {
        if (!Number.isFinite(costoPorOz) || costoPorOz < 0) {
            throw new BadRequestError('El costo por onza debe ser mayor o igual a 0');
        }
        return round4(costoPorOz * this.FACTOR_LB_A_OZ);
    }
}

module.exports = { UnitConversionService };
