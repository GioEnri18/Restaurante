const { createHash } = require('node:crypto');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../../config/database');
const { env } = require('../../config/env');
const { logger } = require('../logger');

const MAX_CLAVE_LENGTH = 250;
const DEFAULT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Limpieza oportunista cada 5 minutos

/**
 * Construye una clave determinista con prefijo que nunca excede `VARCHAR(255)`.
 * Si la clave combinada supera el límite, conserva el prefijo y resume el sufijo con SHA-256.
 */
function construirClaveStore(prefix, rawKey) {
  const pref = String(prefix ?? '');
  const key = String(rawKey ?? 'unknown');
  const completa = `${pref}${key}`;
  if (completa.length <= MAX_CLAVE_LENGTH) {
    return completa;
  }
  const hash = createHash('sha256').update(key).digest('hex');
  return `${pref}sha256:${hash}`.slice(0, MAX_CLAVE_LENGTH);
}

/**
 * Store compartido en PostgreSQL compatible con la interfaz `Store` de `express-rate-limit` v7.
 * - Ejecuta UN solo UPSERT atómico por petición usando el reloj autoritativo de PostgreSQL (`NOW()`).
 * - Respaldado por la tabla UNLOGGED `rate_limit_entries` con índice en `expira_en`.
 * - Limpieza periódica no bloqueante de ventanas vencidas (nunca retiene la respuesta HTTP).
 * - Soporta degradación controlada `RATE_LIMIT_FAIL_OPEN` (default `true`): ante fallo de BD
 *   registra el error y permite continuar la petición en lugar de tumbar login o el POS.
 */
class PostgresRateLimitStore {
  constructor(options = {}) {
    this.prefix = String(options.prefix ?? 'rl:');
    this.localKeys = false;
    this.windowMs = Number(options.windowMs ?? 60_000);
    this.failOpen = options.failOpen !== undefined ? Boolean(options.failOpen) : env.RATE_LIMIT_FAIL_OPEN;
    this.cleanupIntervalMs = Number(options.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS);
    this.queryRunner = typeof options.queryRunner === 'function'
      ? options.queryRunner
      : (sql, opts) => sequelize.query(sql, opts);
    this._ultimaLimpiezaMs = 0;
    this._limpiezaEnCurso = false;
  }

  /** Llamado automáticamente por `express-rate-limit` v7 al registrar el middleware */
  init(options) {
    if (options && Number.isFinite(Number(options.windowMs)) && Number(options.windowMs) > 0) {
      this.windowMs = Number(options.windowMs);
    }
  }

  _dispararLimpiezaPeriodica() {
    if (this.cleanupIntervalMs <= 0 || this._limpiezaEnCurso) return;
    const ahoraMs = Date.now();
    if (ahoraMs - this._ultimaLimpiezaMs < this.cleanupIntervalMs) return;

    this._ultimaLimpiezaMs = ahoraMs;
    this._limpiezaEnCurso = true;

    this.limpiarExpiradas()
      .catch((error) => {
        logger.warn(
          { evento: 'RATE_LIMIT_CLEANUP_ERROR', prefix: this.prefix, err: error?.message },
          'Error en la limpieza periódica de rate_limit_entries',
        );
      })
      .finally(() => {
        this._limpiezaEnCurso = false;
      });
  }

  /** Elimina filas cuya ventana ya expiró usando el índice `idx_rate_limit_entries_expira_en` */
  async limpiarExpiradas() {
    await this.queryRunner(
      'DELETE FROM "rate_limit_entries" WHERE "expira_en" <= NOW()',
      { type: QueryTypes.DELETE },
    );
  }

