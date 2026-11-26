const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const sharp = require('sharp');
const { QueryTypes } = require('sequelize');

const { ACCIONES_AUDITORIA } = require('../src/config/constants');
const {
  connectDatabase,
  disconnectDatabase,
  sequelize,
  verificarPrivilegiosRolRuntime,
} = require('../src/config/database');
const { env } = require('../src/config/env');
const { PLATILLOS_MEDIA_BASE_DIR } = require('../src/config/platillos-media');
const {
  AuditoriaLog,
  Categoria,
  Platillo,
  PlatilloFoto,
  Rol,
  Sucursal,
  Usuario,
} = require('../src/models');
const { createApp } = require('../src/app');
const { migrarFotosLocalesABd } = require('../src/database/migrarFotosABd');
const { guardarFotoPlatillo } = require('../src/services/fotos-platillos.service');
const { AuditService } = require('../src/shared/services/audit.service');

/**
 * Suite de integración Fase 5: Despliegue seguro y persistente.
 * - Corre bajo `pos_app_rol` (usuario de mínimo privilegio).
 * - Prueba:
 *   1. Aislamiento real de `auditoria_logs` (UPDATE y DELETE fallan bajo `pos_app_rol`)
 *      y `verificarPrivilegiosRolRuntime()` confirma que el rol no está sobreprivilegiado.
 *   2. Almacenamiento persistente de fotos en BD (`MEDIA_STORAGE=db`): subir, servir HTTP 200
 *      con ETag/Cache-Control, respuesta 304 Not Modified con If-None-Match, reemplazo con
 *      limpieza automática de la foto anterior sin referencias y fallback a fotos base.
 *   3. Idempotencia del script `migrarFotosLocalesABd` desde disco local a `platillo_fotos`.
 */
const CLIENT_META = { ipAddress: '127.0.0.1', userAgent: 'qa-fase5/1.0' };
const RUN_TAG = `${Date.now().toString(36).slice(-5)}${crypto.randomBytes(2).toString('hex')}`.toUpperCase();

async function crearPngPrueba(r, g, b) {
  return sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r, g, b },
    },
  })
    .png()
    .toBuffer();
}

