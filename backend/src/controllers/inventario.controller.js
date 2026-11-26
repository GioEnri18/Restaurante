const { TipoMovimientoInventario } = require('../models');
const { InventarioService } = require('../services/inventario.service');
const { MermasService } = require('../services/mermas.service');
class InventarioController {
    static async listarIngredientes(req, res, next) {
        try {
            const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
            const resultado = await InventarioService.listarIngredientes(req.user.sucursalId, search, {
                page: req.query.page,
                porReponer: req.query.porReponer === 'true',
                soloNegativos: req.query.soloNegativos === 'true',
            });
            res.status(200).json({ ok: true, ...(Array.isArray(resultado) ? { data: resultado } : resultado) });
        }
        catch (error) {
            next(error);
        }
    }
    static async listarEnNegativo(req, res, next) {
        try {
            const { items, resumen } = await InventarioService.obtenerEnNegativo(req.user.sucursalId);
            res.status(200).json({ ok: true, data: items, resumen });
        }
        catch (error) {
            next(error);
        }
    }
    static async alertas(req, res, next) {
        try {
            const data = await InventarioService.obtenerAlertas(req.user.sucursalId);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async crearIngrediente(req, res, next) {
        try {
            const data = await InventarioService.crearIngrediente(req.user, req.body, req.clientMeta);
            res.status(201).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async actualizarIngrediente(req, res, next) {
        try {
            const id = Number(req.params.id);
            const data = await InventarioService.actualizarIngrediente(req.user, id, req.body, req.clientMeta);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async ajustarStock(req, res, next) {
        try {
            const id = Number(req.params.id);
            const data = await InventarioService.ajustarStock(req.user, id, req.body, req.clientMeta);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async listarProveedores(req, res, next) {
        try {
            const data = await InventarioService.listarProveedores(req.user.sucursalId);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async crearProveedor(req, res, next) {
        try {
            const data = await InventarioService.crearProveedor(req.user.sucursalId, req.body);
            res.status(201).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async actualizarProveedor(req, res, next) {
        try {
            const id = Number(req.params.id);
            const data = await InventarioService.actualizarProveedor(req.user.sucursalId, id, req.body);
            res.status(200).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async listarCompras(req, res, next) {
        try {
            const { items, meta } = await InventarioService.listarCompras(req.user.sucursalId, req.query.page, req.query.limit);
            res.status(200).json({ ok: true, data: items, meta });
        }
        catch (error) {
            next(error);
        }
    }
    static async registrarCompra(req, res, next) {
        try {
            const data = await InventarioService.registrarCompra(req.user, req.body, req.clientMeta);
            res.status(201).json({ ok: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    static async listarMovimientos(req, res, next) {
        try {
            const { items, meta } = await InventarioService.listarMovimientos(req.user.sucursalId, {
                page: req.query.page,
                limit: req.query.limit,
                ingredienteId: typeof req.query.ingredienteId === 'string' ? req.query.ingredienteId : undefined,
                tipo: typeof req.query.tipo === 'string' &&
                    Object.values(TipoMovimientoInventario).includes(req.query.tipo)
                    ? req.query.tipo
                    : undefined,
                fechaDesde: typeof req.query.fechaDesde === 'string' ? req.query.fechaDesde : undefined,
                fechaHasta: typeof req.query.fechaHasta === 'string' ? req.query.fechaHasta : undefined,
            });
            res.status(200).json({ ok: true, data: items, meta });
        }
        catch (error) {
            next(error);
        }
    }
    static async mermasPorIngrediente(req, res, next) {
        try {
            const { items, resumen, meta } = await MermasService.resumenPorIngrediente(req.user.sucursalId, {
                page: req.query.page,
                limit: req.query.limit,
                search: typeof req.query.search === 'string' ? req.query.search : undefined,
                motivo: typeof req.query.motivo === 'string' ? req.query.motivo : undefined,
                fechaDesde: typeof req.query.fechaDesde === 'string' ? req.query.fechaDesde : undefined,
                fechaHasta: typeof req.query.fechaHasta === 'string' ? req.query.fechaHasta : undefined,
                ordenar: typeof req.query.ordenar === 'string' ? req.query.ordenar : undefined,
            });
            res.status(200).json({ ok: true, data: items, resumen, meta });
        }
        catch (error) {
            next(error);
        }
    }
}

module.exports = { InventarioController };
