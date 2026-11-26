import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus,
  ShoppingBag,
  Truck,
  History,
  BookOpen,
  Scale,
  Trash2,
} from 'lucide-react';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import {
  CategoriaModel,
  CompraModel,
  IngredienteModel,
  InventarioMovimientoModel,
  PaginationMeta,
  PlatilloModel,
  ProveedorModel,
  UnidadMedida,
} from '../../models';
import { isAbortError } from '../../services/httpClient';
import { inventarioService } from '../../services/inventario.service';
import { ventasService } from '../../services/ventas.service';
import { useAuthStore } from '../../store/auth.store';
import { lbToOzPreview } from '../../utils/formatters';
import { Alert } from '../components/common/Alert';
import { AjusteStockModal, AjusteStockPayload } from '../components/inventario/AjusteStockModal';
import { CambiarPrecioModal } from '../components/inventario/CambiarPrecioModal';
import { ComprasPanel } from '../components/inventario/ComprasPanel';
import { Modal } from '../components/common/Modal';
import { FotoPlatillo } from '../components/common/FotoPlatillo';
import { SelectorFotoPlatillo } from '../components/common/SelectorFotoPlatillo';
import { LineaRecetaForm, RecetaCampos } from '../components/inventario/RecetaCampos';
import { ExistenciasTable } from '../components/inventario/ExistenciasTable';
import { AlertasStockPanel } from '../components/inventario/AlertasStockPanel';
import { KardexTable } from '../components/inventario/KardexTable';
import {
  NuevaCategoriaModal,
  NuevaCategoriaPayload,
} from '../components/inventario/NuevaCategoriaModal';
import { NuevoPlatilloModal } from '../components/inventario/NuevoPlatilloModal';
import {
  NuevoIngredienteModal,
  NuevoIngredientePayload,
} from '../components/inventario/NuevoIngredienteModal';
import {
  NuevoProveedorModal,
  NuevoProveedorPayload,
} from '../components/inventario/NuevoProveedorModal';
import { ProveedoresGrid } from '../components/inventario/ProveedoresGrid';
import { RecetasPreciosGrid } from '../components/inventario/RecetasPreciosGrid';
import { MermasPorIngredientePanel } from '../components/inventario/MermasPorIngredientePanel';

type Tab = 'existencias' | 'mermas' | 'compras' | 'proveedores' | 'kardex' | 'recetas';

