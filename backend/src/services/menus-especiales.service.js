const { Op } = require('sequelize');
const { ACCIONES_AUDITORIA } = require('../config/constants');
const { withTransaction } = require('../config/database');
const { env } = require('../config/env');
const { Categoria, MenuEspecial, MenuEspecialPlatillo, Platillo, Usuario } = require('../models');
const { BadRequestError, NotFoundError } = require('../shared/errors/AppError');
const { AuditService } = require('../shared/services/audit.service');
const { endOfDayInTimezone, startOfDayInTimezone, toIsoDateInTimezone } = require('../shared/utils/dates');
const { round2 } = require('../shared/utils/tax');
const { evaluarEstadoMenuEspecial } = require('./menu.service');

/** Aislamiento por sucursal: todos los platillos del menú especial deben ser de la sucursal */
async function validarPlatillosSucursal(sucursalId, platillos, tx) {
  if (!platillos?.length) return;
  const ids = new Set(platillos.map((p) => p.platilloId));
  if (ids.size !== platillos.length) {
    throw new BadRequestError('El menú especial contiene platillos repetidos');
  }
  const encontrados = await Platillo.count({
    where: { id: { [Op.in]: Array.from(ids) }, sucursalId, activo: true },
    transaction: tx,
  });
  if (encontrados !== ids.size) {
    throw new NotFoundError('Uno o más platillos no existen en esta sucursal');
  }
}

/**
 * Servicio dedicado a menús especiales por fecha (gestión exclusiva de Administrador + alertas proactivas).
 */
class MenusEspecialesService {
  static async listarMenusEspeciales(sucursalId) {
    const menus = await MenuEspecial.findAll({
      where: { sucursalId },
      order: [
        ['fechaInicio', 'ASC'],
        ['id', 'DESC'],
      ],
      include: [
        { model: Usuario, as: 'creadoPor', attributes: ['id', 'nombreCompleto'] },
        {
          model: MenuEspecialPlatillo,
          as: 'platillos',
          include: [
            {
              model: Platillo,
              as: 'platillo',
              attributes: ['id', 'sku', 'nombre', 'precioVenta'],
              include: [{ model: Categoria, as: 'categoria', attributes: ['nombre'] }],
            },
          ],
        },
      ],
    });

    return menus.map((m) => {
      const ev = evaluarEstadoMenuEspecial(m);
      return {
        id: m.id,
        nombre: m.nombre,
        descripcion: m.descripcion,
        fechaInicio: m.fechaInicio,
        fechaFin: m.fechaFin,
        fechaInicioLocal: toIsoDateInTimezone(m.fechaInicio),
        fechaFinLocal: toIsoDateInTimezone(m.fechaFin),
        diasAvisoPrevio: m.diasAvisoPrevio,
        activo: m.activo,
        esMenuPrincipal: m.esMenuPrincipal,
        creadoPor: m.creadoPor?.nombreCompleto ?? 'Sistema',
        estado: ev.estado,
        diasRestantes: ev.diasRestantes,
        requiereAtencion: ev.requiereAtencion,
        mensajeAviso: ev.mensajeAviso,
        platillos: (m.platillos ?? []).map((mp) => ({
          platilloId: mp.platilloId,
          sku: mp.platillo?.sku ?? '',
          nombre: mp.platillo?.nombre ?? '',
          categoriaNombre: mp.platillo?.categoria?.nombre ?? '',
          precioRegular: Number(mp.platillo?.precioVenta ?? 0),
          precioEspecial: mp.precioEspecial !== null ? Number(mp.precioEspecial) : null,
        })),
      };
    });
  }

  static async obtenerAlertasMenusEspeciales(sucursalId) {
    const todos = await this.listarMenusEspeciales(sucursalId);
    return todos.filter((m) => m.estado === 'ACTIVO_HOY' || m.estado === 'PROXIMO_AVISO');
  }