describe('Despliegue seguro y persistente (pos_app_rol + MEDIA_STORAGE=db)', () => {
  const origMediaStorage = env.MEDIA_STORAGE;
  let ephemeralServer = null;
  let baseUrl = '';
  let sucursal;
  let adminActor;
  let platillo;
  const nombresFotosLimpiar = [];

  before(async () => {
    await connectDatabase();

    const app = createApp();
    await new Promise((resolve) => {
      ephemeralServer = app.listen(0, '127.0.0.1', () => {
        const { port } = ephemeralServer.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    sucursal = await Sucursal.create({
      codigo: `QA-F5-${RUN_TAG}`.slice(0, 20),
      nombre: `Sucursal Fase 5 ${RUN_TAG}`,
      nit: '1234567-8',
      direccion: 'Zona 10, Guatemala',
      serieFactura: `F5${RUN_TAG.slice(-3)}`,
      activa: true,
    });

    const rolAdmin = await Rol.findOne({ where: { codigo: env.ADMIN_ROLE_CODE, activo: true } });
    assert.ok(rolAdmin, 'Debe existir el rol ADMIN');
    const usuario = await Usuario.create({
      sucursalId: sucursal.id,
      rolId: rolAdmin.id,
      nombreCompleto: `QA Fase5 ${RUN_TAG}`,
      username: `qa_f5_${RUN_TAG}`.toLowerCase(),
      email: `qa_f5_${RUN_TAG}@pos-qa.gt`.toLowerCase(),
      passwordHash: await bcrypt.hash('QaFase52026!', 8),
      activo: true,
    });
    adminActor = {
      id: usuario.id,
      sucursalId: sucursal.id,
      rolId: rolAdmin.id,
      rolCodigo: rolAdmin.codigo,
      rol: { id: rolAdmin.id, codigo: rolAdmin.codigo },
    };

    const categoria = await Categoria.create({
      sucursalId: sucursal.id,
      nombre: `Cat F5 ${RUN_TAG}`,
      orden: 1,
      activa: true,
    });

    platillo = await Platillo.create({
      sucursalId: sucursal.id,
      categoriaId: categoria.id,
      sku: `F5-PLT-${RUN_TAG}`.slice(0, 25),
      nombre: `Platillo Foto DB ${RUN_TAG}`,
      precioVenta: 55,
      disponible: true,
      activo: true,
    });
  });

  after(async () => {
    env.MEDIA_STORAGE = origMediaStorage;
    if (nombresFotosLimpiar.length > 0) {
      await PlatilloFoto.destroy({ where: { nombre: nombresFotosLimpiar } }).catch(() => {});
    }
    if (ephemeralServer) {
      await new Promise((resolve) => ephemeralServer.close(resolve));
    }
    await disconnectDatabase();
  });

  it('verifica mínimo privilegio (pos_app_rol) y prueba que UPDATE y DELETE sobre auditoria_logs fallan', async () => {
    const info = await verificarPrivilegiosRolRuntime({
      log: { warn: () => {} },
      entorno: 'production',
    });
    assert.ok(info, 'Debe inspeccionar el rol de PostgreSQL');
    assert.equal(info.esMiembroAppRol, true, 'La API de pruebas debe correr como miembro de pos_app_rol');
    assert.equal(info.esSuperusuario, false);
    assert.equal(info.puedeActualizarAuditoria, false);
    assert.equal(info.puedeBorrarAuditoria, false);
    assert.equal(info.sobreprivilegiado, false);

    // Insertar un evento válido y probar que UPDATE y DELETE sobre auditoria_logs son rechazados por PostgreSQL
    await AuditService.registrarEvento(
      { user: adminActor, clientMeta: CLIENT_META },
      {
        accion: ACCIONES_AUDITORIA.CAMBIO_FOTO_PLATILLO,
        entidad: 'Platillo',
        entidadId: platillo.id,
        valorNuevo: { pruebaInmutabilidad: RUN_TAG },
        motivo: 'Verificación append-only bajo pos_app_rol',
      },
    );

    const fila = await AuditoriaLog.findOne({
      where: { sucursalId: sucursal.id },
      order: [['id', 'DESC']],
    });
    assert.ok(fila);

    await assert.rejects(
      () =>
        sequelize.query(
          'UPDATE "auditoria_logs" SET "motivo" = \'alterado\' WHERE "id" = :id',
          { replacements: { id: fila.id }, type: QueryTypes.UPDATE },
        ),
      /permission denied|inmutable|append-only/i,
      'UPDATE en auditoria_logs debe fallar bajo pos_app_rol',
    );

    await assert.rejects(
      () =>
        sequelize.query(
          'DELETE FROM "auditoria_logs" WHERE "id" = :id',
          { replacements: { id: fila.id }, type: QueryTypes.DELETE },
        ),
      /permission denied|inmutable|append-only/i,
      'DELETE en auditoria_logs debe fallar bajo pos_app_rol',
    );
  });

  it('MEDIA_STORAGE=db guarda, sirve con ETag/304, reemplaza borrando la anterior y conserva fallback a fotos base', async () => {
    env.MEDIA_STORAGE = 'db';

    // 1. Subir primera foto (roja)
    const pngRojo = await crearPngPrueba(220, 40, 40);
    const guardada1 = await guardarFotoPlatillo(adminActor, platillo.id, pngRojo, CLIENT_META);
    assert.ok(guardada1.imagenUrl.startsWith('/media/platillos/'));
    assert.ok(guardada1.sha256 && guardada1.sha256.length === 64);
    const nombre1 = guardada1.imagenUrl.split('/').pop();
    nombresFotosLimpiar.push(nombre1);

    // 2. Servir por HTTP -> 200 con ETag y Cache-Control inmutable
    const res1 = await fetch(`${baseUrl}${guardada1.imagenUrl}`);
    assert.equal(res1.status, 200);
    assert.equal(res1.headers.get('content-type'), 'image/webp');
    assert.equal(res1.headers.get('etag'), `"${guardada1.sha256}"`);
    assert.ok(res1.headers.get('cache-control')?.includes('immutable'));
    const bytes1 = Buffer.from(await res1.arrayBuffer());
    assert.equal(bytes1.length, guardada1.bytes);

    // 3. Petición condicional If-None-Match -> 304 Not Modified sin cuerpo
    const res304 = await fetch(`${baseUrl}${guardada1.imagenUrl}`, {
      headers: { 'If-None-Match': `"${guardada1.sha256}"` },
    });
    assert.equal(res304.status, 304);
    assert.equal((await res304.text()).length, 0);

    // 4. Reemplazar foto del mismo platillo (azul) -> elimina la anterior sin referencias
    const pngAzul = await crearPngPrueba(30, 80, 220);
    const guardada2 = await guardarFotoPlatillo(adminActor, platillo.id, pngAzul, CLIENT_META);
    const nombre2 = guardada2.imagenUrl.split('/').pop();
    nombresFotosLimpiar.push(nombre2);
    assert.notEqual(nombre2, nombre1);

    const resAnterior = await fetch(`${baseUrl}${guardada1.imagenUrl}`);
    assert.equal(resAnterior.status, 404, 'La foto anterior sin referencias debe eliminarse de platillo_fotos');

    const resNueva = await fetch(`${baseUrl}${guardada2.imagenUrl}`);
    assert.equal(resNueva.status, 200);
    assert.equal(resNueva.headers.get('etag'), `"${guardada2.sha256}"`);

    // 5. Fallback a PLATILLOS_MEDIA_BASE_DIR si el archivo pertenece al menú base precargado
    const archivosBase = await fs.readdir(PLATILLOS_MEDIA_BASE_DIR).catch(() => []);
    const webpBase = archivosBase.find((f) => f.endsWith('.webp'));
    if (webpBase) {
      const resBase = await fetch(`${baseUrl}/media/platillos/${webpBase}`);
      assert.equal(resBase.status, 200, 'Debe hacer fallback a PLATILLOS_MEDIA_BASE_DIR cuando no está en BD');
    }
  });

  it('migrarFotosLocalesABd migra archivos WebP locales a platillo_fotos de forma idempotente', async () => {
    env.MEDIA_STORAGE = 'db';
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pos-fotos-mig-'));
    const nombreUuid = `${crypto.randomUUID()}.webp`;
    nombresFotosLimpiar.push(nombreUuid);

    try {
      const webpBuffer = await sharp({
        create: { width: 40, height: 40, channels: 3, background: { r: 20, g: 160, b: 90 } },
      })
        .webp({ quality: 50 })
        .toBuffer();
      await fs.writeFile(path.join(tempDir, nombreUuid), webpBuffer);

      const primera = await migrarFotosLocalesABd({
        directorios: [tempDir],
        log: { info: () => {} },
      });
      assert.equal(primera.insertadas, 1);
      assert.equal(primera.omitidas, 0);

      // Segunda ejecución idempotente: 0 insertadas, 1 omitida
      const segunda = await migrarFotosLocalesABd({
        directorios: [tempDir],
        log: { info: () => {} },
      });
      assert.equal(segunda.insertadas, 0);
      assert.equal(segunda.omitidas, 1);

      const resHttp = await fetch(`${baseUrl}/media/platillos/${nombreUuid}`);
      assert.equal(resHttp.status, 200);
      assert.equal(resHttp.headers.get('content-type'), 'image/webp');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
