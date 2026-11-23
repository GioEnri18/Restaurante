const { UniqueConstraintError, col, fn } = require('sequelize');
const { ACCIONES_AUDITORIA, CODIGOS_MOTIVO_AUDITORIA } = require('../config/constants');
const { getPgErrorCode, withTransaction } = require('../config/database');
const { CajaMovimiento, CajaSesion, EstadoCaja, EstadoVenta, MetodoPago, TipoMovimientoCaja, Usuario, Venta } = require('../models');
const { BadRequestError, ConflictError } = require('../shared/errors/AppError');
const { AuditService } = require('../shared/services/audit.service');
const { normalizarCodigoMotivo } = require('../shared/utils/auditoriaSeveridad');
const { verificarAutorizacionCaja } = require('./autorizacion-supervisor.service');
const { buildPaginationMeta, parsePagination } = require('../shared/utils/pagination');
const { round2 } = require('../shared/utils/tax');
const TIPOS_MOVIMIENTO_POR_FILTRO = {
    VENTAS: [TipoMovimientoCaja.INGRESO_VENTA],
    INGRESOS: [TipoMovimientoCaja.INGRESO_MANUAL],
    EGRESOS: [TipoMovimientoCaja.EGRESO_MANUAL, TipoMovimientoCaja.EGRESO_ANULACION],
};
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
function filtroVentasTarjeta(sucursalId, cajaSesionId) {
    return { sucursalId, cajaSesionId, metodoPago: MetodoPago.TARJETA, estado: EstadoVenta.COMPLETADA };
}
function conciliarVouchers(ventas, vouchers) {
    const porVenta = new Map(vouchers.map((voucher) => [voucher.ventaId, voucher]));
    if (porVenta.size !== vouchers.length || porVenta.size !== ventas.length) {
        throw new ConflictError('Ingresa un voucher por cada venta con tarjeta del turno. Actualiza la lista si hubo cobros o anulaciones.');
    }
    return ventas.map((venta) => {
        const voucher = porVenta.get(venta.id);
        if (!voucher) throw new ConflictError('Las ventas con tarjeta cambiaron. Actualiza la lista de vouchers.');
        const referencia = voucher.referencia?.trim();
        if (!referencia) throw new BadRequestError(`Ingresa el número de voucher de la venta #${venta.id}`);
        if (venta.referenciaPago?.trim() && referencia.toUpperCase() !== venta.referenciaPago.trim().toUpperCase()) {
            throw new BadRequestError(`El número de voucher no coincide con la venta #${venta.id}`);
        }
        if (voucher.monto !== Number(venta.total)) {
            throw new BadRequestError(`El monto del voucher no coincide con la venta #${venta.id}`);
        }
        return { ventaId: venta.id, referencia, monto: voucher.monto };
    });
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
        const totalCobrosVentas = round2(totalVentasEfectivo + totalVentasTarjeta);
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
            totalCobrosVentas,
        };
    }
    static calcularEsperadoEfectivo(sesion) {
        return this.calcularDesgloseCaja({
            ...sesion,
            totalVentasTarjeta: sesion.totalVentasTarjeta ?? 0,
        }).montoEsperadoEfectivo;
    }
    static async obtenerCajaActual(sucursalId, incluirMovimientos = true) {
        const sesion = await CajaSesion.findOne({
            where: { sucursalId, estado: EstadoCaja.ABIERTA },
            include: [
                { model: Usuario, as: 'usuarioApertura', attributes: ['id', 'nombreCompleto', 'username'] },
                ...(incluirMovimientos ? [{
                    model: CajaMovimiento,
                    as: 'movimientos',
                    separate: true,
                    order: [['createdAt', 'DESC']],
                    include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombreCompleto'] }],
                }] : []),
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
    static async obtenerMovimientosTurno(sucursalId, filtro, rawPage) {
        const { page, limit, skip } = parsePagination(rawPage, 15, 15);
        const sesion = await CajaSesion.findOne({ where: { sucursalId, estado: EstadoCaja.ABIERTA }, attributes: ['id'] });
        if (!sesion) return { data: [], meta: buildPaginationMeta(0, page, limit) };
        const tipos = TIPOS_MOVIMIENTO_POR_FILTRO[filtro];
        const { rows, count } = await CajaMovimiento.findAndCountAll({
            where: { sucursalId, cajaSesionId: sesion.id, ...(tipos ? { tipo: tipos } : {}) },
            order: [['createdAt', 'DESC'], ['id', 'DESC']],
            include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombreCompleto'] }],
            limit,
            offset: skip,
        });
        return {
            data: rows.map((fila) => ({ ...fila.get({ plain: true }), monto: Number(fila.monto) })),
            meta: buildPaginationMeta(count, page, limit),
        };
    }
    static async obtenerVouchersTurno(sucursalId, rawPage) {
        const sesion = await CajaSesion.findOne({
            where: { sucursalId, estado: EstadoCaja.ABIERTA },
            attributes: ['id', 'montoInicial', 'totalVentasEfectivo', 'totalVentasTarjeta',
                'totalIngresosExtra', 'totalEgresos', 'totalEgresosTarjeta'],
        });
        if (!sesion) throw new ConflictError('No hay una caja abierta para conciliar');
        const { page, limit, skip } = parsePagination(rawPage, 15, 15);
        const where = filtroVentasTarjeta(sucursalId, sesion.id);
        const [{ rows, count }, sumaVentas] = await Promise.all([
            Venta.findAndCountAll({
                where,
                attributes: ['id', 'total', 'createdAt'],
                order: [['createdAt', 'ASC'], ['id', 'ASC']],
                limit,
                offset: skip,
                raw: true,
            }),
            Venta.sum('total', { where }),
        ]);
        const desglose = this.calcularDesgloseCaja(sesion);
        return {
            data: {
                cajaId: sesion.id,
                ventas: rows.map(({ id, total, createdAt }) => ({ ventaId: id, monto: Number(total), fecha: createdAt })),
                montoEsperadoEfectivo: desglose.montoEsperadoEfectivo,
                totalVentasEfectivo: desglose.totalVentasEfectivo,
                totalVentasTarjeta: desglose.totalVentasTarjeta,
                totalCobrosVentas: desglose.totalCobrosVentas,
                totalTarjetaNeto: desglose.totalTarjetaNeto,
                totalGeneralEsperado: desglose.totalGeneralEsperado,
                ajusteTarjeta: round2(desglose.totalTarjetaNeto - Number(sumaVentas ?? 0)),
            },
            meta: buildPaginationMeta(count, page, limit),
        };
    }
    static async abrirCaja(user, input, clientMeta) {
        // Control dual: se valida al supervisor antes de abrir la transacción (bcrypt es lento)
        const autorizador = await verificarAutorizacionCaja(user, input.autorizacion, 'abrir', clientMeta);
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
                    usuarioAutorizaAperturaId: autorizador.id,
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
                await AuditService.registrarEvento({
                    user,
                    clientMeta,
                    cajaSesionId: sesion.id,
                    aprobadorId: autorizador.autoAutorizado ? null : autorizador.id,
                }, {
                    accion: ACCIONES_AUDITORIA.APERTURA_CAJA,
                    entidad: 'CajaSesion',
                    entidadId: sesion.id,
                    valorAnterior: null,
                    valorNuevo: {
                        estado: sesion.estado,
                        montoInicial,
                        fechaApertura: sesion.fechaApertura,
                        autorizadoPor: autorizador.username,
                        autoAutorizado: autorizador.autoAutorizado,
                    },
                    codigoMotivo: autorizador.autoAutorizado
                        ? null
                        : CODIGOS_MOTIVO_AUDITORIA.AUTORIZACION_SUPERVISOR,
                    motivo: input.observaciones?.trim() || 'Apertura de turno de caja',
                    impactoFinanciero: 0,
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
            const esIngreso = tipo === TipoMovimientoCaja.INGRESO_MANUAL;
            const impactoFinanciero = esIngreso ? monto : round2(-monto);
            const repeticionesEnTurno = !esIngreso
                ? await AuditService.contarRepeticionesEnTurno({
                    sucursalId: user.sucursalId,
                    usuarioId: user.id,
                    cajaSesionId: sesion.id,
                    accion: ACCIONES_AUDITORIA.MOVIMIENTO_CAJA,
                }, tx)
                : 1;
            await AuditService.registrarEvento({
                user,
                clientMeta,
                cajaSesionId: sesion.id,
            }, {
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
                codigoMotivo: normalizarCodigoMotivo(input.codigoMotivo, CODIGOS_MOTIVO_AUDITORIA.OTRO),
                motivo: movimiento.descripcion,
                impactoFinanciero,
                repeticionesEnTurno,
            }, tx);
            return {
                ...movimiento.get({ plain: true }),
                monto: Number(movimiento.monto),
            };
        });
    }
    static async cerrarCaja(user, input, clientMeta) {
        // Control dual: el cuadre lo valida un supervisor distinto de quien maneja el efectivo
        const autorizador = await verificarAutorizacionCaja(user, input.autorizacion, 'cerrar', clientMeta);
        return withTransaction(async (tx) => {
            const sesion = await CajaSesion.findOne({
                where: { sucursalId: user.sucursalId, estado: EstadoCaja.ABIERTA },
                lock: tx.LOCK.UPDATE,
                transaction: tx,
            });
            if (!sesion) {
                throw new BadRequestError('No existe una caja abierta para cerrar');
            }
            if (input.cajaId !== undefined && input.cajaId !== sesion.id) {
                throw new ConflictError('El turno cambió. Vuelve a abrir el cierre de caja.');
            }
            const ventasTarjeta = await Venta.findAll({
                where: filtroVentasTarjeta(user.sucursalId, sesion.id),
                attributes: ['id', 'total', 'referenciaPago'],
                transaction: tx,
                raw: true,
            });
            const vouchersConciliados = conciliarVouchers(ventasTarjeta, input.vouchers ?? []);
            const desglose = this.calcularDesgloseCaja(sesion);
            const montoContadoEfectivo = round2(input.montoContadoEfectivo);
            const diferencia = round2(montoContadoEfectivo - desglose.montoEsperadoEfectivo);
            const totalVouchersConciliados = round2(vouchersConciliados.reduce((suma, voucher) => suma + voucher.monto, 0));
            const montoContadoGeneral = round2(montoContadoEfectivo + desglose.totalTarjetaNeto);
            const diferenciaGeneral = round2(montoContadoGeneral - desglose.totalGeneralEsperado);
            await sesion.update({
                estado: EstadoCaja.CERRADA,
                usuarioCierreId: user.id,
                usuarioAutorizaCierreId: autorizador.id,
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
            await AuditService.registrarEvento({
                user,
                clientMeta,
                cajaSesionId: sesion.id,
                aprobadorId: autorizador.autoAutorizado ? null : autorizador.id,
            }, {
                accion: ACCIONES_AUDITORIA.CIERRE_CAJA,
                entidad: 'CajaSesion',
                entidadId: sesion.id,
                valorAnterior: {
                    estado: EstadoCaja.ABIERTA,
                    montoInicial: desglose.montoInicial,
                    montoEsperadoEfectivo: desglose.montoEsperadoEfectivo,
                },
                valorNuevo: {
                    estado: EstadoCaja.CERRADA,
                    montoEsperadoEfectivo: desglose.montoEsperadoEfectivo,
                    montoContadoEfectivo,
                    diferencia,
                    totalVentasEfectivo: desglose.totalVentasEfectivo,
                    totalVentasTarjeta: desglose.totalVentasTarjeta,
                    totalCobrosVentas: desglose.totalCobrosVentas,
                    totalEgresos: desglose.totalEgresos,
                    totalEgresosTarjeta: desglose.totalEgresosTarjeta,
                    totalTarjetaNeto: desglose.totalTarjetaNeto,
                    totalVouchersConciliados,
                    totalGeneralEsperado: desglose.totalGeneralEsperado,
                    montoContadoGeneral,
                    diferenciaGeneral,
                    vouchersConciliados,
                    observacionesCierre: sesion.observacionesCierre,
                    autorizadoPor: autorizador.username,
                    autoAutorizado: autorizador.autoAutorizado,
                },
                codigoMotivo: diferencia !== 0
                    ? CODIGOS_MOTIVO_AUDITORIA.DIFERENCIA_DE_CAJA
                    : (autorizador.autoAutorizado ? null : CODIGOS_MOTIVO_AUDITORIA.AUTORIZACION_SUPERVISOR),
                motivo: sesion.observacionesCierre
                    || (diferencia !== 0
                        ? `Cierre de caja con diferencia de Q ${diferencia.toFixed(2)}`
                        : 'Cierre de caja cuadrado'),
                impactoFinanciero: diferencia,
                diferencia,
            }, tx);
            return {
                ...(sesionCerrada ?? sesion).get({ plain: true }),
                ...desglose,
                montoContadoEfectivo,
                montoContadoGeneral,
                diferenciaGeneral,
                diferencia,
            };
        });
    }
    static async listarHistorial(sucursalId, rawPage, rawLimit) {
        const { page, limit, skip } = parsePagination(rawPage, rawLimit, 15, 15);
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