  static async crearMenuEspecial(user, input, clientMeta) {
    const fechaInicio = startOfDayInTimezone(input.fechaInicio);
    const fechaFin = endOfDayInTimezone(input.fechaFin);

    if (fechaFin < fechaInicio) {
      throw new BadRequestError('La fecha fin no puede ser anterior a la fecha inicio');
    }

    return withTransaction(async (tx) => {
      await validarPlatillosSucursal(user.sucursalId, input.platillos, tx);
      const creado = await MenuEspecial.create(
        {
          sucursalId: user.sucursalId,
          creadoPorId: user.id,
          nombre: input.nombre.trim(),
          descripcion: input.descripcion?.trim() || null,
          fechaInicio,
          fechaFin,
          diasAvisoPrevio: input.diasAvisoPrevio ?? env.SPECIAL_MENU_DEFAULT_NOTICE_DAYS,
          activo: input.activo ?? true,
          esMenuPrincipal: input.esMenuPrincipal ?? false,
        },
        { transaction: tx },
      );

      if (input.platillos?.length) {
        await MenuEspecialPlatillo.bulkCreate(
          input.platillos.map((p) => ({
            menuEspecialId: creado.id,
            platilloId: p.platilloId,
            precioEspecial:
              p.precioEspecial !== undefined && p.precioEspecial !== null
                ? round2(p.precioEspecial)
                : null,
          })),
          { transaction: tx },
        );
      }

      const completo = await MenuEspecial.findByPk(creado.id, {
        include: [{ model: MenuEspecialPlatillo, as: 'platillos' }],
        transaction: tx,
      });

      await AuditService.registrar(
        {
          sucursalId: user.sucursalId,
          usuarioId: user.id,
          accion: ACCIONES_AUDITORIA.GESTION_MENU_ESPECIAL,
          entidad: 'MenuEspecial',
          entidadId: creado.id,
          valorAnterior: null,
          valorNuevo: {
            nombre: creado.nombre,
            fechaInicio: input.fechaInicio,
            fechaFin: input.fechaFin,
            diasAvisoPrevio: creado.diasAvisoPrevio,
            platillosCount: completo?.platillos?.length ?? 0,
          },
          motivo: 'Creación de menú por fecha especial',
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return (completo ?? creado).get({ plain: true });
    });
  }

  static async actualizarMenuEspecial(user, menuId, input, clientMeta) {
    return withTransaction(async (tx) => {
      const actual = await MenuEspecial.findOne({
        where: { id: menuId, sucursalId: user.sucursalId },
        include: [{ model: MenuEspecialPlatillo, as: 'platillos' }],
        transaction: tx,
        lock: { level: tx.LOCK.UPDATE, of: MenuEspecial },
      });
      if (!actual) {
        throw new NotFoundError('Menú especial no encontrado');
      }

      const prevNombre = actual.nombre;
      const prevActivo = actual.activo;
      const prevPlatillosCount = actual.platillos?.length ?? 0;

      const fechaInicio = input.fechaInicio
        ? startOfDayInTimezone(input.fechaInicio)
        : actual.fechaInicio;
      const fechaFin = input.fechaFin ? endOfDayInTimezone(input.fechaFin) : actual.fechaFin;

      if (fechaFin < fechaInicio) {
        throw new BadRequestError('La fecha fin no puede ser anterior a la fecha inicio');
      }

      await actual.update(
        {
          nombre: input.nombre ? input.nombre.trim() : actual.nombre,
          descripcion:
            input.descripcion !== undefined ? input.descripcion.trim() || null : actual.descripcion,
          fechaInicio,
          fechaFin,
          diasAvisoPrevio: input.diasAvisoPrevio ?? actual.diasAvisoPrevio,
          activo: input.activo ?? actual.activo,
          esMenuPrincipal: input.esMenuPrincipal ?? actual.esMenuPrincipal,
        },
        { transaction: tx },
      );

      if (input.platillos !== undefined) {
        await validarPlatillosSucursal(user.sucursalId, input.platillos, tx);
        await MenuEspecialPlatillo.destroy({ where: { menuEspecialId: menuId }, transaction: tx });
        if (input.platillos.length > 0) {
          await MenuEspecialPlatillo.bulkCreate(
            input.platillos.map((p) => ({
              menuEspecialId: menuId,
              platilloId: p.platilloId,
              precioEspecial:
                p.precioEspecial !== undefined && p.precioEspecial !== null
                  ? round2(p.precioEspecial)
                  : null,
            })),
            { transaction: tx },
          );
        }
      }

      const actualizado = await MenuEspecial.findByPk(menuId, {
        include: [{ model: MenuEspecialPlatillo, as: 'platillos' }],
        transaction: tx,
      });

      await AuditService.registrar(
        {
          sucursalId: user.sucursalId,
          usuarioId: user.id,
          accion: ACCIONES_AUDITORIA.GESTION_MENU_ESPECIAL,
          entidad: 'MenuEspecial',
          entidadId: menuId,
          valorAnterior: {
            nombre: prevNombre,
            activo: prevActivo,
            platillosCount: prevPlatillosCount,
          },
          valorNuevo: {
            nombre: actualizado?.nombre,
            activo: actualizado?.activo,
            platillosCount: actualizado?.platillos?.length ?? 0,
          },
          motivo: 'Actualización de menú especial por fecha',
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return (actualizado ?? actual).get({ plain: true });
    });
  }

  static async eliminarMenuEspecial(user, menuId, clientMeta) {
    return withTransaction(async (tx) => {
      const actual = await MenuEspecial.findOne({
        where: { id: menuId, sucursalId: user.sucursalId },
        transaction: tx,
      });
      if (!actual) {
        throw new NotFoundError('Menú especial no encontrado');
      }

      const nombre = actual.nombre;
      const fechaInicio = actual.fechaInicio;

      await MenuEspecial.destroy({ where: { id: menuId }, transaction: tx });

      await AuditService.registrar(
        {
          sucursalId: user.sucursalId,
          usuarioId: user.id,
          accion: ACCIONES_AUDITORIA.GESTION_MENU_ESPECIAL,
          entidad: 'MenuEspecial',
          entidadId: menuId,
          valorAnterior: { nombre, fechaInicio },
          valorNuevo: null,
          motivo: 'Eliminación de menú especial',
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return { id: menuId, eliminado: true };
    });
  }
}

module.exports = { MenusEspecialesService };
