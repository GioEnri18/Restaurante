const { Op } = require('sequelize');
const { ACCIONES_AUDITORIA } = require('../config/constants');
const { AuditoriaLog, Rol, Usuario } = require('../models');
const { endOfDayInTimezone, startOfDayInTimezone } = require('../shared/utils/dates');
const { buildPaginationMeta, parsePagination } = require('../shared/utils/pagination');
class AuditoriaService {
    static async listar(sucursalId, query) {
        const { page, limit, skip } = parsePagination(query.page, query.limit, 15, 100);
        const where = {
            [Op.or]: [{ sucursalId }, { sucursalId: null }],
        };
        const andWhere = where;
        if (query.usuarioId)
            andWhere.usuarioId = Number(query.usuarioId);
        if (query.accion?.trim())
            andWhere.accion = query.accion.trim();
        if (query.entidad?.trim())
            andWhere.entidad = query.entidad.trim();
        if (query.fechaDesde || query.fechaHasta) {
            const rango = {};
            if (query.fechaDesde)
                rango[Op.gte] = startOfDayInTimezone(query.fechaDesde);
            if (query.fechaHasta)
                rango[Op.lte] = endOfDayInTimezone(query.fechaHasta);
            andWhere.createdAt = rango;
        }
        const { rows, count } = await AuditoriaLog.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            offset: skip,
            limit,
            include: [
                {
                    model: Usuario,
                    as: 'usuario',
                    attributes: ['id', 'username', 'nombreCompleto'],
                    include: [{ model: Rol, as: 'rol', attributes: ['nombre', 'codigo'] }],
                },
            ],
        });
        return {
            items: rows.map((r) => r.get({ plain: true })),
            meta: buildPaginationMeta(count, page, limit),
        };
    }
    static async obtenerCatalogoFiltros(sucursalId) {
        const usuarios = await Usuario.findAll({
            where: { sucursalId },
            order: [['nombreCompleto', 'ASC']],
            attributes: ['id', 'username', 'nombreCompleto'],
        });
        return {
            acciones: Object.values(ACCIONES_AUDITORIA),
            usuarios: usuarios.map((u) => u.get({ plain: true })),
        };
    }
}

module.exports = { AuditoriaService };
