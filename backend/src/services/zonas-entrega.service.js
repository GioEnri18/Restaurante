const { QueryTypes } = require('sequelize');
const { ACCIONES_AUDITORIA, CODIGOS_MOTIVO_AUDITORIA } = require('../config/constants');
const { getPgErrorCode, sequelize, withTransaction } = require('../config/database');
const { ZonaEntrega } = require('../models');
const { ConflictError, NotFoundError } = require('../shared/errors/AppError');
const { AuditService } = require('../shared/services/audit.service');
const { round2 } = require('../shared/utils/tax');

function formatearZona(zona) {
  const plain = typeof zona.get === 'function' ? zona.get({ plain: true }) : zona;
  return {
    ...plain,
    costoEnvio: round2(Number(plain.costoEnvio)),
    pedidoMinimo: round2(Number(plain.pedidoMinimo)),
    tiempoEstimadoMin: Number(plain.tiempoEstimadoMin),
  };
}

/**
 * Gestión de zonas de entrega por sucursal (tarifas de envío IVA incluido, tiempo estimado y pedido mínimo).
 * Nunca elimina registros físicamente; utiliza desactivación lógica (`activa = false`).
 */
class ZonasEntregaService {
  static async listar(sucursalId, { soloActivas = false } = {}) {
    const where = { sucursalId, ...(soloActivas ? { activa: true } : {}) };
    const zonas = await ZonaEntrega.findAll({
      where,
      order: [
        ['activa', 'DESC'],
        ['nombre', 'ASC'],
      ],
    });
    return zonas.map(formatearZona);
  }

  static async crear(user, input, clientMeta) {
    const nombre = input.nombre.trim();
    const descripcion = input.descripcion?.trim() || null;
    const costoEnvio = round2(Number(input.costoEnvio));
    const pedidoMinimo = round2(Number(input.pedidoMinimo ?? 0));
    const tiempoEstimadoMin = Number(input.tiempoEstimadoMin);
    const activa = input.activa !== undefined ? Boolean(input.activa) : true;

    try {
      return await withTransaction(async (tx) => {
        const duplicada = await sequelize.query(
          `SELECT id FROM "zonas_entrega"
           WHERE "sucursal_id" = :sucursalId AND LOWER(TRIM("nombre")) = LOWER(:nombre)
           LIMIT 1`,
          {
            replacements: { sucursalId: user.sucursalId, nombre },
            type: QueryTypes.SELECT,
            transaction: tx,
          },
        );
        if (duplicada.length > 0) {
          throw new ConflictError(`Ya existe una zona de entrega llamada "${nombre}" en esta sucursal`);
        }

        const zona = await ZonaEntrega.create(
          {
            sucursalId: user.sucursalId,
            nombre,
            descripcion,
            costoEnvio,
            tiempoEstimadoMin,
            pedidoMinimo,
            activa,
          },
          { transaction: tx },
        );

        await AuditService.registrarEvento(
          { user, clientMeta },
          {
            accion: ACCIONES_AUDITORIA.GESTION_ZONA_ENTREGA,
            entidad: 'ZonaEntrega',
            entidadId: zona.id,
            valorAnterior: null,
            valorNuevo: {
              nombre: zona.nombre,
              costoEnvio,
              tiempoEstimadoMin,
              pedidoMinimo,
              activa,
            },
            codigoMotivo: CODIGOS_MOTIVO_AUDITORIA.GESTION_CATALOGO,
            motivo: `Creación de zona de entrega "${zona.nombre}"`,
            impactoFinanciero: 0,
          },
          tx,
        );

        return formatearZona(zona);
      });
    } catch (error) {
      if (getPgErrorCode(error) === '23505') {
        throw new ConflictError(`Ya existe una zona de entrega llamada "${nombre}" en esta sucursal`);
      }
      throw error;
    }
  }

  static async actualizar(user, zonaId, input, clientMeta) {
    try {
      return await withTransaction(async (tx) => {
        const zona = await ZonaEntrega.findOne({
          where: { id: zonaId, sucursalId: user.sucursalId },
          lock: tx.LOCK.UPDATE,
          transaction: tx,
        });
        if (!zona) {
          throw new NotFoundError('Zona de entrega no encontrada');
        }

        const anterior = {
          nombre: zona.nombre,
          descripcion: zona.descripcion,
          costoEnvio: round2(Number(zona.costoEnvio)),
          tiempoEstimadoMin: Number(zona.tiempoEstimadoMin),
          pedidoMinimo: round2(Number(zona.pedidoMinimo)),
          activa: zona.activa,
        };

        const nombreNuevo = input.nombre !== undefined ? input.nombre.trim() : zona.nombre;
        if (nombreNuevo.toLowerCase() !== zona.nombre.trim().toLowerCase()) {
          const duplicada = await sequelize.query(
            `SELECT id FROM "zonas_entrega"
             WHERE "sucursal_id" = :sucursalId AND LOWER(TRIM("nombre")) = LOWER(:nombre) AND id <> :zonaId
             LIMIT 1`,
            {
              replacements: { sucursalId: user.sucursalId, nombre: nombreNuevo, zonaId },
              type: QueryTypes.SELECT,
              transaction: tx,
            },
          );
          if (duplicada.length > 0) {
            throw new ConflictError(`Ya existe otra zona de entrega llamada "${nombreNuevo}"`);
          }
        }

        const cambios = {
          nombre: nombreNuevo,
          descripcion: input.descripcion !== undefined ? (input.descripcion?.trim() || null) : zona.descripcion,
          costoEnvio: input.costoEnvio !== undefined ? round2(Number(input.costoEnvio)) : anterior.costoEnvio,
          tiempoEstimadoMin:
            input.tiempoEstimadoMin !== undefined
              ? Number(input.tiempoEstimadoMin)
              : anterior.tiempoEstimadoMin,
          pedidoMinimo:
            input.pedidoMinimo !== undefined ? round2(Number(input.pedidoMinimo)) : anterior.pedidoMinimo,
          activa: input.activa !== undefined ? Boolean(input.activa) : zona.activa,
        };

        await zona.update(cambios, { transaction: tx });

        await AuditService.registrarEvento(
          { user, clientMeta },
          {
            accion: ACCIONES_AUDITORIA.GESTION_ZONA_ENTREGA,
            entidad: 'ZonaEntrega',
            entidadId: zona.id,
            valorAnterior: anterior,
            valorNuevo: cambios,
            codigoMotivo: CODIGOS_MOTIVO_AUDITORIA.GESTION_CATALOGO,
            motivo: `Actualización de zona de entrega "${cambios.nombre}"`,
            impactoFinanciero: 0,
          },
          tx,
        );

        return formatearZona(zona);
      });
    } catch (error) {
      if (getPgErrorCode(error) === '23505') {
        throw new ConflictError('Ya existe otra zona de entrega con ese nombre en esta sucursal');
      }
      throw error;
    }
  }
}

module.exports = { ZonasEntregaService, formatearZona };
