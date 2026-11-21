import { NextFunction, Request, Response } from 'express';
import { extractClientMeta } from '../../shared/middlewares/authenticate';
import { AuthService } from './auth.service';

export class AuthController {
  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { identifier, password } = req.body as { identifier: string; password: string };
      const clientMeta = extractClientMeta(req);
      const data = await AuthService.login(identifier, password, clientMeta);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await AuthService.logout(req.user!, req.clientMeta!);
      res.status(200).json({ ok: true, data: { message: 'Sesión cerrada correctamente' } });
    } catch (error) {
      next(error);
    }
  }

  static async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await AuthService.getProfile(req.user!);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }
}
