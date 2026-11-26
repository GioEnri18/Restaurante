const { execFile } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const RAW_PRINT_SCRIPT = path.resolve(__dirname, '..', 'scripts', 'raw-print.ps1');

/**
 * Valida que la IP destino sea únicamente una IPv4 de red local privada (evita SSRF hacia internet).
 */
function esIpPrivadaValida(host) {
  if (typeof host !== 'string') return false;
  const trimmed = host.trim();
  if (net.isIP(trimmed) !== 4) return false;
  const parts = trimmed.split('.').map(Number);
  if (parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;

  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 127) return true; // 127.0.0.0/8
  return false;
}

function validarPuertoTcp(port) {
  const num = Number(port ?? 9100);
  if (!Number.isInteger(num) || num < 1 || num > 65535) {
    throw new Error('El puerto TCP de la impresora debe ser un entero entre 1 y 65535.');
  }
  return num;
}

function ejecutarPowerShell(args, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const detalle = (stderr || err.message || 'Error ejecutando PowerShell').trim();
          return reject(new Error(detalle));
        }
        return resolve(stdout);
      },
    );
  });
}

/**
 * Lista las impresoras instaladas en Windows (USB, puerto local o red agregada en Windows).
 */
async function listarImpresorasWindows() {
  if (process.platform !== 'win32') {
    return [];
  }

  const comando =
    'Get-CimInstance Win32_Printer | Select-Object Name, PortName, Default, Network | ConvertTo-Json -Compress';
  const stdout = await ejecutarPowerShell(['-Command', comando], 10_000);
  const texto = String(stdout || '').trim();
  if (!texto) return [];

  const parsed = JSON.parse(texto);
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items
    .filter((p) => p && typeof p.Name === 'string' && p.Name.trim().length > 0)
    .map((p) => ({
      nombre: p.Name.trim(),
      puerto: typeof p.PortName === 'string' ? p.PortName.trim() : '',
      predeterminada: Boolean(p.Default),
      enRed: Boolean(p.Network) || /^(IP_|TCP|WSD|\\\\)/i.test(String(p.PortName || '')),
    }))
    .sort((a, b) => Number(b.predeterminada) - Number(a.predeterminada) || a.nombre.localeCompare(b.nombre));
}

/**
 * Envía un buffer ESC/POS RAW directo al spooler de Windows por nombre de impresora (winspool.Drv).
 */
async function enviarAImpresoraWindows(nombreImpresora, buffer) {
  if (process.platform !== 'win32') {
    throw new Error('La impresión directa por nombre de Windows solo está disponible en Windows.');
  }
  const nombre = String(nombreImpresora || '').trim();
  if (!nombre || nombre.length > 200) {
    throw new Error('Nombre de impresora de Windows inválido.');
  }

  const tempFile = path.join(os.tmpdir(), `pos-gt-ticket-${crypto.randomUUID()}.bin`);
  await fs.writeFile(tempFile, buffer);
  try {
    await ejecutarPowerShell(
      ['-File', RAW_PRINT_SCRIPT, '-PrinterName', nombre, '-FilePath', tempFile],
      15_000,
    );
  } finally {
    await fs.unlink(tempFile).catch(() => {});
  }
}

/**
 * Envía un buffer ESC/POS directo por TCP/IP a una impresora térmica en red local (puerto 9100).
 */
function enviarAImpresoraRed(host, port, buffer, timeoutMs = 5_000) {
  const ip = String(host || '').trim();
  if (!esIpPrivadaValida(ip)) {
    return Promise.reject(
      new Error('Solo se permiten direcciones IPv4 privadas de red local (ej. 192.168.1.50).'),
    );
  }
  const puerto = validarPuertoTcp(port);

  return new Promise((resolve, reject) => {
    let terminado = false;
    const finalizar = (err) => {
      if (terminado) return;
      terminado = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    const socket = net.createConnection({ host: ip, port: puerto });
    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      socket.write(buffer, (writeErr) => {
        if (writeErr) return finalizar(writeErr);
        socket.end();
      });
    });

    socket.on('close', (hadError) => {
      if (!hadError) finalizar();
    });
    socket.on('timeout', () => {
      finalizar(new Error(`Tiempo agotado conectando a la impresora de red ${ip}:${puerto}.`));
    });
    socket.on('error', (err) => {
      finalizar(new Error(`No se pudo conectar a ${ip}:${puerto}: ${err.message}`));
    });
  });
}

async function despacharBuffer(target, buffer) {
  if (!target || typeof target !== 'object') {
    throw new Error('Debes indicar la impresora de destino.');
  }
  if (target.tipo === 'windows') {
    await enviarAImpresoraWindows(target.nombre, buffer);
    return;
  }
  if (target.tipo === 'tcp') {
    await enviarAImpresoraRed(target.host, target.port ?? 9100, buffer);
    return;
  }
  throw new Error('Tipo de impresora no soportado (usa "windows" o "tcp").');
}

module.exports = {
  esIpPrivadaValida,
  validarPuertoTcp,
  listarImpresorasWindows,
  enviarAImpresoraWindows,
  enviarAImpresoraRed,
  despacharBuffer,
};
