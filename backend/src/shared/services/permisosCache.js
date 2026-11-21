const { env } = require('../../config/env');

/**
 * Caché en memoria de permisos efectivos por (usuario, rol), con TTL corto.
 *
 * `authenticate` hacía 3 consultas por petición: usuario+rol+sucursal y 2 de permisos.
 * La del usuario se mantiene SIEMPRE (valida activo, sucursal y token_version, es decir,
 * revocación inmediata); solo los permisos se cachean.
 *
 * Coherencia:
 * - En esta instancia, Accesos invalida al cambiar permisos de usuario o de rol.
 * - Con varias instancias de la API, otra instancia puede usar permisos viejos como máximo
 *   PERMISOS_CACHE_TTL_MS. Un cambio de rol no espera: la clave incluye el rolId.
 * - PERMISOS_CACHE_TTL_MS=0 desactiva la caché.
 */
const entradas = new Map();
const MAX_ENTRADAS = 5000;

function clave(usuarioId, rolId) {
  return `${usuarioId}:${rolId}`;
}

async function obtener(usuarioId, rolId, cargar) {
  const ttl = env.PERMISOS_CACHE_TTL_MS;
  if (ttl <= 0) return cargar();

  const k = clave(usuarioId, rolId);
  const ahora = Date.now();
  const existente = entradas.get(k);
  if (existente && existente.expira > ahora) {
    return existente.permisos;
  }

  const permisos = await cargar();
  if (entradas.size >= MAX_ENTRADAS) {
    entradas.clear();
  }
  entradas.set(k, { permisos, expira: ahora + ttl });
  return permisos;
}

function invalidarUsuario(usuarioId) {
  const prefijo = `${usuarioId}:`;
  for (const k of entradas.keys()) {
    if (k.startsWith(prefijo)) entradas.delete(k);
  }
}

function invalidarTodo() {
  entradas.clear();
}

module.exports = { PermisosCache: { obtener, invalidarUsuario, invalidarTodo } };
