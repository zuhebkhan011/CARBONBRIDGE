import { Request, Response, NextFunction } from 'express';
import { RequirementsService } from './requirements.service.js';

export class RequirementsController {
  public static async createRequirement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await RequirementsService.createRequirement(
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

  public static async getMyRequirements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await RequirementsService.getBuyerRequirements(req.user!.companyId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getRequirementById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await RequirementsService.getRequirementById(
        req.params.id,
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

  public static async cancelRequirement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await RequirementsService.cancelRequirement(
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
