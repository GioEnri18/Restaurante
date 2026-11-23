import {
  AuditoriaAlertaModel,
  AuditoriaCatalogoModel,
  AuditoriaDetalleModel,
  AuditoriaEntidadOrigenModel,
  AuditoriaLogModel,
  AuditoriaRankingAprobadorModel,
  AuditoriaRankingUsuarioModel,
  AuditoriaResumenModel,
  AuditoriaTurnoFiltroModel,
  AuditoriaUsuarioFiltroModel,
  SeveridadAuditoria,
} from '../models';
import { formatCurrency } from '../utils/formatters';

interface RawAuditoriaRolJson {
  codigo?: string | null;
  nombre?: string | null;
}

interface RawAuditoriaUsuarioJson {
  id?: number | string;
  nombreCompleto?: string;
  username?: string;
  rol?: RawAuditoriaRolJson | null;
}

interface RawAuditoriaLogJson {
  id?: number | string;
  accion?: string;
  severidad?: string | null;
  entidad?: string;
  entidadId?: string | number | null;
  usuarioId?: number | string | null;
  usuario?: RawAuditoriaUsuarioJson | null;
  actorRolCodigo?: string | null;
  aprobadorId?: number | string | null;
  aprobador?: RawAuditoriaUsuarioJson | null;
  cajaSesionId?: number | string | null;
  valorAnterior?: unknown;
  valorNuevo?: unknown;
  codigoMotivo?: string | null;
  motivo?: string | null;
  impactoFinanciero?: number | string | null;
  correlacionId?: string | null;
  ipAddress?: string | null;
  createdAt?: string;
}

interface RawAuditoriaDetalleJson extends RawAuditoriaLogJson {
  entidadOrigen?: Partial<AuditoriaEntidadOrigenModel> | null;
  eventosCorrelacionados?: unknown[];
}

interface RawAuditoriaResumenJson {
  totalEventos?: number | string;
  porSeveridad?: Partial<Record<SeveridadAuditoria, number | string>>;
  impactoTotalAnulado?: number | string;
  diferenciaNetaCaja?: number | string;
  cantidadReimpresiones?: number | string;
  umbrales?: {
    impactoAltoQ?: number | string;
    diferenciaCajaAltaQ?: number | string;
    repeticionUmbral?: number | string;
  };
  rankingUsuariosRiesgo?: unknown[];
  rankingAprobadores?: unknown[];
  alertas?: unknown[];
}

interface RawAuditoriaCatalogoJson {
  acciones?: unknown[];
  usuarios?: unknown[];
  aprobadores?: unknown[];
  turnos?: unknown[];
  severidades?: unknown[];
  codigosMotivo?: unknown[];
  entidades?: unknown[];
}

export interface DiffCampoAuditoria {
  campo: string;
  etiqueta: string;
  anterior: unknown;
  nuevo: unknown;
  cambiado: boolean;
  estado: 'modificado' | 'agregado' | 'eliminado' | 'igual';
}

