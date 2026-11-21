import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle,
  Plus,
  ShoppingBag,
  SlidersHorizontal,
  Truck,
  History,
  BookOpen,
  Scale,
} from 'lucide-react';
import { env } from '../../config/env';
import {
  CompraModel,
  IngredienteModel,
  InventarioMovimientoModel,
  PaginationMeta,
  PlatilloModel,
  ProveedorModel,
  UnidadMedida,
} from '../../models';
import { inventarioService } from '../../services/inventario.service';
import { ventasService } from '../../services/ventas.service';
import { useAuthStore } from '../../store/auth.store';
import { formatCurrency, formatDateTime, lbToOzPreview } from '../../utils/formatters';
import { Alert } from '../components/common/Alert';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { Pagination } from '../components/common/Pagination';

type Tab = 'existencias' | 'compras' | 'proveedores' | 'kardex' | 'recetas';

export const InventarioPage: React.FC = () => {
  const canManage = useAuthStore((s) => s.can('inventario:gestionar'));
  const canBuy = useAuthStore((s) => s.can('inventario:comprar'));
  const canAdjust = useAuthStore((s) => s.can('inventario:ajustar'));

  const [tab, setTab] = useState<Tab>('existencias');
  const [ingredientes, setIngredientes] = useState<IngredienteModel[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorModel[]>([]);
  const [compras, setCompras] = useState<CompraModel[]>([]);
  const [movimientos, setMovimientos] = useState<InventarioMovimientoModel[]>([]);
  const [movMeta, setMovMeta] = useState<PaginationMeta>({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [platillos, setPlatillos] = useState<PlatilloModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modales Ingrediente / Proveedor / Ajuste / Precio
  const [ingModal, setIngModal] = useState(false);
  const [ingForm, setIngForm] = useState({
    codigo: '',
    nombre: '',
    proveedorId: '',
    stockMinimo: '2',
    unidadStockMinimo: 'lb' as UnidadMedida,
    stockInicial: '0',
    unidadStockInicial: 'lb' as UnidadMedida,
    precioPorLb: '0',
  });

  const [provModal, setProvModal] = useState(false);
  const [provForm, setProvForm] = useState({ nombre: '', nit: '', telefono: '', email: '', contacto: '' });

  const [ajusteTarget, setAjusteTarget] = useState<IngredienteModel | null>(null);
  const [ajusteForm, setAjusteForm] = useState({
    tipoAjuste: 'ENTRADA' as 'ENTRADA' | 'SALIDA',
    cantidad: '',
    unidad: 'oz' as UnidadMedida,
    motivo: '',
  });

  // Formulario Compra en LIBRAS -> conversión automática a ONZAS
  const [compraForm, setCompraForm] = useState({
    proveedorId: '',
    numeroDocumento: '',
    observaciones: '',
    ingredienteId: '',
    cantidadLb: '',
    precioPorLb: '',
  });

  // Edición de precio de platillo (auditado)
  const [precioTarget, setPrecioTarget] = useState<PlatilloModel | null>(null);
  const [nuevoPrecio, setNuevoPrecio] = useState('');
  const [motivoPrecio, setMotivoPrecio] = useState('');

  const cargarTodo = useCallback(async () => {
    setError(null);
    try {
      const [ings, provs, comp, movs, menu] = await Promise.all([
        inventarioService.listarIngredientes(),
        inventarioService.listarProveedores(),
        inventarioService.listarCompras(1),
        inventarioService.listarMovimientos({ page: 1 }),
        ventasService.obtenerMenu().catch(() => null),
      ]);
      setIngredientes(ings);
      setProveedores(provs);
      setCompras(comp.items);
      setMovimientos(movs.items);
      setMovMeta(movs.meta);
      if (menu) setPlatillos(menu.platillos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar inventario');
    }
  }, []);

  useEffect(() => {
    void cargarTodo();
  }, [cargarTodo]);

  const alertas = ingredientes.filter((i) => i.bajoStock);

  const handleCrearIngrediente = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await inventarioService.crearIngrediente({
        codigo: ingForm.codigo,
        nombre: ingForm.nombre,
        proveedorId: ingForm.proveedorId ? Number(ingForm.proveedorId) : null,
        stockMinimo: Number(ingForm.stockMinimo),
        unidadStockMinimo: ingForm.unidadStockMinimo,
        stockInicial: Number(ingForm.stockInicial || 0),
        unidadStockInicial: ingForm.unidadStockInicial,
        precioPorLb: Number(ingForm.precioPorLb || 0),
      });
      setIngModal(false);
      setSuccess('Ingrediente registrado correctamente.');
      await cargarTodo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando ingrediente');
    }
  };

  const handleCrearProveedor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await inventarioService.crearProveedor(provForm);
      setProvModal(false);
      setProvForm({ nombre: '', nit: '', telefono: '', email: '', contacto: '' });
      setSuccess('Proveedor creado correctamente.');
      await cargarTodo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando proveedor');
    }
  };

  const handleAjuste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ajusteTarget) return;
    setError(null);
    try {
      await inventarioService.ajustarStock(ajusteTarget.id, {
        tipoAjuste: ajusteForm.tipoAjuste,
        cantidad: Number(ajusteForm.cantidad),
        unidad: ajusteForm.unidad,
        motivo: ajusteForm.motivo,
      });
      setAjusteTarget(null);
      setAjusteForm({ tipoAjuste: 'ENTRADA', cantidad: '', unidad: 'oz', motivo: '' });
      setSuccess('Ajuste de inventario aplicado y registrado en auditoría.');
      await cargarTodo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error aplicando ajuste');
    }
  };

  const handleRegistrarCompra = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const lb = Number(compraForm.cantidadLb);
      await inventarioService.registrarCompra({
        proveedorId: Number(compraForm.proveedorId),
        numeroDocumento: compraForm.numeroDocumento || undefined,
        observaciones: compraForm.observaciones || undefined,
        items: [
          {
            ingredienteId: Number(compraForm.ingredienteId),
            cantidadLb: lb,
            precioPorLb: Number(compraForm.precioPorLb),
          },
        ],
      });
      setSuccess(
        `Compra registrada: ${lb} lb convertidas automáticamente a ${lbToOzPreview(lb)} oz en inventario.`,
      );
      setCompraForm({
        proveedorId: '',
        numeroDocumento: '',
        observaciones: '',
        ingredienteId: '',
        cantidadLb: '',
        precioPorLb: '',
      });
      await cargarTodo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error registrando compra');
    }
  };

  const handleActualizarPrecio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!precioTarget) return;
    setError(null);
    try {
      await ventasService.actualizarPlatillo(precioTarget.id, {
        precioVenta: Number(nuevoPrecio),
        motivo: motivoPrecio || 'Actualización de precio',
      });
      setPrecioTarget(null);
      setSuccess('Precio actualizado y registrado en auditoría (anterior vs. nuevo).');
      await cargarTodo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el precio');
    }
  };

  const cargarMovimientosPagina = async (page: number) => {
    const res = await inventarioService.listarMovimientos({ page });
    setMovimientos(res.items);
    setMovMeta(res.meta);
  };

  const previewOz = lbToOzPreview(Number(compraForm.cantidadLb || 0));
  const previewSubtotal = Number(compraForm.cantidadLb || 0) * Number(compraForm.precioPorLb || 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Inventario y Compras</h1>
          <p className="text-sm text-slate-500">
            Compras en libras (lb) con conversión automática a onzas (1 lb = {env.OZ_PER_LB} oz) para recetas
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => setProvModal(true)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <Truck className="h-4 w-4" />
                Nuevo Proveedor
              </button>
              <button
                type="button"
                onClick={() => setIngModal(true)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700"
              >
                <Plus className="h-4 w-4" />
                Nuevo Ingrediente
              </button>
            </>
          )}
        </div>
      </div>

      {alertas.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-2 font-bold text-amber-900">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Alerta de stock mínimo ({alertas.length} ingrediente(s) requieren reposición):
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {alertas.map((a) => (
              <span
                key={a.id}
                className="rounded-lg bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900"
              >
                {a.nombre}: {a.stockActualOz.toFixed(1)} oz ({a.stockActualLb.toFixed(2)} lb) / Mín:{' '}
                {a.stockMinimoOz.toFixed(1)} oz
              </span>
            ))}
          </div>
        </div>
      )}

      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'existencias', label: 'Existencias', Icon: Scale },
          { id: 'compras', label: 'Compras (lb → oz)', Icon: ShoppingBag },
          { id: 'proveedores', label: 'Proveedores', Icon: Truck },
          { id: 'kardex', label: 'Movimientos (Kardex)', Icon: History },
          { id: 'recetas', label: 'Recetas y Precios', Icon: BookOpen },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id as Tab)}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
              tab === id
                ? 'bg-slate-900 text-white shadow'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: EXISTENCIAS */}
      {tab === 'existencias' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-slate-500">
                <th className="py-3 px-2">Ingrediente</th>
                <th className="py-3 px-2">Proveedor</th>
                <th className="py-3 px-2 text-right">Stock (oz)</th>
                <th className="py-3 px-2 text-right">Equivalente (lb)</th>
                <th className="py-3 px-2 text-right">Mínimo (oz)</th>
                <th className="py-3 px-2 text-right">Costo prom.</th>
                <th className="py-3 px-2">Estado</th>
                {canAdjust && <th className="py-3 px-2 text-right">Ajuste</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ingredientes.map((ing) => (
                <tr key={ing.id} className="hover:bg-slate-50">
                  <td className="py-3 px-2">
                    <p className="font-bold text-slate-900">{ing.nombre}</p>
                    <p className="text-xs text-slate-400">{ing.codigo}</p>
                  </td>
                  <td className="py-3 px-2 text-slate-600">{ing.proveedorNombre ?? '—'}</td>
                  <td className="py-3 px-2 text-right font-bold text-slate-900">
                    {ing.stockActualOz.toFixed(2)} oz
                  </td>
                  <td className="py-3 px-2 text-right text-slate-600">
                    {ing.stockActualLb.toFixed(2)} lb
                  </td>
                  <td className="py-3 px-2 text-right text-slate-500">
                    {ing.stockMinimoOz.toFixed(1)} oz
                  </td>
                  <td className="py-3 px-2 text-right text-xs text-slate-600">
                    <p className="font-bold text-slate-800">{formatCurrency(ing.costoPromedioOz)}/oz</p>
                    <p>{formatCurrency(ing.costoPromedioLb)}/lb</p>
                  </td>
                  <td className="py-3 px-2">
                    {ing.bajoStock ? (
                      <Badge variant="danger">Stock bajo</Badge>
                    ) : (
                      <Badge variant="success">Óptimo</Badge>
                    )}
                  </td>
                  {canAdjust && (
                    <td className="py-3 px-2 text-right">
                      <button
                        type="button"
                        onClick={() => setAjusteTarget(ing)}
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        Ajustar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: COMPRAS EN LIBRAS -> ONZAS */}
      {tab === 'compras' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {canBuy && (
            <form
              onSubmit={handleRegistrarCompra}
              className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5"
            >
              <h2 className="text-lg font-bold text-slate-900">Registrar Compra en Libras (lb)</h2>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">Proveedor</label>
                <select
                  required
                  value={compraForm.proveedorId}
                  onChange={(e) => setCompraForm({ ...compraForm, proveedorId: e.target.value })}
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
                >
                  <option value="">-- Seleccionar proveedor --</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">Ingrediente</label>
                <select
                  required
                  value={compraForm.ingredienteId}
                  onChange={(e) => setCompraForm({ ...compraForm, ingredienteId: e.target.value })}
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
                >
                  <option value="">-- Seleccionar ingrediente --</option>
                  {ingredientes.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nombre} (actual: {i.stockActualLb.toFixed(2)} lb)
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Cantidad (lb)</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={compraForm.cantidadLb}
                    onChange={(e) => setCompraForm({ ...compraForm, cantidadLb: e.target.value })}
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Precio por lb (Q)</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={compraForm.precioPorLb}
                    onChange={(e) => setCompraForm({ ...compraForm, precioPorLb: e.target.value })}
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm font-bold"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-sky-50 p-3.5 text-sm text-sky-900">
                <p>
                  Conversión automática: <strong>{compraForm.cantidadLb || 0} lb</strong> ={' '}
                  <strong>{previewOz.toFixed(2)} oz</strong>
                </p>
                <p className="mt-1">
                  Total de compra: <strong>{formatCurrency(previewSubtotal)}</strong> (
                  {formatCurrency(Number(compraForm.precioPorLb || 0) / env.OZ_PER_LB)} / oz)
                </p>
              </div>

              <input
                type="text"
                placeholder="No. factura proveedor (opcional)"
                value={compraForm.numeroDocumento}
                onChange={(e) => setCompraForm({ ...compraForm, numeroDocumento: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
              />

              <button
                type="submit"
                className="min-h-[48px] w-full rounded-xl bg-brand-600 text-sm font-bold text-white hover:bg-brand-700"
              >
                Registrar Compra e Ingresar Onzas
              </button>
            </form>
          )}

          <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${canBuy ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
            <h2 className="mb-4 text-lg font-bold text-slate-900">Compras recientes</h2>
            <div className="space-y-3">
              {compras.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">Sin compras registradas todavía.</p>
              ) : (
                compras.map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-200 p-3.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-900">{c.proveedorNombre}</p>
                        <p className="text-xs text-slate-500">
                          {formatDateTime(c.fechaCompra)} · Por {c.usuarioNombre}
                          {c.numeroDocumento ? ` · Doc: ${c.numeroDocumento}` : ''}
                        </p>
                      </div>
                      <span className="text-base font-extrabold text-brand-700">
                        {formatCurrency(c.total)}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
                      {c.detalles.map((d, idx) => (
                        <p key={idx}>
                          • <strong>{d.ingredienteNombre}</strong>: {d.cantidadLb} lb →{' '}
                          <strong>{d.cantidadOz} oz</strong> ({formatCurrency(d.precioPorLb)}/lb)
                        </p>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PROVEEDORES */}
      {tab === 'proveedores' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {proveedores.map((p) => (
            <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="font-bold text-slate-900">{p.nombre}</h3>
              <p className="mt-1 text-xs text-slate-500">NIT: {p.nit || 'N/A'}</p>
              <p className="text-xs text-slate-600">Contacto: {p.contacto || '—'}</p>
              <p className="text-xs text-slate-600">Tel: {p.telefono || '—'}</p>
              <div className="mt-3 flex gap-2">
                <Badge variant="neutral">{p.ingredientesCount} ingredientes</Badge>
                <Badge variant="info">{p.comprasCount} compras</Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 4: KARDEX */}
      {tab === 'kardex' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-slate-500">
                  <th className="py-3 px-2">Fecha</th>
                  <th className="py-3 px-2">Ingrediente</th>
                  <th className="py-3 px-2">Tipo</th>
                  <th className="py-3 px-2 text-right">Movimiento (oz)</th>
                  <th className="py-3 px-2 text-right">Anterior → Nuevo</th>
                  <th className="py-3 px-2">Motivo / Responsable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movimientos.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2.5 px-2 text-slate-500">{formatDateTime(m.createdAt)}</td>
                    <td className="py-2.5 px-2 font-semibold">{m.ingredienteNombre}</td>
                    <td className="py-2.5 px-2">
                      <Badge
                        variant={
                          m.cantidadOz >= 0
                            ? 'success'
                            : m.tipo === 'SALIDA_MERMA'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {m.tipo}
                      </Badge>
                    </td>
                    <td
                      className={`py-2.5 px-2 text-right font-bold ${
                        m.cantidadOz >= 0 ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      {m.cantidadOz >= 0 ? '+' : ''}
                      {m.cantidadOz.toFixed(2)} oz
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-600">
                      {m.stockAnteriorOz.toFixed(1)} → <strong>{m.stockNuevoOz.toFixed(1)} oz</strong>
                    </td>
                    <td className="py-2.5 px-2 text-xs text-slate-600">
                      <p>{m.motivo || '—'}</p>
                      <p className="text-slate-400">{m.usuarioNombre}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={movMeta} onPageChange={(p) => void cargarMovimientosPagina(p)} />
        </div>
      )}

      {/* TAB 5: RECETAS Y PRECIOS */}
      {tab === 'recetas' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {platillos.map((p) => (
            <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-slate-900">{p.nombre}</h3>
                  <p className="text-xs text-slate-500">
                    {p.sku} · {p.categoriaNombre}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-extrabold text-brand-700">{formatCurrency(p.precioVenta)}</p>
                  <p className="text-xs text-slate-500">Costo receta: {formatCurrency(p.costoReceta)}</p>
                </div>
              </div>
              <div className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
                {p.receta.map((r) => (
                  <div key={r.ingredienteId} className="flex justify-between">
                    <span>{r.ingredienteNombre}</span>
                    <strong>{r.cantidadOz} oz</strong>
                  </div>
                ))}
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setPrecioTarget(p);
                    setNuevoPrecio(String(p.precioVenta));
                    setMotivoPrecio('');
                  }}
                  className="mt-3 w-full rounded-xl border border-slate-200 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cambiar precio (con auditoría)
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* MODALES */}
      <Modal open={ingModal} title="Nuevo Ingrediente" onClose={() => setIngModal(false)}>
        <form onSubmit={handleCrearIngrediente} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              placeholder="Código (ej. ING-020)"
              value={ingForm.codigo}
              onChange={(e) => setIngForm({ ...ingForm, codigo: e.target.value })}
              className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
            />
            <input
              required
              placeholder="Nombre del ingrediente"
              value={ingForm.nombre}
              onChange={(e) => setIngForm({ ...ingForm, nombre: e.target.value })}
              className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
          <select
            value={ingForm.proveedorId}
            onChange={(e) => setIngForm({ ...ingForm, proveedorId: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          >
            <option value="">Proveedor principal (opcional)</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-3">
            <input
              required
              type="number"
              step="0.01"
              placeholder="Stock mínimo"
              value={ingForm.stockMinimo}
              onChange={(e) => setIngForm({ ...ingForm, stockMinimo: e.target.value })}
              className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
            />
            <select
              value={ingForm.unidadStockMinimo}
              onChange={(e) =>
                setIngForm({ ...ingForm, unidadStockMinimo: e.target.value as UnidadMedida })
              }
              className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
            >
              <option value="lb">Libras (lb)</option>
              <option value="oz">Onzas (oz)</option>
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="Precio ref / lb (Q)"
              value={ingForm.precioPorLb}
              onChange={(e) => setIngForm({ ...ingForm, precioPorLb: e.target.value })}
              className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
          <button
            type="submit"
            className="min-h-[46px] w-full rounded-xl bg-brand-600 text-sm font-bold text-white"
          >
            Guardar Ingrediente
          </button>
        </form>
      </Modal>

      <Modal open={provModal} title="Nuevo Proveedor" onClose={() => setProvModal(false)}>
        <form onSubmit={handleCrearProveedor} className="space-y-3">
          <input
            required
            placeholder="Nombre comercial"
            value={provForm.nombre}
            onChange={(e) => setProvForm({ ...provForm, nombre: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="NIT"
              value={provForm.nit}
              onChange={(e) => setProvForm({ ...provForm, nit: e.target.value })}
              className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
            />
            <input
              placeholder="Teléfono"
              value={provForm.telefono}
              onChange={(e) => setProvForm({ ...provForm, telefono: e.target.value })}
              className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
          <input
            placeholder="Persona de contacto"
            value={provForm.contacto}
            onChange={(e) => setProvForm({ ...provForm, contacto: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
          <button
            type="submit"
            className="min-h-[46px] w-full rounded-xl bg-brand-600 text-sm font-bold text-white"
          >
            Guardar Proveedor
          </button>
        </form>
      </Modal>

      <Modal
        open={Boolean(ajusteTarget)}
        title={`Ajuste Manual — ${ajusteTarget?.nombre ?? ''}`}
        onClose={() => setAjusteTarget(null)}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleAjuste} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={ajusteForm.tipoAjuste}
              onChange={(e) =>
                setAjusteForm({ ...ajusteForm, tipoAjuste: e.target.value as 'ENTRADA' | 'SALIDA' })
              }
              className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-bold"
            >
              <option value="ENTRADA">Entrada (+)</option>
              <option value="SALIDA">Salida (-)</option>
            </select>
            <select
              value={ajusteForm.unidad}
              onChange={(e) =>
                setAjusteForm({ ...ajusteForm, unidad: e.target.value as UnidadMedida })
              }
              className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
            >
              <option value="oz">Onzas (oz)</option>
              <option value="lb">Libras (lb)</option>
            </select>
          </div>
          <input
            required
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Cantidad"
            value={ajusteForm.cantidad}
            onChange={(e) => setAjusteForm({ ...ajusteForm, cantidad: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
          <input
            required
            minLength={4}
            placeholder="Motivo del ajuste (obligatorio para auditoría)"
            value={ajusteForm.motivo}
            onChange={(e) => setAjusteForm({ ...ajusteForm, motivo: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
          <button
            type="submit"
            className="min-h-[46px] w-full rounded-xl bg-slate-900 text-sm font-bold text-white"
          >
            Aplicar Ajuste
          </button>
        </form>
      </Modal>

      <Modal
        open={Boolean(precioTarget)}
        title={`Cambiar precio — ${precioTarget?.nombre ?? ''}`}
        onClose={() => setPrecioTarget(null)}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleActualizarPrecio} className="space-y-3">
          <p className="text-sm text-slate-600">
            Precio actual: <strong>{formatCurrency(precioTarget?.precioVenta ?? 0)}</strong>
          </p>
          <input
            required
            type="number"
            step="0.01"
            min="0.01"
            value={nuevoPrecio}
            onChange={(e) => setNuevoPrecio(e.target.value)}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-base font-bold"
          />
          <input
            required
            placeholder="Motivo del cambio de precio"
            value={motivoPrecio}
            onChange={(e) => setMotivoPrecio(e.target.value)}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
          <button
            type="submit"
            className="min-h-[46px] w-full rounded-xl bg-brand-600 text-sm font-bold text-white"
          >
            Guardar nuevo precio
          </button>
        </form>
      </Modal>
    </div>
  );
};
