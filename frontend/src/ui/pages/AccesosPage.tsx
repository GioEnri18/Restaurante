import React, { useEffect, useState, useCallback } from 'react';
import { Users, Shield, UserPlus, Plus, Power, Edit } from 'lucide-react';
import { PaginationMeta, PermisoModel, RolModel, UsuarioAdminModel } from '../../models';
import { accesosService } from '../../services/accesos.service';
import { ApiError } from '../../services/httpClient';
import { useAuthStore } from '../../store/auth.store';
import { formatDateTime, getTodayISO } from '../../utils/formatters';
import { Alert } from '../components/common/Alert';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { Pagination, usePaginacionLocal } from '../components/common/Pagination';

const VISTAS_RUTAS = [
  '/ventas',
  '/facturas',
  '/inventario',
  '/mermas',
  '/caja',
  '/reportes',
  '/auditoria',
  '/accesos',
];

const ETIQUETAS_USUARIO: Record<string, string> = {
  nombreCompleto: 'Nombre completo',
  username: 'Nombre de usuario',
  email: 'Correo electrónico',
  password: 'Contraseña',
  rolId: 'Rol',
  fechaIngreso: 'Fecha de ingreso',
  sueldoMensual: 'Sueldo mensual',
};

function mensajeErrorUsuario(error: unknown): string {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) {
    return error instanceof Error ? error.message : 'No se pudo guardar el usuario';
  }
  if (error.code === 'DUPLICATE_ENTRY') {
    const duplicados = error.details
      .filter((campo): campo is string => typeof campo === 'string' && Object.hasOwn(ETIQUETAS_USUARIO, campo))
      .map((campo) => ETIQUETAS_USUARIO[campo]);
    return duplicados.length ? `Ya está en uso: ${duplicados.join(', ')}.` : error.message;
  }
  const detalles = error.details.flatMap((detalle) => {
    if (!detalle || typeof detalle.campo !== 'string' || typeof detalle.mensaje !== 'string') return [];
    const etiqueta = ETIQUETAS_USUARIO[detalle.campo];
    return [etiqueta ? `${etiqueta}: ${detalle.mensaje}` : detalle.mensaje];
  });
  return detalles.length ? detalles.join(' · ') : error.message;
}

