// Modelos de dominio limpios del Frontend (desacoplados del JSON crudo del backend)

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SucursalModel {
  id: number;
  codigo: string;
  nombre: string;
  nit: string;
  direccion: string;
  telefono: string | null;
  serieFactura: string;
}

export interface UsuarioSesionModel {
  id: number;
  username: string;
  nombreCompleto: string;
  email: string;
  sucursal: SucursalModel;
  rol: {
    id: number;
    codigo: string;
    nombre: string;
    vistaInicial: string;
  };
  permisos: string[];
}

export interface LoginResultModel {
  token?: string;
  usuario: UsuarioSesionModel;
}

// --- VENTAS / MENÚ ---
export type TipoServicio = 'MOSTRADOR' | 'LLEVAR' | 'MESA' | 'DELIVERY';
export type MetodoPago = 'EFECTIVO' | 'TARJETA';

export interface CategoriaModel {
  id: number;
  nombre: string;
  descripcion: string | null;
  orden: number;
}

export interface RecetaItemModel {
  ingredienteId: number;
  ingredienteNombre: string;
  cantidadOz: number;
  stockActualOz: number;
}

export interface PlatilloModel {
  id: number;
  categoriaId: number;
  categoriaNombre: string;
  sku: string;
  nombre: string;
  descripcion: string | null;
  imagenUrl: string | null;
  precioVenta: number;
  precioRegular: number;
  esEspecialHoy: boolean;
  costoReceta: number;
  disponible: boolean;
  stockDisponible: boolean;
  receta: RecetaItemModel[];
}

export interface MesaModel {
  id: number;
  numero: string;
  capacidad: number;
  estado: 'DISPONIBLE' | 'OCUPADA' | 'RESERVADA';
}

export type EstadoMenuEspecial =
  | 'ACTIVO_HOY'
  | 'PROXIMO_AVISO'
  | 'PROGRAMADO'
  | 'FINALIZADO'
  | 'INACTIVO';

export interface AlertaMenuEspecialModel {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
  estado: EstadoMenuEspecial;
  diasRestantes: number;
  platillosCount: number;
  requiereAtencion: boolean;
  mensaje: string | null;
}

export interface MenuEspecialPlatilloModel {
  platilloId: number;
  sku: string;
  nombre: string;
  categoriaNombre: string;
  precioRegular: number;
  precioEspecial: number | null;
}

export interface MenuEspecialModel {
  id: number;
  nombre: string;
  descripcion: string | null;
  fechaInicio: string;
  fechaFin: string;
  fechaInicioLocal?: string;
  fechaFinLocal?: string;
  diasAvisoPrevio: number;
  activo: boolean;
  esMenuPrincipal: boolean;
  creadoPor: string;
  estado: EstadoMenuEspecial;
  diasRestantes: number;
  requiereAtencion: boolean;
  mensajeAviso: string | null;
  platillos: MenuEspecialPlatilloModel[];
}

export interface MenuDataModel {
  cajaAbierta: boolean;
  cajaSesionId: number | null;
  habilitarMesas: boolean;
  tipoServicioDefault: TipoServicio;
  categorias: CategoriaModel[];
  platillos: PlatilloModel[];
  mesas: MesaModel[];
  menuEspecialActivo: {
    id: number;
    nombre: string;
    descripcion: string | null;
    fechaInicio: string;
    fechaFin: string;
    esMenuPrincipal: boolean;
    platillosIds: number[];
  } | null;
  alertasMenusEspeciales: AlertaMenuEspecialModel[];
}

export interface CartItemModel {
  platillo: PlatilloModel;
  cantidad: number;
  notas: string;
}

export interface TicketImprimibleModel {
  sucursal: {
    nombre: string;
    nit: string;
    direccion: string;
    telefono: string | null;
  };
  factura: {
    id: number;
    numeroCompleto: string;
    serie: string;
    clienteNit: string;
    clienteNombre: string;
    clienteDireccion: string;
    subtotalSinIva: number;
    ivaMonto: number;
    total: number;
    estado: 'EMITIDA' | 'ANULADA';
    reimpresionesCount: number;
    felEstado: string;
    felUuid: string | null;
    createdAt: string;
  };
  comanda?: {
    numeroComanda: string;
    tipoServicio: TipoServicio;
    mesaNumero: string | null;
    nombreTurno: string | null;
    createdAt: string;
  };
  venta: {
    id: number;
    tipoServicio: TipoServicio;
    metodoPago: MetodoPago;
    montoRecibido: number;
    cambio: number;
    cajeroNombre: string;
    detalles: Array<{
      id: number;
      nombrePlatillo: string;
      cantidad: number;
      precioUnitario: number;
      subtotal: number;
      notas: string | null;
    }>;
  };
}

// --- FACTURAS ---
export interface FacturaResumenModel {
  id: number;
  numeroCompleto: string;
  clienteNit: string;
  clienteNombre: string;
  subtotalSinIva: number;
  ivaMonto: number;
  total: number;
  estado: 'EMITIDA' | 'ANULADA';
  motivoAnulacion: string | null;
  reimpresionesCount: number;
  createdAt: string;
  tipoServicio: TipoServicio;
  metodoPago: MetodoPago;
  vendedorNombre: string;
  mesaNumero: string | null;
  numeroComanda: string | null;
  anuladaPorNombre: string | null;
}

export interface FacturaDetalleModel extends TicketImprimibleModel {
  motivoAnulacion: string | null;
  anuladaEn: string | null;
  anuladaPorNombre: string | null;
}

// --- INVENTARIO ---
export type UnidadMedida = 'lb' | 'oz';