export const InventarioPage: React.FC = () => {
  const canManage = useAuthStore((s) => s.can('inventario:gestionar'));
  const canManageMenu = useAuthStore((s) => s.can('ventas:gestionar_menu'));
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const canBuy = useAuthStore((s) => s.can('inventario:comprar'));
  const canAdjust = useAuthStore((s) => s.can('inventario:ajustar'));

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const validTabs: Tab[] = ['existencias', 'mermas', 'compras', 'proveedores', 'kardex', 'recetas'];
  const [tab, setTab] = useState<Tab>(
    initialTab && validTabs.includes(initialTab as Tab) ? (initialTab as Tab) : 'existencias',
  );

  useEffect(() => {
    const paramTab = searchParams.get('tab');
    if (paramTab && validTabs.includes(paramTab as Tab)) {
      setTab(paramTab as Tab);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiarTab = (next: Tab) => {
    setTab(next);
    setSearchParams(next === 'existencias' ? {} : { tab: next }, { replace: true });
  };
  const [ingredienteCompra, setIngredienteCompra] = useState<IngredienteModel | null>(null);
  const [proveedorCompraNuevo, setProveedorCompraNuevo] = useState<number | null>(null);
  const [ingredientes, setIngredientes] = useState<IngredienteModel[]>([]);
  const [alertas, setAlertas] = useState<IngredienteModel[] | null>(null);
  const [cargandoTab, setCargandoTab] = useState(true);
  const [existencias, setExistencias] = useState<IngredienteModel[]>([]);
  const [existenciasCargando, setExistenciasCargando] = useState(true);
  const [metaExistencias, setMetaExistencias] = useState<PaginationMeta>({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [paginaExistencias, setPaginaExistencias] = useState(1);
  const [versionExistencias, actualizarExistencias] = useState(0);
  const [busquedaExistencias, setBusquedaExistencias] = useState('');
  const debouncedBusquedaExistencias = useDebouncedValue(busquedaExistencias, 350);
  const [soloPorReponer, setSoloPorReponer] = useState(false);
  const [enfocarPendientes, setEnfocarPendientes] = useState(false);
  const tablaExistencias = React.useRef<HTMLDivElement>(null);
  const abortTodoRef = useRef<AbortController | null>(null);
  const abortPaginaRef = useRef<AbortController | null>(null);
  const [proveedores, setProveedores] = useState<ProveedorModel[]>([]);
  const [compras, setCompras] = useState<CompraModel[]>([]);
  const [comprasMeta, setComprasMeta] = useState<PaginationMeta>({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [movimientos, setMovimientos] = useState<InventarioMovimientoModel[]>([]);
  const [movMeta, setMovMeta] = useState<PaginationMeta>({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [platillos, setPlatillos] = useState<PlatilloModel[]>([]);
  const [categorias, setCategorias] = useState<CategoriaModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modales Ingrediente / Proveedor / Ajuste / Precio / Categoría / Platillo
  const [ingModal, setIngModal] = useState(false);
  const [provModal, setProvModal] = useState(false);
  const [catModal, setCatModal] = useState(false);
  const [platilloModal, setPlatilloModal] = useState(false);
  const [ajusteTarget, setAjusteTarget] = useState<IngredienteModel | null>(null);
  const [precioTarget, setPrecioTarget] = useState<PlatilloModel | null>(null);
  const [recetaTarget, setRecetaTarget] = useState<PlatilloModel | null>(null);
  const [recetaLineas, setRecetaLineas] = useState<LineaRecetaForm[]>([]);
  const [habilitarVenta, setHabilitarVenta] = useState(false);
  const [recetaError, setRecetaError] = useState<string | null>(null);
  const [fotoTarget, setFotoTarget] = useState<PlatilloModel | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoError, setFotoError] = useState<string | null>(null);
  const [guardandoFoto, setGuardandoFoto] = useState(false);

  const abrirFoto = (platillo: PlatilloModel) => {
    setFoto(null);
    setFotoError(null);
    setFotoTarget(platillo);
  };

  const guardarFoto = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fotoTarget || !foto || guardandoFoto) return;
    if (foto.size > 5000000) {
      setFotoError('La foto debe pesar como máximo 5 MB');
      return;
    }
    setFotoError(null);
    setGuardandoFoto(true);
    try {
      const { data: { imagenUrl } } = await ventasService.subirFotoPlatillo(fotoTarget.id, foto);
      setPlatillos((actuales) => actuales.map((platillo) =>
        platillo.id === fotoTarget.id ? { ...platillo, imagenUrl } : platillo));
      setFotoTarget(null);
      setSuccess('Foto del platillo actualizada.');
    } catch (err) {
      setFotoError(err instanceof Error ? err.message : 'No se pudo guardar la foto');
    } finally {
      setGuardandoFoto(false);
    }
  };

  const cargarTodo = useCallback(async () => {
    abortTodoRef.current?.abort();
    const controller = new AbortController();
    abortTodoRef.current = controller;

    setCargandoTab(true);
    setError(null);
    if (tab === 'existencias') actualizarExistencias((version) => version + 1);
    try {
      const [ings, provs, comp, movs, menu, pendientes] = await Promise.all([
        tab === 'compras' || tab === 'recetas' ? inventarioService.listarIngredientes(undefined, controller.signal) : null,
        canManage || tab === 'compras' || tab === 'proveedores' ? inventarioService.listarProveedores(controller.signal) : null,
        tab === 'compras' ? inventarioService.listarCompras(1, controller.signal) : null,
        tab === 'kardex' ? inventarioService.listarMovimientos({ page: 1 }, controller.signal) : null,
        tab === 'recetas' ? ventasService.obtenerMenu().catch(() => null) : null,
        tab === 'existencias' || tab === 'compras' ? inventarioService.listarAlertas(controller.signal) : null,
      ]);
      if (controller.signal.aborted) return;
      if (ings) setIngredientes(ings);
      if (pendientes) setAlertas(pendientes);
      if (provs) setProveedores(provs);
      if (comp) {
        setCompras(comp.items);
        setComprasMeta(comp.meta);
      }
      if (movs) {
        setMovimientos(movs.items);
        setMovMeta(movs.meta);
      }
      if (menu) {
        setPlatillos(menu.platillos);
        setCategorias(menu.categorias);
      }
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Error al cargar inventario');
    } finally {
      if (!controller.signal.aborted) setCargandoTab(false);
    }
  }, [canManage, tab]);

  useEffect(() => {
    void cargarTodo();
    return () => {
      abortTodoRef.current?.abort();
      abortPaginaRef.current?.abort();
    };
  }, [cargarTodo]);

  useEffect(() => {
    if (tab !== 'existencias') return;
    const controller = new AbortController();
    setExistenciasCargando(true);
    void inventarioService
      .listarExistencias(paginaExistencias, debouncedBusquedaExistencias, soloPorReponer, controller.signal)
      .then(({ items, meta }) => {
        if (controller.signal.aborted) return;
        if (paginaExistencias > meta.totalPages) {
          setPaginaExistencias(meta.totalPages);
          return;
        }
        setExistencias(items);
        setMetaExistencias(meta);
        setExistenciasCargando(false);
      })
      .catch((err: unknown) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        setExistenciasCargando(false);
        setError(err instanceof Error ? err.message : 'No se pudieron cargar las existencias');
      });
    return () => {
      controller.abort();
    };
  }, [tab, paginaExistencias, debouncedBusquedaExistencias, soloPorReponer, versionExistencias]);

  const buscarExistencias = (busqueda: string) => {
    setBusquedaExistencias(busqueda);
    setPaginaExistencias(1);
  };

  useEffect(() => {
    if (!enfocarPendientes || tab !== 'existencias') return;
    tablaExistencias.current?.focus();
    setEnfocarPendientes(false);
  }, [enfocarPendientes, tab]);

  const verPendientes = () => {
    buscarExistencias('');
    setSoloPorReponer(true);
    setEnfocarPendientes(true);
    cambiarTab('existencias');
  };

  const abrirCompra = (ingrediente: IngredienteModel) => {
    setIngredienteCompra(ingrediente);
    setProveedorCompraNuevo(null);
    cambiarTab('compras');
  };

  const alertasStock = alertas && (
    <AlertasStockPanel ingredientes={alertas} onComprar={canBuy ? abrirCompra : undefined}
      onVerPendientes={verPendientes} />
  );

  const handleCrearIngrediente = async (payload: NuevoIngredientePayload) => {
    setError(null);
    setSuccess(null);
    await inventarioService.crearIngrediente(payload);
    setSuccess('Ingrediente registrado correctamente.');
    void cargarTodo();
  };

  const handleCrearProveedor = async (payload: NuevoProveedorPayload): Promise<void> => {
    setError(null);
    const proveedor = await inventarioService.crearProveedor(payload);
    setProveedores((actuales) => [...actuales, proveedor].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    if (tab === 'compras') setProveedorCompraNuevo(proveedor.id);
    setSuccess('Proveedor creado correctamente.');
  };

  const handleAjuste = async (
    ingredienteId: number,
    payload: AjusteStockPayload,
  ): Promise<void> => {
    setError(null);
    setSuccess(null);
    await inventarioService.ajustarStock(ingredienteId, payload);
    setSuccess('Ajuste de inventario aplicado y registrado en auditoría.');
    void cargarTodo();
  };

  const handleRegistrarCompra = async (payload: {
    proveedorId: number;
    numeroDocumento?: string;
    observaciones?: string;
    ingredienteId: number;
    cantidad: number;
    unidad: UnidadMedida;
    precioUnitario: number;
  }): Promise<boolean> => {
    setError(null);
    try {
      await inventarioService.registrarCompra({
        proveedorId: payload.proveedorId,
        numeroDocumento: payload.numeroDocumento,
        observaciones: payload.observaciones,
        items: [
          {
            ingredienteId: payload.ingredienteId,
            cantidad: payload.cantidad,
            unidad: payload.unidad,
            precioUnitario: payload.precioUnitario,
          },
        ],
      });
      setSuccess(
        `Compra registrada. Se sumaron ${payload.unidad === 'lb' ? lbToOzPreview(payload.cantidad) : payload.cantidad} oz al inventario.`,
      );
      await cargarTodo();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error registrando compra');
      return false;
    }
  };

  const handleActualizarPrecio = async (
    platilloId: number,
    precioVenta: number,
    motivo: string,
  ) => {
    setError(null);
    try {
      await ventasService.actualizarPlatillo(platilloId, { precioVenta, motivo });
      setPrecioTarget(null);
      setSuccess('Precio actualizado y registrado en auditoría (anterior vs. nuevo).');
      await cargarTodo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el precio');
    }
  };

  const handleCrearCategoria = async (payload: NuevaCategoriaPayload): Promise<boolean> => {
    setError(null);
    try {
      await ventasService.crearCategoria(payload);
      setCatModal(false);
      setSuccess(`Categoría "${payload.nombre}" creada correctamente.`);
      await cargarTodo();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la categoría');
      return false;
    }
  };

  const cargarComprasPagina = async (page: number) => {
    abortPaginaRef.current?.abort();
    const controller = new AbortController();
    abortPaginaRef.current = controller;
    setCargandoTab(true);
    setError(null);
    try {
      const resultado = await inventarioService.listarCompras(page, controller.signal);
      if (controller.signal.aborted) return;
      setCompras(resultado.items);
      setComprasMeta(resultado.meta);
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'No se pudo cargar la página de compras');
    } finally {
      if (!controller.signal.aborted) setCargandoTab(false);
    }
  };

  const cargarMovimientosPagina = async (page: number) => {
    abortPaginaRef.current?.abort();
    const controller = new AbortController();
    abortPaginaRef.current = controller;
    setCargandoTab(true);
    setError(null);
    try {
      const res = await inventarioService.listarMovimientos({ page }, controller.signal);
      if (controller.signal.aborted) return;
      setMovimientos(res.items);
      setMovMeta(res.meta);
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'No se pudo cargar el historial de movimientos');
    } finally {
      if (!controller.signal.aborted) setCargandoTab(false);
    }
  };

  const abrirReceta = (platillo: PlatilloModel) => {
    setRecetaLineas(platillo.receta.map(({ ingredienteId, cantidadOz }) => ({
      ingredienteId,
      cantidadOz: String(cantidadOz),
    })));
    setHabilitarVenta(platillo.disponible || !platillo.receta.length);
    setRecetaError(null);
    setRecetaTarget(platillo);
  };

  const guardarReceta = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!recetaTarget) return;
    setRecetaError(null);
    try {
      await ventasService.actualizarPlatillo(recetaTarget.id, {
        receta: recetaLineas.map(({ ingredienteId, cantidadOz }) => ({
          ingredienteId,
          cantidadOz: Number(cantidadOz),
        })),
        disponible: habilitarVenta,
      });
      setRecetaTarget(null);
      setSuccess('Receta actualizada. El nuevo consumo se aplica a partir del siguiente cobro.');
      await cargarTodo();
    } catch (err) {
      setRecetaError(err instanceof Error ? err.message : 'No se pudo guardar la receta');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Inventario y Compras</h1>
          <p className="text-sm text-slate-500">
            Ingresa las compras para sumar existencias y actualizar el costo promedio.
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
                <Truck className="h-4 w-4" aria-hidden="true" />
                Nuevo Proveedor
              </button>
              <button
                type="button"
                onClick={() => setIngModal(true)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-bold text-white hover:bg-brand-800"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nuevo Ingrediente
              </button>
            </>
          )}
        </div>
      </div>

      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'existencias', label: 'Existencias', Icon: Scale },
          { id: 'mermas', label: 'Mermas por ingrediente', Icon: Trash2 },
          { id: 'compras', label: 'Compras', Icon: ShoppingBag },
          { id: 'proveedores', label: 'Proveedores', Icon: Truck },
          { id: 'kardex', label: 'Historial de entradas y salidas', Icon: History },
          { id: 'recetas', label: 'Recetas y Precios', Icon: BookOpen },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setIngredienteCompra(null);
              setProveedorCompraNuevo(null);
              buscarExistencias('');
              setSoloPorReponer(false);
              cambiarTab(id as Tab);
            }}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
              tab === id
                ? 'bg-slate-900 text-white shadow'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'existencias' && (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0" ref={tablaExistencias} tabIndex={-1}>
            <ExistenciasTable ingredientes={existencias} cargando={existenciasCargando} canAdjust={canAdjust} canBuy={canBuy}
              busqueda={busquedaExistencias} onBuscar={buscarExistencias}
              meta={metaExistencias} onPageChange={setPaginaExistencias}
              soloPorReponer={soloPorReponer} onAlternarPorReponer={() => {
                setPaginaExistencias(1);
                setSoloPorReponer((actual) => !actual);
              }}
              onNuevoIngrediente={canManage ? () => setIngModal(true) : undefined}
              onVerMermas={() => cambiarTab('mermas')}
              onComprar={abrirCompra} onAjustar={setAjusteTarget} />
          </div>
          {alertasStock}
        </div>
      )}

      {tab === 'mermas' && <MermasPorIngredientePanel />}

      {tab === 'compras' && (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <ComprasPanel
          key={ingredienteCompra?.id ?? 'compras'}
          cargando={cargandoTab}
          canBuy={canBuy}
          ingredienteInicial={ingredienteCompra}
          proveedorCompraNuevo={proveedorCompraNuevo}
          onNuevoProveedor={canManage ? () => setProvModal(true) : undefined}
          proveedores={proveedores}
          ingredientes={ingredientes}
          compras={compras}
          comprasMeta={comprasMeta}
          onPaginaCompras={(page) => void cargarComprasPagina(page)}
          onRegistrarCompra={handleRegistrarCompra}
        />
        {alertasStock}
        </div>
      )}

      {tab === 'proveedores' && (
        <ProveedoresGrid
          proveedores={proveedores}
          cargando={cargandoTab}
          onNuevoProveedor={canManage ? () => setProvModal(true) : undefined}
        />
      )}

      {tab === 'kardex' && (
        <KardexTable
          movimientos={movimientos}
          cargando={cargandoTab}
          meta={movMeta}
          onPageChange={(p) => void cargarMovimientosPagina(p)}
          onIrACompras={canBuy ? () => cambiarTab('compras') : undefined}
        />
      )}

      {tab === 'recetas' && (
        <RecetasPreciosGrid
          platillos={platillos}
          cargando={cargandoTab}
          canManage={canManageMenu}
          canEditRecipe={canManage && canManageMenu}
          canCreateMenu={isAdmin && canManageMenu}
          onCambiarPrecio={setPrecioTarget}
          onEditarReceta={abrirReceta}
          onCambiarFoto={isAdmin && canManageMenu ? abrirFoto : undefined}
          onNuevoPlatillo={isAdmin && canManageMenu ? () => setPlatilloModal(true) : undefined}
          onNuevaCategoria={isAdmin && canManageMenu ? () => setCatModal(true) : undefined}
        />
      )}

      <NuevoIngredienteModal
        open={ingModal}
        proveedores={proveedores}
        onClose={() => setIngModal(false)}
        onGuardar={handleCrearIngrediente}
      />

      <NuevoProveedorModal
        open={provModal}
        onClose={() => setProvModal(false)}
        onGuardar={handleCrearProveedor}
      />

      <AjusteStockModal
        target={ajusteTarget}
        onClose={() => setAjusteTarget(null)}
        onAplicar={handleAjuste}
      />

      <CambiarPrecioModal
        target={precioTarget}
        onClose={() => setPrecioTarget(null)}
        onGuardar={handleActualizarPrecio}
      />
      <Modal
        open={Boolean(fotoTarget)}
        title={`Foto de ${fotoTarget?.nombre ?? ''}`}
        onClose={() => { if (!guardandoFoto) setFotoTarget(null); }}
      >
        <form onSubmit={guardarFoto} className="space-y-3">
          <FotoPlatillo ruta={fotoTarget?.imagenUrl ?? null} className="max-h-32 rounded-lg object-contain" />
          <SelectorFotoPlatillo onChange={setFoto} disabled={guardandoFoto} />
          {fotoError && <Alert type="error" message={fotoError} />}
          <button
            type="submit"
            disabled={!foto || guardandoFoto}
            className="min-h-[44px] w-full rounded-xl bg-brand-700 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {guardandoFoto ? 'Guardando…' : 'Guardar foto'}
          </button>
        </form>
      </Modal>
      <Modal
        open={Boolean(recetaTarget)}
        title={`Receta — ${recetaTarget?.nombre ?? ''}`}
        onClose={() => setRecetaTarget(null)}
      >
        <form onSubmit={guardarReceta} className="space-y-3">
          <RecetaCampos ingredientes={ingredientes} lineas={recetaLineas} onChange={setRecetaLineas} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={habilitarVenta}
              onChange={(event) => setHabilitarVenta(event.target.checked)}
            />
            Habilitar en ventas
          </label>
          {recetaError && <Alert type="error" message={recetaError} />}
          <button type="submit" className="min-h-[44px] w-full rounded-xl bg-brand-700 text-sm font-bold text-white hover:bg-brand-800">
            Guardar receta
          </button>
        </form>
      </Modal>
      {isAdmin && canManageMenu && (
        <>
          <NuevoPlatilloModal
            open={platilloModal}
            categorias={categorias}
            ingredientes={ingredientes}
            onNuevaCategoria={() => setCatModal(true)}
            onClose={() => setPlatilloModal(false)}
            onCreated={async (msg, avisoFoto) => {
              setSuccess(msg);
              if (avisoFoto) setError(avisoFoto);
              await cargarTodo();
            }}
          />
          <NuevaCategoriaModal
            open={catModal}
            onClose={() => setCatModal(false)}
            onGuardar={handleCrearCategoria}
          />
        </>
      )}
    </div>
  );
};
