const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('../../config/constants');
function parsePagination(rawPage, rawLimit, defaultLimit = DEFAULT_PAGE_SIZE, maxLimit = MAX_PAGE_SIZE) {
    const parsedPage = Number(rawPage);
    const parsedLimit = Number(rawLimit);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, maxLimit)
        : defaultLimit;
    return {
        page,
        limit,
        skip: (page - 1) * limit,
    };
}
function buildPaginationMeta(total, page, limit) {
    return {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

module.exports = { parsePagination, buildPaginationMeta };
