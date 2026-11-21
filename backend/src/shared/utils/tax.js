const { env } = require('../../config/env');
function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
function round4(value) {
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
/**
 * Calcula el desglose fiscal según normativa legal de Guatemala (Decreto 27-92):
 * Los precios del menú YA incluyen el 12% de IVA.
 * Fórmula: base = total / (1 + 0.12), iva = total - base.
 */
function calcularDesgloseIvaIncluido(totalConIva, tasa = env.IVA_RATE) {
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

module.exports = { round2, round4, calcularDesgloseIvaIncluido };
