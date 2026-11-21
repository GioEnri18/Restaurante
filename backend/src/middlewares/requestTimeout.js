const { env } = require('../config/env');
/**
 * Middleware anti-cola HTTP: corta cualquier petición que exceda REQUEST_TIMEOUT_MS
 * para evitar acumulación de sockets o procesos colgados bajo carga.
 */
function requestTimeout(req, res, next) {
    const timer = setTimeout(() => {
        if (!res.headersSent) {
            res.status(503).json({
                ok: false,
                error: {
                    code: 'REQUEST_TIMEOUT',
                    message: `La solicitud excedió el tiempo máximo de respuesta (${env.REQUEST_TIMEOUT_MS} ms). Intenta nuevamente.`,
                },
            });
        }
    }, env.REQUEST_TIMEOUT_MS);
    const cleanup = () => clearTimeout(timer);
    res.on('finish', cleanup);
    res.on('close', cleanup);
    req.on('aborted', cleanup);
    next();
}

module.exports = { requestTimeout };