export interface ProveedorModel {
  id: number;
  nombre: string;
  nit: string | null;
  telefono: string | null;
  email: string | null;
  contacto: string | null;
  ingredientesCount: number;
  comprasCount: number;
}

export interface IngredienteModel {
  id: number;
  codigo: string;
  nombre: string;
  proveedorId: number | null;
  proveedorNombre: string | null;
  stockActualOz: number;
  stockActualLb: number;
  stockMinimoOz: number;
  stockMinimoLb: number;
  costoPromedioOz: number;
  costoPromedioLb: number;
  bajoStock: boolean;
}

export interface CompraModel {
  id: number;
  numeroDocumento: string | null;
  proveedorNombre: string;
  usuarioNombre: string;
  total: number;
  observaciones: string | null;
  fechaCompra: string;
  detalles: Array<{
    ingredienteNombre: string;
    cantidadLb: number;
    cantidadOz: number;
    precioPorLb: number;
    costoPorOz: number;
    subtotal: number;
  }>;
}

export interface InventarioMovimientoModel {
  id: number;
  ingredienteNombre: string;
  ingredienteCodigo: string;
  usuarioNombre: string;
  tipo: string;
  cantidadOz: number;
  cantidadLb: number;
  stockAnteriorOz: number;
  stockNuevoOz: number;
  costoUnitarioOz: number;
  motivo: string | null;
  createdAt: string;
}

// --- MERMAS ---
export type MotivoMerma = 'VENCIMIENTO' | 'DANO' | 'ERROR_PREPARACION' | 'ACCIDENTE' | 'OTRO';

export interface MermaModel {
  id: number;
  ingredienteId: number;
  ingredienteNombre: string;
  ingredienteCodigo: string;
  usuarioNombre: string;
  cantidadOriginal: number;
  unidadOriginal: UnidadMedida;
  cantidadOz: number;
  costoEstimado: number;
  motivo: MotivoMerma;
  observacion: string | null;
  fecha: string;
}

export interface MermasListadoModel {
  items: MermaModel[];
  resumen: {
    costoTotalMermas: number;
    totalOzMermadas: number;
    totalLbMermadas: number;
  };
  meta: PaginationMeta;
}

// --- CAJA ---
export interface CajaMovimientoModel {
  id: number;
  tipo: 'INGRESO_VENTA' | 'INGRESO_MANUAL' | 'EGRESO_MANUAL' | 'EGRESO_ANULACION';
  metodoPago: MetodoPago;
  monto: number;
  descripcion: string;
  usuarioNombre: string;
  createdAt: string;
}

export interface CajaSesionModel {
  id: number;
  estado: 'ABIERTA' | 'CERRADA';
  montoInicial: number;
  totalVentasEfectivo: number;
  totalVentasTarjeta: number;
  totalIngresosExtra: number;
  totalEgresos: number;
  totalEgresosTarjeta: number;
  totalEgresosEfectivo: number;
  totalTarjetaNeto: number;
  montoEsperadoEfectivo: number;
  montoContadoEfectivo: number | null;
  diferencia: number | null;
  totalGeneralEsperado: number;
  observacionesCierre: string | null;
  fechaApertura: string;
  fechaCierre: string | null;
  usuarioAperturaNombre: string;
  usuarioCierreNombre: string | null;
  movimientos: CajaMovimientoModel[];
}

// --- REPORTES ---
export interface ReporteResumenModel {
  periodo: { fechaDesde: string; fechaHasta: string };
  kpis: {
    cantidadVentas: number;
    ingresosTotales: number;
    subtotalSinIva: number;
    ivaTotal: number;
    costoRecetasTotal: number;
    costoMermasTotal: number;
    cantidadMermas: number;
    totalCompras: number;
    utilidadBruta: number;
    margenBrutoPct: number;
    ticketPromedio: number;
  };
  porMetodoPago: Record<string, { cantidad: number; total: number }>;
  porTipoServicio: Record<string, { cantidad: number; total: number }>;
}

export interface SerieVentasDiaModel {
  fecha: string;
  cantidadVentas: number;
  ingresos: number;
  costos: number;
  utilidad: number;
}

export interface TopProductoModel {
  platilloId: number;
  nombre: string;
  cantidadVendida: number;
  ingresos: number;
  costoTotal: number;
  utilidad: number;
}

// --- AUDITORÍA ---
export interface AuditoriaLogModel {
  id: number;
  accion: string;
  entidad: string;
  entidadId: string | null;
  usuarioNombre: string;
  usuarioUsername: string;
  rolNombre: string;
  valorAnterior: unknown;
  valorNuevo: unknown;
  motivo: string | null;
  ipAddress: string | null;
  createdAt: string;
}

// --- ACCESOS ---
export interface PermisoModel {
  id: number;
  codigo: string;
  vista: string;
  accion: string;
  descripcion: string;
}

export interface RolModel {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  vistaInicial: string;
  esSistema: boolean;
  usuariosCount: number;
  permisos: Array<{ id: number; codigo: string; vista: string; accion: string }>;
}

export interface UsuarioAdminModel {
  id: number;
  nombreCompleto: string;
  username: string;
  email: string;
  activo: boolean;
  ultimoAcceso: string | null;
  fechaIngreso: string | null;
  sueldoMensual: number | null;
  rol: {
    id: number;
    codigo: string;
    nombre: string;
    vistaInicial: string;
  };
  permisosEfectivos: string[];
  permisosPersonalizados: Array<{ permisoId: number; codigo: string; permitido: boolean }>;
}

export interface PersonaNominaModel {
  id: number;
  nombreCompleto: string;
  rol: string;
  activo: boolean;
  fechaIngreso: string | null;
  sueldoMensual: number | null;
}
