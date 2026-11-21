const { Op, col, fn } = require('sequelize');
const { ACCIONES_AUDITORIA } = require('../config/constants');
const { withTransaction } = require('../config/database');
const { Ingrediente, InventarioMovimiento, Merma, TipoMovimientoInventario, Usuario } = require('../models');
const { BadRequestError, NotFoundError } = require('../shared/errors/AppError');
const { AuditService } = require('../shared/services/audit.service');
const { UnitConversionService } = require('../shared/services/unitConversion.service');
const { endOfDayInTimezone, startOfDayInTimezone } = require('../shared/utils/dates');
const { buildPaginationMeta, parsePagination } = require('../shared/utils/pagination');
const { round2, round4 } = require('../shared/utils/tax');
class MermasService {
    static async listar(sucursalId, query) {
        const { page, limit, skip } = parsePagination(query.page, query.limit, 10);
        const where = { sucursalId };
        if (query.motivo)
            where.motivo = query.motivo;
        if (query.ingredienteId)
            where.ingredienteId = Number(query.ingredienteId);
        if (query.fechaDesde || query.fechaHasta) {
            const rango = {};
            if (query.fechaDesde)
                rango[Op.gte] = startOfDayInTimezone(query.fechaDesde);
            if (query.fechaHasta)
                rango[Op.lte] = endOfDayInTimezone(query.fechaHasta);
            where.fecha = rango;
        }
        const [{ rows, count }, agregado] = await Promise.all([
            Merma.findAndCountAll({
                where: where,
                order: [['fecha', 'DESC']],
                offset: skip,
                limit,
                include: [
                    { model: Ingrediente, as: 'ingrediente', attributes: ['id', 'codigo', 'nombre'] },
                    { model: Usuario, as: 'usuario', attributes: ['id', 'nombreCompleto'] },
                ],
            }),
            Merma.findOne({
                where: where,
                attributes: [
                    [fn('COALESCE', fn('SUM', col('costo_estimado')), 0), 'costoTotalMermas'],
                    [fn('COALESCE', fn('SUM', col('cantidad_oz')), 0), 'totalOzMermadas'],
                ],
                raw: true,
            }),
        ]);
        const costoTotalMermas = Number(agregado?.costoTotalMermas ?? 0);
        const totalOzMermadas = Number(agregado?.totalOzMermadas ?? 0);
        return {
            items: rows.map((m) => ({
                ...m.get({ plain: true }),
                cantidadOriginal: Number(m.cantidadOriginal),
                cantidadOz: Number(m.cantidadOz),
                costoEstimado: Number(m.costoEstimado),
            })),
            resumen: {
                costoTotalMermas: round2(costoTotalMermas),
                totalOzMermadas: round4(totalOzMermadas),
                totalLbMermadas: UnitConversionService.ozToLb(totalOzMermadas),
            },
            meta: buildPaginationMeta(count, page, limit),
        };
    }
    /**
     * Cada merma bloquea el ingrediente (FOR UPDATE), descuenta automáticamente del inventario
     * en onzas y genera tanto un movimiento SALIDA_MERMA en Kardex como su registro en auditoría.
     */
    static async registrar(user, input, clientMeta) {
        return withTransaction(async (tx) => {
            const ingrediente = await Ingrediente.findOne({
                where: { id: input.ingredienteId, sucursalId: user.sucursalId, activo: true },
                lock: tx.LOCK.UPDATE,
                transaction: tx,
            });
            if (!ingrediente) {
                throw new NotFoundError('Ingrediente no encontrado');
            }
            const cantidadOz = UnitConversionService.toBaseOz(input.cantidad, input.unidad);
            const stockAnteriorOz = Number(ingrediente.stockActualOz);
            if (cantidadOz > stockAnteriorOz) {
                throw new BadRequestError(`La merma (${cantidadOz} oz) supera las existencias actuales (${stockAnteriorOz} oz)`);
            }
            const stockNuevoOz = round4(stockAnteriorOz - cantidadOz);
            const costoUnitarioOz = Number(ingrediente.costoPromedioOz);
            const costoEstimado = round2(cantidadOz * costoUnitarioOz);
            const merma = await Merma.create({
                sucursalId: user.sucursalId,
                ingredienteId: ingrediente.id,
                usuarioId: user.id,
                cantidadOriginal: round4(input.cantidad),
                unidadOriginal: input.unidad,
                cantidadOz,
                costoEstimado,
                motivo: input.motivo,
                observacion: input.observacion?.trim() || null,
                fecha: input.fecha ? new Date(input.fecha) : new Date(),
            }, { transaction: tx });
            await ingrediente.update({ stockActualOz: stockNuevoOz }, { transaction: tx });
            await InventarioMovimiento.create({
                sucursalId: user.sucursalId,
                ingredienteId: ingrediente.id,
                usuarioId: user.id,
                tipo: TipoMovimientoInventario.SALIDA_MERMA,
                cantidadOz: -cantidadOz,
                stockAnteriorOz,
                stockNuevoOz,
                costoUnitarioOz,
                referenciaTipo: 'MERMA',
                referenciaId: merma.id,
                motivo: `Merma (${input.motivo}): ${input.observacion?.trim() || 'Sin observación'}`,
            }, { transaction: tx });
            await AuditService.registrar({
                sucursalId: user.sucursalId,
                usuarioId: user.id,
                accion: ACCIONES_AUDITORIA.REGISTRO_MERMA,
                entidad: 'Merma',
                entidadId: merma.id,
                valorAnterior: {
                    ingrediente: ingrediente.nombre,
                    stockActualOz: stockAnteriorOz,
                },
                valorNuevo: {
                    ingrediente: ingrediente.nombre,
                    stockActualOz: stockNuevoOz,
                    cantidadMermada: `${input.cantidad} ${input.unidad} (${cantidadOz} oz)`,
                    motivo: input.motivo,
                    costoEstimado,
                },
                motivo: input.observacion?.trim() || input.motivo,
                ipAddress: clientMeta.ipAddress,
                userAgent: clientMeta.userAgent,
            }, tx);
            const mermaCompleta = await Merma.findByPk(merma.id, {
                include: [
                    { model: Ingrediente, as: 'ingrediente', attributes: ['id', 'codigo', 'nombre'] },
                    { model: Usuario, as: 'usuario', attributes: ['id', 'nombreCompleto'] },
                ],
                transaction: tx,
            });
            const plain = (mermaCompleta ?? merma).get({ plain: true });
            return {
                ...plain,
                cantidadOriginal: Number(merma.cantidadOriginal),
                cantidadOz: Number(merma.cantidadOz),
                costoEstimado: Number(merma.costoEstimado),
            };
        });
    }
}

module.exports = { MermasService };
