import { Request, Response, NextFunction } from 'express';
import { LogisticsService } from './logistics.service.js';

export class LogisticsController {
  /**
   * POST /api/v1/logistics/optimize-route
   * Optimizes delivery routes based on economic logistics cost, vehicle capacity, and deadlines
   */
  public static async optimizeRoute(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const companyId = req.user!.companyId;
      const result = await LogisticsService.optimizeSellerRoutes(companyId, req.body);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/logistics/active-shipments
   * Fetches active shipments for the authenticated seller ready for route bundling
   */
  public static async getActiveShipments(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const companyId = req.user!.companyId;
      const result = await LogisticsService.getActiveShipmentsForOptimization(companyId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/logistics/select-route
   * Persists the seller's selected route recommendation
   */
  public static async selectRoute(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const companyId = req.user!.companyId;
      const userId = req.user!.userId;
      const result = await LogisticsService.selectOptimizedRoute(companyId, userId, req.body);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/logistics/consolidation
   * Backward-compatible route consolidation endpoint
   */
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
