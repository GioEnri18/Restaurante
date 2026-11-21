const { UniqueConstraintError, col, fn } = require('sequelize');
const { ACCIONES_AUDITORIA } = require('../config/constants');
const { getPgErrorCode, withTransaction } = require('../config/database');
const { CajaMovimiento, CajaSesion, EstadoCaja, MetodoPago, TipoMovimientoCaja, Usuario, Venta } = require('../models');
const { BadRequestError, ConflictError } = require('../shared/errors/AppError');
const { AuditService } = require('../shared/services/audit.service');
const { buildPaginationMeta, parsePagination } = require('../shared/utils/pagination');
const { round2 } = require('../shared/utils/tax');
function isUniqueCajaAbiertaError(error) {
    if (error instanceof UniqueConstraintError)
        return true;
    if (getPgErrorCode(error) === '23505')
        return true;
    if (error instanceof Error && /uq_caja_abierta_por_sucursal|23505/i.test(error.message)) {
        return true;
    }
    return false;
}
class CajaService {
    /**
     * Criterio contable unificado (Fase 1.4):
     * - totalVentasEfectivo y totalVentasTarjeta se mantienen intactos (ventas brutas).
     * - totalEgresos acumula egresos de efectivo + tarjeta (incluyendo anulaciones).
     * - totalEgresosTarjeta separa los egresos/anulaciones de tarjeta para que el efectivo
     *   esperado en gaveta física solo descuente salidas reales en efectivo.
     */
    static calcularDesgloseCaja(sesion) {
        const montoInicial = round2(Number(sesion.montoInicial));
        const totalVentasEfectivo = round2(Number(sesion.totalVentasEfectivo));
        const totalVentasTarjeta = round2(Number(sesion.totalVentasTarjeta));
        const totalIngresosExtra = round2(Number(sesion.totalIngresosExtra));
        const totalEgresos = round2(Number(sesion.totalEgresos));
        const totalEgresosTarjeta = round2(Number(sesion.totalEgresosTarjeta ?? 0));
        const totalEgresosEfectivo = round2(Math.max(0, totalEgresos - totalEgresosTarjeta));
        const montoEsperadoEfectivo = round2(montoInicial + totalVentasEfectivo + totalIngresosExtra - totalEgresosEfectivo);
        const totalTarjetaNeto = round2(totalVentasTarjeta - totalEgresosTarjeta);
        const totalGeneralEsperado = round2(montoEsperadoEfectivo + totalTarjetaNeto);
        return {
            montoInicial,
            totalVentasEfectivo,
            totalVentasTarjeta,
            totalIngresosExtra,
            totalEgresos,
            totalEgresosTarjeta,
            totalEgresosEfectivo,
            montoEsperadoEfectivo,
            totalTarjetaNeto,
            totalGeneralEsperado,
        };
    }
    static calcularEsperadoEfectivo(sesion) {
        return this.calcularDesgloseCaja({
            ...sesion,
            totalVentasTarjeta: sesion.totalVentasTarjeta ?? 0,
        }).montoEsperadoEfectivo;
    }
    static async obtenerCajaActual(sucursalId) {
        const sesion = await CajaSesion.findOne({
            where: { sucursalId, estado: EstadoCaja.ABIERTA },
            include: [
                { model: Usuario, as: 'usuarioApertura', attributes: ['id', 'nombreCompleto', 'username'] },
                {
                    model: CajaMovimiento,
                    as: 'movimientos',
                    separate: true,
                    order: [['createdAt', 'DESC']],
                    include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombreCompleto'] }],
                },
            ],
        });
        if (!sesion)
            return null;
        const plain = sesion.get({ plain: true });
        const desglose = this.calcularDesgloseCaja(sesion);
        return {
            ...plain,
            ...desglose,
            movimientos: (plain.movimientos ?? []).map((m) => ({
                ...m,
                monto: Number(m.monto),
            })),
        };
    }
    static async abrirCaja(user, input, clientMeta) {
        try {
            return await withTransaction(async (tx) => {
                const abierta = await CajaSesion.findOne({
                    where: { sucursalId: user.sucursalId, estado: EstadoCaja.ABIERTA },
                    transaction: tx,
                });
                if (abierta) {
                    throw new ConflictError('Ya existe una caja abierta en esta sucursal');
                }
                const montoInicial = round2(input.montoInicial);
                const sesion = await CajaSesion.create({
                    sucursalId: user.sucursalId,
                    usuarioAperturaId: user.id,
                    estado: EstadoCaja.ABIERTA,
                    montoInicial,
                    observacionesCierre: input.observaciones ?? null,
                }, { transaction: tx });
                const sesionConUsuario = await CajaSesion.findByPk(sesion.id, {
                    include: [
                        {
                            model: Usuario,
                            as: 'usuarioApertura',
                            attributes: ['id', 'nombreCompleto', 'username'],
                        },
                    ],
                    transaction: tx,
                });
                await AuditService.registrar({
                    sucursalId: user.sucursalId,
                    usuarioId: user.id,
                    accion: ACCIONES_AUDITORIA.APERTURA_CAJA,
                    entidad: 'CajaSesion',
                    entidadId: sesion.id,
                    valorAnterior: null,
                    valorNuevo: {
                        estado: sesion.estado,
                        montoInicial,
                        fechaApertura: sesion.fechaApertura,
                    },
                    ipAddress: clientMeta.ipAddress,
                    userAgent: clientMeta.userAgent,
                }, tx);
                return {
                    ...(sesionConUsuario ?? sesion).get({ plain: true }),
                    montoInicial,
                    totalVentasEfectivo: 0,
                    totalVentasTarjeta: 0,
                    totalIngresosExtra: 0,
                    totalEgresos: 0,
                    totalEgresosTarjeta: 0,
                    totalEgresosEfectivo: 0,
                    totalTarjetaNeto: 0,
                    montoEsperadoEfectivo: montoInicial,
                    totalGeneralEsperado: montoInicial,
                    movimientos: [],
                };
            });
        }
        catch (error) {
            // Respaldo ante aperturas concurrentes protegidas por índice único parcial uq_caja_abierta_por_sucursal
            if (isUniqueCajaAbiertaError(error)) {
                throw new ConflictError('Ya existe una caja abierta en esta sucursal. No se pueden abrir dos cajas simultáneamente.');
            }
            throw error;
        }
    }
    static async registrarMovimiento(user, input, clientMeta) {
        return withTransaction(async (tx) => {
            const sesion = await CajaSesion.findOne({
                where: { sucursalId: user.sucursalId, estado: EstadoCaja.ABIERTA },
                lock: tx.LOCK.UPDATE,
                transaction: tx,
            });
            if (!sesion) {
                throw new BadRequestError('No hay una caja abierta para registrar movimientos');
            }
            const monto = round2(input.monto);
            const tipo = input.tipo === 'INGRESO_MANUAL'
                ? TipoMovimientoCaja.INGRESO_MANUAL
                : TipoMovimientoCaja.EGRESO_MANUAL;
            const metodoPago = input.metodoPago ?? MetodoPago.EFECTIVO;
            const movimiento = await CajaMovimiento.create({
                sucursalId: user.sucursalId,
                cajaSesionId: sesion.id,
                usuarioId: user.id,
                tipo,
                metodoPago,
                monto,
                descripcion: input.descripcion.trim(),
            }, { transaction: tx });
            const prevIngresos = Number(sesion.totalIngresosExtra);
            const prevEgresos = Number(sesion.totalEgresos);
            const prevEgresosTarjeta = Number(sesion.totalEgresosTarjeta);
            if (tipo === TipoMovimientoCaja.INGRESO_MANUAL) {
                await sesion.increment('totalIngresosExtra', { by: monto, transaction: tx });
            }
            else if (metodoPago === MetodoPago.TARJETA) {
                await sesion.increment({ totalEgresos: monto, totalEgresosTarjeta: monto }, { transaction: tx });
            }
            else {
                await sesion.increment('totalEgresos', { by: monto, transaction: tx });
            }
            await sesion.reload({ transaction: tx });
            await AuditService.registrar({
                sucursalId: user.sucursalId,
                usuarioId: user.id,
                accion: ACCIONES_AUDITORIA.MOVIMIENTO_CAJA,
                entidad: 'CajaMovimiento',
                entidadId: movimiento.id,
                valorAnterior: {
                    totalIngresosExtra: prevIngresos,
                    totalEgresos: prevEgresos,
                    totalEgresosTarjeta: prevEgresosTarjeta,
                },
                valorNuevo: {
                    tipo,
                    metodoPago,
                    monto,
                    descripcion: movimiento.descripcion,
                    totalIngresosExtra: Number(sesion.totalIngresosExtra),
                    totalEgresos: Number(sesion.totalEgresos),
                    totalEgresosTarjeta: Number(sesion.totalEgresosTarjeta),
                },
                ipAddress: clientMeta.ipAddress,
                userAgent: clientMeta.userAgent,
            }, tx);
            return {
                ...movimiento.get({ plain: true }),
                monto: Number(movimiento.monto),
            };
        });
    }
    static async cerrarCaja(user, input, clientMeta) {
        return withTransaction(async (tx) => {
            const sesion = await CajaSesion.findOne({
                where: { sucursalId: user.sucursalId, estado: EstadoCaja.ABIERTA },
                lock: tx.LOCK.UPDATE,
                transaction: tx,
            });
            if (!sesion) {
                throw new BadRequestError('No existe una caja abierta para cerrar');
            }
            const desglose = this.calcularDesgloseCaja(sesion);
            const montoContadoEfectivo = round2(input.montoContadoEfectivo);
            const diferencia = round2(montoContadoEfectivo - desglose.montoEsperadoEfectivo);
            await sesion.update({
                estado: EstadoCaja.CERRADA,
                usuarioCierreId: user.id,
                montoEsperadoEfectivo: desglose.montoEsperadoEfectivo,
                montoContadoEfectivo,
                diferencia,
                observacionesCierre: input.observacionesCierre?.trim() || null,
                fechaCierre: new Date(),
            }, { transaction: tx });
            const sesionCerrada = await CajaSesion.findByPk(sesion.id, {
                include: [
                    { model: Usuario, as: 'usuarioApertura', attributes: ['id', 'nombreCompleto'] },
                    { model: Usuario, as: 'usuarioCierre', attributes: ['id', 'nombreCompleto'] },
                ],
                transaction: tx,
            });
            await AuditService.registrar({
                sucursalId: user.sucursalId,
                usuarioId: user.id,
                accion: ACCIONES_AUDITORIA.CIERRE_CAJA,
                entidad: 'CajaSesion',
                entidadId: sesion.id,
                valorAnterior: {
                    estado: EstadoCaja.ABIERTA,
                    montoInicial: desglose.montoInicial,
                },
                valorNuevo: {
                    estado: EstadoCaja.CERRADA,
                    montoEsperadoEfectivo: desglose.montoEsperadoEfectivo,
                    montoContadoEfectivo,
                    diferencia,
                    totalVentasEfectivo: desglose.totalVentasEfectivo,
                    totalVentasTarjeta: desglose.totalVentasTarjeta,
                    totalEgresos: desglose.totalEgresos,
                    totalEgresosTarjeta: desglose.totalEgresosTarjeta,
                    totalTarjetaNeto: desglose.totalTarjetaNeto,
                    observacionesCierre: sesion.observacionesCierre,
                },
                ipAddress: clientMeta.ipAddress,
                userAgent: clientMeta.userAgent,
            }, tx);
            return {
                ...(sesionCerrada ?? sesion).get({ plain: true }),
                ...desglose,
                montoContadoEfectivo,
                diferencia,
            };
        });
    }
    static async listarHistorial(sucursalId, rawPage, rawLimit) {
        const { page, limit, skip } = parsePagination(rawPage, rawLimit, 10);
        const { rows, count } = await CajaSesion.findAndCountAll({
            where: { sucursalId },
            order: [['fechaApertura', 'DESC']],
            offset: skip,
            limit,
            include: [
                { model: Usuario, as: 'usuarioApertura', attributes: ['id', 'nombreCompleto'] },
                { model: Usuario, as: 'usuarioCierre', attributes: ['id', 'nombreCompleto'] },
            ],
        });
        const ids = rows.map((r) => r.id);
        const ventasMap = new Map();
        const movsMap = new Map();
        if (ids.length > 0) {
            const [ventasCounts, movsCounts] = await Promise.all([
                Venta.findAll({
                    where: { cajaSesionId: ids },
                    attributes: ['cajaSesionId', [fn('COUNT', col('id')), 'cnt']],
                    group: ['cajaSesionId'],
                    raw: true,
                }),
                CajaMovimiento.findAll({
                    where: { cajaSesionId: ids },
                    attributes: ['cajaSesionId', [fn('COUNT', col('id')), 'cnt']],
                    group: ['cajaSesionId'],
                    raw: true,
                }),
            ]);
            for (const vc of ventasCounts)
                ventasMap.set(Number(vc.cajaSesionId), Number(vc.cnt));
            for (const mc of movsCounts)
                movsMap.set(Number(mc.cajaSesionId), Number(mc.cnt));
        }
        const items = rows.map((r) => ({
            ...r.get({ plain: true }),
            montoInicial: Number(r.montoInicial),
            totalVentasEfectivo: Number(r.totalVentasEfectivo),
            totalVentasTarjeta: Number(r.totalVentasTarjeta),
            totalIngresosExtra: Number(r.totalIngresosExtra),
            totalEgresos: Number(r.totalEgresos),
            totalEgresosTarjeta: Number(r.totalEgresosTarjeta),
            montoEsperadoEfectivo: r.montoEsperadoEfectivo !== null ? Number(r.montoEsperadoEfectivo) : null,
            montoContadoEfectivo: r.montoContadoEfectivo !== null ? Number(r.montoContadoEfectivo) : null,
            diferencia: r.diferencia !== null ? Number(r.diferencia) : null,
            _count: {
                ventas: ventasMap.get(r.id) ?? 0,
                movimientos: movsMap.get(r.id) ?? 0,
            },
        }));
        return {
            items,
            meta: buildPaginationMeta(count, page, limit),
        };
    }
}

module.exports = { CajaService };
