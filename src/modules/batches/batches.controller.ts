import { Request, Response, NextFunction } from 'express';
import { BatchesService } from './batches.service.js';

export class BatchesController {
  public static async createBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await BatchesService.createBatch(
        req.user!.companyId,
        req.user!.userId,
        req.body
      );
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getMyBatches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await BatchesService.getSellerBatches(req.user!.companyId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getBatchById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await BatchesService.getBatchById(
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
