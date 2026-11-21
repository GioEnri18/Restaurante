const { Op, QueryTypes, col, fn } = require('sequelize');
const { ACCIONES_AUDITORIA } = require('../config/constants');
const { sequelize, withTransaction } = require('../config/database');
const { Compra, CompraDetalle, Ingrediente, InventarioMovimiento, Proveedor, TipoMovimientoInventario, UnidadMedida, Usuario } = require('../models');
const { BadRequestError, NotFoundError } = require('../shared/errors/AppError');
const { AuditService } = require('../shared/services/audit.service');
const { UnitConversionService } = require('../shared/services/unitConversion.service');
const { endOfDayInTimezone, startOfDayInTimezone } = require('../shared/utils/dates');
const { patronContiene } = require('../shared/utils/busqueda');
const { buildPaginationMeta, parsePagination } = require('../shared/utils/pagination');
const { round2, round4 } = require('../shared/utils/tax');
class InventarioService {
    static enrichIngrediente(ing) {
        const plain = ing.get({ plain: true });
        const stockActualOz = Number(ing.stockActualOz);
        const stockMinimoOz = Number(ing.stockMinimoOz);
        const costoPromedioOz = Number(ing.costoPromedioOz);
        return {
            ...plain,
            stockActualOz,
            stockActualLb: UnitConversionService.ozToLb(stockActualOz),
            stockMinimoOz,
            stockMinimoLb: UnitConversionService.ozToLb(stockMinimoOz),
            costoPromedioOz,
            costoPromedioLb: UnitConversionService.costPerOzToPricePerLb(costoPromedioOz),
            bajoStock: stockActualOz <= stockMinimoOz,
        };
    }
    static async listarIngredientes(sucursalId, search) {
        const where = {
            sucursalId,
            activo: true,
            ...(search
                ? {
                    [Op.or]: [
                        { nombre: { [Op.iLike]: patronContiene(search) } },
                        { codigo: { [Op.iLike]: patronContiene(search) } },
                    ],
                }
                : {}),
        };
        const ingredientes = await Ingrediente.findAll({
            where,
            order: [['nombre', 'ASC']],
            include: [{ model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre', 'telefono'] }],
        });
        return ingredientes.map((i) => this.enrichIngrediente(i));
    }
    static async obtenerAlertas(sucursalId) {
        const todos = await this.listarIngredientes(sucursalId);
        return todos.filter((i) => i.bajoStock);
    }
    static async crearIngrediente(user, input, clientMeta) {
        return withTransaction(async (tx) => {
            const stockMinimoOz = UnitConversionService.toBaseOz(input.stockMinimo, input.unidadStockMinimo);
            const stockInicialOz = input.stockInicial
                ? UnitConversionService.toMovimientoOz(input.stockInicial, input.unidadStockInicial ?? UnidadMedida.lb)
                : 0;
            UnitConversionService.validarSaldoOz(stockMinimoOz);
            const precioPorLb = round2(input.precioPorLb ?? 0);
            if (stockInicialOz > 0 && precioPorLb < 0.01) {
                throw new BadRequestError('Indica un costo inicial de al menos Q0.01 por libra para ingresar existencias');
            }
            const costoPromedioOz = precioPorLb > 0
                ? UnitConversionService.pricePerLbToCostPerOz(precioPorLb)
                : 0;
            const ingrediente = await Ingrediente.create({
                sucursalId: user.sucursalId,
                proveedorId: input.proveedorId ?? null,
                codigo: input.codigo.trim().toUpperCase(),
                nombre: input.nombre.trim(),
                stockActualOz: stockInicialOz,
                stockMinimoOz,
                costoPromedioOz,
            }, { transaction: tx });
            if (stockInicialOz > 0) {
                await InventarioMovimiento.create({
                    sucursalId: user.sucursalId,
                    ingredienteId: ingrediente.id,
                    usuarioId: user.id,
                    tipo: TipoMovimientoInventario.AJUSTE_MANUAL,
                    cantidadOz: stockInicialOz,
                    stockAnteriorOz: 0,
                    stockNuevoOz: stockInicialOz,
                    costoUnitarioOz: costoPromedioOz,
                    referenciaTipo: 'CREACION',
                    referenciaId: ingrediente.id,
                    motivo: 'Existencia inicial al registrar ingrediente',
                }, { transaction: tx });
            }
            await AuditService.registrar({
                sucursalId: user.sucursalId,
                usuarioId: user.id,
                accion: ACCIONES_AUDITORIA.AJUSTE_INVENTARIO,
                entidad: 'Ingrediente',
                entidadId: ingrediente.id,
                valorAnterior: null,
                valorNuevo: {
                    codigo: ingrediente.codigo,
                    nombre: ingrediente.nombre,
                    stockActualOz: stockInicialOz,
                    stockMinimoOz,
                },
                motivo: 'Creación de ingrediente',
                ipAddress: clientMeta.ipAddress,
                userAgent: clientMeta.userAgent,
            }, tx);
            const conProveedor = await Ingrediente.findByPk(ingrediente.id, {
                include: [{ model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre'] }],
                transaction: tx,
            });
            return this.enrichIngrediente(conProveedor ?? ingrediente);
        });
    }
    static async actualizarIngrediente(user, ingredienteId, input, clientMeta) {
        return withTransaction(async (tx) => {
            const actual = await Ingrediente.findOne({
                where: { id: ingredienteId, sucursalId: user.sucursalId },
                transaction: tx,
            });
            if (!actual) {
                throw new NotFoundError('Ingrediente no encontrado');
            }
            const prevNombre = actual.nombre;
            const prevStockMinimoOz = Number(actual.stockMinimoOz);
            const prevProveedorId = actual.proveedorId;
            const nuevoStockMinimoOz = input.stockMinimo !== undefined
                ? UnitConversionService.toBaseOz(input.stockMinimo, input.unidadStockMinimo ?? UnidadMedida.oz)
                : prevStockMinimoOz;
            UnitConversionService.validarSaldoOz(nuevoStockMinimoOz);
            await actual.update({
                nombre: input.nombre ? input.nombre.trim() : actual.nombre,
                proveedorId: input.proveedorId !== undefined ? input.proveedorId : actual.proveedorId,
                stockMinimoOz: nuevoStockMinimoOz,
                activo: input.activo ?? actual.activo,
            }, { transaction: tx });
            await AuditService.registrar({
                sucursalId: user.sucursalId,
                usuarioId: user.id,
                accion: ACCIONES_AUDITORIA.AJUSTE_INVENTARIO,
                entidad: 'Ingrediente',
                entidadId: ingredienteId,
                valorAnterior: {
                    nombre: prevNombre,
                    stockMinimoOz: prevStockMinimoOz,
                    proveedorId: prevProveedorId,
                },
                valorNuevo: {
                    nombre: actual.nombre,
                    stockMinimoOz: Number(actual.stockMinimoOz),
                    proveedorId: actual.proveedorId,
                },
                motivo: 'Actualización de ficha de ingrediente',
                ipAddress: clientMeta.ipAddress,
                userAgent: clientMeta.userAgent,
            }, tx);
            const actualizado = await Ingrediente.findByPk(ingredienteId, {
                include: [{ model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre'] }],
                transaction: tx,
            });
            return this.enrichIngrediente(actualizado ?? actual);
        });
    }
    static async ajustarStock(user, ingredienteId, input, clientMeta) {
        return withTransaction(async (tx) => {
            // Bloqueo FOR UPDATE sobre la fila del ingrediente
            const ingrediente = await Ingrediente.findOne({
                where: { id: ingredienteId, sucursalId: user.sucursalId, activo: true },
                lock: tx.LOCK.UPDATE,
                transaction: tx,
            });
            if (!ingrediente) {
                throw new NotFoundError('Ingrediente no encontrado');
            }
            const cantidadOz = UnitConversionService.toMovimientoOz(input.cantidad, input.unidad);
            const deltaOz = input.tipoAjuste === 'ENTRADA' ? cantidadOz : -cantidadOz;
            if (deltaOz > 0 && Number(ingrediente.costoPromedioOz) <= 0) {
                throw new BadRequestError('Registra una compra con costo antes de agregar existencias por ajuste');
            }
            const stockAnteriorOz = Number(ingrediente.stockActualOz);
            const stockNuevoOz = round4(stockAnteriorOz + deltaOz);
            if (stockNuevoOz < 0) {
                throw new BadRequestError(`El ajuste dejaría el stock negativo (disponible: ${stockAnteriorOz} oz)`);
            }
            UnitConversionService.validarSaldoOz(stockNuevoOz);
            await ingrediente.update({ stockActualOz: stockNuevoOz }, { transaction: tx });
            const movimiento = await InventarioMovimiento.create({
                sucursalId: user.sucursalId,
                ingredienteId,
                usuarioId: user.id,
                tipo: TipoMovimientoInventario.AJUSTE_MANUAL,
                cantidadOz: deltaOz,
                stockAnteriorOz,
                stockNuevoOz,
                costoUnitarioOz: Number(ingrediente.costoPromedioOz),
                referenciaTipo: 'AJUSTE',
                motivo: `${input.motivo.trim()} (${input.cantidad} ${input.unidad} = ${cantidadOz} oz)`,
            }, { transaction: tx });
            await AuditService.registrar({
                sucursalId: user.sucursalId,
                usuarioId: user.id,
                accion: ACCIONES_AUDITORIA.AJUSTE_INVENTARIO,
                entidad: 'Ingrediente',
                entidadId: ingredienteId,
                valorAnterior: {
                    nombre: ingrediente.nombre,
                    stockActualOz: stockAnteriorOz,
                    stockActualLb: UnitConversionService.ozToLb(stockAnteriorOz),
                },
                valorNuevo: {
                    nombre: ingrediente.nombre,
                    stockActualOz: stockNuevoOz,
                    stockActualLb: UnitConversionService.ozToLb(stockNuevoOz),
                    tipoAjuste: input.tipoAjuste,
                    cantidadOriginal: `${input.cantidad} ${input.unidad}`,
                },
                motivo: input.motivo.trim(),
                ipAddress: clientMeta.ipAddress,
                userAgent: clientMeta.userAgent,
            }, tx);
            return {
                ingrediente: this.enrichIngrediente(ingrediente),
                movimiento: {
                    ...movimiento.get({ plain: true }),
                    cantidadOz: Number(movimiento.cantidadOz),
                    stockAnteriorOz: Number(movimiento.stockAnteriorOz),
                    stockNuevoOz: Number(movimiento.stockNuevoOz),
                    costoUnitarioOz: Number(movimiento.costoUnitarioOz),
                },
            };
        });
    }
    static async listarProveedores(sucursalId) {
        const [proveedores, ingCounts, compCounts] = await Promise.all([
            Proveedor.findAll({
                where: { sucursalId, activo: true },
                order: [['nombre', 'ASC']],
            }),
            Ingrediente.findAll({
                where: { sucursalId, proveedorId: { [Op.ne]: null } },
                attributes: ['proveedorId', [fn('COUNT', col('id')), 'cnt']],
                group: ['proveedorId'],
                raw: true,
            }),
            Compra.findAll({
                where: { sucursalId },
                attributes: ['proveedorId', [fn('COUNT', col('id')), 'cnt']],
                group: ['proveedorId'],
                raw: true,
            }),
        ]);
        const ingMap = new Map(ingCounts.map((i) => [Number(i.proveedorId), Number(i.cnt)]));
        const compMap = new Map(compCounts.map((c) => [Number(c.proveedorId), Number(c.cnt)]));
        return proveedores.map((p) => ({
            ...p.get({ plain: true }),
            _count: {
                ingredientes: ingMap.get(p.id) ?? 0,
                compras: compMap.get(p.id) ?? 0,
            },
        }));
    }
    static async crearProveedor(sucursalId, input) {
        const proveedor = await Proveedor.create({
            sucursalId,
            nombre: input.nombre.trim(),
            nit: input.nit?.trim() || null,
            telefono: input.telefono?.trim() || null,
            email: input.email?.trim() || null,
            contacto: input.contacto?.trim() || null,
        });
        return proveedor.get({ plain: true });
    }
    static async actualizarProveedor(sucursalId, id, input) {
        const existente = await Proveedor.findOne({ where: { id, sucursalId } });
        if (!existente) {
            throw new NotFoundError('Proveedor no encontrado');
        }
        await existente.update({
            nombre: input.nombre ? input.nombre.trim() : existente.nombre,
            nit: input.nit !== undefined ? input.nit.trim() || null : existente.nit,
            telefono: input.telefono !== undefined ? input.telefono.trim() || null : existente.telefono,
            email: input.email !== undefined ? input.email.trim() || null : existente.email,
            contacto: input.contacto !== undefined ? input.contacto.trim() || null : existente.contacto,
        });
        return existente.get({ plain: true });
    }
    /**
     * REGLA DE NEGOCIO:
     * Las compras se registran en LIBRAS (lb) con conversión automática centralizada a ONZAS (1 lb = 16 oz),
     * bloqueando ingredientes en orden ascendente (FOR UPDATE), recalculando costo promedio ponderado por onza
     * y registrando entradas en Kardex.
     */
    static async registrarCompra(user, input, clientMeta) {
        return withTransaction(async (tx) => {
            const proveedor = await Proveedor.findOne({
                where: { id: input.proveedorId, sucursalId: user.sucursalId, activo: true },
                transaction: tx,
            });
            if (!proveedor) {
                throw new NotFoundError('Proveedor no encontrado');
            }
            const sortedIds = Array.from(new Set(input.items.map((i) => i.ingredienteId))).sort((a, b) => a - b);
            // Bloqueo pesimista ordenado por ID para evitar condiciones de carrera con ventas concurrentes
            const bloqueados = await sequelize.query(`SELECT id, stock_actual_oz, costo_promedio_oz
         FROM ingredientes
         WHERE id IN (:ids) AND sucursal_id = :sucursalId AND activo = true
         ORDER BY id ASC
         FOR UPDATE`, {
                replacements: { ids: sortedIds, sucursalId: user.sucursalId },
                type: QueryTypes.SELECT,
                transaction: tx,
            });
            const estadoIngMap = new Map(bloqueados.map((b) => [
                b.id,
                { stockOz: Number(b.stock_actual_oz), costoOz: Number(b.costo_promedio_oz) },
            ]));
            let totalCompra = 0;
            const detallesPreparados = [];
            for (const item of input.items) {
                if (!estadoIngMap.has(item.ingredienteId)) {
                    throw new NotFoundError(`Ingrediente ID ${item.ingredienteId} no encontrado`);
                }
                const cantidadOz = UnitConversionService.toMovimientoOz(item.cantidadLb, UnidadMedida.lb, true);
                const precioPorLb = round2(item.precioPorLb);
                if (!(precioPorLb >= 0.01 && precioPorLb <= 99999999.99)) {
                    throw new BadRequestError('El precio por libra está fuera del rango permitido');
                }
                const costoPorOz = UnitConversionService.pricePerLbToCostPerOz(precioPorLb);
                const subtotal = round2(item.cantidadLb * precioPorLb);
                totalCompra = round2(totalCompra + subtotal);
                if (totalCompra > 9999999999.99) {
                    throw new BadRequestError('El total de la compra excede el máximo permitido');
                }
                detallesPreparados.push({
                    ingredienteId: item.ingredienteId,
                    cantidadLb: round4(item.cantidadLb),
                    cantidadOz,
                    precioPorLb,
                    costoPorOz,
                    subtotal,
                });
            }
            const compra = await Compra.create({
                sucursalId: user.sucursalId,
                proveedorId: proveedor.id,
                usuarioId: user.id,
                numeroDocumento: input.numeroDocumento?.trim() || null,
                total: totalCompra,
                observaciones: input.observaciones?.trim() || null,
            }, { transaction: tx });
            await CompraDetalle.bulkCreate(detallesPreparados.map((d) => ({ compraId: compra.id, ...d })), { transaction: tx });
            // Actualizar existencias (en oz), costo promedio ponderado por oz y Kardex
            for (const det of detallesPreparados) {
                const estado = estadoIngMap.get(det.ingredienteId);
                const stockAnteriorOz = estado.stockOz;
                const costoAnteriorOz = estado.costoOz;
                const stockNuevoOz = round4(stockAnteriorOz + det.cantidadOz);
                UnitConversionService.validarSaldoOz(stockNuevoOz);
                const valorAnterior = stockAnteriorOz * costoAnteriorOz;
                const valorEntrada = det.cantidadOz * det.costoPorOz;
                const nuevoCostoPromedioOz = stockNuevoOz > 0 ? round4((valorAnterior + valorEntrada) / stockNuevoOz) : det.costoPorOz;
                estado.stockOz = stockNuevoOz;
                estado.costoOz = nuevoCostoPromedioOz;
                await Ingrediente.update({
                    stockActualOz: stockNuevoOz,
                    costoPromedioOz: nuevoCostoPromedioOz,
                }, { where: { id: det.ingredienteId }, transaction: tx });
                await InventarioMovimiento.create({
                    sucursalId: user.sucursalId,
                    ingredienteId: det.ingredienteId,
                    usuarioId: user.id,
                    tipo: TipoMovimientoInventario.ENTRADA_COMPRA,
                    cantidadOz: det.cantidadOz,
                    stockAnteriorOz,
                    stockNuevoOz,
                    costoUnitarioOz: det.costoPorOz,
                    referenciaTipo: 'COMPRA',
                    referenciaId: compra.id,
                    motivo: `Compra #${compra.id} (${det.cantidadLb} lb = ${det.cantidadOz} oz @ Q ${det.precioPorLb.toFixed(2)}/lb)`,
                }, { transaction: tx });
            }
            await AuditService.registrar({
                sucursalId: user.sucursalId,
                usuarioId: user.id,
                accion: ACCIONES_AUDITORIA.COMPRA_INVENTARIO,
                entidad: 'Compra',
                entidadId: compra.id,
                valorNuevo: {
                    proveedor: proveedor.nombre,
                    numeroDocumento: compra.numeroDocumento,
                    total: totalCompra,
                    items: detallesPreparados.map((d) => ({
                        ingredienteId: d.ingredienteId,
                        cantidadLb: d.cantidadLb,
                        cantidadOz: d.cantidadOz,
                        precioPorLb: d.precioPorLb,
                    })),
                },
                ipAddress: clientMeta.ipAddress,
                userAgent: clientMeta.userAgent,
            }, tx);
            const compraCompleta = await Compra.findByPk(compra.id, {
                include: [
                    { model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre'] },
                    {
                        model: CompraDetalle,
                        as: 'detalles',
                        include: [{ model: Ingrediente, as: 'ingrediente', attributes: ['id', 'codigo', 'nombre'] }],
                    },
                ],
                transaction: tx,
            });
            return (compraCompleta ?? compra).get({ plain: true });
        });
    }
    static async listarCompras(sucursalId, rawPage, rawLimit) {
        const { page, limit, skip } = parsePagination(rawPage, rawLimit, 10);
        const { rows, count } = await Compra.findAndCountAll({
            where: { sucursalId },
            order: [['fechaCompra', 'DESC']],
            offset: skip,
            limit,
            distinct: true,
            include: [
                { model: Proveedor, as: 'proveedor', attributes: ['id', 'nombre'] },
                { model: Usuario, as: 'usuario', attributes: ['id', 'nombreCompleto'] },
                {
                    model: CompraDetalle,
                    as: 'detalles',
                    include: [{ model: Ingrediente, as: 'ingrediente', attributes: ['id', 'codigo', 'nombre'] }],
                },
            ],
        });
        const items = rows.map((c) => {
            const plain = c.get({ plain: true });
            return {
                ...plain,
                total: Number(c.total),
                detalles: (plain.detalles ?? []).map((d) => ({
                    ...d,
                    cantidadLb: Number(d.cantidadLb),
                    cantidadOz: Number(d.cantidadOz),
                    precioPorLb: Number(d.precioPorLb),
                    costoPorOz: Number(d.costoPorOz),
                    subtotal: Number(d.subtotal),
                })),
            };
        });
        return { items, meta: buildPaginationMeta(count, page, limit) };
    }
    static async listarMovimientos(sucursalId, query) {
        const { page, limit, skip } = parsePagination(query.page, query.limit, 15);
        const where = { sucursalId };
        if (query.ingredienteId)
            where.ingredienteId = Number(query.ingredienteId);
        if (query.tipo)
            where.tipo = query.tipo;
        if (query.fechaDesde || query.fechaHasta) {
            const rango = {};
            if (query.fechaDesde)
                rango[Op.gte] = startOfDayInTimezone(query.fechaDesde);
            if (query.fechaHasta)
                rango[Op.lte] = endOfDayInTimezone(query.fechaHasta);
            where.createdAt = rango;
        }
        const { rows, count } = await InventarioMovimiento.findAndCountAll({
            where: where,
            order: [['createdAt', 'DESC']],
            offset: skip,
            limit,
            include: [
                { model: Ingrediente, as: 'ingrediente', attributes: ['id', 'codigo', 'nombre'] },
                { model: Usuario, as: 'usuario', attributes: ['id', 'nombreCompleto'] },
            ],
        });
        return {
            items: rows.map((m) => ({
                ...m.get({ plain: true }),
                cantidadOz: Number(m.cantidadOz),
                cantidadLb: UnitConversionService.ozToLb(Number(m.cantidadOz)),
                stockAnteriorOz: Number(m.stockAnteriorOz),
                stockNuevoOz: Number(m.stockNuevoOz),
                costoUnitarioOz: Number(m.costoUnitarioOz),
            })),
            meta: buildPaginationMeta(count, page, limit),
        };
    }
}

module.exports = { InventarioService };
