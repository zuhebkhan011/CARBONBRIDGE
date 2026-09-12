import { Request, Response, NextFunction } from 'express';
import { InsightsService } from './insights.service.js';

export class InsightsController {
  public static async getMarketplaceInsights(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await InsightsService.getMarketplaceInsights();
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getSellerOpportunities(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sellerCompanyId = req.user?.companyId;
      if (!sellerCompanyId) {
        res.status(400).json({ success: false, error: 'User does not belong to a company.' });
        return;
      }
      const result = await InsightsService.getSellerOpportunities(sellerCompanyId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getBuyerRequirementInsights(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await InsightsService.getBuyerRequirementInsights(req.params.requirementId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
