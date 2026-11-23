import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Search, Eye, Printer, Ban, RotateCcw, Receipt } from 'lucide-react';
import { env } from '../../config/env';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { FacturaDetalleModel, FacturaResumenModel, PaginationMeta } from '../../models';
import { facturasService } from '../../services/facturas.service';
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
import { PrintTicketsModal } from '../components/print/PrintTicketsModal';

export const FacturasPage: React.FC = () => {
  const canReprint = useAuthStore((s) => s.can('facturas:reimprimir'));
  const canAnular = useAuthStore((s) => s.can('facturas:anular'));

  const [facturas, setFacturas] = useState<FacturaResumenModel[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Filtros obligatorios: número, fecha, cliente, monto, estado
  const [numero, setNumero] = useState('');
  const [cliente, setCliente] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [montoMin, setMontoMin] = useState('');
  const [montoMax, setMontoMax] = useState('');
  const [estado, setEstado] = useState('');

  // Debounce de 350ms solo para filtros de texto y monto; fechas y estado se aplican de inmediato
  const debouncedNumero = useDebouncedValue(numero, 350);
  const debouncedCliente = useDebouncedValue(cliente, 350);
  const debouncedMontoMin = useDebouncedValue(montoMin, 350);
  const debouncedMontoMax = useDebouncedValue(montoMax, 350);

  // Control de cancelación y orden de respuestas para evitar condiciones de carrera
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  // Modales
  const [detalle, setDetalle] = useState<FacturaDetalleModel | null>(null);
  const [ticketReimpresion, setTicketReimpresion] = useState<FacturaDetalleModel | null>(null);
  const [anularTarget, setAnularTarget] = useState<FacturaResumenModel | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [reintegrarStock, setReintegrarStock] = useState(false);
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(
    async (
      page = 1,
      filtrosOverride?: {
        numero: string;
        cliente: string;
        montoMin: string;
        montoMax: string;
      },
    ) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const reqId = ++requestIdRef.current;

      setLoading(true);
      setError(null);
      try {
        const res = await facturasService.listar(
          {
            page,
            numero: filtrosOverride ? filtrosOverride.numero : debouncedNumero,
            cliente: filtrosOverride ? filtrosOverride.cliente : debouncedCliente,
            fechaDesde,
            fechaHasta,
            montoMin: filtrosOverride ? filtrosOverride.montoMin : debouncedMontoMin,
            montoMax: filtrosOverride ? filtrosOverride.montoMax : debouncedMontoMax,
            estado,
          },
          controller.signal,
        );
        // Ignorar respuestas obsoletas si ya se disparó una búsqueda posterior
        if (reqId !== requestIdRef.current || controller.signal.aborted) return;
        setFacturas(res.items);
        setMeta(res.meta);
      } catch (err) {
        if (isAbortError(err) || reqId !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Error al cargar facturas');
      } finally {
        if (reqId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [debouncedNumero, debouncedCliente, fechaDesde, fechaHasta, debouncedMontoMin, debouncedMontoMax, estado],
  );

  // Al cambiar cualquier filtro vuelve automáticamente a la página 1 y cancela la petición previa al limpiar
  useEffect(() => {
    void cargar(1);
    return () => {
      abortRef.current?.abort();
    };
  }, [cargar]);

  const hayFiltros = Boolean(
    numero.trim() || cliente.trim() || fechaDesde || fechaHasta || montoMin || montoMax || estado,
  );

  const limpiarFiltros = () => {
    setNumero('');
    setCliente('');
    setFechaDesde('');
    setFechaHasta('');
    setMontoMin('');
    setMontoMax('');
    setEstado('');
  };

  const verDetalle = async (id: number) => {
    try {
      const data = await facturasService.obtenerDetalle(id);
      setDetalle(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el detalle');
    }
  };

  const handleReimprimir = async (id: number) => {
    setError(null);
    setFeedback(null);
    try {
      const data = await facturasService.reimprimir(id);
      setTicketReimpresion(data);
      setFeedback(`Reimpresión de ${data.factura.numeroCompleto} registrada en auditoría.`);
      await cargar(meta.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reimprimir factura');
    }
  };

  const handleAnular = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!anularTarget) return;
    setProcesando(true);
    setError(null);
    try {
      await facturasService.anular(anularTarget.id, motivoAnulacion, reintegrarStock);
      setFeedback(`Factura ${anularTarget.numeroCompleto} anulada correctamente y registrada en auditoría.`);
      setAnularTarget(null);
      setMotivoAnulacion('');
      setReintegrarStock(false);
      await cargar(meta.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular la factura');
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Historial de Facturas</h1>
          <p className="text-sm text-slate-500">
            Busca una factura para consultar sus datos, reimprimirla o anularla con un motivo.
          </p>
        </div>
      </div>

      {error && <Alert type="error" message={error} />}
      {feedback && <Alert type="success" message={feedback} />}

      {/* Filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Número de factura" srOnlyLabel>
            <input
              type="text"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="Número (ej. A-000001)"
              className="min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </Field>
          <Field label="Nombre del cliente o NIT" srOnlyLabel>
            <input
              type="text"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Cliente o NIT"
              className="min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </Field>
          <Field label="Fecha inicial" labelClassName="mb-1 block text-sm font-semibold text-slate-700">
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </Field>
          <Field label="Fecha final" labelClassName="mb-1 block text-sm font-semibold text-slate-700">
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </Field>
          <Field label={`Monto mínimo (${env.CURRENCY_SYMBOL})`} srOnlyLabel>
            <input
              type="number"
              step="0.01"
              value={montoMin}
              onChange={(e) => setMontoMin(e.target.value)}
              placeholder={`Monto mínimo (${env.CURRENCY_SYMBOL})`}
              className="min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </Field>
          <Field label={`Monto máximo (${env.CURRENCY_SYMBOL})`} srOnlyLabel>
            <input
              type="number"
              step="0.01"
              value={montoMax}
              onChange={(e) => setMontoMax(e.target.value)}
              placeholder={`Monto máximo (${env.CURRENCY_SYMBOL})`}
              className="min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </Field>
          <Field label="Estado de la factura" srOnlyLabel>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className="min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm"
            >
              <option value="">Todos los estados</option>
              <option value="EMITIDA">Emitidas</option>
              <option value="ANULADA">Anuladas</option>
            </select>
          </Field>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void cargar(1, { numero, cliente, montoMin, montoMax })}
              className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-700 px-3 text-sm font-bold text-white hover:bg-brand-800"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Buscar
            </button>
            <button
              type="button"
              onClick={limpiarFiltros}
              className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-slate-300 px-3 text-slate-600 hover:bg-slate-100"
              title="Limpiar filtros"
              aria-label="Limpiar filtros"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <caption className="sr-only">
              Listado de facturas emitidas y anuladas con totales y acciones
            </caption>
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th scope="col" className="py-3 px-2">Factura</th>
                <th scope="col" className="py-3 px-2">Fecha</th>
                <th scope="col" className="py-3 px-2">Cliente / NIT</th>
                <th scope="col" className="py-3 px-2">Pago / Servicio</th>
                <th scope="col" className="py-3 px-2 text-right">Total</th>
                <th scope="col" className="py-3 px-2">Estado</th>
                <th scope="col" className="py-3 px-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <TableSkeleton rows={6} cols={7} label="Cargando facturas..." />
              ) : facturas.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState
                      icon={Receipt}
                      title="No se encontraron facturas"
                      description={
                        hayFiltros
                          ? 'Ninguna factura coincide con los filtros actuales.'
                          : 'Todavía no se han emitido facturas en la sucursal.'
                      }
                      action={
                        hayFiltros
                          ? { label: 'Limpiar filtros', onClick: limpiarFiltros, variant: 'secondary' }
                          : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                facturas.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50">
                    <td className="py-3 px-2 font-bold text-slate-900">
                      {f.numeroCompleto}
                      {f.reimpresionesCount > 0 && (
                        <span className="ml-1.5 text-xs font-normal text-slate-600">
                          ({f.reimpresionesCount} reimp.)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-slate-600">{formatDateTime(f.createdAt)}</td>
                    <td className="py-3 px-2">
                      <p className="font-medium text-slate-800">{f.clienteNombre}</p>
                      <p className="text-xs text-slate-500">NIT: {f.clienteNit}</p>
                    </td>
                    <td className="py-3 px-2">
                      <span className="text-xs font-semibold text-slate-700">{f.metodoPago}</span>
                      <span className="mx-1 text-slate-300">·</span>
                      <span className="text-xs text-slate-500">
                        {f.tipoServicio}
                        {f.mesaNumero ? ` (${f.mesaNumero})` : ''}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right font-bold text-slate-900">
                      {formatCurrency(f.total)}
                    </td>
                    <td className="py-3 px-2">
                      <Badge variant={f.estado === 'EMITIDA' ? 'success' : 'danger'}>
                        {f.estado}
                      </Badge>
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => void verDetalle(f.id)}
                          aria-label={`Ver detalle de factura ${f.numeroCompleto}`}
                          className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          Ver
                        </button>
                        {canReprint && (
                          <button
                            type="button"
                            onClick={() => void handleReimprimir(f.id)}
                            aria-label={`Reimprimir factura ${f.numeroCompleto}`}
                            className="inline-flex h-9 items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                          >
                            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                            Reimprimir
                          </button>
                        )}
                        {canAnular && f.estado === 'EMITIDA' && (
                          <button
                            type="button"
                            onClick={() => {
                              setAnularTarget(f);
                              setMotivoAnulacion('');
                              setReintegrarStock(false);
                            }}
                            aria-label={`Anular factura ${f.numeroCompleto}`}
                            className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                          >
                            <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                            Anular
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination meta={meta} onPageChange={(p) => void cargar(p)} />
      </div>

      {/* Modal Detalle */}
      <Modal
        open={Boolean(detalle)}
        title={`Detalle Factura ${detalle?.factura.numeroCompleto ?? ''}`}
        onClose={() => setDetalle(null)}
      >
        {detalle && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4">
              <div>
                <p className="text-xs text-slate-500">Cliente</p>
                <p className="font-bold">{detalle.factura.clienteNombre}</p>
                <p className="text-xs text-slate-600">NIT: {detalle.factura.clienteNit}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Emisión y Estado</p>
                <p className="font-semibold">{formatDateTime(detalle.factura.createdAt)}</p>
                <Badge variant={detalle.factura.estado === 'EMITIDA' ? 'success' : 'danger'}>
                  {detalle.factura.estado}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-slate-500">Cajero / Mesero</p>
                <p className="font-medium">{detalle.venta.cajeroNombre}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Método de Pago</p>
                <p className="font-medium">
                  {detalle.venta.metodoPago} · {detalle.venta.tipoServicio}
                </p>
              </div>
            </div>

            {detalle.motivoAnulacion && (
              <Alert
                type="error"
                message={`Anulada por ${detalle.anuladaPorNombre ?? 'Usuario'} (${formatDateTime(detalle.anuladaEn)}): ${detalle.motivoAnulacion}`}
              />
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <caption className="sr-only">
                  Detalle de platillos incluidos en la factura {detalle.factura.numeroCompleto}
                </caption>
                <thead>
                  <tr className="border-b text-xs uppercase text-slate-500">
                    <th scope="col" className="py-2">Platillo</th>
                    <th scope="col" className="py-2 text-center">Cant.</th>
                    <th scope="col" className="py-2 text-right">Unitario</th>
                    <th scope="col" className="py-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detalle.venta.detalles.map((d) => (
                    <tr key={d.id}>
                      <td className="py-2">
                        <p className="font-semibold">{d.nombrePlatillo}</p>
                        {d.notas && <p className="text-xs text-amber-700">Nota: {d.notas}</p>}
                      </td>
                      <td className="py-2 text-center">{d.cantidad}</td>
                      <td className="py-2 text-right">{formatCurrency(d.precioUnitario)}</td>
                      <td className="py-2 text-right font-bold">{formatCurrency(d.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-1 border-t border-slate-200 pt-3 text-right">
              <p className="text-slate-600">
                Base imponible: <strong>{formatCurrency(detalle.factura.subtotalSinIva)}</strong>
              </p>
              <p className="text-slate-600">
                IVA {(env.IVA_RATE * 100).toFixed(0)}% incluido:{' '}
                <strong>{formatCurrency(detalle.factura.ivaMonto)}</strong>
              </p>
              <p className="text-lg font-extrabold text-slate-900">
                Total: {formatCurrency(detalle.factura.total)}
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Anulación con motivo + reintegro opcional de inventario */}
      <Modal
        open={Boolean(anularTarget)}
        title={`Anular Factura ${anularTarget?.numeroCompleto ?? ''}`}
        onClose={() => setAnularTarget(null)}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleAnular} className="space-y-4">
          <Alert
            type="warning"
            message="Las facturas no se borran ni editan. La anulación revertirá automáticamente el monto en caja y quedará en auditoría."
          />

          <Field
            label="Motivo obligatorio de anulación"
            required
            labelClassName="mb-1 block text-sm font-bold text-slate-700"
          >
            <textarea
              minLength={5}
              rows={3}
              value={motivoAnulacion}
              onChange={(e) => setMotivoAnulacion(e.target.value)}
              placeholder="Ej. Error en NIT del cliente / Pedido duplicado..."
              className="w-full rounded-xl border border-slate-300 p-3 text-sm"
            />
          </Field>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <input
              type="checkbox"
              checked={reintegrarStock}
              onChange={(e) => setReintegrarStock(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            <span className="text-sm text-slate-700">
              <strong>Reintegrar ingredientes al inventario</strong>
              <span className="block text-xs text-slate-500">
                Activa esta opción solo si los platillos NO fueron cocinados todavía.
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAnularTarget(null)}
              className="min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={procesando}
              className="min-h-[44px] rounded-xl bg-red-600 px-5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {procesando ? 'Anulando...' : 'Confirmar Anulación'}
            </button>
          </div>
        </form>
      </Modal>

      <PrintTicketsModal
        ticket={ticketReimpresion}
        includeComanda={false}
        autoPrint
        onClose={() => setTicketReimpresion(null)}
      />
    </div>
  );
};
