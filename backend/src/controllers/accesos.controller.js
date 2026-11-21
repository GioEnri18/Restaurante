const { AccesosService } = require('../services/accesos.service');
class AccesosController {
    static async listarUsuarios(req, res, next) {
        try {
            const data = await AccesosService.listarUsuarios(req.user.sucursalId);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async crearUsuario(req, res, next) {
        try {
            const data = await AccesosService.crearUsuario(req.user, req.body, req.clientMeta);
            res.status(201).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async actualizarUsuario(req, res, next) {
        try {
            const id = Number(req.params.id);
            const data = await AccesosService.actualizarUsuario(req.user, id, req.body, req.clientMeta);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async cambiarEstadoUsuario(req, res, next) {
        try {
            const id = Number(req.params.id);
            const { activo } = req.body;
            const data = await AccesosService.cambiarEstadoUsuario(req.user, id, activo, req.clientMeta);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async listarRoles(_req, res, next) {
        try {
            const data = await AccesosService.listarRoles();
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async crearRol(req, res, next) {
        try {
            const data = await AccesosService.crearRol(req.user, req.body, req.clientMeta);
            res.status(201).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async actualizarPermisosRol(req, res, next) {
        try {
            const rolId = Number(req.params.id);
            const data = await AccesosService.actualizarPermisosRol(req.user, rolId, req.body, req.clientMeta);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async listarPermisos(_req, res, next) {
        try {
            const data = await AccesosService.listarPermisos();
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
}

module.exports = { AccesosController };
