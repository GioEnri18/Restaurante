import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { AccionAuditoria } from '../../config/constants';

export interface AuditLogInput {
  sucursalId?: number | null;
  usuarioId?: number | null;
  accion: AccionAuditoria | string;
  entidad: string;
  entidadId?: string | number | null;
  valorAnterior?: unknown;
  valorNuevo?: unknown;
  motivo?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * Servicio transversal de auditoría inmutable (APPEND-ONLY).
 * Puede ser invocado desde cualquier módulo, tanto fuera como dentro de una transacción Prisma.
 */
export class AuditService {
  private static sanitizeJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.JsonNull;
    // Serializa de forma segura Decimals, Dates y BigInts a JSON plano
    return JSON.parse(
      JSON.stringify(value, (_key, val) => (typeof val === 'bigint' ? val.toString() : val)),
    ) as Prisma.InputJsonValue;
  }

  static async registrar(input: AuditLogInput, tx?: PrismaLike): Promise<void> {
    const db = tx ?? prisma;

    await db.auditoriaLog.create({
      data: {
        sucursalId: input.sucursalId ?? null,
        usuarioId: input.usuarioId ?? null,
        accion: input.accion,
        entidad: input.entidad,
        entidadId: input.entidadId !== undefined && input.entidadId !== null ? String(input.entidadId) : null,
        valorAnterior: this.sanitizeJson(input.valorAnterior),
        valorNuevo: this.sanitizeJson(input.valorNuevo),
        motivo: input.motivo ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ? input.userAgent.slice(0, 255) : null,
      },
    });
  }
}
