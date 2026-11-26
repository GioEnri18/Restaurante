const { PublicPedidosService } = require('../services/public-pedidos.service');

class PublicPedidosController {
  static async listarSucursales(_req, res, next) {
    try {
      const data = await PublicPedidosService.listarSucursales();
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async obtenerMenu(req, res, next) {
    try {
      const sucursal = typeof req.query.sucursal === 'string' ? req.query.sucursal : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const categoriaId = req.query.categoriaId ? Number(req.query.categoriaId) : undefined;
      const data = await PublicPedidosService.obtenerMenuPublico(sucursal, search, categoriaId);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async crearPedido(req, res, next) {
    try {
      const data = await PublicPedidosService.crearPedidoPublico(req.body, req.clientMeta);
      res.status(201).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async consultarSeguimiento(req, res, next) {
    try {
      const data = await PublicPedidosService.consultarSeguimiento(req.params.token);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = { PublicPedidosController };
