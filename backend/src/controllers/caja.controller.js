const { CajaService } = require('../services/caja.service');
class CajaController {
    static async actual(req, res, next) {
        try {
            const data = await CajaService.obtenerCajaActual(req.user.sucursalId, req.query.incluirMovimientos !== 'false');
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async abrir(req, res, next) {
        try {
            const data = await CajaService.abrirCaja(req.user, req.body, req.clientMeta);
            res.status(201).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async vouchers(req, res, next) {
        try {
            const { data, meta } = await CajaService.obtenerVouchersTurno(req.user.sucursalId, req.query.page);
            res.status(200).json({ ok: true, data, meta });
        }
        catch (error) {
            next(error);
        }
    }
    static async registrarMovimiento(req, res, next) {
        try {
            const data = await CajaService.registrarMovimiento(req.user, req.body, req.clientMeta);
            res.status(201).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async movimientos(req, res, next) {
        try {
            const { data, meta } = await CajaService.obtenerMovimientosTurno(req.user.sucursalId, req.query.filtro, req.query.page);
            res.status(200).json({ ok: true, data, meta });
        }
        catch (error) {
            next(error);
        }
    }
    static async cerrar(req, res, next) {
        try {
            const data = await CajaService.cerrarCaja(req.user, req.body, req.clientMeta);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async historial(req, res, next) {
        try {
            const { items, meta } = await CajaService.listarHistorial(req.user.sucursalId, req.query.page, req.query.limit);
            res.status(200).json({ ok: true, data: items, meta });
        }
        catch (error) {
            next(error);
        }
    }
}

module.exports = { CajaController };
