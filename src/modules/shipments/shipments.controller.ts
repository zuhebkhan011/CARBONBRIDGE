import { Request, Response, NextFunction } from 'express';
import { ShipmentsService } from './shipments.service.js';

export class ShipmentsController {
  public static async updateShipmentStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await ShipmentsService.updateShipmentStatus(
        req.params.id,
        req.user!.companyId,
        req.user!.role,
        req.user!.userId,
        req.body
      );
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listShipments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await ShipmentsService.listShipments(req.user!.companyId, req.user!.role);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getShipmentById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await ShipmentsService.getShipmentById(
        req.params.id,
        req.user!.companyId,
        req.user!.role
      );
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