function asRecord<T>(raw: unknown): T {
  return (raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as T;
}

function normalizarSeveridad(raw: unknown): SeveridadAuditoria {
  if (raw === 'ALTA' || raw === 'MEDIA' || raw === 'BAJA') return raw;
  return 'BAJA';
}

function numeroONull(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

const ETIQUETAS_ACCION: Record<string, string> = {
  LOGIN_EXITOSO: 'Inicio de sesión',
  LOGIN_FALLIDO: 'Intento de acceso fallido',
  BLOQUEO_CUENTA: 'Bloqueo temporal de cuenta',
  LOGOUT: 'Cierre de sesión',
  VENTA_CONFIRMADA: 'Venta confirmada',
  ANULACION_FACTURA: 'Anulación de factura',
  REIMPRESION_FACTURA: 'Reimpresión de factura',
  CAMBIO_PRECIO: 'Cambio de precio',
  CAMBIO_RECETA: 'Cambio de receta',
  CAMBIO_DISPONIBILIDAD_PLATILLO: 'Cambio de disponibilidad',
  CAMBIO_FOTO_PLATILLO: 'Cambio de foto de platillo',
  COMPRA_INVENTARIO: 'Compra de inventario',
  AJUSTE_INVENTARIO: 'Ajuste de inventario',
  REGISTRO_MERMA: 'Registro de merma',
  APERTURA_CAJA: 'Apertura de caja',
  MOVIMIENTO_CAJA: 'Movimiento manual de caja',
  CIERRE_CAJA: 'Cierre de caja',
  AUTORIZACION_CAJA_RECHAZADA: 'Autorización de caja rechazada',
  CAMBIO_PERMISOS: 'Cambio de permisos',
  GESTION_USUARIO: 'Gestión de usuario',
  GESTION_NOMINA: 'Cambio de sueldo o fecha de ingreso',
  GESTION_ROL: 'Creación de rol',
  GESTION_MENU_ESPECIAL: 'Gestión de menú especial',
  EXPORTAR_AUDITORIA: 'Exportación de auditoría CSV',
};

const ETIQUETAS_CODIGO_MOTIVO: Record<string, string> = {
  ERROR_DE_CAPTURA: 'Error de captura',
  CLIENTE_CAMBIO_OPINION: 'Cliente cambió de opinión',
  PRODUCTO_DANADO: 'Producto dañado',
  VENCIMIENTO: 'Vencimiento',
  ERROR_PREPARACION: 'Error de preparación',
  ACCIDENTE_COCINA: 'Accidente en cocina',
  DIFERENCIA_DE_CAJA: 'Diferencia de caja',
  AJUSTE_DE_CONTEO: 'Ajuste de conteo',
  AUTORIZACION_SUPERVISOR: 'Autorización de supervisor',
  SEGURIDAD_ACCESO: 'Seguridad y accesos',
  GESTION_CATALOGO: 'Gestión de catálogo',
  OTRO: 'Otro',
};

const ETIQUETAS_CAMPO: Record<string, string> = {
  numeroCompleto: 'No. factura',
  estado: 'Estado',
  total: 'Total',
  metodoPago: 'Método de pago',
  motivoAnulacion: 'Motivo de anulación',
  reintegrarInventario: 'Reintegrar inventario',
  ingredientesReintegrados: 'Ingredientes reintegrados',
  mesaLiberada: 'Mesa liberada',
  reimpresionesCount: 'Copias impresas',
  montoInicial: 'Fondo inicial',
  montoEsperadoEfectivo: 'Esperado en efectivo',
  montoContadoEfectivo: 'Contado en efectivo',
  diferencia: 'Diferencia efectivo',
  totalVentasEfectivo: 'Ventas en efectivo',
  totalVentasTarjeta: 'Ventas con tarjeta',
  totalCobrosVentas: 'Total cobros por ventas',
  totalIngresosExtra: 'Ingresos extra',
  totalEgresos: 'Total egresos',
  totalEgresosTarjeta: 'Anulaciones tarjeta',
  totalTarjetaNeto: 'Tarjeta neta',
  totalVouchersConciliados: 'Vouchers conciliados',
  totalGeneralEsperado: 'Total general esperado',
  montoContadoGeneral: 'Total contado general',
  diferenciaGeneral: 'Diferencia general',
  vouchersConciliados: 'Detalle de vouchers',
  autorizadoPor: 'Autorizado por',
  autoAutorizado: 'Autorización directa',
  fechaApertura: 'Fecha de apertura',
  observacionesCierre: 'Observaciones de cierre',
  stockActualOz: 'Stock actual (oz)',
  stockActualLb: 'Stock actual (lb)',
  stockAnteriorOz: 'Stock anterior (oz)',
  stockNuevoOz: 'Stock nuevo (oz)',
  stockMinimoOz: 'Stock mínimo (oz)',
  costoPromedioAnteriorOz: 'Costo promedio anterior (oz)',
  costoPromedioNuevoOz: 'Costo promedio nuevo (oz)',
  costoUnitarioOriginal: 'Costo unitario',
  precioPorLb: 'Precio por libra',
  cantidadLb: 'Cantidad (lb)',
  cantidadOz: 'Cantidad (oz)',
  cantidadOriginal: 'Cantidad',
  unidadOriginal: 'Unidad',
  ingredienteId: 'ID ingrediente',
  ingrediente: 'Ingrediente',
  items: 'Ítems',
  receta: 'Receta',
  precioVenta: 'Precio de venta',
  disponible: 'Disponible en ventas',
  sueldoMensual: 'Sueldo mensual',
  fechaIngreso: 'Fecha de ingreso',
  nombreCompleto: 'Nombre completo',
  permisos: 'Permisos',
  permisosPersonalizados: 'Permisos personalizados',
  vistaInicial: 'Vista inicial',
  costoEstimado: 'Costo estimado',
  cantidadMermada: 'Cantidad mermada',
  proveedor: 'Proveedor',
  numeroDocumento: 'No. documento',
  filasExportadas: 'Filas exportadas',
  filtrosAplicados: 'Filtros aplicados',
  truncado: 'Exportación truncada',
  ventaId: 'No. venta',
  referencia: 'Referencia / voucher',
  monto: 'Monto',
  cajaOriginalId: 'Turno original',
  cajaEgresoId: 'Turno del egreso',
  cajaMovimientoId: 'ID movimiento caja',
};

export function etiquetaAccionAuditoria(accion: string): string {
  if (ETIQUETAS_ACCION[accion]) return ETIQUETAS_ACCION[accion];
  const frase = accion.toLowerCase().replaceAll('_', ' ');
  return frase ? frase.charAt(0).toUpperCase() + frase.slice(1) : 'Evento';
}

export function etiquetaCodigoMotivo(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  return ETIQUETAS_CODIGO_MOTIVO[codigo] ?? codigo;
}

export function etiquetaCampoAuditoria(campo: string): string {
  if (ETIQUETAS_CAMPO[campo]) return ETIQUETAS_CAMPO[campo];
  const separado = campo.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').toLowerCase();
  return separado ? separado.charAt(0).toUpperCase() + separado.slice(1) : campo;
}

function leerCampoTexto(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const val = (obj as Record<string, unknown>)[key];
  if (val === undefined || val === null || val === '') return null;
  return String(val);
}

function leerCampoNumero(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  return numeroONull((obj as Record<string, unknown>)[key]);
}

/**
 * Construye un resumen legible en lenguaje natural según el tipo de acción de auditoría.
 */
export function construirResumenNatural(log: Omit<AuditoriaLogModel, 'resumenNatural'>): string {
  const partes: string[] = [];
  const aprobadorTxt = log.aprobadorNombre ? `autorizó: ${log.aprobadorNombre}` : null;
  const motivoTxt = log.motivo ? `motivo: ${log.motivo}` : null;

  switch (log.accion) {
    case 'ANULACION_FACTURA': {
      const numero =
        leerCampoTexto(log.valorNuevo, 'numeroCompleto') ??
        leerCampoTexto(log.valorAnterior, 'numeroCompleto') ??
        `#${log.entidadId ?? ''}`;
      const monto = Math.abs(
        log.impactoFinanciero ?? leerCampoNumero(log.valorAnterior, 'total') ?? 0,
      );
      partes.push(`Se anuló la factura ${numero} por ${formatCurrency(monto)}`);
      if (motivoTxt) partes.push(motivoTxt);
      if (aprobadorTxt) partes.push(aprobadorTxt);
      break;
    }
    case 'REIMPRESION_FACTURA': {
      const numero = leerCampoTexto(log.valorNuevo, 'numeroCompleto') ?? `#${log.entidadId ?? ''}`;
      const copias = leerCampoNumero(log.valorNuevo, 'reimpresionesCount');
      partes.push(
        `Se reimprimió la factura ${numero}${copias !== null ? ` (copia #${copias})` : ''}`,
      );
      break;
    }
    case 'CIERRE_CAJA': {
      const diff = log.impactoFinanciero ?? leerCampoNumero(log.valorNuevo, 'diferencia') ?? 0;
      const turno = log.cajaSesionId ?? log.entidadId ?? '';
      if (diff === 0) {
        partes.push(`Se cerró el turno #${turno} cuadrado (${formatCurrency(0)})`);
      } else {
        partes.push(
          `Se cerró el turno #${turno} con diferencia de ${formatCurrency(diff)} (${diff < 0 ? 'faltante' : 'sobrante'})`,
        );
      }
      if (aprobadorTxt) partes.push(aprobadorTxt);
      break;
    }
    case 'APERTURA_CAJA': {
      const inicial = leerCampoNumero(log.valorNuevo, 'montoInicial') ?? 0;
      const turno = log.cajaSesionId ?? log.entidadId ?? '';
      partes.push(`Se abrió el turno #${turno} con fondo inicial de ${formatCurrency(inicial)}`);
      if (aprobadorTxt) partes.push(aprobadorTxt);
      break;
    }
    case 'MOVIMIENTO_CAJA': {
      const tipo = leerCampoTexto(log.valorNuevo, 'tipo');
      const monto = Math.abs(log.impactoFinanciero ?? leerCampoNumero(log.valorNuevo, 'monto') ?? 0);
      const esIngreso = tipo === 'INGRESO_MANUAL';
      partes.push(
        `Se registró un ${esIngreso ? 'ingreso' : 'egreso'} manual en caja por ${formatCurrency(monto)}`,
      );
      if (motivoTxt) partes.push(motivoTxt);
      break;
    }
    case 'AUTORIZACION_CAJA_RECHAZADA': {
      const op = leerCampoTexto(log.valorNuevo, 'operacion') ?? 'operación';
      partes.push(`Autorización de supervisor rechazada al intentar ${op} caja`);
      if (motivoTxt) partes.push(motivoTxt);
      break;
    }
    case 'VENTA_CONFIRMADA': {
      const factura = leerCampoTexto(log.valorNuevo, 'factura') ?? `#${log.entidadId ?? ''}`;
      const total = log.impactoFinanciero ?? leerCampoNumero(log.valorNuevo, 'total') ?? 0;
      partes.push(`Se confirmó la venta ${factura} por ${formatCurrency(total)}`);
      break;
    }
    case 'REGISTRO_MERMA': {
      const ing = leerCampoTexto(log.valorNuevo, 'ingrediente') ?? 'ingrediente';
      const cant = leerCampoTexto(log.valorNuevo, 'cantidadMermada');
      const costo = Math.abs(
        log.impactoFinanciero ?? leerCampoNumero(log.valorNuevo, 'costoEstimado') ?? 0,
      );
      partes.push(
        `Se registró merma de ${ing}${cant ? ` (${cant})` : ''} por ${formatCurrency(costo)}`,
      );
      if (motivoTxt) partes.push(motivoTxt);
      break;
    }
    case 'AJUSTE_INVENTARIO': {
      const nombre = leerCampoTexto(log.valorNuevo, 'nombre') ?? `${log.entidad} #${log.entidadId ?? ''}`;
      const cant = leerCampoTexto(log.valorNuevo, 'cantidadOriginal');
      const tipo = leerCampoTexto(log.valorNuevo, 'tipoAjuste');
      if (cant && tipo) {
        partes.push(
          `Ajuste de inventario (${tipo === 'ENTRADA' ? 'entrada' : 'salida'}) en ${nombre}: ${cant}`,
        );
      } else {
        partes.push(`Movimiento de inventario sobre ${nombre}`);
      }
      if (motivoTxt) partes.push(motivoTxt);
      break;
    }
    case 'COMPRA_INVENTARIO': {
      const prov = leerCampoTexto(log.valorNuevo, 'proveedor') ?? 'proveedor';
      const total = Math.abs(log.impactoFinanciero ?? leerCampoNumero(log.valorNuevo, 'total') ?? 0);
      partes.push(`Se registró compra a ${prov} por ${formatCurrency(total)}`);
      break;
    }
    case 'CAMBIO_PRECIO': {
      const nombre = leerCampoTexto(log.valorNuevo, 'nombre') ?? `${log.entidad} #${log.entidadId ?? ''}`;
      const prev = leerCampoNumero(log.valorAnterior, 'precioVenta');
      const nuevo = leerCampoNumero(log.valorNuevo, 'precioVenta');
      if (prev !== null && nuevo !== null) {
        partes.push(`Precio de ${nombre} cambió de ${formatCurrency(prev)} a ${formatCurrency(nuevo)}`);
      } else {
        partes.push(`Se actualizó catálogo: ${nombre}`);
      }
      if (motivoTxt) partes.push(motivoTxt);
      break;
    }
    case 'CAMBIO_DISPONIBILIDAD_PLATILLO': {
      const nombre = leerCampoTexto(log.valorNuevo, 'nombre') ?? `Platillo #${log.entidadId ?? ''}`;
      const disp = (log.valorNuevo as Record<string, unknown> | null)?.disponible === true;
      partes.push(`Se ${disp ? 'habilitó' : 'deshabilitó'} "${nombre}" en el menú de ventas`);
      break;
    }
    case 'CAMBIO_PERMISOS': {
      const rol = leerCampoTexto(log.valorNuevo, 'rol') ?? `#${log.entidadId ?? ''}`;
      partes.push(`Se modificaron permisos de ${log.entidad.toLowerCase()} ${rol}`);
      if (motivoTxt) partes.push(motivoTxt);
      break;
    }
    case 'GESTION_USUARIO': {
      const usr =
        leerCampoTexto(log.valorNuevo, 'username') ??
        leerCampoTexto(log.valorNuevo, 'nombreCompleto') ??
        `#${log.entidadId ?? ''}`;
      partes.push(`Cambio en usuario ${usr}`);
      if (motivoTxt) partes.push(motivoTxt);
      break;
    }
    case 'BLOQUEO_CUENTA': {
      partes.push(`Cuenta bloqueada temporalmente por exceso de intentos fallidos`);
      if (motivoTxt) partes.push(motivoTxt);
      break;
    }
    case 'EXPORTAR_AUDITORIA': {
      const filas = leerCampoNumero(log.valorNuevo, 'filasExportadas') ?? 0;
      partes.push(`Se exportó la bitácora de auditoría en CSV (${filas} filas)`);
      break;
    }
    default: {
      partes.push(
        `${etiquetaAccionAuditoria(log.accion)} en ${log.entidad}${log.entidadId ? ` #${log.entidadId}` : ''}`,
      );
      if (motivoTxt) partes.push(motivoTxt);
      if (aprobadorTxt) partes.push(aprobadorTxt);
      break;
    }
  }

  return partes.join(' · ');
}

function esObjetoPlano(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

/**
 * Construye una lista estructurada de campos antes/después resaltando cuáles cambiaron.
 */
export function calcularDiffCampos(
  valorAnterior: unknown,
  valorNuevo: unknown,
): DiffCampoAuditoria[] {
  const prevObj = esObjetoPlano(valorAnterior) ? valorAnterior : null;
  const nextObj = esObjetoPlano(valorNuevo) ? valorNuevo : null;

  if (!prevObj && !nextObj) {
    if (valorAnterior === null && valorNuevo === null) return [];
    const igual = JSON.stringify(valorAnterior) === JSON.stringify(valorNuevo);
    return [
      {
        campo: 'valor',
        etiqueta: 'Detalle',
        anterior: valorAnterior ?? null,
        nuevo: valorNuevo ?? null,
        cambiado: !igual,
        estado:
          valorAnterior === null ? 'agregado' : valorNuevo === null ? 'eliminado' : igual ? 'igual' : 'modificado',
      },
    ];
  }

  const claves = Array.from(
    new Set([...Object.keys(prevObj ?? {}), ...Object.keys(nextObj ?? {})]),
  );

  const esVacio = (v: unknown) => v === undefined || v === null || v === '';

  return claves
    .map((campo) => {
      const tienePrev = Boolean(prevObj && Object.hasOwn(prevObj, campo));
      const tieneNext = Boolean(nextObj && Object.hasOwn(nextObj, campo));
      const anterior = tienePrev && prevObj ? prevObj[campo] : undefined;
      const nuevo = tieneNext && nextObj ? nextObj[campo] : undefined;

      // Evita marcar como "Nuevo" o "Quitado" campos vacíos/null que no aportan cambio real
      if (esVacio(anterior) && esVacio(nuevo)) {
        return null;
      }

      const igual = tienePrev && tieneNext && JSON.stringify(anterior) === JSON.stringify(nuevo);

      let estado: DiffCampoAuditoria['estado'] = 'igual';
      if (esVacio(anterior) && !esVacio(nuevo)) estado = 'agregado';
      else if (!esVacio(anterior) && esVacio(nuevo)) estado = 'eliminado';
      else if (!igual) estado = 'modificado';

      return {
        campo,
        etiqueta: etiquetaCampoAuditoria(campo),
        anterior: tienePrev ? anterior : null,
        nuevo: tieneNext ? nuevo : null,
        cambiado: estado !== 'igual',
        estado,
      };
    })
    .filter((row): row is DiffCampoAuditoria => row !== null);
}

function mapEntidadOrigen(raw: unknown): AuditoriaEntidadOrigenModel | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<AuditoriaEntidadOrigenModel>;
  if (!data.tipo || !data.ruta || !data.etiqueta || !data.permisoRequerido) return null;
  return {
    tipo: String(data.tipo),
    id: Number(data.id ?? 0),
    etiqueta: String(data.etiqueta),
    ruta: String(data.ruta),
    permisoRequerido: String(data.permisoRequerido),
    soloAdmin: Boolean(data.soloAdmin),
  };
}

export const auditoriaAdapter = {
  fromLogJson(raw: unknown): AuditoriaLogModel {
    const data = asRecord<RawAuditoriaLogJson>(raw);
    const usuario = asRecord<RawAuditoriaUsuarioJson>(data.usuario);
    const rol = asRecord<RawAuditoriaRolJson>(usuario.rol);
    const aprobador = data.aprobador ? asRecord<RawAuditoriaUsuarioJson>(data.aprobador) : null;

    const base: Omit<AuditoriaLogModel, 'resumenNatural'> = {
      id: Number(data.id),
      accion: String(data.accion ?? ''),
      severidad: normalizarSeveridad(data.severidad),
      entidad: String(data.entidad ?? ''),
      entidadId: data.entidadId !== undefined && data.entidadId !== null ? String(data.entidadId) : null,
      usuarioId: numeroONull(data.usuarioId ?? usuario.id),
      usuarioNombre: String(usuario.nombreCompleto ?? 'Sistema / Anónimo'),
      usuarioUsername: String(usuario.username ?? '—'),
      rolNombre: String(rol.nombre ?? data.actorRolCodigo ?? '—'),
      actorRolCodigo: data.actorRolCodigo ?? rol.codigo ?? null,
      aprobadorId: numeroONull(data.aprobadorId ?? aprobador?.id),
      aprobadorNombre: aprobador?.nombreCompleto ? String(aprobador.nombreCompleto) : null,
      aprobadorUsername: aprobador?.username ? String(aprobador.username) : null,
      cajaSesionId: numeroONull(data.cajaSesionId),
      valorAnterior: data.valorAnterior ?? null,
      valorNuevo: data.valorNuevo ?? null,
      codigoMotivo: data.codigoMotivo ?? null,
      motivo: data.motivo ?? null,
      impactoFinanciero: numeroONull(data.impactoFinanciero),
      correlacionId: data.correlacionId ?? null,
      ipAddress: data.ipAddress ?? null,
      createdAt: String(data.createdAt ?? ''),
    };

    return {
      ...base,
      resumenNatural: construirResumenNatural(base),
    };
  },

  fromDetalleJson(raw: unknown): AuditoriaDetalleModel {
    const data = asRecord<RawAuditoriaDetalleJson>(raw);
    const base = this.fromLogJson(data);
    return {
      ...base,
      entidadOrigen: mapEntidadOrigen(data.entidadOrigen),
      eventosCorrelacionados: Array.isArray(data.eventosCorrelacionados)
        ? data.eventosCorrelacionados.map((item) => this.fromLogJson(item))
        : [],
    };
  },

  fromResumenJson(raw: unknown): AuditoriaResumenModel {
    const data = asRecord<RawAuditoriaResumenJson>(raw);
    const sev = data.porSeveridad ?? {};
    const umb = data.umbrales ?? {};

    const rankingUsuariosRiesgo: AuditoriaRankingUsuarioModel[] = Array.isArray(data.rankingUsuariosRiesgo)
      ? data.rankingUsuariosRiesgo.map((item) => {
          const r = asRecord<Partial<AuditoriaRankingUsuarioModel>>(item);
          return {
            usuarioId: Number(r.usuarioId ?? 0),
            username: String(r.username ?? ''),
            nombreCompleto: String(r.nombreCompleto ?? ''),
            rolCodigo: r.rolCodigo ? String(r.rolCodigo) : null,
            rolNombre: r.rolNombre ? String(r.rolNombre) : null,
            eventosAlta: Number(r.eventosAlta ?? 0),
            anulaciones: Number(r.anulaciones ?? 0),
            impactoAcumulado: Number(r.impactoAcumulado ?? 0),
          };
        })
      : [];

    const rankingAprobadores: AuditoriaRankingAprobadorModel[] = Array.isArray(data.rankingAprobadores)
      ? data.rankingAprobadores.map((item) => {
          const r = asRecord<Partial<AuditoriaRankingAprobadorModel>>(item);
          return {
            aprobadorId: Number(r.aprobadorId ?? 0),
            username: String(r.username ?? ''),
            nombreCompleto: String(r.nombreCompleto ?? ''),
            rolNombre: r.rolNombre ? String(r.rolNombre) : null,
            totalAutorizaciones: Number(r.totalAutorizaciones ?? 0),
            cierresConDiferencia: Number(r.cierresConDiferencia ?? 0),
          };
        })
      : [];

    const alertas: AuditoriaAlertaModel[] = Array.isArray(data.alertas)
      ? data.alertas.map((item) => {
          const a = asRecord<Partial<AuditoriaAlertaModel>>(item);
          return {
            tipo:
              a.tipo === 'APROBADOR_RECURRENTE'
                ? 'APROBADOR_RECURRENTE'
                : 'ANULACIONES_REPETIDAS_TURNO',
            severidad: normalizarSeveridad(a.severidad),
            titulo: String(a.titulo ?? ''),
            detalle: String(a.detalle ?? ''),
            usuarioId: numeroONull(a.usuarioId) ?? undefined,
            aprobadorId: numeroONull(a.aprobadorId) ?? undefined,
            cajaSesionId: numeroONull(a.cajaSesionId) ?? undefined,
            cantidad: Number(a.cantidad ?? 0),
            montoTotal: numeroONull(a.montoTotal) ?? undefined,
          };
        })
      : [];

    return {
      totalEventos: Number(data.totalEventos ?? 0),
      porSeveridad: {
        BAJA: Number(sev.BAJA ?? 0),
        MEDIA: Number(sev.MEDIA ?? 0),
        ALTA: Number(sev.ALTA ?? 0),
      },
      impactoTotalAnulado: Number(data.impactoTotalAnulado ?? 0),
      diferenciaNetaCaja: Number(data.diferenciaNetaCaja ?? 0),
      cantidadReimpresiones: Number(data.cantidadReimpresiones ?? 0),
      umbrales: {
        impactoAltoQ: Number(umb.impactoAltoQ ?? 500),
        diferenciaCajaAltaQ: Number(umb.diferenciaCajaAltaQ ?? 50),
        repeticionUmbral: Number(umb.repeticionUmbral ?? 3),
      },
      rankingUsuariosRiesgo,
      rankingAprobadores,
      alertas,
    };
  },

  fromCatalogoJson(raw: unknown): AuditoriaCatalogoModel {
    const data = asRecord<RawAuditoriaCatalogoJson>(raw);
    const mapUsuario = (item: unknown): AuditoriaUsuarioFiltroModel => {
      const u = asRecord<Partial<AuditoriaUsuarioFiltroModel>>(item);
      return {
        id: Number(u.id ?? 0),
        username: String(u.username ?? ''),
        nombreCompleto: String(u.nombreCompleto ?? ''),
        rolCodigo: u.rolCodigo ? String(u.rolCodigo) : null,
        rolNombre: u.rolNombre ? String(u.rolNombre) : null,
      };
    };

    const turnos: AuditoriaTurnoFiltroModel[] = Array.isArray(data.turnos)
      ? data.turnos.map((item) => {
          const t = asRecord<Partial<AuditoriaTurnoFiltroModel>>(item);
          return {
            id: Number(t.id ?? 0),
            estado: String(t.estado ?? ''),
            fechaApertura: String(t.fechaApertura ?? ''),
            fechaCierre: t.fechaCierre ? String(t.fechaCierre) : null,
          };
        })
      : [];

    return {
      acciones: Array.isArray(data.acciones) ? data.acciones.map(String) : [],
      usuarios: Array.isArray(data.usuarios) ? data.usuarios.map(mapUsuario) : [],
      aprobadores: Array.isArray(data.aprobadores) ? data.aprobadores.map(mapUsuario) : [],
      turnos,
      severidades: Array.isArray(data.severidades)
        ? data.severidades.map(normalizarSeveridad)
        : ['BAJA', 'MEDIA', 'ALTA'],
      codigosMotivo: Array.isArray(data.codigosMotivo) ? data.codigosMotivo.map(String) : [],
      entidades: Array.isArray(data.entidades) ? data.entidades.map(String) : [],
    };
  },
};
