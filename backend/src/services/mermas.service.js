const { createHash } = require('node:crypto');
const { Op, QueryTypes, col, fn } = require('sequelize');
const { ACCIONES_AUDITORIA, CODIGOS_MOTIVO_AUDITORIA } = require('../config/constants');
const { getPgErrorCode, sequelize, withTransaction } = require('../config/database');
const {
  CajaSesion,
  EstadoCaja,
  Ingrediente,
  InventarioMovimiento,
  Merma,
  MotivoMerma,
  PedidoDomicilioDetalle,
  Platillo,
  RecetaIngrediente,
  TipoMovimientoInventario,
  UnidadMedida,
  Usuario,
} = require('../models');
const { BadRequestError, ConflictError, NotFoundError } = require('../shared/errors/AppError');
const { AuditService } = require('../shared/services/audit.service');
const { UnitConversionService } = require('../shared/services/unitConversion.service');
const { mapearMotivoMermaACodigo } = require('../shared/utils/auditoriaSeveridad');
const { endOfDayInTimezone, startOfDayInTimezone, toDateTimeInZone, toIsoDateInTimezone } = require('../shared/utils/dates');
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
        const { page, limit, skip } = parsePagination(query.page, query.limit, 15, 15);
        const where = { sucursalId };
        if (query.motivo)
            where.motivo = query.motivo;
        if (query.ingredienteId)
            where.ingredienteId = Number(query.ingredienteId);
        if (query.usuarioId)
            where.usuarioId = Number(query.usuarioId);
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
                order: [['fecha', 'DESC'], ['id', 'DESC']],
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
            const turno = await CajaSesion.findOne({
                where: { sucursalId: user.sucursalId, estado: EstadoCaja.ABIERTA },
                attributes: ['id', 'fechaApertura'],
                ...(user.rolCodigo === 'CAJERO' ? { lock: tx.LOCK.UPDATE } : {}),
                transaction: tx,
            });
            if (user.rolCodigo === 'CAJERO') {
                if (!turno) throw new BadRequestError('Abre un turno de caja para registrar una merma');
                if (toIsoDateInTimezone(fecha) !== toIsoDateInTimezone() || fecha < turno.fechaApertura) {
                    throw new BadRequestError('El cajero solo puede registrar mermas de hoy dentro del turno abierto');
                }
            }
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
            const repeticionesEnTurno = await AuditService.contarRepeticionesEnTurno({
                sucursalId: user.sucursalId,
                usuarioId: user.id,
                cajaSesionId: turno?.id ?? null,
                accion: ACCIONES_AUDITORIA.REGISTRO_MERMA,
            }, tx);
            await AuditService.registrarEvento({
                user,
                clientMeta,
                cajaSesionId: turno?.id ?? null,
            }, {
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
                codigoMotivo: mapearMotivoMermaACodigo(input.motivo),
                motivo: input.observacion?.trim() || input.motivo,
                impactoFinanciero: round2(-costoEstimado),
                repeticionesEnTurno,
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

    /**
     * Genera mermas automáticas según la receta de los platillos de un pedido a domicilio
     * cancelado tras iniciar preparación o marcado como FALLIDO, dentro de la misma transacción.
     * - Bloquea ingredientes con FOR UPDATE ordenado por ID (anti-deadlock).
     * - Descuenta `min(requeridoOz, stockActualOz)` para no bloquear el cierre si hubo consumoPendiente.
     * - Audita cada merma con `codigoMotivo = PEDIDO_NO_ENTREGADO`, impacto negativo = -costo y `correlacionId`.
     */
    static async registrarMermasPorPedidoDomicilioEnTx(tx, user, pedido, motivoTexto, clientMeta, opciones = {}) {
        const detalles = await PedidoDomicilioDetalle.findAll({
            where: { pedidoDomicilioId: pedido.id },
            include: [
                {
                    model: Platillo,
                    as: 'platillo',
                    include: [{ model: RecetaIngrediente, as: 'receta' }],
                },
            ],
            transaction: tx,
        });

        const requeridoPorIngrediente = new Map();
        for (const det of detalles) {
            const cantidad = Number(det.cantidad);
            for (const rec of det.platillo?.receta ?? []) {
                const oz = round4(Number(rec.cantidadOz) * cantidad);
                if (oz <= 0) continue;
                requeridoPorIngrediente.set(
                    rec.ingredienteId,
                    round4((requeridoPorIngrediente.get(rec.ingredienteId) ?? 0) + oz),
                );
            }
        }

        const ingredienteIds = Array.from(requeridoPorIngrediente.keys()).sort((a, b) => a - b);
        if (ingredienteIds.length === 0) {
            return { cantidadMermas: 0, costoTotalMermas: 0 };
        }

        const filasBloqueadas = await sequelize.query(
            `SELECT id, nombre, stock_actual_oz, costo_promedio_oz
             FROM ingredientes
             WHERE id IN (:ids) AND sucursal_id = :sucursalId AND activo = true
             ORDER BY id ASC
             FOR UPDATE`,
            {
                replacements: { ids: ingredienteIds, sucursalId: user.sucursalId },
                type: QueryTypes.SELECT,
                transaction: tx,
            },
        );

        const turno = await CajaSesion.findOne({
            where: { sucursalId: user.sucursalId, estado: EstadoCaja.ABIERTA },
            attributes: ['id'],
            transaction: tx,
        });

        const fecha = new Date();
        const correlacionId = opciones.correlacionId ?? AuditService.crearCorrelacionId();
        const observacion = `Pedido domicilio ${pedido.numeroPedido} no entregado: ${motivoTexto}`.slice(0, 300);

        let cantidadMermas = 0;
        let costoTotalMermas = 0;

        for (const fila of filasBloqueadas) {
            const requeridoOz = requeridoPorIngrediente.get(fila.id) ?? 0;
            if (requeridoOz <= 0) continue;

            const stockAnteriorOz = round4(Number(fila.stock_actual_oz));
            const descontarOz = round4(Math.min(requeridoOz, Math.max(0, stockAnteriorOz)));
            const stockNuevoOz = round4(stockAnteriorOz - descontarOz);
            const costoUnitarioOz = Number(fila.costo_promedio_oz);
            const costoEstimado = round2(requeridoOz * costoUnitarioOz);

            const merma = await Merma.create(
                {
                    sucursalId: user.sucursalId,
                    ingredienteId: fila.id,
                    usuarioId: user.id,
                    pedidoDomicilioId: pedido.id,
                    cantidadOriginal: requeridoOz,
                    unidadOriginal: UnidadMedida.oz,
                    cantidadOz: requeridoOz,
                    costoEstimado,
                    motivo: MotivoMerma.OTRO,
                    observacion,
                    fecha,
                },
                { transaction: tx },
            );

            if (descontarOz > 0) {
                await Ingrediente.update(
                    { stockActualOz: stockNuevoOz },
                    { where: { id: fila.id, sucursalId: user.sucursalId }, transaction: tx },
                );
                await InventarioMovimiento.create(
                    {
                        sucursalId: user.sucursalId,
                        ingredienteId: fila.id,
                        usuarioId: user.id,
                        tipo: TipoMovimientoInventario.SALIDA_MERMA,
                        cantidadOz: -descontarOz,
                        stockAnteriorOz,
                        stockNuevoOz,
                        costoUnitarioOz,
                        referenciaTipo: 'MERMA',
                        referenciaId: merma.id,
                        motivo: `Merma automática ${pedido.numeroPedido} (PEDIDO_NO_ENTREGADO)`,
                    },
                    { transaction: tx },
                );
            }

            await AuditService.registrarEvento(
                {
                    user,
                    clientMeta,
                    cajaSesionId: turno?.id ?? null,
                    correlacionId,
                },
                {
                    accion: ACCIONES_AUDITORIA.REGISTRO_MERMA,
                    entidad: 'Merma',
                    entidadId: merma.id,
                    valorAnterior: {
                        ingrediente: fila.nombre,
                        stockActualOz: stockAnteriorOz,
                    },
                    valorNuevo: {
                        ingrediente: fila.nombre,
                        stockActualOz: stockNuevoOz,
                        cantidadMermadaOz: requeridoOz,
                        cantidadDescontadaOz: descontarOz,
                        pedidoDomicilioId: pedido.id,
                        numeroPedido: pedido.numeroPedido,
                        costoEstimado,
                    },
                    codigoMotivo: CODIGOS_MOTIVO_AUDITORIA.PEDIDO_NO_ENTREGADO,
                    motivo: observacion,
                    impactoFinanciero: round2(-costoEstimado),
                },
                tx,
            );

            cantidadMermas++;
            costoTotalMermas = round2(costoTotalMermas + costoEstimado);
        }

        return { cantidadMermas, costoTotalMermas };
    }
}

module.exports = { MermasService };
