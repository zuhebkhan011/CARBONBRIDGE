import { Request, Response, NextFunction } from 'express';
import { PricingService, pricingQuerySchema } from './pricing.service.js';
import { MlPricePredictionService } from './mlPricePrediction.service.js';

export class PricingController {
  public static async getAdvisoryPrice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const source = req.method === 'GET' ? req.query : req.body;
      const query = pricingQuerySchema.parse(source);
      const result = await PricingService.calculateAdvisoryPriceWithMarketLiquidity(query);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getMlPriceForListing(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { listingId } = req.params;
      const intendedUse = req.query.intendedUse as string | undefined;
      const distanceKm = req.query.distanceKm ? Number(req.query.distanceKm) : undefined;
      const companyId = req.user?.companyId;

      const result = await MlPricePredictionService.predictPriceForListing(listingId, companyId, {
        intendedUse,
        distanceKm,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getMlPriceEstimate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const purityPercentage = Number(req.query.purityPercentage || req.query.purity || 75);
      const batchQuantity = Number(req.query.batchQuantity || req.query.quantityTonnes || req.query.quantity || 100);
      const distanceKm = req.query.distanceKm ? Number(req.query.distanceKm) : 50;
      const intendedUse = (req.query.intendedUse as string) || 'OTHER';

      const result = await MlPricePredictionService.predictParameters({
        purityPercentage,
        batchQuantity,
        distanceKm,
        intendedUse,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

