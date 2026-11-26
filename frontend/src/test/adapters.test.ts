import { describe, expect, it } from 'vitest';
import { domiciliosAdapter } from '../adapters/domicilios.adapter';
import { reportesAdapter } from '../adapters/reportes.adapter';

describe('Adaptadores de dominio (domiciliosAdapter y reportesAdapter)', () => {
  it('domiciliosAdapter normaliza clientes (incluyendo bloqueadoPedidosWeb) y zonas', () => {
    const zona = domiciliosAdapter.fromZonaJson({
      id: '3',
      nombre: 'Zona 10',
      costoEnvio: '15.50',
      tiempoEstimadoMin: '35',
      pedidoMinimo: '60',
      activa: true,
    });
    expect(zona).toEqual({
      id: 3,
      nombre: 'Zona 10',
      descripcion: null,
      costoEnvio: 15.5,
      tiempoEstimadoMin: 35,
      pedidoMinimo: 60,
      activa: true,
    });

    const cliente = domiciliosAdapter.fromClienteJson({
      id: '12',
      nombre: 'María López',
      telefono: '55123456',
      bloqueadoPedidosWeb: true,
      direcciones: [],
    });
    expect(cliente.id).toBe(12);
    expect(cliente.bloqueadoPedidosWeb).toBe(true);
    expect(cliente.activo).toBe(true);
  });

  it('domiciliosAdapter aplica defaults seguros ante valores desconocidos en pedidos', () => {
    const pedido = domiciliosAdapter.fromPedidoJson({
      id: 99,
      numeroPedido: 'LLV-000001',
      tipoEntrega: 'LLEVAR',
      origen: 'WEB',
      estado: 'ESTADO_INVENTADO',
      modalidadPago: 'CONTRA_ENTREGA',
      total: '80.00',
      clienteBloqueadoWeb: true,
    });
    expect(pedido.tipoEntrega).toBe('LLEVAR');
    expect(pedido.origen).toBe('WEB');
    expect(pedido.estado).toBe('NUEVO');
    expect(pedido.clienteBloqueadoWeb).toBe(true);
    expect(pedido.total).toBe(80);
  });

  it('reportesAdapter traduce KPIs incluyendo indicadores de saldo negativo de inventario', () => {
    const resumen = reportesAdapter.fromResumenJson({
      periodo: { fechaDesde: '2026-11-01', fechaHasta: '2026-11-26' },
      kpis: {
        cantidadVentas: '12',
        ingresosTotales: '1500.50',
        ingredientesEnNegativoCount: '2',
        deficitTotalInventarioOz: '24',
        deficitTotalInventarioLb: '1.5',
      },
      porMetodoPago: { EFECTIVO: { cantidad: '10', total: '1200' } },
      porTipoServicio: { MOSTRADOR: { cantidad: '12', total: '1500.50' } },
    });

    expect(resumen.kpis.cantidadVentas).toBe(12);
    expect(resumen.kpis.ingresosTotales).toBe(1500.5);
    expect(resumen.kpis.ingredientesEnNegativoCount).toBe(2);
    expect(resumen.kpis.deficitTotalInventarioOz).toBe(24);
    expect(resumen.kpis.deficitTotalInventarioLb).toBe(1.5);
    expect(resumen.porMetodoPago.EFECTIVO).toEqual({ cantidad: 10, total: 1200 });
  });
});
