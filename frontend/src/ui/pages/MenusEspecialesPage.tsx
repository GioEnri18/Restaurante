import React, { useEffect, useState, useCallback } from 'react';
import {
  CalendarClock,
  Plus,
  BellRing,
  Sparkles,
  Edit,
  Trash2,
  Power,
  UtensilsCrossed,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { env } from '../../config/env';
import { CategoriaModel, IngredienteModel, MenuEspecialModel, PlatilloModel } from '../../models';
import { inventarioService } from '../../services/inventario.service';
import { ventasService } from '../../services/ventas.service';
import { mensajeErrorFormulario } from '../../services/httpClient';
import { useAuthStore } from '../../store/auth.store';
import { formatCurrency, formatDateOnly } from '../../utils/formatters';
import { Alert } from '../components/common/Alert';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { SelectorFotoPlatillo } from '../components/common/SelectorFotoPlatillo';
import { LineaRecetaForm, RecetaCampos } from '../components/inventario/RecetaCampos';

const fechaGuatemala = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit',
});
const MILISEGUNDOS_POR_DIA = 86400000;
const MAX_DIAS_AVISO = 60;
const DIAS_AVISO_INICIAL = Math.max(1, Math.min(MAX_DIAS_AVISO, Math.round(env.SPECIAL_MENU_NOTICE_DAYS)));

function restarDias(fecha: string, dias: number): string {
  if (!fecha) return '';
  return new Date(Date.parse(fecha) - dias * MILISEGUNDOS_POR_DIA).toISOString().slice(0, 10);
}

