const http = require('node:http');
const {
  generarEscPosComandaCocina,
  generarEscPosEntrega,
  generarEscPosFacturaDoble,
  generarEscPosPrueba,
} = require('./escpos');
const { despacharBuffer, listarImpresorasWindows } = require('./transports');

const HOST = '127.0.0.1';
const PORT = Number(process.env.PRINT_AGENT_PORT || 9180);
const MAX_BODY_BYTES = 256 * 1024;

const DEFAULT_ALLOWED_ORIGINS = [
  'https://pos-restaurante-gt.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:8080',
];

const EXTRA_ORIGINS = String(process.env.PRINT_AGENT_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function esOrigenPermitido(origin) {
  if (!origin) return true;
  if (DEFAULT_ALLOWED_ORIGINS.includes(origin) || EXTRA_ORIGINS.includes(origin)) {
    return true;
  }
  // Permitir previews de Vercel del mismo proyecto y localhost en cualquier puerto
  if (/^https:\/\/pos-restaurante-gt[a-z0-9-]*\.vercel\.app$/i.test(origin)) {
    return true;
  }
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    return true;
  }
  return false;
}

function aplicarCors(req, res) {
  const origin = req.headers.origin;
  if (origin && !esOrigenPermitido(origin)) {
    return false;
  }
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Requerido por Chrome/Brave para peticiones desde HTTPS (Vercel) hacia 127.0.0.1
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  return true;
}

function responderJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function leerBodyJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('El cuerpo de la solicitud excede el límite permitido.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('JSON inválido en la solicitud de impresión.'));
      }
    });
    req.on('error', reject);
  });
}

async function manejarPrint(body) {
  const destino = String(body.destino || '').toUpperCase();
  const target = body.target;
  const opciones = body.opciones || {};
  const ticket = body.ticket;

  let buffer;
  if (destino === 'CAJA') {
    if (!ticket) throw new Error('Falta el objeto ticket para imprimir Factura.');
    buffer = generarEscPosFacturaDoble(ticket, {
      copias: opciones.copias ?? 2,
      abrirGaveta: Boolean(opciones.abrirGaveta),
      columnas: opciones.columnas,
    });
  } else if (destino === 'COCINA') {
    if (!ticket) throw new Error('Falta el objeto ticket para imprimir Comanda.');
    buffer = generarEscPosComandaCocina(ticket, {
      esReimpresion: Boolean(opciones.esReimpresion),
      columnas: opciones.columnas,
    });
  } else if (destino === 'ENTREGA') {
    if (!ticket) throw new Error('Falta el objeto ticket para imprimir Entrega.');
    buffer = generarEscPosEntrega(ticket, { columnas: opciones.columnas });
  } else if (destino === 'PRUEBA') {
    buffer = generarEscPosPrueba({
      destino: opciones.etiqueta || 'PRUEBA',
      abrirGaveta: Boolean(opciones.abrirGaveta),
      columnas: opciones.columnas,
    });
  } else {
    throw new Error('Destino inválido. Usa CAJA, COCINA, ENTREGA o PRUEBA.');
  }

  await despacharBuffer(target, buffer);
  return { ok: true, bytesEnviados: buffer.length, destino };
}

function crearServidor() {
  return http.createServer(async (req, res) => {
    if (!aplicarCors(req, res)) {
      return responderJson(res, 403, { ok: false, message: 'Origen no permitido por print-agent.' });
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const urlPath = (req.url || '/').split('?')[0];

    try {
      if (req.method === 'GET' && urlPath === '/health') {
        return responderJson(res, 200, {
          ok: true,
          service: 'pos-restaurante-print-agent',
          version: '1.0.0',
          platform: process.platform,
        });
      }

      if (req.method === 'GET' && urlPath === '/printers') {
        const printers = await listarImpresorasWindows();
        return responderJson(res, 200, { ok: true, printers });
      }

      if (req.method === 'POST' && urlPath === '/print') {
        const body = await leerBodyJson(req);
        const result = await manejarPrint(body);
        return responderJson(res, 200, result);
      }

      return responderJson(res, 404, { ok: false, message: 'Ruta no encontrada.' });
    } catch (err) {
      return responderJson(res, 400, {
        ok: false,
        message: err instanceof Error ? err.message : 'Error interno al imprimir.',
      });
    }
  });
}

if (require.main === module) {
  const server = crearServidor();
  server.listen(PORT, HOST, () => {
    console.log(`[print-agent] Escuchando en http://${HOST}:${PORT}`);
    console.log('[print-agent] Listo para recibir impresiones desde POS Restaurante Guatemala.');
  });
}

module.exports = { crearServidor, esOrigenPermitido };
