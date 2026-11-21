const { ForeignKeyConstraintError, UniqueConstraintError, ValidationError } = require('sequelize');
const { ZodError } = require('zod');
const { getPgErrorCode } = require('../config/database');
const { env } = require('../config/env');
const { AppError } = require('../shared/errors/AppError');
// Middleware centralizado de manejo de errores para Sequelize, Zod y reglas de negocio
function errorHandler(err, _req, res, _next) {
    if (res.headersSent) {
        return;
    }
    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            ok: false,
            error: {
                code: err.code,
                message: err.message,
                details: err.details,
            },
        });
        return;
    }
    if (err instanceof ZodError) {
        const issues = err.issues || err.errors || [];
        res.status(400).json({
            ok: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Datos de entrada inválidos',
                details: issues.map((issue) => ({
                    campo: issue.path.join('.'),
                    mensaje: issue.message,
                })),
            },
        });
        return;
    }
    if (err instanceof UniqueConstraintError) {
        res.status(409).json({
            ok: false,
            error: {
                code: 'DUPLICATE_ENTRY',
                message: 'Ya existe un registro con los mismos datos únicos',
                details: err.errors.map((e) => e.path),
            },
        });
        return;
    }
    if (err instanceof ForeignKeyConstraintError) {
        res.status(400).json({
            ok: false,
            error: {
                code: 'FOREIGN_KEY_VIOLATION',
                message: 'Referencia inválida a un registro relacionado',
            },
        });
        return;
    }
    if (err instanceof ValidationError) {
        res.status(400).json({
            ok: false,
            error: {
                code: 'ORM_VALIDATION_ERROR',
                message: 'Los datos no cumplen las restricciones del modelo',
                details: err.errors.map((e) => ({ campo: e.path, mensaje: e.message })),
            },
        });
        return;
    }
    const pgCode = getPgErrorCode(err);
    if (pgCode === '55P03' || pgCode === '40P01') {
        res.status(409).json({
            ok: false,
            error: {
                code: 'CONCURRENCY_CONFLICT',
                message: 'Recurso temporalmente bloqueado por otra operación concurrente. Reintenta.',
            },
        });
        return;
    }
    if (pgCode === '57014') {
        res.status(503).json({
            ok: false,
            error: {
                code: 'DB_TIMEOUT',
                message: 'Tiempo de espera excedido en base de datos',
            },
        });
        return;
    }
    console.error('❌ Error no controlado:', err);
    res.status(500).json({
        ok: false,
        error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: env.NODE_ENV === 'production'
                ? 'Error interno del servidor'
                : err instanceof Error
                    ? err.message
                    : 'Error desconocido',
        },
    });
}

module.exports = { errorHandler };