export const MenusEspecialesPage: React.FC = () => {
  const puedeSubirFoto = useAuthStore((s) => s.isAdmin() && s.can('ventas:gestionar_menu'));
  const canManageRecipe = useAuthStore((s) =>
    s.can('inventario:gestionar') && (s.can('inventario:ver') || s.can('mermas:ver')),
  );
  const [menus, setMenus] = useState<MenuEspecialModel[]>([]);
  const [platillosCatalogo, setPlatillosCatalogo] = useState<PlatilloModel[]>([]);
  const [categorias, setCategorias] = useState<CategoriaModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal crear/editar Menú Especial por fecha
  const [modalOpen, setModalOpen] = useState(false);
  const [errorMenu, setErrorMenu] = useState<string | null>(null);
  const [guardandoMenu, setGuardandoMenu] = useState(false);
  const [editing, setEditing] = useState<MenuEspecialModel | null>(null);
  const [form, setForm] = useState({
    nombre: '',
    descripcion: '',
    fechaInicio: fechaGuatemala.format(),
    fechaFin: fechaGuatemala.format(),
    fechaAviso: restarDias(fechaGuatemala.format(), DIAS_AVISO_INICIAL),
    activo: true,
    esMenuPrincipal: false,
  });
  // Platillos seleccionados con precio especial opcional: platilloId -> precio string ('' = precio regular)
  const [selectedPlatillos, setSelectedPlatillos] = useState<Record<number, string>>({});

  // Modal rápido para agregar un nuevo platillo al catálogo
  const [platilloModal, setPlatilloModal] = useState(false);
  const [fotoPlatillo, setFotoPlatillo] = useState<File | null>(null);
  const [guardandoPlatillo, setGuardandoPlatillo] = useState(false);
  const [ingredientes, setIngredientes] = useState<IngredienteModel[]>([]);
  const [receta, setReceta] = useState<LineaRecetaForm[]>([]);
  const [platilloError, setPlatilloError] = useState<string | null>(null);
  const [platilloForm, setPlatilloForm] = useState({
    categoriaId: '',
    sku: '',
    nombre: '',
    descripcion: '',
    precioVenta: '',
  });

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listaMenus, menuBase] = await Promise.all([
        ventasService.listarMenusEspeciales(),
        ventasService.obtenerMenu(),
      ]);
      setMenus(listaMenus);
      setPlatillosCatalogo(menuBase.platillos);
      setCategorias(menuBase.categorias);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando menús especiales');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const abrirNuevo = () => {
    const hoy = fechaGuatemala.format();
    setErrorMenu(null);
    setEditing(null);
    setForm({
      nombre: '',
      descripcion: '',
      fechaInicio: hoy,
      fechaFin: hoy,
      fechaAviso: restarDias(hoy, DIAS_AVISO_INICIAL),
      activo: true,
      esMenuPrincipal: false,
    });
    setSelectedPlatillos({});
    setModalOpen(true);
  };

  const abrirEditar = (m: MenuEspecialModel) => {
    setErrorMenu(null);
    setEditing(m);
    const fechaInicio = m.fechaInicioLocal ?? fechaGuatemala.format(new Date(m.fechaInicio));
    setForm({
      nombre: m.nombre,
      descripcion: m.descripcion ?? '',
      fechaInicio,
      fechaFin: m.fechaFinLocal ?? fechaGuatemala.format(new Date(m.fechaFin)),
      fechaAviso: restarDias(fechaInicio, m.diasAvisoPrevio),
      activo: m.activo,
      esMenuPrincipal: m.esMenuPrincipal,
    });
    const map: Record<number, string> = {};
    for (const p of m.platillos) {
      map[p.platilloId] = p.precioEspecial !== null ? String(p.precioEspecial) : '';
    }
    setSelectedPlatillos(map);
    setModalOpen(true);
  };

  const togglePlatillo = (platilloId: number) => {
    setSelectedPlatillos((prev) => {
      const copy = { ...prev };
      if (platilloId in copy) {
        delete copy[platilloId];
      } else {
        copy[platilloId] = '';
      }
      return copy;
    });
  };

  const handleGuardarMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardandoMenu) return;
    setErrorMenu(null);
    setError(null);
    setSuccess(null);
    const nombre = form.nombre.trim();
    if (nombre.length < 3) {
      setErrorMenu('Escribe un nombre de al menos 3 caracteres.');
      return;
    }
    if (form.fechaFin < form.fechaInicio) {
      setErrorMenu('La fecha de fin debe ser igual o posterior a la de inicio.');
      return;
    }
    const diasAvisoPrevio = (Date.parse(form.fechaInicio) - Date.parse(form.fechaAviso)) / MILISEGUNDOS_POR_DIA;
    if (!Number.isInteger(diasAvisoPrevio) || diasAvisoPrevio < 1 || diasAvisoPrevio > MAX_DIAS_AVISO) {
      setErrorMenu('Elige una fecha de aviso entre 1 y 60 días antes del inicio.');
      return;
    }

    const platillos = Object.entries(selectedPlatillos).map(([idStr, precioStr]) => ({
      platilloId: Number(idStr),
      precioEspecial: precioStr.trim() ? Number(precioStr) : null,
    }));

    const payload = {
      nombre,
      descripcion: form.descripcion.trim(),
      fechaInicio: form.fechaInicio,
      fechaFin: form.fechaFin,
      diasAvisoPrevio,
      activo: form.activo,
      esMenuPrincipal: form.esMenuPrincipal,
      platillos,
    };

    setGuardandoMenu(true);
    try {
      if (editing) {
        await ventasService.actualizarMenuEspecial(editing.id, payload);
        setSuccess(`Menú especial "${form.nombre}" actualizado correctamente.`);
      } else {
        await ventasService.crearMenuEspecial(payload);
        setSuccess(`Menú especial "${form.nombre}" programado correctamente.`);
      }
      setModalOpen(false);
      await cargar();
    } catch (err) {
      setErrorMenu(mensajeErrorFormulario(err, 'No se pudo guardar el menú de temporada'));
    } finally {
      setGuardandoMenu(false);
    }
  };

  const handleToggleActivo = async (m: MenuEspecialModel) => {
    setError(null);
    try {
      await ventasService.actualizarMenuEspecial(m.id, { activo: !m.activo });
      setSuccess(`Menú "${m.nombre}" ${!m.activo ? 'activado' : 'desactivado'}.`);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado');
    }
  };

  const handleEliminar = async (m: MenuEspecialModel) => {
    if (!window.confirm(`¿Eliminar el menú especial "${m.nombre}"?`)) return;
    setError(null);
    try {
      await ventasService.eliminarMenuEspecial(m.id);
      setSuccess(`Menú especial "${m.nombre}" eliminado.`);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar');
    }
  };

  const abrirPlatilloNuevo = async () => {
    setError(null);
    try {
      setIngredientes(await inventarioService.listarIngredientes());
      setPlatilloForm({
        categoriaId: categorias[0] ? String(categorias[0].id) : '',
        sku: '',
        nombre: '',
        descripcion: '',
        precioVenta: '',
      });
      setReceta([]);
      setFotoPlatillo(null);
      setPlatilloError(null);
      setPlatilloModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los ingredientes');
    }
  };

  const handleCrearPlatillo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardandoPlatillo) return;
    if (fotoPlatillo && fotoPlatillo.size > 5000000) {
      setPlatilloError('La foto debe pesar como máximo 5 MB');
      return;
    }
    setPlatilloError(null);
    setGuardandoPlatillo(true);
    try {
      const { data: platillo } = await ventasService.crearPlatillo({
        categoriaId: Number(platilloForm.categoriaId),
        sku: platilloForm.sku,
        nombre: platilloForm.nombre,
        descripcion: platilloForm.descripcion || undefined,
        precioVenta: Number(platilloForm.precioVenta),
        receta: receta.map(({ ingredienteId, cantidadOz }) => ({
          ingredienteId,
          cantidadOz: Number(cantidadOz),
        })),
      });
      let errorFoto: string | null = null;
      if (fotoPlatillo) {
        try {
          await ventasService.subirFotoPlatillo(platillo.id, fotoPlatillo);
        } catch (err) {
          errorFoto = err instanceof Error ? err.message : 'No se pudo subir la foto';
        }
      }
      setPlatilloModal(false);
      setSuccess('Platillo y receta guardados. Las existencias se descuentan al cobrar.');
      await cargar();
      if (errorFoto) {
        setError(`El platillo se guardó. Puedes volver a cargar la foto en Inventario, en Recetas y Precios. ${errorFoto}`);
      }
    } catch (err) {
      setPlatilloError(err instanceof Error ? err.message : 'No se pudo crear el platillo');
    } finally {
      setGuardandoPlatillo(false);
    }
  };

  const avisosPendientes = menus.filter(
    (m) => m.estado === 'PROXIMO_AVISO' || m.estado === 'ACTIVO_HOY',
  );

  const estadoBadge = (estado: MenuEspecialModel['estado']) => {
    switch (estado) {
      case 'ACTIVO_HOY':
        return <Badge variant="success">ACTIVO HOY</Badge>;
      case 'PROXIMO_AVISO':
        return <Badge variant="warning">AVISO PRÓXIMO</Badge>;
      case 'PROGRAMADO':
        return <Badge variant="info">PROGRAMADO</Badge>;
      case 'FINALIZADO':
        return <Badge variant="neutral">FINALIZADO</Badge>;
      default:
        return <Badge variant="danger">INACTIVO</Badge>;
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-slate-900">
            <CalendarClock className="h-7 w-7 text-brand-600" />
            Menús por Fechas Especiales
          </h1>
          <p className="text-sm text-slate-500">
            Programa temporadas junto al menú general y elige cuándo avisar al administrador.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canManageRecipe && (
            <button
              type="button"
              onClick={() => void abrirPlatilloNuevo()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <UtensilsCrossed className="h-4 w-4 text-brand-600" />
              Nuevo Platillo
            </button>
          )}
          <button
            type="button"
            onClick={abrirNuevo}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Nueva temporada
          </button>
        </div>
      </div>

      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      {/* SECCIÓN DE AVISOS Y RECORDATORIOS */}
      <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <BellRing className="h-5 w-5 text-amber-600" />
          <h2 className="text-base font-extrabold text-amber-950">
            Avisos de Cambios de Menú ({avisosPendientes.length})
          </h2>
        </div>

        {avisosPendientes.length === 0 ? (
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Todo al día. No tienes cambios de menú próximos dentro del rango de aviso.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {avisosPendientes.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white p-4 shadow-sm"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {a.requiereAtencion ? (
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-emerald-600" />
                    )}
                    <p className="font-extrabold text-slate-900">{a.nombre}</p>
                  </div>
                  <p className="text-xs text-slate-600">
                    Vigencia: <strong>{formatDateOnly(a.fechaInicio)}</strong> al{' '}
                    <strong>{formatDateOnly(a.fechaFin)}</strong> · {a.platillos.length} platillo(s)
                  </p>
                  {a.mensajeAviso && (
                    <p className="text-xs font-semibold text-amber-800">{a.mensajeAviso}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => abrirEditar(a)}
                  className="min-h-[38px] rounded-xl bg-slate-900 px-3.5 text-xs font-bold text-white hover:bg-slate-800"
                >
                  {a.platillos.length === 0 ? 'Agregar platillos' : 'Editar menú'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* LISTADO DE MENÚS ESPECIALES */}
      {loading ? (
        <div className="rounded-2xl bg-white p-10 text-center text-slate-400">
          Cargando calendario de menús...
        </div>
      ) : menus.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <CalendarClock className="mx-auto mb-2 h-10 w-10 text-slate-300" />
          <p className="font-bold text-slate-700">Aún no hay menús especiales programados</p>
          <p className="mt-1 text-sm text-slate-500">
            Crea tu primer menú por fecha especial (Día de la Madre, Navidad, Fin de Semana) y recibe avisos anticipados.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {menus.map((m) => (
            <div
              key={m.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-extrabold text-slate-900">{m.nombre}</h3>
                      {estadoBadge(m.estado)}
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {formatDateOnly(m.fechaInicio)} → {formatDateOnly(m.fechaFin)} · Aviso desde{' '}
                      {restarDias(m.fechaInicioLocal ?? fechaGuatemala.format(new Date(m.fechaInicio)), m.diasAvisoPrevio)
                        .split('-').reverse().join('/')}
                    </p>
                  </div>
                </div>

                {m.descripcion && (
                  <p className="mt-2 text-sm text-slate-600">{m.descripcion}</p>
                )}

                <div className="mt-4 rounded-xl bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Platillos asignados ({m.platillos.length})
                  </p>
                  {m.platillos.length === 0 ? (
                    <p className="text-xs font-semibold text-amber-700">
                      Sin platillos todavía — haz clic en Editar para elegir los platillos de esta fecha.
                    </p>
                  ) : (
                    <div className="space-y-1.5 text-xs">
                      {m.platillos.map((p) => (
                        <div key={p.platilloId} className="flex items-center justify-between">
                          <span className="font-semibold text-slate-800">{p.nombre}</span>
                          <span>
                            {p.precioEspecial !== null ? (
                              <>
                                <span className="mr-1.5 text-slate-400 line-through">
                                  {formatCurrency(p.precioRegular)}
                                </span>
                                <strong className="text-brand-700">
                                  {formatCurrency(p.precioEspecial)}
                                </strong>
                              </>
                            ) : (
                              <strong className="text-slate-700">
                                {formatCurrency(p.precioRegular)}
                              </strong>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => abrirEditar(m)}
                  className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Edit className="h-3.5 w-3.5" />
                  Editar / Platillos
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggleActivo(m)}
                  className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Power className="h-3.5 w-3.5" />
                  {m.activo ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleEliminar(m)}
                  className="inline-flex h-9 items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 hover:bg-red-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL PROGRAMAR / EDITAR MENÚ ESPECIAL */}
      <Modal
        open={modalOpen}
        title={editing ? `Editar Menú Especial — ${editing.nombre}` : 'Programar Menú por Fecha Especial'}
        onClose={() => { if (!guardandoMenu) setModalOpen(false); }}
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={handleGuardarMenu} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-slate-600">
                Nombre del menú especial
              </label>
              <input
                required
                maxLength={120}
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej. Menú Día de la Madre / Menú Navideño / Especial Fin de Semana"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold"
              />
            </div>

            <div>
              <label htmlFor="temporada-inicio" className="mb-1 block text-xs font-bold text-slate-600">Fecha de inicio</label>
              <input
                id="temporada-inicio"
                required
                type="date"
                value={form.fechaInicio}
                onChange={(e) => {
                  const fechaInicio = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    fechaInicio,
                    fechaFin: prev.fechaFin < fechaInicio ? fechaInicio : prev.fechaFin,
                    fechaAviso: prev.fechaAviso < fechaInicio && prev.fechaAviso >= restarDias(fechaInicio, MAX_DIAS_AVISO)
                      ? prev.fechaAviso
                      : restarDias(fechaInicio, DIAS_AVISO_INICIAL),
                  }));
                }}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>

            <div>
              <label htmlFor="temporada-fin" className="mb-1 block text-xs font-bold text-slate-600">Fecha de fin</label>
              <input
                id="temporada-fin"
                required
                type="date"
                min={form.fechaInicio}
                value={form.fechaFin}
                onChange={(e) => setForm({ ...form, fechaFin: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>

            <div>
              <label htmlFor="temporada-aviso" className="mb-1 block text-xs font-bold text-slate-600">
                Fecha de aviso al administrador
              </label>
              <input
                required
                id="temporada-aviso"
                type="date"
                min={restarDias(form.fechaInicio, MAX_DIAS_AVISO)}
                max={restarDias(form.fechaInicio, 1)}
                value={form.fechaAviso}
                onChange={(e) => setForm({ ...form, fechaAviso: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm font-bold"
              />
              <p className="mt-1 text-xs text-slate-500">El aviso se muestra en el POS desde esta fecha.</p>
            </div>

            <div className="flex items-end">
              <label className="flex min-h-[44px] w-full cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.esMenuPrincipal}
                  onChange={(e) => setForm({ ...form, esMenuPrincipal: e.target.checked })}
                  className="h-4 w-4 rounded text-brand-600"
                />
                Destacar la pestaña de temporada al estar vigente
              </label>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-slate-600">Descripción</label>
              <input
                value={form.descripcion}
                maxLength={300}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                placeholder="Notas sobre promociones o cambio de carta..."
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
              />
            </div>
          </div>

          {/* Selección de platillos y precio especial */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              Selecciona los platillos del menú especial (y precio promocional opcional)
            </p>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3">
              {platillosCatalogo.map((p) => {
                const checked = p.id in selectedPlatillos;
                return (
                  <div
                    key={p.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2.5 text-sm ${
                      checked ? 'border-brand-400 bg-brand-50/50' : 'border-slate-100 bg-white'
                    }`}
                  >
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePlatillo(p.id)}
                        className="h-4 w-4 rounded text-brand-600"
                      />
                      <span>
                        <strong className="text-slate-900">{p.nombre}</strong>
                        <span className="ml-2 text-xs text-slate-500">
                          {p.precioRegular > 0 ? `Regular ${formatCurrency(p.precioRegular)}` : 'Precio pendiente'}
                        </span>
                      </span>
                    </label>

                    {checked && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500">Precio especial (Q):</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder={p.precioRegular.toFixed(2)}
                          value={selectedPlatillos[p.id]}
                          onChange={(e) =>
                            setSelectedPlatillos((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          className="h-9 w-24 rounded-lg border border-brand-300 bg-white px-2 text-right text-xs font-bold"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {errorMenu && <div role="alert"><Alert type="error" message={errorMenu} /></div>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              disabled={guardandoMenu}
              className="min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardandoMenu}
              className="min-h-[44px] rounded-xl bg-brand-600 px-5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {guardandoMenu ? 'Guardando…' : 'Guardar Menú Especial'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL RÁPIDO NUEVO PLATILLO */}
      <Modal
        open={platilloModal}
        title="Agregar Nuevo Platillo al Catálogo"
        onClose={() => { if (!guardandoPlatillo) setPlatilloModal(false); }}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleCrearPlatillo} className="space-y-3">
          <select
            required
            value={platilloForm.categoriaId}
            onChange={(e) => setPlatilloForm({ ...platilloForm, categoriaId: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold"
          >
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                Categoría: {c.nombre}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              placeholder="SKU (ej. ESP-01)"
              value={platilloForm.sku}
              onChange={(e) => setPlatilloForm({ ...platilloForm, sku: e.target.value })}
              className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm uppercase"
            />
            <input
              required
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Precio venta (Q)"
              value={platilloForm.precioVenta}
              onChange={(e) => setPlatilloForm({ ...platilloForm, precioVenta: e.target.value })}
              className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-bold"
            />
          </div>
          <input
            required
            placeholder="Nombre del platillo"
            value={platilloForm.nombre}
            onChange={(e) => setPlatilloForm({ ...platilloForm, nombre: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
          <textarea
            rows={2}
            placeholder="Descripción breve"
            value={platilloForm.descripcion}
            onChange={(e) => setPlatilloForm({ ...platilloForm, descripcion: e.target.value })}
            className="w-full rounded-xl border border-slate-300 p-3 text-sm"
          />
          <RecetaCampos ingredientes={ingredientes} lineas={receta} onChange={setReceta} />
          {puedeSubirFoto && (
            <SelectorFotoPlatillo onChange={setFotoPlatillo} disabled={guardandoPlatillo} />
          )}
          {platilloError && <Alert type="error" message={platilloError} />}
          <button
            type="submit"
            disabled={receta.length === 0 || guardandoPlatillo}
            className="min-h-[46px] w-full rounded-xl bg-brand-600 text-sm font-bold text-white disabled:opacity-50"
          >
            {guardandoPlatillo ? 'Guardando…' : 'Guardar Platillo'}
          </button>
        </form>
      </Modal>
    </div>
  );
};
