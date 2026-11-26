/**
 * Utilidades puras de privacidad y normalización de datos de contacto (PII)
 * para el módulo de Servicio a Domicilio.
 */

const PERMISOS_CONTACTO_COMPLETO = [
  'domicilios:ver',
  'domicilios:crear',
  'domicilios:asignar',
  'domicilios:liquidar',
];

/**
 * Normaliza un número telefónico de Guatemala (o internacional) para búsquedas y unicidad.
 * Conserva solo dígitos (y elimina prefijo +502 / 502 si tiene 11 dígitos locales).
 */
function normalizarTelefono(raw) {
  if (typeof raw !== 'string') return '';
  let digitos = raw.replace(/\D/g, '');
  if (digitos.length === 11 && digitos.startsWith('502')) {
    digitos = digitos.slice(3);
  }
  return digitos;
}

/**
 * Enmascara un teléfono dejando visibles únicamente los últimos 4 dígitos (ej. ****5678).
 * Útil para auditoría, logs y vistas donde el usuario no tiene permiso de contacto completo.
 */
function enmascararTelefono(telefono) {
  const digitos = normalizarTelefono(String(telefono ?? ''));
  if (digitos.length <= 4) return '****';
  return `${'*'.repeat(Math.max(4, digitos.length - 4))}${digitos.slice(-4)}`;
}

/**
 * Enmascara una dirección para auditoría o vistas restringidas.
 */
function enmascararDireccion(direccion) {
  if (!direccion || typeof direccion !== 'string') return null;
  const limpia = direccion.trim();
  if (limpia.length === 0) return null;
  return '[DIRECCION_PROTEGIDA]';
}

/**
 * Determina si el usuario autenticado puede ver teléfono y dirección en claro para un pedido.
 * - Roles con permisos operativos/administrativos de domicilio: sí.
 * - Repartidor asignado: únicamente mientras el pedido esté activo (no históricos ajenos).
 */
function puedeVerDatosContacto(user, pedido) {
  if (!user || !Array.isArray(user.permisos)) return false;
  if (PERMISOS_CONTACTO_COMPLETO.some((p) => user.permisos.includes(p))) {
    return true;
  }
  if (
    user.permisos.includes('domicilios:ver_propios')
    && pedido
    && Number(pedido.repartidorId) === Number(user.id)
    && ['NUEVO', 'EN_PREPARACION', 'LISTO', 'EN_RUTA'].includes(pedido.estado)
  ) {
    return true;
  }
  return false;
}

module.exports = {
  normalizarTelefono,
  enmascararTelefono,
  enmascararDireccion,
  puedeVerDatosContacto,
};
