import { NextFunction, Request, Response } from 'express';
import { ReportesService } from './reportes.service';

export class ReportesController {
  static async resumen(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const fechaDesde = typeof req.query.fechaDesde === 'string' ? req.query.fechaDesde : undefined;
      const fechaHasta = typeof req.query.fechaHasta === 'string' ? req.query.fechaHasta : undefined;
      const data = await ReportesService.obtenerResumen(req.user!.sucursalId, fechaDesde, fechaHasta);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async ventasPeriodo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const fechaDesde = typeof req.query.fechaDesde === 'string' ? req.query.fechaDesde : undefined;
      const fechaHasta = typeof req.query.fechaHasta === 'string' ? req.query.fechaHasta : undefined;
      const data = await ReportesService.ventasPorPeriodo(req.user!.sucursalId, fechaDesde, fechaHasta);
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async productosMasVendidos(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const fechaDesde = typeof req.query.fechaDesde === 'string' ? req.query.fechaDesde : undefined;
      const fechaHasta = typeof req.query.fechaHasta === 'string' ? req.query.fechaHasta : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const data = await ReportesService.productosMasVendidos(
        req.user!.sucursalId,
        fechaDesde,
        fechaHasta,
        limit,
      );
      res.status(200).json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  }

  static async exportarPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const fechaDesde = typeof req.query.fechaDesde === 'string' ? req.query.fechaDesde : undefined;
      const fechaHasta = typeof req.query.fechaHasta === 'string' ? req.query.fechaHasta : undefined;
      const buffer = await ReportesService.exportarPdf(req.user!.sucursalId, fechaDesde, fechaHasta);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="reporte-pos-restaurante.pdf"');
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }

  static async exportarExcel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const fechaDesde = typeof req.query.fechaDesde === 'string' ? req.query.fechaDesde : undefined;
      const fechaHasta = typeof req.query.fechaHasta === 'string' ? req.query.fechaHasta : undefined;
      const buffer = await ReportesService.exportarExcel(req.user!.sucursalId, fechaDesde, fechaHasta);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', 'attachment; filename="reporte-pos-restaurante.xlsx"');
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }
}
