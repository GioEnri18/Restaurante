import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle,
  Plus,
  ShoppingBag,
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
} from '../../models';
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
import { KardexTable } from '../components/inventario/KardexTable';
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

type Tab = 'existencias' | 'compras' | 'proveedores' | 'kardex' | 'recetas';

export const InventarioPage: React.FC = () => {
  const canManage = useAuthStore((s) => s.can('inventario:gestionar'));
  const canManageMenu = useAuthStore((s) => s.can('ventas:gestionar_menu'));
  const isAdmin = useAuthStore((s) => s.isAdmin());
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
  const [provModal, setProvModal] = useState(false);
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

  const handleCrearIngrediente = async (payload: NuevoIngredientePayload): Promise<boolean> => {
    setError(null);
    try {
      await inventarioService.crearIngrediente(payload);
      setIngModal(false);
      setSuccess('Ingrediente registrado correctamente.');
      await cargarTodo();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando ingrediente');
      return false;
    }
  };

  const handleCrearProveedor = async (payload: NuevoProveedorPayload): Promise<boolean> => {
    setError(null);
    try {
      await inventarioService.crearProveedor(payload);
      setProvModal(false);
      setSuccess('Proveedor creado correctamente.');
      await cargarTodo();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando proveedor');
      return false;
    }
  };

  const handleAjuste = async (
    ingredienteId: number,
    payload: AjusteStockPayload,
  ): Promise<boolean> => {
    setError(null);
    try {
      await inventarioService.ajustarStock(ingredienteId, payload);
      setAjusteTarget(null);
      setSuccess('Ajuste de inventario aplicado y registrado en auditoría.');
      await cargarTodo();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error aplicando ajuste');
      return false;
    }
  };

  const handleRegistrarCompra = async (payload: {
    proveedorId: number;
    numeroDocumento?: string;
    observaciones?: string;
    ingredienteId: number;
    cantidadLb: number;
    precioPorLb: number;
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
            cantidadLb: payload.cantidadLb,
            precioPorLb: payload.precioPorLb,
          },
        ],
      });
      setSuccess(
        `Compra registrada: ${payload.cantidadLb} lb convertidas automáticamente a ${lbToOzPreview(payload.cantidadLb)} oz en inventario.`,
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

  const cargarMovimientosPagina = async (page: number) => {
    const res = await inventarioService.listarMovimientos({ page });
    setMovimientos(res.items);
    setMovMeta(res.meta);
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
        disponible: recetaLineas.length > 0 && habilitarVenta,
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

      {tab === 'existencias' && (
        <ExistenciasTable
          ingredientes={ingredientes}
          canAdjust={canAdjust}
          onAjustar={setAjusteTarget}
        />
      )}

      {tab === 'compras' && (
        <ComprasPanel
          canBuy={canBuy}
          proveedores={proveedores}
          ingredientes={ingredientes}
          compras={compras}
          onRegistrarCompra={handleRegistrarCompra}
        />
      )}

      {tab === 'proveedores' && <ProveedoresGrid proveedores={proveedores} />}

      {tab === 'kardex' && (
        <KardexTable
          movimientos={movimientos}
          meta={movMeta}
          onPageChange={(p) => void cargarMovimientosPagina(p)}
        />
      )}

      {tab === 'recetas' && (
        <RecetasPreciosGrid
          platillos={platillos}
          canManage={canManageMenu}
          canEditRecipe={canManage && canManageMenu}
          onCambiarPrecio={setPrecioTarget}
          onEditarReceta={abrirReceta}
          onCambiarFoto={isAdmin && canManageMenu ? abrirFoto : undefined}
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
            className="min-h-[44px] w-full rounded-xl bg-brand-600 text-sm font-bold text-white disabled:opacity-50"
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
              checked={recetaLineas.length > 0 && habilitarVenta}
              disabled={!recetaLineas.length}
              onChange={(event) => setHabilitarVenta(event.target.checked)}
            />
            Habilitar en ventas
          </label>
          {recetaError && <Alert type="error" message={recetaError} />}
          <button type="submit" className="min-h-[44px] w-full rounded-xl bg-brand-600 text-sm font-bold text-white">
            Guardar receta
          </button>
        </form>
      </Modal>
    </div>
  );
};
