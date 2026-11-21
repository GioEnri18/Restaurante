import { NextFunction, Request, Response } from 'express';
import { AnyZodObject } from 'zod';

type Target = 'body' | 'query' | 'params';

/**
 * Middleware genérico de validación con Zod para body, query o params.
 */
export function validate(schema: AnyZodObject, target: Target = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      next(result.error);
      return;
    }
    // Reemplaza con datos parseados y coercionados por Zod
    (req as unknown as Record<string, unknown>)[target] = result.data;
    next();
  };
}
