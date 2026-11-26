const { ClientesDomicilioService } = require('../services/clientes-domicilio.service');
const { DomiciliosService } = require('../services/domicilios.service');
const { ZonasEntregaService } = require('../services/zonas-entrega.service');

/**
 * Controlador HTTP del módulo de Servicio a Domicilio (Zonas, Clientes/Direcciones y Pedidos).
 */
class DomiciliosController {
  // --- Zonas de entrega ---
  static async listarZonas(req, res, next) {
    try {
      const soloActivas = req.query.soloActivas === 'true';
      const data = await ZonasEntregaService.listar(req.user.sucursalId, { soloActivas });
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async crearZona(req, res, next) {
    try {
      const data = await ZonasEntregaService.crear(req.user, req.body, req.clientMeta);
      res.status(201).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async actualizarZona(req, res, next) {
    try {
      const data = await ZonasEntregaService.actualizar(
        req.user,
        Number(req.params.id),
        req.body,
        req.clientMeta,
      );
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  // --- Clientes y direcciones de entrega ---
  static async listarClientes(req, res, next) {
    try {
      const { items, meta } = await ClientesDomicilioService.listar(req.user.sucursalId, req.query);
      res.status(200).json({ ok: true, data: items, meta });
    } catch (error) {
      next(error);
    }
  }

  static async actualizarBloqueoWebCliente(req, res, next) {
    try {
      const data = await ClientesDomicilioService.actualizarBloqueoWeb(
        req.user,
        Number(req.params.id),
        req.body,
        req.clientMeta,
      );
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async buscarClientesPorTelefono(req, res, next) {
    try {
      const data = await ClientesDomicilioService.buscarPorTelefono(
        req.user.sucursalId,
        String(req.query.telefono ?? ''),
      );
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async obtenerCliente(req, res, next) {
    try {
      const data = await ClientesDomicilioService.obtenerPorId(
        req.user.sucursalId,
        Number(req.params.id),
      );
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async crearCliente(req, res, next) {
    try {
      const data = await ClientesDomicilioService.crearOActualizar(req.user, req.body);
      res.status(201).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async agregarDireccion(req, res, next) {
    try {
      const data = await ClientesDomicilioService.agregarDireccion(
        req.user,
        Number(req.params.id),
        req.body,
      );
      res.status(201).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async desactivarDireccion(req, res, next) {
    try {
      const data = await ClientesDomicilioService.desactivarDireccion(
        req.user,
        Number(req.params.id),
        Number(req.params.direccionId),
      );
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  // --- Repartidores y pedidos ---
  static async listarRepartidores(req, res, next) {
    try {
      const data = await DomiciliosService.listarRepartidores(req.user.sucursalId);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async listarPedidos(req, res, next) {
    try {
      const { items, resumen, serverTime, meta } = await DomiciliosService.listar(req.user, req.query);
      res.status(200).json({ ok: true, data: items, resumen, serverTime, meta });
    } catch (error) {
      next(error);
    }
  }

  static async obtenerPedido(req, res, next) {
    try {
      const data = await DomiciliosService.obtenerDetalle(req.user, Number(req.params.id));
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async crearPedido(req, res, next) {
    try {
      const data = await DomiciliosService.crearPedido(req.user, req.body, req.clientMeta);
      res.status(201).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async asignarRepartidor(req, res, next) {
    try {
      const data = await DomiciliosService.asignarRepartidor(
        req.user,
        Number(req.params.id),
        Number(req.body.repartidorId),
        req.clientMeta,
      );
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async actualizarEstado(req, res, next) {
    try {
      const data = await DomiciliosService.actualizarEstado(
        req.user,
        Number(req.params.id),
        req.body,
        req.clientMeta,
      );
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async liquidarPedido(req, res, next) {
    try {
      const data = await DomiciliosService.liquidarPedido(
        req.user,
        Number(req.params.id),
        req.body,
        req.clientMeta,
      );
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = { DomiciliosController };
