import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bike,
  CheckCircle2,
  ChefHat,
  Clock,
  DollarSign,
  ExternalLink,
  Eye,
  Globe,
  MapPin,
  Phone,
  Printer,
  RefreshCw,
  Store,
  Truck,
  XCircle,
} from 'lucide-react';
import { env } from '../../config/env';
import {
  DomiciliosResumenModel,
  EstadoPedidoDomicilio,
  ModalidadPagoDomicilio,
  PaginationMeta,
  PedidoDomicilioModel,
  TicketImprimibleModel,
  TipoEntregaPedido,
  ZonaEntregaModel,
} from '../../models';
import {
  construirTicketEntregaDesdePedido,
  domiciliosService,
} from '../../services/domicilios.service';
import { isAbortError } from '../../services/httpClient';
import { useAuthStore } from '../../store/auth.store';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { Alert } from '../components/common/Alert';
import { Badge } from '../components/common/Badge';
import { EmptyState } from '../components/common/EmptyState';
import { Field } from '../components/common/Field';
import { Modal } from '../components/common/Modal';
import { Pagination } from '../components/common/Pagination';
import { TableSkeleton } from '../components/common/TableSkeleton';
import { ClientesWebPanel } from '../components/domicilios/ClientesWebPanel';
import { LiquidarPedidoModal } from '../components/domicilios/LiquidarPedidoModal';
import { ZonasEntregaPanel } from '../components/domicilios/ZonasEntregaPanel';
import { PrintTicketsModal } from '../components/print/PrintTicketsModal';

const ETIQUETA_ESTADO: Record<EstadoPedidoDomicilio, string> = {
  NUEVO: 'Nuevo',
  EN_PREPARACION: 'En cocina',
  LISTO: 'Listo',
  EN_RUTA: 'En ruta',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
  FALLIDO: 'Fallido',
};

const BADGE_ESTADO: Record<
  EstadoPedidoDomicilio,
  'neutral' | 'info' | 'warning' | 'success' | 'danger'
> = {
  NUEVO: 'info',
  EN_PREPARACION: 'warning',
  LISTO: 'success',
  EN_RUTA: 'info',
  ENTREGADO: 'success',
  CANCELADO: 'neutral',
  FALLIDO: 'danger',
};

const POLL_INTERVAL_MS = 10000;

