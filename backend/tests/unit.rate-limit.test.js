const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { crearRateLimiter, obtenerIpCliente } = require('../src/middlewares/rateLimiter');
const {
  PostgresRateLimitStore,
  construirClaveStore,
} = require('../src/shared/services/postgres-rate-limit.store');

describe('Pruebas unitarias de rate limiting compartido e IP real (sin base de datos ni sockets)', () => {
  it('construirClaveStore respeta el prefijo y acota claves muy largas con SHA-256 sin exceder 255 caracteres', () => {
    assert.equal(construirClaveStore('auth:login:ip:', '198.51.100.1'), 'auth:login:ip:198.51.100.1');
    const claveLarga = construirClaveStore('auth:login:id:', 'a'.repeat(500));
    assert.ok(claveLarga.startsWith('auth:login:id:sha256:'));
    assert.ok(claveLarga.length <= 250);
  });

  it('obtenerIpCliente normaliza IPv4 mapeadas en IPv6 e ignora encabezados no procesados por Express', () => {
    assert.equal(obtenerIpCliente({ ip: '::ffff:203.0.113.5' }), '203.0.113.5');
    assert.equal(
      obtenerIpCliente({
        ip: '127.0.0.1',
        headers: { 'x-forwarded-for': '198.51.100.99' },
      }),
      '127.0.0.1',
    );
  });

  it('crearRateLimiter exige un prefijo único por limitador', () => {
    assert.throws(() => crearRateLimiter({ windowMs: 1000, max: 5 }), /prefix/i);
  });

  it('PostgresRateLimitStore degrada con RATE_LIMIT_FAIL_OPEN=true y falla cerrado con false', async () => {
    const queryFallida = async () => {
      throw new Error('PG_CONNECTION_LOST');
    };

    const storeFailOpen = new PostgresRateLimitStore({
      prefix: 'unit:failopen:',
      windowMs: 30_000,
      failOpen: true,
      queryRunner: queryFallida,
      cleanupIntervalMs: 0,
    });
    const res = await storeFailOpen.increment('198.51.100.1');
    assert.equal(res.totalHits, 1);
    assert.ok(res.resetTime instanceof Date);
    assert.equal(await storeFailOpen.get('198.51.100.1'), undefined);
    await assert.doesNotReject(() => storeFailOpen.decrement('198.51.100.1'));
    await assert.doesNotReject(() => storeFailOpen.resetKey('198.51.100.1'));

    const storeFailClosed = new PostgresRateLimitStore({
      prefix: 'unit:failclosed:',
      windowMs: 30_000,
      failOpen: false,
      queryRunner: queryFallida,
      cleanupIntervalMs: 0,
    });
    await assert.rejects(() => storeFailClosed.increment('198.51.100.1'), /PG_CONNECTION_LOST/);
    await assert.rejects(() => storeFailClosed.get('198.51.100.1'), /PG_CONNECTION_LOST/);
  });
});
