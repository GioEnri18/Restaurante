/**
 * Generador ESC/POS para impresoras térmicas de 80 mm (48 columnas).
 * - Soporta acentos/Ñ en español (CP858 / código de página 19).
 * - Pulso de gaveta de efectivo (ESC p) exclusivamente cuando abrirGaveta === true.
 * - Corte automático (GS V 66 3) al final de cada hoja.
 */

const ESC = 0x1b;
const GS = 0x1d;

const CMD = {
  INIT: Buffer.from([ESC, 0x40]),
  CODEPAGE_CP858: Buffer.from([ESC, 0x74, 19]),
  ALIGN_LEFT: Buffer.from([ESC, 0x61, 0]),
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 1]),
  BOLD_ON: Buffer.from([ESC, 0x45, 1]),
  BOLD_OFF: Buffer.from([ESC, 0x45, 0]),
  SIZE_NORMAL: Buffer.from([GS, 0x21, 0x00]),
  SIZE_DOUBLE_H: Buffer.from([GS, 0x21, 0x01]),
  SIZE_DOUBLE_WH: Buffer.from([GS, 0x21, 0x11]),
  // Pulso estándar para gaveta RJ11 conectada al pin 2 (gaveta #1)
  OPEN_DRAWER_PIN2: Buffer.from([ESC, 0x70, 0x00, 0x19, 0xfa]),
  FEED_AND_PARTIAL_CUT: Buffer.from([0x0a, 0x0a, 0x0a, GS, 0x56, 0x42, 0x03]),
};

const CP858_MAP = {
  'á': 0xa0,
  'é': 0x82,
  'í': 0xa1,
  'ó': 0xa2,
  'ú': 0xa3,
  'ü': 0x81,
  'ñ': 0xa4,
  'Á': 0xb5,
  'É': 0x90,
  'Í': 0xd6,
  'Ó': 0xe0,
  'Ú': 0xe9,
  'Ü': 0x9a,
  'Ñ': 0xa5,
  '¡': 0xad,
  '¿': 0xa8,
  '·': 0xfa,
  '—': 0x2d,
  '–': 0x2d,
  '°': 0xf8,
};

function encodeCp858(texto) {
  const str = String(texto ?? '');
  const bytes = [];
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if (code >= 0x20 && code <= 0x7e) {
      bytes.push(code);
    } else if (ch === '\n' || ch === '\r') {
      bytes.push(0x0a);
    } else if (Object.prototype.hasOwnProperty.call(CP858_MAP, ch)) {
      bytes.push(CP858_MAP[ch]);
    } else {
      // Quitar diacríticos desconocidos y reemplazar por ASCII imprimible
      const norm = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      for (const nch of norm) {
        const nc = nch.charCodeAt(0);
        bytes.push(nc >= 0x20 && nc <= 0x7e ? nc : 0x20);
      }
    }
  }
  return Buffer.from(bytes);
}

function linea(texto = '') {
  return encodeCp858(`${texto}\n`);
}

function separador(columnas = 48, char = '-') {
  return linea(char.repeat(columnas));
}

function formatearMoneda(monto) {
  const num = Number(monto ?? 0);
  const valor = Number.isFinite(num) ? num : 0;
  return `Q ${valor.toFixed(2)}`;
}

