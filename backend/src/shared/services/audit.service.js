const crypto = require('node:crypto');
const { AuditoriaLog } = require('../../models');
const { calcularSeveridad, normalizarCodigoMotivo } = require('../utils/auditoriaSeveridad');
const { round2 } = require('../utils/tax');

const REDACTADO = '[REDACTADO]';

// Claves sensibles que NUNCA deben almacenarse en claro en valor_anterior / valor_nuevo
const CLAVES_SENSIBLES_EXACTAS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'contrasena',
  'contraseña',
  'clave',
  'token',
  'accesstoken',
  'refreshtoken',
  'jwt',
  'secret',
  'jwtsecret',
  'authorization',
  'cookie',
  'cookies',
  'cvv',
  'cvc',
  'pin',
  'pan',
  'cardnumber',
  'numerotarjeta',
  'numero_tarjeta',
]);

const PATRON_CLAVE_SENSIBLE = /(password|passwd|secret|token|jwt|cookie|authorization|card_?num|numero_?tarjeta|cvv|cvc)/i;

// Detecta secuencias con formato de número de tarjeta (13 a 19 dígitos con espacios o guiones opcionales)
const PATRON_PAN_TARJETA = /\b(?:\d[ -]?){13,19}\b/g;

function esClaveSensible(key) {
  const normalizada = String(key || '').trim().toLowerCase();
  if (!normalizada) return false;
  // Permite banderas booleanas descriptivas como `passwordActualizado`
  if (normalizada === 'passwordactualizado' || normalizada === 'password_actualizado') {
    return false;
  }
  return CLAVES_SENSIBLES_EXACTAS.has(normalizada) || PATRON_CLAVE_SENSIBLE.test(normalizada);
}

function sanitizarTextoSensible(texto) {
  if (typeof texto !== 'string') return texto;
  return texto
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, `Bearer ${REDACTADO}`)
    .replace(PATRON_PAN_TARJETA, (coincidencia) => {
      const soloDigitos = coincidencia.replace(/\D/g, '');
      return soloDigitos.length >= 13 && soloDigitos.length <= 19 ? REDACTADO : coincidencia;
    });
}

function sanitizarValorRecursivo(value, vistos) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return sanitizarTextoSensible(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();

  if (typeof value === 'object') {
    if (vistos.has(value)) return '[CIRCULAR]';
    vistos.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => sanitizarValorRecursivo(item, vistos));
    }

    const limpio = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      if (esClaveSensible(k)) {
        limpio[k] = REDACTADO;
      } else {
        limpio[k] = sanitizarValorRecursivo(v, vistos);
      }
    }
    return limpio;
  }

  return String(value);
}

function normalizarImpactoFinanciero(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const num = Number(valor);
  return Number.isFinite(num) ? round2(num) : null;
}

/**
 * Servicio transversal de auditoría inmutable (APPEND-ONLY).
 * - Centraliza redacción de datos sensibles ([REDACTADO]).
 * - Calcula automáticamente la severidad mediante `calcularSeveridad` cuando no se indica.
 * - Soporta ejecutarse dentro de cualquier transacción Sequelize (garantizando rollback si la operación falla).
 */
class AuditService {
  static crearCorrelacionId() {
    return crypto.randomUUID();
  }

  static sanitizeJson(value) {
    if (value === undefined || value === null) return null;
    return sanitizarValorRecursivo(value, new WeakSet());
  }

  static sanitizeText(value, maxLength = 300) {
    if (value === undefined || value === null) return null;
    const limpio = sanitizarTextoSensible(String(value).trim());
    if (!limpio) return null;
    return limpio.slice(0, maxLength);
  }

  /**
   * Cuenta cuántas veces ocurrió la misma acción por el mismo usuario en el turno actual (+1 incluyendo la actual).
   * Permite elevar la severidad automáticamente por patrón repetitivo al registrar.
   */
  static async contarRepeticionesEnTurno({ sucursalId, usuarioId, cajaSesionId, accion }, transaction) {
    if (!sucursalId || !usuarioId || !cajaSesionId || !accion) return 1;
    const previas = await AuditoriaLog.count({
      where: { sucursalId, usuarioId, cajaSesionId, accion },
      transaction,
    });
    return previas + 1;
  }

  /**
   * Registra un evento inmutable en `auditoria_logs`.
   * Mantiene compatibilidad total con llamadas existentes y acepta los nuevos campos de contexto.
   */
  static async registrar(input, transaction) {
    const valorAnterior = this.sanitizeJson(input.valorAnterior);
    const valorNuevo = this.sanitizeJson(input.valorNuevo);
    const impactoFinanciero = normalizarImpactoFinanciero(input.impactoFinanciero);
    const severidad = input.severidad
      ?? calcularSeveridad(input.accion, {
        impactoFinanciero,
        diferencia: input.diferencia,
        repeticionesEnTurno: input.repeticionesEnTurno,
        valorNuevo,
      });

    await AuditoriaLog.create({
      sucursalId: input.sucursalId ?? null,
      usuarioId: input.usuarioId ?? null,
      actorRolCodigo: input.actorRolCodigo ? String(input.actorRolCodigo).slice(0, 40) : null,
      aprobadorId: input.aprobadorId ?? null,
      cajaSesionId: input.cajaSesionId ?? null,
      accion: input.accion,
      severidad,
      entidad: input.entidad,
      entidadId: input.entidadId !== undefined && input.entidadId !== null
        ? String(input.entidadId)
        : null,
      valorAnterior,
      valorNuevo,
      codigoMotivo: normalizarCodigoMotivo(input.codigoMotivo),
      motivo: this.sanitizeText(input.motivo, 300),
      impactoFinanciero,
      correlacionId: input.correlacionId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ? String(input.userAgent).slice(0, 255) : null,
    }, { transaction });
  }

  /**
   * Helper único para registrar eventos de negocio sin duplicar la extracción de contexto
   * (usuario, rol snapshot, sucursal, turno de caja, aprobador, correlación y metadatos HTTP).
   */
  static async registrarEvento(contexto, detalle, transaction) {
    const user = contexto?.user ?? null;
    const clientMeta = contexto?.clientMeta ?? null;

    await this.registrar({
      sucursalId: contexto?.sucursalId ?? user?.sucursalId ?? null,
      usuarioId: contexto?.usuarioId ?? user?.id ?? null,
      actorRolCodigo: contexto?.actorRolCodigo ?? user?.rolCodigo ?? user?.rol?.codigo ?? null,
      aprobadorId: contexto?.aprobadorId ?? null,
      cajaSesionId: contexto?.cajaSesionId ?? null,
      correlacionId: contexto?.correlacionId ?? null,
      ipAddress: clientMeta?.ipAddress ?? null,
      userAgent: clientMeta?.userAgent ?? null,
      ...detalle,
    }, transaction);
  }
}

module.exports = {
  AuditService,
  REDACTADO,
  sanitizarTextoSensible,
};
