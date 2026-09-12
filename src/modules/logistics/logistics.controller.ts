import { Request, Response, NextFunction } from 'express';
import { LogisticsService } from './logistics.service.js';

export class LogisticsController {
  public static async analyzeRouteConsolidation(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await LogisticsService.analyzeSellerRouteConsolidation(
        req.user!.companyId
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
