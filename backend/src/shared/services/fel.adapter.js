const crypto = require('node:crypto');
const { env } = require('../../config/env');
const { EstadoFel } = require('../../models');

/**
 * Adaptador desacoplado para integración con Certificadores FEL de SAT Guatemala (Fase 3.2 y 3.3).
 *
 * REGLAS DE ARQUITECTURA:
 * - Nunca debe invocarse dentro de una transacción de base de datos (`withTransaction`).
 *   Las llamadas externas a un certificador (Infile, Megaprint, Digifact, etc.) se ejecutan
 *   únicamente en el callback `onAfterCommit` después de confirmar la transacción local.
 * - Cuando `FEL_ENABLED=false`, mantiene el comportamiento sin certificación (`NO_APLICA`).
 * - Cuando `FEL_ENABLED=true`:
 *   - `FEL_PROVIDER=SIMULADOR`: genera certificación/anulación simulada para pruebas de integración.
 *   - Otros proveedores: punto de extensión documentado listo para conectar el SDK/API SOAP-REST del certificador.
 */
class FelAdapter {
  /**
   * Certifica una factura ya persistida (emitida localmente en estado PENDIENTE) ante el certificador FEL.
   * @param {{ facturaId: number, numeroCompleto: string, clienteNit: string, clienteNombre: string, total: number, ivaMonto: number }} solicitud
   */
  static async certificar(solicitud) {
    if (!env.FEL_ENABLED) {
      return {
        felEstado: EstadoFel.NO_APLICA,
        felUuid: null,
        felSerie: null,
        felNumero: null,
        felCertificadoEn: null,
        felErrorDetalle: null,
      };
    }

    const provider = String(env.FEL_PROVIDER || 'NONE').trim().toUpperCase();

    // Modo simulador para pruebas locales y automatizadas sin depender de credenciales SAT
    if (provider === 'SIMULADOR') {
      return {
        felEstado: EstadoFel.CERTIFICADA,
        felUuid: crypto.randomUUID().toUpperCase(),
        felSerie: `FEL-${solicitud.numeroCompleto.split('-')[0] || 'A'}`,
        felNumero: String(solicitud.facturaId).padStart(10, '0'),
        felCertificadoEn: new Date(),
        felErrorDetalle: null,
      };
    }

    // Stub documentado para integraciones productivas (Infile / Megaprint / Digifact)
    // TODO(FEL-SAT): Enviar XML DTE firmado al endpoint del certificador configurado en env.FEL_PROVIDER
    return {
      felEstado: EstadoFel.RECHAZADA,
      felUuid: null,
      felSerie: null,
      felNumero: null,
      felCertificadoEn: null,
      felErrorDetalle: `Proveedor FEL "${provider}" no configurado con credenciales de certificación`,
    };
  }

  /**
   * Anula un DTE previamente certificado ante SAT Guatemala (Fase 3.3).
   * Se invoca únicamente post-commit cuando la factura estaba en estado `CERTIFICADA` y `FEL_ENABLED=true`.
   * @param {{ facturaId: number, numeroCompleto: string, felUuid: string | null, clienteNit: string, motivo: string }} solicitud
   */
  static async anular(solicitud) {
    if (!env.FEL_ENABLED || !solicitud.felUuid) {
      return {
        felAnulacionEstado: 'NO_APLICA',
        felAnulacionUuid: null,
        felAnuladaEn: null,
        felErrorDetalle: null,
      };
    }

    const provider = String(env.FEL_PROVIDER || 'NONE').trim().toUpperCase();

    if (provider === 'SIMULADOR') {
      return {
        felAnulacionEstado: 'ANULADA_SAT',
        felAnulacionUuid: `ANUL-${crypto.randomUUID().toUpperCase()}`,
        felAnuladaEn: new Date(),
        felErrorDetalle: null,
      };
    }

    // Stub documentado para anulación DTE ante certificador SAT
    // TODO(FEL-SAT): Firmar XML de Anulación DTE con felUuid y motivo, enviar al certificador y retornar UUID de acuse
    return {
      felAnulacionEstado: 'PENDIENTE_SAT',
      felAnulacionUuid: null,
      felAnuladaEn: null,
      felErrorDetalle: `Anulación FEL pendiente de envío manual/reintento para proveedor "${provider}"`,
    };
  }
}

module.exports = { FelAdapter };
