const { Op } = require('sequelize');
const { ACCIONES_AUDITORIA, CODIGOS_MOTIVO_AUDITORIA } = require('../config/constants');
const { getPgErrorCode, withTransaction } = require('../config/database');
const { env } = require('../config/env');
const { Cliente, DireccionEntrega, ZonaEntrega } = require('../models');
const { BadRequestError, ConflictError, NotFoundError } = require('../shared/errors/AppError');
const { AuditService } = require('../shared/services/audit.service');
const { patronContiene } = require('../shared/utils/busqueda');
const { buildPaginationMeta, parsePagination } = require('../shared/utils/pagination');
const { enmascararTelefono, normalizarTelefono } = require('../shared/utils/privacidadDomicilio');
const { round2 } = require('../shared/utils/tax');

function formatearDireccion(dir) {
  const plain = typeof dir.get === 'function' ? dir.get({ plain: true }) : dir;
  return {
    id: plain.id,
    clienteId: plain.clienteId,
    zonaEntregaId: plain.zonaEntregaId ?? null,
    alias: plain.alias,
    direccion: plain.direccion,
    referencia: plain.referencia ?? null,
    esPrincipal: Boolean(plain.esPrincipal),
    activa: Boolean(plain.activa),
    zonaEntrega: plain.zonaEntrega
      ? {
          id: plain.zonaEntrega.id,
          nombre: plain.zonaEntrega.nombre,
          costoEnvio: round2(Number(plain.zonaEntrega.costoEnvio)),
          tiempoEstimadoMin: Number(plain.zonaEntrega.tiempoEstimadoMin),
          pedidoMinimo: round2(Number(plain.zonaEntrega.pedidoMinimo)),
          activa: Boolean(plain.zonaEntrega.activa),
        }
      : null,
  };
}

function formatearCliente(cliente) {
  const plain = typeof cliente.get === 'function' ? cliente.get({ plain: true }) : cliente;
  return {
    id: plain.id,
    nombre: plain.nombre,
    telefono: plain.telefono,
    nit: plain.nit ?? null,
    notas: plain.notas ?? null,
    bloqueadoPedidosWeb: Boolean(plain.bloqueadoPedidosWeb),
    activo: Boolean(plain.activo),
    direcciones: (plain.direcciones ?? []).map(formatearDireccion),
  };
}

const INCLUDE_DIRECCIONES_ACTIVAS = [
  {
    model: DireccionEntrega,
    as: 'direcciones',
    where: { activa: true },
    required: false,
    separate: true,
    order: [
      ['esPrincipal', 'DESC'],
      ['updatedAt', 'DESC'],
    ],
    include: [{ model: ZonaEntrega, as: 'zonaEntrega' }],
  },
];

/**
 * Servicio de clientes y direcciones de entrega del módulo de Domicilios.
 * - Unicidad por (sucursal_id, telefono) normalizado.
 * - Búsqueda por teléfono acotada por `DELIVERY_CLIENTE_BUSQUEDA_LIMIT` y protegida por rate limit en ruta.
 */
class ClientesDomicilioService {
  static async listar(sucursalId, query = {}) {
    const { page, limit, skip } = parsePagination(query.page, query.limit);
    const where = { sucursalId, activo: true };

    if (query.soloBloqueados === 'true') {
      where.bloqueadoPedidosWeb = true;
    }

    const searchRaw = typeof query.search === 'string' ? query.search.trim() : '';
    if (searchRaw.length > 0) {
      const telNorm = normalizarTelefono(searchRaw);
      const condiciones = [{ nombre: { [Op.iLike]: patronContiene(searchRaw) } }];
      if (telNorm.length >= 3) {
        condiciones.push({ telefono: { [Op.like]: `%${telNorm}%` } });
      }
      where[Op.or] = condiciones;
    }

    const { rows, count } = await Cliente.findAndCountAll({
      where,
      order: [
        ['bloqueadoPedidosWeb', 'DESC'],
        ['updatedAt', 'DESC'],
        ['id', 'DESC'],
      ],
      offset: skip,
      limit,
    });

    return {
      items: rows.map(formatearCliente),
      meta: buildPaginationMeta(count, page, limit),
    };
  }