export const AccesosPage: React.FC = () => {
  const currentUser = useAuthStore((s) => s.usuario);
  const [tab, setTab] = useState<'usuarios' | 'roles'>('usuarios');
  const [usuarios, setUsuarios] = useState<UsuarioAdminModel[]>([]);
  const [roles, setRoles] = useState<RolModel[]>([]);
  const [metaUsuarios, setMetaUsuarios] = useState<PaginationMeta>({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const paginaRoles = usePaginacionLocal(roles);
  const [permisosPorVista, setPermisosPorVista] = useState<Record<string, PermisoModel[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal Usuario (crear / editar)
  const [userModal, setUserModal] = useState(false);
  const [errorUsuario, setErrorUsuario] = useState<string | null>(null);
  const [guardandoUsuario, setGuardandoUsuario] = useState(false);
  const [longitudMinima, setLongitudMinima] = useState<number>();
  const [editingUser, setEditingUser] = useState<UsuarioAdminModel | null>(null);
  const [userForm, setUserForm] = useState({
    nombreCompleto: '',
    username: '',
    email: '',
    password: '',
    rolId: '',
    fechaIngreso: '',
    sueldoMensual: '',
  });

  // Edición de matriz de permisos de un Rol
  const [selectedRolId, setSelectedRolId] = useState<number | null>(null);
  const [rolPermisoIds, setRolPermisoIds] = useState<number[]>([]);
  const [rolVistaInicial, setRolVistaInicial] = useState('/ventas');

  // Modal Nuevo Rol configurable sin tocar código
  const [newRolModal, setNewRolModal] = useState(false);
  const [newRolForm, setNewRolForm] = useState({
    codigo: '',
    nombre: '',
    descripcion: '',
    vistaInicial: '/ventas',
    permisoIds: [] as number[],
  });

  const cargarTodo = useCallback(async () => {
    setError(null);
    try {
      const [u, r, p] = await Promise.all([
        accesosService.listarUsuarios(),
        accesosService.listarRoles(),
        accesosService.listarPermisos(),
      ]);
      setUsuarios(u.items);
      setMetaUsuarios(u.meta);
      setRoles(r);
      setPermisosPorVista(p.porVista);

      if (r.length > 0) {
        setSelectedRolId((prev) => {
          if (prev !== null) return prev;
          setRolPermisoIds(r[0].permisos.map((perm) => perm.id));
          setRolVistaInicial(r[0].vistaInicial);
          return r[0].id;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando administración de accesos');
    }
  }, []);

  const cargarUsuarios = async (page: number) => {
    setError(null);
    try {
      const resultado = await accesosService.listarUsuarios(page);
      setUsuarios(resultado.items);
      setMetaUsuarios(resultado.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la página de personal');
    }
  };

  useEffect(() => {
    void cargarTodo();
    void accesosService.obtenerLongitudMinimaPassword().then(setLongitudMinima).catch(() => {
      // La validación de la API sigue vigente si el servidor todavía no expone la política.
    });
  }, [cargarTodo]);

  const abrirNuevoUsuario = (rolCodigoPreseleccionado?: string) => {
    setErrorUsuario(null);
    setEditingUser(null);
    const rolEncontrado = rolCodigoPreseleccionado
      ? roles.find((r) => r.codigo.toUpperCase() === rolCodigoPreseleccionado.toUpperCase())
      : undefined;
    setUserForm({
      nombreCompleto: '',
      username: '',
      email: '',
      password: '',
      rolId: rolEncontrado ? String(rolEncontrado.id) : '',
      fechaIngreso: getTodayISO(),
      sueldoMensual: '',
    });
    setUserModal(true);
  };

  const rolesAccesoRapido = ['CAJERO', 'AUDITOR', 'CHEF', 'ADMIN']
    .map((codigo) => roles.find((r) => r.codigo.toUpperCase() === codigo))
    .filter((r): r is RolModel => Boolean(r));

  const rolSeleccionadoEnModal = roles.find((r) => String(r.id) === userForm.rolId) ?? null;
  const rolesAsignables = roles.filter((rol) => rol.codigo.toUpperCase() !== 'MESERO' || rol.id === editingUser?.rol.id);

  const abrirEditarUsuario = (u: UsuarioAdminModel) => {
    setErrorUsuario(null);
    setEditingUser(u);
    setUserForm({
      nombreCompleto: u.nombreCompleto,
      username: u.username,
      email: u.email,
      password: '',
      rolId: String(u.rol.id),
      fechaIngreso: u.fechaIngreso ?? '',
      sueldoMensual: u.sueldoMensual == null ? '' : String(u.sueldoMensual),
    });
    setUserModal(true);
  };

  const handleGuardarUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardandoUsuario) return;
    setError(null);
    setErrorUsuario(null);
    setSuccess(null);
    setGuardandoUsuario(true);
    try {
      if (editingUser) {
        await accesosService.actualizarUsuario(editingUser.id, {
          nombreCompleto: userForm.nombreCompleto,
          email: userForm.email,
          rolId: Number(userForm.rolId),
          password: userForm.password || undefined,
          fechaIngreso: userForm.fechaIngreso || undefined,
          sueldoMensual: userForm.sueldoMensual ? Number(userForm.sueldoMensual) : undefined,
        });
        setSuccess('Usuario actualizado y registrado en auditoría.');
      } else {
        await accesosService.crearUsuario({
          nombreCompleto: userForm.nombreCompleto,
          username: userForm.username,
          email: userForm.email,
          password: userForm.password,
          rolId: Number(userForm.rolId),
          fechaIngreso: userForm.fechaIngreso,
          sueldoMensual: Number(userForm.sueldoMensual),
        });
        setSuccess('Usuario creado correctamente.');
      }
      setUserModal(false);
      await cargarTodo();
    } catch (err) {
      setErrorUsuario(mensajeErrorUsuario(err));
    } finally {
      setGuardandoUsuario(false);
    }
  };

  const toggleActivo = async (u: UsuarioAdminModel) => {
    setError(null);
    try {
      await accesosService.cambiarEstadoUsuario(u.id, !u.activo);
      setSuccess(`Usuario ${u.username} ${!u.activo ? 'activado' : 'desactivado'}.`);
      await cargarTodo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado');
    }
  };

  const seleccionarRol = (rol: RolModel) => {
    setSelectedRolId(rol.id);
    setRolPermisoIds(rol.permisos.map((p) => p.id));
    setRolVistaInicial(rol.vistaInicial);
  };

  const toggleRolPermiso = (permisoId: number) => {
    setRolPermisoIds((prev) =>
      prev.includes(permisoId) ? prev.filter((id) => id !== permisoId) : [...prev, permisoId],
    );
  };

  const handleGuardarPermisosRol = async () => {
    if (!selectedRolId) return;
    setError(null);
    setSuccess(null);
    try {
      await accesosService.actualizarPermisosRol(selectedRolId, rolPermisoIds, rolVistaInicial);
      setSuccess('Matriz de permisos del rol actualizada y registrada en auditoría.');
      await cargarTodo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los permisos');
    }
  };

  const handleCrearRol = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await accesosService.crearRol(newRolForm);
      setNewRolModal(false);
      setNewRolForm({ codigo: '', nombre: '', descripcion: '', vistaInicial: '/ventas', permisoIds: [] });
      setSuccess('Nuevo rol creado sin necesidad de modificar código.');
      await cargarTodo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el rol');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Personal y accesos
          </h1>
          <p className="text-sm text-slate-500">
            Registra al personal y elige qué puede hacer cada rol.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setNewRolModal(true)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Nuevo Rol
          </button>
          <button
            type="button"
            onClick={() => abrirNuevoUsuario()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700"
          >
            <UserPlus className="h-4 w-4" />
            Agregar persona
          </button>
        </div>
      </div>

      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('usuarios')}
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-bold ${
            tab === 'usuarios' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'
          }`}
        >
          <Users className="h-4 w-4" />
          Personal ({metaUsuarios.total})
        </button>
        <button
          type="button"
          onClick={() => setTab('roles')}
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-bold ${
            tab === 'roles' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'
          }`}
        >
          <Shield className="h-4 w-4" />
          Roles y Permisos ({roles.length})
        </button>
      </div>

      {/* TAB USUARIOS */}
      {tab === 'usuarios' && (
        <div className="space-y-4">
          {rolesAccesoRapido.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-bold text-slate-600">
                Alta rápida por perfil:
              </p>
              <div className="flex flex-wrap gap-2">
                {rolesAccesoRapido.map((rol) => (
                  <button
                    key={rol.id}
                    type="button"
                    onClick={() => abrirNuevoUsuario(rol.codigo)}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3.5 text-xs font-bold text-brand-800 hover:bg-brand-100"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Nuevo {rol.nombre}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[740px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-slate-500">
                <th className="py-3 px-2">Usuario</th>
                <th className="py-3 px-2">Correo</th>
                <th className="py-3 px-2">Rol</th>
                <th className="py-3 px-2">Fecha de ingreso</th>
                <th className="py-3 px-2">Último acceso</th>
                <th className="py-3 px-2">Estado</th>
                <th className="py-3 px-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usuarios.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="py-3 px-2">
                    <p className="font-bold text-slate-900">{u.nombreCompleto}</p>
                    <p className="text-xs text-slate-500">@{u.username}</p>
                  </td>
                  <td className="py-3 px-2 text-slate-600">{u.email}</td>
                  <td className="py-3 px-2">
                    <Badge variant="info">{u.rol.nombre}</Badge>
                  </td>
                  <td className="py-3 px-2 text-xs text-slate-600">{u.fechaIngreso ? u.fechaIngreso.split('-').reverse().join('/') : 'Pendiente'}</td>
                  <td className="py-3 px-2 text-xs text-slate-500">{formatDateTime(u.ultimoAcceso)}</td>
                  <td className="py-3 px-2">
                    <Badge variant={u.activo ? 'success' : 'danger'}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => abrirEditarUsuario(u)}
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={currentUser?.id === u.id}
                        onClick={() => void toggleActivo(u)}
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                      >
                        <Power className="h-3.5 w-3.5" />
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {metaUsuarios.totalPages > 1 && <Pagination meta={metaUsuarios} onPageChange={(page) => void cargarUsuarios(page)} />}
          </div>
        </div>
      )}

      {/* TAB ROLES Y MATRIZ DE PERMISOS POR VISTA */}
      {tab === 'roles' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="space-y-2 lg:col-span-4">
            {paginaRoles.items.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => seleccionarRol(r)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  selectedRolId === r.id
                    ? 'border-brand-600 bg-brand-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-bold text-slate-900">{r.nombre}</p>
                  <Badge variant="neutral">{r.codigo}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">{r.descripcion || 'Sin descripción'}</p>
                <p className="mt-2 text-xs font-semibold text-slate-600">
                  {r.usuariosCount} usuario(s) · Inicio: {r.vistaInicial}
                </p>
              </button>
            ))}
            {paginaRoles.meta.totalPages > 1 && <Pagination meta={paginaRoles.meta} onPageChange={paginaRoles.onPageChange} />}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Permisos por Vista y Acción</h2>
                <p className="text-xs text-slate-500">
                  Los cambios se aplican inmediatamente y quedan registrados en auditoría.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={rolVistaInicial}
                  onChange={(e) => setRolVistaInicial(e.target.value)}
                  className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs font-bold"
                >
                  {VISTAS_RUTAS.map((ruta) => (
                    <option key={ruta} value={ruta}>
                      Inicio: {ruta}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void handleGuardarPermisosRol()}
                  className="min-h-[40px] rounded-xl bg-brand-600 px-4 text-xs font-bold text-white hover:bg-brand-700"
                >
                  Guardar Permisos
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {Object.entries(permisosPorVista).map(([vista, lista]) => (
                <div key={vista} className="rounded-xl border border-slate-200 p-3.5">
                  <h3 className="mb-2 text-xs font-black uppercase tracking-wider text-brand-700">
                    Vista: {vista}
                  </h3>
                  <div className="space-y-2">
                    {lista.map((p) => (
                      <label key={p.id} className="flex cursor-pointer items-start gap-2.5 text-xs">
                        <input
                          type="checkbox"
                          checked={rolPermisoIds.includes(p.id)}
                          onChange={() => toggleRolPermiso(p.id)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                        />
                        <span>
                          <strong className="text-slate-800">{p.codigo}</strong>
                          <span className="block text-slate-500">{p.descripcion}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL USUARIO */}
      <Modal
        open={userModal}
        title={editingUser ? `Editar Usuario @${editingUser.username}` : 'Crear Nuevo Usuario'}
        onClose={() => { if (!guardandoUsuario) setUserModal(false); }}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleGuardarUsuario} className="space-y-3">
          <input
            required
            placeholder="Nombre completo"
            value={userForm.nombreCompleto}
            onChange={(e) => setUserForm({ ...userForm, nombreCompleto: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
          {!editingUser && (
            <label className="block space-y-1">
              <span className="text-sm font-semibold">Nombre de usuario</span>
              <input
                required
                minLength={3}
                maxLength={50}
                pattern="[a-zA-Z0-9._\-]+"
                title="Usa solo letras sin tilde, números, punto, guion o guion bajo"
                aria-describedby="requisitos-nombre-usuario"
                autoComplete="off"
                placeholder="Ej. cajero_01"
                value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
              />
              <span id="requisitos-nombre-usuario" className="block text-xs text-slate-600">
                Usa de 3 a 50 caracteres sin espacios ni tildes.
              </span>
            </label>
          )}
          <input
            required
            type="email"
            placeholder="Correo electrónico"
            value={userForm.email}
            onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
          <input
            required={!editingUser}
            type="password"
            autoComplete="new-password"
            aria-describedby="requisitos-contrasena-usuario"
            minLength={longitudMinima}
            maxLength={72}
            pattern="(?=.*[A-Za-z])(?=.*[0-9]).*"
            placeholder={editingUser ? 'Nueva contraseña (opcional)' : 'Contraseña'}
            value={userForm.password}
            onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
          <p id="requisitos-contrasena-usuario" className="text-xs text-slate-600">
            {longitudMinima ? `Mínimo ${longitudMinima} caracteres, con al menos una letra y un número.` : 'Incluye al menos una letra y un número.'}
          </p>
          <select
            required
            value={userForm.rolId}
            onChange={(e) => setUserForm({ ...userForm, rolId: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm font-bold"
          >
            <option value="" disabled>Selecciona el rol del usuario</option>
            {rolesAsignables.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre} ({r.codigo})
              </option>
            ))}
          </select>
          {rolSeleccionadoEnModal && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p className="font-bold text-slate-800">
                Perfil {rolSeleccionadoEnModal.nombre} · Inicio: {rolSeleccionadoEnModal.vistaInicial}
              </p>
              <p className="mt-0.5">
                {rolSeleccionadoEnModal.permisos.length > 0
                  ? `${rolSeleccionadoEnModal.permisos.length} permiso(s): ${rolSeleccionadoEnModal.permisos.map((p) => p.codigo).join(', ')}`
                  : 'Sin permisos asignados todavía (puedes configurarlos en la pestaña Roles y Permisos).'}
              </p>
            </div>
          )}
          <fieldset className="grid gap-3 rounded-xl border border-teal-200 bg-teal-50 p-3 sm:grid-cols-2">
            <legend className="px-1 text-sm font-bold text-teal-900">Datos laborales</legend>
            <label className="block space-y-1 text-sm font-semibold text-slate-700">
              <span>Fecha de ingreso</span>
              <input type="date" required={!editingUser} max={getTodayISO()} value={userForm.fechaIngreso}
                onChange={(e) => setUserForm({ ...userForm, fechaIngreso: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" />
            </label>
            <label className="block space-y-1 text-sm font-semibold text-slate-700">
              <span>Sueldo mensual acordado (Q)</span>
              <input type="number" required={!editingUser} min="0.01" max="9999999999.99" step="0.01"
                value={userForm.sueldoMensual} onChange={(e) => setUserForm({ ...userForm, sueldoMensual: e.target.value })}
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" />
            </label>
          </fieldset>
          {errorUsuario && <div role="alert"><Alert type="error" message={errorUsuario} /></div>}
          <button
            type="submit"
            disabled={guardandoUsuario || roles.length === 0}
            className="min-h-[46px] w-full rounded-xl bg-brand-600 text-sm font-bold text-white disabled:opacity-50"
          >
            {guardandoUsuario ? 'Guardando…' : editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
          </button>
        </form>
      </Modal>

      {/* MODAL NUEVO ROL */}
      <Modal
        open={newRolModal}
        title="Crear Nuevo Rol Configurable"
        onClose={() => setNewRolModal(false)}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleCrearRol} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              required
              placeholder="Código (ej. SUPERVISOR)"
              value={newRolForm.codigo}
              onChange={(e) => setNewRolForm({ ...newRolForm, codigo: e.target.value })}
              className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm uppercase"
            />
            <input
              required
              placeholder="Nombre visible"
              value={newRolForm.nombre}
              onChange={(e) => setNewRolForm({ ...newRolForm, nombre: e.target.value })}
              className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm"
            />
          </div>
          <input
            placeholder="Descripción del rol"
            value={newRolForm.descripcion}
            onChange={(e) => setNewRolForm({ ...newRolForm, descripcion: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          />
          <select
            value={newRolForm.vistaInicial}
            onChange={(e) => setNewRolForm({ ...newRolForm, vistaInicial: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm"
          >
            {VISTAS_RUTAS.map((r) => (
              <option key={r} value={r}>
                Vista inicial: {r}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="min-h-[46px] w-full rounded-xl bg-slate-900 text-sm font-bold text-white"
          >
            Crear Rol
          </button>
        </form>
      </Modal>
    </div>
  );
};
