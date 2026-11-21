import { NextFunction, Request, Response } from 'express';
import { AccesosService } from './accesos.service';

export class AccesosController {
  static async listarUsuarios(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await AccesosService.listarUsuarios(req.user!.sucursalId);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async crearUsuario(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await AccesosService.crearUsuario(req.user!, req.body, req.clientMeta!);
      res.status(201).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async actualizarUsuario(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = await AccesosService.actualizarUsuario(req.user!, id, req.body, req.clientMeta!);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async cambiarEstadoUsuario(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const { activo } = req.body as { activo: boolean };
      const data = await AccesosService.cambiarEstadoUsuario(req.user!, id, activo, req.clientMeta!);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async listarRoles(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await AccesosService.listarRoles();
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async crearRol(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await AccesosService.crearRol(req.user!, req.body, req.clientMeta!);
      res.status(201).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async actualizarPermisosRol(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rolId = Number(req.params.id);
      const data = await AccesosService.actualizarPermisosRol(
        req.user!,
        rolId,
        req.body,
        req.clientMeta!,
      );
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async listarPermisos(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await AccesosService.listarPermisos();
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }
}