  async get(key) {
    const clave = construirClaveStore(this.prefix, key);
    try {
      const [row] = await this.queryRunner(
        `SELECT "conteo", "expira_en"
         FROM "rate_limit_entries"
         WHERE "clave" = :clave AND "expira_en" > NOW()`,
        {
          replacements: { clave },
          type: QueryTypes.SELECT,
        },
      );
      if (!row) return undefined;
      return {
        totalHits: Number(row.conteo),
        resetTime: new Date(row.expira_en),
      };
    } catch (error) {
      logger.error(
        { evento: 'RATE_LIMIT_STORE_ERROR', operacion: 'get', prefix: this.prefix, failOpen: this.failOpen, err: error?.message },
        'Error consultando rate_limit_entries en PostgreSQL',
      );
      if (this.failOpen) return undefined;
      throw error;
    }
  }

  /**
   * Incrementa el contador con UN solo UPSERT atómico en PostgreSQL.
   * Si la ventana anterior expiró (`expira_en <= NOW()`), reinicia el contador en 1
   * y establece una nueva expiración atómicamente sin condiciones de carrera.
   */
  async increment(key) {
    const clave = construirClaveStore(this.prefix, key);
    this._dispararLimpiezaPeriodica();

    try {
      const [row] = await this.queryRunner(
        `INSERT INTO "rate_limit_entries" ("clave", "conteo", "expira_en")
         VALUES (:clave, 1, NOW() + (:windowMs * INTERVAL '1 millisecond'))
         ON CONFLICT ("clave") DO UPDATE
         SET
           "conteo" = CASE
             WHEN "rate_limit_entries"."expira_en" <= NOW() THEN 1
             ELSE "rate_limit_entries"."conteo" + 1
           END,
           "expira_en" = CASE
             WHEN "rate_limit_entries"."expira_en" <= NOW() THEN NOW() + (:windowMs * INTERVAL '1 millisecond')
             ELSE "rate_limit_entries"."expira_en"
           END
         RETURNING "conteo", "expira_en"`,
        {
          replacements: { clave, windowMs: this.windowMs },
          type: QueryTypes.SELECT,
        },
      );

      return {
        totalHits: Number(row.conteo),
        resetTime: new Date(row.expira_en),
      };
    } catch (error) {
      logger.error(
        {
          evento: 'RATE_LIMIT_STORE_ERROR',
          operacion: 'increment',
          prefix: this.prefix,
          failOpen: this.failOpen,
          err: error?.message,
        },
        'Error en PostgreSQL al incrementar rate limit',
      );

      if (this.failOpen) {
        return {
          totalHits: 1,
          resetTime: new Date(Date.now() + this.windowMs),
        };
      }
      throw error;
    }
  }

  async decrement(key) {
    const clave = construirClaveStore(this.prefix, key);
    try {
      await this.queryRunner(
        `UPDATE "rate_limit_entries"
         SET "conteo" = GREATEST("conteo" - 1, 0)
         WHERE "clave" = :clave AND "expira_en" > NOW()`,
        {
          replacements: { clave },
          type: QueryTypes.UPDATE,
        },
      );
    } catch (error) {
      logger.error(
        { evento: 'RATE_LIMIT_STORE_ERROR', operacion: 'decrement', prefix: this.prefix, failOpen: this.failOpen, err: error?.message },
        'Error al decrementar rate limit en PostgreSQL',
      );
      if (!this.failOpen) throw error;
    }
  }

  async resetKey(key) {
    const clave = construirClaveStore(this.prefix, key);
    try {
      await this.queryRunner(
        'DELETE FROM "rate_limit_entries" WHERE "clave" = :clave',
        {
          replacements: { clave },
          type: QueryTypes.DELETE,
        },
      );
    } catch (error) {
      logger.error(
        { evento: 'RATE_LIMIT_STORE_ERROR', operacion: 'resetKey', prefix: this.prefix, failOpen: this.failOpen, err: error?.message },
        'Error al reiniciar clave de rate limit en PostgreSQL',
      );
      if (!this.failOpen) throw error;
    }
  }
}

module.exports = {
  PostgresRateLimitStore,
  construirClaveStore,
};
