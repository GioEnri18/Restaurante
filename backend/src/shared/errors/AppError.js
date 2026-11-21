// Jerarquía centralizada de errores de aplicación con código HTTP y detalle opcional
class AppError extends Error {
    statusCode;
    code;
    details;
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}
class BadRequestError extends AppError {
    constructor(message, details) {
        super(message, 400, 'BAD_REQUEST', details);
    }
}
class UnauthorizedError extends AppError {
    constructor(message = 'No autenticado o sesión expirada') {
        super(message, 401, 'UNAUTHORIZED');
    }
}
class ForbiddenError extends AppError {
    constructor(message = 'No tiene permisos para realizar esta acción') {
        super(message, 403, 'FORBIDDEN');
    }
}
class NotFoundError extends AppError {
    constructor(message = 'Recurso no encontrado') {
        super(message, 404, 'NOT_FOUND');
    }
}
class ConflictError extends AppError {
    constructor(message, details) {
        super(message, 409, 'CONFLICT', details);
    }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
};
