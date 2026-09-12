import { Request, Response, NextFunction } from 'express';
import { ListingsService } from './listings.service.js';

export class ListingsController {
  public static async createListing(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await ListingsService.createListing(
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

  public static async browseListings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await ListingsService.browseListings(req.query as any);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getListingById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await ListingsService.getListingById(req.params.id);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deactivateListing(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await ListingsService.deactivateListing(
        req.params.id,
        req.user!.companyId,
        req.user!.userId
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
