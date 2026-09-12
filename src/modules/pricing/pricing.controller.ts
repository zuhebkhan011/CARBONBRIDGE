import { Request, Response, NextFunction } from 'express';
import { PricingService, pricingQuerySchema } from './pricing.service.js';

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
}
