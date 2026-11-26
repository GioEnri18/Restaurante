const { OZ_PER_LB } = require('../../config/constants');
const { BadRequestError } = require('../errors/AppError');
const { round4 } = require('../utils/tax');
const MAX_STOCK_OZ = 99999999.9999;
const MAX_CANTIDAD_DOCUMENTADA = 999999.9999;
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
    static toMovimientoOz(cantidad, unidad, documentada = false) {
        const maximo = documentada ? MAX_CANTIDAD_DOCUMENTADA : MAX_STOCK_OZ;
        if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > maximo || round4(cantidad) !== cantidad) {
            throw new BadRequestError('La cantidad debe ser positiva, estar dentro del rango permitido y tener hasta 4 decimales');
        }
        const onzas = this.toBaseOz(cantidad, unidad);
        if (onzas < 0.0001 || onzas > MAX_STOCK_OZ) {
            throw new BadRequestError('La cantidad convertida a onzas excede la precisión o el rango de inventario');
        }
        return onzas;
    }
    static validarSaldoOz(saldo, permitirNegativo = false) {
        const minimo = permitirNegativo ? -MAX_STOCK_OZ : 0;
        if (!Number.isFinite(saldo) || saldo < minimo || saldo > MAX_STOCK_OZ) {
            throw new BadRequestError('El saldo en onzas está fuera del rango permitido para inventario');
        }
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
