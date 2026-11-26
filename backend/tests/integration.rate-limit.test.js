const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const { QueryTypes } = require('sequelize');

const { connectDatabase, disconnectDatabase, sequelize } = require('../src/config/database');
const { crearRateLimiter, obtenerIpCliente } = require('../src/middlewares/rateLimiter');
const { PostgresRateLimitStore } = require('../src/shared/services/postgres-rate-limit.store');

/**
 * Suite de integración Fase 3: Rate limiting compartido en PostgreSQL (`rate_limit_entries` UNLOGGED).
 * - Corre bajo `pos_app_rol` (verifica privilegios SELECT/INSERT/UPDATE/DELETE en `rate_limit_entries`).
 * - Prueba estado compartido entre 2 instancias independientes, concurrencia atómica,
 *   expiración de ventana, limpieza de filas vencidas, anti-spoofing X-Forwarded-For y `RATE_LIMIT_FAIL_OPEN`.
 */
const RUN_TAG = `${Date.now().toString(36).slice(-5)}${crypto.randomBytes(2).toString('hex')}`;

async function levantarAppConLimiter(options) {
  const { trustProxy = false, ...limiterOpts } = options;
  const app = express();
  app.set('trust proxy', trustProxy);
  const limiter = crearRateLimiter({
    storeType: 'postgres',
    cleanupIntervalMs: 0,
    message: { ok: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Límite excedido' } },
    ...limiterOpts,
  });
  app.get('/recurso', limiter, (req, res) => {
    res.status(200).json({ ok: true, ip: obtenerIpCliente(req) });
  });
  app.use((err, _req, res, _next) => {
    res.status(500).json({ ok: false, error: { code: 'STORE_ERROR', message: err.message } });
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

describe('Rate limiting compartido en PostgreSQL (pos_app_rol + tabla UNLOGGED)', () => {
  before(async () => {
    await connectDatabase();
  });

  after(async () => {
    // Limpieza únicamente de las claves QA creadas en esta ejecución
    await sequelize.query('DELETE FROM "rate_limit_entries" WHERE "clave" LIKE :patron', {
      replacements: { patron: `qa:${RUN_TAG}:%` },
      type: QueryTypes.DELETE,
    });
    await disconnectDatabase();
  });

  it('comparte contadores entre dos instancias independientes y aísla prefijos distintos', async () => {
    const prefixCompartido = `qa:${RUN_TAG}:shared:`;
    const prefixAislado = `qa:${RUN_TAG}:other:`;

    const instanciaA = await levantarAppConLimiter({
      prefix: prefixCompartido,
      windowMs: 60_000,
      max: 2,
    });
    const instanciaB = await levantarAppConLimiter({
      prefix: prefixCompartido,
      windowMs: 60_000,
      max: 2,
    });
    const instanciaOtraRuta = await levantarAppConLimiter({
      prefix: prefixAislado,
      windowMs: 60_000,
      max: 2,
    });

    try {
      const r1 = await fetch(`${instanciaA.baseUrl}/recurso`);
      const r2 = await fetch(`${instanciaB.baseUrl}/recurso`);
      const r3 = await fetch(`${instanciaA.baseUrl}/recurso`);
      const r4 = await fetch(`${instanciaB.baseUrl}/recurso`);
      const rOtro = await fetch(`${instanciaOtraRuta.baseUrl}/recurso`);

      assert.equal(r1.status, 200);
      assert.equal(r2.status, 200);
      assert.equal(r3.status, 429, 'Instancia A debe ver el conteo acumulado por Instancia B');
      assert.equal(r4.status, 429, 'Instancia B también debe bloquear al alcanzar el límite compartido');
      assert.equal(rOtro.status, 200, 'Otro limitador con distinto prefix no debe colisionar');
    } finally {
      await Promise.all([instanciaA.close(), instanciaB.close(), instanciaOtraRuta.close()]);
    }
  });

  it('garantiza atomicidad bajo concurrencia (10 peticiones paralelas con límite 4 -> 4 OK y 6 429)', async () => {
    const prefix = `qa:${RUN_TAG}:conc:`;
    const srv = await levantarAppConLimiter({
      prefix,
      windowMs: 60_000,
      max: 4,
    });

    try {
      const respuestas = await Promise.all(
        Array.from({ length: 10 }, () => fetch(`${srv.baseUrl}/recurso`)),
      );
      const codigos = respuestas.map((r) => r.status);
      const exitosas = codigos.filter((c) => c === 200).length;
      const limitadas = codigos.filter((c) => c === 429).length;

      assert.equal(exitosas, 4, `Esperadas exactamente 4 exitosas, llegaron: ${JSON.stringify(codigos)}`);
      assert.equal(limitadas, 6, `Esperadas exactamente 6 con 429, llegaron: ${JSON.stringify(codigos)}`);
    } finally {
      await srv.close();
    }
  });

  it('reinicia automáticamente la ventana al expirar y limpia filas vencidas sin borrar las vigentes', async () => {
    const storeCorto = new PostgresRateLimitStore({
      prefix: `qa:${RUN_TAG}:exp:`,
      windowMs: 250,
      cleanupIntervalMs: 0,
    });
    const storeLargo = new PostgresRateLimitStore({
      prefix: `qa:${RUN_TAG}:keep:`,
      windowMs: 60_000,
      cleanupIntervalMs: 0,
    });

    const hit1 = await storeCorto.increment('cliente-1');
    const hit2 = await storeCorto.increment('cliente-1');
    assert.equal(hit1.totalHits, 1);
    assert.equal(hit2.totalHits, 2);

    // Probar decrement y get
    await storeCorto.decrement('cliente-1');
    const actual = await storeCorto.get('cliente-1');
    assert.equal(actual?.totalHits, 1);

    // Crear una entrada con ventana larga que debe sobrevivir la limpieza
    await storeLargo.increment('cliente-vigente');

    // Esperar expiración de la ventana de 250ms
    await new Promise((resolve) => setTimeout(resolve, 350));

    // limpiarExpiradas elimina la clave vencida y conserva la vigente
    await storeCorto.limpiarExpiradas();
    assert.equal(await storeCorto.get('cliente-1'), undefined);
    assert.equal((await storeLargo.get('cliente-vigente'))?.totalHits, 1);

    // Al volver a incrementar tras expirar, reinicia atómicamente en 1
    const reinicio = await storeCorto.increment('cliente-1');
    assert.equal(reinicio.totalHits, 1);

    // resetKey elimina explícitamente la clave
    await storeCorto.resetKey('cliente-1');
    assert.equal(await storeCorto.get('cliente-1'), undefined);
  });

  it('degrada permitiendo peticiones si PostgreSQL falla con failOpen=true y rechaza con failOpen=false', async () => {
    const queryRota = async () => {
      throw new Error('DB_UNAVAILABLE_QA');
    };

    const srvOpen = await levantarAppConLimiter({
      prefix: `qa:${RUN_TAG}:open:`,
      windowMs: 60_000,
      max: 2,
      failOpen: true,
      queryRunner: queryRota,
    });
    const srvClosed = await levantarAppConLimiter({
      prefix: `qa:${RUN_TAG}:closed:`,
      windowMs: 60_000,
      max: 2,
      failOpen: false,
      queryRunner: queryRota,
    });

    try {
      const rOpen = await fetch(`${srvOpen.baseUrl}/recurso`);
      assert.equal(rOpen.status, 200, 'Con failOpen=true, una caída del store no debe tumbar la ruta');

      const rClosed = await fetch(`${srvClosed.baseUrl}/recurso`);
      assert.equal(rClosed.status, 500, 'Con failOpen=false, una caída del store debe propagar el error');
    } finally {
      await Promise.all([srvOpen.close(), srvClosed.close()]);
    }
  });

  it('anti-spoofing X-Forwarded-For con TRUST_PROXY=false, 1 (Render directo) y 2 (Vercel -> Render)', async () => {
    const srvNoProxy = await levantarAppConLimiter({
      trustProxy: false,
      prefix: `qa:${RUN_TAG}:tp0:`,
      windowMs: 60_000,
      max: 2,
    });
    const srvRender = await levantarAppConLimiter({
      trustProxy: 1,
      prefix: `qa:${RUN_TAG}:tp1:`,
      windowMs: 60_000,
      max: 2,
    });
    const srvVercelRender = await levantarAppConLimiter({
      trustProxy: 2,
      prefix: `qa:${RUN_TAG}:tp2:`,
      windowMs: 60_000,
      max: 2,
    });

    try {
      // 1. TRUST_PROXY=false: rotar X-Forwarded-For NO evade el límite
      const a1 = await fetch(`${srvNoProxy.baseUrl}/recurso`, { headers: { 'X-Forwarded-For': '1.1.1.1' } });
      const a2 = await fetch(`${srvNoProxy.baseUrl}/recurso`, { headers: { 'X-Forwarded-For': '2.2.2.2' } });
      const a3 = await fetch(`${srvNoProxy.baseUrl}/recurso`, { headers: { 'X-Forwarded-For': '3.3.3.3' } });
      assert.equal(a1.status, 200);
      assert.equal((await a1.json()).ip, '127.0.0.1');
      assert.equal(a2.status, 200);
      assert.equal(a3.status, 429);

      // 2. TRUST_PROXY=1 (Render directo): ignora IPs falsificadas a la izquierda
      const b1 = await fetch(`${srvRender.baseUrl}/recurso`, {
        headers: { 'X-Forwarded-For': '198.51.100.1, 203.0.113.10' },
      });
      const b2 = await fetch(`${srvRender.baseUrl}/recurso`, {
        headers: { 'X-Forwarded-For': '198.51.100.2, 203.0.113.10' },
      });
      const b3 = await fetch(`${srvRender.baseUrl}/recurso`, {
        headers: { 'X-Forwarded-For': '198.51.100.3, 203.0.113.10' },
      });
      assert.equal(b1.status, 200);
      assert.equal((await b1.json()).ip, '203.0.113.10');
      assert.equal(b2.status, 200);
      assert.equal(b3.status, 429);

      // 3. TRUST_PROXY=2 (Vercel -> Render): extrae IP cliente tras 2 saltos y separa clientes distintos
      const c1 = await fetch(`${srvVercelRender.baseUrl}/recurso`, {
        headers: { 'X-Forwarded-For': '198.51.100.9, 203.0.113.20, 76.76.21.1' },
      });
      const c2 = await fetch(`${srvVercelRender.baseUrl}/recurso`, {
        headers: { 'X-Forwarded-For': '198.51.100.8, 203.0.113.20, 76.76.21.99' },
      });
      const c3 = await fetch(`${srvVercelRender.baseUrl}/recurso`, {
        headers: { 'X-Forwarded-For': '198.51.100.7, 203.0.113.20, 76.76.21.55' },
      });
      const cOtro = await fetch(`${srvVercelRender.baseUrl}/recurso`, {
        headers: { 'X-Forwarded-For': '203.0.113.21, 76.76.21.55' },
      });
      assert.equal(c1.status, 200);
      assert.equal((await c1.json()).ip, '203.0.113.20');
      assert.equal(c2.status, 200);
      assert.equal(c3.status, 429);
      assert.equal(cOtro.status, 200);
      assert.equal((await cOtro.json()).ip, '203.0.113.21');
    } finally {
      await Promise.all([srvNoProxy.close(), srvRender.close(), srvVercelRender.close()]);
    }
  });
});
