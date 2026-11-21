const { createHash } = require('node:crypto');
const { Op, col, fn } = require('sequelize');
const { ACCIONES_AUDITORIA } = require('../config/constants');
const { getPgErrorCode, withTransaction } = require('../config/database');
const { Ingrediente, InventarioMovimiento, Merma, TipoMovimientoInventario, Usuario } = require('../models');
const { BadRequestError, ConflictError, NotFoundError } = require('../shared/errors/AppError');
const { AuditService } = require('../shared/services/audit.service');
const { UnitConversionService } = require('../shared/services/unitConversion.service');
const { endOfDayInTimezone, startOfDayInTimezone, toDateTimeInZone } = require('../shared/utils/dates');
const { buildPaginationMeta, parsePagination } = require('../shared/utils/pagination');
const { round2, round4 } = require('../shared/utils/tax');

const detalleMerma = [
    { model: Ingrediente, as: 'ingrediente', attributes: ['id', 'codigo', 'nombre'] },
    { model: Usuario, as: 'usuario', attributes: ['id', 'nombreCompleto'] },
];

function formatearMerma(merma) {
    const datos = merma.get({ plain: true });
    delete datos.idempotencyKey;
    delete datos.idempotencyHuella;
    return {
        ...datos,
        cantidadOriginal: Number(merma.cantidadOriginal),
        cantidadOz: Number(merma.cantidadOz),
        costoEstimado: Number(merma.costoEstimado),
    };
}

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
            items: rows.map(formatearMerma),
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
        const cantidadOz = UnitConversionService.toMovimientoOz(input.cantidad, input.unidad, true);
        const fecha = input.fecha ? toDateTimeInZone(input.fecha).toJSDate() : new Date();
        if (!Number.isFinite(fecha.valueOf()) || fecha.valueOf() > Date.now() + 60000) {
            throw new BadRequestError('La fecha de la merma debe ser válida y no puede ser futura');
        }
        const observacion = input.observacion?.trim() || null;
        const key = input.idempotencyKey;
        const huella = key ? createHash('sha256').update(JSON.stringify([
            user.id, input.ingredienteId, input.cantidad, input.unidad, input.motivo,
            observacion, input.fecha ? fecha.toISOString() : null,
        ])).digest('hex') : null;
        const buscarPrevia = async (transaction) => {
            if (!key) return null;
            const previa = await Merma.findOne({
                where: { sucursalId: user.sucursalId, idempotencyKey: key },
                include: detalleMerma,
                transaction,
            });
            if (!previa) return null;
            if (previa.idempotencyHuella !== huella) {
                throw new ConflictError('La clave ya corresponde a otra merma');
            }
            return formatearMerma(previa);
        };
        const previa = await buscarPrevia();
        if (previa) return previa;

        return withTransaction(async (tx) => {
            const ingrediente = await Ingrediente.findOne({
                where: { id: input.ingredienteId, sucursalId: user.sucursalId, activo: true },
                lock: tx.LOCK.UPDATE,
                transaction: tx,
            });
            if (!ingrediente) {
                throw new NotFoundError('Ingrediente no encontrado');
            }
            const concurrente = await buscarPrevia(tx);
            if (concurrente) return concurrente;
            const stockAnteriorOz = Number(ingrediente.stockActualOz);
            if (cantidadOz > stockAnteriorOz) {
                throw new BadRequestError(`La merma (${cantidadOz} oz) supera las existencias actuales (${stockAnteriorOz} oz)`);
            }
            const stockNuevoOz = round4(stockAnteriorOz - cantidadOz);
            const costoUnitarioOz = Number(ingrediente.costoPromedioOz);
            const costoEstimado = round2(cantidadOz * costoUnitarioOz);
            if (costoEstimado > 9999999999.99) {
                throw new BadRequestError('El costo estimado de la merma excede el máximo permitido');
            }
            const merma = await Merma.create({
                sucursalId: user.sucursalId,
                ingredienteId: ingrediente.id,
                usuarioId: user.id,
                cantidadOriginal: input.cantidad,
                unidadOriginal: input.unidad,
                cantidadOz,
                costoEstimado,
                motivo: input.motivo,
                observacion,
                fecha,
                idempotencyKey: key,
                idempotencyHuella: huella,
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
                include: detalleMerma,
                transaction: tx,
            });
            return formatearMerma(mermaCompleta ?? merma);
        }).catch(async (error) => {
            if (getPgErrorCode(error) === '23505') {
                const registrada = await buscarPrevia();
                if (registrada) return registrada;
            }
            throw error;
        });
    }
}

module.exports = { MermasService };
