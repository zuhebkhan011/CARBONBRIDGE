import { Request, Response, NextFunction } from 'express';
import { AuctionsService } from './auctions.service.js';

export class AuctionsController {
  public static async createAuction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuctionsService.createAuction(
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

  public static async listActiveAuctions(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const isSeller = req.user?.role === 'SELLER';
      const statusParam = req.query.status as any;
      const result = await AuctionsService.listActiveAuctions({
        sellerId: isSeller ? req.user?.companyId : undefined,
        status: statusParam,
      });
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getAuctionById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuctionsService.getAuctionById(req.params.id);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getAuctionInsights(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuctionsService.getAuctionInsights(req.params.id);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async placeBid(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuctionsService.placeBid(
        req.params.id,
        req.user!.userId,
        req.user!.companyId,
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

  public static async finalizeAuction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuctionsService.finalizeAuction(
        req.params.id,
        req.user!.companyId,
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
}
