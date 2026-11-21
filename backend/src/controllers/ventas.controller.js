const { VentasService } = require('../services/ventas.service');
class VentasController {
    static async menu(req, res, next) {
        try {
            const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
            const categoriaId = req.query.categoriaId ? Number(req.query.categoriaId) : undefined;
            const data = await VentasService.obtenerMenu(req.user, search, categoriaId);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async listarMenusEspeciales(req, res, next) {
        try {
            const data = await VentasService.listarMenusEspeciales(req.user.sucursalId);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async alertasMenusEspeciales(req, res, next) {
        try {
            const data = await VentasService.obtenerAlertasMenusEspeciales(req.user.sucursalId);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async crearMenuEspecial(req, res, next) {
        try {
            const data = await VentasService.crearMenuEspecial(req.user, req.body, req.clientMeta);
            res.status(201).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async actualizarMenuEspecial(req, res, next) {
        try {
            const id = Number(req.params.id);
            const data = await VentasService.actualizarMenuEspecial(req.user, id, req.body, req.clientMeta);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async eliminarMenuEspecial(req, res, next) {
        try {
            const id = Number(req.params.id);
            const data = await VentasService.eliminarMenuEspecial(req.user, id, req.clientMeta);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async crearPlatillo(req, res, next) {
        try {
            const data = await VentasService.crearPlatillo(req.user, req.body, req.clientMeta);
            res.status(201).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async actualizarPlatillo(req, res, next) {
        try {
            const platilloId = Number(req.params.id);
            const data = await VentasService.actualizarPlatillo(req.user, platilloId, req.body, req.clientMeta);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async confirmar(req, res, next) {
        try {
            const data = await VentasService.confirmarVenta(req.user, req.body, req.clientMeta);
            res.status(201).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async obtenerComanda(req, res, next) {
        try {
            const ventaId = Number(req.params.id);
            const data = await VentasService.obtenerComanda(ventaId, req.user.sucursalId);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async actualizarEstadoMesa(req, res, next) {
        try {
            const mesaId = Number(req.params.id);
            const { estado } = req.body;
            const data = await VentasService.actualizarEstadoMesa(req.user, mesaId, estado);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
}

module.exports = { VentasController };
