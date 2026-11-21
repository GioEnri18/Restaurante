import { NextFunction, Request, Response } from 'express';
import { VentasService } from './ventas.service';

export class VentasController {
  static async menu(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
      const categoriaId = req.query.categoriaId ? Number(req.query.categoriaId) : undefined;
      const data = await VentasService.obtenerMenu(req.user!.sucursalId, search, categoriaId);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async listarMenusEspeciales(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await VentasService.listarMenusEspeciales(req.user!.sucursalId);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async alertasMenusEspeciales(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await VentasService.obtenerAlertasMenusEspeciales(req.user!.sucursalId);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async crearMenuEspecial(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await VentasService.crearMenuEspecial(req.user!, req.body, req.clientMeta!);
      res.status(201).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async actualizarMenuEspecial(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await VentasService.actualizarMenuEspecial(
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

  static async eliminarMenuEspecial(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await VentasService.eliminarMenuEspecial(req.user!, id, req.clientMeta!);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async crearPlatillo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await VentasService.crearPlatillo(req.user!, req.body, req.clientMeta!);
      res.status(201).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async actualizarPlatillo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const platilloId = Number(req.params.id);
      const data = await VentasService.actualizarPlatillo(
        req.user!,
        platilloId,
        req.body,
        req.clientMeta!,
      );
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async confirmar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await VentasService.confirmarVenta(req.user!, req.body, req.clientMeta!);
      res.status(201).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async obtenerComanda(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ventaId = Number(req.params.id);
      const data = await VentasService.obtenerComanda(ventaId, req.user!.sucursalId);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }
}