export const DomiciliosPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const usuario = useAuthStore((s) => s.usuario);
  const can = useAuthStore((s) => s.can);

  const canVerTodos = can('domicilios:ver');
  const esVistaRepartidor = !canVerTodos && can('domicilios:ver_propios');
  const canActualizar = can('domicilios:actualizar_estado');
  const canCancelar = can('domicilios:cancelar');
  const canLiquidar = can('domicilios:liquidar');
  const canConfigurar = can('domicilios:configurar');
  const canAnularFacturaDirecto = can('facturas:anular');
  const rolCodigo = usuario?.rol.codigo ?? '';

  const [tab, setTab] = useState<'pedidos' | 'zonas' | 'clientes'>(() => {
    const tabParam = searchParams.get('tab');
    if (canConfigurar && tabParam === 'zonas') return 'zonas';
    if (canConfigurar && tabParam === 'clientes') return 'clientes';
    return 'pedidos';
  });
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoPedidoDomicilio | ''>('');
  const [modalidadFiltro, setModalidadFiltro] = useState<ModalidadPagoDomicilio | ''>('');
  const [tipoEntregaFiltro, setTipoEntregaFiltro] = useState<TipoEntregaPedido | ''>('');
  const [soloPendientes, setSoloPendientes] = useState(
    () => searchParams.get('pendientes') === 'true',
  );
  const [page, setPage] = useState(1);

  const [pedidos, setPedidos] = useState<PedidoDomicilioModel[]>([]);
  const [resumen, setResumen] = useState<DomiciliosResumenModel | null>(null);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [zonas, setZonas] = useState<ZonaEntregaModel[]>([]);
  const [zonaFiltro, setZonaFiltro] = useState<number | ''>('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [procesandoId, setProcesandoId] = useState<number | null>(null);

  // Modales operativos
  const [detallePedido, setDetallePedido] = useState<PedidoDomicilioModel | null>(null);
  const [liquidarTarget, setLiquidarTarget] = useState<PedidoDomicilioModel | null>(null);
  const [cierreTarget, setCierreTarget] = useState<{
    pedido: PedidoDomicilioModel;
    estadoNuevo: 'CANCELADO' | 'FALLIDO';
  } | null>(null);
  const [motivoCierre, setMotivoCierre] = useState('');
  const [supUser, setSupUser] = useState('');
  const [supPass, setSupPass] = useState('');
  const [ticketImprimir, setTicketImprimir] = useState<{
    ticket: TicketImprimibleModel;
    includeFactura: boolean;
  } | null>(null);

  const ultimoServerTimeRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cargarCatalogos = useCallback(async () => {
    if (esVistaRepartidor) return;
    try {
      const zs = await domiciliosService.listarZonas(false);
      setZonas(zs);
    } catch {
      // Catálogos auxiliares opcionales
    }
  }, [esVistaRepartidor]);

  const cargarPedidos = useCallback(
    async (opts?: { incremental?: boolean; targetPage?: number }) => {
      const incremental = Boolean(opts?.incremental && ultimoServerTimeRef.current);
      const paginaConsulta = opts?.targetPage ?? page;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!incremental) setLoading(true);
      try {
        const res = await domiciliosService.listarPedidos(
          {
            page: incremental ? 1 : paginaConsulta,
            limit: 20,
            estado: soloPendientes ? '' : estadoFiltro,
            modalidadPago: soloPendientes ? '' : modalidadFiltro,
            tipoEntrega: tipoEntregaFiltro,
            zonaEntregaId: zonaFiltro,
            pendientesLiquidar: soloPendientes,
            soloActivos: esVistaRepartidor && !estadoFiltro ? true : undefined,
            desde: incremental ? ultimoServerTimeRef.current ?? undefined : undefined,
          },
          controller.signal,
        );

        ultimoServerTimeRef.current = res.serverTime;
        setResumen(res.resumen);
        setError(null);

        if (incremental) {
          if (res.items.length > 0) {
            setPedidos((prev) => {
              const mapa = new Map(prev.map((p) => [p.id, p]));
              for (const cambio of res.items) {
                mapa.set(cambio.id, cambio);
              }
              return Array.from(mapa.values()).sort(
                (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
              );
            });
          }
        } else {
          setPedidos(res.items);
          setMeta(res.meta);
        }
      } catch (err) {
        if (isAbortError(err)) return;
        setError(err instanceof Error ? err.message : 'Error cargando pedidos a domicilio');
      } finally {
        if (!controller.signal.aborted && !incremental) {
          setLoading(false);
        }
      }
    },
    [page, estadoFiltro, modalidadFiltro, tipoEntregaFiltro, soloPendientes, zonaFiltro, esVistaRepartidor],
  );

  useEffect(() => {
    void cargarCatalogos();
  }, [cargarCatalogos]);

  useEffect(() => {
    if (tab !== 'pedidos') return;
    ultimoServerTimeRef.current = null;
    void cargarPedidos({ incremental: false });
  }, [tab, cargarPedidos]);

  // Polling incremental respetando visibilidad de la pestaña
  useEffect(() => {
    if (tab !== 'pedidos') return;
    const ejecutarPoll = () => {
      if (document.visibilityState === 'visible') {
        void cargarPedidos({ incremental: true });
      }
    };
    const timer = window.setInterval(ejecutarPoll, POLL_INTERVAL_MS);
    const onVisChange = () => {
      if (document.visibilityState === 'visible') void cargarPedidos({ incremental: true });
    };
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisChange);
      abortRef.current?.abort();
    };
  }, [tab, cargarPedidos]);

  const abrirDetalle = async (id: number) => {
    setError(null);
    try {
      setDetallePedido(await domiciliosService.obtenerPedido(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el detalle del pedido');
    }
  };

  const handleAvanzarEstado = async (
    pedido: PedidoDomicilioModel,
    estadoNuevo: EstadoPedidoDomicilio,
  ) => {
    setProcesandoId(pedido.id);
    setError(null);
    setFeedback(null);
    try {
      const act = await domiciliosService.actualizarEstado(pedido.id, { estadoNuevo });
      setFeedback(`Pedido ${act.numeroPedido} actualizado a ${ETIQUETA_ESTADO[estadoNuevo]}.`);
      await cargarPedidos({ incremental: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado');
    } finally {
      setProcesandoId(null);
    }
  };

  const confirmarCierreNegativo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cierreTarget) return;
    setProcesandoId(cierreTarget.pedido.id);
    setError(null);
    setFeedback(null);
    try {
      const requiereSup =
        cierreTarget.pedido.modalidadPago === 'PREPAGADO' && !canAnularFacturaDirecto;
      const act = await domiciliosService.actualizarEstado(cierreTarget.pedido.id, {
        estadoNuevo: cierreTarget.estadoNuevo,
        motivo: motivoCierre.trim(),
        ...(requiereSup
          ? { autorizacionSupervisor: { identifier: supUser.trim(), password: supPass } }
          : {}),
      });
      setCierreTarget(null);
      setMotivoCierre('');
      setSupUser('');
      setSupPass('');
      setFeedback(
        `Pedido ${act.numeroPedido} marcado como ${ETIQUETA_ESTADO[act.estado]}.${act.mermaGenerada ? ' Se generó merma automática.' : ''}`,
      );
      await cargarPedidos({ incremental: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar el pedido');
    } finally {
      setProcesandoId(null);
    }
  };

  const imprimirPedido = (pedido: PedidoDomicilioModel) => {
    const sucursal = usuario?.sucursal
      ? {
          nombre: usuario.sucursal.nombre,
          nit: usuario.sucursal.nit,
          direccion: usuario.sucursal.direccion,
          telefono: usuario.sucursal.telefono,
        }
      : { nombre: env.APP_NAME, nit: 'CF', direccion: 'Guatemala', telefono: null };
    const ticket = construirTicketEntregaDesdePedido(pedido, sucursal);
    setTicketImprimir({ ticket, includeFactura: Boolean(pedido.venta?.factura) });
  };

  const botonesSiguienteEstado = useMemo(() => {
    return (pedido: PedidoDomicilioModel): EstadoPedidoDomicilio | null => {
      if (!canActualizar) return null;
      if (rolCodigo === 'CHEF') {
        if (pedido.estado === 'NUEVO') return 'EN_PREPARACION';
        if (pedido.estado === 'EN_PREPARACION') return 'LISTO';
        return null;
      }
      if (rolCodigo === 'REPARTIDOR' || esVistaRepartidor) {
        if (pedido.estado === 'LISTO') return 'EN_RUTA';
        if (pedido.estado === 'EN_RUTA') return 'ENTREGADO';
        return null;
      }
      if (pedido.estado === 'NUEVO') return 'EN_PREPARACION';
      if (pedido.estado === 'EN_PREPARACION') return 'LISTO';
      if (pedido.estado === 'LISTO') {
        return pedido.tipoEntrega === 'LLEVAR' ? 'ENTREGADO' : 'EN_RUTA';
      }
      if (pedido.estado === 'EN_RUTA') return 'ENTREGADO';
      return null;
    };
  }, [canActualizar, rolCodigo, esVistaRepartidor]);

  const requiereSupervisorCierre = Boolean(
    cierreTarget &&
      cierreTarget.pedido.modalidadPago === 'PREPAGADO' &&
      !canAnularFacturaDirecto,
  );

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
            <Bike className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              {esVistaRepartidor ? 'Mis entregas' : 'Servicio a Domicilio'}
            </h1>
            <p className="text-xs text-slate-600">
              {esVistaRepartidor
                ? 'Entregas activas asignadas a tu usuario · Actualización automática'
                : 'Tablero operativo en tiempo real para pedidos a domicilio, para llevar y liquidación en caja'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canConfigurar && !esVistaRepartidor && (
            <div className="flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setTab('pedidos');
                  setSearchParams({});
                }}
                className={`min-h-[40px] rounded-lg px-3.5 text-xs font-extrabold transition ${
                  tab === 'pedidos' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                Tablero de pedidos
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('zonas');
                  setSearchParams({ tab: 'zonas' });
                }}
                className={`min-h-[40px] rounded-lg px-3.5 text-xs font-extrabold transition ${
                  tab === 'zonas' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                Zonas de entrega
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('clientes');
                  setSearchParams({ tab: 'clientes' });
                }}
                className={`min-h-[40px] rounded-lg px-3.5 text-xs font-extrabold transition ${
                  tab === 'clientes' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                Clientes web
              </button>
            </div>
          )}

          {!esVistaRepartidor && env.ENABLE_DELIVERY && env.ENABLE_PUBLIC_ORDERS && (
            <a
              href="/pedir"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3.5 text-xs font-extrabold text-brand-800 hover:bg-brand-100"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Menú público
            </a>
          )}

          {tab === 'pedidos' && (
            <button
              type="button"
              onClick={() => void cargarPedidos({ incremental: false })}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-extrabold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Actualizar
            </button>
          )}
        </div>
      </div>

      {error && <Alert type="error" message={error} />}
      {feedback && <Alert type="success" message={feedback} />}

      {tab === 'zonas' && canConfigurar ? (
        <ZonasEntregaPanel onZonasActualizadas={() => void cargarCatalogos()} />
      ) : tab === 'clientes' && canConfigurar ? (
        <ClientesWebPanel />
      ) : (
        <>
          {/* KPIs rápidos del tablero */}
          {resumen && !esVistaRepartidor && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {(
                [
                  { label: 'Nuevos', est: 'NUEVO' as const, val: resumen.porEstado.NUEVO, color: 'text-sky-700' },
                  { label: 'En cocina', est: 'EN_PREPARACION' as const, val: resumen.porEstado.EN_PREPARACION, color: 'text-amber-700' },
                  { label: 'Listos', est: 'LISTO' as const, val: resumen.porEstado.LISTO, color: 'text-emerald-700' },
                  { label: 'En ruta', est: 'EN_RUTA' as const, val: resumen.porEstado.EN_RUTA, color: 'text-indigo-700' },
                  { label: 'Entregados', est: 'ENTREGADO' as const, val: resumen.porEstado.ENTREGADO, color: 'text-slate-800' },
                ]
              ).map((k) => (
                <button
                  key={k.est}
                  type="button"
                  onClick={() => {
                    setSoloPendientes(false);
                    setEstadoFiltro(estadoFiltro === k.est ? '' : k.est);
                    setPage(1);
                  }}
                  className={`rounded-2xl border p-3.5 text-left transition ${
                    estadoFiltro === k.est && !soloPendientes
                      ? 'border-brand-700 bg-brand-50 ring-2 ring-brand-200'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <p className="text-xs font-bold uppercase text-slate-500">{k.label}</p>
                  <p className={`mt-1 text-2xl font-black ${k.color}`}>{k.val}</p>
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  setSoloPendientes(!soloPendientes);
                  setEstadoFiltro('');
                  setPage(1);
                }}
                className={`rounded-2xl border p-3.5 text-left transition ${
                  soloPendientes
                    ? 'border-amber-600 bg-amber-50 ring-2 ring-amber-200'
                    : resumen.pendientesLiquidarCount > 0
                      ? 'border-amber-300 bg-amber-50/50 hover:bg-amber-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <p className="text-xs font-bold uppercase text-amber-800">Sin liquidar</p>
                <p className="mt-1 text-2xl font-black text-amber-700">
                  {resumen.pendientesLiquidarCount}
                </p>
              </button>
            </div>
          )}

          {/* Filtros de tablero */}
          {!esVistaRepartidor && (
            <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <Field label="Estado" className="min-w-[150px]">
                <select
                  value={estadoFiltro}
                  disabled={soloPendientes}
                  onChange={(e) => {
                    setEstadoFiltro(e.target.value as EstadoPedidoDomicilio | '');
                    setPage(1);
                  }}
                  className="min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm"
                >
                  <option value="">Todos los estados</option>
                  {(Object.keys(ETIQUETA_ESTADO) as EstadoPedidoDomicilio[]).map((est) => (
                    <option key={est} value={est}>
                      {ETIQUETA_ESTADO[est]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Tipo de entrega" className="min-w-[155px]">
                <select
                  value={tipoEntregaFiltro}
                  onChange={(e) => {
                    setTipoEntregaFiltro(e.target.value as TipoEntregaPedido | '');
                    setPage(1);
                  }}
                  className="min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm"
                >
                  <option value="">Todos</option>
                  <option value="DELIVERY">Domicilio</option>
                  <option value="LLEVAR">Para llevar (Web)</option>
                </select>
              </Field>

              <Field label="Modalidad" className="min-w-[160px]">
                <select
                  value={modalidadFiltro}
                  disabled={soloPendientes}
                  onChange={(e) => {
                    setModalidadFiltro(e.target.value as ModalidadPagoDomicilio | '');
                    setPage(1);
                  }}
                  className="min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm"
                >
                  <option value="">Todas</option>
                  <option value="CONTRA_ENTREGA">Contra entrega</option>
                  <option value="PREPAGADO">Prepagado</option>
                </select>
              </Field>

              <Field label="Zona" className="min-w-[160px]">
                <select
                  value={zonaFiltro}
                  onChange={(e) => {
                    setZonaFiltro(e.target.value ? Number(e.target.value) : '');
                    setPage(1);
                  }}
                  className="min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm"
                >
                  <option value="">Todas las zonas</option>
                  {zonas.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.nombre}
                    </option>
                  ))}
                </select>
              </Field>

              {(estadoFiltro || modalidadFiltro || tipoEntregaFiltro || zonaFiltro || soloPendientes) && (
                <button
                  type="button"
                  onClick={() => {
                    setEstadoFiltro('');
                    setModalidadFiltro('');
                    setTipoEntregaFiltro('');
                    setZonaFiltro('');
                    setSoloPendientes(false);
                    setPage(1);
                  }}
                  className="min-h-[42px] rounded-xl border border-slate-300 px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}

          {/* Lista / Tarjetas (Vista móvil táctil para repartidor o tarjetas responsivas de tablero) */}
          {loading ? (
            <TableSkeleton rows={4} cols={5} />
          ) : pedidos.length === 0 ? (
            <EmptyState
              icon={Bike}
              title={esVistaRepartidor ? 'No tienes entregas activas asignadas' : 'Sin pedidos a domicilio'}
              description={
                esVistaRepartidor
                  ? 'Cuando caja te asigne una entrega aparecerá automáticamente aquí.'
                  : 'Registra pedidos desde Menú / Ventas seleccionando «Domicilio».'
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pedidos.map((p) => {
                const siguiente = botonesSiguienteEstado(p);
                const ocupado = procesandoId === p.id;
                const puedeCancelarEste =
                  canCancelar &&
                  !esVistaRepartidor &&
                  ['NUEVO', 'EN_PREPARACION', 'LISTO'].includes(p.estado);
                const puedeFallarEste = canActualizar && p.estado === 'EN_RUTA';

                return (
                  <article
                    key={p.id}
                    className={`flex flex-col justify-between rounded-2xl border bg-white p-4 shadow-sm transition ${
                      p.pendienteLiquidar
                        ? 'border-amber-400 ring-2 ring-amber-100'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-base font-black text-slate-900">
                              {p.numeroPedido}
                            </span>
                            <Badge variant={BADGE_ESTADO[p.estado]}>
                              {ETIQUETA_ESTADO[p.estado]}
                            </Badge>
                            <Badge variant={p.modalidadPago === 'PREPAGADO' ? 'success' : 'warning'}>
                              {p.modalidadPago === 'PREPAGADO' ? 'Prepagado' : 'Contra entrega'}
                            </Badge>
                            {p.tipoEntrega === 'LLEVAR' && (
                              <Badge variant="info">
                                <span className="inline-flex items-center gap-1">
                                  <Store className="h-3 w-3" aria-hidden="true" />
                                  Para llevar
                                </span>
                              </Badge>
                            )}
                            {p.origen === 'WEB' && (
                              <Badge variant="neutral">
                                <span className="inline-flex items-center gap-1">
                                  <Globe className="h-3 w-3" aria-hidden="true" />
                                  Pedido Web
                                </span>
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                            {formatDateTime(p.createdAt)} · ~{p.tiempoEstimadoMin} min
                          </p>
                        </div>
                        <p className="text-right text-lg font-black text-brand-700">
                          {formatCurrency(p.total)}
                        </p>
                      </div>

                      <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                        <p className="font-bold text-slate-900">{p.clienteNombre}</p>
                        <p className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                          {esVistaRepartidor && !p.clienteTelefono.includes('*') ? (
                            <a
                              href={`tel:${p.clienteTelefono}`}
                              className="font-bold text-brand-700 underline"
                            >
                              {p.clienteTelefono}
                            </a>
                          ) : (
                            <span>{p.clienteTelefono}</span>
                          )}
                        </p>
                        <p className="flex items-start gap-1.5">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                          <span>
                            <strong>{p.zonaNombre}</strong>
                            {p.direccion ? ` · ${p.direccion}` : ''}
                            {p.referencia ? ` (Ref: ${p.referencia})` : ''}
                          </span>
                        </p>
                        {p.modalidadPago === 'CONTRA_ENTREGA' && !p.ventaId && (
                          <p className="mt-1 rounded-lg bg-amber-100 px-2 py-1 font-extrabold text-amber-950">
                            Cobrar al entregar: {formatCurrency(p.total)} ({p.metodoPagoEsperado})
                            {p.montoConQuePaga && p.montoConQuePaga > p.total
                              ? ` · Llevar vuelto ${formatCurrency(p.montoConQuePaga - p.total)}`
                              : ''}
                          </p>
                        )}
                      </div>

                      {/* Ítems resumidos */}
                      <div className="space-y-0.5 text-xs text-slate-700">
                        {p.detalles.map((d) => (
                          <p key={d.id} className="truncate">
                            <strong>{d.cantidad}×</strong> {d.nombrePlatillo}
                            {d.notas ? ` (${d.notas})` : ''}
                          </p>
                        ))}
                        <p className="text-slate-500">
                          {p.tipoEntrega === 'LLEVAR' ? 'Para llevar' : `Envío: ${formatCurrency(p.costoEnvio)}`}
                          {p.comanda ? ` · Comanda ${p.comanda.numeroComanda} (${p.comanda.estadoCocina})` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Botones de acción (táctiles >= 44px para móvil y escritorio) */}
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      {siguiente && (
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={() => void handleAvanzarEstado(p, siguiente)}
                          className="flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-700 px-3 text-xs font-extrabold text-white hover:bg-brand-800 disabled:opacity-50"
                        >
                          {siguiente === 'EN_PREPARACION' ? (
                            <ChefHat className="h-4 w-4" aria-hidden="true" />
                          ) : siguiente === 'EN_RUTA' ? (
                            <Truck className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          )}
                          {siguiente === 'EN_PREPARACION'
                            ? p.origen === 'WEB'
                              ? 'Confirmar y enviar a cocina'
                              : 'Iniciar cocina'
                            : siguiente === 'LISTO'
                              ? 'Marcar listo'
                              : siguiente === 'EN_RUTA'
                                ? 'Marcar salida'
                                : p.tipoEntrega === 'LLEVAR'
                                  ? 'Entregar en mostrador'
                                  : 'Marcar entregado'}
                        </button>
                      )}

                      {canLiquidar && p.pendienteLiquidar && (
                        <button
                          type="button"
                          onClick={() => setLiquidarTarget(p)}
                          className="flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-extrabold text-white hover:bg-emerald-700"
                        >
                          <DollarSign className="h-4 w-4" aria-hidden="true" />
                          Liquidar cobro
                        </button>
                      )}

                      {puedeCancelarEste && (
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={() => {
                            setCierreTarget({ pedido: p, estadoNuevo: 'CANCELADO' });
                            setMotivoCierre('');
                          }}
                          className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 hover:bg-red-100"
                        >
                          <XCircle className="h-4 w-4" aria-hidden="true" />
                          Cancelar
                        </button>
                      )}

                      {puedeFallarEste && (
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={() => {
                            setCierreTarget({ pedido: p, estadoNuevo: 'FALLIDO' });
                            setMotivoCierre('');
                          }}
                          className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 hover:bg-red-100"
                        >
                          <XCircle className="h-4 w-4" aria-hidden="true" />
                          Fallido
                        </button>
                      )}

                      {!esVistaRepartidor && (
                        <>
                          <button
                            type="button"
                            onClick={() => imprimirPedido(p)}
                            aria-label={`Imprimir ticket de entrega ${p.numeroPedido}`}
                            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-300 px-2.5 text-slate-700 hover:bg-slate-100"
                            title="Imprimir ticket de entrega"
                          >
                            <Printer className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void abrirDetalle(p.id)}
                            aria-label={`Ver detalle e historial de ${p.numeroPedido}`}
                            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-300 px-2.5 text-slate-700 hover:bg-slate-100"
                            title="Ver detalle e historial"
                          >
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {meta.totalPages > 1 && (
            <Pagination
              meta={meta}
              onPageChange={(nextPage) => {
                setPage(nextPage);
              }}
            />
          )}
        </>
      )}

      {/* Modal de Liquidación CONTRA_ENTREGA */}
      <LiquidarPedidoModal
        pedido={liquidarTarget}
        onClose={() => setLiquidarTarget(null)}
        onLiquidado={async ({ pedido, diferenciaLiquidacion, ticket }) => {
          setLiquidarTarget(null);
          setFeedback(
            `Pedido ${pedido.numeroPedido} liquidado correctamente.${diferenciaLiquidacion !== 0 ? ` Diferencia registrada: ${formatCurrency(diferenciaLiquidacion)}.` : ''}`,
          );
          if (ticket) {
            setTicketImprimir({ ticket, includeFactura: true });
          }
          await cargarPedidos({ incremental: false });
        }}
      />

      {/* Modal de Cancelación / Fallido */}
      <Modal
        open={Boolean(cierreTarget)}
        onClose={() => setCierreTarget(null)}
        title={
          cierreTarget
            ? `${cierreTarget.estadoNuevo === 'CANCELADO' ? 'Cancelar' : 'Marcar fallido'} ${cierreTarget.pedido.numeroPedido}`
            : ''
        }
        maxWidthClass="max-w-lg"
      >
        {cierreTarget && (
          <form onSubmit={confirmarCierreNegativo} className="space-y-4">
            {(cierreTarget.estadoNuevo === 'FALLIDO' ||
              cierreTarget.pedido.estado === 'EN_PREPARACION' ||
              cierreTarget.pedido.estado === 'LISTO') && (
              <Alert
                type="warning"
                message="Este pedido ya inició preparación: se registrará merma automática de ingredientes según receta (PEDIDO_NO_ENTREGADO)."
              />
            )}
            {cierreTarget.pedido.modalidadPago === 'PREPAGADO' && (
              <Alert
                type="info"
                message="Pedido PREPAGADO: su factura se anulará automáticamente en la misma transacción."
              />
            )}
            <Field label="Motivo obligatorio (mínimo 5 caracteres)" required>
              <textarea
                rows={3}
                required
                minLength={5}
                maxLength={300}
                value={motivoCierre}
                onChange={(e) => setMotivoCierre(e.target.value)}
                placeholder="Ej. Cliente no contestó llamadas tras 15 min de espera..."
                className="w-full rounded-xl border border-slate-300 p-3 text-sm"
              />
            </Field>
            {requiereSupervisorCierre && (
              <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
                <p className="text-xs font-bold text-amber-900">
                  Autorización de supervisor requerida para anular factura prepagada
                </p>
                <Field label="Usuario o correo de supervisor" required>
                  <input
                    type="text"
                    required
                    value={supUser}
                    onChange={(e) => setSupUser(e.target.value)}
                    autoComplete="off"
                    className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                  />
                </Field>
                <Field label="Contraseña de supervisor" required>
                  <input
                    type="password"
                    required
                    value={supPass}
                    onChange={(e) => setSupPass(e.target.value)}
                    autoComplete="off"
                    className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
                  />
                </Field>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCierreTarget(null)}
                className="min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700"
              >
                Volver
              </button>
              <button
                type="submit"
                disabled={procesandoId === cierreTarget.pedido.id}
                className="min-h-[44px] rounded-xl bg-red-600 px-5 text-sm font-extrabold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal de Detalle e Historial de Estados */}
      <Modal
        open={Boolean(detallePedido)}
        onClose={() => setDetallePedido(null)}
        title={detallePedido ? `Detalle ${detallePedido.numeroPedido}` : ''}
        maxWidthClass="max-w-2xl"
      >
        {detallePedido && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">Cliente y entrega</p>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-slate-900">{detallePedido.clienteNombre}</p>
                  {detallePedido.clienteBloqueadoWeb && (
                    <Badge variant="danger">Bloqueado web</Badge>
                  )}
                </div>
                <p className="text-xs text-slate-600">Tel: {detallePedido.clienteTelefono}</p>
                <p className="text-xs text-slate-600">Zona: {detallePedido.zonaNombre}</p>
                {detallePedido.direccion && (
                  <p className="text-xs text-slate-600">Dir: {detallePedido.direccion}</p>
                )}
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-500">Pago y factura</p>
                <p className="font-bold text-slate-900">
                  {detallePedido.modalidadPago} · {formatCurrency(detallePedido.total)}
                </p>
                <p className="text-xs text-slate-600">
                  Platillos {formatCurrency(detallePedido.subtotalPlatillos)} + Envío{' '}
                  {formatCurrency(detallePedido.costoEnvio)}
                </p>
                {detallePedido.venta?.factura && (
                  <p className="text-xs font-bold text-emerald-700">
                    Factura {detallePedido.venta.factura.numeroCompleto} ({detallePedido.venta.factura.estado})
                  </p>
                )}
                {detallePedido.diferenciaLiquidacion !== null && detallePedido.diferenciaLiquidacion !== 0 && (
                  <p className="text-xs font-bold text-amber-800">
                    Diferencia liquidación: {formatCurrency(detallePedido.diferenciaLiquidacion)}
                  </p>
                )}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-slate-600">
                Historial inmutable de estados
              </h3>
              <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
                {(detallePedido.historial ?? []).map((h) => (
                  <li key={h.id} className="text-xs">
                    <p className="font-bold text-slate-900">
                      {h.estadoAnterior ? `${ETIQUETA_ESTADO[h.estadoAnterior]} → ` : ''}
                      {ETIQUETA_ESTADO[h.estadoNuevo]}
                    </p>
                    <p className="text-slate-600">
                      {formatDateTime(h.createdAt)} · {h.usuarioNombre ?? 'Sistema'}
                      {h.observacion ? ` · ${h.observacion}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Modal>

      <PrintTicketsModal
        ticket={ticketImprimir?.ticket ?? null}
        includeFactura={ticketImprimir?.includeFactura ?? false}
        includeComanda
        includeEntrega
        onClose={() => setTicketImprimir(null)}
      />
    </div>
  );
};
