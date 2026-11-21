const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { ACCIONES_AUDITORIA } = require('../config/constants');
const { withTransaction } = require('../config/database');
const { PLATILLOS_MEDIA_DIR, PLATILLOS_MEDIA_URL, NOMBRE_FOTO_PLATILLO } = require('../config/platillos-media');
const { Platillo } = require('../models');
const { BadRequestError, NotFoundError } = require('../shared/errors/AppError');
const { logger } = require('../shared/logger');
const { AuditService } = require('../shared/services/audit.service');

const MAX_BYTES = 10000;
const MAX_PIXELES_ORIGINAL = 20000000;
const FORMATOS = new Set(['jpeg', 'png', 'webp']);
const FIRMA_PNG = Buffer.from('89504e470d0a1a0a', 'hex');

async function convertirFoto(original) {
  const firmaValida = original.subarray(0, 3).toString('hex') === 'ffd8ff'
    || original.subarray(0, 8).equals(FIRMA_PNG)
    || (original.toString('ascii', 0, 4) === 'RIFF' && original.toString('ascii', 8, 12) === 'WEBP');
  if (!firmaValida) throw new BadRequestError('Usa una foto JPG, PNG o WebP sin animación');
  try {
    const imagen = sharp(original, { limitInputPixels: MAX_PIXELES_ORIGINAL, failOn: 'warning' });
    const datos = await imagen.metadata();
    if (!FORMATOS.has(datos.format) || (datos.pages ?? 1) !== 1) {
      throw new BadRequestError('Usa una foto JPG, PNG o WebP sin animación');
    }

    // Decodifica una vez y descarta metadatos antes de probar tamaños y compresión.
    const { data, info } = await imagen.autoOrient()
      .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).removeAlpha().toColourspace('srgb')
      .raw().toBuffer({ resolveWithObject: true });
    const ladoOriginal = Math.max(info.width, info.height);
    const lados = new Set([480, 320, 220, 150, 100, 64].map((lado) => Math.min(lado, ladoOriginal)));
    for (const lado of lados) {
      const webp = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
        .resize(lado, lado, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 38 })
        .toBuffer();
      if (webp.length <= MAX_BYTES) return webp;
    }
  } catch (error) {
    if (error instanceof BadRequestError) throw error;
    throw new BadRequestError('El archivo no es una imagen válida o supera los 20 megapíxeles');
  }
  throw new BadRequestError('No se pudo reducir la foto al máximo de 10 KB');
}

async function eliminarFotoSinReferencias(url) {
  const prefijo = `${PLATILLOS_MEDIA_URL}/`;
  if (typeof url !== 'string' || !url.startsWith(prefijo)) return;
  const nombre = url.slice(prefijo.length);
  if (!NOMBRE_FOTO_PLATILLO.test(nombre)) return;
  try {
    if (!(await Platillo.count({ where: { imagenUrl: url } }))) {
      await fs.rm(path.join(PLATILLOS_MEDIA_DIR, nombre), { force: true });
    }
  } catch (error) {
    logger.warn({ err: error, foto: nombre }, 'No se pudo limpiar una foto de platillo');
  }
}

async function guardarFotoPlatillo(user, platilloId, original, clientMeta) {
  const webp = await convertirFoto(original);
  const nombre = `${randomUUID()}.webp`;
  const ruta = path.join(PLATILLOS_MEDIA_DIR, nombre);
  const temporal = `${ruta}.tmp`;
  const imagenUrl = `${PLATILLOS_MEDIA_URL}/${nombre}`;
  let publicada = false;
  try {
    const anterior = await withTransaction(async (tx) => {
      const platillo = await Platillo.findOne({
        where: { id: platilloId, sucursalId: user.sucursalId },
        lock: tx.LOCK.UPDATE,
        transaction: tx,
      });
      if (!platillo) throw new NotFoundError('Platillo no encontrado');
      const previa = platillo.imagenUrl;
      await fs.mkdir(PLATILLOS_MEDIA_DIR, { recursive: true });
      await fs.writeFile(temporal, webp, { flag: 'wx' });
      await fs.rename(temporal, ruta);
      publicada = true;
      await platillo.update({ imagenUrl }, { transaction: tx });
      await AuditService.registrar({
        sucursalId: user.sucursalId,
        usuarioId: user.id,
        accion: ACCIONES_AUDITORIA.CAMBIO_FOTO_PLATILLO,
        entidad: 'Platillo',
        entidadId: platillo.id,
        valorAnterior: { imagenUrl: previa },
        valorNuevo: { imagenUrl, bytes: webp.length },
        motivo: 'Actualización de foto del catálogo',
        ipAddress: clientMeta.ipAddress,
        userAgent: clientMeta.userAgent,
      }, tx);
      return previa;
    });
    await eliminarFotoSinReferencias(anterior);
    return { imagenUrl, bytes: webp.length };
  } catch (error) {
    await fs.rm(temporal, { force: true }).catch((err) => {
      logger.warn({ err, foto: nombre }, 'No se pudo limpiar la foto temporal');
    });
    if (publicada) await eliminarFotoSinReferencias(imagenUrl);
    throw error;
  }
}

module.exports = { guardarFotoPlatillo };
