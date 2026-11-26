import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Bike,
  Check,
  CheckCircle2,
  ChefHat,
  Clock,
  Copy,
  MapPin,
  Minus,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
  Truck,
  UtensilsCrossed,
  XCircle,
} from 'lucide-react';
import { env } from '../../config/env';
import { EstadoPedidoDomicilio, TipoEntregaPedido } from '../../models';
import {
  MenuPublicoModel,
  PedidoPublicoSeguimientoModel,
  PlatilloPublicoModel,
  publicPedidosService,
} from '../../services/publicPedidos.service';
import { generarUuid } from '../../utils/idempotency';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { Alert } from '../components/common/Alert';
import { Badge } from '../components/common/Badge';
import { FotoPlatillo } from '../components/common/FotoPlatillo';

interface CartItemPublico {
  platillo: PlatilloPublicoModel;
  cantidad: number;
  notas: string;
}

const PASOS_LLEVAR: Array<{ estado: EstadoPedidoDomicilio; label: string; desc: string }> = [
  { estado: 'NUEVO', label: 'Recibido', desc: 'Esperando confirmación del restaurante' },
  { estado: 'EN_PREPARACION', label: 'En cocina', desc: 'Estamos preparando tu orden' },
  { estado: 'LISTO', label: 'Listo para recoger', desc: 'Puedes pasar a recoger tu pedido en caja' },
  { estado: 'ENTREGADO', label: 'Entregado', desc: '¡Buen provecho!' },
];

const PASOS_DELIVERY: Array<{ estado: EstadoPedidoDomicilio; label: string; desc: string }> = [
  { estado: 'NUEVO', label: 'Recibido', desc: 'Esperando confirmación del restaurante' },
  { estado: 'EN_PREPARACION', label: 'En cocina', desc: 'Estamos preparando tu orden' },
  { estado: 'LISTO', label: 'Empacado', desc: 'Listo para salir con repartidor' },
  { estado: 'EN_RUTA', label: 'En camino', desc: 'Nuestro repartidor va hacia tu dirección' },
  { estado: 'ENTREGADO', label: 'Entregado', desc: '¡Buen provecho!' },
];

const ESTADOS_TERMINALES: EstadoPedidoDomicilio[] = ['ENTREGADO', 'CANCELADO', 'FALLIDO'];