  /**
   * Activa o desactiva la marca `bloqueado_pedidos_web` de un cliente de domicilio.
   * Acción exclusiva de Administrador (`domicilios:configurar`), auditada en `auditoria_logs`
   * sin registrar el teléfono en texto plano (solo enmascarado).
   */
  static async actualizarBloqueoWeb(user, clienteId, { bloqueado, motivo }, clientMeta) {
    return withTransaction(async (tx) => {
      const cliente = await Cliente.findOne({
        where: { id: clienteId, sucursalId: user.sucursalId, activo: true },
        lock: tx.LOCK.UPDATE,
        transaction: tx,
      });
      if (!cliente) {
        throw new NotFoundError('Cliente de domicilio no encontrado');
      }

      const valorAnterior = Boolean(cliente.bloqueadoPedidosWeb);
      const valorNuevo = Boolean(bloqueado);
      if (valorAnterior !== valorNuevo) {
        await cliente.update({ bloqueadoPedidosWeb: valorNuevo }, { transaction: tx });

        await AuditService.registrarEvento(
          {
            sucursalId: user.sucursalId,
            usuarioId: user.id,
            actorRolCodigo: user.rol?.codigo ?? null,
            clientMeta,
          },
          {
            accion: ACCIONES_AUDITORIA.CLIENTE_BLOQUEO_WEB,
            entidad: 'Cliente',
            entidadId: cliente.id,
            valorAnterior: { bloqueadoPedidosWeb: valorAnterior },
            valorNuevo: {
              bloqueadoPedidosWeb: valorNuevo,
              telefonoEnmascarado: enmascararTelefono(cliente.telefono),
            },
            codigoMotivo: CODIGOS_MOTIVO_AUDITORIA.SEGURIDAD_ACCESO,
            motivo:
              motivo?.trim() ||
              (valorNuevo
                ? 'Cliente bloqueado manualmente para pedidos web'
                : 'Cliente desbloqueado manualmente para pedidos web'),
            impactoFinanciero: 0,
          },
          tx,
        );
      }

      return formatearCliente(cliente);
    });
  }

