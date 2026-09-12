import { Request, Response, NextFunction } from 'express';
import { AiService } from './ai.service.js';
import { RequirementParserService } from './requirement-parser.service.js';
import { BadRequestError } from '../../common/errors/AppError.js';

export class AiController {
  /**
   * Evaluates buyer requirements against active marketplace supply,
   * returning ranked 7-factor matches and multi-supplier composite proposals.
   */
  public static async getMatches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const requirementId = req.body?.requirementId || req.params?.requirementId;
      if (!requirementId) {
        throw new BadRequestError('requirementId is required in request body or path parameter.');
      }

      const limit = req.body?.limit ? parseInt(req.body.limit, 10) : 10;
      const customWeights = req.body?.weights;

      const result = await AiService.matchRequirement(requirementId, limit, customWeights);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Converts natural language procurement prompts (English, Hindi, Hinglish)
   * into structured requirement parameters for user review and manual editing.
   */
  public static async parseRequirement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const text = req.body?.text ?? req.body?.prompt;
      if (typeof text !== 'string' || !text.trim()) {
        throw new BadRequestError("'text' or 'prompt' string is required in request body.");
      }

      const result = await RequirementParserService.parseRequirement(text);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
