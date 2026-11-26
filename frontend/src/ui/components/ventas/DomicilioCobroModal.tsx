import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, Bike, CreditCard, MapPin, Phone, Plus, Search, UserCheck } from 'lucide-react';
import { env } from '../../../config/env';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import {
  AdvertenciaStockModel,
  CartItemModel,
  ClienteDomicilioModel,
  MetodoPago,
  ModalidadPagoDomicilio,
  PedidoDomicilioModel,
  TicketImprimibleModel,
  ZonaEntregaModel,
} from '../../../models';
import {
  construirTicketEntregaDesdePedido,
  domiciliosService,
} from '../../../services/domicilios.service';
import { isAbortError } from '../../../services/httpClient';
import { useAuthStore } from '../../../store/auth.store';
import { calcularIvaIncluido, formatCurrency } from '../../../utils/formatters';
import { Alert } from '../common/Alert';
import { Field } from '../common/Field';
import { Modal } from '../common/Modal';

interface DomicilioCobroModalProps {
  open: boolean;
  onClose: () => void;
  idempotencyKey: string;
  cajaAbierta: boolean;
  items: CartItemModel[];
  subtotalPlatillos: number;
  onPedidoCreado: (resultado: {
    pedido: PedidoDomicilioModel;
    ticket: TicketImprimibleModel;
    incluirFactura: boolean;
    advertenciasStock: AdvertenciaStockModel[];
  }) => Promise<void> | void;
}

/**
 * Modal de registro de pedido a domicilio (PREPAGADO o CONTRA_ENTREGA).
 * Privacidad: toda la información del cliente (teléfono, dirección, referencia, NIT)
 * vive únicamente en estado local del componente y NUNCA se guarda en sessionStorage.
 */