  static async buscarPorTelefono(sucursalId, telefonoRaw) {
    const telefonoLimpio = normalizarTelefono(telefonoRaw);
    if (telefonoLimpio.length < 4) {
      throw new BadRequestError('Ingresa al menos 4 dígitos del teléfono para buscar');
    }

    const clientes = await Cliente.findAll({
      where: {
        sucursalId,
        activo: true,
        telefono: { [Op.like]: `${telefonoLimpio}%` },
      },
      order: [
        ['updatedAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: env.DELIVERY_CLIENTE_BUSQUEDA_LIMIT,
      include: INCLUDE_DIRECCIONES_ACTIVAS,
    });

    return clientes.map(formatearCliente);
  }

  static async obtenerPorId(sucursalId, clienteId) {
    const cliente = await Cliente.findOne({
      where: { id: clienteId, sucursalId, activo: true },
      include: INCLUDE_DIRECCIONES_ACTIVAS,
    });
    if (!cliente) {
      throw new NotFoundError('Cliente de domicilio no encontrado');
    }
    return formatearCliente(cliente);
  }

  /**
   * Resuelve o crea cliente + dirección dentro de una transacción activa (usado por `crearPedido` y POST /clientes).
   */
  static async resolverClienteYDireccionEnTx(tx, sucursalId, input) {
    let cliente;

    if (input.clienteId) {
      cliente = await Cliente.findOne({
        where: { id: input.clienteId, sucursalId, activo: true },
        lock: tx.LOCK.UPDATE,
        transaction: tx,
      });
      if (!cliente) {
        throw new NotFoundError('El cliente seleccionado no existe en esta sucursal');
      }
      // Actualiza nombre/NIT si el operador envió datos actualizados
      const cambiosCliente = {};
      if (input.cliente?.nombre?.trim() && input.cliente.nombre.trim() !== cliente.nombre) {
        cambiosCliente.nombre = input.cliente.nombre.trim();
      }
      if (input.cliente?.nit !== undefined) {
        const nitLimpio = input.cliente.nit?.trim() || null;
        if (nitLimpio !== cliente.nit) cambiosCliente.nit = nitLimpio;
      }
      if (Object.keys(cambiosCliente).length > 0) {
        await cliente.update(cambiosCliente, { transaction: tx });
      }
    } else if (input.cliente) {
      const telefono = normalizarTelefono(input.cliente.telefono);
      if (telefono.length < 8 || telefono.length > 15) {
        throw new BadRequestError('El teléfono del cliente debe contener entre 8 y 15 dígitos');
      }
      const nombre = input.cliente.nombre.trim();
      const nit = input.cliente.nit?.trim() || null;
      const notas = input.cliente.notas?.trim() || null;

      cliente = await Cliente.findOne({
        where: { sucursalId, telefono },
        lock: tx.LOCK.UPDATE,
        transaction: tx,
      });

      if (cliente) {
        await cliente.update(
          {
            nombre,
            ...(nit !== null ? { nit } : {}),
            ...(notas !== null ? { notas } : {}),
            activo: true,
          },
          { transaction: tx },
        );
      } else {
        cliente = await Cliente.create(
          { sucursalId, nombre, telefono, nit, notas, activo: true },
          { transaction: tx },
        );
      }
    } else {
      throw new BadRequestError('Debes seleccionar un cliente existente o ingresar los datos del cliente');
    }

    let direccion;
    if (input.direccionEntregaId) {
      direccion = await DireccionEntrega.findOne({
        where: {
          id: input.direccionEntregaId,
          clienteId: cliente.id,
          sucursalId,
          activa: true,
        },
        transaction: tx,
      });
      if (!direccion) {
        throw new NotFoundError('La dirección de entrega seleccionada no pertenece al cliente o está inactiva');
      }
    } else if (input.direccionNueva) {
      const esPrincipal = input.direccionNueva.esPrincipal !== undefined
        ? Boolean(input.direccionNueva.esPrincipal)
        : false;
      if (esPrincipal) {
        await DireccionEntrega.update(
          { esPrincipal: false },
          { where: { clienteId: cliente.id, sucursalId, esPrincipal: true }, transaction: tx },
        );
      }
      direccion = await DireccionEntrega.create(
        {
          sucursalId,
          clienteId: cliente.id,
          zonaEntregaId: input.zonaEntregaId ?? input.direccionNueva.zonaEntregaId ?? null,
          alias: input.direccionNueva.alias?.trim() || 'Principal',
          direccion: input.direccionNueva.direccion.trim(),
          referencia: input.direccionNueva.referencia?.trim() || null,
          esPrincipal,
          activa: true,
        },
        { transaction: tx },
      );
    } else {
      throw new BadRequestError('Debes seleccionar una dirección de entrega o registrar una nueva');
    }

    return { cliente, direccion };
  }

  static async crearOActualizar(user, input) {
    try {
      return await withTransaction(async (tx) => {
        const telefono = normalizarTelefono(input.telefono);
        if (telefono.length < 8 || telefono.length > 15) {
          throw new BadRequestError('El teléfono debe contener entre 8 y 15 dígitos');
        }

        let cliente = await Cliente.findOne({
          where: { sucursalId: user.sucursalId, telefono },
          lock: tx.LOCK.UPDATE,
          transaction: tx,
        });

        if (cliente) {
          await cliente.update(
            {
              nombre: input.nombre.trim(),
              nit: input.nit !== undefined ? (input.nit?.trim() || null) : cliente.nit,
              notas: input.notas !== undefined ? (input.notas?.trim() || null) : cliente.notas,
              activo: true,
            },
            { transaction: tx },
          );
        } else {
          cliente = await Cliente.create(
            {
              sucursalId: user.sucursalId,
              nombre: input.nombre.trim(),
              telefono,
              nit: input.nit?.trim() || null,
              notas: input.notas?.trim() || null,
              activo: true,
            },
            { transaction: tx },
          );
        }

        if (input.direccionInicial) {
          if (input.direccionInicial.zonaEntregaId) {
            const zona = await ZonaEntrega.findOne({
              where: { id: input.direccionInicial.zonaEntregaId, sucursalId: user.sucursalId, activa: true },
              transaction: tx,
            });
            if (!zona) {
              throw new NotFoundError('La zona de entrega indicada no existe o está inactiva');
            }
          }
          await DireccionEntrega.create(
            {
              sucursalId: user.sucursalId,
              clienteId: cliente.id,
              zonaEntregaId: input.direccionInicial.zonaEntregaId ?? null,
              alias: input.direccionInicial.alias?.trim() || 'Principal',
              direccion: input.direccionInicial.direccion.trim(),
              referencia: input.direccionInicial.referencia?.trim() || null,
              esPrincipal: true,
              activa: true,
            },
            { transaction: tx },
          );
        }

        const completo = await Cliente.findByPk(cliente.id, {
          include: INCLUDE_DIRECCIONES_ACTIVAS,
          transaction: tx,
        });
        return formatearCliente(completo ?? cliente);
      });
    } catch (error) {
      if (getPgErrorCode(error) === '23505') {
        throw new ConflictError('Ya existe un cliente registrado con ese número de teléfono');
      }
      throw error;
    }
  }

  static async agregarDireccion(user, clienteId, input) {
    return withTransaction(async (tx) => {
      const cliente = await Cliente.findOne({
        where: { id: clienteId, sucursalId: user.sucursalId, activo: true },
        transaction: tx,
      });
      if (!cliente) {
        throw new NotFoundError('Cliente de domicilio no encontrado');
      }
      if (input.zonaEntregaId) {
        const zona = await ZonaEntrega.findOne({
          where: { id: input.zonaEntregaId, sucursalId: user.sucursalId, activa: true },
          transaction: tx,
        });
        if (!zona) {
          throw new NotFoundError('Zona de entrega no encontrada o inactiva');
        }
      }
      if (input.esPrincipal) {
        await DireccionEntrega.update(
          { esPrincipal: false },
          { where: { clienteId: cliente.id, sucursalId: user.sucursalId, esPrincipal: true }, transaction: tx },
        );
      }

      const direccion = await DireccionEntrega.create(
        {
          sucursalId: user.sucursalId,
          clienteId: cliente.id,
          zonaEntregaId: input.zonaEntregaId ?? null,
          alias: input.alias?.trim() || 'Principal',
          direccion: input.direccion.trim(),
          referencia: input.referencia?.trim() || null,
          esPrincipal: Boolean(input.esPrincipal),
          activa: true,
        },
        { transaction: tx },
      );

      const completa = await DireccionEntrega.findByPk(direccion.id, {
        include: [{ model: ZonaEntrega, as: 'zonaEntrega' }],
        transaction: tx,
      });
      return formatearDireccion(completa ?? direccion);
    });
  }

  static async desactivarDireccion(user, clienteId, direccionId) {
    return withTransaction(async (tx) => {
      const direccion = await DireccionEntrega.findOne({
        where: { id: direccionId, clienteId, sucursalId: user.sucursalId, activa: true },
        lock: tx.LOCK.UPDATE,
        transaction: tx,
      });
      if (!direccion) {
        throw new NotFoundError('Dirección de entrega no encontrada');
      }
      await direccion.update({ activa: false, esPrincipal: false }, { transaction: tx });
      return { id: direccion.id, activa: false };
    });
  }
}

module.exports = { ClientesDomicilioService };
