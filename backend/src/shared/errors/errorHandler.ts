import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from './AppError';
import { env } from '../../config/env';

// Middleware centralizado de manejo de errores para toda la API
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Error controlado de la lógica de negocio
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // Error de validación Zod
  if (err instanceof ZodError) {
    res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos de entrada inválidos',
        details: err.errors.map((issue) => ({
          campo: issue.path.join('.'),
          mensaje: issue.message,
        })),
      },
    });
    return;
  }

  // Errores conocidos de Prisma (duplicados, llaves foráneas, registro inexistente)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        ok: false,
        error: {
          code: 'DUPLICATE_ENTRY',
          message: 'Ya existe un registro con los mismos datos únicos',
          details: err.meta,
        },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'El registro solicitado no existe',
        },
      });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({
        ok: false,
        error: {
          code: 'FOREIGN_KEY_VIOLATION',
          message: 'Referencia inválida a un registro relacionado',
        },
      });
      return;
    }
  }

  // Error inesperado
  console.error('❌ Error no controlado:', err);
  res.status(500).json({
    ok: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message:
        env.NODE_ENV === 'production'
          ? 'Error interno del servidor'
          : err instanceof Error
            ? err.message
            : 'Error desconocido',
    },
  });
}
