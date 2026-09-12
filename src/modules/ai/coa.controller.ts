import { Request, Response, NextFunction } from 'express';
import { CoaService } from './coa.service.js';
import { BadRequestError } from '../../common/errors/AppError.js';
import { Role } from '@prisma/client';

export class CoaController {
  /**
   * Triggers AI CoA intelligence analysis for an uploaded batch certificate.
   * Restricted to seller owner or admin.
   */
  public static async analyzeBatchCoA(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const batchId = req.params.batchId;
      if (!batchId) {
        throw new BadRequestError('batchId parameter is required.');
      }

      const user = (req as any).user;
      const isAdmin = user.role === Role.ADMIN;
      const companyId = user.companyId;
      const actorUserId = user.userId || user.id;
      const forceRetry = req.body?.force === true || req.query?.force === 'true';

      const result = await CoaService.analyzeBatchCoA(batchId, companyId, actorUserId, isAdmin, forceRetry);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieves AI CoA extraction and cross-check summary for a batch.
   */
  public static async getBatchCoA(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const batchId = req.params.batchId;
      if (!batchId) {
        throw new BadRequestError('batchId parameter is required.');
      }

      const result = await CoaService.getBatchCoAExtraction(batchId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
