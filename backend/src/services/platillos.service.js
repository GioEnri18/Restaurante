const { ACCIONES_AUDITORIA } = require('../config/constants');
const { withTransaction } = require('../config/database');
const { Op } = require('sequelize');
const { Categoria, Ingrediente, Platillo, RecetaIngrediente } = require('../models');
const { BadRequestError, NotFoundError } = require('../shared/errors/AppError');
const { AuditService } = require('../shared/services/audit.service');
const { round2, round4 } = require('../shared/utils/tax');

/**
 * Aislamiento por sucursal: la categoría debe ser de la sucursal del usuario (o global)
 * y todos los ingredientes de la receta deben pertenecer a su sucursal y estar activos.
 */
async function validarReferenciasSucursal(sucursalId, { categoriaId, receta }, tx) {
  if (categoriaId !== undefined) {
    const categoria = await Categoria.findOne({
      where: {
        id: categoriaId,
        activa: true,
        [Op.or]: [{ sucursalId }, { sucursalId: null }],
      },
      transaction: tx,
    });
    if (!categoria) {
      throw new NotFoundError('La categoría seleccionada no existe en esta sucursal');
    }
  }

  if (receta?.length) {
    const ids = receta.map((r) => r.ingredienteId);
    const unicos = new Set(ids);
    if (unicos.size !== ids.length) {
      throw new BadRequestError('La receta contiene ingredientes repetidos');
    }
    const encontrados = await Ingrediente.count({
      where: { id: { [Op.in]: Array.from(unicos) }, sucursalId, activo: true },
      transaction: tx,
    });
    if (encontrados !== unicos.size) {
      throw new NotFoundError('Uno o más ingredientes de la receta no existen en esta sucursal');
    }
  }
}

/**
 * Servicio dedicado al mantenimiento de platillos, precios y recetas en onzas.
 */
class PlatillosService {
  static async crearPlatillo(user, input, clientMeta) {
    return withTransaction(async (tx) => {
      await validarReferenciasSucursal(user.sucursalId, input, tx);
      const platillo = await Platillo.create(
        {
          sucursalId: user.sucursalId,
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
      // Alcance de sucursal: un platillo de otra sucursal se trata como inexistente (404)
      const actual = await Platillo.findOne({
        where: { id: platilloId, sucursalId: user.sucursalId },
        include: [{ model: RecetaIngrediente, as: 'receta' }],
        // FOR UPDATE OF solo sobre la fila del platillo (no admite el lado nullable del LEFT JOIN)
        lock: { level: tx.LOCK.UPDATE, of: Platillo },
        transaction: tx,
      });

      if (!actual) {
        throw new NotFoundError('Platillo no encontrado');
      }

      await validarReferenciasSucursal(user.sucursalId, input, tx);

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
