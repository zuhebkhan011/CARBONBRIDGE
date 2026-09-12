import { Request, Response, NextFunction } from 'express';
import { MatchingService } from './matching.service.js';

export class MatchingController {
  public static async getMatchesForRequirement(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await MatchingService.matchRequirement(req.params.requirementId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
