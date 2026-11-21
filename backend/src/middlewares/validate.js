/** En query string, `?campo=` (valor vacío) equivale a no enviar el filtro */
function limpiarQueryVacia(query) {
    if (!query || typeof query !== 'object') return query;
    const limpio = {};
    for (const [key, val] of Object.entries(query)) {
        if (typeof val === 'string' && val.trim() === '') continue;
        limpio[key] = val;
    }
    return limpio;
}

function validate(schema, target = 'body') {
    return (req, _res, next) => {
        const input = target === 'query' ? limpiarQueryVacia(req[target]) : req[target];
        const result = schema.safeParse(input);
        if (!result.success) {
            next(result.error);
            return;
        }
        req[target] = result.data;
        next();
    };
}

module.exports = { validate };
