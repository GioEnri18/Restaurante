const { AuditoriaLog } = require('../../models');
/**
 * Servicio transversal de auditoría inmutable (APPEND-ONLY).
 * Soporta ejecutarse dentro de cualquier transacción Sequelize (garantizando rollback si la operación falla).
 */
class AuditService {
    static sanitizeJson(value) {
        if (value === undefined || value === null)
            return null;
        return JSON.parse(JSON.stringify(value, (_key, val) => (typeof val === 'bigint' ? val.toString() : val)));
    }
    static async registrar(input, transaction) {
        await AuditoriaLog.create({
            sucursalId: input.sucursalId ?? null,
            usuarioId: input.usuarioId ?? null,
            accion: input.accion,
            entidad: input.entidad,
            entidadId: input.entidadId !== undefined && input.entidadId !== null
                ? String(input.entidadId)
                : null,
            valorAnterior: this.sanitizeJson(input.valorAnterior),
            valorNuevo: this.sanitizeJson(input.valorNuevo),
            motivo: input.motivo ?? null,
            ipAddress: input.ipAddress ?? null,
            userAgent: input.userAgent ? input.userAgent.slice(0, 255) : null,
        }, { transaction });
    }
}

module.exports = { AuditService };
