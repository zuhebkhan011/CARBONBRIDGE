import { Request, Response, NextFunction } from 'express';
import { MapsService } from './maps.service.js';

export class MapsController {
  public static async getActiveTransactionMap(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await MapsService.getActiveTransactionMap(
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
