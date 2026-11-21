import { EstadoFel } from '@prisma/client';
import { env } from '../../config/env';

export interface FelSolicitudCertificacion {
  facturaId: number;
  numeroCompleto: string;
  clienteNit: string;
  clienteNombre: string;
  total: number;
  ivaMonto: number;
}

export interface FelResultadoCertificacion {
  felEstado: EstadoFel;
  felUuid: string | null;
  felSerie: string | null;
  felNumero: string | null;
  felCertificadoEn: Date | null;
}

/**
 * Adaptador preparado para futura integración con Certificadores FEL de SAT Guatemala
 * (Infile, Digifact, Megaprint, G4S, etc.) sin alterar la lógica del módulo de ventas/facturas.
 */
export class FelAdapter {
  static async certificar(_solicitud: FelSolicitudCertificacion): Promise<FelResultadoCertificacion> {
    if (!env.FEL_ENABLED) {
      return {
        felEstado: EstadoFel.NO_APLICA,
        felUuid: null,
        felSerie: null,
        felNumero: null,
        felCertificadoEn: null,
      };
    }

    // Punto de extensión para llamada HTTP al certificador FEL configurado en FEL_PROVIDER
    return {
      felEstado: EstadoFel.PENDIENTE,
      felUuid: null,
      felSerie: null,
      felNumero: null,
      felCertificadoEn: null,
    };
  }
}
