const { Op, QueryTypes } = require('sequelize');
const { ACCIONES_AUDITORIA, CODIGOS_MOTIVO_AUDITORIA, FACTURAS_PAGE_SIZE } = require('../config/constants');
const { sequelize, withTransaction } = require('../config/database');
const { CajaMovimiento, CajaSesion, Comanda, EstadoCaja, EstadoFactura, EstadoMesa, EstadoVenta, Factura, Ingrediente, InventarioMovimiento, Mesa, MetodoPago, Sucursal, TipoMovimientoCaja, TipoMovimientoInventario, Usuario, Venta, VentaDetalle } = require('../models');
const { BadRequestError, ConflictError, NotFoundError } = require('../shared/errors/AppError');
const { AuditService } = require('../shared/services/audit.service');
const { normalizarCodigoMotivo, validarMotivoObligatorio } = require('../shared/utils/auditoriaSeveridad');
const { endOfDayInTimezone, startOfDayInTimezone, toIsoDateInTimezone } = require('../shared/utils/dates');
const { buildPaginationMeta, parsePagination } = require('../shared/utils/pagination');
const { patronContiene } = require('../shared/utils/busqueda');
const { round2, round4 } = require('../shared/utils/tax');
async function alcanceTurnoCajero(user, transaction) {
    if (user?.rolCodigo !== 'CAJERO') return null;
    const turno = await CajaSesion.findOne({
        where: { sucursalId: user.sucursalId, estado: EstadoCaja.ABIERTA },
        transaction,
        ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    if (!turno) return { id: -1, fecha: { [Op.gte]: new Date('9999-01-01Z') } };
    return { id: turno.id, fecha: { [Op.gte]: turno.fechaApertura, [Op.lte]: endOfDayInTimezone(toIsoDateInTimezone(turno.fechaApertura)) } };
}
class FacturasService {
    static async listar(sucursalId, query, user) {
        // Paginación obligatoria de 10 registros por página por defecto
        const { page, limit, skip } = parsePagination(query.page, query.limit, FACTURAS_PAGE_SIZE, 50);
        const where = { sucursalId };
        const turno = await alcanceTurnoCajero(user);
        if (query.numero?.trim()) {
            where.numeroCompleto = { [Op.iLike]: patronContiene(query.numero.trim()) };
        }
        if (query.cliente?.trim()) {
            const term = patronContiene(query.cliente.trim());
            where[Op.or] = [
                { clienteNombre: { [Op.iLike]: term } },
                { clienteNit: { [Op.iLike]: term } },
            ];
        }
        if (query.estado) {
            where.estado = query.estado;
        }
        if (query.fechaDesde || query.fechaHasta) {
            const rango = {};
            if (query.fechaDesde)
                rango[Op.gte] = startOfDayInTimezone(query.fechaDesde);
            if (query.fechaHasta)
                rango[Op.lte] = endOfDayInTimezone(query.fechaHasta);
            where.createdAt = rango;
        }
        if (query.montoMin || query.montoMax) {
            const rangoMonto = {};
            if (query.montoMin)
                rangoMonto[Op.gte] = Number(query.montoMin);
            if (query.montoMax)
                rangoMonto[Op.lte] = Number(query.montoMax);
            where.total = rangoMonto;
        }
        if (turno) where[Op.and] = [{ createdAt: turno.fecha }];
        const { rows, count } = await Factura.findAndCountAll({
            where: where,
            order: [['createdAt', 'DESC']],
            offset: skip,
            limit,
            include: [
                {
                    model: Venta,
                    as: 'venta',
                    attributes: ['id', 'tipoServicio', 'metodoPago'],
                    ...(turno ? { where: { cajaSesionId: turno.id } } : {}),
                    include: [
                        { model: Usuario, as: 'usuario', attributes: ['id', 'nombreCompleto'] },
                        { model: Mesa, as: 'mesa', attributes: ['numero'] },
                        { model: Comanda, as: 'comanda', attributes: ['numeroComanda'] },
                    ],
                },
                { model: Usuario, as: 'anuladaPor', attributes: ['id', 'nombreCompleto'] },
            ],
        });
        return {
            items: rows.map((f) => ({
                ...f.get({ plain: true }),
                subtotalSinIva: Number(f.subtotalSinIva),
                ivaMonto: Number(f.ivaMonto),
                total: Number(f.total),
            })),
            meta: buildPaginationMeta(count, page, limit),
        };
    }
    static async obtenerDetalle(id, sucursalId, user) {
        const turno = await alcanceTurnoCajero(user);
        const factura = await Factura.findOne({
            where: { id, sucursalId, ...(turno ? { createdAt: turno.fecha } : {}) },
            include: [
                {
                    model: Sucursal,
                    as: 'sucursal',
                    attributes: ['id', 'nombre', 'nit', 'direccion', 'telefono'],
                },
                { model: Usuario, as: 'anuladaPor', attributes: ['id', 'nombreCompleto'] },
                {
                    model: Venta,
                    as: 'venta',
                    ...(turno ? { where: { cajaSesionId: turno.id } } : {}),
                    include: [
                        { model: Usuario, as: 'usuario', attributes: ['id', 'nombreCompleto'] },
                        { model: Mesa, as: 'mesa', attributes: ['id', 'numero'] },
                        { model: Comanda, as: 'comanda' },
                        { model: VentaDetalle, as: 'detalles' },
                    ],
                },
            ],
        });
        if (!factura) {
            throw new NotFoundError('Factura no encontrada');
        }
        const plain = factura.get({ plain: true });
        return {
            ...plain,
            subtotalSinIva: Number(factura.subtotalSinIva),
            ivaMonto: Number(factura.ivaMonto),
            total: Number(factura.total),
        };
    }
    static async reimprimir(user, facturaId, clientMeta, documento = 'FACTURA') {
        return withTransaction(async (tx) => {
            const turno = await alcanceTurnoCajero(user, tx);
            const actual = await Factura.findOne({
                where: { id: facturaId, sucursalId: user.sucursalId, ...(turno ? { createdAt: turno.fecha } : {}) },
                lock: tx.LOCK.UPDATE,
                transaction: tx,
            });
            if (!actual || (turno && !(await Venta.count({ where: { id: actual.ventaId, cajaSesionId: turno.id }, transaction: tx })))) {
                throw new NotFoundError('Factura no encontrada');
            }
            const prevCount = actual.reimpresionesCount;
            if (documento === 'FACTURA') {
                await actual.increment('reimpresionesCount', { by: 1, transaction: tx });
                await actual.reload({ transaction: tx });
            }
            const actualizada = await Factura.findByPk(facturaId, {
                include: [
                    {
                        model: Sucursal,
                        as: 'sucursal',
                        attributes: ['nombre', 'nit', 'direccion', 'telefono'],
                    },
                    {
                        model: Venta,
                        as: 'venta',
                        include: [
                            { model: Usuario, as: 'usuario', attributes: ['nombreCompleto'] },
                            { model: Mesa, as: 'mesa', attributes: ['numero'] },
                            { model: Comanda, as: 'comanda' },
                            { model: VentaDetalle, as: 'detalles' },
                        ],
                    },
                ],
                transaction: tx,
            });
            const comanda = actualizada?.venta?.comanda;
            if (documento === 'COMANDA' && !comanda) throw new NotFoundError('Comanda no encontrada');
            const accion = documento === 'COMANDA' ? ACCIONES_AUDITORIA.REIMPRESION_COMANDA : ACCIONES_AUDITORIA.REIMPRESION_FACTURA;
            const cajaAbierta = await CajaSesion.findOne({
                where: { sucursalId: user.sucursalId, estado: EstadoCaja.ABIERTA },
                attributes: ['id'],
                transaction: tx,
            });
            const cajaSesionId = cajaAbierta?.id ?? actualizada?.venta?.cajaSesionId ?? null;
            const repeticionesEnTurno = await AuditService.contarRepeticionesEnTurno({
                sucursalId: user.sucursalId,
                usuarioId: user.id,
                cajaSesionId,
                accion,
            }, tx);
            await AuditService.registrarEvento({
                user,
                clientMeta,
                cajaSesionId,
            }, {
                accion,
                entidad: 'Factura',
                entidadId: actual.id,
                valorAnterior: {
                    numeroCompleto: actual.numeroCompleto,
                    reimpresionesCount: prevCount,
                },
                valorNuevo: {
                    documento,
                    ...(documento === 'COMANDA' ? { numeroComanda: comanda.numeroComanda } : {}),
                    numeroCompleto: actual.numeroCompleto,
                    reimpresionesCount: actual.reimpresionesCount,
                    total: round2(Number(actual.total)),
                },
                motivo: documento === 'COMANDA' ? `Reimpresión de comanda ${comanda.numeroComanda}`
                    : `Reimpresión #${actual.reimpresionesCount} de factura ${actual.numeroCompleto}`,
                impactoFinanciero: 0,
                repeticionesEnTurno,
            }, tx);
            return (actualizada ?? actual).get({ plain: true });
        });
    }
    /**
     * REGLAS DE NEGOCIO (Fase 1.3, 1.4 y 1.6):
     * - Las facturas nunca se editan ni borran; solo se anulan con motivo obligatorio.
     * - Exige una caja ABIERTA actual para registrar el egreso por anulación sin alterar cierres previos.
     * - Criterio contable unificado: mantiene totalVentasEfectivo y totalVentasTarjeta intactos,
     *   incrementa siempre totalEgresos (y totalEgresosTarjeta cuando el pago original fue con tarjeta).
     * - Bloquea ingredientes con FOR UPDATE ordenado por ID si se solicita reintegrar inventario.
     * - Libera la mesa si la venta pertenecía a una mesa aún marcada OCUPADA.
     */
    static async anular(user, facturaId, input, clientMeta) {
        return withTransaction(async (tx) => {
            // 1. Exigir caja abierta actual (no se permite alterar sesiones ya cerradas)
            const cajaAbierta = await CajaSesion.findOne({
                where: { sucursalId: user.sucursalId, estado: EstadoCaja.ABIERTA },
                lock: tx.LOCK.UPDATE,
                transaction: tx,
            });
            if (!cajaAbierta) {
                throw new BadRequestError('No se puede anular una factura sin una caja abierta. Abre una sesión de caja primero.');
            }
            const factura = await Factura.findOne({
                where: { id: facturaId, sucursalId: user.sucursalId },
                include: [{ model: Venta, as: 'venta' }],
                transaction: tx,
            });
            if (!factura || !factura.venta) {
                throw new NotFoundError('Factura no encontrada');
            }
            if (factura.estado === EstadoFactura.ANULADA) {
                throw new ConflictError(`La factura ${factura.numeroCompleto} ya se encuentra anulada`);
            }
            const motivo = input.motivo.trim();
            const codigoMotivo = normalizarCodigoMotivo(
                input.codigoMotivo,
                CODIGOS_MOTIVO_AUDITORIA.ERROR_DE_CAPTURA,
            );
            validarMotivoObligatorio(ACCIONES_AUDITORIA.ANULACION_FACTURA, motivo, codigoMotivo);
            const correlacionId = AuditService.crearCorrelacionId();
            const fechaAnulacion = new Date();
            // 2. Actualización atómica condicionada para impedir doble anulación concurrente
            const [updatedCount] = await Factura.update({
                estado: EstadoFactura.ANULADA,
                motivoAnulacion: motivo,
                anuladaPorId: user.id,
                anuladaEn: fechaAnulacion,
            }, {
                where: { id: factura.id, estado: EstadoFactura.EMITIDA },
                transaction: tx,
            });
            if (updatedCount === 0) {
                throw new ConflictError(`La factura ${factura.numeroCompleto} ya fue anulada por otra operación`);
            }
            const facturaAnulada = await Factura.findByPk(factura.id, { transaction: tx });
            await Venta.update({ estado: EstadoVenta.ANULADA }, { where: { id: factura.ventaId }, transaction: tx });
            // Liberar mesa si la venta anulada era en mesa y seguía marcada OCUPADA
            let mesaLiberada = false;
            if (factura.venta.mesaId) {
                const [mesasCount] = await Mesa.update({ estado: EstadoMesa.DISPONIBLE }, {
                    where: { id: factura.venta.mesaId, estado: EstadoMesa.OCUPADA },
                    transaction: tx,
                });
                mesaLiberada = mesasCount > 0;
            }
            // 3. Registrar egreso por anulación SIEMPRE en la caja abierta actual con referencia a la sesión original
            const totalAnulado = round2(Number(factura.total));
            const referenciaSesion = factura.venta.cajaSesionId === cajaAbierta.id
                ? `caja actual #${cajaAbierta.id}`
                : `venta original en caja #${factura.venta.cajaSesionId}`;
            const movimientoEgreso = totalAnulado > 0 ? await CajaMovimiento.create({
                sucursalId: user.sucursalId,
                cajaSesionId: cajaAbierta.id,
                usuarioId: user.id,
                ventaId: factura.ventaId,
                tipo: TipoMovimientoCaja.EGRESO_ANULACION,
                metodoPago: factura.venta.metodoPago,
                monto: totalAnulado,
                descripcion: `Anulación factura ${factura.numeroCompleto} (${referenciaSesion}): ${motivo}`,
            }, { transaction: tx }) : null;
            // Criterio contable unificado: totales brutos intactos; egreso registrado en totalEgresos
            // (+ totalEgresosTarjeta cuando fue tarjeta para cuadrar gaveta física y vouchers por separado)
            if (factura.venta.metodoPago === MetodoPago.TARJETA) {
                await cajaAbierta.increment({ totalEgresos: totalAnulado, totalEgresosTarjeta: totalAnulado }, { transaction: tx });
            }
            else if (totalAnulado > 0) {
                await cajaAbierta.increment('totalEgresos', { by: totalAnulado, transaction: tx });
            }
            // 4. Opcional: reintegrar ingredientes al inventario con bloqueo FOR UPDATE ordenado por ID
            let ingredientesReintegrados = 0;
            if (input.reintegrarInventario) {
                const salidasVenta = await InventarioMovimiento.findAll({
                    where: {
                        sucursalId: user.sucursalId,
                        referenciaTipo: 'VENTA',
                        referenciaId: factura.ventaId,
                        tipo: TipoMovimientoInventario.SALIDA_VENTA,
                    },
                    order: [['ingredienteId', 'ASC']],
                    transaction: tx,
                });
                const ingredienteIds = Array.from(new Set(salidasVenta.map((m) => m.ingredienteId))).sort((a, b) => a - b);
                if (ingredienteIds.length > 0) {
                    const filasBloqueadas = await sequelize.query(`SELECT id, stock_actual_oz
             FROM ingredientes
             WHERE id IN (:ids) AND sucursal_id = :sucursalId
             ORDER BY id ASC
             FOR UPDATE`, {
                        replacements: { ids: ingredienteIds, sucursalId: user.sucursalId },
                        type: QueryTypes.SELECT,
                        transaction: tx,
                    });
                    const stockPorId = new Map(filasBloqueadas.map((f) => [f.id, Number(f.stock_actual_oz)]));
                    for (const mov of salidasVenta) {
                        const stockAnteriorOz = stockPorId.get(mov.ingredienteId);
                        if (stockAnteriorOz === undefined)
                            continue;
                        const cantidadReintegrarOz = round4(Math.abs(Number(mov.cantidadOz)));
                        const stockNuevoOz = round4(stockAnteriorOz + cantidadReintegrarOz);
                        stockPorId.set(mov.ingredienteId, stockNuevoOz);
                        await Ingrediente.increment({ stockActualOz: cantidadReintegrarOz }, { where: { id: mov.ingredienteId, sucursalId: user.sucursalId }, transaction: tx });
                        await InventarioMovimiento.create({
                            sucursalId: user.sucursalId,
                            ingredienteId: mov.ingredienteId,
                            usuarioId: user.id,
                            tipo: TipoMovimientoInventario.REVERSION_ANULACION,
                            cantidadOz: cantidadReintegrarOz,
                            stockAnteriorOz,
                            stockNuevoOz,
                            costoUnitarioOz: Number(mov.costoUnitarioOz),
                            referenciaTipo: 'FACTURA_ANULADA',
                            referenciaId: factura.id,
                            motivo: `Reintegro por anulación de factura ${factura.numeroCompleto}`,
                        }, { transaction: tx });
                        ingredientesReintegrados++;
                    }
                }
            }
            // 5. Auditoría inmutable con valor anterior y nuevo, impacto financiero, turno y correlación
            const repeticionesEnTurno = await AuditService.contarRepeticionesEnTurno({
                sucursalId: user.sucursalId,
                usuarioId: user.id,
                cajaSesionId: cajaAbierta.id,
                accion: ACCIONES_AUDITORIA.ANULACION_FACTURA,
            }, tx);
            await AuditService.registrarEvento({
                user,
                clientMeta,
                cajaSesionId: cajaAbierta.id,
                correlacionId,
            }, {
                accion: ACCIONES_AUDITORIA.ANULACION_FACTURA,
                entidad: 'Factura',
                entidadId: factura.id,
                valorAnterior: {
                    numeroCompleto: factura.numeroCompleto,
                    estado: EstadoFactura.EMITIDA,
                    total: totalAnulado,
                    metodoPago: factura.venta.metodoPago,
                    cajaOriginalId: factura.venta.cajaSesionId,
                },
                valorNuevo: {
                    numeroCompleto: factura.numeroCompleto,
                    estado: EstadoFactura.ANULADA,
                    total: totalAnulado,
                    motivoAnulacion: motivo,
                    cajaEgresoId: cajaAbierta.id,
                    cajaMovimientoId: movimientoEgreso?.id ?? null,
                    reintegrarInventario: input.reintegrarInventario,
                    ingredientesReintegrados,
                    mesaLiberada,
                },
                codigoMotivo,
                motivo,
                impactoFinanciero: round2(-totalAnulado),
                repeticionesEnTurno,
            }, tx);
            return {
                factura: facturaAnulada ? facturaAnulada.get({ plain: true }) : null,
                cajaRevertidaId: cajaAbierta.id,
                cajaOriginalId: factura.venta.cajaSesionId,
                ingredientesReintegrados,
                mesaLiberada,
            };
        });
    }
}

module.exports = { FacturasService, alcanceTurnoCajero };