/** Vista pública de seguimiento de pedido por trackingToken (sin exponer PII) */
const SeguimientoPedidoView: React.FC<{
  token: string;
  inicial: PedidoPublicoSeguimientoModel | null;
}> = ({ token, inicial }) => {
  const [pedido, setPedido] = useState<PedidoPublicoSeguimientoModel | null>(inicial);
  const [loading, setLoading] = useState(!inicial);
  const [error, setError] = useState<string | null>(null);
  const [enlaceVencido, setEnlaceVencido] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setLoading(true);
      try {
        const data = await publicPedidosService.consultarSeguimiento(token);
        setPedido(data);
        setError(null);
        setEnlaceVencido(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'No se pudo consultar el estado del pedido';
        setError(msg);
        if (/venci|no existe|inválido/i.test(msg)) {
          setEnlaceVencido(true);
          setPedido(null);
        }
      } finally {
        if (!silencioso) setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!inicial) void cargar(false);
  }, [inicial, cargar]);

  // Polling automático cada 10s mientras el pedido siga activo y la pestaña esté visible
  useEffect(() => {
    if (enlaceVencido) return;
    if (pedido && ESTADOS_TERMINALES.includes(pedido.estado)) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void cargar(true);
      }
    }, 10000);
    return () => window.clearInterval(id);
  }, [pedido, enlaceVencido, cargar]);

  const copiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Ignora si el navegador bloquea el portapapeles
    }
  };

  const pasos = pedido?.tipoEntrega === 'LLEVAR' ? PASOS_LLEVAR : PASOS_DELIVERY;
  const indiceActual = pedido ? pasos.findIndex((p) => p.estado === pedido.estado) : -1;
  const esCanceladoOFallido = pedido?.estado === 'CANCELADO' || pedido?.estado === 'FALLIDO';

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
            Seguimiento de tu orden
          </span>
          <button
            type="button"
            onClick={() => void cargar(false)}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-extrabold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Actualizar
          </button>
        </div>

        {error && <Alert type="error" message={error} />}

        {loading && !pedido ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-500 shadow-sm">
            Consultando estado de tu pedido...
          </div>
        ) : pedido ? (
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            {/* Cabecera del pedido */}
            <div className="bg-gradient-to-r from-brand-700 to-brand-800 p-6 text-white">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-100">
                    {pedido.sucursal?.nombre || env.APP_NAME}
                  </p>
                  <h1 className="mt-1 text-3xl font-black tracking-tight">
                    Orden {pedido.numeroPedido}
                  </h1>
                  <p className="mt-1 text-sm text-brand-100">
                    Hola {pedido.clientePrimerNombre} ·{' '}
                    {pedido.tipoEntrega === 'LLEVAR'
                      ? 'Para llevar (Recoger en sucursal)'
                      : `A domicilio · ${pedido.zonaNombre}`}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/15 px-4 py-2.5 text-right backdrop-blur">
                  <p className="text-[11px] font-bold uppercase text-brand-100">Total a pagar</p>
                  <p className="text-2xl font-black">{formatCurrency(pedido.total)}</p>
                  <p className="text-[11px] text-brand-100">
                    {pedido.metodoPagoEsperado === 'TARJETA' ? 'Tarjeta al recibir' : 'Efectivo al recibir'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6 p-6">
              {/* Barra de progreso o aviso de cancelación */}
              {esCanceladoOFallido ? (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
                  <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-rose-600" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-extrabold">
                      {pedido.estado === 'CANCELADO'
                        ? 'Este pedido fue cancelado'
                        : 'No pudimos completar la entrega'}
                    </p>
                    {pedido.motivoCierre && (
                      <p className="mt-1 text-xs text-rose-800">{pedido.motivoCierre}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                      Estado en tiempo real
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      Estimado ~{pedido.tiempoEstimadoMin} min
                    </span>
                  </div>

                  <ol className="space-y-3">
                    {pasos.map((paso, idx) => {
                      const completado = idx < indiceActual || pedido.estado === 'ENTREGADO';
                      const actual = idx === indiceActual && pedido.estado !== 'ENTREGADO';
                      return (
                        <li
                          key={paso.estado}
                          className={`flex items-start gap-3 rounded-2xl border p-3.5 transition ${actual
                              ? 'border-brand-600 bg-brand-50/70'
                              : completado
                                ? 'border-emerald-200 bg-emerald-50/50'
                                : 'border-slate-200 bg-slate-50/60 opacity-65'
                            }`}
                        >
                          <div
                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${actual
                                ? 'bg-brand-700 text-white'
                                : completado
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                          >
                            {completado ? (
                              <Check className="h-4 w-4" aria-hidden="true" />
                            ) : paso.estado === 'EN_PREPARACION' ? (
                              <ChefHat className="h-4 w-4" aria-hidden="true" />
                            ) : paso.estado === 'EN_RUTA' ? (
                              <Truck className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              idx + 1
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-extrabold text-slate-900">{paso.label}</p>
                            <p className="text-xs text-slate-600">{paso.desc}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}

              {/* Resumen de platillos */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  Resumen de tu pedido
                </p>
                <ul className="divide-y divide-slate-200 text-sm">
                  {pedido.detalles.map((d) => (
                    <li key={d.id} className="flex items-start justify-between gap-2 py-2">
                      <div>
                        <span className="font-bold text-slate-900">
                          {d.cantidad}× {d.nombrePlatillo}
                        </span>
                        {d.notas && (
                          <p className="text-xs text-slate-500">Nota: {d.notas}</p>
                        )}
                      </div>
                      <span className="font-bold text-slate-800">{formatCurrency(d.subtotal)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal platillos</span>
                    <span className="font-semibold">{formatCurrency(pedido.subtotalPlatillos)}</span>
                  </div>
                  {pedido.tipoEntrega === 'DELIVERY' && (
                    <div className="flex justify-between text-slate-600">
                      <span>Envío a domicilio ({pedido.zonaNombre})</span>
                      <span className="font-semibold">{formatCurrency(pedido.costoEnvio)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 text-base font-black text-slate-900">
                    <span>Total (IVA incluido)</span>
                    <span>{formatCurrency(pedido.total)}</span>
                  </div>
                </div>
              </div>

              {/* Dirección de la sucursal si es Para llevar */}
              {pedido.tipoEntrega === 'LLEVAR' && pedido.sucursal && (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs text-sky-950">
                  <p className="font-extrabold">Punto de entrega para recoger:</p>
                  <p className="mt-0.5 font-semibold">{pedido.sucursal.nombre}</p>
                  {pedido.sucursal.direccion && <p>{pedido.sucursal.direccion}</p>}
                  {pedido.sucursal.telefono && <p>Tel: {pedido.sucursal.telefono}</p>}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                <div className="space-y-0.5 text-xs text-slate-500">
                  <p>Recibido: {formatDateTime(pedido.createdAt)}</p>
                  <p>
                    {pedido.trackingExpiraEn
                      ? `Este enlace vence el ${formatDateTime(pedido.trackingExpiraEn)}`
                      : `Este enlace vence automáticamente ${pedido.trackingTtlHoras || 24} h después de finalizar tu orden`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void copiarEnlace()}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-brand-700 px-4 text-xs font-extrabold text-white hover:bg-brand-800"
                >
                  {copiado ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiado ? 'Enlace copiado' : 'Copiar link de seguimiento'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

/**
 * Portal público de pedidos en línea para clientes (sin autenticación de empleado).
 * Permite pedir "Para llevar (Recoger en sucursal)" o "A domicilio" y envía la orden
 * directamente al tablero del POS principal.
 */
export const PedirPublicoPage: React.FC = () => {
  const { codigoSucursal, token } = useParams<{ codigoSucursal?: string; token?: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Si la ruta es /pedir/seguimiento/:token mostramos la vista de seguimiento
  if (token) {
    const inicial =
      (location.state as { pedido?: PedidoPublicoSeguimientoModel } | null)?.pedido ?? null;
    return <SeguimientoPedidoView token={token} inicial={inicial} />;
  }

  return <MenuPublicoOrdenView codigoSucursal={codigoSucursal} onPedidoCreado={(p) => {
    navigate(`/pedir/seguimiento/${p.trackingToken}`, { state: { pedido: p } });
  }} />;
};

const MenuPublicoOrdenView: React.FC<{
  codigoSucursal?: string;
  onPedidoCreado: (pedido: PedidoPublicoSeguimientoModel) => void;
}> = ({ codigoSucursal, onPedidoCreado }) => {
  const [menu, setMenu] = useState<MenuPublicoModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoriaActiva, setCategoriaActiva] = useState<number | ''>('');
  const [busqueda, setBusqueda] = useState('');

  // Carrito y formulario (PII estrictamente en memoria local, nunca en sessionStorage)
  const [carrito, setCarrito] = useState<CartItemPublico[]>([]);
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntregaPedido>('LLEVAR');
  const [zonaEntregaId, setZonaEntregaId] = useState<number | ''>('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [nit, setNit] = useState('CF');
  const [direccion, setDireccion] = useState('');
  const [referencia, setReferencia] = useState('');
  const [metodoPagoEsperado, setMetodoPagoEsperado] = useState<'EFECTIVO' | 'TARJETA'>('EFECTIVO');
  const [montoConQuePaga, setMontoConQuePaga] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const idempotencyRef = useRef<string>(generarUuid());
  const checkoutSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    publicPedidosService
      .obtenerMenu({ sucursal: codigoSucursal }, controller.signal)
      .then((data) => {
        setMenu(data);
        if (data.zonas.length > 0) {
          setZonaEntregaId((prev) => (prev === '' ? data.zonas[0].id : prev));
        }
        setError(null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'No se pudo cargar el menú');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [codigoSucursal]);

  const platillosFiltrados = useMemo(() => {
    if (!menu) return [];
    const q = busqueda.trim().toLowerCase();
    return menu.platillos.filter((p) => {
      if (categoriaActiva !== '' && p.categoriaId !== categoriaActiva) return false;
      if (!q) return true;
      return (
        p.nombre.toLowerCase().includes(q) ||
        (p.descripcion && p.descripcion.toLowerCase().includes(q)) ||
        p.categoriaNombre.toLowerCase().includes(q)
      );
    });
  }, [menu, categoriaActiva, busqueda]);

  const cantidadPorPlatillo = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of carrito) map.set(item.platillo.id, item.cantidad);
    return map;
  }, [carrito]);

  const agregarAlCarrito = (platillo: PlatilloPublicoModel) => {
    setErrorForm(null);
    idempotencyRef.current = generarUuid();
    setCarrito((prev) => {
      const idx = prev.findIndex((i) => i.platillo.id === platillo.id);
      if (idx >= 0) {
        const copia = [...prev];
        copia[idx] = { ...copia[idx], cantidad: Math.min(25, copia[idx].cantidad + 1) };
        return copia;
      }
      return [...prev, { platillo, cantidad: 1, notas: '' }];
    });
  };

  const cambiarCantidad = (platilloId: number, delta: number) => {
    setErrorForm(null);
    idempotencyRef.current = generarUuid();
    setCarrito((prev) =>
      prev
        .map((i) =>
          i.platillo.id === platilloId
            ? { ...i, cantidad: Math.min(25, i.cantidad + delta) }
            : i,
        )
        .filter((i) => i.cantidad > 0),
    );
  };

  const actualizarNotaItem = (platilloId: number, notas: string) => {
    setCarrito((prev) =>
      prev.map((i) => (i.platillo.id === platilloId ? { ...i, notas } : i)),
    );
  };

  const zonaSeleccionada = useMemo(() => {
    if (tipoEntrega !== 'DELIVERY' || !menu || zonaEntregaId === '') return null;
    return menu.zonas.find((z) => z.id === zonaEntregaId) ?? null;
  }, [tipoEntrega, menu, zonaEntregaId]);

  const totalUnidades = useMemo(
    () => carrito.reduce((acc, i) => acc + i.cantidad, 0),
    [carrito],
  );
  const subtotalPlatillos = useMemo(
    () => Math.round(carrito.reduce((acc, i) => acc + i.platillo.precioVenta * i.cantidad, 0) * 100) / 100,
    [carrito],
  );
  const costoEnvio = tipoEntrega === 'DELIVERY' ? (zonaSeleccionada?.costoEnvio ?? 0) : 0;
  const pedidoMinimo = tipoEntrega === 'DELIVERY' ? (zonaSeleccionada?.pedidoMinimo ?? 0) : 0;
  const cumpleMinimo = tipoEntrega === 'LLEVAR' || subtotalPlatillos >= pedidoMinimo;
  const totalGeneral = Math.round((subtotalPlatillos + costoEnvio) * 100) / 100;

  const handleEnviarPedido = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorForm(null);

    if (carrito.length === 0) {
      setErrorForm('Agrega al menos un platillo del menú antes de enviar tu orden.');
      return;
    }
    if (nombre.trim().length < 2) {
      setErrorForm('Ingresa tu nombre completo.');
      return;
    }
    if (telefono.replace(/\D/g, '').length < 8) {
      setErrorForm('Ingresa un teléfono válido de al menos 8 dígitos.');
      return;
    }
    if (tipoEntrega === 'DELIVERY') {
      if (!zonaSeleccionada) {
        setErrorForm('Selecciona tu zona de entrega.');
        return;
      }
      if (!cumpleMinimo) {
        setErrorForm(
          `El pedido mínimo para ${zonaSeleccionada.nombre} es de ${formatCurrency(pedidoMinimo)}.`,
        );
        return;
      }
      if (direccion.trim().length < 5) {
        setErrorForm('Ingresa tu dirección de entrega completa.');
        return;
      }
    }

    setEnviando(true);
    try {
      const creado = await publicPedidosService.crearPedido({
        idempotencyKey: idempotencyRef.current,
        codigoSucursal: menu?.sucursal.codigo,
        tipoEntrega,
        zonaEntregaId: tipoEntrega === 'DELIVERY' ? zonaSeleccionada?.id ?? null : null,
        direccion: tipoEntrega === 'DELIVERY' ? direccion.trim() : null,
        referencia: tipoEntrega === 'DELIVERY' && referencia.trim() ? referencia.trim() : null,
        metodoPagoEsperado,
        montoConQuePaga:
          metodoPagoEsperado === 'EFECTIVO' && montoConQuePaga.trim()
            ? Number(montoConQuePaga)
            : null,
        observaciones: observaciones.trim() || null,
        cliente: {
          nombre: nombre.trim(),
          telefono: telefono.trim(),
          nit: nit.trim() || 'CF',
        },
        items: carrito.map((i) => ({
          platilloId: i.platillo.id,
          cantidad: i.cantidad,
          notas: i.notas.trim() || null,
        })),
      });
      setCarrito([]);
      idempotencyRef.current = generarUuid();
      onPedidoCreado(creado);
    } catch (err) {
      setErrorForm(err instanceof Error ? err.message : 'No se pudo enviar tu pedido');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Encabezado público del restaurante */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-sm">
              <UtensilsCrossed className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-black leading-tight text-slate-900">
                {menu?.sucursal.nombre || env.APP_NAME}
              </h1>
              <p className="text-xs text-slate-500">
                Ordena en línea · Para llevar o a domicilio
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => checkoutSectionRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-700 px-4 text-xs font-extrabold text-white shadow-sm hover:bg-brand-800"
          >
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            <span>Mi orden ({totalUnidades})</span>
            {totalGeneral > 0 && (
              <span className="rounded-lg bg-white/20 px-2 py-0.5">{formatCurrency(totalGeneral)}</span>
            )}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {error && <Alert type="error" message={error} />}

        {/* Selector destacado: Para llevar vs Domicilio */}
        <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="mb-3 text-xs font-extrabold uppercase tracking-wide text-slate-500">
            ¿Cómo deseas recibir tu pedido?
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setTipoEntrega('LLEVAR')}
              className={`flex items-center gap-3.5 rounded-2xl border-2 p-4 text-left transition ${tipoEntrega === 'LLEVAR'
                  ? 'border-brand-700 bg-brand-50/70'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tipoEntrega === 'LLEVAR'
                    ? 'bg-brand-700 text-white'
                    : 'bg-slate-100 text-slate-600'
                  }`}
              >
                <Store className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">Para llevar (Recoger en sucursal)</p>
                <p className="text-xs text-slate-600">
                  Sin costo de envío · Listo en ~20 min · Pagas al recoger
                </p>
              </div>
            </button>

            <button
              type="button"
              disabled={Boolean(menu && menu.zonas.length === 0)}
              onClick={() => setTipoEntrega('DELIVERY')}
              className={`flex items-center gap-3.5 rounded-2xl border-2 p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${tipoEntrega === 'DELIVERY'
                  ? 'border-brand-700 bg-brand-50/70'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tipoEntrega === 'DELIVERY'
                    ? 'bg-brand-700 text-white'
                    : 'bg-slate-100 text-slate-600'
                  }`}
              >
                <Bike className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">Servicio a domicilio</p>
                <p className="text-xs text-slate-600">
                  {menu && menu.zonas.length === 0
                    ? 'Sin zonas de cobertura configuradas todavía'
                    : 'Entrega hasta tu puerta · Pago contra entrega'}
                </p>
              </div>
            </button>
          </div>
        </section>

        {/* Layout principal: Catálogo a la izquierda + Carrito/Formulario a la derecha */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Columna izquierda: Menú */}
          <section className="space-y-4 lg:col-span-7 xl:col-span-8">
            {menu?.menuEspecialActivo && (
              <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-950">
                <Sparkles className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                <span>
                  Menú especial de hoy: <strong>{menu.menuEspecialActivo.nombre}</strong>
                  {menu.menuEspecialActivo.descripcion ? ` — ${menu.menuEspecialActivo.descripcion}` : ''}
                </span>
              </div>
            )}

            {/* Buscador + Categorías */}
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar platillos, bebidas o postres..."
                  className="min-h-[42px] w-full rounded-xl border border-slate-300 pl-10 pr-4 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              {menu && menu.categorias.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCategoriaActiva('')}
                    className={`min-h-[36px] rounded-full px-3.5 text-xs font-extrabold transition ${categoriaActiva === ''
                        ? 'bg-brand-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                  >
                    Todo el menú
                  </button>
                  {menu.categorias.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoriaActiva(cat.id)}
                      className={`min-h-[36px] rounded-full px-3.5 text-xs font-extrabold transition ${categoriaActiva === cat.id
                          ? 'bg-brand-700 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                      {cat.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Grid de platillos */}
            {loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white p-4" />
                ))}
              </div>
            ) : platillosFiltrados.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-500">
                No encontramos platillos con ese filtro.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {platillosFiltrados.map((p) => {
                  const qty = cantidadPorPlatillo.get(p.id) ?? 0;
                  return (
                    <article
                      key={p.id}
                      className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
                    >
                      <div>
                        {p.imagenUrl ? (
                          <div className="relative h-36 w-full bg-slate-100">
                            <FotoPlatillo
                              ruta={p.imagenUrl}
                              className="h-full w-full object-cover"
                            />
                            {p.esEspecialHoy && (
                              <span className="absolute left-2.5 top-2.5 rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-black text-white shadow">
                                Especial hoy
                              </span>
                            )}
                          </div>
                        ) : null}

                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                                {p.categoriaNombre}
                              </p>
                              <h3 className="text-base font-extrabold text-slate-900">{p.nombre}</h3>
                            </div>
                            <span className="shrink-0 text-base font-black text-brand-700">
                              {formatCurrency(p.precioVenta)}
                            </span>
                          </div>
                          {p.descripcion && (
                            <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                              {p.descripcion}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-slate-100 px-4 py-3">
                        {qty === 0 ? (
                          <button
                            type="button"
                            onClick={() => agregarAlCarrito(p)}
                            className="flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl bg-brand-700 text-xs font-extrabold text-white hover:bg-brand-800"
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Agregar a mi orden
                          </button>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              aria-label={`Quitar uno de ${p.nombre}`}
                              onClick={() => cambiarCantidad(p.id, -1)}
                              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            >
                              <Minus className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <span className="text-sm font-black text-slate-900">
                              {qty} en orden
                            </span>
                            <button
                              type="button"
                              aria-label={`Agregar uno más de ${p.nombre}`}
                              onClick={() => cambiarCantidad(p.id, 1)}
                              className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 text-white hover:bg-brand-800"
                            >
                              <Plus className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Columna derecha: Carrito + Formulario de envío */}
          <aside
            ref={checkoutSectionRef}
            className="lg:col-span-5 xl:col-span-4"
          >
            <form
              onSubmit={(e) => void handleEnviarPedido(e)}
              className="sticky top-24 space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base font-black text-slate-900">Tu pedido</h2>
                <Badge variant={tipoEntrega === 'LLEVAR' ? 'info' : 'warning'}>
                  {tipoEntrega === 'LLEVAR' ? 'Para llevar' : 'Domicilio'}
                </Badge>
              </div>

              {/* Lista de ítems del carrito */}
              {carrito.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs font-semibold text-slate-500">
                  Selecciona platillos del menú para armar tu pedido.
                </div>
              ) : (
                <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
                  {carrito.map((item) => (
                    <div
                      key={item.platillo.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-slate-900">
                          {item.cantidad}× {item.platillo.nombre}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-slate-800">
                            {formatCurrency(item.platillo.precioVenta * item.cantidad)}
                          </span>
                          <button
                            type="button"
                            aria-label={`Eliminar ${item.platillo.nombre}`}
                            onClick={() => cambiarCantidad(item.platillo.id, -item.cantidad)}
                            className="text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={item.notas}
                        maxLength={200}
                        onChange={(e) => actualizarNotaItem(item.platillo.id, e.target.value)}
                        placeholder="Nota opcional (ej. sin cebolla, término medio)"
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px]"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Datos del cliente */}
              <div className="space-y-3 border-t border-slate-100 pt-3">
                <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  Tus datos
                </p>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Nombre completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. María López"
                    className="min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      Teléfono *
                    </label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                      <input
                        type="tel"
                        required
                        value={telefono}
                        onChange={(e) => setTelefono(e.target.value)}
                        placeholder="5512-3456"
                        className="min-h-[42px] w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      NIT (opcional)
                    </label>
                    <input
                      type="text"
                      value={nit}
                      onChange={(e) => setNit(e.target.value)}
                      placeholder="CF"
                      className="min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm"
                    />
                  </div>
                </div>

                {/* Campos adicionales solo para Domicilio */}
                {tipoEntrega === 'DELIVERY' && menu && (
                  <div className="space-y-2.5 rounded-2xl border border-amber-200 bg-amber-50/50 p-3">
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        Zona de entrega *
                      </label>
                      <select
                        value={zonaEntregaId}
                        onChange={(e) =>
                          setZonaEntregaId(e.target.value ? Number(e.target.value) : '')
                        }
                        className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                      >
                        {menu.zonas.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.nombre} (+{formatCurrency(z.costoEnvio)} · ~{z.tiempoEstimadoMin} min)
                          </option>
                        ))}
                      </select>
                      {zonaSeleccionada && !cumpleMinimo && (
                        <p className="mt-1 text-[11px] font-bold text-rose-700">
                          Pedido mínimo en esta zona: {formatCurrency(pedidoMinimo)} (te faltan{' '}
                          {formatCurrency(pedidoMinimo - subtotalPlatillos)})
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        Dirección exacta *
                      </label>
                      <div className="relative">
                        <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          required
                          value={direccion}
                          onChange={(e) => setDireccion(e.target.value)}
                          placeholder="Calle, avenida, número de casa y zona"
                          className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        Referencia (opcional)
                      </label>
                      <input
                        type="text"
                        value={referencia}
                        onChange={(e) => setReferencia(e.target.value)}
                        placeholder="Ej. Portón negro frente al parque"
                        className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                      />
                    </div>
                  </div>
                )}

                {/* Pago al recibir / recoger */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">
                      ¿Cómo pagarás?
                    </label>
                    <select
                      value={metodoPagoEsperado}
                      onChange={(e) =>
                        setMetodoPagoEsperado(e.target.value as 'EFECTIVO' | 'TARJETA')
                      }
                      className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                    >
                      <option value="EFECTIVO">Efectivo</option>
                      <option value="TARJETA">Tarjeta (POS)</option>
                    </select>
                  </div>
                  {metodoPagoEsperado === 'EFECTIVO' && (
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        ¿Con cuánto pagas?
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={montoConQuePaga}
                        onChange={(e) => setMontoConQuePaga(e.target.value)}
                        placeholder="Ej. 200"
                        className="min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Observaciones generales
                  </label>
                  <input
                    type="text"
                    maxLength={300}
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Ej. Incluir cubiertos o llamar al llegar"
                    className="min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm"
                  />
                </div>
              </div>

              {/* Totales */}
              <div className="space-y-1.5 rounded-2xl bg-slate-50 p-3.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal platillos</span>
                  <span className="font-bold">{formatCurrency(subtotalPlatillos)}</span>
                </div>
                {tipoEntrega === 'DELIVERY' && (
                  <div className="flex justify-between text-slate-600">
                    <span>Envío a domicilio</span>
                    <span className="font-bold">{formatCurrency(costoEnvio)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-black text-slate-900">
                  <span>Total (IVA incluido)</span>
                  <span className="text-brand-700">{formatCurrency(totalGeneral)}</span>
                </div>
              </div>

              {errorForm && <Alert type="error" message={errorForm} />}

              <button
                type="submit"
                disabled={enviando || carrito.length === 0 || !cumpleMinimo}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-brand-700 text-sm font-black text-white shadow-sm transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                {enviando
                  ? 'Enviando tu orden...'
                  : tipoEntrega === 'LLEVAR'
                    ? 'Enviar pedido para llevar'
                    : 'Enviar pedido a domicilio'}
              </button>
            </form>
          </aside>
        </div>
      </main>
    </div>
  );
};