function formatearFechaHora(iso) {
  if (!iso) return '';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return String(iso);
  try {
    return new Intl.DateTimeFormat('es-GT', {
      timeZone: 'America/Guatemala',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(fecha);
  } catch {
    return fecha.toISOString().slice(0, 16).replace('T', ' ');
  }
}

function dividirTexto(texto, ancho) {
  const palabras = String(texto ?? '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [''];
  const lineas = [];
  let actual = '';
  for (const palabra of palabras) {
    if (!actual) {
      actual = palabra;
    } else if (actual.length + 1 + palabra.length <= ancho) {
      actual = `${actual} ${palabra}`;
    } else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

function parColumnas(izq, der, columnas = 48) {
  const derecha = String(der ?? '');
  const maxIzq = Math.max(10, columnas - derecha.length - 1);
  const lineasIzq = dividirTexto(izq, maxIzq);
  const salida = [];
  lineasIzq.forEach((l, idx) => {
    if (idx === 0) {
      const espacios = Math.max(1, columnas - l.length - derecha.length);
      salida.push(linea(`${l}${' '.repeat(espacios)}${derecha}`));
    } else {
      salida.push(linea(l));
    }
  });
  return Buffer.concat(salida);
}

function generarEscPosFactura(ticket, opciones = {}) {
  const columnas = Number(opciones.columnas) || 48;
  const abrirGaveta = Boolean(opciones.abrirGaveta);
  const etiquetaCopia = opciones.etiquetaCopia ? String(opciones.etiquetaCopia) : '';
  const chunks = [CMD.INIT, CMD.CODEPAGE_CP858];

  if (abrirGaveta) {
    chunks.push(CMD.OPEN_DRAWER_PIN2);
  }

  // Encabezado centrado
  chunks.push(CMD.ALIGN_CENTER, CMD.BOLD_ON);
  chunks.push(linea((ticket.sucursal?.nombre || 'POS RESTAURANTE').toUpperCase()));
  chunks.push(CMD.BOLD_OFF);
  if (ticket.sucursal?.nit) chunks.push(linea(`NIT: ${ticket.sucursal.nit}`));
  if (ticket.sucursal?.direccion) {
    for (const l of dividirTexto(ticket.sucursal.direccion, columnas)) {
      chunks.push(linea(l));
    }
  }
  if (ticket.sucursal?.telefono) chunks.push(linea(`Tel: ${ticket.sucursal.telefono}`));

  chunks.push(linea(''));
  chunks.push(CMD.BOLD_ON);
  const reimp = Number(ticket.factura?.reimpresionesCount || 0) > 0
    ? ` (COPIA #${ticket.factura.reimpresionesCount})`
    : '';
  chunks.push(linea(`FACTURA ${ticket.factura?.numeroCompleto || ''}${reimp}`));
  if (etiquetaCopia) {
    chunks.push(linea(etiquetaCopia.toUpperCase()));
  }
  if (ticket.factura?.estado === 'ANULADA') {
    chunks.push(linea('*** ANULADA ***'));
  }
  chunks.push(CMD.BOLD_OFF);
  chunks.push(CMD.ALIGN_LEFT, separador(columnas, '-'));

  // Datos generales
  chunks.push(linea(`Fecha: ${formatearFechaHora(ticket.factura?.createdAt)}`));
  chunks.push(linea(`Cliente: ${ticket.factura?.clienteNombre || 'Consumidor Final'}`));
  chunks.push(linea(`NIT: ${ticket.factura?.clienteNit || 'CF'}`));
  const mesaTxt = ticket.comanda?.mesaNumero ? ` (${ticket.comanda.mesaNumero})` : '';
  chunks.push(linea(`Servicio: ${ticket.venta?.tipoServicio || 'MOSTRADOR'}${mesaTxt}`));
  if (ticket.factura?.zonaEntregaNombre) {
    chunks.push(linea(`Zona entrega: ${ticket.factura.zonaEntregaNombre}`));
  }
  if (ticket.venta?.tipoServicio === 'DELIVERY' && ticket.factura?.clienteDireccion) {
    for (const l of dividirTexto(`Dir: ${ticket.factura.clienteDireccion}`, columnas)) {
      chunks.push(linea(l));
    }
  }
  if (ticket.comanda?.nombreTurno) {
    chunks.push(linea(`Turno/Entrega: ${ticket.comanda.nombreTurno}`));
  }
  chunks.push(linea(`Atendió: ${ticket.venta?.cajeroNombre || ''}`));
  chunks.push(separador(columnas, '-'));

  // Detalle de productos
  chunks.push(CMD.BOLD_ON, parColumnas('CANT / DESC', 'SUBTOTAL', columnas), CMD.BOLD_OFF);
  for (const item of ticket.venta?.detalles || []) {
    const cortesia = item.cantidadCortesia ? ` · ${item.cantidadCortesia} de cortesía` : '';
    chunks.push(
      parColumnas(
        `${item.cantidad}x ${item.nombrePlatillo}${cortesia}`,
        formatearMoneda(item.subtotal),
        columnas,
      ),
    );
  }
  if (Number(ticket.factura?.costoEnvio || 0) > 0) {
    const zona = ticket.factura.zonaEntregaNombre ? ` (${ticket.factura.zonaEntregaNombre})` : '';
    chunks.push(
      parColumnas(`Envío a domicilio${zona}`, formatearMoneda(ticket.factura.costoEnvio), columnas),
    );
  }
  chunks.push(separador(columnas, '-'));

  // Totales
  chunks.push(parColumnas('Base Imponible:', formatearMoneda(ticket.factura?.subtotalSinIva), columnas));
  chunks.push(parColumnas('IVA 12% incluido:', formatearMoneda(ticket.factura?.ivaMonto), columnas));
  chunks.push(
    CMD.BOLD_ON,
    CMD.SIZE_DOUBLE_H,
    parColumnas('TOTAL:', formatearMoneda(ticket.factura?.total), columnas),
    CMD.SIZE_NORMAL,
    CMD.BOLD_OFF,
  );
  chunks.push(separador(columnas, '-'));

  // Pago
  const metodo = ticket.venta?.metodoPago === 'SIN_COBRO'
    ? 'Cortesía · sin cobro'
    : ticket.venta?.metodoPago || 'EFECTIVO';
  chunks.push(linea(`Pago: ${metodo}`));
  if (ticket.venta?.metodoPago === 'EFECTIVO') {
    chunks.push(linea(`Recibido: ${formatearMoneda(ticket.venta.montoRecibido)}`));
    chunks.push(linea(`Cambio: ${formatearMoneda(ticket.venta.cambio)}`));
  }
  if (ticket.factura?.felUuid) {
    chunks.push(linea(`FEL UUID: ${ticket.factura.felUuid}`));
  }
  chunks.push(linea(''));
  chunks.push(CMD.ALIGN_CENTER, CMD.BOLD_ON, linea('¡Gracias por su preferencia!'), CMD.BOLD_OFF);
  chunks.push(CMD.ALIGN_LEFT, CMD.FEED_AND_PARTIAL_CUT);

  return Buffer.concat(chunks);
}

function generarEscPosFacturaDoble(ticket, opciones = {}) {
  const copias = Math.max(1, Math.min(2, Number(opciones.copias) || 2));
  const abrirGaveta = Boolean(opciones.abrirGaveta);
  const primera = generarEscPosFactura(ticket, {
    columnas: opciones.columnas,
    abrirGaveta,
  });
  if (copias === 1) return primera;

  const segunda = generarEscPosFactura(ticket, {
    columnas: opciones.columnas,
    abrirGaveta: false, // La gaveta se abre solo una vez
    etiquetaCopia: 'COPIA CAJA',
  });
  return Buffer.concat([primera, segunda]);
}

function generarEscPosComandaCocina(ticket, opciones = {}) {
  const columnas = Number(opciones.columnas) || 48;
  const esReimpresion = Boolean(opciones.esReimpresion);
  const comanda = ticket.comanda;
  if (!comanda) {
    throw new Error('El ticket no contiene datos de comanda para cocina.');
  }

  // Cocina NUNCA incluye pulso de gaveta de efectivo
  const chunks = [CMD.INIT, CMD.CODEPAGE_CP858];

  chunks.push(CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.SIZE_DOUBLE_WH);
  chunks.push(linea('COMANDA COCINA'));
  chunks.push(CMD.SIZE_DOUBLE_H);
  chunks.push(linea(comanda.numeroComanda || ''));
  chunks.push(CMD.SIZE_NORMAL);
  if (esReimpresion) {
    chunks.push(linea('*** REIMPRESIÓN ***'));
  }
  const servicio = comanda.tipoServicio === 'MOSTRADOR' ? 'EN MOSTRADOR' : comanda.tipoServicio;
  const mesa = comanda.mesaNumero ? ` - ${comanda.mesaNumero}` : '';
  chunks.push(linea(`${servicio}${mesa}`));
  if (comanda.nombreTurno) {
    chunks.push(CMD.SIZE_DOUBLE_H, linea(`LLAMAR A: ${comanda.nombreTurno}`), CMD.SIZE_NORMAL);
  }
  chunks.push(CMD.BOLD_OFF, CMD.ALIGN_LEFT, separador(columnas, '='));

  chunks.push(linea(`Hora: ${formatearFechaHora(comanda.createdAt)}`));
  chunks.push(linea(`Ref: ${ticket.entrega?.numeroPedido || ticket.factura?.numeroCompleto || ''}`));
  chunks.push(linea(`Atendió: ${ticket.venta?.cajeroNombre || ''}`));
  if (comanda.zonaEntregaNombre) chunks.push(CMD.BOLD_ON, linea(`Zona: ${comanda.zonaEntregaNombre}`), CMD.BOLD_OFF);
  if (comanda.direccionEntrega) {
    for (const l of dividirTexto(`Dir: ${comanda.direccionEntrega}`, columnas)) chunks.push(linea(l));
  }
  if (comanda.referenciaEntrega) {
    for (const l of dividirTexto(`Ref entrega: ${comanda.referenciaEntrega}`, columnas)) chunks.push(linea(l));
  }
  chunks.push(separador(columnas, '-'));

  for (const item of ticket.venta?.detalles || []) {
    const cortesia = item.cantidadCortesia ? ` · ${item.cantidadCortesia} cortesía` : '';
    chunks.push(CMD.BOLD_ON, CMD.SIZE_DOUBLE_H);
    for (const l of dividirTexto(`[${item.cantidad}] ${item.nombrePlatillo}${cortesia}`, columnas)) {
      chunks.push(linea(l));
    }
    chunks.push(CMD.SIZE_NORMAL, CMD.BOLD_OFF);
    if (item.notas) {
      chunks.push(CMD.BOLD_ON);
      for (const l of dividirTexto(`  >> NOTA: ${item.notas}`, columnas)) {
        chunks.push(linea(l));
      }
      chunks.push(CMD.BOLD_OFF);
    }
    chunks.push(separador(columnas, '.'));
  }

  chunks.push(CMD.FEED_AND_PARTIAL_CUT);
  return Buffer.concat(chunks);
}

function generarEscPosEntrega(ticket, opciones = {}) {
  const columnas = Number(opciones.columnas) || 48;
  const entrega = ticket.entrega;
  if (!entrega) {
    throw new Error('El ticket no contiene datos de entrega a domicilio.');
  }

  const chunks = [CMD.INIT, CMD.CODEPAGE_CP858];
  chunks.push(CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.SIZE_DOUBLE_H);
  chunks.push(linea('TICKET DE ENTREGA'));
  chunks.push(CMD.SIZE_NORMAL, linea(entrega.numeroPedido || ''));
  chunks.push(
    linea(
      entrega.modalidadPago === 'PREPAGADO'
        ? 'PREPAGADO - NO COBRAR'
        : `CONTRA ENTREGA - COBRAR ${formatearMoneda(entrega.total)}`,
    ),
  );
  chunks.push(CMD.BOLD_OFF, CMD.ALIGN_LEFT, separador(columnas, '='));

  chunks.push(CMD.BOLD_ON, linea(`Cliente: ${entrega.clienteNombre || ''}`), CMD.BOLD_OFF);
  chunks.push(linea(`Tel: ${entrega.clienteTelefono || ''}`));
  chunks.push(CMD.BOLD_ON, linea(`Zona: ${entrega.zonaNombre || ''}`), CMD.BOLD_OFF);
  for (const l of dividirTexto(`Dir: ${entrega.direccion || ''}`, columnas)) chunks.push(linea(l));
  if (entrega.referencia) {
    for (const l of dividirTexto(`Ref: ${entrega.referencia}`, columnas)) chunks.push(linea(l));
  }
  if (entrega.observaciones) {
    for (const l of dividirTexto(`OBS: ${entrega.observaciones}`, columnas)) chunks.push(linea(l));
  }
  chunks.push(separador(columnas, '-'));

  for (const item of ticket.venta?.detalles || []) {
    chunks.push(
      parColumnas(`${item.cantidad}x ${item.nombrePlatillo}`, formatearMoneda(item.subtotal), columnas),
    );
  }
  chunks.push(parColumnas(`Envío (${entrega.zonaNombre})`, formatearMoneda(entrega.costoEnvio), columnas));
  chunks.push(separador(columnas, '-'));
  chunks.push(
    CMD.BOLD_ON,
    CMD.SIZE_DOUBLE_H,
    parColumnas('TOTAL:', formatearMoneda(entrega.total), columnas),
    CMD.SIZE_NORMAL,
    CMD.BOLD_OFF,
  );
  chunks.push(CMD.FEED_AND_PARTIAL_CUT);
  return Buffer.concat(chunks);
}

function generarEscPosPrueba(opciones = {}) {
  const columnas = Number(opciones.columnas) || 48;
  const destino = opciones.destino || 'PRUEBA';
  const abrirGaveta = Boolean(opciones.abrirGaveta);
  const chunks = [CMD.INIT, CMD.CODEPAGE_CP858];

  if (abrirGaveta) {
    chunks.push(CMD.OPEN_DRAWER_PIN2);
  }

  chunks.push(CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.SIZE_DOUBLE_H);
  chunks.push(linea('POS RESTAURANTE GT'));
  chunks.push(CMD.SIZE_NORMAL);
  chunks.push(linea(`PRUEBA DE IMPRESORA: ${destino}`));
  chunks.push(CMD.BOLD_OFF);
  chunks.push(linea(formatearFechaHora(new Date().toISOString())));
  chunks.push(linea(abrirGaveta ? 'Pulso de caja registradora: ENVIADO' : 'Pulso de caja registradora: NO'));
  chunks.push(separador(columnas, '-'));
  chunks.push(linea('Centrado 80 mm y corte automático OK'));
  chunks.push(CMD.ALIGN_LEFT, CMD.FEED_AND_PARTIAL_CUT);
  return Buffer.concat(chunks);
}

module.exports = {
  CMD,
  encodeCp858,
  generarEscPosFactura,
  generarEscPosFacturaDoble,
  generarEscPosComandaCocina,
  generarEscPosEntrega,
  generarEscPosPrueba,
};
