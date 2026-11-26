const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  CMD,
  generarEscPosComandaCocina,
  generarEscPosFacturaDoble,
  generarEscPosPrueba,
} = require('../src/escpos');
const { esIpPrivadaValida } = require('../src/transports');
const { esOrigenPermitido } = require('../src/server');

const TICKET_PRUEBA = {
  sucursal: {
    nombre: 'La Parrilla Chapina - Zona 10',
    nit: '10482931-4',
    direccion: '4a Avenida 12-45 Zona 10, Ciudad de Guatemala',
    telefono: '+502 2367-8900',
  },
  factura: {
    numeroCompleto: 'A-000021',
    clienteNombre: 'Consumidor Final',
    clienteNit: 'CF',
    subtotalSinIva: 53.57,
    ivaMonto: 6.43,
    total: 60,
    estado: 'EMITIDA',
    reimpresionesCount: 0,
    createdAt: '2026-11-26T15:53:00.000Z',
  },
  venta: {
    tipoServicio: 'MOSTRADOR',
    metodoPago: 'EFECTIVO',
    montoRecibido: 200,
    cambio: 140,
    cajeroNombre: 'Giovanni',
    detalles: [
      {
        id: 1,
        nombrePlatillo: 'Camarones empanizados con papas',
        cantidad: 1,
        cantidadCortesia: 0,
        subtotal: 60,
        notas: 'Sin picante',
      },
    ],
  },
  comanda: {
    numeroComanda: 'CMD-00021',
    tipoServicio: 'MOSTRADOR',
    mesaNumero: null,
    nombreTurno: null,
    createdAt: '2026-11-26T15:53:00.000Z',
  },
};

function contarOcurrencias(buffer, patron) {
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = buffer.indexOf(patron, pos);
    if (idx === -1) break;
    count += 1;
    pos = idx + patron.length;
  }
  return count;
}

describe('print-agent ESC/POS y seguridad local', () => {
  it('Factura doble incluye 1 pulso de gaveta cuando abrirGaveta=true, 2 cortes y marca COPIA CAJA en la segunda', () => {
    const buf = generarEscPosFacturaDoble(TICKET_PRUEBA, { copias: 2, abrirGaveta: true });
    assert.equal(contarOcurrencias(buf, CMD.OPEN_DRAWER_PIN2), 1);
    assert.equal(contarOcurrencias(buf, CMD.FEED_AND_PARTIAL_CUT), 2);
    assert.ok(buf.includes(Buffer.from('FACTURA A-000021')));
    assert.ok(buf.includes(Buffer.from('COPIA CAJA')));
    assert.ok(buf.includes(Buffer.from('Q 60.00')));
    assert.ok(!buf.includes(Buffer.from('COMANDA COCINA')));
  });

  it('Factura doble NO envía pulso de gaveta cuando abrirGaveta=false (ej. tarjeta)', () => {
    const buf = generarEscPosFacturaDoble(TICKET_PRUEBA, { copias: 2, abrirGaveta: false });
    assert.equal(contarOcurrencias(buf, CMD.OPEN_DRAWER_PIN2), 0);
    assert.equal(contarOcurrencias(buf, CMD.FEED_AND_PARTIAL_CUT), 2);
  });

  it('Comanda de cocina imprime 1 corte, incluye notas y NUNCA envía pulso de gaveta ni precios', () => {
    const buf = generarEscPosComandaCocina(TICKET_PRUEBA, { esReimpresion: false });
    assert.equal(contarOcurrencias(buf, CMD.OPEN_DRAWER_PIN2), 0);
    assert.equal(contarOcurrencias(buf, CMD.FEED_AND_PARTIAL_CUT), 1);
    assert.ok(buf.includes(Buffer.from('COMANDA COCINA')));
    assert.ok(buf.includes(Buffer.from('CMD-00021')));
    assert.ok(buf.includes(Buffer.from('NOTA: Sin picante')));
    assert.ok(!buf.includes(Buffer.from('FACTURA A-000021')));
  });

  it('Ticket de prueba respeta la bandera de gaveta y corta al final', () => {
    const conGaveta = generarEscPosPrueba({ destino: 'CAJA', abrirGaveta: true });
    const sinGaveta = generarEscPosPrueba({ destino: 'COCINA', abrirGaveta: false });
    assert.equal(contarOcurrencias(conGaveta, CMD.OPEN_DRAWER_PIN2), 1);
    assert.equal(contarOcurrencias(sinGaveta, CMD.OPEN_DRAWER_PIN2), 0);
    assert.equal(contarOcurrencias(conGaveta, CMD.FEED_AND_PARTIAL_CUT), 1);
  });

  it('Solo acepta IPs privadas de red local y orígenes autorizados', () => {
    assert.equal(esIpPrivadaValida('192.168.1.50'), true);
    assert.equal(esIpPrivadaValida('10.0.0.15'), true);
    assert.equal(esIpPrivadaValida('172.16.5.20'), true);
    assert.equal(esIpPrivadaValida('8.8.8.8'), false);
    assert.equal(esIpPrivadaValida('google.com'), false);

    assert.equal(esOrigenPermitido('https://pos-restaurante-gt.vercel.app'), true);
    assert.equal(esOrigenPermitido('http://localhost:5173'), true);
    assert.equal(esOrigenPermitido('https://sitio-malicioso.example'), false);
  });
});