export const DomicilioCobroModal: React.FC<DomicilioCobroModalProps> = ({
  open,
  onClose,
  idempotencyKey,
  cajaAbierta,
  items,
  subtotalPlatillos,
  onPedidoCreado,
}) => {
  const sucursalUsuario = useAuthStore((s) => s.usuario?.sucursal);

  const [zonas, setZonas] = useState<ZonaEntregaModel[]>([]);
  const [zonaId, setZonaId] = useState<number | ''>('');
  const [busquedaTel, setBusquedaTel] = useState('');
  const [sugerencias, setSugerencias] = useState<ClienteDomicilioModel[]>([]);
  const [buscandoClientes, setBuscandoClientes] = useState(false);

  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteDomicilioModel | null>(null);
  const [nombreCliente, setNombreCliente] = useState('');
  const [telefonoCliente, setTelefonoCliente] = useState('');
  const [nitCliente, setNitCliente] = useState('CF');

  const [direccionId, setDireccionId] = useState<number | 'NUEVA'>('NUEVA');
  const [aliasDireccion, setAliasDireccion] = useState('Principal');
  const [direccionTexto, setDireccionTexto] = useState('');
  const [referenciaTexto, setReferenciaTexto] = useState('');

  const [modalidadPago, setModalidadPago] = useState<ModalidadPagoDomicilio>('CONTRA_ENTREGA');
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('EFECTIVO');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [montoConQuePaga, setMontoConQuePaga] = useState('');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const [motivoCortesia, setMotivoCortesia] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [claveSupervisor, setClaveSupervisor] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedTel = useDebouncedValue(busquedaTel, 350);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Reiniciar todo estado PII al abrir/cerrar
  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusquedaTel('');
    setSugerencias([]);
    setClienteSeleccionado(null);
    setNombreCliente('');
    setTelefonoCliente('');
    setNitCliente('CF');
    setDireccionId('NUEVA');
    setAliasDireccion('Principal');
    setDireccionTexto('');
    setReferenciaTexto('');
    setModalidadPago('CONTRA_ENTREGA');
    setMetodoPago('EFECTIVO');
    setMontoRecibido('');
    setMontoConQuePaga('');
    setReferenciaPago('');
    setObservaciones('');
    setMotivoCortesia('');
    setSupervisor('');
    setClaveSupervisor('');

    const controller = new AbortController();
    void domiciliosService
      .listarZonas(true, controller.signal)
      .then((data) => {
        setZonas(data);
        setZonaId(data.length > 0 ? data[0].id : '');
      })
      .catch((err) => {
        if (!isAbortError(err)) {
          setError(err instanceof Error ? err.message : 'No se pudieron cargar las zonas de entrega');
        }
      });

    return () => controller.abort();
  }, [open]);

  // Búsqueda debounced y cancelable de clientes por teléfono
  useEffect(() => {
    if (!open) return;
    const soloDigitos = debouncedTel.replace(/\D/g, '');
    if (soloDigitos.length < 4) {
      setSugerencias([]);
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setBuscandoClientes(true);

    void domiciliosService
      .buscarClientesPorTelefono(soloDigitos, controller.signal)
      .then((res) => {
        setSugerencias(res);
      })
      .catch((err) => {
        if (!isAbortError(err)) setSugerencias([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBuscandoClientes(false);
      });

    return () => controller.abort();
  }, [debouncedTel, open]);

  const zonaActual = useMemo(
    () => zonas.find((z) => z.id === zonaId) ?? null,
    [zonas, zonaId],
  );

  const costoEnvio = zonaActual?.costoEnvio ?? 0;
  const totalFinal = Math.round((subtotalPlatillos + costoEnvio) * 100) / 100;
  const desgloseIva = useMemo(() => calcularIvaIncluido(totalFinal), [totalFinal]);
  const cumplePedidoMinimo = !zonaActual || subtotalPlatillos >= zonaActual.pedidoMinimo;
  const tieneCortesia = items.some((i) => (i.cantidadCortesia ?? 0) > 0);
  const sinCobro = modalidadPago === 'PREPAGADO' && totalFinal === 0;

  useEffect(() => {
    if (modalidadPago === 'PREPAGADO') {
      if (totalFinal === 0) {
        setMetodoPago('SIN_COBRO');
      } else if (metodoPago === 'SIN_COBRO') {
        setMetodoPago('EFECTIVO');
      }
      setMontoRecibido(totalFinal.toFixed(2));
    } else if (metodoPago === 'SIN_COBRO') {
      setMetodoPago('EFECTIVO');
    }
  }, [modalidadPago, totalFinal, metodoPago]);

  const seleccionarCliente = (cliente: ClienteDomicilioModel) => {
    setClienteSeleccionado(cliente);
    setNombreCliente(cliente.nombre);
    setTelefonoCliente(cliente.telefono);
    setNitCliente(cliente.nit || 'CF');
    setSugerencias([]);
    setBusquedaTel(cliente.telefono);
    if (cliente.direcciones.length > 0) {
      const principal = cliente.direcciones[0];
      setDireccionId(principal.id);
      if (principal.zonaEntregaId && zonas.some((z) => z.id === principal.zonaEntregaId)) {
        setZonaId(principal.zonaEntregaId);
      }
    } else {
      setDireccionId('NUEVA');
    }
  };

  const limpiarClienteSeleccionado = () => {
    setClienteSeleccionado(null);
    setDireccionId('NUEVA');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!zonaActual) {
      setError('Selecciona una zona de entrega activa');
      return;
    }
    if (!cumplePedidoMinimo) {
      setError(
        `El pedido mínimo para ${zonaActual.nombre} es ${formatCurrency(zonaActual.pedidoMinimo)}.`,
      );
      return;
    }
    if (modalidadPago === 'PREPAGADO' && !cajaAbierta) {
      setError('Para cobrar un pedido PREPAGADO debes abrir la caja primero.');
      return;
    }
    if (!clienteSeleccionado) {
      if (nombreCliente.trim().length < 2) {
        setError('Ingresa el nombre del cliente.');
        return;
      }
      if (telefonoCliente.replace(/\D/g, '').length < 8) {
        setError('Ingresa un número de teléfono válido (al menos 8 dígitos).');
        return;
      }
    }
    if (direccionId === 'NUEVA' && direccionTexto.trim().length < 5) {
      setError('Ingresa la dirección de entrega completa.');
      return;
    }
    if (modalidadPago === 'PREPAGADO' && !sinCobro) {
      if (metodoPago === 'EFECTIVO' && Number(montoRecibido) < totalFinal) {
        setError('El efectivo recibido no puede ser menor al total del pedido.');
        return;
      }
      if (metodoPago === 'TARJETA' && !referenciaPago.trim()) {
        setError('Ingresa el número de voucher o autorización de tarjeta.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await domiciliosService.crearPedido({
        idempotencyKey,
        zonaEntregaId: zonaActual.id,
        modalidadPago,
        metodoPago: sinCobro ? 'SIN_COBRO' : metodoPago,
        ...(modalidadPago === 'PREPAGADO' && metodoPago === 'EFECTIVO'
          ? { montoRecibido: Number(montoRecibido) }
          : {}),
        ...(modalidadPago === 'CONTRA_ENTREGA' && montoConQuePaga.trim()
          ? { montoConQuePaga: Number(montoConQuePaga) }
          : {}),
        ...(modalidadPago === 'PREPAGADO' && metodoPago === 'TARJETA'
          ? { referenciaPago: referenciaPago.trim() }
          : {}),
        ...(clienteSeleccionado
          ? {
              clienteId: clienteSeleccionado.id,
              cliente: {
                nombre: nombreCliente.trim() || clienteSeleccionado.nombre,
                telefono: clienteSeleccionado.telefono,
                nit: nitCliente.trim() || 'CF',
              },
            }
          : {
              cliente: {
                nombre: nombreCliente.trim(),
                telefono: telefonoCliente.trim(),
                nit: nitCliente.trim() || 'CF',
              },
            }),
        ...(direccionId !== 'NUEVA'
          ? { direccionEntregaId: direccionId }
          : {
              direccionNueva: {
                alias: aliasDireccion.trim() || 'Principal',
                direccion: direccionTexto.trim(),
                referencia: referenciaTexto.trim() || null,
                zonaEntregaId: zonaActual.id,
                esPrincipal: !clienteSeleccionado || clienteSeleccionado.direcciones.length === 0,
              },
            }),
        observaciones: observaciones.trim() || null,
        ...(modalidadPago === 'PREPAGADO' && tieneCortesia
          ? {
              cortesiaMotivo: motivoCortesia.trim(),
              autorizacionCortesia: { identifier: supervisor.trim(), password: claveSupervisor },
            }
          : {}),
        items: items.map((i) => ({
          platilloId: i.platillo.id,
          cantidad: i.cantidad,
          cantidadCortesia: i.cantidadCortesia ?? 0,
          notas: i.notas.trim() || null,
        })),
      });

      const sucursal = sucursalUsuario
        ? {
            nombre: sucursalUsuario.nombre,
            nit: sucursalUsuario.nit,
            direccion: sucursalUsuario.direccion,
            telefono: sucursalUsuario.telefono,
          }
        : { nombre: env.APP_NAME, nit: 'CF', direccion: 'Guatemala', telefono: null };

      const ticket = construirTicketEntregaDesdePedido(res.pedido, sucursal, res.ticket);
      await onPedidoCreado({
        pedido: res.pedido,
        ticket,
        incluirFactura: modalidadPago === 'PREPAGADO',
        advertenciasStock: res.advertenciasStock,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pedido a domicilio');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Registrar pedido a domicilio" maxWidthClass="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert type="error" message={error} />}

        {/* Resumen económico con línea de envío */}
        <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
            <span>Platillos: <strong>{formatCurrency(subtotalPlatillos)}</strong></span>
            <span>
              Envío ({zonaActual?.nombre ?? 'sin zona'}): <strong>{formatCurrency(costoEnvio)}</strong>
            </span>
            <span>IVA {(env.IVA_RATE * 100).toFixed(0)}% incl.: {formatCurrency(desgloseIva.ivaMonto)}</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between border-t border-brand-200 pt-2">
            <span className="text-sm font-bold text-slate-900">Total del pedido</span>
            <span className="text-2xl font-black text-brand-700">{formatCurrency(totalFinal)}</span>
          </div>
        </div>

        {/* 1. Búsqueda y datos del cliente */}
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-700">
              <Phone className="h-4 w-4 text-brand-700" aria-hidden="true" />
              1. Cliente (buscar por teléfono o registrar nuevo)
            </p>
            {clienteSeleccionado && (
              <button
                type="button"
                onClick={limpiarClienteSeleccionado}
                className="text-xs font-bold text-brand-700 hover:underline"
              >
                Cambiar cliente
              </button>
            )}
          </div>

          <div className="relative">
            <Field label="Buscar cliente por teléfono" srOnlyLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  value={busquedaTel}
                  onChange={(e) => {
                    setBusquedaTel(e.target.value);
                    if (!clienteSeleccionado) setTelefonoCliente(e.target.value);
                  }}
                  placeholder="Escribe al menos 4 dígitos del teléfono para buscar..."
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm"
                />
              </div>
            </Field>
            {buscandoClientes && (
              <p className="mt-1 text-xs text-slate-500">Buscando coincidencias...</p>
            )}
            {sugerencias.length > 0 && (
              <div className="mt-1.5 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-md">
                {sugerencias.map((cli) => (
                  <button
                    key={cli.id}
                    type="button"
                    onClick={() => seleccionarCliente(cli)}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-brand-50"
                  >
                    <div>
                      <p className="font-bold text-slate-900">{cli.nombre}</p>
                      <p className="text-xs text-slate-600">
                        Tel: {cli.telefono} · {cli.direcciones.length} dirección(es)
                      </p>
                    </div>
                    <UserCheck className="h-4 w-4 text-brand-700" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Nombre del cliente" required>
              <input
                type="text"
                required
                value={nombreCliente}
                onChange={(e) => setNombreCliente(e.target.value)}
                placeholder="Ej. María López"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              />
            </Field>
            <Field label="Teléfono" required>
              <input
                type="tel"
                required
                disabled={Boolean(clienteSeleccionado)}
                value={telefonoCliente}
                onChange={(e) => setTelefonoCliente(e.target.value)}
                placeholder="Ej. 5512-3456"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"
              />
            </Field>
            <Field label="NIT (opcional)">
              <input
                type="text"
                value={nitCliente}
                onChange={(e) => setNitCliente(e.target.value)}
                placeholder="CF"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              />
            </Field>
          </div>
        </div>

        {/* 2. Zona y dirección de entrega */}
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-700">
            <MapPin className="h-4 w-4 text-brand-700" aria-hidden="true" />
            2. Zona y dirección de entrega
          </p>

          <Field label="Zona de entrega" required>
            <select
              required
              value={zonaId}
              onChange={(e) => setZonaId(e.target.value ? Number(e.target.value) : '')}
              className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold"
            >
              {zonas.length === 0 && <option value="">Sin zonas activas configuradas</option>}
              {zonas.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nombre} · Envío {formatCurrency(z.costoEnvio)} · ~{z.tiempoEstimadoMin} min
                  {z.pedidoMinimo > 0 ? ` · Mín. ${formatCurrency(z.pedidoMinimo)}` : ''}
                </option>
              ))}
            </select>
          </Field>

          {!cumplePedidoMinimo && zonaActual && (
            <Alert
              type="warning"
              message={`El pedido mínimo para ${zonaActual.nombre} es ${formatCurrency(zonaActual.pedidoMinimo)} (faltan ${formatCurrency(zonaActual.pedidoMinimo - subtotalPlatillos)} en platillos).`}
            />
          )}

          {clienteSeleccionado && clienteSeleccionado.direcciones.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-600">Direcciones guardadas:</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {clienteSeleccionado.direcciones.map((dir) => (
                  <button
                    key={dir.id}
                    type="button"
                    onClick={() => {
                      setDireccionId(dir.id);
                      if (dir.zonaEntregaId && zonas.some((z) => z.id === dir.zonaEntregaId)) {
                        setZonaId(dir.zonaEntregaId);
                      }
                    }}
                    className={`rounded-xl border p-3 text-left text-xs transition ${
                      direccionId === dir.id
                        ? 'border-brand-700 bg-brand-50 text-brand-900 ring-2 ring-brand-200'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <p className="font-extrabold">{dir.alias}</p>
                    <p className="mt-0.5 line-clamp-2">{dir.direccion}</p>
                    {dir.referencia && <p className="mt-0.5 text-slate-500">Ref: {dir.referencia}</p>}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setDireccionId('NUEVA')}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border border-dashed p-3 text-xs font-bold transition ${
                    direccionId === 'NUEVA'
                      ? 'border-brand-700 bg-brand-50 text-brand-700'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Nueva dirección
                </button>
              </div>
            </div>
          )}

          {direccionId === 'NUEVA' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Alias">
                <input
                  type="text"
                  value={aliasDireccion}
                  onChange={(e) => setAliasDireccion(e.target.value)}
                  placeholder="Casa / Oficina"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                />
              </Field>
              <Field label="Dirección exacta" required className="sm:col-span-2">
                <input
                  type="text"
                  required
                  value={direccionTexto}
                  onChange={(e) => setDireccionTexto(e.target.value)}
                  placeholder="Calle, avenida, número de casa/apartamento..."
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                />
              </Field>
              <Field label="Referencia para el repartidor (opcional)" className="sm:col-span-3">
                <input
                  type="text"
                  value={referenciaTexto}
                  onChange={(e) => setReferenciaTexto(e.target.value)}
                  placeholder="Ej. Portón café frente al parque, tocar timbre 2"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                />
              </Field>
            </div>
          )}
        </div>

        {/* 3. Modalidad de pago */}
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-700">
            <Bike className="h-4 w-4 text-brand-700" aria-hidden="true" />
            3. Modalidad de pago
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              aria-pressed={modalidadPago === 'CONTRA_ENTREGA'}
              onClick={() => setModalidadPago('CONTRA_ENTREGA')}
              className={`min-h-[48px] rounded-xl border-2 px-3 text-left transition ${
                modalidadPago === 'CONTRA_ENTREGA'
                  ? 'border-brand-700 bg-brand-50 text-brand-900'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <p className="text-sm font-extrabold">Contra entrega</p>
              <p className="text-xs text-slate-600">El repartidor cobra y se liquida al regresar</p>
            </button>
            <button
              type="button"
              aria-pressed={modalidadPago === 'PREPAGADO'}
              onClick={() => setModalidadPago('PREPAGADO')}
              className={`min-h-[48px] rounded-xl border-2 px-3 text-left transition ${
                modalidadPago === 'PREPAGADO'
                  ? 'border-brand-700 bg-brand-50 text-brand-900'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <p className="text-sm font-extrabold">Prepagado</p>
              <p className="text-xs text-slate-600">Factura y cobro inmediato en caja</p>
            </button>
          </div>

          {modalidadPago === 'PREPAGADO' && !cajaAbierta && (
            <Alert type="warning" message="Debes tener una caja abierta para registrar pedidos PREPAGADO." />
          )}

          {!sinCobro && (
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setMetodoPago('EFECTIVO')}
                className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border text-sm font-bold ${
                  metodoPago === 'EFECTIVO'
                    ? 'border-brand-700 bg-brand-700 text-white'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                <Banknote className="h-4 w-4" aria-hidden="true" />
                Efectivo
              </button>
              <button
                type="button"
                onClick={() => setMetodoPago('TARJETA')}
                className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border text-sm font-bold ${
                  metodoPago === 'TARJETA'
                    ? 'border-brand-700 bg-brand-700 text-white'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                <CreditCard className="h-4 w-4" aria-hidden="true" />
                Tarjeta
              </button>
            </div>
          )}

          {modalidadPago === 'CONTRA_ENTREGA' && metodoPago === 'EFECTIVO' && (
            <Field label={`¿Con cuánto paga el cliente? (${env.CURRENCY_SYMBOL}, opcional para llevar cambio)`}>
              <input
                type="number"
                step="0.01"
                min={totalFinal}
                value={montoConQuePaga}
                onChange={(e) => setMontoConQuePaga(e.target.value)}
                placeholder={`Ej. ${Math.ceil(totalFinal / 50) * 50}`}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              />
            </Field>
          )}

          {modalidadPago === 'PREPAGADO' && !sinCobro && metodoPago === 'EFECTIVO' && (
            <Field label={`Efectivo recibido (${env.CURRENCY_SYMBOL})`} required>
              <input
                type="number"
                step="0.01"
                min={totalFinal}
                required
                value={montoRecibido}
                onChange={(e) => setMontoRecibido(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-lg font-black"
              />
            </Field>
          )}

          {modalidadPago === 'PREPAGADO' && !sinCobro && metodoPago === 'TARJETA' && (
            <Field label="Número de voucher / autorización" required>
              <input
                type="text"
                required
                maxLength={80}
                value={referenciaPago}
                onChange={(e) => setReferenciaPago(e.target.value)}
                placeholder="Ej. AUTH-482910"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
              />
            </Field>
          )}

          {modalidadPago === 'PREPAGADO' && tieneCortesia && (
            <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-bold text-amber-900">Autorización de cortesía</p>
              <Field label="Motivo de cortesía" required>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={motivoCortesia}
                  onChange={(e) => setMotivoCortesia(e.target.value)}
                  className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                />
              </Field>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Usuario supervisor" required>
                  <input
                    type="text"
                    required
                    value={supervisor}
                    onChange={(e) => setSupervisor(e.target.value)}
                    autoComplete="off"
                    className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  />
                </Field>
                <Field label="Contraseña supervisor" required>
                  <input
                    type="password"
                    required
                    value={claveSupervisor}
                    onChange={(e) => setClaveSupervisor(e.target.value)}
                    autoComplete="off"
                    className="min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  />
                </Field>
              </div>
            </div>
          )}

          <Field label="Observaciones del pedido (opcional)">
            <input
              type="text"
              maxLength={300}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Ej. Llamar al llegar, cubiertos descartables..."
              className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="min-h-[46px] rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={
              submitting ||
              !zonaActual ||
              !cumplePedidoMinimo ||
              (modalidadPago === 'PREPAGADO' && !cajaAbierta)
            }
            className="min-h-[46px] rounded-xl bg-brand-700 px-6 text-sm font-extrabold text-white shadow-md hover:bg-brand-800 disabled:opacity-50"
          >
            {submitting
              ? 'Registrando...'
              : modalidadPago === 'PREPAGADO'
                ? `Cobrar y enviar (${formatCurrency(totalFinal)})`
                : `Crear contra entrega (${formatCurrency(totalFinal)})`}
          </button>
        </div>
      </form>
    </Modal>
  );
};
