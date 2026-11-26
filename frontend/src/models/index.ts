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
export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'SIN_COBRO';

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
  habilitarDelivery?: boolean;
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
  cantidadCortesia?: number;
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
    costoEnvio?: number;
    zonaEntregaNombre?: string | null;
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
    costoEnvio?: number;
    direccionEntrega?: string | null;
    referenciaEntrega?: string | null;
    zonaEntregaNombre?: string | null;
    createdAt: string;
  };
  entrega?: {
    numeroPedido: string;
    modalidadPago: ModalidadPagoDomicilio;
    metodoPagoEsperado: MetodoPago;
    clienteNombre: string;
    clienteTelefono: string;
    direccion: string;
    referencia: string | null;
    zonaNombre: string;
    costoEnvio: number;
    subtotalPlatillos: number;
    total: number;
    montoConQuePaga: number | null;
    observaciones: string | null;
  };
  venta: {
    id: number;
    tipoServicio: TipoServicio;
    metodoPago: MetodoPago;
    costoEnvio?: number;
    montoRecibido: number;
    cambio: number;
    cajeroNombre: string;
    detalles: Array<{
      id: number;
      nombrePlatillo: string;
      cantidad: number;
      precioUnitario: number;
      subtotal: number;
      cantidadCortesia?: number;
      consumoPendiente?: boolean;
      costoPendiente?: boolean;
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
  tipo:
    | 'INGRESO_VENTA'
    | 'INGRESO_MANUAL'
    | 'EGRESO_MANUAL'
    | 'EGRESO_ANULACION'
    | 'INGRESO_DIFERENCIA_REPARTIDOR'
    | 'EGRESO_DIFERENCIA_REPARTIDOR';
  metodoPago: MetodoPago;
  monto: number;
  descripcion: string;
  usuarioNombre: string;
  createdAt: string;
}

export interface CajaDomiciliosPendientesModel {
  cantidad: number;
  montoTotal: number;
  enRutaCantidad: number;
  bloquearCierre: boolean;
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
  domiciliosPendientesLiquidar?: CajaDomiciliosPendientesModel;
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
    valorInventarioActual: number | null;
    insumosConStockSinCosto: number;
    ingredientesEnNegativoCount: number;
    deficitTotalInventarioOz: number;
    deficitTotalInventarioLb: number;
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
  ingresosSinIva: number;
  costos: number;
  mermas: number;
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
export type SeveridadAuditoria = 'BAJA' | 'MEDIA' | 'ALTA';

export interface AuditoriaLogModel {
  id: number;
  accion: string;
  severidad: SeveridadAuditoria;
  entidad: string;
  entidadId: string | null;
  usuarioId: number | null;
  usuarioNombre: string;
  usuarioUsername: string;
  rolNombre: string;
  actorRolCodigo: string | null;
  aprobadorId: number | null;
  aprobadorNombre: string | null;
  aprobadorUsername: string | null;
  cajaSesionId: number | null;
  valorAnterior: unknown;
  valorNuevo: unknown;
  codigoMotivo: string | null;
  motivo: string | null;
  impactoFinanciero: number | null;
  correlacionId: string | null;
  ipAddress: string | null;
  createdAt: string;
  resumenNatural: string;
}

export interface AuditoriaEntidadOrigenModel {
  tipo: string;
  id: number;
  etiqueta: string;
  ruta: string;
  permisoRequerido: string;
  soloAdmin?: boolean;
}

export interface AuditoriaDetalleModel extends AuditoriaLogModel {
  entidadOrigen: AuditoriaEntidadOrigenModel | null;
  eventosCorrelacionados: AuditoriaLogModel[];
}

export interface AuditoriaRankingUsuarioModel {
  usuarioId: number;
  username: string;
  nombreCompleto: string;
  rolCodigo: string | null;
  rolNombre: string | null;
  eventosAlta: number;
  anulaciones: number;
  impactoAcumulado: number;
}

export interface AuditoriaRankingAprobadorModel {
  aprobadorId: number;
  username: string;
  nombreCompleto: string;
  rolNombre: string | null;
  totalAutorizaciones: number;
  cierresConDiferencia: number;
}

export interface AuditoriaAlertaModel {
  tipo: 'ANULACIONES_REPETIDAS_TURNO' | 'APROBADOR_RECURRENTE';
  severidad: SeveridadAuditoria;
  titulo: string;
  detalle: string;
  usuarioId?: number;
  aprobadorId?: number;
  cajaSesionId?: number;
  cantidad: number;
  montoTotal?: number;
}

export interface AuditoriaResumenModel {
  totalEventos: number;
  porSeveridad: Record<SeveridadAuditoria, number>;
  impactoTotalAnulado: number;
  diferenciaNetaCaja: number;
  cantidadReimpresiones: number;
  umbrales: {
    impactoAltoQ: number;
    diferenciaCajaAltaQ: number;
    repeticionUmbral: number;
  };
  rankingUsuariosRiesgo: AuditoriaRankingUsuarioModel[];
  rankingAprobadores: AuditoriaRankingAprobadorModel[];
  alertas: AuditoriaAlertaModel[];
}

export interface AuditoriaUsuarioFiltroModel {
  id: number;
  username: string;
  nombreCompleto: string;
  rolCodigo: string | null;
  rolNombre: string | null;
}

export interface AuditoriaTurnoFiltroModel {
  id: number;
  estado: string;
  fechaApertura: string;
  fechaCierre: string | null;
}

export interface AuditoriaCatalogoModel {
  acciones: string[];
  usuarios: AuditoriaUsuarioFiltroModel[];
  aprobadores: AuditoriaUsuarioFiltroModel[];
  turnos: AuditoriaTurnoFiltroModel[];
  severidades: SeveridadAuditoria[];
  codigosMotivo: string[];
  entidades: string[];
}

export interface AuditoriaFiltrosState {
  fechaDesde: string;
  fechaHasta: string;
  usuarioId: string;
  aprobadorId: string;
  accion: string;
  severidad: string;
  cajaSesionId: string;
  impactoMin: string;
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
  fechaBajaNomina?: string | null;
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

// --- SERVICIO A DOMICILIO ---
export type EstadoPedidoDomicilio =
  | 'NUEVO'
  | 'EN_PREPARACION'
  | 'LISTO'
  | 'EN_RUTA'
  | 'ENTREGADO'
  | 'CANCELADO'
  | 'FALLIDO';

export type ModalidadPagoDomicilio = 'PREPAGADO' | 'CONTRA_ENTREGA';
export type TipoEntregaPedido = 'DELIVERY' | 'LLEVAR';
export type OrigenPedido = 'POS' | 'WEB';

export interface ZonaEntregaModel {
  id: number;
  nombre: string;
  descripcion: string | null;
  costoEnvio: number;
  tiempoEstimadoMin: number;
  pedidoMinimo: number;
  activa: boolean;
}

export interface DireccionEntregaModel {
  id: number;
  clienteId: number;
  zonaEntregaId: number | null;
  alias: string;
  direccion: string;
  referencia: string | null;
  esPrincipal: boolean;
  activa: boolean;
  zonaEntrega: ZonaEntregaModel | null;
}

export interface ClienteDomicilioModel {
  id: number;
  nombre: string;
  telefono: string;
  nit: string | null;
  notas: string | null;
  bloqueadoPedidosWeb: boolean;
  activo: boolean;
  direcciones: DireccionEntregaModel[];
}

export interface PedidoDomicilioDetalleModel {
  id: number;
  platilloId: number;
  nombrePlatillo: string;
  cantidad: number;
  cantidadCortesia: number;
  precioUnitario: number;
  subtotal: number;
  notas: string | null;
}

export interface PedidoDomicilioHistorialModel {
  id: number;
  estadoAnterior: EstadoPedidoDomicilio | null;
  estadoNuevo: EstadoPedidoDomicilio;
  usuarioId: number;
  usuarioNombre: string | null;
  observacion: string | null;
  createdAt: string;
}

export interface PedidoDomicilioModel {
  id: number;
  numeroPedido: string;
  clienteId: number;
  direccionEntregaId: number | null;
  zonaEntregaId: number | null;
  creadoPorId: number | null;
  repartidorId: number | null;
  ventaId: number | null;
  tipoEntrega: TipoEntregaPedido;
  origen: OrigenPedido;
  trackingToken: string | null;
  estado: EstadoPedidoDomicilio;
  modalidadPago: ModalidadPagoDomicilio;
  metodoPagoEsperado: MetodoPago;
  subtotalPlatillos: number;
  costoEnvio: number;
  total: number;
  zonaNombre: string;
  tiempoEstimadoMin: number;
  clienteNombre: string;
  clienteNit: string;
  clienteBloqueadoWeb?: boolean;
  clienteTelefono: string;
  direccion: string | null;
  referencia: string | null;
  observaciones: string | null;
  montoConQuePaga: number | null;
  montoRecibidoRepartidor: number | null;
  diferenciaLiquidacion: number | null;
  referenciaPagoLiquidacion: string | null;
  liquidadoEn: string | null;
  motivoCierre: string | null;
  mermaGenerada: boolean;
  facturaAnuladaCierre: boolean;
  pendienteLiquidar: boolean;
  asignadoEn: string | null;
  despachadoEn: string | null;
  entregadoEn: string | null;
  canceladoEn: string | null;
  fallidoEn: string | null;
  createdAt: string;
  updatedAt: string;
  creadoPor: { id: number; nombreCompleto: string; username: string } | null;
  repartidor: { id: number; nombreCompleto: string; username: string } | null;
  liquidadoPor: { id: number; nombreCompleto: string; username: string } | null;
  comanda: { id: number; numeroComanda: string; estadoCocina: string; createdAt: string } | null;
  venta: {
    id: number;
    metodoPago: MetodoPago;
    estado: string;
    total: number;
    costoEnvio: number;
    referenciaPago: string | null;
    createdAt: string;
    factura: {
      id: number;
      numeroCompleto: string;
      estado: string;
      total: number;
      costoEnvio: number;
      createdAt: string;
    } | null;
  } | null;
  detalles: PedidoDomicilioDetalleModel[];
  historial?: PedidoDomicilioHistorialModel[];
}

export interface DomiciliosResumenModel {
  porEstado: Record<EstadoPedidoDomicilio, number>;
  activosCount: number;
  pendientesLiquidarCount: number;
}

export interface AdvertenciaStockModel {
  ingredienteId: number;
  ingredienteNombre: string;
  requeridoOz: number;
  stockActualOz: number;
  faltanteOz: number;
}

export interface ReporteDomiciliosModel {
  periodo: { fechaDesde: string; fechaHasta: string };
  kpis: {
    totalPedidos: number;
    entregados: number;
    cancelados: number;
    fallidos: number;
    activos: number;
    pendientesLiquidar: number;
    tasaCancelacionPct: number;
    tasaFalloPct: number;
    tiempoPromedioEntregaMin: number;
    ingresosTotalesDomicilio: number;
    ingresosEnvioTotal: number;
    costoMermasDomicilio: number;
    diferenciaLiquidacionNeta: number;
  };
  porEstado: Array<{ estado: EstadoPedidoDomicilio; cantidad: number; total: number }>;
  porZona: Array<{
    zonaEntregaId: number;
    zonaNombre: string;
    totalPedidos: number;
    entregados: number;
    fallidos: number;
    cancelados: number;
    ingresosEnvio: number;
    totalFacturado: number;
    tiempoPromedioMin: number;
  }>;
  porRepartidor: Array<{
    repartidorId: number;
    nombreCompleto: string;
    username: string;
    asignados: number;
    entregados: number;
    fallidos: number;
    pendientesLiquidar: number;
    tiempoPromedioRutaMin: number;
    diferenciaAcumulada: number;
  }>;
}
