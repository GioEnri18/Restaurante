const { ACCIONES_AUDITORIA } = require('../config/constants');
const { withTransaction } = require('../config/database');
const { Categoria, Ingrediente, Platillo, RecetaIngrediente } = require('../models');
const { NotFoundError } = require('../shared/errors/AppError');
const { AuditService } = require('../shared/services/audit.service');
const { round2, round4 } = require('../shared/utils/tax');

/**
 * Servicio dedicado al mantenimiento de platillos, precios y recetas en onzas.
 */
class PlatillosService {
  static async crearPlatillo(user, input, clientMeta) {
    return withTransaction(async (tx) => {
      const platillo = await Platillo.create(
        {
          categoriaId: input.categoriaId,
          sku: input.sku.trim().toUpperCase(),
          nombre: input.nombre.trim(),
          descripcion: input.descripcion?.trim() || null,
          precioVenta: round2(input.precioVenta),
          disponible: input.disponible ?? true,
        },
        { transaction: tx },
      );

      if (input.receta?.length) {
        await RecetaIngrediente.bulkCreate(
          input.receta.map((r) => ({
            platilloId: platillo.id,
            ingredienteId: r.ingredienteId,
            cantidadOz: round4(r.cantidadOz),
          })),
          { transaction: tx },
        );
      }

      const completo = await Platillo.findByPk(platillo.id, {
        include: [
          { model: Categoria, as: 'categoria' },
          {
            model: RecetaIngrediente,
            as: 'receta',
            include: [{ model: Ingrediente, as: 'ingrediente' }],
          },
        ],
        transaction: tx,
      });

      await AuditService.registrar(
        {
          sucursalId: user.sucursalId,
          usuarioId: user.id,
          accion: ACCIONES_AUDITORIA.CAMBIO_PRECIO,
          entidad: 'Platillo',
          entidadId: platillo.id,
          valorAnterior: null,
          valorNuevo: {
            sku: platillo.sku,
            nombre: platillo.nombre,
            precioVenta: Number(platillo.precioVenta),
            recetaCount: completo?.receta?.length ?? 0,
          },
          motivo: 'Creación de platillo en menú',
          ipAddress: clientMeta.ipAddress,
          userAgent: clientMeta.userAgent,
        },
        tx,
      );

      return (completo ?? platillo).get({ plain: true });
    });
  }

  static async actualizarPlatillo(user, platilloId, input, clientMeta) {
    return withTransaction(async (tx) => {
      const actual = await Platillo.findByPk(platilloId, {
        include: [{ model: RecetaIngrediente, as: 'receta' }],
        transaction: tx,
      });

      if (!actual) {
        throw new NotFoundError('Platillo no encontrado');
      }

      const prevNombre = actual.nombre;
      const precioAnterior = Number(actual.precioVenta);
      const precioNuevo =
        input.precioVenta !== undefined ? round2(input.precioVenta) : precioAnterior;

      await actual.update(
        {
          categoriaId: input.categoriaId ?? actual.categoriaId,
          nombre: input.nombre ? input.nombre.trim() : actual.nombre,
          descripcion:
            input.descripcion !== undefined ? input.descripcion.trim() || null : actual.descripcion,
          precioVenta: precioNuevo,
          disponible: input.disponible ?? actual.disponible,
        },
        { transaction: tx },
      );

      if (input.receta) {
        await RecetaIngrediente.destroy({ where: { platilloId }, transaction: tx });
        if (input.receta.length > 0) {
          await RecetaIngrediente.bulkCreate(
            input.receta.map((r) => ({
              platilloId,
              ingredienteId: r.ingredienteId,
              cantidadOz: round4(r.cantidadOz),
            })),
            { transaction: tx },
          );
        }
      }

      const actualizado = await Platillo.findByPk(platilloId, {
        include: [
          { model: Categoria, as: 'categoria' },
          {
            model: RecetaIngrediente,
            as: 'receta',
            include: [{ model: Ingrediente, as: 'ingrediente' }],
          },
        ],
        transaction: tx,
      });

      if (precioNuevo !== precioAnterior) {
        await AuditService.registrar(
          {
            sucursalId: user.sucursalId,
            usuarioId: user.id,
            accion: ACCIONES_AUDITORIA.CAMBIO_PRECIO,
            entidad: 'Platillo',
            entidadId: platilloId,
            valorAnterior: { nombre: prevNombre, precioVenta: precioAnterior },
            valorNuevo: { nombre: actualizado?.nombre, precioVenta: precioNuevo },
            motivo: input.motivo || 'Actualización de precio en menú',
            ipAddress: clientMeta.ipAddress,
            userAgent: clientMeta.userAgent,
          },
          tx,
        );
      }

      return (actualizado ?? actual).get({ plain: true });
    });
  }
}

module.exports = { PlatillosService };
