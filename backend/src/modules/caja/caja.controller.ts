import { NextFunction, Request, Response } from 'express';
import { CajaService } from './caja.service';

export class CajaController {
  static async actual(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await CajaService.obtenerCajaActual(req.user!.sucursalId);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async abrir(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await CajaService.abrirCaja(req.user!, req.body, req.clientMeta!);
      res.status(201).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async registrarMovimiento(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await CajaService.registrarMovimiento(req.user!, req.body, req.clientMeta!);
      res.status(201).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async cerrar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await CajaService.cerrarCaja(req.user!, req.body, req.clientMeta!);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async historial(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { items, meta } = await CajaService.listarHistorial(
        req.user!.sucursalId,
        req.query.page,
        req.query.limit,
      );
      res.status(200).json({ ok: true, data: items, meta });
    } catch (error) {
      next(error);
    }
  }
}
