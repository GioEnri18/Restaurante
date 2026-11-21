import { NextFunction, Request, Response } from 'express';
import { TipoMovimientoInventario } from '@prisma/client';
import { InventarioService } from './inventario.service';

export class InventarioController {
  static async listarIngredientes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
      const data = await InventarioService.listarIngredientes(req.user!.sucursalId, search);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async alertas(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await InventarioService.obtenerAlertas(req.user!.sucursalId);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async crearIngrediente(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await InventarioService.crearIngrediente(req.user!, req.body, req.clientMeta!);
      res.status(201).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async actualizarIngrediente(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await InventarioService.actualizarIngrediente(
        req.user!,
        id,
        req.body,
        req.clientMeta!,
      );
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async ajustarStock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await InventarioService.ajustarStock(req.user!, id, req.body, req.clientMeta!);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async listarProveedores(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await InventarioService.listarProveedores(req.user!.sucursalId);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async crearProveedor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await InventarioService.crearProveedor(req.user!.sucursalId, req.body);
      res.status(201).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async actualizarProveedor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await InventarioService.actualizarProveedor(req.user!.sucursalId, id, req.body);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async listarCompras(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { items, meta } = await InventarioService.listarCompras(
        req.user!.sucursalId,
        req.query.page,
        req.query.limit,
      );
      res.status(200).json({ ok: true, data: items, meta });
    } catch (error) {
      next(error);
    }
  }

  static async registrarCompra(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await InventarioService.registrarCompra(req.user!, req.body, req.clientMeta!);
      res.status(201).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async listarMovimientos(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { items, meta } = await InventarioService.listarMovimientos(req.user!.sucursalId, {
        page: req.query.page,
        limit: req.query.limit,
        ingredienteId:
          typeof req.query.ingredienteId === 'string' ? req.query.ingredienteId : undefined,
        tipo:
          typeof req.query.tipo === 'string' &&
          Object.values(TipoMovimientoInventario).includes(
            req.query.tipo as TipoMovimientoInventario,
          )
            ? (req.query.tipo as TipoMovimientoInventario)
            : undefined,
        fechaDesde: typeof req.query.fechaDesde === 'string' ? req.query.fechaDesde : undefined,
        fechaHasta: typeof req.query.fechaHasta === 'string' ? req.query.fechaHasta : undefined,
      });
      res.status(200).json({ ok: true, data: items, meta });
    } catch (error) {
      next(error);
    }
  }
}
